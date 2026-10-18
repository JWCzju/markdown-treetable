function fencedCell(source) {
  if (!source || !/<br\s*\/?>/i.test(source)) return null;
  const text = source.replace(/<br\s*\/?>/gi, '\n');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    const opener = /^ {0,3}(`{3,}|~{3,})([^\n]*)$/.exec(lines[i]);
    if (!opener) continue;
    const marker = opener[1];
    if (marker[0] === '`' && opener[2].includes('`')) continue;
    const closed = lines.slice(i + 1).some(line => {
      const closing = line.trim();
      return closing.length >= marker.length && [...closing].every(char => char === marker[0]);
    });
    if (closed) return text;
  }
  return null;
}

module.exports = { fencedCell };
