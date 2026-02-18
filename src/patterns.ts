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

// Secret detection patterns organized by group
export const SECRET_PATTERNS: SecretPattern[] = [
  // AWS
  {
    name: 'AWS Access Key ID',
    pattern: /\b(AKIA[0-9A-Z]{16})\b/g,
    severity: 'high',
    group: 'aws'
  },
  {
    name: 'AWS Secret Access Key',
    pattern: /\b([A-Za-z0-9/+=]{40})\b/g,
    severity: 'high',
    group: 'aws'
  },

  // GitHub
  {
    name: 'GitHub Personal Access Token',
    pattern: /\b(ghp_[a-zA-Z0-9]{36})\b/g,
    severity: 'high',
    group: 'github'
  },
  {
    name: 'GitHub OAuth Access Token',
    pattern: /\b(gho_[a-zA-Z0-9]{36})\b/g,
    severity: 'high',
    group: 'github'
  },
  {
    name: 'GitHub App Token',
    pattern: /\b(ghu_[a-zA-Z0-9]{36})\b/g,
    severity: 'high',
    group: 'github'
  },
  {
    name: 'GitHub Fine-Grained Token',
    pattern: /\b(github_pat_[a-zA-Z0-9_]{22,82})\b/g,
    severity: 'high',
    group: 'github'
  },

  // Slack
  {
    name: 'Slack Bot Token',
    pattern: /\b(xoxb-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24})\b/g,
    severity: 'high',
    group: 'slack'
  },
  {
    name: 'Slack User Token',
    pattern: /\b(xoxp-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24})\b/g,
    severity: 'high',
    group: 'slack'
  },
  {
    name: 'Slack Webhook URL',
    pattern: /https:\/\/hooks\.slack\.com\/services\/T[a-zA-Z0-9_]{8,}\/B[a-zA-Z0-9_]{8,}\/[a-zA-Z0-9_]{24}/g,
    severity: 'high',
    group: 'slack'
  },

  // Generic API Keys
  {
    name: 'Generic API Key',
    pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?([a-zA-Z0-9_\-]{20,})['"]?/gi,
    severity: 'medium',
    group: 'generic'
  },
  {
    name: 'Generic Secret',
    pattern: /(?:secret|secret[_-]?key)\s*[:=]\s*['"]?([a-zA-Z0-9_\-]{16,})['"]?/gi,
    severity: 'medium',
    group: 'generic'
  },
  {
    name: 'Generic Password',
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"]?([^\s'"]{8,})['"]?/gi,
    severity: 'medium',
    group: 'generic'
  },
  {
    name: 'Bearer Token',
    pattern: /Bearer\s+([a-zA-Z0-9_\-.~+/]+=*)/gi,
    severity: 'medium',
    group: 'generic'
  },
  {
    name: 'Basic Auth',
    pattern: /Basic\s+([a-zA-Z0-9+/=]{20,})/gi,
    severity: 'medium',
    group: 'generic'
  },

  // Private Keys
  {
    name: 'RSA Private Key',
    pattern: /-----BEGIN RSA PRIVATE KEY-----/g,
    severity: 'high',
    group: 'keys'
  },
  {
    name: 'SSH Private Key',
    pattern: /-----BEGIN OPENSSH PRIVATE KEY-----/g,
    severity: 'high',
    group: 'keys'
  },
  {
    name: 'PGP Private Key',
    pattern: /-----BEGIN PGP PRIVATE KEY BLOCK-----/g,
    severity: 'high',
    group: 'keys'
  },
  {
    name: 'EC Private Key',
    pattern: /-----BEGIN EC PRIVATE KEY-----/g,
    severity: 'high',
    group: 'keys'
  },

  // Cloud Providers
  {
    name: 'Google API Key',
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    severity: 'high',
    group: 'google'
  },
  {
    name: 'Google OAuth Client Secret',
    pattern: /\b([a-zA-Z0-9_-]{24}\.apps\.googleusercontent\.com)\b/g,
    severity: 'medium',
    group: 'google'
  },

  // Stripe
  {
    name: 'Stripe Live Key',
    pattern: /\bsk_live_[0-9a-zA-Z]{24,}\b/g,
    severity: 'high',
    group: 'stripe'
  },
  {
    name: 'Stripe Test Key',
    pattern: /\bsk_test_[0-9a-zA-Z]{24,}\b/g,
    severity: 'low',
    group: 'stripe'
  },
  {
    name: 'Stripe Restricted Key',
    pattern: /\brk_live_[0-9a-zA-Z]{24,}\b/g,
    severity: 'high',
    group: 'stripe'
  },

  // Database Connection Strings
  {
    name: 'Database Connection String',
    pattern: /(?:mongodb|postgres|mysql|redis):\/\/[^\s'"]+:[^\s'"]+@[^\s'"]+/gi,
    severity: 'high',
    group: 'database'
  },

  // Twilio
  {
    name: 'Twilio API Key',
    pattern: /\bSK[0-9a-fA-F]{32}\b/g,
    severity: 'high',
    group: 'twilio'
  },

  // SendGrid
  {
    name: 'SendGrid API Key',
    pattern: /\bSG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}\b/g,
    severity: 'high',
    group: 'sendgrid'
  },

  // Mailchimp
  {
    name: 'Mailchimp API Key',
    pattern: /\b[0-9a-f]{32}-us[0-9]{1,2}\b/g,
    severity: 'medium',
    group: 'mailchimp'
  },

  // NPM
  {
    name: 'NPM Token',
    pattern: /\bnpm_[a-zA-Z0-9]{36}\b/g,
    severity: 'high',
    group: 'npm'
  },

  // Discord
  {
    name: 'Discord Bot Token',
    pattern: /\b[MN][A-Za-z\d]{23,}\.[\w-]{6}\.[\w-]{27}\b/g,
    severity: 'high',
    group: 'discord'
  },
  {
    name: 'Discord Webhook URL',
    pattern: /https:\/\/discord(?:app)?\.com\/api\/webhooks\/[0-9]+\/[a-zA-Z0-9_-]+/g,
    severity: 'medium',
    group: 'discord'
  },

  // Heroku
  {
    name: 'Heroku API Key',
    pattern: /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g,
    severity: 'medium',
    group: 'heroku'
  },

  // JWT
  {
    name: 'JSON Web Token',
    pattern: /\beyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]+\b/g,
    severity: 'medium',
    group: 'jwt'
  },
];

