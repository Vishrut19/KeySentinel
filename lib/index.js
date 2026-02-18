"use strict";
/**
 * KeySentinel - GitHub Action for scanning PR diffs for secrets
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
const core = __importStar(require("@actions/core"));
const mask_1 = require("./mask");
const config_1 = require("./config");
const patterns_1 = require("./patterns");
const github_1 = require("./github");
const scanner_1 = require("./scanner");
async function run() {
    try {
        core.info('KeySentinel starting...');
        const config = (0, config_1.loadConfig)();
        core.debug(`Config: failOn=${config.failOn}, maxFiles=${config.maxFiles}`);
        const token = core.getInput('github_token', { required: true });
        const octokit = (0, github_1.createOctokit)(token);
        const prContext = (0, github_1.getPRContext)();
        if (!prContext) {
            core.warning('Not running in a pull request context. Skipping scan.');
            return;
        }
        const { owner, repo, pullNumber } = prContext;
        core.info(`Scanning PR #${pullNumber} in ${owner}/${repo}`);
        const files = await (0, github_1.getPRFiles)(octokit, owner, repo, pullNumber, config.maxFiles);
        core.info(`Found ${files.length} file(s) in PR`);
        if (files.length === 0) {
            core.info('No files to scan');
            return;
        }
        const patterns = (0, patterns_1.getEnabledPatterns)(config.patterns);
        const headSha = (0, github_1.getPRHeadSha)();
        const allFindings = [];
        let filesScanned = 0;
        let filesSkipped = 0;
        for (const file of files) {
            if (file.status === 'removed') {
                filesSkipped++;
                continue;
            }
            if ((0, config_1.shouldIgnoreFile)(file.filename, config.ignore)) {
                core.debug(`Ignoring file: ${file.filename}`);
                filesSkipped++;
                continue;
            }
            let addedLines = [];
            if (file.patch) {
                addedLines = (0, scanner_1.extractAddedLines)(file.patch);
            }
            else {
                core.debug(`No patch for ${file.filename}, fetching content`);
                const content = await (0, github_1.getFileContent)(octokit, owner, repo, file.filename, headSha);
                if (content) {
                    const lines = content.split('\n');
                    addedLines = lines.map((line, i) => ({ line, lineNumber: i + 1 }));
                }
            }
            if (addedLines.length === 0) {
                filesSkipped++;
                continue;
            }
            const fileFindings = (0, scanner_1.scanLines)(file.filename, addedLines, config, patterns);
            allFindings.push(...fileFindings);
            filesScanned++;
        }
        core.info(`Scanned ${filesScanned} file(s), skipped ${filesSkipped} file(s)`);
        core.info(`Found ${allFindings.length} potential secret(s)`);
        core.setOutput('secrets_found', allFindings.length.toString());
        const safeFindings = allFindings.map(f => ({
            file: f.file,
            line: f.line,
            type: f.type,
            severity: f.severity,
            confidence: f.confidence,
            snippet: f.snippet,
        }));
        core.setOutput('findings', JSON.stringify(safeFindings));
        if (allFindings.length > 0) {
            const report = (0, scanner_1.generateReport)(allFindings, filesScanned);
            await (0, github_1.upsertComment)(octokit, owner, repo, pullNumber, report);
        }
        else if (config.postNoFindings) {
            const report = (0, scanner_1.generateReport)([], filesScanned);
            await (0, github_1.upsertComment)(octokit, owner, repo, pullNumber, report);
        }
        else {
            await (0, github_1.deleteExistingComment)(octokit, owner, repo, pullNumber);
        }
        if ((0, scanner_1.shouldFail)(allFindings, config.failOn)) {
            for (const finding of allFindings) {
                core.warning(`${finding.severity.toUpperCase()}: ${finding.type} in ${finding.file}:${finding.line ?? 'N/A'} - ${(0, mask_1.maskSecret)(finding.rawValue)}`);
            }
            core.setFailed(`KeySentinel found ${allFindings.length} potential secret(s) at or above "${config.failOn}" severity`);
        }
        core.info('KeySentinel completed');
    }
    catch (error) {
        if (error instanceof Error) {
            core.setFailed(`KeySentinel failed: ${error.message}`);
        }
        else {
            core.setFailed('KeySentinel failed with an unknown error');
        }
    }
}
run();
