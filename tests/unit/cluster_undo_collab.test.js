/**
 * @jest-environment jsdom
 *
 * Real-world integration tests for cluster undo/redo and collaboration sync.
 *
 * These tests use a live Yjs document (no WebSocket) to validate that:
 *  1. addCluster / deleteCluster correctly write to yclusters under a tracked
 *     Yjs transaction so UndoManager can revert them.
 *  2. Undo / redo for cluster creation and deletion works end-to-end.
 *  3. Deleting a box that prunes a cluster is fully atomic: undo restores both
 *     the box and the cluster membership in one operation.
 *  4. Remote collaboration: changes a peer writes to yclusters are applied
 *     locally via the observer (no static-callback interference).
 *  5. No phantom undo entries are created by the diff-based cluster sync.
 *
 * Key design note: MindMap.onClustersChange is a static class property, meaning there
 * is only one callback slot shared across all MindMap instances. In production there is
 * exactly one collaborationManager global per browser tab. Tests that exercise
 * the local→Yjs write path must set global.collaborationManager so that
 * MindMap._wrapInTransaction actually creates a tracked Yjs transaction; without
 * it _wrapInTransaction is a no-op and the yclusters write happens outside a
 * tracked transaction — making undo impossible.
 */

const Y = require('yjs');

global.Utils        = require('../../src/utils');
global.ColorPalette = require('../../src/ColorPalette');

// ── p5.js stubs ──────────────────────────────────────────────────────────────
global.fill         = jest.fn();
global.noFill       = jest.fn();
global.stroke       = jest.fn();
global.noStroke     = jest.fn();
global.strokeWeight = jest.fn();
global.push         = jest.fn();
global.pop          = jest.fn();
global.beginShape   = jest.fn();
global.endShape     = jest.fn();
global.vertex       = jest.fn();
global.curveVertex  = jest.fn();
global.CLOSE        = 2;
global.rect         = jest.fn();
global.text         = jest.fn();
global.textSize     = jest.fn();
global.textWidth    = jest.fn((s) => (s ? s.length * 10 : 50));
global.textAlign    = jest.fn();
global.translate    = jest.fn();
global.cursor       = jest.fn();
global.line         = jest.fn();
global.circle       = jest.fn();
global.max          = Math.max;
global.min          = Math.min;
global.lerp         = (a, b, t) => a + (b - a) * t;
global.keyIsDown    = jest.fn(() => false);
global.BACKSPACE    = 8;
global.DELETE       = 46;
global.LEFT_ARROW   = 37;
global.RIGHT_ARROW  = 39;
global.UP_ARROW     = 38;
global.DOWN_ARROW   = 40;
global.worldMouseX  = () => 0;
global.worldMouseY  = () => 0;

// ── class loading ────────────────────────────────────────────────────────────
const Cluster              = require('../../src/Cluster');
const TextBox              = require('../../src/TextBox');
const Connection           = require('../../src/Connection');
const MindMap              = require('../../src/MindMap');
const CollaborationManager = require('../../src/CollaborationManager');

global.Cluster              = Cluster;
global.TextBox              = TextBox;
global.Connection           = Connection;
global.MindMap              = MindMap;
global.CollaborationManager = CollaborationManager;

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Builds a CollaborationManager wired to a real Y.Doc that includes yclusters
 * in the UndoManager — this is the critical requirement that earlier tests
 * in the repository omitted, leaving cluster undo untested.
 */
function makeCollab(mindMap) {
    const cm = new CollaborationManager(mindMap);
    cm.Y = Y;
    cm.ydoc         = new Y.Doc();
    cm.yboxes       = cm.ydoc.getMap('boxes');
    cm.yconnections = cm.ydoc.getArray('connections');
    cm.yclusters    = cm.ydoc.getMap('clusters');   // ← must be included
    cm.undoManager  = new Y.UndoManager(
        [cm.yboxes, cm.yconnections, cm.yclusters],
        { trackedOrigins: new Set([CollaborationManager.TRACKED_ORIGIN]) }
    );
    cm.isInitialized = true;
    cm.isConnected   = true;
    cm._setupObservers();
    cm._setupMindMapCallbacks();
    return cm;
}

