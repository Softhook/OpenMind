/**
 * Tests for arrow-key repeat behaviour in KeyRepeat (sketch.js).
 *
 * KeyRepeat is the fallback synthetic key-repeat system used when the browser
 * does not deliver native OS key-repeat events quickly enough.  The feature
 * requested in the issue is: while editing text inside a box, holding an
 * arrow key should move the cursor repeatedly (just like holding Backspace
 * deletes characters repeatedly).
 *
 * Expected behaviour:
 *  - Arrow keys (37-40) are now tracked by KeyRepeat.isTracked().
 *  - While editing (selectedBox.isEditing === true), update() fires
 *    synthetic repeats that call handleKeyPressed.
 *  - While NOT editing, update() skips arrow keys (no synthetic repeats for
 *    box-navigation mode).
 */

const fs = require('fs');
const path = require('path');

// Use real ColorPalette so sketch.js can access ColorPalette.GRID etc.
const RealColorPalette = require('../../src/ColorPalette');
global.ColorPalette = RealColorPalette;

// p5.js key-code constants with correct numeric values.
global.BACKSPACE    = 8;
global.DELETE       = 46;
global.LEFT_ARROW   = 37;
global.UP_ARROW     = 38;
global.RIGHT_ARROW  = 39;
global.DOWN_ARROW   = 40;
global.ENTER        = 13;
global.ESCAPE       = 27;
global.CONTROL      = 17;
global.META         = 91;
global.SHIFT        = 16;
global.ALT          = 18;
global.TAB          = 9;
global.RETURN       = 13;

// p5.js millis() - mocked so we can control time in tests.
global.millis = jest.fn(() => 0);

// Stub p5 drawing / input helpers used by sketch.js at definition time.
const noOp = () => {};
[
  'createCanvas', 'background', 'fill', 'noFill', 'stroke', 'noStroke',
  'strokeWeight', 'rect', 'ellipse', 'circle', 'line', 'triangle',
  'text', 'textSize', 'textWidth', 'textAlign', 'textStyle', 'textFont',
  'textLeading', 'push', 'pop', 'translate', 'rotate', 'scale',
  'image', 'loadImage', 'tint', 'noTint', 'cursor', 'noCursor',
  'resizeCanvas', 'fullscreen', 'getItem', 'storeItem', 'removeItem',
  'constrain', 'lerp', 'map', 'abs', 'max', 'min', 'dist',
  'floor', 'ceil', 'round', 'sqrt', 'pow', 'sin', 'cos', 'atan2',
  'random', 'int', 'color', 'red', 'green', 'blue', 'alpha', 'lerpColor',
  'drawingContext', 'keyCode', 'key',
  'mouseIsPressed', 'mouseButton',
  'LEFT', 'RIGHT', 'CENTER',
  'ARROW', 'CROSS', 'HAND', 'MOVE', 'TEXT', 'WAIT',
  'BOLD', 'ITALIC', 'NORMAL', 'BOLDITALIC',
  'frameRate', 'frameCount', 'width', 'height',
  'mouseX', 'mouseY', 'pmouseX', 'pmouseY',
  'addTrackedEventListener', 'removeTrackedEventListeners',
].forEach(name => { if (typeof global[name] === 'undefined') global[name] = noOp; });

// Provide globals expected by sketch.js class references.
global.MindMap = class { constructor() { this.boxes = []; this.connections = []; } };
global.TextBox = class {};
global.CollaborationManager = class {};
global.UIManager = class {};
global.CameraUtils = { zoom: 1, camX: 0, camY: 0 };
global.Utils = {
  Logger: { state: noOp, warn: noOp, error: noOp, info: noOp, debug: noOp },
  generateUUID: () => 'uuid-test',
  sanitizeText: t => t,
  getClampedZoomFactor: () => 1,
  isValidNumber: n => typeof n === 'number' && !isNaN(n),
  applyFill: noOp,
  applyStroke: noOp,
};
global.AppConfig = {
  ZOOM: { MIN: 0.2, MAX: 3.0, STEP: 1.05, DEFAULT: 1.0 },
  CAMERA: { PAN_MARGIN: 500 },
  UI: {
    TOOLBAR_HEIGHT: 40, MENU_TRIGGER_X: 50, MENU_TRIGGER_Y: 50,
    BUTTONS_BAND_HEIGHT: 50, BUTTON_START_X: 40, BUTTON_Y: 10,
    BUTTON_GAP: 5, SAVE_INDICATOR_SIZE: 16,
    SAVE_INDICATOR_X: 20, SAVE_INDICATOR_Y: 26,
  },
  EXPORT: { PADDING: 50, MARGIN: 20 },
  BOX: { MAX_WIDTH: 280 },
};
global.ExtensionBridge = { handleInput: null, handleKeyReleased: null, load: noOp };

