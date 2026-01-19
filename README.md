# ergon

CLI for Jira + Clockwork workflows.

## Setup

- Install Deno.
- `deno task ergon --help`

## Usage

- `ergon --help`

## Configuration

Config file location: `~/.config/ergon/config.yaml`.

## Checks

Run a quick API check:

- `nix develop -c deno run --allow-net --allow-read --allow-env scripts/check-api.ts <ISSUE_KEY>`
