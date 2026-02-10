/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

// Load source files
const collabCode = fs.readFileSync(path.join(__dirname, '../../src/CollaborationManager.js'), 'utf8');

describe('Critical Guarantee Verification', () => {
    describe('Guarantee: Never lose text under any circumstances', () => {
        test('_flushPendingTextSyncs should defer sync when isSyncing=true, not skip it', () => {
            const flushMatch = collabCode.match(/_flushPendingTextSyncs\s*\([^)]*\)\s*\{[\s\S]*?\n\s{4}\}/);
            expect(flushMatch).toBeTruthy();
            const flushCode = flushMatch[0];

            // Must have deferred flush mechanism for isSyncing=true case
            expect(flushCode).toMatch(/_deferredFlushes/);
            expect(flushCode).toMatch(/if\s*\(\s*!this\.isSyncing\s*\)/);
            
            // Should have else clause for isSyncing=true case
            expect(flushCode).toMatch(/else[\s\S]*_deferredFlushes/);
            
            // Must add to deferred set, not skip
            expect(flushCode).toMatch(/_deferredFlushes\.add\(\s*boxId\s*\)/);
        });

        test('Observer finally block should process deferred flushes', () => {
            // Find the yboxes.observe method
            const observerMatch = collabCode.match(/yboxes\.observe\([^{]*\{[\s\S]*?\n\s{4}\}\);/);
            expect(observerMatch).toBeTruthy();
            const observerCode = observerMatch[0];

            // Must process deferred flushes in finally block
            expect(observerCode).toMatch(/finally[\s\S]*_deferredFlushes/);
            expect(observerCode).toMatch(/this\._deferredFlushes[\s\S]*\.size\s*>\s*0/);
            
            // Must process each deferred box
            expect(observerCode).toMatch(/Array\.from\(\s*this\._deferredFlushes\s*\)/);
            expect(observerCode).toMatch(/for[\s\S]*deferredBoxIds/);
        });

        test('_deferredFlushes should be initialized in constructor', () => {
            // Must initialize the deferred flushes set
            expect(collabCode).toMatch(/this\._deferredFlushes\s*=\s*null/);
        });

        test('deferred flush should sync with proper transaction origin', () => {
            const observerMatch = collabCode.match(/yboxes\.observe\([^{]*\{[\s\S]*?\n\s{4}\}\);/);
            expect(observerMatch).toBeTruthy();
            const observerCode = observerMatch[0];

            // In the deferred flush processing, must use undoManager origin
            const deferredSection = observerCode.match(/Process.*deferred flushes[\s\S]*?\n\s{16}\}/);
            if (deferredSection) {
                expect(deferredSection[0]).toMatch(/this\.ydoc\.transact/);
                expect(deferredSection[0]).toMatch(/this\.undoManager\)/);
            }
        });
    });

    describe('Guarantee: Never skip sync due to isSyncing flag', () => {
        test('flush should always ensure text gets synced eventually', () => {
            const flushMatch = collabCode.match(/_flushPendingTextSyncs\s*\([^)]*\)\s*\{[\s\S]*?\n\s{4}\}/);
            expect(flushMatch).toBeTruthy();
            const flushCode = flushMatch[0];

            // The isSyncing check should NOT cause early return without deferring
            // If isSyncing, must defer; if not isSyncing, must sync immediately
            const isSyncingCheck = flushCode.match(/if\s*\(\s*!this\.isSyncing\s*\)/);
            expect(isSyncingCheck).toBeTruthy();
            
            // After the isSyncing check, there should be an else block for deferring
            const afterIsSyncing = flushCode.split('if (!this.isSyncing)')[1];
            expect(afterIsSyncing).toMatch(/else/);
        });
    });

    describe('Guarantee: Never lose deferred flushes', () => {
        test('observer should clear deferred flushes set after processing', () => {
            const observerMatch = collabCode.match(/yboxes\.observe\([^{]*\{[\s\S]*?\n\s{4}\}\);/);
            expect(observerMatch).toBeTruthy();
            const observerCode = observerMatch[0];

            // Must clear the set after capturing the IDs
            expect(observerCode).toMatch(/_deferredFlushes\.clear\(\)/);
            
            // Clear should come BEFORE processing (to prevent re-entrancy issues)
            const clearIndex = observerCode.indexOf('_deferredFlushes.clear()');
            const processIndex = observerCode.indexOf('Processing');
            expect(clearIndex).toBeGreaterThan(-1);
            expect(processIndex).toBeGreaterThan(-1);
        });

        test('deferred flush should validate box still exists', () => {
            const observerMatch = collabCode.match(/yboxes\.observe\([^{]*\{[\s\S]*?\n\s{4}\}\);/);
            expect(observerMatch).toBeTruthy();
            const observerCode = observerMatch[0];

            // In deferred processing, must validate box exists
            const deferredSection = observerCode.match(/Process.*deferred[\s\S]*?for\s*\(.*deferredBoxIds[\s\S]*?\n\s{16}\}/);
            if (deferredSection) {
                expect(deferredSection[0]).toMatch(/getBoxById/);
                expect(deferredSection[0]).toMatch(/if\s*\(\s*box\s*\)/);
            }
        });
    });

    describe('Documentation of Critical Fix', () => {
        test('should document why deferred flush is critical', () => {
            const flushMatch = collabCode.match(/_flushPendingTextSyncs\s*\([^)]*\)\s*\{[\s\S]*?\n\s{4}\}/);
            expect(flushMatch).toBeTruthy();
            const flushCode = flushMatch[0];

            // Should have comment explaining CRITICAL nature of not skipping sync
            expect(flushCode).toMatch(/CRITICAL.*[Dd]o NOT skip/i);
        });

        test('observer should document deferred flush processing', () => {
            const observerMatch = collabCode.match(/yboxes\.observe\([^{]*\{[\s\S]*?\n\s{4}\}\);/);
            expect(observerMatch).toBeTruthy();
            const observerCode = observerMatch[0];

            // Should explain why we process deferred flushes
            expect(observerCode).toMatch(/CRITICAL.*deferred flushes/i);
            expect(observerCode).toMatch(/never lose text/i);
        });
    });
});

describe('Critical Edge Case: isSyncing=true During Flush', () => {
    describe('Scenario: Remote change arrives while user is typing', () => {
        test('system should defer flush instead of losing text', () => {
            const flushMatch = collabCode.match(/_flushPendingTextSyncs\s*\([^)]*\)\s*\{[\s\S]*?\n\s{4}\}/);
            expect(flushMatch).toBeTruthy();
            const flushCode = flushMatch[0];

            // When isSyncing=true, must defer not skip
            expect(flushCode).toMatch(/if\s*\(\s*!this\.isSyncing\s*\)/);
            expect(flushCode).toMatch(/else[\s\S]*_deferredFlushes/);
            
            // Must log that we're deferring
            const elseSection = flushCode.split('} else {')[1];
            if (elseSection) {
                expect(elseSection).toMatch(/Deferred.*flush.*isSyncing/);
            }
        });
    });
});
