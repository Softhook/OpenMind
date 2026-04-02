/**
 * Unit tests for ThrustGame collision and spawn logic
 */

const vm = require('vm');
const fs = require('fs');
const path = require('path');

// Create a sandbox context with ThrustGame
const ColorPalette = require('../../src/ColorPalette');
const ThrustConstants = require('../../src/ThrustConstants');
const ThrustUtils = require('../../src/ThrustUtils');
const ThrustShip = require('../../src/ThrustShip');
const ThrustBullet = require('../../src/ThrustBullet');
const ThrustExplosion = require('../../src/ThrustExplosion');
const thrustGameCode = fs.readFileSync(path.join(__dirname, '../../src/ThrustGame.js'), 'utf8');

// Create a sandbox context with ThrustGame
const sandbox = {
  ColorPalette: ColorPalette,
  ThrustConstants: ThrustConstants,
  ThrustUtils: ThrustUtils,
  ThrustShip: ThrustShip,
  ThrustBullet: ThrustBullet,
  ThrustExplosion: ThrustExplosion,
  console: console,
  get Date() { return Date; },
  Math: Math,
  module: { exports: {} },
  window: {},
  // Mock p5.js functions
  push: jest.fn(),
  pop: jest.fn(),
  translate: jest.fn(),
  rotate: jest.fn(),
  fill: jest.fn(),
  noStroke: jest.fn(),
  triangle: jest.fn(),
  circle: jest.fn(),
  stroke: jest.fn(),
  strokeWeight: jest.fn(),
  noFill: jest.fn(),
  resetMatrix: jest.fn(),
  textAlign: jest.fn(),
  textSize: jest.fn(),
  text: jest.fn(),
  rect: jest.fn(),
  keyIsDown: jest.fn(() => false),
  millis: jest.fn(() => Date.now()),
  LEFT: 37,
  RIGHT: 39,
  UP: 38,
  DOWN: 40,
  CENTER: 'center',
  TOP: 'top',
  BOTTOM: 'bottom'
};

// Load ThrustGame.js
const script = new vm.Script(thrustGameCode);
script.runInNewContext(sandbox);

const ThrustGame = sandbox.module.exports;

