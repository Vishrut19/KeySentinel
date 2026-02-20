#!/usr/bin/env node
"use strict";
/**
 * KeySentinel CLI - pre-commit hook and local scan
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
const readline = __importStar(require("readline"));
const config_1 = require("./config");
const patterns_1 = require("./patterns");
const scanner_1 = require("./scanner");
const mask_1 = require("./mask");
const PRE_COMMIT_HOOK = `#!/bin/sh
echo "🔍 KeySentinel scanning for secrets..."

# Prefer local build (e.g. KeySentinel repo) or project dependency over global
if [ -f "lib/cli.js" ]; then
  node lib/cli.js scan
elif [ -x "node_modules/.bin/keysentinel" ]; then
  node_modules/.bin/keysentinel scan
elif command -v keysentinel >/dev/null 2>&1; then
  keysentinel scan
else
  npx keysentinel scan
fi

RESULT=$?
if [ $RESULT -ne 0 ]; then
  echo "❌ Blocked by KeySentinel (secret detected)"
  exit 1
fi

exit 0
`;
const PRE_PUSH_HOOK = `#!/bin/sh
echo "🔍 KeySentinel scanning for secrets in commits being pushed..."

# Prefer local build (e.g. KeySentinel repo) or project dependency over global
if [ -f "lib/cli.js" ]; then
  node lib/cli.js scan-push
elif [ -x "node_modules/.bin/keysentinel" ]; then
  node_modules/.bin/keysentinel scan-push
elif command -v keysentinel >/dev/null 2>&1; then
  keysentinel scan-push
else
  npx keysentinel scan-push
fi

RESULT=$?
if [ $RESULT -ne 0 ]; then
  echo "❌ Blocked by KeySentinel (secret detected)"
  exit 1
fi

exit 0
`;
function findGitRoot(cwd) {
    let dir = path.resolve(cwd);
    for (;;) {
        const gitDir = path.join(dir, ".git");
        if (fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory()) {
            return dir;
        }
        const parent = path.dirname(dir);
        if (parent === dir)
            return null;
        dir = parent;
    }
}
function runGit(cwd, args) {
    return (0, child_process_1.execSync)(`git ${args.join(" ")}`, {
        encoding: "utf8",
        cwd,
    }).trim();
}
function cmdInstall() {
    const cwd = process.cwd();
    const gitRoot = findGitRoot(cwd);
    if (!gitRoot) {
        console.error("keysentinel: not a git repository (or any parent). Run from a repo root.");
        process.exit(1);
    }
    const hooksDir = path.join(gitRoot, ".git", "hooks");
    if (!fs.existsSync(hooksDir)) {
        console.error("keysentinel: .git/hooks directory not found.");
        process.exit(1);
    }
    const preCommitPath = path.join(hooksDir, "pre-commit");
    const prePushPath = path.join(hooksDir, "pre-push");
    fs.writeFileSync(preCommitPath, PRE_COMMIT_HOOK, "utf8");
    fs.chmodSync(preCommitPath, 0o755);
    fs.writeFileSync(prePushPath, PRE_PUSH_HOOK, "utf8");
    fs.chmodSync(prePushPath, 0o755);
    console.log("Pre-commit hook installed at .git/hooks/pre-commit");
    console.log("Pre-push hook installed at .git/hooks/pre-push");
}
function cmdScan() {
    const cwd = process.cwd();
    const gitRoot = findGitRoot(cwd);
    if (!gitRoot) {
        console.error("keysentinel: not a git repository. Run from a repo root.");
        process.exit(1);
    }
    let fileList;
    try {
        const out = runGit(gitRoot, ["diff", "--cached", "--name-only"]);
        fileList = out
            ? out
                .split("\n")
                .map((f) => f.trim())
                .filter(Boolean)
            : [];
    }
    catch (e) {
        console.error("keysentinel: failed to get staged files:", e.message);
        process.exit(1);
    }
    const config = (0, config_1.loadConfigForCli)({ cwd: gitRoot });
    const patterns = (0, patterns_1.getEnabledPatterns)(config.patterns);
    const allFindings = [];
    let filesScanned = 0;
    for (const filePath of fileList) {
        if ((0, config_1.shouldIgnoreFile)(filePath, config.ignore))
            continue;
        let patch;
        try {
            patch = runGit(gitRoot, ["diff", "--cached", "--", filePath]);
        }
        catch {
            continue;
        }
        const addedLines = (0, scanner_1.extractAddedLines)(patch);
        if (addedLines.length === 0)
            continue;
        const fileFindings = (0, scanner_1.scanLines)(filePath, addedLines, config, patterns);
        allFindings.push(...fileFindings);
        filesScanned++;
    }
    if (allFindings.length === 0) {
        console.log(`KeySentinel: No secrets detected (scanned ${filesScanned} file(s)).`);
        process.exit(0);
    }
    printFindings(allFindings, config.failOn, "commit");
}
function cmdScanPush() {
    const cwd = process.cwd();
    const gitRoot = findGitRoot(cwd);
    if (!gitRoot) {
        console.error("keysentinel: not a git repository. Run from a repo root.");
        process.exit(1);
    }
    // Git pre-push hook passes refs on stdin: "local_ref local_sha remote_ref remote_sha" per line
    let commitsToScan = [];
    try {
        let stdinInput;
        try {
            stdinInput = fs.readFileSync(process.stdin.fd, "utf8").trim();
        }
        catch {
            stdinInput = "";
        }
        const lines = stdinInput ? stdinInput.split("\n").filter(Boolean) : [];
        if (lines.length > 0) {
            for (const line of lines) {
                const parts = line.split(/\s+/);
                const localSha = parts[1];
                const remoteSha = parts[3];
                if (!localSha || localSha.length !== 40)
                    continue;
                if (!remoteSha || remoteSha === "0".repeat(40)) {
                    const commits = runGit(gitRoot, ["rev-list", localSha]);
                    if (commits) {
                        commitsToScan.push(...commits.split("\n").filter(Boolean));
                    }
                }
                else {
                    const commits = runGit(gitRoot, ["rev-list", `${remoteSha}..${localSha}`]);
                    if (commits) {
                        commitsToScan.push(...commits.split("\n").filter(Boolean));
                    }
                }
            }
        }
        // Fallback when not run from hook (no stdin): compare current branch to remote
        if (commitsToScan.length === 0) {
            const remoteName = "origin";
            const currentBranch = runGit(gitRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
            const remoteBranch = `${remoteName}/${currentBranch}`;
            let compareBase = null;
            try {
                runGit(gitRoot, ["rev-parse", "--verify", remoteBranch]);
                compareBase = remoteBranch;
            }
            catch {
                try {
                    runGit(gitRoot, ["rev-parse", "--verify", `${remoteName}/main`]);
                    compareBase = `${remoteName}/main`;
                }
                catch {
                    try {
                        runGit(gitRoot, ["rev-parse", "--verify", `${remoteName}/master`]);
                        compareBase = `${remoteName}/master`;
                    }
                    catch {
                        const commits = runGit(gitRoot, ["rev-list", "-n", "10", "HEAD"]);
                        commitsToScan = commits ? commits.split("\n").filter(Boolean) : [];
                    }
                }
            }
            if (compareBase) {
                const localSha = runGit(gitRoot, ["rev-parse", "HEAD"]);
                const remoteSha = runGit(gitRoot, ["rev-parse", compareBase]);
                const commits = runGit(gitRoot, ["rev-list", `${remoteSha}..${localSha}`]);
                commitsToScan = commits ? commits.split("\n").filter(Boolean) : [];
            }
        }
        commitsToScan = [...new Set(commitsToScan)];
        if (commitsToScan.length === 0) {
            console.log("KeySentinel: No new commits to scan.");
            process.exit(0);
        }
    }
    catch (e) {
        console.error("keysentinel: failed to get commits being pushed:", e.message);
        process.exit(1);
    }
    const config = (0, config_1.loadConfigForCli)({ cwd: gitRoot });
    const patterns = (0, patterns_1.getEnabledPatterns)(config.patterns);
    const allFindings = [];
    let filesScanned = 0;
    // Scan each commit's changes
    for (const commitSha of commitsToScan) {
        try {
            // Get files changed in this commit
            const files = runGit(gitRoot, ["diff-tree", "--no-commit-id", "--name-only", "-r", commitSha]);
            const fileList = files ? files.split("\n").map((f) => f.trim()).filter(Boolean) : [];
            for (const filePath of fileList) {
                if ((0, config_1.shouldIgnoreFile)(filePath, config.ignore))
                    continue;
                // Get the diff for this file in this commit
                const patch = runGit(gitRoot, ["show", "--format=", commitSha, "--", filePath]);
                const addedLines = (0, scanner_1.extractAddedLines)(patch);
                if (addedLines.length === 0)
                    continue;
                const fileFindings = (0, scanner_1.scanLines)(filePath, addedLines, config, patterns);
                allFindings.push(...fileFindings);
                filesScanned++;
            }
        }
        catch (e) {
            // Skip commits that can't be accessed
            continue;
        }
    }
    if (allFindings.length === 0) {
        console.log(`KeySentinel: No secrets detected in ${commitsToScan.length} commit(s) being pushed.`);
        process.exit(0);
    }
    printFindings(allFindings, config.failOn, "push");
}
function printFindings(allFindings, failOn, action) {
    const highCount = allFindings.filter((f) => f.severity === "high").length;
    const mediumCount = allFindings.filter((f) => f.severity === "medium").length;
    const lowCount = allFindings.filter((f) => f.severity === "low").length;
    const willBlock = (0, scanner_1.shouldFail)(allFindings, failOn);
    console.error("");
    console.error("╔══════════════════════════════════════════════════════════════╗");
    if (willBlock) {
        console.error("║  🚨 KEYSENTINEL: SECRET LEAK DETECTED — " + action.toUpperCase() + " BLOCKED" + " ".repeat(Math.max(0, 17 - action.length)) + "║");
    }
    else {
        console.error("║  ⚠️  KEYSENTINEL: POTENTIAL SECRETS FOUND                    ║");
    }
    console.error("╚══════════════════════════════════════════════════════════════╝");
    console.error("");
    console.error(`  Found ${allFindings.length} potential secret(s): 🔴 High: ${highCount}  🟠 Medium: ${mediumCount}  🟡 Low: ${lowCount}`);
    console.error("");
    for (let i = 0; i < allFindings.length; i++) {
        const f = allFindings[i];
        const sevIcon = f.severity === "high" ? "🔴" : f.severity === "medium" ? "🟠" : "🟡";
        const line = f.line != null ? String(f.line) : "?";
        const snippet = f.snippet.replace(/\n/g, " ");
        console.error(`  ${sevIcon} Finding #${i + 1}: ${f.type}`);
        console.error(`     File: ${f.file}:${line}`);
        console.error(`     Preview: ${snippet}`);
        console.error(`     Masked value: ${(0, mask_1.maskSecret)(f.rawValue)}`);
        console.error(`     🔧 Fix: ${f.remediation}`);
        console.error("");
    }
    console.error("────────────────────────────────────────────────────────────────");
    console.error("");
    if (willBlock) {
        console.error(`  ❌ ${action.toUpperCase()} BLOCKED: Secrets at or above "${failOn}" severity found.`);
        console.error("");
        console.error("  To fix this:");
        console.error(`    1. Remove the secret from your code`);
        console.error(`    2. Use environment variables or a .env file (added to .gitignore)`);
        console.error(`    3. Rotate/revoke the leaked credential (see fix instructions above)`);
        console.error(`    4. Stage your fixes: git add <file>`);
        if (action === "push") {
            console.error(`    5. Amend the commit: git commit --amend`);
            console.error(`    6. Push again: git push --force-with-lease`);
        }
        console.error("");
        console.error("  False positive? Add to .keysentinel.yml:");
        console.error("    allowlist:");
        console.error("      - 'YOUR_PATTERN_HERE'");
        console.error("");
        process.exit(1);
    }
    console.error(`  ⚠️  Secrets found but below "${failOn}" threshold. ${action === "commit" ? "Commit" : "Push"} allowed.`);
    console.error(`     Current threshold: ${failOn}. Adjust in .keysentinel.yml if needed.`);
    console.error("");
    process.exit(0);
}
function askQuestion(rl, question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer.trim());
        });
    });
}
async function cmdInit() {
    const cwd = process.cwd();
    const gitRoot = findGitRoot(cwd);
    if (!gitRoot) {
        console.error("keysentinel: not a git repository (or any parent). Run from a repo root.");
        process.exit(1);
    }
    const configPath = path.join(gitRoot, ".keysentinel.yml");
    if (fs.existsSync(configPath)) {
        console.log("⚠️  .keysentinel.yml already exists.");
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        const overwrite = await askQuestion(rl, "Overwrite? (y/N): ");
        rl.close();
        if (overwrite.toLowerCase() !== "y") {
            console.log("Aborted.");
            process.exit(0);
        }
    }
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    console.log("\n🔐 KeySentinel Configuration Wizard\n");
    console.log("This wizard will help you create a .keysentinel.yml config file.\n");
    // Security level selection
    console.log("📊 Security Level:");
    console.log("  1. Strict (fail_on: low)    - Maximum security, catches everything");
    console.log("  2. Balanced (fail_on: medium) - Good security with fewer false positives");
    console.log("  3. Relaxed (fail_on: high)    - Only high-confidence secrets (default)");
    console.log("  4. Off (fail_on: off)         - Detection only, never blocks\n");
    const securityChoice = await askQuestion(rl, "Choose security level (1-4) [3]: ");
    let failOn = "high";
    switch (securityChoice) {
        case "1":
            failOn = "low";
            break;
        case "2":
            failOn = "medium";
            break;
        case "3":
            failOn = "high";
            break;
        case "4":
            failOn = "off";
            break;
        default: failOn = "high";
    }
    // Post no findings
    const postNoFindings = await askQuestion(rl, "\n📢 Post 'no findings' comments in PRs? (Y/n) [Y]: ");
    const shouldPostNoFindings = postNoFindings.toLowerCase() !== "n";
    // Pattern groups
    console.log("\n🔍 Detection Patterns:");
    const patterns = {};
    const patternGroups = [
        { key: "aws", name: "AWS Keys" },
        { key: "github", name: "GitHub Tokens" },
        { key: "slack", name: "Slack Tokens" },
        { key: "stripe", name: "Stripe Keys" },
        { key: "google", name: "Google API Keys" },
        { key: "generic", name: "Generic API Keys" },
        { key: "keys", name: "Private Keys (RSA, SSH, PGP)" },
        { key: "database", name: "Database Connection Strings" },
        { key: "jwt", name: "JWT Secrets" },
        { key: "npm", name: "NPM Tokens" },
        { key: "discord", name: "Discord Tokens" },
        { key: "heroku", name: "Heroku API Keys" },
        { key: "twilio", name: "Twilio Keys" },
        { key: "sendgrid", name: "SendGrid Keys" },
        { key: "mailchimp", name: "Mailchimp Keys" },
    ];
    const enableAll = await askQuestion(rl, "Enable all pattern groups? (Y/n) [Y]: ");
    const enableAllPatterns = enableAll.toLowerCase() !== "n";
    for (const group of patternGroups) {
        patterns[group.key] = enableAllPatterns;
    }
    if (!enableAllPatterns) {
        console.log("\nSelect patterns to enable:");
        for (const group of patternGroups) {
            const enable = await askQuestion(rl, `  ${group.name}? (Y/n) [Y]: `);
            patterns[group.key] = enable.toLowerCase() !== "n";
        }
    }
    // Entropy detection
    console.log("\n🧠 Entropy Detection (catches unknown secret formats):");
    const enableEntropy = await askQuestion(rl, "Enable entropy detection? (Y/n) [Y]: ");
    const entropyEnabled = enableEntropy.toLowerCase() !== "n";
    // Ignore patterns
    console.log("\n📁 Files to Ignore:");
    const customIgnores = [];
    const addIgnores = await askQuestion(rl, "Add custom ignore patterns? (y/N) [N]: ");
    if (addIgnores.toLowerCase() === "y") {
        console.log("Enter patterns (press Enter twice to finish):");
        while (true) {
            const pattern = await askQuestion(rl, "  Pattern: ");
            if (!pattern)
                break;
            customIgnores.push(pattern);
        }
    }
    // Allowlist patterns
    console.log("\n✅ Allowlist Patterns (for false positives):");
    const customAllowlist = [];
    const addAllowlist = await askQuestion(rl, "Add allowlist patterns? (y/N) [N]: ");
    if (addAllowlist.toLowerCase() === "y") {
        console.log("Enter patterns (press Enter twice to finish):");
        console.log("  Examples: EXAMPLE_.*, test_.*, fake_.*");
        while (true) {
            const pattern = await askQuestion(rl, "  Pattern: ");
            if (!pattern)
                break;
            customAllowlist.push(pattern);
        }
    }
    rl.close();
    // Generate config file
    const configLines = [
        "# KeySentinel Configuration",
        "# Generated by keysentinel init",
        "",
        `# Security Level: ${failOn === "low" ? "Strict" : failOn === "medium" ? "Balanced" : failOn === "high" ? "Relaxed" : "Off"}`,
        `fail_on: ${failOn}`,
        "",
        "# Post comment even when no secrets found",
        `post_no_findings: ${shouldPostNoFindings}`,
        "",
        "# Maximum files to scan per PR",
        "max_files: 100",
        "",
    ];
    if (customIgnores.length > 0) {
        configLines.push("# Files to ignore (in addition to defaults)");
        configLines.push("ignore:");
        for (const ignore of customIgnores) {
            configLines.push(`  - "${ignore}"`);
        }
        configLines.push("");
    }
    if (customAllowlist.length > 0) {
        configLines.push("# Patterns to allowlist (regex)");
        configLines.push("allowlist:");
        for (const pattern of customAllowlist) {
            configLines.push(`  - "${pattern}"`);
        }
        configLines.push("");
    }
    configLines.push("# Enable/disable specific pattern groups");
    configLines.push("patterns:");
    for (const [key, enabled] of Object.entries(patterns)) {
        configLines.push(`  ${key}: ${enabled}`);
    }
    configLines.push("");
    configLines.push("# Entropy detection (catches unknown secret formats)");
    configLines.push("entropy:");
    configLines.push(`  enabled: ${entropyEnabled}`);
    configLines.push("  min_length: 20");
    configLines.push("  threshold: 4.2");
    configLines.push("  ignore_base64_like: true");
    fs.writeFileSync(configPath, configLines.join("\n"), "utf8");
    console.log("\n✅ Configuration saved to .keysentinel.yml");
    console.log("\nNext steps:");
    console.log("  1. Review the generated config file");
    console.log("  2. Install git hooks: keysentinel install");
    console.log("  3. Test with: keysentinel scan");
    console.log("");
}
function main() {
    const arg = process.argv[2];
    if (arg === "install") {
        cmdInstall();
        return;
    }
    if (arg === "init") {
        cmdInit().then(() => process.exit(0)).catch((e) => {
            console.error("Error:", e);
            process.exit(1);
        });
        return;
    }
    if (arg === "scan") {
        cmdScan();
        return;
    }
    if (arg === "scan-push") {
        cmdScanPush();
        return;
    }
    if (arg === undefined || arg === "") {
        cmdScan();
        return;
    }
    if (arg === "--help" || arg === "-h") {
        console.log(`KeySentinel CLI — block secrets locally

Usage:
  keysentinel init         Run configuration wizard
  keysentinel install      Install pre-commit and pre-push hooks
  keysentinel scan         Scan staged files for secrets (for pre-commit)
  keysentinel scan-push    Scan commits being pushed (for pre-push)
  keysentinel --help       Show this help

Config: .keysentinel.yml in repo root (same as GitHub Action).
`);
        process.exit(0);
    }
    console.error(`keysentinel: unknown command "${arg}". Use keysentinel --help.`);
    process.exit(1);
}
main();
