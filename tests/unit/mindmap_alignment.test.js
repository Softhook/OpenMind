/**
 * Tests for MindMap box alignment and distribution operations.
 *
 * These operations (leftAlign, rightAlign, topAlign, bottomAlign,
 * centerH, centerV, distributeH, distributeV) had zero test coverage.
 * Each test creates a minimal MindMap, selects boxes, and verifies
 * the expected geometry after the operation.
 *
 * @jest-environment jsdom
 */

// ── global stubs required by TextBox / MindMap ──────────────────────────────
global.Utils = require('../../src/utils');
global.ColorPalette = require('../../src/ColorPalette');

global.textSize = jest.fn();
global.textWidth = jest.fn((str) => (str ? str.length * 10 : 50));
global.max = Math.max;
global.min = Math.min;
global.abs = Math.abs;
global.stroke = jest.fn();
global.strokeWeight = jest.fn();
global.fill = jest.fn();
global.rect = jest.fn();
global.push = jest.fn();
global.pop = jest.fn();
global.text = jest.fn();
global.textAlign = jest.fn();
global.translate = jest.fn();
global.cursor = jest.fn();
global.lerp = (a, b, t) => a + (b - a) * t;
global.constrain = (val, lo, hi) => Math.max(lo, Math.min(hi, val));
global.millis = jest.fn(() => 0);

const TextBox = require('../../src/TextBox');
const Connection = require('../../src/Connection');
const MindMap = require('../../src/MindMap');

global.TextBox = TextBox;
global.Connection = Connection;
global.MindMap = MindMap;

// ── helpers ──────────────────────────────────────────────────────────────────

/** Creates a box-like plain object with the minimum properties MindMap alignment needs. */
function makeBox(x, y, width = 80, height = 40) {
  return { x, y, width, height, targetX: x, targetY: y, selected: true };
}

/** Selects a list of boxes into a MindMap. */
function selectBoxes(mindMap, boxes) {
  mindMap.selectedBoxes = new Set(boxes);
}

// ── test suite ───────────────────────────────────────────────────────────────

