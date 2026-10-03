const fs = require('node:fs');
const path = require('node:path');
const out = process.env.OBSIDIAN_PLUGIN_OUTPUT_DIR || 'dist';
fs.mkdirSync(out, { recursive: true });
require('esbuild').buildSync({ entryPoints: ['plugin.cjs'], bundle: true, platform: 'node', format: 'cjs', external: ['obsidian', '@codemirror/state', '@codemirror/view', '@codemirror/language', '@codemirror/commands'], outfile: path.join(out, 'main.js') });
fs.copyFileSync('manifest.json', path.join(out, 'manifest.json'));
fs.writeFileSync(path.join(out, 'styles.css'),
  fs.readFileSync(require.resolve('@my/property-surface/styles.css'), 'utf8') + '\n' + fs.readFileSync('styles.css', 'utf8'));
