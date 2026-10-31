'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const catalog = require('../cosmetics.js');
const { RoomManager, normalizeCosmetics } = require('../server/room-manager.js');
const root = path.resolve(__dirname, '..');

test('cosmetic store meets minimum catalogue counts and includes Vietnam flag', () => {
  assert.equal(catalog.flag.length, 10);
  assert.equal(catalog.bomb.length, 10);
  assert.equal(catalog.elimination.length, 10);
  assert.equal(catalog.trail.length, 10);
  assert.ok(catalog.celebration.length >= 10);
  assert.ok(catalog.arena.length >= 10);
  assert.ok(catalog.flag.some(item => item.id === 'flag-vietnam' && item.emoji === '🇻🇳'));
  for (const category of Object.keys(catalog)) {
    const ids = catalog[category].map(item => item.id);
    assert.equal(new Set(ids).size, ids.length, `duplicate ${category} IDs`);
    assert.ok(catalog[category].every(item => item.price >= 0 && item.title && item.emoji));
    const defaultItem = catalog[category].find(item => item.defaultEquipped);
    assert.ok(defaultItem, `${category} must have a default equipped item`);
    assert.ok(defaultItem.defaultOwned || catalog[category].some(item => item.id === defaultItem.id && item.defaultOwned), `${category} default must be free/unlocked by default`);
  }
});

