'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const WebSocket = require('ws');
const packageInfo = require('../package.json');

const projectRoot = path.resolve(__dirname, '..');
const serverPath = path.join(projectRoot, 'server', 'index.js');

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForHealth(baseUrl, child, readOutput) {
  const deadline = Date.now() + 10_000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited before becoming healthy.\n${readOutput()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return await response.json();
      lastError = new Error(`/health returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`Server did not become healthy: ${lastError?.message || 'timeout'}\n${readOutput()}`);
}

async function checkWebSocket(url) {
  await new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error('WebSocket hello timed out.'));
    }, 4000);
    const cleanup = () => clearTimeout(timer);
    socket.once('message', raw => {
      try {
        const message = JSON.parse(raw.toString());
        assert.equal(message.type, 'system:hello');
        assert.equal(message.version, packageInfo.version);
        assert.equal(message.protocolVersion, 1);
        cleanup();
        socket.close();
        resolve();
      } catch (error) {
        cleanup();
        socket.terminate();
        reject(error);
      }
    });
    socket.once('error', error => {
      cleanup();
      reject(error);
    });
  });
}

async function main() {
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [serverPath], {
    cwd: projectRoot,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });

  try {
    const health = await waitForHealth(baseUrl, child, () => output);
    assert.equal(health.status, 'ok');
    assert.equal(health.version, packageInfo.version);

    const paths = [
      ['/', 'text/html'],
      ['/engine.js', 'javascript'],
      ['/cosmetics.js', 'javascript'],
      ['/online-client.js', 'javascript'],
      ['/online.css', 'text/css'],
      ['/assets/mines/bomb-standard.svg', 'image/svg+xml'],
      ['/assets/flags/flag-vietnam.svg', 'image/svg+xml']
    ];
    for (const [route, expectedType] of paths) {
      const response = await fetch(`${baseUrl}${route}`, { signal: AbortSignal.timeout(2000) });
      assert.equal(response.status, 200, `${route} should return HTTP 200`);
      assert.match(response.headers.get('content-type') || '', new RegExp(expectedType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
      assert.ok((await response.arrayBuffer()).byteLength > 0, `${route} should not be empty`);
    }

    await checkWebSocket(`ws://127.0.0.1:${port}/ws`);
    console.log('PASS: server health, app assets and WebSocket hello handshake.');
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await Promise.race([
        new Promise(resolve => child.once('exit', resolve)),
        new Promise(resolve => setTimeout(resolve, 3500))
      ]);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
  }
}

main().catch(error => {
  console.error(`Server smoke test FAILED: ${error.stack || error.message}`);
  process.exit(1);
});
