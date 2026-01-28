/**
 * Returns a cute "under construction" message with ASCII art
 */
export function getConstructionMessage(commandName?: string): string {
  const messages = [
    "Still building this one!",
    "Coming soon!",
    "Under construction!",
    "Not quite ready yet!",
    "Working on it!",
    "Almost there!",
    "Hold tight, we're building this!",
  ];

  const randomMessage = messages[Math.floor(Math.random() * messages.length)];

  const art = `
\`\`\`
⚠️  ${randomMessage}  ⚠️

                         ___
                /======/
       ____    //      \\___       ,/
        | \\\\  //           :,   ./
|_______|__|_//            ;:; /
_L_____________\\o           ;;;/
___(CCCCCCCCCCCCCC)____________-/____
\`\`\``;

  if (commandName) {
    return `${art}\n\`${commandName}\` is not implemented yet, but it's on the roadmap!`;
  }

  return art;
}
