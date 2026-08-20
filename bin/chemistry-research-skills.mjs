#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SUPPORTED_HOSTS = new Set(["trae", "codex", "claude-code"]);

function printHelp() {
  process.stdout.write(`Chemistry Research Skills

Usage:
  chemistry-research-skills install [options]
  chemistry-research-skills --help

Install options:
  --host <trae|codex|claude-code>  Target Agent host. Default: trae
  --target-root <path>             Existing project directory. Default: cwd
  --source-root <path>             Chemistry Research Skills root. Default: package root
  --python <path>                  Python interpreter for uv run
  --uv <path>                      uv executable. Default: uv
  --offline                        Pass --offline to uv commands
  --no-runtime-sync                Skip runtime uv sync after bundle installation
  --dry-run                        Print planned commands without running them
  --json                           Print machine-readable dry-run/success output
  -h, --help                       Show this help

Examples:
  npx github:3494036618-eng/chemistry-research-skills install --host trae --target-root .
  npx chemistry-research-skills install --host trae --target-root .
`);
}

function fail(message) {
  process.stderr.write(`chemistry-research-skills: ${message}\n`);
  process.exit(1);
}

function parseInstallArgs(argv) {
  const options = {
    host: "trae",
    targetRoot: process.cwd(),
    sourceRoot: PACKAGE_ROOT,
    python: null,
    uv: "uv",
    offline: false,
    runtimeSync: true,
    dryRun: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "-h" || item === "--help") {
      return { help: true, options };
    }
    if (item === "--offline") {
      options.offline = true;
      continue;
    }
    if (item === "--no-runtime-sync") {
      options.runtimeSync = false;
      continue;
    }
    if (item === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (item === "--json") {
      options.json = true;
      continue;
    }
    if (
      item === "--host" ||
      item === "--target-root" ||
      item === "--source-root" ||
      item === "--python" ||
      item === "--uv"
    ) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        fail(`${item} requires a value`);
      }
      index += 1;
      if (item === "--host") options.host = value;
      if (item === "--target-root") options.targetRoot = value;
      if (item === "--source-root") options.sourceRoot = value;
      if (item === "--python") options.python = value;
      if (item === "--uv") options.uv = value;
      continue;
    }
    fail(`unknown option: ${item}`);
  }

  return { help: false, options };
}

function normalizedExistingDirectory(path, label) {
  const absolute = resolve(path);
  if (!existsSync(absolute)) {
    fail(`${label} does not exist: ${absolute}`);
  }
  return realpathSync(absolute);
}

function plannedCommands(options) {
  if (!SUPPORTED_HOSTS.has(options.host)) {
    fail(`unsupported host: ${options.host}`);
  }

  const sourceRoot = normalizedExistingDirectory(options.sourceRoot, "source root");
  const targetRoot = normalizedExistingDirectory(options.targetRoot, "target root");
  const uvPrefix = [options.uv];
  if (options.offline) uvPrefix.push("--offline");
  const installerCommand = [
    ...uvPrefix,
    "run",
    "--project",
    sourceRoot,
    "--frozen",
  ];
  if (options.python) {
    installerCommand.push("--python", options.python);
  }
  installerCommand.push(
    "python",
    "skills/chemistry-research-router/scripts/install_bundle.py",
    "--host",
    options.host,
    "--scope",
    "project",
    "--source-root",
    sourceRoot,
    "--target-root",
    targetRoot,
  );

  const commands = [
    installerCommand,
  ];

  if (options.runtimeSync) {
    commands.push([
      ...uvPrefix,
      "sync",
      "--frozen",
      "--all-groups",
      "--project",
      resolve(targetRoot, ".chemistry-agent-bundle/runtime"),
    ]);
  }

  return { sourceRoot, targetRoot, commands };
}

function quoteCommand(command) {
  return command
    .map((part) => (/^[A-Za-z0-9_./:=+-]+$/.test(part) ? part : JSON.stringify(part)))
    .join(" ");
}

function runCommand(command, cwd) {
  process.stdout.write(`$ ${quoteCommand(command)}\n`);
  const result = spawnSync(command[0], command.slice(1), {
    cwd,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) {
    fail(result.error.message);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function install(argv) {
  const { help, options } = parseInstallArgs(argv);
  if (help) {
    printHelp();
    return;
  }
  const plan = plannedCommands(options);
  const output = {
    status: options.dryRun ? "dry_run" : "installed",
    host: options.host,
    sourceRoot: plan.sourceRoot,
    targetRoot: plan.targetRoot,
    commands: plan.commands,
  };

  if (options.dryRun) {
    if (options.json) {
      process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    } else {
      for (const command of plan.commands) {
        process.stdout.write(`${quoteCommand(command)}\n`);
      }
    }
    return;
  }

  for (const command of plan.commands) {
    runCommand(command, plan.sourceRoot);
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } else {
    process.stdout.write("Chemistry Research Skills bundle installed.\n");
  }
}

const [command, ...rest] = process.argv.slice(2);
if (!command || command === "-h" || command === "--help") {
  printHelp();
} else if (command === "install") {
  install(rest);
} else {
  fail(`unknown command: ${command}`);
}
