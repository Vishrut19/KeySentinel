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
const config_1 = require("./config");
const patterns_1 = require("./patterns");
const scanner_1 = require("./scanner");
const mask_1 = require("./mask");
const PRE_COMMIT_HOOK = `#!/bin/sh
# KeySentinel pre-commit hook - scan staged changes for secrets
npx keysentinel scan
exit $?
`;
function findGitRoot(cwd) {
    let dir = path.resolve(cwd);
    for (;;) {
        const gitDir = path.join(dir, '.git');
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
    return (0, child_process_1.execSync)(`git ${args.join(' ')}`, {
        encoding: 'utf8',
        cwd,
    }).trim();
}
function cmdInstall() {
    const cwd = process.cwd();
    const gitRoot = findGitRoot(cwd);
    if (!gitRoot) {
        console.error('keysentinel: not a git repository (or any parent). Run from a repo root.');
        process.exit(1);
    }
    const hooksDir = path.join(gitRoot, '.git', 'hooks');
    const hookPath = path.join(hooksDir, 'pre-commit');
    if (!fs.existsSync(hooksDir)) {
        console.error('keysentinel: .git/hooks directory not found.');
        process.exit(1);
    }
    fs.writeFileSync(hookPath, PRE_COMMIT_HOOK, 'utf8');
    fs.chmodSync(hookPath, 0o755);
    console.log('Pre-commit hook installed at .git/hooks/pre-commit');
}
function cmdScan() {
    const cwd = process.cwd();
    const gitRoot = findGitRoot(cwd);
    if (!gitRoot) {
        console.error('keysentinel: not a git repository. Run from a repo root.');
        process.exit(1);
    }
    let fileList;
    try {
        const out = runGit(gitRoot, ['diff', '--cached', '--name-only']);
        fileList = out ? out.split('\n').map((f) => f.trim()).filter(Boolean) : [];
    }
    catch (e) {
        console.error('keysentinel: failed to get staged files:', e.message);
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
            patch = runGit(gitRoot, ['diff', '--cached', '--', filePath]);
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
        console.error(`      (raw masked: ${(0, mask_1.maskSecret)(f.rawValue)})`);
    }
    console.error('');
    console.error('Remove or allowlist these before committing. See .keysentinel.yml allowlist.');
    console.error('');
    if ((0, scanner_1.shouldFail)(allFindings, config.failOn)) {
        process.exit(1);
    }
    process.exit(0);
}
function main() {
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
  keysentinel install    Install pre-commit hook (scans staged files on commit)
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
