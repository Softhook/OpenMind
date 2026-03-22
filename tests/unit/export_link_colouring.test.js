/**
 * Tests for ExportManager link colouring and clickable PDF URL annotations.
 *
 * Covers:
 *  - detectLinksInText() – identifies URLs and their character ranges
 *  - getLinkAtIndex()    – looks up which link (if any) owns a character position
 *  - PNG export: link characters receive LINK_TEXT colour
 *  - PDF export: link segments get coloured text + pdf.link() annotations,
 *    including multi-line URLs where the annotation spans every wrapped line
 */

// Set up globals that ExportManager relies on at require() time.
// ColorPalette is already in global scope via tests/setup.js.
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

/** Returns a fresh ExportManager instance (no p5/mindMap yet) */
function makeEM() {
  return new ExportManagerClass();
}

// ── detectLinksInText ──────────────────────────────────────────────────────

describe('ExportManager.detectLinksInText', () => {
  let em;
  beforeEach(() => { em = makeEM(); });

  test('returns empty array for null / empty text', () => {
    expect(em.detectLinksInText(null)).toEqual([]);
    expect(em.detectLinksInText('')).toEqual([]);
  });

  test('detects a simple https URL', () => {
    const links = em.detectLinksInText('Visit https://example.com for more.');
    expect(links).toHaveLength(1);
    expect(links[0].url).toBe('https://example.com');
    expect(links[0].start).toBe(6);
    expect(links[0].end).toBe(6 + 'https://example.com'.length);
  });

  test('strips trailing punctuation from detected URLs', () => {
    const links = em.detectLinksInText('See https://example.com/path.');
    expect(links[0].url).toBe('https://example.com/path');
  });

  test('detects multiple URLs in the same text', () => {
    const text = 'Go to https://a.com or https://b.org today.';
    const links = em.detectLinksInText(text);
    expect(links).toHaveLength(2);
    expect(links[0].url).toBe('https://a.com');
    expect(links[1].url).toBe('https://b.org');
  });

  test('detects http:// URLs', () => {
    const links = em.detectLinksInText('http://insecure.example.com');
    expect(links).toHaveLength(1);
    expect(links[0].url).toBe('http://insecure.example.com');
  });

  test('returns empty array when there are no URLs', () => {
    expect(em.detectLinksInText('Just plain text here.')).toEqual([]);
  });
});

// ── getLinkAtIndex ─────────────────────────────────────────────────────────

describe('ExportManager.getLinkAtIndex', () => {
  let em;
  beforeEach(() => { em = makeEM(); });

  const links = [
    { start: 5, end: 15, url: 'https://a.com' },
    { start: 20, end: 35, url: 'https://b.org' },
  ];

  test('returns null for index before any link', () => {
    expect(em.getLinkAtIndex(links, 0)).toBeNull();
    expect(em.getLinkAtIndex(links, 4)).toBeNull();
  });

  test('returns the correct link for index inside first link', () => {
    expect(em.getLinkAtIndex(links, 5)).toEqual(links[0]);
    expect(em.getLinkAtIndex(links, 14)).toEqual(links[0]);
  });

  test('returns null for index at the end boundary of a link', () => {
    expect(em.getLinkAtIndex(links, 15)).toBeNull();
  });

  test('returns the correct link for index inside second link', () => {
    expect(em.getLinkAtIndex(links, 20)).toEqual(links[1]);
    expect(em.getLinkAtIndex(links, 34)).toEqual(links[1]);
  });

  test('returns null for index after all links', () => {
    expect(em.getLinkAtIndex(links, 40)).toBeNull();
  });

  test('returns null for empty links array', () => {
    expect(em.getLinkAtIndex([], 5)).toBeNull();
  });

  test('returns null for null links argument', () => {
    expect(em.getLinkAtIndex(null, 5)).toBeNull();
  });
});

// ── PNG export: link colour ────────────────────────────────────────────────

describe('PNG export – link colour', () => {
  /**
   * The PNG rendering loop calls pg.fill(r,g,b) for link chars and
   * pg.fill(0) for plain-text chars.  We verify the correct colour is used.
   */

  const LINK_COLOR = require('../../src/ColorPalette').TEXTBOX.LINK_TEXT;
  let fillCalls;

  beforeEach(() => {
    fillCalls = [];

    const pgMock = {
      background: jest.fn(),
      push: jest.fn(),
      pop: jest.fn(),
      translate: jest.fn(),
      stroke: jest.fn(),
      strokeWeight: jest.fn(),
      noStroke: jest.fn(),
      fill: jest.fn((...args) => { fillCalls.push(args); }),
      rect: jest.fn(),
      line: jest.fn(),
      textSize: jest.fn(),
      textAlign: jest.fn(),
      textWidth: jest.fn(str => (str ? str.length * 8 : 0)),
      text: jest.fn(),
      image: jest.fn(),
      triangle: jest.fn(),
      rotate: jest.fn(),
      shearX: jest.fn(),
      canvas: { toBlob: jest.fn(cb => cb(new Blob())) },
      remove: jest.fn(),
      LEFT: 'LEFT',
      CENTER: 'CENTER',
    };

    const p5Mock = { createGraphics: jest.fn(() => pgMock) };

    // Stub URL blob APIs that jsdom doesn't provide by default so that
    // the download portion of exportPNG() doesn't throw.
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

    const box = {
      id: 1,
      x: 100, y: 100, width: 200, height: 60,
      text: 'Visit https://example.com now',
      fontSize: 14,
      padding: 12,
      backgroundColor: { r: 255, g: 255, b: 255 },
      imageUrl: null,
      boldRanges: [],
      italicRanges: [],
      highlights: [],
    };

    const em = makeEM();
    em.initialize(p5Mock, { boxes: [box], connections: [] }, { EXPORT: { PADDING: 10 } });
    em.exportPNG();
  });

  test('link characters use LINK_TEXT fill colour', () => {
    const linkFills = fillCalls.filter(
      args => args[0] === LINK_COLOR.r && args[1] === LINK_COLOR.g && args[2] === LINK_COLOR.b
    );
    expect(linkFills.length).toBeGreaterThan(0);
  });

  test('non-link characters use black fill (0)', () => {
    const blackFills = fillCalls.filter(args => args.length === 1 && args[0] === 0);
    expect(blackFills.length).toBeGreaterThan(0);
  });
});

