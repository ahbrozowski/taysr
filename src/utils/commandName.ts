// Global command name that can be accessed from anywhere
let activeCommandName = 'taysr';

export function setCommandName(commandName: string): void {
  activeCommandName = commandName;
}

export function getCommandName(): string {
  return activeCommandName;
}
