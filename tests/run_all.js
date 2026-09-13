const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

console.log('🚀 Running Full Suite for Trizen Photo Sharing Platform...\n');

// 1. Auth & Password Tests
const { hashPassword, verifyPassword, hashPin, verifyPin, generateToken, verifyToken } = require('../auth');

console.log('1️⃣ Testing Auth & Password Hashing...');
const pwdHash = hashPassword('Secret123');
assert.strictEqual(verifyPassword('Secret123', pwdHash), true);
assert.strictEqual(verifyPassword('Wrong', pwdHash), false);

const pinHash = hashPin('482917');
assert.strictEqual(verifyPin('482917', pinHash), true);
assert.strictEqual(verifyPin('000000', pinHash), false);

const token = generateToken({ userId: 'u1', role: 'ADMIN' });
const verified = verifyToken(token);
assert.strictEqual(verified.userId, 'u1');
assert.strictEqual(verified.role, 'ADMIN');
console.log('  ✅ Auth & Password tests PASSED\n');

// 2. Storage & Photo Upload Tests
const { savePhotoFile, getPhotoFilePath, deletePhotoFile } = require('../storage');

console.log('2️⃣ Testing Photo Object Storage...');
const buf = Buffer.from('fake-photo-binary');
const saved = savePhotoFile({ fileBuffer: buf, originalName: 'test.jpg', mimeType: 'image/jpeg' });
assert.ok(saved.photoId);
assert.ok(fs.existsSync(saved.storageLocation));

const pathFound = getPhotoFilePath(saved.filename);
assert.strictEqual(pathFound, saved.storageLocation);

deletePhotoFile(saved.filename);
assert.strictEqual(fs.existsSync(saved.storageLocation), false);
console.log('  ✅ Photo Storage tests PASSED\n');

// 3. Integration & Server Tests
const TEST_DB = path.join(__dirname, 'test_run_all.db');
if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
process.env.DB_PATH = TEST_DB;
process.env.PORT = '3008';

const server = require('../server');
const { runSeed } = require('../seed');
const { closeDb } = require('../db');

function makeRequest(pathStr, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(`http://localhost:3008${pathStr}`, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runIntegrationTests() {
  console.log('3️⃣ Testing Server & Customer Gallery PIN Workflows...');
  runSeed();
  await new Promise(r => server.listen(3008, r));

  // Meta
  const metaRes = await makeRequest('/api/public/gallery/abc123/meta');
  assert.strictEqual(metaRes.status, 200);
  assert.strictEqual(metaRes.data.title, 'Arjun & Priya Wedding');
  assert.strictEqual(metaRes.data.photo_count, 600);

  // Wrong PIN -> 401
  const wrongPinRes = await makeRequest('/api/public/gallery/abc123/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { pin: '000000' });
  assert.strictEqual(wrongPinRes.status, 401);
  assert.strictEqual(wrongPinRes.data.error, 'Incorrect PIN. Access denied.');

  // Correct PIN -> 200 + token
  const correctPinRes = await makeRequest('/api/public/gallery/abc123/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { pin: '482917' });
  assert.strictEqual(correctPinRes.status, 200);
  assert.ok(correctPinRes.data.gallery_token);

  // Fetch photos with token
  const photosRes = await makeRequest('/api/public/gallery/abc123/photos', {
    method: 'GET',
    headers: { 'X-Gallery-Token': correctPinRes.data.gallery_token }
  });
  assert.strictEqual(photosRes.status, 200);
  assert.strictEqual(photosRes.data.photos.length, 600);

  console.log('  ✅ Integration & PIN Protected Gallery tests PASSED\n');
  console.log('🎉 ALL TEST SUITES PASSED SUCCESSFULLY!');

  closeDb();
  server.close();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  process.exit(0);
}

runIntegrationTests().catch(err => {
  console.error('❌ Test Failure:', err);
  process.exit(1);
});
