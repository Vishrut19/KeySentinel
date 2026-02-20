![GitHub Marketplace](https://img.shields.io/badge/Marketplace-KeySentinel-blue)

# KeySentinel

GitHub Action that scans Pull Request diffs for leaked secrets (API keys, tokens, passwords). Designed to catch accidental credential leaks before they reach your main branch.

## Features

- Scans only PR diff (not entire repository) for efficient processing
- Detects common secret patterns (AWS, GitHub, Slack, Stripe, etc.)
- Entropy-based detection for unknown secret formats
- Posts findings as a PR comment with masked previews
- Idempotent comments (updates existing instead of creating duplicates)
- Configurable via action inputs or `.keysentinel.yml`
- Supports allowlist patterns and file ignore globs
- Safe: never prints full secrets to logs

## Quick Start

**Step:1** Create a workflows file.
Create `.github/workflows/keysentinel.yml`

Paste this

```yaml
name: KeySentinel
on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write
  issues: write

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: Vishrut19/KeySentinel@v0
        env:
          GITHUB_TOKEN: ${{ github.token }}
```

**Step:2** Enable Write Permissions in Repo Settings

Repo -> Settings -> Actions -> General -> Workflow Permissions -> Select ✅ Read and write permissions -> Save

**If KeySentinel runs but doesn’t comment, enable Read & write permissions.**

**Step:3** Open a PR and it will automatically check for leaked API keys, tokens and passwords.

## Configuration

### Action Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `github_token` | GitHub token for API access | `${{ github.token }}` |
| `fail_on` | Fail workflow at this severity (`high`, `medium`, `low`, `off`) | `high` |
| `post_no_findings` | Post comment when no secrets found | `false` |
| `ignore` | Comma-separated file globs to ignore | (see defaults) |
| `allowlist` | Comma-separated regex patterns to allow | `""` |
| `max_files` | Maximum files to scan per PR | `100` |
| `config_path` | Path to config file | `.keysentinel.yml` |

### Configuration File

Create `.keysentinel.yml` in your repository root for advanced configuration:

```yaml
# Fail workflow at this severity level
fail_on: high  # high | medium | low | off

# Post comment even when no secrets are found
post_no_findings: false

# Maximum number of files to scan
max_files: 100

# Files to ignore (in addition to defaults)
ignore:
  - "*.test.ts"
  - "**/__fixtures__/**"
  - "docs/**"

# Patterns to allow (regex)
allowlist:
  - "EXAMPLE_[A-Z]+"
  - "test_api_key_.*"
  - "fake_secret_.*"

# Enable/disable pattern groups
patterns:
  aws: true
  github: true
  slack: true
  stripe: true
  generic: true
  keys: true
  google: true
  database: true
  twilio: true
  sendgrid: true
  mailchimp: true
  npm: true
  discord: true
  heroku: true
  jwt: true

# Entropy detection settings
entropy:
  enabled: true
  min_length: 20
  threshold: 4.2
  ignore_base64_like: true
```

### Default Ignored Files

The following patterns are ignored by default:

- `node_modules/**`
- `dist/**`, `build/**`
- `vendor/**`
- `*.min.js`, `*.min.css`
- `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`
- `*.map`
- `.git/**`
- `coverage/**`
- `*.md`, `LICENSE*`, `CHANGELOG*`

## Detected Secret Types

| Category | Patterns |
|----------|----------|
| **AWS** | Access Key ID, Secret Access Key |
| **GitHub** | Personal Access Token, OAuth Token, App Token, Fine-Grained Token |
| **Slack** | Bot Token, User Token, Webhook URL |
| **Stripe** | Live Key, Test Key, Restricted Key |
| **Google** | API Key, OAuth Client Secret |
| **Generic** | API keys, secrets, passwords, Bearer tokens, Basic auth |
| **Private Keys** | RSA, SSH, PGP, EC private keys |
| **Database** | Connection strings (MongoDB, PostgreSQL, MySQL, Redis) |
| **Others** | Twilio, SendGrid, Mailchimp, NPM, Discord, Heroku, JWT |

## Example Output

When secrets are found, KeySentinel posts a comment like this:

> :warning: **Found 2 potential secret(s)** in this pull request.
>
> :red_circle: **High:** 1
> :orange_circle: **Medium:** 1
>
> | Severity | File | Line | Type | Confidence | Snippet |
> |----------|------|------|------|------------|---------|
> | :red_circle: high | `src/config.ts` | 15 | AWS Access Key ID | high | `aws_key = "AKI**********XYZ"` |
> | :orange_circle: medium | `api/handler.ts` | 42 | Generic API Key | high | `api_key: "abc**********xyz"` |

## Outputs

| Output | Description |
|--------|-------------|
| `secrets_found` | Number of secrets detected |
| `findings` | JSON string of all findings (without raw secret values) |

### Using Outputs

```yaml
- uses: your-org/keysentinel@v0.1.0
  id: scan
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}

- name: Check results
  run: |
    echo "Found ${{ steps.scan.outputs.secrets_found }} secrets"
```

## Advanced Usage

### Using with pull_request_target

For forks, you may need `pull_request_target`. Be cautious with this trigger:

```yaml
on:
  pull_request_target:
    types: [opened, synchronize, reopened]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}
      - uses: your-org/keysentinel@v0.1.0
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

### Custom Failure Behavior

```yaml
- uses: your-org/keysentinel@v0.1.0
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    fail_on: medium  # Fail on medium and high severity
```

### Ignore Specific Files

```yaml
- uses: your-org/keysentinel@v0.1.0
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    ignore: "*.test.ts,fixtures/**,docs/**"
```

### Allowlist False Positives

```yaml
- uses: your-org/keysentinel@v0.1.0
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    allowlist: "EXAMPLE_KEY_.*,test_token_.*"
```

## Security Notes

1. **Secrets are masked**: KeySentinel never logs full secret values. Only masked previews (first 3 + last 3 characters) are shown.

2. **Scan scope**: Only added lines in the PR diff are scanned, not the entire repository.

3. **Token permissions**: The action requires `pull-requests: write` to post comments. Use the built-in `GITHUB_TOKEN` which has appropriate scoping.

4. **False positives**: Some high-entropy strings may be flagged incorrectly. Use the allowlist to suppress known false positives.

5. **Not a replacement for secret scanning**: This action is a safety net, not a comprehensive security solution. Consider using GitHub's built-in secret scanning for broader protection.

## Troubleshooting

### Action doesn't run

Ensure the workflow triggers on `pull_request`:

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened]
```

### No comment posted

Check that the workflow has `pull-requests: write` permission:

```yaml
permissions:
  contents: read
  pull-requests: write
```

### Too many false positives

1. Add patterns to the allowlist in `.keysentinel.yml`
2. Increase entropy threshold
3. Disable specific pattern groups

### Missing detections

1. Ensure the file isn't in the ignore list
2. Check if the pattern group is enabled
3. Lower the entropy threshold if using entropy detection

## Pricing

**KeySentinel is completely free and open source.** There are no paid tiers, premium features, or external service dependencies. It runs entirely within GitHub Actions using only the GitHub API.

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

MIT License - see [LICENSE](LICENSE) for details.
