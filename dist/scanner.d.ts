/**
 * Core scanning logic - pure functions for testability
 */
import { Finding, Severity, SecretPattern } from './patterns';
import { Config } from './config';
/**
 * Extract added lines from a unified diff patch
 * Returns array of { line: text, lineNumber: number }
 */
export declare function extractAddedLines(patch: string): {
    line: string;
    lineNumber: number;
}[];
/**
 * Scan text for secrets using regex patterns
 */
export declare function scanWithPatterns(text: string, patterns: SecretPattern[], allowlist: RegExp[]): {
    pattern: SecretPattern;
    match: string;
    index: number;
}[];
/**
 * Scan a single file's added lines for secrets
 */
export declare function scanLines(filename: string, addedLines: {
    line: string;
    lineNumber: number;
}[], config: Config, patterns: SecretPattern[]): Finding[];
/**
 * Generate markdown report from findings
 */
export declare function generateReport(findings: Finding[], filesScanned: number): string;
/**
 * Check if workflow should fail based on severity threshold
 */
export declare function shouldFail(findings: Finding[], failOn: Severity | 'off'): boolean;
