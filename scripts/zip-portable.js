/**
 * Creates a portable zip of the unpacked Electron app.
 * Uses Node.js archiver instead of PowerShell Compress-Archive to avoid corrupt zips.
 */
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const releaseDir = path.join(__dirname, '..', 'release');
const unpackedDir = path.join(releaseDir, 'win-unpacked');
const zipPath = path.join(releaseDir, 'blite-setup-win.zip');
const downloadsDir = path.join(__dirname, '..', 'downloads');

if (!fs.existsSync(unpackedDir)) {
  console.error('No release/win-unpacked directory found. Build the app first.');
  process.exit(1);
}

// Remove old zip
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

console.log('Creating portable zip from win-unpacked...');

const output = fs.createWriteStream(zipPath);
const archive = archiver('zip', { zlib: { level: 6 } });

output.on('close', () => {
  const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(1);
  console.log(`Created: ${zipPath} (${sizeMB} MB)`);

  // Copy to downloads
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir, { recursive: true });
  }
  fs.copyFileSync(zipPath, path.join(downloadsDir, 'blite-setup-win.zip'));
  console.log('Copied to downloads/blite-setup-win.zip');
});

archive.on('error', (err) => {
  console.error('Archiver error:', err);
  process.exit(1);
});

archive.pipe(output);
archive.directory(unpackedDir, false);
archive.finalize();
