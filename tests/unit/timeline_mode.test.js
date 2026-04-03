/**
 * Unit tests for TimelineMode
 *
 * Follows the same vm-sandbox pattern used by ThrustGame.test.js:
 *   - Load the source file with vm.Script into a sandbox that stubs all p5 globals
 *   - Retrieve the exported class from sandbox.module.exports
 *
 * API change summary (world-space rewrite):
 *   - Bar is at world (0, 0) → (barWorldWidth, BAR_HEIGHT) — no more screen-space helpers
 *   - _dayX / _dayFromX / _barY / _barW removed → _worldDayX / _dayFromWorldX
 *   - _isOverBar(sx,sy) → _isOverBarWorld(wx,wy)
 *   - handleMousePressed / handleMouseDragged / handleMouseReleased take world coords
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

const TimelineMode = sandbox.module.exports;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeMindMap(boxes = []) {
  return {
    boxes,
    boxIdMap: new Map(boxes.map(b => [b.id, b])),
    timelineConnections: [],
    timelineBarWidth: null,
    selectedBox: null,
    connectingFrom: null,
  };
}

function makeBox(id, x = 0, y = 0) {
  return {
    id, x, y, width: 100, height: 40,
    getConnectionPoint(other) {
      // Returns the box center as a simple stub
      return { x: this.x, y: this.y };
    }
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Reset singleton between tests
  TimelineMode.instance = null;
  jest.clearAllMocks();
});

// ============================================================
// Static interface – toggle
// ============================================================
describe('TimelineMode.toggle()', () => {
  test('creates a new instance and activates it on first call', () => {
    const mm = makeMindMap();
    TimelineMode.toggle(mm);
    expect(TimelineMode.instance).not.toBeNull();
    expect(TimelineMode.instance.active).toBe(true);
  });

  test('deactivates on second call (toggle off)', () => {
    const mm = makeMindMap();
    TimelineMode.toggle(mm);
    TimelineMode.toggle(mm);
    expect(TimelineMode.instance.active).toBe(false);
  });

  test('reactivates on third call', () => {
    const mm = makeMindMap();
    TimelineMode.toggle(mm);
    TimelineMode.toggle(mm);
    TimelineMode.toggle(mm);
    expect(TimelineMode.instance.active).toBe(true);
  });

  test('initialises timelineConnections on mindMap if missing', () => {
    const mm = makeMindMap();
    delete mm.timelineConnections;
    expect(mm.timelineConnections).toBeUndefined();
    TimelineMode.toggle(mm);
    expect(TimelineMode.instance.active).toBe(true);
    expect(Array.isArray(mm.timelineConnections)).toBe(true);
  });

  test('restores persisted barWorldWidth from mindMap.timelineBarWidth', () => {
    const mm = makeMindMap();
    mm.timelineBarWidth = 1500;
    TimelineMode.toggle(mm);
    expect(TimelineMode.instance.barWorldWidth).toBe(1500);
  });
});

// ============================================================
// Static interface – handleInput
// ============================================================
describe('TimelineMode.handleInput()', () => {
  test('returns true and toggles when Ctrl+K is pressed', () => {
    const mm = makeMindMap();
    const result = TimelineMode.handleInput('k', 75, mm, { isCtrl: true });
    expect(result).toBe(true);
    expect(TimelineMode.instance.active).toBe(true);
  });

  test('returns true for uppercase K (Shift held)', () => {
    const mm = makeMindMap();
    const result = TimelineMode.handleInput('K', 75, mm, { isCtrl: true });
    expect(result).toBe(true);
  });

  test('returns false for other keys', () => {
    const result = TimelineMode.handleInput('a', 65, null, { isCtrl: true });
    expect(result).toBe(false);
  });

  test('returns false when Ctrl is not pressed', () => {
    const result = TimelineMode.handleInput('k', 75, null, { isCtrl: false });
    expect(result).toBe(false);
  });
});

// ============================================================
// Instance lifecycle
// ============================================================
describe('TimelineMode instance start/stop', () => {
  test('start() sets active and records startDate normalised to midnight', () => {
    const mm = makeMindMap();
    const inst = new TimelineMode(mm);
    inst.start();
    expect(inst.active).toBe(true);
    expect(inst.startDate).toBeInstanceOf(Date);
    expect(inst.startDate.getHours()).toBe(0);
    expect(inst.startDate.getMinutes()).toBe(0);
  });

  test('stop() sets active to false but preserves startDate', () => {
    const mm = makeMindMap();
    const inst = new TimelineMode(mm);
    inst.start();
    inst.stop();
    expect(inst.active).toBe(false);
    expect(inst.startDate).not.toBeNull();
  });

  test('stop() clears _draggingResize flag', () => {
    const mm = makeMindMap();
    const inst = new TimelineMode(mm);
    inst.start();
    inst._draggingResize = true;
    inst.stop();
    expect(inst._draggingResize).toBe(false);
  });
});

// ============================================================
// World-space geometry helpers
// ============================================================
describe('_worldDayX / _dayFromWorldX round-trip', () => {
  let inst;
  beforeEach(() => {
    inst = new TimelineMode(makeMindMap());
    inst.start();
  });

  test('day 0 maps to world x=0', () => {
    expect(inst._worldDayX(0)).toBe(0);
  });

  test('last day maps to barWorldWidth', () => {
    expect(inst._worldDayX(TimelineMode.TOTAL_DAYS - 1)).toBeCloseTo(inst.barWorldWidth, 1);
  });

  test('mid-day round-trips correctly', () => {
    const mid = Math.floor(TimelineMode.TOTAL_DAYS / 2);
    const x   = inst._worldDayX(mid);
    expect(inst._dayFromWorldX(x)).toBe(mid);
  });

  test('worldX=0 maps back to day 0', () => {
    expect(inst._dayFromWorldX(0)).toBe(0);
  });

  test('worldX=barWorldWidth maps back to last day', () => {
    expect(inst._dayFromWorldX(inst.barWorldWidth)).toBe(TimelineMode.TOTAL_DAYS - 1);
  });
});

describe('_isOverBarWorld()', () => {
  let inst;
  beforeEach(() => {
    inst = new TimelineMode(makeMindMap());
    inst.start();
  });

  test('returns true for world coords inside the bar', () => {
    // Bar spans x:[0,barWorldWidth], y:[0,BAR_HEIGHT]
    expect(inst._isOverBarWorld(100, 40)).toBe(true);
  });

  test('returns true within HIT_EXTEND above the bar top (world y < 0)', () => {
    expect(inst._isOverBarWorld(100, -TimelineMode.HIT_EXTEND + 1)).toBe(true);
  });

  test('returns false well outside the bar', () => {
    expect(inst._isOverBarWorld(100, -200)).toBe(false);
  });

  test('returns false beyond the right edge + HIT_EXTEND', () => {
    expect(inst._isOverBarWorld(inst.barWorldWidth + TimelineMode.HIT_EXTEND + 1, 40)).toBe(false);
  });
});

describe('_isDragHandle()', () => {
  let inst;
  beforeEach(() => {
    inst = new TimelineMode(makeMindMap());
    inst.start();
  });

  test('returns true near the right edge', () => {
    expect(inst._isDragHandle(inst.barWorldWidth, TimelineMode.BAR_HEIGHT / 2)).toBe(true);
  });

  test('returns true within HANDLE_RADIUS', () => {
    expect(inst._isDragHandle(inst.barWorldWidth - TimelineMode.HANDLE_RADIUS + 1, 40)).toBe(true);
  });

  test('returns false far from the right edge', () => {
    expect(inst._isDragHandle(0, 40)).toBe(false);
  });
});

// ============================================================
// handleMouseDown – connection creation
// ============================================================
describe('TimelineMode.handleMousePressed() / handleMouseDown()', () => {
  let mm, box;
  beforeEach(() => {
    box = makeBox('box1', 100, -50); // box above the bar (y < 0)
    mm  = makeMindMap([box]);
    mm.selectedBox = box;
    TimelineMode.toggle(mm);   // activate
  });

  test('returns false when world click is not in the bar area', () => {
    const result = TimelineMode.handleMousePressed(100, -200, mm);
    expect(result).toBe(false);
    expect(mm.timelineConnections).toHaveLength(0);
  });

  test('returns true (consumed) for any click on the bar body regardless of selection', () => {
    mm.selectedBox = null;
    const result = TimelineMode.handleMousePressed(100, 40, mm);
    // The bar body click is now always consumed to prevent deselection of boxes
    expect(result).toBe(true);
  });

  test('returns true and starts resize when clicking the drag handle', () => {
    const inst = TimelineMode.instance;
    const result = TimelineMode.handleMousePressed(inst.barWorldWidth, TimelineMode.BAR_HEIGHT / 2, mm);
    expect(result).toBe(true);
    expect(inst._draggingResize).toBe(true);
  });

  test('does NOT create connection on bar body click (connections use drag-to-create)', () => {
    const inst = TimelineMode.instance;
    const wx = inst._worldDayX(5);
    TimelineMode.handleMousePressed(wx, 40, mm);
    // Bar body clicks no longer create connections; use handleConnectionDropped instead
    expect(mm.timelineConnections).toHaveLength(0);
  });
});

// ============================================================
// handleConnectionDropped – drag-to-create connections
// ============================================================
describe('TimelineMode.handleConnectionDropped()', () => {
  let mm, box;
  beforeEach(() => {
    box = makeBox('box1', 100, -50);
    mm  = makeMindMap([box]);
    TimelineMode.toggle(mm);
  });

  test('returns false when timeline is inactive', () => {
    TimelineMode.toggle(mm); // deactivate
    const inst = TimelineMode.instance;
    const result = TimelineMode.handleConnectionDropped(inst._worldDayX(5), 40, box, mm);
    expect(result).toBe(false);
  });

  test('returns false when drop is outside the bar', () => {
    const result = TimelineMode.handleConnectionDropped(100, -500, box, mm);
    expect(result).toBe(false);
    expect(mm.timelineConnections).toHaveLength(0);
  });

  test('creates a TimelineConnection when dropped on the bar', () => {
    const inst = TimelineMode.instance;
    const wx = inst._worldDayX(5);
    const result = TimelineMode.handleConnectionDropped(wx, 40, box, mm);
    expect(result).toBe(true);
    expect(mm.timelineConnections).toHaveLength(1);
    const conn = mm.timelineConnections[0];
    expect(conn.fromBox).toBe(box);
    expect(conn.dayIndex).toBe(5);
  });

  test('two different ticks produce two connections', () => {
    const inst = TimelineMode.instance;
    TimelineMode.handleConnectionDropped(inst._worldDayX(3), 40, box, mm);
    TimelineMode.handleConnectionDropped(inst._worldDayX(7), 40, box, mm);
    expect(mm.timelineConnections).toHaveLength(2);
  });

  test('prevents duplicate connections to the same tick', () => {
    const inst = TimelineMode.instance;
    const wx = inst._worldDayX(10);
    TimelineMode.handleConnectionDropped(wx, 40, box, mm);
    TimelineMode.handleConnectionDropped(wx, 40, box, mm);
    expect(mm.timelineConnections).toHaveLength(1);
  });

  test('returns false when dropped on the resize handle', () => {
    const inst = TimelineMode.instance;
    const result = TimelineMode.handleConnectionDropped(
      inst.barWorldWidth, TimelineMode.BAR_HEIGHT / 2, box, mm
    );
    expect(result).toBe(false);
  });
});

// ============================================================
// TimelineConnection – JSON round-trip
// ============================================================
describe('TimelineConnection serialisation', () => {
  let mm, box;
  beforeEach(() => {
    box = makeBox('b1', 0, -100);
    mm  = makeMindMap([box]);
    TimelineMode.toggle(mm);
  });

  test('toJSON() returns {fromId, dayIndex}', () => {
    const inst = TimelineMode.instance;
    TimelineMode.handleConnectionDropped(inst._worldDayX(15), 40, box, mm);
    const conn = mm.timelineConnections[0];
    const json = conn.toJSON();
    expect(json).toMatchObject({ fromId: 'b1', dayIndex: 15 });
    expect(json.side).toBeUndefined();
    expect(json.boxId).toBeUndefined();
  });

  test('plain JSON.stringify round-trip preserves fromId and dayIndex', () => {
    const inst = TimelineMode.instance;
    TimelineMode.handleConnectionDropped(inst._worldDayX(15), 40, box, mm);
    const json = JSON.stringify(mm.timelineConnections.map(c => c.toJSON()));
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ fromId: 'b1', dayIndex: 15 });
  });

  test('connections survive toggle off/on cycle', () => {
    const inst = TimelineMode.instance;
    TimelineMode.handleConnectionDropped(inst._worldDayX(20), 40, box, mm);
    expect(mm.timelineConnections).toHaveLength(1);

    TimelineMode.toggle(mm); // off – connections NOT cleared
    expect(mm.timelineConnections).toHaveLength(1);

    TimelineMode.toggle(mm); // on again
    expect(mm.timelineConnections).toHaveLength(1);
  });
});

// ============================================================
// Resize drag – handleDrag / handleRelease
// ============================================================
describe('Resize drag', () => {
  let mm, inst;
  beforeEach(() => {
    mm = makeMindMap();
    TimelineMode.toggle(mm);
    inst = TimelineMode.instance;
  });

  test('handleDrag updates barWorldWidth while _draggingResize is true', () => {
    const startWidth = inst.barWorldWidth;
    inst._draggingResize  = true;
    inst._dragStartWorldX = 0;
    inst._dragStartWidth  = startWidth;
    const consumed = TimelineMode.handleMouseDragged(300, 40);
    expect(consumed).toBe(true);
    expect(inst.barWorldWidth).toBe(startWidth + 300);
  });

  test('handleDrag clamps barWorldWidth to MIN_WIDTH', () => {
    inst._draggingResize  = true;
    inst._dragStartWorldX = 0;
    inst._dragStartWidth  = TimelineMode.MIN_WIDTH;
    TimelineMode.handleMouseDragged(-9999, 40);
    expect(inst.barWorldWidth).toBe(TimelineMode.MIN_WIDTH);
  });

  test('handleDrag returns false when not dragging', () => {
    inst._draggingResize = false;
    const consumed = TimelineMode.handleMouseDragged(300, 40);
    expect(consumed).toBe(false);
  });

  test('handleRelease clears _draggingResize', () => {
    inst._draggingResize = true;
    inst.mindMap = mm;
    TimelineMode.handleMouseReleased();
    expect(inst._draggingResize).toBe(false);
  });

  test('handleRelease persists barWorldWidth to mindMap.timelineBarWidth', () => {
    inst._draggingResize = true;
    inst.barWorldWidth   = 1234;
    inst.mindMap = mm;
    TimelineMode.handleMouseReleased();
    expect(mm.timelineBarWidth).toBe(1234);
  });
});

// ============================================================
// draw() – smoke test (no throw)
// ============================================================
describe('TimelineMode draw()', () => {
  test('draw() does not throw when active', () => {
    const mm = makeMindMap();
    TimelineMode.toggle(mm);
    const inst = TimelineMode.instance;
    expect(() => inst.draw()).not.toThrow();
  });

  test('draw() is a no-op when not active (rect not called)', () => {
    const mm = makeMindMap();
    const inst = new TimelineMode(mm);
    inst.start();
    inst.stop();
    expect(() => inst.draw()).not.toThrow();
    expect(sandbox.rect).not.toHaveBeenCalled();
  });

  test('draw() calls push() when active', () => {
    const mm = makeMindMap();
    TimelineMode.toggle(mm);
    sandbox.push.mockClear();
    TimelineMode.instance.draw();
    expect(sandbox.push).toHaveBeenCalled();
  });
});

// ============================================================
// loop() – static entry point
// ============================================================
describe('TimelineMode.loop()', () => {
  test('loop() is a no-op when no instance exists', () => {
    expect(() => TimelineMode.loop(null, null)).not.toThrow();
    expect(sandbox.push).not.toHaveBeenCalled();
  });

  test('loop() draws when instance is active', () => {
    const mm = makeMindMap();
    TimelineMode.toggle(mm);
    sandbox.push.mockClear();
    TimelineMode.loop(null, mm);
    expect(sandbox.push).toHaveBeenCalled();
  });

  test('loop() is a no-op when instance is inactive', () => {
    const mm = makeMindMap();
    TimelineMode.toggle(mm); // on
    TimelineMode.toggle(mm); // off
    sandbox.push.mockClear();
    TimelineMode.loop(null, mm);
    expect(sandbox.push).not.toHaveBeenCalled();
  });
});

// ============================================================
// JSON serialisation (via mindMap.timelineConnections)
// ============================================================
describe('timelineConnections serialisation', () => {
  // This describe block is now superseded by the "TimelineConnection serialisation"
  // block added near handleConnectionDropped tests above.  Keeping a minimal
  // sanity check here for backward compatibility verification.
  test('connections array is preserved across toggle off/on cycle', () => {
    const mm = makeMindMap([makeBox('b1', 0, -100)]);
    TimelineMode.toggle(mm); // on
    const inst = TimelineMode.instance;
    TimelineMode.handleConnectionDropped(inst._worldDayX(20), 40, mm.boxes[0], mm);
    expect(mm.timelineConnections).toHaveLength(1);

    TimelineMode.toggle(mm); // off – connections NOT cleared
    expect(mm.timelineConnections).toHaveLength(1);

    TimelineMode.toggle(mm); // on again
    expect(mm.timelineConnections).toHaveLength(1);
  });
});

// ============================================================
// _dateForDay
// ============================================================
describe('_dateForDay()', () => {
  test('day 0 returns today (date part only)', () => {
    const inst = new TimelineMode(makeMindMap());
    inst.start();
    const d = inst._dateForDay(0);
    const today = new Date();
    expect(d.getFullYear()).toBe(today.getFullYear());
    expect(d.getMonth()).toBe(today.getMonth());
    expect(d.getDate()).toBe(today.getDate());
  });

  test('day 7 returns one week from today', () => {
    const inst = new TimelineMode(makeMindMap());
    inst.start();
    const d = inst._dateForDay(7);
    const expected = new Date();
    expected.setDate(expected.getDate() + 7);
    expect(d.getDate()).toBe(expected.getDate());
  });
});

// ============================================================
// _weekNumber
// ============================================================
describe('_weekNumber()', () => {
  test('6 Jan 2025 (Monday) is ISO week 2', () => {
    const inst = new TimelineMode();
    expect(inst._weekNumber(new Date(2025, 0, 6))).toBe(2);
  });

  test('1 Jan 2025 is in week ≥ 1', () => {
    const inst = new TimelineMode();
    expect(inst._weekNumber(new Date(2025, 0, 1))).toBeGreaterThanOrEqual(1);
  });
});