describe('ThrustGame Collision Detection', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-03-27T10:00:00Z'));
  });
  describe('getShipTriangleVertices', () => {
    test('should return 3 vertices for a ship at origin with 0 angle', () => {
      const player = { x: 0, y: 0, angle: 0 };
      const vertices = ThrustUtils.getShipTriangleVertices(player, 15); // Size was 15 in old code

      expect(vertices).toHaveLength(3);
      expect(vertices[0].x).toBeCloseTo(15, 1); // Front tip
      expect(vertices[0].y).toBeCloseTo(0, 1);
      expect(vertices[1].x).toBeCloseTo(-7.5, 1); // Back left
      expect(vertices[1].y).toBeCloseTo(-7.5, 1);
      expect(vertices[2].x).toBeCloseTo(-7.5, 1); // Back right
      expect(vertices[2].y).toBeCloseTo(7.5, 1);
    });

    test('should rotate vertices correctly for 90 degree angle', () => {
      const player = { x: 0, y: 0, angle: Math.PI / 2 };
      const vertices = ThrustUtils.getShipTriangleVertices(player, 15);

      expect(vertices).toHaveLength(3);
      expect(vertices[0].x).toBeCloseTo(0, 1); // Front tip rotated
      expect(vertices[0].y).toBeCloseTo(15, 1);
    });

    test('should translate vertices to player position', () => {
      const player = { x: 100, y: 200, angle: 0 };
      const vertices = ThrustUtils.getShipTriangleVertices(player, 15);

      expect(vertices[0].x).toBeCloseTo(115, 1); // 100 + 15
      expect(vertices[0].y).toBeCloseTo(200, 1);
    });
  });

  describe('pointInTriangle', () => {
    test('should return true for point inside triangle', () => {
      const triangle = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 }
      ];
      const point = { x: 5, y: 5 };

      expect(ThrustUtils.pointInTriangle(point, triangle)).toBe(true);
    });

    test('should return false for point outside triangle', () => {
      const triangle = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 }
      ];
      const point = { x: 20, y: 20 };

      expect(ThrustUtils.pointInTriangle(point, triangle)).toBe(false);
    });

    test('should treat point on edge as inside triangle (boundary case)', () => {
      const triangle = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 }
      ];
      const point = { x: 5, y: 0 }; // On bottom edge

      // The barycentric implementation uses >= 0 for all coordinates,
      // so edge points (where one barycentric coord is exactly 0) are inside.
      // For these integer coordinates the computation is exact (no float error).
      const result = ThrustUtils.pointInTriangle(point, triangle);
      expect(result).toBe(true);
    });
  });

  describe('triangleBoxCollision', () => {
    test('should detect collision when triangle vertex is inside box', () => {
      const triangle = [
        { x: 50, y: 50 }, // This vertex is inside the box
        { x: 0, y: 0 },
        { x: 100, y: 0 }
      ];
      const box = { x: 50, y: 50, width: 40, height: 40 };

      expect(ThrustUtils.triangleBoxCollision(triangle, box)).toBe(true);
    });

    test('should detect collision when box corner is inside triangle', () => {
      const triangle = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 50, y: 100 }
      ];
      const box = { x: 50, y: 20, width: 10, height: 10 }; // Small box inside triangle

      expect(ThrustUtils.triangleBoxCollision(triangle, box)).toBe(true);
    });

    test('should return false when triangle and box do not overlap', () => {
      const triangle = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 }
      ];
      const box = { x: 100, y: 100, width: 20, height: 20 };

      expect(ThrustUtils.triangleBoxCollision(triangle, box)).toBe(false);
    });

    test('should detect collision when triangle edge crosses box edge', () => {
      const triangle = [
        { x: 0, y: 50 },
        { x: 100, y: 50 },
        { x: 50, y: 0 }
      ];
      const box = { x: 50, y: 60, width: 20, height: 20 };

      expect(ThrustUtils.triangleBoxCollision(triangle, box)).toBe(true);
    });
  });

  describe('lineSegmentsIntersect', () => {
    test('should return true for intersecting segments', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 10, y: 10 };
      const p3 = { x: 0, y: 10 };
      const p4 = { x: 10, y: 0 };

      expect(ThrustUtils.lineSegmentsIntersect(p1, p2, p3, p4)).toBe(true);
    });

    test('should return false for non-intersecting segments', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 10, y: 0 };
      const p3 = { x: 0, y: 10 };
      const p4 = { x: 10, y: 10 };

      expect(ThrustUtils.lineSegmentsIntersect(p1, p2, p3, p4)).toBe(false);
    });

    test('should return false for parallel segments', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 10, y: 0 };
      const p3 = { x: 0, y: 5 };
      const p4 = { x: 10, y: 5 };

      expect(ThrustUtils.lineSegmentsIntersect(p1, p2, p3, p4)).toBe(false);
    });
  });

  describe('isValidSpawnPosition', () => {
    test('should return true for position far from boxes', () => {
      const boxes = [
        { x: 0, y: 0, width: 20, height: 20 }
      ];

      expect(ThrustUtils.isValidSpawnPosition(100, 100, boxes, 30)).toBe(true);
    });

    test('should return false for position inside box', () => {
      const boxes = [
        { x: 50, y: 50, width: 40, height: 40 }
      ];

      expect(ThrustUtils.isValidSpawnPosition(50, 50, boxes, 0)).toBe(false);
    });

    test('should return false for position too close to box', () => {
      const boxes = [
        { x: 50, y: 50, width: 40, height: 40 }
      ];

      // Position is just outside box but within minDistance
      expect(ThrustUtils.isValidSpawnPosition(75, 50, boxes, 30)).toBe(false);
    });

    test('should return true for position just beyond minDistance from box', () => {
      const boxes = [
        { x: 50, y: 50, width: 40, height: 40 }
      ];

      // Position is just beyond the edge (box right edge is at 70, plus minDistance 30 = 100, so 100.1 is valid)
      expect(ThrustUtils.isValidSpawnPosition(100.1, 50, boxes, 30)).toBe(true);
    });

    test('should return true when no boxes exist', () => {
      expect(ThrustUtils.isValidSpawnPosition(50, 50, [], 30)).toBe(true);
      expect(ThrustUtils.isValidSpawnPosition(50, 50, null, 30)).toBe(true);
    });
  });
});

