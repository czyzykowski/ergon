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

export interface CacheState {
  epics?: Record<string, CachedIssue[]>;
  labels?: string[];
  clientSowOptions?: Record<string, CachedOption[]>;
  boards?: Record<string, CachedBoard[]>;
}

/**
 * A Sprint as an issue carries it. An issue holds a history rather than a slot,
 * in the board's own order, so ergon reports the list and leaves the reading of
 * it to the caller.
 */
export interface IssueSprint {
  name: string;
  state: string;
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
  /** The Priority name, read and reported; ergon orders by Rank instead. */
  priority: string | null;
  dueDate: string | null;
  /**
   * Absent when ergon does not know the project's sprint field id, which after
   * ADR 0007 means a project config has never heard of. See ADR 0006.
   */
  sprints?: IssueSprint[];
  /** Absent when the project declares no Client SOW field id. */
  clientSow?: string | null;
  /** Absent from a search: `issuelinks` is fetched for a single issue only. */
  links?: IssueLink[];
}

/** Who a Comment is restricted to, when it is restricted at all. */
export interface CommentVisibility {
  type: string;
  value: string;
}

export interface JiraComment {
  /** Jira's own id, and the only handle for editing the Comment. */
  id: string;
  /** The author's display name; ergon does not resolve account identity. */
  author: string;
  /** The rendered body. */
  body: string;
  /** Node and mark types whose structure the body lost being read out. */
  bodyDegraded: string[];
  created: string;
  updated: string;
  /** Present only when the Comment carries a restriction. */
  visibility?: CommentVisibility;
}

/** A record of time spent on an issue, as ergon hands it out. */
export interface Worklog {
  issueKey: string;
  /** Jira's own timestamp, offset and all, passed through unparsed. */
  started: string;
  timeSpentSeconds: number;
  /** The worklog comment rendered to text, or null when there is none. */
  description: string | null;
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
