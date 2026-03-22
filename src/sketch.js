/**
 * sketch.js - Main p5.js application entry point for OpenMind
 * 
 * This file serves as the central coordinator for the mind mapping application,
 * managing the p5.js lifecycle, user interactions, UI rendering, and integration
 * with the collaboration system.
 * 
 * Key Responsibilities:
 * - p5.js lifecycle (setup, draw, event handlers)
 * - Camera/viewport management (pan, zoom)
 * - User input handling (mouse, keyboard, touch)
 * - UI rendering (toolbar, buttons, overlays)
 * - Save/load functionality
 * - Collaboration integration and room management
 * - URL routing for file loading and room joining
 * 
 * Architecture:
 * - Uses global p5.js instance mode (functions defined at top level)
 * - Coordinates between MindMap (data/logic) and p5.js (rendering/input)
 * - Manages CollaborationManager lifecycle for real-time sync
 * - Implements camera transformation system for infinite canvas
 * 
 * Dependencies:
 * - p5.js for rendering and event handling
 * - MindMap for mind map data and logic
 * - CollaborationManager for real-time collaboration (optional)
 * - Utils for shared utilities
 */

// ============================================================================
// CONFIGURATION CONSTANTS
// ============================================================================
// Use centralized configuration from utils.js, with local alias for compatibility

const CONFIG = (typeof AppConfig !== 'undefined') ? AppConfig : {
  ZOOM: { MIN: 0.2, MAX: 3.0, STEP: 1.05, DEFAULT: 1.0 },
  CAMERA: { PAN_MARGIN: 500 },
  UI: {
    TOOLBAR_HEIGHT: 40,
    MENU_TRIGGER_X: 50,
    MENU_TRIGGER_Y: 50,
    BUTTONS_BAND_HEIGHT: 50,
    BUTTON_START_X: 40,
    BUTTON_Y: 10,
    BUTTON_GAP: 5,
    SAVE_INDICATOR_SIZE: 16,
    SAVE_INDICATOR_X: 20,
    SAVE_INDICATOR_Y: 26
  },
  EXPORT: { PADDING: 50, MARGIN: 20 },
  AUTOSAVE: { INTERVAL: 30000 },
  VISIBILITY: { DEBOUNCE_MS: 50 },
  TIMING: { RESIZE_DEBOUNCE_MS: 16, DOUBLE_CLICK_MS: 300 },
  STORAGE: {
    DEFAULT_KEY: 'openmind_autosave',
    ROOM_KEY_PREFIX: 'openmind_room_'
  }
};

// UI Colors for consistent styling throughout the application
// UI color constants - using centralized ColorPalette
const UI_COLORS = ColorPalette.UI;

// Grid rendering options (local-only overlay) - using centralized ColorPalette
const GRID_CONFIG = {
  SPACING: 100,
  LINE_COLOR: ColorPalette.GRID.LINE,
  ORIGIN_COLOR: ColorPalette.GRID.ORIGIN
};

// ============================================================================
// GLOBAL STATE
// ============================================================================
// Application state variables for the mind map, UI, and camera/zoom

let mindMap;
let collaborationManager = null; // CollaborationManager for real-time sync
let uiManager = null; // UIManager for all UI elements and interactions
let exportManager = null; // ExportManager for PNG/PDF/Text exports
let menuIsVisible = false; // Derived menu visibility flag (synced from uiManager)

// Presence optimization: Idle detection for cursor/selection updates
let lastPresenceBroadcast = {
  cursorX: null,
  cursorY: null,
  selectedIds: [],
  editingBoxId: null,
  time: Date.now(), // Initialize to current time to prevent immediate idle state
  isIdle: false
};

// Autosave state
let autosaveTimer = null;

// Utility: Attach display name input handlers so the name updates on Enter or blur
function attachDisplayNameInputHandlers(input, options = {}) {
  const { collaborationManager: collab, onHideMenu, requestMenuHide } = options;
  if (!input || !input.elt) return null;

  const commitDisplayNameChange = () => {
    const newName = input.value().trim();
    if (newName && collab && collab.setUserName) {
      collab.setUserName(newName);
    }
    // Clear input and show updated name in placeholder
    input.value('');
    if (collab && collab.getUserName) {
      input.attribute('placeholder', collab.getUserName());
    }
  };

  // Stop all keyboard events from reaching the mindmap while input is focused
  input.elt.addEventListener('keydown', (e) => {
    e.stopPropagation(); // Prevent mindmap from receiving key events

    if (e.key === 'Enter') {
      e.preventDefault();
      commitDisplayNameChange();
      input.elt.blur(); // Remove focus after submission
    } else if (e.key === 'Escape') {
      // Cancel editing on Escape
      input.value('');
      input.elt.blur();
    }
  });

  // Apply name on blur so clicking away saves and closes the menu
  input.elt.addEventListener('blur', () => {
    commitDisplayNameChange();
    if (typeof onHideMenu === 'function') {
      onHideMenu();
    }
    if (typeof requestMenuHide === 'function') {
      requestMenuHide();
    }
  });

  // Also stop keyup and keypress to be thorough
  input.elt.addEventListener('keyup', (e) => e.stopPropagation());
  input.elt.addEventListener('keypress', (e) => e.stopPropagation());

  // Blur when clicking anywhere outside the input so users don't have to press Enter
  if (typeof addTrackedEventListener === 'function' && typeof document !== 'undefined') {
    addTrackedEventListener(document, 'pointerdown', (e) => {
      try {
        if (!input || !input.elt) return;
        const target = e && e.target;
        const isInput = target === input.elt || (input.elt.contains && input.elt.contains(target));
        if (isInput) return;
        if (document.activeElement === input.elt && input.elt.blur) {
          input.elt.blur();
        }
      } catch (_) { /* ignore */ }
    }, true); // capture to run before other handlers
  }

  return { commitDisplayNameChange };
}

// ============================================================================
// CAMERA STATE
// ============================================================================
// Consolidated camera state object for cleaner dependencies.
// Legacy globals (camX, camY, zoom) are kept in sync for backward compatibility.

// Legacy globals (kept for backward compatibility during transition)


// Multi-box selection drag state
let isSelectingMultiple = false;
let selectionStartX = 0;
let selectionStartY = 0;
let selectionCurrentX = 0;
let selectionCurrentY = 0;

// Performance optimization: debounce expensive operations
let lastResizeTime = 0;
// Use CONFIG.TIMING directly for consistency

// Page visibility tracking to prevent freezing when tab is hidden
let isPageVisible = true;
let wasPageHidden = false;
let visibilityChangeInProgress = 0; // Timestamp of last visibility change for debouncing

// Track last file loaded via URL so we don't ignore subsequent navigations
let lastLoadedUrlFile = null;
// Loading indicator state
let isMapLoading = false;
// Collaboration sync status for overlay: null, 'connecting', 'server_starting', 'syncing'
let syncStatus = null;
let currentJoinId = 0; // Tracks the latest join attempt to cancel stale ones

// Room join confirmation state object, or null when no confirmation is pending
let roomJoinConfirmation = null;
// Timeout handles for sync overlay (module scope for proper cleanup)
let syncConnectionTimeout = null;
let syncEmptyRoomTimeout = null;
// Event listener cleanup tracking
let eventListeners = [];

// Store references to overlay event listeners for cleanup
let overlayClickHandler = null;
let overlayContentClickHandler = null;

// Mobile navigation overlay state
let mobileNavOverlay = null;
let mobileNavUpButton = null;
let mobileNavDownButton = null;
let isTouchDevice = false;
let isGridVisible = false; // Local grid overlay toggle

// ============================================================================
// EXTENSION BRIDGE (Ghost Plugin System)
// ============================================================================
// The ExtensionBridge allows for dynamic, lazy-loaded components (ghost plugins)
// to attach themselves to the application lifecycle without incurring hot-path
// overhead when dormant. Zero CPU impact during normal mind-mapping.

window.ExtensionBridge = {
  /** @type {Function|null} Hot-path draw hook */
  draw: null,
  /** @type {Function|null} Input handler hook */
  handleInput: null,
  /** @type {Function|null} Key release listener */
  handleKeyReleased: null,
  /** @type {Map<string, boolean>} Track loading status */
  _loading: new Map(),

  /**
   * Lazily loads an extension script if not already loaded or loading.
   * @param {string} name - Internal name for tracking
   * @param {string} path - Path to the JS file
   * @param {Function} [onLoad] - Optional callback after loading
   */
  load: function (name, path, onLoad) {
    if (window[name]) {
      if (onLoad) onLoad();
      return;
    }
    if (this._loading.has(name)) {
      // If already loading, we could queue the callback, but for now just ignore
      return;
    }
    this._loading.set(name, true);
    console.info(`[ExtensionBridge] Lazily loading ${name} from ${path}...`);
    const script = document.createElement('script');
    script.src = path;
    script.onload = () => {
      this._loading.set(name, false);
      console.info(`[ExtensionBridge] ${name} loaded successfully.`);
      if (onLoad) onLoad();
    };
    script.onerror = (e) => {
      this._loading.delete(name);
      console.error(`[ExtensionBridge] Failed to load ${name}:`, e);
    };
    document.body.appendChild(script);
  }
};

// ============================================================================
// KEY REPEAT MANAGER
// ============================================================================
// Fallback key-repeat for Backspace/Delete to ensure repeat works even if
// the browser/OS doesn't auto-repeat these keys

const KeyRepeat = {
  // Handle deletion keys and arrow keys (arrow repeats are limited to text-editing mode).
  // Don't rely on p5's keyCode constants being pre-defined at load time.
  isTracked(code) {
    const BK = (typeof BACKSPACE !== 'undefined') ? BACKSPACE : 8;
    const DEL = (typeof DELETE !== 'undefined') ? DELETE : 46;
    return code === BK || code === DEL || this._isArrowKey(code);
  },
  _isArrowKey(code) {
    const LA = (typeof LEFT_ARROW !== 'undefined') ? LEFT_ARROW : 37;
    const UA = (typeof UP_ARROW !== 'undefined') ? UP_ARROW : 38;
    const RA = (typeof RIGHT_ARROW !== 'undefined') ? RIGHT_ARROW : 39;
    const DA = (typeof DOWN_ARROW !== 'undefined') ? DOWN_ARROW : 40;
    return code === LA || code === UA || code === RA || code === DA;
  },
  initialDelay: 400, // ms before repeating starts (match typical OS behavior)
  repeatInterval: 50, // ms between repeats
  nativeRepeatThreshold: 150, // ms - if we see keydowns faster than this, browser is repeating
  state: new Map(), // keyCode -> { active, pressedAt, lastEventAt, lastNativeKeydownAt, prevNativeKeydownAt }

  _ensure(keyCode) {
    // Ensure keyCode is a number for consistent Map lookups
    const code = Number(keyCode);
    if (!this.state.has(code)) {
      this.state.set(code, { active: false, pressedAt: 0, lastEventAt: 0, lastNativeKeydownAt: 0, prevNativeKeydownAt: 0 });
    }
    return this.state.get(code);
  },

  noteNativeKeydown(keyCode) {
    if (!this.isTracked(keyCode)) return;
    const s = this._ensure(keyCode);
    s.prevNativeKeydownAt = s.lastNativeKeydownAt;
    s.lastNativeKeydownAt = millis();
  },

  start(keyCode) {
    if (!this.isTracked(keyCode)) return;
    const now = millis();
    const s = this._ensure(keyCode);
    s.active = true;
    s.pressedAt = now;
    s.lastEventAt = now; // last synthetic repeat time
    // lastNativeKeydownAt updated by noteNativeKeydown from keyPressed
  },

  stop(keyCode) {
    if (!this.isTracked(keyCode)) return;
    const s = this._ensure(keyCode);
    s.active = false;
  },

  reset() {
    // Stop all tracked keys (e.g., on window blur)
    for (const [, s] of this.state) s.active = false;
  },

  update() {
    if (!mindMap) return;
    const now = millis();
    // Iterate over keys that are in the state map (those we've seen pressed)
    for (const [keyCode, s] of this.state) {
      if (!s.active || !this.isTracked(keyCode)) continue;

      // Arrow-key repeats only make sense while actively editing text inside a box.
      // When not editing, arrow keys navigate between boxes – we don't want synthetic
      // repeats for that (the user can press the key again deliberately).
      if (this._isArrowKey(keyCode) && (!mindMap.selectedBox || !mindMap.selectedBox.isEditing)) {
        continue;
      }

      // Detect if browser is already delivering native repeats by checking time between consecutive keydowns
      // If we've seen two keydowns close together (faster than our threshold), browser is handling repeat
      const timeBetweenNativeKeydowns = s.lastNativeKeydownAt - s.prevNativeKeydownAt;
      const hasNativeRepeat = s.prevNativeKeydownAt > 0 &&
        timeBetweenNativeKeydowns > 0 &&
        timeBetweenNativeKeydowns < this.nativeRepeatThreshold;

      if (hasNativeRepeat) {
        // Browser is handling repeat, don't synthesize
        continue;
      }

      // Start our fallback repeat only after initialDelay from the original press
      if (now - s.pressedAt < this.initialDelay) continue;

      // Fire at repeatInterval cadence
      if (now - s.lastEventAt >= this.repeatInterval) {
        s.lastEventAt = now;
        // Call into existing handler with isRepeat = true so we can avoid spamming undo stack
        try {
          // We pass a null/space for key where appropriate; handler keys off keyCode for deletion
          if (typeof mindMap.handleKeyPressed === 'function') {
            mindMap.handleKeyPressed('', keyCode, true);
          }
        } catch (e) {
          // Non-fatal
        }
      }
    }
  }
};

// ============================================================================
// COORDINATE TRANSFORMATION UTILITIES
// ============================================================================
// These helpers convert between screen space (pixels on canvas) and world space
// (the infinite pan/zoom coordinate system).
// Transform: screen = world * zoom + cam
// Inverse: world = (screen - cam) / zoom

/**
 * Converts mouse X position from screen space to world space
 * @returns {number} World X coordinate
 */
/**
 * Converts mouse X position from screen space to world space
 * @returns {number} World X coordinate
 */
function worldMouseX() {
  return CameraUtils.worldX(mouseX);
}





/**
 * Extracts a normalized map name from a full path or name
 * @see UrlUtils.extractMapName for implementation
 */
function extractMapName(pathOrName) {
  return typeof UrlUtils !== 'undefined'
    ? UrlUtils.extractMapName(pathOrName)
    : (pathOrName || '').toLowerCase();
}

/**
 * Checks if two map names are similar
 * @see UrlUtils.namesAreSimilar for implementation
 */
function namesAreSimilar(name1, name2) {
  return typeof UrlUtils !== 'undefined'
    ? UrlUtils.namesAreSimilar(name1, name2)
    : name1 === name2;
}

/**
 * Handler to respond to URL changes (hash/popstate) for room management.
 */
function handleUrlChange() {
  // Clear any pending room join confirmation when URL changes
  if (roomJoinConfirmation) {
    Utils.Logger.state('[Room] URL changed - clearing pending room join confirmation');
    roomJoinConfirmation = null;
  }

  // Check for room changes
  const roomInfo = parseRoomFromHash();
  const newRoom = roomInfo ? roomInfo.room : null;
  const currentRoom = collaborationManager ? collaborationManager.roomName : null;

  if (newRoom !== currentRoom) {
    if (collaborationManager) {
      // Fully destroy the old instance to properly clean up awareness
      collaborationManager.destroy();
      collaborationManager = null;
    }
    if (newRoom && mindMap) {
      initializeCollaboration(newRoom);
      return;
    } else if (!newRoom && currentRoom && mindMap) {
      // User is leaving a room (navigating away). 
      // We keep the storage key as-is to preserve context for the boxes on screen.
      Utils.Logger.state('[Room] Disconnected from room, keeping current storage context');
    }
  }
}

/**
 * Parses server URL from query params
 * @see UrlUtils.parseServerFromUrl for implementation
 */
function parseServerFromUrl() {
  return typeof UrlUtils !== 'undefined'
    ? UrlUtils.parseServerFromUrl()
    : null;
}

/**
 * Parses room ID and mode from URL hash
 * @see UrlUtils.parseRoomFromHash for implementation
 */
function parseRoomFromHash() {
  return typeof UrlUtils !== 'undefined'
    ? UrlUtils.parseRoomFromHash()
    : null;
}

/**
 * Generates a safe storage key for a collaboration room
 * @see UrlUtils.getRoomStorageKey for implementation
 */
function getRoomStorageKey(roomName) {
  return typeof UrlUtils !== 'undefined'
    ? UrlUtils.getRoomStorageKey(roomName, CONFIG)
    : CONFIG.STORAGE.ROOM_KEY_PREFIX + roomName;
}

/**
 * Clears all local mind map state (boxes, connections, selections, etc.)
 * Called when user confirms joining a collaboration room that will replace local data
 * @private
 */
