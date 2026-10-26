const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'analysis-image-storage-'));
process.env.AI_IMAGE_STORAGE_DIR = testDirectory;
const storage = require('../src/services/analysis-image.storage');

test('saves and reads an image through a generated filename, then removes it', async () => {
  const original = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const filename = await storage.save(original, 'image/jpeg');
  assert.match(filename, /^[0-9a-f-]+\.jpg$/i);
  const stored = await storage.read(filename);
  assert.equal(stored.mimeType, 'image/jpeg');
  assert.deepEqual(stored.buffer, original);
  await storage.remove(filename);
  await assert.rejects(storage.read(filename), (error) => error.status === 404);
});

test('rejects path traversal when reading or removing an image', async () => {
  await assert.rejects(storage.read('../secret.jpg'), (error) => error.status === 404);
  await storage.remove('../secret.jpg');
});

test.after(() => {
  fs.rmSync(testDirectory, { recursive: true, force: true });
});
