/**
 * TimelineMode.js - Horizontal calendar timeline overlay for mind mapping.
 *
 * All timeline state lives in the MindMap instance.  This file provides:
 *   - TimelineConnection class (arrow from a TextBox to a calendar-bar day tick)
 *   - TimelineMode class with static constants and static draw/utility methods
 *
 * Keyboard shortcut: Ctrl+K – creates timeline at cursor if inactive, or removes it if already active (MindMap.createTimeline())
 *
 * World-space placement:
 *   The bar is placed at the cursor position when created (Ctrl+K) and stored in
 *   MindMap.timelineBarX / timelineBarY.  It is drawn inside the camera transform
 *   so it zooms and pans with the rest of the mind map.  Stroke weights and
 *   text sizes are divided by the current zoom so they remain a constant size
 *   on screen.
 *
 * Resizing:
 *   Drag the grip handle at the right edge left/right to resize the bar.
 *
 * Connections:
 *   Drag from a box connector dot and release over the bar to attach the box to
 *   a day tick.  Click a connection arrow to select it; Delete/Backspace removes
 *   it.  All add/remove operations go through MindMap._wrapInTransaction() so
 *   they are tracked by the Yjs UndoManager and can be undone with Ctrl+Z.
 */

// ==============================================================================
// TimelineConnection – arrow from a TextBox to a calendar-bar day tick
// ==============================================================================
/**
 * Looks and behaves like a normal Connection but its "to" endpoint is a fixed
 * point on the timeline bar (the nearest top/bottom edge of the bar at the
 * day tick's world X coordinate).
 *
 * Stored in mindMap.timelineConnections (separate from mindMap.connections so
 * that MindMap's Yjs connection sync does not interfere).
 */
/**
 * TimelineConnection – arrow from a TextBox to a calendar-bar day tick.
 *
 * Extends Connection so it inherits identical draw/hit-test/drag machinery.
 * The only overrides are the endpoint geometry methods, which compute the
 * tick position from `dayIndex` instead of a target TextBox.
 *
 * Drag behaviour (via MindMap.draggingConnection):
 *   - Drop on the timeline bar → re-date (update dayIndex)
 *   - Drop on a TextBox        → remove from timelineConnections, create a
 *                                 regular Connection to that box
 */
class TimelineConnection extends Connection {
  /**
   * @param {TextBox} fromBox  – source box (its timelineDate field holds the calendar date)
   * @param {*}       mindMap  – MindMap instance (for bar geometry lookup)
   */
  constructor(fromBox, mindMap = null) {
    super(fromBox, null); // toBox is virtual (computed from fromBox.timelineDate)
    this.mindMap  = mindMap;
  }

  /**
   * The day index (0-based from timelineStartDate) is computed dynamically from
   * the box's timelineDate field, so it always tracks the correct calendar date
   * even when the timeline start date is shifted.
   * @returns {number}
   */
  get dayIndex() {
    if (this.fromBox && this.fromBox.timelineDate && this.mindMap && this.mindMap.timelineStartDate) {
      return TimelineMode.dayIndexForDate(this.fromBox.timelineDate, this.mindMap.timelineStartDate);
    }
    return 0;
  }

  // ---------------------------------------------------------------------------
  // Geometry overrides  (Connection's caching machinery is bypassed)
  // ---------------------------------------------------------------------------

  /**
   * Computes the world-space { start, end } pair.
   * `start` is on the fromBox edge; `end` is the day tick on the bar.
   * Overrides Connection._getConnectionEndpoints().
   * @returns {{start:{x,y}, end:{x,y}}|null}
   */
  _getConnectionEndpoints() {
    if (!this.fromBox) return null;
    const dayIndex = this.dayIndex;
    const barWidth = this.mindMap ? this.mindMap.getTimelineBarWidth() : TimelineMode.DEFAULT_WIDTH;
    const barX = this.mindMap ? (this.mindMap.timelineBarX || 0) : 0;
    const barY = this.mindMap ? (this.mindMap.timelineBarY || 0) : 0;
    const center = {
      x: barX + TimelineMode.worldDayCenterX(dayIndex, barWidth),
      y: barY + TimelineMode.dayCellCenterY(TimelineMode.BAR_HEIGHT),
      dayIndex,
    };
    if (typeof this.fromBox.getConnectionPoint !== 'function') return null;
    const start = this.fromBox.getConnectionPoint(center);
    if (!start || !isFinite(start.x) || !isFinite(start.y)) return null;
    const end = TimelineMode._projectToDayCellEdge(start, center, barX, barY);
    if (!end || !isFinite(end.x) || !isFinite(end.y)) return null;
    return { start, end };
  }