function _clearLocalState() {
  if (!mindMap) return;

  Utils.Logger.state('[Room] Clearing local state:', mindMap.boxes.length, 'boxes');

  // Reset interaction flags on boxes before clearing to prevent broken UI state
  for (const box of mindMap.boxes) {
    if (box.isDragging) box.isDragging = false;
    if (box.isResizing) box.isResizing = false;
    if (box.isEditing && typeof box.stopEditing === 'function') {
      box.stopEditing();
    }
  }

  // Clear all local boxes and connections
  mindMap.boxes = [];
  mindMap.connections = [];

  // Clear O(1) index
  if (mindMap.boxIdMap) {
    mindMap.boxIdMap.clear();
  }


  // Clear selections
  mindMap.selectedBox = null;
  mindMap.selectedConnection = null;
  if (mindMap.selectedBoxes) mindMap.selectedBoxes.clear();
  if (mindMap.selectedConnections) mindMap.selectedConnections.clear();

  // Clear navigation and interaction state
  mindMap.isArrowKeyNavigating = false;
  mindMap.connectingFrom = null;
  mindMap.draggingConnection = null;

  // Clear copied state
  mindMap.copiedBoxes = [];
  mindMap.copiedConnections = [];

  // Reset dirty flag to prevent unexpected autosave
  mindMap.isDirty = false;

  Utils.Logger.state('[Room] Local state cleared - room sync will provide authoritative state');
}


/**
 * Initializes collaboration for a given room
 * Shows dialog BEFORE connecting if user has local data to prevent race conditions
 * @param {string} roomName 
 */
async function initializeCollaboration(roomName) {
  if (!mindMap || !roomName) return;
  if (typeof CollaborationManager === 'undefined') {
    console.warn('CollaborationManager not loaded');
    return;
  }

  // Guard: If already connected to this SPECIFIC room, ignore duplicate call
  if (collaborationManager && collaborationManager.isConnected && collaborationManager.roomName === roomName) {
    Utils.Logger.collab('[Room] Already active in room:', roomName);
    return;
  }

  try {
    // Validate mindMap.boxes is an array
    const hasLocalData = mindMap.boxes && Array.isArray(mindMap.boxes) && mindMap.boxes.length > 0;

    Utils.Logger.collab('[Room] Joining collaboration room:', roomName);

    // FIX ISSUE #1: Check if dialog is already showing to prevent multiple instances
    if (roomJoinConfirmation && roomJoinConfirmation.pendingConnection) {
      Utils.Logger.warn('[Room] Dialog already showing - ignoring duplicate call');
      return;
    }

    // SMARTER CONFLICT DETECTION: 
    // 1. If we are already connected to this room (redundant call), skip.
    // 2. If the data on screen is already marked for this room (resuming session), skip.
    const currentKey = (mindMap && typeof mindMap.getStorageKey === 'function') ? mindMap.getStorageKey() : null;
    const targetKey = getRoomStorageKey(roomName);
    const isResumingRoom = collaborationManager && collaborationManager.roomName === roomName;
    const isRoomContextMatch = currentKey === targetKey;

    if (hasLocalData && !isResumingRoom && !isRoomContextMatch) {
      Utils.Logger.collab('[Room] User has data from another context, showing options');

      roomJoinConfirmation = {
        roomName: roomName,
        hasLocalData: true,
        boxCount: mindMap.boxes.length,
        pendingConnection: true
      };
      return;
    }

    // No conflict (either empty room or resuming current room) - proceed immediately
    await _proceedWithRoomJoin(roomName, null);

  } catch (error) {
    console.error('[Room] Failed to initialize collaboration:', error);
    syncStatus = null;
    // Attempt to recover by disconnecting
    if (collaborationManager) {
      try {
        collaborationManager.disconnect();
      } catch (disconnectError) {
        console.error('[Room] Failed to disconnect after error:', disconnectError);
      }
    }
  }
}

/**
 * Proceeds with room connection after user makes a choice (or immediately if no local data)
 * @param {string} roomName 
 * @param {string|null} userChoice - 'sync', 'delete', or null (no local data)
 * @private
 */
async function _proceedWithRoomJoin(roomName, userChoice) {
  const joinId = ++currentJoinId;
  const isStale = () => joinId !== currentJoinId;

  try {
    Utils.Logger.collab('[Room] Starting join sequence', joinId, 'for:', roomName);

    // 1. Handle room transitions: if manager exists but for wrong room, destroy it
    if (collaborationManager && collaborationManager.roomName !== roomName) {
      Utils.Logger.collab('[Room] Switching manager room... destroying old manager');
      collaborationManager.destroy();
      collaborationManager = null;
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    if (isStale()) return;

    // Clear any existing timeouts from previous connection attempts
    if (syncConnectionTimeout) { clearTimeout(syncConnectionTimeout); syncConnectionTimeout = null; }
    if (syncEmptyRoomTimeout) { clearTimeout(syncEmptyRoomTimeout); syncEmptyRoomTimeout = null; }

    // 2. Handle data choices: 'delete' wipes storage, 'sync' prep for injection later
    if (userChoice === 'delete') {
      // User explicitly chose to join fresh.
      // CRITICAL: We MUST destroy the current manager and Yjs doc FIRST.
      if (collaborationManager) {
        Utils.Logger.collab('[Sync] Destroying active engine before wipe to protect server data');
        collaborationManager.destroy();
        collaborationManager = null;
      }

      // Clear memory state
      _clearLocalState();

      // 2. We do NOT wipe the persistent IndexedDB cache here anymore.
      // This prevents the "Total Data Loss" scenario if the server is empty.
      // Instead, we just clear the memory state. When the new engine connects, 
      // it will load the room's persistence normally. 
      // If the user wants to nuke the room, they can do it while connected.

      if (isStale()) return;
      Utils.Logger.collab('[Sync] Local screen state cleared; will load room authoritative context');
    }

    // 3. Create/Initialize manager if it's currently null 
    // (fresh start, room switch, or destroyed by 'delete' above)
    if (!collaborationManager) {
      Utils.Logger.collab('[Sync] Initializing fresh collaboration engine');
      collaborationManager = new CollaborationManager(mindMap);
      await collaborationManager.initialize(roomName);
    }

    if (isStale()) return;

    // 4. Handle 'Bring Local Work' - Inject local data into Yjs BEFORE connecting
    if (userChoice === 'sync' && mindMap && mindMap.boxes && mindMap.boxes.length > 0) {
      Utils.Logger.collab('[Sync] Injecting local work into fresh engine');
      collaborationManager.syncLocalToRoom();
    }

    // 4. Attach/Update callbacks to the active manager
    const activeManager = collaborationManager;
    activeManager.onConnectionChange = (status) => {
      Utils.Logger.collab('[Connection]', status);
      const prevStatus = syncStatus;
      if (status === 'connecting') {
        syncStatus = 'connecting';
        syncConnectionTimeout = setTimeout(() => {
          if (syncStatus === 'connecting') syncStatus = 'server_starting';
        }, 5000);
      } else if (status === 'connected') {
        if (syncConnectionTimeout) { clearTimeout(syncConnectionTimeout); syncConnectionTimeout = null; }
        if (syncStatus !== null) syncStatus = 'syncing';
      } else if (status === 'synced') {
        if (syncEmptyRoomTimeout) { clearTimeout(syncEmptyRoomTimeout); syncEmptyRoomTimeout = null; }
        if (syncStatus !== null) Utils.Logger.state('[Sync] Sync complete - hiding overlay');

        // Initial zoom to fit for the room: ensure everything is visible on join
        if (activeManager && !activeManager.hasTriggeredInitialZoom) {
          activeManager.hasTriggeredInitialZoom = true;
          // Small delay to ensure mindMap boxes are fully processed and bounds are stable
          setTimeout(() => {
            // ONLY zoom if this manager is still the current active one (hasn't been replaced)
            if (collaborationManager === activeManager) {
              try { resetView(); } catch (e) { console.warn('Initial resetView failed:', e); }
            }
          }, 50);
        }

        syncStatus = null;
      } else if (status === 'disconnected') {
        if (syncConnectionTimeout) { clearTimeout(syncConnectionTimeout); syncConnectionTimeout = null; }
        if (syncEmptyRoomTimeout) { clearTimeout(syncEmptyRoomTimeout); syncEmptyRoomTimeout = null; }
        syncStatus = null;

        // Clean up presence state
        lastPresenceBroadcast = { cursorX: null, cursorY: null, selectedIds: [], editingBoxId: null, time: Date.now(), isIdle: false };
      }

      if (prevStatus !== syncStatus) Utils.Logger.state('[Sync] Overlay status changed:', prevStatus, '→', syncStatus);

      // Update UI to reflect connection state
      try {
        if (uiManager) {
          Utils.Logger.state('[UI] Updating collaboration state, isConnected:', activeManager.isConnected);
          uiManager.layoutButtons();
        }
      } catch (e) {
        console.error('[UI] Error updating collaboration state:', e);
      }
    };

    let lastPeerCount = 0;
    activeManager.onPeersChange = (peers) => {
      if (peers.length !== lastPeerCount) {
        Utils.Logger.collab('[Peers] Connected:', peers.length);
        lastPeerCount = peers.length;
      }
    };

    activeManager.onVersionMismatch = (mismatchInfo) => {
      console.warn('Version mismatch detected:', mismatchInfo);
      syncStatus = 'incompatible';
    };

    // Now proceed with connection
    const serverUrl = parseServerFromUrl();
    if (serverUrl) {
      Utils.Logger.network('[Server] Connecting to custom signaling server:', serverUrl);
    }

    // FIX ISSUE #3: Show progress indicator
    // Only set if not already set by a fast-firing callback
    if (syncStatus === null) syncStatus = 'connecting';

    // ABSOLUTE SAFETY: If we are still stuck after 25s, release the user
    // This handles cases where the signaling server or Yjs hang indefinitely
    const safetyReleaseTimer = setTimeout(() => {
      if (syncStatus) {
        Utils.Logger.warn('[Room] Absolute safety timeout reached - revealing map anyway');
        syncStatus = null;
      }
    }, 25000);

    // Connect to room - Yjs will automatically merge with remote data
    try {
      await collaborationManager.connect(roomName, serverUrl);
    } finally {
      clearTimeout(safetyReleaseTimer);
    }

    // SAFETY: If after connect() we are still in a 'connecting' state (which shouldn't happen)
    // but the manager says it's connected, move to 'syncing' to show progress or 'null' if already synced.
    if (syncStatus === 'connecting' && collaborationManager.isConnected) {
      syncStatus = collaborationManager.lastSyncedState ? null : 'syncing';
    }
    Utils.Logger.collab('[Room] Initialized:', roomName);

    // Update browser tab title to show room name
    document.title = roomName + ' — OpenMind';

    // Update UI buttons to reflect collaboration state
    if (uiManager && typeof uiManager.updateCollaborationState === 'function') {
      uiManager.updateCollaborationState();

      // Also schedule a delayed update in case connection state changes after initial call
      setTimeout(() => {
        if (uiManager && typeof uiManager.updateCollaborationState === 'function') {
          uiManager.updateCollaborationState();
        }
      }, 500);
    }

    // EXTENSION BRIDGE: Notify ThrustGame of new dependencies
    // If the game is loaded (even if dormant), we must poke it so it can
    // re-attach its awareness listener to the NEW collaboration manager.
    if (typeof ThrustGame !== 'undefined') {
      ThrustGame.loop(collaborationManager, mindMap);
    }

  } catch (e) {
    console.error('[Room] Failed to proceed with room join:', e);

    // Safety cleanup: Ensure we don't leave the UI locked
    if (syncConnectionTimeout) { clearTimeout(syncConnectionTimeout); syncConnectionTimeout = null; }
    if (syncEmptyRoomTimeout) { clearTimeout(syncEmptyRoomTimeout); syncEmptyRoomTimeout = null; }
    syncStatus = null;

    // Error recovery: Disconnect if possible to avoid half-open states
    if (collaborationManager) {
      try {
        collaborationManager.onConnectionChange = null; // Detach UI callbacks
        collaborationManager.disconnect();
      } catch (err) { }
    }
  }

  // Set storage key only on successful connection
  // CRITICAL: Use room-specific storage key to prevent overwriting offline work
  // When in online mode, autosave goes to room-specific key instead of default
  // This preserves the user's local work when they return to offline mode
  if (collaborationManager && collaborationManager.isConnected && mindMap && typeof mindMap.setStorageKey === 'function') {
    const storageKey = getRoomStorageKey(roomName);
    mindMap.setStorageKey(storageKey);
    Utils.Logger.state('[Storage] Set key to:', storageKey);
  }
}

/**
 * Generates a shareable collaboration link
 * @returns {string} URL with room hash
 */
function generateShareLink() {
  if (typeof CollaborationManager === 'undefined') return window.location.href;
  const roomName = collaborationManager
    ? collaborationManager.roomName
    : CollaborationManager.generateRoomName();
  return CollaborationManager.generateRoomUrl(roomName);
}

/**
 * Starts a new session or shares the current one
 */
function shareSession() {
  if (!collaborationManager || !collaborationManager.isConnected) {
    // Start new session - Yjs will merge local map data with room
    const room = CollaborationManager.generateRoomName();
    const boxCount = mindMap && mindMap.boxes ? mindMap.boxes.length : 0;
    Utils.Logger.collab('[Session] Starting with', boxCount, 'boxes from local work');

    // Navigate to room - Yjs will handle merging
    window.location.hash = `room=${room}`;
  } else {
    // Copy link
    const url = generateShareLink();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        alert('Link copied to clipboard: ' + url);
      }).catch(err => {
        prompt('Copy this link:', url);
      });
    } else {
      prompt('Copy this link:', url);
    }
  }
}

/**
 * Updates local user presence (cursor, selection) broadcast
 */
/**
 * Updates presence information (cursor, selection) for collaboration.
 * Called from draw loop only when connected to a room.
 * Optimized with idle detection and payload rounding to reduce bandwidth.
 */
function updateCollaborationPresence() {
  // Early exit if somehow called without valid manager (defensive check)
  if (!collaborationManager) return;

  // Throttle updates (every ~100ms)
  if (frameCount % 6 !== 0) return;

  // Get current cursor position (world space)
  let wx = null, wy = null;
  if (typeof worldMouseX === 'function' && typeof worldMouseY === 'function') {
    wx = worldMouseX();
    wy = worldMouseY();
    if (!Number.isFinite(wx) || !Number.isFinite(wy)) {
      wx = null;
      wy = null;
    }
  }

  // Get current selection
  let selectedIds = [];
  if (mindMap) {
    if (mindMap.selectedBoxes && mindMap.selectedBoxes.size > 0) {
      selectedIds = Array.from(mindMap.selectedBoxes).map(b => b.id).filter(id => id);
    } else if (mindMap.selectedBox && mindMap.selectedBox.id) {
      selectedIds = [mindMap.selectedBox.id];
    }
  }

  // Get editing state
  const editingBoxId = (mindMap && mindMap.selectedBox && mindMap.selectedBox.isEditing)
    ? mindMap.selectedBox.id
    : null;

  // Detect changes
  // Check if cursor went off-canvas (was visible, now null)
  const cursorBecameInvalid = wx === null && lastPresenceBroadcast.cursorX !== null;

  // Check if cursor moved (only when both current and last are valid)
  const cursorMoved = wx !== null && lastPresenceBroadcast.cursorX !== null && (
    Math.abs(wx - lastPresenceBroadcast.cursorX) > 1 ||
    Math.abs(wy - lastPresenceBroadcast.cursorY) > 1
  );

  const selectionChanged = !arraysEqual(selectedIds, lastPresenceBroadcast.selectedIds);
  const editingChanged = editingBoxId !== lastPresenceBroadcast.editingBoxId;

  const now = Date.now();

  // Idle detection: stop broadcasting if no changes for 2 seconds
  if (cursorMoved || cursorBecameInvalid || selectionChanged || editingChanged) {
    // Activity detected - reset idle state and broadcast
    lastPresenceBroadcast.time = now;
    lastPresenceBroadcast.isIdle = false;

    // Round cursor position to reduce payload size (1 decimal = 0.1 pixel precision)
    if (wx !== null && wy !== null) {
      const roundedX = Math.round(wx * 10) / 10;
      const roundedY = Math.round(wy * 10) / 10;

      // Validate rounded values are finite before broadcasting
      if (Number.isFinite(roundedX) && Number.isFinite(roundedY)) {
        collaborationManager.updateCursor(roundedX, roundedY);
        lastPresenceBroadcast.cursorX = roundedX;
        lastPresenceBroadcast.cursorY = roundedY;
      }
    } else if (cursorBecameInvalid) {
      // Cursor went off-canvas - update to null to clear remote cursor
      lastPresenceBroadcast.cursorX = null;
      lastPresenceBroadcast.cursorY = null;
    }

    collaborationManager.updateSelection(selectedIds);
    lastPresenceBroadcast.selectedIds = [...selectedIds]; // Copy array to avoid mutation issues

    collaborationManager.updateEditingBox(editingBoxId);
    lastPresenceBroadcast.editingBoxId = editingBoxId;
  } else if (now - lastPresenceBroadcast.time > 2000) {
    // No activity for 2 seconds - transition to idle
    if (!lastPresenceBroadcast.isIdle) {
      // Send one final update before going idle
      lastPresenceBroadcast.isIdle = true;

      if (wx !== null && wy !== null) {
        const roundedX = Math.round(wx * 10) / 10;
        const roundedY = Math.round(wy * 10) / 10;

        // Validate rounded values before final idle broadcast
        if (Number.isFinite(roundedX) && Number.isFinite(roundedY)) {
          collaborationManager.updateCursor(roundedX, roundedY);
          lastPresenceBroadcast.cursorX = roundedX;
          lastPresenceBroadcast.cursorY = roundedY;
        }
      }
    }
    // Idle - skip broadcasting to save bandwidth
    return;
  }
}

/**
 * Helper function to compare two arrays for equality (order-independent)
 * Uses Set comparison since selection order doesn't matter
 */
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  // Use Set for order-independent comparison
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size !== setB.size) return false; // Handles duplicates
  for (const item of setA) {
    if (!setB.has(item)) return false;
  }
  return true;
}

