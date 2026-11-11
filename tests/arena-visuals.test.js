'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ArenaVisuals = require('../arena-visuals.js');

test('arena renderer exposes all twelve selectable arena materials', () => {
  assert.equal(ArenaVisuals.themeIds.length, 12);
  for (const id of ArenaVisuals.themeIds) {
    const theme = ArenaVisuals.resolveTheme(id);
    assert.equal(theme.id, id);
    assert.ok(theme.label);
    assert.ok(theme.detail);
    assert.match(theme.base[0], /^#[0-9a-f]{6}$/i);
    assert.match(theme.base[1], /^#[0-9a-f]{6}$/i);
    assert.match(theme.reveal[0], /^#[0-9a-f]{6}$/i);
    assert.match(theme.zone[0], /^#[0-9a-f]{6}$/i);
    assert.ok(theme.ambient);
  }
});

test('unknown arena IDs safely fall back to the standard material', () => {
  assert.deepEqual(ArenaVisuals.resolveTheme('arena-does-not-exist'), ArenaVisuals.resolveTheme('arena-standard'));
});

test('particle effect catalogue includes material-specific and cosmetic effects', () => {
  for (const effect of ['fire','ice','toxic','lightning','void','cosmic','plasma','dust','ember','frost','sakura','circuit','leaf']) {
    assert.ok(ArenaVisuals.effectIds.includes(effect), effect + ' must have a particle profile');
  }
});

test('renderer module can be imported in Node without a browser DOM', () => {
  assert.equal(typeof ArenaVisuals.mount, 'function');
  assert.equal(ArenaVisuals.version, '1.0.0');
});
