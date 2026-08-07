import type { Command } from "cliffy/command/mod.ts";
import { ClockworkClient } from "../api/clockwork.ts";
import { loadConfig } from "../config.ts";
import { loadState, saveState } from "../state.ts";

export function registerStopCommand(program: Command): void {
  program
    .command("stop")
    .description("Stop the active timer.")
    .action(async () => {
      const config = await loadConfig();
      const state = await loadState();

      if (!state.timer?.issueKey) {
        throw new Error("No active timer found in local state.");
      }

      const clockwork = new ClockworkClient(config.clockwork, {
        timerBaseUrl: config.clockwork.timerBaseUrl,
      });
      await clockwork.stopTimer(state.timer.issueKey);

      await saveState({
        ...state,
        timer: undefined,
      });

      console.log(`Stopped timer for ${state.timer.issueKey}`);
    });
}
