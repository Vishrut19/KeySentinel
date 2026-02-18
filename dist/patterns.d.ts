/**
 * Secret detection patterns and entropy calculation
 */
export type Severity = 'high' | 'medium' | 'low';
export interface SecretPattern {
    name: string;
    pattern: RegExp;
    severity: Severity;
    group: string;
}
export interface Finding {
    file: string;
    line: number | null;
    type: string;
    severity: Severity;
    confidence: 'high' | 'medium' | 'low';
    snippet: string;
    rawValue: string;
}
export declare const SECRET_PATTERNS: SecretPattern[];
/**
 * Calculate Shannon entropy of a string
 */
export declare function calculateEntropy(str: string): number;
/**
 * Check if a string looks like base64
 */
export declare function isBase64Like(str: string): boolean;
/**
 * Check if string is a common non-secret pattern
 */
export declare function isLikelyNonSecret(str: string): boolean;
export interface EntropyConfig {
    enabled: boolean;
    minLength: number;
    threshold: number;
    ignoreBase64Like: boolean;
}
/**
 * Detect high-entropy strings that might be secrets
 */
export declare function detectHighEntropyStrings(text: string, config: EntropyConfig): {
    value: string;
    entropy: number;
}[];
/**
 * Get patterns filtered by enabled groups
 */
export declare function getEnabledPatterns(enabledGroups?: Record<string, boolean>): SecretPattern[];
