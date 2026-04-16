/**
 * Unit tests for TimelineMode (refactored static-utility API)
 *
 * Follows the same vm-sandbox pattern used by ThrustGame.test.js:
 *   - Load the source file with vm.Script into a sandbox that stubs all p5 globals
 *   - Retrieve the exported class from sandbox.module.exports
 *
 * All active-state (toggle, mouse handlers) is now in MindMap; these tests
 * cover only TimelineMode static utilities and TimelineConnection.
 */

'use strict';

const vm   = require('vm');
const fs   = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Build sandbox (p5 stubs + window stub + Connection dependencies)
// ---------------------------------------------------------------------------
const p5Stubs = {
  push:         jest.fn(),
  pop:          jest.fn(),
  fill:         jest.fn(),
  noFill:       jest.fn(),
  stroke:       jest.fn(),
  noStroke:     jest.fn(),
  strokeWeight: jest.fn(),
  rect:         jest.fn(),
  line:         jest.fn(),
  circle:       jest.fn(),
  triangle:     jest.fn(),
  translate:    jest.fn(),
  rotate:       jest.fn(),
  text:         jest.fn(),
  textSize:     jest.fn(),
  textAlign:    jest.fn(),
  textWidth:    jest.fn(() => 40),
  LEFT:   'left',
  RIGHT:  'right',
  CENTER: 'center',
  TOP:    'top',
  BOTTOM: 'bottom',
  keyIsDown: jest.fn(() => false),
};

// Build the sandbox before loading any scripts so stubs are available.
const sandbox = {
  ...p5Stubs,
  Math,
  Date,
  Number,
  Set,
  Map,
  Array,
  Float64Array,
  isFinite,
  isNaN,
  console,
  module: { exports: {} },
  window: {},
  // CameraUtils stub – zoom=1 by default so 1/safeZ = 1 in drawing
  CameraUtils: { zoom: 1 },
  // worldMouseX/Y used by _drawConnectionDragPreview
  worldMouseX: jest.fn(() => -9999),
  worldMouseY: jest.fn(() => -9999),
  // ColorPalette stub (Connection.COLORS = ColorPalette.CONNECTION)
  ColorPalette: {
    CONNECTION: {
      NORMAL:   { r: 80,  g: 100, b: 160, a: 255 },
      SELECTED: { r: 255, g: 140, b: 0,   a: 255 },
    },
    BASE: { 
      BLACK: { r: 0, g: 0, b: 0, a: 255 },
      WHITE: { r: 255, g: 255, b: 255, a: 255 },
      PRIMARY: { r: 60, g: 120, b: 255, a: 255 },
      WARNING: { r: 255, g: 193, b: 7, a: 255 },
    },
    TIMELINE: {
      BAR_BACKGROUND: { r: 15, g: 20, b: 40, a: 210 },
      BAR_BORDER: { r: 60, g: 80, b: 140, a: 180 },
      TODAY_FILL: { r: 255, g: 193, b: 7, a: 255 },
      TODAY_STROKE: { r: 200, g: 165, b: 0, a: 255 },
      TODAY_TEXT: { r: 0, g: 0, b: 0, a: 255 },
      DAY_FILL: { r: 60, g: 120, b: 255, a: 255 },
      DAY_STROKE: { r: 125, g: 225, b: 255, a: 255 },
      DAY_TEXT: { r: 255, g: 255, b: 255, a: 255 },
      WEEKDAY_FILL: { r: 88, g: 106, b: 168, a: 205 },
      WEEKDAY_STROKE: { r: 118, g: 140, b: 205, a: 210 },
      WEEKDAY_TEXT: { r: 225, g: 235, b: 255, a: 220 },
      WEEKEND_FILL: { r: 58, g: 70, b: 118, a: 190 },
      WEEKEND_STROKE: { r: 82, g: 98, b: 155, a: 180 },
      WEEKEND_TEXT: { r: 225, g: 235, b: 255, a: 220 },
      MONTH_LABEL: { r: 180, g: 200, b: 255, a: 220 },
      WEEK_NUMBER: { r: 140, g: 160, b: 220, a: 180 },
      RESIZE_HANDLE_BG: { r: 80, g: 120, b: 200, a: 200 },
      RESIZE_HANDLE_DOT: { r: 180, g: 210, b: 255, a: 220 },
      SELECTION_RING: { r: 100, g: 180, b: 255, a: 220 },
      SELECTION_RING_WEIGHT: 2,
      SNAP_HIGHLIGHT: { r: 100, g: 200, b: 255, a: 255 },
      SNAP_DOT: { r: 100, g: 200, b: 255, a: 220 },
      BADGE_TODAY: { r: 255, g: 193, b: 7, a: 255 },
      BADGE_FUTURE: { r: 60, g: 120, b: 255, a: 255 },
      BADGE_PAST: { r: 200, g: 60, b: 60, a: 210 },
      BADGE_SELECTED: { r: 255, g: 140, b: 0, a: 210 },
      BADGE_TEXT: { r: 255, g: 255, b: 255, a: 255 },
      CONNECTION_LINE: { r: 80, g: 100, b: 160, a: 255 },
      CONNECTION_ARROW: { r: 80, g: 100, b: 160, a: 255 },
    },
    getContrastColor: (bg) => {
      if (!bg) return { r: 0, g: 0, b: 0, a: 255 };
      const luminance = 0.299 * (bg.r || 0) + 0.587 * (bg.g || 0) + 0.114 * (bg.b || 0);
      return luminance > 150 ? { r: 0, g: 0, b: 0, a: 255 } : { r: 255, g: 255, b: 255, a: 255 };
    },
  },
  // Utils stub (subset used by Connection and TimelineConnection)
  Utils: null, // filled after sandbox creation so we can reference p5Stubs
};

