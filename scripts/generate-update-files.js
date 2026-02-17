const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Read package.json for version
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
const version = packageJson.version;

const releaseDir = path.join(__dirname, '../release');
const publicDir = path.join(__dirname, '../server/public/downloads');

// Ensure directories exist
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

function calculateSha512(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha512').update(buffer).digest('base64');
}

function getFileSize(filePath) {
  return fs.statSync(filePath).size;
}

// Generate latest.yml for Windows
const winExePath = path.join(releaseDir, 'blite-setup-win.exe');
if (fs.existsSync(winExePath)) {
  const sha512 = calculateSha512(winExePath);
  const size = getFileSize(winExePath);

  const winYml = `version: ${version}
files:
  - url: blite-setup-win.exe
    sha512: ${sha512}
    size: ${size}
path: blite-setup-win.exe
sha512: ${sha512}
releaseDate: ${new Date().toISOString()}
`;

  fs.writeFileSync(path.join(publicDir, 'latest.yml'), winYml);
  console.log('✓ Generated latest.yml for Windows');
}

// Generate latest-linux.yml for Linux
const linuxAppImagePath = path.join(releaseDir, 'blite-setup-linux.AppImage');
if (fs.existsSync(linuxAppImagePath)) {
  const sha512 = calculateSha512(linuxAppImagePath);
  const size = getFileSize(linuxAppImagePath);

  const linuxYml = `version: ${version}
files:
  - url: blite-setup-linux.AppImage
    sha512: ${sha512}
    size: ${size}
path: blite-setup-linux.AppImage
sha512: ${sha512}
releaseDate: ${new Date().toISOString()}
`;

  fs.writeFileSync(path.join(publicDir, 'latest-linux.yml'), linuxYml);
  console.log('✓ Generated latest-linux.yml for Linux');
}

// Generate latest-mac.yml for macOS
const macDmgPath = path.join(releaseDir, 'blite-setup-mac.dmg');
if (fs.existsSync(macDmgPath)) {
  const sha512 = calculateSha512(macDmgPath);
  const size = getFileSize(macDmgPath);

  const macYml = `version: ${version}
files:
  - url: blite-setup-mac.dmg
    sha512: ${sha512}
    size: ${size}
path: blite-setup-mac.dmg
sha512: ${sha512}
releaseDate: ${new Date().toISOString()}
`;

  fs.writeFileSync(path.join(publicDir, 'latest-mac.yml'), macYml);
  console.log('✓ Generated latest-mac.yml for macOS');
}

console.log('\n✓ Update files generated successfully!');
console.log(`Version: ${version}`);
console.log(`Location: ${publicDir}`);