describe('ThrustGame Spawn Logic', () => {
  let mockMindMap;

  beforeEach(() => {
    mockMindMap = {
      boxes: [
        { x: 100, y: 100, width: 50, height: 50 },
        { x: 200, y: 150, width: 50, height: 50 }
      ]
    };
  });

  test('should create player with valid coordinates', () => {
    const game = new ThrustGame(null, mockMindMap);
    const player = game.createPlayer();

    expect(typeof player.x).toBe('number');
    expect(typeof player.y).toBe('number');
    expect(Number.isFinite(player.x)).toBe(true);
    expect(Number.isFinite(player.y)).toBe(true);
  });

  test('should not spawn player inside a box', () => {
    const game = new ThrustGame(null, mockMindMap);
    const player = game.createPlayer();

    // Check player is not inside any box
    for (const box of mockMindMap.boxes) {
      const halfW = box.width / 2;
      const halfH = box.height / 2;
      const isInside = (
        player.x >= box.x - halfW &&
        player.x <= box.x + halfW &&
        player.y >= box.y - halfH &&
        player.y <= box.y + halfH
      );
      expect(isInside).toBe(false);
    }
  });

  test('should spawn near boxes when boxes exist', () => {
    const game = new ThrustGame(null, mockMindMap);
    const player = game.createPlayer();

    // Player spawns above the main box (top-left-most box at x=100, y=100)
    // and should be within a reasonable distance of that box
    const mainBox = mockMindMap.boxes[0]; // x=100, y=100 is top-left-most
    const distance = Math.sqrt(
      Math.pow(player.x - mainBox.x, 2) +
      Math.pow(player.y - mainBox.y, 2)
    );

    // Should be close to the main box (adjacent = just above it)
    expect(distance).toBeLessThan(100);
  });

  test('should use default position when no boxes exist', () => {
    const emptyMindMap = { boxes: [] };
    const game = new ThrustGame(null, emptyMindMap);
    const player = game.createPlayer();

    expect(player.x).toBe(300);
    expect(player.y).toBe(200);
  });

  test('should initialize player with correct default values', () => {
    const game = new ThrustGame(null, mockMindMap);
    const player = game.createPlayer();

    expect(player.vx).toBe(0);
    expect(player.vy).toBe(0);
    expect(player.angle).toBe(0);
    expect(player.alive).toBe(true);
    expect(player.respawnTime).toBe(0);
    expect(typeof player.invulnerableUntil).toBe('number');
  });

  test('should spawn adjacent to (just above) the main box', () => {
    const game = new ThrustGame(null, mockMindMap);
    const player = game.createPlayer();
    const mainBox = mockMindMap.boxes[0]; // box at (100, 100, w=50, h=50)

    // Player x should be centred on the main box
    expect(player.x).toBe(mainBox.x);

    // Player y should be just above the top edge of the main box
    const mainBoxTopEdge = mainBox.y - mainBox.height / 2;
    expect(player.y).toBeLessThan(mainBoxTopEdge);
  });
});