// Utils references sandbox.stroke etc. so build it after sandbox is defined.
sandbox.Utils = {
  Logger: { error: jest.fn(), warn: jest.fn() },
  areValidCoordinates: (x, y) => isFinite(x) && isFinite(y),
  isValidNumber: (n) => isFinite(n),
  getWorldMouseCoordinates: () => ({ x: sandbox.worldMouseX(), y: sandbox.worldMouseY() }),
  getCurrentZoom: () => 1,
  clamp: (val, lo, hi) => Math.max(lo, Math.min(hi, val)),
  distance: (x1, y1, x2, y2) => Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2),
  distanceToSegment(px, py, ax, ay, bx, by) {
    const abx = bx - ax, aby = by - ay;
    const len2 = abx * abx + aby * aby;
    if (len2 === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
    const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / len2));
    return Math.sqrt((px - (ax + t * abx)) ** 2 + (py - (ay + t * aby)) ** 2);
  },
  applyStroke(color, weight) {
    if (color) sandbox.stroke(color.r || 0, color.g || 0, color.b || 0);
    if (weight !== undefined) sandbox.strokeWeight(weight);
  },
  applyFill(color) {
    if (color) sandbox.fill(color.r || 0, color.g || 0, color.b || 0);
  },
};

// Load Connection.js so TimelineConnection can extend it.
// sandbox acts as globalThis inside the vm, so globalThis.Connection = Connection
// in Connection.js sets sandbox.Connection.
new vm.Script(fs.readFileSync(path.join(__dirname, '../../src/Connection.js'), 'utf8'))
  .runInNewContext(sandbox);

// Load the shared draw adapter used by TimelineMode's live/export renderer.
sandbox.module = { exports: {} };
new vm.Script(fs.readFileSync(path.join(__dirname, '../../src/DrawCtx.js'), 'utf8'))
  .runInNewContext(sandbox);
sandbox.DrawCtx = sandbox.module.exports;

// Reset module.exports so TimelineMode.js can use it for its own export.
sandbox.module = { exports: {} };

// Load TimelineMode.js (TimelineConnection extends Connection which is now in scope).
new vm.Script(fs.readFileSync(path.join(__dirname, '../../src/TimelineMode.js'), 'utf8'))
  .runInNewContext(sandbox);

const TimelineMode       = sandbox.module.exports;
const TimelineConnection = sandbox.module.exports.TimelineConnection;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeBox(id, x = 0, y = 0, timelineDate = null) {
  return {
    id, x, y, width: 100, height: 40,
    timelineDate,
    getConnectionPoint(other) { return { x: this.x, y: this.y }; }
  };
}

