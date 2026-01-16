/**
 * CollaborationManager - Real-time collaboration using Yjs and WebSockets
 * 
 * This module provides real-time synchronization of mindmap data
 * using Yjs CRDTs (Conflict-free Replicated Data Types) and WebSockets.
 * 
 * Architecture:
 * - Y.Doc contains all shared state
 * - Y.Map<boxId, boxData> for TextBox synchronization
 * - Y.Array<{fromId, toId}> for Connection synchronization
 * - y-websocket provider for client-server networking
 * - Awareness protocol for user presence (cursors, selections)
 */

class CollaborationManager {
    // ============================================================================
    // CONSTANTS
    // ============================================================================

    //static PRODUCTION_SERVER = 'wss://y-websocket-19go.onrender.com';
    static PRODUCTION_SERVER = 'wss://p01--y-websockets--l9lrvfgkxvzh.code.run';
    static LOCAL_SERVER_PORT = 1234;

    static WEBSOCKET_SERVER = (() => {
        if (typeof window === 'undefined') {
            return `ws://localhost:${CollaborationManager.LOCAL_SERVER_PORT}`;
        }

        const host = window.location.hostname;
        const params = new URLSearchParams(window.location.search);
        const serverOverride = params.get('server');

        // Manual override via URL parameter (e.g. ?server=public)
        if (serverOverride === 'public' || serverOverride === 'demo') {
            return 'wss://demos.yjs.dev';
        }

        // Local development environments
        const isLocalhost = host === 'localhost' || host === '127.0.0.1';
        const isPrivateIP = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(host);

        if (isLocalhost) {
            // When running on localhost, prefer connecting to the production websocket server
            // so local development uses the same production backend unless overridden.
            return CollaborationManager.PRODUCTION_SERVER;
        }

        if (isPrivateIP) {
            return `ws://${host}:${CollaborationManager.LOCAL_SERVER_PORT}`;
        }

        // Production
        return CollaborationManager.PRODUCTION_SERVER;
    })();

    static DEFAULT_USER_COLORS = [
        '#e91e63', '#9c27b0', '#673ab7', '#3f51b5',
        '#2196f3', '#00bcd4', '#009688', '#4caf50',
        '#8bc34a', '#ff9800', '#ff5722', '#795548'
    ];

    // Timing constants
    static UNDO_CAPTURE_TIMEOUT = 0; // ms - disable time-based undo grouping (action-based undo)
    static TEXT_SYNC_DEBOUNCE = 300; // ms - debounce text sync during active editing
    // 1000ms timeout chosen based on typical typing pause patterns:
    // - Fast typing: 100-200ms between characters
    // - Natural pauses: 500-1500ms (thinking, reading, correcting)
    // - 1000ms provides good balance: groups continuous typing while respecting natural breaks
    static TEXT_UNDO_GROUP_TIMEOUT = 1000; // ms - time to wait before closing text edit undo group

    // Sync verification timing - adjusted for free server cold start (30-60s)
    static SYNC_VERIFICATION_DELAY = 10000; // ms - delay before first verification (10s for cold start)
    static SYNC_RETRY_DELAY = 5000; // ms - delay between retries (5s for cold start)
    static MAX_SYNC_RETRIES = 12; // Maximum retries (12 * 5s = 60s total)
    static COLD_START_THRESHOLD = 5000; // ms - if connection takes >5s, assume cold start
    static COLD_START_GRACE_PERIOD = 60000; // ms - grace period before removing local data (60s)
    static EXPONENTIAL_BACKOFF_ATTEMPTS = 6; // Number of attempts with exponential backoff before fixed interval

    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================

    /**
     * Creates a new CollaborationManager
     * @param {MindMap} mindMap - The MindMap instance to synchronize
     */
    constructor(mindMap) {
        this.mindMap = mindMap;

        // Yjs state (initialized in initialize())
        this.ydoc = null;
        this.provider = null;
        this.awareness = null;

        // Shared types
        this.yboxes = null;      // Y.Map<boxId, boxData>
        this.yconnections = null; // Y.Array<{fromId, toId}>
        this.undoManager = null;  // Y.UndoManager for undo/redo

        // Connection state
        this.roomName = null;
        this.isConnected = false;
        this.isInitialized = false;
        this.isInitializing = false; // Track if initialization is in progress
        this.initializationPromise = null; // Store the initialization promise
        this.isSyncing = false; // Prevent feedback loops
        this.lastSyncedState = false; // Track previous synced state to detect transitions
        this.shouldShareLocalData = false; // Whether to share local data with room (set when connecting)

        // User identity
        this.userId = this._generateUserId();
        this.userName = this._generateUserName();
        this.userColor = this._pickRandomColor();

        // Callbacks for UI updates
        this.onConnectionChange = null;
        this.onPeersChange = null;
        this.onAwarenessChange = null;
        this.onVersionMismatch = null; // Called when incompatible client detected

        // Version mismatch state
        this.versionMismatchInfo = null; // {reason, peerVersion}

        // Yjs and y-websocket modules (loaded dynamically)
        this.Y = null;
        this.WebsocketProvider = null;

        // Interpolation
        this.interpolatedCursors = new Map(); // userId -> { x, y, targetX, targetY, lastUpdate }

        // Debounce timers for text sync during editing
        this.textSyncTimers = new Map(); // boxId -> timeoutId
        
        // Text editing undo grouping state
        this.textEditUndoTimer = null; // Timer to close text edit undo group
        this.textEditUndoTimerLastReset = 0; // Timestamp of last timer reset
        this.isTextEditUndoGroupOpen = false; // Whether we're in a text edit undo group
        this.currentEditingBoxId = null; // Track which box is currently being edited for undo grouping

        // Debug flag for targeted undo/redo logging
        this._isPerformingUndoRedo = false;

        // Retry timer for initial sync race condition
        this.syncRetryTimer = null;

        // Periodic consistency check timer
        this.consistencyCheckTimer = null;
        this.consistencyCheckInterval = 30000; // Check every 30 seconds (reduced overhead)
        this.consecutiveSyncedChecks = 0; // Track consecutive checks with no mismatches

        // Server state tracking for cold start detection
        this.connectionStartTime = null;
        this.lastSyncAttemptTime = null;
        this.syncAttemptCount = 0;

        // Flag to trigger resetView once after first receiving remote boxes
        this.hasTriggeredInitialZoom = false;
    }

    // ============================================================================
    // INITIALIZATION
    // ============================================================================

    /**
     * Initializes Yjs document and UndoManager.
     * Call this once at startup. Undo/redo works even without network connection.
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.isInitialized) {
            console.warn('CollaborationManager: Already initialized');
            return;
        }

        // If initialization is already in progress, wait for it to complete
        if (this.isInitializing) {
            Utils.Logger.debug('[Init] Already in progress, waiting...');
            return this.initializationPromise;
        }

        this.isInitializing = true;

        // Store the initialization promise so concurrent calls can await it
        this.initializationPromise = this._doInitialize();

        return this.initializationPromise;
    }

    /**
     * Performs the actual initialization work.
     * @private
     * @returns {Promise<void>}
     */
    async _doInitialize() {
        try {
            // Load Yjs modules dynamically
            await this._loadDependencies();

            // Create Yjs document (local, not yet synced)
            this.ydoc = new this.Y.Doc();

            // Initialize shared types
            this.yboxes = this.ydoc.getMap('boxes');
            this.yconnections = this.ydoc.getArray('connections');

            // Create UndoManager - tracks LOCAL changes only
            // captureTimeout: 0 disables time-based grouping for action-based undo
            // trackedOrigins must explicitly include the origin used in transactions.
            // Using an empty set previously prevented ANY captures, so add undoManager after creation.
            const trackedOrigins = new Set();
            this.undoManager = new this.Y.UndoManager([this.yboxes, this.yconnections], {
                captureTimeout: CollaborationManager.UNDO_CAPTURE_TIMEOUT,
                trackedOrigins
            });
            // Ensure all transactions we tag with `this.undoManager` are tracked for undo/redo
            trackedOrigins.add(this.undoManager);

            // Set up observers for Yjs → local sync (including undo/redo)
            this._setupObservers();

            // Set up MindMap callbacks for local → Yjs sync
            this._setupMindMapCallbacks();

            // NOTE: _syncLocalToYjs() is NOT called here.
            // It should be called explicitly after loading local data
            // but ONLY if not joining a collaborative room.
            // When joining a room, the room's state is authoritative.

            this.isInitialized = true;
            Utils.Logger.collab('[Init] Initialized (Yjs ready, not yet connected)');

        } catch (error) {
            console.error('CollaborationManager: Failed to initialize', error);
            throw error;
        } finally {
            this.isInitializing = false;
            this.initializationPromise = null;
        }
    }

