import { Client, Message, MessageFlags, MessageType, TextChannel, TextDisplayBuilder } from 'discord.js';
import { ServerConfig, Task, Goal } from '../models';

/** Conservative cap leaving headroom under Discord's 4000-char Components V2 limit. */
const CHUNK_CHAR_LIMIT = 3800;

function formatTaskLine(task: any): string {
  const assignee = task.assigneeId ? `<@${task.assigneeId}>` : 'Unassigned';
  const timestamp = Math.floor(new Date(task.dueAt).getTime() / 1000);
  return `**${task.title}** · ${assignee} · <t:${timestamp}:R>`;
}

async function groupTasksByGoal(tasks: any[], guildId: string): Promise<{ name: string; tasks: any[] }[]> {
  const goalIds = [...new Set(tasks.filter(t => t.goalId).map(t => t.goalId))];

  const goals = goalIds.length > 0
    ? await Goal.find({ goalId: { $in: goalIds }, guildId }).lean()
    : [];

  const goalMap = new Map(goals.map(g => [g.goalId, g.name]));

  const grouped = new Map<string | null, any[]>();
  for (const task of tasks) {
    const key = task.goalId || null;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(task);
  }

  const result: { name: string; tasks: any[] }[] = [];

  for (const [goalId, goalTasks] of grouped) {
    if (goalId) {
      const goalName = goalMap.get(goalId) || goalId;
      result.push({ name: goalName, tasks: goalTasks });
    }
  }

  result.sort((a, b) => a.name.localeCompare(b.name));

  const uncategorized = grouped.get(null);
  if (uncategorized) {
    result.push({ name: 'Uncategorized', tasks: uncategorized });
  }

  return result;
}

interface ChunkBuilderInput {
  /** Lines that go on the FIRST page only (e.g., title). */
  leadHeader: string[];
  /** Lines that go on every page after the page label. */
  perPageSubtitle: string[];
  /** Body lines, packed across pages in order. */
  bodyLines: string[];
  /** Lines appended to the LAST page only (e.g., usage hint, last-updated). */
  tailFooter: string[];
  /** Returns "Page X of N" header for a given index. */
  pageLabel: (index: number, total: number) => string;
}

/**
 * Packs body lines into one or more chunks under CHUNK_CHAR_LIMIT.
 * Each chunk gets a "Page X of N" label; first/last chunks get extra header/footer.
 * Returns an array of strings, one per pinned message.
 */
function buildChunks(input: ChunkBuilderInput): string[] {
  // First do a dry run to count pages, then a real run with proper labels.
  const dryFooterLen = (input.tailFooter.join('\n') + '\n').length;
  const dryHeaderLen = (input.leadHeader.join('\n') + '\n' + input.perPageSubtitle.join('\n') + '\n').length;
  const subsequentHeaderLen = (input.perPageSubtitle.join('\n') + '\n').length;

  // Greedy pack body lines. Use a placeholder page label for length estimation
  // (worst case "Page 99 of 99" is 13 chars).
  const labelOverhead = 20;
  const chunks: string[][] = [[]];
  let chunkLen = dryHeaderLen + labelOverhead;

  for (const line of input.bodyLines) {
    const lineLen = line.length + 1;
    if (chunkLen + lineLen > CHUNK_CHAR_LIMIT && chunks[chunks.length - 1].length > 0) {
      chunks.push([]);
      chunkLen = subsequentHeaderLen + labelOverhead;
    }
    chunks[chunks.length - 1].push(line);
    chunkLen += lineLen;
  }

  // Tail footer goes on the last chunk; if it would push us over, spill into a new chunk.
  if (chunks.length > 0) {
    const last = chunks[chunks.length - 1];
    const lastLen = last.join('\n').length;
    const subsHeader = chunks.length === 1 ? dryHeaderLen : subsequentHeaderLen;
    if (subsHeader + labelOverhead + lastLen + dryFooterLen + 2 > CHUNK_CHAR_LIMIT) {
      chunks.push([]);
    }
  }

  const total = chunks.length;
  const rendered: string[] = [];
  for (let i = 0; i < total; i++) {
    const parts: string[] = [];
    if (i === 0) parts.push(...input.leadHeader);
    parts.push(input.pageLabel(i, total));
    parts.push(...input.perPageSubtitle);
    parts.push('');
    parts.push(...chunks[i]);
    if (i === total - 1) {
      parts.push('');
      parts.push(...input.tailFooter);
    }
    rendered.push(parts.join('\n'));
  }

  return rendered;
}