// ── PDF export: link colour + clickable annotations ────────────────────────

describe('PDF export – link colour and clickable annotations', () => {
  const LINK_COLOR = require('../../src/ColorPalette').TEXTBOX.LINK_TEXT;
  let pdfMock;
  let em;

  /** Build a fresh pdfMock + ExportManager configured with the given box */
  function setup(box) {
    const linkCalls = [];
    const textColorCalls = [];

    pdfMock = {
      internal: { pageSize: { getWidth: () => 595, getHeight: () => 842 } },
      setDrawColor: jest.fn(),
      setLineWidth: jest.fn(),
      line: jest.fn(),
      setFillColor: jest.fn(),
      triangle: jest.fn(),
      setFontSize: jest.fn(),
      setTextColor: jest.fn((...args) => { textColorCalls.push(args); }),
      setFont: jest.fn(),
      text: jest.fn(),
      rect: jest.fn(),
      roundedRect: jest.fn(),
      addImage: jest.fn(),
      getTextWidth: jest.fn(str => (str ? str.length * 6 : 0)),
      link: jest.fn((...args) => { linkCalls.push(args); }),
      save: jest.fn(),
    };

    // In jsdom window is the global — set jspdf directly on it so ExportManager finds it.
    window.jspdf = { jsPDF: jest.fn(() => pdfMock) };

    const pgMock = {
      textSize: jest.fn(),
      textWidth: jest.fn(str => (str ? str.length * 8 : 0)),
      remove: jest.fn(),
    };
    const p5Mock = { createGraphics: jest.fn(() => pgMock) };

    em = makeEM();
    em.initialize(p5Mock, { boxes: [box], connections: [] }, { EXPORT: { PADDING: 10 } });

    return { linkCalls, textColorCalls };
  }

  test('setTextColor is called with LINK_TEXT colour for link segments', async () => {
    const box = {
      id: 1, x: 100, y: 100, width: 300, height: 80,
      text: 'Go to https://example.com/path now',
      fontSize: 14, padding: 12,
      backgroundColor: { r: 255, g: 255, b: 255 },
      imageUrl: null, boldRanges: [], italicRanges: [], highlights: [],
    };
    const { textColorCalls } = setup(box);
    await em.exportPDF();

    const linkColorCalls = textColorCalls.filter(
      args => args[0] === LINK_COLOR.r && args[1] === LINK_COLOR.g && args[2] === LINK_COLOR.b
    );
    expect(linkColorCalls.length).toBeGreaterThan(0);
  });

  test('pdf.link() is called with the correct URL for link segments', async () => {
    const url = 'https://example.com/path';
    const box = {
      id: 1, x: 100, y: 100, width: 300, height: 80,
      text: `Go to ${url} now`,
      fontSize: 14, padding: 12,
      backgroundColor: { r: 255, g: 255, b: 255 },
      imageUrl: null, boldRanges: [], italicRanges: [], highlights: [],
    };
    const { linkCalls } = setup(box);
    await em.exportPDF();

    const urlAnnotations = linkCalls.filter(args => args[4] && args[4].url === url);
    expect(urlAnnotations.length).toBeGreaterThan(0);
  });

  test('multi-line URL produces pdf.link() annotations on every wrapped line', async () => {
    // Mock textWidth returns 8px per char. With width=200, padding=12 on each side,
    // maxTextWidth ≈ 176px → about 22 chars per line. Use a URL longer than 44 chars
    // (two lines) so it wraps and each line segment gets its own annotation.
    const longUrl = 'https://example.com/' + 'x'.repeat(60);
    const box = {
      id: 2, x: 100, y: 200, width: 200, height: 120,
      text: longUrl,
      fontSize: 14, padding: 12,
      backgroundColor: { r: 255, g: 255, b: 255 },
      imageUrl: null, boldRanges: [], italicRanges: [], highlights: [],
    };
    const { linkCalls } = setup(box);
    await em.exportPDF();

    // Every wrapped line of the URL should produce a separate pdf.link() call.
    const urlAnnotations = linkCalls.filter(args => args[4] && args[4].url === longUrl);
    expect(urlAnnotations.length).toBeGreaterThanOrEqual(2);
  });
});
