const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadTextBox() {
  const code = fs.readFileSync(path.join(__dirname, '../../src/TextBox.js'), 'utf8');

  // Minimal sandbox to satisfy TextBox dependencies
  const sandbox = {
    Utils: {
      generateUUID: () => 'uuid-1',
      sanitizeText: (t) => (t == null ? '' : String(t)),
      getClampedZoomFactor: () => 1,
      isValidNumber: (n) => typeof n === 'number' && !isNaN(n) && isFinite(n)
    },
    // p5-style helpers needed by TextBox sizing
    textSize: () => {},
    textWidth: (txt) => (txt ? txt.length * 8 : 0),
    max: Math.max,
    min: Math.min,
    // No-op drawing stubs used by other methods
    push: () => {},
    pop: () => {},
    noStroke: () => {},
    fill: () => {},
    rect: () => {},
    stroke: () => {},
    strokeWeight: () => {},
    line: () => {},
    millis: () => 0,
    // keyIsDown simulation
    keyIsDown: null // will be set in tests
  };

  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'TextBox.js' });
  return { TextBox: sandbox.TextBox, sandbox };
}

describe('TextBox shift-constrained dragging', () => {
  test('horizontal drag with Shift from start locks Y axis', () => {
    const { TextBox, sandbox } = loadTextBox();
    const box = new TextBox(100, 100, 'test');
    
    // Simulate keyIsDown returning true for Shift (keycode 16)
    sandbox.keyIsDown = (code) => code === 16;
    
    // Start drag - clicking at box center (100, 100)
    box.startDrag(100, 100);
    expect(box._dragStartX).toBe(100);
    expect(box._dragStartY).toBe(100);
    // Offset should be 0,0 since clicking at center
    expect(box.dragOffsetX).toBe(0);
    expect(box.dragOffsetY).toBe(0);
    
    // Drag mouse to (150, 105) - mostly horizontal movement
    // Box will move to (150, 105) since offset is (0, 0)
    box.drag(150, 105);
    
    // Should lock to horizontal axis (Y locked to start)
    expect(box.x).toBeCloseTo(150, 1);
    expect(box.y).toBe(100); // Y should be locked to start
    
    box.stopDrag();
  });

  test('vertical drag with Shift from start locks X axis', () => {
    const { TextBox, sandbox } = loadTextBox();
    const box = new TextBox(100, 100, 'test');
    
    sandbox.keyIsDown = (code) => code === 16;
    
    box.startDrag(100, 100);
    
    // Drag mouse to (105, 150) - mostly vertical movement
    box.drag(105, 150);
    
    // Should lock to vertical axis (X locked to start)
    expect(box.x).toBe(100); // X should be locked to start
    expect(box.y).toBeCloseTo(150, 1);
    
    box.stopDrag();
  });

  test('pressing Shift mid-drag should not snap back to original position', () => {
    const { TextBox, sandbox } = loadTextBox();
    const box = new TextBox(100, 100, 'test');
    
    // Start without Shift - click at center
    sandbox.keyIsDown = (code) => false;
    box.startDrag(100, 100);
    
    // Drag mouse to (120, 130) without Shift - box moves there
    box.drag(120, 130);
    expect(box.x).toBeCloseTo(120, 1);
    expect(box.y).toBeCloseTo(130, 1);
    
    // Now press Shift and continue dragging
    sandbox.keyIsDown = (code) => code === 16;
    
    // Drag mouse more horizontally: to (150, 132)
    // From start: deltaX=50, deltaY=32 -> locks to X (horizontal)
    box.drag(150, 132);
    
    // Should lock Y to the lock origin (where Shift was first pressed: 130)
    expect(box.x).toBeCloseTo(150, 1);
    expect(box.y).toBeCloseTo(130, 1); // Should stay at 130, not snap to 100
    
    box.stopDrag();
  });

  test('axis should not switch mid-drag when crossing diagonal', () => {
    const { TextBox, sandbox } = loadTextBox();
    const box = new TextBox(100, 100, 'test');
    
    sandbox.keyIsDown = (code) => code === 16;
    box.startDrag(100, 100);
    
    // Initial drag more horizontal: deltaX=30, deltaY=10 -> locks to X
    box.drag(130, 110);
    const firstX = box.x;
    const firstY = box.y;
    expect(box._dragLockAxis).toBe('x'); // Should lock to horizontal
    
    // Continue dragging - if we recalculate, deltaX=35, deltaY=40 would switch to Y
    // But axis is locked, so Y stays fixed
    box.drag(135, 140);
    
    // Should still be locked to horizontal (Y locked) since that was the initial direction
    expect(box.y).toBe(firstY); // Y should remain locked
    expect(box.x).toBeCloseTo(135, 1); // X should move
    expect(box._dragLockAxis).toBe('x'); // Should still be X
    
    box.stopDrag();
  });

  test('releasing Shift should clear lock state', () => {
    const { TextBox, sandbox } = loadTextBox();
    const box = new TextBox(100, 100, 'test');
    
    sandbox.keyIsDown = (code) => code === 16;
    box.startDrag(100, 100);
    
    // Drag with Shift - locks to horizontal
    box.drag(150, 110);
    expect(box._dragLockAxis).toBe('x');
    
    // Release Shift
    sandbox.keyIsDown = (code) => false;
    box.drag(160, 120);
    
    // Lock state should be cleared
    expect(box._dragLockAxis).toBeUndefined();
    expect(box._dragLockOriginX).toBeUndefined();
    expect(box._dragLockOriginY).toBeUndefined();
    
    // Should move freely
    expect(box.x).toBeCloseTo(160, 1);
    expect(box.y).toBeCloseTo(120, 1);
    
    box.stopDrag();
  });

  test('stopDrag should clean up all lock state', () => {
    const { TextBox, sandbox } = loadTextBox();
    const box = new TextBox(100, 100, 'test');
    
    sandbox.keyIsDown = (code) => code === 16;
    box.startDrag(100, 100);
    box.drag(150, 110);
    
    // Verify lock state exists
    expect(box._dragLockAxis).toBeDefined();
    expect(box._dragLockOriginX).toBeDefined();
    expect(box._dragLockOriginY).toBeDefined();
    
    box.stopDrag();
    
    // All lock state should be cleared
    expect(box._dragStartX).toBeUndefined();
    expect(box._dragStartY).toBeUndefined();
    expect(box._dragLockAxis).toBeUndefined();
    expect(box._dragLockOriginX).toBeUndefined();
    expect(box._dragLockOriginY).toBeUndefined();
  });

  test('multi-selection preserves relative offsets with Shift constraint', () => {
    const { TextBox, sandbox } = loadTextBox();
    const box1 = new TextBox(100, 100, 'box1');
    const box2 = new TextBox(200, 150, 'box2');
    
    sandbox.keyIsDown = (code) => code === 16;
    
    // Start drag on both boxes - clicking at their centers
    box1.startDrag(100, 100); // offset (0, 0)
    box2.startDrag(200, 150); // offset (0, 0)
    
    // Drag both - move mouse 50 units right and 5 units down
    // Box1: mouse at (150, 105) -> deltaX=50, deltaY=5 -> locks to X (horizontal)
    // Box2: mouse at (250, 155) -> deltaX=50, deltaY=5 -> locks to X (horizontal)
    box1.drag(150, 105);
    box2.drag(250, 155);
    
    // Both should lock to horizontal (Y locked to start)
    expect(box1.y).toBe(100);
    expect(box2.y).toBe(150);
    
    // X should move
    expect(box1.x).toBeCloseTo(150, 1);
    expect(box2.x).toBeCloseTo(250, 1);
    
    // Relative offset should be preserved (100 units horizontally, 50 vertically)
    expect(box2.x - box1.x).toBeCloseTo(100, 1);
    expect(box2.y - box1.y).toBe(50);
    
    box1.stopDrag();
    box2.stopDrag();
  });

  test('no constraint when Shift is not held', () => {
    const { TextBox, sandbox } = loadTextBox();
    const box = new TextBox(100, 100, 'test');
    
    // Shift not held
    sandbox.keyIsDown = (code) => false;
    box.startDrag(100, 100);
    
    // Drag diagonally
    box.drag(150, 130);
    
    // Should move freely in both axes
    expect(box.x).toBeCloseTo(150, 1);
    expect(box.y).toBeCloseTo(130, 1);
    
    // No lock state should be created
    expect(box._dragLockAxis).toBeUndefined();
    
    box.stopDrag();
  });
});