describe('ThrustGame getMainBox', () => {
  test('returns null when mindMap has no boxes', () => {
    const game = new ThrustGame(null, { boxes: [] });
    expect(game.getMainBox()).toBeNull();
  });

  test('returns null when mindMap is absent', () => {
    const game = new ThrustGame(null, null);
    expect(game.getMainBox()).toBeNull();
  });

  test('returns the only box when one box exists', () => {
    const box = { x: 50, y: 80, width: 60, height: 40 };
    const game = new ThrustGame(null, { boxes: [box] });
    expect(game.getMainBox()).toBe(box);
  });

  test('returns top-left-most box among equal-priority boxes', () => {
    const top    = { x: 200, y: 50,  width: 50, height: 50 };
    const bottom = { x: 100, y: 200, width: 50, height: 50 };
    const game = new ThrustGame(null, { boxes: [bottom, top] });
    expect(game.getMainBox()).toBe(top);
  });

  test('breaks y tie by choosing the left-most box', () => {
    const right = { x: 300, y: 100, width: 50, height: 50 };
    const left  = { x: 100, y: 100, width: 50, height: 50 }; // same y, smaller x
    const game = new ThrustGame(null, { boxes: [right, left] });
    expect(game.getMainBox()).toBe(left);
  });

  test('prefers a red box over a white box regardless of position', () => {
    const white = { x: 50,  y: 50,  width: 60, height: 40 }; // top-left but no colour
    const red   = { x: 300, y: 300, width: 60, height: 40, backgroundColor: { r: 255, g: 140, b: 140 } };
    const game = new ThrustGame(null, { boxes: [white, red] });
    expect(game.getMainBox()).toBe(red);
  });

  test('prefers an orange box over a white box', () => {
    const white  = { x: 50,  y: 50,  width: 60, height: 40 };
    const orange = { x: 300, y: 300, width: 60, height: 40, backgroundColor: { r: 255, g: 200, b: 140 } };
    const game = new ThrustGame(null, { boxes: [white, orange] });
    expect(game.getMainBox()).toBe(orange);
  });

  test('prefers a red box over an orange box', () => {
    const orange = { x: 50, y: 50, width: 60, height: 40, backgroundColor: { r: 255, g: 200, b: 140 } };
    const red    = { x: 300, y: 300, width: 60, height: 40, backgroundColor: { r: 255, g: 140, b: 140 } };
    const game = new ThrustGame(null, { boxes: [orange, red] });
    expect(game.getMainBox()).toBe(red);
  });

  test('returns top-left-most red box when multiple red boxes exist', () => {
    const redA = { x: 200, y: 100, width: 60, height: 40, backgroundColor: { r: 255, g: 140, b: 140 } };
    const redB = { x: 100, y: 50,  width: 60, height: 40, backgroundColor: { r: 255, g: 140, b: 140 } };
    const game = new ThrustGame(null, { boxes: [redA, redB] });
    expect(game.getMainBox()).toBe(redB); // lower y wins
  });

  test('spawn x aligns with main box centre', () => {
    const mainBox = { x: 400, y: 300, width: 80, height: 60, backgroundColor: { r: 255, g: 140, b: 140 } };
    const other   = { x: 50,  y: 50,  width: 80, height: 60 }; // top-left but lower priority
    const game = new ThrustGame(null, { boxes: [other, mainBox] });
    const player = game.createPlayer();
    expect(player.x).toBe(mainBox.x);
  });

  test('spawn y is above the top edge of the main box', () => {
    const mainBox = { x: 400, y: 300, width: 80, height: 60, backgroundColor: { r: 255, g: 140, b: 140 } };
    const game = new ThrustGame(null, { boxes: [mainBox] });
    const player = game.createPlayer();
    const topEdge = mainBox.y - mainBox.height / 2; // 270
    expect(player.y).toBeLessThan(topEdge);
  });

  test('delegates colour priority to mindMap.getBoxColorPriority when available', () => {
    // low-priority red box (inline logic would score it 1), but the delegate
    // overrides and says priority 999 (unimportant) for the red box and 1 for
    // the other box — whichever the delegate picks should win.
    const redBox   = { x: 500, y: 500, width: 60, height: 40, backgroundColor: { r: 255, g: 140, b: 140 } };
    const otherBox = { x: 50,  y: 50,  width: 60, height: 40 };

    // mindMap exposes getBoxColorPriority that inverts priorities relative to
    // what the inline fallback would return.
    const mindMap = {
      boxes: [redBox, otherBox],
      getBoxColorPriority: (box) => box === redBox ? 999 : 1
    };

    const game = new ThrustGame(null, mindMap);
    // The delegate says otherBox has priority 1 (highest), so it should win.
    expect(game.getMainBox()).toBe(otherBox);
  });
});

