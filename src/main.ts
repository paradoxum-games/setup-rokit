import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as io from '@actions/io';
import * as toolCache from '@actions/tool-cache';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';
import * as cache from '@actions/cache';

// Helper to hash a file for cache key
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
    const version = core.getInput('version') || 'latest';
    const configPath = core.getInput('path') || '.';
    const cacheTools = core.getBooleanInput('cache');
    const token = core.getInput('token');

    // Determine Node.js platform and architecture
    const nodePlatform = os.platform();
    const nodeArch = os.arch();

    // Map to Rust target platform
    let rustPlatform: string;
    let extension = '';
    let binaryName = 'rokit';
    if (nodePlatform === 'win32') {
      rustPlatform = 'pc-windows-msvc';
      extension = '.exe';
      binaryName += extension;
    } else if (nodePlatform === 'linux') {
      rustPlatform = 'unknown-linux-gnu';
    } else if (nodePlatform === 'darwin') {
      rustPlatform = 'apple-darwin';
    } else {
      throw new Error(`Unsupported platform: ${nodePlatform}`);
    }

    // Map to Rust target architecture
    let rustArch: string;
    if (nodeArch === 'x64') {
      rustArch = 'x86_64';
    } else if (nodeArch === 'arm64') {
      rustArch = 'aarch64';
    } else {
      throw new Error(`Unsupported architecture: ${nodeArch}`);
    }

    // Construct download URL
    let downloadUrl: string;
    if (version === 'latest') {
      downloadUrl = `https://github.com/rojo-rbx/rokit/releases/latest/download/rokit-${rustArch}-${rustPlatform}${extension}`;
    } else {
      downloadUrl = `https://github.com/rojo-rbx/rokit/releases/download/${version}/rokit-${rustArch}-${rustPlatform}${extension}`;
    }

    core.info(`Downloading Rokit from ${downloadUrl}`);
    const toolPath = await toolCache.downloadTool(downloadUrl, undefined, token ? `token ${token}` : undefined);
    const binaryPath = path.join(path.dirname(toolPath), binaryName);
    await io.cp(toolPath, binaryPath);
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
      const tomlHash = await hashFile(configFile);
      const cacheKey = `rokit-tools-${nodePlatform}-${nodeArch}-${version}-${tomlHash}`;
      const cachePaths = [rokitDir];

      try {
        const restored = await cache.restoreCache(cachePaths, cacheKey);
        if (restored) {
          core.info(`Restored Rokit tools from cache with key ${cacheKey}`);
        } else {
          core.info(`No cache hit for key ${cacheKey}`);
        }
      } catch (error) {
        core.warning(`Failed to restore cache: ${(error as Error).message}`);
      }
    }

    // Run Rokit install
    core.info(`Running Rokit install in directory ${configPath}`);
    await exec.exec(binaryName, ['install'], { cwd: configPath });

    // Optional: Save cache for installed tools
    if (cacheTools) {
      const tomlHash = await hashFile(configFile);
      const cacheKey = `rokit-tools-${nodePlatform}-${nodeArch}-${version}-${tomlHash}`;
      const cachePaths = [rokitDir];

      try {
        await cache.saveCache(cachePaths, cacheKey);
        core.info(`Saved Rokit tools to cache with key ${cacheKey}`);
      } catch (error) {
        core.warning(`Failed to save cache: ${(error as Error).message}`);
      }
    }

  } catch (error) {
    core.setFailed((error as Error).message);
  }
}

main();