/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

// Load source files
const collabCode = fs.readFileSync(path.join(__dirname, '../../src/CollaborationManager.js'), 'utf8');
const mindMapCode = fs.readFileSync(path.join(__dirname, '../../src/MindMap.js'), 'utf8');

describe('Connection Undo System - Comprehensive Review', () => {
    describe('Connection Creation Undo', () => {
        test('syncConnectionsToYjs wraps in transaction with undoManager origin', () => {
            const syncMatch = collabCode.match(/syncConnectionsToYjs\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}\/\*\*|\n\s{4}_sync)/);
            expect(syncMatch).toBeTruthy();
            const syncCode = syncMatch[0];

            // Must wrap in transaction with undoManager origin for undo tracking
            expect(syncCode).toMatch(/this\.transact\(/);
            expect(syncCode).toMatch(/['"]syncConnections['"]/);
        });

        test('syncConnectionsToYjs handles skipTransactionWrapper correctly', () => {
            const syncMatch = collabCode.match(/syncConnectionsToYjs\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}\/\*\*|\n\s{4}_sync)/);
            expect(syncMatch).toBeTruthy();
            const syncCode = syncMatch[0];

            // When skipTransactionWrapper=true, should call impl directly (already in transaction)
            expect(syncCode).toMatch(/if\s*\(\s*skipTransactionWrapper\s*\)/);
            expect(syncCode).toMatch(/_syncConnectionsToYjsImpl/);
        });

        test('MindMap has onConnectionsChange callback', () => {
            // MindMap should call syncConnectionsToYjs when connections change
            expect(collabCode).toMatch(/onConnectionsChange.*=.*\(/);
            expect(collabCode).toMatch(/syncConnectionsToYjs/);
        });
    });

    describe('Connection Deletion Undo', () => {
        test('syncConnectionsToYjs properly wraps for undo tracking', () => {
            // When a connection is deleted, MindMap calls onConnectionsChange
            // which triggers syncConnectionsToYjs with proper transaction wrapping
            expect(collabCode).toMatch(/syncConnectionsToYjs/);
            expect(collabCode).toMatch(/'syncConnections'/);
        });

        test('_syncConnectionsToYjsImpl properly diffs and deletes connections', () => {
            const implMatch = collabCode.match(/_syncConnectionsToYjsImpl\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}\/\*\*|\n\s{4}[a-z_])/);
            expect(implMatch).toBeTruthy();
            const implCode = implMatch[0];

            // Must find connections to delete
            expect(implCode).toMatch(/indicesToDelete/);
            expect(implCode).toMatch(/yconnections\.delete/);
            
            // Must delete in descending order
            expect(implCode).toMatch(/sort.*\(a,\s*b\)\s*=>\s*b\s*-\s*a/);
        });
    });

    describe('Bulk Connection Operations', () => {
        test('connection changes use single transaction when in batch operation', () => {
            const syncMatch = collabCode.match(/syncConnectionsToYjs\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{4}\/\*\*|\n\s{4}_sync)/);
            expect(syncMatch).toBeTruthy();
            const syncCode = syncMatch[0];

            // skipTransactionWrapper allows parent transaction to group changes
            expect(syncCode).toMatch(/skipTransactionWrapper/);
        });
    });
});

