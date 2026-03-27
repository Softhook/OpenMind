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

    test('should heal 1 HP every 10 seconds', () => {
        box.health = 3;
        box.lastHitTime = Date.now();
        game.damagedBoxIds.add(box.id);

        // Advance time by 5 seconds - no healing
        jest.advanceTimersByTime(5000);
        game.updateHealthRecovery();
        expect(box.health).toBe(3);

        // Advance time by another 6 seconds (total 11s) - should heal
        jest.advanceTimersByTime(6000);
        game.updateHealthRecovery();
        expect(box.health).toBe(4);
        expect(sandbox.MindMap.onBoxChange).toHaveBeenCalledWith(box);

        // Advance time by another 10 seconds - should heal to 5
        jest.advanceTimersByTime(10000);
        game.updateHealthRecovery();
        expect(box.health).toBe(5);
        expect(game.damagedBoxIds.has(box.id)).toBe(false);
    });

    test('should trigger box deletion when health reaches 0', () => {
        // High level check: box.health started undefined
        box.reduceHealth(); // 4
        box.reduceHealth(); // 3
        box.reduceHealth(); // 2
        box.reduceHealth(); // 1
        
        // Final hit
        box.reduceHealth(); // 0
        
        expect(box.health).toBe(0);
        expect(mockMindMap._performBoxDeletion).toHaveBeenCalledWith([box]);
    });

    test('should sync health reduction via MindMap.onBoxChange in ThrustGame', () => {
        const bullet = { x: 100, y: 100, vx: 5, vy: 0 };
        game.applyBulletForceToBox(box, bullet);

        expect(box.health).toBe(4);
        expect(sandbox.MindMap.onBoxChange).toHaveBeenCalledWith(box);
    });
});
