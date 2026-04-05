/**
 * Tower State — Server-authoritative tower data.
 *
 * The tower is the shared, persistent structure that all players build.
 *
 * TODO: The coding agent should implement:
 *   1. SQLite persistence (load/save)
 *   2. Growth point generation logic
 *   3. Floor unlocking when enough puzzles are solved
 *   4. Growth animation broadcasting
 *
 * Schema sketch:
 *   tower_state {
 *     current_height: int          // highest completed floor
 *     total_solves: int            // all-time puzzle completions
 *     growth_points: [             // active growth points
 *       { id, floor, x, y, z, active, solves_remaining }
 *     ]
 *     placed_pieces: [             // all player contributions
 *       { id, type, x, y, z, rotation, session_id, timestamp }
 *     ]
 *   }
 */

import {
  INITIAL_FLOORS,
  SOLVES_PER_GROWTH,
  GROWTH_POINTS_PER_FLOOR,
  TOWER_RADIUS,
  FLOOR_HEIGHT,
  TAPER_PER_FLOOR,
} from '../shared/constants.js';

export class TowerState {
  constructor() {
    this.currentHeight = INITIAL_FLOORS;
    this.totalSolves = 0;
    this.growthPoints = [];
    this.placedPieces = [];

    // Generate initial growth points
    this.generateGrowthPoints();
  }

  generateGrowthPoints() {
    // Create growth points at the top two accessible floors
    const floors = [this.currentHeight - 1, this.currentHeight - 2].filter(f => f >= 0);
    for (const floor of floors) {
      for (let i = 0; i < GROWTH_POINTS_PER_FLOOR; i++) {
        const angle = (i / GROWTH_POINTS_PER_FLOOR) * Math.PI * 2 + floor * 0.3;
        const radius = TOWER_RADIUS - floor * TAPER_PER_FLOOR;
        const r = radius * (0.4 + Math.random() * 0.4);

        this.growthPoints.push({
          id: `gp_${floor}_${i}_${Date.now()}`,
          floor,
          x: Math.cos(angle) * r,
          y: floor * FLOOR_HEIGHT + 2,
          z: Math.sin(angle) * r,
          active: true,
          solvesRemaining: SOLVES_PER_GROWTH,
        });
      }
    }
  }

  /**
   * Called when a player solves a puzzle at a growth point.
   * Returns { grew: boolean, newFloor: number | null }
   */
  recordSolve(growthPointId, sessionId, puzzleType) {
    this.totalSolves++;

    const gp = this.growthPoints.find(g => g.id === growthPointId);
    if (!gp || !gp.active) return { grew: false };

    gp.solvesRemaining--;

    if (gp.solvesRemaining <= 0) {
      gp.active = false;

      // Check if all growth points on this floor are complete
      const floorPoints = this.growthPoints.filter(g => g.floor === gp.floor);
      const allComplete = floorPoints.every(g => !g.active);

      if (allComplete) {
        this.currentHeight++;
        this.generateGrowthPoints();
        return { grew: true, newFloor: this.currentHeight };
      }
    }

    return { grew: false };
  }
}