  /**
   * Returns the world-space position of the arrow tip (the day tick).
   * Overrides Connection.getArrowHeadPosition().
   * @returns {{x:number, y:number}|null}
   */
  getArrowHeadPosition() {
    const ep = this._getConnectionEndpoints();
    return ep ? ep.end : null;
  }

  /** Timeline connections cannot be reversed (no target box). */
  reverse() {}

  // ---------------------------------------------------------------------------
  // Serialisation  (date-aware — overrides Connection.toJSON/fromJSON)
  // ---------------------------------------------------------------------------

  toJSON() {
    return {
      fromId: this.fromBox ? this.fromBox.id : null,
      date:   this.fromBox ? this.fromBox.timelineDate : null,
    };
  }

  /**
   * Reconstruct a TimelineConnection from stored JSON.
   *
   * Accepts both the new format  {fromId, date}  and the legacy format
   * {fromId, dayIndex} (maps saved before this refactor).  When the legacy
   * format is encountered, the calendar date is computed from dayIndex +
   * mindMap.timelineStartDate and stored on the box so future saves use the
   * new format.
   *
   * @param {Object}              data        – {fromId, date} or {fromId, dayIndex}
   * @param {Map|Array<TextBox>}  boxesOrMap  – boxIdMap or boxes array
   * @param {*}                   mindMap     – MindMap instance (optional)
   * @returns {TimelineConnection|null}
   */
  static fromJSON(data, boxesOrMap, mindMap = null) {
    if (!data || !data.fromId) return null;
    // Require either a date string or a legacy dayIndex
    if (!data.date && data.dayIndex == null) return null;

    let fromBox = null;
    if (boxesOrMap instanceof Map) {
      fromBox = boxesOrMap.get(data.fromId);
    } else if (Array.isArray(boxesOrMap)) {
      fromBox = boxesOrMap.find(b => b && b.id === data.fromId);
    }
    if (!fromBox) return null;

    // Resolve the calendar date to store on the box.
    // Validate the format so that malformed persisted JSON cannot propagate into
    // day-index calculations (which would yield NaN and break geometry/filtering).
    const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    if (data.date) {
      if (!ISO_DATE_RE.test(data.date)) {
        console.warn('[TimelineConnection] fromJSON: invalid date format, skipping', data.date);
        return null;
      }
      fromBox.timelineDate = data.date;
    } else if (data.dayIndex != null && mindMap && mindMap.timelineStartDate) {
      // Legacy: compute calendar date from dayIndex + startDate
      const d = TimelineMode.dateForDay(data.dayIndex, mindMap.timelineStartDate);
      fromBox.timelineDate = TimelineMode.toISODateString(d);
    } else {
      if (data.dayIndex != null) {
        console.warn('[TimelineConnection] Skipping legacy connection: timelineStartDate unavailable for dayIndex migration', { fromId: data.fromId, dayIndex: data.dayIndex });
      }
      return null;
    }

    return new TimelineConnection(fromBox, mindMap);
  }
}

// ==============================================================================
// TimelineMode – static constants and utility functions
// ==============================================================================
class TimelineMode {
  // ============================================================================
  // STATIC CONSTANTS
  // ============================================================================

  /** Height of the calendar bar in world units */
  static BAR_HEIGHT = 60;
  /** Fixed world units per day — the scale never changes, handles extend the range */
  static DAY_WIDTH = 30;
  /** Default number of days shown (1 month) */
  static DEFAULT_TOTAL_DAYS = 31;
  /** Minimum number of days shown (1 week) */
  static MIN_TOTAL_DAYS = 7;
  /** Legacy: kept so old callers of DEFAULT_WIDTH don't break */
  static get DEFAULT_WIDTH() { return TimelineMode.DEFAULT_TOTAL_DAYS * TimelineMode.DAY_WIDTH; }
  /** Legacy: kept so old callers of MIN_WIDTH don't break */
  static get MIN_WIDTH() { return TimelineMode.MIN_TOTAL_DAYS * TimelineMode.DAY_WIDTH; }
  /** Legacy alias — actual total days is now stored in mindMap.timelineTotalDays */
  static get TOTAL_DAYS() { return TimelineMode.DEFAULT_TOTAL_DAYS; }
  /** World-unit tolerance for click-hit detection around the bar edges */
  static HIT_EXTEND = 15;
  /** World-unit hit radius for the resize handles */
  static HANDLE_RADIUS = 20;

