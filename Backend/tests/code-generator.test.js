const test = require('node:test');
const assert = require('node:assert/strict');
const { createWithSequentialCode, formatSequentialCode } = require('../src/services/code-generator');

test('formats sequential Node and Device identifiers with minimum three digits', () => {
  assert.equal(formatSequentialCode('NODE', 1), 'NODE-001');
  assert.equal(formatSequentialCode('NODE', 10), 'NODE-010');
  assert.equal(formatSequentialCode('DEV', 999), 'DEV-999');
  assert.equal(formatSequentialCode('DEV', 1000), 'DEV-1000');
});

test('creates a record and updates its code from AUTO_INCREMENT id in one transaction', async () => {
  const calls = [];
  const transaction = { id: 'test-transaction' };
  const Model = {
    sequelize: {
      transaction: async (callback) => callback(transaction),
    },
    create: async (values, options) => {
      calls.push({ type: 'create', values, options });
      return {
        id: 10,
        update: async (changes, updateOptions) => {
          calls.push({ type: 'update', changes, options: updateOptions });
          return { id: 10, ...values, ...changes };
        },
      };
    },
  };
  const result = await createWithSequentialCode({
    prefix: 'NODE', Model, field: 'nodeCode', values: { name: 'Greenhouse A' },
  });
  assert.equal(result.code, 'NODE-010');
  assert.equal(calls[0].values.name, 'Greenhouse A');
  assert.match(calls[0].values.nodeCode, /^NODE-PENDING-[A-F0-9]{16}$/);
  assert.equal(calls[1].changes.nodeCode, 'NODE-010');
  assert.equal(calls[0].options.transaction, transaction);
  assert.equal(calls[1].options.transaction, transaction);
});

test('rejects invalid ids instead of producing malformed identifiers', () => {
  assert.throws(() => formatSequentialCode('NODE', 0));
  assert.throws(() => formatSequentialCode('NODE', -1));
});
