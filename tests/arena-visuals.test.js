'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const ArenaVisuals = require('../arena-visuals.js');
const cosmetics = require('../cosmetics.js');

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
  assert.equal(typeof ArenaVisuals.paintPreview, 'function');
  assert.equal(ArenaVisuals.version, '1.2.0');
});

test('Canvas effects provide layered bomb impacts, movement trails, eliminations and victory bursts', () => {
  const source = fs.readFileSync(path.join(root, 'arena-visuals.js'), 'utf8');
  assert.match(source, /instance\.impact=function\(index,effect='standard',palette=null\)/);
  assert.match(source, /instance\.streaks\.push/);
  assert.match(source, /function drawMotionStreak\(ctx,streak\)/);
  assert.match(source, /instance\.eliminations\.push/);
  assert.match(source, /function drawEliminationEcho\(ctx,mark\)/);
  assert.match(source, /instance\.celebrate=function\(index,effect='confetti',palette=null,playerColor=null\)/);
  assert.match(source, /function drawVictoryMark\(ctx,mark\)/);
  assert.match(source, /burst\.age>=\(burst\.delay\|\|0\)\+burst\.life/);
  assert.match(source, /instance\.streaks=\[\]/);
  assert.match(source, /instance\.eliminations=\[\]/);
  assert.match(source, /instance\.victories=\[\]/);
});

