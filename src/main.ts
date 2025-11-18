import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as io from '@actions/io';
import * as toolCache from '@actions/tool-cache';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';
import * as cache from '@actions/cache';
import { getOctokit } from '@actions/github';

async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function main() {
  try {
    let version = core.getInput('version') || 'latest';
    const configPath = core.getInput('path') || '.';
    const cacheTools = core.getBooleanInput('cache');
    const token = core.getInput('token') || process.env.GITHUB_TOKEN;

    const nodePlatform = os.platform();
    const nodeArch = os.arch();

    // Rokit platform names
    const platformMap: Record<string, string> = {
      win32: 'windows',
      linux: 'linux',
      darwin: 'macos',
    };
    const rokitPlatform = platformMap[nodePlatform];
    if (!rokitPlatform) throw new Error(`Unsupported platform: ${nodePlatform}`);

    const archMap: Record<string, string> = {
      x64: 'x86_64',
      arm64: 'aarch64',
    };
    const rokitArch = archMap[nodeArch];
    if (!rokitArch) throw new Error(`Unsupported arch: ${nodeArch}`);

    // Resolve 'latest' to actual tag
    let tagName = version;
    if (version === 'latest') {
      const octokit = getOctokit(token!);
      const { data } = await octokit.rest.repos.getLatestRelease({
        owner: 'rojo-rbx',
        repo: 'rokit',
      });
      tagName = data.tag_name; // e.g. "v1.2.0"
    }

    const cleanVersion = tagName.replace(/^v/, ''); // "1.2.0"
    const fileName = `rokit-${cleanVersion}-${rokitPlatform}-${rokitArch}.zip`;
    const downloadUrl = `https://github.com/rojo-rbx/rokit/releases/download/${tagName}/${fileName}`;

    core.info(`Downloading Rokit from ${downloadUrl}`);
    const zipPath = await toolCache.downloadTool(downloadUrl, undefined, token ? `token ${token}` : undefined);
    const extractedFolder = await toolCache.extractZip(zipPath);

    const binaryName = nodePlatform === 'win32' ? 'rokit.exe' : 'rokit';
    const binaryPath = path.join(extractedFolder, binaryName);

    if (!fs.existsSync(binaryPath)) {
      throw new Error(`Expected binary not found: ${binaryPath}`);
    }

    if (nodePlatform !== 'win32') fs.chmodSync(binaryPath, '755');
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
    if (!configFile) throw new Error('No rokit.toml / aftman.toml / foreman.toml found');

    // Cache ~/.rokit
    const rokitDir = path.join(os.homedir(), '.rokit');
    if (cacheTools) {
      const hash = await hashFile(configFile);
      const key = `rokit-tools-${nodePlatform}-${nodeArch}-${cleanVersion}-${hash}`;
      const restored = await cache.restoreCache([rokitDir], key);
      if (restored) core.info(`Restored ~/.rokit from cache`);
    }

    // Run install with --trust to bypass interactive prompt in CI
    core.info('Installing tools with Rokit (auto-trusting everything for CI)');
    await exec.exec(binaryName, ['install', '--trust'], { cwd: configPath });

    // Save cache
    if (cacheTools) {
      const hash = await hashFile(configFile);
      const key = `rokit-tools-${nodePlatform}-${nodeArch}-${cleanVersion}-${hash}`;
      await cache.saveCache([rokitDir], key);
      core.info('Saved ~/.rokit to cache');
    }

  } catch (error) {
    core.setFailed((error as Error)?.message || 'Unknown error');
  }
}

main();