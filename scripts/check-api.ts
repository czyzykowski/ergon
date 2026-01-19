import { loadConfig } from "../src/config.ts";
import { JiraClient } from "../src/api/jira.ts";
import { ClockworkClient } from "../src/api/clockwork.ts";

const issueKey = Deno.args[0];

if (!issueKey) {
  console.error(
    "Usage: deno run --allow-net --allow-read --allow-env scripts/check-api.ts <ISSUE_KEY>",
  );
  Deno.exit(1);
}

const config = await loadConfig();
const jira = new JiraClient(config.jira);
const clockwork = new ClockworkClient(config.clockwork);

const issue = await jira.getIssue(issueKey);
console.log("Jira OK:", issue.key, issue.summary);

const worklogs = await clockwork.getWorklogs({ issueKey });
console.log("Clockwork OK:", worklogs.length, "worklogs");
