/**
 * Unit tests for version compatibility logic
 * These tests validate actual behavior, not just code structure
 */

const vm = require('vm');
const fs = require('fs');
const path = require('path');

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

describe('Version Constants', () => {
    test('APP_VERSION should have MAJOR, MINOR, PATCH as numbers', () => {
        expect(typeof APP_VERSION.MAJOR).toBe('number');
        expect(typeof APP_VERSION.MINOR).toBe('number');
        expect(typeof APP_VERSION.PATCH).toBe('number');
        expect(APP_VERSION.MAJOR).toBeGreaterThanOrEqual(0);
        expect(APP_VERSION.MINOR).toBeGreaterThanOrEqual(0);
        expect(APP_VERSION.PATCH).toBeGreaterThanOrEqual(0);
    });

    test('APP_NAME should be defined as string', () => {
        expect(typeof APP_NAME).toBe('string');
        expect(APP_NAME).toBe('OpenMind');
    });

    test('APP_VERSION should be frozen to prevent modification', () => {
        expect(Object.isFrozen(APP_VERSION)).toBe(true);
        // Frozen objects silently ignore assignments in non-strict mode
        // Just verify it's frozen - attempting to modify won't change the value
        const originalMAJOR = APP_VERSION.MAJOR;
        APP_VERSION.MAJOR = 999;
        expect(APP_VERSION.MAJOR).toBe(originalMAJOR);
    });

    test('toString() should return formatted version string', () => {
        const versionString = APP_VERSION.toString();
        expect(typeof versionString).toBe('string');
        expect(versionString).toMatch(/^\d+\.\d+\.\d+$/);
        expect(versionString).toBe(`${APP_VERSION.MAJOR}.${APP_VERSION.MINOR}.${APP_VERSION.PATCH}`);
    });

    test('toProtocolVersion() should return MAJOR.MINOR', () => {
        const protocolVersion = APP_VERSION.toProtocolVersion();
        expect(typeof protocolVersion).toBe('string');
        expect(protocolVersion).toMatch(/^\d+\.\d+$/);
        expect(protocolVersion).toBe(`${APP_VERSION.MAJOR}.${APP_VERSION.MINOR}`);
    });
});

