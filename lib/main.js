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
            const version = core.getInput('version') || 'latest';
            const configPath = core.getInput('path') || '.';
            const cacheTools = core.getBooleanInput('cache');
            const token = core.getInput('token');
            // Determine Node.js platform and architecture
            const nodePlatform = os.platform();
            const nodeArch = os.arch();
            // Map to Rust target platform
            let rustPlatform;
            let extension = '';
            let binaryName = 'rokit';
            if (nodePlatform === 'win32') {
                rustPlatform = 'pc-windows-msvc';
                extension = '.exe';
                binaryName += extension;
            }
            else if (nodePlatform === 'linux') {
                rustPlatform = 'unknown-linux-gnu';
            }
            else if (nodePlatform === 'darwin') {
                rustPlatform = 'apple-darwin';
            }
            else {
                throw new Error(`Unsupported platform: ${nodePlatform}`);
            }
            // Map to Rust target architecture
            let rustArch;
            if (nodeArch === 'x64') {
                rustArch = 'x86_64';
            }
            else if (nodeArch === 'arm64') {
                rustArch = 'aarch64';
            }
            else {
                throw new Error(`Unsupported architecture: ${nodeArch}`);
            }
            // Construct download URL
            let downloadUrl;
            if (version === 'latest') {
                downloadUrl = `https://github.com/rojo-rbx/rokit/releases/latest/download/rokit-${rustArch}-${rustPlatform}${extension}`;
            }
            else {
                downloadUrl = `https://github.com/rojo-rbx/rokit/releases/download/${version}/rokit-${rustArch}-${rustPlatform}${extension}`;
            }
            core.info(`Downloading Rokit from ${downloadUrl}`);
            const toolPath = yield toolCache.downloadTool(downloadUrl, undefined, token ? `token ${token}` : undefined);
            const binaryPath = path.join(path.dirname(toolPath), binaryName);
            yield io.cp(toolPath, binaryPath);
            if (nodePlatform !== 'win32') {
                fs.chmodSync(binaryPath, '755');
            }
            // Add to PATH
            core.addPath(path.dirname(binaryPath));
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
            // Optional: Restore cache for installed tools
            const rokitDir = path.join(os.homedir(), '.rokit');
            if (cacheTools) {
                const tomlHash = yield hashFile(configFile);
                const cacheKey = `rokit-tools-${nodePlatform}-${nodeArch}-${version}-${tomlHash}`;
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
            // Optional: Save cache for installed tools
            if (cacheTools) {
                const tomlHash = yield hashFile(configFile);
                const cacheKey = `rokit-tools-${nodePlatform}-${nodeArch}-${version}-${tomlHash}`;
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
