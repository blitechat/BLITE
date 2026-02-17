/**
 * Copy built Electron installers from release/ to downloads/
 * for deployment. Run after electron-builder finishes.
 */
const fs = require('fs');
const path = require('path');

const releaseDir = path.join(__dirname, '..', 'release');
const downloadsDir = path.join(__dirname, '..', 'server', 'public', 'downloads');

// Ensure downloads directory exists
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

// Map of expected output files
const artifacts = [
  'blite-setup-win.exe',
  'blite-setup-win.zip',
  'blite-setup-mac.dmg',
  'blite-setup-linux.AppImage',
];

let copied = 0;

if (!fs.existsSync(releaseDir)) {
  console.log('No release/ directory found. Run npm run build:installer first.');
  process.exit(1);
}

const files = fs.readdirSync(releaseDir);

for (const artifact of artifacts) {
  const found = files.find(f => f === artifact);
  if (found) {
    const src = path.join(releaseDir, found);
    const dest = path.join(downloadsDir, found);
    fs.copyFileSync(src, dest);
    console.log(`Copied: ${found} -> downloads/${found}`);
    copied++;
  }
}

if (copied === 0) {
  console.log('No installer artifacts found in release/. Available files:');
  files.forEach(f => console.log(`  ${f}`));
} else {
  console.log(`\nDone! ${copied} installer(s) copied to downloads/`);
}
