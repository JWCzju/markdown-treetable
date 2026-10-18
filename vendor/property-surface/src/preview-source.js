// Property text follows the editor's visible line boundaries. A flush-left
// prose line after a list is a new block, not CommonMark's lazy continuation.
// This is a render-only adaptation; never write it back to YAML.
function previewSource(source) {
  const out = []; let inList = false, fence = null;
  for (const line of source.split('\n')) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      out.push(line);
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && /^ {0,3}(?:`+|~+)\s*$/.test(line)) fence = null;
      continue;
    }
    if (marker) { fence = marker[1]; inList = false; out.push(line); continue; }
    const list = /^[ \t]*(?:[-+*]|\d+[.)])\s/.test(line);
    if (inList && /\S/.test(line) && !/^[ \t]/.test(line) && !list) out.push('');
    if (!line.trim() || (!list && !/^[ \t]/.test(line))) inList = false;
    if (list) inList = true;
    out.push(line);
  }
  return out.join('\n');
}
module.exports = { previewSource };
