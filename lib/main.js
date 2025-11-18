"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = require("@actions/core");
const exec = require("@actions/exec");
const io = require("@actions/io");
const toolCache = require("@actions/tool-cache");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const cache = require("@actions/cache");
const github_1 = require("@actions/github");
// Helper to hash a file for cache key
function hashFile(filePath) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(filePath);
            stream.on('data', (data) => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
        });
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            let version = core.getInput('version') || 'latest';
            const configPath = core.getInput('path') || '.';
            const cacheTools = core.getBooleanInput('cache');
            const token = core.getInput('token');
            // Determine Node.js platform and architecture
            const nodePlatform = os.platform();
            const nodeArch = os.arch();
            // Map to simplified platform names used in Rokit
            let rokitPlatform;
            if (nodePlatform === 'win32') {
                rokitPlatform = 'windows';
            }
            else if (nodePlatform === 'linux') {
                rokitPlatform = 'linux';
            }
            else if (nodePlatform === 'darwin') {
                rokitPlatform = 'macos';
            }
            else {
                throw new Error(`Unsupported platform: ${nodePlatform}`);
            }
            // Map to architecture
            let rokitArch;
            if (nodeArch === 'x64') {
                rokitArch = 'x86_64';
            }
            else if (nodeArch === 'arm64') {
                rokitArch = 'aarch64';
            }
            else {
                throw new Error(`Unsupported architecture: ${nodeArch}`);
            }
            // Get actual version if 'latest'
            let actualVersion = version;
            if (version === 'latest') {
                const octokit = (0, github_1.getOctokit)(token);
                const release = yield octokit.rest.repos.getLatestRelease({
                    owner: 'rojo-rbx',
                    repo: 'rokit',
                });
                actualVersion = release.data.tag_name.replace(/^v/, ''); // e.g., '1.2.0'
                version = release.data.tag_name; // For download URL, use the full tag like 'v1.2.0'
            }
            // Construct download URL
            const fileName = `rokit-${actualVersion}-${rokitPlatform}-${rokitArch}.zip`;
            let downloadUrl;
            if (version.startsWith('v')) { // Assuming tags are 'vX.Y.Z'
                downloadUrl = `https://github.com/rojo-rbx/rokit/releases/download/${version}/${fileName}`;
            }
            else {
                downloadUrl = `https://github.com/rojo-rbx/rokit/releases/download/v${actualVersion}/${fileName}`;
            }
            core.info(`Downloading Rokit from ${downloadUrl}`);
            const zipPath = yield toolCache.downloadTool(downloadUrl, undefined, token ? `token ${token}` : undefined);
            // Extract the ZIP
            const extractedPath = yield toolCache.extractZip(zipPath);
            core.info(`Extracted to ${extractedPath}`);
            // Binary name
            let binaryName = 'rokit';
            if (nodePlatform === 'win32') {
                binaryName += '.exe';
            }
            const binaryPath = path.join(extractedPath, binaryName);
            // Ensure binary exists
            if (!fs.existsSync(binaryPath)) {
                throw new Error(`Binary not found at ${binaryPath}`);
            }
            // Chmod if not Windows
            if (nodePlatform !== 'win32') {
                fs.chmodSync(binaryPath, '755');
            }
            // Add to PATH
            core.addPath(extractedPath);
            // Find configuration file
            const tomlFiles = ['rokit.toml', 'aftman.toml', 'foreman.toml'];
            let configFile = '';
            for (const file of tomlFiles) {
                const fullPath = path.join(configPath, file);
                if (fs.existsSync(fullPath)) {
                    configFile = fullPath;
                    break;
                }
            }
            if (!configFile) {
                throw new Error('No configuration file found (rokit.toml, aftman.toml, or foreman.toml)');
            }
            // Set auto-trust config to make tools trusted automatically
            let rokitConfigDir;
            if (nodePlatform === 'win32') {
                rokitConfigDir = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'rokit');
            }
            else {
                rokitConfigDir = path.join(os.homedir(), '.config', 'rokit');
            }
            yield io.mkdirP(rokitConfigDir);
            const rokitConfigPath = path.join(rokitConfigDir, 'config.toml');
            fs.writeFileSync(rokitConfigPath, 'auto-trust = true\n');
            // Optional: Restore cache for installed tools
            const rokitDir = path.join(os.homedir(), '.rokit');
            if (cacheTools) {
                const tomlHash = yield hashFile(configFile);
                const cacheKey = `rokit-tools-${nodePlatform}-${nodeArch}-${actualVersion}-${tomlHash}`;
                const cachePaths = [rokitDir];
                try {
                    const restored = yield cache.restoreCache(cachePaths, cacheKey);
                    if (restored) {
                        core.info(`Restored Rokit tools from cache with key ${cacheKey}`);
                    }
                    else {
                        core.info(`No cache hit for key ${cacheKey}`);
                    }
                }
                catch (error) {
                    core.warning(`Failed to restore cache: ${error.message}`);
                }
            }
            // Run Rokit install
            core.info(`Running Rokit install in directory ${configPath}`);
            yield exec.exec(binaryName, ['install'], { cwd: configPath });
            // Explicitly add ~/.rokit/bin to PATH for direct tool usage
            const rokitBinDir = path.join(rokitDir, 'bin');
            core.addPath(rokitBinDir);
            // Optional: Save cache for installed tools
            if (cacheTools) {
                const tomlHash = yield hashFile(configFile);
                const cacheKey = `rokit-tools-${nodePlatform}-${nodeArch}-${actualVersion}-${tomlHash}`;
                const cachePaths = [rokitDir];
                try {
                    yield cache.saveCache(cachePaths, cacheKey);
                    core.info(`Saved Rokit tools to cache with key ${cacheKey}`);
                }
                catch (error) {
                    core.warning(`Failed to save cache: ${error.message}`);
                }
            }
        }
        catch (error) {
            core.setFailed(error.message);
        }
    });
}
main();
