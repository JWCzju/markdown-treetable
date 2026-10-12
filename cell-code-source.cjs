function fencedCell(source) {
  if (!source || !/<br\s*\/?>/i.test(source)) return null;
  const text = source.trim().replace(/<br\s*\/?>/gi, '\n');
  const lines = text.split('\n');
  const opener = /^(`{3,}|~{3,})([^\n]*)$/.exec(lines[0]);
  if (!opener || lines.length < 3) return null;
  const marker = opener[1];
  if (marker[0] === '`' && opener[2].includes('`')) return null;
  const closing = lines.at(-1).trim();
  if (closing.length < marker.length || [...closing].some(char => char !== marker[0])) return null;
  return text;
}

module.exports = { fencedCell };
