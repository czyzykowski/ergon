import type { JiraClient } from "../api/jira.ts";
import type {
  CachedBoard,
  CachedIssue,
  CachedOption,
  CacheState,
} from "../types.ts";

/**
 * The Jira calls `ergon new` makes, and no others. `JiraClient` satisfies it
 * as it is. The epic and board lists are narrowed to what the Cache keeps, so
 * a cached answer and a fresh one have the same type; a board's type, which
 * the Cache does not keep, is read from `JiraClient` itself.
 */
export interface NewIssueJira {
  listEpics(projectKey: string): Promise<CachedIssue[]>;
  listLabels: JiraClient["listLabels"];
  getFieldOptions: JiraClient["getFieldOptions"];
  listBoards(projectKey: string): Promise<CachedBoard[]>;
  listActiveSprints: JiraClient["listActiveSprints"];
  search: JiraClient["search"];
  getIssueFields: JiraClient["getIssueFields"];
  getMyAccountId: JiraClient["getMyAccountId"];
  createIssue: JiraClient["createIssue"];
}

/**
 * A `NewIssueJira` that answers the Cache's lookups from a copy of the Cache,
 * asks Jira on a miss and keeps the answer. Every other call passes through:
 * an Active Sprint is a fact with a shelf life, so it is never cached
 * (glossary: Cache).
 */
export class CachedJira implements NewIssueJira {
  #cache: CacheState;

  constructor(private readonly jira: NewIssueJira, cache?: CacheState) {
    this.#cache = { ...(cache ?? {}) };
  }

  /** The Cache as read and extended so far; the caller's copy is untouched. */
  get cache(): CacheState {
    return this.#cache;
  }

  listEpics(projectKey: string): Promise<CachedIssue[]> {
    return this.#readThrough(
      this.#cache.epics?.[projectKey],
      async () =>
        (await this.jira.listEpics(projectKey)).map((epic) => ({
          key: epic.key,
          summary: epic.summary,
        })),
      (epics) => {
        this.#cache.epics = { ...this.#cache.epics, [projectKey]: epics };
      },
    );
  }

  listLabels(): Promise<string[]> {
    return this.#readThrough(
      this.#cache.labels,
      () => this.jira.listLabels(),
      (labels) => {
        this.#cache.labels = labels;
      },
    );
  }

  getFieldOptions(fieldId: string): Promise<CachedOption[]> {
    return this.#readThrough(
      this.#cache.clientSowOptions?.[fieldId],
      async () =>
        (await this.jira.getFieldOptions(fieldId)).map((option) => ({
          id: option.id,
          value: option.value,
        })),
      (options) => {
        this.#cache.clientSowOptions = {
          ...this.#cache.clientSowOptions,
          [fieldId]: options,
        };
      },
    );
  }

  listBoards(projectKey: string): Promise<CachedBoard[]> {
    return this.#readThrough(
      this.#cache.boards?.[projectKey],
      async () =>
        (await this.jira.listBoards(projectKey)).map((board) => ({
          id: board.id,
          name: board.name,
        })),
      (boards) => {
        this.#cache.boards = { ...this.#cache.boards, [projectKey]: boards };
      },
    );
  }

  listActiveSprints(
    ...args: Parameters<NewIssueJira["listActiveSprints"]>
  ): ReturnType<NewIssueJira["listActiveSprints"]> {
    return this.jira.listActiveSprints(...args);
  }

  search(
    ...args: Parameters<NewIssueJira["search"]>
  ): ReturnType<NewIssueJira["search"]> {
    return this.jira.search(...args);
  }

  getIssueFields(
    ...args: Parameters<NewIssueJira["getIssueFields"]>
  ): ReturnType<NewIssueJira["getIssueFields"]> {
    return this.jira.getIssueFields(...args);
  }

  getMyAccountId(): Promise<string> {
    return this.jira.getMyAccountId();
  }

  createIssue(
    ...args: Parameters<NewIssueJira["createIssue"]>
  ): ReturnType<NewIssueJira["createIssue"]> {
    return this.jira.createIssue(...args);
  }

  /** The cached answer, or Jira's, kept for next time. */
  async #readThrough<T>(
    cached: T | undefined,
    fetch: () => Promise<T>,
    keep: (fresh: T) => void,
  ): Promise<T> {
    if (cached) return cached;

    const fresh = await fetch();
    keep(fresh);
    return fresh;
  }
}
