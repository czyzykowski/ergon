import { renderAdf, toAdf } from "../adf.ts";
import { type JiraIssueLink, renderLinks } from "../links.ts";
import type { JiraComment, JiraConfig, JiraIssue } from "../types.ts";

const SEARCH_FIELDS = [
  "summary",
  "status",
  "issuetype",
  "project",
  "parent",
  "assignee",
  "description",
  "labels",
  "created",
  "updated",
  "timetracking",
  "customfield_10008",
];

export interface JiraIssueFields {
  summary: string;
  status: { name: string; statusCategory?: { key?: string } };
  issuetype: { name: string };
  project: { key: string };
  parent?: { key: string; fields: { summary: string } };
  assignee?: { displayName?: string };
  description?: unknown;
  labels?: string[];
  created?: string;
  updated?: string;
  timetracking?: {
    timeSpentSeconds?: number;
    originalEstimateSeconds?: number;
  };
  customfield_10008?: Array<{ key: string; fields?: { summary?: string } }>;
  issuelinks?: JiraIssueLink[];
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

/** One element of Jira's comment payload, as the v3 API returns it. */
export interface JiraCommentResponse {
  id: string;
  author?: { displayName?: string };
  body?: unknown;
  created?: string;
  updated?: string;
  visibility?: { type?: string; value?: string };
}

export interface JiraCommentsResponse {
  comments?: JiraCommentResponse[];
  startAt?: number;
  maxResults?: number;
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

  /**
   * Every Comment on the issue, oldest first. Paginated to completion: a
   * partial history read as a whole one is the failure ADR 0004 is about.
   */
  async listComments(issueKey: string): Promise<JiraComment[]> {
    const comments: JiraComment[] = [];
    let startAt = 0;

    while (true) {
      const params = new URLSearchParams({
        startAt: startAt.toString(),
        maxResults: "100",
        orderBy: "created",
      });
      const response = await this.request<JiraCommentsResponse>(
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment?${params}`,
        { method: "GET" },
      );

      const page = response.comments ?? [];
      comments.push(...page.map(mapComment));

      if (page.length === 0) break;

      startAt += page.length;
      if (response.total !== undefined && startAt >= response.total) break;
    }

    return comments;
  }

  /** Append a Comment. Jira returns the Comment it created, id and all. */
  async addComment(issueKey: string, body: unknown): Promise<JiraComment> {
    const response = await this.request<JiraCommentResponse>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`,
      {
        method: "POST",
        body: JSON.stringify({ body }),
      },
    );

    return mapComment(response);
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

  /**
   * The issue's raw Links, which carry the link ids removal needs. Fetching
   * these also settles whether the issue exists before anything is written.
   */
  async getIssueLinks(issueKey: string): Promise<JiraIssueLink[]> {
    const fields = await this.getIssueFields(issueKey, ["issuelinks"]);

    return (fields.issuelinks as JiraIssueLink[] | undefined) ?? [];
  }

  async getIssueSummary(issueKey: string): Promise<string> {
    const fields = await this.getIssueFields(issueKey, ["summary"]);

    return (fields.summary as string | undefined) ?? "";
  }

  /**
   * Create a Link. Jira treats a duplicate as a silent no-op — it answers 201
   * with an empty body and creates nothing — so callers that want to report
   * accurately have to check for the Link first.
   */
  async createIssueLink(body: Record<string, unknown>): Promise<void> {
    await this.request<unknown>("/rest/api/3/issueLink", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async deleteIssueLink(linkId: string): Promise<void> {
    await this.request<unknown>(
      `/rest/api/3/issueLink/${encodeURIComponent(linkId)}`,
      { method: "DELETE" },
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
      throw new Error(requestFailure(response.status, body));
    }

    const text = await response.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }
}

function mapIssue(issue: JiraIssueResponse): JiraIssue {
  const fields = issue.fields ?? {} as JiraIssueFields;
  const epic = fields.customfield_10008?.[0];
  const description = renderAdf(fields.description);

  return {
    id: issue.id,
    key: issue.key,
    summary: fields.summary ?? "",
    // An empty document and an absent field are both "no body". Jira itself
    // makes no distinction — clearing a description writes null.
    description: description.text.length > 0 ? description.text : null,
    descriptionDegraded: description.degraded,
    status: fields.status?.name ?? "",
    statusCategory: fields.status?.statusCategory?.key ?? "",
    issueType: fields.issuetype?.name ?? "",
    projectKey: fields.project?.key ?? "",
    parentKey: fields.parent?.key,
    parentSummary: fields.parent?.fields.summary,
    assignee: fields.assignee?.displayName ?? null,
    labels: fields.labels ?? [],
    epicKey: epic?.key,
    epicSummary: epic?.fields?.summary,
    created: fields.created ?? "",
    updated: fields.updated ?? "",
    timeSpentSeconds: fields.timetracking?.timeSpentSeconds ?? null,
    originalEstimateSeconds: fields.timetracking?.originalEstimateSeconds ??
      null,
    links: renderLinks(fields.issuelinks),
  };
}

/**
 * A Comment as ergon hands it out. Exported where `mapIssue` is not, because
 * this is the `ergon comments --json` contract and contracts get tests.
 */
export function mapComment(comment: JiraCommentResponse): JiraComment {
  const body = renderAdf(comment.body);
  const mapped: JiraComment = {
    id: comment.id,
    author: comment.author?.displayName ?? "",
    body: body.text,
    bodyDegraded: body.degraded,
    created: comment.created ?? "",
    updated: comment.updated ?? "",
  };

  // Absent rather than null when unrestricted, which is the normal case.
  if (comment.visibility?.type && comment.visibility.value) {
    mapped.visibility = {
      type: comment.visibility.type,
      value: comment.visibility.value,
    };
  }

  return mapped;
}

/**
 * Jira reports failures in an `errorMessages` array. Surfacing that alone keeps
 * HTTP plumbing out of what the operator reads; anything else falls back to the
 * raw body, which is ugly but never lies.
 */
function requestFailure(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { errorMessages?: string[] };
    const messages = parsed.errorMessages ?? [];

    if (messages.length > 0) return messages.join(" ");
  } catch {
    // Not JSON at all, so there is nothing to unwrap.
  }

  return `Jira API request failed (${status}): ${body}`;
}
