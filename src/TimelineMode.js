/**
 * TimelineMode.js - Horizontal calendar timeline overlay for mind mapping.
 *
 * Follows the ExtensionBridge "ghost plugin" pattern used by ThrustGame:
 *   - Zero CPU overhead when inactive (static check + immediate return)
 *   - Lazily loaded on first Ctrl+K key press
 *   - Soft connections stored as plain data on mindMap.timelineConnections
 *     so that MindMap never depends on this class (complete isolation)
 *
 * Keyboard shortcut : Ctrl+K – toggle Timeline Mode
 * Mouse interaction  : while Timeline Mode is active, clicking on the timeline
 *                      bar while a box is selected creates/removes a soft
 *                      connection between that box and the clicked day-tick.
 *
 * The soft connections:
 *   - Are rendered only while Timeline Mode is active
 *   - Are exported in JSON save files (via mindMap.timelineConnections)
 *   - Are rendered in PNG and PDF exports when Timeline Mode is active
 *   - Do not affect the normal graph/cluster/connection structure
 */

class TimelineMode {
  // ============================================================================
  // STATIC CONSTANTS
  // ============================================================================

  /** Height (px) of the calendar bar on screen */
  static BAR_HEIGHT = 80;
  /** Gap (px) between the bar and the bottom of the screen */
  static BAR_Y_OFFSET = 10;
  /** Total days displayed (≈6 months) */
  static TOTAL_DAYS = 183;

  /** Tick heights measured from bar bottom edge (px) */
  static MONTH_TICK_H = 56;
  static WEEK_TICK_H  = 32;
  static DAY_TICK_H   = 18;

  /** Vertical hit-test extension beyond the bar edges (px) */
  static HIT_EXTEND = 20;

  // ============================================================================
  // STATIC STATE
  // ============================================================================

  /** @type {TimelineMode|null} singleton instance */
  static instance = null;

  // ============================================================================
  // STATIC INTERFACE  (called from sketch.js)
  // ============================================================================

  /**
   * Main draw hook – call every frame from sketch.js.
   * Zero overhead when not loaded; near-zero when loaded-but-inactive.
   * @param {*} collaborationManager  – passed through from ExtensionBridge convention
   * @param {*} mindMap               – current MindMap instance
   */
  static loop(collaborationManager, mindMap) {
    if (!TimelineMode.instance || !TimelineMode.instance.active) return;
    TimelineMode.instance.mindMap = mindMap;
    TimelineMode.instance.draw();
  }

  /**
   * Keyboard handler.  Returns true if the event was consumed.
   * @param {string}  key     – p5.js `key` value
   * @param {number}  keyCode – p5.js `keyCode` value
   * @param {*}       mindMap
   * @param {Object}  options – { isCtrl }
   */
  static handleInput(key, keyCode, mindMap, options = {}) {
    const isCtrl = options.isCtrl ?? TimelineMode._isCtrlPressed();
    if ((key === 'k' || key === 'K') && isCtrl) {
      TimelineMode.toggle(mindMap);
      return true;
    }
    return false;
  }

  /** Portable ctrl-key detection (mirrors ThrustGame pattern) */
  static _isCtrlPressed() {
    try {
      if (typeof keyIsDown === 'function' && keyIsDown(17)) return true;
      if (typeof window !== 'undefined' && window.event && window.event.ctrlKey) return true;
    } catch (e) { /* ignore */ }
    return false;
  }

  /** Toggle Timeline Mode on/off */
  static toggle(mindMap) {
    if (!TimelineMode.instance) TimelineMode.instance = new TimelineMode(mindMap);
    TimelineMode.instance.mindMap = mindMap;
    if (!TimelineMode.instance.active) {
      TimelineMode.instance.start();
    } else {
      TimelineMode.instance.stop();
    }
  }

  /**
   * Mouse press handler.  Call from sketch.js mousePressed() BEFORE normal
   * mindMap handling.  Returns true if the click was consumed by the timeline.
   * @param {number} screenX  – mouseX (screen coords)
   * @param {number} screenY  – mouseY (screen coords)
   * @param {*}      mindMap
   */
  static handleMousePressed(screenX, screenY, mindMap) {
    if (!TimelineMode.instance || !TimelineMode.instance.active) return false;
    return TimelineMode.instance.handleClick(screenX, screenY, mindMap);
  }

  // ============================================================================
  // EXPORT HELPER  (called from ExportManager)
  // ============================================================================

  /** Height (px) reserved for the timeline strip in PNG/PDF exports */
  static EXPORT_STRIP_HEIGHT = 100;

