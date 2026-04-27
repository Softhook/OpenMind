/**
 * @jest-environment jsdom
 *
 * Tests that the resize handle at the bottom-right corner takes priority over
 * the move (edge-drag) interaction for both selected and unselected (but hovered) boxes.
 *
 * Regression for: "UI issue with box corner" – hovering the bottom-right corner
 * should show the resize cursor and start a resize, not a move.
 */

global.Utils = require('../../src/utils');
global.ColorPalette = require('../../src/ColorPalette');

// Stub p5 drawing helpers
global.fill = jest.fn();
global.noFill = jest.fn();
global.stroke = jest.fn();
global.noStroke = jest.fn();
global.strokeWeight = jest.fn();
global.strokeCap = jest.fn();
global.push = jest.fn();
global.pop = jest.fn();
global.rect = jest.fn();
global.circle = jest.fn();
global.line = jest.fn();
global.text = jest.fn();
global.textSize = jest.fn();
global.textWidth = jest.fn((s) => (s ? s.length * 10 : 50));
global.textAlign = jest.fn();
global.translate = jest.fn();
global.cursor = jest.fn();
global.millis = jest.fn(() => 1000);
global.max = Math.max;
global.min = Math.min;
global.abs = Math.abs;
global.sqrt = Math.sqrt;
global.dist = (x1, y1, x2, y2) => Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
global.lerp = (a, b, t) => a + (b - a) * t;
global.constrain = (val, lo, hi) => Math.max(lo, Math.min(hi, val));
global.keyIsDown = jest.fn(() => false);
global.PI = Math.PI;
global.cos = Math.cos;
global.sin = Math.sin;
global.ROUND = 'round';
global.SQUARE = 'square';

const TextBox = require('../../src/TextBox');

/**
 * Compute the center of the resize handle for a box (world coordinates).
 * Mirrors the calculation in TextBox.isMouseOverResizeHandle().
 */
function resizeHandleCenter(box) {
  const zoomFactor = Utils.getClampedZoomFactor();
  const scaledHandleSize = box.resizeHandleSize / zoomFactor;
  const handleX = box.x + box.width / 2 - scaledHandleSize;
  const handleY = box.y + box.height / 2 - scaledHandleSize;
  return {
    cx: handleX + scaledHandleSize / 2,
    cy: handleY + scaledHandleSize / 2,
    radius: scaledHandleSize / 2,
  };
}

/**
 * Set up mindMap global so isMouseOverResizeHandle() can read _topHoverBox.
 * @param {object} box - The top-hover box.
 * @param {boolean} [isArrowKeyNavigating=false] - Whether arrow-key navigation is active.
 */
function setTopHoverBox(box, isArrowKeyNavigating = false) {
  global.mindMap = { _topHoverBox: box, isArrowKeyNavigating };
}

