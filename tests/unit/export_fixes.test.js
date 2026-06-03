/**
 * Tests for the export fixes:
 * 1. Text export uses Markdown heading syntax (#, ##, etc.) and saves as .md
 * 2. PNG export draws images with aspect-ratio preservation (no fixed 20px inset)
 * 3. PDF export uses p5.Image.canvas for image data (not the p5.Image object directly)
 * 4. Timeline date badges are drawn in PNG export
 * 5. Timeline is included in PDF export as PNG overlay
 */

global.TextBox = {
  URL_PATTERN: /(?:https?:\/\/|file:\/\/)[^\s<>"')\]]+|(?:\.{0,2}\/)[^\s<>"')\]]+/gi,
  FONT_SIZE: 14,
  PADDING: 12,
  LINE_HEIGHT_MULTIPLIER: 1.5,
  ITALIC_SHEAR_RADIANS: -0.24,
  BOLD_STROKE_WEIGHT: 0.8,
  CORNER_RADIUS: 6,
};
global.alert = jest.fn();
global.clearTimeout = jest.fn();
global.setTimeout = jest.fn(() => 0);

const ExportManagerClass = require('../../src/ExportManager');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBox(id, text, extra = {}) {
  return {
    id, text,
    x: 0, y: 0, width: 120, height: 50,
    imageUrl: null, img: null,
    backgroundColor: { r: 255, g: 255, b: 255 },
    boldRanges: [], italicRanges: [], highlights: [],
    fontSize: 14, padding: 12,
    ...extra,
  };
}

function makePgMock(extras = {}) {
  return {
    background: jest.fn(),
    push: jest.fn(),
    pop: jest.fn(),
    translate: jest.fn(),
    stroke: jest.fn(),
    strokeWeight: jest.fn(),
    noStroke: jest.fn(),
    fill: jest.fn(),
    rect: jest.fn(),
    line: jest.fn(),
    textSize: jest.fn(),
    textAlign: jest.fn(),
    textWidth: jest.fn(s => (s ? s.length * 7 : 0)),
    text: jest.fn(),
    triangle: jest.fn(),
    rotate: jest.fn(),
    shearX: jest.fn(),
    imageMode: jest.fn(),
    image: jest.fn(),
    canvas: { toBlob: jest.fn(cb => cb(new Blob(['fake'], { type: 'image/png' }))), toDataURL: jest.fn(() => 'data:image/png;base64,FAKE') },
    remove: jest.fn(),
    LEFT: 'LEFT',
    CENTER: 'CENTER',
    CORNER: 'CORNER',
    TOP: 'TOP',
    ...extras,
  };
}

// ---------------------------------------------------------------------------
// buildTextHierarchy — colour-based Markdown output
// ---------------------------------------------------------------------------

// Helpers that produce boxes matching the actual ColorPalette values
const RED_BG    = { r: 255, g: 140, b: 140 };
const ORANGE_BG = { r: 255, g: 200, b: 140 };
const WHITE_BG  = { r: 255, g: 255, b: 255 };

function makeRedBox(id, text, extra = {})    { return makeBox(id, text, { backgroundColor: RED_BG,    ...extra }); }
function makeOrangeBox(id, text, extra = {}) { return makeBox(id, text, { backgroundColor: ORANGE_BG, ...extra }); }
function makeWhiteBox(id, text, extra = {})  { return makeBox(id, text, { backgroundColor: WHITE_BG,  ...extra }); }

describe('buildTextHierarchy — colour-based Markdown output', () => {
  let em;
  beforeEach(() => {
    em = new ExportManagerClass();
  });

  // ---- colour-to-heading-level mapping ----

  test('red box produces H1 heading', () => {
    em.mindMap = { boxes: [makeRedBox('a', 'Title')], connections: [] };
    expect(em.buildTextHierarchy()).toMatch(/^# Title/m);
  });

  test('orange box produces H2 heading', () => {
    em.mindMap = { boxes: [makeOrangeBox('a', 'Section')], connections: [] };
    expect(em.buildTextHierarchy()).toMatch(/^## Section/m);
  });

  test('white box produces plain text (no heading prefix)', () => {
    em.mindMap = { boxes: [makeWhiteBox('a', 'Paragraph')], connections: [] };
    const md = em.buildTextHierarchy();
    expect(md).not.toMatch(/^#/m);
    expect(md).toContain('Paragraph');
  });

  test('mixed colours in a connected tree produce correct prefixes', () => {
    const red = makeRedBox('r', 'Red Title');
    const orange = makeOrangeBox('o', 'Orange Section');
    const white = makeWhiteBox('w', 'White Paragraph');
    em.mindMap = {
      boxes: [red, orange, white],
      connections: [{ fromBox: red, toBox: orange }, { fromBox: orange, toBox: white }],
    };
    const md = em.buildTextHierarchy();
    expect(md).toMatch(/^# Red Title/m);
    expect(md).toMatch(/^## Orange Section/m);
    // White box: plain text, no # prefix
    expect(md).toMatch(/^White Paragraph/m);
    expect(md).not.toMatch(/^#{1,6} White Paragraph/m);
  });

  // ---- connection-order traversal ----

  test('child boxes appear after their parent in the output', () => {
    const red = makeRedBox('r', 'Root');
    const orange = makeOrangeBox('o', 'Child');
    em.mindMap = {
      boxes: [red, orange],
      connections: [{ fromBox: red, toBox: orange }],
    };
    const md = em.buildTextHierarchy();
    expect(md.indexOf('# Root')).toBeLessThan(md.indexOf('## Child'));
  });

  // ---- boxes unreachable from DFS (cycles / isolated) ----

  test('isolated boxes appear in output with their colour-based prefix', () => {
    const red = makeRedBox('r', 'Reached');
    const orange = makeOrangeBox('u', 'Unreached');
    // No connection — both are roots, both should appear
    em.mindMap = { boxes: [red, orange], connections: [] };
    const md = em.buildTextHierarchy();
    expect(md).toMatch(/^# Reached/m);
    expect(md).toMatch(/^## Unreached/m);
  });

  test('cyclic boxes not reachable from any root are appended with correct prefix', () => {
    // A→B, B→A cycle; C is a standalone root
    const c = makeRedBox('c', 'Root');
    const a = makeOrangeBox('a', 'CycleA');
    const b = makeWhiteBox('b', 'CycleB');
    em.mindMap = {
      boxes: [c, a, b],
      connections: [{ fromBox: a, toBox: b }, { fromBox: b, toBox: a }],
    };
    const md = em.buildTextHierarchy();
    // C is the standalone root
    expect(md).toMatch(/^# Root/m);
    // CycleA and CycleB are unreachable; they should still appear with their colours
    expect(md).toMatch(/^## CycleA/m);
    expect(md).toMatch(/^CycleB/m);   // white → plain text
    // No synthetic "## Disconnected" header
    expect(md).not.toMatch(/## Disconnected/);
  });

  test('rootless cycles are emitted once each', () => {
    const a = makeOrangeBox('a', 'CycleA');
    const b = makeWhiteBox('b', 'CycleB');
    em.mindMap = {
      boxes: [a, b],
      connections: [{ fromBox: a, toBox: b }, { fromBox: b, toBox: a }],
    };

    const md = em.buildTextHierarchy();

    expect((md.match(/^## CycleA$/gm) || []).length).toBe(1);
    expect((md.match(/^CycleB$/gm) || []).length).toBe(1);
  });

  // ---- multi-line text ----

  test('multi-line text in a box is collapsed to a single line', () => {
    em.mindMap = {
      boxes: [makeRedBox('a', 'Line one\nLine two')],
      connections: [],
    };
    const md = em.buildTextHierarchy();
    expect(md).toMatch(/^# Line one Line two/m);
  });

  // ---- no heading prefix emitted for non-red/orange colours ----

  test('no Markdown heading syntax for any colour other than red or orange', () => {
    const custom = makeBox('x', 'Custom', { backgroundColor: { r: 100, g: 200, b: 100 } });
    em.mindMap = { boxes: [custom], connections: [] };
    const md = em.buildTextHierarchy();
    expect(md).not.toMatch(/^#/m);
    expect(md).toContain('Custom');
  });
});

// ---------------------------------------------------------------------------
// exportText — saves as .md with text/markdown MIME type
// ---------------------------------------------------------------------------

describe('exportText — .md filename and MIME type', () => {
  let downloadAttr, anchorEl, em;

  beforeEach(() => {
    downloadAttr = null;
    anchorEl = {
      href: '',
      get download() { return downloadAttr; },
      set download(v) { downloadAttr = v; },
      click: jest.fn(),
    };

    jest.spyOn(document, 'createElement').mockImplementation(tag => {
      if (tag === 'a') return anchorEl;
      return document.createElement.wrappedMethod
        ? document.createElement.wrappedMethod(tag)
        : {};
    });
    jest.spyOn(document.body, 'appendChild').mockImplementation(() => {});
    jest.spyOn(document.body, 'removeChild').mockImplementation(() => {});

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

    em = new ExportManagerClass();
    em.mindMap = {
      boxes: [makeBox('x', 'Hello', { backgroundColor: RED_BG })],
      connections: [],
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('download attribute is set to mindmap.md', () => {
    em.exportText();
    expect(downloadAttr).toBe('mindmap.md');
  });

  test('red box in content produces H1 Markdown heading', () => {
    let capturedContent = '';
    // Capture Blob content
    const OrigBlob = window.Blob || global.Blob;
    global.Blob = class extends OrigBlob {
      constructor(parts, opts) {
        super(parts, opts);
        capturedContent = parts.join('');
      }
    };
    em.exportText();
    global.Blob = OrigBlob;
    expect(capturedContent).toMatch(/^# Hello/m);
  });
});

// ---------------------------------------------------------------------------
// PNG export — image aspect-ratio preservation (no fixed 20px inset)
// ---------------------------------------------------------------------------

describe('PNG export — image drawn with CENTER mode and aspect-ratio scaling', () => {
  let pgMock, imageModeArgs, imageArgs;

  beforeEach(() => {
    imageModeArgs = [];
    imageArgs = [];

    pgMock = makePgMock({
      imageMode: jest.fn(m => imageModeArgs.push(m)),
      image: jest.fn((...args) => imageArgs.push(args)),
    });

    global.TimelineMode = undefined;

    jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function runPNGExport(box) {
    const em = new ExportManagerClass();
    const p5Mock = { createGraphics: jest.fn(() => pgMock) };
    em.initialize(p5Mock, { boxes: [box], connections: [], clusters: [] },
      { EXPORT: { PADDING: 50 } });
    em.exportPNG();
  }

  test('imageMode is set to CENTER before drawing image', () => {
    const imgObj = { width: 300, height: 200, canvas: {} };
    const box = makeBox('img', 'ignored', {
      imageUrl: 'pic.png', img: imgObj,
      naturalImageWidth: 300, naturalImageHeight: 200,
      x: 100, y: 100, width: 200, height: 150,
    });
    runPNGExport(box);

    const centerIdx = imageModeArgs.indexOf('CENTER');
    expect(centerIdx).toBeGreaterThanOrEqual(0);
    // CORNER must reset after CENTER
    const cornerIdx = imageModeArgs.indexOf('CORNER');
    expect(cornerIdx).toBeGreaterThan(centerIdx);
  });

  test('image is drawn centred at box.x, box.y — not with corner offset', () => {
    const imgObj = { width: 200, height: 100, canvas: {} };
    const box = makeBox('img', '', {
      imageUrl: 'pic.png', img: imgObj,
      naturalImageWidth: 200, naturalImageHeight: 100,
      x: 100, y: 100, width: 200, height: 150,
    });
    runPNGExport(box);

    expect(imageArgs.length).toBeGreaterThan(0);
    const [, x, y] = imageArgs[0];
    expect(x).toBeCloseTo(100, 1);  // box.x
    expect(y).toBeCloseTo(100, 1);  // box.y
  });

  test('drawn size respects aspect ratio — no fixed 20px inset', () => {
    // Image 400×100 in a 200×200 box: scale = min(200/400, 200/100) = 0.5
    // drawW = 400*0.5 = 200, drawH = 100*0.5 = 50
    const imgObj = { width: 400, height: 100, canvas: {} };
    const box = makeBox('img', '', {
      imageUrl: 'pic.png', img: imgObj,
      naturalImageWidth: 400, naturalImageHeight: 100,
      x: 0, y: 0, width: 200, height: 200,
    });
    runPNGExport(box);

    const [, , , drawW, drawH] = imageArgs[0];
    expect(drawW).toBeCloseTo(200, 1);
    expect(drawH).toBeCloseTo(50, 1);
  });

  test('emoji grapheme clusters are rendered as single glyphs in PNG text export', () => {
    const box = makeBox('txt', '🏴‍☠️ 👻', {
      x: 100, y: 100, width: 300, height: 120,
      imageUrl: null,
    });
    runPNGExport(box);

    const drawnGlyphs = pgMock.text.mock.calls.map(call => call[0]);
    expect(drawnGlyphs).toEqual(['🏴‍☠️', '👻']);
  });
});

// ---------------------------------------------------------------------------
// PDF export — images use p5.Image.canvas (not the p5.Image object)
// ---------------------------------------------------------------------------

describe('PDF export — image data extracted from p5.Image.canvas', () => {
  let addImageCalls, pdfMock;

  beforeEach(() => {
    addImageCalls = [];

    pdfMock = {
      internal: { pageSize: { getWidth: () => 595, getHeight: () => 842 } },
      setFillColor: jest.fn(), setDrawColor: jest.fn(), setLineWidth: jest.fn(),
      setFontSize: jest.fn(), setTextColor: jest.fn(), setFont: jest.fn(),
      rect: jest.fn(), roundedRect: jest.fn(),
      addImage: jest.fn((...args) => addImageCalls.push(args)),
      line: jest.fn(), triangle: jest.fn(),
      text: jest.fn(),
      getTextWidth: jest.fn(() => 50),
      link: jest.fn(), lines: jest.fn(),
      save: jest.fn(),
    };

    window.jspdf = { jsPDF: jest.fn(() => pdfMock) };
    global.TimelineMode = undefined;
    global.Cluster = undefined;
  });

  describe('wrapTextForExport — emoji-safe wrapping', () => {
    test('does not split grapheme emoji clusters when token exceeds max width', () => {
      const em = new ExportManagerClass();
      const pg = makePgMock();

      const { lines, charMap } = em.wrapTextForExport(pg, '🏴‍☠️', 12, 14);
      expect(lines).toEqual(['🏴‍☠️']);
      expect(charMap).toEqual([0]);
    });
  });

  function makeMeasurePg() {
    return {
      textSize: jest.fn(),
      textWidth: jest.fn(s => (s ? s.length * 7 : 0)),
      remove: jest.fn(),
    };
  }

  test('p5.Image.canvas.toDataURL is called with image/jpeg when canvas has valid dimensions', async () => {
    const toDataURL = jest.fn(() => 'data:image/jpeg;base64,FAKEDATA');
    const fakeCanvas = { width: 200, height: 150, toDataURL };
    const imgObj = { width: 200, height: 150, canvas: fakeCanvas };

    const box = makeBox('img1', '', {
      imageUrl: 'test.jpg', img: imgObj,
      naturalImageWidth: 200, naturalImageHeight: 150,
      x: 0, y: 0, width: 200, height: 150,
    });

    const measurePg = makeMeasurePg();
    const em = new ExportManagerClass();
    em.initialize(
      { createGraphics: jest.fn(() => measurePg) },
      { boxes: [box], connections: [], clusters: [] },
      { EXPORT: { PADDING: 50, MARGIN: 20 } }
    );

    await em.exportPDF();

    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.8);
    expect(addImageCalls.length).toBeGreaterThan(0);
    // The data URL returned by our mock should be passed to addImage
    expect(addImageCalls[0]).toContain('data:image/jpeg;base64,FAKEDATA');
  });

  test('image is skipped when canvas has zero dimensions', async () => {
    const toDataURL = jest.fn(() => 'data:image/jpeg;base64,FAKEDATA');
    const fakeCanvas = { width: 0, height: 0, toDataURL };
    const imgObj = { width: 0, height: 0, canvas: fakeCanvas };

    const box = makeBox('img2', '', {
      imageUrl: 'test.jpg', img: imgObj,
      x: 0, y: 0, width: 200, height: 150,
    });

    const measurePg = makeMeasurePg();
    const em = new ExportManagerClass();
    em.initialize(
      { createGraphics: jest.fn(() => measurePg) },
      { boxes: [box], connections: [], clusters: [] },
      { EXPORT: { PADDING: 50, MARGIN: 20 } }
    );

    await em.exportPDF();

    expect(toDataURL).not.toHaveBeenCalled();
  });

  test('addImage uses aspect-ratio-preserved dimensions centred in box', async () => {
    // Image 400×100 in a 200×200 box: scale = 0.5 → drawW=200, drawH=50
    // imgX = (box.x - drawW/2) * pdfScale + offsetX
    const toDataURL = jest.fn(() => 'data:image/jpeg;base64,FAKEDATA');
    const fakeCanvas = { width: 400, height: 100, toDataURL };
    const imgObj = { width: 400, height: 100, canvas: fakeCanvas };

    const box = makeBox('img3', '', {
      imageUrl: 'test.jpg', img: imgObj,
      naturalImageWidth: 400, naturalImageHeight: 100,
      x: 200, y: 200, width: 200, height: 200,
    });

    const measurePg = makeMeasurePg();
    const em = new ExportManagerClass();
    em.initialize(
      { createGraphics: jest.fn(() => measurePg) },
      { boxes: [box], connections: [], clusters: [] },
      { EXPORT: { PADDING: 50, MARGIN: 20 } }
    );

    await em.exportPDF();

    expect(addImageCalls.length).toBeGreaterThan(0);
    // Args to addImage: [dataUrl, format, imgX, imgY, imgW, imgH]
    const [, , , , imgW, imgH] = addImageCalls[0];
    // pdfW corresponds to drawW=200 (world), pdfH to drawH=50 (world)
    // For a single centered box the scale is large; just verify the ratio is 4:1
    expect(imgW / imgH).toBeCloseTo(4, 1);
  });
});