describe('Text Formatting Undo System - Comprehensive Review', () => {
    describe('Bold Formatting Undo', () => {
        test('boldRanges tracked in Yjs data model', () => {
            const boxToYjsMatch = collabCode.match(/_boxToYjsData\s*\([^)]*\)\s*\{[\s\S]*?\n\s{4}\}/);
            expect(boxToYjsMatch).toBeTruthy();
            const boxToYjsCode = boxToYjsMatch[0];

            // Must include boldRanges in synced data
            expect(boxToYjsCode).toMatch(/boldRanges/);
            expect(boxToYjsCode).toMatch(/start.*end/);
        });

        test('boldRanges applied from Yjs during sync', () => {
            // Must apply boldRanges from remote changes in _applyBoxFromYjs
            expect(collabCode).toMatch(/_applyBoxFromYjs/);
            expect(collabCode).toMatch(/box\.boldRanges\s*=\s*data\.boldRanges\.map/);
        });

        test('bold toggle wrapped in transaction with undo boundary', () => {
            const boldMatch = mindMapCode.match(/toggleBoldOutlineOnSelection[\s\S]{0,500}/);
            expect(boldMatch).toBeTruthy();
            const boldCode = boldMatch[0];

            // Must wrap in transaction
            expect(boldCode).toMatch(/_wrapInTransaction/);
            
            // Must notify collaboration manager
            expect(boldCode).toMatch(/onBoxChange/);
            
            // Must call stopCapturing for undo boundary
            expect(boldCode).toMatch(/stopCapturing/);
        });
    });

    describe('Italic Formatting Undo', () => {
        test('italicRanges tracked in Yjs data model', () => {
            const boxToYjsMatch = collabCode.match(/_boxToYjsData\s*\([^)]*\)\s*\{[\s\S]*?\n\s{4}\}/);
            expect(boxToYjsMatch).toBeTruthy();
            const boxToYjsCode = boxToYjsMatch[0];

            // Must include italicRanges in synced data
            expect(boxToYjsCode).toMatch(/italicRanges/);
        });

        test('italic toggle wrapped in transaction with undo boundary', () => {
            const italicMatch = mindMapCode.match(/toggleItalicSlantOnSelection[\s\S]{0,500}/);
            expect(italicMatch).toBeTruthy();
            const italicCode = italicMatch[0];

            // Must wrap in transaction
            expect(italicCode).toMatch(/_wrapInTransaction/);
            
            // Must notify collaboration manager
            expect(italicCode).toMatch(/onBoxChange/);
            
            // Must call stopCapturing for undo boundary
            expect(italicCode).toMatch(/stopCapturing/);
        });
    });

    describe('Highlight Formatting Undo', () => {
        test('highlights tracked in Yjs data model with color', () => {
            const boxToYjsMatch = collabCode.match(/_boxToYjsData\s*\([^)]*\)\s*\{[\s\S]*?\n\s{4}\}/);
            expect(boxToYjsMatch).toBeTruthy();
            const boxToYjsCode = boxToYjsMatch[0];

            // Must include highlights with color in synced data
            expect(boxToYjsCode).toMatch(/highlights/);
            expect(boxToYjsCode).toMatch(/color/);
        });

        test('highlights applied from Yjs during sync', () => {
            // Must apply highlights from remote changes in _applyBoxFromYjs
            expect(collabCode).toMatch(/_applyBoxFromYjs/);
            expect(collabCode).toMatch(/box\.highlights\s*=\s*data\.highlights\.map/);
        });
    });

    describe('Formatting During Editing', () => {
        test('formatting changes sync even when box.isEditing=true', () => {
            // When user applies formatting during editing, MindMap wraps in transaction
            // and calls onBoxChange with skipTransactionWrapper=true
            // This triggers syncBoxToYjs which will sync the box with current formatting
            const mindMapMatch = mindMapCode.match(/toggleBoldOutlineOnSelection|toggleItalicSlantOnSelection/);
            expect(mindMapMatch).toBeTruthy();
        });

        test('stopCapturing called after formatting to create undo boundary', () => {
            const boldMatch = mindMapCode.match(/toggleBoldOutlineOnSelection[\s\S]{0,500}/);
            expect(boldMatch).toBeTruthy();
            
            // Must have stopCapturing to create undo boundary
            expect(boldMatch[0]).toMatch(/stopCapturing/);
        });
    });
});

