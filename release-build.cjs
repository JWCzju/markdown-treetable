const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

execFileSync(process.execPath, ['build.cjs'], {
  stdio: 'inherit',
  env: { ...process.env, OBSIDIAN_PLUGIN_OUTPUT_DIR: 'dist-store', TREETABLE_BUILD: 'store' }
});

for (const name of ['main.js', 'manifest.json', 'styles.css']) {
  fs.copyFileSync(`dist-store/${name}`, name);
}