// keyIsDown: stub that returns true for any key code by default.
// Tests that need to simulate a "key not held" scenario can override it.
global.keyIsDown = jest.fn(() => true);

// Load sketch.js
let KeyRepeat, _testSetMindMap;
try {
  ({ KeyRepeat, _testSetMindMap } = require('../../src/sketch.js'));
} catch (e) {
  throw new Error('Failed to load sketch.js: ' + e.message);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetKeyRepeat() {
  KeyRepeat.state.clear();
}

const LEFT  = 37;
const UP    = 38;
const RIGHT = 39;
const DOWN  = 40;
const BK    = 8;  // BACKSPACE
const DEL   = 46; // DELETE

// ---------------------------------------------------------------------------
// isTracked()
// ---------------------------------------------------------------------------

describe('KeyRepeat.isTracked - arrow keys included', () => {
  test('returns true for LEFT_ARROW (37)',  () => expect(KeyRepeat.isTracked(LEFT)).toBe(true));
  test('returns true for UP_ARROW (38)',    () => expect(KeyRepeat.isTracked(UP)).toBe(true));
  test('returns true for RIGHT_ARROW (39)', () => expect(KeyRepeat.isTracked(RIGHT)).toBe(true));
  test('returns true for DOWN_ARROW (40)', () => expect(KeyRepeat.isTracked(DOWN)).toBe(true));
  test('still returns true for BACKSPACE',  () => expect(KeyRepeat.isTracked(BK)).toBe(true));
  test('still returns true for DELETE',     () => expect(KeyRepeat.isTracked(DEL)).toBe(true));
  test('returns false for regular character keys', () => {
    expect(KeyRepeat.isTracked(65)).toBe(false); // 'A'
    expect(KeyRepeat.isTracked(32)).toBe(false); // Space
  });
});

// ---------------------------------------------------------------------------
// _isArrowKey()
// ---------------------------------------------------------------------------

describe('KeyRepeat._isArrowKey', () => {
  test('returns true for all four arrow codes', () => {
    [LEFT, UP, RIGHT, DOWN].forEach(code => expect(KeyRepeat._isArrowKey(code)).toBe(true));
  });
  test('returns false for non-arrow codes', () => {
    [BK, DEL, 65, 32, 13].forEach(code => expect(KeyRepeat._isArrowKey(code)).toBe(false));
  });
});

// ---------------------------------------------------------------------------
// update() - arrow key gating
// ---------------------------------------------------------------------------

describe('KeyRepeat.update - arrow key repeat gating', () => {
  let handleKeyPressed;

  beforeEach(() => {
    resetKeyRepeat();
    handleKeyPressed = jest.fn();
    global.millis.mockReturnValue(0);
  });

  afterEach(() => {
    _testSetMindMap(null);
  });

  test('does NOT synthesize arrow repeat when mindMap is null', () => {
    _testSetMindMap(null);
    KeyRepeat.start(LEFT);
    global.millis.mockReturnValue(500);
    KeyRepeat.update();
    expect(handleKeyPressed).not.toHaveBeenCalled();
  });

  test('does NOT synthesize arrow repeat when no box is selected', () => {
    _testSetMindMap({ selectedBox: null, handleKeyPressed });
    KeyRepeat.start(RIGHT);
    global.millis.mockReturnValue(500);
    KeyRepeat.update();
    expect(handleKeyPressed).not.toHaveBeenCalled();
  });

  test('does NOT synthesize arrow repeat when selected box is NOT editing', () => {
    _testSetMindMap({ selectedBox: { isEditing: false }, handleKeyPressed });
    KeyRepeat.start(UP);
    global.millis.mockReturnValue(500);
    KeyRepeat.update();
    expect(handleKeyPressed).not.toHaveBeenCalled();
  });

  test('DOES synthesize arrow repeat when selected box IS editing', () => {
    _testSetMindMap({ selectedBox: { isEditing: true }, handleKeyPressed });
    KeyRepeat.start(DOWN);
    global.millis.mockReturnValue(500); // past 400 ms initialDelay + 50 ms repeatInterval
    KeyRepeat.update();
    expect(handleKeyPressed).toHaveBeenCalledWith('', DOWN, true);
  });

  test('synthesizes LEFT arrow repeat when editing', () => {
    _testSetMindMap({ selectedBox: { isEditing: true }, handleKeyPressed });
    KeyRepeat.start(LEFT);
    global.millis.mockReturnValue(500);
    KeyRepeat.update();
    expect(handleKeyPressed).toHaveBeenCalledWith('', LEFT, true);
  });

  test('does NOT fire before initialDelay even when editing', () => {
    _testSetMindMap({ selectedBox: { isEditing: true }, handleKeyPressed });
    KeyRepeat.start(LEFT);
    global.millis.mockReturnValue(200); // 200 ms < 400 ms initialDelay
    KeyRepeat.update();
    expect(handleKeyPressed).not.toHaveBeenCalled();
  });

  test('fires multiple repeats at repeatInterval cadence when editing', () => {
    _testSetMindMap({ selectedBox: { isEditing: true }, handleKeyPressed });
    KeyRepeat.start(RIGHT);

    global.millis.mockReturnValue(450); // first repeat (past 400 ms delay)
    KeyRepeat.update();
    expect(handleKeyPressed).toHaveBeenCalledTimes(1);

    global.millis.mockReturnValue(510); // 60 ms later > 50 ms repeatInterval
    KeyRepeat.update();
    expect(handleKeyPressed).toHaveBeenCalledTimes(2);
  });

  test('BACKSPACE still synthesizes repeat regardless of editing state', () => {
    _testSetMindMap({ selectedBox: { isEditing: false }, handleKeyPressed });
    KeyRepeat.start(BK);
    global.millis.mockReturnValue(500);
    KeyRepeat.update();
    expect(handleKeyPressed).toHaveBeenCalledWith('', BK, true);
  });
});

// ---------------------------------------------------------------------------
// keyIsDown safety net (missed-keyup guard)
// ---------------------------------------------------------------------------

describe('KeyRepeat keyIsDown safety net', () => {
  let handleKeyPressed;

  beforeEach(() => {
    resetKeyRepeat();
    handleKeyPressed = jest.fn();
    global.millis.mockReturnValue(0);
    global.keyIsDown.mockReturnValue(true); // default: key IS held
  });

  afterEach(() => {
    _testSetMindMap(null);
  });

  test('stops synthesizing when keyIsDown returns false (keyup was missed)', () => {
    _testSetMindMap({ selectedBox: { isEditing: true }, handleKeyPressed });

    KeyRepeat.start(BK);
    global.millis.mockReturnValue(500);
    KeyRepeat.update();
    expect(handleKeyPressed).toHaveBeenCalledTimes(1);

    // Simulate the key being released but keyReleased() never called
    global.keyIsDown.mockReturnValue(false);
    global.millis.mockReturnValue(560);
    KeyRepeat.update();
    expect(handleKeyPressed).toHaveBeenCalledTimes(1); // no new calls
  });

  test('continues synthesizing while keyIsDown returns true', () => {
    _testSetMindMap({ selectedBox: { isEditing: true }, handleKeyPressed });

    KeyRepeat.start(BK);
    global.millis.mockReturnValue(500);
    KeyRepeat.update();
    expect(handleKeyPressed).toHaveBeenCalledTimes(1);

    global.millis.mockReturnValue(560);
    KeyRepeat.update();
    expect(handleKeyPressed).toHaveBeenCalledTimes(2);
  });

  test('ignores keyIsDown for arrow keys when not editing (already gated)', () => {
    _testSetMindMap({ selectedBox: { isEditing: false }, handleKeyPressed });
    KeyRepeat.start(RIGHT);
    global.millis.mockReturnValue(500);
    global.keyIsDown.mockReturnValue(true);
    KeyRepeat.update();
    // Arrow keys when not editing are skipped by the editing gate, not keyIsDown
    expect(handleKeyPressed).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// isNativeRepeat flag (cadence coordination + race-condition prevention)
// ---------------------------------------------------------------------------

describe('KeyRepeat isNativeRepeat flag', () => {
  let handleKeyPressed;

  beforeEach(() => {
    resetKeyRepeat();
    handleKeyPressed = jest.fn();
    global.millis.mockReturnValue(0);
  });

  afterEach(() => {
    _testSetMindMap(null);
  });

  test('start(key, false) sets pressedAt — synthetic fires after initialDelay', () => {
    _testSetMindMap({ selectedBox: { isEditing: true }, handleKeyPressed });
    KeyRepeat.start(BK, false);

    global.millis.mockReturnValue(500);
    KeyRepeat.update();
    expect(handleKeyPressed).toHaveBeenCalledTimes(1);
  });

  test('start(key, true) does NOT reset pressedAt — preserves original press time', () => {
    _testSetMindMap({ selectedBox: { isEditing: true }, handleKeyPressed });

    KeyRepeat.start(BK, false);  // T=0, pressedAt=0
    global.millis.mockReturnValue(100);
    KeyRepeat.start(BK, true);   // T=100, native repeat — pressedAt stays 0

    // At T=450, initialDelay (400ms from T=0) has elapsed → repeat fires
    global.millis.mockReturnValue(450);
    KeyRepeat.update();
    expect(handleKeyPressed).toHaveBeenCalledTimes(1);

    // If pressedAt had been reset to 100, the 400ms delay would expire at 500
  });

  test('start(key, true) still resets lastEventAt for cadence coordination', () => {
    _testSetMindMap({ selectedBox: { isEditing: true }, handleKeyPressed });

    KeyRepeat.start(BK, false);  // T=0, lastEventAt=0
    global.millis.mockReturnValue(400);
    KeyRepeat.start(BK, true);   // T=400, lastEventAt=400

    // At T=450: now - lastEventAt = 50 >= repeatInterval → fires
    global.millis.mockReturnValue(450);
    KeyRepeat.update();
    expect(handleKeyPressed).toHaveBeenCalledTimes(1);

    // At T=455: now - lastEventAt = 5 < 50 → does NOT fire
    global.millis.mockReturnValue(455);
    KeyRepeat.update();
    expect(handleKeyPressed).toHaveBeenCalledTimes(1);
  });

  test('fast native repeats (< 150ms) suppress synthetic', () => {
    _testSetMindMap({ selectedBox: { isEditing: true }, handleKeyPressed });

    KeyRepeat.start(BK, false);       // T=0
    KeyRepeat.noteNativeKeydown(BK);

    global.millis.mockReturnValue(30);
    KeyRepeat.noteNativeKeydown(BK);
    KeyRepeat.start(BK, true);

    global.millis.mockReturnValue(60);
    KeyRepeat.noteNativeKeydown(BK);
    KeyRepeat.start(BK, true);

    // At T=450, initialDelay elapsed but hasNativeRepeat=true (30ms < 150ms)
    global.millis.mockReturnValue(450);
    KeyRepeat.update();
    expect(handleKeyPressed).not.toHaveBeenCalled();
  });

  test('synthetic interleaves with slow native repeats (cadence coordination)', () => {
    _testSetMindMap({ selectedBox: { isEditing: true }, handleKeyPressed });

    // Slow native repeats: 200ms apart (above 150ms threshold)
    KeyRepeat.start(BK, false);       // T=0, pressedAt=0, lastEventAt=0
    KeyRepeat.noteNativeKeydown(BK);

    global.millis.mockReturnValue(200);
    KeyRepeat.noteNativeKeydown(BK);
    KeyRepeat.start(BK, true);        // lastEventAt=200

    // At T=400: native repeat, resets lastEventAt to 400
    global.millis.mockReturnValue(400);
    KeyRepeat.noteNativeKeydown(BK);
    KeyRepeat.start(BK, true);        // lastEventAt=400

    // At T=400: now-lastEventAt=0 < 50 → no fire (cadence is relative to last native)
    KeyRepeat.update();
    expect(handleKeyPressed).toHaveBeenCalledTimes(0);

    // At T=450: now-lastEventAt=50 >= 50 → synthetic fires
    global.millis.mockReturnValue(450);
    KeyRepeat.update();
    expect(handleKeyPressed).toHaveBeenCalledTimes(1);

    // At T=460: now-lastEventAt=10 (since lastEventAt was updated to 450 by the
    // synthetic fire above) → no fire
    global.millis.mockReturnValue(460);
    KeyRepeat.update();
    expect(handleKeyPressed).toHaveBeenCalledTimes(1);

    // At T=600: native repeat, resets lastEventAt to 600
    global.millis.mockReturnValue(600);
    KeyRepeat.noteNativeKeydown(BK);
    KeyRepeat.start(BK, true);        // lastEventAt=600

    // At T=650: now-lastEventAt=50 >= 50 → synthetic fires
    global.millis.mockReturnValue(650);
    KeyRepeat.update();
    expect(handleKeyPressed).toHaveBeenCalledTimes(2);
  });
});

describe('draw - timeline layering order', () => {
  test('keeps timeline connection underlay call before mindMap.draw()', () => {
    const sketchSource = fs.readFileSync(path.join(__dirname, '../../src/sketch.js'), 'utf8');
    const drawTimelineIndex = sketchSource.indexOf('mindMap.drawTimeline();');
    const underlayIndex = sketchSource.indexOf('mindMap.drawTimelineConnectionsUnderlay();');
    const drawMindMapIndex = sketchSource.indexOf('mindMap.draw();');

    expect(drawTimelineIndex).toBeGreaterThan(-1);
    expect(underlayIndex).toBeGreaterThan(drawTimelineIndex);
    expect(drawMindMapIndex).toBeGreaterThan(underlayIndex);

    const underlayCalls = sketchSource.match(/mindMap\.drawTimelineConnectionsUnderlay\(\);/g) || [];
    expect(underlayCalls).toHaveLength(1);
  });
});
