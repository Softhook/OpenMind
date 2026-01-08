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
  TIMING: { RESIZE_DEBOUNCE_MS: 16, DOUBLE_CLICK_MS: 300 }
};

// UI Colors for consistent styling throughout the application
const UI_COLORS = {
  BACKGROUND: 240,
  SELECTION_RECT: { fill: { r: 100, g: 150, b: 255, a: 50 }, stroke: { r: 100, g: 150, b: 255 } },
  SAVE_INDICATOR: { saved: { r: 76, g: 175, b: 80 }, unsaved: { r: 244, g: 67, b: 54 } },
  LOADING_OVERLAY: { bg: { r: 0, g: 0, b: 0, a: 160 }, text: 255, spinner: 255 },
  CONNECTION: { normal: 80, selected: { r: 100, g: 150, b: 255 } }
};

// ============================================================================
// GLOBAL STATE
// ============================================================================
// Application state variables for the mind map, UI, and camera/zoom

let mindMap;
let collaborationManager = null; // CollaborationManager for real-time sync
let saveButton;
let loadButton;
let fileInput;
let exportPNGButton;
let exportPDFButton;
let exportTextButton;
let menuIsVisible = false;
let keyboardControlsButton;
let keyboardOverlay = null;
let inviteButton = null; // Share button for collaboration
let displayNameInput = null; // Text field for changing display name
let keyboardOverlayContent = null;
let keyboardOverlayVisible = false;
let menuRightEdge = 600;

// Autosave state
let autosaveTimer = null;

// Camera/zoom state
let camX = 0;
let camY = 0;
let zoom = 1;

// Panning state
let isPanning = false;
let panStartMouseX = 0;
let panStartMouseY = 0;
let panStartCamX = 0;
let panStartCamY = 0;
let rightPanActive = false; // true if current pan initiated by right mouse button
let suppressNextRightClick = false; // avoid triggering right-click action after a pan drag

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

// ============================================================================
// KEY REPEAT MANAGER
// ============================================================================
// Fallback key-repeat for Backspace/Delete to ensure repeat works even if
// the browser/OS doesn't auto-repeat these keys

