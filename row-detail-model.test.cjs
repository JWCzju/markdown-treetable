const assert = require('node:assert/strict');
const {cellSpan, replaceCell, fieldInfo} = require('./row-detail-model.cjs');

assert.deepEqual(cellSpan('| A | B |', 1), {start:5, end:8});
assert.equal(replaceCell('| A | old | C |', 1, 'new'), '| A | new | C |');
assert.equal(replaceCell('| A | a\\|b | C |', 1, 'x|y'), '| A | x\\|y | C |');
assert.equal(replaceCell('A | old | C', 1, 'next'), 'A | next | C');
assert.equal(replaceCell('| A | old |', 1, 'first\nsecond'), '| A | first<br>second |');
assert.deepEqual(fieldInfo('交通 <!-- detail-group="住行" --> <!-- width=120 -->'), {label:'交通', group:'住行'});