describe('ThrustGame Integration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-03-27T10:00:00Z'));
  });
  test('should handle respawn with new spawn logic', () => {
    const mockMindMap = {
      boxes: [
        { x: 100, y: 100, width: 50, height: 50 }
      ]
    };

    const game = new ThrustGame(null, mockMindMap);
    game.active = true; // game must be active to process update() and respawn
    game.handlePlayerDeath(); // kills player and sets respawnTime
    
    // Fast-forward time past the respawn delay
    jest.advanceTimersByTime(ThrustConstants.PLAYER.RESPAWN_TIME + 2000);
    game.update(); // triggers respawn check

    expect(game.player.alive).toBe(true);
    expect(game.player.vx).toBe(0);
    // After one update frame, vy will have one frame of gravity applied: 0.03 * 0.98 = 0.0294
    expect(game.player.vy).toBeCloseTo(0.0294, 4);

    // Should not be inside the box
    const box = mockMindMap.boxes[0];
    const halfW = box.width / 2;
    const halfH = box.height / 2;
    const isInside = (
      game.player.x >= box.x - halfW &&
      game.player.x <= box.x + halfW &&
      game.player.y >= box.y - halfH &&
      game.player.y <= box.y + halfH
    );
    expect(isInside).toBe(false);
  });
});

describe('ThrustGame Constructor Initialization', () => {
  test('lastBroadcast is initialized to 0', () => {
    const game = new ThrustGame(null, null);
    expect(game.lastBroadcast).toBe(0);
  });

  test('multiplayerInitialized is initialized to false', () => {
    const game = new ThrustGame(null, null);
    expect(game.multiplayerInitialized).toBe(false);
  });
});

describe('ThrustBullet Remote vs Local Movement', () => {
  test('local bullet moves by its velocity each frame', () => {
    const b = new ThrustBullet({ x: 10, y: 20, vx: 3, vy: 4, clientId: null });
    b.update();
    expect(b.x).toBeCloseTo(13);
    expect(b.y).toBeCloseTo(24);
  });

  test('remote bullet does NOT apply velocity directly — only lerps to target', () => {
    // clientId is numeric, matching Yjs Awareness clientId in production
    const b = new ThrustBullet({ x: 0, y: 0, vx: 10, vy: 0, clientId: 42 });
    b.targetX = 50; // far ahead
    b.targetY = 0;

    b.update(); // targetX becomes 60, lerp factor 0.2 → x = 0 + (60-0)*0.2 = 12

    // x should only move via the lerp, not also by raw vx (which would add another 10)
    expect(b.x).toBeCloseTo(12);
    expect(b.y).toBeCloseTo(0);
    // Verify it did NOT also add vx on top of the lerp
    expect(b.x).not.toBeCloseTo(22); // 10 (direct) + 12 (lerp) would be ~22
  });

  test('remote bullet target advances by velocity each frame (dead-reckoning)', () => {
    const b = new ThrustBullet({ x: 0, y: 0, vx: 5, vy: 2, clientId: 42 });
    b.targetX = 10;
    b.targetY = 4;
    b.update();
    // targetX should advance from 10 to 15, targetY from 4 to 6
    expect(b.targetX).toBeCloseTo(15);
    expect(b.targetY).toBeCloseTo(6);
  });

  test('clientId of 0 is treated as remote (numeric boundary)', () => {
    // Yjs clientId can be 0; must not fall through to local bullet path
    const b = new ThrustBullet({ x: 0, y: 0, vx: 10, vy: 0, clientId: 0 });
    b.targetX = 50;
    b.targetY = 0;

    b.update(); // targetX → 60, lerp → x = 12

    expect(b.x).toBeCloseTo(12);
    expect(b.x).not.toBeCloseTo(22); // would be 22 if misclassified as local
  });

  test('local bullet lifetime decrements each frame', () => {
    const b = new ThrustBullet({ x: 0, y: 0, vx: 1, vy: 0, lifetime: 10, clientId: null });
    b.update();
    expect(b.lifetime).toBe(9);
  });

  test('remote bullet lifetime decrements each frame', () => {
    const b = new ThrustBullet({ x: 0, y: 0, vx: 1, vy: 0, lifetime: 10, clientId: 42 });
    b.update();
    expect(b.lifetime).toBe(9);
  });
});
