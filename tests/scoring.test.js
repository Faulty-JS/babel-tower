/**
 * Tests for shared/scoring.js — pattern matching, scoring, timing, and survival logic.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  patternsMatch,
  scorePattern,
  getBarDurationMs,
  getTimingRating,
  snapToGrid,
  checkSurvival,
} from '../shared/scoring.js';
import { TIMING, MOVE, SUBDIVISIONS } from '../shared/constants.js';

// ─── patternsMatch ──────────────────────────────────────────

describe('patternsMatch', () => {
  it('returns true for identical patterns', () => {
    const p = [
      { time: 0, move: MOVE.UP },
      { time: 600, move: MOVE.DOWN },
      { time: 1200, move: MOVE.LEFT },
    ];
    assert.equal(patternsMatch(p, p), true);
  });

  it('returns true when times differ within GOOD window', () => {
    const p1 = [{ time: 100, move: MOVE.UP }];
    const p2 = [{ time: 100 + TIMING.GOOD, move: MOVE.UP }];
    assert.equal(patternsMatch(p1, p2), true);
  });

  it('returns false when times differ beyond GOOD window', () => {
    const p1 = [{ time: 100, move: MOVE.UP }];
    const p2 = [{ time: 100 + TIMING.GOOD + 1, move: MOVE.UP }];
    assert.equal(patternsMatch(p1, p2), false);
  });

  it('returns false for different lengths', () => {
    const p1 = [{ time: 0, move: MOVE.UP }, { time: 600, move: MOVE.DOWN }];
    const p2 = [{ time: 0, move: MOVE.UP }];
    assert.equal(patternsMatch(p1, p2), false);
  });

  it('returns false for empty patterns', () => {
    assert.equal(patternsMatch([], []), false);
  });

  it('returns false when moves differ', () => {
    const p1 = [{ time: 100, move: MOVE.UP }];
    const p2 = [{ time: 100, move: MOVE.DOWN }];
    assert.equal(patternsMatch(p1, p2), false);
  });

  it('handles out-of-order beats', () => {
    const p1 = [
      { time: 600, move: MOVE.DOWN },
      { time: 0, move: MOVE.UP },
    ];
    const p2 = [
      { time: 5, move: MOVE.UP },
      { time: 610, move: MOVE.DOWN },
    ];
    assert.equal(patternsMatch(p1, p2), true);
  });

  it('does not double-match beats', () => {
    // Two UPs at the same time in p1, only one UP in p2
    const p1 = [
      { time: 100, move: MOVE.UP },
      { time: 110, move: MOVE.UP },
    ];
    const p2 = [
      { time: 105, move: MOVE.UP },
      { time: 105, move: MOVE.DOWN },
    ];
    assert.equal(patternsMatch(p1, p2), false);
  });

  it('matches a complex real-world-ish pattern', () => {
    const bar1 = [
      { time: 0, move: MOVE.UP },
      { time: 300, move: MOVE.DOWN },
      { time: 600, move: MOVE.LEFT },
      { time: 900, move: MOVE.RIGHT },
      { time: 1200, move: MOVE.UP },
    ];
    // Bar2 played ~80ms late on each beat (within GREAT window)
    const bar2 = bar1.map(b => ({ time: b.time + 80, move: b.move }));
    assert.equal(patternsMatch(bar1, bar2), true);
  });
});

// ─── scorePattern ───────────────────────────────────────────

describe('scorePattern', () => {
  it('scores perfect hits (within ±50ms)', () => {
    const target = [
      { time: 0, move: MOVE.UP },
      { time: 600, move: MOVE.DOWN },
    ];
    const inputs = [
      { time: 30, move: MOVE.UP },   // 30ms off = PERFECT
      { time: 590, move: MOVE.DOWN }, // 10ms off = PERFECT
    ];
    const result = scorePattern(target, inputs);
    assert.equal(result.perfectCount, 2);
    assert.equal(result.greatCount, 0);
    assert.equal(result.goodCount, 0);
    assert.equal(result.missCount, 0);
    assert.equal(result.score, 6); // 3 + 3
  });

  it('scores great hits (51–100ms)', () => {
    const target = [{ time: 500, move: MOVE.LEFT }];
    const inputs = [{ time: 500 + 80, move: MOVE.LEFT }]; // 80ms = GREAT
    const result = scorePattern(target, inputs);
    assert.equal(result.greatCount, 1);
    assert.equal(result.score, 2);
  });

  it('scores good hits (101–150ms)', () => {
    const target = [{ time: 500, move: MOVE.RIGHT }];
    const inputs = [{ time: 500 + 130, move: MOVE.RIGHT }]; // 130ms = GOOD
    const result = scorePattern(target, inputs);
    assert.equal(result.goodCount, 1);
    assert.equal(result.score, 1);
  });

  it('scores misses (>150ms or wrong move)', () => {
    const target = [{ time: 500, move: MOVE.UP }];
    const inputs = [{ time: 500 + 200, move: MOVE.UP }]; // 200ms = MISS
    const result = scorePattern(target, inputs);
    assert.equal(result.missCount, 1);
    assert.equal(result.score, 0);
  });

  it('scores no inputs as all misses', () => {
    const target = [
      { time: 0, move: MOVE.UP },
      { time: 600, move: MOVE.DOWN },
    ];
    const result = scorePattern(target, []);
    assert.equal(result.missCount, 2);
    assert.equal(result.score, 0);
  });

  it('ignores extra inputs', () => {
    const target = [{ time: 500, move: MOVE.UP }];
    const inputs = [
      { time: 100, move: MOVE.DOWN },  // extra, no match
      { time: 500, move: MOVE.UP },    // matches target
      { time: 800, move: MOVE.LEFT },  // extra
    ];
    const result = scorePattern(target, inputs);
    assert.equal(result.perfectCount, 1);
    assert.equal(result.missCount, 0);
    assert.equal(result.score, 3);
  });

  it('does not double-use an input for multiple target beats', () => {
    const target = [
      { time: 500, move: MOVE.UP },
      { time: 510, move: MOVE.UP },
    ];
    const inputs = [
      { time: 505, move: MOVE.UP }, // only one input for two targets
    ];
    const result = scorePattern(target, inputs);
    assert.equal(result.perfectCount, 1);
    assert.equal(result.missCount, 1);
    assert.equal(result.score, 3);
  });

  it('handles wrong move as miss even if timing is perfect', () => {
    const target = [{ time: 500, move: MOVE.UP }];
    const inputs = [{ time: 500, move: MOVE.DOWN }];
    const result = scorePattern(target, inputs);
    assert.equal(result.missCount, 1);
    assert.equal(result.score, 0);
  });

  it('handles boundary at exactly PERFECT window', () => {
    const target = [{ time: 500, move: MOVE.UP }];
    const inputs = [{ time: 500 + TIMING.PERFECT, move: MOVE.UP }];
    const result = scorePattern(target, inputs);
    assert.equal(result.perfectCount, 1);
  });

  it('handles boundary at PERFECT+1 → GREAT', () => {
    const target = [{ time: 500, move: MOVE.UP }];
    const inputs = [{ time: 500 + TIMING.PERFECT + 1, move: MOVE.UP }];
    const result = scorePattern(target, inputs);
    assert.equal(result.greatCount, 1);
  });

  it('handles boundary at exactly GREAT window', () => {
    const target = [{ time: 500, move: MOVE.UP }];
    const inputs = [{ time: 500 + TIMING.GREAT, move: MOVE.UP }];
    const result = scorePattern(target, inputs);
    assert.equal(result.greatCount, 1);
  });

  it('handles boundary at GREAT+1 → GOOD', () => {
    const target = [{ time: 500, move: MOVE.UP }];
    const inputs = [{ time: 500 + TIMING.GREAT + 1, move: MOVE.UP }];
    const result = scorePattern(target, inputs);
    assert.equal(result.goodCount, 1);
  });

  it('handles boundary at exactly GOOD window', () => {
    const target = [{ time: 500, move: MOVE.UP }];
    const inputs = [{ time: 500 + TIMING.GOOD, move: MOVE.UP }];
    const result = scorePattern(target, inputs);
    assert.equal(result.goodCount, 1);
  });

  it('handles boundary at GOOD+1 → MISS', () => {
    const target = [{ time: 500, move: MOVE.UP }];
    const inputs = [{ time: 500 + TIMING.GOOD + 1, move: MOVE.UP }];
    const result = scorePattern(target, inputs);
    assert.equal(result.missCount, 1);
  });
});

// ─── getBarDurationMs ───────────────────────────────────────

describe('getBarDurationMs', () => {
  it('calculates correctly at 100 BPM', () => {
    // 4 beats / 100 bpm * 60000 = 2400ms
    assert.equal(getBarDurationMs(100), 2400);
  });

  it('calculates correctly at 120 BPM', () => {
    assert.equal(getBarDurationMs(120), 2000);
  });

  it('calculates correctly at 200 BPM', () => {
    assert.equal(getBarDurationMs(200), 1200);
  });

  it('calculates correctly at 60 BPM', () => {
    assert.equal(getBarDurationMs(60), 4000);
  });
});

// ─── getTimingRating ────────────────────────────────────────

describe('getTimingRating', () => {
  const pattern = [
    { time: 0, move: MOVE.UP },
    { time: 600, move: MOVE.DOWN },
    { time: 1200, move: MOVE.LEFT },
  ];

  it('returns PERFECT for exact hit', () => {
    assert.equal(getTimingRating(0, MOVE.UP, pattern), 'PERFECT');
  });

  it('returns PERFECT within 50ms', () => {
    assert.equal(getTimingRating(45, MOVE.UP, pattern), 'PERFECT');
  });

  it('returns GREAT for 51-100ms offset', () => {
    assert.equal(getTimingRating(80, MOVE.UP, pattern), 'GREAT');
  });

  it('returns GOOD for 101-150ms offset', () => {
    assert.equal(getTimingRating(140, MOVE.UP, pattern), 'GOOD');
  });

  it('returns MISS for >150ms offset', () => {
    assert.equal(getTimingRating(200, MOVE.UP, pattern), 'MISS');
  });

  it('returns MISS for wrong move even at exact time', () => {
    assert.equal(getTimingRating(0, MOVE.DOWN, pattern), 'MISS');
    // 0ms is exact for UP but DOWN's nearest is at 600ms → 600ms delta → MISS
  });

  it('finds the closest matching beat', () => {
    // At time 580, closest DOWN is at 600 → 20ms = PERFECT
    assert.equal(getTimingRating(580, MOVE.DOWN, pattern), 'PERFECT');
  });

  it('returns MISS for empty pattern', () => {
    assert.equal(getTimingRating(500, MOVE.UP, []), 'MISS');
  });
});

// ─── snapToGrid ─────────────────────────────────────────────

describe('snapToGrid', () => {
  const barDuration = 2400; // 100 BPM
  const subdivs = 8;
  // Each subdivision = 300ms

  it('snaps to nearest subdivision', () => {
    assert.equal(snapToGrid(0, barDuration, subdivs), 0);
    assert.equal(snapToGrid(140, barDuration, subdivs), 0);
    assert.equal(snapToGrid(160, barDuration, subdivs), 300);
    assert.equal(snapToGrid(300, barDuration, subdivs), 300);
    assert.equal(snapToGrid(450, barDuration, subdivs), 600);
  });

  it('clamps to valid range — does not snap past last slot', () => {
    // barDuration = 2400, last valid slot = 2400 - 300 = 2100
    assert.equal(snapToGrid(2400, barDuration, subdivs), 2100);
    assert.equal(snapToGrid(2300, barDuration, subdivs), 2100);
    assert.equal(snapToGrid(3000, barDuration, subdivs), 2100);
  });

  it('clamps negative values to 0', () => {
    assert.equal(snapToGrid(-100, barDuration, subdivs), 0);
  });

  it('works with different BPMs', () => {
    const fastBar = 1200; // 200 BPM, each subdiv = 150ms
    assert.equal(snapToGrid(80, fastBar, subdivs), 150);
    assert.equal(snapToGrid(70, fastBar, subdivs), 0);
  });
});

// ─── checkSurvival ──────────────────────────────────────────

describe('checkSurvival', () => {
  it('survives with 100% hits', () => {
    assert.equal(checkSurvival(4, 4, 0, 0), true);
  });

  it('survives with exactly 60% hits', () => {
    // 5 beats, 60% = 3 needed
    assert.equal(checkSurvival(5, 1, 1, 1, 2), true);
  });

  it('fails with less than 60% hits', () => {
    // 5 beats, need 3, only have 2
    assert.equal(checkSurvival(5, 1, 1, 0), false);
  });

  it('survives with all perfect', () => {
    assert.equal(checkSurvival(3, 3, 0, 0), true);
  });

  it('survives with all good (minimum quality)', () => {
    assert.equal(checkSurvival(3, 0, 0, 3), true);
  });

  it('fails with all misses', () => {
    assert.equal(checkSurvival(4, 0, 0, 0), false);
  });

  it('handles single beat pattern', () => {
    // 1 beat, need ceil(0.6) = 1 hit
    assert.equal(checkSurvival(1, 1, 0, 0), true);
    assert.equal(checkSurvival(1, 0, 0, 0), false);
  });

  it('handles edge case: 2 beats', () => {
    // 2 beats, need ceil(1.2) = 2 hits
    assert.equal(checkSurvival(2, 2, 0, 0), true);
    assert.equal(checkSurvival(2, 1, 0, 0), false);
  });
});