  /**
   * Draw the timeline strip into a p5 graphics buffer (for PNG/PDF export).
   * @param {p5.Graphics} pg          – offscreen graphics buffer
   * @param {number}      exportW     – pixel width of the export canvas
   * @param {number}      exportH     – total pixel height of the export canvas
   * @param {*}           mindMap     – used to resolve box positions
   * @param {number}      contentOffX – X translation applied to content (padding - bounds.minX)
   * @param {number}      contentOffY – Y translation applied to content (padding - bounds.minY)
   */
  static drawToGraphics(pg, exportW, exportH, mindMap, contentOffX, contentOffY) {
    if (!TimelineMode.instance) return;
    const inst = TimelineMode.instance;
    const startDate = inst.startDate || new Date();
    const barY = exportH - TimelineMode.EXPORT_STRIP_HEIGHT + 5;
    const barH = TimelineMode.EXPORT_STRIP_HEIGHT - 10;
    const conns = (mindMap && mindMap.timelineConnections) ? mindMap.timelineConnections : [];

    // Background
    pg.noStroke();
    pg.fill(15, 20, 40, 210);
    pg.rect(0, barY, exportW, barH);
    pg.stroke(60, 80, 140, 180);
    pg.strokeWeight(1);
    pg.noFill();
    pg.rect(0, barY, exportW, barH);

    const totalDays = TimelineMode.TOTAL_DAYS;
    const dayPx = exportW / (totalDays - 1);
    const showDayNums = dayPx >= 14;

    const highlightedDays = new Set(conns.map(c => c.dayIndex));

    // Soft connections
    for (const conn of conns) {
      const box = mindMap && mindMap.boxIdMap
        ? mindMap.boxIdMap.get(conn.boxId)
        : mindMap && mindMap.boxes && mindMap.boxes.find(b => b && b.id === conn.boxId);
      if (!box) continue;
      const bx = box.x + contentOffX;
      const by = box.y + contentOffY;
      const tx = (conn.dayIndex / (totalDays - 1)) * exportW;
      const ty = (conn.side === 'below') ? barY + barH : barY;
      pg.stroke(100, 180, 255, 180);
      pg.strokeWeight(1.5);
      pg.noFill();
      pg.line(bx, by, tx, ty);
      pg.fill(100, 200, 255, 220);
      pg.noStroke();
      pg.circle(tx, ty, 6);
    }

    // Gradations
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    let currentMonth = -1;
    for (let d = 0; d < totalDays; d++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + d);
      const x  = (d / (totalDays - 1)) * exportW;
      const dom = date.getDate();
      const mon = date.getMonth();
      const dow = date.getDay();
      const isHighlighted = highlightedDays.has(d);
      const isToday = d === 0;

      if (dom === 1 || mon !== currentMonth) {
        if (dom === 1 || d === 0) {
          currentMonth = mon;
          pg.noStroke();
          pg.fill(180, 200, 255, 220);
          pg.textSize(11);
          pg.textAlign(pg.LEFT, pg.TOP);
          pg.text(monthNames[mon] + ' ' + date.getFullYear(), x + 3, barY + 3);
          pg.stroke(80, 100, 180, 200);
          pg.strokeWeight(1);
          pg.line(x, barY, x, barY + barH);
          pg.noStroke();
        }
      }

      if (dow === 1 && dayPx >= 4) {
        pg.stroke(60, 90, 160, 160);
        pg.strokeWeight(1);
        pg.line(x, barY + barH - TimelineMode.WEEK_TICK_H, x, barY + barH);
        pg.noStroke();
      }

      if (isHighlighted) {
        pg.stroke(100, 200, 255, 255);
        pg.strokeWeight(2);
        pg.line(x, barY + barH - TimelineMode.DAY_TICK_H * 1.5, x, barY + barH);
        pg.fill(120, 210, 255, 255);
        pg.noStroke();
        pg.textSize(9);
        pg.textAlign(pg.CENTER, pg.BOTTOM);
        pg.text(dom, x, barY + barH - TimelineMode.DAY_TICK_H * 1.5 - 2);
      } else {
        pg.stroke(50, 65, 120, 140);
        pg.strokeWeight(0.8);
        pg.line(x, barY + barH - TimelineMode.DAY_TICK_H, x, barY + barH);
        pg.noStroke();
        if (showDayNums) {
          pg.fill(100, 120, 180, 160);
          pg.textSize(8);
          pg.textAlign(pg.CENTER, pg.BOTTOM);
          pg.text(dom, x, barY + barH - TimelineMode.DAY_TICK_H - 1);
        }
      }

      if (isToday) {
        pg.stroke(255, 220, 50, 240);
        pg.strokeWeight(2);
        pg.line(x, barY, x, barY + barH);
        pg.noStroke();
        pg.fill(255, 220, 50, 240);
        pg.textSize(10);
        pg.textAlign(pg.CENTER, pg.TOP);
        pg.text('TODAY', x, barY + 3);
      }
    }
  }

  // ============================================================================
  // CONSTRUCTOR
  // ============================================================================

  /**
   * @param {*} mindMap – MindMap instance (may be null; set later on each loop)
   */
  constructor(mindMap = null) {
    this.mindMap   = mindMap;
    this.active    = false;
    /** @type {Date|null} Start of the 6-month window, normalised to midnight */
    this.startDate = null;
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  start() {
    this.active = true;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    this.startDate = today;
    // Ensure the mindMap has a timelineConnections array
    if (this.mindMap && !this.mindMap.timelineConnections) {
      this.mindMap.timelineConnections = [];
    }
  }

  stop() {
    this.active = false;
    // Soft connections remain stored on mindMap.timelineConnections
    // so they are preserved across deactivation/reactivation.
  }

  // ============================================================================
  // GEOMETRY HELPERS
  // ============================================================================

  /** Screen Y of the top edge of the timeline bar */
  _barY() {
    const h = (typeof height !== 'undefined') ? height : 600;
    return h - TimelineMode.BAR_HEIGHT - TimelineMode.BAR_Y_OFFSET;
  }

  /** Total usable screen width */
  _barW() {
    return (typeof width !== 'undefined') ? width : 800;
  }

  /** Maps a day index (0 … TOTAL_DAYS-1) to a screen X coordinate */
  _dayX(dayIndex) {
    return (dayIndex / (TimelineMode.TOTAL_DAYS - 1)) * this._barW();
  }

  /** Maps a screen X to the closest day index */
  _dayFromX(screenX) {
    const frac = Math.max(0, Math.min(1, screenX / this._barW()));
    return Math.round(frac * (TimelineMode.TOTAL_DAYS - 1));
  }

  /** True when (screenX, screenY) is within the interactive timeline strip */
  _isOverBar(screenX, screenY) {
    const barY = this._barY();
    return screenY >= barY - TimelineMode.HIT_EXTEND &&
           screenY <= barY + TimelineMode.BAR_HEIGHT + TimelineMode.HIT_EXTEND;
  }

  /** Returns the Date corresponding to a given day index */
  _dateForDay(dayIndex) {
    const d = new Date(this.startDate);
    d.setDate(d.getDate() + dayIndex);
    return d;
  }

  /** Convenience: returns the soft-connections array from mindMap */
  _connections() {
    return (this.mindMap && this.mindMap.timelineConnections)
      ? this.mindMap.timelineConnections
      : [];
  }

  /** ISO week number */
  _weekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  }

  // ============================================================================
  // INTERACTION
  // ============================================================================

  /**
   * Handle a click in screen coordinates.
   * Creates or removes a soft connection between the selected box and the
   * clicked day tick.  Returns true if the event was consumed.
   */
  handleClick(screenX, screenY, mindMap) {
    if (!this._isOverBar(screenX, screenY)) return false;
    if (!mindMap) return false;

    const selectedBox = mindMap.selectedBox;
    if (!selectedBox) return false;

    const dayIndex = this._dayFromX(screenX);

    // Ensure the array exists
    if (!mindMap.timelineConnections) mindMap.timelineConnections = [];
    const conns = mindMap.timelineConnections;

    const existingIdx = conns.findIndex(
      c => c.boxId === selectedBox.id && c.dayIndex === dayIndex
    );

    if (existingIdx >= 0) {
      conns.splice(existingIdx, 1);
    } else {
      // Determine side based on box screen position vs bar centre
      const barMidY = this._barY() + TimelineMode.BAR_HEIGHT / 2;
      let side = 'above';
      if (typeof CameraUtils !== 'undefined') {
        side = (CameraUtils.screenY(selectedBox.y) < barMidY) ? 'above' : 'below';
      }
      conns.push({ boxId: selectedBox.id, dayIndex, side });
    }

    return true; // event consumed
  }

  // ============================================================================
  // DRAWING
  // ============================================================================

  draw() {
    if (!this.active || !this.startDate) return;

    push();
    resetMatrix();

    const barY = this._barY();
    const barW = this._barW();
    const bh   = TimelineMode.BAR_HEIGHT;
    const conns = this._connections();

    // --- Soft connection lines (drawn first, behind the bar) ---
    if (conns.length > 0 && this.mindMap) {
      this._drawConnections(conns, barY, barW, bh);
    }

    // --- Bar background ---
    noStroke();
    fill(15, 20, 40, 210);
    rect(0, barY, barW, bh);

    // --- Bar border ---
    stroke(60, 80, 140, 180);
    strokeWeight(1);
    noFill();
    rect(0, barY, barW, bh);

    // --- Gradations ---
    const highlightedDays = new Set(conns.map(c => c.dayIndex));
    this._drawGradations(barY, barW, bh, highlightedDays);

    // --- Shortcut hint (bottom-right of bar) ---
    noStroke();
    fill(80, 100, 160, 160);
    textSize(9);
    textAlign(RIGHT, BOTTOM);
    text('Ctrl+K: exit timeline', barW - 6, barY + bh - 3);

    pop();
  }

  _drawConnections(conns, barY, barW, bh) {
    for (const conn of conns) {
      const box = this.mindMap.boxIdMap
        ? this.mindMap.boxIdMap.get(conn.boxId)
        : this.mindMap.boxes && this.mindMap.boxes.find(b => b && b.id === conn.boxId);
      if (!box) continue;

      let bsx, bsy;
      if (typeof CameraUtils !== 'undefined') {
        bsx = CameraUtils.screenX(box.x);
        bsy = CameraUtils.screenY(box.y);
      } else {
        bsx = box.x;
        bsy = box.y;
      }

      const tx = this._dayX(conn.dayIndex);
      const ty = (conn.side === 'below') ? barY + bh : barY;

      // Connection line
      stroke(100, 180, 255, 180);
      strokeWeight(1.5);
      noFill();
      line(bsx, bsy, tx, ty);

      // Attachment dot on the tick
      noStroke();
      fill(100, 200, 255, 220);
      circle(tx, ty, 6);
    }
  }

  _drawGradations(barY, barW, bh, highlightedDays) {
    const totalDays = TimelineMode.TOTAL_DAYS;
    const dayPx = barW / (totalDays - 1);
    const showDayNums  = dayPx >= 14;
    const showWeekNums = dayPx >= 4;
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    let currentMonth = -1;

    for (let d = 0; d < totalDays; d++) {
      const date = this._dateForDay(d);
      const x     = this._dayX(d);
      const dom   = date.getDate();
      const mon   = date.getMonth();
      const dow   = date.getDay();   // 0=Sun … 6=Sat
      const isHighlighted = highlightedDays.has(d);
      const isToday       = d === 0;

      // ------ Month divider ------
      if (dom === 1 || mon !== currentMonth) {
        if (dom === 1 || d === 0) {
          currentMonth = mon;
          // Label
          noStroke();
          fill(180, 200, 255, 220);
          textSize(11);
          textAlign(LEFT, TOP);
          text(monthNames[mon] + ' ' + date.getFullYear(), x + 3, barY + 3);
          // Full-height divider line
          stroke(80, 100, 180, 200);
          strokeWeight(1);
          line(x, barY, x, barY + bh);
          noStroke();
        }
      }

      // ------ Week marker (Monday) ------
      if (dow === 1 && showWeekNums) {
        stroke(60, 90, 160, 160);
        strokeWeight(1);
        line(x, barY + bh - TimelineMode.WEEK_TICK_H, x, barY + bh);
        noStroke();
        if (showDayNums) {
          fill(140, 160, 220, 180);
          textSize(9);
          textAlign(CENTER, BOTTOM);
          text('W' + this._weekNumber(date), x, barY + bh - TimelineMode.WEEK_TICK_H - 2);
        }
      }

      // ------ Day tick ------
      const dh = TimelineMode.DAY_TICK_H;
      if (isHighlighted) {
        // Lit-up tick for a day with at least one connected box
        stroke(100, 200, 255, 255);
        strokeWeight(2);
        line(x, barY + bh - dh * 1.5, x, barY + bh);
        noStroke();
        fill(120, 210, 255, 255);
        textSize(9);
        textAlign(CENTER, BOTTOM);
        text(dom, x, barY + bh - dh * 1.5 - 2);
      } else {
        stroke(50, 65, 120, 140);
        strokeWeight(0.8);
        line(x, barY + bh - dh, x, barY + bh);
        noStroke();
        if (showDayNums) {
          fill(100, 120, 180, 160);
          textSize(8);
          textAlign(CENTER, BOTTOM);
          text(dom, x, barY + bh - dh - 1);
        }
      }

      // ------ Today marker ------
      if (isToday) {
        stroke(255, 220, 50, 240);
        strokeWeight(2);
        line(x, barY, x, barY + bh);
        noStroke();
        fill(255, 220, 50, 240);
        textSize(10);
        textAlign(CENTER, TOP);
        text('TODAY', x, barY + 3);
      }
    }
  }
}

// ==============================================================================
// MODULE EXPORT (for Jest / Node.js)
// ==============================================================================
if (typeof module !== 'undefined' && module.exports) module.exports = TimelineMode;

// ==============================================================================
// BROWSER SELF-REGISTRATION
// ==============================================================================
/* istanbul ignore next */
if (typeof window !== 'undefined') {
  window.TimelineMode = TimelineMode;
}
