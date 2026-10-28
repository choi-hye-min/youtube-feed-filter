const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const sourceDir = path.resolve(__dirname, '../src');
const manifest = JSON.parse(fs.readFileSync(path.join(sourceDir, 'manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3, 'The extension must use Manifest V3');
assert.equal(typeof manifest.version, 'string', 'The manifest must declare a version');

const references = new Set([
  manifest.background.service_worker,
  manifest.action.default_popup,
  ...Object.values(manifest.action.default_icon),
  ...Object.values(manifest.icons),
  ...manifest.content_scripts.flatMap(script => [...(script.js || []), ...(script.css || [])]),
  ...manifest.web_accessible_resources.flatMap(group => group.resources)
]);

for (const reference of references) {
  const filePath = path.resolve(sourceDir, reference);
  assert.ok(filePath.startsWith(`${sourceDir}${path.sep}`), `Manifest path must stay inside src: ${reference}`);
  assert.ok(fs.statSync(filePath).isFile(), `Manifest reference must be a file: ${reference}`);
}

const scripts = fs.readdirSync(sourceDir).filter(file => file.endsWith('.js'));
for (const script of scripts) {
  execFileSync(process.execPath, ['--check', path.join(sourceDir, script)], { stdio: 'inherit' });
}

if (process.env.EXTENSION_RELEASE_TAG !== undefined) {
  assert.equal(process.env.EXTENSION_RELEASE_TAG, `release-v${manifest.version}`,
    'The release tag must match the manifest version');
}

console.log(`Validated ${scripts.length} JavaScript files and ${references.size} manifest references (v${manifest.version}).`);