function makeBox(x, y, mm) {
    const box = new TextBox(x, y, 'test');
    box.x = x; box.y = y;
    box.width = 150; box.height = 40;
    mm._registerBox(box);
    return box;
}

// =============================================================================
// GROUP 1: Local → Yjs sync (verifies yclusters entries are written)
// =============================================================================

describe('Cluster ↔ Yjs sync (local write path)', () => {
    let mindMap, cm;

    beforeEach(() => {
        Cluster._nextColorIndex = 0;
        jest.clearAllMocks();
        MindMap.onClustersChange = null;
        mindMap = new MindMap();
        cm = makeCollab(mindMap);
        // Critical: _wrapInTransaction reads the global collaborationManager to
        // decide whether to create a Yjs transaction.  Without this, all cluster
        // writes happen outside a tracked transaction.
        global.collaborationManager = cm;
    });

    afterEach(() => {
        cm._clearMindMapCallbacks();
        MindMap.onClustersChange = null;
        global.collaborationManager = undefined;
    });

    test('addCluster writes the cluster entry to yclusters', () => {
        const b1 = makeBox(0,   0, mindMap);
        const b2 = makeBox(200, 0, mindMap);

        const cluster = mindMap.addCluster([b1, b2]);

        expect(cluster).not.toBeNull();
        expect(cm.yclusters.size).toBe(1);
        const stored = cm.yclusters.get(cluster.id);
        expect(stored).toBeDefined();
        expect(stored.boxIds).toContain(b1.id);
        expect(stored.boxIds).toContain(b2.id);
    });

    test('deleteCluster removes the entry from yclusters', () => {
        const b1 = makeBox(0,   0, mindMap);
        const b2 = makeBox(200, 0, mindMap);
        const cluster = mindMap.addCluster([b1, b2]);
        expect(cm.yclusters.size).toBe(1);

        mindMap.deleteCluster(cluster);

        expect(cm.yclusters.size).toBe(0);
        expect(mindMap.clusters).toHaveLength(0);
    });

    test('_performBoxDeletion updates yclusters when a cluster is pruned below 2 members', () => {
        const b1 = makeBox(0,   0, mindMap);
        const b2 = makeBox(200, 0, mindMap);
        mindMap.addCluster([b1, b2]);
        expect(cm.yclusters.size).toBe(1);

        // Give Yjs entries for b1 and b2 so deleteBoxFromYjs can delete them
        cm.ydoc.transact(() => {
            cm.yboxes.set(b1.id, cm._boxToYjsData(b1));
            cm.yboxes.set(b2.id, cm._boxToYjsData(b2));
        }, null);

        mindMap._wrapInTransaction(() => {
            mindMap._performBoxDeletion([b1]);
        });

        // Cluster pruned (1 member remaining) → removed
        expect(cm.yclusters.size).toBe(0);
        expect(mindMap.clusters).toHaveLength(0);
    });
});

// =============================================================================
// GROUP 2: Undo / redo (requires global.collaborationManager for tracked txns)
// =============================================================================