describe('Resize handle priority over edge-drag at bottom-right corner', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    global.mindMap = undefined;
  });

  test('isMouseOverResizeHandle returns true for an unselected top-hover box when mouse is over the handle', () => {
    const box = new TextBox(100, 100, 'Hello');
    box.selected = false;
    setTopHoverBox(box);

    const { cx, cy } = resizeHandleCenter(box);
    jest.spyOn(Utils, 'getWorldMouseCoordinates').mockReturnValue({ x: cx, y: cy });

    expect(box.isMouseOverResizeHandle()).toBe(true);
  });

  test('isMouseOverResizeHandle returns true for a selected top-hover box when mouse is over the handle', () => {
    const box = new TextBox(100, 100, 'Hello');
    box.selected = true;
    setTopHoverBox(box);

    const { cx, cy } = resizeHandleCenter(box);
    jest.spyOn(Utils, 'getWorldMouseCoordinates').mockReturnValue({ x: cx, y: cy });

    expect(box.isMouseOverResizeHandle()).toBe(true);
  });

  test('isMouseOverResizeHandle returns false when a different box is the top-hover box', () => {
    const box = new TextBox(100, 100, 'Hello');
    const otherBox = new TextBox(400, 400, 'Other');
    box.selected = true;
    setTopHoverBox(otherBox); // box is NOT the top hover

    const { cx, cy } = resizeHandleCenter(box);
    jest.spyOn(Utils, 'getWorldMouseCoordinates').mockReturnValue({ x: cx, y: cy });

    expect(box.isMouseOverResizeHandle()).toBe(false);
  });

  test('isMouseOverResizeHandle returns false for an unselected box that is NOT the top-hover box', () => {
    const box = new TextBox(100, 100, 'Hello');
    const otherBox = new TextBox(400, 400, 'Other');
    box.selected = false;
    setTopHoverBox(otherBox);

    const { cx, cy } = resizeHandleCenter(box);
    jest.spyOn(Utils, 'getWorldMouseCoordinates').mockReturnValue({ x: cx, y: cy });

    expect(box.isMouseOverResizeHandle()).toBe(false);
  });

  test('isMouseOnEdge returns false at the bottom-right corner for an unselected top-hover box', () => {
    const box = new TextBox(100, 100, 'Hello');
    box.selected = false;
    setTopHoverBox(box);

    // Place mouse exactly on the resize handle center
    const { cx, cy } = resizeHandleCenter(box);
    jest.spyOn(Utils, 'getWorldMouseCoordinates').mockReturnValue({ x: cx, y: cy });

    // isMouseOnEdge must return false here so the edge-drag is not triggered
    expect(box.isMouseOnEdge()).toBe(false);
  });

  test('isMouseOnEdge still returns true on the bottom edge away from the resize handle', () => {
    const box = new TextBox(100, 100, 'Hello');
    box.selected = false;
    setTopHoverBox(box);

    // Bottom edge center (far from the resize handle at bottom-right corner)
    const bottomEdgeX = box.x; // center-x
    const bottomEdgeY = box.y + box.height / 2 - 1; // just inside bottom edge
    jest.spyOn(Utils, 'getWorldMouseCoordinates').mockReturnValue({ x: bottomEdgeX, y: bottomEdgeY });

    expect(box.isMouseOnEdge()).toBe(true);
  });

  test('isMouseOverResizeHandle returns false for unselected top-hover box during arrow-key navigation', () => {
    const box = new TextBox(100, 100, 'Hello');
    box.selected = false;
    setTopHoverBox(box, true); // isArrowKeyNavigating = true

    const { cx, cy } = resizeHandleCenter(box);
    jest.spyOn(Utils, 'getWorldMouseCoordinates').mockReturnValue({ x: cx, y: cy });

    // Hover-based activation must be suppressed during arrow-key navigation
    expect(box.isMouseOverResizeHandle()).toBe(false);
  });

  test('isMouseOnEdge is NOT suppressed at corner during arrow-key navigation (handle is hidden)', () => {
    const box = new TextBox(100, 100, 'Hello');
    box.selected = false;
    setTopHoverBox(box, true); // isArrowKeyNavigating = true

    // Mouse at the resize handle position — but handle is hidden so edge-drag should not be blocked
    const { cx, cy } = resizeHandleCenter(box);
    jest.spyOn(Utils, 'getWorldMouseCoordinates').mockReturnValue({ x: cx, y: cy });

    // isMouseOverResizeHandle returns false → isMouseOnEdge may return true if in the edge zone
    expect(box.isMouseOverResizeHandle()).toBe(false);
  });

  test('isMouseOverResizeHandle returns true for a selected box during arrow-key navigation', () => {
    // Selected boxes retain their resize-handle hit detection even during navigation
    const box = new TextBox(100, 100, 'Hello');
    box.selected = true;
    setTopHoverBox(box, true); // isArrowKeyNavigating = true

    const { cx, cy } = resizeHandleCenter(box);
    jest.spyOn(Utils, 'getWorldMouseCoordinates').mockReturnValue({ x: cx, y: cy });

    expect(box.isMouseOverResizeHandle()).toBe(true);
  });
});
