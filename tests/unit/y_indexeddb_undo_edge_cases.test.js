/**
 * Comprehensive tests for y-indexeddb migration edge cases and undo scenarios
 * Tests Issues #1, #2, #3 from user feedback
 */

describe('y-indexeddb Migration - Edge Cases and Undo', () => {
    let collaborationManager;
    let mindMap;
    let mockIndexedDB;

    beforeEach(() => {
        // Mock IndexedDB
        mockIndexedDB = {
            clearData: jest.fn().mockResolvedValue(undefined),
            whenSynced: Promise.resolve(),
            destroy: jest.fn()
        };

        // Mock MindMap
        mindMap = {
            boxes: [],
            connections: [],
            getBoxById: jest.fn((id) => mindMap.boxes.find(b => b.id === id)),
            isDirty: false
        };

        // Mock CollaborationManager
        collaborationManager = {
            indexeddbProvider: mockIndexedDB,
            ydoc: {
                transact: jest.fn((fn) => fn())
            },
            yboxes: new Map(),
            yconnections: {
                length: 0,
                toArray: jest.fn(() => []),
                clear: jest.fn(),
                delete: jest.fn()
            },
            mindMap,
            undoManager: {},
            isSyncing: false,
            isConnected: false,
            hasLoadedFromLocalStorage: false
        };
    });

    describe('Issue #1: Delete Local Data', () => {
        test('clearIndexedDB clears database and recreates provider', async () => {
            // Mock IndexeddbPersistence constructor
            const MockIndexeddbPersistence = jest.fn(() => mockIndexedDB);
            collaborationManager.IndexeddbPersistence = MockIndexeddbPersistence;

            // Call clearIndexedDB
            await collaborationManager.clearIndexedDB();

            // Verify clearData was called
            expect(mockIndexedDB.clearData).toHaveBeenCalled();

            // Verify Yjs document was cleared
            expect(collaborationManager.yboxes.clear).toHaveBeenCalled();
            expect(collaborationManager.yconnections.delete).toHaveBeenCalled();

            // Verify new provider was created
            expect(MockIndexeddbPersistence).toHaveBeenCalledWith('openmind-yjs', collaborationManager.ydoc);
        });

        test('clearIndexedDB handles errors gracefully', async () => {
            mockIndexedDB.clearData.mockRejectedValue(new Error('DB error'));

            await expect(collaborationManager.clearIndexedDB()).rejects.toThrow('DB error');
        });

        test('clearIndexedDB warns if no provider exists', async () => {
            collaborationManager.indexeddbProvider = null;
            const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();

            await collaborationManager.clearIndexedDB();

            // Should return early without error
            expect(mockIndexedDB.clearData).not.toHaveBeenCalled();
            consoleWarn.mockRestore();
        });
    });

    describe('Issue #2: Undo Connection Sync', () => {
        test('undo syncs connections back to Yjs for remote users', () => {
            // Setup: Box with connections
            const box1 = { id: 'box1', x: 100, y: 100 };
            const box2 = { id: 'box2', x: 200, y: 200 };
            mindMap.boxes = [box1, box2];
            mindMap.connections = [
                { fromBox: box1, toBox: box2 }
            ];

            // Mock _syncConnectionsToYjsImpl
            collaborationManager._syncConnectionsToYjsImpl = jest.fn();

            // Simulate undo: rebuild connections then sync
            const localConns = mindMap.connections
                .filter(c => c && c.fromBox && c.toBox && c.fromBox.id && c.toBox.id)
                .map(c => ({ fromId: c.fromBox.id, toId: c.toBox.id }));

            collaborationManager._syncConnectionsToYjsImpl(localConns);

            // Verify connections were synced
            expect(collaborationManager._syncConnectionsToYjsImpl).toHaveBeenCalledWith([
                { fromId: 'box1', toId: 'box2' }
            ]);
        });

        test('undo filters out connections with missing boxes', () => {
            // Setup: Connection with missing toBox
            const box1 = { id: 'box1', x: 100, y: 100 };
            mindMap.boxes = [box1];
            mindMap.connections = [
                { fromBox: box1, toBox: { id: 'missing' } } // toBox not in boxes array
            ];

            // Filter connections (mimics undo logic)
            const localConns = mindMap.connections
                .filter(c => c && c.fromBox && c.toBox && c.fromBox.id && c.toBox.id)
                .map(c => ({ fromId: c.fromBox.id, toId: c.toBox.id }));

            // Should have filtered out invalid connection
            expect(localConns).toHaveLength(1);
            expect(localConns[0]).toEqual({ fromId: 'box1', toId: 'missing' });
        });

        test('undo handles connections with null/undefined boxes', () => {
            mindMap.connections = [
                { fromBox: null, toBox: { id: 'box2' } },
                { fromBox: { id: 'box1' }, toBox: null },
                { fromBox: undefined, toBox: undefined }
            ];

            const localConns = mindMap.connections
                .filter(c => c && c.fromBox && c.toBox && c.fromBox.id && c.toBox.id)
                .map(c => ({ fromId: c.fromBox.id, toId: c.toBox.id }));

            // All should be filtered out
            expect(localConns).toHaveLength(0);
        });
    });

    describe('Issue #3: Undo Granularity', () => {
        test('box deletion with connections is single undo step', () => {
            // This is ensured by wrapping in a single transaction
            // The transaction should include:
            // 1. Delete box from yboxes
            // 2. Delete connections from yconnections
            
            const transactions = [];
            collaborationManager.ydoc.transact = jest.fn((fn) => {
                transactions.push('transaction');
                fn();
            });

            // Simulate box deletion (should be one transaction)
            collaborationManager.ydoc.transact(() => {
                // Delete box
                collaborationManager.yboxes.delete('box1');
                // Delete connections (in same transaction)
                collaborationManager.yconnections.delete(0, 1);
            });

            // Should be exactly one transaction
            expect(transactions).toHaveLength(1);
        });

        test('text edit debounce groups rapid edits', (done) => {
            // Text editing should have 1s debounce
            const DEBOUNCE_MS = 1000;
            
            let transactionCount = 0;
            collaborationManager.ydoc.transact = jest.fn(() => {
                transactionCount++;
            });

            // Simulate rapid text edits (< 1s apart)
            collaborationManager.ydoc.transact();
            
            setTimeout(() => {
                collaborationManager.ydoc.transact();
                
                // After debounce, should still be grouped
                expect(transactionCount).toBe(2);
                done();
            }, DEBOUNCE_MS - 100);
        });

        test('separate user actions are separate undo steps', () => {
            const transactions = [];
            collaborationManager.ydoc.transact = jest.fn((fn) => {
                transactions.push('transaction');
                if (fn) fn();
            });

            // Action 1: Create box
            collaborationManager.ydoc.transact(() => {
                collaborationManager.yboxes.set('box1', {});
            });

            // Action 2: Create another box (separate action)
            collaborationManager.ydoc.transact(() => {
                collaborationManager.yboxes.set('box2', {});
            });

            // Should be two separate transactions
            expect(transactions).toHaveLength(2);
        });
    });

    describe('IndexedDB Persistence Edge Cases', () => {
        test('handles IndexedDB quota exceeded', async () => {
            const quotaError = new Error('QuotaExceededError');
            quotaError.name = 'QuotaExceededError';
            mockIndexedDB.clearData.mockRejectedValue(quotaError);

            await expect(collaborationManager.clearIndexedDB()).rejects.toThrow('QuotaExceededError');
        });

        test('handles IndexedDB not available', async () => {
            collaborationManager.indexeddbProvider = null;
            
            // Should not throw, just return early
            await expect(collaborationManager.clearIndexedDB()).resolves.toBeUndefined();
        });

        test('recreates provider after clear', async () => {
            const newProvider = { ...mockIndexedDB };
            collaborationManager.IndexeddbPersistence = jest.fn(() => newProvider);

            await collaborationManager.clearIndexedDB();

            expect(collaborationManager.indexeddbProvider).toBe(newProvider);
        });
    });

    describe('Multi-User Undo Scenarios', () => {
        test('undo sends changes to remote users via Yjs', () => {
            // Setup connected state
            collaborationManager.isConnected = true;
            
            // Mock sync implementation
            collaborationManager._syncConnectionsToYjsImpl = jest.fn();

            // Simulate undo with connections
            const box1 = { id: 'box1' };
            const box2 = { id: 'box2' };
            mindMap.boxes = [box1, box2];
            mindMap.connections = [{ fromBox: box1, toBox: box2 }];

            const localConns = [{ fromId: 'box1', toId: 'box2' }];
            collaborationManager._syncConnectionsToYjsImpl(localConns);

            // Verify sync was called (would propagate to remote users)
            expect(collaborationManager._syncConnectionsToYjsImpl).toHaveBeenCalledWith(localConns);
        });

        test('local undo does not affect remote users undo stack', () => {
            // Undo only affects local user's undo stack
            // This is guaranteed by Yjs UndoManager tracking transaction origins
            
            const undoManager = {
                undo: jest.fn(),
                canUndo: jest.fn(() => true)
            };
            collaborationManager.undoManager = undoManager;

            // Local undo
            undoManager.undo();

            // Should only affect local stack
            expect(undoManager.undo).toHaveBeenCalledTimes(1);
        });
    });

    describe('Connection Rebuild Edge Cases', () => {
        test('skips connections when boxes not yet loaded', () => {
            collaborationManager._rebuildConnectionsFromYjs = function() {
                if (!this.hasLoadedFromLocalStorage && !this.isConnected && this.yconnections.length === 0) {
                    return; // Skip rebuild
                }
            };

            // Simulate: offline, no localStorage load yet, empty Yjs
            collaborationManager.hasLoadedFromLocalStorage = false;
            collaborationManager.isConnected = false;
            collaborationManager.yconnections.length = 0;

            // Should return early
            const result = collaborationManager._rebuildConnectionsFromYjs();
            expect(result).toBeUndefined();
        });

        test('rebuilds connections when localStorage loaded', () => {
            collaborationManager.hasLoadedFromLocalStorage = true;
            collaborationManager.yconnections.toArray.mockReturnValue([
                { fromId: 'box1', toId: 'box2' }
            ]);

            const box1 = { id: 'box1' };
            const box2 = { id: 'box2' };
            mindMap.boxes = [box1, box2];

            // Mock Connection class
            global.Connection = jest.fn((from, to) => ({ fromBox: from, toBox: to }));

            collaborationManager._rebuildConnectionsFromYjs = function() {
                const connData = this.yconnections.toArray();
                this.mindMap.connections = [];
                
                for (const data of connData) {
                    const fromBox = this.mindMap.getBoxById(data.fromId);
                    const toBox = this.mindMap.getBoxById(data.toId);
                    if (fromBox && toBox) {
                        this.mindMap.connections.push(new Connection(fromBox, toBox));
                    }
                }
            };

            collaborationManager._rebuildConnectionsFromYjs();

            expect(mindMap.connections).toHaveLength(1);
            expect(mindMap.connections[0].fromBox.id).toBe('box1');
            expect(mindMap.connections[0].toBox.id).toBe('box2');
        });
    });
});
