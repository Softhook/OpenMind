/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Load version.js in a sandbox to test actual behavior
const versionCode = fs.readFileSync(path.join(__dirname, '../../src/version.js'), 'utf8');

// Add export for Node.js testing
const sandboxCode = versionCode + '\nif (typeof module !== "undefined") { module.exports = { APP_VERSION, APP_NAME }; }';

const sandbox = {
    console,
    Object,
    Math,
    module: { exports: {} }
};
vm.createContext(sandbox);
vm.runInContext(sandboxCode, sandbox);

const { APP_VERSION, APP_NAME } = sandbox.module.exports;
global.APP_VERSION = APP_VERSION;
global.APP_NAME = APP_NAME;

// provide Utils
global.Utils = require('../../src/utils');

// Mock CollaborationManager dependencies
const TextBox = require('../../src/TextBox');
const MindMap = require('../../src/MindMap');
const CollaborationManager = require('../../src/CollaborationManager');

describe('Version Compatibility behavioral tests', () => {
    test('APP_VERSION should have valid numeric components', () => {
        expect(typeof APP_VERSION.MAJOR).toBe('number');
        expect(APP_VERSION.MAJOR).toBeGreaterThanOrEqual(0);
        expect(APP_VERSION.toString()).toMatch(/^\d+\.\d+\.\d+$/);
    });

    test('checkCompatibility should reject incompatible major version', () => {
        const older = { MAJOR: APP_VERSION.MAJOR - 1, MINOR: 0, PATCH: 0 };
        const result = APP_VERSION.checkCompatibility(older);
        expect(result.compatible).toBe(false);
        expect(result.shouldWarn).toBe(true);
        expect(result.reason).toContain('older');
    });

    test('checkCompatibility should allow same version', () => {
        const same = { MAJOR: APP_VERSION.MAJOR, MINOR: APP_VERSION.MINOR, PATCH: APP_VERSION.PATCH };
        const result = APP_VERSION.checkCompatibility(same);
        expect(result.compatible).toBe(true);
        expect(result.shouldWarn).toBe(false);
    });

    describe('CollaborationManager Integration', () => {
        let cm;
        let mindMap;

        beforeEach(() => {
            mindMap = new MindMap();
            cm = new CollaborationManager(mindMap);

            // Mock awareness
            cm.awareness = {
                clientID: 1,
                states: new Map(),
                getStates() { return this.states; },
                on: jest.fn(),
                off: jest.fn(),
                setLocalState: jest.fn(),
                getLocalState() { return { user: { name: 'Local' } }; }
            };
            cm.isConnected = true;
            cm.onVersionMismatch = jest.fn();
            cm.disconnect = jest.fn();
        });

        test('should detect incompatible peer version and disconnect', () => {
            // Simulate a peer with a newer MAJOR version
            cm.awareness.states.set(2, {
                user: { name: 'Newer Client' },
                version: { MAJOR: APP_VERSION.MAJOR + 1, MINOR: 0, PATCH: 0 }
            });

            // Trigger version check
            cm._checkPeerVersions();

            expect(cm.onVersionMismatch).toHaveBeenCalled();
            expect(cm.disconnect).toHaveBeenCalled();
            expect(cm.versionMismatchInfo.reason).toContain('newer');
        });

        test('should NOT disconnect but correctly detect newer MINOR version compatibility', () => {
            // Minor version difference is compatible: true, shouldWarn: true
            // but the current implementation of _checkPeerVersions only acts on !compatible
            cm.awareness.states.set(2, {
                user: { name: 'Slightly Newer Client' },
                version: { MAJOR: APP_VERSION.MAJOR, MINOR: APP_VERSION.MINOR + 1, PATCH: 0 }
            });

            cm._checkPeerVersions();

            // Should NOT have disconnected or called mismatch because it's compatible
            expect(cm.onVersionMismatch).not.toHaveBeenCalled();
            expect(cm.disconnect).not.toHaveBeenCalled();
        });
    });
});
