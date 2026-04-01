/**
 * Unit tests for ThrustGame health and healing logic
 * Covers: lazy-init, damage, recovery, deletion, sync, zero-overhead guarantees,
 *         and the MindMap.onBoxHealthChanged encapsulation contract.
 */

const vm = require('vm');
const fs = require('fs');
const path = require('path');

// Mock dependencies
const ColorPalette = {
    BASE: { DANGER: { r: 255, g: 0, b: 0 } },
    toHex: jest.fn(() => '#ff0000'),
    getBoxBackgroundPalette: jest.fn(() => ({}))
};

const Utils = {
    Logger: {
        debug: jest.fn(),
        state: jest.fn(),
        collab: jest.fn(),
        error: jest.fn()
    },
    generateUUID: jest.fn(() => 'test-uuid-' + Math.random()),
    sanitizeText: jest.fn((t) => t),
    getClampedZoomFactor: jest.fn(() => 1.0),
    applyFill: jest.fn(),
    applyStroke: jest.fn(),
    isValidNumber: (v) => typeof v === 'number' && isFinite(v)
};

const ThrustConstants = require('../../src/ThrustConstants');
const ThrustUtils = require('../../src/ThrustUtils');
const ThrustShip = require('../../src/ThrustShip');
const ThrustBullet = require('../../src/ThrustBullet');
const ThrustExplosion = require('../../src/ThrustExplosion');

const thrustGameCode = fs.readFileSync(path.join(__dirname, '../../src/ThrustGame.js'), 'utf8');
const textBoxCode = fs.readFileSync(path.join(__dirname, '../../src/TextBox.js'), 'utf8');

// Create a sandbox context
const sandbox = {
    ColorPalette,
    ThrustConstants,
    ThrustUtils,
    ThrustShip,
    ThrustBullet,
    ThrustExplosion,
    Utils,
    console,
    get Date() { return Date; }, // Use getter to follow Jest's fake timers
    Math,
    get setTimeout() { return setTimeout; },
    get clearTimeout() { return clearTimeout; },
    get setInterval() { return setInterval; },
    get clearInterval() { return clearInterval; },
    module: { exports: {} },
    globalThis: {},
    window: {},
    // p5.js mocks
    push: jest.fn(),
    pop: jest.fn(),
    translate: jest.fn(),
    rotate: jest.fn(),
    fill: jest.fn(),
    noStroke: jest.fn(),
    stroke: jest.fn(),
    strokeWeight: jest.fn(),
    noFill: jest.fn(),
    circle: jest.fn(),
    rect: jest.fn(),
    textSize: jest.fn(),
    textWidth: jest.fn(() => 10),
    millis: jest.fn(() => Date.now()),
    constrain: jest.fn((v, min, max) => Math.max(min, Math.min(max, v))),
    max: Math.max,
    min: Math.min,
    CENTER: 'center',
    TOP: 'top',
    BOTTOM: 'bottom'
};

// Load scripts into sandbox
const tbScript = new vm.Script(textBoxCode);
tbScript.runInNewContext(sandbox);

// The TextBox class is defined in globalThis in the sandbox
const TextBox = sandbox.globalThis.TextBox;

const tgScript = new vm.Script(thrustGameCode);
tgScript.runInNewContext(sandbox);
const ThrustGame = sandbox.module.exports;

// Mock MindMap — represents the static class as used by the game
const MindMapStatic = {
    onBoxChange: null,
    onBoxDelete: null,
    onBoxHealthChanged: null
};
sandbox.MindMap = MindMapStatic;

// Mock mindMap instance
const mockMindMap = {
    boxes: [],
    getBoxById: jest.fn((id) => mockMindMap.boxes.find(b => b.id === id)),
    _performBoxDeletion: jest.fn(),
    _wrapInTransaction: jest.fn((op) => op())
};
sandbox.mindMap = mockMindMap;

// ─────────────────────────────────────────────────────────────────────────────
// Helper: simulate a CollabManager health change arriving from Yjs
// In production this is _applyBoxFromYjs; here we invoke the callback directly.
// ─────────────────────────────────────────────────────────────────────────────
function simulateRemoteHealthUpdate(boxId, health, game) {
    // Apply the health to the box (as _applyBoxFromYjs does)
    const box = mockMindMap.boxes.find(b => b.id === boxId);
    if (box) {
        if (typeof health === 'number') {
            box.health = health;
            box.lastHitTime = Date.now();
        } else {
            delete box.health;
            delete box.lastHitTime;
        }
    }
    // Call the callback (as CollaborationManager does — without naming ThrustGame)
    if (MindMapStatic.onBoxHealthChanged) {
        MindMapStatic.onBoxHealthChanged(boxId, health);
    }
}

