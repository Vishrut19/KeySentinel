/**
 * Configuration handling for KeySentinel
 */

import * as core from "@actions/core";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { Severity, EntropyConfig } from "./patterns";

export interface Config {
  failOn: Severity | "off";
  postNoFindings: boolean;
  ignore: string[];
  allowlist: RegExp[];
  maxFiles: number;
  patterns: Record<string, boolean>;
  entropy: EntropyConfig;
}

/** Overrides for config (e.g. from Action inputs or CLI flags). */
export interface ConfigOverrides {
  failOn?: string;
  postNoFindings?: boolean;
  ignore?: string;
  allowlist?: string;
  maxFiles?: number;
}

export interface ConfigLogger {
  warn?(message: string): void;
  debug?(message: string): void;
  info?(message: string): void;
}

interface YamlConfig {
  fail_on?: string;
  post_no_findings?: boolean;
  ignore?: string[];
  allowlist?: string[];
  max_files?: number;
  patterns?: Record<string, boolean>;
  entropy?: {
    enabled?: boolean;
    min_length?: number;
    threshold?: number;
    ignore_base64_like?: boolean;
  };
}

const DEFAULT_IGNORE = [
  "node_modules/**",
  "dist/**",
  "build/**",
  "vendor/**",
  "*.min.js",
  "*.min.css",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "*.lock",
  "*.map",
  ".git/**",
  "coverage/**",
  "__pycache__/**",
  "*.pyc",
  ".env.example",
  ".env.sample",
  "*.md",
  "LICENSE*",
  "CHANGELOG*",
];

const DEFAULT_ENTROPY_CONFIG: EntropyConfig = {
  enabled: true,
  minLength: 20,
  threshold: 4.2,
  ignoreBase64Like: true,
};

function parseSeverity(value: string, logger?: ConfigLogger): Severity | "off" {
  const normalized = value.toLowerCase().trim();
  if (["high", "medium", "low", "off"].includes(normalized)) {
    return normalized as Severity | "off";
  }
  logger?.warn?.(`Invalid fail_on value "${value}", defaulting to "high"`);
  return "high";
}

function parseIgnoreGlobs(input: string): string[] {
  if (!input || input.trim() === "") return [];
  return input
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseAllowlistPatterns(
  input: string,
  logger?: ConfigLogger,
): RegExp[] {
  if (!input || input.trim() === "") return [];

  const patterns: RegExp[] = [];
  const parts = input
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const part of parts) {
    try {
      patterns.push(new RegExp(part, "gi"));
    } catch (e) {
      logger?.warn?.(`Invalid allowlist regex "${part}": ${e}`);
    }
  }

  return patterns;
}

/**
 * Load YAML config from path. Uses logger for messages (Action passes core, CLI uses console).
 */
export function loadYamlConfig(
  configPath: string,
  logger?: ConfigLogger,
): YamlConfig | null {
  const log = logger ?? console;
  try {
    if (!fs.existsSync(configPath)) {
      log.debug?.(`Config file not found at ${configPath}`);
      return null;
    }

    const content = fs.readFileSync(configPath, "utf8");
    const parsed = yaml.load(content) as YamlConfig;

    if (!parsed || typeof parsed !== "object") {
      log.warn?.(`Invalid config file at ${configPath}`);
      return null;
    }

    log.info?.(`Loaded config from ${configPath}`);
    return parsed;
  } catch (e) {
    log.warn?.(`Failed to load config file ${configPath}: ${e}`);
    return null;
  }
}

/**
 * Build Config from YAML and overrides. Pure merge: defaults, then YAML, then overrides.
 */
