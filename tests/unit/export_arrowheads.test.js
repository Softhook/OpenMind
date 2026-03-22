/**
 * Tests for correct arrowhead placement in PNG and PDF exports.
 *
 * Regression: arrowheads were drawn some distance away from the target box
 * because the arrow tip was offset 5px back from the box edge instead of
 * being placed exactly at the box edge.
 *
 * Correct behaviour (matches Connection.draw()):
 *  1. Arrow TIP is placed at the box-edge connection point (`end`).
 *  2. The line is SHORTENED by arrowSize so it does not poke through the head.
 */

global.TextBox = {
  URL_PATTERN: /(?:https?:\/\/|file:\/\/)[^\s<>"')\]]+|(?:\.{0,2}\/)[^\s<>"')\]]+/gi,
  FONT_SIZE: 14,
  PADDING: 12,
  LINE_HEIGHT_MULTIPLIER: 1.5,
  ITALIC_SHEAR_RADIANS: -0.24,
  BOLD_STROKE_WEIGHT: 0.8,
};
global.alert = jest.fn();
global.clearTimeout = jest.fn();
global.setTimeout = jest.fn(() => 0);

const ExportManagerClass = require('../../src/ExportManager');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a box-like object positioned so the connection goes purely rightward. */
function makeBoxPair() {
  // fromBox on the left, toBox on the right – connection runs left→right (angle=0).
  // getConnectionPoint returns the edge of the box facing the other box:
  //   fromBox right edge  = x + width/2 = 100 + 40 = 140
  //   toBox   left  edge  = x - width/2 = 300 - 40 = 260  (facing fromBox)
  const fromBox = {
    id: 'from',
    x: 100, y: 200, width: 80, height: 40,
    getConnectionPoint(other) { return { x: this.x + this.width / 2, y: this.y }; },
  };
  const toBox = {
    id: 'to',
    x: 300, y: 200, width: 80, height: 40,
    // Left edge (the side closest to fromBox) is the correct attachment point
    getConnectionPoint(other) { return { x: this.x - this.width / 2, y: this.y }; },
  };
  return { fromBox, toBox };
}

// ---------------------------------------------------------------------------
// PNG export – arrowhead placement
// ---------------------------------------------------------------------------

describe('PNG export – arrowhead placement', () => {
  let translateCalls, lineCalls, triangleCalls, pgMock;

  beforeEach(() => {
    translateCalls = [];
    lineCalls = [];
    triangleCalls = [];

    pgMock = {
      background: jest.fn(),
      push: jest.fn(),
      pop: jest.fn(),
      translate: jest.fn((...args) => { translateCalls.push(args); }),
      stroke: jest.fn(),
      strokeWeight: jest.fn(),
      noStroke: jest.fn(),
      fill: jest.fn(),
      rect: jest.fn(),
      line: jest.fn((...args) => { lineCalls.push(args); }),
      textSize: jest.fn(),
      textAlign: jest.fn(),
      textWidth: jest.fn(str => (str ? str.length * 8 : 0)),
      text: jest.fn(),
      image: jest.fn(),
      triangle: jest.fn((...args) => { triangleCalls.push(args); }),
      rotate: jest.fn(),
      shearX: jest.fn(),
      canvas: { toBlob: jest.fn(cb => cb(new Blob())) },
      remove: jest.fn(),
      LEFT: 'LEFT',
      CENTER: 'CENTER',
    };

    if (typeof URL.createObjectURL !== 'function') {
      URL.createObjectURL = jest.fn(() => 'blob:fake');
    } else {
      jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    }
    if (typeof URL.revokeObjectURL !== 'function') {
      URL.revokeObjectURL = jest.fn();
    } else {
      jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    }
  });

  function runExport(fromBox, toBox) {
    const conn = { fromBox, toBox };
    const em = new ExportManagerClass();
    const p5Mock = { createGraphics: jest.fn(() => pgMock) };

    // Add minimal box fields required by the drawing loop
    const boxes = [
      Object.assign({ text: '', fontSize: 14, padding: 12,
                      backgroundColor: { r: 255, g: 255, b: 255 },
                      imageUrl: null, boldRanges: [], italicRanges: [], highlights: [] }, fromBox),
      Object.assign({ text: '', fontSize: 14, padding: 12,
                      backgroundColor: { r: 255, g: 255, b: 255 },
                      imageUrl: null, boldRanges: [], italicRanges: [], highlights: [] }, toBox),
    ];

    em.initialize(p5Mock, { boxes, connections: [conn] }, { EXPORT: { PADDING: 10 } });
    em.exportPNG();
  }

  test('arrow tip translate lands at the box-edge connection point, not offset by 5px', () => {
    const { fromBox, toBox } = makeBoxPair();
    const end = toBox.getConnectionPoint(fromBox);  // { x: 260, y: 200 }

    runExport(fromBox, toBox);

    // The translate after the first global one (padding offset) should go to `end`
    const arrowTranslates = translateCalls.filter(
      ([tx, ty]) => Math.abs(tx - end.x) < 1 && Math.abs(ty - end.y) < 1
    );
    expect(arrowTranslates.length).toBeGreaterThan(0);
  });

  test('connection line is shortened so it does not extend beyond the arrowhead tip', () => {
    const { fromBox, toBox } = makeBoxPair();
    const end = toBox.getConnectionPoint(fromBox);  // { x: 260, y: 200 }
    const arrowSize = 10;

    runExport(fromBox, toBox);

    // The line call should NOT have an endpoint equal to end (un-shortened)
    const lineToEnd = lineCalls.filter(
      ([,, x2, y2]) => Math.abs(x2 - end.x) < 1 && Math.abs(y2 - end.y) < 1
    );
    expect(lineToEnd.length).toBe(0);

    // The line endpoint should be shortened by arrowSize in the direction of travel
    const angle = 0; // left→right, cos=1 sin=0
    const expectedX2 = end.x - Math.cos(angle) * arrowSize;
    const expectedY2 = end.y - Math.sin(angle) * arrowSize;

    const shortenedLine = lineCalls.filter(
      ([,, x2, y2]) => Math.abs(x2 - expectedX2) < 1 && Math.abs(y2 - expectedY2) < 1
    );
    expect(shortenedLine.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// PDF export – arrowhead placement
// ---------------------------------------------------------------------------

describe('PDF export – arrowhead placement', () => {
  let lineCalls, triangleCalls, pdfMock;

  beforeEach(() => {
    lineCalls = [];
    triangleCalls = [];

    pdfMock = {
      internal: { pageSize: { getWidth: () => 595, getHeight: () => 842 } },
      setDrawColor: jest.fn(),
      setLineWidth: jest.fn(),
      line: jest.fn((...args) => { lineCalls.push(args); }),
      setFillColor: jest.fn(),
      triangle: jest.fn((...args) => { triangleCalls.push(args); }),
      setFontSize: jest.fn(),
      setTextColor: jest.fn(),
      setFont: jest.fn(),
      text: jest.fn(),
      rect: jest.fn(),
      addImage: jest.fn(),
      getTextWidth: jest.fn(str => (str ? str.length * 6 : 0)),
      link: jest.fn(),
      save: jest.fn(),
    };

    window.jspdf = { jsPDF: jest.fn(() => pdfMock) };
  });

  async function runExport(fromBox, toBox) {
    const conn = { fromBox, toBox };
    const pgMock = {
      textSize: jest.fn(),
      textWidth: jest.fn(str => (str ? str.length * 8 : 0)),
      remove: jest.fn(),
    };
    const p5Mock = { createGraphics: jest.fn(() => pgMock) };

    const boxes = [
      Object.assign({ text: '', fontSize: 14, padding: 12,
                      backgroundColor: { r: 255, g: 255, b: 255 },
                      imageUrl: null, boldRanges: [], italicRanges: [], highlights: [] }, fromBox),
      Object.assign({ text: '', fontSize: 14, padding: 12,
                      backgroundColor: { r: 255, g: 255, b: 255 },
                      imageUrl: null, boldRanges: [], italicRanges: [], highlights: [] }, toBox),
    ];

    const em = new ExportManagerClass();
    em.initialize(p5Mock, { boxes, connections: [conn] }, { EXPORT: { PADDING: 10 } });
    await em.exportPDF();
  }

  test('arrow tip (first triangle vertex) is at the scaled box-edge connection point', async () => {
    const { fromBox, toBox } = makeBoxPair();

    await runExport(fromBox, toBox);

    expect(triangleCalls.length).toBeGreaterThan(0);

    // The first argument to pdf.triangle() is x1 – the arrow tip.
    // It must equal the scaled & offset position of `end`.
    // We don't know the exact scale/offset chosen by the exporter, but we can
    // verify the triangle tip is NOT 5 pixels before it by checking that the
    // tip x coordinate is NOT equal to (x2 - 5) where x2 is the last line endpoint.

    // `lineCalls` contains the connection line call; its endpoint is the shortened end.
    // The triangle tip should be BEYOND that (i.e., closer to the box).
    if (lineCalls.length > 0) {
      const [,, lineX2, lineY2] = lineCalls[0];
      const [tipX, tipY] = triangleCalls[0];
      // Tip must be further along the direction of travel than the line end
      expect(tipX).toBeGreaterThan(lineX2 - 1);
    }
  });

  test('connection line endpoint is shortened, not reaching the box edge', async () => {
    const { fromBox, toBox } = makeBoxPair();

    await runExport(fromBox, toBox);

    expect(lineCalls.length).toBeGreaterThan(0);
    expect(triangleCalls.length).toBeGreaterThan(0);

    // Triangle first vertex is the arrow tip (at box edge).
    // Line x2 must be strictly less than tip x (for a rightward connection).
    const [,, lineX2] = lineCalls[0];
    const [tipX] = triangleCalls[0];
    expect(lineX2).toBeLessThan(tipX);
  });
});
