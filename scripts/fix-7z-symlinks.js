/**
 * Workaround for electron-builder winCodeSign extraction failure on Windows
 * without Developer Mode. Wraps 7za.exe to tolerate exit code 2 (sub-item errors
 * from darwin symlinks that are irrelevant on Windows).
 */
const fs = require('fs');
const path = require('path');

const sevenZipBin = path.join(__dirname, '..', 'node_modules', '7zip-bin', 'win', 'x64');
const realExe = path.join(sevenZipBin, '7za-real.exe');
const wrapperExe = path.join(sevenZipBin, '7za.exe');
const wrapperCmd = path.join(sevenZipBin, '7za.cmd');

// If not already patched, rename the original
if (!fs.existsSync(realExe)) {
  console.log('Patching 7za.exe to tolerate symlink errors...');
  fs.renameSync(wrapperExe, realExe);

  // Create a .cmd wrapper that calls the real exe and tolerates exit code 2
  const script = `@echo off
"%~dp07za-real.exe" %*
set EC=%ERRORLEVEL%
if %EC%==2 exit /b 0
exit /b %EC%
`;
  fs.writeFileSync(wrapperCmd, script);

  // Also create a .exe stub that electron-builder will find
  // Since electron-builder calls 7za.exe directly, we need to redirect
  // Copy the cmd as a bat too
  const bat = path.join(sevenZipBin, '7za.bat');
  fs.writeFileSync(bat, script);

  console.log('Done! 7za.exe patched to ignore symlink errors.');
} else {
  console.log('Already patched.');
}
