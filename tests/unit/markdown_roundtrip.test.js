/**
 * Tests for the Markdown round-trip heading colour preservation:
 *
 * Export:
 *   red   box  → `# text`
 *   orange box  → `## text`
 *   white/other → plain text (no heading prefix)
 *
 * Import (Markdown file):
 *   `# text`  → red box
 *   `## text` → orange box
 *   plain text → white box (setBackgroundByKey not called, or called with 'white')
 *
 * The `nlp` library is not available in the test environment, so
 * `parseTextIntoSections` falls back to `basicFallbackParse`. However, we
 * can directly test `parseTextIntoSections` by stubbing `nlp` or by testing
 * the methods that are reachable without it (commitSection, detectTitleIndex,
 * and importTextAsDiagram which is end-to-end).
 *
 * We also test that when `nlp` IS available (via a stub), the Markdown-aware
 * path strips prefixes and records headingLevel correctly.
 */

const TextImporter = require('../../src/TextImporter');

// ---------------------------------------------------------------------------
// Shared mock setup
// ---------------------------------------------------------------------------

let mockBoxes = [];
let mockConnections = [];

global.mindMap = {
  boxes: [],
  connections: [],
  clearBoxSelection: jest.fn(),
  selectedBox: null,
  saveToLocalStorage: jest.fn(),
  batchAdd: jest.fn((boxes, conns) => {
    if (boxes) boxes.forEach(b => mockBoxes.push(b));
    if (conns) mockConnections.push(...conns);
  }),
};

global.Utils = { sanitizeText: t => t.trim() };

global.Connection = class Connection {
  constructor(a, b) { this.fromBox = a; this.toBox = b; }
};

global.resetView = jest.fn();
global.alert = jest.fn();

// Track setBackgroundByKey calls per box
function makeTextBoxClass() {
  return class TextBox {
    constructor(x, y, text) {
      this.x = x; this.y = y; this.text = text;
      this.width = 120; this.height = 50;
      this.setBackgroundByKey = jest.fn();
      this.updateDimensions = jest.fn();
      this.targetX = x; this.targetY = y;
    }
  };
}

// ---------------------------------------------------------------------------
// parseTextIntoSections — Markdown-aware path (with nlp stub)
// ---------------------------------------------------------------------------

