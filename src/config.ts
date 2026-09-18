import { parse } from "yaml/mod.ts";
import { join } from "path/mod.ts";
import type { ErgonConfig, ProjectDefaults } from "./types.ts";

const CONFIG_RELATIVE_PATH = ".config/ergon/config.yaml";

export class ConfigError extends Error {
  override name = "ConfigError";
}

export async function loadConfig(
  baseDir?: string,
): Promise<ErgonConfig> {
  const configPath = resolveConfigPath(baseDir);
  let raw: string;

  try {
    raw = await Deno.readTextFile(configPath);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new ConfigError(
        `Config file not found at ${configPath}. Create it before running ergon.`,
      );
    }

    throw error;
  }

  const expanded = expandEnvVars(raw);
  let parsed: unknown;

  try {
    parsed = parse(expanded);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigError(
      `Failed to parse YAML config at ${configPath}: ${message}`,
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new ConfigError(
      `Config file at ${configPath} must contain a YAML map.`,
    );
  }

  const config = parsed as Partial<ErgonConfig>;
  validateRequired(config, configPath);

  return config as ErgonConfig;
}

export function resolveConfigPath(baseDir?: string): string {
  if (baseDir) {
    return join(baseDir, CONFIG_RELATIVE_PATH);
  }

  return join(
    Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE") ?? "",
    CONFIG_RELATIVE_PATH,
  );
}

function validateRequired(
  config: Partial<ErgonConfig>,
  configPath: string,
): void {
  if (!config.jira) {
    throw new ConfigError(
      `Config at ${configPath} must include jira settings.`,
    );
  }

  if (!config.jira.baseUrl || !config.jira.email || !config.jira.apiToken) {
    throw new ConfigError(
      `Config at ${configPath} must include jira.baseUrl, jira.email, jira.apiToken.`,
    );
  }

  if (!config.clockwork) {
    throw new ConfigError(
      `Config at ${configPath} must include clockwork settings.`,
    );
  }

  if (!config.clockwork.baseUrl || !config.clockwork.apiToken) {
    throw new ConfigError(
      `Config at ${configPath} must include clockwork.baseUrl, clockwork.apiToken.`,
    );
  }

  // A declared project is declared completely. Jira omits an unknown custom
  // field rather than erroring, so a half-configured project reports empty
  // sprints instead of failing — see docs/adr/0007.
  for (
    const [key, project] of Object.entries(config.defaults?.projects ?? {})
  ) {
    if (!project?.fields?.sprintFieldId) {
      throw new ConfigError(
        `Project ${key} is declared in ${configPath} without ` +
          `defaults.projects.${key}.fields.sprintFieldId. Add it, or remove the project.`,
      );
    }
  }
}

/**
 * The project's configuration, or an error naming what to add. Naming a project
 * on the command line asserts that ergon is configured for it.
 */
export function requireDeclaredProject(
  projects: Record<string, ProjectDefaults> | undefined,
  projectKey: string,
): ProjectDefaults {
  const project = projects?.[projectKey];

  if (!project) {
    throw new ConfigError(
      `No configuration for project ${projectKey}. Add ` +
        `defaults.projects.${projectKey}.fields.sprintFieldId to ~/.config/ergon/config.yaml.`,
    );
  }

  return project;
}

const ENV_VAR_PATTERN = /\$\{([A-Z0-9_]+)\}/g;

function expandEnvVars(raw: string): string {
  return raw.replace(ENV_VAR_PATTERN, (_, key: string) => {
    return Deno.env.get(key) ?? "";
  });
}
