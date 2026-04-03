/**
 * Unit tests for TimelineMode
 *
 * Follows the same vm-sandbox pattern used by ThrustGame.test.js:
 *   - Load the source file with vm.Script into a sandbox that stubs all p5 globals
 *   - Retrieve the exported class from sandbox.module.exports
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
  resetMatrix:  jest.fn(),
  fill:         jest.fn(),
  noFill:       jest.fn(),
  stroke:       jest.fn(),
  noStroke:     jest.fn(),
  strokeWeight: jest.fn(),
  rect:         jest.fn(),
  line:         jest.fn(),
  circle:       jest.fn(),
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
  console,
  module: { exports: {} },
  window: {},
  // height / width – mimic browser globals (p5 sets these)
  height: 600,
  width:  800,
  // CameraUtils stub (screenX/screenY are identity by default)
  CameraUtils: {
    screenX: jest.fn(x => x),
    screenY: jest.fn(y => y),
  },
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
    selectedBox: null,
  };
}

function makeBox(id, x = 0, y = 0) {
  return { id, x, y, width: 100, height: 40 };
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
// Static interface
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
    // Before toggling, the property should be absent
    expect(mm.timelineConnections).toBeUndefined();
    TimelineMode.toggle(mm);
    // After toggle → start(), the array should be initialised
    expect(TimelineMode.instance.active).toBe(true);
    expect(Array.isArray(mm.timelineConnections)).toBe(true);
  });
});

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
  test('start() sets active and records startDate', () => {
    const mm = makeMindMap();
    const inst = new TimelineMode(mm);
    inst.start();
    expect(inst.active).toBe(true);
    expect(inst.startDate).toBeInstanceOf(Date);
    // Normalised to midnight
    expect(inst.startDate.getHours()).toBe(0);
    expect(inst.startDate.getMinutes()).toBe(0);
  });

  test('stop() sets active to false', () => {
    const mm = makeMindMap();
    const inst = new TimelineMode(mm);
    inst.start();
    inst.stop();
    expect(inst.active).toBe(false);
    // startDate is preserved so connections still resolve when re-activated
    expect(inst.startDate).not.toBeNull();
  });
});

// ============================================================
// Geometry helpers
// ============================================================
describe('_dayX / _dayFromX round-trip', () => {
  let inst;
  beforeEach(() => {
    inst = new TimelineMode(makeMindMap());
    inst.start();
  });

  test('day 0 maps to x=0', () => {
    expect(inst._dayX(0)).toBe(0);
  });

  test('last day maps to x=barW', () => {
    expect(inst._dayX(TimelineMode.TOTAL_DAYS - 1)).toBeCloseTo(inst._barW(), 1);
  });

  test('mid day round-trips correctly', () => {
    const mid = Math.floor(TimelineMode.TOTAL_DAYS / 2);
    const x   = inst._dayX(mid);
    expect(inst._dayFromX(x)).toBe(mid);
  });

  test('x=0 maps back to day 0', () => {
    expect(inst._dayFromX(0)).toBe(0);
  });

  test('x=barW maps back to last day', () => {
    expect(inst._dayFromX(inst._barW())).toBe(TimelineMode.TOTAL_DAYS - 1);
  });
});

describe('_isOverBar()', () => {
  let inst;
  beforeEach(() => {
    inst = new TimelineMode(makeMindMap());
    inst.start();
  });

  test('returns true for y inside the bar', () => {
    const barY = inst._barY();
    expect(inst._isOverBar(400, barY + 10)).toBe(true);
  });

  test('returns true within HIT_EXTEND above bar', () => {
    const barY = inst._barY();
    expect(inst._isOverBar(400, barY - TimelineMode.HIT_EXTEND + 1)).toBe(true);
  });

  test('returns false well above the bar', () => {
    expect(inst._isOverBar(400, 10)).toBe(false);
  });
});

// ============================================================
// handleClick – soft connection management
// ============================================================
describe('TimelineMode.handleMousePressed() / handleClick()', () => {
  let mm, box;
  beforeEach(() => {
    box = makeBox('box1', 100, 50);
    mm  = makeMindMap([box]);
    mm.selectedBox = box;
    TimelineMode.toggle(mm);   // activate
  });

  test('returns false when click is not in timeline area', () => {
    const result = TimelineMode.handleMousePressed(400, 10, mm);
    expect(result).toBe(false);
    expect(mm.timelineConnections).toHaveLength(0);
  });

  test('returns false when no box is selected', () => {
    mm.selectedBox = null;
    const inst = TimelineMode.instance;
    const barY = inst._barY();
    const result = TimelineMode.handleMousePressed(400, barY + 20, mm);
    expect(result).toBe(false);
  });

  test('creates a connection when clicking a day tick with a box selected', () => {
    const inst = TimelineMode.instance;
    const barY = inst._barY();
    const result = TimelineMode.handleMousePressed(inst._dayX(5), barY + 20, mm);
    expect(result).toBe(true);
    expect(mm.timelineConnections).toHaveLength(1);
    expect(mm.timelineConnections[0].boxId).toBe('box1');
    expect(mm.timelineConnections[0].dayIndex).toBe(5);
  });

  test('removes an existing connection when clicking the same day tick again', () => {
    const inst = TimelineMode.instance;
    const barY = inst._barY();
    const dx = inst._dayX(10);
    TimelineMode.handleMousePressed(dx, barY + 20, mm);
    expect(mm.timelineConnections).toHaveLength(1);
    TimelineMode.handleMousePressed(dx, barY + 20, mm);
    expect(mm.timelineConnections).toHaveLength(0);
  });

  test('two different day ticks produce two connections', () => {
    const inst = TimelineMode.instance;
    const barY = inst._barY();
    TimelineMode.handleMousePressed(inst._dayX(3), barY + 20, mm);
    TimelineMode.handleMousePressed(inst._dayX(7), barY + 20, mm);
    expect(mm.timelineConnections).toHaveLength(2);
  });

  test('side is "above" when box screen Y is above the bar midpoint', () => {
    // box.y = 50, CameraUtils.screenY returns y unchanged, barY ~ 510, mid ~ 550
    // So screenY(50) = 50 < midY → side = 'above'
    const inst = TimelineMode.instance;
    const barY = inst._barY();
    TimelineMode.handleMousePressed(inst._dayX(1), barY + 20, mm);
    expect(mm.timelineConnections[0].side).toBe('above');
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

  test('draw() is a no-op when not active', () => {
    const mm = makeMindMap();
    const inst = new TimelineMode(mm);
    inst.start();
    inst.stop();
    expect(() => inst.draw()).not.toThrow();
    // p5 drawing functions should not be called
    expect(sandbox.rect).not.toHaveBeenCalled();
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
  test('connections are stored on mindMap (plain data, no TimelineMode coupling)', () => {
    const mm = makeMindMap([makeBox('b1', 0, 0)]);
    mm.selectedBox = mm.boxes[0];
    TimelineMode.toggle(mm);
    const inst = TimelineMode.instance;
    const barY = inst._barY();
    TimelineMode.handleMousePressed(inst._dayX(15), barY + 20, mm);

    // The data is plain JSON-serialisable objects on mindMap
    const json = JSON.stringify({ timelineConnections: mm.timelineConnections });
    const parsed = JSON.parse(json);
    expect(parsed.timelineConnections).toHaveLength(1);
    expect(parsed.timelineConnections[0]).toMatchObject({
      boxId: 'b1',
      dayIndex: 15,
    });
  });

  test('connections survive toggle off/on cycle', () => {
    const mm = makeMindMap([makeBox('b1', 0, 0)]);
    mm.selectedBox = mm.boxes[0];
    TimelineMode.toggle(mm); // on
    const inst = TimelineMode.instance;
    const barY = inst._barY();
    TimelineMode.handleMousePressed(inst._dayX(20), barY + 20, mm);
    expect(mm.timelineConnections).toHaveLength(1);

    TimelineMode.toggle(mm); // off
    // Connections are NOT cleared on deactivation
    expect(mm.timelineConnections).toHaveLength(1);

    TimelineMode.toggle(mm); // on again
    expect(mm.timelineConnections).toHaveLength(1);
  });
});

// ============================================================
// _dateForDay
// ============================================================
describe('_dateForDay()', () => {
  test('day 0 returns today (normalised)', () => {
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
  test('returns a positive integer', () => {
    const inst = new TimelineMode();
    const d = new Date(2025, 0, 6); // Monday 6 Jan 2025 = ISO week 2
    expect(inst._weekNumber(d)).toBe(2);
  });

  test('week 1 for first week of year', () => {
    const inst = new TimelineMode();
    const d = new Date(2025, 0, 1); // 1 Jan 2025 = ISO week 1
    expect(inst._weekNumber(d)).toBeGreaterThanOrEqual(1);
  });
});
