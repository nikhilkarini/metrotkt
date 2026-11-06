const test = require('node:test');
const assert = require('node:assert/strict');
const TokenService = require('../src/services/tokenService');

test('Token Service - HMAC Signing and Verification', async (t) => {
  const secret = 'super_secret_test_key_12345';
  const tokenService = new TokenService(secret);

  const ticketId = 'TKT-TEST-UUID-001';
  const nonce = 'abcd1234ef567890';
  const futureExp = Math.floor(Date.now() / 1000) + 7200; // 2 hours in future

  await t.test('creates signed token in format payload.signature', () => {
    const token = tokenService.createSignedToken(ticketId, nonce, futureExp);
    const parts = token.split('.');
    assert.equal(parts.length, 2);

    const payloadJson = Buffer.from(parts[0], 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson);

    assert.equal(payload.tid, ticketId);
    assert.equal(payload.nonce, nonce);
    assert.equal(payload.exp, futureExp);
    // Crucial requirement: No fare or personal details in token
    assert.equal(payload.fare, undefined);
    assert.equal(payload.name, undefined);
  });

  await t.test('verifies a valid signed token', () => {
    const token = tokenService.createSignedToken(ticketId, nonce, futureExp);
    const res = tokenService.verifyToken(token);
    assert.equal(res.valid, true);
    assert.equal(res.payload.tid, ticketId);
    assert.equal(res.payload.nonce, nonce);
  });

  await t.test('rejects tampered signature', () => {
    const token = tokenService.createSignedToken(ticketId, nonce, futureExp);
    const [payload, sig] = token.split('.');
    const tamperedSig = sig.slice(0, -2) + 'aa';
    const tamperedToken = `${payload}.${tamperedSig}`;

    const res = tokenService.verifyToken(tamperedToken);
    assert.equal(res.valid, false);
    assert.match(res.reason, /signature verification failed/i);
  });

  await t.test('rejects tampered payload', () => {
    const token = tokenService.createSignedToken(ticketId, nonce, futureExp);
    const [, sig] = token.split('.');
    // Fake a different ticket ID
    const fakePayloadB64 = Buffer.from(JSON.stringify({
      tid: 'TKT-FORGED-999',
      nonce,
      exp: futureExp
    })).toString('base64url');

    const tamperedToken = `${fakePayloadB64}.${sig}`;
    const res = tokenService.verifyToken(tamperedToken);
    assert.equal(res.valid, false);
  });

  await t.test('rejects expired token', () => {
    const pastExp = Math.floor(Date.now() / 1000) - 300; // 5 mins in past
    const expiredToken = tokenService.createSignedToken(ticketId, nonce, pastExp);
    const res = tokenService.verifyToken(expiredToken, true);
    assert.equal(res.valid, false);
    assert.equal(res.expired, true);
    assert.match(res.reason, /expired/i);
  });
});
