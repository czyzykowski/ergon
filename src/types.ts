export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
}

export interface ClockworkConfig {
  baseUrl: string;
  apiToken: string;
}

export interface ConfigDefaults {
  project?: string;
  epic?: string;
  issueType?: string;
}

export interface ConfigPaths {
  jiraYaml?: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  summary: string;
  status: string;
  issueType: string;
  projectKey: string;
  parentKey?: string;
  parentSummary?: string;
  assignee: string | null;
  epicKey?: string;
  epicSummary?: string;
  timeSpentSeconds: number | null;
  originalEstimateSeconds: number | null;
}

export interface ClockworkWorklog {
  id?: string | number;
  issueKey?: string;
  description?: string;
  startedAt?: string;
  timeSpentSeconds?: number;
}

export interface TimerState {
  issueKey: string;
  startedAt: string;
  summary?: string;
}

export interface ErgonState {
  lastProject?: string;
  lastEpic?: string;
  lastIssueKey?: string;
  timer?: TimerState;
}

export interface ErgonConfig {
  jira: JiraConfig;
  clockwork: ClockworkConfig;
  projects?: Record<string, string>;
  defaults?: ConfigDefaults;
  paths?: ConfigPaths;
}