    // ============================================================================
    // CONNECTION MANAGEMENT
    // ============================================================================

    /**
     * Connects to a collaboration room via WebSocket.
     * Must call initialize() first.
     * @param {string} roomName - Unique room identifier
     * @param {string|null} serverUrl - Optional custom server URL
     * @param {boolean} shouldShareLocalData - If true, share local data when room is empty. If false, only receive from room. Defaults to false.
     * @returns {Promise<void>}
     */
    async connect(roomName, serverUrl = null, shouldShareLocalData = false) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (this.isConnected) {
            console.warn('CollaborationManager: Already connected');
            return;
        }

        // Track connection start time for cold start detection
        this.connectionStartTime = Date.now();

        // Store the sharing intent for use in sync handler
        this.shouldShareLocalData = shouldShareLocalData;

        this.roomName = roomName;
        const signalingUrl = serverUrl || CollaborationManager.WEBSOCKET_SERVER;

        try {
            // Create Websocket provider (adds sync layer to existing Yjs doc)
            this.provider = new this.WebsocketProvider(
                signalingUrl,
                this.roomName,
                this.ydoc
            );

            // Set up awareness for presence
            this.awareness = this.provider.awareness;
            this._setupAwareness();

            // Track connection state - set isConnected based on actual WebSocket status
            this.provider.on('status', ({ status }) => {
                Utils.Logger.network('[Connection] Status:', status);
                const wasConnected = this.isConnected;
                this.isConnected = (status === 'connected');

                if (this.onConnectionChange) {
                    this.onConnectionChange(status);
                }

                // Notify about peer changes when connection status changes
                if (wasConnected !== this.isConnected && this.onPeersChange) {
                    this.onPeersChange(this.getRemoteUsers());
                }
            });

            // Track sync state
            this.provider.on('synced', ({ synced }) => {
                Utils.Logger.state('[Sync] Status:', synced);

                // Detect transition from not-synced to synced (initial sync or resync)
                const isResync = synced && !this.lastSyncedState;
                this.lastSyncedState = synced;

                // FORCE connection state to true if synced (fixes split-brain issue)
                if (synced && !this.isConnected) {
                    Utils.Logger.state('[Sync] Synced implies connected - forcing state');
                    this.isConnected = true;
                    if (this.onConnectionChange) this.onConnectionChange('connected');
                }

                // Handle sync transitions: rebuild from Yjs when transitioning to synced state
                // This handles both initial sync and resync after reconnection
                if (isResync && this.yboxes && this.mindMap) {
                    const yjsEmpty = this.yboxes.size === 0;
                    const localHasData = this.mindMap.boxes && this.mindMap.boxes.length > 0;

                    if (yjsEmpty && localHasData && this.shouldShareLocalData) {
                        this._handleStartCollaborationWithData();
                    } else if (yjsEmpty && localHasData && !this.shouldShareLocalData) {
                        this._handleJoinEmptyRoom();
                    } else if (!yjsEmpty && !this.shouldShareLocalData) {
                        this._handleJoinRoomWithData();
                    } else if (!yjsEmpty && this.shouldShareLocalData) {
                        this._handleStartCollaborationRoomHasData();
                    } else if (yjsEmpty && !localHasData) {
                        this._handleBothEmpty();
                    }
                }

                // Start or stop consistency check based on sync state
                if (synced) {
                    // Start periodic consistency check when fully synced
                    this._startConsistencyCheck();
                } else {
                    // Stop consistency check when not synced
                    this._stopConsistencyCheck();
                }

                if (this.onConnectionChange) {
                    this.onConnectionChange(synced ? 'synced' : 'syncing');
                }
            });

            Utils.Logger.collab(`[Room] Connecting to "${roomName}"...`);

        } catch (error) {
            console.error('CollaborationManager: Failed to connect', error);
            this.disconnect();
            throw error;
        }
    }

    /**
     * Disconnects from the current room but preserves local Yjs state.
     * Undo/redo continues to work after disconnecting.
     */
    disconnect() {
        // Clear sync retry timer
        if (this.syncRetryTimer) {
            clearTimeout(this.syncRetryTimer);
            this.syncRetryTimer = null;
        }

        // Stop consistency check timer
        this._stopConsistencyCheck();

        // Clear any pending text sync timers to prevent orphaned callbacks
        if (this.textSyncTimers) {
            for (const timer of this.textSyncTimers.values()) {
                clearTimeout(timer);
            }
            this.textSyncTimers.clear();
        }

        // Signal awareness that this client is leaving BEFORE disconnect
        // Setting local state to null notifies other clients that we're leaving
        if (this.awareness) {
            try {
                this.awareness.setLocalState(null);
            } catch (e) {
                console.warn('CollaborationManager: Error clearing awareness state', e);
            }
        }

        // Only disconnect the WebSocket provider, NOT the Yjs doc/UndoManager
        if (this.provider) {
            this.provider.disconnect();
            this.provider.destroy();
            this.provider = null;
        }

        // Null out awareness reference (it's destroyed along with the provider above)
        this.awareness = null;
        this.roomName = null;
        this.isConnected = false;
        this.lastSyncedState = false; // Reset sync state tracking
        this.hasTriggeredInitialZoom = false; // Reset so next room join will auto-zoom

        Utils.Logger.collab('[Disconnect] Left room (local undo still works)');

        if (this.onConnectionChange) {
            this.onConnectionChange('disconnected');
        }
    }

    /**
     * Fully destroys the collaboration manager, including Yjs state.
     * Call this only when shutting down the application.
     */
    destroy() {
        this.disconnect();

        // Clean up text editing undo group timer
        if (this.textEditUndoTimer) {
            clearTimeout(this.textEditUndoTimer);
            this.textEditUndoTimer = null;
        }
        this.isTextEditUndoGroupOpen = false;
        this.currentEditingBoxId = null;
        this.textEditUndoTimerLastReset = 0;

        // Clean up text sync timers
        for (const timer of this.textSyncTimers.values()) {
            clearTimeout(timer);
        }
        this.textSyncTimers.clear();

        // Now destroy Yjs state
        if (this.undoManager) {
            this.undoManager.destroy();
            this.undoManager = null;
        }

        if (this.ydoc) {
            this.ydoc.destroy();
            this.ydoc = null;
        }

        this.yboxes = null;
        this.yconnections = null;
        this.isInitialized = false;
        this.isInitializing = false;
        this.initializationPromise = null;

        // Clear MindMap callbacks
        this._clearMindMapCallbacks();

        Utils.Logger.collab('[Destroy] Collaboration manager destroyed');
    }

    /**
     * Undo the last local operation (collaborative-aware)
     * Only undoes YOUR changes, not other users' changes
     * @returns {boolean} true if undo was performed
     */
    undo() {
        if (!this.undoManager) return false;
        if (this.undoManager.undoStack.length === 0) return false;

        // Close any open text editing undo group before performing undo
        // This ensures the current text edit is completed and captured
        if (this.isTextEditUndoGroupOpen) {
            this._closeTextEditUndoGroup();
        }

        this._isPerformingUndoRedo = true;
        try {
            this.undoManager.undo();
        } finally {
            this._isPerformingUndoRedo = false;
        }
        Utils.Logger.debug('[Undo] Performed');

        // Trigger redraw
        if (this.mindMap) {
            this.mindMap.isDirty = true;
        }
        return true;
    }

    /**
     * Redo the last undone operation (collaborative-aware)
     * @returns {boolean} true if redo was performed
     */
    redo() {
        if (!this.undoManager) return false;
        if (this.undoManager.redoStack.length === 0) return false;

        // Close any open text editing undo group before performing redo
        // This ensures consistency in undo/redo behavior
        if (this.isTextEditUndoGroupOpen) {
            this._closeTextEditUndoGroup();
        }

        this._isPerformingUndoRedo = true;
        try {
            this.undoManager.redo();
        } finally {
            this._isPerformingUndoRedo = false;
        }
        Utils.Logger.debug('[Redo] Performed');

        // Trigger redraw
        if (this.mindMap) {
            this.mindMap.isDirty = true;
        }
        return true;
    }

    /**
     * Check if undo is available
     * @returns {boolean}
     */
    canUndo() {
        return this.undoManager && this.undoManager.undoStack.length > 0;
    }

    /**
     * Check if redo is available
     * @returns {boolean}
     */
    canRedo() {
        return this.undoManager && this.undoManager.redoStack.length > 0;
    }

    /**
     * Explicitly closes the current undo stack item.
     * Call this at the end of continuous operations like dragging to mark the entire
     * operation as a single undo step.
     */
    stopCapturing() {
        if (this.undoManager) {
            this.undoManager.stopCapturing();
        }
    }

    /**
     * Executes a function within a Yjs transaction.
     * All Yjs changes within the callback are grouped as a single undo step.
     * Use this for atomic operations like creating/deleting boxes, alignment, etc.
     * @param {Function} callback - Function to execute within the transaction
     */
    transact(callback, label = '') {
        if (typeof callback !== 'function') {
            throw new TypeError('transact() requires a function callback');
        }

        // Close any open text editing undo group before starting a new transaction
        // This ensures text edits don't get mixed with other operations
        if (this.isTextEditUndoGroupOpen) {
            this._closeTextEditUndoGroup();
        }

        if (this.ydoc && this.undoManager) {
            // Set origin to undoManager so it knows to track this transaction
            this.ydoc.transact(callback, this.undoManager);
        } else if (this.ydoc) {
            // Fallback without undo manager
            this.ydoc.transact(callback);
        } else {
            // Fallback: just execute the callback if ydoc is not available
            callback();
        }
    }

    /**
     * Clears the undo/redo history.
     * Call this after loading files to prevent undo from reverting the load.
     */
    clearUndoHistory() {
        if (this.undoManager) {
            this.undoManager.clear();
            Utils.Logger.debug('[Undo] History cleared');
        }
    }

    /**
     * Starts a text editing undo group if not already open.
     * Text edits within a group are undone/redone together as one operation.
     * @private
     */
    _startTextEditUndoGroup() {
        if (this.isTextEditUndoGroupOpen) {
            // Group already open, just reset the timer
            this._resetTextEditUndoTimer();
            return;
        }

        this.isTextEditUndoGroupOpen = true;
        this._resetTextEditUndoTimer();
    }

    /**
     * Resets the timer that closes the text editing undo group.
     * Called on each text edit to extend the group while typing continues.
     * Optimized to avoid unnecessary timer churn during rapid typing.
     * @private
     */
    _resetTextEditUndoTimer() {
        const now = Date.now();
        const timeSinceLastReset = now - this.textEditUndoTimerLastReset;
        
        // Skip timer reset if we just reset it recently (< 100ms ago)
        // This reduces timer churn during very rapid typing while still
        // maintaining the 1s timeout for closing the undo group
        if (timeSinceLastReset < 100 && this.textEditUndoTimer) {
            return;
        }

        // Clear existing timer
        if (this.textEditUndoTimer) {
            clearTimeout(this.textEditUndoTimer);
        }

        // Set new timer to close the group after inactivity
        this.textEditUndoTimer = setTimeout(() => {
            this._closeTextEditUndoGroup();
        }, CollaborationManager.TEXT_UNDO_GROUP_TIMEOUT);
        
        this.textEditUndoTimerLastReset = now;
    }

    /**
     * Closes the current text editing undo group.
     * This creates an undo boundary, making all edits since _startTextEditUndoGroup()
     * undoable as a single operation.
     * @private
     */
    _closeTextEditUndoGroup() {
        if (!this.isTextEditUndoGroupOpen) return;

        this.isTextEditUndoGroupOpen = false;
        this.textEditUndoTimerLastReset = 0; // Reset timestamp
        if (this.textEditUndoTimer) {
            clearTimeout(this.textEditUndoTimer);
            this.textEditUndoTimer = null;
        }

        // Stop capturing to close the undo boundary
        this.stopCapturing();
        Utils.Logger.debug('[Undo] Closed text edit group');
    }

    /**
     * Sets up MindMap static callbacks for local → Yjs sync
     * @private
     */
    _setupMindMapCallbacks() {
        // When a box changes locally, sync to Yjs
        // Note: Using arrow functions which capture `this` automatically
        if (typeof MindMap !== 'undefined') {
            MindMap.onBoxChange = (box, skipTransactionWrapper = false) => {
                this.syncBoxToYjs(box, skipTransactionWrapper);
            };

            MindMap.onBoxDelete = (boxId) => {
                this.deleteBoxFromYjs(boxId);
            };

            MindMap.onConnectionsChange = (skipTransactionWrapper = false) => {
                this.syncConnectionsToYjs(skipTransactionWrapper);
            };
        }
    }

    /**
     * Clears MindMap callbacks
     * @private
     */
    _clearMindMapCallbacks() {
        if (typeof MindMap !== 'undefined') {
            MindMap.onBoxChange = null;
            MindMap.onBoxDelete = null;
            MindMap.onConnectionsChange = null;
        }
    }

    // ============================================================================
    // DEPENDENCY LOADING
    // ============================================================================

    /**
     * Dynamically loads Yjs and y-websocket from CDN
     * @private
     */
    async _loadDependencies() {
        if (this.Y && this.WebsocketProvider) return;

        try {
            // Import Yjs and y-websocket from ESM.sh
            const yjsModule = await import('https://esm.sh/yjs@13.6.18');
            this.Y = yjsModule;

            const websocketModule = await import('https://esm.sh/y-websocket@1.5.0?deps=yjs@13.6.18');
            this.WebsocketProvider = websocketModule.WebsocketProvider;

            Utils.Logger.collab('[Dependencies] Loaded via ESM.sh (Websockets)');
        } catch (error) {
            console.error('CollaborationManager: Failed to load dependencies', error);
            throw new Error('Failed to load collaboration dependencies. Internet connection required.');
        }
    }

    // ============================================================================
    // LOCAL → YJS SYNCHRONIZATION
    // ============================================================================

    /**
     * Syncs all existing local boxes and connections to Yjs
     * Called once on initial connect
     * @private
     */
    _syncLocalToYjs() {
        if (!this.ydoc || !this.mindMap) return;

        // Always sync local boxes to Yjs - Yjs will merge by ID
        // Same IDs update existing entries, different IDs are added
        if (this.mindMap.boxes.length > 0) {
            Utils.Logger.state('[Sync] Local to Yjs - local:', this.mindMap.boxes.length, 'yjs:', this.yboxes.size);

            // Use null origin to prevent this from being tracked in undo
            // This is initial sync/load, not a user action
            this.ydoc.transact(() => {
                // Sync boxes - Yjs Map uses box.id as key, so duplicates are impossible
                for (const box of this.mindMap.boxes) {
                    if (box && box.id) {
                        this.yboxes.set(box.id, this._boxToYjsData(box));
                    }
                }

                // Sync connections - check for duplicates before adding
                const existingConns = new Set(
                    this.yconnections.toArray().map(c => `${c.fromId}->${c.toId}`)
                );
                for (const conn of this.mindMap.connections) {
                    if (conn && conn.fromBox && conn.toBox) {
                        const key = `${conn.fromBox.id}->${conn.toBox.id}`;
                        if (!existingConns.has(key)) {
                            this.yconnections.push([{
                                fromId: conn.fromBox.id,
                                toId: conn.toBox.id
                            }]);
                            existingConns.add(key);
                        }
                    }
                }
            }, null); // null origin = don't track in undo
        }
    }

    /**
     * Verifies that sync succeeded with exponential backoff retry strategy.
     * Designed to handle free server cold starts (30-60s).
     * @param {number} attemptNumber - Current attempt number
     * @param {number} maxAttempts - Maximum number of attempts
     * @param {number} delay - Initial delay in ms
     * @private
     */
    _verifySyncWithBackoff(attemptNumber, maxAttempts, delay) {
        setTimeout(() => {
            // Check if sync succeeded
            if (this.yboxes && this.yboxes.size === 0 &&
                this.mindMap && this.mindMap.boxes && this.mindMap.boxes.length > 0) {

                if (attemptNumber < maxAttempts) {
                    Utils.Logger.state(`[Sync] Verification attempt ${attemptNumber}/${maxAttempts} - Yjs empty, retrying...`);

                    // Retry sync
                    this.syncAttemptCount = attemptNumber + 1;
                    this.lastSyncAttemptTime = Date.now();
                    this._syncLocalToYjs();

                    // Exponential backoff: 10s, 15s, 20s, 25s, 30s, then 5s intervals
                    // This gives server time to warm up from cold start
                    const nextDelay = attemptNumber < CollaborationManager.EXPONENTIAL_BACKOFF_ATTEMPTS
                        ? CollaborationManager.SYNC_VERIFICATION_DELAY + (attemptNumber * CollaborationManager.SYNC_RETRY_DELAY)
                        : CollaborationManager.SYNC_RETRY_DELAY;

                    this._verifySyncWithBackoff(attemptNumber + 1, maxAttempts, nextDelay);
                } else {
                    const firstAttemptTime = this.connectionStartTime || Date.now() - 60000;
                    const totalTime = Math.round((Date.now() - firstAttemptTime) / 1000);
                    console.error(`CollaborationManager: Sync failed after ${maxAttempts} attempts over ${totalTime}s. Server may be down or unreachable.`);
                    // Keep local data - don't lose user's work
                }
            } else if (this.yboxes && this.yboxes.size > 0) {
                const firstAttemptTime = this.connectionStartTime || this.lastSyncAttemptTime || Date.now();
                const timeTaken = Date.now() - firstAttemptTime;
                Utils.Logger.collab(`✅ [Sync] Verified after ${attemptNumber} attempt(s) in ${Math.round(timeTaken / 1000)}s - ${this.yboxes.size} boxes`);
                this.syncAttemptCount = 0;
            }
        }, delay);
    }

    /**
     * Converts a TextBox to Yjs-compatible data object
     * @param {TextBox} box 
     * @returns {Object}
     * @private
     */
    _boxToYjsData(box) {
        return {
            id: box.id,
            x: box.x,
            y: box.y,
            text: box.text,
            width: box.width,
            height: box.height,
            backgroundColor: box.backgroundColor ? { ...box.backgroundColor } : null,
            imageUrl: box.imageUrl || null,
            highlights: Array.isArray(box.highlights) && box.highlights.length > 0
                ? box.highlights.map(h => ({ start: h.start, end: h.end, color: h.color }))
                : null,
            // Persist faux styles so collaborators and undo/redo keep them in sync
            boldRanges: Array.isArray(box.boldRanges) && box.boldRanges.length > 0
                ? box.boldRanges.map(r => ({ start: r.start, end: r.end }))
                : null,
            italicRanges: Array.isArray(box.italicRanges) && box.italicRanges.length > 0
                ? box.italicRanges.map(r => ({ start: r.start, end: r.end }))
                : null
        };
    }

    /**
     * Updates a single box in Yjs
     * Call this when a box is created or modified locally
     * @param {TextBox} box 
     * @param {boolean} skipTransactionWrapper - If true, don't wrap in transaction (for continuous operations that will call stopCapturing)
     */
    syncBoxToYjs(box, skipTransactionWrapper = false) {
        if (!this.yboxes || !box || !box.id || this.isSyncing) return;

        // Debounce text sync during active editing to reduce network traffic
        // AND group text edits for meaningful undo boundaries
        if (box.isEditing) {
            // Start/extend text editing undo group for THIS box
            // If switching boxes, close previous group first
            if (this.currentEditingBoxId && this.currentEditingBoxId !== box.id) {
                this._closeTextEditUndoGroup();
            }
            this.currentEditingBoxId = box.id;
            this._startTextEditUndoGroup();

            // Capture boxId, not the box object, to avoid stale reference issues
            const boxId = box.id;

            // Clear existing timer for this box
            const existingTimer = this.textSyncTimers.get(boxId);
            if (existingTimer) clearTimeout(existingTimer);

            // Set new debounced timer
            const timer = setTimeout(() => {
                this.textSyncTimers.delete(boxId);
                // Verify box still exists before syncing
                if (this.yboxes && this.mindMap) {
                    const currentBox = this.mindMap.getBoxById(boxId);
                    if (currentBox && this.ydoc && this.undoManager) {
                        // Wrap in transaction with origin to track in undo
                        this.ydoc.transact(() => {
                            this.yboxes.set(boxId, this._boxToYjsData(currentBox));
                        }, this.undoManager);
                        // Don't call stopCapturing() here - we're inside a debounced text-edit undo group.
                        // The group is intentionally kept open and will be closed by _closeTextEditUndoGroup(),
                        // which ultimately calls stopCapturing(). Note: if a non-text operation occurs before
                        // this debounce fires, that later operation may call stopCapturing() and close the
                        // current text-edit group, so the text edit and that operation can end up in the
                        // same undo item. This timing-dependent grouping is intentional but important to
                        // be aware of when reasoning about undo boundaries.
                    } else if (currentBox) {
                        // Fallback without undo tracking
                        this.yboxes.set(boxId, this._boxToYjsData(currentBox));
                    }
                }
            }, CollaborationManager.TEXT_SYNC_DEBOUNCE);

            this.textSyncTimers.set(boxId, timer);
            return;
        }

        // If we were editing and now stopped, close the text editing undo group
        // This ensures the undo boundary is created when user stops typing
        if (this.isTextEditUndoGroupOpen) {
            this._closeTextEditUndoGroup();
            this.currentEditingBoxId = null;
        }

        // When skipTransactionWrapper=true, we're already inside a transaction
        // from _wrapInTransaction, so we just sync directly without creating a new transaction
        // The sync will automatically be part of the parent transaction
        if (skipTransactionWrapper) {
            this.yboxes.set(box.id, this._boxToYjsData(box));
            return;
        }

        // For non-editing changes (atomic operations), sync immediately with transaction origin
        if (this.ydoc && this.undoManager) {
            this.transact(() => {
                this.yboxes.set(box.id, this._boxToYjsData(box));
            }, 'syncBoxToYjs');
        } else {
            // Fallback without undo tracking
            this.yboxes.set(box.id, this._boxToYjsData(box));
        }
    }

    /**
     * Removes a box from Yjs
     * Call this when a box is deleted locally
     * @param {string} boxId 
     */
    deleteBoxFromYjs(boxId) {
        if (!this.yboxes || !boxId || this.isSyncing) return;

        // If deleting the box currently being edited, close its text editing undo group
        if (this.currentEditingBoxId === boxId && this.isTextEditUndoGroupOpen) {
            this._closeTextEditUndoGroup();
            this.currentEditingBoxId = null;
        }

        // Clear any pending text sync timer for this box
        const timer = this.textSyncTimers.get(boxId);
        if (timer) {
            clearTimeout(timer);
            this.textSyncTimers.delete(boxId);
        }

        // Wrap in transaction with origin to track in undo
        if (this.ydoc && this.undoManager) {
            this.transact(() => {
                this.yboxes.delete(boxId);
            }, 'deleteBox');
        } else {
            // Fallback without undo tracking
            this.yboxes.delete(boxId);
        }
    }

    /**
     * Syncs connections to Yjs
     * Call this when connections change
     * @param {boolean} skipTransactionWrapper - If true, don't wrap in transaction (for continuous operations)
     */
    syncConnectionsToYjs(skipTransactionWrapper = false) {
        if (!this.yconnections || !this.mindMap || this.isSyncing) return;

        // Get current local connections as ID pairs
        const localConns = this.mindMap.connections
            .filter(c => c && c.fromBox && c.toBox)
            .map(c => ({ fromId: c.fromBox.id, toId: c.toBox.id }));

        // When skipTransactionWrapper=true, we're already inside a transaction
        // from _wrapInTransaction, so we just sync directly without creating a new transaction
        if (skipTransactionWrapper) {
            this._syncConnectionsToYjsImpl(localConns);
            return;
        }

        // Optimize with proper diff to avoid clearing all connections (O(n) instead of O(n²))
        // Wrap in transaction with origin to track in undo
        if (this.ydoc && this.undoManager) {
            this.transact(() => {
                this._syncConnectionsToYjsImpl(localConns);
            }, 'syncConnections');
        } else if (this.ydoc) {
            // Fallback without undo tracking
            this.ydoc.transact(() => {
                this._syncConnectionsToYjsImpl(localConns);
            });
        }
    }

    /**
     * Internal implementation of connection sync (called within transaction)
     * @private
     */
    _syncConnectionsToYjsImpl(localConns) {
        const yjsConns = this.yconnections.toArray();

        // Map valid Yjs connections to their current indices (handling potential duplicates)
        // format: "fromId->toId" => [index1, index2...]
        const yjsMap = new Map();
        yjsConns.forEach((c, i) => {
            if (c && c.fromId && c.toId) {
                const key = `${c.fromId}->${c.toId}`;
                if (!yjsMap.has(key)) yjsMap.set(key, []);
                yjsMap.get(key).push(i);
            }
        });

        // Identify connections to keep vs add
        const toAdd = [];

        for (const conn of localConns) {
            const key = `${conn.fromId}->${conn.toId}`;
            if (yjsMap.has(key)) {
                // Connection exists in Yjs, keep one instance of it
                const indices = yjsMap.get(key);
                if (indices.length > 0) {
                    // consume one index (remove from list so we don't use it again)
                    indices.shift();
                    // if list empty, remove key
                    if (indices.length === 0) yjsMap.delete(key);
                } else {
                    // Should be unreachable if logic is correct
                    toAdd.push(conn);
                }
            } else {
                // Not in Yjs, need to add
                toAdd.push(conn);
            }
        }

        // Identify connections to delete (anything remaining in yjsMap)
        // We must collect ALL indices to delete
        const indicesToDelete = [];
        for (const indices of yjsMap.values()) {
            indicesToDelete.push(...indices);
        }

        // Delete in descending order to avoid index shifting problems
        indicesToDelete.sort((a, b) => b - a);
        for (const index of indicesToDelete) {
            this.yconnections.delete(index, 1);
        }

        // Add new connections
        if (toAdd.length > 0) {
            this.yconnections.push(toAdd);
        }
    }

    // ============================================================================
    // YJS → LOCAL SYNCHRONIZATION
    // ============================================================================

    /**
     * Sets up observers for Yjs changes
     * @private
     */
    _setupObservers() {
        if (!this.yboxes || !this.yconnections) return;

        // Observe box changes
        this.yboxes.observe((event) => {
            // Skip if we're in a sync loop, but DO process undo/redo transactions
            // Undo/redo transactions are local but have origin === this.undoManager
            const isUndoRedo = event.transaction.origin === this.undoManager;
            if (this.isSyncing) return;
            if (event.transaction.local && !isUndoRedo) return;

            this.isSyncing = true;
            try {
                event.changes.keys.forEach((change, key) => {
                    if (change.action === 'add' || change.action === 'update') {
                        const data = this.yboxes.get(key);
                        // Force apply during undo/redo and snap to the saved position so the change is visible immediately
                        const snap = isUndoRedo ? true : false;
                        this._applyBoxFromYjs(key, data, snap, isUndoRedo);
                    } else if (change.action === 'delete') {
                        this._deleteBoxFromLocal(key);
                    }
                });

                // Redraw after changes
                if (this.mindMap) {
                    this.mindMap.isDirty = true;

                    // Auto-zoom once when first receiving remote boxes
                    if (!this.hasTriggeredInitialZoom && this.mindMap.boxes.length > 0) {
                        this.hasTriggeredInitialZoom = true;
                        Utils.Logger.collab('[Zoom] First boxes received, triggering resetView');
                        if (typeof resetView === 'function') {
                            resetView();
                        }
                    }
                }
            } finally {
                this.isSyncing = false;
            }
        });

        // Observe connection changes
        this.yconnections.observe((event) => {
            // Skip if we're in a sync loop, but DO process undo/redo transactions
            const isUndoRedo = event.transaction.origin === this.undoManager;
            if (this.isSyncing) return;
            if (event.transaction.local && !isUndoRedo) return;

            this.isSyncing = true;
            try {
                this._rebuildConnectionsFromYjs();

                if (this.mindMap) {
                    this.mindMap.isDirty = true;
                }
            } finally {
                this.isSyncing = false;
            }
        });
    }

    /**
     * Applies a box update from Yjs to local state
     * @param {string} boxId 
     * @param {Object} data 
     * @param {boolean} snapToPosition - If true, set x/y directly instead of using interpolation
     * @private
     */
    _applyBoxFromYjs(boxId, data, snapToPosition = false, forceApply = false) {
        if (!this.mindMap || !data) return;

        let box = this.mindMap.getBoxById(boxId);

        if (box) {
            // Update position: snap immediately or interpolate
            const shouldSnapX = snapToPosition && typeof data.x === 'number';
            const shouldSnapY = snapToPosition && typeof data.y === 'number';
            const pendingTargetX = (!snapToPosition && typeof data.x === 'number') ? data.x : box.targetX;
            const pendingTargetY = (!snapToPosition && typeof data.y === 'number') ? data.y : box.targetY;

            if (shouldSnapX) {
                box.x = data.x;
                box.targetX = data.x;
            } else if (typeof data.x === 'number') {
                box.targetX = data.x;
            }

            if (shouldSnapY) {
                box.y = data.y;
                box.targetY = data.y;
            } else if (typeof data.y === 'number') {
                box.targetY = data.y;
            }

            // Update existing box with validation
            // if (typeof data.x === 'number') box.x = data.x; // Replaced by targetX
            // if (typeof data.y === 'number') box.y = data.y; // Replaced by targetY

            // IMPORTANT: Don't overwrite text while user is actively editing
            // This prevents lag from causing text loss
            // When undo/redo fires while a box is still in editing mode,
            // force-apply the text so the user actually sees the change.
            if (typeof data.text === 'string' && !box.isEditing) {
                box.text = data.text;
            } else if (typeof data.text === 'string' && forceApply) {
                box.text = data.text;
            }

            if (typeof data.width === 'number') box.width = data.width;
            if (typeof data.height === 'number') box.height = data.height;

            if (data.backgroundColor && typeof data.backgroundColor === 'object') {
                box.backgroundColor = { ...data.backgroundColor };
            }
            if (data.imageUrl !== undefined) {
                box.imageUrl = data.imageUrl;
            }
            // Sync highlights (only when not editing to avoid conflicts)
            if (Array.isArray(data.highlights) && (forceApply || !box.isEditing)) {
                box.highlights = data.highlights.map(h => ({ start: h.start, end: h.end, color: h.color }));
            } else if (data.highlights === null && (forceApply || !box.isEditing)) {
                box.highlights = [];
            }

            // Sync faux-bold/italic ranges; clear when absent to avoid stale styling
            if (Array.isArray(data.boldRanges) && (forceApply || !box.isEditing)) {
                box.boldRanges = data.boldRanges.map(r => ({ start: r.start, end: r.end }));
            } else if (data.boldRanges === null && (forceApply || !box.isEditing)) {
                box.boldRanges = [];
            }

            if (Array.isArray(data.italicRanges) && (forceApply || !box.isEditing)) {
                box.italicRanges = data.italicRanges.map(r => ({ start: r.start, end: r.end }));
            } else if (data.italicRanges === null && (forceApply || !box.isEditing)) {
                box.italicRanges = [];
            }
            box.updateDimensions();

            // Restore pending targets when we only want interpolation (avoid reset inside updateDimensions)
            if (!snapToPosition) {
                if (typeof pendingTargetX === 'number') box.targetX = pendingTargetX;
                if (typeof pendingTargetY === 'number') box.targetY = pendingTargetY;
            }
        } else {
            // Create new box
            if (typeof TextBox !== 'undefined') {
                box = TextBox.fromJSON(data);
                if (box) {
                    this.mindMap.boxes.push(box);
                }
            }
        }
    }

    /**
     * Deletes a box from local state
     * @param {string} boxId 
     * @private
     */
    _deleteBoxFromLocal(boxId) {
        if (!this.mindMap) return;

        const index = this.mindMap.boxes.findIndex(b => b && b.id === boxId);
        if (index !== -1) {
            const box = this.mindMap.boxes[index];

            // Remove connections involving this box
            this.mindMap.connections = this.mindMap.connections.filter(
                c => c.fromBox !== box && c.toBox !== box
            );

            // Remove the box
            this.mindMap.boxes.splice(index, 1);

            // Clear selection if this box was selected
            if (this.mindMap.selectedBox === box) {
                this.mindMap.selectedBox = null;
            }
        }
    }

    /**
     * Rebuilds all boxes from Yjs state.
     * Called on initial sync when joining an existing room.
     * @private
     */
    _rebuildBoxesFromYjs() {
        if (!this.mindMap || !this.yboxes) return;

        Utils.Logger.state('[Rebuild] Rebuilding from Yjs, count:', this.yboxes.size);

        // Track which local boxes exist in Yjs
        const yjsBoxIds = new Set();

        // Apply each Yjs box to local state (snap to position immediately on initial rebuild)
        this.yboxes.forEach((data, boxId) => {
            yjsBoxIds.add(boxId);
            this._applyBoxFromYjs(boxId, data, true, true); // snapToPosition = true, forceApply = true
        });

        // Remove local boxes that don't exist in Yjs
        // (They were deleted by another user or never synced)
        this.mindMap.boxes = this.mindMap.boxes.filter(box => {
            if (!box || !box.id) return false;
            if (yjsBoxIds.has(box.id)) return true;
            Utils.Logger.debug('[Cleanup] Removing local-only box:', box.id);
            return false;
        });

        // Clear selection if selected box was removed
        if (this.mindMap.selectedBox && !yjsBoxIds.has(this.mindMap.selectedBox.id)) {
            this.mindMap.selectedBox = null;
        }

        // Mark for redraw
        this.mindMap.isDirty = true;
    }

    /**
     * Rebuilds all connections from Yjs state
     * @private
     */
    _rebuildConnectionsFromYjs() {
        if (!this.mindMap || !this.yconnections) return;

        // Clear existing connections
        this.mindMap.connections = [];

        // Rebuild from Yjs
        const connData = this.yconnections.toArray();
        for (const data of connData) {
            const fromBox = this.mindMap.getBoxById(data.fromId);
            const toBox = this.mindMap.getBoxById(data.toId);

            if (fromBox && toBox && typeof Connection !== 'undefined') {
                this.mindMap.connections.push(new Connection(fromBox, toBox));
            }
        }
    }

    /**
     * Clears all local boxes and connections.
     * Called when joining an existing room to avoid showing local cached data.
     * @private
     */
    _clearLocalData() {
        if (!this.mindMap) return;

        try {
            // Safely get counts before clearing
            const boxCount = this.mindMap.boxes?.length || 0;
            const connCount = this.mindMap.connections?.length || 0;

            Utils.Logger.state('[Clear] Clearing local data -', boxCount, 'boxes,', connCount, 'connections');

            // Clear all boxes and connections
            this.mindMap.boxes = [];
            this.mindMap.connections = [];

            // Clear selections using optional chaining for safety
            this.mindMap.selectedBox = null;
            this.mindMap.selectedConnection = null;
            this.mindMap.selectedBoxes?.clear();
            this.mindMap.selectedConnections?.clear();

            // Mark for redraw
            this.mindMap.isDirty = true;
        } catch (error) {
            console.error('CollaborationManager: Failed to clear local data:', error);
            // Ensure at minimum we mark for redraw even if clearing failed
            try {
                if (this.mindMap) this.mindMap.isDirty = true;
            } catch (e) {
                // Ignore nested error
            }
        }
    }

    /**
     * Handles starting collaboration when we have local data to share.
     * Room is empty, we want to seed it with our local data.
     * @private
     */
    _handleStartCollaborationWithData() {
        const connectionTime = Date.now() - (this.connectionStartTime || 0);
        const isColdStart = connectionTime > CollaborationManager.COLD_START_THRESHOLD;

        if (isColdStart) {
            Utils.Logger.collab('[ColdStart] Detected (', Math.round(connectionTime / 1000), 's). Using extended verification');
        }

        Utils.Logger.collab('[Start] Sharing local data');
        Utils.Logger.state('  - Local:', this.mindMap.boxes.length, '| Yjs:', this.yboxes.size);
        Utils.Logger.state('  - Force syncing local state to Yjs...');

        this.lastSyncAttemptTime = Date.now();
        this.syncAttemptCount = 1;

        // ALWAYS sync local data when explicitly starting collaboration
        // This ensures the share button properly uploads all local work
        this._syncLocalToYjs();

        // Verify sync with exponential backoff for cold start reliability
        this._verifySyncWithBackoff(1, CollaborationManager.MAX_SYNC_RETRIES, CollaborationManager.SYNC_VERIFICATION_DELAY);
    }

    /**
     * Handles joining an empty room (not starting collaboration).
     * Clear local data to show empty canvas.
     * @private
     */
    _handleJoinEmptyRoom() {
        Utils.Logger.collab('[Join] Empty room, clearing', this.mindMap.boxes.length, 'local boxes');
        this._clearLocalData();
    }

    /**
     * Handles joining a room that already has data.
     * Clear local data then sync from room.
     * @private
     */
    _handleJoinRoomWithData() {
        Utils.Logger.collab('[Join] Room has data, clearing local then syncing from room');
        this._clearLocalData();
        this._rebuildBoxesFromYjs();
        this._rebuildConnectionsFromYjs();
    }

    /**
     * Handles starting collaboration when room already has data.
     * Merge both local and room data - both are valuable.
     * @private
     */
    _handleStartCollaborationRoomHasData() {
        Utils.Logger.collab('[Start] Collaboration with existing room data');
        Utils.Logger.state('  - Local:', this.mindMap.boxes.length, '| Yjs:', this.yboxes.size);

        // First, sync from room to get existing data
        this._rebuildBoxesFromYjs();
        this._rebuildConnectionsFromYjs();

        // Then, sync our local data to add to the room
        // Yjs uses box IDs as keys, so same IDs will update, different IDs will be added
        Utils.Logger.state('  - Merging local data into room...');
        this._syncLocalToYjs();
    }

    /**
     * Handles race condition where both room and local are empty.
     * Retry multiple times to catch late-loading data.
     * @private
     */
    _handleBothEmpty() {
        Utils.Logger.collab('[Empty] Both empty, scheduling sync retries...');
        let retryCount = 0;
        const maxRetries = 5;
        const retryInterval = 500;

        const attemptSync = () => {
            retryCount++;
            if (this.yboxes && this.yboxes.size === 0 &&
                this.mindMap && this.mindMap.boxes && this.mindMap.boxes.length > 0) {
                Utils.Logger.state('[Retry]', retryCount, '- seeding with local data');
                this._syncLocalToYjs();
            } else if (retryCount < maxRetries) {
                this.syncRetryTimer = setTimeout(attemptSync, retryInterval);
            } else {
                Utils.Logger.state('[Retry] Exhausted, room may be empty');
            }
        };

        this.syncRetryTimer = setTimeout(attemptSync, retryInterval);
    }

    // ============================================================================
    // AWARENESS / PRESENCE
    // ============================================================================

    /**
     * Sets up awareness for user presence
     * @private
     */
    _setupAwareness() {
        if (!this.awareness) return;

        // Set local user state including version for compatibility checking
        const versionInfo = (typeof APP_VERSION !== 'undefined') ? {
            MAJOR: APP_VERSION.MAJOR,
            MINOR: APP_VERSION.MINOR,
            PATCH: APP_VERSION.PATCH
        } : { MAJOR: 1, MINOR: 0, PATCH: 0 };

        this.awareness.setLocalState({
            user: {
                id: this.userId,
                name: this.userName,
                color: this.userColor
            },
            version: versionInfo,
            cursor: null,
            selectedBoxIds: []
        });

        // Observe awareness changes with error handling
        this.awareness.on('change', () => {
            try {
                const remoteUsers = this.getRemoteUsers();

                // Check version compatibility of all peers
                this._checkPeerVersions();

                // Notify about awareness changes
                if (this.onAwarenessChange) {
                    this.onAwarenessChange(remoteUsers);
                }

                // Also notify about peer changes (awareness includes peer list)
                if (this.onPeersChange) {
                    this.onPeersChange(remoteUsers);
                }
            } catch (error) {
                console.error('CollaborationManager: Error in awareness change handler', error);
            }
        });
    }

    /**
     * Checks version compatibility of all connected peers
     * Disconnects and notifies if an incompatible peer is detected
     * @private
     */
    _checkPeerVersions() {
        if (!this.awareness || typeof APP_VERSION === 'undefined') return;

        const states = this.awareness.getStates();
        const localClientId = this.awareness.clientID;

        for (const [clientId, state] of states) {
            // Skip self
            if (clientId === localClientId) continue;

            // Check peer's version
            if (state && state.version) {
                const result = APP_VERSION.checkCompatibility(state.version);

                if (!result.compatible) {
                    // Determine if WE are the outdated one
                    const theyAreNewer = state.version.MAJOR > APP_VERSION.MAJOR;

                    if (theyAreNewer) {
                        // We need to update - disconnect and notify user
                        console.warn('CollaborationManager: Incompatible version detected. Peer has v' +
                            `${state.version.MAJOR}.${state.version.MINOR}.${state.version.PATCH}` +
                            `, we have v${APP_VERSION.toString()}. Disconnecting.`);

                        this.versionMismatchInfo = {
                            reason: result.reason,
                            peerVersion: `${state.version.MAJOR}.${state.version.MINOR}.${state.version.PATCH}`,
                            localVersion: APP_VERSION.toString()
                        };

                        // Notify via callback
                        if (this.onVersionMismatch) {
                            this.onVersionMismatch(this.versionMismatchInfo);
                        }

                        // Disconnect to prevent data corruption
                        this.disconnect();
                        return;
                    }
                    // If THEY are older, they'll detect the mismatch and disconnect themselves
                }
            } else if (state && state.user) {
                // Peer exists but has no version info - they're running an old client
                // We don't disconnect because THEY should detect incompatibility and disconnect
                // (If they're too old to have version checking, they won't disconnect, but
                // this is acceptable as we'll eventually phase out those clients)
                Utils.Logger.collab('[Peer] Without version info detected (old client):', state.user.name || 'Unknown');
            }
        }
    }

    /**
     * Updates local cursor position
     * @param {number} x - World X coordinate
     * @param {number} y - World Y coordinate
     */
    updateCursor(x, y) {
        if (!this.awareness) return;
        this.awareness.setLocalStateField('cursor', { x, y });
    }

    /**
     * Updates local selected boxes
     * @param {string[]} boxIds - Array of selected box IDs
     */
    updateSelection(boxIds) {
        if (!this.awareness) return;

        this.awareness.setLocalStateField('selectedBoxIds', boxIds);
    }

    /**
     * Updates which box the local user is currently editing
     * @param {string|null} boxId - ID of the box being edited, or null if not editing
     */
    updateEditingBox(boxId) {
        if (!this.awareness) return;
        this.awareness.setLocalStateField('editingBoxId', boxId);
    }

    /**
     * Updates the local user's display name
     * @param {string} name - New display name
     */
    setUserName(name) {
        if (!name || typeof name !== 'string') return;

        // Sanitize: strip HTML tags and trim
        const sanitized = name.replace(/<[^>]*>/g, '').trim();
        if (sanitized.length === 0 || sanitized.length > 50) return; // Validate length

        this.userName = sanitized;

        // Persist to localStorage
        try {
            localStorage.setItem('openmind_userName', sanitized);
        } catch (e) {
            console.warn('CollaborationManager: Could not save userName to localStorage', e);
        }

        // Update awareness state with new name
        if (this.awareness) {
            const currentState = this.awareness.getLocalState() || {};
            this.awareness.setLocalStateField('user', {
                ...currentState.user,
                id: this.userId,
                name: this.userName,
                color: this.userColor
            });
        }

        Utils.Logger.collab('[DisplayName] Changed to:', this.userName);
    }

    /**
     * Gets the current user's display name
     * @returns {string}
     */
    getUserName() {
        return this.userName;
    }

    /**
     * Gets state of all remote users (cursors, selections) with INTERPOLATED positions
     * @returns {Array<Object>}
     */
    getRemoteUsers() {
        if (!this.awareness) return [];

        const states = [];
        this.awareness.getStates().forEach((state, clientId) => {
            if (clientId !== this.awareness.clientID && state.user) {
                // Use interpolated position if available
                const interpolated = this.interpolatedCursors.get(state.user.id);
                let cursor = state.cursor;

                if (interpolated) {
                    cursor = { x: interpolated.x, y: interpolated.y };
                }

                states.push({
                    clientId,
                    user: state.user,
                    cursor: cursor,
                    selectedBoxIds: state.selectedBoxIds || [],
                    editingBoxId: state.editingBoxId || null
                });
            }
        });
        return states;
    }

    /**
     * Updates cursor interpolation. Call this in the draw loop.
     * @param {number} lerpFactor - Interpolation speed (0.0 to 1.0)
     */
    updateCursors(lerpFactor = 0.2) {
        if (!this.awareness) return;

        const states = this.awareness.getStates();

        states.forEach((state, clientId) => {
            if (clientId === this.awareness.clientID) return;
            if (state.user && state.cursor) {
                const userId = state.user.id;
                let data = this.interpolatedCursors.get(userId);

                if (!data) {
                    // Init new user
                    data = { x: state.cursor.x, y: state.cursor.y, targetX: state.cursor.x, targetY: state.cursor.y };
                    this.interpolatedCursors.set(userId, data);
                }

                // Update target if changed
                if (state.cursor.x !== data.targetX || state.cursor.y !== data.targetY) {
                    data.targetX = state.cursor.x;
                    data.targetY = state.cursor.y;
                }

                // Smoothly interpolate current x/y towards target
                data.x = data.x + (data.targetX - data.x) * lerpFactor;
                data.y = data.y + (data.targetY - data.y) * lerpFactor;

                // Snap if very close
                if (Math.abs(data.x - data.targetX) < 0.5) data.x = data.targetX;
                if (Math.abs(data.y - data.targetY) < 0.5) data.y = data.targetY;
            }
        });

        // Cleanup disconnected users
        // Create set of currently active user IDs
        const activeUserIds = new Set();
        states.forEach(state => {
            if (state.user) activeUserIds.add(state.user.id);
        });

        // Remove any interpolated cursors for users who are no longer active
        for (const userId of this.interpolatedCursors.keys()) {
            if (!activeUserIds.has(userId)) {
                this.interpolatedCursors.delete(userId);
            }
        }
    }

    // ============================================================================
    // UTILITY METHODS
    // ============================================================================

    /**
     * Generates a unique user ID
     * @private
     */
    _generateUserId() {
        return 'user_' + Math.random().toString(36).substring(2, 11);
    }

    /**
     * Generates or retrieves the user name
     * Tries localStorage first, generates random name if not found
     * @private
     */
    _generateUserName() {
        // Try to load saved name from localStorage
        try {
            const saved = localStorage.getItem('openmind_userName');
            if (saved && typeof saved === 'string' && saved.trim().length > 0) {
                return saved.trim();
            }
        } catch (e) {
            // localStorage not available, fall through to random name
        }

        // Generate random name
        const adjectives = ['Pert', 'Dank', 'Sleepy', 'Dour', 'Wry', 'Crass', 'Fierce'];
        const nouns = ['Urchin', 'Wren', 'Stoat', 'Vole', 'Puffin', 'Shrew', 'Newt', 'Mouse', 'Rat', 'Badger', 'Rabbit', 'Cat', 'Dog', 'Robin'];
        const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        return `${adj} ${noun}`;
    }

    /**
     * Picks a random user color
     * @private
     */
    _pickRandomColor() {
        const colors = CollaborationManager.DEFAULT_USER_COLORS;
        return colors[Math.floor(Math.random() * colors.length)];
    }

    /**
     * Generates a shareable room URL
     * @param {string} roomName 
     * @returns {string}
     */
    static generateRoomUrl(roomName, serverUrl = null) {
        const url = new URL(window.location.href);
        // Preserve or add server parameter for production deployments
        if (serverUrl) {
            url.searchParams.set('server', serverUrl);
        } else {
            // Keep existing server param if present
            const existingServer = new URLSearchParams(window.location.search).get('server');
            if (existingServer) {
                url.searchParams.set('server', existingServer);
            }
        }
        url.hash = `room=${encodeURIComponent(roomName)}`;
        return url.toString();
    }

    /**
     * Generates a random room name
     * @returns {string}
     */
    static generateRoomName() {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let name = '';
        for (let i = 0; i < 8; i++) {
            name += chars[Math.floor(Math.random() * chars.length)];
        }
        return name;
    }

    // ============================================================================
    // CONSISTENCY CHECK
    // ============================================================================

    /**
     * Checks for mismatches between Yjs and local state and reconciles them.
     * This is called periodically when connected and synced to detect and fix
     * synchronization issues that may occur after the initial sync.
     * 
     * STRATEGY: Yjs is the source of truth after initial sync.
     * - Missing boxes from Yjs → Add to Local
     * - Extra boxes in Local only → Rebuild from Yjs (but respect grace period for cold starts)
     * 
     * @private
     */
    _performConsistencyCheck() {
        // Only check if connected, synced, and not currently syncing
        if (!this.isConnected || !this.provider?.synced || this.isSyncing) {
            return;
        }

        if (!this.yboxes || !this.mindMap || !this.mindMap.boxes) {
            return;
        }

        // Compare Yjs vs Local box IDs
        const yjsBoxIds = new Set();
        this.yboxes.forEach((_, id) => yjsBoxIds.add(id));

        const localBoxIds = new Set(this.mindMap.boxes.map(b => b.id));

        const onlyInYjs = [...yjsBoxIds].filter(id => !localBoxIds.has(id));
        const onlyInLocal = [...localBoxIds].filter(id => !yjsBoxIds.has(id));

        // If there's a mismatch, reconcile with Yjs as authority
        if (onlyInYjs.length > 0 || onlyInLocal.length > 0) {
            // IMPORTANT: Check if this might be a pending sync (cold start grace period)
            // Don't destroy user's work if server is still processing the sync
            const timeSinceLastSync = this.lastSyncAttemptTime
                ? Date.now() - this.lastSyncAttemptTime
                : Number.MAX_SAFE_INTEGER; // If never synced, treat as very old

            if (onlyInLocal.length > 0 && timeSinceLastSync < CollaborationManager.COLD_START_GRACE_PERIOD && this.syncAttemptCount > 0) {
                // Within grace period of active sync attempts - likely cold start delay
                console.log(
                    `CollaborationManager: Consistency check detected ${onlyInLocal.length} local-only boxes, ` +
                    `but within ${Math.round((CollaborationManager.COLD_START_GRACE_PERIOD - timeSinceLastSync) / 1000)}s grace period of sync attempt. ` +
                    `Retrying sync instead of rebuilding (cold start protection).`
                );
                this.lastSyncAttemptTime = Date.now();
                this._syncLocalToYjs();
                return; // Don't rebuild yet, give server more time
            }

            console.warn(
                `CollaborationManager: Consistency check detected mismatch! ` +
                `Boxes only in Yjs: ${onlyInYjs.length}, ` +
                `Boxes only in Local: ${onlyInLocal.length}. ` +
                `Rebuilding local state from Yjs authority...`
            );

            this.isSyncing = true;
            try {
                // Yjs is authoritative: rebuild local state from Yjs
                // This matches the initial sync behavior (_rebuildBoxesFromYjs)
                this._rebuildBoxesFromYjs();
                this._rebuildConnectionsFromYjs();

                this.mindMap.isDirty = true;
                Utils.Logger.state('[Consistency] Reconciliation complete');
                // Reset synced check counter since we had a mismatch
                this.consecutiveSyncedChecks = 0;
            } finally {
                this.isSyncing = false;
            }
        } else {
            // Everything is in sync - increment counter
            this.consecutiveSyncedChecks++;

            // After 3 consecutive successful checks, stop the timer (stable state)
            if (this.consecutiveSyncedChecks >= 3) {
                Utils.Logger.state('[Consistency] Stable sync detected, disabling periodic check');
                this._stopConsistencyCheck();
            }
        }
    }

    /**
     * Starts periodic consistency checking
     * @private
     */
    _startConsistencyCheck() {
        if (this.consistencyCheckTimer) {
            return; // Already running
        }

        // Reset consecutive check counter for this sync session
        this.consecutiveSyncedChecks = 0;

        this.consistencyCheckTimer = setInterval(() => {
            this._performConsistencyCheck();
        }, this.consistencyCheckInterval);

        Utils.Logger.debug('[Consistency] Started timer (30s interval)');
    }

    /**
     * Stops periodic consistency checking
     * @private
     */
    _stopConsistencyCheck() {
        if (this.consistencyCheckTimer) {
            clearInterval(this.consistencyCheckTimer);
            this.consistencyCheckTimer = null;
            Utils.Logger.debug('[Consistency] Stopped timer');
        }
    }

    // ============================================================================
    // DEBUG
    // ============================================================================

    /**
     * Outputs comprehensive sync state to the console for debugging.
     * Call from console: collaborationManager.debug() or collab.debug()
     */
    debug() {
        const mm = this.mindMap;

        console.group('🔍 COLLABORATION DEBUG');

        // Connection status
        console.group('📡 Connection');
        console.log('isConnected:', this.isConnected);
        console.log('isInitialized:', this.isInitialized);
        console.log('isSyncing:', this.isSyncing);
        console.log('roomName:', this.roomName);
        console.log('userId:', this.userId);
        console.log('WebSocket URL:', this.provider?.url);
        console.log('WS readyState:', this.provider?.ws?.readyState, '(1=OPEN)');
        console.log('provider.synced:', this.provider?.synced);
        console.groupEnd();

        // Box comparison
        console.group('📦 Boxes');
        const yjsBoxCount = this.yboxes?.size ?? 0;
        const localBoxCount = mm?.boxes?.length ?? 0;
        console.log('Yjs boxes:', yjsBoxCount);
        console.log('Local boxes:', localBoxCount);

        if (this.yboxes && mm?.boxes) {
            const yjsIds = new Set();
            this.yboxes.forEach((_, id) => yjsIds.add(id));
            const localIds = new Set(mm.boxes.map(b => b.id));

            const onlyYjs = [...yjsIds].filter(id => !localIds.has(id));
            const onlyLocal = [...localIds].filter(id => !yjsIds.has(id));

            if (onlyYjs.length) console.warn('⚠️ In Yjs ONLY:', onlyYjs);
            if (onlyLocal.length) console.warn('⚠️ In Local ONLY:', onlyLocal);
            if (!onlyYjs.length && !onlyLocal.length) console.log('✅ Box IDs match');

            // Show first 5 boxes with position comparison
            console.log('Sample boxes (first 5):');
            let count = 0;
            this.yboxes.forEach((data, id) => {
                if (count++ >= 5) return;
                const local = mm.getBoxById(id);
                const posMatch = local && Math.abs(local.x - data.x) < 2 && Math.abs(local.y - data.y) < 2;
                console.log(`  ${id.slice(0, 8)}: yjs(${Math.round(data.x)},${Math.round(data.y)}) local(${local ? Math.round(local.x) + ',' + Math.round(local.y) : 'MISSING'}) ${posMatch ? '✅' : '⚠️'}`);
            });
        }
        console.groupEnd();

        // Connections
        console.group('🔗 Connections');
        const yjsConnCount = this.yconnections?.length ?? 0;
        const localConnCount = mm?.connections?.length ?? 0;
        console.log('Yjs connections:', yjsConnCount);
        console.log('Local connections:', localConnCount);
        if (yjsConnCount !== localConnCount) {
            console.warn('⚠️ Connection count mismatch!');
        }
        console.groupEnd();

        // Awareness
        console.group('👥 Awareness');
        const states = this.awareness?.getStates();
        console.log('Total clients:', states?.size ?? 0);
        states?.forEach((state, clientId) => {
            const isSelf = clientId === this.awareness?.clientID;
            console.log(`  ${isSelf ? '(you)' : ''} ${state.user?.name}: cursor=${state.cursor ? 'yes' : 'no'}, editing=${state.editingBoxId || 'none'}`);
        });
        console.groupEnd();

        console.groupEnd(); // End main group

        return 'Debug complete. Check console output above.';
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    window.CollaborationManager = CollaborationManager;
    // Convenience shortcut: window.collab after collaborationManager is initialized
    Object.defineProperty(window, 'collab', {
        get: function () { return window.collaborationManager; },
        configurable: true
    });
}
