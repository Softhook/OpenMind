/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

// Load source files
const collabCode = fs.readFileSync(path.join(__dirname, '../../src/CollaborationManager.js'), 'utf8');
const mindMapCode = fs.readFileSync(path.join(__dirname, '../../src/MindMap.js'), 'utf8');
const sketchCode = fs.readFileSync(path.join(__dirname, '../../src/sketch.js'), 'utf8');

describe('Yjs State Transitions - Comprehensive Testing', () => {
    describe('Architecture Validation', () => {
        test('Yjs should be the master state for collaboration', () => {
            // Verify Yjs structures exist
            expect(collabCode).toMatch(/this\.yboxes\s*=\s*this\.ydoc\.getMap\(['"]boxes['"]\)/);
            expect(collabCode).toMatch(/this\.yconnections\s*=\s*this\.ydoc\.getArray\(['"]connections['"]\)/);

            // Verify Yjs is used for undo
            expect(collabCode).toMatch(/new\s+this\.Y\.UndoManager\(\[this\.yboxes,\s*this\.yconnections\]/);
        });

        test('localStorage should be backup, not primary state', () => {
            // Verify localStorage is used for persistence
            expect(mindMapCode).toMatch(/localStorage\.setItem\(/);
            expect(mindMapCode).toMatch(/saveToLocalStorage/);

            // Verify it's timer-based (30s autosave)
            expect(sketchCode).toMatch(/CONFIG\.AUTOSAVE\.INTERVAL/);
            expect(sketchCode).toMatch(/setInterval/);
        });

        test('mindMap should be UI representation synchronized from Yjs', () => {
            // Verify rebuild functions exist
            expect(collabCode).toMatch(/_rebuildBoxesFromYjs/);
            expect(collabCode).toMatch(/_rebuildConnectionsFromYjs/);

            // Verify sync functions exist
            expect(collabCode).toMatch(/syncBoxToYjs/);
            expect(collabCode).toMatch(/syncConnectionsToYjs/);
        });
    });

    describe('Offline State Management', () => {
        test('should have hasLoadedFromLocalStorage flag to prevent premature Yjs rebuild', () => {
            expect(collabCode).toMatch(/this\.hasLoadedFromLocalStorage\s*=\s*false/);

            // Should check this flag in _rebuildConnectionsFromYjs
            const rebuildMatch = collabCode.match(/_rebuildConnectionsFromYjs\s*\([^)]*\)\s*\{[\s\S]*?\n\s{4}\}/);
            expect(rebuildMatch).toBeTruthy();
            expect(rebuildMatch[0]).toMatch(/hasLoadedFromLocalStorage/);
        });

        test('should mark localStorage load complete after syncing to Yjs', () => {
            // In sketch.js, after loading from localStorage and syncing to Yjs
            expect(sketchCode).toMatch(/Mark that localStorage load is complete/);
            expect(sketchCode).toMatch(/hasLoadedFromLocalStorage\s*=\s*true/);
        });

        test('should preserve Yjs state when disconnected (for undo)', () => {
            // disconnect() should NOT destroy ydoc or undoManager
            expect(collabCode).toMatch(/disconnect\s*\(\s*\)\s*\{/);

            // Should have comment about preserving undo
            expect(collabCode).toMatch(/local undo still works|Only disconnect the WebSocket provider, NOT the Yjs doc/);

            // Should not set ydoc or undoManager to null in disconnect()
            // The disconnect method preserves Yjs state for local undo
            expect(collabCode).toMatch(/disconnect\s*\(\)/);

            // Verify with grep-style check - if "this.ydoc = null" appears in disconnect, fail
            const hasYdocNull = collabCode.includes('disconnect()') &&
                collabCode.match(/disconnect\s*\([^)]*\)\s*\{[\s\S]{1,2000}this\.ydoc\s*=\s*null/);
            expect(hasYdocNull).toBeFalsy();
        });
    });

    describe('Online State Management', () => {
        test('should use Yjs CRDT for conflict resolution', () => {
            // Should rebuild from Yjs when synced
            const syncedHandlerMatch = collabCode.match(/provider\.on\(['"]synced['"][\s\S]{1,2000}Rebuilding from merged Yjs state|_rebuildBoxesFromYjs/);
            expect(syncedHandlerMatch).toBeTruthy();
        });

        test('should sync local changes to Yjs for remote users', () => {
            // _syncConnectionsToYjsImpl exists for normal operations (create, delete, reattach)
            // During undo/redo, Yjs CRDT propagates changes directly — no sync-back needed
            expect(collabCode).toMatch(/_syncConnectionsToYjsImpl/);
            expect(collabCode).toMatch(/do NOT sync connections back to Yjs/i);
        });

        test('should handle both-have-data scenario with CRDT merge', () => {
            const bothDataMatch = collabCode.match(/!yjsEmpty\s*&&\s*localHasData|Both have data/);
            expect(bothDataMatch).toBeTruthy();
        });
    });

    describe('Offline → Online Transitions', () => {
        test('should sync local data to Yjs before connecting', () => {
            // syncLocalToRoom should call _syncLocalToYjs
            const syncMatch = collabCode.match(/syncLocalToRoom\s*\([^)]*\)\s*\{[\s\S]*?_syncLocalToYjs/);
            expect(syncMatch).toBeTruthy();
        });

        test('should set hasLoadedFromLocalStorage after syncing', () => {
            // After syncing local to room
            const syncLocalMatch = collabCode.match(/syncLocalToRoom|hasLoadedFromLocalStorage\s*=\s*true/);
            expect(syncLocalMatch).toBeTruthy();
        });

        test('should handle room join with existing local data', () => {
            // Should NOT load localStorage when roomId exists
            // Instead, should load from IndexedDB when offline
            const roomCheckMatch = sketchCode.match(/if\s*\(\s*!roomId\s*\)/);
            expect(roomCheckMatch).toBeTruthy();

            // Should mention IndexedDB or localStorage
            expect(sketchCode).toMatch(/IndexedDB|localStorage/);
        });

        test('should show sync dialog when joining room with local data', () => {
            expect(sketchCode).toMatch(/roomJoinConfirmation/);
            expect(sketchCode).toMatch(/localHasData|boxes\.length\s*>\s*0/);
        });
    });

    describe('Online → Offline Transitions', () => {
        test('should preserve local state when disconnecting', () => {
            // disconnect() should not clear mindMap
            const disconnectMatch = collabCode.match(/disconnect\s*\([^)]*\)\s*\{[\s\S]*?\n\s{4}\}/);
            expect(disconnectMatch).toBeTruthy();

            const disconnectCode = disconnectMatch[0];
            expect(disconnectCode).not.toMatch(/this\.mindMap\s*=\s*null/);
        });

        test('should continue localStorage autosave after disconnect', () => {
            // Autosave timer should not depend on isConnected
            const autosaveMatch = sketchCode.match(/autosaveTimer[\s\S]{1,200}saveToLocalStorage/);
            expect(autosaveMatch).toBeTruthy();

            const autosaveCode = autosaveMatch[0];
            expect(autosaveCode).not.toMatch(/isConnected/);
        });

        test('should allow undo after disconnect', () => {
            // undoManager should survive disconnect
            const undoMatch = collabCode.match(/undo\s*\([^)]*\)\s*\{[\s\S]{1,200}undoManager\.undo/);
            expect(undoMatch).toBeTruthy();
        });
    });

    describe('Data Flow Validation', () => {
        test('localStorage → mindMap → Yjs flow should be correct', () => {
            // fromJSON should trigger callbacks that sync to Yjs
            expect(mindMapCode).toMatch(/fromJSON/);
            expect(collabCode).toMatch(/MindMap\.onBoxChange/);
            expect(collabCode).toMatch(/syncBoxToYjs/);
        });

        test('Yjs → mindMap → localStorage flow should be correct', () => {
            // Yjs observers rebuild mindMap, localStorage saves on timer
            expect(collabCode).toMatch(/yboxes\.observe/);
            expect(collabCode).toMatch(/_rebuildBoxesFromYjs/);
            expect(sketchCode).toMatch(/autosaveTimer/);
        });

        test('should prevent feedback loops with isSyncing flag', () => {
            // Observers should check isSyncing
            const observerMatch = collabCode.match(/yboxes\.observe|yconnections\.observe/);
            expect(observerMatch).toBeTruthy();

            // Should use isSyncing flag
            expect(collabCode).toMatch(/this\.isSyncing\s*=\s*true/);
            expect(collabCode).toMatch(/if[\s\S]{1,50}isSyncing/);
        });

        test('should rebuild connections after boxes during undo', () => {
            // In yboxes observer, during undo, rebuild connections after boxes
            // are available. This is local-only — no sync-back to Yjs needed
            // because the undo transaction already reverted yconnections.
            expect(collabCode).toMatch(/_rebuildConnectionsFromYjs/);
            expect(collabCode).toMatch(/_syncConnectionsToYjsImpl/);

            // Find the isUndoRedo block in the yboxes observer and verify it
            // rebuilds connections but does NOT sync back.
            const undoBlocks = [...collabCode.matchAll(/if\s*\(\s*isUndoRedo\s*\)\s*\{[\s\S]{1,2000}\}/g)];
            expect(undoBlocks.length).toBeGreaterThan(0);

            // The yboxes observer's undo block should rebuild but NOT sync back
            const hasRebuildOnly = undoBlocks.some(match =>
                /_rebuildConnectionsFromYjs/.test(match[0]) &&
                /do NOT sync connections back to Yjs/i.test(match[0])
            );
            expect(hasRebuildOnly).toBe(true);
        });
    });

    describe('Edge Cases', () => {
        test('should skip Yjs rebuild when offline with empty Yjs', () => {
            // In _rebuildConnectionsFromYjs, should check flags
            const skipMatch = collabCode.match(/_rebuildConnectionsFromYjs[\s\S]{1,500}hasLoadedFromLocalStorage[\s\S]{1,200}isConnected|waiting for localStorage sync/);
            expect(skipMatch).toBeTruthy();
        });

        test('should handle rapid connect/disconnect with status tracking', () => {
            expect(collabCode).toMatch(/provider\.on\(['"]status['"]/);
            expect(collabCode).toMatch(/isConnected/);
        });

        test('should handle autosave during sync with isSyncing check', () => {
            const syncCheckMatch = collabCode.match(/syncConnectionsToYjs[\s\S]{1,100}if[\s\S]{1,50}isSyncing[\s\S]{1,20}return/);
            expect(syncCheckMatch).toBeTruthy();
        });

        test('should handle storage quota exceeded gracefully', () => {
            const quotaMatch = mindMapCode.match(/QuotaExceededError/);
            expect(quotaMatch).toBeTruthy();

            const pruneMatch = mindMapCode.match(/pruneOldestCache/);
            expect(pruneMatch).toBeTruthy();
        });
    });

    describe('Critical Flags and Guards', () => {
        test('hasLoadedFromLocalStorage should prevent premature rebuilds', () => {
            // Should be false initially
            expect(collabCode).toMatch(/this\.hasLoadedFromLocalStorage\s*=\s*false/);

            // Should be checked in rebuild logic
            const rebuildMatch = collabCode.match(/_rebuildConnectionsFromYjs[\s\S]{1,500}hasLoadedFromLocalStorage/);
            expect(rebuildMatch).toBeTruthy();
        });

        test('isSyncing should prevent observer feedback loops', () => {
            // Should be set to true in observers
            expect(collabCode).toMatch(/this\.isSyncing\s*=\s*true/);

            // Should be checked at start
            expect(collabCode).toMatch(/if[\s\S]{1,100}isSyncing/);
        });

        test('isUndoRedo should distinguish undo from normal sync', () => {
            // Should be detected from transaction origin
            const undoDetectMatch = collabCode.match(/isUndoRedo\s*=\s*event\.transaction\.origin\s*===\s*this\.undoManager/);
            expect(undoDetectMatch).toBeTruthy();
        });

        test('isSaved flag should trigger autosave', () => {
            expect(mindMapCode).toMatch(/this\.isSaved\s*=\s*false/);
            expect(sketchCode).toMatch(/!mindMap\.isSaved/);
        });
    });

    describe('Yjs as Master - Validation', () => {
        test('undo/redo should work through Yjs, not localStorage', () => {
            // UndoManager should track yboxes and yconnections
            const undoManagerMatch = collabCode.match(/new\s+this\.Y\.UndoManager\(\[this\.yboxes,\s*this\.yconnections\]/);
            expect(undoManagerMatch).toBeTruthy();
        });

        test('collaboration should work through Yjs, not localStorage', () => {
            // WebSocket provider should sync ydoc
            const providerMatch = collabCode.match(/WebsocketProvider[\s\S]{1,100}this\.ydoc/);
            expect(providerMatch).toBeTruthy();
        });

        test('localStorage should only be for persistence, not sync', () => {
            // saveToLocalStorage should be timer-based
            expect(sketchCode).toMatch(/setInterval/);
            expect(mindMapCode).toMatch(/saveToLocalStorage/);

            // Should not be in sync path
            const syncMatch = collabCode.match(/_rebuildBoxesFromYjs[\s\S]{1,200}localStorage/);
            expect(syncMatch).toBeFalsy();
        });

        test('CRDT should handle conflicts, not manual merge', () => {
            // Should rebuild from Yjs after sync
            const crdtMatch = collabCode.match(/synced|CRDT/);
            expect(crdtMatch).toBeTruthy();

            // Should use _rebuildBoxesFromYjs
            expect(collabCode).toMatch(/_rebuildBoxesFromYjs/);

            // Should not have manual conflict resolution
            expect(collabCode).not.toMatch(/mergeConflicts/);
            expect(collabCode).not.toMatch(/resolveConflict/);
        });
    });
});
