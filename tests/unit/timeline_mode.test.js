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
function makeBox(id, x = 0, y = 0) {
  return {
    id, x, y, width: 100, height: 40,
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

  test('last day maps to barWidth', () => {
    expect(TimelineMode.worldDayX(TimelineMode.TOTAL_DAYS - 1, barWidth)).toBeCloseTo(barWidth, 1);
  });

  test('round-trips correctly for a mid day', () => {
    const mid = Math.floor(TimelineMode.TOTAL_DAYS / 2);
    expect(TimelineMode.dayFromWorldX(TimelineMode.worldDayX(mid, barWidth), barWidth)).toBe(mid);
  });

  test('worldX=0 maps back to day 0', () => {
    expect(TimelineMode.dayFromWorldX(0, barWidth)).toBe(0);
  });

  test('worldX=barWidth maps back to last day', () => {
    expect(TimelineMode.dayFromWorldX(barWidth, barWidth)).toBe(TimelineMode.TOTAL_DAYS - 1);
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

  test('isDragHandle returns false far from the right edge', () => {
    expect(TimelineMode.isDragHandle(0, 40, barWidth)).toBe(false);
  });
});

// ============================================================
// TimelineConnection – constructor and geometry
// ============================================================
describe('TimelineConnection', () => {
  test('constructor sets fromBox, dayIndex and mindMap', () => {
    const box = makeBox('b1', 100, -50);
    const mm  = makeMindMap([box]);
    const conn = new TimelineConnection(box, 5, mm);
    expect(conn.fromBox).toBe(box);
    expect(conn.dayIndex).toBe(5);
    expect(conn.mindMap).toBe(mm);
    expect(conn.selected).toBe(false);
  });

  test('_getConnectionEndpoints returns valid endpoints with mindMap', () => {
    const box = makeBox('b1', 100, -50);
    const mm  = makeMindMap([box]);
    const conn = new TimelineConnection(box, 5, mm);
    const ep = conn._getConnectionEndpoints();
    expect(ep).not.toBeNull();
    expect(ep.end.x).toBeCloseTo(TimelineMode.worldDayX(5, mm.getTimelineBarWidth()), 1);
  });

  test('_getConnectionEndpoints uses DEFAULT_WIDTH when mindMap is null', () => {
    const box = makeBox('b1', 100, -50);
    const conn = new TimelineConnection(box, 5, null);
    const ep = conn._getConnectionEndpoints();
    expect(ep).not.toBeNull();
    expect(ep.end.x).toBeCloseTo(TimelineMode.worldDayX(5, TimelineMode.DEFAULT_WIDTH), 1);
  });

  test('box above bar mid-line attaches to top (y=0)', () => {
    const box = makeBox('b1', 0, -100);   // y < BAR_HEIGHT/2
    const conn = new TimelineConnection(box, 10, null);
    const ep = conn._getConnectionEndpoints();
    expect(ep.end.y).toBe(0);
  });

  test('box below bar mid-line attaches to bottom (y=BAR_HEIGHT)', () => {
    const box = makeBox('b1', 0, 200);    // y > BAR_HEIGHT/2
    const conn = new TimelineConnection(box, 10, null);
    const ep = conn._getConnectionEndpoints();
    expect(ep.end.y).toBe(TimelineMode.BAR_HEIGHT);
  });

  test('TimelineConnection is a subclass of Connection', () => {
    const box = makeBox('b1', 0, -100);
    const conn = new TimelineConnection(box, 5, null);
    expect(conn instanceof sandbox.Connection).toBe(true);
  });
});

// ============================================================
// TimelineConnection – serialisation
// ============================================================
describe('TimelineConnection serialisation', () => {
  test('toJSON() returns {fromId, dayIndex}', () => {
    const box = makeBox('b1', 0, 0);
    const conn = new TimelineConnection(box, 10, null);
    expect(conn.toJSON()).toMatchObject({ fromId: 'b1', dayIndex: 10 });
  });

  test('toJSON() has no unexpected fields', () => {
    const box = makeBox('b1', 0, 0);
    const conn = new TimelineConnection(box, 10, null);
    const json = conn.toJSON();
    expect(json.side).toBeUndefined();
    expect(json.boxId).toBeUndefined();
  });

  test('fromJSON round-trips correctly', () => {
    const box = makeBox('b1', 0, 0);
    const map = new Map([['b1', box]]);
    const conn = TimelineConnection.fromJSON({ fromId: 'b1', dayIndex: 15 }, map, null);
    expect(conn).not.toBeNull();
    expect(conn.fromBox).toBe(box);
    expect(conn.dayIndex).toBe(15);
  });

  test('fromJSON sets mindMap when provided', () => {
    const box = makeBox('b1', 0, 0);
    const mm  = makeMindMap([box]);
    const conn = TimelineConnection.fromJSON({ fromId: 'b1', dayIndex: 15 }, mm.boxIdMap, mm);
    expect(conn.mindMap).toBe(mm);
  });

  test('fromJSON returns null for missing box', () => {
    const conn = TimelineConnection.fromJSON({ fromId: 'missing', dayIndex: 5 }, new Map(), null);
    expect(conn).toBeNull();
  });

  test('fromJSON returns null for missing dayIndex', () => {
    const box = makeBox('b1', 0, 0);
    const map = new Map([['b1', box]]);
    const conn = TimelineConnection.fromJSON({ fromId: 'b1' }, map, null);
    expect(conn).toBeNull();
  });

  test('plain JSON.stringify round-trip preserves fromId and dayIndex', () => {
    const box = makeBox('b1', 0, 0);
    const conn = new TimelineConnection(box, 15, null);
    const json = JSON.parse(JSON.stringify(conn.toJSON()));
    expect(json).toMatchObject({ fromId: 'b1', dayIndex: 15 });
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
// TimelineMode.dateForDay / weekNumber
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
