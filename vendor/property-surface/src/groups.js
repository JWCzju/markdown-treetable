function fieldGroups(raw, acceptsField = () => true) {
  if (!Array.isArray(raw)) return [];
  const ids = new Set(), members = new Set(), result = [];
  for (const group of raw) {
    if (!group || typeof group.id !== 'string' || !group.id || ids.has(group.id) ||
        typeof group.name !== 'string' || !group.name.trim() || !Array.isArray(group.fields)) continue;
    ids.add(group.id);
    const fields = group.fields.filter(field => typeof field === 'string' && acceptsField(field) &&
      !members.has(field) && !!members.add(field));
    if (fields.length) result.push({id:group.id, name:group.name.trim(), fields});
  }
  return result;
}

function groupedOrder(order, groups) {
  const emitted = new Set(), out = [];
  for (const field of order) {
    const group = groups.find(item => item.fields.includes(field));
    for (const member of group ? order.filter(item => group.fields.includes(item)) : [field]) {
      if (!emitted.has(member)) { emitted.add(member); out.push(member); }
    }
  }
  return out;
}

function contiguousGroups(keys, groups, fieldId = key => key) {
  const seen = new Set();
  let previous = '';
  for (const key of keys) {
    const id = groups.find(group => group.fields.includes(fieldId(key)))?.id || '';
    if (id && id !== previous && seen.has(id)) return false;
    if (id) seen.add(id);
    previous = id;
  }
  return true;
}

module.exports = {fieldGroups, groupedOrder, contiguousGroups};