function makeMindMap(boxes = [], timelineBarWidth = null) {
  return {
    boxes,
    boxIdMap: new Map(boxes.map(b => [b.id, b])),
    timelineConnections: [],
    timelineBarWidth,
    selectedBox: null,
    connectingFrom: null,
    draggingConnection: null,
    timelineActive: true,
    timelineStartDate: new Date(),
    getTimelineBarWidth() {
      return this.timelineBarWidth || TimelineMode.DEFAULT_WIDTH;
    }
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================================
// Static geometry – worldDayX / dayFromWorldX
// ============================================================
describe('TimelineMode.worldDayX / dayFromWorldX', () => {
  const barWidth = TimelineMode.DEFAULT_WIDTH;

  test('day 0 maps to x=0', () => {
    expect(TimelineMode.worldDayX(0, barWidth)).toBe(0);
  });

  test('last day maps to final day tick (barWidth - DAY_WIDTH)', () => {
    expect(TimelineMode.worldDayX(TimelineMode.TOTAL_DAYS - 1, barWidth)).toBeCloseTo(
      barWidth - TimelineMode.DAY_WIDTH,
      1
    );
  });

  test('round-trips correctly for a mid day', () => {
    const mid = Math.floor(TimelineMode.TOTAL_DAYS / 2);
    expect(TimelineMode.dayFromWorldX(TimelineMode.worldDayX(mid, barWidth), barWidth)).toBe(mid);
  });

  test('worldX=0 maps back to day 0', () => {
    expect(TimelineMode.dayFromWorldX(0, barWidth)).toBe(0);
  });

  test('worldX=barWidth maps to one tick beyond last index (callers clamp)', () => {
    expect(TimelineMode.dayFromWorldX(barWidth, barWidth)).toBe(TimelineMode.TOTAL_DAYS);
  });
});

// ============================================================
// Static geometry – isOverBarWorld / isDragHandle
// ============================================================
describe('TimelineMode.isOverBarWorld / isDragHandle', () => {
  const barWidth = TimelineMode.DEFAULT_WIDTH;

  test('returns true for world coords inside the bar', () => {
    expect(TimelineMode.isOverBarWorld(100, 40, barWidth)).toBe(true);
  });

  test('returns true within HIT_EXTEND above the bar top', () => {
    expect(TimelineMode.isOverBarWorld(100, -TimelineMode.HIT_EXTEND + 1, barWidth)).toBe(true);
  });

  test('returns false well outside the bar', () => {
    expect(TimelineMode.isOverBarWorld(100, -200, barWidth)).toBe(false);
  });

  test('returns false beyond the right edge + HIT_EXTEND', () => {
    expect(TimelineMode.isOverBarWorld(barWidth + TimelineMode.HIT_EXTEND + 1, 40, barWidth)).toBe(false);
  });

  test('isDragHandle returns true near the right edge', () => {
    expect(TimelineMode.isDragHandle(barWidth, TimelineMode.BAR_HEIGHT / 2, barWidth)).toBe(true);
  });

  test('isDragHandle returns true within HANDLE_RADIUS', () => {
    expect(TimelineMode.isDragHandle(barWidth - TimelineMode.HANDLE_RADIUS + 1, 40, barWidth)).toBe(true);
  });

  test('isDragHandle returns false far from both handles', () => {
    expect(TimelineMode.isDragHandle(barWidth / 2, 40, barWidth)).toBe(false);
  });
});

// ============================================================
// TimelineConnection – constructor and geometry
// ============================================================
describe('TimelineConnection', () => {
  test('constructor sets fromBox and mindMap', () => {
    const box = makeBox('b1', 100, -50, '2024-01-06');
    const mm  = makeMindMap([box]);
    const conn = new TimelineConnection(box, mm);
    expect(conn.fromBox).toBe(box);
    expect(conn.mindMap).toBe(mm);
    expect(conn.selected).toBe(false);
  });

  test('uses timelineId geometry when multiple timelines exist', () => {
    const box = makeBox('b1', 100, -50, '2024-01-06');
    const mm = makeMindMap([box]);
    mm.timelineStartDate = new Date(2024, 0, 1);
    mm.timelineBarX = 400;
    mm.timelineBarY = 200;
    mm.timelines = [
      { id: 'tl-a', barX: 0, barY: 0, totalDays: TimelineMode.DEFAULT_TOTAL_DAYS, startDate: new Date(2024, 0, 1) },
      { id: 'tl-b', barX: 400, barY: 200, totalDays: TimelineMode.DEFAULT_TOTAL_DAYS, startDate: new Date(2024, 0, 1) },
    ];
    mm.getTimelineById = (id) => mm.timelines.find(t => t.id === id) || null;
    mm.getActiveTimeline = () => mm.timelines[0];
    mm.getTimelineBarWidth = () => TimelineMode.DEFAULT_WIDTH;
    const conn = new TimelineConnection(box, mm, 'tl-b');
    const ep = conn._getConnectionEndpoints();
    expect(ep).not.toBeNull();
    expect(ep.end.x).toBeGreaterThan(350);
    expect(ep.end.y).toBeGreaterThan(180);
  });

  test('does not fall back to active timeline when explicit timelineId is missing', () => {
    const box = makeBox('b1', 100, -50, '2024-01-06');
    const mm = makeMindMap([box]);
    mm.timelineStartDate = new Date(2024, 0, 1);
    mm.timelineBarX = 0;
    mm.timelineBarY = 0;
    mm.timelines = [
      { id: 'tl-a', barX: 0, barY: 0, totalDays: TimelineMode.DEFAULT_TOTAL_DAYS, startDate: new Date(2024, 0, 1) },
    ];
    mm.getTimelineById = (id) => mm.timelines.find(t => t.id === id) || null;
    mm.getActiveTimeline = () => mm.timelines[0];
    mm.getTimelineBarWidth = () => TimelineMode.DEFAULT_WIDTH;

    // Connection explicitly targets a non-existent timeline; it must not
    // be drawn on the active timeline during transient undo states.
    const conn = new TimelineConnection(box, mm, 'tl-missing');
    expect(conn.timeline).toBeNull();
    expect(conn._getConnectionEndpoints()).toBeNull();
  });

  test('does not fall back to active timeline when explicit timelineId is null', () => {
    const box = makeBox('b1', 100, -50, '2024-01-06');
    const mm = makeMindMap([box]);
    mm.timelineStartDate = new Date(2024, 0, 1);
    mm.timelines = [
      { id: 'tl-a', barX: 0, barY: 0, totalDays: TimelineMode.DEFAULT_TOTAL_DAYS, startDate: new Date(2024, 0, 1) },
    ];
    mm.getTimelineById = (id) => mm.timelines.find(t => t.id === id) || null;
    mm.getActiveTimeline = () => mm.timelines[0];
    mm.getTimelineBarWidth = () => TimelineMode.DEFAULT_WIDTH;

    // Explicit null means legacy/ambiguous binding, not "use active timeline".
    const conn = new TimelineConnection(box, mm, null);
    expect(conn.timelineId).toBeNull();
    expect(conn.timeline).toBeNull();
    expect(conn._getConnectionEndpoints()).toBeNull();
  });

  test('dayIndex is computed from box.timelineDate and mindMap.timelineStartDate', () => {
    // startDate = 2024-01-01 (local midnight), timelineDate = 2024-01-06 → dayIndex = 5.
    // Use local-midnight constructor (same as createTimeline()) so the test is
    // timezone-independent: no UTC vs local offset causes a spurious ±1 day shift.
    const startDate = new Date(2024, 0, 1); // Jan 1 local midnight
    const box = makeBox('b1', 100, -50, '2024-01-06');
    const mm  = makeMindMap([box]);
    mm.timelineStartDate = startDate;
    const conn = new TimelineConnection(box, mm);
    expect(conn.dayIndex).toBe(5);
  });

  test('dayIndex falls back to 0 when mindMap is null', () => {
    const box = makeBox('b1', 100, -50, '2024-01-06');
    const conn = new TimelineConnection(box, null);
    expect(conn.dayIndex).toBe(0);
  });

  test('_getConnectionEndpoints returns valid endpoints with mindMap', () => {
    const startDate = new Date(2024, 0, 1); // Jan 1 local midnight — timezone-independent
    const box = makeBox('b1', 100, -50, '2024-01-06'); // dayIndex = 5
    const mm  = makeMindMap([box]);
    mm.timelineStartDate = startDate;
    const conn = new TimelineConnection(box, mm);
    const ep = conn._getConnectionEndpoints();
    const cell = TimelineMode.dayCellRect(5, TimelineMode.BAR_HEIGHT);
    expect(ep).not.toBeNull();
    expect(ep.end.x).toBeGreaterThanOrEqual(cell.x);
    expect(ep.end.x).toBeLessThanOrEqual(cell.x + cell.w);
    expect(ep.end.y).toBeGreaterThanOrEqual(cell.y);
    expect(ep.end.y).toBeLessThanOrEqual(cell.y + cell.h);
  });

  test('_getConnectionEndpoints uses DEFAULT_WIDTH when mindMap is null', () => {
    const box = makeBox('b1', 100, -50, '2024-01-06');
    const conn = new TimelineConnection(box, null);
    const ep = conn._getConnectionEndpoints();
    const cell = TimelineMode.dayCellRect(0, TimelineMode.BAR_HEIGHT); // dayIndex=0 when no mindMap
    expect(ep).not.toBeNull();
    expect(ep.end.x).toBeGreaterThanOrEqual(cell.x);
    expect(ep.end.x).toBeLessThanOrEqual(cell.x + cell.w);
    expect(ep.end.y).toBeGreaterThanOrEqual(cell.y);
    expect(ep.end.y).toBeLessThanOrEqual(cell.y + cell.h);
  });

  test('box above bar mid-line projects to upper half of day-cell boundary', () => {
    const startDate = new Date(2024, 0, 1); // Jan 1 local midnight — timezone-independent
    const box = makeBox('b1', 0, -100, '2024-01-11'); // dayIndex = 10
    const mm  = makeMindMap([box]);
    mm.timelineStartDate = startDate;
    const conn = new TimelineConnection(box, mm);
    const ep = conn._getConnectionEndpoints();
    const cell = TimelineMode.dayCellRect(10, TimelineMode.BAR_HEIGHT);
    expect(ep.end.y).toBeGreaterThanOrEqual(cell.y);
    expect(ep.end.y).toBeLessThanOrEqual(cell.cy);
  });

  test('box below bar mid-line projects to lower half of day-cell boundary', () => {
    const startDate = new Date(2024, 0, 1); // Jan 1 local midnight — timezone-independent
    const box = makeBox('b1', 0, 200, '2024-01-11'); // dayIndex = 10
    const mm  = makeMindMap([box]);
    mm.timelineStartDate = startDate;
    const conn = new TimelineConnection(box, mm);
    const ep = conn._getConnectionEndpoints();
    const cell = TimelineMode.dayCellRect(10, TimelineMode.BAR_HEIGHT);
    expect(ep.end.y).toBeGreaterThanOrEqual(cell.cy);
    expect(ep.end.y).toBeLessThanOrEqual(cell.y + cell.h);
  });

  test('TimelineConnection is a subclass of Connection', () => {
    const box = makeBox('b1', 0, -100, '2024-01-06');
    const conn = new TimelineConnection(box, null);
    expect(conn instanceof sandbox.Connection).toBe(true);
  });
});

// ============================================================
// TimelineConnection – serialisation
// ============================================================
describe('TimelineConnection serialisation', () => {
  test('toJSON() returns {fromId, date}', () => {
    const box = makeBox('b1', 0, 0, '2024-01-11');
    const conn = new TimelineConnection(box, null);
    expect(conn.toJSON()).toMatchObject({ fromId: 'b1', date: '2024-01-11' });
  });

  test('toJSON() includes timelineId when provided', () => {
    const box = makeBox('b1', 0, 0, '2024-01-11');
    const conn = new TimelineConnection(box, null, 'tl-1');
    expect(conn.toJSON()).toMatchObject({ fromId: 'b1', date: '2024-01-11', timelineId: 'tl-1' });
  });

  test('toJSON() does not contain dayIndex', () => {
    const box = makeBox('b1', 0, 0, '2024-01-11');
    const conn = new TimelineConnection(box, null);
    const json = conn.toJSON();
    expect(json.dayIndex).toBeUndefined();
    expect(json.side).toBeUndefined();
    expect(json.boxId).toBeUndefined();
  });

  test('fromJSON round-trips correctly with new {fromId, date} format', () => {
    const box = makeBox('b1', 0, 0);
    const map = new Map([['b1', box]]);
    const conn = TimelineConnection.fromJSON({ fromId: 'b1', date: '2024-01-16' }, map, null);
    expect(conn).not.toBeNull();
    expect(conn.fromBox).toBe(box);
    expect(box.timelineDate).toBe('2024-01-16');
  });

  test('fromJSON preserves timelineId', () => {
    const box = makeBox('b1', 0, 0);
    const map = new Map([['b1', box]]);
    const conn = TimelineConnection.fromJSON({ fromId: 'b1', date: '2024-01-16', timelineId: 'tl-2' }, map, null);
    expect(conn.timelineId).toBe('tl-2');
  });

  test('fromJSON normalizes null timelineId to the sole timeline when exactly one exists', () => {
    const box = makeBox('b1', 0, 0);
    const map = new Map([['b1', box]]);
    const mm = makeMindMap([box]);
    mm.timelines = [
      { id: 'tl-only', barX: 0, barY: 0, totalDays: TimelineMode.DEFAULT_TOTAL_DAYS, startDate: new Date(2024, 0, 1) },
    ];
    mm.getTimelines = () => mm.timelines;
    mm.getTimelineById = (id) => mm.timelines.find(t => t.id === id) || null;
    mm.getActiveTimeline = () => mm.timelines[0];

    const conn = TimelineConnection.fromJSON({ fromId: 'b1', date: '2024-01-16', timelineId: null }, map, mm);
    expect(conn).not.toBeNull();
    expect(conn.timelineId).toBe('tl-only');
    expect(conn.timeline).toBe(mm.timelines[0]);
  });

  test('fromJSON keeps null timelineId unresolved when multiple timelines exist', () => {
    const box = makeBox('b1', 0, 0);
    const map = new Map([['b1', box]]);
    const mm = makeMindMap([box]);
    mm.timelines = [
      { id: 'tl-a', barX: 0, barY: 0, totalDays: TimelineMode.DEFAULT_TOTAL_DAYS, startDate: new Date(2024, 0, 1) },
      { id: 'tl-b', barX: 400, barY: 0, totalDays: TimelineMode.DEFAULT_TOTAL_DAYS, startDate: new Date(2024, 0, 1) },
    ];
    mm.getTimelines = () => mm.timelines;
    mm.getTimelineById = (id) => mm.timelines.find(t => t.id === id) || null;
    mm.getActiveTimeline = () => mm.timelines[0];

    const conn = TimelineConnection.fromJSON({ fromId: 'b1', date: '2024-01-16', timelineId: null }, map, mm);
    expect(conn).not.toBeNull();
    expect(conn.timelineId).toBeNull();
    expect(conn.timeline).toBeNull();
  });

  test('fromJSON computes dayIndex correctly from stored date', () => {
    const box = makeBox('b1', 0, 0);
    const map = new Map([['b1', box]]);
    const mm = makeMindMap([box]);
    mm.timelineStartDate = new Date(2024, 0, 1); // Jan 1 local midnight — timezone-independent
    const conn = TimelineConnection.fromJSON({ fromId: 'b1', date: '2024-01-16' }, map, mm);
    expect(conn).not.toBeNull();
    expect(conn.dayIndex).toBe(15);
  });

  test('fromJSON handles legacy {fromId, dayIndex} format (backward compat)', () => {
    const box = makeBox('b1', 0, 0);
    const map = new Map([['b1', box]]);
    const mm  = makeMindMap([box]);
    mm.timelineStartDate = new Date(2024, 0, 1); // Jan 1 local midnight — timezone-independent
    const conn = TimelineConnection.fromJSON({ fromId: 'b1', dayIndex: 15 }, map, mm);
    expect(conn).not.toBeNull();
    expect(conn.fromBox).toBe(box);
    // Legacy dayIndex=15 with startDate=Jan 1 local → Jan 16 local → "2024-01-16"
    expect(box.timelineDate).toBe('2024-01-16');
    expect(conn.dayIndex).toBe(15);
  });

  test('fromJSON sets mindMap when provided', () => {
    const box = makeBox('b1', 0, 0);
    const mm  = makeMindMap([box]);
    mm.timelineStartDate = new Date(2024, 0, 1); // Jan 1 local midnight — timezone-independent
    const conn = TimelineConnection.fromJSON({ fromId: 'b1', date: '2024-01-16' }, mm.boxIdMap, mm);
    expect(conn.mindMap).toBe(mm);
  });

  test('fromJSON returns null for missing box', () => {
    const conn = TimelineConnection.fromJSON({ fromId: 'missing', date: '2024-01-16' }, new Map(), null);
    expect(conn).toBeNull();
  });

  test('fromJSON returns null when neither date nor dayIndex present', () => {
    const box = makeBox('b1', 0, 0);
    const map = new Map([['b1', box]]);
    const conn = TimelineConnection.fromJSON({ fromId: 'b1' }, map, null);
    expect(conn).toBeNull();
  });

  test('fromJSON returns null for legacy dayIndex without mindMap.timelineStartDate', () => {
    const box = makeBox('b1', 0, 0);
    const map = new Map([['b1', box]]);
    const conn = TimelineConnection.fromJSON({ fromId: 'b1', dayIndex: 5 }, map, null);
    expect(conn).toBeNull();
  });

  test('fromJSON returns null and logs warning for invalid date format', () => {
    const box = makeBox('b1', 0, 0);
    const map = new Map([['b1', box]]);
    const warnSpy = jest.spyOn(sandbox.console, 'warn').mockImplementation(() => {});
    const conn = TimelineConnection.fromJSON({ fromId: 'b1', date: 'not-a-date' }, map, null);
    expect(conn).toBeNull();
    expect(box.timelineDate).toBeNull(); // must not write invalid string
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test('fromJSON rejects date with time component (non-date-only string)', () => {
    const box = makeBox('b1', 0, 0);
    const map = new Map([['b1', box]]);
    const warnSpy = jest.spyOn(sandbox.console, 'warn').mockImplementation(() => {});
    const conn = TimelineConnection.fromJSON({ fromId: 'b1', date: '2024-01-16T00:00:00.000Z' }, map, null);
    expect(conn).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test('plain JSON.stringify round-trip preserves fromId and date', () => {
    const box = makeBox('b1', 0, 0, '2024-01-16');
    const conn = new TimelineConnection(box, null);
    const json = JSON.parse(JSON.stringify(conn.toJSON()));
    expect(json).toMatchObject({ fromId: 'b1', date: '2024-01-16' });
  });
});

// ============================================================
// TimelineMode.drawBar() – smoke tests
// ============================================================
describe('TimelineMode.drawBar()', () => {
  test('does not throw when called with active mindMap', () => {
    const mm = makeMindMap();
    expect(() => TimelineMode.drawBar(mm)).not.toThrow();
    expect(sandbox.push).toHaveBeenCalled();
  });

  test('is a no-op when timelineActive is false', () => {
    const mm = makeMindMap();
    mm.timelineActive = false;
    sandbox.push.mockClear();
    TimelineMode.drawBar(mm);
    expect(sandbox.push).not.toHaveBeenCalled();
  });

  test('is a no-op when timelineStartDate is null', () => {
    const mm = makeMindMap();
    mm.timelineStartDate = null;
    sandbox.push.mockClear();
    TimelineMode.drawBar(mm);
    expect(sandbox.push).not.toHaveBeenCalled();
  });

  test('is a no-op when mindMap is null', () => {
    sandbox.push.mockClear();
    expect(() => TimelineMode.drawBar(null)).not.toThrow();
    expect(sandbox.push).not.toHaveBeenCalled();
  });

  test('calls pop() once for every push() call', () => {
    const mm = makeMindMap();
    sandbox.push.mockClear();
    sandbox.pop.mockClear();
    TimelineMode.drawBar(mm);
    expect(sandbox.pop).toHaveBeenCalledTimes(sandbox.push.mock.calls.length);
  });
});

describe('TimelineMode.drawConnectionsUnderlay()', () => {
  test('draws only connections visible on their own timeline', () => {
    const drawA = jest.fn();
    const drawB = jest.fn();
    const mm = makeMindMap();
    mm.timelineActive = true;
    mm.timelineStartDate = new Date(2024, 0, 1);
    mm.timelineTotalDays = 31;
    mm.timelineConnections = [
      { dayIndex: 10, draw: drawA, timeline: { id: 'a', totalDays: 31 } },
      { dayIndex: 10, draw: drawB, timeline: { id: 'b', totalDays: 7 } }, // out of range on its own timeline
    ];
    TimelineMode.drawConnectionsUnderlay(mm);
    expect(drawA).toHaveBeenCalledTimes(1);
    expect(drawB).not.toHaveBeenCalled();
  });

  test('does not draw unresolved explicit null-id connection on the active timeline', () => {
    const draw = jest.fn();
    const box = makeBox('b1', 0, 0, '2024-01-05');
    const mm = makeMindMap([box]);
    mm.timelineActive = true;
    mm.timelineStartDate = new Date(2024, 0, 1);
    mm.timelineTotalDays = 31;
    mm.timelines = [
      { id: 'tl-a', barX: 0, barY: 0, totalDays: 31, startDate: new Date(2024, 0, 1) },
      { id: 'tl-b', barX: 300, barY: 0, totalDays: 31, startDate: new Date(2024, 0, 1) },
    ];
    mm.getTimelineById = (id) => mm.timelines.find(t => t.id === id) || null;
    mm.getActiveTimeline = () => mm.timelines[0];
    mm.getTimelineBarWidth = () => TimelineMode.DEFAULT_WIDTH;

    const conn = new TimelineConnection(box, mm, null);
    conn.draw = draw;
    mm.timelineConnections = [conn];

    TimelineMode.drawConnectionsUnderlay(mm);
    expect(draw).not.toHaveBeenCalled();
  });
});

describe('TimelineMode.drawBoxDateLabels()', () => {
  test('does not draw date bubble for unresolved explicit null-id connection', () => {
    const box = makeBox('b1', 0, 0, '2024-01-05');
    const mm = makeMindMap([box]);
    mm.timelineStartDate = new Date(2024, 0, 1);
    mm.timelines = [
      { id: 'tl-a', barX: 0, barY: 0, totalDays: 31, startDate: new Date(2024, 0, 1) },
      { id: 'tl-b', barX: 300, barY: 0, totalDays: 31, startDate: new Date(2024, 0, 1) },
    ];
    mm.getTimelineById = (id) => mm.timelines.find(t => t.id === id) || null;
    mm.getActiveTimeline = () => mm.timelines[0];

    const conn = new TimelineConnection(box, mm, null);

    sandbox.rect.mockClear();
    sandbox.text.mockClear();
    TimelineMode.drawBoxDateLabels([conn], mm.timelineStartDate, 1);

    expect(sandbox.rect).not.toHaveBeenCalled();
    expect(sandbox.text).not.toHaveBeenCalled();
  });
});

// ============================================================
// TimelineMode.dateForDay / dayIndexForDate / toISODateString / weekNumber
// ============================================================
describe('TimelineMode.dateForDay()', () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  test('day 0 returns today (date part only)', () => {
    const d = TimelineMode.dateForDay(0, today);
    expect(d.getFullYear()).toBe(today.getFullYear());
    expect(d.getMonth()).toBe(today.getMonth());
    expect(d.getDate()).toBe(today.getDate());
  });

  test('day 7 returns one week from today', () => {
    const d = TimelineMode.dateForDay(7, today);
    const expected = new Date(today);
    expected.setDate(expected.getDate() + 7);
    expect(d.getDate()).toBe(expected.getDate());
  });
});

describe('TimelineMode.toISODateString()', () => {
  test('returns the LOCAL calendar date as YYYY-MM-DD', () => {
    // new Date(y, m, d) creates local midnight — result must match that local date
    // regardless of the machine timezone.  This verifies that local getters are
    // used (not UTC getters / toISOString which would shift UTC+ users by 1 day).
    const localMidnight = new Date(2024, 0, 15); // Jan 15 local midnight
    expect(TimelineMode.toISODateString(localMidnight)).toBe('2024-01-15');
  });

  test('round-trips through new Date(str) → toISODateString', () => {
    // A date stored as a local-midnight Date must survive a round-trip.
    const original = '2024-06-20';
    const [y, mo, da] = original.split('-').map(Number);
    const date = new Date(y, mo - 1, da); // local midnight — same approach as fromJSON
    expect(TimelineMode.toISODateString(date)).toBe(original);
  });

  test('month and day are zero-padded', () => {
    const d = new Date(2024, 2, 5); // March 5 (month index 2)
    expect(TimelineMode.toISODateString(d)).toBe('2024-03-05');
  });
});

describe('TimelineMode.dayIndexForDate()', () => {
  // Use the local-midnight constructor (same as createTimeline does) so the test
  // is timezone-independent: all date math stays in local time.
  const startDate = new Date(2024, 0, 1); // Jan 1 local midnight

  test('same date as startDate returns 0', () => {
    expect(TimelineMode.dayIndexForDate('2024-01-01', startDate)).toBe(0);
  });

  test('5 days after startDate returns 5', () => {
    expect(TimelineMode.dayIndexForDate('2024-01-06', startDate)).toBe(5);
  });

  test('is the inverse of dateForDay', () => {
    const dayIndex = 15;
    const date = TimelineMode.dateForDay(dayIndex, startDate);
    expect(TimelineMode.dayIndexForDate(date, startDate)).toBe(dayIndex);
  });

  test('accepts ISO date strings', () => {
    expect(TimelineMode.dayIndexForDate('2024-01-16', startDate)).toBe(15);
  });

  test('ISO date string "YYYY-MM-DD" is treated as local midnight, not UTC midnight', () => {
    // This is the key timezone-correctness test.
    // "2024-01-15" must be treated as local Jan 15 (same as new Date(2024, 0, 15))
    // regardless of timezone.  In UTC+ environments, new Date("2024-01-15") is UTC
    // midnight which, after setHours(0,0,0,0), becomes local midnight of Jan 14
    // (or Jan 15 depending on offset) — creating a 1-day mismatch.
    // The fixed implementation always parses "YYYY-MM-DD" via new Date(y, m-1, d).
    const start = new Date(2024, 0, 1); // Jan 1 local midnight
    expect(TimelineMode.dayIndexForDate('2024-01-15', start)).toBe(14); // Jan 15 − Jan 1 = 14 days
  });

  test('cross-client consistency: date string round-trips via toISODateString', () => {
    // Simulate: save a date with toISODateString, reload with dayIndexForDate.
    // The dayIndex must be preserved regardless of timezone.
    const start = new Date(2024, 0, 1); // Jan 1 local midnight
    const dayIndex = 20;
    const date = TimelineMode.dateForDay(dayIndex, start);
    const stored = TimelineMode.toISODateString(date);     // e.g. "2024-01-21"
    expect(TimelineMode.dayIndexForDate(stored, start)).toBe(dayIndex);
  });
});

describe('TimelineMode.weekNumber()', () => {
  test('6 Jan 2025 (Monday) is ISO week 2', () => {
    expect(TimelineMode.weekNumber(new Date(2025, 0, 6))).toBe(2);
  });

  test('1 Jan 2025 is in week ≥ 1', () => {
    expect(TimelineMode.weekNumber(new Date(2025, 0, 1))).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================
// Static constants are present
// ============================================================
describe('TimelineMode static constants', () => {
  test('BAR_HEIGHT is a positive number', () => {
    expect(typeof TimelineMode.BAR_HEIGHT).toBe('number');
    expect(TimelineMode.BAR_HEIGHT).toBeGreaterThan(0);
  });

  test('DEFAULT_WIDTH > MIN_WIDTH', () => {
    expect(TimelineMode.DEFAULT_WIDTH).toBeGreaterThan(TimelineMode.MIN_WIDTH);
  });

  test('TOTAL_DAYS is a positive integer', () => {
    expect(TimelineMode.TOTAL_DAYS).toBeGreaterThan(0);
    expect(Number.isInteger(TimelineMode.TOTAL_DAYS)).toBe(true);
  });
});

// ============================================================
// drawBoxDateLabels – date badge above each connected box
// ============================================================
describe('TimelineMode.drawBoxDateLabels()', () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('does not throw with empty connections', () => {
    expect(() => TimelineMode.drawBoxDateLabels([], today, 1)).not.toThrow();
    expect(sandbox.rect).not.toHaveBeenCalled();
  });

  test('draws a rect and text for each connected box', () => {
    const box = makeBox('b1', 0, -200, '2024-06-01');
    const conn = new TimelineConnection(box, null);
    TimelineMode.drawBoxDateLabels([conn], today, 1);
    // Should have drawn at least one rect (pill) and one text call
    expect(sandbox.rect).toHaveBeenCalled();
    expect(sandbox.text).toHaveBeenCalled();
  });

  test('skips connections with no fromBox', () => {
    const conn = new TimelineConnection(null, null);
    expect(() => TimelineMode.drawBoxDateLabels([conn], today, 1)).not.toThrow();
    expect(sandbox.rect).not.toHaveBeenCalled();
  });

  test('draws one badge per connection', () => {
    const box1 = makeBox('b1', 0, -200, '2024-06-05');
    const box2 = makeBox('b2', 300, -200, '2024-06-20');
    const conn1 = new TimelineConnection(box1, null);
    const conn2 = new TimelineConnection(box2, null);
    sandbox.rect.mockClear();
    TimelineMode.drawBoxDateLabels([conn1, conn2], today, 1);
    expect(sandbox.rect.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  test('label text includes abbreviated weekday', () => {
    // 2024-01-01 is a Monday — use local midnight so the weekday is correct
    // in all timezones (UTC midnight would be Sun Dec 31 local in UTC-5).
    const startDate = new Date(2024, 0, 1); // Jan 1 local midnight
    const box = makeBox('b1', 0, -200, '2024-01-01'); // stored date = start date (day 0)
    const conn = new TimelineConnection(box, null);
    sandbox.text.mockClear();
    TimelineMode.drawBoxDateLabels([conn], startDate, 1);
    expect(sandbox.text).toHaveBeenCalled();
    const labelArg = sandbox.text.mock.calls[0][0];
    // Label should start with a 3-letter weekday abbreviation
    expect(labelArg).toMatch(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s/);
  });

  test('uses red fill for past dates', () => {
    // Ensure the date is in the past: 2000-01-01
    const pastStart = new Date('2000-01-01T00:00:00.000Z');
    pastStart.setHours(0, 0, 0, 0);
    const box = makeBox('b1', 0, -200, '2000-01-01');
    const conn = new TimelineConnection(box, null);
    sandbox.fill.mockClear();
    TimelineMode.drawBoxDateLabels([conn], pastStart, 1);
    // The first fill() call after noStroke() should be the red past-date pill background
    const fillCalls = sandbox.fill.mock.calls;
    expect(fillCalls.length).toBeGreaterThan(0);
    // Red past pill: fill(200, 60, 60, 210)
    const pillFill = fillCalls.find(args => args[0] === 200 && args[1] === 60 && args[2] === 60);
    expect(pillFill).toBeDefined();
  });

  test('uses blue fill for future/today dates', () => {
    // Use a date far in the future
    const futureStart = new Date('2099-01-01T00:00:00.000Z');
    futureStart.setHours(0, 0, 0, 0);
    const box = makeBox('b1', 0, -200, '2099-01-01');
    const conn = new TimelineConnection(box, null);
    sandbox.fill.mockClear();
    TimelineMode.drawBoxDateLabels([conn], futureStart, 1);
    const fillCalls = sandbox.fill.mock.calls;
    // Blue future pill: fill(60, 120, 255) from ColorPalette.BASE.PRIMARY (BADGE_FUTURE)
    const pillFill = fillCalls.find(args => args[0] === 60 && args[1] === 120 && args[2] === 255);
    expect(pillFill).toBeDefined();
  });

  test('uses orange fill for selected connection', () => {
    const box = makeBox('b1', 0, -200, '2024-06-01');
    const conn = new TimelineConnection(box, null);
    conn.selected = true;
    sandbox.fill.mockClear();
    TimelineMode.drawBoxDateLabels([conn], today, 1);
    const fillCalls = sandbox.fill.mock.calls;
    // Orange selected pill: fill(255, 140, 0, 210)
    const pillFill = fillCalls.find(args => args[0] === 255 && args[1] === 140 && args[2] === 0);
    expect(pillFill).toBeDefined();
  });

  test('skips box with no timelineDate', () => {
    // A box without a timelineDate should produce no badge
    const box = makeBox('b1', 0, -200); // timelineDate = null
    const conn = new TimelineConnection(box, null);
    sandbox.rect.mockClear();
    TimelineMode.drawBoxDateLabels([conn], today, 1);
    expect(sandbox.rect).not.toHaveBeenCalled();
  });
});

// ============================================================
// _drawConnectionDragPreview – snap preview for dragging connections
// ============================================================
describe('TimelineMode._drawConnectionDragPreview() with draggingConnection', () => {
  const barWidth = TimelineMode.DEFAULT_WIDTH;
  const bh = TimelineMode.BAR_HEIGHT;
  const safeZ = 1;
  const sw = 1;

  beforeEach(() => {
    jest.clearAllMocks();
    sandbox.worldMouseX.mockReturnValue(-9999);
    sandbox.worldMouseY.mockReturnValue(-9999);
  });

  test('draws snap preview when draggingConnection and mouse over bar', () => {
    const box = makeBox('b1', 100, -200, '2024-01-01');
    const conn = new TimelineConnection(box, null);
    const mindMap = makeMindMap([box]);
    mindMap.connectingFrom = null;
    mindMap.draggingConnection = { conn, originalTo: null };
    sandbox.worldMouseX.mockReturnValue(TimelineMode.worldDayX(10, barWidth));
    sandbox.worldMouseY.mockReturnValue(bh / 2);
    TimelineMode._drawConnectionDragPreview(barWidth, bh, safeZ, sw, mindMap);
    expect(sandbox.circle).toHaveBeenCalled();
  });

  test('no preview when mouse outside bar and dragging endpoint', () => {
    const box = makeBox('b1', 100, -200, '2024-01-01');
    const conn = new TimelineConnection(box, null);
    const mindMap = makeMindMap([box]);
    mindMap.connectingFrom = null;
    mindMap.draggingConnection = { conn, originalTo: null };
    sandbox.worldMouseX.mockReturnValue(-9999);
    sandbox.worldMouseY.mockReturnValue(-9999);
    TimelineMode._drawConnectionDragPreview(barWidth, bh, safeZ, sw, mindMap);
    expect(sandbox.circle).not.toHaveBeenCalled();
  });
});
