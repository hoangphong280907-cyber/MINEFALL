'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('manifest.webmanifest'));
const html = read('index.html');
const pwaClient = read('pwa.js');
const serviceWorker = read('service-worker.js');
const server = read('server/index.js');

test('PWA manifest describes an installable standalone MINEFALL app with valid local icons', () => {
  assert.equal(manifest.name, 'MINEFALL — Think. Move. Survive.');
  assert.equal(manifest.short_name, 'MINEFALL');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some(icon => icon.sizes === '192x192' && icon.purpose === 'any'));
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose.includes('maskable')));
  for (const icon of manifest.icons) {
    const file = path.join(root, icon.src.replace(/^\//, ''));
    assert.ok(fs.existsSync(file), `${icon.src} exists`);
    assert.ok(fs.statSync(file).size > 1000, `${icon.src} is not empty`);
    const png = fs.readFileSync(file);
    assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a', `${icon.src} is a PNG`);
    const size = Number(icon.sizes.split('x')[0]);
    assert.equal(png.readUInt32BE(16), size, `${icon.src} width`);
    assert.equal(png.readUInt32BE(20), size, `${icon.src} height`);
  }
  assert.ok(fs.existsSync(path.join(root, 'assets/pwa/apple-touch-icon.png')));
});

test('main page declares install metadata and exposes a working install entry point', () => {
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon" href="\/assets\/pwa\/apple-touch-icon\.png"/);
  assert.match(html, /id="installAppBtn"[^>]*>⬇ Cài app<\/button>/);
  assert.match(html, /<script src="\.\/pwa\.js"><\/script>/);
  assert.match(pwaClient, /beforeinstallprompt/);
  assert.match(pwaClient, /appinstalled/);
  assert.match(pwaClient, /navigator\.serviceWorker\.register\('\/service-worker\.js'/);
  assert.match(pwaClient, /Thêm vào màn hình chính/);
});

test('service worker caches the app shell, supports offline navigation and leaves server health/WebSocket uncached', () => {
  assert.match(serviceWorker, /const CACHE_NAME = 'minefall-pwa-1\.0\.0-rc\.4'/);
  assert.match(serviceWorker, /cache\.addAll\(APP_SHELL\)/);
  assert.match(serviceWorker, /request\.mode === 'navigate'/);
  assert.match(serviceWorker, /caches\.match\('\/index\.html'\)/);
  assert.match(serviceWorker, /url\.pathname === '\/health' \|\| url\.pathname === '\/ws'/);
  assert.match(serviceWorker, /name\.startsWith\('minefall-pwa-'\)/);
});

test('Node server allowlists PWA manifest, service worker, install helper and icon assets', () => {
  for (const route of [
    '/manifest.webmanifest', '/service-worker.js', '/pwa.js',
    '/assets/pwa/icon-192.png', '/assets/pwa/icon-512.png', '/assets/pwa/apple-touch-icon.png'
  ]) {
    assert.ok(server.includes(`['${route}'`), `${route} is publicly allowlisted`);
  }
  assert.match(server, /service-worker-allowed/);
});
