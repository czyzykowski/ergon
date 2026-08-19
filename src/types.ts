export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
}

export interface ClockworkConfig {
  baseUrl: string;
  apiToken: string;
  timerBaseUrl?: string;
  userQuery?: string | string[];
}

export interface ConfigDefaults {
  project?: string;
  epic?: string;
  issueType?: string;
  projects?: Record<string, ProjectDefaults>;
}

export interface ProjectDefaults {
  fields?: ProjectFieldDefaults;
}

export interface ProjectFieldDefaults {
  clientSowFieldId?: string;
  clientSowValue?: string;
  labels?: string[];
  sprintBoardId?: number;
  sprintFieldId?: string;
}

export interface ConfigPaths {
  jiraYaml?: string;
}

export interface CachedIssue {
  key: string;
  summary: string;
}

export interface CachedOption {
  id: string;
  value: string;
}

export interface CachedBoard {
  id: number;
  name: string;
}

export interface CachedSprint {
  id: number;
  name: string;
  state?: string;
}

export interface CacheState {
  epics?: Record<string, CachedIssue[]>;
  labels?: string[];
  clientSowOptions?: Record<string, CachedOption[]>;
  boards?: Record<string, CachedBoard[]>;
  sprints?: Record<string, CachedSprint[]>;
}

export interface IssueLink {
  /** Jira's id for the Link itself, the only handle for removing it by hand. */
  id: string;
  /** How the Link reads from the issue it was read from. */
  phrase: string;
  key: string;
  summary: string;
  status: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  summary: string;
  /** The rendered body, or null when the issue has none. */
  description: string | null;
  /** Node types whose structure the Description lost being read out. */
  descriptionDegraded: string[];
  status: string;
  /** The status category key — `new`, `indeterminate`, or `done`. */
  statusCategory: string;
  issueType: string;
  projectKey: string;
  parentKey?: string;
  parentSummary?: string;
  assignee: string | null;
  labels: string[];
  epicKey?: string;
  epicSummary?: string;
  created: string;
  updated: string;
  timeSpentSeconds: number | null;
  originalEstimateSeconds: number | null;
  /** Empty from a search: `issuelinks` is fetched for a single issue only. */
  links: IssueLink[];
}

export interface ClockworkWorklog {
  id?: string | number;
  issueKey?: string;
  description?: string;
  startedAt?: string;
  started?: string;
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
  lastClientSow?: string;
  cache?: CacheState;
  timer?: TimerState;
}

export interface ErgonConfig {
  jira: JiraConfig;
  clockwork: ClockworkConfig;
  projects?: Record<string, string>;
  defaults?: ConfigDefaults;
  paths?: ConfigPaths;
}
