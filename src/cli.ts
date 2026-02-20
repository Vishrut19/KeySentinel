#!/usr/bin/env node
/**
 * KeySentinel CLI - pre-commit hook and local scan
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { loadConfigForCli, shouldIgnoreFile } from "./config";
import { getEnabledPatterns } from "./patterns";
import { extractAddedLines, scanLines, shouldFail } from "./scanner";
import { maskSecret } from "./mask";
import type { Finding } from "./patterns";

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

function findGitRoot(cwd: string): string | null {
  let dir = path.resolve(cwd);
  for (;;) {
    const gitDir = path.join(dir, ".git");
    if (fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory()) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function runGit(cwd: string, args: string[]): string {
  return execSync(`git ${args.join(" ")}`, {
    encoding: "utf8",
    cwd,
  }).trim();
}

function cmdInstall(): void {
  const cwd = process.cwd();
  const gitRoot = findGitRoot(cwd);
  if (!gitRoot) {
    console.error(
      "keysentinel: not a git repository (or any parent). Run from a repo root.",
    );
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

function cmdScan(): void {
  const cwd = process.cwd();
  const gitRoot = findGitRoot(cwd);
  if (!gitRoot) {
    console.error("keysentinel: not a git repository. Run from a repo root.");
    process.exit(1);
  }

  let fileList: string[];
  try {
    const out = runGit(gitRoot, ["diff", "--cached", "--name-only"]);
    fileList = out
      ? out
          .split("\n")
          .map((f) => f.trim())
          .filter(Boolean)
      : [];
  } catch (e) {
    console.error(
      "keysentinel: failed to get staged files:",
      (e as Error).message,
    );
    process.exit(1);
  }

  const config = loadConfigForCli({ cwd: gitRoot });
  const patterns = getEnabledPatterns(config.patterns);
  const allFindings: Finding[] = [];
  let filesScanned = 0;

  for (const filePath of fileList) {
    if (shouldIgnoreFile(filePath, config.ignore)) continue;

    let patch: string;
    try {
      patch = runGit(gitRoot, ["diff", "--cached", "--", filePath]);
    } catch {
      continue;
    }

    const addedLines = extractAddedLines(patch);
    if (addedLines.length === 0) continue;

    const fileFindings = scanLines(filePath, addedLines, config, patterns);
    allFindings.push(...fileFindings);
    filesScanned++;
  }

  if (allFindings.length === 0) {
    console.log(
      `KeySentinel: No secrets detected (scanned ${filesScanned} file(s)).`,
    );
    process.exit(0);
  }

  // Terminal-friendly report
  const highCount = allFindings.filter((f) => f.severity === "high").length;
  const mediumCount = allFindings.filter((f) => f.severity === "medium").length;
  const lowCount = allFindings.filter((f) => f.severity === "low").length;
  console.error("");
  console.error("KeySentinel found potential secret(s) in staged changes:");
  console.error(
    `  High: ${highCount}, Medium: ${mediumCount}, Low: ${lowCount}`,
  );
  console.error("");
  for (const f of allFindings) {
    const sev = f.severity.toUpperCase();
    const line = f.line != null ? String(f.line) : "?";
    const snippet = f.snippet.replace(/\n/g, " ");
    console.error(`  [${sev}] ${f.file}:${line} — ${f.type}`);
    console.error(`      ${snippet}`);
    console.error(`      (raw masked: ${maskSecret(f.rawValue)})`);
  }
  console.error("");
  console.error(
    "Remove or allowlist these before committing. See .keysentinel.yml allowlist.",
  );
  console.error("");

  if (shouldFail(allFindings, config.failOn)) {
    process.exit(1);
  }
  
  // If secrets found but below threshold, still warn but don't block
  console.error("⚠️  Secrets found but below 'fail_on' threshold. Commit allowed.");
  console.error(`   Current threshold: ${config.failOn}. Adjust in .keysentinel.yml if needed.`);
  process.exit(0);
}

function cmdScanPush(): void {
  const cwd = process.cwd();
  const gitRoot = findGitRoot(cwd);
  if (!gitRoot) {
    console.error("keysentinel: not a git repository. Run from a repo root.");
    process.exit(1);
  }

  // Git pre-push hook passes refs on stdin: "local_ref local_sha remote_ref remote_sha" per line
  let commitsToScan: string[] = [];
  
  try {
    let stdinInput: string;
    try {
      stdinInput = fs.readFileSync(process.stdin.fd, "utf8").trim();
    } catch {
      stdinInput = "";
    }
    const lines = stdinInput ? stdinInput.split("\n").filter(Boolean) : [];

    if (lines.length > 0) {
      for (const line of lines) {
        const parts = line.split(/\s+/);
        const localSha = parts[1];
        const remoteSha = parts[3];
        if (!localSha || localSha.length !== 40) continue;

        if (!remoteSha || remoteSha === "0".repeat(40)) {
          const commits = runGit(gitRoot, ["rev-list", localSha]);
          if (commits) {
            commitsToScan.push(...commits.split("\n").filter(Boolean));
          }
        } else {
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
      let compareBase: string | null = null;
      try {
        runGit(gitRoot, ["rev-parse", "--verify", remoteBranch]);
        compareBase = remoteBranch;
      } catch {
        try {
          runGit(gitRoot, ["rev-parse", "--verify", `${remoteName}/main`]);
          compareBase = `${remoteName}/main`;
        } catch {
          try {
            runGit(gitRoot, ["rev-parse", "--verify", `${remoteName}/master`]);
            compareBase = `${remoteName}/master`;
          } catch {
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
  } catch (e) {
    console.error("keysentinel: failed to get commits being pushed:", (e as Error).message);
    process.exit(1);
  }

  const config = loadConfigForCli({ cwd: gitRoot });
  const patterns = getEnabledPatterns(config.patterns);
  const allFindings: Finding[] = [];
  let filesScanned = 0;

  // Scan each commit's changes
  for (const commitSha of commitsToScan) {
    try {
      // Get files changed in this commit
      const files = runGit(gitRoot, ["diff-tree", "--no-commit-id", "--name-only", "-r", commitSha]);
      const fileList = files ? files.split("\n").map((f) => f.trim()).filter(Boolean) : [];
      
      for (const filePath of fileList) {
        if (shouldIgnoreFile(filePath, config.ignore)) continue;
        
        // Get the diff for this file in this commit
        const patch = runGit(gitRoot, ["show", "--format=", commitSha, "--", filePath]);
        const addedLines = extractAddedLines(patch);
        
        if (addedLines.length === 0) continue;
        
        const fileFindings = scanLines(filePath, addedLines, config, patterns);
        allFindings.push(...fileFindings);
        filesScanned++;
      }
    } catch (e) {
      // Skip commits that can't be accessed
      continue;
    }
  }

  if (allFindings.length === 0) {
    console.log(
      `KeySentinel: No secrets detected in ${commitsToScan.length} commit(s) being pushed.`,
    );
    process.exit(0);
  }

  // Terminal-friendly report
  const highCount = allFindings.filter((f) => f.severity === "high").length;
  const mediumCount = allFindings.filter((f) => f.severity === "medium").length;
  const lowCount = allFindings.filter((f) => f.severity === "low").length;
  console.error("");
  console.error(`KeySentinel found potential secret(s) in ${commitsToScan.length} commit(s) being pushed:`);
  console.error(
    `  High: ${highCount}, Medium: ${mediumCount}, Low: ${lowCount}`,
  );
  console.error("");
  for (const f of allFindings) {
    const sev = f.severity.toUpperCase();
    const line = f.line != null ? String(f.line) : "?";
    const snippet = f.snippet.replace(/\n/g, " ");
    console.error(`  [${sev}] ${f.file}:${line} — ${f.type}`);
    console.error(`      ${snippet}`);
    console.error(`      (raw masked: ${maskSecret(f.rawValue)})`);
  }
  console.error("");
  console.error(
    "Remove or allowlist these before pushing. See .keysentinel.yml allowlist.",
  );
  console.error("");

  if (shouldFail(allFindings, config.failOn)) {
    process.exit(1);
  }
  
  console.error("⚠️  Secrets found but below 'fail_on' threshold. Push allowed.");
  console.error(`   Current threshold: ${config.failOn}. Adjust in .keysentinel.yml if needed.`);
  process.exit(0);
}

function main(): void {
  const arg = process.argv[2];
  if (arg === "install") {
    cmdInstall();
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
  keysentinel install      Install pre-commit and pre-push hooks
  keysentinel scan         Scan staged files for secrets (for pre-commit)
  keysentinel scan-push    Scan commits being pushed (for pre-push)
  keysentinel --help       Show this help

Config: .keysentinel.yml in repo root (same as GitHub Action).
`);
    process.exit(0);
  }
  console.error(
    `keysentinel: unknown command "${arg}". Use keysentinel --help.`,
  );
  process.exit(1);
}

main();
