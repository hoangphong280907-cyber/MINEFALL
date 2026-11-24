'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Engine = require('../engine.js');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const arena = fs.readFileSync(path.join(root, 'arena-visuals.js'), 'utf8');

function section(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `source section ${start} exists`);
  return source.slice(from, to);
}

test('mobile performance mode detects touch hardware even when pointer media queries are unreliable', () => {
  const helper = section(html, 'function isMobilePerformanceMode()', 'function getMoveStepDelay');
  assert.match(helper, /navigator\\.maxTouchPoints/);
  assert.match(helper, /\\(pointer: coarse\\)/);
  assert.match(helper, /max-width: 820px/);
  assert.match(arena, /navigator\\.maxTouchPoints/);
});

test('hard bot strategic path cost uses constant-time Chebyshev distance instead of one BFS per candidate', () => {
  const scorer = section(html, 'function candidateStrategicValue', 'function botChooseActionHard');
  assert.match(scorer, /Math\\.max\\(Math\\.abs\\(r-botRow\\),Math\\.abs\\(c-botCol\\)\\)/);
  assert.doesNotMatch(scorer, /findPathBFS/);
});

test('Chebyshev distance equals the engine shortest-path length for eight-direction unobstructed movement', () => {
  for (const size of [8, 12, 16, 20]) {
    const samples = [
      [0, size * size - 1],
      [Math.floor(size / 2) * size + Math.floor(size / 2), 0],
      [size - 1, (size - 1) * size],
      [size + 1, size * (size - 2) + (size - 2)],
      [Math.floor(size / 3) * size + 1, Math.floor(size * 0.8) * size + size - 2]
    ];
    for (const [from, to] of samples) {
      const path = Engine.findPathBFS(from, to, size);
      const expected = Math.max(
        Math.abs(Math.floor(from / size) - Math.floor(to / size)),
        Math.abs((from % size) - (to % size))
      );
      assert.equal(path.length, expected, `size=${size}, from=${from}, to=${to}`);
    }
  }
});

test('hard bot exact frontier enumeration is bounded on touch devices and its queue avoids shift()', () => {
  const solver = section(html, 'function solveFrontierProbabilities', 'function findPathBFS');
  assert.match(solver, /const exactLimit=isMobilePerformanceMode\\(\\)\\?10:18/);
  assert.match(solver, /for\\(let head=0;head<queue\\.length;head\\+\\+\\)/);
  assert.doesNotMatch(solver, /queue\\.shift\\(\\)/);
});

test('mobile end reveal is paced in batches and avoids per-cell flip timers/confetti DOM', () => {
  const reveal = section(html, 'function runEndRevealAnimation', 'function applyServerMatchOutcome');
  assert.match(reveal, /if\\(isMobilePerformanceMode\\(\\)\\)/);
  assert.match(reveal, /const batchSize=Math\\.max\\(1,Math\\.ceil\\(queue\\.length\\/48\\)\\)/);
  assert.match(reveal, /const revealBatch=\\(\\)=>/);
  assert.match(html, /if\\(celebrating&&!isMobilePerformanceMode\\(\\)\\)/);
  assert.match(html, /const mobileLite=isMobilePerformanceMode\\(\\)/);
});

test('large chain reveals skip per-cell pop animations on mobile', () => {
  const renderer = section(html, 'function renderCell(i)', 'let arenaVisualInstance=null');
  assert.match(renderer, /const massReveal=!!\\(wave&&wave\\.cells&&wave\\.cells\\.size>20\\)/);
  assert.match(renderer, /!isMobilePerformanceMode\\(\\)\\|\\|!massReveal/);
});