describe('ThrustGame Health and Healing', () => {
    let game;
    let box;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-03-27T22:00:00Z'));

        mockMindMap.boxes = [];
        jest.clearAllMocks();
        MindMapStatic.onBoxChange = null;
        MindMapStatic.onBoxDelete = null;
        MindMapStatic.onBoxHealthChanged = null;

        sandbox.mindMap = mockMindMap;

        box = new TextBox(100, 100, "Test Box");
        box.id = 'box-1';
        mockMindMap.boxes.push(box);

        game = new ThrustGame(null, mockMindMap);
        game.start();
    });

    afterEach(() => {
        if (game && game.active) game.stop();
        // Clear any static healing interval left by stop() to prevent cross-test bleed
        if (ThrustGame._healingInterval !== null) {
            clearInterval(ThrustGame._healingInterval);
            ThrustGame._healingInterval = null;
        }
        jest.useRealTimers();
    });

    // =========================================================================
    // ENCAPSULATION: MindMap.onBoxHealthChanged callback
    // =========================================================================

    describe('Encapsulation via MindMap.onBoxHealthChanged', () => {
        test('ThrustGame registers onBoxHealthChanged when started', () => {
            // After start(), the callback must be registered
            expect(MindMapStatic.onBoxHealthChanged).not.toBeNull();
            expect(typeof MindMapStatic.onBoxHealthChanged).toBe('function');
        });

        test('ThrustGame deregisters onBoxHealthChanged when stopped', () => {
            game.stop();
            expect(MindMapStatic.onBoxHealthChanged).toBeNull();
        });

        test('CollaborationManager can call onBoxHealthChanged without naming ThrustGame', () => {
            // CollabManager should only need to call MindMap.onBoxHealthChanged
            // — it must NOT reference ThrustGame.instance directly
            expect(game.damagedBoxIds.has(box.id)).toBe(false);

            // Simulate what _applyBoxFromYjs does:
            simulateRemoteHealthUpdate(box.id, 3, game);

            // ThrustGame should now be tracking this box
            expect(game.damagedBoxIds.has(box.id)).toBe(true);
        });

        test('Remote healed box is untracked via callback', () => {
            // Start tracking a damaged box
            game.damagedBoxIds.add(box.id);

            // Simulate remote heal (health field missing in Yjs data = fully healed)
            simulateRemoteHealthUpdate(box.id, undefined, game);

            expect(game.damagedBoxIds.has(box.id)).toBe(false);
        });

        test('Callback passes through undefined health correctly for full heal', () => {
            // When Yjs data has no health field, CollabManager calls onBoxHealthChanged(id, undefined)
            game.damagedBoxIds.add(box.id);

            MindMapStatic.onBoxHealthChanged(box.id, undefined);

            expect(game.damagedBoxIds.has(box.id)).toBe(false);
        });

        test('Callback calling after stop() does not throw (callback is null)', () => {
            game.stop();
            // CollabManager might fire the callback after stop() — this must be safe
            expect(() => {
                if (MindMapStatic.onBoxHealthChanged) {
                    MindMapStatic.onBoxHealthChanged(box.id, 3);
                }
            }).not.toThrow();
        });

        test('Remote health update starts recovery for joining users (no local thrust mode)', () => {
            // Simulate a user who joins a room where a box is already damaged,
            // but they have NOT started thrust mode yet (game is active in our test, 
            // simulating the observer path firing while ThrustGame is running).
            // The key is: onBoxHealthChanged must be wired up BEFORE network sync fires.
            expect(game.damagedBoxIds.size).toBe(0);

            // Remote Yjs update arrives with damaged health
            simulateRemoteHealthUpdate(box.id, 2, game);

            // Must be tracked for recovery
            expect(game.damagedBoxIds.has(box.id)).toBe(true);
            expect(game.damagedBoxIds.size).toBe(1);
        });
    });

    // =========================================================================
    // SYNC: Single Yjs write per bullet hit
    // =========================================================================

    describe('Single Yjs write per bullet hit (no double-sync)', () => {
        test('applyBulletForceToBox uses collaborationManager.syncBoxToYjs when connected', () => {
            const syncSpy = jest.fn();
            const mockCollab = { isConnected: true, syncBoxToYjs: syncSpy };
            game.collaborationManager = mockCollab;

            const bullet = { x: 100, y: 100, vx: 5, vy: 0 };
            box.health = 3;
            game.applyBulletForceToBox(box, bullet);

            // Must sync exactly ONCE per hit (position + health bundled)
            expect(syncSpy).toHaveBeenCalledTimes(1);
            expect(syncSpy).toHaveBeenCalledWith(box, false, null);
        });

        test('applyBulletForceToBox does NOT call MindMap.onBoxChange when connected', () => {
            const onBoxChangeSpy = jest.fn();
            MindMapStatic.onBoxChange = onBoxChangeSpy;
            const mockCollab = { isConnected: true, syncBoxToYjs: jest.fn() };
            game.collaborationManager = mockCollab;

            const bullet = { x: 100, y: 100, vx: 5, vy: 0 };
            box.health = 3;
            game.applyBulletForceToBox(box, bullet);

            // MindMap.onBoxChange must NOT be called—that would be a duplicate write
            expect(onBoxChangeSpy).not.toHaveBeenCalled();
        });

        test('applyBulletForceToBox falls back to MindMap.onBoxChange when offline', () => {
            const onBoxChangeSpy = jest.fn();
            MindMapStatic.onBoxChange = onBoxChangeSpy;
            // No collaborationManager = offline mode
            game.collaborationManager = null;

            const bullet = { x: 100, y: 100, vx: 5, vy: 0 };
            box.health = 3;
            game.applyBulletForceToBox(box, bullet);

            expect(onBoxChangeSpy).toHaveBeenCalledWith(box, false, null);
        });

        test('applyBulletForceToBox does NOT sync dead box via syncBoxToYjs', () => {
            const syncSpy = jest.fn();
            const mockCollab = { isConnected: true, syncBoxToYjs: syncSpy };
            game.collaborationManager = mockCollab;

            const bullet = { x: 100, y: 100, vx: 5, vy: 0 };
            box.health = 1; // Final hit — will kill box
            game.applyBulletForceToBox(box, bullet);

            // Box is dead — syncBoxToYjs must NOT be called (deletion handles it)
            expect(syncSpy).not.toHaveBeenCalled();
        });
    });

    // =========================================================================
    // LAZY INITIALIZATION
    // =========================================================================

    describe('Lazy initialization', () => {
        test('should lazy-initialize health and lastHitTime only when damaged', () => {
            expect(box.health).toBeUndefined();
            expect(box.lastHitTime).toBeUndefined();

            box.reduceHealth();

            expect(box.health).toBe(4);
            expect(box.lastHitTime).toBe(Date.now());
        });

        test('health property must not exist on fresh boxes', () => {
            const fresh = new TextBox(200, 200, "Fresh");
            expect('health' in fresh).toBe(false);
            expect('lastHitTime' in fresh).toBe(false);
        });
    });

    // =========================================================================
    // HEALTH DOTS RENDERING
    // =========================================================================

    describe('Health dots rendering', () => {
        test('should show 1 filled red dot after 1 hit (reverse logic)', () => {
            box.health = 4;
            box.drawHealthDots();

            expect(sandbox.circle).toHaveBeenCalledTimes(5);
            expect(Utils.applyFill).toHaveBeenCalledTimes(1);
            expect(Utils.applyStroke).toHaveBeenCalledTimes(4);
        });

        test('should show 5 filled red dots after 5 hits', () => {
            box.health = 0;
            box.drawHealthDots();

            expect(Utils.applyFill).toHaveBeenCalledTimes(5);
            expect(Utils.applyStroke).toHaveBeenCalledTimes(0);
        });

        test('should hide health dots when health is full (5)', () => {
            box.health = 5;
            box.drawHealthDots();
            expect(sandbox.circle).not.toHaveBeenCalled();
        });

        test('should hide health dots when health is undefined (never damaged)', () => {
            box.drawHealthDots();
            expect(sandbox.circle).not.toHaveBeenCalled();
        });
    });

    // =========================================================================
    // HEALING / RECOVERY
    // =========================================================================

    describe('Health recovery', () => {
        test('should heal 1 HP every 10 seconds (robust)', () => {
            const delay = ThrustConstants.HEALTH.RECOVERY_DELAY;
            MindMapStatic.onBoxChange = jest.fn(); // must be a spy for assertion
            
            box.health = 3;
            box.lastHitTime = Date.now();
            game.damagedBoxIds.add(box.id);

            jest.advanceTimersByTime(delay + 5000); 
            game.updateHealthRecovery();
            
            expect(box.health === undefined || box.health > 3).toBe(true);
            expect(MindMapStatic.onBoxChange).toHaveBeenCalled();
        });

        test('should reset healing timer when box is hit again', () => {
            const delay = ThrustConstants.HEALTH.RECOVERY_DELAY;
            box.health = 4;
            box.lastHitTime = Date.now();
            game.damagedBoxIds.add(box.id);

            jest.advanceTimersByTime(8000);
            game.updateHealthRecovery();
            expect(box.health).toBe(4);

            box.reduceHealth();
            expect(box.health).toBe(3);
            expect(box.lastHitTime).toBe(Date.now());

            jest.advanceTimersByTime(5000);
            game.updateHealthRecovery();
            expect(box.health).toBe(3);

            jest.advanceTimersByTime(5000);
            game.updateHealthRecovery();
            expect(box.health).toBe(4);
        });

        test('should handle multiple damaged boxes independently', () => {
            const box2 = new TextBox(200, 200, "Box 2");
            box2.id = 'box-2';
            mockMindMap.boxes.push(box2);

            box.health = 4;
            box.lastHitTime = Date.now();
            game.damagedBoxIds.add(box.id);

            jest.advanceTimersByTime(5000);
            box2.health = 4;
            box2.lastHitTime = Date.now();
            game.damagedBoxIds.add(box2.id);

            jest.advanceTimersByTime(5000);
            game.updateHealthRecovery();
            
            expect(box.health).toBeUndefined(); // Box 1 fully healed (property deleted)
            expect(box2.health).toBe(4); // Box 2 NOT yet

            jest.advanceTimersByTime(5000);
            game.updateHealthRecovery();
            
            expect(box2.health).toBeUndefined(); // Box 2 fully healed
        });

        test('should restore lazy-init state when fully healed', () => {
            box.health = 4;
            box.lastHitTime = Date.now();
            game.damagedBoxIds.add(box.id);

            jest.advanceTimersByTime(ThrustConstants.HEALTH.RECOVERY_DELAY + 1000);
            game.updateHealthRecovery();

            expect(box.health).toBeUndefined();
            expect(box.lastHitTime).toBeUndefined();
            expect('health' in box).toBe(false);
            expect('lastHitTime' in box).toBe(false);
        });

        test('remote-damaged box gets tracked and heals via callback path', () => {
            // Simulate remote user shoots a box; we receive it via onBoxHealthChanged
            simulateRemoteHealthUpdate(box.id, 3, game);
            expect(game.damagedBoxIds.has(box.id)).toBe(true);

            // Wait for recovery
            jest.advanceTimersByTime(ThrustConstants.HEALTH.RECOVERY_DELAY + 1000);
            game.updateHealthRecovery();

            // Health increased by 1 (3→4)
            expect(box.health).toBe(4);
        });
    });

    // =========================================================================
    // DELETION
    // =========================================================================

    describe('Box deletion', () => {
        test('should trigger box deletion when health reaches 0 (with transaction)', () => {
            box.health = 1;
            box.lastHitTime = Date.now();
            
            box.reduceHealth();
            
            expect(box.health).toBe(0);
            expect(mockMindMap._wrapInTransaction).toHaveBeenCalled();
            expect(mockMindMap._performBoxDeletion).toHaveBeenCalledWith([box]);
        });

        test('applyBulletForceToBox on dead box does NOT call syncBoxToYjs', () => {
            const syncSpy = jest.fn();
            game.collaborationManager = { isConnected: true, syncBoxToYjs: syncSpy };

            const bullet = { x: 100, y: 100, vx: 5, vy: 0 };
            box.health = 1;
            game.applyBulletForceToBox(box, bullet);

            expect(box.health).toBe(0);
            expect(syncSpy).not.toHaveBeenCalled();
        });
    });

    // =========================================================================
    // TRACKED SET (damagedBoxIds)
    // =========================================================================

    describe('damagedBoxIds tracking', () => {
        test('should start tracking damaged box via notifyBoxHealthChanged', () => {
            expect(game.damagedBoxIds.has(box.id)).toBe(false);
            
            game.notifyBoxHealthChanged(box.id, 4);
            
            expect(game.damagedBoxIds.has(box.id)).toBe(true);
            expect(game.damagedBoxIds.size).toBe(1);
        });

        test('should stop tracking box via notifyBoxHealthChanged when healed (value 5)', () => {
            game.damagedBoxIds.add(box.id);
            
            game.notifyBoxHealthChanged(box.id, 5);
            
            expect(game.damagedBoxIds.has(box.id)).toBe(false);
        });

        test('should stop tracking box via notifyBoxHealthChanged when health is undefined', () => {
            game.damagedBoxIds.add(box.id);
            
            game.notifyBoxHealthChanged(box.id, undefined);
            
            expect(game.damagedBoxIds.has(box.id)).toBe(false);
        });

        test('should not track box at full health', () => {
            game.notifyBoxHealthChanged(box.id, 5);
            expect(game.damagedBoxIds.has(box.id)).toBe(false);
        });

        test('notifyBoxHealthChanged is idempotent for repeated calls', () => {
            game.notifyBoxHealthChanged(box.id, 3);
            game.notifyBoxHealthChanged(box.id, 3);
            game.notifyBoxHealthChanged(box.id, 3);
            
            expect(game.damagedBoxIds.size).toBe(1);
            
            game.notifyBoxHealthChanged(box.id, 5);
            game.notifyBoxHealthChanged(box.id, 5);
            
            expect(game.damagedBoxIds.size).toBe(0);
        });
    });

    // =========================================================================
    // ZERO-OVERHEAD WHEN DORMANT
    // =========================================================================

    describe('Zero-overhead guarantees', () => {
        test('updateHealthRecovery exits early when no damaged boxes', () => {
            expect(game.damagedBoxIds.size).toBe(0);
            
            jest.advanceTimersByTime(2000);
            
            const getMock = mockMindMap.getBoxById;
            getMock.mockClear();
            
            game.updateHealthRecovery();
            
            expect(getMock).not.toHaveBeenCalled();
        });

        test('updateHealthRecovery is throttled to once per second', () => {
            box.health = 3;
            box.lastHitTime = Date.now();
            game.damagedBoxIds.add(box.id);
            
            jest.advanceTimersByTime(1100);
            game.updateHealthRecovery();
            const firstCallCount = mockMindMap.getBoxById.mock.calls.length;
            expect(firstCallCount).toBeGreaterThan(0);
            
            mockMindMap.getBoxById.mockClear();
            game.updateHealthRecovery();
            expect(mockMindMap.getBoxById).not.toHaveBeenCalled();
            
            jest.advanceTimersByTime(1100);
            game.updateHealthRecovery();
            expect(mockMindMap.getBoxById).toHaveBeenCalled();
        });

        test('drawHealthDots is zero-overhead for undamaged boxes', () => {
            sandbox.push.mockClear();
            sandbox.circle.mockClear();
            
            box.drawHealthDots();
            
            expect(sandbox.push).not.toHaveBeenCalled();
            expect(sandbox.circle).not.toHaveBeenCalled();
        });

        test('onBoxHealthChanged is null after stop() — no stale reference', () => {
            expect(MindMapStatic.onBoxHealthChanged).not.toBeNull();
            game.stop();
            expect(MindMapStatic.onBoxHealthChanged).toBeNull();
        });
    });

    // =========================================================================
    // CLEANUP
    // =========================================================================

    describe('Cleanup behaviour', () => {
        test('should remove deleted boxes from damagedBoxIds during recovery', () => {
            game.damagedBoxIds.add('deleted-box');
            game.damagedBoxIds.add(box.id);
            box.health = 3;
            box.lastHitTime = Date.now();
            
            jest.advanceTimersByTime(1100);
            game.updateHealthRecovery();
            
            expect(game.damagedBoxIds.has('deleted-box')).toBe(false);
            expect(game.damagedBoxIds.has(box.id)).toBe(true);
        });

        test('damagedBoxIds stays clean after full cycle (damage → heal → done)', () => {
            box.health = 4;
            box.lastHitTime = Date.now();
            game.damagedBoxIds.add(box.id);
            
            jest.advanceTimersByTime(ThrustConstants.HEALTH.RECOVERY_DELAY + 1000);
            game.updateHealthRecovery();
            
            expect(game.damagedBoxIds.has(box.id)).toBe(false);
            expect(game.damagedBoxIds.size).toBe(0);
            expect(box.health).toBeUndefined();
        });

        test('re-entering thrust mode resumes healing for previously-damaged boxes', () => {
            // Damage a box while in thrust mode
            box.health = 3;
            box.lastHitTime = Date.now();
            game.damagedBoxIds.add(box.id);

            // Player exits thrust mode — instance is destroyed, damagedBoxIds is gone
            game.stop();
            game = null;

            // Verify the box still carries damage on the map (health persists on the object)
            expect(box.health).toBe(3);

            // Player re-enters thrust mode — fresh instance, empty damagedBoxIds
            const freshGame = new ThrustGame(null, mockMindMap);
            freshGame.start();

            // start() must seed damagedBoxIds from existing box state
            expect(freshGame.damagedBoxIds.has(box.id)).toBe(true);
            expect(freshGame.damagedBoxIds.size).toBe(1);

            // Advance time and verify healing resumes
            jest.advanceTimersByTime(ThrustConstants.HEALTH.RECOVERY_DELAY + 1000);
            freshGame.updateHealthRecovery();

            expect(box.health).toBe(4); // Healed once

            // Clean up
            freshGame.stop();
            game = freshGame; // restore so afterEach doesn't fail
        });
    });

    // =========================================================================
    // HARD REFRESH / SERIALIZATION
    // =========================================================================

    describe('Hard refresh — serialization round-trip', () => {
        test('toJSON saves lastHitTime when box is damaged', () => {
            box.health = 3;
            box.lastHitTime = 1234567890;

            const json = box.toJSON();

            expect(json.health).toBe(3);
            expect(json.lastHitTime).toBe(1234567890);
        });

        test('toJSON omits lastHitTime when box is undamaged', () => {
            // No health set — lazy init
            const json = box.toJSON();

            expect(json.health).toBeUndefined();
            expect(json.lastHitTime).toBeUndefined();
        });

        test('fromJSON restores health and lastHitTime from saved JSON', () => {
            const savedTime = Date.now() - 30000; // 30 seconds ago
            const json = {
                id: 'restored-box',
                x: 100, y: 100, text: 'test',
                health: 2,
                lastHitTime: savedTime
            };

            const restored = TextBox.fromJSON(json);

            expect(restored.health).toBe(2);
            expect(restored.lastHitTime).toBe(savedTime);
        });

        test('fromJSON defaults lastHitTime to Date.now() when missing (old save format)', () => {
            const before = Date.now();
            const json = {
                id: 'old-box',
                x: 100, y: 100, text: 'test',
                health: 3
                // No lastHitTime — old saves before it was serialized
            };

            const restored = TextBox.fromJSON(json);
            const after = Date.now();

            expect(restored.health).toBe(3);
            // lastHitTime should default to approximately now
            expect(restored.lastHitTime).toBeGreaterThanOrEqual(before);
            expect(restored.lastHitTime).toBeLessThanOrEqual(after);
        });

        test('box loaded from JSON heals correctly when thrust mode starts', () => {
            // Simulate a box restored from localStorage after hard refresh
            // with health saved but lastHitTime missing (old format)
            box.health = 3;
            box.lastHitTime = Date.now(); // restored via fromJSON defaulting to now

            // Thrust mode starts, sees the pre-damaged box
            game.damagedBoxIds.add(box.id);

            // Advance past recovery delay
            jest.advanceTimersByTime(ThrustConstants.HEALTH.RECOVERY_DELAY + 1000);
            game.updateHealthRecovery();

            expect(box.health).toBe(4); // healed by 1
        });

        test('box loaded from JSON with old lastHitTime heals immediately', () => {
            // lastHitTime far in the past (damage happened hours ago before reload)
            box.health = 2;
            box.lastHitTime = Date.now() - 3600000; // 1 hour ago

            game.damagedBoxIds.add(box.id);

            // Even with minimal time advance (just past throttle), healing fires
            jest.advanceTimersByTime(1100);
            game.updateHealthRecovery();

            expect(box.health).toBe(3); // healed by 1
        });
    });

    // =========================================================================
    // EDGE CASES & STABILITY
    // =========================================================================

    describe('Edge cases and stability', () => {
        test('applyBulletForceToBox handles null box gracefully', () => {
            const bullet = { x: 100, y: 100, vx: 5, vy: 0 };
            expect(() => game.applyBulletForceToBox(null, bullet)).not.toThrow();
        });

        test('applyBulletForceToBox handles zero-velocity bullet', () => {
            const bullet = { x: 100, y: 100, vx: 0, vy: 0 };
            const origHealth = box.health;
            game.applyBulletForceToBox(box, bullet);
            expect(box.health).toBe(origHealth);
        });

        test('multiple bullets hitting same box in one frame deduct correct health', () => {
            const bullet1 = { x: 100, y: 100, vx: 5, vy: 0 };
            const bullet2 = { x: 100, y: 100, vx: -5, vy: 0 };
            
            game.applyBulletForceToBox(box, bullet1);
            expect(box.health).toBe(4);
            
            game.applyBulletForceToBox(box, bullet2);
            expect(box.health).toBe(3);
        });

        test('reduceHealth handles repeated hits below zero gracefully', () => {
            box.health = 1;
            box.reduceHealth();
            expect(box.health).toBe(0);
            
            mockMindMap._wrapInTransaction.mockClear();
            box.reduceHealth();
            expect(box.health).toBe(-1);
            expect(mockMindMap._wrapInTransaction).toHaveBeenCalled();
        });
    });

    // =========================================================================
    // STRESS / PERFORMANCE
    // =========================================================================

    describe('Performance characteristics', () => {
        test('recovery loop handles large number of damaged boxes efficiently', () => {
            const DAMAGED_COUNT = 100;
            const hitTime = Date.now();
            
            for (let i = 0; i < DAMAGED_COUNT; i++) {
                const b = new TextBox(i * 50, 100, `Box ${i}`);
                b.id = `stress-box-${i}`;
                b.health = 3;
                b.lastHitTime = hitTime;
                mockMindMap.boxes.push(b);
                game.damagedBoxIds.add(b.id);
            }
            
            expect(game.damagedBoxIds.size).toBe(DAMAGED_COUNT);
            
            jest.advanceTimersByTime(ThrustConstants.HEALTH.RECOVERY_DELAY + 1000);
            
            const start = performance.now();
            game.updateHealthRecovery();
            const elapsed = performance.now() - start;
            
            expect(elapsed).toBeLessThan(50);
            
            for (let i = 0; i < DAMAGED_COUNT; i++) {
                const b = mockMindMap.boxes.find(b => b.id === `stress-box-${i}`);
                expect(b.health).toBe(4);
            }
        });

        test('100 undamaged boxes cost virtually nothing in drawHealthDots', () => {
            const boxes = [];
            for (let i = 0; i < 100; i++) {
                const b = new TextBox(i * 50, 100, `Box ${i}`);
                boxes.push(b);
            }

            sandbox.push.mockClear();
            sandbox.circle.mockClear();

            const start = performance.now();
            for (const b of boxes) b.drawHealthDots();
            const elapsed = performance.now() - start;

            // No drawing calls on undamaged boxes
            expect(sandbox.push).not.toHaveBeenCalled();
            expect(sandbox.circle).not.toHaveBeenCalled();
            // Must complete in << 1ms
            expect(elapsed).toBeLessThan(5);
        });
    });

    // =========================================================================
    // POST-SESSION HEALING LOOP (_startHealingLoop)
    // =========================================================================

    describe('Post-session healing loop (after all users exit thrust mode)', () => {
        test('stop() arms the static interval when damaged boxes remain', () => {
            box.health = 3;
            box.lastHitTime = Date.now();
            game.damagedBoxIds.add(box.id);

            expect(ThrustGame._healingInterval).toBeNull();
            game.stop();
            expect(ThrustGame._healingInterval).not.toBeNull();
        });

        test('stop() does NOT arm interval when no boxes are damaged', () => {
            // damagedBoxIds is empty
            expect(game.damagedBoxIds.size).toBe(0);
            game.stop();
            expect(ThrustGame._healingInterval).toBeNull();
        });

        test('healing loop recovers a box after recovery delay and removes itself', () => {
            MindMapStatic.onBoxChange = jest.fn();
            box.health = 4;
            box.lastHitTime = Date.now();
            game.damagedBoxIds.add(box.id);
            game.stop();

            expect(ThrustGame._healingInterval).not.toBeNull();

            // Advance past recovery delay — interval ticks every 1000ms
            jest.advanceTimersByTime(ThrustConstants.HEALTH.RECOVERY_DELAY + 1000);

            // Box should be fully healed and interval removed
            expect(box.health).toBeUndefined();
            expect('health' in box).toBe(false);
            expect(ThrustGame._healingInterval).toBeNull();
            expect(MindMapStatic.onBoxChange).toHaveBeenCalled();
        });

        test('healing loop defers to a live active instance', () => {
            box.health = 4;
            box.lastHitTime = Date.now();
            game.damagedBoxIds.add(box.id);
            game.stop();

            // Simulate a second user opening thrust mode (live instance exists)
            const liveGame = new ThrustGame(null, mockMindMap);
            liveGame.start();
            ThrustGame.instance = liveGame;

            jest.advanceTimersByTime(ThrustConstants.HEALTH.RECOVERY_DELAY + 1000);

            // The static loop deferred to the live instance — it did NOT heal directly
            // (box.health remains 4; the live instance's updateHealthRecovery owns it)
            expect(box.health).toBe(4);

            // Interval removes itself because it yielded all its IDs
            expect(ThrustGame._healingInterval).toBeNull();

            // Fully heal before stopping so stop() doesn't re-arm
            delete box.health;
            delete box.lastHitTime;
            liveGame.damagedBoxIds.clear();
            liveGame.stop();
            ThrustGame.instance = null;
        });

        test('healing loop cleans up missing/deleted boxes without throwing', () => {
            const phantomId = 'phantom-box-id';
            // Do NOT add to mockMindMap.boxes, so getBoxById returns undefined
            game.damagedBoxIds.add(phantomId);
            game.stop();

            expect(() => {
                jest.advanceTimersByTime(2000);
            }).not.toThrow();

            // Phantom removed, interval self-cancels
            expect(ThrustGame._healingInterval).toBeNull();
        });

        test('a new stop() with damage replaces a prior static healing loop', () => {
            // First session with damaged box
            box.health = 3;
            box.lastHitTime = Date.now();
            game.damagedBoxIds.add(box.id);
            game.stop();
            const firstHandle = ThrustGame._healingInterval;
            expect(firstHandle).not.toBeNull();

            // Second session starts and stops with a new damaged box
            const box2 = new TextBox(300, 300, 'Box 2');
            box2.id = 'box-2';
            box2.health = 2;
            box2.lastHitTime = Date.now();
            mockMindMap.boxes.push(box2);

            const game2 = new ThrustGame(null, mockMindMap);
            game2.start();
            game2.damagedBoxIds.add(box2.id);
            game2.stop();

            // The new interval must replace the old one
            expect(ThrustGame._healingInterval).not.toBe(firstHandle);
            expect(ThrustGame._healingInterval).not.toBeNull();

            game = game2; // let afterEach not fail
        });
    });

    // =========================================================================
    // wasExploded FLAG LIFECYCLE
    // =========================================================================

    describe('wasExploded flag lifecycle', () => {
        test('wasExploded is cleared on session start so re-entry triggers explosion', () => {
            // Simulate first session: bullet kills the box
            box.wasExploded = true;

            // End session and start a new one
            game.stop();
            const game2 = new ThrustGame(null, mockMindMap);
            game2.start();

            expect(box.wasExploded).toBeUndefined();

            game2.stop();
            game = game2; // let afterEach clean up
        });

        test('wasExploded is cleared when box fully heals via updateHealthRecovery', () => {
            box.health = 4;
            box.lastHitTime = Date.now();
            box.wasExploded = true;
            game.damagedBoxIds.add(box.id);

            jest.advanceTimersByTime(ThrustConstants.HEALTH.RECOVERY_DELAY + 1000);
            game.updateHealthRecovery();

            expect(box.health).toBeUndefined();
            expect(box.wasExploded).toBeUndefined();
        });

        test('wasExploded is cleared when box fully heals via post-session healing loop', () => {
            box.health = 4;
            box.lastHitTime = Date.now();
            box.wasExploded = true;
            game.damagedBoxIds.add(box.id);
            game.stop();

            jest.advanceTimersByTime(ThrustConstants.HEALTH.RECOVERY_DELAY + 1000);

            expect(box.wasExploded).toBeUndefined();
        });

        test('applyBulletForceToBox triggers explosion again after wasExploded cleared', () => {
            // Simulate box destroyed, wasExploded set, then cleared for new session
            box.wasExploded = undefined;
            box.health = 1;

            const explosionsBefore = game.explosions.length;
            const bullet = { x: 100, y: 100, vx: 5, vy: 0 };
            game.applyBulletForceToBox(box, bullet);

            expect(game.explosions.length).toBeGreaterThan(explosionsBefore);
            expect(box.wasExploded).toBe(true);
        });
    });
});
