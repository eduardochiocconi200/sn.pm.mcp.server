import gulp from 'gulp';
import { execSync } from 'node:child_process';
import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = 'build';
const DIST_DIR = 'dist';
const BUNDLE = join(OUT_DIR, 'bundle.js');
const TARGETS = 'node18-macos-x64,node18-macos-arm64,node18-win-x64';

const sh = (cmd) => execSync(cmd, { stdio: 'inherit' });

export const clean = (cb) => {
  rmSync(DIST_DIR, { recursive: true, force: true });
  rmSync(OUT_DIR, { recursive: true, force: true });
  cb();
};

export const bundle = (cb) => {
  mkdirSync(OUT_DIR, { recursive: true });
  sh(`npm run build`);
  sh(`npx esbuild dist/index.js --bundle --platform=node --target=node18 --format=cjs --outfile=${BUNDLE}`);
  cb();
};

export const pkgBin = (cb) => {
  sh(`pkg ${BUNDLE} --targets ${TARGETS} --out-path ${OUT_DIR}`);
  renameSync(join(OUT_DIR, 'bundle-macos-x64'),   join(OUT_DIR, 'pm-local-mcp-server-macos-x64'));
  renameSync(join(OUT_DIR, 'bundle-macos-arm64'), join(OUT_DIR, 'pm-local-mcp-server-macos-arm64'));
  renameSync(join(OUT_DIR, 'bundle-win-x64.exe'), join(OUT_DIR, 'pm-local-mcp-server-win-x64.exe'));
  cb();
};

export default gulp.series(bundle, pkgBin);
