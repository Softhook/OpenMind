const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadTextBox() {
  const code = fs.readFileSync(path.join(__dirname, '../../src/TextBox.js'), 'utf8');

  // Minimal sandbox to satisfy TextBox dependencies
  // ColorPalette is loaded globally by tests/setup.js
  const sandbox = {
    ColorPalette: global.ColorPalette,
    Utils: {
      generateUUID: () => 'uuid-1',
      sanitizeText: (t) => (t == null ? '' : String(t)),
      getClampedZoomFactor: () => 1
    },
    // p5-style helpers needed by TextBox sizing
    textSize: () => {},
    textWidth: (txt) => (txt ? txt.length * 8 : 0), // simple deterministic width
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
    millis: () => 0
  };

  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'TextBox.js' });
  return sandbox.TextBox;
}

describe('TextBox top-left anchoring on text shrink', () => {
  test('updateDimensions keeps top-left fixed when text height shrinks', () => {
    const TextBox = loadTextBox();
    const box = new TextBox(100, 100, 'hello\nworld');

    box.updateDimensions();
    const beforeLeft = box.x - box.width / 2;
    const beforeTop = box.y - box.height / 2;
    const beforeHeight = box.height;

    // Simulate deleting a line of text
    box.text = 'hello';
    box.updateDimensions();

    const afterLeft = box.x - box.width / 2;
    const afterTop = box.y - box.height / 2;
    const afterHeight = box.height;

    expect(afterHeight).toBeLessThan(beforeHeight); // height should shrink
    expect(afterLeft).toBeCloseTo(beforeLeft, 6);
    expect(afterTop).toBeCloseTo(beforeTop, 6);
  });

  test('adding and removing a newline keeps top-left fixed', () => {
    const TextBox = loadTextBox();
    const box = new TextBox(200, 200, 'line1');

    box.updateDimensions();
    const initialLeft = box.x - box.width / 2;
    const initialTop = box.y - box.height / 2;
    const initialTargetX = box.targetX;
    const initialTargetY = box.targetY;

    // Add a newline (simulate Enter)
    box.text = 'line1\nline2';
    box.updateDimensions();
    const afterAddLeft = box.x - box.width / 2;
    const afterAddTop = box.y - box.height / 2;
    expect(box.targetX).toBeCloseTo(box.x, 6);
    expect(box.targetY).toBeCloseTo(box.y, 6);

    expect(afterAddLeft).toBeCloseTo(initialLeft, 6);
    expect(afterAddTop).toBeCloseTo(initialTop, 6);

    // Remove the newline (simulate deleting the second line)
    box.text = 'line1';
    box.updateDimensions();
    const afterDeleteLeft = box.x - box.width / 2;
    const afterDeleteTop = box.y - box.height / 2;

    expect(afterDeleteLeft).toBeCloseTo(initialLeft, 6);
    expect(afterDeleteTop).toBeCloseTo(initialTop, 6);
    expect(box.targetX).toBeCloseTo(box.x, 6);
    expect(box.targetY).toBeCloseTo(box.y, 6);
    // Ensure targets track initial anchor too
    expect(initialTargetX).toBeCloseTo(box.targetX, 6);
    expect(initialTargetY).toBeCloseTo(box.targetY, 6);
  });
});
