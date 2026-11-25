'use strict';

const fs = require('node:fs');
const path = require('node:path');
const catalog = require('../cosmetics.js');

const errors = [];
for (const category of ['flag', 'bomb']) {
  const folder = category === 'flag' ? 'flags' : 'mines';
  for (const item of catalog[category] || []) {
    if (!item.asset) {
      errors.push(`${category}/${item.id}: missing asset field`);
      continue;
    }
    if (!/^[a-z0-9-]+\.svg$/.test(item.asset)) {
      errors.push(`${category}/${item.id}: unsafe asset filename ${JSON.stringify(item.asset)}`);
      continue;
    }
    const filePath = path.join(__dirname, '..', 'assets', folder, item.asset);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      errors.push(`${category}/${item.id}: asset does not exist at assets/${folder}/${item.asset}`);
    }
  }
}
for (const item of catalog.skin || []) {
  if (!/^skin-[a-z0-9-]+$/.test(item.id)) {
    errors.push(`skin catalog has an unsafe/nonconforming ID: ${JSON.stringify(item.id)}`);
    continue;
  }
  const relativePath = `assets/skins/${item.id}.png`;
  const filePath = path.join(__dirname, '..', relativePath);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    errors.push(`skin/${item.id}: missing PNG at ${relativePath}`);
    continue;
  }
  const png = fs.readFileSync(filePath);
  if (png.length < 24 || png.toString('hex', 0, 8) !== '89504e470d0a1a0a') {
    errors.push(`skin/${item.id}: asset is not a valid PNG`);
    continue;
  }
  if (png.readUInt32BE(16) !== 512 || png.readUInt32BE(20) !== 512) {
    errors.push(`skin/${item.id}: expected 512x512 PNG, got ${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`);
  }
}

if (errors.length) {
  console.error('Static asset/catalog audit FAILED:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log('PASS: all catalog SVG assets exist; every skin PNG exists, is valid and measures 512x512.');
