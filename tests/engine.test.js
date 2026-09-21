const test = require('node:test');
const assert = require('node:assert');
const { shuffle, pick, distribute, chooseUser } = require('../lib/engine');

test('shuffle keeps all items (deterministic rng)', () => {
  const ids = [1, 2, 3, 4, 5];
  const out = shuffle(ids, () => 0.5);
  assert.strictEqual(out.length, 5);
  assert.deepStrictEqual([...out].sort((a, b) => a - b), [1, 2, 3, 4, 5]);
  assert.deepStrictEqual(ids, [1, 2, 3, 4, 5], 'must not mutate input');
});

test('pick returns null on empty and element on non-empty', () => {
  assert.strictEqual(pick([], Math.random), null);
  assert.deepStrictEqual(pick(['x'], () => 0), 'x');
});

test('distribute splits deck fairly and keeps all projects', () => {
  const pool = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
  const out = distribute(pool, ['u1', 'u2']);
  const all = [...out.u1, ...out.u2].sort();
  assert.deepStrictEqual(all, pool.slice().sort());
  assert.strictEqual(out.u1.length, 4);
  assert.strictEqual(out.u2.length, 4);
});

test('distribute keeps all projects, assigns nothing without users', () => {
  const out = distribute(['a', 'b'], [], () => 0);
  assert.deepStrictEqual(out, {});
});

test('chooseUser prefers users with fewer active projects', () => {
  const users = [{ id: 'u1' }, { id: 'u2' }];
  const counts = { u1: 3, u2: 0 };
  assert.strictEqual(chooseUser(users, counts, () => 0).id, 'u2');
  assert.strictEqual(chooseUser(users, counts, () => 0.99).id, 'u2');
});

test('chooseUser skips disabled users', () => {
  const users = [{ id: 'u1' }, { id: 'u2', disabled: true }];
  const chosen = chooseUser(users, {}, () => 0.99);
  assert.ok(chosen, 'must return a user');
  assert.strictEqual(chosen.id, 'u1');
});

test('chooseUser returns null when all users disabled', () => {
  const users = [{ id: 'u1', disabled: true }, { id: 'u2', disabled: true }];
  assert.strictEqual(chooseUser(users, {}, Math.random), null);
});