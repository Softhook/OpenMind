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
 *
 * World-space placement:
 *   The bar lives at world coordinates (0, 0).  It is drawn INSIDE the camera
 *   transform (translate + scale) so it zooms and pans exactly like the rest of
 *   the mind-map content.  Text and stroke weights are divided by the current
 *   zoom so they stay a constant size on screen.
 *
 * Resizing:
 *   Drag the resize handle (semi-transparent grip at the right edge) left/right
 *   to shorten or lengthen the bar.
 *
 * Connections:
 *   While Timeline Mode is active, clicking a day tick while a box is selected
 *   creates a soft connection (plain-data entry on mindMap.timelineConnections)
 *   between that box and the tick.  Connections are drawn as lines directly in
 *   world space (box world coords → tick world coords).
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

  /** Height of the calendar bar in world units */
  static BAR_HEIGHT = 80;
  /** Default bar width in world units */
  static DEFAULT_WIDTH = 3000;
  /** Minimum bar width in world units */
  static MIN_WIDTH = 400;
  /** Total days displayed (≈ 6 months) */
  static TOTAL_DAYS = 183;
  /** World-unit tolerance for click-hit detection around the bar edges */
  static HIT_EXTEND = 15;
  /** World-unit hit radius for the resize handle at the right edge */
  static HANDLE_RADIUS = 20;

  /** Tick heights measured from bar bottom edge (world units) */
  static MONTH_TICK_H = 56;
  static WEEK_TICK_H  = 32;
  static DAY_TICK_H   = 18;

  // ============================================================================
  // STATIC STATE
  // ============================================================================

  /** @type {TimelineMode|null} singleton instance */
  static instance = null;

  // ============================================================================
  // STATIC INTERFACE  (called from sketch.js)
  // ============================================================================

  /**
   * Main draw hook – called every frame from sketch.js INSIDE the camera
   * transform so the bar zooms/pans with the map.
   * Zero overhead when not loaded; near-zero when loaded-but-inactive.
   * @param {*} collaborationManager  – unused, passed for convention parity
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
    // Restore persisted bar width if available
    if (mindMap && mindMap.timelineBarWidth) {
      TimelineMode.instance.barWorldWidth = mindMap.timelineBarWidth;
    }
    if (!TimelineMode.instance.active) {
      TimelineMode.instance.start();
    } else {
      TimelineMode.instance.stop();
    }
  }

  /**
   * Mouse-press handler – call from sketch.js mousePressed() BEFORE normal
   * mindMap handling.  Receives WORLD coordinates.
   * Returns true if the event was consumed (bar was clicked).
   * @param {number} worldX  – world-space mouse X (worldMouseX())
   * @param {number} worldY  – world-space mouse Y (worldMouseY())
   * @param {*}      mindMap
   */
  static handleMousePressed(worldX, worldY, mindMap) {
    if (!TimelineMode.instance || !TimelineMode.instance.active) return false;
    return TimelineMode.instance.handleMouseDown(worldX, worldY, mindMap);
  }

  /**
   * Mouse-drag handler – call from sketch.js mouseDragged().
   * Receives WORLD coordinates.
   * Returns true if the drag was consumed (resize in progress).
   * @param {number} worldX
   * @param {number} worldY
   */
  static handleMouseDragged(worldX, worldY) {
    if (!TimelineMode.instance || !TimelineMode.instance.active) return false;
    return TimelineMode.instance.handleDrag(worldX, worldY);
  }

  /**
   * Mouse-release handler – call from sketch.js mouseReleased().
   * Finalises a resize drag and persists the new width.
   */
  static handleMouseReleased() {
    if (!TimelineMode.instance) return;
    TimelineMode.instance.handleRelease();
  }

  // ============================================================================
  // EXPORT HELPER  (called from ExportManager inside push/translate context)
  // ============================================================================

  /**
   * Draw the timeline bar into a p5 graphics buffer.
   * Must be called INSIDE a pg.push() / pg.translate(contentOffX, contentOffY)
   * block so that world (0, 0) maps to the correct export-canvas position.
   * Text and stroke weights are drawn at world scale (zoom = 1 for exports).
   *
   * @param {p5.Graphics} pg      – offscreen graphics buffer
   * @param {*}           mindMap – used to resolve box positions
   */
  static drawToGraphics(pg, mindMap) {
    if (!TimelineMode.instance) return;
    const inst = TimelineMode.instance;
    const bw   = inst.barWorldWidth;
    const bh   = TimelineMode.BAR_HEIGHT;
    const conns = (mindMap && mindMap.timelineConnections) ? mindMap.timelineConnections : [];
    const highlightedDays = new Set(conns.map(c => c.dayIndex));

    // --- Soft connection lines ---
    for (const conn of conns) {
      const box = mindMap.boxIdMap
        ? mindMap.boxIdMap.get(conn.boxId)
        : mindMap.boxes && mindMap.boxes.find(b => b && b.id === conn.boxId);
      if (!box) continue;
      const tx = inst._worldDayX(conn.dayIndex);
      const ty = conn.side === 'below' ? bh : 0;
      pg.stroke(100, 180, 255, 180);
      pg.strokeWeight(1.5);
      pg.noFill();
      pg.line(box.x, box.y, tx, ty);
      pg.fill(100, 200, 255, 220);
      pg.noStroke();
      pg.circle(tx, ty, 6);
    }

    // --- Bar background ---
    pg.noStroke();
    pg.fill(15, 20, 40, 210);
    pg.rect(0, 0, bw, bh);

    // --- Bar border ---
    pg.stroke(60, 80, 140, 180);
    pg.strokeWeight(1);
    pg.noFill();
    pg.rect(0, 0, bw, bh);

    // --- Gradations ---
    const totalDays = TimelineMode.TOTAL_DAYS;
    const dayWorldPx = bw / (totalDays - 1);
    const showDayNums  = dayWorldPx >= 14;
    const showWeekNums = dayWorldPx >= 4;
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const startDate = inst.startDate || new Date();
    let currentMonth = -1;

    for (let d = 0; d < totalDays; d++) {
      const date = inst._dateForDay(d);
      const x   = inst._worldDayX(d);
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
          pg.text(monthNames[mon] + ' ' + date.getFullYear(), x + 3, 3);
          pg.stroke(80, 100, 180, 200);
          pg.strokeWeight(1);
          pg.line(x, 0, x, bh);
          pg.noStroke();
        }
      }

      if (dow === 1 && showWeekNums) {
        pg.stroke(60, 90, 160, 160);
        pg.strokeWeight(1);
        pg.line(x, bh - TimelineMode.WEEK_TICK_H, x, bh);
        pg.noStroke();
        if (showDayNums) {
          pg.fill(140, 160, 220, 180);
          pg.textSize(9);
          pg.textAlign(pg.CENTER, pg.BOTTOM);
          pg.text('W' + inst._weekNumber(date), x, bh - TimelineMode.WEEK_TICK_H - 2);
        }
      }

      const dh = TimelineMode.DAY_TICK_H;
      if (isHighlighted) {
        pg.stroke(100, 200, 255, 255);
        pg.strokeWeight(2);
        pg.line(x, bh - dh * 1.5, x, bh);
        pg.fill(120, 210, 255, 255);
        pg.noStroke();
        pg.textSize(9);
        pg.textAlign(pg.CENTER, pg.BOTTOM);
        pg.text(dom, x, bh - dh * 1.5 - 2);
      } else {
        pg.stroke(50, 65, 120, 140);
        pg.strokeWeight(0.8);
        pg.line(x, bh - dh, x, bh);
        pg.noStroke();
        if (showDayNums) {
          pg.fill(100, 120, 180, 160);
          pg.textSize(8);
          pg.textAlign(pg.CENTER, pg.BOTTOM);
          pg.text(dom, x, bh - dh - 1);
        }
      }

      if (isToday) {
        pg.stroke(255, 220, 50, 240);
        pg.strokeWeight(2);
        pg.line(x, 0, x, bh);
        pg.fill(255, 220, 50, 240);
        pg.noStroke();
        pg.textSize(10);
        pg.textAlign(pg.CENTER, pg.TOP);
        pg.text('TODAY', x, 3);
      }
    }

    // --- Resize handle visual ---
    pg.fill(80, 120, 200, 180);
    pg.noStroke();
    pg.rect(bw - 6, bh * 0.25, 6, bh * 0.5, 3);
  }

  // ============================================================================
  // CONSTRUCTOR
  // ============================================================================

  /**
   * @param {*} mindMap – MindMap instance (may be null; set later on each loop)
   */
  constructor(mindMap = null) {
    this.mindMap        = mindMap;
    this.active         = false;
    this.startDate      = null;
    this.barWorldWidth  = TimelineMode.DEFAULT_WIDTH;

    // Resize-drag internal state
    this._draggingResize  = false;
    this._dragStartWorldX = 0;
    this._dragStartWidth  = 0;
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  start() {
    this.active = true;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    this.startDate = today;
    if (this.mindMap && !this.mindMap.timelineConnections) {
      this.mindMap.timelineConnections = [];
    }
  }

  stop() {
    this.active = false;
    this._draggingResize = false;
    // Soft connections remain stored on mindMap.timelineConnections.
  }

  // ============================================================================
  // GEOMETRY HELPERS  (world space)
  // ============================================================================

  /** World X of a given day tick */
  _worldDayX(dayIndex) {
    return (dayIndex / (TimelineMode.TOTAL_DAYS - 1)) * this.barWorldWidth;
  }

  /** Day index (0 … TOTAL_DAYS-1) from a world X coordinate */
  _dayFromWorldX(worldX) {
    const frac = Math.max(0, Math.min(1, worldX / this.barWorldWidth));
    return Math.round(frac * (TimelineMode.TOTAL_DAYS - 1));
  }

  /**
   * True when (worldX, worldY) is within the interactive hit area of the bar.
   * HIT_EXTEND provides a small tolerance around all four edges.
   */
  _isOverBarWorld(worldX, worldY) {
    const ext = TimelineMode.HIT_EXTEND;
    return worldX >= -ext &&
           worldX <= this.barWorldWidth + ext &&
           worldY >= -ext &&
           worldY <= TimelineMode.BAR_HEIGHT + ext;
  }

  /**
   * True when (worldX, worldY) is over the drag-resize handle at the right edge.
   * Uses HANDLE_RADIUS as a world-unit tolerance.
   */
  _isDragHandle(worldX, worldY) {
    const r = TimelineMode.HANDLE_RADIUS;
    return Math.abs(worldX - this.barWorldWidth) <= r &&
           worldY >= -r && worldY <= TimelineMode.BAR_HEIGHT + r;
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
   * Handle a mouse-press in world coordinates.
   * Priority: resize handle > tick connection.
   * Returns true if the event was consumed.
   */
  handleMouseDown(worldX, worldY, mindMap) {
    if (!this._isOverBarWorld(worldX, worldY)) return false;

    // Always consume resize-handle presses
    if (this._isDragHandle(worldX, worldY)) {
      this._draggingResize  = true;
      this._dragStartWorldX = worldX;
      this._dragStartWidth  = this.barWorldWidth;
      return true;
    }

    // For tick clicks, require a selected box
    if (!mindMap) return false;
    const selectedBox = mindMap.selectedBox;
    if (!selectedBox) return false;

    const dayIndex = this._dayFromWorldX(worldX);

    if (!mindMap.timelineConnections) mindMap.timelineConnections = [];
    const conns = mindMap.timelineConnections;

    const existingIdx = conns.findIndex(
      c => c.boxId === selectedBox.id && c.dayIndex === dayIndex
    );

    if (existingIdx >= 0) {
      conns.splice(existingIdx, 1);
    } else {
      // Side: 'above' attaches to top edge (y=0), 'below' to bottom (y=BAR_HEIGHT)
      const side = selectedBox.y < TimelineMode.BAR_HEIGHT / 2 ? 'above' : 'below';
      conns.push({ boxId: selectedBox.id, dayIndex, side });
    }

    return true;
  }

  /**
   * Handle a drag update in world coordinates.
   * Updates barWorldWidth while dragging the resize handle.
   * Returns true if consumed.
   */
  handleDrag(worldX, worldY) {
    if (!this._draggingResize) return false;
    const newWidth = this._dragStartWidth + (worldX - this._dragStartWorldX);
    this.barWorldWidth = Math.max(TimelineMode.MIN_WIDTH, newWidth);
    return true;
  }

  /**
   * Handle mouse-release: end resize drag and persist the new width.
   */
  handleRelease() {
    if (this._draggingResize && this.mindMap) {
      this.mindMap.timelineBarWidth = this.barWorldWidth;
    }
    this._draggingResize = false;
  }

  // ============================================================================
  // DRAWING  (called INSIDE camera transform — pure world-space)
  // ============================================================================

  draw() {
    if (!this.active || !this.startDate) return;

    const bw   = this.barWorldWidth;
    const bh   = TimelineMode.BAR_HEIGHT;
    const conns = this._connections();

    // Zoom compensation: keep strokes and text the same pixel size on screen
    const z     = typeof CameraUtils !== 'undefined' ? (CameraUtils.zoom || 1) : 1;
    const safeZ = Math.max(0.01, z);
    const sw    = 1 / safeZ;  // stroke weight for 1px on screen
    const ts    = 11 / safeZ; // base font size in screen-pixel equivalents

    push();

    // --- Soft connection lines (drawn behind bar) ---
    if (conns.length > 0 && this.mindMap) {
      this._drawConnections(conns, bh, sw);
    }

    // --- Bar background ---
    noStroke();
    fill(15, 20, 40, 210);
    rect(0, 0, bw, bh);

    // --- Bar border ---
    stroke(60, 80, 140, 180);
    strokeWeight(sw);
    noFill();
    rect(0, 0, bw, bh);

    // --- Gradations ---
    const highlightedDays = new Set(conns.map(c => c.dayIndex));
    this._drawGradations(bw, bh, highlightedDays, safeZ, sw, ts);

    // --- Resize handle ---
    this._drawResizeHandle(bw, bh, sw);

    // --- Hint label ---
    noStroke();
    fill(80, 100, 160, 160);
    textSize(9 / safeZ);
    textAlign(RIGHT, BOTTOM);
    text('Ctrl+K: exit timeline', bw - 6 / safeZ, bh - 3 / safeZ);

    pop();
  }

  _drawConnections(conns, bh, sw) {
    for (const conn of conns) {
      const box = this.mindMap.boxIdMap
        ? this.mindMap.boxIdMap.get(conn.boxId)
        : this.mindMap.boxes && this.mindMap.boxes.find(b => b && b.id === conn.boxId);
      if (!box) continue;

      const tx = this._worldDayX(conn.dayIndex);
      const ty = conn.side === 'below' ? bh : 0;

      // Line from box to tick attachment point (both in world space)
      stroke(100, 180, 255, 180);
      strokeWeight(1.5 * sw);
      noFill();
      line(box.x, box.y, tx, ty);

      // Attachment dot
      noStroke();
      fill(100, 200, 255, 220);
      circle(tx, ty, 6 * sw);
    }
  }

  _drawGradations(bw, bh, highlightedDays, safeZ, sw, ts) {
    const totalDays    = TimelineMode.TOTAL_DAYS;
    const dayWorldPx   = bw / (totalDays - 1);
    const showDayNums  = dayWorldPx * safeZ >= 14; // visible at ≥14 screen-px/day
    const showWeekNums = dayWorldPx * safeZ >= 4;
    const monthNames   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    let currentMonth = -1;

    for (let d = 0; d < totalDays; d++) {
      const date = this._dateForDay(d);
      const x   = this._worldDayX(d);
      const dom = date.getDate();
      const mon = date.getMonth();
      const dow = date.getDay();   // 0=Sun … 6=Sat
      const isHighlighted = highlightedDays.has(d);
      const isToday       = d === 0;

      // Month divider
      if (dom === 1 || mon !== currentMonth) {
        if (dom === 1 || d === 0) {
          currentMonth = mon;
          noStroke();
          fill(180, 200, 255, 220);
          textSize(ts);
          textAlign(LEFT, TOP);
          text(monthNames[mon] + ' ' + date.getFullYear(), x + 3 / safeZ, 3 / safeZ);
          stroke(80, 100, 180, 200);
          strokeWeight(sw);
          line(x, 0, x, bh);
          noStroke();
        }
      }

      // Week marker (Monday)
      if (dow === 1 && showWeekNums) {
        stroke(60, 90, 160, 160);
        strokeWeight(sw);
        line(x, bh - TimelineMode.WEEK_TICK_H, x, bh);
        noStroke();
        if (showDayNums) {
          fill(140, 160, 220, 180);
          textSize(9 / safeZ);
          textAlign(CENTER, BOTTOM);
          text('W' + this._weekNumber(date), x, bh - TimelineMode.WEEK_TICK_H - 2 / safeZ);
        }
      }

      // Day tick
      const dh = TimelineMode.DAY_TICK_H;
      if (isHighlighted) {
        stroke(100, 200, 255, 255);
        strokeWeight(2 * sw);
        line(x, bh - dh * 1.5, x, bh);
        noStroke();
        fill(120, 210, 255, 255);
        textSize(9 / safeZ);
        textAlign(CENTER, BOTTOM);
        text(dom, x, bh - dh * 1.5 - 2 / safeZ);
      } else {
        stroke(50, 65, 120, 140);
        strokeWeight(0.8 * sw);
        line(x, bh - dh, x, bh);
        noStroke();
        if (showDayNums) {
          fill(100, 120, 180, 160);
          textSize(8 / safeZ);
          textAlign(CENTER, BOTTOM);
          text(dom, x, bh - dh - 1 / safeZ);
        }
      }

      // TODAY marker
      if (isToday) {
        stroke(255, 220, 50, 240);
        strokeWeight(2 * sw);
        line(x, 0, x, bh);
        noStroke();
        fill(255, 220, 50, 240);
        textSize(10 / safeZ);
        textAlign(CENTER, TOP);
        text('TODAY', x, 3 / safeZ);
      }
    }
  }

  _drawResizeHandle(bw, bh, sw) {
    const hr  = bh * 0.5;  // handle height (half bar height)
    const hx  = bw;
    const hy  = bh / 2;
    const hw  = 5 * sw;   // handle width in world units

    // Grip background
    fill(80, 120, 200, 200);
    noStroke();
    rect(hx - hw, hy - hr / 2, hw, hr, 2 * sw);

    // Three grip dots
    fill(180, 210, 255, 220);
    for (let i = -1; i <= 1; i++) {
      circle(hx - hw / 2, hy + i * 5 * sw, 2.5 * sw);
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

