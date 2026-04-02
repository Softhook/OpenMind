const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadTextBox() {
  const code = fs.readFileSync(path.join(__dirname, '../../src/TextBox.js'), 'utf8');

  const sandbox = {
    ColorPalette: {
      getBoxBackgroundPalette: () => [],
      TEXTBOX: {},
      TEXTBOX_STROKES: { EDITING: {} }
    },
    Utils: {
      generateUUID: () => 'uuid-1',
      sanitizeText: (t) => (t == null ? '' : String(t)),
      getClampedZoomFactor: () => 1
    },
    textSize: () => {},
    textWidth: (txt) => (txt ? txt.length * 8 : 0),
    max: Math.max,
    min: Math.min,
    push: () => {},
    pop: () => {},
    noStroke: () => {},
    fill: () => {},
    rect: () => {},
    stroke: () => {},
    strokeWeight: () => {},
    line: () => {},
    millis: () => 0,
    loadImage: () => {}
  };

  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'TextBox.js' });
  return sandbox.TextBox;
}

describe('TextBox wrapText', () => {
  test('does not duplicate trailing spaces when a full line wraps', () => {
    const TextBox = loadTextBox();
    const box = new TextBox(0, 0, '');
    box.width = 24;
    box.padding = 0;

    expect(box.wrapText('abc   ')).toEqual(['abc', '   ']);
    expect(box.cachedLineCharMap).toEqual([0, 3]);
  });

  test('wraps long trailing space runs without duplicating characters', () => {
    const TextBox = loadTextBox();
    const box = new TextBox(0, 0, '');
    box.width = 24;
    box.padding = 0;

    expect(box.wrapText('abc    ')).toEqual(['abc', '   ', ' ']);
    expect(box.cachedLineCharMap).toEqual([0, 3, 6]);
  });

  test('caches by the requested text, not only by box.text', () => {
    const TextBox = loadTextBox();
    const box = new TextBox(0, 0, 'unchanged');
    box.width = 16;
    box.padding = 0;

    expect(box.wrapText('aa bb')).toEqual(['aa', 'bb']);
    expect(box.wrapText('zzzz')).toEqual(['zz', 'zz']);
    expect(box.cachedLineCharMap).toEqual([0, 2]);
  });
});
