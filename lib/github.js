"use strict";
/**
 * GitHub API wrapper for KeySentinel
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
exports.createOctokit = createOctokit;
exports.getPRContext = getPRContext;
exports.getPRFiles = getPRFiles;
exports.getFileContent = getFileContent;
exports.findExistingComment = findExistingComment;
exports.upsertComment = upsertComment;
exports.deleteExistingComment = deleteExistingComment;
exports.getPRHeadSha = getPRHeadSha;
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const COMMENT_MARKER = '<!-- keysentinel:comment -->';
function createOctokit(token) {
    return github.getOctokit(token);
}
/**
 * Get PR context from the event
 */
function getPRContext() {
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
async function getPRFiles(octokit, owner, repo, pullNumber, maxFiles) {
    const files = [];
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
            files.push(...response.data);
            if (response.data.length < perPage) {
                break;
            }
            page++;
        }
        catch (error) {
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
async function getFileContent(octokit, owner, repo, path, ref) {
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
    }
    catch (error) {
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
async function findExistingComment(octokit, owner, repo, pullNumber) {
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
    }
    catch (error) {
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
async function upsertComment(octokit, owner, repo, pullNumber, body) {
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
        }
        else {
            await octokit.rest.issues.createComment({
                owner,
                repo,
                issue_number: pullNumber,
                body: fullBody,
            });
            core.info('Created new comment');
        }
    }
    catch (error) {
        if (isRateLimitError(error)) {
            core.warning('Rate limit hit while posting comment, waiting...');
            await sleep(60000);
            return upsertComment(octokit, owner, repo, pullNumber, body);
        }
        if (isPermissionError(error)) {
            const status = getErrorStatus(error);
            core.error(`HTTP ${status}: Insufficient permissions to comment. ` +
                'Enable "Actions: write" permission in Settings > Actions > General > Workflow permissions.');
            return;
        }
        throw error;
    }
}
/**
 * Delete existing KeySentinel comment if present
 */
async function deleteExistingComment(octokit, owner, repo, pullNumber) {
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
        }
        catch (error) {
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
function getPRHeadSha() {
    const context = github.context;
    return context.payload.pull_request?.head?.sha || context.sha;
}
function isRateLimitError(error) {
    if (error && typeof error === 'object' && 'status' in error) {
        // 429 = Too Many Requests (rate limit)
        // 403 with rate limit message = Secondary rate limit
        const status = error.status;
        if (status === 429)
            return true;
        if (status === 403) {
            // Check if it's actually a rate limit or a permissions issue
            const message = String(error.message || '');
            return message.toLowerCase().includes('rate') || message.toLowerCase().includes('limit');
        }
    }
    return false;
}
function isPermissionError(error) {
    if (error && typeof error === 'object' && 'status' in error) {
        const status = error.status;
        return status === 401 || status === 403;
    }
    return false;
}
function getErrorStatus(error) {
    if (error && typeof error === 'object' && 'status' in error) {
        return error.status;
    }
    return null;
}
function isNotFoundError(error) {
    if (error && typeof error === 'object' && 'status' in error) {
        return error.status === 404;
    }
    return false;
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
