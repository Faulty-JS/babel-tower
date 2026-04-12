/**
 * Scoring & pattern matching — pure functions extracted from GameRoom
 * for testability. Used by both server (game-room.js) and tests.
 */

import { TIMING, BEATS_PER_BAR } from './constants.js';

/**
 * Check if two patterns match within timing tolerance.
 * Both must have the same number of beats, and each beat in p1
 * must pair with a beat in p2 (same move, time within GOOD window).
 */
export function patternsMatch(pattern1, pattern2) {
  if (pattern1.length !== pattern2.length) return false;
  if (pattern1.length === 0) return false;

  const p1 = [...pattern1].sort((a, b) => a.time - b.time);
  const p2 = [...pattern2].sort((a, b) => a.time - b.time);

  const used = new Set();
  for (const beat of p1) {
    let found = false;
    for (let i = 0; i < p2.length; i++) {
      if (used.has(i)) continue;
      if (p2[i].move === beat.move && Math.abs(p2[i].time - beat.time) <= TIMING.GOOD) {
        used.add(i);
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}

/**
 * Score a responder's inputs against a target pattern.
 * Each target beat finds its closest matching input (same move, within GOOD).
 * Returns breakdown of PERFECT/GREAT/GOOD/MISS counts and total score.
 */
export function scorePattern(target, inputs) {
  let perfectCount = 0, greatCount = 0, goodCount = 0, missCount = 0;
  let score = 0;

  const usedInputs = new Set();
  const sortedTarget = [...target].sort((a, b) => a.time - b.time);

  for (const beat of sortedTarget) {
    let bestDelta = Infinity;
    let bestIdx = -1;

    for (let i = 0; i < inputs.length; i++) {
      if (usedInputs.has(i)) continue;
      if (inputs[i].move !== beat.move) continue;
      const delta = Math.abs(inputs[i].time - beat.time);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIdx = i;
      }
    }

    if (bestIdx !== -1 && bestDelta <= TIMING.GOOD) {
      usedInputs.add(bestIdx);
      if (bestDelta <= TIMING.PERFECT) {
        perfectCount++;
        score += 3;
      } else if (bestDelta <= TIMING.GREAT) {
        greatCount++;
        score += 2;
      } else {
        goodCount++;
        score += 1;
      }
    } else {
      missCount++;
    }
  }

  return { score, perfectCount, greatCount, goodCount, missCount };
}

/**
 * Calculate bar duration in ms from BPM.
 */
export function getBarDurationMs(bpm) {
  return (BEATS_PER_BAR / bpm) * 60000;
}

/**
 * Client-side timing rating for a single input against a pattern.
 * Returns the best rating for the given move at the given time.
 */
export function getTimingRating(time, move, pattern) {
  let bestDelta = Infinity;
  for (const beat of pattern) {
    if (beat.move === move) {
      const delta = Math.abs(beat.time - time);
      if (delta < bestDelta) bestDelta = delta;
    }
  }
  if (bestDelta <= TIMING.PERFECT) return 'PERFECT';
  if (bestDelta <= TIMING.GREAT) return 'GREAT';
  if (bestDelta <= TIMING.GOOD) return 'GOOD';
  return 'MISS';
}

/**
 * Snap a time value to the nearest 8th-note grid position.
 */
export function snapToGrid(timeMs, barDurationMs, subdivisions) {
  const subdivMs = barDurationMs / subdivisions;
  const snapped = Math.round(timeMs / subdivMs) * subdivMs;
  return Math.max(0, Math.min(snapped, barDurationMs - subdivMs));
}

/**
 * Determine if a responder survives based on their score breakdown.
 * Must hit at least 60% of beats at GOOD or better.
 */
export function checkSurvival(totalBeats, perfectCount, greatCount, goodCount) {
  const hitsNeeded = Math.ceil(totalBeats * 0.6);
  const hits = perfectCount + greatCount + goodCount;
  return hits >= hitsNeeded;
}