/**
 * Draws cursors of remote users.
 * Called from draw loop only when connected to a room.
 */
function drawRemoteCursors() {
  // Early exit if somehow called without valid manager (defensive check)
  if (!collaborationManager) return;

  const users = collaborationManager.getRemoteUsers();
  if (!users || users.length === 0) return;

  for (const userState of users) {
    // Check if this user is in thrust mode using their specific clientId
    let remoteThrustState = null;
    if (userState.clientId !== undefined) {
      const states = collaborationManager.awareness?.getStates();
      if (states) {
        const specificState = states.get(userState.clientId);
        if (specificState && specificState.thrustGame) {
          remoteThrustState = specificState.thrustGame;

          // Auto-load ThrustGame if we see remote activity but it's not loaded yet
          if (typeof ThrustGame === 'undefined') {
            ExtensionBridge.load('ThrustGame', 'src/ThrustGame.js', () => {
              // Remote activity detected: Attach the loop so we can render it.
              // We do this manually here because we removed the auto-attach from the script
              // to prevent the "Double Cleanup" issue on local start.
              if (window.ExtensionBridge && typeof ThrustGame !== 'undefined') {
                window.ExtensionBridge.draw = ThrustGame.loop;
                // Run once to setup listeners immediately
                ThrustGame.loop(collaborationManager, mindMap);
              }
            });
          }
        }
      }
    }

    // If user is in thrust mode, their presence is handled by ThrustGame.draw()
    // We skip the cursor even if local player isn't in thrust mode, because the remote player's
    // spaceship should always be visible when they're in thrust mode.
    if (remoteThrustState) {
      // Spaceship is drawn by ThrustGame.draw() as a remote player
      continue;
    }

    // Draw regular cursor for users not in thrust mode
    if (!userState.cursor) continue;

    const { x, y } = userState.cursor;
    const color = userState.user ? userState.user.color : ColorPalette.toHex(ColorPalette.BASE.GRAY_MEDIUM);
    const name = userState.user ? userState.user.name : 'Unknown';

    // Draw cursor (simple arrow or circle)
    push();
    translate(x, y);

    // Cursor body
    noStroke();
    fill(color);
    triangle(0, 0, 12, 12, 0, 18); // Simple cursor shape

    // Name tag
    if (name) {
      textSize(12);
      const tagWidth = textWidth(name) + 10;
      const tagHeight = 20;
      fill(color);
      rectMode(CORNER);
      rect(15, 0, tagWidth, tagHeight, 4);
      fill(255);
      textAlign(LEFT, CENTER);
      text(name, 20, tagHeight / 2);
    }
    pop();

    // Highlight remote selections
    if (userState.selectedBoxIds && userState.selectedBoxIds.length > 0 && mindMap) {
      noFill();
      stroke(color);
      strokeWeight(3);
      for (const id of userState.selectedBoxIds) {
        const box = mindMap.getBoxById(id);
        if (box) {
          rectMode(CENTER);
          rect(box.x, box.y, box.width + 10, box.height + 10, 8);
        }
      }
    }

    // Show editing lock indicator - pulsing border with user name
    if (userState.editingBoxId && mindMap) {
      const box = mindMap.getBoxById(userState.editingBoxId);
      if (box) {
        // Pulsing effect using sin wave
        const pulse = 0.5 + 0.5 * sin(frameCount * 0.1);
        const alpha = 150 + pulse * 105;

        // Draw locked/editing border
        noFill();
        stroke(red(color), green(color), blue(color), alpha);
        strokeWeight(4);
        rectMode(CENTER);
        rect(box.x, box.y, box.width + 14, box.height + 14, 10);

        // Draw editing indicator tag
        push();
        noStroke();
        fill(color);
        textSize(11);
        const tagText = '✏ ' + name;
        const tagWidth = textWidth(tagText) + 12;
        const tagHeight = 16;
        const tagX = box.x - box.width / 2;
        const tagY = box.y - box.height / 2 - tagHeight - 4;
        rectMode(CORNER);
        rect(tagX, tagY, tagWidth, tagHeight, 4);
        fill(255);
        textAlign(LEFT, CENTER);
        text(tagText, tagX + 6, tagY + tagHeight / 2);
        pop();
      }
    }
  }
}

/**
 * Converts mouse Y position from screen space to world space
 * @returns {number} World Y coordinate
 */
function worldMouseY() {
  return CameraUtils.worldY(mouseY);
}

/**
 * Converts world X coordinate to screen space
 * @see Utils.screenX for centralized implementation
 */
function screenX(worldX) {
  return CameraUtils.screenX(worldX);
}

/**
 * Converts world Y coordinate to screen space
 * @see Utils.screenY for centralized implementation
 */
function screenY(worldY) {
  return CameraUtils.screenY(worldY);
}

/**
 * Draws a world-space grid behind content for local debugging/navigation.
 */
function drawGrid() {
  if (typeof CameraUtils === 'undefined') return;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return;

  const left = CameraUtils.worldX(0);
  const right = CameraUtils.worldX(width);
  const top = CameraUtils.worldY(0);
  const bottom = CameraUtils.worldY(height);

  if (![left, right, top, bottom].every(Number.isFinite)) return;

  const spacing = GRID_CONFIG.SPACING;
  const startX = Math.floor(left / spacing) * spacing;
  const endX = Math.ceil(right / spacing) * spacing;
  const startY = Math.floor(top / spacing) * spacing;
  const endY = Math.ceil(bottom / spacing) * spacing;

  push();
  const lineWeight = Math.max(0.2, 0.8 / CameraUtils.zoom);
  Utils.applyStroke(GRID_CONFIG.LINE_COLOR, lineWeight);

  for (let x = startX; x <= endX; x += spacing) {
    line(x, top, x, bottom);
  }
  for (let y = startY; y <= endY; y += spacing) {
    line(left, y, right, y);
  }

  Utils.applyStroke(GRID_CONFIG.ORIGIN_COLOR, Math.max(0.2, 0.8 / CameraUtils.zoom));
  line(0, top, 0, bottom);
  line(left, 0, right, 0);
  pop();
}

function toggleGridVisibility() {
  isGridVisible = !isGridVisible;
}

// ============================================================================
// P5.JS SETUP AND DRAW
// ============================================================================

/**
 * p5.js setup function - initializes canvas and application state
 */
function setup() {
  try {
    createCanvas(windowWidth, windowHeight);

    mindMap = new MindMap();

    // Create CollaborationManager immediately for unified undo system
    // Undo/redo works even without network connection
    if (typeof CollaborationManager !== 'undefined') {
      collaborationManager = new CollaborationManager(mindMap);
      collaborationManager.initialize().catch((e) => {
        console.error('Failed to initialize collaboration manager:', e);
      });
    }

    try {
      if (typeof document !== 'undefined' && mindMap && typeof mindMap.getLastUsedFilename === 'function') {
        let fname = mindMap.getLastUsedFilename() || '';
        fname = fname.split('/').pop().split('\\').pop();
        fname = fname.replace(/\.json$/i, '').trim();
        document.title = fname ? (fname + ' — OpenMind') : 'OpenMind';
      }
    } catch (e) {
      // ignore
    }

    // Listen for URL changes to handle room navigation
    addTrackedEventListener(window, 'hashchange', handleUrlChange);
    addTrackedEventListener(window, 'popstate', handleUrlChange);

    // Check if joining a collaboration room
    const roomInfo = parseRoomFromHash();
    const roomId = roomInfo ? roomInfo.room : null;

    // When joining an online room, do NOT load from legacy storage directly
    // Instead, initialize collaborationManager first to load from IndexedDB
    // Then the room join will sync that data to the room

    // ALWAYS initialize collaborationManager to load from IndexedDB
    // Pass roomId if present in URL so we load the correct room cache immediately
    if (collaborationManager) {
      if (roomId && mindMap && typeof mindMap.setStorageKey === 'function') {
        const initialRoomKey = getRoomStorageKey(roomId);
        mindMap.setStorageKey(initialRoomKey);
        Utils.Logger.state('[Startup] Set initial room storage context:', initialRoomKey);

        // FIX FLICKER: Set syncStatus immediately so the first draw() frame
        // shows the overlay instead of stale local boxes.
        syncStatus = 'connecting';
      }

      (async () => {
        try {
          await collaborationManager.initialize(roomId);

          // One-time migration: if Yjs is empty but localStorage has data, migrate it
          const hasLocalStorage = mindMap.hasLocalStorageData();
          const yjsEmpty = collaborationManager.yboxes && collaborationManager.yboxes.size === 0;

          if (hasLocalStorage && yjsEmpty) {
            console.log('[Migration] Migrating data from localStorage to IndexedDB...');

            // Load from localStorage
            const maybePromise = mindMap.loadFromLocalStorage();
            const afterLoad = async () => {
              try { resetView(); } catch (e) { console.warn('resetView failed:', e); }
              try {
                if (typeof document !== 'undefined' && mindMap && typeof mindMap.getLastUsedFilename === 'function') {
                  let fname = mindMap.getLastUsedFilename() || '';
                  fname = fname.split('/').pop().split('\\').pop();
                  fname = fname.replace(/\.json$/i, '').trim();
                  document.title = fname ? (fname + ' — OpenMind') : 'OpenMind';
                }
              } catch (_) { }

              // Sync to Yjs (which auto-persists to IndexedDB)
              if (mindMap && mindMap.boxes && MindMap.onBoxChange) {
                for (const box of mindMap.boxes) {
                  if (box && box.id) {
                    MindMap.onBoxChange(box);
                  }
                }
              }
              if (mindMap && MindMap.onConnectionsChange) {
                MindMap.onConnectionsChange();
              }

              // Mark that legacy load is complete
              collaborationManager.hasLoadedFromLocalStorage = true;

              // Clear undo history after migration
              collaborationManager.clearUndoHistory();

              console.log('[Migration] Migration complete. Data now persisted in IndexedDB.');

              // If joining a room, proceed with initialization
              if (roomId) {
                const shouldShareLocalData = roomInfo ? roomInfo.isStarting : false;
                initializeCollaboration(roomId, shouldShareLocalData);
              }
            };

            if (maybePromise && typeof maybePromise.then === 'function') {
              maybePromise.then(afterLoad).catch((e) => {
                console.warn('Failed to load from localStorage:', e);
              });
            } else {
              afterLoad();
            }
          } else if (!yjsEmpty) {
            // IndexedDB has data, rebuild mindMap from it
            console.log('[Load] Loading from IndexedDB via Yjs...');
            collaborationManager._rebuildBoxesFromYjs();
            collaborationManager._rebuildConnectionsFromYjs();
            collaborationManager.hasLoadedFromLocalStorage = true;

            if (!roomId) {
              // Offline mode - reset view to show all content
              try { resetView(); } catch (e) { console.warn('resetView failed:', e); }
            }

            // Clear undo history after load (loading old state shouldn't be undoable)
            collaborationManager.clearUndoHistory();

            // If joining a room, proceed with initialization
            if (roomId) {
              const shouldShareLocalData = roomInfo ? roomInfo.isStarting : false;
              initializeCollaboration(roomId, shouldShareLocalData);
            }
          } else {
            // Both empty - create initial example boxes (offline only)
            if (!roomId) {
              console.log('[Load] Fresh start - creating example boxes');
              mindMap.addBox(new TextBox(300, 200, "Idea"));
              mindMap.addBox(new TextBox(500, 300, "Sub Topic"));
              mindMap.addBox(new TextBox(500, 100, "Sub Topic"));
            }
            collaborationManager.hasLoadedFromLocalStorage = true;

            // Clear undo history so creating example boxes isn't undoable
            setTimeout(() => {
              if (collaborationManager && collaborationManager.isInitialized) {
                collaborationManager.clearUndoHistory();
              }
            }, 200);

            // If joining a room (with no local data), proceed with initialization
            if (roomId) {
              const shouldShareLocalData = roomInfo ? roomInfo.isStarting : false;
              initializeCollaboration(roomId, shouldShareLocalData);
            }
          }
        } catch (e) {
          console.warn('Failed to initialize collaboration:', e);
        }
      })();
    } else if (!lastLoadedUrlFile && roomId) {
      // Fallback: collaborationManager doesn't exist but room ID does
      // This shouldn't happen, but handle it gracefully
      Utils.Logger.state('[Load] No collaborationManager - creating and joining room:', roomId);
      const shouldShareLocalData = roomInfo ? roomInfo.isStarting : false;
      initializeCollaboration(roomId, shouldShareLocalData);
    }

    // Initialize Export Manager
    exportManager = new ExportManager();
    exportManager.initialize(window, mindMap, CONFIG);

    // Initialize UI Manager
    uiManager = new UIManager();
    uiManager.initialize(CONFIG, window, mindMap, collaborationManager, {
      onLoadFile: handleFileLoad,
      onImportText: handleTextImport,
      onExportPNG: () => exportManager.exportPNG(),
      onExportPDF: () => exportManager.exportPDF(),
      onExportText: () => exportManager.exportText(),
      onShareSession: shareSession
    });

    // NOTE: With y-indexeddb, Yjs automatically persists to IndexedDB on every change.
    // We still run autosave as a backup mechanism for localStorage export/import compatibility.
    // This ensures users can still manually export their data even if IndexedDB fails.
    startAutosave();

    // Set up page visibility handling to prevent freezing when tab is hidden
    setupVisibilityHandling();

    // Set up mobile navigation overlay (for touch devices)
    setupMobileNavigation();

    // Enable drag-and-drop of image files or image URLs onto the canvas
    try {
      const canvasElt = document.querySelector('canvas');
      if (canvasElt) {
        addTrackedEventListener(canvasElt, 'dragover', (e) => {
          e.preventDefault();
        });
        addTrackedEventListener(canvasElt, 'drop', handleCanvasDrop);
      }
    } catch (e) {
      console.warn('Failed to setup drag/drop handlers:', e);
    }

    // Note: Room joining is now handled within the collaborationManager initialization
    // above, after IndexedDB data is loaded. This ensures local data is available
    // before connecting to a room.
  } catch (e) {
    console.error('Setup failed:', e);
    alert('Failed to initialize application: ' + e.message);
  }
}

// ============================================================================
// UI BUTTON MANAGEMENT
// ============================================================================

/**
 * Creates all UI buttons and file input
 */
/**
 * p5.js draw function - renders the mind map and UI every frame
 */
