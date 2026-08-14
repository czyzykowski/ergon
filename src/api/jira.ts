import { toAdf } from "../adf.ts";
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
  fields?: JiraIssueFields;
}

export interface JiraSearchResponse {
  issues: JiraIssueResponse[];
}

export interface JiraIssueFieldsResponse {
  fields: Record<string, unknown>;
}

export interface JiraFieldOption {
  id: string;
  value: string;
}

export interface JiraFieldContextResponse {
  values?: Array<{ id: string }>;
}

export interface JiraFieldOptionResponse {
  values?: JiraFieldOption[];
}

export interface JiraBoard {
  id: number;
  name: string;
}

export interface JiraBoardResponse {
  values?: JiraBoard[];
}

export interface JiraSprint {
  id: number;
  name: string;
  state?: string;
}

export interface JiraSprintResponse {
  values?: JiraSprint[];
}

export interface JiraLabelResponse {
  values?: string[];
  startAt?: number;
  maxResults?: number;
  isLast?: boolean;
  total?: number;
}

export interface JiraWorklogResponse {
  id: string;
  started: string;
  timeSpentSeconds: number;
}

export interface JiraTransition {
  id: string;
  name: string;
  to: { name: string };
}

export interface JiraTransitionsResponse {
  transitions: JiraTransition[];
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
    labels?: string[];
    customFields?: Record<string, unknown>;
  }): Promise<JiraIssue> {
    const fields: Record<string, unknown> = {
      project: { key: input.projectKey },
      summary: input.summary,
      issuetype: { name: input.issueType },
    };

    if (input.description) {
      fields.description = toAdf(input.description);
    }

    if (input.parentKey) {
      fields.parent = { key: input.parentKey };
    }

    if (input.labels && input.labels.length > 0) {
      fields.labels = input.labels;
    }

    if (input.customFields) {
      for (const [key, value] of Object.entries(input.customFields)) {
        fields[key] = value;
      }
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

  async search(jql: string, maxResults = 50): Promise<JiraIssue[]> {
    const response = await this.request<JiraSearchResponse>(
      "/rest/api/3/search/jql",
      {
        method: "POST",
        body: JSON.stringify({
          jql,
          maxResults,
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

  async getIssueFields(
    issueKey: string,
    fields: string[],
  ): Promise<Record<string, unknown>> {
    const params = new URLSearchParams({ fields: fields.join(",") });
    const response = await this.request<JiraIssueFieldsResponse>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}?${params}`,
      {
        method: "GET",
      },
    );

    return response.fields ?? {};
  }

  async getFieldOptions(fieldId: string): Promise<JiraFieldOption[]> {
    const contexts = await this.request<JiraFieldContextResponse>(
      `/rest/api/3/field/${encodeURIComponent(fieldId)}/context`,
      {
        method: "GET",
      },
    );

    const contextId = contexts.values?.[0]?.id;
    if (!contextId) {
      return [];
    }

    const options = await this.request<JiraFieldOptionResponse>(
      `/rest/api/3/field/${
        encodeURIComponent(fieldId)
      }/context/${contextId}/option`,
      {
        method: "GET",
      },
    );

    return options.values ?? [];
  }

  async listBoards(projectKey: string): Promise<JiraBoard[]> {
    const params = new URLSearchParams({ projectKeyOrId: projectKey });
    const response = await this.request<JiraBoardResponse>(
      `/rest/agile/1.0/board?${params}`,
      {
        method: "GET",
      },
    );

    return response.values ?? [];
  }

  async listActiveSprints(boardId: number): Promise<JiraSprint[]> {
    const params = new URLSearchParams({ state: "active" });
    const response = await this.request<JiraSprintResponse>(
      `/rest/agile/1.0/board/${boardId}/sprint?${params}`,
      {
        method: "GET",
      },
    );

    return response.values ?? [];
  }

  async listLabels(): Promise<string[]> {
    const labels: string[] = [];
    let startAt = 0;

    while (true) {
      const params = new URLSearchParams({
        startAt: startAt.toString(),
        maxResults: "1000",
      });
      const response = await this.request<JiraLabelResponse>(
        `/rest/api/3/label?${params}`,
        {
          method: "GET",
        },
      );

      if (response.values) {
        labels.push(...response.values);
      }

      if (response.isLast) {
        break;
      }

      const pageSize = response.maxResults ?? response.values?.length ?? 0;
      if (pageSize === 0) {
        break;
      }

      startAt += pageSize;
      if (response.total && startAt >= response.total) {
        break;
      }
    }

    return labels;
  }

  async addWorklog(input: {
    issueKey: string;
    timeSpentSeconds: number;
    startedAt?: string;
    comment?: string;
  }): Promise<JiraWorklogResponse> {
    const body: Record<string, unknown> = {
      timeSpentSeconds: input.timeSpentSeconds,
    };

    if (input.startedAt) {
      body.started = input.startedAt;
    }

    if (input.comment) {
      body.comment = input.comment;
    }

    const response = await this.request<JiraWorklogResponse>(
      `/rest/api/3/issue/${encodeURIComponent(input.issueKey)}/worklog`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );

    return response;
  }

  async getTransitions(issueKey: string): Promise<JiraTransition[]> {
    const response = await this.request<JiraTransitionsResponse>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
      { method: "GET" },
    );
    return response.transitions;
  }

  /** Update an issue in place. `fields` is sent as-is, so callers send only
   * what they mean to change — Jira leaves anything absent alone. */
  async updateIssue(
    issueKey: string,
    fields: Record<string, unknown>,
  ): Promise<void> {
    await this.request<unknown>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}`,
      {
        method: "PUT",
        body: JSON.stringify({ fields }),
      },
    );
  }

  async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
    await this.request<unknown>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
      {
        method: "POST",
        body: JSON.stringify({ transition: { id: transitionId } }),
      },
    );
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

    const text = await response.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }
}

function mapIssue(issue: JiraIssueResponse): JiraIssue {
  const fields = issue.fields ?? {} as JiraIssueFields;
  const epic = fields.customfield_10008?.[0];

  return {
    id: issue.id,
    key: issue.key,
    summary: fields.summary ?? "",
    status: fields.status?.name ?? "",
    issueType: fields.issuetype?.name ?? "",
    projectKey: fields.project?.key ?? "",
    parentKey: fields.parent?.key,
    parentSummary: fields.parent?.fields.summary,
    assignee: fields.assignee?.displayName ?? null,
    epicKey: epic?.key,
    epicSummary: epic?.fields?.summary,
    timeSpentSeconds: fields.timetracking?.timeSpentSeconds ?? null,
    originalEstimateSeconds: fields.timetracking?.originalEstimateSeconds ??
      null,
  };
}
