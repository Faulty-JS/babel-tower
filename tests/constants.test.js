/**
 * Tests for shared/constants.js — validates game constants are sane.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TIMING, MOVE, MOVE_KEYS, PHASE, NEON_COLORS,
  STARTING_BPM, BPM_INCREMENT, MAX_BPM,
  BEATS_PER_BAR, SUBDIVISIONS, MAX_PLAYERS,
  MIN_PLAYERS_TO_START, COUNTDOWN_SECONDS, RESULTS_DURATION_MS,
} from '../shared/constants.js';

describe('TIMING windows', () => {
  it('PERFECT < GREAT < GOOD', () => {
    assert.ok(TIMING.PERFECT < TIMING.GREAT);
    assert.ok(TIMING.GREAT < TIMING.GOOD);
  });

  it('all windows are positive', () => {
    assert.ok(TIMING.PERFECT > 0);
    assert.ok(TIMING.GREAT > 0);
    assert.ok(TIMING.GOOD > 0);
  });

  it('windows are reasonable (< 500ms)', () => {
    assert.ok(TIMING.GOOD < 500);
  });
});

describe('MOVE constants', () => {
  it('has 5 values (NONE + 4 directions)', () => {
    assert.equal(Object.keys(MOVE).length, 5);
  });

  it('NONE is 0', () => {
    assert.equal(MOVE.NONE, 0);
  });

  it('directions are 1-4', () => {
    const dirs = [MOVE.UP, MOVE.DOWN, MOVE.LEFT, MOVE.RIGHT];
    assert.deepEqual(dirs.sort(), [1, 2, 3, 4]);
  });
});

describe('MOVE_KEYS mapping', () => {
  it('maps arrow keys to moves', () => {
    assert.equal(MOVE_KEYS.ArrowUp, MOVE.UP);
    assert.equal(MOVE_KEYS.ArrowDown, MOVE.DOWN);
    assert.equal(MOVE_KEYS.ArrowLeft, MOVE.LEFT);
    assert.equal(MOVE_KEYS.ArrowRight, MOVE.RIGHT);
  });

  it('maps WASD keys to moves', () => {
    assert.equal(MOVE_KEYS.w, MOVE.UP);
    assert.equal(MOVE_KEYS.a, MOVE.LEFT);
    assert.equal(MOVE_KEYS.s, MOVE.DOWN);
    assert.equal(MOVE_KEYS.d, MOVE.RIGHT);
  });

  it('maps uppercase WASD too', () => {
    assert.equal(MOVE_KEYS.W, MOVE.UP);
    assert.equal(MOVE_KEYS.A, MOVE.LEFT);
    assert.equal(MOVE_KEYS.S, MOVE.DOWN);
    assert.equal(MOVE_KEYS.D, MOVE.RIGHT);
  });
});

describe('PHASE enum', () => {
  it('has all required phases', () => {
    const required = ['LOBBY', 'COUNTDOWN', 'COUNTIN', 'CALLING_BAR1',
      'CALLING_BAR2', 'RESPONDING', 'JUDGING', 'RESULTS', 'GAME_OVER'];
    for (const phase of required) {
      assert.ok(PHASE[phase] !== undefined, `Missing phase: ${phase}`);
    }
  });

  it('all phases are unique strings', () => {
    const values = Object.values(PHASE);
    const unique = new Set(values);
    assert.equal(values.length, unique.size, 'Phase values must be unique');
    for (const v of values) {
      assert.equal(typeof v, 'string');
    }
  });
});

describe('BPM settings', () => {
  it('starting BPM is positive', () => {
    assert.ok(STARTING_BPM > 0);
  });

  it('max BPM is reachable', () => {
    assert.ok(MAX_BPM >= STARTING_BPM);
  });

  it('increment is positive', () => {
    assert.ok(BPM_INCREMENT > 0);
  });

  it('BPM range allows multiple rounds', () => {
    const rounds = Math.floor((MAX_BPM - STARTING_BPM) / BPM_INCREMENT);
    assert.ok(rounds >= 5, `Should allow at least 5 rounds, got ${rounds}`);
  });
});

describe('NEON_COLORS', () => {
  it('has enough colors for a full lobby', () => {
    assert.ok(NEON_COLORS.length >= 10);
  });

  it('all colors are valid hex strings', () => {
    for (const color of NEON_COLORS) {
      assert.match(color, /^#[0-9A-Fa-f]{6}$/, `Invalid color: ${color}`);
    }
  });

  it('colors are unique', () => {
    const unique = new Set(NEON_COLORS);
    assert.equal(NEON_COLORS.length, unique.size, 'Colors must be unique');
  });
});

describe('game settings', () => {
  it('SUBDIVISIONS divides evenly into bar', () => {
    assert.equal(SUBDIVISIONS % BEATS_PER_BAR, 0);
  });

  it('COUNTDOWN_SECONDS is reasonable', () => {
    assert.ok(COUNTDOWN_SECONDS >= 1 && COUNTDOWN_SECONDS <= 10);
  });

  it('RESULTS_DURATION_MS is reasonable', () => {
    assert.ok(RESULTS_DURATION_MS >= 1000 && RESULTS_DURATION_MS <= 10000);
  });

  it('MIN_PLAYERS_TO_START is at least 1', () => {
    assert.ok(MIN_PLAYERS_TO_START >= 1);
  });

  it('MAX_PLAYERS is greater than MIN_PLAYERS_TO_START', () => {
    assert.ok(MAX_PLAYERS >= MIN_PLAYERS_TO_START);
  });
});