function draw() {
  background(ColorPalette.toCSS(UI_COLORS.BACKGROUND));
  if (uiManager) {
    // Hide menu buttons when overlays are showing to prevent blocking clicks
    const hasOverlay = roomJoinConfirmation || syncStatus || isMapLoading;
    uiManager.updateMenuVisibility(mouseX, mouseY, { forceHide: hasOverlay });
    // Sync menuIsVisible with uiManager state
    menuIsVisible = uiManager.isMenuVisible();
  }

  if (mindMap) {
    try {
      // Draw scene with camera transform
      push();
      translate(CameraUtils.x, CameraUtils.y);
      scale(CameraUtils.zoom);

      if (isGridVisible) {
        drawGrid();
      }
      mindMap.draw();

      // Draw selection rectangle if selecting multiple boxes
      // Draw selection rectangle if selecting multiple boxes
      if (isSelectingMultiple) {
        drawSelectionRectangle();
      }

      // Draw remote collaboration elements (cursors, selections) if connected
      // Consolidated check to avoid redundant conditionals in draw loop
      const hasActiveCollaboration = collaborationManager && collaborationManager.isConnected;
      if (hasActiveCollaboration) {
        // Update cursor interpolation
        if (collaborationManager.updateCursors) {
          collaborationManager.updateCursors();
        }
        // Draw remote users' cursors (in world space)
        drawRemoteCursors();
      }

      // Extension Bridge Hook: Hot loop (Zero overhead when ExtensionBridge.draw is null)
      if (ExtensionBridge.draw) {
        ExtensionBridge.draw(collaborationManager, mindMap);
      }

      pop();

      // Update our presence (cursor position, selection) if connected - throttled internally
      if (hasActiveCollaboration) {
        updateCollaborationPresence();
      }
    } catch (e) {
      console.error('Error drawing mindmap:', e);
    }



    // Draw save indicator (in screen space, not world space)
    drawSaveIndicator();

    // Update mouse cursor based on hover context
    try {
      updateCursorForHover();
    } catch (e) {
      // Non-fatal
    }
    // Drive fallback key repeat after draw so we don't block rendering
    // Only update when page is visible to avoid issues with background throttling
    if (isPageVisible) {
      try {
        KeyRepeat.update();
      } catch (_) { }
    }
  }

  // Draw loading overlay on top of everything when fetching/loading maps
  if (isMapLoading) {
    const overlay = UI_COLORS.LOADING_OVERLAY;
    const { r, g, b, a } = overlay.bg;
    push();
    // Screen-space overlay
    resetMatrix && resetMatrix();
    noStroke();
    fill(r, g, b, a);
    rect(0, 0, width, height);

    // Loading text
    fill(ColorPalette.toCSS(overlay.text));
    textAlign(CENTER, CENTER);
    textSize(20);
    text('Loading map...', width / 2, height / 2 - 10);

    // Small spinner below the text
    push();
    translate(width / 2, height / 2 + 18);
    rotate(frameCount * 0.08);
    stroke(ColorPalette.toCSS(overlay.spinner));
    strokeWeight(3);
    noFill();
    arc(0, 0, 28, 28, 0, PI * 0.8);
    pop();
    pop();
    cursor('wait');
  }

  // Draw sync overlay when collaboration is connecting/syncing
  if (syncStatus && !isMapLoading) {
    push();
    resetMatrix && resetMatrix();
    noStroke();
    // Semi-transparent overlay - Opaque enough to hide room flicker
    fill(40, 40, 60, 245);
    rect(0, 0, width, height);

    // State-specific messages
    let mainMessage, subMessage;
    let showSpinner = true;
    let showRefreshButton = false;

    if (syncStatus === 'incompatible') {
      mainMessage = 'Update Required';
      const mismatchInfo = collaborationManager && collaborationManager.versionMismatchInfo;
      if (mismatchInfo) {
        subMessage = `Your version (v${mismatchInfo.localVersion}) is incompatible with peers (v${mismatchInfo.peerVersion})`;
      } else {
        subMessage = 'Please refresh to get the latest version';
      }
      showSpinner = false;
      showRefreshButton = true;
    } else if (syncStatus === 'connecting') {
      mainMessage = 'Connecting to server';
      subMessage = 'Establishing WebSocket connection...';
    } else if (syncStatus === 'server_starting') {
      mainMessage = 'Server is starting up';
      subMessage = 'This may take up to a minute on first load...';
    } else if (syncStatus === 'syncing') {
      mainMessage = 'Synchronizing';
      subMessage = 'Receiving mind map content from peers...';
    } else {
      mainMessage = 'Connecting';
      subMessage = 'Preparing collaboration environment...';
    }

    // App name and version at top
    const versionStr = (typeof APP_VERSION !== 'undefined') ? APP_VERSION.toString() : '1.0.0';
    const appName = (typeof APP_NAME !== 'undefined') ? APP_NAME : 'OpenMind';
    fill(120);
    textAlign(CENTER, TOP);
    textSize(11);
    text(`${appName} v${versionStr}`, width / 2, 20);

    // Main message
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(18);
    text(mainMessage, width / 2, height / 2 - 20);

    // Animated dots (only if not incompatible)
    if (showSpinner) {
      const dots = '.'.repeat((Math.floor(frameCount / 20) % 4));
      text(dots, width / 2 + textWidth(mainMessage) / 2 + 5, height / 2 - 20);
    }

    // Subtitle
    textSize(12);
    fill(180);
    text(subMessage, width / 2, height / 2 + 10);

    // Show a "Cancel / Go Back" button if it's taking too long
    // or if the user is stuck on this screen
    const showCancelSync = (syncStatus === 'syncing' || syncStatus === 'server_starting' || syncStatus === 'connecting');
    const cancelSyncButtonY = height / 2 + 80;
    const isOverCancelSync = mouseX >= width / 2 - 60 && mouseX <= width / 2 + 60 &&
      mouseY >= cancelSyncButtonY && mouseY <= cancelSyncButtonY + 30;

    if (showCancelSync) {
      push();
      if (isOverCancelSync) fill(100, 100, 120);
      else fill(70, 70, 90);
      rect(width / 2 - 60, cancelSyncButtonY, 120, 30, 4);
      fill(255);
      textSize(11);
      textAlign(CENTER, CENTER);
      text('Cancel / Go Back', width / 2, cancelSyncButtonY + 15);
      pop();
    }
    if (showSpinner) {
      push();
      translate(width / 2, height / 2 + 45);
      rotate(frameCount * 0.05);
      stroke(100, 180, 255);
      strokeWeight(2);
      noFill();
      arc(0, 0, 24, 24, 0, PI * 0.7);
      pop();
    } else if (showRefreshButton) {
      // Show refresh instruction
      fill(100, 180, 255);
      textSize(14);
      text('Press F5 or ⌘R to refresh', width / 2, height / 2 + 50);
    }

    pop();
  }

  // Draw room join confirmation overlay when user is about to lose local work
  if (roomJoinConfirmation && !syncStatus && !isMapLoading) {
    push();
    resetMatrix && resetMatrix();
    noStroke();

    // Semi-transparent overlay (same as sync overlay)
    fill(40, 40, 60, 180);
    rect(0, 0, width, height);

    // App name and version at top
    const versionStr = (typeof APP_VERSION !== 'undefined') ? APP_VERSION.toString() : '1.0.0';
    const appName = (typeof APP_NAME !== 'undefined') ? APP_NAME : 'OpenMind';
    fill(120);
    textAlign(CENTER, TOP);
    textSize(11);
    text(`${appName} v${versionStr}`, width / 2, 20);

    // Warning icon (⚠️) - this is a critical choice that can lead to data loss
    fill(255, 200, 0);
    textAlign(CENTER, CENTER);
    textSize(32);
    text('⚠️', width / 2, height / 2 - 90);

    // Main message
    fill(255);
    textSize(18);
    text('Joining Collaboration Room', width / 2, height / 2 - 40);

    // Info message
    textSize(13);
    fill(200, 200, 200);
    const boxCount = roomJoinConfirmation.boxCount || 0;
    const boxText = boxCount === 1 ? '1 box' : `${boxCount} boxes`;
    text(`You currently have ${boxText} on screen`, width / 2, height / 2 - 10);

    // Subtitle
    textSize(12);
    fill(180);
    text('Choose how to join this online room', width / 2, height / 2 + 15);

    // Three buttons in a row
    const buttonWidth = 140;
    const buttonHeight = 40;
    const buttonGap = 15;
    const totalWidth = buttonWidth * 3 + buttonGap * 2;
    const syncButtonX = width / 2 - totalWidth / 2;
    const deleteButtonX = syncButtonX + buttonWidth + buttonGap;
    const cancelButtonX = deleteButtonX + buttonWidth + buttonGap;
    const buttonY = height / 2 + 50;

    // Check which button mouse is over
    const isOverSync = mouseX >= syncButtonX && mouseX <= syncButtonX + buttonWidth &&
      mouseY >= buttonY && mouseY <= buttonY + buttonHeight;
    const isOverDelete = mouseX >= deleteButtonX && mouseX <= deleteButtonX + buttonWidth &&
      mouseY >= buttonY && mouseY <= buttonY + buttonHeight;
    const isOverCancel = mouseX >= cancelButtonX && mouseX <= cancelButtonX + buttonWidth &&
      mouseY >= buttonY && mouseY <= buttonY + buttonHeight;

    // Merge button (green)
    if (isOverSync) {
      fill(60, 180, 100); // Hover state
    } else {
      fill(50, 160, 80); // Normal state
    }
    rect(syncButtonX, buttonY, buttonWidth, buttonHeight, 4);
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(13);
    text('Bring Local Work', syncButtonX + buttonWidth / 2, buttonY + buttonHeight / 2);

    // Start Fresh button (red)
    if (isOverDelete) {
      fill(220, 60, 60); // Hover state
    } else {
      fill(200, 40, 40); // Normal state
    }
    rect(deleteButtonX, buttonY, buttonWidth, buttonHeight, 4);
    fill(255);
    text('Join Fresh', deleteButtonX + buttonWidth / 2, buttonY + buttonHeight / 2);

    // Cancel button (gray)
    if (isOverCancel) {
      fill(100, 100, 100); // Hover state
    } else {
      fill(80, 80, 80); // Normal state
    }
    rect(cancelButtonX, buttonY, buttonWidth, buttonHeight, 4);
    fill(255);
    text('Cancel', cancelButtonX + buttonWidth / 2, buttonY + buttonHeight / 2);

    // Helper text
    textSize(11);
    fill(150);
    if (isOverSync) {
      text('Merge current boxes into the room\'s state.', width / 2, buttonY + buttonHeight + 25);
    } else if (isOverDelete) {
      text('Discard current boxes and load the room as it is on the server.', width / 2, buttonY + buttonHeight + 25);
    } else {
      text('Local work is stored separately for each room.', width / 2, buttonY + buttonHeight + 25);
    }

    pop();
  }
}

/**
 * Updates the mouse cursor based on what the user is hovering over.
   * Sets appropriate cursors for resizing, moving, editing, and other interactions.
   */
function updateCursorForHover() {
  // PRIORITY: Check if hovering over room join confirmation buttons
  if (roomJoinConfirmation && !syncStatus && !isMapLoading) {
    const buttonWidth = 140;
    const buttonHeight = 40;
    const buttonGap = 15;
    const totalWidth = buttonWidth * 3 + buttonGap * 2;
    const syncButtonX = width / 2 - totalWidth / 2;
    const deleteButtonX = syncButtonX + buttonWidth + buttonGap;
    const cancelButtonX = deleteButtonX + buttonWidth + buttonGap;
    const buttonY = height / 2 + 50;

    const isOverSync = mouseX >= syncButtonX && mouseX <= syncButtonX + buttonWidth &&
      mouseY >= buttonY && mouseY <= buttonY + buttonHeight;
    const isOverDelete = mouseX >= deleteButtonX && mouseX <= deleteButtonX + buttonWidth &&
      mouseY >= buttonY && mouseY <= buttonY + buttonHeight;
    const isOverCancel = mouseX >= cancelButtonX && mouseX <= cancelButtonX + buttonWidth &&
      mouseY >= buttonY && mouseY <= buttonY + buttonHeight;

    if (isOverSync || isOverDelete || isOverCancel) {
      cursor('pointer');
      return;
    }
  }

  if (!mindMap || !mindMap.boxes) { cursor('default'); return; }
  const validMouse = Number.isFinite(mouseX) && Number.isFinite(mouseY);
  if (!validMouse) { cursor('default'); return; }

  // Respect only the top-most hovered box for hover-driven cursors
  const topHoverBox = mindMap._topHoverBox || mindMap.getTopMostBoxUnderMouse();

  // Panning cursor states (only when spacebar is held)
  const isEditing = mindMap.selectedBox && mindMap.selectedBox.isEditing;
  const hasMulti = mindMap.selectedBoxes && mindMap.selectedBoxes.size > 0;
  const noSelection = !mindMap.selectedBox && !mindMap.selectedConnection && !hasMulti;
  if (mindMap.draggingConnection) { cursor('grabbing'); return; }
  if (CameraUtils.isPanning) { cursor('grabbing'); return; }

  // Don't change cursor on spacebar if thrust mode is active
  // Don't change cursor on spacebar if thrust mode is active
  const thrustModeActive = (ExtensionBridge.draw && ExtensionBridge.draw.active);
  if (!isEditing && !thrustModeActive && keyIsDown(32)) { cursor('grab'); return; }

  // PRIORITY: Arrowhead hover should override connector-dot hover when overlapping
  if (mindMap && mindMap.connections) {
    for (let i = mindMap.connections.length - 1; i >= 0; i--) {
      const conn = mindMap.connections[i];
      if (!conn || !conn.isMouseOverArrowHead) continue;
      try {
        if (conn.isMouseOverArrowHead()) { cursor('alias'); return; }
      } catch (_) { }
    }
  }

  // Check top-most first
  for (let i = mindMap.boxes.length - 1; i >= 0; i--) {
    const box = mindMap.boxes[i];
    if (!box) continue;
    if (!box.isMouseOver()) continue;

    if (topHoverBox && box !== topHoverBox) {
      continue; // ignore underlying boxes for hover cursors
    }

    if (box.isMouseOverResizeHandle && box.isMouseOverResizeHandle()) {
      cursor('nwse-resize');
      return;
    }
    if (box.getConnectorUnderMouse && box.getConnectorUnderMouse()) {
      // Only show crosshair if not over any arrowhead (checked above)
      cursor('crosshair');
      return;
    }
    if (box.isMouseOnEdge && box.isMouseOnEdge()) {
      cursor('move');
      return;
    }
    // Check if hovering over a link (Cmd/Ctrl held shows pointer)
    const isCmd = keyIsDown(91) || keyIsDown(93) || keyIsDown(17);
    if (isCmd && box.isMouseOverLink && box.isMouseOverLink()) {
      cursor('pointer');
      return;
    }
    // Inside center area
    cursor('text');
    return;
  }
  cursor('default');
}

// ============================================================================
// PAGE VISIBILITY HANDLING
// ============================================================================
// Detects when the browser tab is hidden/visible to prevent freezing issues

/**
 * Adds an event listener and tracks it for cleanup
 * @param {Object} target - The event target (document, window, etc.)
 * @param {string} event - The event name
 * @param {Object} [options] - Optional event listener options (e.g. { passive: false })
 */
function addTrackedEventListener(target, event, handler, options) {
  target.addEventListener(event, handler, options);
  eventListeners.push({ target, event, handler, options });
}

/**
 * Sets up page visibility event listeners to handle background/foreground transitions
 */
function setupVisibilityHandling() {
  const hasStandardVisibility = typeof document.hidden !== 'undefined';
  const hasWebkitVisibility = typeof document.webkitHidden !== 'undefined';
  // Use the Page Visibility API to detect when tab is hidden/visible
  // Note: Some browsers support both standard and webkit, so we listen to both
  // but use a flag to prevent duplicate handling. The same handler works for both
  // because it checks which API is available at runtime (standard first, then webkit).
  if (hasStandardVisibility) {
    addTrackedEventListener(document, 'visibilitychange', handleVisibilityChange);
  }
  if (hasWebkitVisibility) {
    addTrackedEventListener(document, 'webkitvisibilitychange', handleVisibilityChange);
  }

  // Only use window blur/focus as fallback if no Page Visibility API is available
  const hasAnyVisibilityAPI = hasStandardVisibility || hasWebkitVisibility;
  if (!hasAnyVisibilityAPI) {
    addTrackedEventListener(window, 'blur', handleWindowBlur);
    addTrackedEventListener(window, 'focus', handleWindowFocus);
  }

  // Set initial state (check both standard and webkit-prefixed properties)
  // Use the available API to determine initial visibility
  if (hasStandardVisibility) {
    isPageVisible = !document.hidden;
  } else if (hasWebkitVisibility) {
    isPageVisible = !document.webkitHidden;
  } else {
    isPageVisible = true; // Default to visible if no API available
  }

  // Clipboard integration: handle native copy/cut/paste so OS and dictation tools work
  // Listen on document to catch events even when canvas has focus
  addTrackedEventListener(document, 'paste', handleNativePaste);
  addTrackedEventListener(document, 'copy', handleNativeCopy);
  addTrackedEventListener(document, 'cut', handleNativeCut);
}



/**
 * Handles visibility change events from the Page Visibility API
 */
function handleVisibilityChange() {
  // Prevent duplicate handling if both standard and webkit events fire
  // Use a timestamp-based debounce instead of a flag to handle rapid changes better
  const now = Date.now();
  if (visibilityChangeInProgress && (now - visibilityChangeInProgress) < CONFIG.VISIBILITY.DEBOUNCE_MS) {
    return;
  }
  visibilityChangeInProgress = now;

  // Check visibility using the available API
  let isHidden = false;
  if (typeof document.hidden !== 'undefined') {
    isHidden = document.hidden;
  } else if (typeof document.webkitHidden !== 'undefined') {
    isHidden = document.webkitHidden;
  }

  if (isHidden) {
    // Page is now hidden
    isPageVisible = false;
    wasPageHidden = true;
    handlePageBecameHidden();
  } else {
    // Page is now visible - trigger recovery immediately
    isPageVisible = true;
    if (wasPageHidden) {
      handlePageBecameVisible();
      wasPageHidden = false;
    }
  }
}

// ============================================================================
// CLIPBOARD HANDLERS (native events)
// ============================================================================

function handleNativePaste(e) {
  try {
    if (!mindMap || !mindMap.selectedBox || !mindMap.selectedBox.isEditing) return;
    let data = e && e.clipboardData ? e.clipboardData.getData('text/plain') : null;
    const doPaste = (text) => {
      if (!text) return;
      mindMap.isSaved = false; // Mark as unsaved
      // If a stray 'v' character was inserted just before paste, remove it deterministically
      try {
        const box = mindMap.selectedBox;
        const hasSelection = (box.selectionStart !== -1 && box.selectionEnd !== -1 && box.selectionStart !== box.selectionEnd);
        if (!hasSelection && box.cursorPosition > 0 && box.text && (box.text[box.cursorPosition - 1] === 'v' || box.text[box.cursorPosition - 1] === 'V')) {
          box.removeChar();
        }
      } catch (_) { }
      mindMap.selectedBox.pasteText(text);
      // Prevent the browser from attempting to paste into a non-editable canvas
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
    };

    if (data && data.length > 0) {
      doPaste(data);
    } else if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
      // Fallback for browsers that don't populate event.clipboardData
      navigator.clipboard.readText().then(txt => doPaste(txt)).catch(() => {
        // As a last resort, do nothing and allow default (though canvas has no default target)
      });
    }
  } catch (_) { }
}

function handleNativeCopy(e) {
  try {
    if (!mindMap || !mindMap.selectedBox || !mindMap.selectedBox.isEditing) return;
    const text = mindMap.selectedBox.getSelectedText ? mindMap.selectedBox.getSelectedText() : '';
    if (text && e && e.clipboardData && typeof e.clipboardData.setData === 'function') {
      e.clipboardData.setData('text/plain', text);
      if (typeof e.preventDefault === 'function') e.preventDefault();
    }
  } catch (_) { }
}

// ============================================================================
// IMAGE UTILITIES (delegated to ImageUtils.js module)
// ============================================================================

/**
 * Compress and downscale an image File to a DataURL.
 * @see ImageUtils.compressImageFile for full documentation
 */
async function compressImageFile(file, options = {}) {
  if (typeof ImageUtils !== 'undefined' && ImageUtils.compressImageFile) {
    return ImageUtils.compressImageFile(file, options);
  }
  throw new Error('ImageUtils module not loaded');
}

/**
 * Convert a data: URL to a downscaled WebP data URL.
 * @see ImageUtils.convertDataUrlToWebP for full documentation
 */
