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

describe('TextBox resize with URL text', () => {
  test('URL in text does not force box width to URL length during resize', () => {
    const TextBox = loadTextBox();
    // Use a URL that is much wider than minWidth
    const url = 'https://www.example.com/some/very/long/path/that/exceeds/minimum';
    const box = new TextBox(200, 200, url);
    // Give the box an initial size larger than minWidth
    box.width = 400;
    box.height = 60;

    // Start a resize from the current bottom-right corner
    const startMx = box.x + box.width / 2;
    const startMy = box.y + box.height / 2;
    box.startResize(startMx, startMy);

    // Drag so that rawWidth would be box.minWidth (i.e. shrink significantly)
    const targetWidth = box.minWidth;
    const newMx = box.resizeStartLeft + targetWidth;
    box.resize(newMx, startMy);

    // The box width should be capped at minWidth (not the URL text width)
    expect(box.width).toBe(box.minWidth);
  });

  test('non-URL long word still constrains minimum width during resize', () => {
    const TextBox = loadTextBox();
    // A single long word (not a URL) — should still prevent shrinking below its width
    const longWord = 'superlongwordwithoutspaces';
    const box = new TextBox(200, 200, longWord);
    box.width = 400;
    box.height = 60;

    const startMx = box.x + box.width / 2;
    const startMy = box.y + box.height / 2;
    box.startResize(startMx, startMy);

    // Try to shrink to minWidth — should be blocked by the word width
    const targetWidth = box.minWidth;
    const newMx = box.resizeStartLeft + targetWidth;
    box.resize(newMx, startMy);

    const expectedWordWidth = longWord.length * 8 + box.padding * 2; // textWidth mock: length*8
    expect(box.width).toBeGreaterThan(box.minWidth);
    expect(box.width).toBe(expectedWordWidth);
  });

  test('URL with leading punctuation does not force box width during resize', () => {
    const TextBox = loadTextBox();
    // Token includes a leading parenthesis — the pattern should still detect it as a URL
    const url = '(https://www.example.com/some/very/long/path/that/exceeds/minimum)';
    const box = new TextBox(200, 200, url);
    box.width = 400;
    box.height = 60;

    const startMx = box.x + box.width / 2;
    const startMy = box.y + box.height / 2;
    box.startResize(startMx, startMy);

    const targetWidth = box.minWidth;
    const newMx = box.resizeStartLeft + targetWidth;
    box.resize(newMx, startMy);

    expect(box.width).toBe(box.minWidth);
  });

  test('uppercase URL scheme does not force box width during resize', () => {
    const TextBox = loadTextBox();
    const url = 'HTTPS://www.example.com/some/very/long/path/that/exceeds/minimum';
    const box = new TextBox(200, 200, url);
    box.width = 400;
    box.height = 60;

    const startMx = box.x + box.width / 2;
    const startMy = box.y + box.height / 2;
    box.startResize(startMx, startMy);

    const targetWidth = box.minWidth;
    const newMx = box.resizeStartLeft + targetWidth;
    box.resize(newMx, startMy);

    expect(box.width).toBe(box.minWidth);
  });
});

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

  test('does not split grapheme emoji clusters when wrapping long words', () => {
    const TextBox = loadTextBox();
    const box = new TextBox(0, 0, '');
    box.width = 12;
    box.padding = 0;

    expect(box.wrapText('🏴‍☠️')).toEqual(['🏴‍☠️']);
    expect(box.cachedLineCharMap).toEqual([0]);
  });
});
