const fs = require('node:fs');
const path = require('node:path');
const out = process.env.OBSIDIAN_PLUGIN_OUTPUT_DIR || 'dist';
fs.mkdirSync(out, { recursive: true });
require('esbuild').buildSync({ entryPoints: ['plugin.cjs'], bundle: true, platform: 'node', format: 'cjs', external: ['obsidian', '@codemirror/state', '@codemirror/view', '@codemirror/language'], outfile: path.join(out, 'main.js') });
for (const name of ['manifest.json', 'styles.css']) fs.copyFileSync(name, path.join(out, name));
