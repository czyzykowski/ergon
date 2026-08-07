import type { ClockworkConfig, ClockworkWorklog } from "../types.ts";

export interface ClockworkTimerResponse {
  issueKey?: string;
  startedAt?: string;
}

interface ClockworkClientOptions {
  timerBaseUrl?: string;
}

export class ClockworkClient {
  readonly worklogBaseUrl: string;
  readonly worklogAuthHeader: string;
  readonly timerBaseUrl: string;

  constructor(config: ClockworkConfig, options: ClockworkClientOptions = {}) {
    this.worklogBaseUrl = config.baseUrl.replace(/\/$/, "");
    this.worklogAuthHeader = `Token ${config.apiToken}`;
    this.timerBaseUrl = (options.timerBaseUrl ?? this.worklogBaseUrl).replace(
      /\/$/,
      "",
    );
  }

  async startTimer(issueKey: string): Promise<ClockworkTimerResponse> {
    const form = new URLSearchParams({ issue_key: issueKey });

    return await this.request<ClockworkTimerResponse>(
      "/v1/start_timer",
      {
        method: "POST",
        body: form,
      },
      {
        baseUrl: this.timerBaseUrl,
        authHeader: this.worklogAuthHeader,
      },
    );
  }

  async stopTimer(issueKey: string): Promise<ClockworkTimerResponse> {
    const form = new URLSearchParams({ issue_key: issueKey });

    return await this.request<ClockworkTimerResponse>(
      "/v1/stop_timer",
      {
        method: "POST",
        body: form,
      },
      {
        baseUrl: this.timerBaseUrl,
        authHeader: this.worklogAuthHeader,
      },
    );
  }

  async getWorklogs(input: {
    issueKey?: string;
    from?: string;
    to?: string;
    userQuery?: string | string[];
  } = {}): Promise<ClockworkWorklog[]> {
    const params = new URLSearchParams();

    if (input.issueKey) {
      params.set("issueKey", input.issueKey);
    }

    if (input.from) {
      params.set("starting_at", input.from);
    }

    if (input.to) {
      params.set("ending_at", input.to);
    }

    if (input.userQuery) {
      const entries = Array.isArray(input.userQuery)
        ? input.userQuery
        : [input.userQuery];
      for (const entry of entries) {
        params.append("user_query[]", entry);
      }
    }

    const query = params.toString();
    const path = query ? `/v1/worklogs?${query}` : "/v1/worklogs";

    const response = await this.request<ClockworkWorklog[]>(
      path,
      { method: "GET" },
      {
        baseUrl: this.worklogBaseUrl,
        authHeader: this.worklogAuthHeader,
      },
    );

    return response ?? [];
  }

  async logWork(input: {
    issueKey: string;
    timeSpentSeconds: number;
    description?: string;
    startedAt?: string;
  }): Promise<ClockworkWorklog> {
    const response = await this.request<ClockworkWorklog>(
      "/v1/worklogs",
      {
        method: "POST",
        body: JSON.stringify({
          issueKey: input.issueKey,
          timeSpentSeconds: input.timeSpentSeconds,
          description: input.description,
          startedAt: input.startedAt,
        }),
      },
      {
        baseUrl: this.worklogBaseUrl,
        authHeader: this.worklogAuthHeader,
      },
    );

    return response;
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    overrides?: {
      baseUrl?: string;
      authHeader?: string;
    },
  ): Promise<T> {
    const baseUrl = overrides?.baseUrl ?? this.worklogBaseUrl;
    const authHeader = overrides?.authHeader ?? this.worklogAuthHeader;
    const url = `${baseUrl}${path}`;
    const headers = new Headers(init.headers);

    headers.set("Authorization", authHeader);
    headers.set("Accept", "application/json");

    if (init.body) {
      if (init.body instanceof URLSearchParams) {
        headers.set("Content-Type", "application/x-www-form-urlencoded");
      } else {
        headers.set("Content-Type", "application/json");
      }
    }

    const response = await fetch(url, {
      ...init,
      headers,
    });
    const body = await response.text();

    if (Deno.env.get("ERGON_DEBUG_CLOCKWORK") === "1") {
      console.log(
        JSON.stringify(
          {
            url,
            status: response.status,
            ok: response.ok,
            body,
          },
          null,
          2,
        ),
      );
    }

    if (!response.ok) {
      throw new Error(
        `Clockwork API request failed (${response.status}): ${body}`,
      );
    }

    return JSON.parse(body) as T;
  }
}

export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours}h`);
  }

  if (minutes > 0 || (hours > 0 && seconds > 0)) {
    parts.push(`${minutes}m`);
  }

  if (hours === 0 && minutes === 0) {
    parts.push(`${seconds}s`);
  }

  return parts.join(" ");
}
