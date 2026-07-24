import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  hashPassword,
  verifyPassword,
} from '../src/security/password.ts';

describe('password hashing', () => {
  it('round-trips the correct password and rejects a different one', async () => {
    const encoded = await hashPassword('ValidPassword123');
    assert.equal(encoded.includes('ValidPassword123'), false);
    assert.equal(await verifyPassword('ValidPassword123', encoded), true);
    assert.equal(await verifyPassword('WrongPassword123', encoded), false);
  });

  it('rejects malformed hashes without throwing', async () => {
    assert.equal(await verifyPassword('anything', 'not-a-valid-hash'), false);
  });
});