async function convertDataUrlToWebP(dataUrl, options = {}) {
  if (typeof ImageUtils !== 'undefined' && ImageUtils.convertDataUrlToWebP) {
    return ImageUtils.convertDataUrlToWebP(dataUrl, options);
  }
  throw new Error('ImageUtils module not loaded');
}

function handleNativeCut(e) {
  try {
    if (!mindMap || !mindMap.selectedBox || !mindMap.selectedBox.isEditing) return;
    const text = mindMap.selectedBox.getSelectedText ? mindMap.selectedBox.getSelectedText() : '';
    if (text && e && e.clipboardData && typeof e.clipboardData.setData === 'function') {
      e.clipboardData.setData('text/plain', text);
      if (typeof e.preventDefault === 'function') e.preventDefault();
      mindMap.isSaved = false; // Mark as unsaved
      if (typeof mindMap.selectedBox.deleteSelection === 'function') mindMap.selectedBox.deleteSelection();
    }
  } catch (_) { }
}

/**
 * Handles window blur events (backup for visibility API)
 */
function handleWindowBlur() {
  wasPageHidden = true;
  isPageVisible = false;
  handlePageBecameHidden();
}

/**
 * Handles window focus events (backup for visibility API)
 */
function handleWindowFocus() {
  isPageVisible = true;
  if (wasPageHidden) {
    handlePageBecameVisible();
    wasPageHidden = false;
  }
}

/**
 * Called when the page becomes hidden - pause non-essential operations
 */
function handlePageBecameHidden() {
  try {
    // Stop key repeat to avoid stuck states
    KeyRepeat.reset();

    // Save current state to localStorage before going to background
    if (mindMap && !mindMap.isSaved) {
      mindMap.saveToLocalStorage();
    }
  } catch (e) {
    console.error('Error handling page hidden:', e);
  }
}

/**
 * Called when the page becomes visible again - resume operations and reset state
 */
function handlePageBecameVisible() {
  try {
    // Reset key repeat state to clear any stuck keys
    try {
      KeyRepeat.reset();
    } catch (e) {
      console.error('Failed to reset key repeat:', e);
    }

    // Reset any drag/pan states that might be stuck
    // Reset any drag/pan states that might be stuck
    CameraUtils.endPan();
    isSelectingMultiple = false;

    // Reset interaction states in mindMap
    if (mindMap) {
      if (mindMap.draggingConnection) {
        mindMap.draggingConnection = null;
      }

      // Reset any box states
      // Note: Check for null boxes as array may contain nulls during deletion/modification
      if (mindMap.boxes) {
        mindMap.boxes.forEach(box => {
          if (box) {
            box.isDragging = false;
            box.isResizing = false;
            box.isSelecting = false;
          }
        });
      }
    }

    // Force a redraw
    if (typeof redraw === 'function') {
      try {
        redraw();
      } catch (e) {
        console.error('Failed to redraw:', e);
      }
    }
  } catch (e) {
    console.error('Error handling page visible:', e);
  }
}

// ============================================================================
// MOBILE NAVIGATION (delegated to MobileNavigation.js module)
// ============================================================================

// Note: Mobile navigation functions are now in MobileNavigation.js
// These wrapper functions ensure backwards compatibility with existing code

// detectTouchDevice, setupMobileNavigation, applyButtonStyles,
// setupMobileNavButtonEvents, updateMobileNavPosition, 
// showMobileNavOverlay, hideMobileNavOverlay
// are all defined in MobileNavigation.js and available globally

// ============================================================================
// MOUSE AND KEYBOARD INPUT HANDLERS
// ============================================================================

/**
 * Handles mouse press events
 */
function mousePressed(e) {
  if (uiManager && uiManager.isKeyboardOverlayVisible()) return false;

  // Ignore clicks on UI elements (buttons, inputs, etc.)
  // Only handle clicks directly on the canvas
  if (e && e.target && e.target.tagName !== 'CANVAS') {
    return;
  }

  // FIX: Hide menu when clicking on the background (canvas)
  // This handles the case where user clicks away from username input or just wants to dismiss menu
  if (uiManager && uiManager.isMenuVisible()) {
    uiManager.hideButtons();
    // Force blur on any active input to ensure state is saved
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
      document.activeElement.blur();
    }
  }

  // PRIORITY: Handle room join confirmation dialog before anything else
  if (roomJoinConfirmation && !syncStatus && !isMapLoading) {
    // Check if click is on any of the three buttons
    const buttonWidth = 140;
    const buttonHeight = 40;
    const buttonGap = 15;
    const totalWidth = buttonWidth * 3 + buttonGap * 2;
    const syncButtonX = width / 2 - totalWidth / 2;
    const deleteButtonX = syncButtonX + buttonWidth + buttonGap;
    const cancelButtonX = deleteButtonX + buttonWidth + buttonGap;
    const buttonY = height / 2 + 50;

    const clickedSync = mouseX >= syncButtonX && mouseX <= syncButtonX + buttonWidth &&
      mouseY >= buttonY && mouseY <= buttonY + buttonHeight;
    const clickedDelete = mouseX >= deleteButtonX && mouseX <= deleteButtonX + buttonWidth &&
      mouseY >= buttonY && mouseY <= buttonY + buttonHeight;
    const clickedCancel = mouseX >= cancelButtonX && mouseX <= cancelButtonX + buttonWidth &&
      mouseY >= buttonY && mouseY <= buttonY + buttonHeight;

    if (clickedSync) {
      // User chose to synchronise local data with room
      Utils.Logger.state('[Room] User chose to synchronise data with room');

      const { roomName } = roomJoinConfirmation;
      roomJoinConfirmation = null; // Clear confirmation dialog

      // FIX ISSUE #3: Show progress indicator immediately
      syncStatus = 'syncing';

      // FIX CRITICAL ISSUE #1 & #2: Proceed with connection using user's choice
      // Data is NOT cleared - it will be merged via Yjs CRDT
      try {
        _proceedWithRoomJoin(roomName, 'sync').catch(error => {
          console.error('[Room] Failed to join room:', error);
          syncStatus = null;
        });
      } catch (error) {
        console.error('[Room] Error proceeding with room join:', error);
        syncStatus = null;
      }
      return;

    } else if (clickedDelete) {
      // User chose to join fresh (load from room, ignore current state)
      Utils.Logger.state('[Room] User chose to join fresh');

      const { roomName } = roomJoinConfirmation;
      roomJoinConfirmation = null; // Clear confirmation dialog

      // Show progress indicator immediately
      syncStatus = 'connecting';

      // Use a background task to avoid blocking the UI thread
      (async () => {
        try {
          await _proceedWithRoomJoin(roomName, 'delete');
        } catch (error) {
          console.error('[Room] Failed to join room fresh:', error);
          syncStatus = null;
        }
      })();
      return;

    } else if (clickedCancel) {
      // User chose to cancel - preserve local data
      Utils.Logger.state('[Room] User cancelled joining room');

      roomJoinConfirmation = null; // Clear confirmation dialog

      // FIX CRITICAL ISSUE #2: Don't navigate away - just cancel the dialog
      // This preserves local data instead of potentially losing it
      // Just clear the hash to stay on current page with local data intact
      if (typeof window !== 'undefined') {
        window.location.hash = '';
      }
      return;
    }
  }

  // Handle interaction for the sync overlay buttons (e.g. Cancel / Go Back)
  if (syncStatus) {
    const cancelSyncButtonY = height / 2 + 80;
    const isOverCancelSync = mouseX >= width / 2 - 60 && mouseX <= width / 2 + 60 &&
      mouseY >= cancelSyncButtonY && mouseY <= cancelSyncButtonY + 30;

    if (isOverCancelSync) {
      Utils.Logger.state('[Sync] User cancelled connection overlay');
      if (collaborationManager) {
        collaborationManager.disconnect();
      }
      syncStatus = null;
      // Also clear the hash to prevent auto-reconnect
      if (typeof window !== 'undefined') window.location.hash = '';

      // Update UI buttons after disconnection
      if (uiManager && typeof uiManager.updateCollaborationState === 'function') {
        uiManager.updateCollaborationState();
      }
      return;
    }
    return;
  }

  if (mindMap) {
    try {
      const isEditing = mindMap.selectedBox && mindMap.selectedBox.isEditing;
      const hasMulti = mindMap.selectedBoxes && mindMap.selectedBoxes.size > 0;
      const noSelection = !mindMap.selectedBox && !mindMap.selectedConnection && !hasMulti;
      const spaceHeld = keyIsDown(32);
      const overAny = isOverAnyInteractive();
      const rightDown = (typeof mouseButton !== 'undefined' && mouseButton === RIGHT);

      // Panning with spacebar OR right mouse when nothing is selected
      // Panning with spacebar OR right mouse when nothing is selected
      if ((spaceHeld && !isEditing) || (rightDown && noSelection && !isEditing)) {
        CameraUtils.startPan(mouseX, mouseY, !!rightDown);
        return false;
      }

      // Multi-box selection when clicking in empty space with no box selected.
      // Check for clusters first — if a cluster is under the cursor the user
      // wants to select it, not start a rubber-band rectangle.
      if (noSelection && !isEditing && !overAny) {
        const cursorWorldX = worldMouseX();
        const cursorWorldY = worldMouseY();
        const overCluster = mindMap.clusters && mindMap.clusters.length > 0 &&
          mindMap.clusters.some(c => c && c.contains(cursorWorldX, cursorWorldY));
        if (overCluster) {
          mindMap.handleMousePressed();
          return false;
        }
        // Clicked in empty space — deselect any cluster that was selected
        if (mindMap.selectedCluster) {
          mindMap.selectedCluster.selected = false;
          mindMap.selectedCluster = null;
        }
        isSelectingMultiple = true;
        selectionStartX = cursorWorldX;
        selectionStartY = cursorWorldY;
        selectionCurrentX = selectionStartX;
        selectionCurrentY = selectionStartY;
        return false;
      }

      mindMap.handleMousePressed();
    } catch (e) {
      console.error('Error handling mouse press:', e);
    }
  }
}

/**
 * Handles mouse release events
 */
function mouseReleased() {
  if (uiManager && uiManager.isKeyboardOverlayVisible()) return false;

  if (CameraUtils.isPanning) {
    // If we were panning with right mouse, suppress the subsequent right-click action if it moved
    if (CameraUtils.rightPanActive) {
      const dx = mouseX - CameraUtils.panStartMouseX;
      const dy = mouseY - CameraUtils.panStartMouseY;
      if (dx * dx + dy * dy > 9) { // >3px movement
        CameraUtils.suppressNextRightClick = true;
      }
    }
    CameraUtils.endPan();
    return;
  }

  if (isSelectingMultiple) {
    // Complete multi-box selection
    completeMultiBoxSelection();
    isSelectingMultiple = false;
    return;
  }

  if (mindMap) {
    try {
      mindMap.handleMouseReleased();
    } catch (e) {
      console.error('Error handling mouse release:', e);
    }
  }
}

/**
 * Handles mouse drag events
 */
function mouseDragged() {
  if (uiManager && uiManager.isKeyboardOverlayVisible()) return false;

  if (CameraUtils.isPanning) {
    // Screen-space pan with soft limits
    CameraUtils.updatePan(mouseX, mouseY);
    applyCameraSoftBounds();
    return false;
  }

  if (isSelectingMultiple) {
    // Update selection rectangle current corner
    selectionCurrentX = worldMouseX();
    selectionCurrentY = worldMouseY();
    return false;
  }

  if (mindMap) {
    try {
      mindMap.handleMouseDragged();
    } catch (e) {
      console.error('Error handling mouse drag:', e);
    }
  }
}

const alignmentShortcuts = {
  a: { align: 'leftAlignSelectedBoxes', distribute: 'distributeSelectedBoxesVertically' },
  d: { align: 'rightAlignSelectedBoxes', distribute: 'distributeSelectedBoxesVertically' },
  w: { align: 'topAlignSelectedBoxes', distribute: 'distributeSelectedBoxesHorizontally' },
  s: { align: 'bottomAlignSelectedBoxes', distribute: 'distributeSelectedBoxesHorizontally' },
  q: { align: 'horizontalCenterAlignSelectedBoxes', distribute: 'distributeSelectedBoxesHorizontally' },
  e: { align: 'centerAlignSelectedBoxes', distribute: 'distributeSelectedBoxesVertically' }
};

const nonEditingShortcuts = [
  { keys: ['n'], action: () => createNewBox() },
  { keys: ['g'], action: () => toggleGridVisibility() },
  { keys: ['-', '_'], keyCodes: [36], action: () => resetView() },
  { keys: ['=', '+'], action: () => setMaxZoom() }
];

function handleNonEditingShortcut(keyChar, keyCode, hasModifier) {
  if (hasModifier) return false;
  const lower = keyChar ? keyChar.toLowerCase() : '';

  for (const entry of nonEditingShortcuts) {
    const matchesKey = lower && entry.keys && entry.keys.includes(lower);
    const matchesCode = entry.keyCodes && entry.keyCodes.includes(keyCode);
    if (!matchesKey && !matchesCode) continue;

    if (typeof entry.action === 'function') {
      entry.action();
      return true;
    }
  }
  return false;
}

function handleAlignmentShortcut(keyChar, mindMapInstance, hasModifier, collabManager) {
  if (!keyChar || typeof keyChar !== 'string') return false;

  const entry = alignmentShortcuts[keyChar.toLowerCase()];
  if (!entry || hasModifier) return false;

  if (!mindMapInstance || !mindMapInstance.selectedBoxes || mindMapInstance.selectedBoxes.size === 0) return false;

  const alignFn = mindMapInstance[entry.align];
  if (!alignFn) return false;

  const distributeFn = mindMapInstance[entry.distribute];
  const shouldDistribute = keyIsDown(16) && distributeFn;

  if (shouldDistribute && collabManager) {
    collabManager.transact(() => {
      alignFn.call(mindMapInstance);
      distributeFn.call(mindMapInstance);
    });
  } else {
    alignFn.call(mindMapInstance);
  }
  return true;
}

/**
 * Handles key press events
 */
