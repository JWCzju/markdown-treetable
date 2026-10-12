function node(text) {
  const m = /^(\s*(?:>+[+-]?\s+)?)([-+*]|\d+[.)]) (.*)$/.exec(text);
  return m && { indent: m[1], depth: /^\s*/.exec(m[1])[0].replace(/\t/g, '    ').length, marker: m[2], body: m[3], task: /^\[[ xX]\](?:\s|$)/.test(m[3]), checked: /^\[[xX]\]/.test(m[3]) };
}

function continuationContexts(lines) {
  let current = null;
  return lines.map(text => {
    const item = node(text);
    if (item) {
      current = { depth: item.depth };
      return null;
    }
    if (!current || !text.trim()) return null;
    const leading = /^\s*/.exec(text)[0];
    const indent = leading.replace(/\t/g, '    ').length;
    if (indent >= current.depth + 2) return { depth: current.depth, skip: leading.length };
    current = null;
    return null;
  });
}

module.exports = { node, continuationContexts };