describe('TextImporter.parseTextIntoSections — Markdown headingLevel detection', () => {
  beforeAll(() => {
    // Provide a minimal nlp stub so the Markdown-aware code path is exercised
    // (not the basicFallbackParse path).
    global.nlp = (text) => ({
      verbs: () => ({ found: false }),
      wordCount: () => text.trim().split(/\s+/).length,
      sentences: () => ({ length: 1 }),
      has: () => false,
      match: () => ({ found: false }),
    });
  });

  afterAll(() => {
    delete global.nlp;
  });

  test('`# H1` line produces headingLevel 1 with stripped text', () => {
    const sections = TextImporter.parseTextIntoSections(['# My Title', 'Paragraph text']);
    expect(sections.length).toBeGreaterThanOrEqual(1);
    const h1 = sections.find(s => s.headingLevel === 1);
    expect(h1).toBeDefined();
    expect(h1.heading).toBe('My Title');        // prefix stripped
    expect(h1.heading).not.toMatch(/^#/);       // no # in stored text
  });

  test('`## H2` line produces headingLevel 2 with stripped text', () => {
    const sections = TextImporter.parseTextIntoSections(['# Title', '## Section', 'Body']);
    const h2 = sections.find(s => s.headingLevel === 2);
    expect(h2).toBeDefined();
    expect(h2.heading).toBe('Section');
    expect(h2.heading).not.toMatch(/^##/);
  });

  test('`### H3` line produces headingLevel 3', () => {
    const sections = TextImporter.parseTextIntoSections(['# T', '### Sub']);
    const h3 = sections.find(s => s.headingLevel === 3);
    expect(h3).toBeDefined();
    expect(h3.heading).toBe('Sub');
  });

  test('non-heading lines become paragraphs of the preceding heading section', () => {
    const sections = TextImporter.parseTextIntoSections([
      '# Title',
      'para one',
      'para two',
    ]);
    const h1 = sections.find(s => s.headingLevel === 1);
    expect(h1).toBeDefined();
    // paragraphs should contain the body lines
    const allParas = h1.paragraphs.join(' ');
    expect(allParas).toContain('para one');
    expect(allParas).toContain('para two');
  });

  test('sections without Markdown headers have headingLevel null', () => {
    // No `# ` in input → hasMarkdownHeaders false → NLP path → headingLevel null.
    // The nlp stub returns verbs().found === false for all text, so short lines
    // will be treated as headings by the heuristic.
    const sections = TextImporter.parseTextIntoSections(['Plain Heading', 'para']);
    sections.forEach(s => expect(s.headingLevel).toBeNull());
  });

  test('headingLevel is not set on NLP-detected headings (non-Markdown file)', () => {
    const sections = TextImporter.parseTextIntoSections(['Introduction', 'Some paragraph.']);
    sections.forEach(s => expect(s.headingLevel).toBeNull());
  });
});

// ---------------------------------------------------------------------------
// importTextAsDiagram — colour restoration from Markdown headingLevel
// ---------------------------------------------------------------------------

describe('importTextAsDiagram — Markdown file colours (nlp stub)', () => {
  beforeAll(() => {
    global.nlp = (text) => ({
      verbs: () => ({ found: false }),
      wordCount: () => text.trim().split(/\s+/).length,
      sentences: () => ({ length: 1 }),
      has: () => false,
      match: () => ({ found: false }),
    });
    global.TextBox = makeTextBoxClass();
  });

  afterAll(() => {
    delete global.nlp;
  });

  beforeEach(() => {
    mockBoxes = [];
    mockConnections = [];
    mindMap.boxes = [];
    mindMap.connections = [];
    jest.clearAllMocks();
  });

  test('`# ` heading creates a red box', async () => {
    await TextImporter.importTextAsDiagram('# Red Title\nBody text');
    const redBox = mockBoxes.find(b => b.setBackgroundByKey.mock.calls.some(c => c[0] === 'red'));
    expect(redBox).toBeDefined();
    expect(redBox.text).toBe('Red Title');      // prefix stripped
  });

  test('`## ` heading creates an orange box', async () => {
    await TextImporter.importTextAsDiagram('# Title\n## Orange Section\nBody');
    const orangeBox = mockBoxes.find(b => b.setBackgroundByKey.mock.calls.some(c => c[0] === 'orange'));
    expect(orangeBox).toBeDefined();
    expect(orangeBox.text).toBe('Orange Section');
  });

  test('`# ` and `## ` headings are coloured correctly in the same file', async () => {
    const md = '# Main Title\n\n## Section One\nParagraph.\n\n## Section Two\nMore.';
    await TextImporter.importTextAsDiagram(md);

    const redBoxes    = mockBoxes.filter(b => b.setBackgroundByKey.mock.calls.some(c => c[0] === 'red'));
    const orangeBoxes = mockBoxes.filter(b => b.setBackgroundByKey.mock.calls.some(c => c[0] === 'orange'));

    expect(redBoxes.length).toBe(1);
    expect(redBoxes[0].text).toBe('Main Title');

    expect(orangeBoxes.length).toBe(2);
    const orangeTexts = orangeBoxes.map(b => b.text);
    expect(orangeTexts).toContain('Section One');
    expect(orangeTexts).toContain('Section Two');
  });

  test('`# ` heading box text does NOT contain the `# ` prefix', async () => {
    await TextImporter.importTextAsDiagram('# Clean Title\nBody');
    const boxes = mockBoxes;
    const headingBox = boxes.find(b => b.setBackgroundByKey.mock.calls.length > 0);
    expect(headingBox.text).not.toMatch(/^#/);
  });

  test('`## ` heading box text does NOT contain the `## ` prefix', async () => {
    await TextImporter.importTextAsDiagram('# T\n## Clean Section');
    const orangeBox = mockBoxes.find(b => b.setBackgroundByKey.mock.calls.some(c => c[0] === 'orange'));
    expect(orangeBox).toBeDefined();
    expect(orangeBox.text).not.toMatch(/^#/);
  });

  test('plain text lines become white boxes (setBackgroundByKey not called with red/orange)', async () => {
    await TextImporter.importTextAsDiagram('# Heading\nPlain paragraph here');
    // The paragraph box should NOT have been coloured red or orange
    const paragraphBox = mockBoxes.find(b => b.text === 'Plain paragraph here');
    expect(paragraphBox).toBeDefined();
    const hasColorCall = paragraphBox.setBackgroundByKey.mock.calls.some(
      c => c[0] === 'red' || c[0] === 'orange'
    );
    expect(hasColorCall).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// commitSection — headingLevel is propagated to section objects
// ---------------------------------------------------------------------------

describe('TextImporter.commitSection — headingLevel propagation', () => {
  test('headingLevel null is stored when not provided', () => {
    const sections = [];
    TextImporter.commitSection(sections, 'Heading', ['Para']);
    expect(sections[0].headingLevel).toBeNull();
  });

  test('headingLevel 1 is stored when provided', () => {
    const sections = [];
    TextImporter.commitSection(sections, 'Heading', ['Para'], 1);
    expect(sections[0].headingLevel).toBe(1);
  });

  test('headingLevel 2 is stored when provided', () => {
    const sections = [];
    TextImporter.commitSection(sections, 'Heading', ['Para'], 2);
    expect(sections[0].headingLevel).toBe(2);
  });
});
