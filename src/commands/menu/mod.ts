import type { Command } from "cliffy/command/mod.ts";
import { Select } from "cliffy/prompt/mod.ts";
import { isInteractive } from "../../interactive.ts";

export function registerMenuCommand(program: Command): void {
  program
    .command("menu")
    .description("Open an interactive command menu.")
    .action(async () => {
      if (!isInteractive()) {
        throw new Error("ergon menu needs a terminal.");
      }

      const choice = await Select.prompt({
        message: "Choose an action",
        options: [
          { name: "Start timer", value: "start" },
          { name: "Stop timer", value: "stop" },
          { name: "Status", value: "status" },
          { name: "New issue", value: "new" },
          { name: "Log work", value: "log" },
          { name: "Show worklogs", value: "worklogs" },
          { name: "List issues", value: "ls" },
          { name: "Search issues", value: "search" },
          { name: "Open in browser", value: "open" },
          { name: "Move issue", value: "move" },
          { name: "Edit issue", value: "edit" },
          { name: "Comment on issue", value: "comment" },
          { name: "Link as blocked by", value: "blocked-by" },
          { name: "Link as duplicate", value: "duplicates" },
        ],
      });

      console.log(`Run: ergon ${choice}`);
    });
}
