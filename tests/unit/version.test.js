/**
 * Unit tests for version compatibility logic
 */

const fs = require('fs');
const path = require('path');

// Read the source files
const versionCode = fs.readFileSync(path.join(__dirname, '../../version.js'), 'utf8');
const collabCode = fs.readFileSync(path.join(__dirname, '../../CollaborationManager.js'), 'utf8');

describe('Version Constants', () => {
    test('version.js should define APP_VERSION with MAJOR, MINOR, PATCH', () => {
        expect(versionCode).toMatch(/const APP_VERSION = \{/);
        expect(versionCode).toMatch(/MAJOR:\s*\d+/);
        expect(versionCode).toMatch(/MINOR:\s*\d+/);
        expect(versionCode).toMatch(/PATCH:\s*\d+/);
    });

    test('version.js should define APP_NAME', () => {
        expect(versionCode).toMatch(/const APP_NAME = ['"]OpenMind['"]/);
    });

    test('APP_VERSION should be frozen to prevent modification', () => {
        expect(versionCode).toMatch(/Object\.freeze\(APP_VERSION\)/);
    });

    test('APP_VERSION should have toString method', () => {
        expect(versionCode).toMatch(/toString\(\)\s*\{/);
        expect(versionCode).toMatch(/\$\{this\.MAJOR\}\.\$\{this\.MINOR\}\.\$\{this\.PATCH\}/);
    });

    test('APP_VERSION should have checkCompatibility method', () => {
        expect(versionCode).toMatch(/checkCompatibility\(other\)\s*\{/);
    });
});

describe('Version Compatibility Logic', () => {
    test('should reject unknown/missing versions as incompatible', () => {
        // Unknown versions should be blocked (old clients without version support)
        expect(versionCode).toMatch(/if\s*\(!other\s*\|\|\s*typeof\s*other\.MAJOR\s*!==\s*['"]number['"]\)/);
        expect(versionCode).toMatch(/compatible:\s*false/);
        expect(versionCode).toMatch(/Peer is running an outdated version/);
    });

    test('should block different MAJOR versions', () => {
        // Different MAJOR = incompatible
        expect(versionCode).toMatch(/if\s*\(other\.MAJOR\s*!==\s*this\.MAJOR\)/);
        expect(versionCode).toMatch(/compatible:\s*false/);
    });

    test('should warn but allow different MINOR versions', () => {
        // Newer MINOR = compatible with warning
        expect(versionCode).toMatch(/if\s*\(other\.MINOR\s*>\s*this\.MINOR\)/);
        expect(versionCode).toMatch(/compatible:\s*true,\s*\n?\s*shouldWarn:\s*true/);
    });

    test('should allow same versions without warning', () => {
        // Same version = fully compatible
        expect(versionCode).toMatch(/return\s*\{\s*compatible:\s*true,\s*shouldWarn:\s*false,\s*reason:\s*['"]['"]?\s*\}/);
    });
});

describe('CollaborationManager Version Integration', () => {
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
        expect(collabCode).toMatch(/Peer without version info detected/);
    });

    test('should handle missing APP_VERSION gracefully', () => {
        expect(collabCode).toMatch(/typeof APP_VERSION === ['"]undefined['"]/);
    });
});