export function buildConfig(
  yamlConfig: YamlConfig | null,
  overrides: ConfigOverrides,
  logger?: ConfigLogger,
): Config {
  const log = logger ?? console;
  const inputFailOn = overrides.failOn ?? "high";
  const inputPostNoFindings = overrides.postNoFindings ?? false;
  const inputIgnore = overrides.ignore ?? "";
  const inputAllowlist = overrides.allowlist ?? "";
  const inputMaxFiles = overrides.maxFiles ?? 100;

  let config: Config = {
    failOn: parseSeverity(inputFailOn, log),
    postNoFindings: inputPostNoFindings,
    ignore: [...DEFAULT_IGNORE, ...parseIgnoreGlobs(inputIgnore)],
    allowlist: parseAllowlistPatterns(inputAllowlist, log),
    maxFiles:
      typeof inputMaxFiles === "number"
        ? inputMaxFiles
        : parseInt(String(inputMaxFiles) || "100", 10),
    patterns: {},
    entropy: { ...DEFAULT_ENTROPY_CONFIG },
  };

  if (yamlConfig) {
    if (yamlConfig.fail_on !== undefined && overrides.failOn === undefined) {
      config.failOn = parseSeverity(yamlConfig.fail_on, log);
    }
    if (
      yamlConfig.post_no_findings !== undefined &&
      overrides.postNoFindings === undefined
    ) {
      config.postNoFindings = yamlConfig.post_no_findings;
    }
    if (yamlConfig.ignore && Array.isArray(yamlConfig.ignore)) {
      config.ignore = [...DEFAULT_IGNORE, ...yamlConfig.ignore];
    }
    if (yamlConfig.allowlist && Array.isArray(yamlConfig.allowlist)) {
      const yamlPatterns: RegExp[] = [];
      for (const pattern of yamlConfig.allowlist) {
        try {
          yamlPatterns.push(new RegExp(pattern, "gi"));
        } catch (e) {
          log.warn?.(`Invalid allowlist regex in config "${pattern}": ${e}`);
        }
      }
      config.allowlist = [...config.allowlist, ...yamlPatterns];
    }
    if (
      yamlConfig.max_files !== undefined &&
      overrides.maxFiles === undefined
    ) {
      config.maxFiles = yamlConfig.max_files;
    }
    if (yamlConfig.patterns) {
      config.patterns = yamlConfig.patterns;
    }
    if (yamlConfig.entropy) {
      config.entropy = {
        enabled: yamlConfig.entropy.enabled ?? DEFAULT_ENTROPY_CONFIG.enabled,
        minLength:
          yamlConfig.entropy.min_length ?? DEFAULT_ENTROPY_CONFIG.minLength,
        threshold:
          yamlConfig.entropy.threshold ?? DEFAULT_ENTROPY_CONFIG.threshold,
        ignoreBase64Like:
          yamlConfig.entropy.ignore_base64_like ??
          DEFAULT_ENTROPY_CONFIG.ignoreBase64Like,
      };
    }
  }

  if (inputIgnore) {
    config.ignore = [...DEFAULT_IGNORE, ...parseIgnoreGlobs(inputIgnore)];
  }
  if (inputAllowlist) {
    config.allowlist = parseAllowlistPatterns(inputAllowlist, log);
  }

  return config;
}

/** Load config for GitHub Action (uses @actions/core inputs). */
export function loadConfig(): Config {
  const configPath = core.getInput("config_path") || ".keysentinel.yml";
  const yamlConfig = loadYamlConfig(configPath, {
    warn: (m) => core.warning(m),
    debug: (m) => core.debug(m),
    info: (m) => core.info(m),
  });
  return buildConfig(
    yamlConfig,
    {
      failOn: core.getInput("fail_on") || "high",
      postNoFindings: core.getInput("post_no_findings") === "true",
      ignore: core.getInput("ignore"),
      allowlist: core.getInput("allowlist"),
      maxFiles: parseInt(core.getInput("max_files") || "100", 10),
    },
    {
      warn: (m) => core.warning(m),
      debug: (m) => core.debug(m),
      info: (m) => core.info(m),
    },
  );
}

/**
 * Load config for CLI (no @actions/core). Reads .keysentinel.yml from cwd (or configPath).
 */
export function loadConfigForCli(options?: {
  cwd?: string;
  configPath?: string;
}): Config {
  const cwd = options?.cwd ?? process.cwd();
  const configPath = options?.configPath ?? path.join(cwd, ".keysentinel.yml");
  const yamlConfig = loadYamlConfig(configPath, console);
  return buildConfig(yamlConfig, {}, console);
}

/**
 * Check if a file path matches any ignore glob
 */
export function shouldIgnoreFile(
  filePath: string,
  ignorePatterns: string[],
): boolean {
  for (const pattern of ignorePatterns) {
    if (matchGlob(filePath, pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Simple glob matching (supports * and **)
 */
function matchGlob(path: string, pattern: string): boolean {
  // Normalize path separators
  const normalizedPath = path.replace(/\\/g, "/");
  const normalizedPattern = pattern.replace(/\\/g, "/");

  // Convert glob to regex
  let regexStr = normalizedPattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape special regex chars
    .replace(/\*\*/g, "{{GLOBSTAR}}") // Placeholder for **
    .replace(/\*/g, "[^/]*") // * matches anything except /
    .replace(/{{GLOBSTAR}}/g, ".*") // ** matches anything including /
    .replace(/\?/g, "."); // ? matches single char

  // Check if pattern should match from start
  if (!normalizedPattern.startsWith("*")) {
    regexStr = "^" + regexStr;
  }

  // Check if pattern should match to end
  if (!normalizedPattern.endsWith("*")) {
    regexStr = regexStr + "$";
  }

  try {
    const regex = new RegExp(regexStr, "i");
    return regex.test(normalizedPath);
  } catch {
    return false;
  }
}

/**
 * Check if a value matches any allowlist pattern
 */
export function isAllowlisted(value: string, allowlist: RegExp[]): boolean {
  for (const pattern of allowlist) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    if (pattern.test(value)) {
      return true;
    }
  }
  return false;
}
