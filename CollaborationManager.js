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

    static WEBSOCKET_SERVER = (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
        ? 'ws://localhost:1234'
        : 'wss://site--y-websockets--l9lrvfgkxvzh.code.run';

    static DEFAULT_USER_COLORS = [
        '#e91e63', '#9c27b0', '#673ab7', '#3f51b5',
        '#2196f3', '#00bcd4', '#009688', '#4caf50',
        '#8bc34a', '#ff9800', '#ff5722', '#795548'
    ];

    // ============================================================================
    // CONSTRUCTOR
    // ============================================================================

    /**
     * Creates a new CollaborationManager
     * @param {MindMap} mindMap - The MindMap instance to synchronize
     */
    constructor(mindMap) {
        this.mindMap = mindMap;

        // Yjs state (initialized on connect)
        this.ydoc = null;
        this.provider = null;
        this.awareness = null;

        // Shared types
        this.yboxes = null;      // Y.Map<boxId, boxData>
        this.yconnections = null; // Y.Array<{fromId, toId}>

        // Connection state
        this.roomName = null;
        this.isConnected = false;
        this.isSyncing = false; // Prevent feedback loops

        // User identity
        this.userId = this._generateUserId();
        this.userName = this._generateUserName();
        this.userColor = this._pickRandomColor();

        // Callbacks for UI updates
        this.onConnectionChange = null;
        this.onPeersChange = null;
        this.onAwarenessChange = null;

        // Yjs and y-webrtc modules (loaded dynamically)
        this.Y = null;
        this.WebsocketProvider = null;
    }

    // ============================================================================
    // CONNECTION MANAGEMENT
    // ============================================================================

    /**
     * Connects to a collaboration room
     * @param {string} roomName - Unique room identifier
     * @returns {Promise<void>}
     */
    async connect(roomName, serverUrl = null) {
        if (this.isConnected) {
            console.warn('CollaborationManager: Already connected');
            return;
        }

        this.roomName = roomName;
        const signalingUrl = serverUrl || CollaborationManager.WEBSOCKET_SERVER;

        try {
            // Load Yjs modules dynamically
            await this._loadDependencies();

            // Create Yjs document
            this.ydoc = new this.Y.Doc();

            // Initialize shared types
            this.yboxes = this.ydoc.getMap('boxes');
            this.yconnections = this.ydoc.getArray('connections');

            // Create Websocket provider
            this.provider = new this.WebsocketProvider(
                signalingUrl,
                this.roomName,
                this.ydoc
            );

            // Set up awareness for presence
            this.awareness = this.provider.awareness;
            this._setupAwareness();

            // Set up observers for Yjs → local sync
            this._setupObservers();

            // Set up MindMap callbacks for local → Yjs sync
            this._setupMindMapCallbacks();

            // Sync existing local state to Yjs
            this._syncLocalToYjs();

            // Track connection state
            this.provider.on('synced', ({ synced }) => {
                console.log('CollaborationManager: Sync status:', synced);
                if (this.onConnectionChange) {
                    this.onConnectionChange(synced ? 'synced' : 'syncing');
                }
            });

            // Track connection status
            this.provider.on('status', ({ status }) => {
                console.log('CollaborationManager: Connection status:', status);
                if (this.onConnectionChange) {
                    this.onConnectionChange(status);
                }
            });

            this.isConnected = true;
            console.log(`CollaborationManager: Connected to room "${roomName}"`);

            if (this.onConnectionChange) {
                this.onConnectionChange('connected');
            }

        } catch (error) {
            console.error('CollaborationManager: Failed to connect', error);
            this.disconnect();
            throw error;
        }
    }

    /**
     * Disconnects from the current room
     */
    disconnect() {
        if (this.provider) {
            this.provider.disconnect();
            this.provider.destroy();
            this.provider = null;
        }

        if (this.ydoc) {
            this.ydoc.destroy();
            this.ydoc = null;
        }

        this.yboxes = null;
        this.yconnections = null;
        this.awareness = null;
        this.roomName = null;
        this.isConnected = false;

        console.log('CollaborationManager: Disconnected');

        // Clear MindMap callbacks
        this._clearMindMapCallbacks();

        if (this.onConnectionChange) {
            this.onConnectionChange('disconnected');
        }
    }

    /**
     * Sets up MindMap static callbacks for local → Yjs sync
     * @private
     */
    _setupMindMapCallbacks() {
        const self = this;

        // When a box changes locally, sync to Yjs
        if (typeof MindMap !== 'undefined') {
            MindMap.onBoxChange = (box) => {
                self.syncBoxToYjs(box);
            };

            MindMap.onBoxDelete = (boxId) => {
                self.deleteBoxFromYjs(boxId);
            };

            MindMap.onConnectionsChange = () => {
                self.syncConnectionsToYjs();
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
     * Dynamically loads Yjs and y-webrtc from CDN
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

            console.log('CollaborationManager: Dependencies loaded via ESM.sh (Websockets)');
            return;
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

        // Only sync if we're the first to join (empty Yjs state)
        if (this.yboxes.size === 0 && this.mindMap.boxes.length > 0) {
            console.log('CollaborationManager: Syncing local state to Yjs');

            this.ydoc.transact(() => {
                // Sync boxes
                for (const box of this.mindMap.boxes) {
                    if (box && box.id) {
                        this.yboxes.set(box.id, this._boxToYjsData(box));
                    }
                }

                // Sync connections
                for (const conn of this.mindMap.connections) {
                    if (conn && conn.fromBox && conn.toBox) {
                        this.yconnections.push([{
                            fromId: conn.fromBox.id,
                            toId: conn.toBox.id
                        }]);
                    }
                }
            });
        }
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
            imageUrl: box.imageUrl || null
        };
    }

    /**
     * Updates a single box in Yjs
     * Call this when a box is created or modified locally
     * @param {TextBox} box 
     */
    syncBoxToYjs(box) {
        if (!this.yboxes || !box || !box.id || this.isSyncing) return;

        this.yboxes.set(box.id, this._boxToYjsData(box));
    }

    /**
     * Removes a box from Yjs
     * Call this when a box is deleted locally
     * @param {string} boxId 
     */
    deleteBoxFromYjs(boxId) {
        if (!this.yboxes || !boxId || this.isSyncing) return;

        this.yboxes.delete(boxId);
    }

    /**
     * Syncs connections to Yjs
     * Call this when connections change
     */
    syncConnectionsToYjs() {
        if (!this.yconnections || !this.mindMap || this.isSyncing) return;

        // Get current local connections as ID pairs
        const localConns = this.mindMap.connections
            .filter(c => c && c.fromBox && c.toBox)
            .map(c => ({ fromId: c.fromBox.id, toId: c.toBox.id }));

        // Get current Yjs connections
        const yjsConns = this.yconnections.toArray();

        // Simple diff: clear and replace (for MVP)
        // TODO: Optimize with proper diff for large connection sets
        this.ydoc.transact(() => {
            // Clear existing
            while (this.yconnections.length > 0) {
                this.yconnections.delete(0);
            }
            // Add current
            for (const conn of localConns) {
                this.yconnections.push([conn]);
            }
        });
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
            console.log('Yjs Observer: Box change event', event.transaction.local, event.changes.keys);
            if (this.isSyncing) return;

            this.isSyncing = true;
            try {
                event.changes.keys.forEach((change, key) => {
                    if (change.action === 'add' || change.action === 'update') {
                        const data = this.yboxes.get(key);
                        this._applyBoxFromYjs(key, data);
                    } else if (change.action === 'delete') {
                        this._deleteBoxFromLocal(key);
                    }
                });

                // Redraw after changes
                if (this.mindMap) {
                    this.mindMap.isDirty = true;
                }
            } finally {
                this.isSyncing = false;
            }
        });

        // Observe connection changes
        this.yconnections.observe((event) => {
            if (this.isSyncing) return;

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
     * @private
     */
    _applyBoxFromYjs(boxId, data) {
        if (!this.mindMap || !data) return;

        let box = this.mindMap.getBoxById(boxId);

        if (box) {
            // Update existing box
            box.x = data.x;
            box.y = data.y;
            box.text = data.text || '';
            box.width = data.width;
            box.height = data.height;
            if (data.backgroundColor) {
                box.backgroundColor = { ...data.backgroundColor };
            }
            if (data.imageUrl !== undefined) {
                box.imageUrl = data.imageUrl;
            }
            box.updateDimensions();
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

    // ============================================================================
    // AWARENESS / PRESENCE
    // ============================================================================

    /**
     * Sets up awareness for user presence
     * @private
     */
    _setupAwareness() {
        if (!this.awareness) return;

        // Set local user state
        this.awareness.setLocalState({
            user: {
                id: this.userId,
                name: this.userName,
                color: this.userColor
            },
            cursor: null,
            selectedBoxIds: []
        });

        // Observe awareness changes
        this.awareness.on('change', () => {
            if (this.onAwarenessChange) {
                this.onAwarenessChange(this.getRemoteUsers());
            }
        });
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
     * Gets all remote users' awareness states
     * @returns {Array<{clientId, user, cursor, selectedBoxIds}>}
     */
    getRemoteUsers() {
        if (!this.awareness) return [];

        const states = [];
        this.awareness.getStates().forEach((state, clientId) => {
            if (clientId !== this.awareness.clientID && state.user) {
                states.push({
                    clientId,
                    user: state.user,
                    cursor: state.cursor,
                    selectedBoxIds: state.selectedBoxIds || []
                });
            }
        });
        return states;
    }

    // ============================================================================
    // UTILITY METHODS
    // ============================================================================

    /**
     * Generates a unique user ID
     * @private
     */
    _generateUserId() {
        return 'user_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Generates a random user name
     * @private
     */
    _generateUserName() {
        const adjectives = ['Happy', 'Swift', 'Clever', 'Bright', 'Calm', 'Bold'];
        const nouns = ['Thinker', 'Creator', 'Builder', 'Dreamer', 'Mapper', 'Planner'];
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
}

// Make available globally
if (typeof window !== 'undefined') {
    window.CollaborationManager = CollaborationManager;
}