  /** Abbreviated month names shared across all drawing methods */
  static MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  /** Abbreviated day names (Sun=0 … Sat=6) for date badge labels */
  static DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  /** Tick heights measured from bar bottom edge (world units) */
  static MONTH_TICK_H = 56;
  static WEEK_TICK_H  = 32;
  static DAY_TICK_H   = 18;
  /** Day cell visuals (world units) */
  static DAY_CELL_HEIGHT = 14;
  static DAY_CELL_INSET_X = 2;
  static DAY_CELL_BOTTOM_MARGIN = 6;

  // ============================================================================
  // STATIC GEOMETRY UTILITIES
  // ============================================================================

  /** World X of a given day tick — fixed scale, DAY_WIDTH units per day */
  static worldDayX(dayIndex, _barWidth) {
    return dayIndex * TimelineMode.DAY_WIDTH;
  }

  /** World X of the centre of a given day cell. */
  static worldDayCenterX(dayIndex, _barWidth) {
    return TimelineMode.worldDayX(dayIndex, _barWidth) + TimelineMode.DAY_WIDTH / 2;
  }

  /** Bar-local Y of the centre of day cells. */
  static dayCellCenterY(barHeight) {
    return barHeight - TimelineMode.DAY_CELL_BOTTOM_MARGIN - TimelineMode.DAY_CELL_HEIGHT / 2;
  }

  /** Geometry for a day cell in bar-local coordinates. */
  static dayCellRect(dayIndex, barHeight) {
    const x = TimelineMode.worldDayX(dayIndex, 0) + TimelineMode.DAY_CELL_INSET_X;
    const y = barHeight - TimelineMode.DAY_CELL_BOTTOM_MARGIN - TimelineMode.DAY_CELL_HEIGHT;
    const w = Math.max(1, TimelineMode.DAY_WIDTH - TimelineMode.DAY_CELL_INSET_X * 2);
    const h = TimelineMode.DAY_CELL_HEIGHT;
    return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
  }

  /** Intersection point of the line from start to target with the day cell boundary. */
  static _projectToDayCellEdge(start, target, barX, barY) {
    const cell = TimelineMode.dayCellRect(target.dayIndex, TimelineMode.BAR_HEIGHT);
    const rect = {
      left: barX + cell.x,
      right: barX + cell.x + cell.w,
      top: barY + cell.y,
      bottom: barY + cell.y + cell.h,
    };
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    const candidates = [];
    if (Math.abs(dx) > 1e-6) {
      const tLeft = (rect.left - start.x) / dx;
      const yLeft = start.y + dy * tLeft;
      if (tLeft >= 0 && tLeft <= 1 && yLeft >= rect.top && yLeft <= rect.bottom) {
        candidates.push({ t: tLeft, x: rect.left, y: yLeft });
      }
      const tRight = (rect.right - start.x) / dx;
      const yRight = start.y + dy * tRight;
      if (tRight >= 0 && tRight <= 1 && yRight >= rect.top && yRight <= rect.bottom) {
        candidates.push({ t: tRight, x: rect.right, y: yRight });
      }
    }
    if (Math.abs(dy) > 1e-6) {
      const tTop = (rect.top - start.y) / dy;
      const xTop = start.x + dx * tTop;
      if (tTop >= 0 && tTop <= 1 && xTop >= rect.left && xTop <= rect.right) {
        candidates.push({ t: tTop, x: xTop, y: rect.top });
      }
      const tBottom = (rect.bottom - start.y) / dy;
      const xBottom = start.x + dx * tBottom;
      if (tBottom >= 0 && tBottom <= 1 && xBottom >= rect.left && xBottom <= rect.right) {
        candidates.push({ t: tBottom, x: xBottom, y: rect.bottom });
      }
    }
    if (candidates.length === 0) return target;
    candidates.sort((a, b) => a.t - b.t);
    return { x: candidates[0].x, y: candidates[0].y };
  }

  /** Day index from a world X coordinate — fixed scale, rounds to nearest day */
  static dayFromWorldX(worldX, _barWidth) {
    return Math.max(0, Math.floor(worldX / TimelineMode.DAY_WIDTH));
  }

  /**
   * True when (worldX, worldY) is within the interactive hit area of the bar.
   * HIT_EXTEND provides a small tolerance around all four edges.
   */
  static isOverBarWorld(worldX, worldY, barWidth) {
    const ext = TimelineMode.HIT_EXTEND;
    return worldX >= -ext &&
           worldX <= barWidth + ext &&
           worldY >= -ext &&
           worldY <= TimelineMode.BAR_HEIGHT + ext;
  }

