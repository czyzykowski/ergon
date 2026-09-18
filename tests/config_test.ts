import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/testing/asserts.ts";
import {
  ConfigError,
  loadConfig,
  requireDeclaredProject,
  resolveConfigPath,
} from "../src/config.ts";

Deno.test({
  name: "resolveConfigPath uses baseDir",
  permissions: { read: true },
  fn() {
    const result = resolveConfigPath("/tmp/ergon-test");
    assertEquals(result, "/tmp/ergon-test/.config/ergon/config.yaml");
  },
});

Deno.test({
  name: "loadConfig throws when missing",
  permissions: { read: true },
  async fn() {
    await assertRejects(
      () => loadConfig("/tmp/ergon-missing"),
      ConfigError,
      "Config file not found",
    );
  },
});

Deno.test({
  name: "loadConfig parses valid yaml",
  permissions: { read: true, write: true },
  async fn() {
    const tempDir = await Deno.makeTempDir({ dir: Deno.cwd() });
    const configPath = resolveConfigPath(tempDir);

    try {
      await Deno.mkdir(
        new URL(".", new URL(`file://${configPath}`)).pathname,
        { recursive: true },
      );
      await Deno.writeTextFile(
        configPath,
        [
          "jira:",
          "  baseUrl: https://example.atlassian.net",
          "  email: test@example.com",
          "  apiToken: token",
          "clockwork:",
          "  baseUrl: https://clock.example",
          "  apiToken: token",
        ].join("\n"),
      );

      const config = await loadConfig(tempDir);

      assertEquals(config.jira.baseUrl, "https://example.atlassian.net");
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  },
});

Deno.test({
  name: "loadConfig rejects missing jira settings",
  permissions: { read: true, write: true },
  async fn() {
    const tempDir = await Deno.makeTempDir({ dir: Deno.cwd() });
    const configPath = resolveConfigPath(tempDir);

    try {
      await Deno.mkdir(
        new URL(".", new URL(`file://${configPath}`)).pathname,
        { recursive: true },
      );
      await Deno.writeTextFile(
        configPath,
        [
          "jira:",
          "  baseUrl: https://example.atlassian.net",
          "clockwork:",
          "  baseUrl: https://clock.example",
          "  apiToken: token",
        ].join("\n"),
      );

      await assertRejects(
        () => loadConfig(tempDir),
        ConfigError,
        "jira.baseUrl, jira.email, jira.apiToken",
      );
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  },
});

Deno.test({
  name: "loadConfig rejects missing clockwork settings",
  permissions: { read: true, write: true },
  async fn() {
    const tempDir = await Deno.makeTempDir({ dir: Deno.cwd() });
    const configPath = resolveConfigPath(tempDir);

    try {
      await Deno.mkdir(
        new URL(".", new URL(`file://${configPath}`)).pathname,
        { recursive: true },
      );
      await Deno.writeTextFile(
        configPath,
        [
          "jira:",
          "  baseUrl: https://example.atlassian.net",
          "  email: test@example.com",
          "  apiToken: token",
        ].join("\n"),
      );

      await assertRejects(
        () => loadConfig(tempDir),
        ConfigError,
        "clockwork settings",
      );
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  },
});

Deno.test({
  name: "loadConfig rejects invalid yaml",
  permissions: { read: true, write: true },
  async fn() {
    const tempDir = await Deno.makeTempDir({ dir: Deno.cwd() });
    const configPath = resolveConfigPath(tempDir);

    try {
      await Deno.mkdir(
        new URL(".", new URL(`file://${configPath}`)).pathname,
        { recursive: true },
      );
      await Deno.writeTextFile(configPath, "[invalid");

      await assertRejects(
        () => loadConfig(tempDir),
        ConfigError,
        "Failed to parse YAML config",
      );
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  },
});

Deno.test({
  name: "loadConfig rejects non-map yaml",
  permissions: { read: true, write: true },
  async fn() {
    const tempDir = await Deno.makeTempDir({ dir: Deno.cwd() });
    const configPath = resolveConfigPath(tempDir);

    try {
      await Deno.mkdir(
        new URL(".", new URL(`file://${configPath}`)).pathname,
        { recursive: true },
      );
      await Deno.writeTextFile(configPath, "plain-string");

      await assertRejects(
        () => loadConfig(tempDir),
        ConfigError,
        "must contain a YAML map",
      );
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  },
});

Deno.test({
  name: "loadConfig expands env vars",
  permissions: { read: true, write: true, env: true },
  async fn() {
    const tempDir = await Deno.makeTempDir({ dir: Deno.cwd() });
    const configPath = resolveConfigPath(tempDir);
    Deno.env.set("ERGON_TEST_TOKEN", "secret");

    try {
      await Deno.mkdir(
        new URL(".", new URL(`file://${configPath}`)).pathname,
        { recursive: true },
      );
      await Deno.writeTextFile(
        configPath,
        [
          "jira:",
          "  baseUrl: https://example.atlassian.net",
          "  email: test@example.com",
          "  apiToken: ${ERGON_TEST_TOKEN}",
          "clockwork:",
          "  baseUrl: https://clock.example",
          "  apiToken: token",
        ].join("\n"),
      );

      const config = await loadConfig(tempDir);

      assertEquals(config.jira.apiToken, "secret");
    } finally {
      Deno.env.delete("ERGON_TEST_TOKEN");
      await Deno.remove(tempDir, { recursive: true });
    }
  },
});

Deno.test({
  name: "loadConfig rejects a declared project with no sprint field id",
  permissions: { read: true, write: true },
  async fn() {
    const tempDir = await Deno.makeTempDir({ dir: Deno.cwd() });
    const configPath = resolveConfigPath(tempDir);

    try {
      await Deno.mkdir(
        new URL(".", new URL(`file://${configPath}`)).pathname,
        { recursive: true },
      );
      await Deno.writeTextFile(
        configPath,
        [
          "jira:",
          "  baseUrl: https://example.atlassian.net",
          "  email: test@example.com",
          "  apiToken: token",
          "clockwork:",
          "  baseUrl: https://clock.example",
          "  apiToken: token",
          "defaults:",
          "  projects:",
          "    PCK:",
          "      fields:",
          "        clientSowFieldId: customfield_10200",
        ].join("\n"),
      );

      await assertRejects(
        () => loadConfig(tempDir),
        ConfigError,
        "defaults.projects.PCK.fields.sprintFieldId",
      );
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  },
});

Deno.test({
  name: "loadConfig accepts a declared project with no Client SOW field id",
  permissions: { read: true, write: true },
  async fn() {
    const tempDir = await Deno.makeTempDir({ dir: Deno.cwd() });
    const configPath = resolveConfigPath(tempDir);

    try {
      await Deno.mkdir(
        new URL(".", new URL(`file://${configPath}`)).pathname,
        { recursive: true },
      );
      await Deno.writeTextFile(
        configPath,
        [
          "jira:",
          "  baseUrl: https://example.atlassian.net",
          "  email: test@example.com",
          "  apiToken: token",
          "clockwork:",
          "  baseUrl: https://clock.example",
          "  apiToken: token",
          "defaults:",
          "  projects:",
          "    PCK:",
          "      fields:",
          "        sprintFieldId: customfield_10010",
        ].join("\n"),
      );

      const config = await loadConfig(tempDir);

      assertEquals(
        config.defaults?.projects?.PCK.fields?.sprintFieldId,
        "customfield_10010",
      );
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  },
});

Deno.test("naming an undeclared project is an error that names the key", () => {
  assertThrows(
    () => requireDeclaredProject({ PCK: {} }, "PGR"),
    ConfigError,
    "defaults.projects.PGR.fields.sprintFieldId",
  );
});

Deno.test("naming a declared project returns its configuration", () => {
  const fields = { sprintFieldId: "customfield_10010" };

  assertEquals(
    requireDeclaredProject({ PCK: { fields } }, "PCK").fields,
    fields,
  );
});
