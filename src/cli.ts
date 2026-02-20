#!/usr/bin/env node
/**
 * KeySentinel CLI - pre-commit hook and local scan
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { loadConfigForCli, shouldIgnoreFile } from './config';
import { getEnabledPatterns } from './patterns';
import {
  extractAddedLines,
  scanLines,
  shouldFail,
} from './scanner';
import { maskSecret } from './mask';
import type { Finding } from './patterns';

const GIT_HOOK = `#!/bin/sh
echo "🔍 KeySentinel scanning for secrets..."

if command -v keysentinel >/dev/null 2>&1; then
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

function findGitRoot(cwd: string): string | null {
  let dir = path.resolve(cwd);
  for (;;) {
    const gitDir = path.join(dir, '.git');
    if (fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory()) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function runGit(cwd: string, args: string[]): string {
  return execSync(`git ${args.join(' ')}`, {
    encoding: 'utf8',
    cwd,
  }).trim();
}

function cmdInstall(): void {
  const cwd = process.cwd();
  const gitRoot = findGitRoot(cwd);
  if (!gitRoot) {
    console.error('keysentinel: not a git repository (or any parent). Run from a repo root.');
    process.exit(1);
  }
  const hooksDir = path.join(gitRoot, '.git', 'hooks');
  if (!fs.existsSync(hooksDir)) {
    console.error('keysentinel: .git/hooks directory not found.');
    process.exit(1);
  }
  
  const preCommitPath = path.join(hooksDir, 'pre-commit');
  const prePushPath = path.join(hooksDir, 'pre-push');
  
  fs.writeFileSync(preCommitPath, GIT_HOOK, 'utf8');
  fs.chmodSync(preCommitPath, 0o755);
  
  fs.writeFileSync(prePushPath, GIT_HOOK, 'utf8');
  fs.chmodSync(prePushPath, 0o755);
  
  console.log('Pre-commit hook installed at .git/hooks/pre-commit');
  console.log('Pre-push hook installed at .git/hooks/pre-push');
}

function cmdScan(): void {
  const cwd = process.cwd();
  const gitRoot = findGitRoot(cwd);
  if (!gitRoot) {
    console.error('keysentinel: not a git repository. Run from a repo root.');
    process.exit(1);
  }

  let fileList: string[];
  try {
    const out = runGit(gitRoot, ['diff', '--cached', '--name-only']);
    fileList = out ? out.split('\n').map((f) => f.trim()).filter(Boolean) : [];
  } catch (e) {
    console.error('keysentinel: failed to get staged files:', (e as Error).message);
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
      patch = runGit(gitRoot, ['diff', '--cached', '--', filePath]);
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
    console.log(`KeySentinel: No secrets detected (scanned ${filesScanned} file(s)).`);
    process.exit(0);
  }

  // Terminal-friendly report
  const highCount = allFindings.filter((f) => f.severity === 'high').length;
  const mediumCount = allFindings.filter((f) => f.severity === 'medium').length;
  const lowCount = allFindings.filter((f) => f.severity === 'low').length;
  console.error('');
  console.error('KeySentinel found potential secret(s) in staged changes:');
  console.error(`  High: ${highCount}, Medium: ${mediumCount}, Low: ${lowCount}`);
  console.error('');
  for (const f of allFindings) {
    const sev = f.severity.toUpperCase();
    const line = f.line != null ? String(f.line) : '?';
    const snippet = f.snippet.replace(/\n/g, ' ');
    console.error(`  [${sev}] ${f.file}:${line} — ${f.type}`);
    console.error(`      ${snippet}`);
    console.error(`      (raw masked: ${maskSecret(f.rawValue)})`);
  }
  console.error('');
  console.error('Remove or allowlist these before committing. See .keysentinel.yml allowlist.');
  console.error('');

  if (shouldFail(allFindings, config.failOn)) {
    process.exit(1);
  }
  process.exit(0);
}

function main(): void {
  const arg = process.argv[2];
  if (arg === 'install') {
    cmdInstall();
    return;
  }
  if (arg === 'scan' || arg === undefined || arg === '') {
    cmdScan();
    return;
  }
  if (arg === '--help' || arg === '-h') {
    console.log(`KeySentinel CLI — block secrets locally

Usage:
  keysentinel install    Install pre-commit and pre-push hooks (scans staged files)
  keysentinel scan       Scan staged files for secrets (default)
  keysentinel --help     Show this help

Config: .keysentinel.yml in repo root (same as GitHub Action).
`);
    process.exit(0);
  }
  console.error(`keysentinel: unknown command "${arg}". Use keysentinel --help.`);
  process.exit(1);
}

main();
