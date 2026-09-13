const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const TEST_DB = path.join(__dirname, 'test_photos.db');
if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
process.env.DB_PATH = TEST_DB;

const { db, initSchema, closeDb } = require('../db');
const { savePhotoFile, getPhotoFilePath, deletePhotoFile } = require('../storage');

test('📷 Photo Storage & Metadata Unit Tests', async (t) => {
  initSchema();

  let savedSample = null;

  await t.test('should save photo file to disk storage and return metadata', () => {
    const sampleBuffer = Buffer.from('fake-image-data-binary-stream');
    savedSample = savePhotoFile({
      fileBuffer: sampleBuffer,
      originalName: 'wedding_portrait.jpg',
      mimeType: 'image/jpeg'
    });

    assert.ok(savedSample.photoId.startsWith('photo_'));
    assert.strictEqual(savedSample.mimeType, 'image/jpeg');
    assert.strictEqual(savedSample.fileSize, sampleBuffer.length);
    assert.ok(fs.existsSync(savedSample.storageLocation));
  });

  await t.test('should locate photo file path correctly', () => {
    const foundPath = getPhotoFilePath(savedSample.filename);
    assert.strictEqual(foundPath, savedSample.storageLocation);
  });

  await t.test('should delete photo file from disk storage', () => {
    const deleted = deletePhotoFile(savedSample.filename);
    assert.strictEqual(deleted, true);
    assert.strictEqual(fs.existsSync(savedSample.storageLocation), false);
  });
});

test('cleanup test database and storage', () => {
  closeDb();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
});
