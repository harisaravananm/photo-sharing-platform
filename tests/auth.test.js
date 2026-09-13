const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const TEST_DB = path.join(__dirname, 'test_auth.db');
if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
process.env.DB_PATH = TEST_DB;

const { db, initSchema, closeDb } = require('../db');
const { hashPassword, verifyPassword, hashPin, verifyPin, generateToken, verifyToken } = require('../auth');

test('🔐 Auth & Password Hashing Tests', async (t) => {
  await t.test('should correctly hash and verify password with salt', () => {
    const rawPwd = 'SecurePassword123!';
    const hash = hashPassword(rawPwd);

    assert.ok(hash.includes(':'), 'Hash must contain salt delimiter');
    assert.strictEqual(verifyPassword(rawPwd, hash), true, 'Valid password verification must succeed');
    assert.strictEqual(verifyPassword('WrongPassword', hash), false, 'Incorrect password verification must fail');
  });

  await t.test('should correctly hash and verify 6-digit gallery PIN', () => {
    const pin = '482917';
    const pinHash = hashPin(pin);

    assert.strictEqual(verifyPin('482917', pinHash), true, 'Correct PIN must verify');
    assert.strictEqual(verifyPin('000000', pinHash), false, 'Wrong PIN must fail');
  });

  await t.test('should generate and verify JWT token with expiration check', () => {
    const payload = { userId: 'usr_test1', role: 'ADMIN' };
    const token = generateToken(payload, 3600);

    const verified = verifyToken(token);
    assert.ok(verified, 'Decoded token payload must exist');
    assert.strictEqual(verified.userId, 'usr_test1');
    assert.strictEqual(verified.role, 'ADMIN');

    const tampered = token.slice(0, -4) + 'abcd';
    assert.strictEqual(verifyToken(tampered), null, 'Tampered token must fail verification');
  });
});

test('cleanup test database', () => {
  closeDb();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
});
