/**
 * Mask sensitive data for safe display
 */
/**
 * Mask a secret value, showing only first 3 and last 3 characters
 * @param value The secret value to mask
 * @param showChars Number of characters to show at start and end (default 3)
 */
export declare function maskSecret(value: string, showChars?: number): string;
/**
 * Mask a line of text containing a secret
 * Shows context around the secret while masking the sensitive part
 */
export declare function maskLine(line: string, secretValue: string, maxLineLength?: number): string;
/**
 * Mask multiple occurrences of secrets in a text
 */
export declare function maskMultiple(text: string, secrets: string[]): string;
/**
 * Redact a value for logging (complete masking)
 */
export declare function redact(value: string): string;