/**
 * Calculate Shannon entropy of a string
 */
export function calculateEntropy(str: string): number {
  if (!str || str.length === 0) return 0;

  const freq: Record<string, number> = {};
  for (const char of str) {
    freq[char] = (freq[char] || 0) + 1;
  }

  let entropy = 0;
  const len = str.length;
  for (const count of Object.values(freq)) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}

/**
 * Check if a string looks like base64
 */
export function isBase64Like(str: string): boolean {
  // Base64 typically has uniform character distribution from a limited alphabet
  const base64Regex = /^[A-Za-z0-9+/]+=*$/;
  return base64Regex.test(str) && str.length % 4 === 0;
}

/**
 * Check if string is a common non-secret pattern
 */
export function isLikelyNonSecret(str: string): boolean {
  // Common patterns that are not secrets
  const nonSecretPatterns = [
    /^[0-9]+$/, // Pure numbers
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i, // UUID (often non-secret)
    /^(true|false|null|undefined|none)$/i, // Boolean/null literals
    /^[a-z]+(_[a-z]+)*$/i, // snake_case identifiers
    /^[a-z]+(-[a-z]+)*$/i, // kebab-case identifiers
    /^v?\d+\.\d+\.\d+/, // Version strings
    /^https?:\/\/[^\s@]+$/, // URLs without credentials
    /^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i, // Email addresses (not secrets themselves)
    /^sha[0-9]{3}:[a-f0-9]{64}$/i, // SHA hashes
    /^[0-9a-f]{64}$/i, // Hex hashes (SHA256)
    /^[0-9a-f]{40}$/i, // Git commit hashes
  ];

  return nonSecretPatterns.some(p => p.test(str));
}

export interface EntropyConfig {
  enabled: boolean;
  minLength: number;
  threshold: number;
  ignoreBase64Like: boolean;
}

/**
 * Detect high-entropy strings that might be secrets
 */
export function detectHighEntropyStrings(
  text: string,
  config: EntropyConfig
): { value: string; entropy: number }[] {
  if (!config.enabled) return [];

  const results: { value: string; entropy: number }[] = [];

  // Match potential tokens: alphanumeric strings with special chars
  const tokenPattern = /\b[a-zA-Z0-9_\-+/]{20,}\b/g;
  let match;

  while ((match = tokenPattern.exec(text)) !== null) {
    const candidate = match[0];

    // Skip if too short
    if (candidate.length < config.minLength) continue;

    // Skip known non-secrets
    if (isLikelyNonSecret(candidate)) continue;

    // Skip base64-like if configured
    if (config.ignoreBase64Like && isBase64Like(candidate)) continue;

    const entropy = calculateEntropy(candidate);

    if (entropy >= config.threshold) {
      results.push({ value: candidate, entropy });
    }
  }

  return results;
}

/**
 * Get patterns filtered by enabled groups
 */
export function getEnabledPatterns(
  enabledGroups?: Record<string, boolean>
): SecretPattern[] {
  if (!enabledGroups) return SECRET_PATTERNS;

  return SECRET_PATTERNS.filter(pattern => {
    const groupSetting = enabledGroups[pattern.group];
    // If group is explicitly disabled, filter out
    if (groupSetting === false) return false;
    // Otherwise include
    return true;
  });
}
