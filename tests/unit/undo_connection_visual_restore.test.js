/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

// Load source files
const collabCode = fs.readFileSync(path.join(__dirname, '../../src/CollaborationManager.js'), 'utf8');

describe('Connection Visual Restoration on Undo', () => {
    test('connections observer should not skip during undo/redo even if isSyncing is true', () => {
        // Find the yconnections observer
        const connectionsObserverMatch = collabCode.match(/this\.yconnections\.observe\(\(event\)\s*=>\s*\{[\s\S]*?(?=\s{8}\}\);)/);
        expect(connectionsObserverMatch).toBeTruthy();
        const connectionsObserverCode = connectionsObserverMatch[0];

        // Should define isUndoRedo
        expect(connectionsObserverCode).toMatch(/const isUndoRedo\s*=\s*event\.transaction\.origin\s*===\s*this\.undoManager/);

        // CRITICAL: Should check isSyncing with isUndoRedo exception
        // This prevents skipping the connections observer during undo/redo
        // even if isSyncing is true from the boxes observer running first
        expect(connectionsObserverCode).toMatch(/if\s*\(\s*this\.isSyncing\s*&&\s*!isUndoRedo\s*\)\s*return/);

        // Should also skip local non-undo transactions
        expect(connectionsObserverCode).toMatch(/if\s*\(\s*event\.transaction\.local\s*&&\s*!isUndoRedo\s*\)\s*return/);
    });

    test('connections observer should have comment explaining the fix', () => {
        const connectionsObserverMatch = collabCode.match(/this\.yconnections\.observe\(\(event\)\s*=>\s*\{[\s\S]*?(?=\s{8}\}\);)/);
        expect(connectionsObserverMatch).toBeTruthy();
        const connectionsObserverCode = connectionsObserverMatch[0];

        // Should have a comment explaining why we allow undo/redo even when isSyncing
        expect(connectionsObserverCode).toMatch(/CRITICAL.*undo.*redo.*isSyncing/i);
        expect(connectionsObserverCode).toMatch(/connections.*rebuilt.*restored/i);
    });

    test('boxes observer should also handle undo/redo with isSyncing correctly', () => {
        // Find the yboxes observer
        const boxesObserverMatch = collabCode.match(/this\.yboxes\.observe\(\(event\)\s*=>\s*\{[\s\S]*?(?=\s{8}\}\);)/);
        expect(boxesObserverMatch).toBeTruthy();
        const boxesObserverCode = boxesObserverMatch[0];

        // Should define isUndoRedo
        expect(boxesObserverCode).toMatch(/const isUndoRedo\s*=\s*event\.transaction\.origin\s*===\s*this\.undoManager/);

        // CRITICAL: Should check isSyncing with isUndoRedo exception
        // This ensures the boxes observer does not skip undo/redo transactions
        // even when isSyncing is true
        expect(boxesObserverCode).toMatch(/if\s*\(\s*this\.isSyncing\s*&&\s*!isUndoRedo\s*\)\s*return/);
        expect(boxesObserverCode).toMatch(/if\s*\(\s*event\.transaction\.local\s*&&\s*!isUndoRedo\s*\)\s*return/);
    });

    test('_rebuildConnectionsFromYjs should check for both fromBox and toBox existence', () => {
        const rebuildMatch = collabCode.match(/_rebuildConnectionsFromYjs\s*\(\)\s*\{[\s\S]*?(?=\n\s{4}\/\*\*|\n\s{4}[a-z_][a-zA-Z_]*\s*\()/);
        expect(rebuildMatch).toBeTruthy();
        const rebuildCode = rebuildMatch[0];

        // Should get boxes by ID
        expect(rebuildCode).toMatch(/getBoxById\s*\(\s*data\.fromId\s*\)/);
        expect(rebuildCode).toMatch(/getBoxById\s*\(\s*data\.toId\s*\)/);

        // Should only create connection if both boxes exist
        expect(rebuildCode).toMatch(/if\s*\(\s*fromBox\s*&&\s*toBox/);
        expect(rebuildCode).toMatch(/new Connection\s*\(\s*fromBox\s*,\s*toBox\s*\)/);
    });
});
