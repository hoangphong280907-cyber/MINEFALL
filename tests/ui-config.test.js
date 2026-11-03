'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const client = fs.readFileSync(path.join(root, 'online-client.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server', 'index.js'), 'utf8');
const onlineCss = fs.readFileSync(path.join(root, 'online.css'), 'utf8');

test('difficulty controls display only Easy/Medium/Hard names without mine-density percentages', () => {
  assert.match(html, /data-difficulty=\"easy\"><strong>DỄ<\/strong><\/button>/);
  assert.match(html, /data-difficulty=\"medium\"><strong>TRUNG BÌNH<\/strong><\/button>/);
  assert.match(html, /data-difficulty=\"hard\"><strong>KHÓ<\/strong><\/button>/);
  assert.match(html, /<option value=\"easy\">Dễ<\/option><option value=\"medium\" selected>Trung bình<\/option><option value=\"hard\">Khó<\/option>/);
  assert.doesNotMatch(html, /data-difficulty=\"(?:easy|medium|hard)\">[^<]*<strong>[^<]*<\/strong><small>\d+% mìn<\/small>/);
});

test('online and offline board size/difficulty controls share one selected configuration', () => {
  assert.match(html, /if\(\$\('onlineBoardSize'\)\)\$\('onlineBoardSize'\)\.value=String\(SIZE\)/);
  assert.match(html, /if\(\$\('onlineDifficulty'\)\)\$\('onlineDifficulty'\)\.value=state\.difficulty/);
  assert.match(html, /syncConfigFromOnline/);
  assert.match(client, /syncConfigFromOnline\?\.\(\{ boardSize: size, matchDurationMinutes: room\?\.config\?\.matchDurationMinutes \|\| 10 \}\)/);
  assert.match(client, /syncConfigFromOnline\?\.\(\{ difficulty \}\)/);
  assert.match(client, /function syncOnlineSetupFromHome\(\)/);
  assert.match(client, /syncOnlineSetupFromHome\(\);\s*activateScreen\('onlineScreen'\)/);
});


test('offline and online matches offer only 10, 15, 20, 25 and 30 minute durations', () => {
  for (const id of ['matchDurationSelect', 'onlineMatchDuration']) {
    const start = html.indexOf(`<select id="${id}"`);
    const end = start < 0 ? -1 : html.indexOf('</select>', start);
    assert.ok(start >= 0 && end > start, `${id} selector exists`);
    const markup = html.slice(start, end);
    for (const minutes of [10, 15, 20, 25, 30]) assert.ok(markup.includes(`<option value="${minutes}"`), `${id} has ${minutes} minute option`);
    assert.doesNotMatch(markup, /option value="(?:0|5|12|35|60)"/);
  }
  assert.match(html, /function matchDurationSeconds\(\)/);
  assert.match(html, /state\.matchLeft=matchDurationSeconds\(\)/);
  assert.match(client, /config: \{ boardSize, difficulty, matchDurationMinutes,/);
});


test('offline landing screen derives board dimensions and mine count from the generated board, not the 16x16 default', () => {
  assert.match(html, /function formatBoardSizeLabel\(size\)[\s\S]*?parsed\+'×'\+parsed/);
  assert.match(html, /function getGeneratedBoardSize\(\)[\s\S]*?Math\.sqrt\(cellCount\)/);
  const landing = html.slice(html.indexOf('function showLandingOverlay()'), html.indexOf('function showRouletteOverlay()'));
  assert.match(landing, /const actualBoardSize=getGeneratedBoardSize\(\)/);
  assert.match(landing, /const actualBoardSizeLabel=formatBoardSizeLabel\(actualBoardSize\)/);
  assert.match(landing, /const actualMineCount=state\.cells\.filter\(cell=>cell\.mine\)\.length/);
  assert.match(landing, /BÀN CỜ '\+actualBoardSizeLabel/);
  assert.doesNotMatch(landing, /BÀN CỜ '\+SIZE\+'×'\+SIZE/);
});

test('online pregame waits for the authoritative board size and labels the landing thumbnail clearly', () => {
  assert.match(client, /board\.size !== configuredSize/);
  assert.match(client, /board\.cells\.length !== configuredSize \* configuredSize/);
  assert.match(client, /BÀN ĐẤU \$\{size\}×\$\{size\} · BÃI ĐÁP \$\{opening\.length\} Ô/);
  assert.match(client, /ĐANG ĐỒNG BỘ SÀN ĐẤU/);
});


test('online waiting room and online match hide wallet and shop chrome but restore it after leaving', () => {
  assert.match(html, /body\.online-session-active \.topbar \.coin-tag,\s*body\.online-session-active \.topbar #shopBtn \{ display: none !important; \}/);
  assert.match(client, /function activateScreen\(id\)[\s\S]*?document\.body\.classList\.toggle\('online-session-active', inOnlineSession\)/);
  assert.match(client, /const inOnlineSession = id === 'onlineRoomScreen' \|\| \(id === 'gameScreen' && !!window\.MINEFALL_APP\?\.isOnlineMatch\?\.\(\)\)/);
  assert.match(html, /function applyOnlineSnapshot\(snapshot,selfPlayerId,roomInfo\)\{[\s\S]*?document\.body\.classList\.add\('online-session-active'\)/);
  assert.match(client, /document\.body\.classList\.toggle\('online-session-active', inOnlineSession\)/);
});


test('online match duration is refreshed from the authoritative match snapshot config', () => {
  assert.match(client, /msg\.roomConfig && typeof msg\.roomConfig === 'object'/);
  assert.match(client, /config: \{ \.\.\.room\.config, \.\.\.msg\.roomConfig \}/);
  assert.match(client, /applyOnlineSnapshot\(publicState, selfPlayerId, \{[\s\S]*?config: \{ \.\.\.room\.config, \.\.\.\(msg\.roomConfig \|\| \{\}\) \}/);
  assert.match(client, /const matchDurationMinutes = Number\(\$\('onlineMatchDuration'\)\?\.value \?\? 10\)/);
});

test('current tile clue is displayed without exposing hidden mine counts and mobile actions identify the target', () => {
  assert.match(html, /id="currentCellClue" class="current-cell-clue"/);
  assert.match(html, /function updateCurrentCellClue\(\)[\s\S]*?if\(cell\.revealed\|\|cell\.endRevealed\)[\s\S]*?mìn xung quanh/);
  assert.match(html, /label\.textContent=cell\.flagOwner\?'Ô dưới chân: đang có cờ':'Ô dưới chân: ô chưa mở · chưa có số'/);
  assert.match(html, /id="mobileActionTarget" class="mobile-action-target"/);
  assert.match(html, /min-height:64px/);
});


test('rapid online state updates are coalesced and the flood ceiling allows normal fast touch input', () => {
  assert.match(server, /const pendingMatchBroadcasts = new Map\(\)/);
  assert.match(server, /if \(pendingMatchBroadcasts\.has\(room\)\) return/);
  assert.match(server, /\}, 20\);\s*pendingMatchBroadcasts\.set\(room, timer\)/);
  assert.match(server, /const RATE_MAX = 120/);
});


test('landing pod engine plume stays attached to the capsule in offline and online intros', () => {
  assert.match(html, /\.drop-animation\{height:108px;width:100px;position:relative;isolation:isolate;overflow:visible;margin:8px auto 0\}/);
  assert.match(html, /\.drop-animation \.pod-flame\{left:36px;top:49px;bottom:auto;width:28px;height:48px;z-index:1/);
  assert.match(html, /\.drop-animation \.pod-shell\{left:24px;width:52px;height:54px;top:3px;z-index:2\}/);
  assert.match(html, /<div class=\"drop-animation\" aria-hidden=\"true\"><div class=\"pod-flame\"><\/div><div class=\"pod-shell\"><\/div><div class=\"pod-window\"><\/div><\/div>/);
  assert.match(html, /\.drop-animation \.pod-window\{left:36px;top:14px;z-index:3\}/);
  assert.doesNotMatch(html, /<div class=\"pod-shell\"><div class=\"pod-window\">/);
  assert.match(html, /<h1>Bàn cờ <span id=\"gameBoardSize\"/);
  assert.ok(html.includes("BÀN CỜ '+actualBoardSizeLabel+' · CỤM ĐÁP '+openingCount+' Ô"));
  assert.match(client, /BÀN CỜ \$\{size\}×\$\{size\} · CỤM ĐÁP \$\{openingCount\} Ô/);
  assert.match(html, /@keyframes landingThruster/);
  assert.match(html, /\.drop-shadow\{position:relative;z-index:0;width:124px;height:10px/);
  assert.match(html, /\.drop-animation \.pod-flame,\.drop-shadow\{animation:none!important\}/);
  assert.match(client, /drop-animation online-drop-animation[^>]*>[\s\S]*?pod-shell[\s\S]*?pod-window[\s\S]*?pod-flame/);
  assert.match(onlineCss, /\.online-drop-animation\{margin-top:18px;animation:dropPodLand/);
  assert.match(onlineCss, /\.online-drop-animation \.pod-flame,\.overlay\.online-intro-overlay \.drop-shadow\{animation:none!important\}/);
});

test('character sprites scale from the selected board cell and animate the visible PNG layer', () => {
  const pawnRule = html.match(/\.pawn\{[^}]*\}/)?.[0] || '';
  assert.match(pawnRule, /width:var\(--pawn-cell-size,3\.6%\)/);
  assert.match(pawnRule, /height:var\(--pawn-cell-size,3\.6%\)/);
  assert.doesNotMatch(pawnRule, /max-width:25px|max-height:25px/);
  assert.ok(html.includes("pawn.style.setProperty('--pawn-cell-size',(76/SIZE)+'%')"));
  assert.ok(html.includes('const crowdOffsetPercent=1/SIZE'));
  assert.match(html, /\.pawn\.has-sprite:not\(\.moving\):not\(\.dead\) \.pawn-sprite\{animation:pawnSpriteIdle/);
  assert.match(html, /\.pawn\.has-sprite\.moving \.pawn-sprite\{animation:pawnSpriteMove/);
  assert.match(html, /\.pawn\.has-sprite\.dead \.pawn-sprite\{animation:pawnDeath/);
  assert.match(html, /@keyframes pawnSpriteIdle/);
  assert.match(html, /@keyframes pawnSpriteMove/);
  assert.match(html, /@media\(prefers-reduced-motion:reduce\)/);
});