  /** True when (worldX, worldY) is over either the left or right resize handle. */
  static isDragHandle(worldX, worldY, barWidth) {
    return TimelineMode.isRightDragHandle(worldX, worldY, barWidth) ||
           TimelineMode.isLeftDragHandle(worldX, worldY);
  }

  /** Right handle: drag to extend/shrink the future end of the timeline. */
  static isRightDragHandle(worldX, worldY, barWidth) {
    const r = TimelineMode.HANDLE_RADIUS;
    return Math.abs(worldX - barWidth) <= r &&
           worldY >= -r && worldY <= TimelineMode.BAR_HEIGHT + r;
  }

  /** Left handle: drag to extend/shrink the past end of the timeline. */
  static isLeftDragHandle(worldX, worldY) {
    const r = TimelineMode.HANDLE_RADIUS;
    return Math.abs(worldX) <= r &&
           worldY >= -r && worldY <= TimelineMode.BAR_HEIGHT + r;
  }

  /** Returns the Date corresponding to a given day index */
  static dateForDay(dayIndex, startDate) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + dayIndex);
    return d;
  }

  /**
   * Returns the day index (0-based from startDate) for a given calendar date.
   * This is the inverse of dateForDay().
   *
   * "YYYY-MM-DD" strings are interpreted as LOCAL midnight (not UTC midnight).
   * `new Date("YYYY-MM-DD")` parses as UTC midnight, which is the wrong local
   * date for UTC+ users.  Using the Date(y, m, d) constructor forces local time
   * so the same date string resolves to the same calendar day on every client.
   *
   * @param {string|Date} date      – ISO date string ("YYYY-MM-DD") or Date object
   * @param {Date}        startDate – timeline start date
   * @returns {number} integer day index (may be negative or beyond the bar)
   */
  static dayIndexForDate(date, startDate) {
    // Parse "YYYY-MM-DD" strings as local midnight so all clients agree on which
    // day they refer to.  Date objects are normalised to local midnight via setHours.
    const toLocalMidnight = (d) => {
      if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
        const [y, mo, da] = d.split('-').map(Number);
        return new Date(y, mo - 1, da); // local midnight — timezone-invariant
      }
      const result = new Date(d);
      result.setHours(0, 0, 0, 0);
      return result;
    };
    return Math.round((toLocalMidnight(date) - toLocalMidnight(startDate)) / 86400000);
  }

  /**
   * Converts a Date (or Date-like value) to an ISO-8601 date-only string
   * (e.g. "2024-01-15") using LOCAL date components.
   *
   * Using toISOString() returns the UTC date, which is wrong for UTC+ users
   * because local midnight (e.g. Jan 15 00:00 UTC+5) is Jan 14 19:00 UTC.
   * Using getFullYear/getMonth/getDate() always returns the local calendar date.
   *
   * All timeline date storage goes through this helper so the format is consistent.
   * @param {Date|string} date
   * @returns {string}  "YYYY-MM-DD"
   */
  static toISODateString(date) {
    const d = new Date(date);
    const y  = d.getFullYear();
    const m  = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${da}`;
  }

  /**
   * Returns the day index of today relative to startDate, or -1 if today is
   * before startDate (i.e. not visible on the bar).
   */
  static todayDayIndex(startDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    return Math.round((today - start) / 86400000);
  }

  /** ISO week number */
  static weekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  }

  // ============================================================================
  // STATIC DRAW METHODS
  // ============================================================================

  /**
   * Draw timeline connections in world space so they can be layered under boxes.
   * Called from sketch.js before mindMap.draw().
   */
  static drawConnectionsUnderlay(mindMap) {
    if (!mindMap || !mindMap.timelineActive || !mindMap.timelineStartDate) return;
    const conns = mindMap.timelineConnections || [];
    const totalDays = mindMap.timelineTotalDays || TimelineMode.DEFAULT_TOTAL_DAYS;
    const visibleConns = conns.filter(c => c.dayIndex >= 0 && c.dayIndex < totalDays);
    const draggingConn = mindMap.draggingConnection ? mindMap.draggingConnection.conn : null;

    for (const conn of visibleConns) {
      if (conn === draggingConn) continue;
      if (typeof conn.draw === 'function') {
        try { conn.draw(); } catch (_) { /* skip broken connection */ }
      }
    }
  }

  /**
   * Draw the full timeline bar for the live canvas.
   * Must be called INSIDE the camera transform (push/translate/scale already applied).
   *
   * @param {*} mindMap – current MindMap instance
   */
  static drawBar(mindMap) {
    if (!mindMap || !mindMap.timelineActive || !mindMap.timelineStartDate) return;
    const z = typeof CameraUtils !== 'undefined' ? (CameraUtils.zoom || 1) : 1;
    const safeZ = Math.max(0.01, z);
    TimelineMode._renderBar(new DrawCtx(null), mindMap, safeZ, { withDragPreview: true });
  }

  /**
   * Draw the timeline bar into a p5 graphics buffer for export.
   * Must be called INSIDE a pg.push() / pg.translate(contentOffX, contentOffY) block.
   * Text and stroke weights are at world scale (zoom = 1).
   *
   * @param {p5.Graphics} pg      – offscreen graphics buffer
   * @param {*}           mindMap – used to resolve box positions and bar width
   */
  static drawToGraphics(pg, mindMap) {
    if (!mindMap) return;
    TimelineMode._renderBar(new DrawCtx(pg), mindMap, 1, {
      bg: [15, 20, 40, 210],
      withConnections: true,
    });
  }

  // ============================================================================
  // STATIC DRAW HELPERS
  // ============================================================================

  /**
   * Core bar renderer — works for both live canvas and export buffer.
   * Called by drawBar() and drawToGraphics() with an appropriate DrawCtx.
   *
   * @param {DrawCtx} ctx
   * @param {*}       mindMap
   * @param {number}  safeZ  – 1/zoom for live (keeps things screen-constant); 1 for export
   * @param {Object}  [opts]
   * @param {number[]} [opts.bg]              – fill(...bg) for bar background; null → transparent
   * @param {boolean}  [opts.withConnections] – draw connection arrows behind bar (export)
   * @param {boolean}  [opts.withDragPreview] – draw snap preview (live only)
   */
  static _renderBar(ctx, mindMap, safeZ, { bg = null, withConnections = false, withDragPreview = false } = {}) {
    const bw  = mindMap.getTimelineBarWidth?.() ?? TimelineMode.DEFAULT_WIDTH;
    const bh  = TimelineMode.BAR_HEIGHT;
    const barX = mindMap.timelineBarX || 0;
    const barY = mindMap.timelineBarY || 0;

    const totalDays   = mindMap.timelineTotalDays || TimelineMode.DEFAULT_TOTAL_DAYS;
    const conns       = mindMap.timelineConnections || [];
    const visibleConns = conns.filter(c => c.dayIndex >= 0 && c.dayIndex < totalDays);
    const highlightedDays = new Set(visibleConns.map(c => c.dayIndex));
    const startDate   = mindMap.timelineStartDate || new Date();

    const sw = 1 / safeZ;  // 1 screen-pixel stroke
    const ts = 11 / safeZ; // base label font size

    ctx.push();
    ctx.translate(barX, barY);

    // Connections drawn behind bar (export path; live uses drawConnectionsUnderlay)
    if (withConnections) {
      TimelineMode._drawConnections(ctx, visibleConns, barX, barY);
    }

    // Bar background (export fills it; live is transparent over the canvas background)
    if (bg) {
      ctx.noStroke();
      ctx.fill(...bg);
      ctx.rect(0, 0, bw, bh);
    } else if (!bg && !withConnections) {
      // Live mode: use palette background
      const barBg = ColorPalette.TIMELINE.BAR_BACKGROUND;
      ctx.noStroke();
      ctx.fill(barBg.r, barBg.g, barBg.b, barBg.a);
      ctx.rect(0, 0, bw, bh);
    }

    // Bar border
    const barBorder = ColorPalette.TIMELINE.BAR_BORDER;
    ctx.stroke(barBorder.r, barBorder.g, barBorder.b, barBorder.a);
    ctx.strokeWeight(sw);
    ctx.noFill();
    ctx.rect(0, 0, bw, bh);

    // Gradations: month dividers, week ticks, day cells
    TimelineMode._drawGradations(ctx, bw, bh, highlightedDays, safeZ, sw, ts, startDate);

    // Snap preview while dragging a connection to the bar (live only)
    if (withDragPreview) {
      TimelineMode._drawConnectionDragPreview(bw, bh, safeZ, sw, mindMap, barX, barY);
    }

    // Resize handles
    TimelineMode._drawResizeHandle(ctx, bw, bh, sw);

    // Selection ring
    if (mindMap.timelineSelected) {
      const margin = 4 / safeZ;
      const selectionRing = ColorPalette.TIMELINE.SELECTION_RING;
      ctx.stroke(selectionRing.r, selectionRing.g, selectionRing.b, selectionRing.a);
      ctx.strokeWeight(sw * ColorPalette.TIMELINE.SELECTION_RING_WEIGHT);
      ctx.noFill();
      ctx.rect(-margin, -margin, bw + margin * 2, bh + margin * 2, 3 / safeZ);
    }

    ctx.pop();
  }

  /**
   * Draw connection arrows behind the bar.  Endpoint world-coords are shifted into
   * bar-local space because the caller has already applied translate(barX, barY).
   * Only used in the export path; live connections are drawn by drawConnectionsUnderlay.
   *
   * @param {DrawCtx}             ctx
   * @param {TimelineConnection[]} visibleConns
   * @param {number}              barX
   * @param {number}              barY
   */
  static _drawConnections(ctx, visibleConns, barX, barY) {
    const ARROW_SIZE = 12;
    const connLine = ColorPalette.TIMELINE.CONNECTION_LINE;
    const connArrow = ColorPalette.TIMELINE.CONNECTION_ARROW;
    
    for (const conn of visibleConns) {
      if (!conn?._getConnectionEndpoints) continue;
      const ep = conn._getConnectionEndpoints();
      if (!ep) continue;
      const { start, end: tick } = ep;
      if (!isFinite(start.x) || !isFinite(start.y)) continue;

      // World → bar-local (translate(barX,barY) is already in effect)
      const sx = start.x - barX, sy = start.y - barY;
      const tx = tick.x  - barX, ty = tick.y  - barY;
      const dx = tx - sx, dy = ty - sy;
      if (Math.sqrt(dx * dx + dy * dy) < 1) continue;

      const angle = Math.atan2(dy, dx);
      ctx.stroke(connLine.r, connLine.g, connLine.b, connLine.a);
      ctx.strokeWeight(2);
      ctx.noFill();
      ctx.line(sx, sy, tx - ARROW_SIZE * Math.cos(angle), ty - ARROW_SIZE * Math.sin(angle));
      ctx.fill(connArrow.r, connArrow.g, connArrow.b, connArrow.a);
      ctx.noStroke();
      ctx.push();
      ctx.translate(tx, ty);
      ctx.rotate(angle);
      ctx.triangle(0, 0, -ARROW_SIZE, -ARROW_SIZE / 2, -ARROW_SIZE, ARROW_SIZE / 2);
      ctx.pop();
    }
  }

  /** @private */
  static _drawConnectionDragPreview(bw, bh, safeZ, sw, mindMap, barX = 0, barY = 0) {
    if (!mindMap) return;
    if (typeof worldMouseX === 'undefined' || typeof worldMouseY === 'undefined') return;

    const mx = worldMouseX();
    const my = worldMouseY();

    // Convert world mouse coords to bar-local coords for hit testing and day lookup
    const lx = mx - barX;
    const ly = my - barY;

    // Determine which source box drives the snap:
    //   - connectingFrom: dragging a new connection from a box connector dot
    //   - draggingConnection: reattaching an arrowhead (timeline or normal) toward the bar
    const hasSource = !!(mindMap.connectingFrom || (mindMap.draggingConnection && mindMap.draggingConnection.conn));
    if (!hasSource) return;
    if (!TimelineMode.isOverBarWorld(lx, ly, bw)) return;

    const totalDays = Math.round(bw / TimelineMode.DAY_WIDTH);
    const dayIndex = Math.min(TimelineMode.dayFromWorldX(lx, bw), totalDays - 1);
    const cell = TimelineMode.dayCellRect(dayIndex, bh);
    const tx = cell.cx;
    const ty = cell.cy;

    // Highlight the snapped day cell
    const snapHighlight = ColorPalette.TIMELINE.SNAP_HIGHLIGHT;
    stroke(snapHighlight.r, snapHighlight.g, snapHighlight.b, snapHighlight.a);
    strokeWeight(2 * sw);
    noFill();
    rect(cell.x, cell.y, cell.w, cell.h, 2 / safeZ);

    // Snap dot
    noStroke();
    const snapDot = ColorPalette.TIMELINE.SNAP_DOT;
    fill(snapDot.r, snapDot.g, snapDot.b, snapDot.a);
    circle(tx, ty, 8 * sw);
  }

  /**
   * Draw a small date badge (pill) above the top-right corner of each box that
   * has a timeline connection.  Called by drawBar() when the bar is visible, and
   * by MindMap.drawTimelineDateLabels() when the bar is hidden.
   * Must be called inside the camera transform (caller owns push/pop).
   *
   * @param {TimelineConnection[]} conns     – connections to draw badges for
   * @param {Date}                 startDate – origin date; day 0 maps to this date
   * @param {number}               safeZ     – current camera zoom (≥0.01) used to
   *                                          keep badge text a constant screen size
   */
  static drawBoxDateLabels(conns, startDate, safeZ) {
    if (!conns || conns.length === 0) return;
    const fontSize = 9 / safeZ;
    const padding  = 3 / safeZ;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const conn of conns) {
      if (!conn || !conn.fromBox || !conn.fromBox.timelineDate) continue;
      const box = conn.fromBox;
      if (box.x == null || box.y == null || box.width == null || box.height == null) continue;

      const date    = TimelineMode.dateForDay(conn.dayIndex, startDate);
      const dayName = TimelineMode.DAY_NAMES[date.getDay()];
      const label   = dayName + ' ' + date.getDate() + ' ' + TimelineMode.MONTH_NAMES[date.getMonth()];
      const isPast  = date < today;

      // Position: top-right corner of the box, shifted up so it doesn't overlap the box outline.
      // box.x is the box centre, so box.x + box.width/2 is the right edge in world space.
      // lx is the left edge of the pill so that lx + labelW == right edge of box.
      textSize(fontSize);
      const labelW = textWidth(label) + padding * 2;
      const labelH = fontSize + padding * 2;
      const lx = box.x + box.width / 2 - labelW;  // pill right edge aligns with box right edge
      const ly = box.y - box.height / 2 - labelH - 2 / safeZ; // just above the box

      // Pill background — yellow for today, blue for future, red for past, highlighted when selected
      noStroke();
      let pillBg;
      if (conn.selected) {
        pillBg = ColorPalette.TIMELINE.BADGE_SELECTED;
      } else if (isPast) {
        pillBg = ColorPalette.TIMELINE.BADGE_PAST;
      } else if (date.getTime() === today.getTime()) {
        pillBg = ColorPalette.TIMELINE.BADGE_TODAY;
      } else {
        pillBg = ColorPalette.TIMELINE.BADGE_FUTURE;
      }
      fill(pillBg.r, pillBg.g, pillBg.b, pillBg.a);
      rect(lx, ly, labelW, labelH, labelH / 2);

      // Label text — use contrast color based on pill background
      const textColor = ColorPalette.getContrastColor(pillBg);
      fill(textColor.r, textColor.g, textColor.b, textColor.a);
      noStroke();
      textAlign(CENTER, CENTER);
      text(label, lx + labelW / 2, ly + labelH / 2);
    }
  }

  /** @private */
  static _drawGradations(ctx, bw, bh, highlightedDays, safeZ, sw, ts, startDate) {
    const totalDays    = Math.round(bw / TimelineMode.DAY_WIDTH);
    const dayWorldPx   = TimelineMode.DAY_WIDTH;            // fixed scale
    const showDayNums  = dayWorldPx * safeZ >= 14; // visible at ≥14 screen-px/day
    const showWeekNums = dayWorldPx * safeZ >= 4;
    const todayIndex   = TimelineMode.todayDayIndex(startDate); // may be outside [0, totalDays)

    let currentMonth = -1;

    for (let d = 0; d < totalDays; d++) {
      const date = TimelineMode.dateForDay(d, startDate);
      const x   = TimelineMode.worldDayX(d, bw);
      const dom = date.getDate();
      const mon = date.getMonth();
      const dow = date.getDay();   // 0=Sun … 6=Sat
      const isHighlighted = highlightedDays.has(d);
      const isToday       = d === todayIndex;
      const isWeekday     = dow >= 1 && dow <= 5;
      const cell          = TimelineMode.dayCellRect(d, bh);

      // Month divider
      if (dom === 1 || mon !== currentMonth) {
        if (dom === 1 || d === 0) {
          currentMonth = mon;
          ctx.noStroke();
          const monthLabel = ColorPalette.TIMELINE.MONTH_LABEL;
          ctx.fill(monthLabel.r, monthLabel.g, monthLabel.b, monthLabel.a);
          ctx.textSize(ts);
          ctx.textAlign(ctx.LEFT, ctx.TOP);
          ctx.text(TimelineMode.MONTH_NAMES[mon] + ' ' + date.getFullYear(), x + 3 / safeZ, 3 / safeZ);
          const barBorder = ColorPalette.TIMELINE.BAR_BORDER;
          ctx.stroke(barBorder.r, barBorder.g, barBorder.b, barBorder.a);
          ctx.strokeWeight(sw);
          ctx.line(x, 0, x, bh);
          ctx.noStroke();
        }
      }

      // Week marker (Monday)
      if (dow === 1 && showWeekNums) {
        const weekTick = ColorPalette.TIMELINE.WEEKDAY_STROKE;
        ctx.stroke(weekTick.r, weekTick.g, weekTick.b, weekTick.a);
        ctx.strokeWeight(sw);
        ctx.line(x, bh - TimelineMode.WEEK_TICK_H, x, bh);
        ctx.noStroke();
        if (showDayNums) {
          const weekNum = ColorPalette.TIMELINE.WEEK_NUMBER;
          ctx.fill(weekNum.r, weekNum.g, weekNum.b, weekNum.a);
          ctx.textSize(9 / safeZ);
          ctx.textAlign(ctx.CENTER, ctx.BOTTOM);
          ctx.text('W' + TimelineMode.weekNumber(date), x, bh - TimelineMode.WEEK_TICK_H - 2 / safeZ);
        }
      }

      // Day cell — color based on day type
      let cellFill, cellStroke, cellText;
      
      if (isToday) {
        cellFill = ColorPalette.TIMELINE.TODAY_FILL;
        cellStroke = ColorPalette.TIMELINE.TODAY_STROKE;
        cellText = ColorPalette.TIMELINE.TODAY_TEXT;
      } else if (isHighlighted) {
        cellFill = ColorPalette.TIMELINE.DAY_FILL;
        cellStroke = ColorPalette.TIMELINE.DAY_STROKE;
        cellText = ColorPalette.TIMELINE.DAY_TEXT;
      } else if (isWeekday) {
        cellFill = ColorPalette.TIMELINE.WEEKDAY_FILL;
        cellStroke = ColorPalette.TIMELINE.WEEKDAY_STROKE;
        cellText = ColorPalette.TIMELINE.WEEKDAY_TEXT;
      } else {
        cellFill = ColorPalette.TIMELINE.WEEKEND_FILL;
        cellStroke = ColorPalette.TIMELINE.WEEKEND_STROKE;
        cellText = ColorPalette.TIMELINE.WEEKEND_TEXT;
      }
      
      ctx.fill(cellFill.r, cellFill.g, cellFill.b, cellFill.a);
      ctx.stroke(cellStroke.r, cellStroke.g, cellStroke.b, cellStroke.a);
      ctx.strokeWeight((isToday || isHighlighted) ? 1.5 * sw : sw);
      ctx.rect(cell.x, cell.y, cell.w, cell.h, 2 / safeZ);

      if (showDayNums) {
        ctx.noStroke();
        ctx.fill(cellText.r, cellText.g, cellText.b, cellText.a);
        ctx.textSize(8 / safeZ);
        ctx.textAlign(ctx.CENTER, ctx.CENTER);
        ctx.text(dom, cell.cx, cell.cy + 0.5 / safeZ);
      }
    }
  }

  /** @private – draws both the right-extend and left-extend grip handles */
  static _drawResizeHandle(ctx, bw, bh, sw) {
    const hr = bh * 0.5;
    const hy = bh / 2;
    const hw = 5 * sw;

    const handleBg = ColorPalette.TIMELINE.RESIZE_HANDLE_BG;
    const handleDot = ColorPalette.TIMELINE.RESIZE_HANDLE_DOT;

    ctx.noStroke();
    ctx.fill(handleBg.r, handleBg.g, handleBg.b, handleBg.a);

    // Right handle (extend future)
    ctx.rect(bw - hw, hy - hr / 2, hw, hr, 2 * sw);
    ctx.fill(handleDot.r, handleDot.g, handleDot.b, handleDot.a);
    for (let i = -1; i <= 1; i++) ctx.circle(bw - hw / 2, hy + i * 5 * sw, 2.5 * sw);

    // Left handle (extend past)
    ctx.fill(handleBg.r, handleBg.g, handleBg.b, handleBg.a);
    ctx.rect(0, hy - hr / 2, hw, hr, 2 * sw);
    ctx.fill(handleDot.r, handleDot.g, handleDot.b, handleDot.a);
    for (let i = -1; i <= 1; i++) ctx.circle(hw / 2, hy + i * 5 * sw, 2.5 * sw);
  }
}


// ==============================================================================
// MODULE EXPORT (for Jest / Node.js)
// ==============================================================================
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TimelineMode;
  module.exports.TimelineConnection = TimelineConnection;
}

// ==============================================================================
// BROWSER SELF-REGISTRATION
// ==============================================================================
/* istanbul ignore next */
if (typeof window !== 'undefined') {
  window.TimelineMode = TimelineMode;
  window.TimelineConnection = TimelineConnection;
}
