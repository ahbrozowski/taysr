import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  MessageFlags,
  ModalBuilder,
  PartialGroupDMChannel,
  SectionBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from 'discord.js';

import { Goal, Task } from '../models';

interface TaskSelectorState {
  page: number;
  goal?: any;
  assigneeId?: string;
}

export async function showGroupAndUserSelectors(state:TaskSelectorState) {
    const components = [];

    const goals = await Goal.find().lean();

    // Only add goal selector if there are goals available
    if (goals.length > 0) {
      const goalSelect = new StringSelectMenuBuilder()
        .setCustomId('sort_by_goal')
        .setPlaceholder('Select overarching goal');

      for (const goal of goals) {
        const option = new StringSelectMenuOptionBuilder()
          .setLabel(goal.name)
          .setValue(goal._id.toString());
        goalSelect.addOptions(option);
      }
      components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(goalSelect));
    }

    const userSelect = new UserSelectMenuBuilder()
			.setCustomId('users')
			.setPlaceholder('Select multiple users.')
			.setMaxValues(1);
    components.push(new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(userSelect));

    return components;

}

export async function showPaginatedTaskList(state:TaskSelectorState) {
  const components = [];

  const filter: any = { status: 'open' };

  if (state.goal) {
    filter.goalId = state.goal;
  }
  if (state.assigneeId) {
    filter.assigneeId = state.assigneeId;
  }

  const tasks = await Task.find(filter)
    .limit(5)
    .skip(5*(state.page))
    .sort({ dueAt: 1 }) // optional: sort by soonest due date
    .exec();
  
  const taskList = new ActionRowBuilder();

  for (const task of tasks) {
    components.push(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**${task.title.toString()}**`)
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(`cmd:${task._id.toString()}`)
            .setLabel('complete')
            .setStyle(ButtonStyle.Primary)
        )
    );
  }

    const previousButton =  new ButtonBuilder()
        .setCustomId('previous_page')
        .setLabel('Previous Page')
        .setStyle(ButtonStyle.Primary);

    if(state.page === 0) {
      previousButton.setDisabled(true);
    }

    const nextButton =  new ButtonBuilder()
        .setCustomId('next_page')
        .setLabel('Next Page')
        .setStyle(ButtonStyle.Primary);

    if(tasks.length < 5) {
      nextButton.setDisabled(true);
    }
        
    components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(previousButton, nextButton));

    return components;
}

async function render(state:TaskSelectorState) {
  return [
      ...await showGroupAndUserSelectors(state),
      ...await showPaginatedTaskList(state)
  ];
}

export async function taskStateReducer(interaction: any, state:TaskSelectorState) {
   const newState = state;
  if (interaction.customId === 'sort_by_goal') {
    newState.goal = interaction.values[0]; 
    newState.page = 0;
  }  if (interaction.customId === 'users') {
    newState.assigneeId = interaction.values[0];
    newState.page = 0;
  }  if (interaction.customId === 'previous_page') {
    newState.page = Math.max(0, state.page - 1);
  } if (interaction.customId === 'next_page') {
    newState.page = state.page + 1;
  } else if (interaction.customId.startsWith('cmd:')) {
    const taskId = interaction.customId.split(':')[1];
    const task = await Task.findById(taskId);
    if (task) {
      task.status = 'complete';
      await task.save();
    }
  }

  return newState;
}

export async function createTaskListPage(chatParams: ChatInputCommandInteraction | ButtonInteraction) {
  
  let state: TaskSelectorState = {
    page: 0,
  };

  if(chatParams.channel == null || !('send' in chatParams.channel)) {
    return;
  }

  const message = await chatParams.reply({
    components: await render(state),
    fetchReply: true,
    flags: [MessageFlags.IsComponentsV2],
    ephemeral: true
  });


  const collector = message.createMessageComponentCollector({ time: 60000 });

  collector.on('collect', async (interaction : any) => {
    state = await taskStateReducer(interaction, state);
    await interaction.update({
      components: await render(state),
    });
  });

}