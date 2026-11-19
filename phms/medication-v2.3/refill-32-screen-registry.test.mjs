import test from 'node:test';
import assert from 'node:assert/strict';
import {REFILL_32_SCREENS,assertRefillRegistry} from './refill-32-screen-registry.mjs';
test('refill manifest enumerates all 32 screens',()=>assert.equal(assertRefillRegistry(),true));
test('new screens never misrepresented as wired',()=>assert.ok(REFILL_32_SCREENS.every(x=>x.status==='NOT_WIRED')));
test('inventory labels use medication theme',()=>assert.equal(REFILL_32_SCREENS.find(x=>x.key==='labels').theme,'medication'));
