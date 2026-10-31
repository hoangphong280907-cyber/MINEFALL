'use strict';

const fs = require('node:fs');
const vm = require('node:vm');

const htmlPath = 'index.html';
const html = fs.readFileSync(htmlPath, 'utf8');
const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
let checked = 0;
let match;

while ((match = scriptPattern.exec(html)) !== null) {
  const attributes = match[1] || '';
  const source = (match[2] || '').trim();
  if (/\bsrc\s*=/.test(attributes) || !source) continue;
  checked++;
  try {
    new vm.Script(source, { filename: `${htmlPath}:inline-script-${checked}.js` });
  } catch (error) {
    console.error(`Inline script ${checked} failed syntax check: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.exitCode) process.exit(process.exitCode);
if (checked === 0) {
  console.error(`No inline scripts found in ${htmlPath}; refusing to pass silently.`);
  process.exit(1);
}
console.log(`PASS: syntax checked ${checked} inline script block(s) in ${htmlPath}.`);
