const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const TEST_DB = path.join(__dirname, 'test_gallery.db');
if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
process.env.DB_PATH = TEST_DB;
process.env.PORT = '3005';

const server = require('../server');
const { runSeed } = require('../seed');
const { closeDb } = require('../db');

function makeRequest(pathStr, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(`http://localhost:3005${pathStr}`, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data, headers: res.headers });
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

test('🖼️ Gallery Publishing & PIN Verification Integration Tests', async (t) => {
  runSeed();
  await new Promise(r => server.listen(3005, r));

  await t.test('should fetch public metadata for published gallery abc123', async () => {
    const res = await makeRequest('/api/public/gallery/abc123/meta');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.title, 'Arjun & Priya Wedding');
    assert.strictEqual(res.data.photo_count, 600);
  });

  await t.test('should reject access with INCORRECT PIN (401 Unauthorized)', async () => {
    const res = await makeRequest('/api/public/gallery/abc123/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { pin: '999999' });

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.data.error, 'Incorrect PIN. Access denied.');
  });

  await t.test('should grant access with CORRECT PIN 482917', async () => {
    const res = await makeRequest('/api/public/gallery/abc123/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { pin: '482917' });

    assert.strictEqual(res.status, 200);
    assert.ok(res.data.gallery_token, 'Response must return valid gallery access token');

    const token = res.data.gallery_token;
    const photosRes = await makeRequest('/api/public/gallery/abc123/photos', {
      method: 'GET',
      headers: { 'X-Gallery-Token': token }
    });

    assert.strictEqual(photosRes.status, 200);
    assert.strictEqual(photosRes.data.photos.length, 600);
  });

  await t.test('should deny fetching photos without valid gallery token', async () => {
    const res = await makeRequest('/api/public/gallery/abc123/photos');
    assert.strictEqual(res.status, 401);
  });

  await new Promise(r => server.close(r));
});

test('cleanup integration test database', () => {
  closeDb();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
});
