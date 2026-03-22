/**
 * Tests for correct arrowhead placement in PNG and PDF exports.
 *
 * Regression: arrowheads were drawn some distance away from the target box
 * because the arrow tip was offset 5px back from the box edge instead of
 * being placed exactly at the box edge.
 *
 * Correct behaviour (matches Connection.draw() placement logic):
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
      roundedRect: jest.fn(),
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
    expect(lineCalls.length).toBeGreaterThan(0);

    // Replicate the ExportManager scale/offset calculation so we can derive the
    // exact scaled coordinates of the connection `end` point (toBox left edge).
    //
    // boxes: fromBox x=100,y=200,w=80,h=40  toBox x=300,y=200,w=80,h=40
    // bounds: minX=60, maxX=340, minY=180, maxY=220  (box half-widths/heights)
    // padding=10, margin=20 (default)
    const exportPadding = 10;
    const margin = 20;
    const bounds = {
      minX: fromBox.x - fromBox.width / 2,   // 60
      maxX: toBox.x   + toBox.width  / 2,    // 340
      minY: fromBox.y - fromBox.height / 2,  // 180
      maxY: fromBox.y + fromBox.height / 2,  // 220
    };
    const contentWidth  = bounds.maxX - bounds.minX + 2 * exportPadding;   // 300
    const contentHeight = bounds.maxY - bounds.minY + 2 * exportPadding;   // 60
    const pageWidth  = 595 - 2 * margin;  // 555  (mock getWidth() = 595)
    const pageHeight = 842 - 2 * margin;  // 802  (mock getHeight() = 842)
    const scale = Math.min(pageWidth / contentWidth, pageHeight / contentHeight);
    const offsetX = margin - bounds.minX * scale + exportPadding * scale;
    const offsetY = margin - bounds.minY * scale + exportPadding * scale;

    // The end point is the toBox left edge
    const end = toBox.getConnectionPoint(fromBox);
    const expectedTipX = end.x * scale + offsetX;
    const expectedTipY = end.y * scale + offsetY;

    const [tipX, tipY] = triangleCalls[0];
    expect(tipX).toBeCloseTo(expectedTipX, 1);
    expect(tipY).toBeCloseTo(expectedTipY, 1);
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
