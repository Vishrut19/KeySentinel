<div align="center">

![KeySentinel Logo](https://img.shields.io/badge/KeySentinel-🔐-blue?style=for-the-badge)

# 🔐 KeySentinel

**Stop secrets from leaking into your codebase. Catch API keys, tokens, and passwords before they reach production.**

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-KeySentinel-blue?logo=github)](https://github.com/marketplace/actions/keysentinel)
[![npm version](https://img.shields.io/npm/v/keysentinel?logo=npm)](https://www.npmjs.com/package/keysentinel)
[![License](https://img.shields.io/github/license/Vishrut19/KeySentinel?style=flat-square)](LICENSE)
[![Latest Release](https://img.shields.io/github/v/release/Vishrut19/KeySentinel?style=flat-square)](https://github.com/Vishrut19/KeySentinel/releases)
[![GitHub Stars](https://img.shields.io/github/stars/Vishrut19/KeySentinel?style=flat-square&logo=github)](https://github.com/Vishrut19/KeySentinel/stargazers)

[🚀 Quick Start](#-quick-start) • [📖 Documentation](#-configuration) • [💻 CLI](#-block-secrets-locally) • [🔧 Configuration](#-configuration) • [🤝 Contributing](#-contributing)

</div>

## 🎯 Why KeySentinel?

**Accidental secret leaks happen.** A developer commits an API key. A config file gets pushed with credentials. Before you know it, your secrets are exposed in your repository history.

**KeySentinel stops leaks at the source** — scanning pull requests and local commits to catch secrets before they reach your main branch. Powerful, local-first secret detection that works seamlessly in your existing workflow.

### ✨ Key Features

- 🚀 **Fast & Efficient** - Scans only PR diffs, not entire repositories
- 🔍 **Comprehensive Detection** - 50+ secret patterns (AWS, GitHub, Stripe, Slack, and more)
- 🧠 **Smart Detection** - Entropy-based analysis catches unknown secret formats
- 🛡️ **Safe by Default** - Never logs full secrets, only masked previews
- ⚡ **Local & CI** - Pre-commit hooks + GitHub Actions for complete coverage
- 🎛️ **Highly Configurable** - Custom allowlists, ignore patterns, severity levels
- 💰 **Free Forever** - Core features always free, with optional premium features coming soon

## 🚀 Quick Start

### Option 1: Local Pre-commit Hook (Recommended for Individual Developers)

**Install globally:**

```bash
npm install -g keysentinel
```

**Install git hooks:**

```bash
keysentinel install
```

Done! Now every commit and push will be scanned for secrets automatically.

### Option 2: GitHub Action (Recommended for Teams)

Add KeySentinel to your repository in **3 simple steps**:

**Step 1:** Create `.github/workflows/keysentinel.yml`

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

**Step 2:** Enable Write Permissions

Go to **Repository Settings → Actions → General → Workflow Permissions** → Select ✅ **Read and write permissions** → Save

**Step 3:** Open a Pull Request

KeySentinel will automatically scan for secrets and post findings as PR comments! 🎉

## 📸 What It Looks Like

When KeySentinel finds secrets, it posts a clear, actionable comment on your PR:

<img width="1469" height="776" alt="KeySentinel PR Comment Example" src="https://github.com/user-attachments/assets/e9edc920-222c-45ab-8c97-f8e1ede956aa" />

## 💻 Block Secrets Locally

**Stop secrets before they're committed** with KeySentinel's pre-commit and pre-push hooks. Perfect for catching leaks during development.

### Installation

```bash
# Global install (recommended)
npm install -g keysentinel

# Or as a project dependency
npm install -D keysentinel
```

### Setup Git Hooks

From your repository root:

```bash
keysentinel install
```

This installs both `.git/hooks/pre-commit` and `.git/hooks/pre-push` hooks in **this** repository. You must run `keysentinel install` in each repo where you want commits and pushes blocked (i.e. the repo you run `git push` from).

The hooks:

- ✅ Scan staged files on commit (pre-commit) and pushed commits on push (pre-push)
- ✅ Prefer local `lib/cli.js` or `node_modules/.bin/keysentinel`, then global `keysentinel`, then `npx keysentinel`
- ✅ Block commit/push when secrets are found at or above your `fail_on` severity
- ✅ Show clear error messages with findings

To block **medium** severity (e.g. generic API keys like `sk_...`), add a `.keysentinel.yml` in the repo root with `fail_on: medium`. The default is `high` (only high severity blocks).

### Manual Scan

Scan staged files without committing:

```bash
keysentinel scan
```

**Exit codes:**

- `0` - No secrets found (or below `fail_on` threshold)
- `1` - Secrets detected at or above `fail_on` severity

> 💡 **Tip:** The same `.keysentinel.yml` configuration file works for both the CLI and GitHub Action, keeping your rules consistent across local and CI environments.

## 🔧 Configuration

KeySentinel is highly configurable. Use action inputs for quick setup, or create a `.keysentinel.yml` file for advanced configuration.

### Action Inputs

| Input              | Description                                                     | Default               |
| ------------------ | --------------------------------------------------------------- | --------------------- |
| `github_token`     | GitHub token for API access                                     | `${{ github.token }}` |
| `fail_on`          | Fail workflow at this severity (`high`, `medium`, `low`, `off`) | `high`                |
| `post_no_findings` | Post comment when no secrets found                              | `false`               |
| `ignore`           | Comma-separated file globs to ignore                            | (see defaults)        |
| `allowlist`        | Comma-separated regex patterns to allow                         | `""`                  |
| `max_files`        | Maximum files to scan per PR                                    | `100`                 |
| `config_path`      | Path to config file                                             | `.keysentinel.yml`    |

### Configuration File

Create `.keysentinel.yml` in your repository root for advanced configuration. This file is shared between the GitHub Action and local CLI, ensuring consistent behavior.

```yaml
# Severity threshold for failing workflows
fail_on: high # Options: high | medium | low | off

# Post comment even when no secrets found
post_no_findings: false

# Maximum files to scan per PR
max_files: 100

# Files to ignore (in addition to defaults)
ignore:
  - "*.test.ts"
  - "**/__fixtures__/**"
  - "docs/**"
  - "*.spec.js"

# Patterns to allowlist (regex)
allowlist:
  - "EXAMPLE_[A-Z]+"
  - "test_api_key_.*"
  - "fake_secret_.*"
  - "MOCK_.*"

# Enable/disable specific pattern groups
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

# Entropy detection (catches unknown secret formats)
entropy:
  enabled: true
  min_length: 20
  threshold: 4.2
  ignore_base64_like: true
```

### Default Ignored Files

These patterns are automatically ignored:

- Build artifacts: `node_modules/**`, `dist/**`, `build/**`, `vendor/**`
- Minified files: `*.min.js`, `*.min.css`
- Lock files: `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `*.lock`
- Source maps: `*.map`
- Git files: `.git/**`
- Documentation: `*.md`, `LICENSE*`, `CHANGELOG*`
- Coverage: `coverage/**`

## 🔍 Detected Secret Types

KeySentinel detects **50+ secret patterns** across major services:

| Category              | Detected Patterns                                                             |
| --------------------- | ----------------------------------------------------------------------------- |
| **🔷 AWS**            | Access Key ID (`AKIA...`), Secret Access Key                                  |
| **🐙 GitHub**         | Personal Access Token (`ghp_...`), OAuth Token, App Token, Fine-Grained Token |
| **💬 Slack**          | Bot Token (`xoxb-...`), User Token (`xoxp-...`), Webhook URL                  |
| **💳 Stripe**         | Live Key (`sk_live_...`), Test Key (`sk_test_...`), Restricted Key            |
| **🔍 Google**         | API Key, OAuth Client Secret                                                  |
| **🔑 Private Keys**   | RSA, SSH, PGP, EC private keys                                                |
| **🗄️ Database**       | MongoDB, PostgreSQL, MySQL, Redis connection strings                          |
| **📧 Email Services** | Twilio, SendGrid, Mailchimp API keys                                          |
| **🔐 Generic**        | API keys, Bearer tokens, Basic auth credentials                               |
| **📦 Others**         | NPM tokens, Discord tokens, Heroku API keys, JWT secrets                      |

> 💡 **Smart Detection:** KeySentinel uses entropy analysis to catch high-entropy strings that match secret patterns, even if they don't match known formats.

## 📊 Example Output

When secrets are detected, KeySentinel posts a formatted comment on your PR:

> ⚠️ **Found 2 potential secret(s)** in this pull request.
>
> 🔴 **High:** 1  
> 🟠 **Medium:** 1
>
> | Severity  | File             | Line | Type              | Confidence | Preview                        |
> | :-------- | :--------------- | ---: | :---------------- | :--------- | :----------------------------- |
> | 🔴 High   | `src/config.ts`  |   15 | AWS Access Key ID | high       | `aws_key = "AKI**********XYZ"` |
> | 🟠 Medium | `api/handler.ts` |   42 | Generic API Key   | high       | `api_key: "abc**********xyz"`  |

## 🎛️ Advanced Usage

### Using Action Outputs

Access scan results in your workflow:

```yaml
- uses: Vishrut19/KeySentinel@v0
  id: scan
  env:
    GITHUB_TOKEN: ${{ github.token }}

- name: Check results
  run: |
    echo "Found ${{ steps.scan.outputs.secrets_found }} secrets"
    echo "${{ steps.scan.outputs.findings }}" | jq .
```

### Custom Failure Behavior

Fail on medium or high severity:

```yaml
- uses: Vishrut19/KeySentinel@v0
  with:
    github_token: ${{ github.token }}
    fail_on: medium # Fail on medium and high
```

### Ignore Specific Files

```yaml
- uses: Vishrut19/KeySentinel@v0
  with:
    github_token: ${{ github.token }}
    ignore: "*.test.ts,fixtures/**,docs/**"
```

### Allowlist False Positives

```yaml
- uses: Vishrut19/KeySentinel@v0
  with:
    github_token: ${{ github.token }}
    allowlist: "EXAMPLE_KEY_.*,test_token_.*"
```

### Using with Forked PRs

For forks, use `pull_request_target` (use with caution):

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
      - uses: Vishrut19/KeySentinel@v0
        env:
          GITHUB_TOKEN: ${{ github.token }}
```

## 🛡️ Security & Privacy

**KeySentinel is designed with security in mind:**

1. ✅ **Secrets are masked** - Never logs full secret values. Only masked previews (first 3 + last 3 characters) are shown
2. ✅ **Minimal scope** - Scans only added lines in PR diffs, not entire repositories
3. ✅ **No external calls** - Runs entirely within GitHub Actions, no data leaves your environment
4. ✅ **Safe permissions** - Uses GitHub's built-in `GITHUB_TOKEN` with minimal required scopes
5. ✅ **Local-first** - CLI runs entirely locally, no network calls

> ⚠️ **Important:** KeySentinel is a safety net, not a replacement for comprehensive secret scanning. Consider using GitHub's built-in secret scanning for broader protection.

## 🐛 Troubleshooting

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

Also verify **Repository Settings → Actions → General → Workflow Permissions** is set to **Read and write permissions**.

### Too many false positives

1. Add patterns to the allowlist in `.keysentinel.yml`
2. Increase entropy threshold (e.g., `threshold: 4.5`)
3. Disable specific pattern groups that aren't relevant

### Missing detections

1. Ensure the file isn't in the ignore list
2. Check if the pattern group is enabled in `.keysentinel.yml`
3. Lower the entropy threshold if using entropy detection

### Pre-commit hook not working

- Verify the hook is executable: `chmod +x .git/hooks/pre-commit`
- Check if `keysentinel` is in your PATH or use `npx keysentinel scan`
- Run manually: `keysentinel scan` to see error messages

## 💰 Pricing

**KeySentinel offers a generous free tier with premium features coming soon.**

### 🆓 Free Tier (Always Available)

The core KeySentinel functionality is **free forever**:

- ✅ Unlimited secret scanning
- ✅ All 50+ detection patterns
- ✅ GitHub Action integration
- ✅ Pre-commit & pre-push hooks
- ✅ Local CLI tool
- ✅ Full configuration options
- ✅ No usage limits
- ✅ No external service dependencies
- ✅ Runs entirely within GitHub Actions

### 🚀 Premium Features (Coming Soon)

We're building premium features to help teams scale:

- 🔒 **Advanced Pattern Detection** - Custom pattern creation and ML-based detection
- 📊 **Analytics Dashboard** - Track secret detection trends and team compliance
- 🔔 **Slack/Email Notifications** - Real-time alerts for critical findings
- 👥 **Team Management** - Role-based access control and team policies
- 🔄 **CI/CD Integrations** - Native support for GitLab, Bitbucket, Azure DevOps
- 📈 **Historical Analysis** - Scan entire repository history for existing leaks
- 🛡️ **Enterprise Support** - Priority support and custom integrations

**Interested in premium features?** [Join our waitlist](https://github.com/Vishrut19/KeySentinel/discussions) or [contact us](mailto:support@keysentinel.dev) for early access.

> 💡 **Note:** The free tier will always include all current features. Premium features will be additive, not replacements.

## 🗺️ Roadmap

We're constantly improving KeySentinel. Here's what's coming:

### 🎯 Q2 2025

- [ ] Custom pattern builder UI
- [ ] Slack/Teams integration
- [ ] Enhanced analytics dashboard
- [ ] GitLab CI/CD support

### 🎯 Q3 2025

- [ ] ML-based secret detection
- [ ] Historical repository scanning
- [ ] Enterprise SSO integration
- [ ] API for custom integrations

### 🎯 Future

- [ ] IDE plugins (VS Code, IntelliJ)
- [ ] Real-time scanning service
- [ ] Compliance reporting (SOC2, ISO27001)
- [ ] Custom remediation workflows

**Have a feature request?** [Open an issue](https://github.com/Vishrut19/KeySentinel/issues) or [join our discussions](https://github.com/Vishrut19/KeySentinel/discussions).

## 💝 Support KeySentinel

KeySentinel is free and open source, but maintaining it takes time and resources. Here's how you can help:

- ⭐ **Star the repository** - Help others discover KeySentinel
- 🐛 **Report bugs** - Help us improve stability
- 💡 **Suggest features** - Shape the future of KeySentinel
- 📢 **Share with your team** - Spread the word
- ☕ [**Sponsor the project**](https://github.com/sponsors/Vishrut19) - Support ongoing development

Your support helps us build better tools for the developer community! 🙏

## 🤝 Contributing

Contributions are welcome! Whether it's:

- 🐛 Reporting bugs
- 💡 Suggesting features
- 📝 Improving documentation
- 🔧 Submitting pull requests

We appreciate your help making KeySentinel better for everyone.

**Getting started:**

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⭐ Show Your Support

If KeySentinel has helped protect your codebase, consider giving it a star! ⭐

[![GitHub Stars](https://img.shields.io/github/stars/Vishrut19/KeySentinel?style=social)](https://github.com/Vishrut19/KeySentinel/stargazers)

<div align="center">

**Made with ❤️ by the Vishrut Agarwalla**

[Report Bug](https://github.com/Vishrut19/KeySentinel/issues) • [Request Feature](https://github.com/Vishrut19/KeySentinel/issues) • [Documentation](https://github.com/Vishrut19/KeySentinel#readme)

</div>