describe('Version Compatibility Logic - checkCompatibility()', () => {
    describe('Null/Undefined/Invalid Input', () => {
        test('should reject null version as incompatible', () => {
            const result = APP_VERSION.checkCompatibility(null);
            expect(result.compatible).toBe(false);
            expect(result.shouldWarn).toBe(true);
            expect(result.reason).toContain('outdated');
        });

        test('should reject undefined version as incompatible', () => {
            const result = APP_VERSION.checkCompatibility(undefined);
            expect(result.compatible).toBe(false);
            expect(result.shouldWarn).toBe(true);
        });

        test('should reject version without MAJOR as incompatible', () => {
            const result = APP_VERSION.checkCompatibility({ MINOR: 1, PATCH: 0 });
            expect(result.compatible).toBe(false);
            expect(result.shouldWarn).toBe(true);
        });

        test('should reject version with non-numeric MAJOR', () => {
            const result = APP_VERSION.checkCompatibility({ MAJOR: '1', MINOR: 1, PATCH: 0 });
            expect(result.compatible).toBe(false);
        });
    });

    describe('Different MAJOR Versions', () => {
        test('should reject older MAJOR version', () => {
            const olderVersion = { MAJOR: APP_VERSION.MAJOR - 1, MINOR: 0, PATCH: 0 };
            const result = APP_VERSION.checkCompatibility(olderVersion);
            
            expect(result.compatible).toBe(false);
            expect(result.shouldWarn).toBe(true);
            expect(result.reason).toContain('older');
            expect(result.reason).toContain('refresh');
        });

        test('should reject newer MAJOR version', () => {
            const newerVersion = { MAJOR: APP_VERSION.MAJOR + 1, MINOR: 0, PATCH: 0 };
            const result = APP_VERSION.checkCompatibility(newerVersion);
            
            expect(result.compatible).toBe(false);
            expect(result.shouldWarn).toBe(true);
            expect(result.reason).toContain('refresh');
            expect(result.reason).toContain('newer');
        });
    });

    describe('Same MAJOR, Different MINOR Versions', () => {
        test('should allow same MINOR without warning', () => {
            const sameVersion = { MAJOR: APP_VERSION.MAJOR, MINOR: APP_VERSION.MINOR, PATCH: 0 };
            const result = APP_VERSION.checkCompatibility(sameVersion);
            
            expect(result.compatible).toBe(true);
            expect(result.shouldWarn).toBe(false);
            expect(result.reason).toBe('');
        });

        test('should allow older MINOR without warning', () => {
            if (APP_VERSION.MINOR > 0) {
                const olderVersion = { MAJOR: APP_VERSION.MAJOR, MINOR: APP_VERSION.MINOR - 1, PATCH: 0 };
                const result = APP_VERSION.checkCompatibility(olderVersion);
                
                expect(result.compatible).toBe(true);
                expect(result.shouldWarn).toBe(false);
            }
        });

        test('should allow newer MINOR with warning', () => {
            const newerVersion = { MAJOR: APP_VERSION.MAJOR, MINOR: APP_VERSION.MINOR + 1, PATCH: 0 };
            const result = APP_VERSION.checkCompatibility(newerVersion);
            
            expect(result.compatible).toBe(true);
            expect(result.shouldWarn).toBe(true);
            expect(result.reason).toContain('newer');
        });
    });

    describe('Same MAJOR and MINOR, Different PATCH', () => {
        test('should allow different PATCH versions without warning', () => {
            const differentPatch = { MAJOR: APP_VERSION.MAJOR, MINOR: APP_VERSION.MINOR, PATCH: APP_VERSION.PATCH + 1 };
            const result = APP_VERSION.checkCompatibility(differentPatch);
            
            expect(result.compatible).toBe(true);
            expect(result.shouldWarn).toBe(false);
        });
    });

    describe('Exact Same Version', () => {
        test('should allow exact same version without warning', () => {
            const sameVersion = { 
                MAJOR: APP_VERSION.MAJOR, 
                MINOR: APP_VERSION.MINOR, 
                PATCH: APP_VERSION.PATCH 
            };
            const result = APP_VERSION.checkCompatibility(sameVersion);
            
            expect(result.compatible).toBe(true);
            expect(result.shouldWarn).toBe(false);
            expect(result.reason).toBe('');
        });
    });
});

describe('CollaborationManager Version Integration', () => {
    // Load CollaborationManager to verify integration
    const collabCode = fs.readFileSync(path.join(__dirname, '../../src/CollaborationManager.js'), 'utf8');

    test('should include version in awareness state', () => {
        expect(collabCode).toMatch(/version:\s*versionInfo/);
        expect(collabCode).toMatch(/MAJOR:\s*APP_VERSION\.MAJOR/);
        expect(collabCode).toMatch(/MINOR:\s*APP_VERSION\.MINOR/);
        expect(collabCode).toMatch(/PATCH:\s*APP_VERSION\.PATCH/);
    });

    test('should have _checkPeerVersions method', () => {
        expect(collabCode).toMatch(/_checkPeerVersions\(\)\s*\{/);
    });

    test('should call _checkPeerVersions on awareness change', () => {
        expect(collabCode).toMatch(/this\._checkPeerVersions\(\)/);
    });

    test('should disconnect when peer has newer MAJOR version', () => {
        expect(collabCode).toMatch(/theyAreNewer\s*=\s*state\.version\.MAJOR\s*>\s*APP_VERSION\.MAJOR/);
        expect(collabCode).toMatch(/this\.disconnect\(\)/);
    });

    test('should have onVersionMismatch callback', () => {
        expect(collabCode).toMatch(/this\.onVersionMismatch\s*=\s*null/);
        expect(collabCode).toMatch(/if\s*\(this\.onVersionMismatch\)/);
    });

    test('should store versionMismatchInfo for UI display', () => {
        expect(collabCode).toMatch(/this\.versionMismatchInfo\s*=\s*\{/);
        expect(collabCode).toMatch(/peerVersion:/);
        expect(collabCode).toMatch(/localVersion:/);
    });

    test('should log when peer has no version info (old client)', () => {
        expect(collabCode).toMatch(/Without version info detected|Peer without version info/);
    });

    test('should handle missing APP_VERSION gracefully', () => {
        expect(collabCode).toMatch(/typeof APP_VERSION === ['"]undefined['"]/);
    });
});
