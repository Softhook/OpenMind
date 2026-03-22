/**
 * Tests for continuous text block rendering in PDF export.
 *
 * Regression / new feature: boxes with no mixed formatting (no bold, italic, or
 * link ranges) should emit all wrapped lines as a single pdf.text() call whose
 * first argument is an array of strings.  This creates one BT/ET text block per
 * box in the PDF stream so that Adobe Illustrator (and other vector editors)
 * treats the whole text box as a single editable unit.
 *
 * Boxes that DO contain bold/italic/link formatting continue to use the
 * per-segment rendering path (unchanged behaviour).
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

function makePdfMock() {
  return {
    internal: { pageSize: { getWidth: () => 595, getHeight: () => 842 } },
    setDrawColor: jest.fn(),
    setLineWidth: jest.fn(),
    line: jest.fn(),
    setFillColor: jest.fn(),
    triangle: jest.fn(),
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
}

function makePgMock() {
  return {
    textSize: jest.fn(),
    // 8px per character so a ~176px-wide box wraps around 22 chars
    textWidth: jest.fn(str => (str ? str.length * 8 : 0)),
    remove: jest.fn(),
  };
}

async function runPdfExport(box, pdfMock) {
  window.jspdf = { jsPDF: jest.fn(() => pdfMock) };

  const pgMock = makePgMock();
  const p5Mock = { createGraphics: jest.fn(() => pgMock) };

  const em = new ExportManagerClass();
  em.initialize(p5Mock, { boxes: [box], connections: [] }, { EXPORT: { PADDING: 10 } });
  await em.exportPDF();

  return { pgMock };
}

// ---------------------------------------------------------------------------
// Uniform-style boxes (no bold / italic / link)
// ---------------------------------------------------------------------------

describe('PDF export – uniform-style box produces a single text object', () => {
  test('single-line box: pdf.text is called once with an array', async () => {
    const pdfMock = makePdfMock();
    const box = {
      id: 1, x: 100, y: 100, width: 200, height: 60,
      text: 'Hello world',
      fontSize: 14, padding: 12,
      backgroundColor: { r: 255, g: 255, b: 255 },
      imageUrl: null, boldRanges: [], italicRanges: [], highlights: [],
    };

    await runPdfExport(box, pdfMock);

    const textCalls = pdfMock.text.mock.calls;
    // Exactly one text call for the box content
    expect(textCalls).toHaveLength(1);
    // First argument must be an array (not a plain string)
    expect(Array.isArray(textCalls[0][0])).toBe(true);
    expect(textCalls[0][0]).toContain('Hello world');
  });

  test('multi-line box: pdf.text is called once with an array containing all lines', async () => {
    // With textWidth=8px/char and width=200 (padding=12 → maxWidth≈176≈22 chars per line),
    // a 50-char string will wrap to at least 3 lines.
    const pdfMock = makePdfMock();
    const longText = 'This is the first sentence. This is the second one.';
    const box = {
      id: 2, x: 100, y: 200, width: 200, height: 120,
      text: longText,
      fontSize: 14, padding: 12,
      backgroundColor: { r: 255, g: 255, b: 255 },
      imageUrl: null, boldRanges: [], italicRanges: [], highlights: [],
    };

    await runPdfExport(box, pdfMock);

    const textCalls = pdfMock.text.mock.calls;
    expect(textCalls).toHaveLength(1);
    expect(Array.isArray(textCalls[0][0])).toBe(true);
    // All characters of the original text must be present across lines
    const combined = textCalls[0][0].join('');
    expect(combined.replace(/\s+/g, ' ').trim()).toBe(longText.replace(/\s+/g, ' ').trim());
  });

  test('single pdf.text call uses lineHeightFactor matching LINE_HEIGHT_MULTIPLIER', async () => {
    const pdfMock = makePdfMock();
    const box = {
      id: 3, x: 100, y: 100, width: 300, height: 80,
      text: 'Line one\nLine two',
      fontSize: 14, padding: 12,
      backgroundColor: { r: 255, g: 255, b: 255 },
      imageUrl: null, boldRanges: [], italicRanges: [], highlights: [],
    };

    await runPdfExport(box, pdfMock);

    const textCalls = pdfMock.text.mock.calls;
    expect(textCalls).toHaveLength(1);
    const opts = textCalls[0][3];
    expect(opts).toBeDefined();
    expect(opts.lineHeightFactor).toBe(TextBox.LINE_HEIGHT_MULTIPLIER);
    expect(opts.baseline).toBe('middle');
  });
});

// ---------------------------------------------------------------------------
// Mixed-style boxes (bold / italic / link) — unchanged per-segment path
// ---------------------------------------------------------------------------

describe('PDF export – mixed-style box still uses per-segment rendering', () => {
  test('box with bold range: pdf.text is called multiple times (once per segment)', async () => {
    const pdfMock = makePdfMock();
    const box = {
      id: 4, x: 100, y: 100, width: 300, height: 60,
      text: 'Hello bold world',
      fontSize: 14, padding: 12,
      backgroundColor: { r: 255, g: 255, b: 255 },
      imageUrl: null,
      boldRanges: [{ start: 6, end: 10 }],   // 'bold' characters
      italicRanges: [],
      highlights: [],
    };

    await runPdfExport(box, pdfMock);

    // Multiple pdf.text() calls expected (at least one per distinct style segment)
    expect(pdfMock.text.mock.calls.length).toBeGreaterThan(1);
  });

  test('box with link: pdf.text is called multiple times', async () => {
    const pdfMock = makePdfMock();
    const box = {
      id: 5, x: 100, y: 100, width: 300, height: 60,
      text: 'See https://example.com for info',
      fontSize: 14, padding: 12,
      backgroundColor: { r: 255, g: 255, b: 255 },
      imageUrl: null, boldRanges: [], italicRanges: [], highlights: [],
    };

    await runPdfExport(box, pdfMock);

    expect(pdfMock.text.mock.calls.length).toBeGreaterThan(1);
  });
});
