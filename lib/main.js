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
const toolCache = require("@actions/tool-cache");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const cache = require("@actions/cache");
const github_1 = require("@actions/github");
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
            const token = core.getInput('token') || process.env.GITHUB_TOKEN;
            const nodePlatform = os.platform();
            const nodeArch = os.arch();
            // Rokit platform names
            const platformMap = {
                win32: 'windows',
                linux: 'linux',
                darwin: 'macos',
            };
            const rokitPlatform = platformMap[nodePlatform];
            if (!rokitPlatform)
                throw new Error(`Unsupported platform: ${nodePlatform}`);
            const archMap = {
                x64: 'x86_64',
                arm64: 'aarch64',
            };
            const rokitArch = archMap[nodeArch];
            if (!rokitArch)
                throw new Error(`Unsupported arch: ${nodeArch}`);
            // Resolve 'latest' to actual tag
            let tagName = version;
            if (version === 'latest') {
                const octokit = (0, github_1.getOctokit)(token);
                const { data } = yield octokit.rest.repos.getLatestRelease({
                    owner: 'rojo-rbx',
                    repo: 'rokit',
                });
                tagName = data.tag_name; // e.g. "v1.2.0"
            }
            const cleanVersion = tagName.replace(/^v/, ''); // "1.2.0"
            const fileName = `rokit-${cleanVersion}-${rokitPlatform}-${rokitArch}.zip`;
            const downloadUrl = `https://github.com/rojo-rbx/rokit/releases/download/${tagName}/${fileName}`;
            core.info(`Downloading Rokit from ${downloadUrl}`);
            const zipPath = yield toolCache.downloadTool(downloadUrl, undefined, token ? `token ${token}` : undefined);
            const extractedFolder = yield toolCache.extractZip(zipPath);
            const binaryName = nodePlatform === 'win32' ? 'rokit.exe' : 'rokit';
            const binaryPath = path.join(extractedFolder, binaryName);
            if (!fs.existsSync(binaryPath)) {
                throw new Error(`Expected binary not found: ${binaryPath}`);
            }
            if (nodePlatform !== 'win32')
                fs.chmodSync(binaryPath, '755');
            core.addPath(extractedFolder);
            // Find config file
            const tomlFiles = ['rokit.toml', 'aftman.toml', 'foreman.toml'];
            let configFile = '';
            for (const f of tomlFiles) {
                const p = path.join(configPath, f);
                if (fs.existsSync(p)) {
                    configFile = p;
                    break;
                }
            }
            if (!configFile)
                throw new Error('No rokit.toml / aftman.toml / foreman.toml found');
            // Cache ~/.rokit
            const rokitDir = path.join(os.homedir(), '.rokit');
            if (cacheTools) {
                const hash = yield hashFile(configFile);
                const key = `rokit-tools-${nodePlatform}-${nodeArch}-${cleanVersion}-${hash}`;
                const restored = yield cache.restoreCache([rokitDir], key);
                if (restored)
                    core.info(`Restored ~/.rokit from cache`);
            }
            // Run install with --trust to bypass interactive prompt in CI
            core.info('Installing tools with Rokit (auto-trusting everything for CI)');
            yield exec.exec(binaryName, ['install', '--no-trust-check'], { cwd: configPath });
            // Save cache
            if (cacheTools) {
                const hash = yield hashFile(configFile);
                const key = `rokit-tools-${nodePlatform}-${nodeArch}-${cleanVersion}-${hash}`;
                yield cache.saveCache([rokitDir], key);
                core.info('Saved ~/.rokit to cache');
            }
        }
        catch (error) {
            core.setFailed((error === null || error === void 0 ? void 0 : error.message) || 'Unknown error');
        }
    });
}
main();
