// The Expo app's pure logic must behave exactly like the PWA (app.js): stars, next unit, review, streak, progress
// format, and the parental gate.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { gateAccepts, gateQuestion } from '../app/src/logic/gate.ts';
import {
  emptyProgress, markWord, migrateLegacy, nextUnit, parseProgress, reviewList, starsFor, streak, tick, wordKey,
} from '../app/src/logic/progress.ts';

const catalog = JSON.parse(readFileSync('content/catalog.json', 'utf8'));

test('stars: ≤1 mistake → 3, ≤4 → 2, more → 1 (app.js win)', () => {
  assert.deepEqual([0, 1, 2, 4, 5, 9].map(starsFor), [3, 3, 2, 2, 1, 1]);
});

test('next unit: new children start at Book 1; Haitham continues in Book 2 at his unit', () => {
  assert.equal(nextUnit(catalog, { ...emptyProgress(), name: 'Amina' })?.unit.id, 'ar1-u01');
  assert.equal(nextUnit(catalog, { ...emptyProgress(), name: 'Haitham' })?.unit.id, 'ar2-u02');
  assert.equal(nextUnit(catalog, { ...emptyProgress(), name: ' هيثم ' })?.unit.id, 'ar2-u02');
  const done = { ...emptyProgress(), name: 'Amina', stars: { 'ar1-u01': 2 } };
  assert.equal(nextUnit(catalog, done)?.unit.id, 'ar1-u02', 'a unit with stars is skipped');
});

test('word progress is keyed by the owner lesson, so review lessons share their home lesson\'s stats', () => {
  assert.equal(wordKey('ar1-r01', { id: 'salam', from: 'ar1-u01' }), 'ar1-u01|salam');
  let p = markWord(emptyProgress(), 'ar1-r01', { id: 'salam', from: 'ar1-u01' }, false);
  p = markWord(p, 'ar1-u01', { id: 'salam' }, null);
  assert.deepEqual(p.words['ar1-u01|salam'], { seen: 1, right: 0, wrong: 1 });
  assert.deepEqual(reviewList(p), ['ar1-u01|salam']);
  assert.deepEqual(reviewList(markWord(markWord(p, 'ar1-u01', { id: 'salam' }, true), 'ar1-u01', { id: 'salam' }, true)), []);
});

test('learning time and the streak', () => {
  const d = (s: string) => new Date(`${s}T12:00:00Z`);
  let p = tick(emptyProgress(), 15, d('2026-10-20'));
  p = tick(p, 15, d('2026-10-21'));
  p = tick(p, 30, d('2026-10-22'));
  assert.equal(p.time['2026-10-22'], 30);
  assert.equal(streak(p, d('2026-10-22')), 3);
  assert.equal(streak(p, d('2026-10-24')), 0);
});

test('progress format: reads the PWA\'s saved data, survives corrupt data, carries Haitham\'s first stars', () => {
  const pwa = JSON.stringify({ name: 'Haitham', stars: { 'ar2-u01': 3 }, step: { 'ar2-u02': 2 }, words: {}, time: {}, days: [], last: 'ar2-u02' });
  assert.equal(parseProgress(pwa).stars['ar2-u01'], 3);
  assert.deepEqual(parseProgress('{not json'), emptyProgress());
  assert.equal(migrateLegacy(emptyProgress(), { stars: { '1': 2 } }).stars['prayer-l01'], 2);
});

test('parental gate: a written-out multiplication; only the right number opens the link', () => {
  let i = 0; const seq = [0.5, 0.2];
  const q = gateQuestion(() => seq[i++ % 2]!);
  assert.match(q.text, /^What is [a-z]+ times [a-z]+\?$/);
  assert.ok(gateAccepts(q, String(q.answer)));
  assert.ok(gateAccepts(q, ` ${q.answer} `));
  assert.ok(!gateAccepts(q, String(q.answer + 1)));
  assert.ok(!gateAccepts(q, `${q.answer}0`));
  assert.ok(!gateAccepts(q, ''));
  for (let k = 0; k < 200; k++) { const r = gateQuestion(); assert.ok(r.answer >= 18 && r.answer <= 108, 'never a trivial question'); }
});
