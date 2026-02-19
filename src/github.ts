/**
 * GitHub API wrapper for KeySentinel
 */

import * as core from '@actions/core';
import * as github from '@actions/github';

export type Octokit = ReturnType<typeof github.getOctokit>;

export interface PullRequestFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  sha: string;
  blob_url: string;
  raw_url: string;
  contents_url: string;
}

export interface CommentInfo {
  id: number;
  body: string;
}

const COMMENT_MARKER = '<!-- keysentinel:comment -->';

export function createOctokit(token: string): Octokit {
  return github.getOctokit(token);
}

/**
 * Get PR context from the event
 */
export function getPRContext(): { owner: string; repo: string; pullNumber: number } | null {
  const context = github.context;

  if (!context.payload.pull_request) {
    return null;
  }

  return {
    owner: context.repo.owner,
    repo: context.repo.repo,
    pullNumber: context.payload.pull_request.number,
  };
}

/**
 * Fetch files changed in a PR
 */
export async function getPRFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  maxFiles: number
): Promise<PullRequestFile[]> {
  const files: PullRequestFile[] = [];
  let page = 1;
  const perPage = 100;

  while (files.length < maxFiles) {
    try {
      const response = await octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: pullNumber,
        page,
        per_page: perPage,
      });

      if (response.data.length === 0) {
        break;
      }

      files.push(...response.data as PullRequestFile[]);

      if (response.data.length < perPage) {
        break;
      }

      page++;
    } catch (error: unknown) {
      if (isRateLimitError(error)) {
        core.warning('Rate limit hit while fetching PR files, waiting...');
        await sleep(60000);
        continue;
      }
      throw error;
    }
  }

  return files.slice(0, maxFiles);
}

/**
 * Fetch file content at a specific ref
 */
export async function getFileContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<string | null> {
  try {
    const response = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if ('content' in response.data && response.data.type === 'file') {
      const content = Buffer.from(response.data.content, 'base64').toString('utf8');
      return content;
    }

    return null;
  } catch (error: unknown) {
    if (isNotFoundError(error)) {
      core.debug(`File not found: ${path}`);
      return null;
    }
    if (isRateLimitError(error)) {
      core.warning('Rate limit hit while fetching file content, waiting...');
      await sleep(60000);
      return getFileContent(octokit, owner, repo, path, ref);
    }
    throw error;
  }
}

/**
 * Find existing KeySentinel comment on PR
 */
export async function findExistingComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<CommentInfo | null> {
  try {
    const comments = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: pullNumber,
      per_page: 100,
    });

    for (const comment of comments.data) {
      if (comment.body?.includes(COMMENT_MARKER)) {
        return {
          id: comment.id,
          body: comment.body,
        };
      }
    }

    return null;
  } catch (error: unknown) {
    if (isRateLimitError(error)) {
      core.warning('Rate limit hit while fetching comments, waiting...');
      await sleep(60000);
      return findExistingComment(octokit, owner, repo, pullNumber);
    }
    throw error;
  }
}

/**
 * Create or update PR comment
 */
export async function upsertComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  body: string
): Promise<void> {
  const fullBody = `${COMMENT_MARKER}\n${body}`;

  const existingComment = await findExistingComment(octokit, owner, repo, pullNumber);

  try {
    if (existingComment) {
      await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: existingComment.id,
        body: fullBody,
      });
      core.info(`Updated existing comment #${existingComment.id}`);
    } else {
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: pullNumber,
        body: fullBody,
      });
      core.info('Created new comment');
    }
  } catch (error: unknown) {
    if (isRateLimitError(error)) {
      core.warning('Rate limit hit while posting comment, waiting...');
      await sleep(60000);
      return upsertComment(octokit, owner, repo, pullNumber, body);
    }
    if (isPermissionError(error)) {
      const status = getErrorStatus(error);
      core.error(
        `HTTP ${status}: Insufficient permissions to comment. ` +
        'Enable "Actions: write" permission in Settings > Actions > General > Workflow permissions.'
      );
      return;
    }
    throw error;
  }
}

/**
 * Delete existing KeySentinel comment if present
 */
export async function deleteExistingComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<boolean> {
  const existingComment = await findExistingComment(octokit, owner, repo, pullNumber);

  if (existingComment) {
    try {
      await octokit.rest.issues.deleteComment({
        owner,
        repo,
        comment_id: existingComment.id,
      });
      core.info(`Deleted existing comment #${existingComment.id}`);
      return true;
    } catch (error: unknown) {
      if (isRateLimitError(error)) {
        core.warning('Rate limit hit while deleting comment, waiting...');
        await sleep(60000);
        return deleteExistingComment(octokit, owner, repo, pullNumber);
      }
      throw error;
    }
  }

  return false;
}

/**
 * Get the PR head SHA
 */
export function getPRHeadSha(): string {
  const context = github.context;
  return context.payload.pull_request?.head?.sha || context.sha;
}

function isRateLimitError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    // 429 = Too Many Requests (rate limit)
    // 403 with rate limit message = Secondary rate limit
    const status = (error as { status: number }).status;
    if (status === 429) return true;
    if (status === 403) {
      // Check if it's actually a rate limit or a permissions issue
      const message = String((error as { message?: string }).message || '');
      return message.toLowerCase().includes('rate') || message.toLowerCase().includes('limit');
    }
  }
  return false;
}

function isPermissionError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;
    return status === 401 || status === 403;
  }
  return false;
}

function getErrorStatus(error: unknown): number | null {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status: number }).status;
  }
  return null;
}

function isNotFoundError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as { status: number }).status === 404;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
