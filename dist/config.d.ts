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
export declare function loadConfig(): Config;
/**
 * Check if a file path matches any ignore glob
 */
export declare function shouldIgnoreFile(filePath: string, ignorePatterns: string[]): boolean;
/**
 * Check if a value matches any allowlist pattern
 */
export declare function isAllowlisted(value: string, allowlist: RegExp[]): boolean;