function keyPressed() {
  // Treat Cmd (meta) and Ctrl the same for shortcuts so macOS users can use Cmd+Z/C/V/etc.
  const isCtrl =
    keyIsDown(17) || // Ctrl (Windows/Linux)
    (typeof CONTROL !== 'undefined' && keyIsDown(CONTROL)) ||
    keyIsDown(91) || // Meta left (macOS)
    keyIsDown(93) || // Meta right (some layouts)
    keyIsDown(157) || // Alternative meta code
    (typeof META !== 'undefined' && keyIsDown(META)) ||
    (typeof keyEvent !== 'undefined' && keyEvent && keyEvent.metaKey);

  // PRIORITY: Handle Easter egg thrust game toggle (Ctrl+T)
  if ((key === 't' || key === 'T') && isCtrl) {
    if (typeof ThrustGame === 'undefined') {
      ExtensionBridge.load('ThrustGame', 'src/ThrustGame.js', () => {
        // Toggle the game once loaded
        if (typeof ThrustGame !== 'undefined') {
          ThrustGame.handleInput(key, keyCode, mindMap, { isCtrl });
        }
      });
      return false;
    }
  }

  // Route to Extension Bridge (Ghost Plugin hook)
  try {
    if (ExtensionBridge.handleInput && ExtensionBridge.handleInput(key, keyCode, mindMap, { isCtrl })) {
      return false; // Prevent default and stop propagation
    }
  } catch (e) {
    console.error('Error in ExtensionBridge.handleInput:', e);
  }

  // PRIORITY: Handle room join confirmation dialog keyboard shortcuts
  if (roomJoinConfirmation && !syncStatus && !isMapLoading) {
    // S = Synchronise Data
    if (key === 's' || key === 'S') {
      Utils.Logger.state('[Room] User pressed S - synchronising data with room');

      const { roomName } = roomJoinConfirmation;
      roomJoinConfirmation = null;

      // FIX ISSUE #3: Show progress indicator immediately
      syncStatus = 'syncing';

      try {
        _proceedWithRoomJoin(roomName, 'sync').catch(error => {
          console.error('[Room] Failed to join room:', error);
          syncStatus = null;
        });
      } catch (error) {
        console.error('[Room] Error proceeding with room join:', error);
        syncStatus = null;
      }
      return false;
    }

    // D = Delete Local Data
    if (key === 'd' || key === 'D') {
      Utils.Logger.state('[Room] User pressed D - deleting local data');

      const { roomName } = roomJoinConfirmation;
      roomJoinConfirmation = null;

      // FIX ISSUE #3: Show progress indicator immediately
      syncStatus = 'syncing';

      try {
        // CRITICAL FIX: Clear IndexedDB before proceeding
        // Otherwise old IndexedDB data will reload and sync to room
        (async () => {
          try {
            // Clear local mindMap state
            _clearLocalState();

            // Clear IndexedDB to prevent old data from reloading
            if (collaborationManager) {
              await collaborationManager.clearIndexedDB();
            }

            // Now proceed to join room (will load from room, not from IndexedDB)
            await _proceedWithRoomJoin(roomName, 'delete');
          } catch (error) {
            console.error('[Room] Failed to clear data and join room:', error);
            syncStatus = null;
          }
        })();
      } catch (error) {
        console.error('[Room] Error clearing local data:', error);
        syncStatus = null;
      }
      return false;
    }

    // C or Escape = Cancel - preserve local data
    if (key === 'c' || key === 'C' || keyCode === ESCAPE) {
      Utils.Logger.state('[Room] User pressed Cancel - preserving local data');
      roomJoinConfirmation = null;

      // Just clear the hash to stay on current page
      if (typeof window !== 'undefined') {
        window.location.hash = '';
      }
      return false;
    }
  }

  if (uiManager && uiManager.isKeyboardOverlayVisible()) {
    const escapeCode = (typeof ESCAPE !== 'undefined') ? ESCAPE : 27;
    if (keyCode === escapeCode || key === 'Escape') {
      uiManager.hideKeyboardOverlay();
    }
    return false;
  }
  if (mindMap) {
    try {
      // Handle CMD/CTRL modifier key
      const isCmd = isCtrl;
      const isEditing = mindMap.selectedBox && mindMap.selectedBox.isEditing;

      // When editing text, rely on native clipboard events for C/X/V to avoid duplicates.
      // Do NOT preventDefault here so the browser dispatches the paste/copy/cut events.
      if (isEditing && isCmd && (key === 'c' || key === 'C' || key === 'x' || key === 'X' || key === 'v' || key === 'V')) {
        return; // let native clipboard event fire; do not cancel keydown
      }

      // While editing, still handle Cmd/Ctrl+A for select-all ourselves
      if (isEditing && isCmd && (key === 'a' || key === 'A')) {
        if (typeof mindMap.handleKeyPressed === 'function') {
          mindMap.handleKeyPressed(key, keyCode);
        }
        return false; // prevent page-level select-all
      }

      // Handle CMD/CTRL+SHIFT+Z or CMD/CTRL+Y for redo (check BEFORE undo!)
      const isShift = keyIsDown(16);
      if ((isCmd && (key === 'z' || key === 'Z') && isShift) || (isCmd && (key === 'y' || key === 'Y'))) {
        // Always use collaborationManager for redo (unified undo system)
        if (collaborationManager) {
          if (collaborationManager.canRedo && collaborationManager.canRedo()) {
            collaborationManager.redo();
          }
        }
        return false; // prevent browser redo
      }

      // Handle CMD/CTRL+Z for undo at the top level (only when Shift is NOT pressed)
      if (isCmd && (key === 'z' || key === 'Z') && !isShift) {
        // Always use collaborationManager for undo (unified undo system)
        if (collaborationManager) {
          if (collaborationManager.canUndo && collaborationManager.canUndo()) {
            collaborationManager.undo();
          }
        }
        return false; // prevent browser undo
      }

      // Handle CMD/CTRL+S for save
      if (isCmd && (key === 's' || key === 'S')) {
        mindMap.save();
        return false; // prevent browser save dialog
      }

      // Handle CMD/CTRL+L for load
      if (isCmd && (key === 'l' || key === 'L')) {
        triggerFileLoad();
        return false; // prevent browser default
      }

      // Handle CMD/CTRL+G for cluster creation (group selected boxes)
      if (isCmd && (key === 'g' || key === 'G') && !isEditing) {
        if (mindMap.selectedBoxes && mindMap.selectedBoxes.size >= 2) {
          const boxes = Array.from(mindMap.selectedBoxes);
          mindMap.addCluster(boxes);
        }
        return false;
      }

      // Handle F key for fullscreen toggle (only when not editing)
      if (!isEditing && !isCmd && (key === 'f' || key === 'F')) {
        toggleFullScreen();
        return false;
      }

      // Space handling: if not editing, always prevent default, and still allow MindMap to react (e.g., reverse connection)
      if ((key === ' ' || keyCode === 32) && !isEditing) {
        // Route to MindMap first (may reverse a selected connection)
        mindMap.handleKeyPressed(key, keyCode);
        // Prevent page scroll regardless (space is used for panning and shortcuts)
        return false;
      }
      // All other keys
      mindMap.handleKeyPressed(key, keyCode);
    } catch (e) {
      console.error('Error handling key press:', e);
    }
  }
  // Track native keydowns for deletion keys to coordinate with fallback repeat
  KeyRepeat.noteNativeKeydown(keyCode);
  // Start fallback repeat tracking for deletion keys
  KeyRepeat.start(keyCode);

  // Prevent default behavior for backspace
  if (keyCode === BACKSPACE) {
    return false;
  }
  // Prevent default behavior for forward delete
  if (keyCode === DELETE) {
    return false;
  }

  // Prevent default behavior for arrow keys when editing
  if (mindMap && mindMap.selectedBox && mindMap.selectedBox.isEditing) {
    if (keyCode === LEFT_ARROW || keyCode === RIGHT_ARROW ||
      keyCode === UP_ARROW || keyCode === DOWN_ARROW) {
      return false;
    }
  }

  // Prevent default behavior for arrow keys when navigating between boxes
  if (mindMap && (!mindMap.selectedBox || !mindMap.selectedBox.isEditing)) {
    if (keyCode === LEFT_ARROW || keyCode === RIGHT_ARROW ||
      keyCode === UP_ARROW || keyCode === DOWN_ARROW) {
      return false;
    }
  }

  // Prevent default behavior for some CMD/CTRL keys when appropriate.
  if ((keyIsDown(91) || keyIsDown(93) || keyIsDown(17))) {
    const editing = mindMap && mindMap.selectedBox && mindMap.selectedBox.isEditing;
    if (editing) {
      // When editing, do NOT block C/X/V so native clipboard events can fire.
      // We already handled A above. Block Z/S/L which we handle explicitly.
      if (key === 'z' || key === 'Z' || key === 's' || key === 'S' || key === 'l' || key === 'L') {
        return false;
      }
    } else {
      // When not editing, block common shortcuts we handle ourselves
      if (key === 'a' || key === 'A' || key === 'c' || key === 'C' || key === 'v' || key === 'V' || key === 'x' || key === 'X' || key === 'z' || key === 'Z' || key === 's' || key === 'S' || key === 'l' || key === 'L') {
        return false;
      }
    }
  }

  // Global shortcut: N key to create a new box when not editing text
  if (mindMap && (!mindMap.selectedBox || !mindMap.selectedBox.isEditing)) {
    const hasModifier = keyIsDown(91) || keyIsDown(93) || keyIsDown(17) || keyIsDown(18); // CMD/CTRL/ALT
    if (handleNonEditingShortcut(key, keyCode, hasModifier)) {
      return false;
    }
    // Helper to check if collaborationManager is available
    const hasCollabManager = typeof collaborationManager !== 'undefined' && collaborationManager;

    if (handleAlignmentShortcut(key, mindMap, hasModifier, hasCollabManager)) {
      return false;
    }
    // Hierarchical layout in place: press R key
    if (!hasModifier && (key === 'r' || key === 'R')) {
      if (mindMap.selectedBoxes && mindMap.selectedBoxes.size > 0 && mindMap.hierarchicalLayout) {
        mindMap.hierarchicalLayout();
      }
      return false;
    }
  }
}

/**
 * Handles key release events
 */
function keyReleased() {
  // Route to Extension Bridge (Ghost Plugin hook)
  try {
    if (ExtensionBridge.handleKeyReleased && ExtensionBridge.handleKeyReleased(keyCode)) {
      return false;
    }
  } catch (e) {
    console.error('Error in ExtensionBridge.handleKeyReleased:', e);
  }

  // Stop fallback repeat on key release
  KeyRepeat.stop(keyCode);
}

// Ensure repeats stop if the window loses focus (redundant with visibility handling but kept as extra safeguard)
if (typeof window !== 'undefined') {
  const handleWindowBlurForKeyRepeat = () => {
    try { KeyRepeat.reset(); } catch (_) { }
  };
  addTrackedEventListener(window, 'blur', handleWindowBlurForKeyRepeat);
}

// Note: Right-click no longer triggers any connection action; context menu is prevented below.

// Prevent default context menu
const preventContextMenu = (event) => event.preventDefault();
addTrackedEventListener(document, 'contextmenu', preventContextMenu);

// Fallback mouseup listener on the document.
// p5.js binds mouseReleased to the canvas element, so when the user presses
// on the canvas and releases over an HTML overlay (e.g. a menu button), the
// canvas never receives the mouseup.  This leaves isDragging / isSelectingMultiple
// in a stuck state that prevents normal interaction until the page is refreshed.
// Listening at the document level catches those missed releases and resets state.
addTrackedEventListener(document, 'mouseup', function _fallbackMouseUp(e) {
  // Only act when the release was NOT on the canvas – those are already handled
  // by p5.js's own mouseReleased callback.
  if (e && e.target && e.target.tagName === 'CANVAS') return;

  // Cancel any in-progress rubber-band selection
  if (isSelectingMultiple) {
    isSelectingMultiple = false;
  }

  // End any in-progress pan
  if (CameraUtils && CameraUtils.isPanning) {
    CameraUtils.endPan();
  }

  // Stop any boxes that are stuck in drag / resize state.
  // Silently ignore errors here: this is a best-effort cleanup path for
  // mouse-release events that missed the canvas, so individual failures
  // should not surface as user-visible errors.
  if (mindMap) {
    try {
      mindMap.handleMouseReleased();
    } catch (err) {
      console.warn('[fallbackMouseUp] handleMouseReleased error:', err);
    }
  }
});

/**
 * Creates a new text box at the cursor position or viewport center.
 * If cursor is over the canvas, box is created at mouse position.
 * Otherwise, box is created at the center of the visible viewport.
 */
function createNewBox() {
  // Ensure mindMap exists
  if (!mindMap) {
    console.error('MindMap not initialized');
    return;
  }

  // Create box at cursor position in world space if over canvas, else at viewport center
  let x, y;

  if (mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height) {
    // Mouse is over canvas (in screen space) - use world position
    x = worldMouseX();
    y = worldMouseY();
  } else {
    // Mouse not over canvas - create at center of current viewport in world space
    // Convert viewport center to world coords
    x = (width / 2 - CameraUtils.x) / CameraUtils.zoom;
    y = (height / 2 - CameraUtils.y) / CameraUtils.zoom;
  }

  mindMap.addBox(new TextBox(x, y, ""));
}

/**
 * Triggers the hidden file input to open a file selection dialog.
 * Used when the Load button is clicked.
 */
function triggerFileLoad() {
  // Trigger the hidden file input
  try {
    if (fileInput && fileInput.elt && typeof fileInput.elt.click === 'function') {
      fileInput.elt.click();
    } else if (fileInput && typeof fileInput.elt === 'undefined' && typeof fileInput.click === 'function') {
      // p5.Element fallback
      fileInput.click();
    } else {
      console.warn('File input not available to trigger file load');
    }
  } catch (e) {
    console.warn('Failed to trigger file input:', e);
  }
}

/**
 * Handles loading a mind map from a selected JSON file.
 * Validates the file type and content before loading.
 * @param {Object} file - p5.js file object with data and metadata
 */
async function handleFileLoad(file) {
  if (!file) {
    console.error('No file provided');
    alert('Please select a valid file');
    return;
  }

  // Validate file type
  if (!file.type.includes('application') && !file.name.endsWith('.json')) {
    console.error('Invalid file type:', file.type);
    alert('Please load a JSON file');
    return;
  }

  // Show loading overlay while processing the file
  isMapLoading = true;
  try {
    // Validate file.data exists
    if (!file.data) {
      throw new Error('File data is empty or invalid');
    }

    // If data is a string, try to parse it
    let data = file.data;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (e) {
        throw new Error('Failed to parse JSON: ' + e.message);
      }
    }

    // Validate data structure
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid JSON structure');
    }

    if (!data.boxes || !Array.isArray(data.boxes)) {
      throw new Error('Missing or invalid boxes data');
    }

    // Load the mindMap; MindMap.load may perform async image conversions
    if (mindMap && typeof mindMap.load === 'function') {
      try {
        await mindMap.load(data);
        Utils.Logger.state('[File] Loaded map from file successfully');

        // CRITICAL: If in a collaborative room, REPLACE room state with loaded file
        // Clear Yjs first to avoid duplicates, then sync the loaded file
        if (collaborationManager && collaborationManager.isConnected) {
          Utils.Logger.state('[File] In collaborative room - replacing room state with loaded file');
          Utils.Logger.state('[File] - Clearing old room state...');

          // Clear all Yjs state first to prevent duplicates
          try {
            if (collaborationManager.yboxes && collaborationManager.yconnections) {
              const oldBoxCount = collaborationManager.yboxes.size;
              const oldConnCount = collaborationManager.yconnections.length;

              // Clear boxes (Map has clear method)
              collaborationManager.yboxes.clear();

              // Clear connections (Array - delete all items)
              collaborationManager.yconnections.delete(0, collaborationManager.yconnections.length);

              Utils.Logger.state('[File] - Cleared', oldBoxCount, 'old boxes and', oldConnCount, 'old connections');
            }
          } catch (e) {
            console.error('Error clearing Yjs state:', e);
            // Continue anyway - worst case is duplicates
          }

          Utils.Logger.state('[File] - Syncing', mindMap.boxes.length, 'boxes from loaded file...');

          // Now sync the loaded file to Yjs
          try {
            if (typeof collaborationManager._syncLocalToYjs === 'function') {
              collaborationManager._syncLocalToYjs();
              Utils.Logger.state('[File] ✅ File state now in Yjs - room replaced with loaded file');
            }
          } catch (e) {
            console.error('Error syncing loaded file to Yjs:', e);
          }
        }

        resetView();

        // Clear undo history after loading file to prevent undo from reverting the load
        if (typeof collaborationManager !== 'undefined' && collaborationManager) {
          try {
            collaborationManager.clearUndoHistory();
            Utils.Logger.state('[File] Cleared undo history after file load');
          } catch (e) {
            console.warn('Failed to clear undo history after file load:', e);
          }
        }
      } catch (e) {
        throw e;
      }
    }

    // Remember the loaded filename for next time
    if (file.name) {
      mindMap.setLastUsedFilename(file.name);
    }

    // Fit the loaded content to the screen (same behavior as pressing '-' key)
    try {
      resetView();
    } catch (e) {
      console.warn('resetView failed after loading file:', e);
    }

    // Ensure the hidden file input is reset so selecting the same file again
    // will fire a change event in the browser and allow reloading the same file.
    try {
      const input = (uiManager && uiManager.fileInput) ? uiManager.fileInput : null;
      if (input) {
        if (input.elt) {
          input.elt.value = '';
        } else if (typeof input.value === 'function') {
          // p5.Element fallback
          input.value('');
        }
      }
    } catch (e) {
      // Non-fatal: browsers may restrict direct input manipulation
      console.warn('Failed to reset file input value:', e);
    }

  } catch (e) {
    console.error('Failed to load file:', e);
    alert('Failed to load file: ' + e.message);
  } finally {
    isMapLoading = false;
  }
}

/**
 * Handle text file import for creating mind maps from text documents
 * @param {Object} file - p5.js file object with text content
 */
async function handleTextImport(file) {
  try {
    // Get the file input element from uiManager
    const fileInput = uiManager ? uiManager.importTextFileInput : null;

    // Delegate to TextImporter
    await TextImporter.handleFileImport(file, fileInput);
  } catch (e) {
    console.error('Text import failed:', e);
    alert('Failed to import text file: ' + e.message);
  }
}


/**
 * Handle files/URLs dropped onto the canvas. Supports image files and image URLs.
 */
