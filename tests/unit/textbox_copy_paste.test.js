const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadTextBox() {
  const code = fs.readFileSync(path.join(__dirname, '../../src/TextBox.js'), 'utf8');

  // Minimal sandbox to satisfy TextBox dependencies
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
    // p5-style helpers
    textSize: () => {},
    textWidth: (txt) => (txt ? txt.length * 8 : 0),
    max: Math.max,
    min: Math.min,
    constrain: (val, low, high) => Math.max(low, Math.min(high, val)),
    dist: (x1, y1, x2, y2) => Math.sqrt((x2-x1)**2 + (y2-y1)**2),
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

describe('TextBox Formatted Copy-Paste', () => {
  let TextBox;

  beforeAll(() => {
    TextBox = loadTextBox();
  });

  test('getFormattedSelection correctly extracts text and relative ranges', () => {
    const box = new TextBox(0, 0, 'Hello World');
    // Mock selection of "World" (index 6 to 11)
    box.selectionStart = 6;
    box.selectionEnd = 11;
    
    // Add some formatting
    box.boldRanges = [{ start: 0, end: 5 }, { start: 6, end: 11 }]; // "Hello" and "World" are bold
    box.highlights = [{ start: 8, end: 11, color: { r: 255, g: 0, b: 0 } }]; // "rld" is highlighted
    
    const result = box.getFormattedSelection();
    expect(result.text).toBe('World');
    
    // Relative ranges should be [0, 5] for bold and [2, 5] for highlight
    expect(result.metadata.boldRanges).toEqual([{ start: 0, end: 5 }]);
    expect(result.metadata.highlights).toEqual([{ start: 2, end: 5, color: { r: 255, g: 0, b: 0 } }]);
    expect(result.metadata.italicRanges).toEqual([]);
  });

  test('pasteFormattedText correctly inserts and applies formatting', () => {
    const box = new TextBox(0, 0, 'Start End');
    box.cursorPosition = 6; // After "Start "
    
    const metadata = {
      boldRanges: [{ start: 0, end: 5 }],
      highlights: [{ start: 0, end: 2, color: { r: 0, g: 255, b: 0 } }],
      italicRanges: []
    };
    
    box.pasteFormattedText('Middl', metadata);
    
    expect(box.text).toBe('Start MiddlEnd');
    // "Middl" should be bold at [6, 11]
    expect(box.boldRanges).toContainEqual({ start: 6, end: 11 });
    // "Mi" should be highlighted at [6, 8]
    expect(box.highlights).toContainEqual({ start: 6, end: 8, color: { r: 0, g: 255, b: 0 } });
  });

  test('pasteFormattedText handles invalid or malformed metadata gracefully', () => {
    const box = new TextBox(0, 0, 'Start End');
    box.cursorPosition = 6;
    
    const metadata = {
      highlights: [
        { start: -10, end: 2, color: { r: 0, g: 0, b: 0 } }, // negative start
        { start: 2, end: 100, color: { r: 1, g: 1, b: 1 } }, // end past text length
        { start: 5, end: 2 }, // end < start
        null, // null entry
        { start: 'nan', end: 2 } // non-number
      ],
      boldRanges: []
    };
    
    box.pasteFormattedText('ABC', metadata);
    
    // Result: "Start ABCEnd" (text length 12)
    // -10+6 = -4 -> clamped to 0. 2+6 = 8. Result [0, 8]
    // 2+6 = 8. 100+6 = 106 -> clamped to 12. Result [8, 12]
    // Others should be ignored
    expect(box.highlights).toContainEqual({ start: 0, end: 8, color: { r: 0, g: 0, b: 0 } });
    expect(box.highlights).toContainEqual({ start: 8, end: 12, color: { r: 1, g: 1, b: 1 } });
    expect(box.highlights.length).toBe(2);
  });

  test('pasteFormattedText replaces selection and shifts existing formatting', () => {
    const box = new TextBox(0, 0, 'ABCDEFG');
    box.boldRanges = [{ start: 4, end: 7 }]; // "EFG" is bold
    
    // Select "CD" (index 2 to 4)
    box.selectionStart = 2;
    box.selectionEnd = 4;
    
    const metadata = {
      boldRanges: [{ start: 0, end: 2 }],
      highlights: [],
      italicRanges: []
    };
    
    box.pasteFormattedText('123', metadata);
    
    // Result should be "AB123EFG"
    // "12" from metadata should be bold at [2, 4]
    // Original "EFG" shifted by +1 (replacement of 2 chars with 3 chars) -> [5, 8]
    expect(box.text).toBe('AB123EFG');
    expect(box.boldRanges).toContainEqual({ start: 2, end: 4 });
    expect(box.boldRanges).toContainEqual({ start: 5, end: 8 });
  });
});
