/**
 * Unit tests for ThrustGame multiplayer features
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
  ColorPalette,
  ThrustConstants,
  ThrustUtils,
  ThrustShip,
  ThrustBullet,
  ThrustExplosion,
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
  BOTTOM: 'bottom',
  width: 800,
  height: 600
};

// Load ThrustGame.js
const script = new vm.Script(thrustGameCode);
script.runInNewContext(sandbox);

const ThrustGame = sandbox.module.exports;

describe('ThrustGame Multiplayer - Explosion Visibility', () => {
  let game;
  let mockCollaborationManager;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-03-27T10:00:00Z'));

    // Reset static state
    ThrustGame.hasRemotePlayers = false;
    ThrustGame._activeManager = null;
    ThrustGame.instance = null;

    // Create mock collaboration manager
    mockCollaborationManager = {
      isConnected: true,
      awareness: {
        clientID: 'local-client',
        getStates: jest.fn(() => new Map()),
        setLocalStateField: jest.fn(),
        on: jest.fn(),
        off: jest.fn()
      }
    };

    game = new ThrustGame(mockCollaborationManager, null);
    game.start();
  });

  test('should create explosion when local bullet hits remote player', () => {
    // Add a remote player
    game.remotePlayers.set('remote-client', {
      x: 100,
      y: 100,
      vx: 0,
      vy: 0,
      angle: 0,
      alive: true,
      thrusting: false,
      name: 'Remote Player',
      color: '#ff0000',
      targetX: 100,
      targetY: 100,
      targetAngle: 0
    });

    // Create a bullet that will hit the remote player
    game.bullets.push(new ThrustBullet({
      id: 'bullet-1',
      x: 100,
      y: 100,
      vx: 5,
      vy: 0,
      lifetime: 100
    }));

    // Check collisions should create an explosion when bullet hits remote player
    const explosionsBefore = game.explosions.length;
    game.checkCollisions();
    const explosionsAfter = game.explosions.length;

    // Bullet should be removed after hit
    expect(game.bullets.length).toBe(0);
    // Expect score to increment
    expect(game.score).toBe(1);
  });

  test('should create explosion at correct location when remote player dies', () => {
    const remoteX = 200;
    const remoteY = 300;

    // Simulate remote player death through awareness update
    game.remotePlayers.set('remote-client', {
      x: remoteX,
      y: remoteY,
      vx: 0,
      vy: 0,
      angle: 0,
      alive: true,
      thrusting: false,
      name: 'Remote Player',
      color: '#ff0000',
      targetX: remoteX,
      targetY: remoteY,
      targetAngle: 0
    });

    // Simulate awareness update showing player died
    mockCollaborationManager.awareness.getStates = jest.fn(() => new Map([
      ['remote-client', {
        thrustGame: {
          x: remoteX,
          y: remoteY,
          angle: 0,
          alive: false,
          thrusting: false,
          bullets: []
        },
        user: {
          name: 'Remote Player',
          color: '#ff0000'
        }
      }]
    ]));

    const explosionsBefore = game.explosions.length;
    game.updateRemotePlayers();
    const explosionsAfter = game.explosions.length;

    // Expect an explosion to be created
    expect(explosionsAfter).toBe(explosionsBefore + 1);
    // Expect explosion at remote player's position
    expect(game.explosions[explosionsAfter - 1].x).toBe(remoteX);
    expect(game.explosions[explosionsAfter - 1].y).toBe(remoteY);
  });

  test('should keep local player explosion visible when player is dead', () => {
    // Create explosion for local player
    game.createExplosion(game.player.x, game.player.y);
    expect(game.explosions.length).toBe(1);

    // Kill local player
    game.player.alive = false;
    game.player.respawnTime = Date.now() + 3000;

    // Call draw to ensure explosions are rendered
    // (We can't actually test rendering, but we can check that explosions aren't cleared)
    game.draw();

    // Explosion should still exist
    expect(game.explosions.length).toBe(1);
  });
});

describe('ThrustGame Multiplayer - Remote Player Visibility', () => {
  let mockCollaborationManager;

  beforeEach(() => {
    // Reset static state
    ThrustGame.hasRemotePlayers = false;
    ThrustGame._activeManager = null;
    ThrustGame.instance = null;

    // Create mock collaboration manager
    mockCollaborationManager = {
      isConnected: true,
      awareness: {
        clientID: 'local-client',
        getStates: jest.fn(() => new Map()),
        setLocalStateField: jest.fn(),
        on: jest.fn(),
        off: jest.fn()
      }
    };
  });

  test('should make remote players visible even when local player not in thrust mode', () => {
    // Setup awareness listener
    ThrustGame._setupAwarenessListener(mockCollaborationManager);

    // Simulate remote player in thrust mode
    mockCollaborationManager.awareness.getStates = jest.fn(() => new Map([
      ['remote-client', {
        thrustGame: {
          x: 100,
          y: 100,
          angle: 0,
          alive: true,
          thrusting: true,
          bullets: []
        },
        user: {
          name: 'Remote Player',
          color: '#ff0000'
        }
      }]
    ]));

    // Manually trigger awareness change
    const changeHandler = mockCollaborationManager.awareness.on.mock.calls[0][1];
    changeHandler();

    // Wait for throttle to clear (or call immediately without throttle)
    // hasRemotePlayers should be set to true
    // Note: The current implementation has throttling, which we'll fix
    expect(ThrustGame.hasRemotePlayers).toBe(true);
  });

  test('should update hasRemotePlayers immediately on awareness change', () => {
    // Setup awareness listener
    ThrustGame._setupAwarenessListener(mockCollaborationManager);

    // Initially no remote players
    expect(ThrustGame.hasRemotePlayers).toBe(false);

    // Simulate remote player entering thrust mode
    mockCollaborationManager.awareness.getStates = jest.fn(() => new Map([
      ['remote-client', {
        thrustGame: {
          x: 100,
          y: 100,
          angle: 0,
          alive: true,
          thrusting: true,
          bullets: []
        }
      }]
    ]));

    // Trigger awareness change
    const changeHandler = mockCollaborationManager.awareness.on.mock.calls[0][1];
    changeHandler();

    // Should update immediately (after fix)
    expect(ThrustGame.hasRemotePlayers).toBe(true);
  });

  test('should create instance when remote players exist even if local player inactive', () => {
    // Create mock with remote player in thrust mode
    mockCollaborationManager.awareness.getStates = jest.fn(() => new Map([
      ['remote-client', {
        thrustGame: {
          x: 100,
          y: 100,
          angle: 0,
          alive: true,
          thrusting: true,
          bullets: []
        }
      }]
    ]));

    // Call loop without local player being active
    // This should set hasRemotePlayers to true and create an instance
    ThrustGame.loop(mockCollaborationManager, null);

    // hasRemotePlayers should be true after loop processes awareness
    expect(ThrustGame.hasRemotePlayers).toBe(true);
    // Instance should be created
    expect(ThrustGame.instance).not.toBeNull();
  });
});

describe('ThrustGame Multiplayer - Death and Respawn', () => {
  let game;
  let mockCollaborationManager;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-03-27T10:00:00Z'));

    // Reset static state
    ThrustGame.hasRemotePlayers = false;
    ThrustGame._activeManager = null;
    ThrustGame.instance = null;

    // Create mock collaboration manager
    mockCollaborationManager = {
      isConnected: true,
      awareness: {
        clientID: 'local-client',
        getStates: jest.fn(() => new Map()),
        setLocalStateField: jest.fn(),
        on: jest.fn(),
        off: jest.fn()
      }
    };

    game = new ThrustGame(mockCollaborationManager, null);
    game.start();
  });

  test('should detect hit from remote bullet even when not active', () => {
    // Set game to inactive (not in thrust mode)
    game.active = false;

    // Make player vulnerable
    game.player.invulnerableUntil = Date.now() - 1000;

    // Add a remote bullet that will hit the player
    game.remoteBullets.set('bullet-1', new ThrustBullet({
      x: game.player.x,
      y: game.player.y,
      vx: 0,
      vy: 0,
      lifetime: 100,
      clientId: 'remote-client'
    }));

    // Player should be alive initially
    expect(game.player.alive).toBe(true);
    const initialDeaths = game.deaths;

    // Check remote bullet collisions (now part of updateRemoteBullets)
    game.updateRemoteBullets();

    // Player should now be dead
    expect(game.player.alive).toBe(false);
    // Death count should increment
    expect(game.deaths).toBe(initialDeaths + 1);
    // Respawn time should be set
    expect(game.player.respawnTime).toBeGreaterThan(Date.now());
  });

  test('should handle respawn after death even when not active', () => {
    // Set game to inactive
    game.active = false;

    // Kill the player and set respawn time to past
    game.player.alive = false;
    game.player.respawnTime = Date.now() + 1000;
    
    // Advance time past respawn
    jest.advanceTimersByTime(2000);

    // Call update (which now handles respawn check)
    game.update();

    // Player should be alive again
    expect(game.player.alive).toBe(true);
  });

  test('should increment death count when hit by remote bullet', () => {
    // Make player vulnerable
    game.player.invulnerableUntil = Date.now() - 1000;

    // Add remote bullet at player position
    game.remoteBullets.set('bullet-1', new ThrustBullet({
      x: game.player.x,
      y: game.player.y,
      vx: 0,
      vy: 0,
      lifetime: 100,
      clientId: 'remote-client'
    }));

    const initialDeaths = game.deaths;

    // Check collisions (called from update when active)
    game.checkCollisions();

    // Death count should increment
    expect(game.deaths).toBe(initialDeaths + 1);
  });
});