function handleCanvasDrop(e) {
  try {
    e.preventDefault();
    const dt = e.dataTransfer;
    if (!dt) return;

    // Determine drop position relative to canvas and convert to world coords
    const canvasElt = document.querySelector('canvas');
    let sx = 0, sy = 0;
    if (canvasElt) {
      const rect = canvasElt.getBoundingClientRect();
      sx = e.clientX - rect.left;
      sy = e.clientY - rect.top;
    } else {
      sx = e.clientX;
      sy = e.clientY;
    }
    const wx = CameraUtils.worldX(sx);
    const wy = CameraUtils.worldY(sy);

    // Get text data early (must be done synchronously in drop handler)
    const textUriList = dt.getData('text/uri-list') || '';
    const textPlain = dt.getData('text/plain') || '';
    const droppedText = textUriList || textPlain;

    // Priority: handle files
    if (dt.files && dt.files.length > 0) {
      for (let i = 0; i < dt.files.length; i++) {
        const f = dt.files[i];
        if (!f) continue;

        const fileName = f.name || '';
        const fileType = f.type || '';
        const lowerName = fileName.toLowerCase();

        // JSON file support: merge map into current map at drop point
        if (fileType === 'application/json' || lowerName.endsWith('.json')) {
          try {
            const reader = new FileReader();
            reader.onload = async (ev) => {
              try {
                const text = ev.target.result;
                const data = JSON.parse(text);
                await mergeMapData(data, wx, wy);
              } catch (e) {
                console.warn('Failed to parse dropped JSON map', e);
                alert('Failed to load JSON map: ' + (e && e.message ? e.message : String(e)));
              }
            };
            reader.onerror = (err) => { console.warn('Failed reading dropped json', err); };
            reader.readAsText(f);
          } catch (e) {
            console.warn('JSON drop handling failed', e);
          }
          return;
        }

        // Image file support
        if (fileType.startsWith('image/')) {
          // Compress/resize image before embedding to reduce decoded memory and JSON size.
          compressImageFile(f, { maxWidth: 1600, maxHeight: 1600, quality: 0.75 })
            .then((dataUrl) => {
              try {
                createImageBox(dataUrl, wx, wy);
              } catch (e) { console.warn('Failed to create image from compressed file', e); }
            })
            .catch((err) => {
              console.warn('Compression failed, falling back to original file read', err);
              const reader = new FileReader();
              reader.onload = (ev) => {
                try { createImageBox(ev.target.result, wx, wy); } catch (e) { console.warn('Failed to create image from file', e); }
              };
              reader.onerror = (err2) => { console.warn('Failed to read dropped image file', err2); };
              reader.readAsDataURL(f);
            });
          return;
        }

        // PDF file support
        if (fileType === 'application/pdf' || lowerName.endsWith('.pdf')) {
          try {
            createPdfBox(f, fileName || 'document.pdf', wx, wy);
          } catch (e) {
            console.warn('Failed to create PDF box', e);
          }
          return;
        }

        // Unrecognized file type: create a text box with the file path as a clickable link
        // Try to get the file path from various sources
        let filePath = null;

        // Method 1: Check f.path (works in Electron and some environments)
        if (f.path && typeof f.path === 'string') {
          filePath = f.path;
        }

        // Method 2: Check the text data from dataTransfer for file:// URL
        if (!filePath && droppedText) {
          const lines = droppedText.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('file://')) {
              // Decode the file:// URL to get the path
              try {
                // file:// URLs have the path after file:// (may have 2 or 3 slashes)
                let path = trimmed;
                if (path.startsWith('file:///')) {
                  path = path.substring(7); // Remove 'file://' keeping the leading /
                } else if (path.startsWith('file://')) {
                  path = path.substring(7);
                }
                filePath = decodeURIComponent(path);
                break;
              } catch (e) {
                console.warn('Failed to decode file URL:', trimmed, e);
              }
            }
          }
        }

        // Method 3: If we still don't have a path, just use the filename
        // (user can manually add the path if needed)
        if (!filePath && fileName) {
          // Create with just filename - user will see it's incomplete
          filePath = fileName;
        }

        if (filePath) {
          createFilePathBox(filePath, wx, wy);
          return;
        }
      }
    }

    // Next: text/uri-list or plain text that may contain a URL or file path
    if (droppedText) {
      const url = droppedText.split('\n')[0].trim();
      if (url) {
        const lower = url.toLowerCase();

        // Handle file:// URLs - create a text box with the path as a clickable link
        if (url.startsWith('file://')) {
          let filePath;
          try {
            if (url.startsWith('file:///')) {
              filePath = decodeURIComponent(url.substring(7));
            } else {
              filePath = decodeURIComponent(url.substring(7));
            }
          } catch (e) {
            filePath = url.substring(7);
          }

          // Check if it's an image
          if (/\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i.test(lower)) {
            createImageBox(url, wx, wy);
          } else if (lower.endsWith('.pdf')) {
            createPdfBox(url, url.split('/').pop(), wx, wy);
          } else if (lower.endsWith('.json')) {
            // For JSON files, create a file path box with the link
            createFilePathBox(filePath, wx, wy);
          } else {
            // For other file types (docx, txt, etc.), create a text box with the path
            createFilePathBox(filePath, wx, wy);
          }
          return;
        }

        // Handle http/https URLs
        if (url.startsWith('http://') || url.startsWith('https://')) {
          if (lower.endsWith('.pdf')) {
            createPdfBox(url, url.split('/').pop(), wx, wy);
          } else if (/\.(png|jpg|jpeg|gif|webp|svg|bmp)$/i.test(lower)) {
            createImageBox(url, wx, wy);
          } else {
            // For other URLs, create a text box with the URL as a clickable link
            createFilePathBox(url, wx, wy);
          }
          return;
        }

        // Fallback: if it looks like a path, create a path box
        if (url.startsWith('/') || url.match(/^[A-Za-z]:\\/)) {
          createFilePathBox(url, wx, wy);
          return;
        }

        // Default: try as image (original behavior)
        createImageBox(url, wx, wy);
        return;
      }
    }
  } catch (err) {
    console.warn('Drop handler error', err);
  }
}

/**
 * Create a PDF box node that stores a URL to the PDF (blob or remote).
 * Double-clicking the node will open the PDF in a new tab.
 */
async function createPdfBox(urlOrFile, filename, worldX, worldY) {
  try {
    if (!mindMap) return;
    const box = new TextBox(worldX, worldY, filename || 'PDF');
    // Add box immediately so user sees it while we render a preview asynchronously
    mindMap.addBox(box);
    mindMap.clearBoxSelection && mindMap.clearBoxSelection();
    mindMap.addBoxToSelection && mindMap.addBoxToSelection(box);
    mindMap.selectedBox = box;

    // Try to render first page as image using PDF.js. If successful, attach image and
    // DO NOT store or embed the original PDF data — treat it purely as an image.
    (async () => {
      try {
        if (typeof window === 'undefined' || typeof pdfjsLib === 'undefined') return;

        // Helper to get ArrayBuffer from File/Blob or URL string
        const getArrayBuffer = async (src) => {
          if (src instanceof ArrayBuffer) return src;
          if (src instanceof Blob) return await src.arrayBuffer();
          if (src instanceof File) return await src.arrayBuffer();
          if (typeof src === 'string') {
            // Use fetch for data:, blob:, http(s): etc. Might fail due to CORS for remote PDFs.
            const resp = await fetch(src);
            if (!resp.ok) throw new Error('Failed to fetch PDF: ' + resp.status);
            return await resp.arrayBuffer();
          }
          throw new Error('Unsupported PDF source');
        };

        let arrayBuffer = null;
        try {
          arrayBuffer = await getArrayBuffer(urlOrFile);
        } catch (e) {
          console.warn('Could not obtain PDF bytes for preview:', e);
          return; // leave box as PDF icon
        }

        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);

        const scale = 1.5; // moderate scale for preview
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;

        const dataUrl = canvas.toDataURL('image/png');
        if (dataUrl) {
          try {
            // Attach preview as an image
            box.setImageFromUrl(dataUrl);
          } catch (e) {
            console.warn('Failed to attach PDF preview image', e);
          }
        }
      } catch (e) {
        console.warn('PDF preview generation failed', e);
        // Leave the box as the simple PDF icon/text
      }
    })();
  } catch (e) {
    console.warn('Failed to create PDF box', e);
  }
}

function createImageBox(url, worldX, worldY) {
  try {
    if (!mindMap) return;
    const box = new TextBox(worldX, worldY, '');
    box.setImageFromUrl(url);
    mindMap.addBox(box);
    // Select and pan to it
    mindMap.clearBoxSelection();
    mindMap.addBoxToSelection(box);
    mindMap.selectedBox = box;
  } catch (e) {
    console.warn('Failed to create image box', e);
  }
}

/**
 * Create a text box containing a file path or URL as a clickable link.
 * Used for files that can't be embedded (like .docx, .xlsx, etc.)
 * Cmd/Ctrl+click will open the file in the default application.
 */
function createFilePathBox(pathOrUrl, worldX, worldY) {
  try {
    if (!mindMap) return;

    // Create the link text - use file:// protocol for local paths
    let linkText = pathOrUrl;

    // If it's already a URL (http, https, file), use as-is
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://') || pathOrUrl.startsWith('file://')) {
      linkText = pathOrUrl;
    } else if (pathOrUrl.startsWith('/')) {
      // Unix/macOS absolute path - encode special characters but preserve slashes
      linkText = 'file://' + encodeURI(pathOrUrl).replace(/#/g, '%23');
    } else if (pathOrUrl.match(/^[A-Za-z]:\\/)) {
      // Windows absolute path
      linkText = 'file:///' + encodeURI(pathOrUrl.replace(/\\/g, '/')).replace(/#/g, '%23');
    } else {
      // Relative path or just filename - prepend file:// anyway
      linkText = 'file://' + encodeURI(pathOrUrl).replace(/#/g, '%23');
    }

    const box = new TextBox(worldX, worldY, linkText);
    mindMap.addBox(box);

    // Select the new box
    mindMap.clearBoxSelection();
    mindMap.addBoxToSelection(box);
    mindMap.selectedBox = box;
  } catch (e) {
    console.warn('Failed to create file path box', e);
  }
}

/**
 * Merge an imported map JSON into the current mind map at world position (wx, wy).
 * Preserves existing content and appends imported boxes/connections.
 */
async function mergeMapData(data, wx, wy) {
  try {
    if (!data || typeof data !== 'object' || !Array.isArray(data.boxes)) {
      throw new Error('Invalid map JSON: missing boxes array');
    }
    if (!mindMap) throw new Error('mindMap not initialized');

    // Compute import center (average of box positions) to drop the map centered at drop point
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const b of data.boxes) {
      if (!b) continue;
      const bx = (b.x != null && isFinite(b.x)) ? b.x : 0;
      const by = (b.y != null && isFinite(b.y)) ? b.y : 0;
      minX = Math.min(minX, bx);
      maxX = Math.max(maxX, bx);
      minY = Math.min(minY, by);
      maxY = Math.max(maxY, by);
    }
    if (!isFinite(minX) || !isFinite(minY)) {
      minX = 0; minY = 0; maxX = 0; maxY = 0;
    }
    const importCenterX = (minX + maxX) / 2;
    const importCenterY = (minY + maxY) / 2;

    // Prepare to append boxes/connections
    const baseIndex = mindMap.boxes ? mindMap.boxes.length : 0;
    const newBoxes = [];

    // Wrap entire merge operation in a transaction for single undo step
    if (typeof collaborationManager !== 'undefined' && collaborationManager) {
      collaborationManager.transact(() => {
        performMerge();
      });
    } else {
      performMerge();
    }

    function performMerge() {
      // Create new boxes with positional offset so import center maps to drop point
      const offsetX = wx - importCenterX;
      const offsetY = wy - importCenterY;
      const mergedBoxes = [];
      const mergedConnections = [];

      for (const b of data.boxes) {
        try {
          const bcopy = Object.assign({}, b);
          bcopy.x = (bcopy.x != null && isFinite(bcopy.x)) ? (bcopy.x + offsetX) : (wx + offsetX);
          bcopy.y = (bcopy.y != null && isFinite(bcopy.y)) ? (bcopy.y + offsetY) : (wy + offsetY);
          const newBox = TextBox.fromJSON(bcopy);
          if (newBox) {
            mergedBoxes.push(newBox);
            newBoxes.push(newBox);
          }
        } catch (e) {
          console.warn('Failed to import box', e);
        }
      }

      // Append connections, remapping indices
      if (Array.isArray(data.connections)) {
        for (const c of data.connections) {
          try {
            if (!c || typeof c !== 'object') continue;
            const mapped = { from: (Number.isFinite(c.from) ? c.from : 0) + baseIndex, to: (Number.isFinite(c.to) ? c.to : 0) + baseIndex };
            // Note: Connection.fromJSON expects the box array to be populated for index lookup.
            // Since we haven't added them to mindMap.boxes yet, we should use our mergedBoxes array
            // combined with existing mindMap.boxes.
            const allBoxes = [...mindMap.boxes, ...mergedBoxes];
            const conn = Connection.fromJSON(mapped, allBoxes);
            if (conn && conn.fromBox && conn.toBox) {
              mergedConnections.push(conn);
            }
          } catch (e) {
            console.warn('Failed to import connection', e);
          }
        }
      }

      // Perform batch addition and sync
      mindMap.batchAdd(mergedBoxes, mergedConnections);

      mindMap.isDirty = true;
      mindMap.isSaved = false;
    }

    // Clear selection and select the newly added boxes
    try {
      mindMap.clearBoxSelection && mindMap.clearBoxSelection();
      for (const nb of newBoxes) mindMap.addBoxToSelection && mindMap.addBoxToSelection(nb);
      if (newBoxes.length > 0) {
        mindMap.selectedBox = newBoxes[0];
        mindMap.panToBox && mindMap.panToBox(newBoxes[0], true);
      }
    } catch (_) { }

    try { mindMap.saveToLocalStorage && mindMap.saveToLocalStorage(); } catch (_) { }
  } catch (e) {
    console.warn('mergeMapData failed', e);
    throw e;
  }
}

/**
 * Handles window resize events (with debouncing for performance)
 */
function windowResized() {
  const now = millis();
  // Debounce resize to avoid expensive recalculations
  const debounceMs = CONFIG.TIMING ? CONFIG.TIMING.RESIZE_DEBOUNCE_MS : 16;
  if (now - lastResizeTime > debounceMs) {
    resizeCanvas(windowWidth, windowHeight);
    lastResizeTime = now;

    // Reposition UI buttons after resize
    if (uiManager && typeof uiManager.handleResize === 'function') {
      uiManager.handleResize();
    }
  }
}

/**
 * Handles mouse wheel events for zooming
 * @param {Object} event - Mouse wheel event
 * @returns {boolean} false to prevent default browser behavior
 */
function mouseWheel(event) {
  if (uiManager && uiManager.isKeyboardOverlayVisible()) return false;
  // Only when over the canvas area
  const overCanvas = mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height;
  if (!overCanvas) return;

  // Compute world point under mouse before zoom
  // Zoom in (negative deltaY) or out (positive)
  const factor = event.deltaY < 0 ? CONFIG.ZOOM.STEP : 1 / CONFIG.ZOOM.STEP;
  CameraUtils.zoomAt(factor, mouseX, mouseY, CONFIG.ZOOM.MIN, CONFIG.ZOOM.MAX);

  // Prevent page scroll
  return false;
}

// ============================================================================
// CAMERA AND VIEW CONTROL
// ============================================================================

/**
 * Gets the bounding box of all content in world space.
 * Can be used as a pure function by passing boxes array, or uses
 * global mindMap.boxes for backward compatibility.
 * 
 * @param {Array} [boxes] - Optional array of boxes to calculate bounds for.
 *                         If not provided, uses mindMap.boxes.
 * @param {Object} [defaultBounds] - Optional default bounds if no boxes exist.
 * @returns {Object} Bounds with minX, maxX, minY, maxY properties
 */
function getContentBounds(boxes = null, defaultBounds = null) {
  // Use provided boxes or fall back to mindMap.boxes
  const boxArray = boxes || (mindMap && mindMap.boxes) || [];

  // Return default bounds if no content
  if (!boxArray || boxArray.length === 0) {
    if (defaultBounds) return defaultBounds;
    // Use canvas dimensions as default (width/height may be p5.js globals)
    const w = typeof width !== 'undefined' ? width : 800;
    const h = typeof height !== 'undefined' ? height : 600;
    return { minX: 0, maxX: w, minY: 0, maxY: h };
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  for (let box of boxArray) {
    if (!box) continue;

    // Validate box dimensions
    if (!Number.isFinite(box.x) || !Number.isFinite(box.y)) continue;

    const halfW = Number.isFinite(box.width) ? box.width / 2 : 0;
    const halfH = Number.isFinite(box.height) ? box.height / 2 : 0;

    const left = box.x - halfW;
    const right = box.x + halfW;
    const top = box.y - halfH;
    const bottom = box.y + halfH;

    minX = Math.min(minX, left);
    maxX = Math.max(maxX, right);
    minY = Math.min(minY, top);
    maxY = Math.max(maxY, bottom);
  }

  // If all boxes were invalid, return default
  if (minX === Infinity) {
    const w = typeof width !== 'undefined' ? width : 800;
    const h = typeof height !== 'undefined' ? height : 600;
    return defaultBounds || { minX: 0, maxX: w, minY: 0, maxY: h };
  }

  return { minX, maxX, minY, maxY };
}

/**
 * Gets the bounding box of the current selection in world space.
 * Can be used as a pure function by passing selection objects, or uses
 * global mindMap selections for backward compatibility.
 * 
 * @param {Object} [selection] - Optional selection object with:
 *   - boxes: Set or Array of selected boxes
 *   - connections: Set or Array of selected connections
 *   If not provided, uses mindMap's selected items.
 * @returns {Object|null} Bounds with minX, maxX, minY, maxY, or null if nothing selected
 */
function getSelectionBounds(selection = null) {
  // Get selection from parameter or fall back to mindMap
  const sel = selection || {
    boxes: mindMap?.selectedBoxes || (mindMap?.selectedBox ? [mindMap.selectedBox] : []),
    connections: mindMap?.selectedConnections || (mindMap?.selectedConnection ? [mindMap.selectedConnection] : [])
  };

  // Early return if no mindMap and no selection provided
  if (!selection && !mindMap) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const considerPoint = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };

  const considerBox = (box) => {
    if (!box || !Number.isFinite(box.x) || !Number.isFinite(box.y)) return;
    const halfW = Number.isFinite(box.width) ? box.width / 2 : 0;
    const halfH = Number.isFinite(box.height) ? box.height / 2 : 0;
    considerPoint(box.x - halfW, box.y - halfH);
    considerPoint(box.x + halfW, box.y + halfH);
  };

  const considerConnection = (conn) => {
    if (!conn) return;
    if (conn.fromBox) considerBox(conn.fromBox);
    if (conn.toBox) considerBox(conn.toBox);
    const start = (conn.fromBox && typeof conn.fromBox.getConnectionPoint === 'function')
      ? conn.fromBox.getConnectionPoint(conn.toBox)
      : null;
    const end = (conn.toBox && typeof conn.toBox.getConnectionPoint === 'function')
      ? conn.toBox.getConnectionPoint(conn.fromBox)
      : null;
    if (start) considerPoint(start.x, start.y);
    if (end) considerPoint(end.x, end.y);
  };

  // Process boxes
  const boxes = sel.boxes;
  if (boxes) {
    const boxIter = boxes[Symbol.iterator] ? boxes : [boxes];
    for (const box of boxIter) {
      considerBox(box);
    }
  }

  // Process connections
  const connections = sel.connections;
  if (connections) {
    const connIter = connections[Symbol.iterator] ? connections : [connections];
    for (const conn of connIter) {
      considerConnection(conn);
    }
  }

  if (minX === Infinity || minY === Infinity) {
    return null;
  }

  return { minX, maxX, minY, maxY };
}

function applyCameraSoftBounds() {
  if (!mindMap || !mindMap.boxes || mindMap.boxes.length === 0) return;

  const bounds = getContentBounds();
  const margin = CONFIG.CAMERA.PAN_MARGIN;
  const minCamX = -bounds.maxX * CameraUtils.zoom - margin;
  const maxCamX = -bounds.minX * CameraUtils.zoom + width + margin;
  const minCamY = -bounds.maxY * CameraUtils.zoom - margin;
  const maxCamY = -bounds.minY * CameraUtils.zoom + height + margin;

  CameraUtils.x = constrain(CameraUtils.x, minCamX, maxCamX);
  CameraUtils.y = constrain(CameraUtils.y, minCamY, maxCamY);
}

/**
 * Centers the camera on a specific world position without changing zoom
 * @param {number} worldX - World X coordinate
 * @param {number} worldY - World Y coordinate
 */
/**
 * Centers the camera on a specific world position without changing zoom
 * @param {number} worldX - World X coordinate
 * @param {number} worldY - World Y coordinate
 */
function centerCameraOn(worldX, worldY) {
  CameraUtils.centerOn(worldX, worldY, width, height);
  applyCameraSoftBounds();
}

/**
 * Resets camera to fit all content in view or default view if empty
 */
function resetView() {
  if (mindMap) {
    mindMap.isPanAnimating = false;
  }
  if (!mindMap || !mindMap.boxes || mindMap.boxes.length === 0) {
    // No content - reset to default
    CameraUtils.reset();
    return;
  }

  const bounds = getContentBounds();
  const contentWidth = bounds.maxX - bounds.minX;
  const contentHeight = bounds.maxY - bounds.minY;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  // Calculate zoom to fit all content with 10% margin
  const margin = 1.1;
  const zoomX = width / (contentWidth * margin);
  const zoomY = height / (contentHeight * margin);
  CameraUtils.zoom = constrain(min(zoomX, zoomY), CONFIG.ZOOM.MIN, CONFIG.ZOOM.MAX);

  // Center the content in viewport
  CameraUtils.centerOn(centerX, centerY, width, height);
  applyCameraSoftBounds();
}

function setMaxZoom() {
  if (mindMap) {
    mindMap.isPanAnimating = false;
  }
  const selectionBounds = getSelectionBounds();
  if (selectionBounds) {
    const margin = 1.1;
    const widthWorld = Math.max(selectionBounds.maxX - selectionBounds.minX, 1);
    const heightWorld = Math.max(selectionBounds.maxY - selectionBounds.minY, 1);
    const fitZoomX = widthWorld > 0 ? width / (widthWorld * margin) : CONFIG.ZOOM.MAX;
    const fitZoomY = heightWorld > 0 ? height / (heightWorld * margin) : CONFIG.ZOOM.MAX;
    let targetZoom = Math.min(CONFIG.ZOOM.MAX, fitZoomX, fitZoomY);
    if (!Number.isFinite(targetZoom) || targetZoom <= 0) {
      targetZoom = CONFIG.ZOOM.MAX;
    }
    CameraUtils.zoom = constrain(targetZoom, CONFIG.ZOOM.MIN, CONFIG.ZOOM.MAX);
    const centerX = (selectionBounds.minX + selectionBounds.maxX) / 2;
    const centerY = (selectionBounds.minY + selectionBounds.maxY) / 2;
    centerCameraOn(centerX, centerY);
    return;
  }
  const prevZoom = CameraUtils.zoom || 1;
  const worldCenterX = (width / 2 - CameraUtils.x) / prevZoom;
  const worldCenterY = (height / 2 - CameraUtils.y) / prevZoom;
  CameraUtils.zoom = CONFIG.ZOOM.MAX;
  centerCameraOn(worldCenterX, worldCenterY);
}

// Determine if the mouse is over any interactive object (box or connection)
function isOverAnyInteractive() {
  if (!mindMap) return false;
  // Check boxes from top-most first
  for (let i = mindMap.boxes.length - 1; i >= 0; i--) {
    const box = mindMap.boxes[i];
    if (!box) continue;
    if (box.isMouseOver()) return true;
  }
  // Check connections
  for (let i = 0; i < mindMap.connections.length; i++) {
    const conn = mindMap.connections[i];
    if (!conn) continue;
    try {
      if (conn.isMouseOver && conn.isMouseOver()) return true;
      if (conn.isMouseOverArrowHead && conn.isMouseOverArrowHead()) return true;
    } catch (_) { }
  }
  return false;
}

// ============================================================================
// EXPORT FUNCTIONS
// ============================================================================

/**
 * Exports the mind map as a PNG image
 */
/**
 * Exports the mind map as a PNG image
 * Delegates to ExportManager
 */
function exportPNG() {
  if (exportManager) {
    exportManager.exportPNG();
  } else {
    console.error('ExportManager not initialized');
  }
}

/**
 * Exports the mind map as a PDF document
 * Delegates to ExportManager
 */
async function exportPDF() {
  if (exportManager) {
    await exportManager.exportPDF();
  } else {
    console.error('ExportManager not initialized');
  }
}

/**
 * Toggles fullscreen mode
 */
function toggleFullScreen() {
  try {
    const fs = fullscreen();
    fullscreen(!fs);
  } catch (e) {
    console.error('Failed to toggle fullscreen:', e);
  }
}

/**
 * Exports the mind map as a text file with hierarchy
 */
function exportText() {
  if (exportManager) {
    exportManager.exportText();
  } else {
    console.error('ExportManager not initialized');
  }
}

/**
 * Draws the multi-box selection rectangle
 */
function drawSelectionRectangle() {
  const x1 = min(selectionStartX, selectionCurrentX);
  const y1 = min(selectionStartY, selectionCurrentY);
  const x2 = max(selectionStartX, selectionCurrentX);
  const y2 = max(selectionStartY, selectionCurrentY);

  const selColors = UI_COLORS.SELECTION_RECT;
  push();
  // Semi-transparent fill and border
  Utils.applyFill(selColors.fill);
  Utils.applyStroke(selColors.stroke, 2 / CameraUtils.zoom);
  rect(x1, y1, x2 - x1, y2 - y1);
  pop();
}

/**
 * Checks if a line segment intersects an axis-aligned rectangle
 * Uses shared utility from Utils if available
 * @param {number} x1 - Segment start X
 * @param {number} y1 - Segment start Y
 * @param {number} x2 - Segment end X
 * @param {number} y2 - Segment end Y
 * @param {number} rx1 - Rectangle corner 1 X
 * @param {number} ry1 - Rectangle corner 1 Y
 * @param {number} rx2 - Rectangle corner 2 X
 * @param {number} ry2 - Rectangle corner 2 Y
 * @returns {boolean} true if segment intersects rectangle
 */
function segmentIntersectsRect(x1, y1, x2, y2, rx1, ry1, rx2, ry2) {
  // Use shared utility if available
  if (typeof Utils !== 'undefined' && Utils.segmentIntersectsRect) {
    return Utils.segmentIntersectsRect(x1, y1, x2, y2, rx1, ry1, rx2, ry2);
  }

  // Fallback implementation
  // Normalize rect coordinates
  const minRx = Math.min(rx1, rx2);
  const maxRx = Math.max(rx1, rx2);
  const minRy = Math.min(ry1, ry2);
  const maxRy = Math.max(ry1, ry2);

  // Quick bounding-box early-out: if the segment's bbox doesn't overlap the rect, no intersection
  const segMinX = Math.min(x1, x2);
  const segMaxX = Math.max(x1, x2);
  const segMinY = Math.min(y1, y2);
  const segMaxY = Math.max(y1, y2);
  if (segMaxX < minRx || segMinX > maxRx || segMaxY < minRy || segMinY > maxRy) {
    return false;
  }

  // Quick check: any endpoint inside rect
  if ((x1 >= minRx && x1 <= maxRx && y1 >= minRy && y1 <= maxRy) ||
    (x2 >= minRx && x2 <= maxRx && y2 >= minRy && y2 <= maxRy)) {
    return true;
  }

  // Helper: orientation
  function orient(ax, ay, bx, by, cx, cy) {
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  }

  // Helper: check segment intersection
  function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
    const o1 = orient(ax, ay, bx, by, cx, cy);
    const o2 = orient(ax, ay, bx, by, dx, dy);
    const o3 = orient(cx, cy, dx, dy, ax, ay);
    const o4 = orient(cx, cy, dx, dy, bx, by);

    if ((o1 === 0 && Math.min(ax, bx) <= cx && cx <= Math.max(ax, bx) && Math.min(ay, by) <= cy && cy <= Math.max(ay, by)) ||
      (o2 === 0 && Math.min(ax, bx) <= dx && dx <= Math.max(ax, bx) && Math.min(ay, by) <= dy && dy <= Math.max(ay, by)) ||
      (o3 === 0 && Math.min(cx, dx) <= ax && ax <= Math.max(cx, dx) && Math.min(cy, dy) <= ay && ay <= Math.max(cy, dy)) ||
      (o4 === 0 && Math.min(cx, dx) <= bx && bx <= Math.max(cx, dx) && Math.min(cy, dy) <= by && by <= Math.max(cy, dy))) {
      return true; // collinear overlap cases
    }

    return (o1 * o2 < 0) && (o3 * o4 < 0);
  }

  // Rectangle edges
  // left edge
  if (segmentsIntersect(x1, y1, x2, y2, minRx, minRy, minRx, maxRy)) return true;
  // right edge
  if (segmentsIntersect(x1, y1, x2, y2, maxRx, minRy, maxRx, maxRy)) return true;
  // top edge
  if (segmentsIntersect(x1, y1, x2, y2, minRx, minRy, maxRx, minRy)) return true;
  // bottom edge
  if (segmentsIntersect(x1, y1, x2, y2, minRx, maxRy, maxRx, maxRy)) return true;

  return false;
}

