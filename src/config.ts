/**
 * Configuration handling for KeySentinel
 */

import * as core from '@actions/core';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { Severity, EntropyConfig } from './patterns';

export interface Config {
  failOn: Severity | 'off';
  postNoFindings: boolean;
  ignore: string[];
  allowlist: RegExp[];
  maxFiles: number;
  patterns: Record<string, boolean>;
  entropy: EntropyConfig;
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
  'node_modules/**',
  'dist/**',
  'build/**',
  'vendor/**',
  '*.min.js',
  '*.min.css',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '*.lock',
  '*.map',
  '.git/**',
  'coverage/**',
  '__pycache__/**',
  '*.pyc',
  '.env.example',
  '.env.sample',
  '*.md',
  'LICENSE*',
  'CHANGELOG*',
];

const DEFAULT_ENTROPY_CONFIG: EntropyConfig = {
  enabled: true,
  minLength: 20,
  threshold: 4.2,
  ignoreBase64Like: true,
};

function parseSeverity(value: string): Severity | 'off' {
  const normalized = value.toLowerCase().trim();
  if (['high', 'medium', 'low', 'off'].includes(normalized)) {
    return normalized as Severity | 'off';
  }
  core.warning(`Invalid fail_on value "${value}", defaulting to "high"`);
  return 'high';
}

function parseIgnoreGlobs(input: string): string[] {
  if (!input || input.trim() === '') return [];
  return input.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

function parseAllowlistPatterns(input: string): RegExp[] {
  if (!input || input.trim() === '') return [];

  const patterns: RegExp[] = [];
  const parts = input.split(',').map(s => s.trim()).filter(s => s.length > 0);

  for (const part of parts) {
    try {
      patterns.push(new RegExp(part, 'gi'));
    } catch (e) {
      core.warning(`Invalid allowlist regex "${part}": ${e}`);
    }
  }

  return patterns;
}

function loadYamlConfig(configPath: string): YamlConfig | null {
  try {
    if (!fs.existsSync(configPath)) {
      core.debug(`Config file not found at ${configPath}`);
      return null;
    }

    const content = fs.readFileSync(configPath, 'utf8');
    const parsed = yaml.load(content) as YamlConfig;

    if (!parsed || typeof parsed !== 'object') {
      core.warning(`Invalid config file at ${configPath}`);
      return null;
    }

    core.info(`Loaded config from ${configPath}`);
    return parsed;
  } catch (e) {
    core.warning(`Failed to load config file ${configPath}: ${e}`);
    return null;
  }
}

export function loadConfig(): Config {
  // Load action inputs
  const inputFailOn = core.getInput('fail_on') || 'high';
  const inputPostNoFindings = core.getInput('post_no_findings') === 'true';
  const inputIgnore = core.getInput('ignore');
  const inputAllowlist = core.getInput('allowlist');
  const inputMaxFiles = parseInt(core.getInput('max_files') || '100', 10);
  const configPath = core.getInput('config_path') || '.keysentinel.yml';

  // Start with defaults
  let config: Config = {
    failOn: parseSeverity(inputFailOn),
    postNoFindings: inputPostNoFindings,
    ignore: [...DEFAULT_IGNORE, ...parseIgnoreGlobs(inputIgnore)],
    allowlist: parseAllowlistPatterns(inputAllowlist),
    maxFiles: inputMaxFiles,
    patterns: {},
    entropy: { ...DEFAULT_ENTROPY_CONFIG },
  };

  // Load YAML config file if exists (overrides defaults, but action inputs take precedence)
  const yamlConfig = loadYamlConfig(configPath);

  if (yamlConfig) {
    // YAML config overrides defaults
    if (yamlConfig.fail_on !== undefined && !core.getInput('fail_on')) {
      config.failOn = parseSeverity(yamlConfig.fail_on);
    }

    if (yamlConfig.post_no_findings !== undefined && !core.getInput('post_no_findings')) {
      config.postNoFindings = yamlConfig.post_no_findings;
    }

    if (yamlConfig.ignore && Array.isArray(yamlConfig.ignore)) {
      config.ignore = [...DEFAULT_IGNORE, ...yamlConfig.ignore];
    }

    if (yamlConfig.allowlist && Array.isArray(yamlConfig.allowlist)) {
      const yamlPatterns: RegExp[] = [];
      for (const pattern of yamlConfig.allowlist) {
        try {
          yamlPatterns.push(new RegExp(pattern, 'gi'));
        } catch (e) {
          core.warning(`Invalid allowlist regex in config "${pattern}": ${e}`);
        }
      }
      config.allowlist = [...config.allowlist, ...yamlPatterns];
    }

    if (yamlConfig.max_files !== undefined && !core.getInput('max_files')) {
      config.maxFiles = yamlConfig.max_files;
    }

    if (yamlConfig.patterns) {
      config.patterns = yamlConfig.patterns;
    }

    if (yamlConfig.entropy) {
      config.entropy = {
        enabled: yamlConfig.entropy.enabled ?? DEFAULT_ENTROPY_CONFIG.enabled,
        minLength: yamlConfig.entropy.min_length ?? DEFAULT_ENTROPY_CONFIG.minLength,
        threshold: yamlConfig.entropy.threshold ?? DEFAULT_ENTROPY_CONFIG.threshold,
        ignoreBase64Like: yamlConfig.entropy.ignore_base64_like ?? DEFAULT_ENTROPY_CONFIG.ignoreBase64Like,
      };
    }
  }

  // Overlay action inputs over YAML (action inputs take final precedence if explicitly set)
  if (inputIgnore) {
    config.ignore = [...DEFAULT_IGNORE, ...parseIgnoreGlobs(inputIgnore)];
  }

  if (inputAllowlist) {
    config.allowlist = parseAllowlistPatterns(inputAllowlist);
  }

  return config;
}

/**
 * Check if a file path matches any ignore glob
 */
export function shouldIgnoreFile(filePath: string, ignorePatterns: string[]): boolean {
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
  const normalizedPath = path.replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/\\/g, '/');

  // Convert glob to regex
  let regexStr = normalizedPattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
    .replace(/\*\*/g, '{{GLOBSTAR}}')     // Placeholder for **
    .replace(/\*/g, '[^/]*')              // * matches anything except /
    .replace(/{{GLOBSTAR}}/g, '.*')       // ** matches anything including /
    .replace(/\?/g, '.');                  // ? matches single char

  // Check if pattern should match from start
  if (!normalizedPattern.startsWith('*')) {
    regexStr = '^' + regexStr;
  }

  // Check if pattern should match to end
  if (!normalizedPattern.endsWith('*')) {
    regexStr = regexStr + '$';
  }

  try {
    const regex = new RegExp(regexStr, 'i');
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
