"use strict";
/**
 * Mask sensitive data for safe display
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.maskSecret = maskSecret;
exports.maskLine = maskLine;
exports.maskMultiple = maskMultiple;
exports.redact = redact;
/**
 * Mask a secret value, showing only first 3 and last 3 characters
 * @param value The secret value to mask
 * @param showChars Number of characters to show at start and end (default 3)
 */
function maskSecret(value, showChars = 3) {
    if (!value)
        return '***';
    const len = value.length;
    // If string is too short to meaningfully mask, mask entirely
    if (len <= showChars * 2 + 3) {
        return '*'.repeat(Math.min(len, 10));
    }
    const start = value.slice(0, showChars);
    const end = value.slice(-showChars);
    const maskedLen = Math.min(len - (showChars * 2), 20);
    return `${start}${'*'.repeat(maskedLen)}${end}`;
}
/**
 * Mask a line of text containing a secret
 * Shows context around the secret while masking the sensitive part
 */
function maskLine(line, secretValue, maxLineLength = 100) {
    if (!line || !secretValue)
        return line;
    const maskedSecret = maskSecret(secretValue);
    let maskedLine = line.replace(secretValue, maskedSecret);
    // Truncate if too long
    if (maskedLine.length > maxLineLength) {
        const secretPos = maskedLine.indexOf(maskedSecret);
        if (secretPos === -1) {
            // Secret not found (shouldn't happen), just truncate
            return maskedLine.slice(0, maxLineLength - 3) + '...';
        }
        // Try to keep the masked secret visible
        const contextBefore = 20;
        const contextAfter = 20;
        const start = Math.max(0, secretPos - contextBefore);
        const end = Math.min(maskedLine.length, secretPos + maskedSecret.length + contextAfter);
        let result = maskedLine.slice(start, end);
        if (start > 0) {
            result = '...' + result;
        }
        if (end < maskedLine.length) {
            result = result + '...';
        }
        return result;
    }
    return maskedLine;
}
/**
 * Mask multiple occurrences of secrets in a text
 */
function maskMultiple(text, secrets) {
    let result = text;
    for (const secret of secrets) {
        if (secret && result.includes(secret)) {
            result = result.split(secret).join(maskSecret(secret));
        }
    }
    return result;
}
/**
 * Redact a value for logging (complete masking)
 */
function redact(value) {
    if (!value)
        return '[REDACTED]';
    return `[REDACTED:${value.length} chars]`;
}
