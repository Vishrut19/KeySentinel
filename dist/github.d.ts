/**
 * GitHub API wrapper for KeySentinel
 */
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
export declare function createOctokit(token: string): Octokit;
/**
 * Get PR context from the event
 */
export declare function getPRContext(): {
    owner: string;
    repo: string;
    pullNumber: number;
} | null;
/**
 * Fetch files changed in a PR
 */
export declare function getPRFiles(octokit: Octokit, owner: string, repo: string, pullNumber: number, maxFiles: number): Promise<PullRequestFile[]>;
/**
 * Fetch file content at a specific ref
 */
export declare function getFileContent(octokit: Octokit, owner: string, repo: string, path: string, ref: string): Promise<string | null>;
/**
 * Find existing KeySentinel comment on PR
 */
export declare function findExistingComment(octokit: Octokit, owner: string, repo: string, pullNumber: number): Promise<CommentInfo | null>;
/**
 * Create or update PR comment
 */
export declare function upsertComment(octokit: Octokit, owner: string, repo: string, pullNumber: number, body: string): Promise<void>;
/**
 * Delete existing KeySentinel comment if present
 */
export declare function deleteExistingComment(octokit: Octokit, owner: string, repo: string, pullNumber: number): Promise<boolean>;
/**
 * Get the PR head SHA
 */
export declare function getPRHeadSha(): string;
