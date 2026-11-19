import test from 'node:test';
import assert from 'node:assert/strict';
import {REFILL_SCREENS,refillCard} from './refill-flex-cards.mjs';
const theme={background:'#fff',text:'#111',primary:'#345',primaryText:'#fff',backBackground:'#eee',backText:'#111'};
for(const screen of REFILL_SCREENS)test(screen,()=>assert.equal(refillCard({screen,theme}).type,'flex'));
