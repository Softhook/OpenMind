/**
 * Unit tests for ThrustGame health and healing logic
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
        collab: jest.fn()
    },
    generateUUID: jest.fn(() => 'test-uuid-' + Math.random()),
    sanitizeText: jest.fn((t) => t),
    getClampedZoomFactor: jest.fn(() => 1.0),
    applyFill: jest.fn(),
    applyStroke: jest.fn()
};

const thrustGameCode = fs.readFileSync(path.join(__dirname, '../../src/ThrustGame.js'), 'utf8');
const textBoxCode = fs.readFileSync(path.join(__dirname, '../../src/TextBox.js'), 'utf8');

// Create a sandbox context
const sandbox = {
    ColorPalette,
    Utils,
    console,
    get Date() { return Date; }, // Use getter to follow Jest's fake timers
    Math,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
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

// Mock MindMap
const mockMindMap = {
    boxes: [],
    getBoxById: jest.fn((id) => mockMindMap.boxes.find(b => b.id === id)),
    _performBoxDeletion: jest.fn(),
    _wrapInTransaction: jest.fn((op) => op())
};
sandbox.MindMap = {
    onBoxChange: jest.fn(),
    onBoxDelete: jest.fn()
};
sandbox.mindMap = mockMindMap;

describe('ThrustGame Health and Healing', () => {
    let game;
    let box;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-03-27T22:00:00Z'));

        mockMindMap.boxes = [];
        jest.clearAllMocks();

        // Ensure sandbox.mindMap is the current mockMindMap
        sandbox.mindMap = mockMindMap;

        box = new TextBox(100, 100, "Test Box");
        box.id = 'box-1';
        mockMindMap.boxes.push(box);

        game = new ThrustGame(null, mockMindMap);
        game.start();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('should lazy-initialize health and lastHitTime only when damaged', () => {
        expect(box.health).toBeUndefined();
        expect(box.lastHitTime).toBeUndefined();

        box.reduceHealth();

        expect(box.health).toBe(4);
        expect(box.lastHitTime).toBe(Date.now());
    });

    test('should show 1 filled red dot after 1 hit (reverse logic)', () => {
        box.health = 4;
        box.drawHealthDots();

        // 5 dots total. hits = 5 - 4 = 1.
        // i=0: i < 1 is true -> fill (damage dot)
        // i=1..4: i < 1 is false -> noFill (health dot)
        expect(sandbox.circle).toHaveBeenCalledTimes(5);
        expect(Utils.applyFill).toHaveBeenCalledTimes(1);
        expect(Utils.applyStroke).toHaveBeenCalledTimes(4);
    });

    test('should show 5 filled red dots after 5 hits', () => {
        box.health = 0;
        box.drawHealthDots();

        // hits = 5 - 0 = 5.
        // All dots should be filled
        expect(Utils.applyFill).toHaveBeenCalledTimes(5);
        expect(Utils.applyStroke).toHaveBeenCalledTimes(0);
    });

    test('should hide health dots when health is full (5)', () => {
        box.health = 5;
        box.drawHealthDots();
        expect(sandbox.circle).not.toHaveBeenCalled();
    });

    test('should heal 1 HP every 10 seconds (robust)', () => {
        const delay = ThrustGame.HEALTH.RECOVERY_DELAY;
        
        // Setup boxed state manually for total control
        box.health = 3;
        box.lastHitTime = Date.now();
        game.damagedBoxIds.add(box.id);

        // Advance time significantly past the delay
        jest.advanceTimersByTime(delay + 5000); 
        game.updateHealthRecovery();
        
        // Should have healed at least once
        expect(box.health).toBeGreaterThan(3);
        expect(sandbox.MindMap.onBoxChange).toHaveBeenCalled();
    });

    test('should reset healing timer when box is hit again', () => {
        const delay = ThrustGame.HEALTH.RECOVERY_DELAY;
        box.health = 4;
        box.lastHitTime = Date.now();
        game.damagedBoxIds.add(box.id);

        // Wait 8 seconds
        jest.advanceTimersByTime(8000);
        game.updateHealthRecovery();
        expect(box.health).toBe(4);

        // Hit the box again at T+8s
        box.reduceHealth(); // now 3, lastHitTime = T+8s
        expect(box.health).toBe(3);
        expect(box.lastHitTime).toBe(Date.now());

        // Wait another 5 seconds (T+13s total, but only 5s since last hit)
        jest.advanceTimersByTime(5000);
        game.updateHealthRecovery();
        expect(box.health).toBe(3); // Should NOT have healed yet

        // Wait another 5 seconds (T+18s total, 10s since last hit)
        jest.advanceTimersByTime(5000);
        game.updateHealthRecovery();
        expect(box.health).toBe(4); // Should have healed now
    });

    test('should handle multiple damaged boxes independently', () => {
        const box2 = new TextBox(200, 200, "Box 2");
        box2.id = 'box-2';
        mockMindMap.boxes.push(box2);

        box.health = 4;
        box.lastHitTime = Date.now();
        game.damagedBoxIds.add(box.id);

        // 5 seconds later, damage box 2
        jest.advanceTimersByTime(5000);
        box2.health = 4;
        box2.lastHitTime = Date.now();
        game.damagedBoxIds.add(box2.id);

        // 5 more seconds later (T+10s)
        jest.advanceTimersByTime(5000);
        game.updateHealthRecovery();
        
        expect(box.health).toBe(5); // Box 1 heals
        expect(box2.health).toBe(4); // Box 2 NOT yet (only 5s since hit)

        // 5 more seconds later (T+15s)
        jest.advanceTimersByTime(5000);
        game.updateHealthRecovery();
        
        expect(box2.health).toBe(5); // Box 2 heals now
    });

    test('should trigger box deletion when health reaches 0 (with transaction)', () => {
        box.health = 1;
        box.lastHitTime = Date.now();
        
        box.reduceHealth();
        
        expect(box.health).toBe(0);
        expect(mockMindMap._wrapInTransaction).toHaveBeenCalled();
        expect(mockMindMap._performBoxDeletion).toHaveBeenCalledWith([box]);
    });

    test('should sync health reduction via MindMap.onBoxChange in ThrustGame only if alive', () => {
        const bullet = { x: 100, y: 100, vx: 5, vy: 0 };
        
        // Final hit that kills the box
        box.health = 1;
        game.applyBulletForceToBox(box, bullet);

        expect(box.health).toBe(0);
        // Should NOT call onBoxChange because it was deleted
        expect(sandbox.MindMap.onBoxChange).not.toHaveBeenCalled();
    });

    test('should start tracking damaged box via notifyBoxHealthChanged', () => {
        expect(game.damagedBoxIds.has(box.id)).toBe(false);
        
        // Simulate remote damage notification
        game.notifyBoxHealthChanged(box.id, 4);
        
        expect(game.damagedBoxIds.has(box.id)).toBe(true);
        expect(game.damagedBoxIds.size).toBe(1);
    });

    test('should stop tracking box via notifyBoxHealthChanged when healed', () => {
        game.damagedBoxIds.add(box.id);
        expect(game.damagedBoxIds.has(box.id)).toBe(true);
        
        // Simulate remote heal notification (health = 5)
        game.notifyBoxHealthChanged(box.id, 5);
        
        expect(game.damagedBoxIds.has(box.id)).toBe(false);
        expect(game.damagedBoxIds.size).toBe(0);
    });
});
