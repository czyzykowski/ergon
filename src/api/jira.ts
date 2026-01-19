import type { JiraConfig, JiraIssue } from "../types.ts";

const SEARCH_FIELDS = [
  "summary",
  "status",
  "issuetype",
  "project",
  "parent",
  "assignee",
  "description",
  "timetracking",
  "customfield_10008",
];

export interface JiraIssueFields {
  summary: string;
  status: { name: string };
  issuetype: { name: string };
  project: { key: string };
  parent?: { key: string; fields: { summary: string } };
  assignee?: { displayName?: string };
  description?: unknown;
  timetracking?: {
    timeSpentSeconds?: number;
    originalEstimateSeconds?: number;
  };
  customfield_10008?: Array<{ key: string; fields?: { summary?: string } }>;
}

export interface JiraIssueResponse {
  id: string;
  key: string;
  fields: JiraIssueFields;
}

export interface JiraSearchResponse {
  issues: JiraIssueResponse[];
}

export class JiraClient {
  readonly baseUrl: string;
  readonly email: string;
  readonly apiToken: string;

  constructor(config: JiraConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.email = config.email;
    this.apiToken = config.apiToken;
  }

  async createIssue(input: {
    projectKey: string;
    summary: string;
    issueType: string;
    description?: string;
    parentKey?: string;
  }): Promise<JiraIssue> {
    const fields: Record<string, unknown> = {
      project: { key: input.projectKey },
      summary: input.summary,
      issuetype: { name: input.issueType },
    };

    if (input.description) {
      fields.description = input.description;
    }

    if (input.parentKey) {
      fields.parent = { key: input.parentKey };
    }

    const response = await this.request<JiraIssueResponse>(
      "/rest/api/3/issue",
      {
        method: "POST",
        body: JSON.stringify({ fields }),
      },
    );

    return mapIssue(response);
  }

  async getIssue(key: string): Promise<JiraIssue> {
    const issue = await this.request<JiraIssueResponse>(
      `/rest/api/3/issue/${encodeURIComponent(key)}`,
      {
        method: "GET",
      },
    );

    return mapIssue(issue);
  }

  async search(jql: string): Promise<JiraIssue[]> {
    const response = await this.request<JiraSearchResponse>(
      "/rest/api/3/search",
      {
        method: "POST",
        body: JSON.stringify({
          jql,
          fields: SEARCH_FIELDS,
        }),
      },
    );

    return response.issues.map(mapIssue);
  }

  async listEpics(projectKey: string): Promise<JiraIssue[]> {
    const jql =
      `project = ${projectKey} AND issuetype = Epic ORDER BY updated DESC`;

    return await this.search(jql);
  }

  private async request<T>(
    path: string,
    init: RequestInit,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers = new Headers(init.headers);
    const auth = btoa(`${this.email}:${this.apiToken}`);

    headers.set("Authorization", `Basic ${auth}`);
    headers.set("Accept", "application/json");

    if (init.body) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(url, {
      ...init,
      headers,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Jira API request failed (${response.status}): ${body}`,
      );
    }

    return (await response.json()) as T;
  }
}

function mapIssue(issue: JiraIssueResponse): JiraIssue {
  const epic = issue.fields.customfield_10008?.[0];

  return {
    id: issue.id,
    key: issue.key,
    summary: issue.fields.summary,
    status: issue.fields.status?.name ?? "",
    issueType: issue.fields.issuetype?.name ?? "",
    projectKey: issue.fields.project?.key ?? "",
    parentKey: issue.fields.parent?.key,
    parentSummary: issue.fields.parent?.fields.summary,
    assignee: issue.fields.assignee?.displayName ?? null,
    epicKey: epic?.key,
    epicSummary: epic?.fields?.summary,
    timeSpentSeconds: issue.fields.timetracking?.timeSpentSeconds ?? null,
    originalEstimateSeconds:
      issue.fields.timetracking?.originalEstimateSeconds ?? null,
  };
}
