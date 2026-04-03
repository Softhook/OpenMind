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
// Build sandbox (p5 stubs + window stub)
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

const sandbox = {
  ...p5Stubs,
  Math,
  Date,
  Number,
  Set,
  Map,
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
};

const timelineCode = fs.readFileSync(
  path.join(__dirname, '../../src/TimelineMode.js'), 'utf8'
);
const script = new vm.Script(timelineCode);
script.runInNewContext(sandbox);

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
// TimelineConnection – constructor and _getTickPoint
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

  test('_getTickPoint returns valid tick with mindMap', () => {
    const box = makeBox('b1', 100, -50);
    const mm  = makeMindMap([box]);
    const conn = new TimelineConnection(box, 5, mm);
    const tick = conn._getTickPoint();
    expect(tick).not.toBeNull();
    expect(tick.x).toBeCloseTo(TimelineMode.worldDayX(5, mm.getTimelineBarWidth()), 1);
  });

  test('_getTickPoint uses DEFAULT_WIDTH when mindMap is null', () => {
    const box = makeBox('b1', 100, -50);
    const conn = new TimelineConnection(box, 5, null);
    const tick = conn._getTickPoint();
    expect(tick).not.toBeNull();
    expect(tick.x).toBeCloseTo(TimelineMode.worldDayX(5, TimelineMode.DEFAULT_WIDTH), 1);
  });

  test('box above bar mid-line attaches to top (y=0)', () => {
    const box = makeBox('b1', 0, -100);   // y < BAR_HEIGHT/2
    const conn = new TimelineConnection(box, 10, null);
    const tick = conn._getTickPoint();
    expect(tick.y).toBe(0);
  });

  test('box below bar mid-line attaches to bottom (y=BAR_HEIGHT)', () => {
    const box = makeBox('b1', 0, 200);    // y > BAR_HEIGHT/2
    const conn = new TimelineConnection(box, 10, null);
    const tick = conn._getTickPoint();
    expect(tick.y).toBe(TimelineMode.BAR_HEIGHT);
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
// _drawBoxDateLabels – date badge above each connected box
// ============================================================
describe('TimelineMode._drawBoxDateLabels()', () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('does not throw with empty connections', () => {
    expect(() => TimelineMode._drawBoxDateLabels([], today, TimelineMode.DEFAULT_WIDTH, 1)).not.toThrow();
    expect(sandbox.rect).not.toHaveBeenCalled();
  });

  test('draws a rect and text for each connected box', () => {
    const box = makeBox('b1', 0, -200);
    const conn = new TimelineConnection(box, 10, null);
    TimelineMode._drawBoxDateLabels([conn], today, TimelineMode.DEFAULT_WIDTH, 1);
    // Should have drawn at least one rect (pill) and one text call
    expect(sandbox.rect).toHaveBeenCalled();
    expect(sandbox.text).toHaveBeenCalled();
  });

  test('skips connections with no fromBox', () => {
    const conn = new TimelineConnection(null, 5, null);
    expect(() => TimelineMode._drawBoxDateLabels([conn], today, TimelineMode.DEFAULT_WIDTH, 1)).not.toThrow();
    expect(sandbox.rect).not.toHaveBeenCalled();
  });

  test('draws one badge per connection', () => {
    const box1 = makeBox('b1', 0, -200);
    const box2 = makeBox('b2', 300, -200);
    const conn1 = new TimelineConnection(box1, 5, null);
    const conn2 = new TimelineConnection(box2, 20, null);
    sandbox.rect.mockClear();
    TimelineMode._drawBoxDateLabels([conn1, conn2], today, TimelineMode.DEFAULT_WIDTH, 1);
    expect(sandbox.rect.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================
// _drawConnectionDragPreview – snap preview for endpoint drags
// ============================================================
describe('TimelineMode._drawConnectionDragPreview() with draggingTimelineConnection', () => {
  const barWidth = TimelineMode.DEFAULT_WIDTH;
  const bh = TimelineMode.BAR_HEIGHT;
  const safeZ = 1;
  const sw = 1;

  beforeEach(() => {
    jest.clearAllMocks();
    sandbox.worldMouseX.mockReturnValue(-9999);
    sandbox.worldMouseY.mockReturnValue(-9999);
  });

  test('draws snap preview when draggingTimelineConnection and mouse over bar', () => {
    const box = makeBox('b1', 100, -200);
    const conn = new TimelineConnection(box, 5, null);
    const mindMap = makeMindMap([box]);
    mindMap.connectingFrom = null;
    mindMap.draggingTimelineConnection = { conn, origDayIndex: 5 };
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
    mindMap.draggingTimelineConnection = { conn, origDayIndex: 5 };
    sandbox.worldMouseX.mockReturnValue(-9999);
    sandbox.worldMouseY.mockReturnValue(-9999);
    TimelineMode._drawConnectionDragPreview(barWidth, bh, safeZ, sw, mindMap);
    expect(sandbox.circle).not.toHaveBeenCalled();
  });
});
