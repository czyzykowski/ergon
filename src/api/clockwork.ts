import type { ClockworkConfig, ClockworkWorklog } from "../types.ts";

export interface ClockworkTimerResponse {
  issueKey?: string;
  startedAt?: string;
}

export class ClockworkClient {
  readonly baseUrl: string;
  readonly apiToken: string;

  constructor(config: ClockworkConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiToken = config.apiToken;
  }

  async startTimer(issueKey: string): Promise<ClockworkTimerResponse> {
    return await this.request<ClockworkTimerResponse>(
      "/v1/timer",
      {
        method: "POST",
        body: JSON.stringify({ issueKey }),
      },
    );
  }

  async stopTimer(): Promise<ClockworkTimerResponse> {
    return await this.request<ClockworkTimerResponse>(
      "/v1/timer",
      {
        method: "DELETE",
      },
    );
  }

  async getWorklogs(input: {
    issueKey?: string;
    from?: string;
    to?: string;
  } = {}): Promise<ClockworkWorklog[]> {
    const params = new URLSearchParams();

    if (input.issueKey) {
      params.set("issueKey", input.issueKey);
    }

    if (input.from) {
      params.set("from", input.from);
    }

    if (input.to) {
      params.set("to", input.to);
    }

    const query = params.toString();
    const path = query ? `/v1/worklogs?${query}` : "/v1/worklogs";

    const response = await this.request<ClockworkWorklog[]>(
      path,
      { method: "GET" },
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
    );

    return response;
  }

  private async request<T>(
    path: string,
    init: RequestInit,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers = new Headers(init.headers);

    headers.set("Authorization", `Token ${this.apiToken}`);
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
        `Clockwork API request failed (${response.status}): ${body}`,
      );
    }

    return (await response.json()) as T;
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