describe('MindMap box alignment', () => {
  let mindMap;

  beforeEach(() => {
    mindMap = new MindMap();
    // Disable collaboration callbacks – we only test geometry here
    MindMap.onBoxChange = null;
  });

  // ── leftAlignSelectedBoxes ──────────────────────────────────────────────

  describe('leftAlignSelectedBoxes', () => {
    test('aligns all boxes to the leftmost left edge', () => {
      const boxes = [
        makeBox(100, 0, 80, 40),  // left edge = 100 - 40 = 60
        makeBox(200, 0, 80, 40),  // left edge = 200 - 40 = 160
        makeBox(300, 0, 80, 40),  // left edge = 300 - 40 = 260
      ];
      selectBoxes(mindMap, boxes);

      const result = mindMap.leftAlignSelectedBoxes();

      expect(result).toBe(true);
      // All boxes should have their left edge at 60 (= 100 - 40)
      for (const box of boxes) {
        expect(box.x - box.width / 2).toBeCloseTo(60);
      }
    });

    test('returns false and does not move boxes when fewer than 2 are selected', () => {
      const box = makeBox(100, 0);
      selectBoxes(mindMap, [box]);

      const result = mindMap.leftAlignSelectedBoxes();

      expect(result).toBe(false);
      expect(box.x).toBe(100);
    });

    test('syncs targetX to match new x position', () => {
      const boxes = [makeBox(100, 0), makeBox(300, 0)];
      selectBoxes(mindMap, boxes);

      mindMap.leftAlignSelectedBoxes();

      for (const box of boxes) {
        expect(box.targetX).toBe(box.x);
      }
    });
  });

  // ── rightAlignSelectedBoxes ─────────────────────────────────────────────

  describe('rightAlignSelectedBoxes', () => {
    test('aligns all boxes to the rightmost right edge', () => {
      const boxes = [
        makeBox(100, 0, 80, 40),  // right edge = 100 + 40 = 140
        makeBox(200, 0, 80, 40),  // right edge = 200 + 40 = 240
        makeBox(300, 0, 80, 40),  // right edge = 300 + 40 = 340
      ];
      selectBoxes(mindMap, boxes);

      const result = mindMap.rightAlignSelectedBoxes();

      expect(result).toBe(true);
      for (const box of boxes) {
        expect(box.x + box.width / 2).toBeCloseTo(340);
      }
    });

    test('returns false when fewer than 2 boxes selected', () => {
      selectBoxes(mindMap, [makeBox(100, 0)]);
      expect(mindMap.rightAlignSelectedBoxes()).toBe(false);
    });
  });

  // ── topAlignSelectedBoxes ───────────────────────────────────────────────

  describe('topAlignSelectedBoxes', () => {
    test('aligns all boxes to the topmost top edge', () => {
      const boxes = [
        makeBox(0, 100, 80, 40),  // top edge = 100 - 20 = 80
        makeBox(0, 200, 80, 40),  // top edge = 200 - 20 = 180
      ];
      selectBoxes(mindMap, boxes);

      const result = mindMap.topAlignSelectedBoxes();

      expect(result).toBe(true);
      for (const box of boxes) {
        expect(box.y - box.height / 2).toBeCloseTo(80);
      }
    });

    test('syncs targetY to new y position', () => {
      const boxes = [makeBox(0, 100), makeBox(0, 200)];
      selectBoxes(mindMap, boxes);

      mindMap.topAlignSelectedBoxes();

      for (const box of boxes) {
        expect(box.targetY).toBe(box.y);
      }
    });

    test('returns false when fewer than 2 boxes selected', () => {
      selectBoxes(mindMap, [makeBox(0, 100)]);
      expect(mindMap.topAlignSelectedBoxes()).toBe(false);
    });
  });

  // ── bottomAlignSelectedBoxes ────────────────────────────────────────────

  describe('bottomAlignSelectedBoxes', () => {
    test('aligns all boxes to the lowest bottom edge', () => {
      const boxes = [
        makeBox(0, 100, 80, 40),  // bottom edge = 100 + 20 = 120
        makeBox(0, 200, 80, 40),  // bottom edge = 200 + 20 = 220
      ];
      selectBoxes(mindMap, boxes);

      const result = mindMap.bottomAlignSelectedBoxes();

      expect(result).toBe(true);
      for (const box of boxes) {
        expect(box.y + box.height / 2).toBeCloseTo(220);
      }
    });

    test('returns false when fewer than 2 boxes selected', () => {
      selectBoxes(mindMap, [makeBox(0, 100)]);
      expect(mindMap.bottomAlignSelectedBoxes()).toBe(false);
    });
  });

  // ── centerAlignSelectedBoxes (vertical axis, horizontal center) ─────────

  describe('centerAlignSelectedBoxes', () => {
    test('moves all boxes to the average x position', () => {
      const boxes = [
        makeBox(0, 0),   // x = 0
        makeBox(100, 0), // x = 100
      ];
      selectBoxes(mindMap, boxes);

      const result = mindMap.centerAlignSelectedBoxes();

      expect(result).toBe(true);
      const expectedCenter = (0 + 100) / 2; // 50
      for (const box of boxes) {
        expect(box.x).toBeCloseTo(expectedCenter);
      }
    });

    test('returns false when fewer than 2 boxes selected', () => {
      selectBoxes(mindMap, [makeBox(0, 0)]);
      expect(mindMap.centerAlignSelectedBoxes()).toBe(false);
    });
  });

  // ── horizontalCenterAlignSelectedBoxes (horizontal axis, vertical center) ─

  describe('horizontalCenterAlignSelectedBoxes', () => {
    test('moves all boxes to the average y position', () => {
      const boxes = [
        makeBox(0, 0),    // y = 0
        makeBox(0, 200),  // y = 200
      ];
      selectBoxes(mindMap, boxes);

      const result = mindMap.horizontalCenterAlignSelectedBoxes();

      expect(result).toBe(true);
      const expectedCenter = (0 + 200) / 2; // 100
      for (const box of boxes) {
        expect(box.y).toBeCloseTo(expectedCenter);
      }
    });

    test('returns false when fewer than 2 boxes selected', () => {
      selectBoxes(mindMap, [makeBox(0, 0)]);
      expect(mindMap.horizontalCenterAlignSelectedBoxes()).toBe(false);
    });
  });

  // ── distributeSelectedBoxesVertically ──────────────────────────────────

  describe('distributeSelectedBoxesVertically', () => {
    test('spaces 3 boxes evenly between top and bottom extremes', () => {
      // All boxes: height=40, half=20.
      // Extremes: topEdge = 40-20 = 20, bottomEdge = 800+20 = 820.
      // available = 800; totalBoxHeight = 120; gap = (800-120)/2 = 340.
      // Expected centres: top=40 (fixed), mid=40+20+340+20=420, bottom=800 (fixed).
      const boxes = [
        makeBox(0, 40,  80, 40),
        makeBox(0, 400, 80, 40),
        makeBox(0, 800, 80, 40),
      ];
      selectBoxes(mindMap, boxes);

      const result = mindMap.distributeSelectedBoxesVertically();

      expect(result).toBe(true);
      const ys = boxes.map(b => b.y).sort((a, b) => a - b);
      // Top and bottom extremes are preserved
      expect(ys[0]).toBeCloseTo(40);
      expect(ys[2]).toBeCloseTo(800);
      // Middle box is equidistant from both neighbours (gap-wise)
      const halfH = boxes[0].height / 2;
      const gapAbove = (ys[1] - halfH) - (ys[0] + halfH);
      const gapBelow = (ys[2] - halfH) - (ys[1] + halfH);
      expect(gapAbove).toBeCloseTo(gapBelow);
    });

    test('returns false when fewer than 3 boxes selected', () => {
      selectBoxes(mindMap, [makeBox(0, 0), makeBox(0, 100)]);
      expect(mindMap.distributeSelectedBoxesVertically()).toBe(false);
    });
  });

  // ── distributeSelectedBoxesHorizontally ────────────────────────────────

  describe('distributeSelectedBoxesHorizontally', () => {
    test('spaces 3 boxes evenly between left and right extremes', () => {
      const boxes = [
        makeBox(40,  0, 40, 40),
        makeBox(400, 0, 40, 40),
        makeBox(800, 0, 40, 40),
      ];
      selectBoxes(mindMap, boxes);

      const result = mindMap.distributeSelectedBoxesHorizontally();

      expect(result).toBe(true);
      const xs = boxes.map(b => b.x).sort((a, b) => a - b);
      // Leftmost and rightmost centres are preserved
      expect(xs[0]).toBeCloseTo(40);
      expect(xs[2]).toBeCloseTo(800);
      // Gaps between edges should be equal
      const halfW = boxes[0].width / 2;
      const gapLeft  = (xs[1] - halfW) - (xs[0] + halfW);
      const gapRight = (xs[2] - halfW) - (xs[1] + halfW);
      expect(gapLeft).toBeCloseTo(gapRight);
    });

    test('returns false when fewer than 3 boxes selected', () => {
      selectBoxes(mindMap, [makeBox(0, 0), makeBox(100, 0)]);
      expect(mindMap.distributeSelectedBoxesHorizontally()).toBe(false);
    });
  });
});