async function buildTaskListChunks(tasks: any[], guildId: string): Promise<string[]> {
  const commandName = process.env.DISCORD_COMMAND_PREFIX || 'taysr';
  const bodyLines: string[] = [];

  if (tasks.length === 0) {
    bodyLines.push(`No open tasks. Use \`/${commandName}\` to create a new task!`);
  } else {
    const groups = await groupTasksByGoal(tasks, guildId);
    for (const group of groups) {
      const heading = group.name === 'Uncategorized' ? '## Uncategorized' : `## 🎯 ${group.name}`;
      bodyLines.push(heading);
      for (const task of group.tasks) {
        bodyLines.push(formatTaskLine(task));
      }
    }
  }

  return buildChunks({
    leadHeader: ['# 📋 Taysr Tasks'],
    perPageSubtitle: ['Open tasks for the team'],
    bodyLines,
    tailFooter: [
      `**How to use:** \`/${commandName}\` to get started`,
      `_Last updated: <t:${Math.floor(Date.now() / 1000)}:R>_`,
    ],
    pageLabel: (i, total) => total === 1 ? '' : `_Page ${i + 1} of ${total}_`,
  }).map(chunk => chunk.replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n'));
}

function buildGoalTaskListChunks(tasks: any[], goalName: string): string[] {
  const commandName = process.env.DISCORD_COMMAND_PREFIX || 'taysr';
  const bodyLines: string[] = [];

  if (tasks.length === 0) {
    bodyLines.push(`No open tasks for this goal. Use \`/${commandName}\` to create a new task!`);
  } else {
    for (const task of tasks) {
      bodyLines.push(formatTaskLine(task));
    }
  }

  return buildChunks({
    leadHeader: [`# 🎯 ${goalName}`],
    perPageSubtitle: ['Open tasks for this goal'],
    bodyLines,
    tailFooter: [`_Last updated: <t:${Math.floor(Date.now() / 1000)}:R>_`],
    pageLabel: (i, total) => total === 1 ? '' : `_Page ${i + 1} of ${total}_`,
  }).map(chunk => chunk.replace(/^\n+/, '').replace(/\n{3,}/g, '\n\n'));
}

function chunkToComponents(chunk: string): any[] {
  return [new TextDisplayBuilder().setContent(chunk)];
}

/**
 * Pins a message and immediately deletes Discord's auto-generated
 * "X pinned a message" system notification.
 */
async function pinAndSuppress(message: Message): Promise<void> {
  await message.pin();

  // Discord posts the system message asynchronously; give it a moment.
  await new Promise(r => setTimeout(r, 600));

  try {
    const recent = await message.channel.messages.fetch({ limit: 5 });
    for (const m of recent.values()) {
      if (
        m.type === MessageType.ChannelPinnedMessage &&
        m.reference?.messageId === message.id
      ) {
        await m.delete().catch(() => {});
        break;
      }
    }
  } catch (error) {
    console.error('Failed to suppress pin notification:', error);
  }
}

/**
 * Reconciles the channel's pinned messages against the new chunk set.
 * - Edits in place when index already exists.
 * - Sends new messages for additional chunks.
 * - Deletes excess messages when shrinking (Discord auto-unpins on delete).
 * - When any new message was created, unpins all and re-pins in reverse so
 *   chunk 0 ends up most recently pinned (top of the pin list).
 */
async function upsertPinnedMessages(
  channel: TextChannel,
  existingIds: string[],
  chunks: string[],
): Promise<string[]> {
  const newIds: string[] = [];
  let createdNew = false;

  for (let i = 0; i < chunks.length; i++) {
    const components = chunkToComponents(chunks[i]);
    const existingId = existingIds[i];
    let message: Message | undefined;

    if (existingId) {
      try {
        const fetched = await channel.messages.fetch(existingId);
        await fetched.edit({ components });
        message = fetched;
      } catch {
        // Old message gone — fall through to create new.
      }
    }

    if (!message) {
      message = await channel.send({
        components,
        flags: [MessageFlags.IsComponentsV2, MessageFlags.SuppressNotifications],
        allowedMentions: { parse: [] },
      });
      createdNew = true;
    }

    newIds.push(message.id);
  }

  // Delete any leftover messages we no longer need.
  for (let i = chunks.length; i < existingIds.length; i++) {
    try {
      const stale = await channel.messages.fetch(existingIds[i]);
      await stale.delete();
    } catch {
      // Already gone; nothing to do.
    }
  }

  // Repin in reverse only when chunk count grew (or we had to recreate one).
  if (createdNew && newIds.length > 0) {
    for (const id of newIds) {
      try {
        const m = await channel.messages.fetch(id);
        if (m.pinned) await m.unpin();
      } catch {
        // ignore
      }
    }

    for (let i = newIds.length - 1; i >= 0; i--) {
      try {
        const m = await channel.messages.fetch(newIds[i]);
        await pinAndSuppress(m);
      } catch (error) {
        console.error('Failed to pin chunk message:', error);
      }
    }
  }

  return newIds;
}

export async function updatePinnedTaskList(client: Client, guildId: string): Promise<void> {
  try {
    const config = await ServerConfig.findOne({ guildId });
    if (!config || !config.taskListChannelId) return;

    const channel = await client.channels.fetch(config.taskListChannelId);
    if (!channel || !channel.isTextBased() || !(channel instanceof TextChannel)) {
      console.error(`Channel ${config.taskListChannelId} is not a text channel`);
      return;
    }

    const tasks = await Task.find({ guildId, status: 'open' })
      .sort({ dueAt: 1 })
      .lean();

    const chunks = await buildTaskListChunks(tasks, guildId);
    const newIds = await upsertPinnedMessages(channel, config.taskListMessageIds ?? [], chunks);

    config.taskListMessageIds = newIds;
    await config.save();
  } catch (error) {
    console.error('Error updating pinned task list:', error);
    throw error;
  }
}

export async function updateGoalPinnedList(client: Client, goalId: string): Promise<void> {
  try {
    const goal = await Goal.findOne({ goalId });
    if (!goal || !goal.channelId) return;

    const channel = await client.channels.fetch(goal.channelId);
    if (!channel || !channel.isTextBased() || !(channel instanceof TextChannel)) {
      console.error(`Goal channel ${goal.channelId} is not a text channel`);
      return;
    }

    const tasks = await Task.find({ goalId, status: 'open' })
      .sort({ dueAt: 1 })
      .lean();

    const chunks = buildGoalTaskListChunks(tasks, goal.name);
    const newIds = await upsertPinnedMessages(channel, goal.messageIds ?? [], chunks);

    goal.messageIds = newIds;
    await goal.save();
  } catch (error) {
    console.error(`Error updating goal pinned list for ${goalId}:`, error);
    throw error;
  }
}

/**
 * Wipes the existing pinned messages and rebuilds them from scratch in the
 * correct pin order.
 */
export async function refreshPinnedTaskList(client: Client, guildId: string): Promise<void> {
  try {
    const config = await ServerConfig.findOne({ guildId });
    if (!config || !config.taskListChannelId) return;

    const channel = await client.channels.fetch(config.taskListChannelId);
    if (!channel || !channel.isTextBased() || !(channel instanceof TextChannel)) {
      console.error(`Channel ${config.taskListChannelId} is not a text channel`);
      return;
    }

    for (const id of config.taskListMessageIds ?? []) {
      try {
        const old = await channel.messages.fetch(id);
        await old.delete();
      } catch {
        // already gone
      }
    }
    config.taskListMessageIds = [];

    const tasks = await Task.find({ guildId, status: 'open' })
      .sort({ dueAt: 1 })
      .lean();

    const chunks = await buildTaskListChunks(tasks, guildId);
    const newIds = await upsertPinnedMessages(channel, [], chunks);

    config.taskListMessageIds = newIds;
    await config.save();
  } catch (error) {
    console.error('Error refreshing pinned task list:', error);
    throw error;
  }
}

export async function refreshAllGoalPinnedLists(client: Client, guildId: string): Promise<void> {
  const goals = await Goal.find({ guildId, channelId: { $exists: true, $ne: null } }).lean();
  for (const goal of goals) {
    await updateGoalPinnedList(client, goal.goalId);
  }
}
