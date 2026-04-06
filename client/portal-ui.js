/**
 * Portal UI — Portal detection and transition handling.
 *
 * Detects when player walks into a portal and triggers room transition.
 */

import * as THREE from 'three';
import { PORTAL_TRIGGER_DISTANCE } from '../shared/constants.js';

export class PortalManager {
  constructor() {
    this.portals = [];         // Array of { mesh, title, position, normal }
    this.nearestPortal = null;
    this.nearestDist = Infinity;
    this.transitioning = false;
    this.onEnterPortal = null;  // Callback: (targetArticle) => void
  }

  /**
   * Set the current room's portals.
   */
  setPortals(portals) {
    this.portals = portals;
    this.nearestPortal = null;
    this.nearestDist = Infinity;
  }

  /**
   * Check player proximity to portals. Call each frame.
   * Returns the nearest portal info or null.
   */
  update(playerPosition) {
    if (this.transitioning) return null;

    this.nearestPortal = null;
    this.nearestDist = Infinity;

    for (const portal of this.portals) {
      const dx = playerPosition.x - portal.position.x;
      const dy = playerPosition.y - portal.position.y;
      const dz = playerPosition.z - portal.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist < this.nearestDist) {
        this.nearestDist = dist;
        this.nearestPortal = portal;
      }
    }

    // Auto-enter portal when close enough (3D distance)
    if (this.nearestPortal && this.nearestDist < PORTAL_TRIGGER_DISTANCE) {
      this.enterPortal(this.nearestPortal.title);
      return this.nearestPortal;
    }

    return null;
  }

  /**
   * Trigger portal transition.
   */
  enterPortal(targetArticle) {
    if (this.transitioning) return;
    this.transitioning = true;

    if (this.onEnterPortal) {
      this.onEnterPortal(targetArticle);
    }
  }

  /**
   * Called when new room is loaded and transition is complete.
   */
  transitionComplete() {
    this.transitioning = false;
  }

  /**
   * Get HUD info about nearest portal.
   */
  getNearestPortalInfo() {
    if (!this.nearestPortal || this.nearestDist > PORTAL_TRIGGER_DISTANCE * 2) {
      return null;
    }
    return {
      title: this.nearestPortal.title,
      distance: this.nearestDist,
      isClose: this.nearestDist < PORTAL_TRIGGER_DISTANCE,
    };
  }
}
