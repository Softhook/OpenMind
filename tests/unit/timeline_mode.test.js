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
    BASE: { BLACK: { r: 0, g: 0, b: 0, a: 255 } },
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

  test('dayIndex is computed from box.timelineDate and mindMap.timelineStartDate', () => {
    // startDate = 2024-01-01, timelineDate = 2024-01-06 → dayIndex = 5
    const startDate = new Date('2024-01-01T00:00:00.000Z');
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
    const startDate = new Date('2024-01-01T00:00:00.000Z');
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
  });

  test('box above bar mid-line projects to upper half of day-cell boundary', () => {
    const startDate = new Date('2024-01-01T00:00:00.000Z');
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
    const startDate = new Date('2024-01-01T00:00:00.000Z');
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

  test('fromJSON computes dayIndex correctly from stored date', () => {
    const box = makeBox('b1', 0, 0);
    const map = new Map([['b1', box]]);
    const mm = makeMindMap([box]);
    mm.timelineStartDate = new Date('2024-01-01T00:00:00.000Z');
    const conn = TimelineConnection.fromJSON({ fromId: 'b1', date: '2024-01-16' }, map, mm);
    expect(conn).not.toBeNull();
    expect(conn.dayIndex).toBe(15);
  });

  test('fromJSON handles legacy {fromId, dayIndex} format (backward compat)', () => {
    const box = makeBox('b1', 0, 0);
    const map = new Map([['b1', box]]);
    const mm  = makeMindMap([box]);
    mm.timelineStartDate = new Date('2024-01-01T00:00:00.000Z');
    const conn = TimelineConnection.fromJSON({ fromId: 'b1', dayIndex: 15 }, map, mm);
    expect(conn).not.toBeNull();
    expect(conn.fromBox).toBe(box);
    // Legacy dayIndex=15 with startDate=2024-01-01 → 2024-01-16
    expect(box.timelineDate).toBe('2024-01-16');
    expect(conn.dayIndex).toBe(15);
  });

  test('fromJSON sets mindMap when provided', () => {
    const box = makeBox('b1', 0, 0);
    const mm  = makeMindMap([box]);
    mm.timelineStartDate = new Date('2024-01-01T00:00:00.000Z');
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

// ============================================================
// TimelineMode.dateForDay / dayIndexForDate / weekNumber
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

describe('TimelineMode.dayIndexForDate()', () => {
  const startDate = new Date('2024-01-01T00:00:00.000Z');

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
    const box = makeBox('b1', 0, -200);
    const conn = new TimelineConnection(box, 10, null);
    TimelineMode.drawBoxDateLabels([conn], today, 1);
    // Should have drawn at least one rect (pill) and one text call
    expect(sandbox.rect).toHaveBeenCalled();
    expect(sandbox.text).toHaveBeenCalled();
  });

  test('skips connections with no fromBox', () => {
    const conn = new TimelineConnection(null, 5, null);
    expect(() => TimelineMode.drawBoxDateLabels([conn], today, 1)).not.toThrow();
    expect(sandbox.rect).not.toHaveBeenCalled();
  });

  test('draws one badge per connection', () => {
    const box1 = makeBox('b1', 0, -200);
    const box2 = makeBox('b2', 300, -200);
    const conn1 = new TimelineConnection(box1, 5, null);
    const conn2 = new TimelineConnection(box2, 20, null);
    sandbox.rect.mockClear();
    TimelineMode.drawBoxDateLabels([conn1, conn2], today, 1);
    expect(sandbox.rect.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  test('label text includes abbreviated weekday', () => {
    const box = makeBox('b1', 0, -200);
    // Use a fixed start date: 2024-01-01 (Monday)
    const startDate = new Date('2024-01-01T00:00:00.000Z');
    startDate.setHours(0, 0, 0, 0);
    const conn = new TimelineConnection(box, 0, null); // day 0 = 2024-01-01 = Monday
    sandbox.text.mockClear();
    TimelineMode.drawBoxDateLabels([conn], startDate, 1);
    expect(sandbox.text).toHaveBeenCalled();
    const labelArg = sandbox.text.mock.calls[0][0];
    // Label should start with a 3-letter weekday abbreviation
    expect(labelArg).toMatch(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s/);
  });

  test('uses red fill for past dates', () => {
    const box = makeBox('b1', 0, -200);
    // Ensure the date is in the past: use a startDate far in the past
    const pastStart = new Date('2000-01-01T00:00:00.000Z');
    pastStart.setHours(0, 0, 0, 0);
    const conn = new TimelineConnection(box, 0, null); // day 0 = 2000-01-01 — definitely past
    sandbox.fill.mockClear();
    TimelineMode.drawBoxDateLabels([conn], pastStart, 1);
    // The first fill() call after noStroke() should be the red past-date pill background
    const fillCalls = sandbox.fill.mock.calls;
    expect(fillCalls.length).toBeGreaterThan(0);
    // Find the fill call for the pill: first fill with 4 args (r, g, b, alpha) or 3-arg (r, g, b)
    // Red past pill: fill(200, 60, 60, 210)
    const pillFill = fillCalls.find(args => args[0] === 200 && args[1] === 60 && args[2] === 60);
    expect(pillFill).toBeDefined();
  });

  test('uses blue fill for future/today dates', () => {
    const box = makeBox('b1', 0, -200);
    // Use a startDate far in the future so dayIndex=0 is a future date
    const futureStart = new Date('2099-01-01T00:00:00.000Z');
    futureStart.setHours(0, 0, 0, 0);
    const conn = new TimelineConnection(box, 0, null);
    sandbox.fill.mockClear();
    TimelineMode.drawBoxDateLabels([conn], futureStart, 1);
    const fillCalls = sandbox.fill.mock.calls;
    // Blue future pill: fill(80, 140, 220, 210)
    const pillFill = fillCalls.find(args => args[0] === 80 && args[1] === 140 && args[2] === 220);
    expect(pillFill).toBeDefined();
  });

  test('uses orange fill for selected connection', () => {
    const box = makeBox('b1', 0, -200);
    const conn = new TimelineConnection(box, 0, null);
    conn.selected = true;
    sandbox.fill.mockClear();
    TimelineMode.drawBoxDateLabels([conn], today, 1);
    const fillCalls = sandbox.fill.mock.calls;
    // Orange selected pill: fill(255, 140, 0, 210)
    const pillFill = fillCalls.find(args => args[0] === 255 && args[1] === 140 && args[2] === 0);
    expect(pillFill).toBeDefined();
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
    const box = makeBox('b1', 100, -200);
    const conn = new TimelineConnection(box, 5, null);
    const mindMap = makeMindMap([box]);
    mindMap.connectingFrom = null;
    mindMap.draggingConnection = { conn, originalTo: null };
    sandbox.worldMouseX.mockReturnValue(TimelineMode.worldDayX(10, barWidth));
    sandbox.worldMouseY.mockReturnValue(bh / 2);
    TimelineMode._drawConnectionDragPreview(barWidth, bh, safeZ, sw, mindMap);
    expect(sandbox.circle).toHaveBeenCalled();
  });

  test('no preview when mouse outside bar and dragging endpoint', () => {
    const box = makeBox('b1', 100, -200);
    const conn = new TimelineConnection(box, 5, null);
    const mindMap = makeMindMap([box]);
    mindMap.connectingFrom = null;
    mindMap.draggingConnection = { conn, originalTo: null };
    sandbox.worldMouseX.mockReturnValue(-9999);
    sandbox.worldMouseY.mockReturnValue(-9999);
    TimelineMode._drawConnectionDragPreview(barWidth, bh, safeZ, sw, mindMap);
    expect(sandbox.circle).not.toHaveBeenCalled();
  });
});