const KeyRepeat = {
  // Only handle non-character deletion keys to avoid interfering with native typing.
  // Don't rely on p5's keyCode constants being pre-defined at load time.
  isTracked(code) {
    const BK = (typeof BACKSPACE !== 'undefined') ? BACKSPACE : 8;
    const DEL = (typeof DELETE !== 'undefined') ? DELETE : 46;
    return code === BK || code === DEL;
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
function worldMouseX() {
  const safeZoom = (typeof Utils !== 'undefined' && Utils.safePositiveNumber)
    ? Utils.safePositiveNumber(zoom, 1)
    : (zoom > 0 ? zoom : 1);
  return (mouseX - camX) / safeZoom;
}

/**
 * Parse the current window location to find a candidate JSON file path.
 * Supports `?file=...`, `#hash` (auto-append .json) and direct pathname ending with .json
 * @returns {string|null}
 */
function parseFileFromLocation() {
  if (typeof window === 'undefined' || !window.location) return null;
  const searchParams = window.location.search ? new URLSearchParams(window.location.search) : null;
  const hash = window.location.hash || '';
  const path = window.location.pathname || '';

  if (searchParams && searchParams.get('file')) {
    return decodeURIComponent(searchParams.get('file'));
  }
  if (hash && hash.length > 1) {
    let h = decodeURIComponent(hash.substring(1));
    // Ignore collaboration room hashes or if server override is present
    if (h.startsWith('room=') || (searchParams && (searchParams.get('server')))) return null;

    if (h && !h.toLowerCase().endsWith('.json')) h = h + '.json';
    return h;
  }
  if (path && path.toLowerCase().endsWith('.json')) {
    return path.startsWith('/') ? path : ('/' + path);
  }
  return null;
}

/**
 * Fetch and load a JSON map from a given file path/URL.
 * Updates `lastLoadedUrlFile` so repeat navigations can be detected.
 * Compares with browser cache to load the more recent version.
 */
async function loadMapFromUrl(fileToFetch, { force = false } = {}) {
  if (!fileToFetch) return false;
  // Show loading overlay while fetching
  isMapLoading = true;
  try {
    // If already loaded the same URL and not forced, skip
    if (!force && lastLoadedUrlFile && lastLoadedUrlFile === fileToFetch) return false;

    const resp = await fetch(fileToFetch, { cache: 'no-cache' });
    if (!resp.ok) throw new Error('Network response was not ok: ' + resp.status);

    // Get last modified from headers as fallback
    const lastModifiedHeader = resp.headers.get('Last-Modified');
    const headerTime = lastModifiedHeader ? new Date(lastModifiedHeader).getTime() : 0;

    const urlData = await resp.json();

    // Determine appropriate storage key for this map
    let urlName = 'unnamed-map';
    if (urlData.name) {
      urlName = extractMapName(urlData.name);
    } else if (fileToFetch) {
      urlName = extractMapName(fileToFetch);
    }

    // Create namespaced storage key: openmind_map_<normalized_name>
    const storageKey = 'openmind_map_' + urlName;

    // Set the storage key on the mindMap instance so future saves go to the right place
    if (mindMap && typeof mindMap.setStorageKey === 'function') {
      mindMap.setStorageKey(storageKey);
    }

    // Check if we have a cached version for THIS SPECIFIC map
    let shouldUseCache = false;
    try {
      if (mindMap && mindMap.hasLocalStorageData && mindMap.hasLocalStorageData()) {
        // hasLocalStorageData now uses the set storageKey, so it checks the specific map's cache
        const cachedString = localStorage.getItem(storageKey);

        if (cachedString) {
          const cachedData = JSON.parse(cachedString);

          // Compare timestamps
          const urlTimestamp = urlData.lastModified || headerTime || 0;
          const cacheTimestamp = cachedData.lastModified || 0;

          console.info('Map timestamp comparison:', {
            mapName: urlName,
            storageKey: storageKey,
            urlTimestamp: (urlTimestamp !== undefined && urlTimestamp !== null) ? new Date(urlTimestamp).toISOString() : 'missing',
            cacheTimestamp: (cacheTimestamp !== undefined && cacheTimestamp !== null) ? new Date(cacheTimestamp).toISOString() : 'missing'
          });

          if (cacheTimestamp > urlTimestamp) {
            shouldUseCache = true;
            console.info('Using cached version (more recent):', storageKey);
          } else {
            console.info('Using URL version (more recent or same):', urlName);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to compare with cache:', e);
      // On error, default to URL version
      shouldUseCache = false;
    }

    // Load the appropriate version
    if (shouldUseCache) {
      // Load from cache instead of URL
      if (mindMap && typeof mindMap.loadFromLocalStorage === 'function') {
        await mindMap.loadFromLocalStorage();
        // Ensure storage key remains set after load (load might reset things potentially, though fromJSON doesn't reset key)
        if (mindMap && typeof mindMap.setStorageKey === 'function') {
          mindMap.setStorageKey(storageKey);
        }
      }
    } else {
      // Load from URL
      if (mindMap && typeof mindMap.load === 'function') await mindMap.load(urlData);

      // Ensure storage key is set correctly (load calls saveToLocalStorage which needs the key)
      if (mindMap && typeof mindMap.setStorageKey === 'function') {
        mindMap.setStorageKey(storageKey);
      }
    }

    // Final foolproof ensure key is set (redundant but safe)
    if (mindMap && typeof mindMap.setStorageKey === 'function') mindMap.setStorageKey(storageKey);

    if (mindMap && typeof mindMap.setLastUsedFilename === 'function') mindMap.setLastUsedFilename(fileToFetch);
    try { resetView(); } catch (e) { console.warn('resetView failed after loading URL file:', e); }
    lastLoadedUrlFile = fileToFetch;
    return true;
  } catch (e) {
    console.warn('Failed to load map from URL "' + fileToFetch + '":', e);
    return false;
  } finally {
    isMapLoading = false;
  }
}

/**
 * Extracts a normalized map name from a full path or name
 * @param {string} pathOrName - Full path or name
 * @returns {string} Normalized name
 */
function extractMapName(pathOrName) {
  if (!pathOrName || typeof pathOrName !== 'string') return '';

  // Extract basename (remove path) - handle both / and \ separators
  let name = pathOrName;
  const lastSlash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
  if (lastSlash >= 0) {
    name = name.substring(lastSlash + 1);
  }

  // Remove URL-related characters (hash, query params)
  name = name.replace(/[?#].*$/, '');

  // Remove .json extension
  name = name.replace(/\.json$/i, '');
  // Normalize whitespace and case
  return name.trim().toLowerCase();
}

/**
 * Checks if two map names are similar (handles prefaced maps with same ending)
 * @param {string} name1 - First name
 * @param {string} name2 - Second name
 * @returns {boolean} true if names match or one ends with the other (with separator)
 */
function namesAreSimilar(name1, name2) {
  if (!name1 || !name2) return false;
  name1 = name1.toLowerCase();
  name2 = name2.toLowerCase();

  // Exact match
  if (name1 === name2) return true;

  // Check if one name ends with the other, but only if preceded by a separator
  // This prevents false matches like 'important' matching 'ant'
  // Separators: dash, underscore, space
  const separators = ['-', '_', ' '];

  if (name1.length > name2.length) {
    // Check if name1 ends with name2 and has a separator before it
    if (name1.endsWith(name2)) {
      const prefixLength = name1.length - name2.length;
      if (prefixLength > 0) {  // Ensure we have at least one character for separator
        const charBeforeSuffix = name1[prefixLength - 1];
        if (separators.includes(charBeforeSuffix)) return true;
      }
    }
  }

  if (name2.length > name1.length) {
    // Check if name2 ends with name1 and has a separator before it
    if (name2.endsWith(name1)) {
      const prefixLength = name2.length - name1.length;
      if (prefixLength > 0) {  // Ensure we have at least one character for separator
        const charBeforeSuffix = name2[prefixLength - 1];
        if (separators.includes(charBeforeSuffix)) return true;
      }
    }
  }

  return false;
}

/**
 * Handler to respond to URL changes (hash/popstate) and initial load.
 */
function handleUrlChange() {
  // Check for room changes first
  const newRoom = parseRoomFromHash();
  const currentRoom = collaborationManager ? collaborationManager.roomName : null;

  if (newRoom !== currentRoom) {
    if (collaborationManager) {
      // Fully destroy the old instance to properly clean up awareness
      collaborationManager.destroy();
      collaborationManager = null;
    }
    if (newRoom && mindMap) {
      initializeCollaboration(newRoom);
      return; // Don't load file when in collaboration mode
    }
  }

  // Handle file loading (skip if in collaboration mode)
  if (!newRoom) {
    const fileToFetch = parseFileFromLocation();
    if (fileToFetch) {
      loadMapFromUrl(fileToFetch);
    }
  }
}

/**
 * Parses server URL from query params
 * @returns {string|null} Server URL or null
 */
function parseServerFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const server = params.get('server');
    if (!server) return null;

    // If it's a full URL, return it
    if (server.startsWith('ws://') || server.startsWith('wss://')) {
      return server;
    }

    // If it's a keyword like 'public' or 'demo', return null 
    // effectively letting CollaborationManager's internal logic handle the override
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Parses room ID from URL hash
 * @returns {string|null} Room name or null if not in a room
 */
function parseRoomFromHash() {
  try {
    const hash = window.location.hash;

    // Explicit room parameter
    const match = hash.match(/room=([^&]+)/);
    if (match) return decodeURIComponent(match[1]);

    // If server override is present, treat the entire hash as a room name (if it's not a file)
    // Check raw params directly since parseServerFromUrl only returns valid URLs now
    const params = new URLSearchParams(window.location.search);
    if (params.has('server') && hash.length > 1) {
      // Remove the leading #
      let h = decodeURIComponent(hash.substring(1));
      // Basic sanity check: allow alphanumeric room names (and standard URL safe chars)
      // Reject if it looks like a file (ends in .json) just in case
      if (!h.toLowerCase().endsWith('.json')) {
        return h;
      }
    }

    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Initializes collaboration for a given room
 * @param {string} roomName 
 */
async function initializeCollaboration(roomName) {
  if (!mindMap || !roomName) return;
  if (typeof CollaborationManager === 'undefined') {
    console.warn('CollaborationManager not loaded');
    return;
  }

  try {
    // Create manager if it doesn't exist (shouldn't happen normally since it's created in setup)
    if (!collaborationManager) {
      collaborationManager = new CollaborationManager(mindMap);
      await collaborationManager.initialize();
    }

    // Set up callbacks
    // Clear any existing timeouts from previous connection attempts
    if (syncConnectionTimeout) clearTimeout(syncConnectionTimeout);
    if (syncEmptyRoomTimeout) clearTimeout(syncEmptyRoomTimeout);

    collaborationManager.onConnectionChange = (status) => {
      console.log('Collaboration status:', status);
      // Track specific sync status for overlay
      const prevStatus = syncStatus;
      if (status === 'connecting') {
        syncStatus = 'connecting';
        // Detect slow connection (server cold start on Render)
        syncConnectionTimeout = setTimeout(() => {
          if (syncStatus === 'connecting') {
            console.log('Connection slow - server may be starting up');
            syncStatus = 'server_starting';
          }
        }, 5000);
      } else if (status === 'connected') {
        if (syncConnectionTimeout) { clearTimeout(syncConnectionTimeout); syncConnectionTimeout = null; }
        syncStatus = 'syncing'; // Connected but waiting for initial sync
        // Start empty room timeout - if no sync after 5s, assume empty room
        syncEmptyRoomTimeout = setTimeout(() => {
          if (syncStatus === 'syncing') {
            console.log('Sync timeout: Assuming empty room, dismissing overlay');
            syncStatus = null;
          }
        }, 5000);
      } else if (status === 'syncing') {
        syncStatus = 'syncing';
      } else if (status === 'synced') {
        if (syncEmptyRoomTimeout) { clearTimeout(syncEmptyRoomTimeout); syncEmptyRoomTimeout = null; }
        syncStatus = null; // Fully synced, hide overlay
      } else if (status === 'disconnected') {
        if (syncConnectionTimeout) { clearTimeout(syncConnectionTimeout); syncConnectionTimeout = null; }
        if (syncEmptyRoomTimeout) { clearTimeout(syncEmptyRoomTimeout); syncEmptyRoomTimeout = null; }
        syncStatus = null;
      }
      if (prevStatus !== syncStatus) {
        console.log('Sync overlay status changed:', prevStatus, '->', syncStatus);
      }
    };

    let lastPeerCount = 0;
    collaborationManager.onPeersChange = (peers) => {
      if (peers.length !== lastPeerCount) {
        console.log('Connected peers:', peers.length);
        lastPeerCount = peers.length;
      }
    };

    collaborationManager.onVersionMismatch = (mismatchInfo) => {
      console.warn('Version mismatch detected:', mismatchInfo);
      syncStatus = 'incompatible';
    };

    const serverUrl = parseServerFromUrl();
    if (serverUrl) {
      console.log('Connecting to custom signaling server:', serverUrl);
    }
    await collaborationManager.connect(roomName, serverUrl);
    console.log('Collaboration initialized for room:', roomName);

    // Update browser tab title to show room name
    document.title = roomName + ' — OpenMind';
  } catch (e) {
    console.error('Failed to initialize collaboration:', e);
    // Clear timeouts on error
    if (syncConnectionTimeout) { clearTimeout(syncConnectionTimeout); syncConnectionTimeout = null; }
    if (syncEmptyRoomTimeout) { clearTimeout(syncEmptyRoomTimeout); syncEmptyRoomTimeout = null; }
    syncStatus = null;
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
    // Start new session
    const room = CollaborationManager.generateRoomName();
    // Setting hash triggers handleUrlChange -> initializeCollaboration
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
function updateCollaborationPresence() {
  if (!collaborationManager || !collaborationManager.isConnected) return;

  // Throttle updates (every ~100ms)
  if (frameCount % 6 !== 0) return;

  // Update cursor position (world space)
  if (typeof worldMouseX === 'function' && typeof worldMouseY === 'function') {
    const wx = worldMouseX();
    const wy = worldMouseY();
    // Only update if valid numbers
    if (Number.isFinite(wx) && Number.isFinite(wy)) {
      collaborationManager.updateCursor(wx, wy);
    }
  }

  // Update selection
  if (mindMap) {
    let selectedIds = [];
    if (mindMap.selectedBoxes && mindMap.selectedBoxes.size > 0) {
      selectedIds = Array.from(mindMap.selectedBoxes).map(b => b.id).filter(id => id);
    } else if (mindMap.selectedBox && mindMap.selectedBox.id) {
      selectedIds = [mindMap.selectedBox.id];
    }
    collaborationManager.updateSelection(selectedIds);

    // Broadcast which box is being edited (for lock indicator)
    const editingBoxId = (mindMap.selectedBox && mindMap.selectedBox.isEditing)
      ? mindMap.selectedBox.id
      : null;
    collaborationManager.updateEditingBox(editingBoxId);
  }
}

/**
 * Draws cursors of remote users
 */
function drawRemoteCursors() {
  if (!collaborationManager || !collaborationManager.isConnected) return;

  const users = collaborationManager.getRemoteUsers();
  if (!users || users.length === 0) return;

  for (const userState of users) {
    if (!userState.cursor) continue;

    const { x, y } = userState.cursor;
    const color = userState.user ? userState.user.color : '#aaaaaa';
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
  const safeZoom = (typeof Utils !== 'undefined' && Utils.safePositiveNumber)
    ? Utils.safePositiveNumber(zoom, 1)
    : (zoom > 0 ? zoom : 1);
  return (mouseY - camY) / safeZoom;
}

/**
 * Converts world X coordinate to screen space
 * @param {number} worldX - World X coordinate
 * @returns {number} Screen X coordinate
 */
function screenX(worldX) {
  return worldX * zoom + camX;
}

/**
 * Converts world Y coordinate to screen space
 * @param {number} worldY - World Y coordinate
 * @returns {number} Screen Y coordinate
 */
function screenY(worldY) {
  return worldY * zoom + camY;
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

    // Handle initial URL-based loading and listen for future URL changes
    // (supports ?file=, hash like #maps/Name or #maps/Name.json, and direct .json pathname)
    // Parse synchronously to decide whether to skip localStorage fallback (avoid race).
    const initialFile = parseFileFromLocation();
    if (initialFile) {
      // Start loading asynchronously; do NOT set `lastLoadedUrlFile` yet
      // (it is set after a successful fetch inside `loadMapFromUrl`).
      loadMapFromUrl(initialFile);
    }
    addTrackedEventListener(window, 'hashchange', handleUrlChange);
    addTrackedEventListener(window, 'popstate', handleUrlChange);

    // Check if joining a collaboration room
    const roomId = parseRoomFromHash();

    // ALWAYS load from localStorage first (even when joining a room)
    // When joining a room, the seed logic in CollaborationManager will:
    // - If room is empty: push local data to Yjs
    // - If room has data: Yjs will sync and overwrite local to match room state
    if (!lastLoadedUrlFile) {
      // Try to load from localStorage first
      const hasAutosave = mindMap.hasLocalStorageData();
      if (hasAutosave) {
        try {
          // mindMap.loadFromLocalStorage() may be synchronous or return a Promise.
          const maybePromise = mindMap.loadFromLocalStorage();
          const afterLoad = async () => {
            try { resetView(); } catch (e) { console.warn('resetView failed after loading from localStorage:', e); }
            try {
              if (typeof document !== 'undefined' && mindMap && typeof mindMap.getLastUsedFilename === 'function') {
                let fname = mindMap.getLastUsedFilename() || '';
                fname = fname.split('/').pop().split('\\').pop();
                fname = fname.replace(/\.json$/i, '').trim();
                document.title = fname ? (fname + ' — OpenMind') : 'OpenMind';
              }
            } catch (_) { }

            // Wait for collaboration manager to be initialized before clearing undo
            // This ensures boxes are properly synced to Yjs WITH undo tracking
            if (collaborationManager) {
              try {
                // Wait for initialization to complete
                await collaborationManager.initialize();

                // Re-sync all boxes to ensure they're in Yjs with proper undo tracking
                // This fixes issue where boxes loaded before undoManager was ready
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

                // Clear undo history after loading to prevent undo from reverting the load
                collaborationManager.clearUndoHistory();
              } catch (e) {
                console.warn('Failed to initialize collaboration for undo:', e);
              }
            }
          };
          if (maybePromise && typeof maybePromise.then === 'function') {
            maybePromise.then(afterLoad).catch((e) => {
              console.warn('Failed to load mindMap from localStorage:', e);
            });
          } else {
            afterLoad();
          }
        } catch (e) {
          console.warn('Error while loading from localStorage:', e);
        }
      } else {
        // Create initial boxes as examples only if no autosave exists AND not joining room
        mindMap.addBox(new TextBox(300, 200, "Idea"));
        mindMap.addBox(new TextBox(500, 300, "Sub Topic"));
        mindMap.addBox(new TextBox(500, 100, "Sub Topic"));
        // Initial state is unsaved, will be autosaved on first interval
        if (mindMap) mindMap.isSaved = false;
        // Clear undo history so creating example boxes isn't undoable
        if (collaborationManager) {
          // Wait for initialization then clear
          setTimeout(() => {
            if (collaborationManager && collaborationManager.isInitialized) {
              collaborationManager.clearUndoHistory();
            }
          }, 200);
        }
      }
    }

    // Create UI buttons
    setupUIButtons();

    // Lay out buttons neatly
    layoutMenuButtons();

    // Hide menu buttons initially
    hideMenuButtons();

    // Start autosave timer
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

    // Check for collaboration room in URL (roomId already declared above)
    if (roomId) {
      initializeCollaboration(roomId);
    }
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
function setupUIButtons() {
  saveButton = createButton('Save');
  saveButton.position(100, 10);
  saveButton.mousePressed(() => mindMap.save());

  loadButton = createButton('Load');
  loadButton.position(160, 10);
  loadButton.mousePressed(triggerFileLoad);

  exportPNGButton = createButton('Export PNG');
  exportPNGButton.position(220, 10);
  exportPNGButton.mousePressed(exportPNG);

  exportPDFButton = createButton('Export PDF');
  exportPDFButton.position(330, 10);
  exportPDFButton.mousePressed(exportPDF);

  exportTextButton = createButton('Export Text');
  exportTextButton.position(430, 10);
  exportTextButton.mousePressed(exportText);

  keyboardControlsButton = createButton('Keyboard Controls');
  keyboardControlsButton.position(530, 10);
  keyboardControlsButton.mousePressed(toggleKeyboardControlsOverlay);
  keyboardControlsButton.attribute('aria-expanded', 'false');

  inviteButton = createButton('Start Collaboration');
  inviteButton.position(680, 10);
  inviteButton.mousePressed(shareSession);
  inviteButton.style('background-color', '#4caf50');
  inviteButton.style('color', 'white');

  // Display name input - shown when connected to a room
  // Styled to match buttons visually
  displayNameInput = createInput('');
  displayNameInput.attribute('placeholder', 'Your name...');
  displayNameInput.style('width', '110px');
  displayNameInput.style('height', '19px');
  displayNameInput.style('padding', '2px 8px');
  displayNameInput.style('border', 'none');
  displayNameInput.style('border-radius', '3px');
  displayNameInput.style('background', '#555');
  displayNameInput.style('color', '#fff');
  displayNameInput.style('font-size', '13px');
  displayNameInput.style('font-family', 'inherit');
  displayNameInput.style('display', 'none');
  displayNameInput.style('box-sizing', 'border-box');
  displayNameInput.position(800, 10);

  // Handle Enter key to update name, and stop propagation for all keys
  if (displayNameInput.elt) {
    // Stop all keyboard events from reaching the mindmap while input is focused
    displayNameInput.elt.addEventListener('keydown', (e) => {
      e.stopPropagation(); // Prevent mindmap from receiving key events

      if (e.key === 'Enter') {
        e.preventDefault();
        const newName = displayNameInput.value().trim();
        if (newName && collaborationManager) {
          collaborationManager.setUserName(newName);
        }
        // Clear input and show updated name in placeholder
        displayNameInput.value('');
        if (collaborationManager && collaborationManager.getUserName) {
          displayNameInput.attribute('placeholder', collaborationManager.getUserName());
        }
        displayNameInput.elt.blur(); // Remove focus after submission
      } else if (e.key === 'Escape') {
        // Cancel editing on Escape
        displayNameInput.value('');
        displayNameInput.elt.blur();
      }
    });

    // Also stop keyup and keypress to be thorough
    displayNameInput.elt.addEventListener('keyup', (e) => e.stopPropagation());
    displayNameInput.elt.addEventListener('keypress', (e) => e.stopPropagation());
  }

  setupKeyboardControlsOverlay();

  // Ensure overlay sizing updates when the window resizes
  addTrackedEventListener(window, 'resize', () => {
    try { updateKeyboardOverlaySize(); } catch (_) { }
  });
  // Set initial size based on current viewport
  try { updateKeyboardOverlaySize(); } catch (_) { }

  // Create hidden file input for loading
  fileInput = createFileInput(handleFileLoad);
  fileInput.position(-200, -200);
  fileInput.style('display', 'none');
}

/**
 * p5.js draw function - renders the mind map and UI every frame
 */
function draw() {
  background(UI_COLORS.BACKGROUND);
  updateMenuVisibility();

  if (mindMap) {
    try {
      // Draw scene with camera transform
      push();
      translate(camX, camY);
      scale(zoom);
      mindMap.draw();

      // Draw selection rectangle if selecting multiple boxes
      // Draw selection rectangle if selecting multiple boxes
      if (isSelectingMultiple) {
        drawSelectionRectangle();
      }

      // Draw remote users' cursors (in world space)
      if (typeof collaborationManager !== 'undefined' && collaborationManager && typeof collaborationManager.updateCursors === 'function') {
        collaborationManager.updateCursors();
      }

      if (typeof drawRemoteCursors === 'function') {
        drawRemoteCursors();
      }
      pop();

      // Update our presence (cursor position, selection) throttled
      if (typeof updateCollaborationPresence === 'function') {
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
    fill(overlay.text);
    textAlign(CENTER, CENTER);
    textSize(20);
    text('Loading map...', width / 2, height / 2 - 10);

    // Small spinner below the text
    push();
    translate(width / 2, height / 2 + 18);
    rotate(frameCount * 0.08);
    stroke(overlay.spinner);
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
    // Semi-transparent overlay
    fill(40, 40, 60, 180);
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
      mainMessage = 'Waiting for sync';
      subMessage = 'Looking for peers with map data...';
    } else {
      mainMessage = 'Synchronizing';
      subMessage = 'Please wait...';
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

    // Spinner or refresh prompt
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
}

/**
 * Updates the mouse cursor based on what the user is hovering over.
 * Sets appropriate cursors for resizing, moving, editing, and other interactions.
 */
function updateCursorForHover() {
  if (!mindMap || !mindMap.boxes) { cursor('default'); return; }
  const validMouse = Number.isFinite(mouseX) && Number.isFinite(mouseY);
  if (!validMouse) { cursor('default'); return; }

  // Panning cursor states (only when spacebar is held)
  const isEditing = mindMap.selectedBox && mindMap.selectedBox.isEditing;
  const hasMulti = mindMap.selectedBoxes && mindMap.selectedBoxes.size > 0;
  const noSelection = !mindMap.selectedBox && !mindMap.selectedConnection && !hasMulti;
  if (mindMap.draggingConnection) { cursor('grabbing'); return; }
  if (isPanning) { cursor('grabbing'); return; }

  if (!isEditing && keyIsDown(32)) { cursor('grab'); return; }

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
      if (typeof mindMap.pushUndo !== 'function') return;
      mindMap.pushUndo();
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

/**
 * Compress and downscale an image File to a DataURL.
 * Returns a Promise<string> that resolves to a data URL (e.g. "data:image/webp;base64,...").
 * Uses createImageBitmap + canvas drawing to avoid creating a DOM Image element.
 */
async function compressImageFile(file, {
  maxWidth = 1600,
  maxHeight = 1600,
  quality = 0.75,
  mimeType = 'image/webp'
} = {}) {
  if (!file) throw new Error('No file');

  // Determine supported output type
  try {
    const testCanvas = document.createElement('canvas');
    const webpSupported = testCanvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    if (!webpSupported && mimeType === 'image/webp') mimeType = 'image/jpeg';
  } catch (_) { if (mimeType === 'image/webp') mimeType = 'image/jpeg'; }

  // Use createImageBitmap where available (more efficient and avoids layout)
  const bitmap = await createImageBitmap(file);
  try {
    let w = bitmap.width;
    let h = bitmap.height;
    const ratio = Math.min(1, maxWidth / w, maxHeight / h);
    const targetW = Math.max(1, Math.round(w * ratio));
    const targetH = Math.max(1, Math.round(h * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);

    // Return data URL (base64).
    return canvas.toDataURL(mimeType, quality);
  } finally {
    if (bitmap && typeof bitmap.close === 'function') bitmap.close();
  }
}

/**
 * Convert a data: URL (PNG/JPEG/etc) to a downscaled WebP data URL.
 * Returns Promise<string> data URL.
 */
async function convertDataUrlToWebP(dataUrl, {
  maxWidth = 1600,
  maxHeight = 1600,
  quality = 0.75,
  mimeType = 'image/webp'
} = {}) {
  if (!dataUrl || typeof dataUrl !== 'string') throw new Error('Invalid dataUrl');

  // If already webp, optionally still downscale; but skip quick-convert if already webp
  if (dataUrl.startsWith('data:image/webp')) {
    // Still attempt to downscale if huge by decoding the blob
    try {
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      return await _bitmapToDataUrl(blob, maxWidth, maxHeight, quality, mimeType);
    } catch (e) {
      return dataUrl;
    }
  }

  // Convert data URL to blob via fetch (works for data: URLs)
  const resp = await fetch(dataUrl);
  const blob = await resp.blob();
  return await _bitmapToDataUrl(blob, maxWidth, maxHeight, quality, mimeType);
}

async function _bitmapToDataUrl(blob, maxWidth, maxHeight, quality, mimeType) {
  const bitmap = await createImageBitmap(blob);
  try {
    let w = bitmap.width;
    let h = bitmap.height;
    const ratio = Math.min(1, maxWidth / w, maxHeight / h);
    const targetW = Math.max(1, Math.round(w * ratio));
    const targetH = Math.max(1, Math.round(h * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);

    // Ensure webp support, otherwise fall back to jpeg
    try {
      const test = canvas.toDataURL('image/webp');
      if (test.indexOf('data:image/webp') !== 0) mimeType = 'image/jpeg';
    } catch (_) { mimeType = 'image/jpeg'; }

    return canvas.toDataURL(mimeType, quality);
  } finally {
    if (bitmap && typeof bitmap.close === 'function') bitmap.close();
  }
}

function handleNativeCut(e) {
  try {
    if (!mindMap || !mindMap.selectedBox || !mindMap.selectedBox.isEditing) return;
    const text = mindMap.selectedBox.getSelectedText ? mindMap.selectedBox.getSelectedText() : '';
    if (text && e && e.clipboardData && typeof e.clipboardData.setData === 'function') {
      e.clipboardData.setData('text/plain', text);
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof mindMap.pushUndo === 'function') mindMap.pushUndo();
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
    isPanning = false;
    rightPanActive = false;
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

/**
 * Updates menu visibility based on mouse position.
 * Shows menu when cursor is in trigger area or buttons band.
 */
function updateMenuVisibility() {
  const validMouse = Number.isFinite(mouseX) && Number.isFinite(mouseY);
  const inTrigger = validMouse && mouseX >= 0 && mouseY >= 0 &&
    mouseX <= CONFIG.UI.MENU_TRIGGER_X && mouseY <= CONFIG.UI.MENU_TRIGGER_Y;

  // Menu band extends full width of screen
  const inButtonsBand = validMouse && mouseY >= 0 &&
    mouseY <= CONFIG.UI.BUTTONS_BAND_HEIGHT && mouseX >= 0;

  // Keep menu visible if the display name input has focus
  const inputHasFocus = displayNameInput && displayNameInput.elt &&
    document.activeElement === displayNameInput.elt;

  const shouldShow = inTrigger || inButtonsBand || inputHasFocus;

  if (shouldShow !== menuIsVisible) {
    if (shouldShow) showMenuButtons(); else hideMenuButtons();
    menuIsVisible = shouldShow;
  }
}

/**
 * Shows all menu buttons by setting display style to inline-block
 */
function showMenuButtons() {
  // Guard if setup failed and buttons are not yet created
  if (saveButton && saveButton.style) saveButton.style('display', 'inline-block');
  if (loadButton && loadButton.style) loadButton.style('display', 'inline-block');
  if (exportPNGButton && exportPNGButton.style) exportPNGButton.style('display', 'inline-block');
  if (exportPDFButton && exportPDFButton.style) exportPDFButton.style('display', 'inline-block');
  if (exportTextButton && exportTextButton.style) exportTextButton.style('display', 'inline-block');
  if (keyboardControlsButton && keyboardControlsButton.style) keyboardControlsButton.style('display', 'inline-block');
  if (inviteButton && inviteButton.style) inviteButton.style('display', 'inline-block');
  // Show display name input only when connected
  if (collaborationManager && collaborationManager.isConnected) {
    if (displayNameInput && displayNameInput.style) displayNameInput.style('display', 'inline-block');
  }
}

/**
 * Hides all menu buttons by setting display style to none
 */
function hideMenuButtons() {
  if (saveButton && saveButton.style) saveButton.style('display', 'none');
  if (loadButton && loadButton.style) loadButton.style('display', 'none');
  if (exportPNGButton && exportPNGButton.style) exportPNGButton.style('display', 'none');
  if (exportPDFButton && exportPDFButton.style) exportPDFButton.style('display', 'none');
  if (exportTextButton && exportTextButton.style) exportTextButton.style('display', 'none');
  if (keyboardControlsButton && keyboardControlsButton.style) keyboardControlsButton.style('display', 'none');
  if (inviteButton && inviteButton.style) inviteButton.style('display', 'none');
  if (displayNameInput && displayNameInput.style) displayNameInput.style('display', 'none');
}

/**
 * Positions all menu buttons horizontally with proper spacing.
 * Order: Load, Save, Export PNG, Export PDF, Export Text, Keyboard Controls
 */
function layoutMenuButtons() {
  const startX = CONFIG.UI.BUTTON_START_X;
  const y = CONFIG.UI.BUTTON_Y;
  const gap = CONFIG.UI.BUTTON_GAP;

  // Ensure buttons are displayed to get proper widths
  loadButton.style('display', 'inline-block');
  saveButton.style('display', 'inline-block');
  exportPNGButton.style('display', 'inline-block');
  exportPDFButton.style('display', 'inline-block');
  exportTextButton.style('display', 'inline-block');
  keyboardControlsButton.style('display', 'inline-block');

  const w = (el) => (el && el.elt && el.elt.offsetWidth) ? el.elt.offsetWidth : 100;

  let x = startX;
  loadButton.position(x, y); x += w(loadButton) + gap;
  saveButton.position(x, y); x += w(saveButton) + gap;
  exportPNGButton.position(x, y); x += w(exportPNGButton) + gap;
  exportPDFButton.position(x, y); x += w(exportPDFButton) + gap;
  exportTextButton.position(x, y); x += w(exportTextButton) + gap;
  keyboardControlsButton.position(x, y); x += w(keyboardControlsButton) + gap;

  if (inviteButton) {
    // Check if collaboration is active to update text/style
    if (collaborationManager && collaborationManager.isConnected) {
      inviteButton.html('Share Link');
      inviteButton.style('background-color', '#2196f3');
    } else {
      inviteButton.html('Start Collaboration');
      inviteButton.style('background-color', '#4caf50');
    }
    inviteButton.style('display', 'inline-block');
    inviteButton.position(x, y); x += w(inviteButton) + gap;
  }

  // Display name input - only show and position when connected
  if (displayNameInput && collaborationManager && collaborationManager.isConnected) {
    displayNameInput.style('display', 'inline-block');
    // Set placeholder to current name if input is empty
    if (!displayNameInput.value() && collaborationManager.getUserName) {
      displayNameInput.attribute('placeholder', collaborationManager.getUserName() || 'Your name...');
    }
    displayNameInput.position(x, y); x += 120 + gap;
  } else if (displayNameInput) {
    displayNameInput.style('display', 'none');
  }

  // Update the hover band to cover to the right of the last button
  menuRightEdge = x + 10;
}

function setupKeyboardControlsOverlay() {
  if (keyboardOverlay) return;

  keyboardOverlay = createDiv();
  keyboardOverlay.id('keyboard-controls-overlay');
  keyboardOverlay.style('position', 'fixed');
  keyboardOverlay.style('top', '0');
  keyboardOverlay.style('left', '0');
  keyboardOverlay.style('width', '100%');
  keyboardOverlay.style('height', '100%');
  keyboardOverlay.style('padding', '24px');
  keyboardOverlay.style('background', 'rgba(0, 0, 0, 0.55)');
  keyboardOverlay.style('display', 'none');
  keyboardOverlay.style('align-items', 'center');
  keyboardOverlay.style('justify-content', 'center');
  keyboardOverlay.style('z-index', '1000');
  keyboardOverlay.style('box-sizing', 'border-box');

  if (keyboardOverlay.elt) {
    overlayClickHandler = (event) => {
      if (event.target === keyboardOverlay.elt) {
        hideKeyboardControlsOverlay();
      }
    };
    keyboardOverlay.elt.addEventListener('click', overlayClickHandler);
  }

  keyboardOverlayContent = createDiv();
  keyboardOverlayContent.parent(keyboardOverlay);
  keyboardOverlayContent.id('keyboard-controls-overlay-content');
  keyboardOverlayContent.style('background', '#ffffff');
  keyboardOverlayContent.style('padding', '24px 32px');
  keyboardOverlayContent.style('border-radius', '8px');
  keyboardOverlayContent.style('max-width', '520px');
  keyboardOverlayContent.style('width', '100%');
  // Make the overlay responsive to viewport size and allow scrolling when needed
  // Keep the overlay intentionally narrower so lines wrap earlier
  // Let the content determine its width (shrink-to-fit) but cap at viewport width
  keyboardOverlayContent.style('max-width', Math.min(560, window.innerWidth - 48) + 'px');
  keyboardOverlayContent.style('width', 'auto');
  keyboardOverlayContent.style('display', 'inline-block');
  keyboardOverlayContent.style('max-height', 'calc(100vh - 48px)');
  keyboardOverlayContent.style('overflow-y', 'auto');
  keyboardOverlayContent.style('color', '#222222');
  keyboardOverlayContent.style('box-shadow', '0 16px 40px rgba(0, 0, 0, 0.35)');
  keyboardOverlayContent.style('box-sizing', 'border-box');
  keyboardOverlayContent.style('font-family', 'sans-serif');
  // Slightly reduce the overall font size so more shortcuts fit without changing layout
  keyboardOverlayContent.style('font-size', '13px');

  if (keyboardOverlayContent.elt) {
    overlayContentClickHandler = (event) => {
      event.stopPropagation();
    };
    keyboardOverlayContent.elt.addEventListener('click', overlayContentClickHandler);
  }

  populateKeyboardControlsOverlay();
}

function populateKeyboardControlsOverlay() {
  if (!keyboardOverlayContent) return;

  keyboardOverlayContent.html('');

  const title = createElement('h2', 'Open Mind    <span style="font-size: 0.6em; color: grey;">Christian Nold, 2025</span>');
  title.parent(keyboardOverlayContent);
  title.style('margin', '0 0 12px 0');
  title.style('font-size', '20px');
  title.style('font-weight', '600');

  const hint = createElement('p');
  hint.html('Timed autosaves to browser. Box hierarchy: <span style="color: red;">Red</span> > <span style="color: orange;">Orange</span> > White');
  hint.parent(keyboardOverlayContent);
  hint.style('margin', '0 0 18px 0');
  hint.style('font-size', '13px');
  hint.style('color', '#555555');

  const shortcuts = [
    { keys: 'N', description: 'Create new box' },
    { keys: 'C', description: 'Create connection from selected box' },
    { keys: '1 / 2 / 3', description: 'Set box color (Red / Orange / White)' },
    { keys: 'Backspace/Delete', description: 'Delete selected boxes or connections' },
    { keys: 'Space', description: 'Reverse the selected connection' },
    { keys: 'Shift + Click', description: 'Add and remove from selection' },
    { keys: 'A', description: 'Align selected boxes to the left (Shift+A distributes vertically)' },
    { keys: 'S', description: 'Align selected boxes to the bottom (Shift+S distributes horizontally)' },
    { keys: 'D', description: 'Align selected boxes to the right (Shift+D distributes vertically)' },
    { keys: 'W', description: 'Align selected boxes to the top (Shift+W distributes horizontally)' },
    { keys: 'Q', description: 'Align selected boxes to the horizontal centre (Shift+Q distributes horizontally)' },
    { keys: 'E', description: 'Align selected boxes to the vertical centre (Shift+E distributes vertically)' },
    { keys: 'R', description: 'Apply hierarchical layout in place (keep current position)' },
    { keys: 'Arrow Keys', description: 'Navigate between boxes' },
    { keys: 'Space/Right Mouse', description: 'Pan the canvas' },
    { keys: 'Scroll Wheel', description: 'Zoom in and out' },
    { keys: 'F', description: 'Toggle fullscreen view' },
    { keys: '-', description: 'Fit and center the entire map' },
    { keys: '+', description: 'Zoom to selected elements' },
    { keys: 'Cmd/Ctrl + Click', description: 'Open hyperlink in new tab' },
    { keys: 'Cmd/Ctrl + C / V', description: 'Copy or paste text or boxes' },
    { keys: 'Cmd/Ctrl + X', description: 'Cut selected text while editing' },
    { keys: 'Cmd/Ctrl + B', description: 'Highlight selected text' },
    { keys: 'Cmd/Ctrl + Z', description: 'Undo the last change' },
    { keys: 'Cmd/Ctrl + S', description: 'Save the mind map as JSON' },
    { keys: 'Cmd/Ctrl + L', description: 'Load a mind map from file' }
  ];

  for (const item of shortcuts) {
    const row = createDiv();
    row.parent(keyboardOverlayContent);
    row.style('display', 'flex');
    row.style('align-items', 'flex-start');
    // Increase gap between key column and description column
    row.style('gap', '24px');
    row.style('margin-bottom', '8px');
    row.style('font-size', '13px');

    const keyLabel = createSpan(item.keys);
    keyLabel.parent(row);
    keyLabel.style('font-family', 'monospace');
    keyLabel.style('font-weight', '600');
    // Use a fixed column width so the left column doesn't push the right column
    // Slightly reduce label column width to better fit a narrower overlay
    keyLabel.style('flex', '0 0 120px');
    keyLabel.style('min-width', '100px');
    keyLabel.style('white-space', 'nowrap');
    keyLabel.style('font-size', '13px');
    keyLabel.style('text-align', 'right');

    const description = createSpan(item.description);
    description.parent(row);
    // Allow the description column to flex and wrap without being pushed by the label
    description.style('flex', '1');
    description.style('min-width', '0');
    description.style('font-size', '13px');
  }

  const closeButton = createButton('Close');
  closeButton.parent(keyboardOverlayContent);
  closeButton.style('margin-top', '20px');
  closeButton.style('align-self', 'flex-end');
  closeButton.style('padding', '6px 14px');
  closeButton.style('font-size', '14px');
  closeButton.style('cursor', 'pointer');
  closeButton.mousePressed(hideKeyboardControlsOverlay);
}

function showKeyboardControlsOverlay() {
  if (!keyboardOverlay) return;
  keyboardOverlay.style('display', 'flex');
  // Recompute sizing for current viewport so content fits
  try { updateKeyboardOverlaySize(); } catch (_) { }
  keyboardOverlayVisible = true;
  if (keyboardControlsButton && keyboardControlsButton.attribute) {
    keyboardControlsButton.attribute('aria-expanded', 'true');
  }
}

function hideKeyboardControlsOverlay() {
  if (!keyboardOverlay) return;
  keyboardOverlay.style('display', 'none');
  keyboardOverlayVisible = false;
  if (keyboardControlsButton && keyboardControlsButton.attribute) {
    keyboardControlsButton.attribute('aria-expanded', 'false');
  }
}

// Update overlay content size to fit viewport. Public so we can call on resize.
function updateKeyboardOverlaySize() {
  if (!keyboardOverlayContent) return;
  try {
    const minWidth = 360;
    // Only cap width; allow actual width to be content-driven (auto)
    const maxWidth = Math.min(900, Math.max(220, window.innerWidth - 48));
    keyboardOverlayContent.style('max-width', maxWidth + 'px');
    keyboardOverlayContent.style('width', 'auto');
    keyboardOverlayContent.style('min-width', '0');

    const minHeight = 120;
    const maxHeight = Math.max(minHeight, window.innerHeight - 48);
    keyboardOverlayContent.style('max-height', maxHeight + 'px');
  } catch (e) {
    // ignore
  }
}

function toggleKeyboardControlsOverlay() {
  if (keyboardOverlayVisible) {
    hideKeyboardControlsOverlay();
  } else {
    showKeyboardControlsOverlay();
  }
}

// ============================================================================
// MOBILE NAVIGATION OVERLAY
// ============================================================================

/**
 * Detects if the current device supports touch events or has a mobile-sized screen
 * @returns {boolean} true if touch is supported or mobile-sized
 */
function detectTouchDevice() {
  const hasTouchEvents = (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    navigator.msMaxTouchPoints > 0
  );
  const hasCoarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const isMobileSize = window.innerWidth <= 768 || window.innerHeight <= 500;

  return hasTouchEvents || hasCoarsePointer || isMobileSize;
}

/**
 * Sets up the mobile navigation overlay with up/down buttons
 */
function setupMobileNavigation() {
  try {
    isTouchDevice = detectTouchDevice();

    // Create overlay container for mobile navigation buttons
    mobileNavOverlay = createDiv();
    mobileNavOverlay.id('mobile-nav-overlay');
    mobileNavOverlay.style('position', 'fixed');
    mobileNavOverlay.style('bottom', '20px');
    mobileNavOverlay.style('left', '20px');
    mobileNavOverlay.style('display', 'flex');
    mobileNavOverlay.style('flex-direction', 'column');
    mobileNavOverlay.style('gap', '10px');
    mobileNavOverlay.style('z-index', '999');
    mobileNavOverlay.style('pointer-events', 'auto');
    // Initially show only on touch devices
    mobileNavOverlay.style('opacity', isTouchDevice ? '1' : '0');
    mobileNavOverlay.style('visibility', isTouchDevice ? 'visible' : 'hidden');
    mobileNavOverlay.style('transition', 'opacity 0.3s ease');

    // Common button styles
    const buttonSize = 56;
    const buttonStyle = {
      width: buttonSize + 'px',
      height: buttonSize + 'px',
      borderRadius: '50%',
      border: '2px solid rgba(100, 100, 100, 0.5)',
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      color: '#333',
      fontSize: '24px',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
      userSelect: 'none',
      WebkitUserSelect: 'none',
      touchAction: 'manipulation'
    };

    // Create Up button (navigate to previous box)
    mobileNavUpButton = createButton('▲');
    mobileNavUpButton.parent(mobileNavOverlay);
    mobileNavUpButton.id('mobile-nav-up');
    applyButtonStyles(mobileNavUpButton, buttonStyle);
    mobileNavUpButton.attribute('aria-label', 'Navigate to previous box');

    // Create Down button (navigate to next box)
    mobileNavDownButton = createButton('▼');
    mobileNavDownButton.parent(mobileNavOverlay);
    mobileNavDownButton.id('mobile-nav-down');
    applyButtonStyles(mobileNavDownButton, buttonStyle);
    mobileNavDownButton.attribute('aria-label', 'Navigate to next box');

    // Add touch event handlers for smooth navigation
    setupMobileNavButtonEvents(mobileNavUpButton, 'up');
    setupMobileNavButtonEvents(mobileNavDownButton, 'down');

    // Handle orientation changes
    addTrackedEventListener(window, 'resize', updateMobileNavPosition);
    addTrackedEventListener(window, 'orientationchange', updateMobileNavPosition);

    // Initial position update
    updateMobileNavPosition();

  } catch (e) {
    console.warn('Failed to setup mobile navigation:', e);
  }
}

/**
 * Applies styles to a p5.js button element
 * @param {Object} button - p5.js button element
 * @param {Object} styles - Style object
 */
function applyButtonStyles(button, styles) {
  if (!button || !button.style) return;
  for (const [key, value] of Object.entries(styles)) {
    button.style(key, value);
  }
}

/**
 * Sets up touch and mouse event handlers for mobile navigation buttons
 * @param {Object} button - p5.js button element
 * @param {string} direction - 'up' or 'down'
 */
function setupMobileNavButtonEvents(button, direction) {
  if (!button || !button.elt) return;

  const navigateAction = () => {
    if (!mindMap) return;

    // Use the existing navigateBoxes method which handles smooth animation
    if (direction === 'up') {
      mindMap.navigateBoxes(UP_ARROW);
    } else if (direction === 'down') {
      mindMap.navigateBoxes(DOWN_ARROW);
    }
  };

  // Touch start handler with visual feedback
  const handleTouchStart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    button.style('backgroundColor', 'rgba(100, 150, 255, 0.9)');
    button.style('transform', 'scale(0.95)');
  };

  // Touch end handler
  const handleTouchEnd = (e) => {
    e.preventDefault();
    e.stopPropagation();
    button.style('backgroundColor', 'rgba(255, 255, 255, 0.9)');
    button.style('transform', 'scale(1)');
    navigateAction();
  };

  // Mouse handlers for desktop testing
  const handleMouseDown = (e) => {
    button.style('backgroundColor', 'rgba(100, 150, 255, 0.9)');
    button.style('transform', 'scale(0.95)');
  };

  const handleMouseUp = (e) => {
    button.style('backgroundColor', 'rgba(255, 255, 255, 0.9)');
    button.style('transform', 'scale(1)');
  };

  // Mouse click for non-touch interaction
  button.mousePressed(() => {
    navigateAction();
  });

  // Touch events for mobile
  addTrackedEventListener(button.elt, 'touchstart', handleTouchStart, { passive: false });
  addTrackedEventListener(button.elt, 'touchend', handleTouchEnd, { passive: false });
  addTrackedEventListener(button.elt, 'touchcancel', handleTouchEnd, { passive: false });

  // Mouse events for visual feedback
  addTrackedEventListener(button.elt, 'mousedown', handleMouseDown);
  addTrackedEventListener(button.elt, 'mouseup', handleMouseUp);
  addTrackedEventListener(button.elt, 'mouseleave', handleMouseUp);

  // Add transition for smooth button feedback
  button.style('transition', 'background-color 0.15s ease, transform 0.15s ease');
}

/**
 * Updates mobile navigation position based on screen orientation and size
 */
function updateMobileNavPosition() {
  if (!mobileNavOverlay) return;

  try {
    // Re-check if we should show/hide based on screen size
    const shouldShow = detectTouchDevice();

    if (shouldShow) {
      mobileNavOverlay.style('opacity', '1');
      mobileNavOverlay.style('visibility', 'visible');
    } else {
      mobileNavOverlay.style('opacity', '0');
      mobileNavOverlay.style('visibility', 'hidden');
    }

    // Check current orientation
    const isPortrait = window.innerHeight > window.innerWidth;

    // Adjust position based on orientation and safe areas
    const safeBottom = 20;
    const safeLeft = 20;

    // Position remains in bottom-left for both orientations
    mobileNavOverlay.style('bottom', safeBottom + 'px');
    mobileNavOverlay.style('left', safeLeft + 'px');

    // Optionally adjust button size for smaller screens
    const screenMin = Math.min(window.innerWidth, window.innerHeight);
    let buttonSize = 56;
    if (screenMin < 400) {
      buttonSize = 48;
    }

    if (mobileNavUpButton) {
      mobileNavUpButton.style('width', buttonSize + 'px');
      mobileNavUpButton.style('height', buttonSize + 'px');
    }
    if (mobileNavDownButton) {
      mobileNavDownButton.style('width', buttonSize + 'px');
      mobileNavDownButton.style('height', buttonSize + 'px');
    }
  } catch (e) {
    console.warn('Failed to update mobile nav position:', e);
  }
}

/**
 * Shows the mobile navigation overlay
 */
function showMobileNavOverlay() {
  if (!mobileNavOverlay) return;
  mobileNavOverlay.style('opacity', '1');
  mobileNavOverlay.style('visibility', 'visible');
}

/**
 * Hides the mobile navigation overlay
 */
function hideMobileNavOverlay() {
  if (!mobileNavOverlay) return;
  mobileNavOverlay.style('opacity', '0');
  mobileNavOverlay.style('visibility', 'hidden');
}

// ============================================================================
// MOUSE AND KEYBOARD INPUT HANDLERS
// ============================================================================

/**
 * Handles mouse press events
 */
function mousePressed(e) {
  if (keyboardOverlayVisible) return false;

  // Ignore clicks on UI elements (buttons, inputs, etc.)
  // Only handle clicks directly on the canvas
  if (e && e.target && e.target.tagName !== 'CANVAS') {
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
      if ((spaceHeld && !isEditing) || (rightDown && noSelection && !isEditing)) {
        isPanning = true;
        panStartMouseX = mouseX;
        panStartMouseY = mouseY;
        panStartCamX = camX;
        panStartCamY = camY;
        rightPanActive = !!rightDown;
        return false;
      }

      // Multi-box selection when clicking in empty space with no box selected
      if (noSelection && !isEditing && !overAny) {
        isSelectingMultiple = true;
        selectionStartX = worldMouseX();
        selectionStartY = worldMouseY();
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
  if (keyboardOverlayVisible) return false;
  if (isPanning) {
    // If we were panning with right mouse, suppress the subsequent right-click action if it moved
    if (rightPanActive) {
      const dx = mouseX - panStartMouseX;
      const dy = mouseY - panStartMouseY;
      if (dx * dx + dy * dy > 9) { // >3px movement
        suppressNextRightClick = true;
      }
    }
    isPanning = false;
    rightPanActive = false;
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
  if (keyboardOverlayVisible) return false;
  if (isPanning) {
    // Screen-space pan with soft limits
    camX = panStartCamX + (mouseX - panStartMouseX);
    camY = panStartCamY + (mouseY - panStartMouseY);
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

/**
 * Handles key press events
 */
function keyPressed() {
  if (keyboardOverlayVisible) {
    const escapeCode = (typeof ESCAPE !== 'undefined') ? ESCAPE : 27;
    if (keyCode === escapeCode || key === 'Escape') {
      hideKeyboardControlsOverlay();
    }
    return false;
  }
  if (mindMap) {
    try {
      // Handle CMD/CTRL modifier key
      const isCmd = keyIsDown(91) || keyIsDown(93) || keyIsDown(17);
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
        if (collaborationManager && collaborationManager.canRedo()) {
          collaborationManager.redo();
        }
        return false; // prevent browser redo
      }

      // Handle CMD/CTRL+Z for undo at the top level (only when Shift is NOT pressed)
      if (isCmd && (key === 'z' || key === 'Z') && !isShift) {
        // Always use collaborationManager for undo (unified undo system)
        if (collaborationManager && collaborationManager.canUndo()) {
          collaborationManager.undo();
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
    if (!hasModifier && (key === 'n' || key === 'N')) {
      createNewBox();
      return false;
    }
    // Reset view: press - (or _) or Home key
    if (!hasModifier && (key === '-' || key === '_' || keyCode === 36)) {
      resetView();
      return false;
    }
    // Maximum zoom: press = (or +)
    if (!hasModifier && (key === '=' || key === '+')) {
      setMaxZoom();
      return false;
    }
    // Left-align selected boxes: press A key
    if (!hasModifier && (key === 'a' || key === 'A')) {
      if (mindMap.selectedBoxes && mindMap.selectedBoxes.size > 0 && mindMap.pushUndo && mindMap.leftAlignSelectedBoxes) {
        mindMap.pushUndo();
        mindMap.leftAlignSelectedBoxes();
        if (keyIsDown(16) && mindMap.distributeSelectedBoxesVertically) {
          mindMap.distributeSelectedBoxesVertically();
        }
      }
      return false;
    }
    // Bottom-align selected boxes: press S key
    if (!hasModifier && (key === 's' || key === 'S')) {
      if (mindMap.selectedBoxes && mindMap.selectedBoxes.size > 0 && mindMap.pushUndo && mindMap.bottomAlignSelectedBoxes) {
        mindMap.pushUndo();
        mindMap.bottomAlignSelectedBoxes();
        if (keyIsDown(16) && mindMap.distributeSelectedBoxesHorizontally) {
          mindMap.distributeSelectedBoxesHorizontally();
        }
      }
      return false;
    }
    // Right-align selected boxes: press D key
    if (!hasModifier && (key === 'd' || key === 'D')) {
      if (mindMap.selectedBoxes && mindMap.selectedBoxes.size > 0 && mindMap.pushUndo && mindMap.rightAlignSelectedBoxes) {
        mindMap.pushUndo();
        mindMap.rightAlignSelectedBoxes();
        if (keyIsDown(16) && mindMap.distributeSelectedBoxesVertically) {
          mindMap.distributeSelectedBoxesVertically();
        }
      }
      return false;
    }
    // Top-align selected boxes: press W key
    if (!hasModifier && (key === 'w' || key === 'W')) {
      if (mindMap.selectedBoxes && mindMap.selectedBoxes.size > 0 && mindMap.pushUndo && mindMap.topAlignSelectedBoxes) {
        mindMap.pushUndo();
        mindMap.topAlignSelectedBoxes();
        if (keyIsDown(16) && mindMap.distributeSelectedBoxesHorizontally) {
          mindMap.distributeSelectedBoxesHorizontally();
        }
      }
      return false;
    }
    // Horizontal center alignment: press Q key
    if (!hasModifier && (key === 'q' || key === 'Q')) {
      if (mindMap.selectedBoxes && mindMap.selectedBoxes.size > 0 && mindMap.pushUndo && mindMap.horizontalCenterAlignSelectedBoxes) {
        mindMap.pushUndo();
        mindMap.horizontalCenterAlignSelectedBoxes();
        if (keyIsDown(16) && mindMap.distributeSelectedBoxesHorizontally) {
          mindMap.distributeSelectedBoxesHorizontally();
        }
      }
      return false;
    }
    // Vertical center alignment: press E key
    if (!hasModifier && (key === 'e' || key === 'E')) {
      if (mindMap.selectedBoxes && mindMap.selectedBoxes.size > 0 && mindMap.pushUndo && mindMap.centerAlignSelectedBoxes) {
        mindMap.pushUndo();
        mindMap.centerAlignSelectedBoxes();
        if (keyIsDown(16) && mindMap.distributeSelectedBoxesVertically) {
          mindMap.distributeSelectedBoxesVertically();
        }
      }
      return false;
    }
    // Hierarchical layout in place: press R key
    if (!hasModifier && (key === 'r' || key === 'R')) {
      if (mindMap.selectedBoxes && mindMap.selectedBoxes.size > 0 && mindMap.pushUndo && mindMap.hierarchicalLayout) {
        mindMap.pushUndo();
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
  if (mindMap.pushUndo) mindMap.pushUndo();

  // Create box at cursor position in world space if over canvas, else at viewport center
  let x, y;

  if (mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height) {
    // Mouse is over canvas (in screen space) - use world position
    x = worldMouseX();
    y = worldMouseY();
  } else {
    // Mouse not over canvas - create at center of current viewport in world space
    // Convert viewport center to world coords
    x = (width / 2 - camX) / zoom;
    y = (height / 2 - camY) / zoom;
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
      if (fileInput && fileInput.elt) {
        fileInput.elt.value = '';
      } else if (fileInput && typeof fileInput.value === 'function') {
        // p5.Element fallback
        fileInput.value('');
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
    const wx = (sx - camX) / zoom;
    const wy = (sy - camY) / zoom;

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
            // Try to load JSON map
            loadMapFromUrl(url).catch(() => {
              createFilePathBox(filePath, wx, wy);
            });
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
    mindMap.pushUndo && mindMap.pushUndo();
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
    mindMap.pushUndo();
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
    mindMap.pushUndo();

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

    // Single undo snapshot for the merge
    mindMap.pushUndo && mindMap.pushUndo();

    // Create new boxes with positional offset so import center maps to drop point
    const offsetX = wx - importCenterX;
    const offsetY = wy - importCenterY;
    for (const b of data.boxes) {
      try {
        const bcopy = Object.assign({}, b);
        bcopy.x = (bcopy.x != null && isFinite(bcopy.x)) ? (bcopy.x + offsetX) : (wx + offsetX);
        bcopy.y = (bcopy.y != null && isFinite(bcopy.y)) ? (bcopy.y + offsetY) : (wy + offsetY);
        const newBox = TextBox.fromJSON(bcopy);
        if (newBox) {
          mindMap.boxes.push(newBox);
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
          const conn = Connection.fromJSON(mapped, mindMap.boxes);
          if (conn) mindMap.connections.push(conn);
        } catch (e) {
          console.warn('Failed to import connection', e);
        }
      }
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

    mindMap.isDirty = true;
    mindMap.isSaved = false;

    // Sync new boxes to collaboration system
    if (typeof MindMap !== 'undefined' && MindMap.onBoxChange) {
      for (const nb of newBoxes) {
        if (nb && nb.id) {
          MindMap.onBoxChange(nb);
        }
      }
    }
    // Sync connections
    if (typeof MindMap !== 'undefined' && MindMap.onConnectionsChange) {
      MindMap.onConnectionsChange();
    }

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
  }
}

/**
 * Handles mouse wheel events for zooming
 * @param {Object} event - Mouse wheel event
 * @returns {boolean} false to prevent default browser behavior
 */
function mouseWheel(event) {
  if (keyboardOverlayVisible) return false;
  // Only when over the canvas area
  const overCanvas = mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height;
  if (!overCanvas) return;

  // Compute world point under mouse before zoom
  const wx = worldMouseX();
  const wy = worldMouseY();

  // Zoom in (negative deltaY) or out (positive)
  const factor = event.deltaY < 0 ? CONFIG.ZOOM.STEP : 1 / CONFIG.ZOOM.STEP;
  const newZoom = constrain(zoom * factor, CONFIG.ZOOM.MIN, CONFIG.ZOOM.MAX);

  // Adjust camera to keep the world point under the cursor stationary
  camX = mouseX - wx * newZoom;
  camY = mouseY - wy * newZoom;
  zoom = newZoom;

  // Prevent page scroll
  return false;
}

// ============================================================================
// CAMERA AND VIEW CONTROL
// ============================================================================

/**
 * Gets the bounding box of all content in world space
 * @returns {Object} Bounds with minX, maxX, minY, maxY properties
 */
function getContentBounds() {
  if (!mindMap || !mindMap.boxes || mindMap.boxes.length === 0) {
    return { minX: 0, maxX: width, minY: 0, maxY: height };
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let box of mindMap.boxes) {
    if (!box) continue;
    const left = box.x - box.width / 2;
    const right = box.x + box.width / 2;
    const top = box.y - box.height / 2;
    const bottom = box.y + box.height / 2;

    minX = min(minX, left);
    maxX = max(maxX, right);
    minY = min(minY, top);
    maxY = max(maxY, bottom);
  }

  return { minX, maxX, minY, maxY };
}

function getSelectionBounds() {
  if (!mindMap) return null;

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

  if (mindMap.selectedBoxes && mindMap.selectedBoxes.size > 0) {
    for (const box of mindMap.selectedBoxes) {
      considerBox(box);
    }
  } else if (mindMap.selectedBox) {
    considerBox(mindMap.selectedBox);
  }

  if (mindMap.selectedConnections && mindMap.selectedConnections.size > 0) {
    for (const conn of mindMap.selectedConnections) {
      considerConnection(conn);
    }
  } else if (mindMap.selectedConnection) {
    considerConnection(mindMap.selectedConnection);
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
  const minCamX = -bounds.maxX * zoom - margin;
  const maxCamX = -bounds.minX * zoom + width + margin;
  const minCamY = -bounds.maxY * zoom - margin;
  const maxCamY = -bounds.minY * zoom + height + margin;

  camX = constrain(camX, minCamX, maxCamX);
  camY = constrain(camY, minCamY, maxCamY);
}

/**
 * Centers the camera on a specific world position without changing zoom
 * @param {number} worldX - World X coordinate
 * @param {number} worldY - World Y coordinate
 */
function centerCameraOn(worldX, worldY) {
  camX = width / 2 - worldX * zoom;
  camY = height / 2 - worldY * zoom;
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
    camX = 0;
    camY = 0;
    zoom = 1;
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
  zoom = constrain(min(zoomX, zoomY), CONFIG.ZOOM.MIN, CONFIG.ZOOM.MAX);

  // Center the content in viewport
  camX = width / 2 - centerX * zoom;
  camY = height / 2 - centerY * zoom;
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
    zoom = constrain(targetZoom, CONFIG.ZOOM.MIN, CONFIG.ZOOM.MAX);
    const centerX = (selectionBounds.minX + selectionBounds.maxX) / 2;
    const centerY = (selectionBounds.minY + selectionBounds.maxY) / 2;
    centerCameraOn(centerX, centerY);
    return;
  }
  const prevZoom = zoom || 1;
  const worldCenterX = (width / 2 - camX) / prevZoom;
  const worldCenterY = (height / 2 - camY) / prevZoom;
  zoom = CONFIG.ZOOM.MAX;
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
function exportPNG() {
  try {
    // Validate mindMap
    if (!mindMap || !mindMap.boxes || mindMap.boxes.length === 0) {
      alert('No content to export');
      return;
    }

    // Get content bounds in world space
    const bounds = getContentBounds();
    const contentWidth = bounds.maxX - bounds.minX;
    const contentHeight = bounds.maxY - bounds.minY;

    // Add padding
    const padding = CONFIG.EXPORT.PADDING;
    const totalWidth = contentWidth + padding * 2;
    const totalHeight = contentHeight + padding * 2;

    // Create an offscreen graphics buffer at the content size (rounded to integers)
    const bufW = Math.max(1, Math.ceil(totalWidth));
    const bufH = Math.max(1, Math.ceil(totalHeight));
    const pg = createGraphics(bufW, bufH);

    // Calculate the offset to map world space to buffer space
    const offsetX = padding - bounds.minX;
    const offsetY = padding - bounds.minY;

    // Draw the mind map into the buffer
    pg.push();
    pg.translate(offsetX, offsetY);
    pg.background(240);

    // Draw connections
    for (let conn of mindMap.connections) {
      if (!conn || !conn.fromBox || !conn.toBox) continue;

      let start = conn.fromBox.getConnectionPoint(conn.toBox);
      let end = conn.toBox.getConnectionPoint(conn.fromBox);

      if (!start || !end || isNaN(start.x) || isNaN(start.y) || isNaN(end.x) || isNaN(end.y)) {
        continue;
      }

      pg.stroke(80);
      pg.strokeWeight(2);
      pg.line(start.x, start.y, end.x, end.y);

      // Draw arrow
      let angle = Math.atan2(end.y - start.y, end.x - start.x);
      if (!isNaN(angle)) {
        pg.fill(80);
        pg.noStroke();
        pg.push();
        pg.translate(end.x, end.y);
        pg.rotate(angle);
        pg.triangle(0, 0, -10, -5, -10, 5);
        pg.pop();
      }
    }

    // Draw boxes
    for (let box of mindMap.boxes) {
      if (!box) continue;

      if (box.x == null || box.y == null || box.width == null || box.height == null ||
        isNaN(box.x) || isNaN(box.y) || isNaN(box.width) || isNaN(box.height)) {
        continue;
      }

      // Draw box background (use box background color if available)
      if (box.backgroundColor && Number.isFinite(box.backgroundColor.r)) {
        pg.fill(box.backgroundColor.r, box.backgroundColor.g, box.backgroundColor.b);
      } else {
        pg.fill(255);
      }
      pg.stroke(100);
      pg.strokeWeight(1);
      pg.rect(box.x - box.width / 2, box.y - box.height / 2, box.width, box.height, box.cornerRadius);

      // If this box contains an image, draw the image into the export buffer
      if (box.imageUrl) {
        try {
          if (box.imageLoaded && box.img) {
            // Preserve aspect ratio and center the image inside the box
            const iw = (box.naturalImageWidth && box.naturalImageWidth > 0) ? box.naturalImageWidth : box.img.width;
            const ih = (box.naturalImageHeight && box.naturalImageHeight > 0) ? box.naturalImageHeight : box.img.height;
            const scale = Math.min(box.width / iw, box.height / ih);
            const drawW = iw * scale;
            const drawH = ih * scale;
            pg.imageMode(CENTER);
            pg.image(box.img, box.x, box.y, drawW, drawH);
          } else if (box.imageLoadError) {
            pg.fill(240);
            pg.noStroke();
            pg.rect(box.x - box.width / 2 + 4, box.y - box.height / 2 + 4, box.width - 8, box.height - 8, 0);
            pg.fill(120);
            pg.textAlign(CENTER, CENTER);
            pg.textSize(12);
            pg.text('Failed to load image', box.x, box.y);
          } else {
            pg.fill(240);
            pg.noStroke();
            pg.rect(box.x - box.width / 2 + 4, box.y - box.height / 2 + 4, box.width - 8, box.height - 8, 0);
            pg.fill(100);
            pg.textAlign(CENTER, CENTER);
            pg.textSize(12);
            pg.text('Loading image...', box.x, box.y);
          }
        } catch (e) {
          // Fallback placeholder on any drawing error
          pg.fill(220);
          pg.noStroke();
          pg.rect(box.x - box.width / 2 + 4, box.y - box.height / 2 + 4, box.width - 8, box.height - 8, 0);
          pg.fill(80);
          pg.textAlign(CENTER, CENTER);
          pg.textSize(12);
          pg.text('Image', box.x, box.y);
        }
        continue; // skip text drawing for image boxes
      }

      // Draw text
      pg.fill(0);
      pg.noStroke();
      pg.textAlign(LEFT, CENTER);
      pg.textSize(box.fontSize);

      // Use TextBox's wrapText to populate cachedLineCharMap for highlight alignment
      let wrappedLines = (typeof box.wrapText === 'function') ? box.wrapText(box.text || '') : getWrappedLines(box);
      let lineHeight = box.fontSize * (TextBox.LINE_HEIGHT_MULTIPLIER || 1.5);
      let startY = (box.y - box.height / 2) + box.padding + lineHeight / 2;
      let textX = box.x - box.width / 2 + box.padding;

      // Draw highlights behind text
      try {
        if (box.highlights && box.highlights.length > 0 && Array.isArray(wrappedLines)) {
          const textStr = String(box.text || '');
          const map = box.cachedLineCharMap || [];
          const getLinePos = (absPos) => {
            if (!map || map.length === 0) return { lineIndex: 0, posInLine: 0 };
            let idx = 0;
            for (let i = 0; i < map.length; i++) {
              const s = map[i];
              const e = (i < map.length - 1) ? map[i + 1] : textStr.length;
              const last = (i === map.length - 1);
              if ((absPos >= s && absPos < e) || (last && absPos >= s && absPos <= e)) { idx = i; break; }
              if (last) idx = i;
            }
            const posInLine = Math.min(absPos - map[idx], (wrappedLines[idx] || '').length);
            return { lineIndex: idx, posInLine };
          };
          pg.noStroke();
          for (const hl of box.highlights) {
            if (!hl || hl.start == null || hl.end == null) continue;
            const start = Math.max(0, Math.min(textStr.length, Math.floor(hl.start)));
            const end = Math.max(0, Math.min(textStr.length, Math.floor(hl.end)));
            if (end <= start) continue;
            const c = hl.color && typeof hl.color === 'object' ? hl.color : { r: 255, g: 255, b: 0, a: 180 };
            const alpha = (c.a != null) ? c.a : 180;
            pg.fill(c.r, c.g, c.b, alpha);
            const sInfo = getLinePos(start);
            const eInfo = getLinePos(end);
            if (sInfo.lineIndex === eInfo.lineIndex) {
              const lineText = wrappedLines[sInfo.lineIndex] || '';
              const x1 = textX + pg.textWidth(lineText.slice(0, Math.max(0, sInfo.posInLine)));
              const x2 = textX + pg.textWidth(lineText.slice(0, Math.max(0, eInfo.posInLine)));
              const y = startY + sInfo.lineIndex * lineHeight;
              pg.rect(x1, y - lineHeight / 3, Math.max(0, x2 - x1), lineHeight * 0.67);
            } else {
              for (let li = sInfo.lineIndex; li <= eInfo.lineIndex; li++) {
                if (li < 0 || li >= wrappedLines.length) continue;
                const lineText = wrappedLines[li] || '';
                const y = startY + li * lineHeight;
                let x1, x2;
                if (li === sInfo.lineIndex) {
                  x1 = textX + pg.textWidth(lineText.slice(0, Math.max(0, sInfo.posInLine)));
                  x2 = textX + pg.textWidth(lineText);
                } else if (li === eInfo.lineIndex) {
                  x1 = textX;
                  x2 = textX + pg.textWidth(lineText.slice(0, Math.max(0, eInfo.posInLine)));
                } else {
                  x1 = textX;
                  x2 = textX + pg.textWidth(lineText);
                }
                pg.rect(x1, y - lineHeight / 3, Math.max(0, x2 - x1), lineHeight * 0.67);
              }
            }
          }
          pg.fill(0);
        }
      } catch (_) { }

      for (let i = 0; i < wrappedLines.length; i++) {
        if (wrappedLines[i] != null) {
          pg.text(String(wrappedLines[i]), textX, startY + i * lineHeight);
        }
      }
    }

    pg.pop();

    // Save the buffer as PNG by converting to a data URL and downloading
    try {
      const dataUrl = pg.canvas && pg.canvas.toDataURL ? pg.canvas.toDataURL('image/png') : null;
      if (dataUrl) {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = 'mindmap.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else if (typeof saveCanvas === 'function') {
        // Fallback to p5 saveCanvas if available
        saveCanvas(pg, 'mindmap', 'png');
      } else {
        throw new Error('Unable to generate PNG data');
      }
    } catch (e) {
      console.error('Failed to save PNG:', e);
      alert('Failed to save PNG: ' + e.message);
    }
  } catch (e) {
    console.error('Failed to export PNG:', e);
    alert('Failed to export PNG: ' + e.message);
  }
}

// ============================================================================
// TEXT WRAPPING UTILITIES
// ============================================================================

/**
 * Wraps text for a box based on its width, padding, and font size.
 * This shared utility is used for exports (PNG, PDF) since they use offscreen buffers.
 * 
 * @param {Object} box - The text box to wrap text for
 * @returns {Array<string>} Array of wrapped text lines
 */
function getWrappedLines(box) {
  // Validate box and its properties
  if (!box || !box.text || box.width == null || box.padding == null || box.fontSize == null) {
    return [''];
  }

  let lines = String(box.text).split('\n');
  let wrappedLines = [];
  let baseWidth = (box.width != null && isFinite(box.width)) ? box.width : (box.minWidth || 80);
  let maxTextWidth = max(10, baseWidth - box.padding * 2);

  // Set text size to match box font size for accurate measurements
  textSize(box.fontSize);

  for (let line of lines) {
    // Handle empty lines (explicit newlines)
    if (!line || line === '') {
      wrappedLines.push('');
      continue;
    }

    // If line fits within width, add it as-is
    if (textWidth(line) <= maxTextWidth) {
      wrappedLines.push(line);
    } else {
      // Line is too long, wrap by words
      let words = line.split(' ');
      let currentLine = '';

      for (let i = 0; i < words.length; i++) {
        let testLine = currentLine + (currentLine ? ' ' : '') + words[i];

        if (textWidth(testLine) <= maxTextWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) {
            wrappedLines.push(currentLine);
            currentLine = words[i];
          } else {
            // Single word is too long, break it by characters
            let word = words[i];
            let charLine = '';
            for (let char of word) {
              if (textWidth(charLine + char) <= maxTextWidth) {
                charLine += char;
              } else {
                if (charLine) wrappedLines.push(charLine);
                charLine = char;
              }
            }
            currentLine = charLine;
          }
        }
      }

      if (currentLine) {
        wrappedLines.push(currentLine);
      }
    }
  }

  return wrappedLines.length > 0 ? wrappedLines : [''];
}

/**
 * Exports the mind map as a PDF document
 */
async function exportPDF() {
  try {
    // Validate dependencies
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error('jsPDF library not loaded');
    }

    // Validate mindMap and its data
    if (!mindMap || !mindMap.boxes || !mindMap.connections) {
      throw new Error('MindMap not properly initialized');
    }

    if (mindMap.boxes.length === 0) {
      alert('No content to export');
      return;
    }

    // Create PDF using jsPDF
    const { jsPDF } = window.jspdf;

    // Get content bounds in world space
    const bounds = getContentBounds();
    const contentWidth = bounds.maxX - bounds.minX;
    const contentHeight = bounds.maxY - bounds.minY;
    const contentCenterX = (bounds.minX + bounds.maxX) / 2;
    const contentCenterY = (bounds.minY + bounds.maxY) / 2;

    // Add some padding around content
    const padding = CONFIG.EXPORT.PADDING;
    const totalWidth = contentWidth + padding * 2;
    const totalHeight = contentHeight + padding * 2;

    // Choose orientation based on content aspect ratio
    const isLandscape = totalWidth > totalHeight;
    const pdf = new jsPDF({
      orientation: isLandscape ? 'landscape' : 'portrait',
      unit: 'pt',
      format: 'a4'
    });

    // Get PDF dimensions
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // Calculate scaling to fit all content to page with margins
    const margin = CONFIG.EXPORT.MARGIN;
    const scale = Math.min(
      (pageWidth - 2 * margin) / totalWidth,
      (pageHeight - 2 * margin) / totalHeight
    );

    // Validate scale
    if (!isFinite(scale) || scale <= 0 || isNaN(scale)) {
      throw new Error('Invalid scaling calculation');
    }

    // Calculate offset to center the content on the page
    // We need to map world space to PDF space
    const offsetX = margin - bounds.minX * scale + (pageWidth - totalWidth * scale) / 2;
    const offsetY = margin - bounds.minY * scale + (pageHeight - totalHeight * scale) / 2;

    // Helper function to transform world coordinates to PDF coordinates
    function tx(worldX) { return offsetX + worldX * scale; }
    function ty(worldY) { return offsetY + worldY * scale; }
    function ts(size) { return size * scale; }

    // Preload/convert images for PDF export (convert to JPEG where possible so jsPDF accepts them)
    const imageDataMap = new Map();
    try {
      const imageBoxes = mindMap.boxes.filter(b => b && b.imageUrl);
      if (imageBoxes.length > 0) {
        const imgPromises = imageBoxes.map(async (b) => {
          try {
            // Force JPEG output to maximise compatibility with jsPDF
            const dataUrl = await convertDataUrlToWebP(b.imageUrl, { maxWidth: 1600, maxHeight: 1600, quality: 0.85, mimeType: 'image/jpeg' });
            if (dataUrl) imageDataMap.set(b, dataUrl);
          } catch (e) {
            console.warn('Failed to prepare image for PDF export', e);
          }
        });
        await Promise.all(imgPromises);
      }
    } catch (e) {
      console.warn('Image prefetch for PDF failed', e);
    }

    // Draw connections first (behind boxes)
    pdf.setLineWidth(ts(2));
    for (let conn of mindMap.connections) {
      if (!conn || !conn.fromBox || !conn.toBox) continue;

      let start = conn.fromBox.getConnectionPoint(conn.toBox);
      let end = conn.toBox.getConnectionPoint(conn.fromBox);

      // Validate connection points
      if (!start || !end || isNaN(start.x) || isNaN(start.y) || isNaN(end.x) || isNaN(end.y)) {
        continue;
      }

      // Set color
      if (conn.selected) {
        pdf.setDrawColor(100, 150, 255);
        pdf.setFillColor(100, 150, 255);
        pdf.setLineWidth(ts(3));
      } else {
        pdf.setDrawColor(80, 80, 80);
        pdf.setFillColor(80, 80, 80);
        pdf.setLineWidth(ts(2));
      }

      // Draw line
      pdf.line(tx(start.x), ty(start.y), tx(end.x), ty(end.y));

      // Draw arrow head
      let angle = Math.atan2(end.y - start.y, end.x - start.x);

      // Validate angle
      if (isNaN(angle)) continue;

      let arrowSize = ts(10);

      let x1 = tx(end.x);
      let y1 = ty(end.y);
      let x2 = x1 - arrowSize * Math.cos(angle - Math.PI / 6);
      let y2 = y1 - arrowSize * Math.sin(angle - Math.PI / 6);
      let x3 = x1 - arrowSize * Math.cos(angle + Math.PI / 6);
      let y3 = y1 - arrowSize * Math.sin(angle + Math.PI / 6);

      pdf.triangle(x1, y1, x2, y2, x3, y3, 'F');
    }

    // Draw boxes
    pdf.setLineWidth(ts(1));
    for (let box of mindMap.boxes) {
      if (!box) continue;

      // Validate box properties
      if (box.x == null || box.y == null || box.width == null || box.height == null ||
        isNaN(box.x) || isNaN(box.y) || isNaN(box.width) || isNaN(box.height)) {
        continue;
      }

      let boxX = tx(box.x - box.width / 2);
      let boxY = ty(box.y - box.height / 2);
      let boxW = ts(box.width);
      let boxH = ts(box.height);

      // Set fill color from box background; outline slightly heavier when selected
      if (box.backgroundColor && Number.isFinite(box.backgroundColor.r)) {
        pdf.setFillColor(box.backgroundColor.r, box.backgroundColor.g, box.backgroundColor.b);
      } else {
        pdf.setFillColor(255, 255, 255);
      }
      if (box.selected) {
        pdf.setDrawColor(60, 120, 255);
        pdf.setLineWidth(ts(2));
      } else {
        pdf.setDrawColor(100, 100, 100);
        pdf.setLineWidth(ts(1));
      }

      // Draw rounded rectangle
      pdf.roundedRect(boxX, boxY, boxW, boxH, ts(box.cornerRadius), ts(box.cornerRadius), 'FD');

      // If this box contains an image and we have a prepared data URL, embed it into the PDF
      if (box.imageUrl) {
        const dataUrl = imageDataMap.get(box);
        if (dataUrl) {
          try {
            const format = dataUrl.indexOf('image/png') !== -1 ? 'PNG' : 'JPEG';
            // Compute draw size preserving aspect ratio
            const imgWpx = box.naturalImageWidth || box.width || 1;
            const imgHpx = box.naturalImageHeight || box.height || 1;
            let drawW = boxW;
            let drawH = boxH;
            if (imgWpx && imgHpx) {
              const aspect = imgWpx / imgHpx;
              if ((boxW / boxH) > aspect) {
                drawW = boxH * aspect;
              } else {
                drawH = boxW / aspect;
              }
            }
            const imgX = boxX + (boxW - drawW) / 2;
            const imgY = boxY + (boxH - drawH) / 2;
            pdf.addImage(dataUrl, format, imgX, imgY, drawW, drawH);
            // skip text rendering for image boxes
            continue;
          } catch (e) {
            console.warn('Failed to add image to PDF for box', e);
            // fall back to text rendering placeholder below
          }
        }
        // If we couldn't add the image, draw a light placeholder inside the box
        pdf.setDrawColor(200, 200, 200);
        pdf.setFillColor(245, 245, 245);
        pdf.rect(boxX + ts(4), boxY + ts(4), boxW - ts(8), boxH - ts(8), 'F');
      }

      // Draw text (for non-image boxes and fallbacks)
      pdf.setFontSize(ts(box.fontSize));
      pdf.setTextColor(0, 0, 0);

      // Prefer TextBox's wrapText to obtain line-to-absolute mapping for highlights
      let wrappedLines = (typeof box.wrapText === 'function') ? box.wrapText(box.text || '') : getWrappedLines(box);
      let lineHeight = ts(box.fontSize * (TextBox.LINE_HEIGHT_MULTIPLIER || 1.5));
      // Top-anchored text in PDF: use top baseline and align highlights to the same top
      let startY = ty(box.y - box.height / 2) + ts(box.padding);
      let textX = tx(box.x - box.width / 2 + box.padding);

      // Draw persistent highlights behind text using rectangles
      try {
        if (box.highlights && box.highlights.length > 0 && Array.isArray(wrappedLines)) {
          const textStr = String(box.text || '');
          const map = box.cachedLineCharMap || [];
          const getLinePos = (absPos) => {
            if (!map || map.length === 0) return { lineIndex: 0, posInLine: 0 };
            let idx = 0;
            for (let i = 0; i < map.length; i++) {
              const startPos = map[i];
              const endPos = (i < map.length - 1) ? map[i + 1] : textStr.length;
              const isLast = (i === map.length - 1);
              if ((absPos >= startPos && absPos < endPos) || (isLast && absPos >= startPos && absPos <= endPos)) { idx = i; break; }
              if (isLast) idx = i;
            }
            const posInLine = Math.min(absPos - map[idx], (wrappedLines[idx] || '').length);
            return { lineIndex: idx, posInLine };
          };
          // jsPDF lacks textWidth per font; approximate via splitting and measuring using pdf.getTextWidth
          const textWidthPdf = (s) => {
            try { return ts(pdf.getTextWidth(String(s))); } catch (_) { return ts(String(s).length * (box.fontSize * 0.6)); }
          };
          for (const hl of box.highlights) {
            if (!hl || hl.start == null || hl.end == null) continue;
            const start = Math.max(0, Math.min(textStr.length, Math.floor(hl.start)));
            const end = Math.max(0, Math.min(textStr.length, Math.floor(hl.end)));
            if (end <= start) continue;
            const c = hl.color && typeof hl.color === 'object' ? hl.color : { r: 255, g: 255, b: 0, a: 180 };
            pdf.setFillColor(c.r || 255, c.g || 255, c.b || 0);
            const sInfo = getLinePos(start);
            const eInfo = getLinePos(end);
            if (sInfo.lineIndex === eInfo.lineIndex) {
              const lineText = wrappedLines[sInfo.lineIndex] || '';
              const x1 = textX + textWidthPdf(lineText.slice(0, Math.max(0, sInfo.posInLine)));
              const x2 = textX + textWidthPdf(lineText.slice(0, Math.max(0, eInfo.posInLine)));
              const yTop = startY + sInfo.lineIndex * lineHeight;
              pdf.rect(x1, yTop, Math.max(0, x2 - x1), lineHeight * 0.8, 'F');
            } else {
              for (let li = sInfo.lineIndex; li <= eInfo.lineIndex; li++) {
                if (li < 0 || li >= wrappedLines.length) continue;
                const lineText = wrappedLines[li] || '';
                const yTop = startY + li * lineHeight;
                let x1, x2;
                if (li === sInfo.lineIndex) {
                  x1 = textX + textWidthPdf(lineText.slice(0, Math.max(0, sInfo.posInLine)));
                  x2 = textX + textWidthPdf(lineText);
                } else if (li === eInfo.lineIndex) {
                  x1 = textX;
                  x2 = textX + textWidthPdf(lineText.slice(0, Math.max(0, eInfo.posInLine)));
                } else {
                  x1 = textX;
                  x2 = textX + textWidthPdf(lineText);
                }
                pdf.rect(x1, yTop, Math.max(0, x2 - x1), lineHeight * 0.8, 'F');
              }
            }
          }
          // Restore text color after highlight rectangles
          pdf.setTextColor(0, 0, 0);
        }
      } catch (_) { }

      for (let i = 0; i < wrappedLines.length; i++) {
        if (wrappedLines[i] != null) {
          pdf.text(String(wrappedLines[i]), textX, startY + i * lineHeight, { baseline: 'top' });
        }
      }
    }

    // Save the PDF
    pdf.save('mindmap.pdf');
  } catch (e) {
    console.error('Failed to export PDF:', e);
    alert('Failed to export PDF: ' + e.message);
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
  try {
    // Validate mindMap
    if (!mindMap || !mindMap.boxes || mindMap.boxes.length === 0) {
      alert('No content to export');
      return;
    }

    // Build a hierarchy based on connections
    const hierarchy = buildTextHierarchy();

    // Generate text output
    let textOutput = hierarchy.join('\n\n');

    // Create a blob and download
    const blob = new Blob([textOutput], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mindmap-text.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('Failed to export text:', e);
    alert('Failed to export text: ' + e.message);
  }
}

/**
 * Builds a text hierarchy from the mind map based on connections
 * @returns {Array<string>} Array of text lines representing the hierarchy
 */
function buildTextHierarchy() {
  // Build adjacency list from connections (from -> to)
  const children = new Map(); // box -> array of child boxes
  const parents = new Map();  // box -> array of parent boxes

  for (let box of mindMap.boxes) {
    children.set(box, []);
    parents.set(box, []);
  }

  for (let conn of mindMap.connections) {
    if (!conn.fromBox || !conn.toBox) continue;
    children.get(conn.fromBox).push(conn.toBox);
    parents.get(conn.toBox).push(conn.fromBox);
  }

  // Find root nodes (boxes with no parents)
  const roots = mindMap.boxes.filter(box => parents.get(box).length === 0);

  // If no roots found (circular graph), use all boxes sorted by position
  if (roots.length === 0) {
    return mindMap.boxes
      .map(box => box.text || '')
      .filter(text => text.trim() !== '');
  }

  // Traverse from each root using depth-first search
  const visited = new Set();
  const result = [];

  function traverse(box) {
    if (visited.has(box)) return;
    visited.add(box);

    // Add this box's text
    if (box.text && box.text.trim() !== '') {
      result.push(box.text.trim());
    }

    // Traverse children
    const boxChildren = children.get(box) || [];
    for (let child of boxChildren) {
      traverse(child);
    }
  }

  // Sort roots by y-position (top to bottom), then x-position (left to right)
  roots.sort((a, b) => {
    const yDiff = a.y - b.y;
    if (Math.abs(yDiff) > 50) return yDiff; // Different rows
    return a.x - b.x; // Same row, sort by x
  });

  // Traverse from each root
  for (let root of roots) {
    traverse(root);
  }

  // Add any unvisited boxes (disconnected components)
  const unvisited = mindMap.boxes.filter(box => !visited.has(box));
  unvisited.sort((a, b) => {
    const yDiff = a.y - b.y;
    if (Math.abs(yDiff) > 50) return yDiff;
    return a.x - b.x;
  });

  for (let box of unvisited) {
    if (box.text && box.text.trim() !== '') {
      result.push(box.text.trim());
    }
  }

  return result;
}

// ============================================================================
// MULTI-BOX SELECTION FUNCTIONS
// ============================================================================

/**
 * Draws the selection rectangle during multi-box selection
 */
function drawSelectionRectangle() {
  const x1 = min(selectionStartX, selectionCurrentX);
  const y1 = min(selectionStartY, selectionCurrentY);
  const x2 = max(selectionStartX, selectionCurrentX);
  const y2 = max(selectionStartY, selectionCurrentY);

  const selColors = UI_COLORS.SELECTION_RECT;
  push();
  // Semi-transparent fill
  fill(selColors.fill.r, selColors.fill.g, selColors.fill.b, selColors.fill.a);
  // Border
  stroke(selColors.stroke.r, selColors.stroke.g, selColors.stroke.b);
  strokeWeight(2 / zoom);
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
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', cleanup);
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
  // Draw circle
  noStroke();
  if (mindMap.isSaved) {
    // Green when saved
    fill(colors.saved.r, colors.saved.g, colors.saved.b);
  } else {
    // Red when unsaved
    fill(colors.unsaved.r, colors.unsaved.g, colors.unsaved.b);
  }
  circle(x, y, size);
  pop();
}
