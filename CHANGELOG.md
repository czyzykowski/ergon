# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

- Added initial Deno CLI skeleton with Cliffy.
- Added YAML config loader with env var expansion.
- Added Jira API client with issue mapping and search helpers.
- Added Clockwork client for timers and worklogs.
- Added API check script for Jira and Clockwork.
- Added local state loader for last selections and timer metadata.
- Added start/stop/status commands wired to Jira and Clockwork.
- Added log/ls/search/new/menu commands.
- Added required field handling for new command (Client SOW, labels).
- Fixed epic prompt handling when selecting None.
- Fixed Jira issue mapping when API omits fields in create response.
- Added sprint selection when creating issues.
- Defaulted Client SOW prompt to last selected value.
- Defaulted sprint field to customfield_10010 for new issues.
- Fixed sprint payload to send numeric id.
- Sorted Client SOW options alphabetically.
- Prompted for Client SOW with default selection.
- Added Jira label checkbox selection with search.
- Cached Jira metadata for new issue prompts with a --no-cache option.
- Added search to epic selection prompt.
- Added state cache persistence tests.
- Fixed home directory resolution for state/config paths.
- Documented test permissions.
- Added coverage tasks.
- Added config/state tests.
- Added config validation coverage tests.
- Added additional state helper tests.
- Added config branch coverage tests.
- Fixed config parse error handling.
- Fixed temp directory usage in tests when env enabled.
- Updated test/coverage tasks for env permissions.
