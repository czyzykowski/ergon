import type { Command } from "cliffy/command/mod.ts";
import { loadConfig } from "../config.ts";
import { loadState } from "../state.ts";

export function registerOpenCommand(program: Command): void {
  program
    .command("open [issueKey:string]")
    .description("Open a Jira issue in the default browser.")
    .action(async (_options, issueKey?: string) => {
      const config = await loadConfig();
      const state = await loadState();
      const key = issueKey ?? state.lastIssueKey;

      if (!key) {
        throw new Error("Provide an issue key or run from a previous issue.");
      }

      const url = `${config.jira.baseUrl}/browse/${key}`;
      const os = Deno.build.os;

      let cmd: string;
      if (os === "darwin") {
        cmd = "open";
      } else if (os === "linux") {
        cmd = "xdg-open";
      } else {
        throw new Error(`Unsupported platform: ${os}`);
      }

      new Deno.Command(cmd, { args: [url] }).spawn();
      console.log(`Opening ${key} in browser...`);
    });
}