test('offline and online matches share the improved effects and compact results presentation', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'arena-visuals.css'), 'utf8');
    assert.match(html, /const bombId=state\.onlineMode\?\(player\?\.bomb\|\|state\.onlineBombSkin\|\|'bomb-standard'\):\(profile\.equipped\.bomb\|\|player\?\.bomb\|\|'bomb-standard'\)/);
  assert.match(html, /arenaVisualInstance\?\.impact\(index,bomb\.effect\|\|'standard',bomb\.palette\|\|null\)/);
  assert.match(html, /arenaVisualInstance\?\.eliminate\(index,item\.effect\|\|'standard',player\.color\|\|null\)/);
  assert.match(html, /arenaVisualInstance\?\.celebrate\(winner\.pos,celebration\.effect,celebration\.palette\|\|null,winner\.color\|\|null\)/);
  assert.match(html, /if\(state\.onlineMode\)applyServerMatchOutcome\(\);else applyMatchOutcome\(reason\)/);
  assert.match(html, /if\(snapshot\.ended&&!state\.ended\).*finishGame\(snapshot\.endReason\|\|'timeout'\)/);
  assert.match(html, /class="action-note sr-only" aria-live="polite"/);
  assert.match(html, /<th>Vị trí<\/th>.*<th>Điểm hạng<\/th>.*<th>Điểm cờ<\/th>/);
  assert.match(html, /Tổng = Điểm hạng \+ Điểm cờ − Phạt/);
  assert.doesNotMatch(html, /di chuyển đến '\+coord\(index\)\+'\.'/);
  assert.doesNotMatch(html, /addLog\('Lượt '\+\(event\.turnId/);
  assert.match(css, /\.sr-only\s*\{/);
  assert.match(css, /\.summary-formula\s*\{/);
});

test('every movement and elimination cosmetic has its own animated visual profile', () => {
  assert.deepEqual([...ArenaVisuals.trailEffectIds], cosmetics.trail.map(item => item.effect));
  assert.deepEqual([...ArenaVisuals.eliminationEffectIds], cosmetics.elimination.map(item => item.effect));

  const source = fs.readFileSync(path.join(root, 'arena-visuals.js'), 'utf8');
  const trailStart = source.indexOf('function drawMotionStreak');
  const eliminationStart = source.indexOf('function drawEliminationEcho');
  const victoryStart = source.indexOf('function drawVictoryMark');
  assert.ok(trailStart >= 0 && eliminationStart > trailStart && victoryStart > eliminationStart);

  const trailRenderer = source.slice(trailStart, eliminationStart);
  const eliminationRenderer = source.slice(eliminationStart, victoryStart);
  for (const effect of ArenaVisuals.trailEffectIds) {
    assert.ok(trailRenderer.includes("case '" + effect + "'"), 'missing unique movement profile: ' + effect);
  }
  for (const effect of ArenaVisuals.eliminationEffectIds) {
    assert.ok(eliminationRenderer.includes("case '" + effect + "'"), 'missing unique elimination profile: ' + effect);
    assert.ok(ArenaVisuals.effectIds.includes(effect), 'missing elimination color profile: ' + effect);
  }
});

test('renderer provides staged dig, flag, unflag and chain-reveal feedback', () => {
  assert.deepEqual([...ArenaVisuals.actionFeedbackIds], ['step','dig','flag','unflag','reveal']);

  const renderer = fs.readFileSync(path.join(root, 'arena-visuals.js'), 'utf8');
  assert.match(renderer, /function drawActionPulse\(ctx,pulse\)/);
  assert.match(renderer, /instance\.feedback=function\(index,kind='dig',playerColor=null\)/);
  assert.match(renderer, /if\(kind==='reveal'\)/);
  assert.match(renderer, /if\(pulse\.kind==='step'\)/);
  assert.match(renderer, /color:tint,cellSize:cell/);
  assert.match(renderer, /instance\.revealWave=function\(origin,indices,playerColor=null\)/);
  assert.match(renderer, /pulses:\[\]/);
  assert.match(renderer, /instance\.pulses\.length>limit/);
  assert.match(renderer, /instance\.pulses=\[\]/);

  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /function showCellFeedback\(index,kind,label,playerColor=null\)/);
  assert.match(html, /arenaVisualInstance\.feedback\(index,kind,playerColor\)/);
  assert.match(html, /arenaVisualInstance\?\.feedback\(index,'step',player\.color\|\|null\)/);
  assert.match(html, /arenaVisualInstance\.revealWave\(index,opened,playerColor\)/);
  assert.match(html, /showCellFeedback\(i,'dig',[^;]*player\.color\)/);
  assert.match(html, /showCellFeedback\(i,'dig',[^;]*bot\.color\)/);
  assert.match(html, /showCellFeedback\(index,'dig',[^;]*player\?\.color\)/);
});

test('mobile flag image failures retain a visible flag fallback with safe stacking', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /if\(category==='bomb'\|\|category==='flag'\)/);
  assert.match(html, /category==='flag'\?'flag-icon flag-fallback'/);
  assert.match(html, /fallback\.textContent=item\.emoji\|\|\(category==='flag'\?'⚑':'💣'\)/);
  assert.match(html, /\.cell \.flag-icon,\.cell \.flag-image,\.cell \.flag-fallback\{position:relative;z-index:3/);
  assert.match(html, /\.cell \.flag-fallback\{display:inline-flex/);
});

test('host room bomb skin is player-authoritative and toxic impacts have a distinct cloud effect', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'arena-visuals.js'), 'utf8');
  assert.match(html, /const bombId=state\.onlineMode\?\(player\?\.bomb\|\|state\.onlineBombSkin\|\|'bomb-standard'\)/);
  assert.match(renderer, /function drawToxicImpact\(ctx,mark\)/);
  assert.match(renderer, /instance\.toxicEffects\.push/);
  assert.match(renderer, /if\(effect==='toxic'\)/);
  assert.match(renderer, /Large, hollow acid bubbles climb through the cloud/);
  const burstLoop = renderer.indexOf('for(let i=instance.bursts.length-1;i>=0;i--)');
  const eliminationLoop = renderer.indexOf('for(let i=instance.eliminations.length-1;i>=0;i--)');
  assert.ok(burstLoop >= 0 && eliminationLoop > burstLoop, 'elimination must render above bomb impact bursts');
  const eliminationRenderer = renderer.slice(renderer.indexOf('function drawEliminationEcho'), renderer.indexOf('function drawToxicImpact'));
  assert.match(eliminationRenderer, /central impact veil hides the mine sprite/);
  assert.match(eliminationRenderer, /ctx\.createRadialGradient/);
  assert.match(eliminationRenderer, /rgba\(255,255,255,\.98\)/);
});

test('native scrollbars are hidden without disabling scrollable content', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /\*\s*\{\s*scrollbar-width:\s*none\s*!important;\s*-ms-overflow-style:\s*none\s*!important;\s*\}/);
  assert.match(html, /\*::\-webkit-scrollbar\s*\{\s*display:\s*none\s*!important;\s*width:\s*0\s*!important;\s*height:\s*0\s*!important;\s*\}/);
  assert.match(html, /\.log\{[^}]*overflow:auto/);
  assert.match(html, /\.overlay-panel\{[^}]*overflow:auto/);
});