test('all arena themes define eight number colors for the number palette', () => {
  for (const arena of catalog.arena) {
    assert.equal(arena.numberColors.length, 8, `${arena.id} number color count`);
    assert.ok(arena.numberColors.every(color => /^#[0-9a-f]{6}$/i.test(color)), `${arena.id} hex colors`);
  }
});

test('server validates and broadcasts all player cosmetic equipment', () => {
  const chosen = { skin:'skin-gold', avatar:'avatar-crown', flag:'flag-vietnam', bomb:'bomb-fire', elimination:'elim-rocket', trail:'trail-neon', celebration:'celebration-fireworks' };
  assert.deepEqual(normalizeCosmetics(chosen), chosen);
  assert.equal(normalizeCosmetics({flag:'spoof-flag'}).flag, 'flag-classic');
  const manager = new RoomManager({ rng: () => 0.37 });
  const { room } = manager.createRoom('host', 'Host', { boardSize:8, difficulty:'easy', arenaSkin:'arena-cyber', bombSkin:'bomb-fire', maxPlayers:2 }, 'host-identity-001', chosen);
  manager.joinRoom('guest', room.code, 'Guest', 'guest-identity-001', { flag:'flag-vietnam', bomb:'bomb-ice', elimination:'elim-freeze', trail:'trail-frost', celebration:'celebration-sakura' });
  for (const player of room.players) manager.setReady(player.connectionId, true);
  manager.startMatch('host');
  assert.equal(room.matchState.players[0].flag, 'flag-vietnam');
  assert.equal(room.matchState.players[0].bomb, 'bomb-fire');
  assert.equal(room.matchState.players[0].elimination, 'elim-rocket');
  assert.equal(room.matchState.players[0].trail, 'trail-neon');
  assert.equal(room.matchState.players[0].celebration, 'celebration-fireworks');
  const publicPlayers = manager.publicRoom(room).players;
  assert.equal(publicPlayers[1].bomb, 'bomb-ice');
  const state = manager.publicMatchState(room);
  assert.equal(state.players[0].flag, 'flag-vietnam');
  assert.equal(state.players[1].celebration, 'celebration-sakura');
});

test('shop UI exposes all cosmetic categories and renders equipped flag, bomb and effect hooks', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server/index.js'), 'utf8');
  for (const category of ['arena','skin','avatar','flag','bomb','elimination','trail','celebration']) {
    assert.match(html, new RegExp(`data-shop-category="${category}"`));
  }
  assert.match(html, /<script src="\.\/cosmetics\.js"><\/script>\s*<script src="\.\/engine\.js"><\/script>/);
  assert.match(html, /font-size:clamp\(12px,1\.35vw,20px\)/);
  assert.match(html, /--num-.*color/);
  assert.match(html, /spawnMovementTrail\(trailIndex,playerById\(playerId\),previousIndex\)/);
  assert.match(html, /createCosmeticImage\('flag',flagItem,'flag-icon flag-image'/);
  assert.match(html, /createCosmeticImage\('bomb',bombItem,'mine-mark mine-image'/);
  assert.match(html, /const activeBombSkin=state\.onlineMode\?\(state\.onlineBombSkin\|\|'bomb-standard'\):\(profile\.equipped\.bomb\|\|'bomb-standard'\)/);
  assert.match(html, /else if\(visible&&cell\.mine\)\{\s*\/\/ Show the equipped mine art even when a flag sits on top of the mine\.\s*el\.classList\.add\('mine-skin-'\+bombItem\.id\);\s*const icon=createCosmeticImage\('bomb',bombItem,'mine-mark mine-image'/);
  assert.doesNotMatch(html, /const classicBomb=getShopItem\('bomb','bomb-standard'\);const icon=createCosmeticImage\('bomb',classicBomb/);
  assert.match(html, /state\.onlineBombSkin=roomInfo\?\.config\?\.bombSkin/);
  assert.match(html, /function clearMovementTrailsForPlayer/);
  assert.match(html, /tombstone-marker/);
  assert.match(html, /skinId\+'\.png'/);
  assert.doesNotMatch(html, /<div class="tag">BOARD/);
  assert.doesNotMatch(html, /<div class="tag">MINES/);
  assert.match(html, /showEliminationEffect\(player,index\)/);
  assert.match(html, /symbolByEffect/);
  assert.match(server, /'\/cosmetics\.js'/);
  assert.match(server, /assets\/flags/);
  assert.match(server, /assets\/mines/);
  assert.match(server, /assets\/skins/);
});


test('skin art pipeline supports fixed 512px transparent PNG assets and safe CSS fallback', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server/index.js'), 'utf8');
  const spec = fs.readFileSync(path.join(root, 'CHARACTER_SKIN_ART_SPEC.md'), 'utf8');
  assert.match(html, /sprite\.src='\/assets\/skins\/\'\+skinId\+\'\.png'/);
  assert.match(html, /failedSkinSprites\.has\(skinId\)/);
  assert.match(server, /assets\/skins\/\$\{item\.id\}\.png/);
  assert.match(spec, /512 × 512 px/);
  assert.match(spec, /transparent alpha background/);
  assert.match(spec, /skin-classic\.png/);
  assert.match(spec, /Gemini prompt template/);
});

test('online room create uses the host equipped bomb and successful room updates clear stale notices', () => {
  const client = fs.readFileSync(path.join(root, 'online-client.js'), 'utf8');
  assert.match(client, /bombSkin: cosmetics\.bomb/);
  assert.match(client, /if \(room\) clearMessage\(\)/);
  assert.match(client, /function clearMessage\(\)/);
  assert.match(client, /updateHostBombPreview\(room\.config\.bombSkin/);
  assert.match(client, /refreshCosmeticPreviews/);
});

test('each cosmetic category has distinct visual data and matching renderer hooks', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const category of ['flag','bomb','elimination','trail','celebration']) {
    const items = catalog[category];
    assert.ok(items.every(item => item.effect && item.emoji), `${category} should define effect and icon`);
    assert.equal(new Set(items.map(item => item.emoji)).size, items.length, `${category} icons should be visually distinct`);
  }
  for (const bomb of catalog.bomb) {
    assert.ok(Array.isArray(bomb.palette) && bomb.palette.length >= 4, `${bomb.id} palette`);
    assert.match(html, /burst\.className='board-burst fx-'\+effect\+' bomb-effect-'\+bomb\.id/, 'bomb renderer should select a unique effect class and skin ID');
    assert.match(html, /detail\.className='burst-signature signature-'\+effect/);
    assert.match(html, /const particleShape=\(\{fire:'flame',ice:'shard',toxic:'bubble',lightning:'bolt',void:'orb',pixel:'pixel',cosmic:'star',confetti:'confetti',plasma:'plasma',standard:'spark'\}\)\[effect\]/);
  }
  assert.match(css, /\.board-burst\{/);
  assert.match(css, /\.movement-trail\{/);
  assert.match(css, /\.elimination-fx\{/);
  assert.match(css, /\.confetti-piece\.celebration-symbol\{/);
  assert.match(css, /--num-8/);
  assert.match(css, /font-size:clamp\(12px,1\.35vw,20px\)/);
});


test('equipped bomb skin is used for revealed mine sprites and each bomb has its own explosion signature', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /const activeBombSkin=state\.onlineMode\?\(state\.onlineBombSkin\|\|'bomb-standard'\):\(profile\.equipped\.bomb\|\|'bomb-standard'\)/);
  assert.match(html, /mine-skin-'\+bombItem\.id/);
  assert.match(html, /width:clamp\(17px,1\.8vw,27px\);height:clamp\(17px,1\.8vw,27px\)/);
  assert.match(html, /burst\.dataset\.bombSkin=bomb\.id/);
  assert.match(html, /signatureCount=effect==='lightning'\?4:effect==='ice'\?6:effect==='void'\?2/);
  assert.match(html, /mine-fallback/); // asset failure retains a visible emoji fallback
  const effects = new Set(catalog.bomb.map(item => item.effect));
  for (const effect of ['standard','fire','ice','toxic','lightning','void','pixel','cosmic','confetti','plasma']) assert.ok(effects.has(effect), `missing bomb effect ${effect}`);
  for (const bomb of catalog.bomb) assert.ok(fs.existsSync(path.join(root, 'assets/mines', bomb.asset)), `missing bomb image ${bomb.asset}`);
  for (const effect of effects) assert.match(html, new RegExp('signature-' + effect + '[{\\.]'), `missing signature CSS for ${effect}`);
});