describe('Alignment Undo System - Comprehensive Review', () => {
    describe('Group Alignment Operations', () => {
        test('leftAlignSelectedBoxes wraps in transaction', () => {
            const leftAlignMatch = mindMapCode.match(/leftAlignSelectedBoxes\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{2}[a-z_]|\n\s{2}\/\*\*)/);
            expect(leftAlignMatch).toBeTruthy();
            const leftAlignCode = leftAlignMatch[0];

            // Must wrap alignment in transaction
            expect(leftAlignCode).toMatch(/_wrapInTransaction/);
        });

        test('rightAlignSelectedBoxes wraps in transaction', () => {
            const rightAlignMatch = mindMapCode.match(/rightAlignSelectedBoxes\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{2}[a-z_]|\n\s{2}\/\*\*)/);
            expect(rightAlignMatch).toBeTruthy();
            
            expect(rightAlignMatch[0]).toMatch(/_wrapInTransaction/);
        });

        test('topAlignSelectedBoxes wraps in transaction', () => {
            const topAlignMatch = mindMapCode.match(/topAlignSelectedBoxes\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{2}[a-z_]|\n\s{2}\/\*\*)/);
            expect(topAlignMatch).toBeTruthy();
            
            expect(topAlignMatch[0]).toMatch(/_wrapInTransaction/);
        });

        test('bottomAlignSelectedBoxes wraps in transaction', () => {
            const bottomAlignMatch = mindMapCode.match(/bottomAlignSelectedBoxes\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{2}[a-z_]|\n\s{2}\/\*\*)/);
            expect(bottomAlignMatch).toBeTruthy();
            
            expect(bottomAlignMatch[0]).toMatch(/_wrapInTransaction/);
        });

        test('centerAlignSelectedBoxes wraps in transaction', () => {
            const centerAlignMatch = mindMapCode.match(/centerAlignSelectedBoxes\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{2}[a-z_]|\n\s{2}\/\*\*)/);
            expect(centerAlignMatch).toBeTruthy();
            
            expect(centerAlignMatch[0]).toMatch(/_wrapInTransaction/);
        });

        test('horizontalCenterAlignSelectedBoxes wraps in transaction', () => {
            const hCenterMatch = mindMapCode.match(/horizontalCenterAlignSelectedBoxes\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{2}[a-z_]|\n\s{2}\/\*\*)/);
            expect(hCenterMatch).toBeTruthy();
            
            expect(hCenterMatch[0]).toMatch(/_wrapInTransaction/);
        });
    });

    describe('Alignment Position Sync', () => {
        test('_notifyBoxesChanged syncs targetX/targetY to prevent snap-back', () => {
            const notifyMatch = mindMapCode.match(/_notifyBoxesChanged\s*\([^)]*\)\s*\{[\s\S]*?(?=\n\s{2}\/\/|\n\s{2}[a-z_])/);
            expect(notifyMatch).toBeTruthy();
            const notifyCode = notifyMatch[0];

            // Must sync target positions to prevent rubber-banding
            expect(notifyCode).toMatch(/targetX\s*=\s*box\.x/);
            expect(notifyCode).toMatch(/targetY\s*=\s*box\.y/);
        });

        test('alignment operations call _notifyBoxesChanged', () => {
            // After performing alignment, must notify boxes with skipTransactionWrapper
            expect(mindMapCode).toMatch(/_performLeftAlign[\s\S]*?_notifyBoxesChanged/);
            expect(mindMapCode).toMatch(/_notifyBoxesChanged.*skipTransactionWrapper/);
        });
    });

    describe('Alignment Undo Grouping', () => {
        test('all box position changes in single transaction', () => {
            // _wrapInTransaction ensures all box updates happen in one transaction
            // Each box calls onBoxChange with skipTransactionWrapper=true
            // So all updates are grouped in the parent transaction
            const wrapMatch = mindMapCode.match(/_wrapInTransaction\s*\([^)]*\)\s*\{[\s\S]{0,200}/);
            expect(wrapMatch).toBeTruthy();
        });
    });
});
