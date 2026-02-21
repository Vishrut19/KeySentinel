/**
 * Secret detection patterns and entropy calculation
 */

export type Severity = 'high' | 'medium' | 'low';

export interface SecretPattern {
  name: string;
  pattern: RegExp;
  severity: Severity;
  group: string;
  remediation: string;
}

export interface Finding {
  file: string;
  line: number | null;
  type: string;
  severity: Severity;
  confidence: 'high' | 'medium' | 'low';
  snippet: string;
  rawValue: string;
  remediation: string;
}

// Secret detection patterns organized by group
export const SECRET_PATTERNS: SecretPattern[] = [
  // AWS
  {
    name: 'AWS Access Key ID',
    pattern: /\b(AKIA[0-9A-Z]{16})\b/g,
    severity: 'high',
    group: 'aws',
    remediation: 'Deactivate the key in AWS IAM Console (https://console.aws.amazon.com/iam) → Users → Security credentials → Access keys → Deactivate/Delete. Create a new key and store it in environment variables or a secrets manager.',
  },
  {
    name: 'AWS Secret Access Key',
    pattern: /\b([A-Za-z0-9/+=]{40})\b/g,
    severity: 'high',
    group: 'aws',
    remediation: 'Rotate the AWS secret key in IAM Console immediately. Use `aws configure` to set the new key locally and store it via GitHub Secrets or AWS Secrets Manager — never in code.',
  },

  // GitHub
  {
    name: 'GitHub Personal Access Token',
    pattern: /\b(ghp_[a-zA-Z0-9]{36})\b/g,
    severity: 'high',
    group: 'github',
    remediation: 'Revoke this token at https://github.com/settings/tokens and generate a new one. Use GitHub Secrets (Settings → Secrets → Actions) to pass it to workflows.',
  },
  {
    name: 'GitHub OAuth Access Token',
    pattern: /\b(gho_[a-zA-Z0-9]{36})\b/g,
    severity: 'high',
    group: 'github',
    remediation: 'Revoke this OAuth token in GitHub Developer Settings → OAuth Apps. Regenerate and store it as a GitHub Secret or environment variable.',
  },
  {
    name: 'GitHub App Token',
    pattern: /\b(ghu_[a-zA-Z0-9]{36})\b/g,
    severity: 'high',
    group: 'github',
    remediation: 'Revoke this token in the GitHub App settings and regenerate it. Store it via GitHub Secrets — never hardcode it.',
  },
  {
    name: 'GitHub Fine-Grained Token',
    pattern: /\b(github_pat_[a-zA-Z0-9_]{22,82})\b/g,
    severity: 'high',
    group: 'github',
    remediation: 'Delete this fine-grained token at https://github.com/settings/tokens?type=beta and create a new one with minimal scopes. Store it as a GitHub Secret.',
  },

  // Slack
  {
    name: 'Slack Bot Token',
    pattern: /\b(xoxb-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24})\b/g,
    severity: 'high',
    group: 'slack',
    remediation: 'Regenerate the bot token in Slack App settings (https://api.slack.com/apps) → OAuth & Permissions → Reinstall App. Store the new token in environment variables.',
  },
  {
    name: 'Slack User Token',
    pattern: /\b(xoxp-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24})\b/g,
    severity: 'high',
    group: 'slack',
    remediation: 'Regenerate the user token in Slack App settings → OAuth & Permissions → Reinstall App. Never commit Slack tokens to source control.',
  },
  {
    name: 'Slack Webhook URL',
    pattern: /https:\/\/hooks\.slack\.com\/services\/T[a-zA-Z0-9_]{8,}\/B[a-zA-Z0-9_]{8,}\/[a-zA-Z0-9_]{24}/g,
    severity: 'high',
    group: 'slack',
    remediation: 'Regenerate the webhook URL in Slack App settings → Incoming Webhooks. Store it as an environment variable or secret.',
  },

  // Generic API Keys
  {
    name: 'Generic API Key',
    pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?([a-zA-Z0-9_\-]{20,})['"]?/gi,
    severity: 'medium',
    group: 'generic',
    remediation: 'Remove the API key from source code. Use environment variables (e.g., process.env.API_KEY) or a .env file (added to .gitignore) instead.',
  },
  {
    name: 'Generic Secret',
    pattern: /(?:secret|secret[_-]?key)\s*[:=]\s*['"]?([a-zA-Z0-9_\-]{16,})['"]?/gi,
    severity: 'medium',
    group: 'generic',
    remediation: 'Move this secret to environment variables or a secrets manager. Rotate it if it was already pushed to a remote repository.',
  },
  {
    name: 'Generic Password',
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"]?([^\s'"]{8,})['"]?/gi,
    severity: 'medium',
    group: 'generic',
    remediation: 'Remove the hardcoded password. Use environment variables or a secrets manager. Change this password immediately if it was exposed.',
  },
  {
    name: 'Bearer Token',
    pattern: /Bearer\s+([a-zA-Z0-9_\-.~+/]+=*)/gi,
    severity: 'medium',
    group: 'generic',
    remediation: 'Remove the bearer token from code. Tokens should be injected at runtime via environment variables. Revoke and rotate the token if exposed.',
  },
  {
    name: 'Basic Auth',
    pattern: /Basic\s+([a-zA-Z0-9+/=]{20,})/gi,
    severity: 'medium',
    group: 'generic',
    remediation: 'Remove hardcoded Basic Auth credentials. Change the password immediately and use environment variables for credentials.',
  },

  // Private Keys
  {
    name: 'RSA Private Key',
    pattern: /-----BEGIN RSA PRIVATE KEY-----/g,
    severity: 'high',
    group: 'keys',
    remediation: 'Remove the private key file from the repository. Generate a new key pair with `ssh-keygen -t rsa -b 4096`. Add *.pem and *_rsa to .gitignore. The old key must be considered compromised.',
  },
  {
    name: 'SSH Private Key',
    pattern: /-----BEGIN OPENSSH PRIVATE KEY-----/g,
    severity: 'high',
    group: 'keys',
    remediation: 'Remove the SSH key from the repository. Generate a new key with `ssh-keygen -t ed25519`. Add the old public key to revocation lists on all servers where it was authorized.',
  },
  {
    name: 'PGP Private Key',
    pattern: /-----BEGIN PGP PRIVATE KEY BLOCK-----/g,
    severity: 'high',
    group: 'keys',
    remediation: 'Remove the PGP private key immediately. Revoke the key with `gpg --gen-revoke <key-id>` and publish the revocation certificate. Generate a new PGP key pair.',
  },
  {
    name: 'EC Private Key',
    pattern: /-----BEGIN EC PRIVATE KEY-----/g,
    severity: 'high',
    group: 'keys',
    remediation: 'Remove the EC private key. Generate a new key with `openssl ecparam -genkey -name prime256v1`. The compromised key should be rotated everywhere it was used.',
  },

  // Cloud Providers
  {
    name: 'Google API Key',
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    severity: 'high',
    group: 'google',
    remediation: 'Restrict or delete the key in Google Cloud Console (https://console.cloud.google.com/apis/credentials). Create a new key with proper API and IP restrictions.',
  },
  {
    name: 'Google OAuth Client Secret',
    pattern: /\b([a-zA-Z0-9_-]{24}\.apps\.googleusercontent\.com)\b/g,
    severity: 'medium',
    group: 'google',
    remediation: 'Reset the client secret in Google Cloud Console → APIs & Services → Credentials. Store it as an environment variable.',
  },

  // Stripe
  {
    name: 'Stripe Live Key',
    pattern: /\bsk_live_[0-9a-zA-Z]{10,}\b/g,
    severity: 'high',
    group: 'stripe',
    remediation: 'Roll the API key immediately in the Stripe Dashboard (https://dashboard.stripe.com/apikeys) → Roll key. This is a LIVE key — unauthorized charges may have occurred.',
  },
  {
    name: 'Stripe Test Key',
    pattern: /\bsk_test_[0-9a-zA-Z]{10,}\b/g,
    severity: 'low',
    group: 'stripe',
    remediation: 'Remove the test key from code and use environment variables. While test keys cannot process real charges, they should still not be committed.',
  },
  {
    name: 'Stripe Restricted Key',
    pattern: /\brk_live_[0-9a-zA-Z]{10,}\b/g,
    severity: 'high',
    group: 'stripe',
    remediation: 'Delete and regenerate the restricted key in the Stripe Dashboard → API keys → Restricted keys. Review access logs for unauthorized usage.',
  },

  // Database Connection Strings
  {
    name: 'Database Connection String',
    pattern: /(?:mongodb|postgres|mysql|redis):\/\/[^\s'"]+:[^\s'"]+@[^\s'"]+/gi,
    severity: 'high',
    group: 'database',
    remediation: 'Remove the connection string from code. Change the database password immediately. Use environment variables (e.g., DATABASE_URL) and restrict database access by IP.',
  },

  // Twilio
  {
    name: 'Twilio API Key',
    pattern: /\bSK[0-9a-fA-F]{32}\b/g,
    severity: 'high',
    group: 'twilio',
    remediation: 'Delete and regenerate the API key in Twilio Console (https://www.twilio.com/console). Check usage logs for unauthorized calls.',
  },

  // SendGrid
  {
    name: 'SendGrid API Key',
    pattern: /\bSG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}\b/g,
    severity: 'high',
    group: 'sendgrid',
    remediation: 'Revoke the API key at https://app.sendgrid.com/settings/api_keys and create a new one with minimal permissions. Check for unauthorized email sends.',
  },

  // Mailchimp
  {
    name: 'Mailchimp API Key',
    pattern: /\b[0-9a-f]{32}-us[0-9]{1,2}\b/g,
    severity: 'medium',
    group: 'mailchimp',
    remediation: 'Regenerate the API key in Mailchimp → Account → Extras → API keys. Store it as an environment variable.',
  },

  // NPM
  {
    name: 'NPM Token',
    pattern: /\bnpm_[a-zA-Z0-9]{36}\b/g,
    severity: 'high',
    group: 'npm',
    remediation: 'Revoke the token with `npm token revoke <token>` or at https://www.npmjs.com/settings/tokens. A leaked npm token can publish malicious packages under your name.',
  },

  // Discord
  {
    name: 'Discord Bot Token',
    pattern: /\b[MN][A-Za-z\d]{23,}\.[\w-]{6}\.[\w-]{27}\b/g,
    severity: 'high',
    group: 'discord',
    remediation: 'Regenerate the bot token in Discord Developer Portal (https://discord.com/developers/applications) → Bot → Reset Token. The old token is compromised.',
  },
  {
    name: 'Discord Webhook URL',
    pattern: /https:\/\/discord(?:app)?\.com\/api\/webhooks\/[0-9]+\/[a-zA-Z0-9_-]+/g,
    severity: 'medium',
    group: 'discord',
    remediation: 'Delete and recreate the webhook in Discord channel settings → Integrations → Webhooks. Store the URL as an environment variable.',
  },

  // Heroku
  {
    name: 'Heroku API Key',
    pattern: /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g,
    severity: 'medium',
    group: 'heroku',
    remediation: 'Regenerate the API key at https://dashboard.heroku.com/account → API Key → Regenerate. Update all deployments using this key.',
  },

  // JWT
  {
    name: 'JSON Web Token',
    pattern: /\beyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]+\b/g,
    severity: 'medium',
    group: 'jwt',
    remediation: 'Remove the JWT from code. If this is a long-lived token, rotate the signing secret to invalidate it. JWTs should be generated at runtime, not hardcoded.',
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
