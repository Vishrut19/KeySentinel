"use strict";
/**
 * Configuration handling for KeySentinel
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
exports.loadConfig = loadConfig;
exports.shouldIgnoreFile = shouldIgnoreFile;
exports.isAllowlisted = isAllowlisted;
const core = __importStar(require("@actions/core"));
const fs = __importStar(require("fs"));
const yaml = __importStar(require("js-yaml"));
const DEFAULT_IGNORE = [
    'node_modules/**',
    'dist/**',
    'build/**',
    'vendor/**',
    '*.min.js',
    '*.min.css',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    '*.lock',
    '*.map',
    '.git/**',
    'coverage/**',
    '__pycache__/**',
    '*.pyc',
    '.env.example',
    '.env.sample',
    '*.md',
    'LICENSE*',
    'CHANGELOG*',
];
const DEFAULT_ENTROPY_CONFIG = {
    enabled: true,
    minLength: 20,
    threshold: 4.2,
    ignoreBase64Like: true,
};
function parseSeverity(value) {
    const normalized = value.toLowerCase().trim();
    if (['high', 'medium', 'low', 'off'].includes(normalized)) {
        return normalized;
    }
    core.warning(`Invalid fail_on value "${value}", defaulting to "high"`);
    return 'high';
}
function parseIgnoreGlobs(input) {
    if (!input || input.trim() === '')
        return [];
    return input.split(',').map(s => s.trim()).filter(s => s.length > 0);
}
function parseAllowlistPatterns(input) {
    if (!input || input.trim() === '')
        return [];
    const patterns = [];
    const parts = input.split(',').map(s => s.trim()).filter(s => s.length > 0);
    for (const part of parts) {
        try {
            patterns.push(new RegExp(part, 'gi'));
        }
        catch (e) {
            core.warning(`Invalid allowlist regex "${part}": ${e}`);
        }
    }
    return patterns;
}
function loadYamlConfig(configPath) {
    try {
        if (!fs.existsSync(configPath)) {
            core.debug(`Config file not found at ${configPath}`);
            return null;
        }
        const content = fs.readFileSync(configPath, 'utf8');
        const parsed = yaml.load(content);
        if (!parsed || typeof parsed !== 'object') {
            core.warning(`Invalid config file at ${configPath}`);
            return null;
        }
        core.info(`Loaded config from ${configPath}`);
        return parsed;
    }
    catch (e) {
        core.warning(`Failed to load config file ${configPath}: ${e}`);
        return null;
    }
}
function loadConfig() {
    // Load action inputs
    const inputFailOn = core.getInput('fail_on') || 'high';
    const inputPostNoFindings = core.getInput('post_no_findings') === 'true';
    const inputIgnore = core.getInput('ignore');
    const inputAllowlist = core.getInput('allowlist');
    const inputMaxFiles = parseInt(core.getInput('max_files') || '100', 10);
    const configPath = core.getInput('config_path') || '.keysentinel.yml';
    // Start with defaults
    let config = {
        failOn: parseSeverity(inputFailOn),
        postNoFindings: inputPostNoFindings,
        ignore: [...DEFAULT_IGNORE, ...parseIgnoreGlobs(inputIgnore)],
        allowlist: parseAllowlistPatterns(inputAllowlist),
        maxFiles: inputMaxFiles,
        patterns: {},
        entropy: { ...DEFAULT_ENTROPY_CONFIG },
    };
    // Load YAML config file if exists (overrides defaults, but action inputs take precedence)
    const yamlConfig = loadYamlConfig(configPath);
    if (yamlConfig) {
        // YAML config overrides defaults
        if (yamlConfig.fail_on !== undefined && !core.getInput('fail_on')) {
            config.failOn = parseSeverity(yamlConfig.fail_on);
        }
        if (yamlConfig.post_no_findings !== undefined && !core.getInput('post_no_findings')) {
            config.postNoFindings = yamlConfig.post_no_findings;
        }
        if (yamlConfig.ignore && Array.isArray(yamlConfig.ignore)) {
            config.ignore = [...DEFAULT_IGNORE, ...yamlConfig.ignore];
        }
        if (yamlConfig.allowlist && Array.isArray(yamlConfig.allowlist)) {
            const yamlPatterns = [];
            for (const pattern of yamlConfig.allowlist) {
                try {
                    yamlPatterns.push(new RegExp(pattern, 'gi'));
                }
                catch (e) {
                    core.warning(`Invalid allowlist regex in config "${pattern}": ${e}`);
                }
            }
            config.allowlist = [...config.allowlist, ...yamlPatterns];
        }
        if (yamlConfig.max_files !== undefined && !core.getInput('max_files')) {
            config.maxFiles = yamlConfig.max_files;
        }
        if (yamlConfig.patterns) {
            config.patterns = yamlConfig.patterns;
        }
        if (yamlConfig.entropy) {
            config.entropy = {
                enabled: yamlConfig.entropy.enabled ?? DEFAULT_ENTROPY_CONFIG.enabled,
                minLength: yamlConfig.entropy.min_length ?? DEFAULT_ENTROPY_CONFIG.minLength,
                threshold: yamlConfig.entropy.threshold ?? DEFAULT_ENTROPY_CONFIG.threshold,
                ignoreBase64Like: yamlConfig.entropy.ignore_base64_like ?? DEFAULT_ENTROPY_CONFIG.ignoreBase64Like,
            };
        }
    }
    // Overlay action inputs over YAML (action inputs take final precedence if explicitly set)
    if (inputIgnore) {
        config.ignore = [...DEFAULT_IGNORE, ...parseIgnoreGlobs(inputIgnore)];
    }
    if (inputAllowlist) {
        config.allowlist = parseAllowlistPatterns(inputAllowlist);
    }
    return config;
}
/**
 * Check if a file path matches any ignore glob
 */
function shouldIgnoreFile(filePath, ignorePatterns) {
    for (const pattern of ignorePatterns) {
        if (matchGlob(filePath, pattern)) {
            return true;
        }
    }
    return false;
}
/**
 * Simple glob matching (supports * and **)
 */
function matchGlob(path, pattern) {
    // Normalize path separators
    const normalizedPath = path.replace(/\\/g, '/');
    const normalizedPattern = pattern.replace(/\\/g, '/');
    // Convert glob to regex
    let regexStr = normalizedPattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
        .replace(/\*\*/g, '{{GLOBSTAR}}') // Placeholder for **
        .replace(/\*/g, '[^/]*') // * matches anything except /
        .replace(/{{GLOBSTAR}}/g, '.*') // ** matches anything including /
        .replace(/\?/g, '.'); // ? matches single char
    // Check if pattern should match from start
    if (!normalizedPattern.startsWith('*')) {
        regexStr = '^' + regexStr;
    }
    // Check if pattern should match to end
    if (!normalizedPattern.endsWith('*')) {
        regexStr = regexStr + '$';
    }
    try {
        const regex = new RegExp(regexStr, 'i');
        return regex.test(normalizedPath);
    }
    catch {
        return false;
    }
}
/**
 * Check if a value matches any allowlist pattern
 */
function isAllowlisted(value, allowlist) {
    for (const pattern of allowlist) {
        // Reset lastIndex for global patterns
        pattern.lastIndex = 0;
        if (pattern.test(value)) {
            return true;
        }
    }
    return false;
}
