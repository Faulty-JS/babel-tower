/**
 * HUD — Heads-up display for the Library of Babel.
 *
 * Shows: current article, target article, breadcrumb trail,
 * portal proximity hints, journey stats, and win overlay.
 */

export class HUD {
  constructor() {
    this.element = null;
    this.currentArticle = '';
    this.targetArticle = '';
    this.breadcrumbs = [];
    this.playerCount = 1;
    this.portalHint = null;
    this.create();
  }

  create() {
    // Main HUD container
    this.element = document.createElement('div');
    this.element.id = 'hud';
    this.element.innerHTML = `
      <div id="hud-article">THE LIBRARY OF BABEL</div>
      <div id="hud-target" style="display:none"></div>
      <div id="hud-breadcrumbs"></div>
      <div id="hud-players">WANDERERS: 1</div>
      <div id="hud-portal-hint" style="display:none"></div>
      <div id="hud-controls">WASD move | SPACE jump | SHIFT dash | T chat | \` toggle ASCII</div>
    `;
    document.body.appendChild(this.element);

    // Win overlay (hidden by default)
    this.winOverlay = document.createElement('div');
    this.winOverlay.id = 'win-overlay';
    this.winOverlay.style.display = 'none';
    this.winOverlay.innerHTML = `
      <div id="win-content">
        <div id="win-title">FOUND</div>
        <div id="win-target"></div>
        <div id="win-stats"></div>
        <div id="win-path"></div>
        <div id="win-continue">press SPACE or click for a new journey</div>
      </div>
    `;
    document.body.appendChild(this.winOverlay);

    // Inject win overlay styles
    const style = document.createElement('style');
    style.textContent = `
      #win-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0, 0, 0, 0.85);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 200;
        font-family: monospace;
        color: #fff;
        cursor: pointer;
      }
      #win-content {
        text-align: center;
        max-width: 700px;
        padding: 40px;
      }
      #win-title {
        font-size: 48px;
        font-weight: bold;
        margin-bottom: 10px;
        color: #4ecdc4;
        letter-spacing: 8px;
      }
      #win-target {
        font-size: 28px;
        margin-bottom: 30px;
        color: #f9ca24;
      }
      #win-stats {
        font-size: 18px;
        margin-bottom: 25px;
        line-height: 1.8;
        color: #ccc;
      }
      #win-path {
        font-size: 14px;
        color: #888;
        line-height: 1.6;
        margin-bottom: 30px;
        word-break: break-word;
      }
      #win-continue {
        font-size: 14px;
        color: #666;
        animation: pulse 2s ease-in-out infinite;
      }
      @keyframes pulse {
        0%, 100% { opacity: 0.5; }
        50% { opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  setArticle(title) {
    this.currentArticle = title;
    const el = document.getElementById('hud-article');
    if (el) el.textContent = title.toUpperCase();

    // Add to breadcrumbs if not already the last entry
    if (this.breadcrumbs[this.breadcrumbs.length - 1] !== title) {
      this.breadcrumbs.push(title);
      this.updateBreadcrumbs();
    }
  }

  setTarget(title) {
    this.targetArticle = title;
    const el = document.getElementById('hud-target');
    if (el) {
      el.style.display = title ? 'block' : 'none';
      el.textContent = title ? `TARGET: ${title.toUpperCase()}` : '';
    }
  }

  updateBreadcrumbs() {
    const el = document.getElementById('hud-breadcrumbs');
    if (!el) return;

    if (this.breadcrumbs.length <= 1) {
      el.textContent = '';
      return;
    }

    // Show last few breadcrumbs
    const shown = this.breadcrumbs.slice(-5);
    const prefix = this.breadcrumbs.length > 5 ? '... > ' : '';
    el.textContent = prefix + shown.join(' > ');
  }

  setPlayerCount(count) {
    this.playerCount = count;
    const el = document.getElementById('hud-players');
    if (el) el.textContent = `WANDERERS: ${count}`;
  }

  showPortalHint(portalTitle) {
    const el = document.getElementById('hud-portal-hint');
    if (!el) return;
    if (portalTitle) {
      el.style.display = 'block';
      el.textContent = `>> ${portalTitle} >>`;
    } else {
      el.style.display = 'none';
    }
  }

  resetJourney() {
    this.breadcrumbs = [];
    this.updateBreadcrumbs();
  }

  /**
   * Show the win overlay with journey stats.
   * Returns a promise that resolves when the player dismisses it.
   */
  showWin(data) {
    const { path, hops, timeMs, optimalHops, target } = data;

    document.getElementById('win-target').textContent = target.toUpperCase();

    // Format time
    const seconds = Math.floor(timeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const timeStr = minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;

    // Rating
    let rating = '';
    if (hops <= optimalHops) rating = 'PERFECT PATH';
    else if (hops <= optimalHops + 2) rating = 'EXCELLENT';
    else if (hops <= optimalHops + 4) rating = 'GOOD';
    else rating = 'SCENIC ROUTE';

    document.getElementById('win-stats').innerHTML = [
      `HOPS: ${hops}  (optimal: ${optimalHops})`,
      `TIME: ${timeStr}`,
      `RATING: ${rating}`,
    ].join('<br>');

    // Show the path taken
    document.getElementById('win-path').textContent =
      'YOUR PATH: ' + path.join(' → ');

    this.winOverlay.style.display = 'flex';

    return new Promise((resolve) => {
      const dismiss = (e) => {
        if (e.type === 'keydown' && e.code !== 'Space') return;
        this.winOverlay.style.display = 'none';
        document.removeEventListener('keydown', dismiss);
        this.winOverlay.removeEventListener('click', dismiss);
        resolve();
      };
      // Small delay so the space/click that entered the portal doesn't immediately dismiss
      setTimeout(() => {
        document.addEventListener('keydown', dismiss);
        this.winOverlay.addEventListener('click', dismiss);
      }, 500);
    });
  }
}
