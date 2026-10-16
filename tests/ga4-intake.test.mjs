import test from 'node:test';
import assert from 'node:assert/strict';
import { ga4Context } from '../src/lib/ga4-intake.ts';
test('Google context allows only numeric identifiers, never arbitrary contact fields',()=>{
 assert.deepEqual(ga4Context({clientId:'123.456',sessionId:'789',email:'private@example.invalid'}),{clientId:'123.456',sessionId:'789'});
 assert.equal(ga4Context({clientId:'private@example.invalid'}),null);
 assert.equal(ga4Context(null),null);
 assert.deepEqual(ga4Context({clientId:'123.456',sessionId:'bad'}),{clientId:'123.456'});
});
