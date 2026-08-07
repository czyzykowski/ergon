import { dirname, join } from "path/mod.ts";
import type { ErgonState } from "./types.ts";

const STATE_RELATIVE_PATH = ".config/ergon/state.json";

export async function loadState(baseDir?: string): Promise<ErgonState> {
  const statePath = resolveStatePath(baseDir);

  try {
    const raw = await Deno.readTextFile(statePath);
    const parsed = JSON.parse(raw);

    return parsed as ErgonState;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return {};
    }

    throw error;
  }
}

export async function saveState(
  state: ErgonState,
  baseDir?: string,
): Promise<void> {
  const statePath = resolveStatePath(baseDir);
  const directory = dirname(statePath);

  await Deno.mkdir(directory, { recursive: true });

  const tempPath = `${statePath}.${Date.now()}.tmp`;
  await Deno.writeTextFile(tempPath, JSON.stringify(state, null, 2));
  await Deno.rename(tempPath, statePath);
}

export function resolveStatePath(baseDir?: string): string {
  if (baseDir) {
    return join(baseDir, STATE_RELATIVE_PATH);
  }

  return join(
    Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? "",
    STATE_RELATIVE_PATH,
  );
}
