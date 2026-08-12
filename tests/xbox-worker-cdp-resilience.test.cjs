const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync('xbox-worker.cjs', 'utf8');

test('CDP timeout rejects through the tracked pending request instead of an orphan promise', () => {
  assert.match(source, /const pending = \{[\s\S]*reject: \(error\) => \{[\s\S]*this\.pending\.delete\(id\)/);
  assert.match(source, /timer = setTimeout\(\(\) => pending\.reject\(new Error\(`\$\{method\} timed out`\)\), timeoutMs\)/);
  assert.doesNotMatch(source, /setTimeout\(\(\) => \{\s*this\.pending\.delete\(id\);\s*reject\(new Error\(`\$\{method\} timed out`\)\)/);
});

test('CDP send failures settle the same tracked promise', () => {
  assert.match(source, /try \{\s*this\.ws\.send\([\s\S]*\(error\) => \{\s*if \(error\) pending\.reject\(error\);/);
  assert.match(source, /catch \(error\) \{\s*pending\.reject\(error\);\s*\}/);
});

test('CDP connect timeout terminates the stale socket instead of leaving it alive', () => {
  assert.match(source, /CDP websocket timeout[\s\S]*terminate\(\)/);
});
