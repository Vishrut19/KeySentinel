/**
 * Configuration handling for KeySentinel
 */
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
/**
 * Load YAML config from path. Uses logger for messages (Action passes core, CLI uses console).
 */
export declare function loadYamlConfig(configPath: string, logger?: ConfigLogger): YamlConfig | null;
/**
 * Build Config from YAML and overrides. Pure merge: defaults, then YAML, then overrides.
 */
export declare function buildConfig(yamlConfig: YamlConfig | null, overrides: ConfigOverrides, logger?: ConfigLogger): Config;
/** Load config for GitHub Action (uses @actions/core inputs). */
export declare function loadConfig(): Config;
/**
 * Load config for CLI (no @actions/core). Reads .keysentinel.yml from cwd (or configPath).
 */
export declare function loadConfigForCli(options?: {
    cwd?: string;
    configPath?: string;
}): Config;
/**
 * Check if a file path matches any ignore glob
 */
export declare function shouldIgnoreFile(filePath: string, ignorePatterns: string[]): boolean;
/**
 * Check if a value matches any allowlist pattern
 */
export declare function isAllowlisted(value: string, allowlist: RegExp[]): boolean;
export {};