/**
 * Completes multi-box selection by selecting all boxes and connections within the rectangle
 */
function completeMultiBoxSelection() {
  if (!mindMap) return;

  const x1 = min(selectionStartX, selectionCurrentX);
  const y1 = min(selectionStartY, selectionCurrentY);
  const x2 = max(selectionStartX, selectionCurrentX);
  const y2 = max(selectionStartY, selectionCurrentY);

  // Clear current selection if shift is not held
  const shiftHeld = keyIsDown(16);
  if (!shiftHeld) {
    mindMap.clearBoxSelection();
    // Also clear existing connection selection when starting a fresh rectangle selection
    if (mindMap.clearConnectionSelection) mindMap.clearConnectionSelection();
    // Also clear any selected cluster
    if (mindMap.selectedCluster) {
      mindMap.selectedCluster.selected = false;
      mindMap.selectedCluster = null;
    }
  }

  // Select all boxes that intersect the selection rectangle (any part of the box)
  for (const box of mindMap.boxes) {
    if (!box) continue;

    // Compute box bounds (box.x,box.y are centers)
    const left = box.x - (box.width || 0) / 2;
    const right = box.x + (box.width || 0) / 2;
    const top = box.y - (box.height || 0) / 2;
    const bottom = box.y + (box.height || 0) / 2;

    // Check for any overlap between selection rectangle and box bounds
    const intersects = !(right < x1 || left > x2 || bottom < y1 || top > y2);
    if (intersects) {
      mindMap.addBoxToSelection(box);
    }
  }

  // NEW: Select connections that intersect the selection rectangle
  if (mindMap.connections && mindMap.addConnectionToSelection) {
    for (const conn of mindMap.connections) {
      if (!conn || !conn.fromBox || !conn.toBox) continue;
      try {
        const start = conn.fromBox.getConnectionPoint(conn.toBox);
        const end = conn.toBox.getConnectionPoint(conn.fromBox);
        if (!start || !end || isNaN(start.x) || isNaN(start.y) || isNaN(end.x) || isNaN(end.y)) continue;
        if (segmentIntersectsRect(start.x, start.y, end.x, end.y, x1, y1, x2, y2)) {
          mindMap.addConnectionToSelection(conn);
        }
      } catch (e) {
        // ignore geometry errors per-connection
      }
    }
  }
}

// ============================================================================
// CLEANUP AND TEARDOWN
// ============================================================================

/**
 * Cleans up all event listeners and timers
 * Call this function before unloading or when resetting the application
 */
function cleanup() {
  try {
    // Remove all tracked event listeners
    for (const { target, event, handler, options } of eventListeners) {
      try {
        target.removeEventListener(event, handler, options);
      } catch (e) {
        console.warn('Failed to remove event listener:', event, e);
      }
    }
    eventListeners = [];

    // Remove overlay event listeners
    if (keyboardOverlay && keyboardOverlay.elt && overlayClickHandler) {
      try {
        keyboardOverlay.elt.removeEventListener('click', overlayClickHandler);
      } catch (e) {
        console.warn('Failed to remove overlay click listener:', e);
      }
    }

    if (keyboardOverlayContent && keyboardOverlayContent.elt && overlayContentClickHandler) {
      try {
        keyboardOverlayContent.elt.removeEventListener('click', overlayContentClickHandler);
      } catch (e) {
        console.warn('Failed to remove overlay content click listener:', e);
      }
    }

    // Clear autosave timer
    if (autosaveTimer) {
      clearInterval(autosaveTimer);
      autosaveTimer = null;
    }

    // Reset key repeat state
    try {
      KeyRepeat.reset();
    } catch (e) {
      console.warn('Failed to reset key repeat:', e);
    }

    // Save final state before cleanup
    if (mindMap && !mindMap.isSaved) {
      try {
        mindMap.saveToLocalStorage();
      } catch (e) {
        console.warn('Failed to save on cleanup:', e);
      }
    }

    // Fully destroy collaboration manager to clean up awareness on page unload
    if (collaborationManager) {
      try {
        collaborationManager.destroy();
      } catch (e) {
        console.warn('Failed to disconnect collaboration manager:', e);
      }
    }
  } catch (e) {
    console.error('Error during cleanup:', e);
  }
}

// Register cleanup on page unload
// Using pagehide instead of beforeunload for better reliability
// pagehide fires when the page is hidden/unloaded and is more reliable
// especially on mobile browsers
// Note: Skip cleanup if page is being cached (persisted) to avoid breaking
// the page when user navigates back from bfcache
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', function (event) {
    // If the page is being placed into the back/forward cache (bfcache),
    // avoid tearing down listeners and managers so the page works when restored.
    if (event && event.persisted) {
      return;
    }
    cleanup();
  });
}

// ============================================================================
// AUTOSAVE FUNCTIONS
// ============================================================================

/**
 * Starts the autosave timer that periodically saves to localStorage
 */
function startAutosave() {
  // Clear any existing timer
  if (autosaveTimer) {
    clearInterval(autosaveTimer);
  }

  // With y-indexeddb, Yjs automatically persists to IndexedDB on every change.
  // This localStorage autosave serves as a backup for export/import functionality.
  // Set up periodic autosave
  autosaveTimer = setInterval(() => {
    // Only autosave when page is visible to avoid issues with background throttling
    if (mindMap && !mindMap.isSaved && isPageVisible) {
      mindMap.saveToLocalStorage();
    }
  }, CONFIG.AUTOSAVE.INTERVAL);
}

// Draw save indicator at far left of menu when visible
function drawSaveIndicator() {
  if (!mindMap || !menuIsVisible) return;

  const size = CONFIG.UI.SAVE_INDICATOR_SIZE;
  const x = CONFIG.UI.SAVE_INDICATOR_X;
  const y = CONFIG.UI.SAVE_INDICATOR_Y;
  const colors = UI_COLORS.SAVE_INDICATOR;

  push();
  noStroke();

  let statusColor;
  let statusText = '';

  // Determine if we are in active collaboration mode
  const isCollaborating = collaborationManager && collaborationManager.provider && collaborationManager.roomName;

  if (isCollaborating) {
    // Collaboration Mode
    if (!collaborationManager.isConnected) {
      statusColor = colors.unsaved; // Red
      statusText = 'Offline (Reconnecting...)';
    } else {
      // Connected Logic:
      if (syncStatus === null) {
        statusColor = colors.saved; // Green
        statusText = 'All changes saved & synced';
      } else if (syncStatus === 'incompatible' || syncStatus === 'error') {
        statusColor = colors.unsaved; // Red
        statusText = 'Sync Error / Incompatible Version';
      } else {
        // connecting, server_starting, syncing
        statusColor = colors.syncing; // Yellow
        statusText = syncStatus === 'server_starting' ? 'Waking up server...' : 'Syncing...';
      }
    }
  } else {
    // Local Mode Logic
    if (mindMap.isSaved) {
      statusColor = colors.saved; // Green
      statusText = 'Saved locally';
    } else {
      statusColor = colors.syncing; // Yellow for unsaved changes
      statusText = 'Unsaved changes...';
    }
  }

  // Update canvas title for tooltip accessibility
  if (canvas && canvas.elt && canvas.elt.title !== statusText) {
    canvas.elt.title = statusText;
  }

  Utils.applyFill(statusColor);
  circle(x, y, size);
  pop();
}

// Export helpers for testing in Node/Jest without impacting browser usage
if (typeof module !== 'undefined') {
  module.exports = {
    attachDisplayNameInputHandlers,
    KeyRepeat,
    // Test-only helper: allows Jest tests to inject a mock mindMap so that
    // KeyRepeat.update() (which reads the module-local mindMap variable) can
    // be exercised without spinning up the full p5.js runtime.
    _testSetMindMap: (mm) => { mindMap = mm; },
  };
}