describe('Cluster undo / redo', () => {
    let mindMap, cm;

    beforeEach(() => {
        Cluster._nextColorIndex = 0;
        jest.clearAllMocks();
        MindMap.onClustersChange = null;
        mindMap = new MindMap();
        cm = makeCollab(mindMap);
        global.collaborationManager = cm;
    });

    afterEach(() => {
        cm._clearMindMapCallbacks();
        MindMap.onClustersChange = null;
        global.collaborationManager = undefined;
    });

    // ── 4. undo addCluster removes the cluster ────────────────────────────────
    test('undo after addCluster removes the cluster from local state and yclusters', () => {
        const b1 = makeBox(0,   0, mindMap);
        const b2 = makeBox(200, 0, mindMap);
        mindMap.addCluster([b1, b2]);

        expect(mindMap.clusters).toHaveLength(1);
        expect(cm.yclusters.size).toBe(1);

        cm.undo();

        expect(mindMap.clusters).toHaveLength(0);
        expect(cm.yclusters.size).toBe(0);
    });

    // ── 5. redo after undo re-creates the cluster ─────────────────────────────
    test('redo after undo of addCluster restores the cluster', () => {
        const b1 = makeBox(0,   0, mindMap);
        const b2 = makeBox(200, 0, mindMap);
        mindMap.addCluster([b1, b2]);

        cm.undo();
        expect(mindMap.clusters).toHaveLength(0);

        cm.redo();
        expect(mindMap.clusters).toHaveLength(1);
        expect(cm.yclusters.size).toBe(1);
    });

    // ── 6. undo deleteCluster restores the cluster ────────────────────────────
    test('undo after deleteCluster restores the cluster to local state and yclusters', () => {
        const b1 = makeBox(0,   0, mindMap);
        const b2 = makeBox(200, 0, mindMap);
        const cluster = mindMap.addCluster([b1, b2]);
        cm.undoManager.clear(); // only track the delete

        mindMap.deleteCluster(cluster);
        expect(mindMap.clusters).toHaveLength(0);
        expect(cm.yclusters.size).toBe(0);

        cm.undo();

        expect(mindMap.clusters).toHaveLength(1);
        expect(cm.yclusters.size).toBe(1);
        expect(mindMap.clusters[0].boxes.map(b => b.id)).toContain(b1.id);
        expect(mindMap.clusters[0].boxes.map(b => b.id)).toContain(b2.id);
    });

    // ── 7. box deletion + cluster pruning is a single atomic undo step ────────
    test('undo after box deletion restores both the box and the pruned cluster', () => {
        const b1 = makeBox(0,   0, mindMap);
        const b2 = makeBox(200, 0, mindMap);
        mindMap.addCluster([b1, b2]);
        cm.undoManager.clear();

        // Give Yjs entries so deleteBoxFromYjs can remove them
        cm.ydoc.transact(() => {
            cm.yboxes.set(b1.id, cm._boxToYjsData(b1));
            cm.yboxes.set(b2.id, cm._boxToYjsData(b2));
        }, null);

        // Delete b1: cluster shrinks to 1 member → pruned
        mindMap._wrapInTransaction(() => {
            mindMap._performBoxDeletion([b1]);
        });

        expect(mindMap.getBoxById(b1.id)).toBeNull();
        expect(mindMap.clusters).toHaveLength(0);
        expect(cm.yclusters.size).toBe(0);

        // One undo step must restore everything atomically
        cm.undo();

        expect(mindMap.getBoxById(b1.id)).not.toBeNull();
        expect(mindMap.clusters).toHaveLength(1);
        expect(mindMap.clusters[0].boxes.map(b => b.id)).toContain(b1.id);
        expect(mindMap.clusters[0].boxes.map(b => b.id)).toContain(b2.id);
        expect(cm.yclusters.size).toBe(1);
    });

    // ── 8. no phantom undo entries from diff-based cluster sync ───────────────
    test('addCluster produces exactly one undo entry (no phantom entries)', () => {
        const b1 = makeBox(0,   0, mindMap);
        const b2 = makeBox(200, 0, mindMap);
        cm.undoManager.clear();

        mindMap.addCluster([b1, b2]);

        expect(cm.undoManager.undoStack.length).toBe(1);
    });

    // ── 9. deleteCluster produces exactly one undo entry ─────────────────────
    test('deleteCluster produces exactly one undo entry', () => {
        const b1 = makeBox(0,   0, mindMap);
        const b2 = makeBox(200, 0, mindMap);
        const cluster = mindMap.addCluster([b1, b2]);
        cm.undoManager.clear();

        mindMap.deleteCluster(cluster);

        expect(cm.undoManager.undoStack.length).toBe(1);
    });

    // ── 10. deleteCluster called directly (not from keyboard) is undoable ─────
    test('deleteCluster called standalone (without extra _wrapInTransaction) is undoable', () => {
        // This tests that deleteCluster self-wraps — unlike the old implementation
        // which required the caller (handleKeyPressed) to provide the outer transaction.
        const b1 = makeBox(0,   0, mindMap);
        const b2 = makeBox(200, 0, mindMap);
        const cluster = mindMap.addCluster([b1, b2]);
        cm.undoManager.clear();

        // Call deleteCluster directly, with NO surrounding _wrapInTransaction
        mindMap.deleteCluster(cluster);

        expect(mindMap.clusters).toHaveLength(0);
        expect(cm.undoManager.undoStack.length).toBe(1);

        cm.undo();
        expect(mindMap.clusters).toHaveLength(1);
    });

    // ── 11. keyboard-triggered cluster deletion is one undo step ─────────────
    test('keyboard cluster deletion (handleKeyPressed pattern) is one tracked undo step', () => {
        const b1 = makeBox(0,   0, mindMap);
        const b2 = makeBox(200, 0, mindMap);
        const cluster = mindMap.addCluster([b1, b2]);
        mindMap.selectedCluster = cluster;
        cm.undoManager.clear();

        // Reproduce the exact handleKeyPressed BACKSPACE/DELETE path
        const toDelete = mindMap.selectedCluster;
        mindMap.selectedCluster = null;
        mindMap._wrapInTransaction(() => {
            mindMap.deleteCluster(toDelete);
        });

        expect(mindMap.clusters).toHaveLength(0);
        // Nested _wrapInTransaction calls still produce exactly one undo entry
        expect(cm.undoManager.undoStack.length).toBe(1);

        cm.undo();
        expect(mindMap.clusters).toHaveLength(1);
    });
});

