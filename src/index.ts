/**
 * KeySentinel - GitHub Action for scanning PR diffs for secrets
 */

import * as core from '@actions/core';
import { maskSecret } from './mask';
import { loadConfig, shouldIgnoreFile } from './config';
import { getEnabledPatterns } from './patterns';
import {
  createOctokit,
  getPRContext,
  getPRFiles,
  getFileContent,
  upsertComment,
  deleteExistingComment,
  getPRHeadSha,
} from './github';
import {
  extractAddedLines,
  scanLines,
  generateReport,
  shouldFail,
} from './scanner';

async function run(): Promise<void> {
  try {
    core.info('KeySentinel starting...');

    const config = loadConfig();
    core.debug(`Config: failOn=${config.failOn}, maxFiles=${config.maxFiles}`);

    const token = core.getInput('github_token', { required: true });
    const octokit = createOctokit(token);

    const prContext = getPRContext();
    if (!prContext) {
      core.warning('Not running in a pull request context. Skipping scan.');
      return;
    }

    const { owner, repo, pullNumber } = prContext;
    core.info(`Scanning PR #${pullNumber} in ${owner}/${repo}`);

    const files = await getPRFiles(octokit, owner, repo, pullNumber, config.maxFiles);
    core.info(`Found ${files.length} file(s) in PR`);

    if (files.length === 0) {
      core.info('No files to scan');
      return;
    }

    const patterns = getEnabledPatterns(config.patterns);
    const headSha = getPRHeadSha();
    const allFindings = [];
    let filesScanned = 0;
    let filesSkipped = 0;

    for (const file of files) {
      if (file.status === 'removed') {
        filesSkipped++;
        continue;
      }

      if (shouldIgnoreFile(file.filename, config.ignore)) {
        core.debug(`Ignoring file: ${file.filename}`);
        filesSkipped++;
        continue;
      }

      let addedLines: { line: string; lineNumber: number }[] = [];

      if (file.patch) {
        addedLines = extractAddedLines(file.patch);
      } else {
        core.debug(`No patch for ${file.filename}, fetching content`);
        const content = await getFileContent(octokit, owner, repo, file.filename, headSha);
        if (content) {
          const lines = content.split('\n');
          addedLines = lines.map((line, i) => ({ line, lineNumber: i + 1 }));
        }
      }

      if (addedLines.length === 0) {
        filesSkipped++;
        continue;
      }

      const fileFindings = scanLines(file.filename, addedLines, config, patterns);
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
      const report = generateReport(allFindings, filesScanned);
      await upsertComment(octokit, owner, repo, pullNumber, report);
    } else if (config.postNoFindings) {
      const report = generateReport([], filesScanned);
      await upsertComment(octokit, owner, repo, pullNumber, report);
    } else {
      await deleteExistingComment(octokit, owner, repo, pullNumber);
    }

    if (shouldFail(allFindings, config.failOn)) {
      for (const finding of allFindings) {
        core.warning(
          `${finding.severity.toUpperCase()}: ${finding.type} in ${finding.file}:${finding.line ?? 'N/A'} - ${maskSecret(finding.rawValue)}`
        );
      }
      core.setFailed(
        `KeySentinel found ${allFindings.length} potential secret(s) at or above "${config.failOn}" severity`
      );
    }

    core.info('KeySentinel completed');
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`KeySentinel failed: ${error.message}`);
    } else {
      core.setFailed('KeySentinel failed with an unknown error');
    }
  }
}

run();
