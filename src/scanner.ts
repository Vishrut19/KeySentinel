/**
 * Core scanning logic - pure functions for testability
 */

import {
  Finding,
  Severity,
  SecretPattern,
  detectHighEntropyStrings,
} from './patterns';
import { maskLine } from './mask';
import { isAllowlisted, Config } from './config';

/**
 * Extract added lines from a unified diff patch
 * Returns array of { line: text, lineNumber: number }
 */
export function extractAddedLines(patch: string): { line: string; lineNumber: number }[] {
  const added: { line: string; lineNumber: number }[] = [];
  const lines = patch.split('\n');

  let currentLineNumber = 0;

  for (const line of lines) {
    // Parse hunk header: @@ -old,len +new,len @@
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      currentLineNumber = parseInt(hunkMatch[1], 10) - 1;
      continue;
    }

    // Skip the diff header lines
    if (line.startsWith('+++') || line.startsWith('---')) {
      continue;
    }

    // Added lines start with +
    if (line.startsWith('+')) {
      currentLineNumber++;
      added.push({
        line: line.slice(1), // Remove the leading +
        lineNumber: currentLineNumber,
      });
    } else if (line.startsWith('-')) {
      // Deleted lines don't change the line number
      continue;
    } else if (line.startsWith(' ') || line === '') {
      // Context lines
      currentLineNumber++;
    }
  }

  return added;
}

/**
 * Scan text for secrets using regex patterns
 */
export function scanWithPatterns(
  text: string,
  patterns: SecretPattern[],
  allowlist: RegExp[]
): { pattern: SecretPattern; match: string; index: number }[] {
  const matches: { pattern: SecretPattern; match: string; index: number }[] = [];

  for (const pattern of patterns) {
    // Reset regex state
    pattern.pattern.lastIndex = 0;

    let match;
    while ((match = pattern.pattern.exec(text)) !== null) {
      // Get the captured group or the full match
      const value = match[1] || match[0];

      // Skip if allowlisted
      if (isAllowlisted(value, allowlist)) {
        continue;
      }

      matches.push({
        pattern,
        match: value,
        index: match.index,
      });
    }
  }

  return matches;
}

/**
 * Scan a single file's added lines for secrets
 */
export function scanLines(
  filename: string,
  addedLines: { line: string; lineNumber: number }[],
  config: Config,
  patterns: SecretPattern[]
): Finding[] {
  const findings: Finding[] = [];
  const seenSecrets = new Set<string>();

  for (const { line, lineNumber } of addedLines) {
    // Pattern-based detection
    const patternMatches = scanWithPatterns(line, patterns, config.allowlist);

    for (const { pattern, match } of patternMatches) {
      const key = `${filename}:${lineNumber}:${match}`;
      if (seenSecrets.has(key)) continue;
      seenSecrets.add(key);

      findings.push({
        file: filename,
        line: lineNumber,
        type: pattern.name,
        severity: pattern.severity,
        confidence: 'high',
        snippet: maskLine(line, match),
        rawValue: match,
      });
    }

    // Entropy-based detection
    if (config.entropy.enabled) {
      const entropyMatches = detectHighEntropyStrings(line, config.entropy);

      for (const { value, entropy } of entropyMatches) {
        const key = `${filename}:${lineNumber}:${value}`;
        if (seenSecrets.has(key)) continue;

        if (isAllowlisted(value, config.allowlist)) continue;

        seenSecrets.add(key);

        let severity: Severity = 'low';
        if (entropy >= 5.0) {
          severity = 'high';
        } else if (entropy >= 4.5) {
          severity = 'medium';
        }

        findings.push({
          file: filename,
          line: lineNumber,
          type: 'High Entropy String',
          severity,
          confidence: entropy >= 5.0 ? 'high' : 'medium',
          snippet: maskLine(line, value),
          rawValue: value,
        });
      }
    }
  }

  return findings;
}

/**
 * Generate markdown report from findings
 */
export function generateReport(findings: Finding[], filesScanned: number): string {
  const lines: string[] = [];

  if (findings.length === 0) {
    lines.push('<!-- keysentinel:comment -->');
    lines.push('');
    lines.push('## :white_check_mark: KeySentinel — Secret Scan');
    lines.push('');
    lines.push('**Status:** ✅ No secrets detected');
    lines.push('');
    lines.push(`_Scanned ${filesScanned} file(s)._`);
    return lines.join('\n');
  }

  const highCount = findings.filter(f => f.severity === 'high').length;
  const mediumCount = findings.filter(f => f.severity === 'medium').length;
  const lowCount = findings.filter(f => f.severity === 'low').length;

  // Status indicator
  const statusIcon = highCount > 0 ? ':x:' : ':warning:';
  const statusText = highCount > 0 ? 'Potential secrets detected' : 'Potential secrets detected';

  // Build summary line
  const parts: string[] = [];
  if (highCount > 0) parts.push(`:red_circle: High: ${highCount}`);
  if (mediumCount > 0) parts.push(`:orange_circle: Medium: ${mediumCount}`);
  if (lowCount > 0) parts.push(`:yellow_circle: Low: ${lowCount}`);

  lines.push('<!-- keysentinel:comment -->');
  lines.push('');
  lines.push('## :lock: KeySentinel — Secret Scan');
  lines.push('');
  lines.push(`**Status:** ${statusIcon} ${statusText}`);
  lines.push('');
  lines.push(`**Summary:** **${findings.length} finding${findings.length !== 1 ? 's' : ''}** (${parts.join(' • ')}) • Scanned **${filesScanned}** file(s)`);
  lines.push('');
  lines.push('### Findings');
  lines.push('');
  lines.push('| Severity | File | Line | Rule | Confidence | Preview |');
  lines.push('|:---|:---|---:|:---|:---|:---|');

  for (const finding of findings) {
    const severityLabel = finding.severity === 'high' 
      ? ':red_circle: High' 
      : finding.severity === 'medium' 
        ? ':orange_circle: Medium' 
        : ':yellow_circle: Low';

    const lineStr = finding.line !== null ? `${finding.line}` : 'N/A';
    const snippet = finding.snippet.replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const ruleName = finding.type.toLowerCase().replace(/\s+/g, '_');

    lines.push(
      `| ${severityLabel} | \`${finding.file}\` | ${lineStr} | \`${ruleName}\` | ${finding.confidence} | \`${snippet}\` |`
    );
  }

  lines.push('');
  lines.push('<details>');
  lines.push('<summary><strong>:white_check_mark: What to do next</strong></summary>');
  lines.push('');
  lines.push('1. **Remove the secret from code** (recommended)');
  lines.push('   - Move to environment variables (e.g. `.env`, GitHub Secrets)');
  lines.push('2. **Rotate the key** if it was real and may have leaked.');
  lines.push('3. If this is a **false positive**, allowlist it:');
  lines.push('');
  lines.push('```yaml');
  lines.push('# .keysentinel.yml');
  lines.push('allowlist:');
  lines.push("  - 'FAKE_SECRET_1234567890'");
  lines.push('```');
  lines.push('');
  lines.push('</details>');
  lines.push('');

  return lines.join('\n');
}

/**
 * Check if workflow should fail based on severity threshold
 */
export function shouldFail(findings: Finding[], failOn: Severity | 'off'): boolean {
  if (failOn === 'off') return false;

  const severityOrder: Record<Severity, number> = {
    low: 1,
    medium: 2,
    high: 3,
  };

  const threshold = severityOrder[failOn];
  return findings.some(f => severityOrder[f.severity] >= threshold);
}