// =============================================================================
// GROUP 3: Remote collaboration — tests the observer path, not the write path.
// Two Y.Docs are connected via Y.applyUpdate (synchronous, no WebSocket).
// We write directly to the "sender" doc to avoid static MindMap.onClustersChange
// conflicts between two CollaborationManager instances.
// =============================================================================

describe('Cluster remote collaboration (two-doc simulation)', () => {
    let mindMapA, cmA;
    let mindMapB, cmB;

    /**
     * One-way merge: apply all of docSrc's changes into docDst.
     */
    function applyTo(docDst, docSrc) {
        Y.applyUpdate(docDst, Y.encodeStateAsUpdate(docSrc));
    }

    /**
     * Full bidirectional sync.
     */
    function sync(cmX, cmY) {
        applyTo(cmX.ydoc, cmY.ydoc);
        applyTo(cmY.ydoc, cmX.ydoc);
    }

    beforeEach(() => {
        Cluster._nextColorIndex = 0;
        jest.clearAllMocks();
        MindMap.onClustersChange = null;
        global.collaborationManager = undefined;

        mindMapA = new MindMap();
        cmA = makeCollab(mindMapA);

        mindMapB = new MindMap();
        cmB = makeCollab(mindMapB);
    });

    afterEach(() => {
        cmA._clearMindMapCallbacks();
        cmB._clearMindMapCallbacks();
        MindMap.onClustersChange = null;
        global.collaborationManager = undefined;
    });

    // ── 12. yclusters observer applies a remote cluster addition ──────────────
    test('yclusters observer applies a remote cluster creation to local state', () => {
        // Add boxes to peer A's JS state AND Yjs (makeBox → mindMapA, manual write → cmA.yboxes).
        // The observer on cmA skips the local write (correct); cmB's observer will pick it up.
        const a1 = makeBox(0,   0, mindMapA);
        const a2 = makeBox(200, 0, mindMapA);
        cmA.ydoc.transact(() => {
            cmA.yboxes.set(a1.id, cmA._boxToYjsData(a1));
            cmA.yboxes.set(a2.id, cmA._boxToYjsData(a2));
        }, null);

        // Propagate boxes to B
        applyTo(cmB.ydoc, cmA.ydoc);
        expect(mindMapA.boxes).toHaveLength(2);  // added via makeBox
        expect(mindMapB.boxes).toHaveLength(2);  // applied by cmB.yboxes.observe

        // Peer A writes a cluster entry directly to its yclusters
        cmA.ydoc.transact(() => {
            cmA.yclusters.set('cluster-1', { id: 'cluster-1', colorIndex: 0, boxIds: [a1.id, a2.id] });
        }, null);

        // Propagate to peer B — B's yclusters.observe() should rebuild clusters
        applyTo(cmB.ydoc, cmA.ydoc);

        expect(mindMapB.clusters).toHaveLength(1);
        expect(mindMapB.clusters[0].boxes.map(b => b.id)).toContain(a1.id);
        expect(mindMapB.clusters[0].boxes.map(b => b.id)).toContain(a2.id);
    });

    // ── 13. yclusters observer applies a remote cluster deletion ──────────────
    test('yclusters observer applies a remote cluster deletion to local state', () => {
        const boxId1 = 'box-1';
        const boxId2 = 'box-2';
        const clusterId = 'cluster-1';

        // Bootstrap both peers with boxes and a cluster
        cmA.ydoc.transact(() => {
            cmA.yboxes.set(boxId1, { id: boxId1, x: 0,   y: 0, text: 'A', width: 100, height: 40 });
            cmA.yboxes.set(boxId2, { id: boxId2, x: 200, y: 0, text: 'B', width: 100, height: 40 });
            cmA.yclusters.set(clusterId, { id: clusterId, colorIndex: 0, boxIds: [boxId1, boxId2] });
        }, null);
        sync(cmA, cmB);
        expect(mindMapB.clusters).toHaveLength(1);

        // Peer A removes the cluster
        cmA.ydoc.transact(() => {
            cmA.yclusters.delete(clusterId);
        }, null);
        applyTo(cmB.ydoc, cmA.ydoc);

        expect(mindMapB.clusters).toHaveLength(0);
    });

    // ── 14. concurrent clusters from both peers are both preserved (CRDT merge)
    test('concurrent cluster creations by both peers are both preserved after merge', () => {
        // Each peer registers its own boxes via makeBox (adds to JS state),
        // then mirrors them into its Yjs doc so the other peer can receive them.
        const a1 = makeBox(0,   0, mindMapA);
        const a2 = makeBox(200, 0, mindMapA);
        const b1 = makeBox(400, 0, mindMapB);
        const b2 = makeBox(600, 0, mindMapB);

        cmA.ydoc.transact(() => {
            cmA.yboxes.set(a1.id, cmA._boxToYjsData(a1));
            cmA.yboxes.set(a2.id, cmA._boxToYjsData(a2));
        }, null);
        cmB.ydoc.transact(() => {
            cmB.yboxes.set(b1.id, cmB._boxToYjsData(b1));
            cmB.yboxes.set(b2.id, cmB._boxToYjsData(b2));
        }, null);

        // Exchange boxes so both peers know about all 4 boxes
        sync(cmA, cmB);
        expect(mindMapA.boxes).toHaveLength(4);  // a1,a2 (makeBox) + b1,b2 (from cmB via observer)
        expect(mindMapB.boxes).toHaveLength(4);  // b1,b2 (makeBox) + a1,a2 (from cmA via observer)

        // Concurrent cluster creation (before syncing with each other again)
        cmA.ydoc.transact(() => {
            cmA.yclusters.set('cA', { id: 'cA', colorIndex: 0, boxIds: [a1.id, a2.id] });
        }, null);
        cmB.ydoc.transact(() => {
            cmB.yclusters.set('cB', { id: 'cB', colorIndex: 1, boxIds: [b1.id, b2.id] });
        }, null);

        // Merge — CRDT must preserve both clusters
        sync(cmA, cmB);

        expect(mindMapA.clusters).toHaveLength(2);
        expect(mindMapB.clusters).toHaveLength(2);
    });

    // ── 15. yclusters observer does NOT re-apply a local tracked write ─────────
    test('addCluster (local tracked write via TRACKED_ORIGIN) does not trigger _rebuildClustersFromYjs', () => {
        // A "local tracked write" is a write that originates from THIS doc under the
        // TRACKED_ORIGIN, as opposed to a remote update (Y.applyUpdate from another doc)
        // or an undo/redo operation.  The observer guard
        //   (event.transaction.local && !isUndoRedo) → return
        // exists precisely to prevent double-application of our own writes.
        global.collaborationManager = cmA;
        cmA._setupMindMapCallbacks(); // re-assert so MindMap.onClustersChange → cmA

        const b1 = makeBox(0,   0, mindMapA);
        const b2 = makeBox(200, 0, mindMapA);

        const rebuildSpy = jest.spyOn(cmA, '_rebuildClustersFromYjs');

        mindMapA.addCluster([b1, b2]);

        // The yclusters observer guard (event.transaction.local && !isUndoRedo)
        // skips all local tracked writes to prevent double-application.
        expect(rebuildSpy).not.toHaveBeenCalled();
        rebuildSpy.mockRestore();
    });

    // ── 16. remote cluster deletion clears selectedCluster on receiving peer ───
    test('remote cluster deletion clears selectedCluster on the receiving peer', () => {
        const boxId1 = 'box-r1';
        const boxId2 = 'box-r2';
        const clusterId = 'cluster-r1';

        // Bootstrap both peers with boxes and a cluster
        cmA.ydoc.transact(() => {
            cmA.yboxes.set(boxId1, { id: boxId1, x: 0,   y: 0, text: 'A', width: 100, height: 40 });
            cmA.yboxes.set(boxId2, { id: boxId2, x: 200, y: 0, text: 'B', width: 100, height: 40 });
            cmA.yclusters.set(clusterId, { id: clusterId, colorIndex: 0, boxIds: [boxId1, boxId2] });
        }, null);
        sync(cmA, cmB);
        expect(mindMapB.clusters).toHaveLength(1);

        // Peer B selects the cluster
        const clusterOnB = mindMapB.clusters[0];
        mindMapB.selectedCluster = clusterOnB;
        clusterOnB.selected = true;

        // Peer A remotely deletes the cluster
        cmA.ydoc.transact(() => {
            cmA.yclusters.delete(clusterId);
        }, null);
        applyTo(cmB.ydoc, cmA.ydoc);

        // Peer B must have no clusters and no selected cluster
        expect(mindMapB.clusters).toHaveLength(0);
        expect(mindMapB.selectedCluster).toBeNull();
    });

    // ── 17. _rebuildClustersFromYjs does not pollute _nextColorIndex ───────────
    test('_rebuildClustersFromYjs does not advance Cluster._nextColorIndex', () => {
        // Bug: every new Cluster() call in the constructor advances
        // Cluster._nextColorIndex.  fromJSON (used inside _rebuildClustersFromYjs)
        // previously did not restore the counter, so every remote sync event
        // caused subsequent user-created clusters to skip palette entries.
        const boxId1 = 'box-ni1';
        const boxId2 = 'box-ni2';

        cmA.ydoc.transact(() => {
            cmA.yboxes.set(boxId1, { id: boxId1, x: 0,   y: 0, text: 'A', width: 100, height: 40 });
            cmA.yboxes.set(boxId2, { id: boxId2, x: 200, y: 0, text: 'B', width: 100, height: 40 });
            cmA.yclusters.set('ni-cluster', { id: 'ni-cluster', colorIndex: 2, boxIds: [boxId1, boxId2] });
        }, null);

        // Sync to peer B: this triggers _rebuildClustersFromYjs on B
        const before = Cluster._nextColorIndex;
        applyTo(cmB.ydoc, cmA.ydoc);

        // _rebuildClustersFromYjs must not have advanced the counter
        expect(Cluster._nextColorIndex).toBe(before);

        // Rebuild again to confirm repeated calls are also idempotent
        cmB._rebuildClustersFromYjs();
        cmB._rebuildClustersFromYjs();
        expect(Cluster._nextColorIndex).toBe(before);
    });
});
