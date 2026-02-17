const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const logoPath = path.join(__dirname, '../LOGO.png');
const buildDir = path.join(__dirname, '../build');
const publicDir = path.join(__dirname, '../public');

// Ensure directories exist
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

async function generateIcons() {
  console.log('🎨 Generating app icons from LOGO.png...\n');

  // First, trim the logo to remove excess whitespace, then add 10% padding
  const trimmedLogo = await sharp(logoPath)
    .trim()
    .toBuffer();

  const metadata = await sharp(trimmedLogo).metadata();
  const paddingPercent = 0.10; // 10% padding on each side
  const paddingSize = Math.floor(metadata.width * paddingPercent);

  const paddedLogo = await sharp(trimmedLogo)
    .extend({
      top: paddingSize,
      bottom: paddingSize,
      left: paddingSize,
      right: paddingSize,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .toBuffer();

  // Main icon for electron-builder (1024x1024)
  await sharp(paddedLogo)
    .resize(1024, 1024)
    .png()
    .toFile(path.join(buildDir, 'icon.png'));
  console.log('✓ Generated build/icon.png (1024x1024)');

  // Icon for macOS (512x512)
  await sharp(paddedLogo)
    .resize(512, 512)
    .png()
    .toFile(path.join(buildDir, 'icon@2x.png'));
  console.log('✓ Generated build/icon@2x.png (512x512)');

  // Icon for Windows (256x256)
  await sharp(paddedLogo)
    .resize(256, 256)
    .png()
    .toFile(path.join(buildDir, 'icon-256.png'));
  console.log('✓ Generated build/icon-256.png (256x256)');

  // Favicon sizes
  const faviconSizes = [16, 32, 64, 128];
  for (const size of faviconSizes) {
    await sharp(paddedLogo)
      .resize(size, size)
      .png()
      .toFile(path.join(publicDir, `favicon-${size}.png`));
    console.log(`✓ Generated public/favicon-${size}.png (${size}x${size})`);
  }

  // Main public logo (double size: 1000x1000)
  await sharp(paddedLogo)
    .resize(1000, 1000)
    .png()
    .toFile(path.join(publicDir, 'logo.png'));
  console.log('✓ Generated public/logo.png (1000x1000)');

  // Copy to server public directory
  const serverPublicDir = path.join(__dirname, '../server/public');
  if (!fs.existsSync(serverPublicDir)) {
    fs.mkdirSync(serverPublicDir, { recursive: true });
  }

  await sharp(paddedLogo)
    .resize(1000, 1000)
    .png()
    .toFile(path.join(serverPublicDir, 'logo.png'));
  console.log('✓ Generated server/public/logo.png (1000x1000)');

  for (const size of faviconSizes) {
    await sharp(paddedLogo)
      .resize(size, size)
      .png()
      .toFile(path.join(serverPublicDir, `favicon-${size}.png`));
  }
  console.log('✓ Copied favicons to server/public/');

  console.log('\n✅ All icons generated successfully!');
}

generateIcons().catch(err => {
  console.error('❌ Error generating icons:', err);
  process.exit(1);
});
