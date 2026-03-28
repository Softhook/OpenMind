/**
 * ThrustUtils.js - Geometric and utility functions for the Thrust mini-game
 */

const ThrustUtils = {
  /**
   * Gets the three vertices of a ship triangle in world space
   */
  getShipTriangleVertices(player, size) {
    const halfSize = size / 2;

    const localVertices = [
      { x: size, y: 0 },
      { x: -halfSize, y: -halfSize },
      { x: -halfSize, y: halfSize }
    ];

    const cos = Math.cos(player.angle);
    const sin = Math.sin(player.angle);

    return localVertices.map(v => ({
      x: player.x + v.x * cos - v.y * sin,
      y: player.y + v.x * sin + v.y * cos
    }));
  },

  /**
   * Checks if a triangle collides with an axis-aligned rectangle (box) using SAT
   */
  triangleBoxCollision(triangleVertices, box) {
    const halfW = box.width / 2;
    const halfH = box.height / 2;
    const boxLeft = box.x - halfW;
    const boxRight = box.x + halfW;
    const boxTop = box.y - halfH;
    const boxBottom = box.y + halfH;

    for (const v of triangleVertices) {
      if (v.x >= boxLeft && v.x <= boxRight && v.y >= boxTop && v.y <= boxBottom) {
        return true;
      }
    }

    const boxCorners = [
      { x: boxLeft, y: boxTop },
      { x: boxRight, y: boxTop },
      { x: boxLeft, y: boxBottom },
      { x: boxRight, y: boxBottom }
    ];

    for (const corner of boxCorners) {
      if (this.pointInTriangle(corner, triangleVertices)) {
        return true;
      }
    }

    for (let i = 0; i < 3; i++) {
      const v1 = triangleVertices[i];
      const v2 = triangleVertices[(i + 1) % 3];
      if (this.lineSegmentIntersectsBox(v1, v2, boxLeft, boxRight, boxTop, boxBottom)) {
        return true;
      }
    }

    return false;
  },

  /**
   * Checks if a point is inside a triangle using barycentric coordinates
   */
  pointInTriangle(point, triangle) {
    const v0 = triangle[0];
    const v1 = triangle[1];
    const v2 = triangle[2];
    const epsilon = 0.0001;

    const d00 = (v1.x - v0.x) * (v1.x - v0.x) + (v1.y - v0.y) * (v1.y - v0.y);
    const d01 = (v1.x - v0.x) * (v2.x - v0.x) + (v1.y - v0.y) * (v2.y - v0.y);
    const d11 = (v2.x - v0.x) * (v2.x - v0.x) + (v2.y - v0.y) * (v2.y - v0.y);
    const d20 = (point.x - v0.x) * (v1.x - v0.x) + (point.y - v0.y) * (v1.y - v0.y);
    const d21 = (point.x - v0.x) * (v2.x - v0.x) + (point.y - v0.y) * (v2.y - v0.y);

    const denom = d00 * d11 - d01 * d01;
    if (Math.abs(denom) < epsilon) return false;

    const v = (d11 * d20 - d01 * d21) / denom;
    const w = (d00 * d21 - d01 * d20) / denom;
    const u = 1 - v - w;

    return (u >= 0) && (v >= 0) && (w >= 0);
  },

  /**
   * Checks if a line segment intersects with a box
   */
  lineSegmentIntersectsBox(p1, p2, boxLeft, boxRight, boxTop, boxBottom) {
    return (
      this.lineSegmentsIntersect(p1, p2, { x: boxLeft, y: boxTop }, { x: boxRight, y: boxTop }) ||
      this.lineSegmentsIntersect(p1, p2, { x: boxRight, y: boxTop }, { x: boxRight, y: boxBottom }) ||
      this.lineSegmentsIntersect(p1, p2, { x: boxRight, y: boxBottom }, { x: boxLeft, y: boxBottom }) ||
      this.lineSegmentsIntersect(p1, p2, { x: boxLeft, y: boxBottom }, { x: boxLeft, y: boxTop })
    );
  },

  /**
   * Checks if two line segments intersect
   */
  lineSegmentsIntersect(p1, p2, p3, p4) {
    const ccw = (a, b, c) => (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
    return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
  },

  /**
   * Gets the closest point on a line segment to a given point
   */
  getClosestPointOnLineSegment(x1, y1, x2, y2, px, py) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) return { x: x1, y: y1 };

    let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));

    return {
      x: x1 + t * dx,
      y: y1 + t * dy
    };
  },

  /**
   * Checks if a position is valid for spawning
   */
  isValidSpawnPosition(x, y, boxes, minDistance) {
    if (!boxes || boxes.length === 0) return true;

    for (const box of boxes) {
      if (!box) continue;

      const halfW = box.width / 2;
      const halfH = box.height / 2;

      const boxLeft = box.x - halfW - minDistance;
      const boxRight = box.x + halfW + minDistance;
      const boxTop = box.y - halfH - minDistance;
      const boxBottom = box.y + halfH + minDistance;

      if (x >= boxLeft && x <= boxRight && y >= boxTop && y <= boxBottom) {
        return false;
      }
    }

    return true;
  }
};

// Export for module use if available
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ThrustUtils;
} else {
  // Otherwise attach to window for global access
  window.ThrustUtils = ThrustUtils;
}
