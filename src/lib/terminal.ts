export type TerminalAction = "undo" | "reset" | "view" | "short";

export function terminalKeyAction(key: string): TerminalAction | undefined {
  const actions: Record<string, TerminalAction> = { F1: "undo", F2: "reset", F3: "view", F4: "short" };
  return actions[key];
}