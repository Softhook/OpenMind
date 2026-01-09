/**
 * UrlUtils - URL parsing and file path utilities
 *
 * This module provides pure utility functions for parsing URLs, file paths,
 * room hashes, and generating storage keys. These are stateless functions
 * that can be used across the application.
 *
 * Key Features:
 * - URL file path parsing (query params, hash, pathname)
 * - Room ID extraction from URL hash
 * - Server URL parsing from query params
 * - Map name normalization and comparison
 * - Storage key generation for rooms
 *
 * Dependencies:
 * - Browser window.location API
 * - CONFIG from sketch.js (for storage key prefix)
 *
 * Usage:
 * - Called during URL change events to determine what to load
 * - Used for collaboration room detection
 * - Used for generating consistent storage keys
 */

// ============================================================================
// URL PARSING UTILITIES
// ============================================================================

/**
 * Parse the current window location to find a candidate JSON file path.
 * Supports multiple URL formats:
 * - `?file=path/to/file.json` - Query parameter
 * - `#filename` - Hash (auto-appends .json)
 * - `/path/to/file.json` - Direct pathname ending with .json
 *
 * @returns {string|null} File path or null if none found
 */
function parseFileFromLocation() {
    if (typeof window === 'undefined' || !window.location) return null;

    const searchParams = window.location.search
        ? new URLSearchParams(window.location.search)
        : null;
    const hash = window.location.hash || '';
    const path = window.location.pathname || '';

    // Priority 1: Explicit file parameter
    if (searchParams && searchParams.get('file')) {
        return decodeURIComponent(searchParams.get('file'));
    }

    // Priority 2: Hash-based file reference
    if (hash && hash.length > 1) {
        let h = decodeURIComponent(hash.substring(1));

        // Ignore collaboration room hashes
        if (h.startsWith('room=') || (searchParams && searchParams.get('server'))) {
            return null;
        }

        // Auto-append .json if missing
        if (h && !h.toLowerCase().endsWith('.json')) {
            h = h + '.json';
        }
        return h;
    }

    // Priority 3: Pathname ending with .json
    if (path && path.toLowerCase().endsWith('.json')) {
        return path.startsWith('/') ? path : ('/' + path);
    }

    return null;
}

/**
 * Parses server URL from query params.
 * Supports full WebSocket URLs (ws:// or wss://).
 *
 * @returns {string|null} Server URL or null
 */
function parseServerFromUrl() {
    try {
        const params = new URLSearchParams(window.location.search);
        const server = params.get('server');

        if (!server) return null;

        // Only return if it's a valid WebSocket URL
        if (server.startsWith('ws://') || server.startsWith('wss://')) {
            return server;
        }

        // Keywords like 'public' or 'demo' are handled by CollaborationManager
        return null;
    } catch (e) {
        return null;
    }
}

/**
 * Parses room ID and mode from URL hash.
 * Supports both explicit room parameter and legacy format.
 *
 * @returns {Object|null} Object with {room: string, isStarting: boolean} or null
 */
function parseRoomFromHash() {
    try {
        const hash = window.location.hash;
        if (!hash || hash.length <= 1) return null;

        // Parse hash as URL parameters (remove leading #)
        const params = new URLSearchParams(hash.substring(1));

        // Check for explicit room parameter
        const roomName = params.get('room');
        if (roomName) {
            const isStarting = params.get('mode') === 'start';
            return { room: decodeURIComponent(roomName), isStarting };
        }

        // Legacy support: If server override is present, treat hash as room name
        const searchParams = new URLSearchParams(window.location.search);
        if (searchParams.has('server')) {
            let h = decodeURIComponent(hash.substring(1));
            // Reject if it looks like a file
            if (!h.toLowerCase().endsWith('.json')) {
                return { room: h, isStarting: false };
            }
        }

        return null;
    } catch (e) {
        console.warn('Error parsing room from hash:', e);
        return null;
    }
}

// ============================================================================
// MAP NAME UTILITIES
// ============================================================================

/**
 * Extracts a normalized map name from a full path or name.
 * Removes path components, query params, and .json extension.
 *
 * @param {string} pathOrName - Full path or name
 * @returns {string} Normalized lowercase name
 */
function extractMapName(pathOrName) {
    if (!pathOrName || typeof pathOrName !== 'string') return '';

    let name = pathOrName;

    // Extract basename (remove path) - handle both / and \ separators
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
 * Checks if two map names are similar.
 * Handles prefixed names with separator (e.g., 'my-map' matches 'prefix-my-map').
 *
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

    // Allowed separators
    const separators = ['-', '_', ' '];

    // Check if longer name ends with shorter name preceded by separator
    const checkSuffix = (longer, shorter) => {
        if (longer.endsWith(shorter)) {
            const prefixLength = longer.length - shorter.length;
            if (prefixLength > 0) {
                const charBefore = longer[prefixLength - 1];
                return separators.includes(charBefore);
            }
        }
        return false;
    };

    if (name1.length > name2.length) {
        return checkSuffix(name1, name2);
    } else if (name2.length > name1.length) {
        return checkSuffix(name2, name1);
    }

    return false;
}

// ============================================================================
// STORAGE KEY UTILITIES
// ============================================================================

/**
 * Generates a safe storage key for a collaboration room.
 * Sanitizes room name to prevent localStorage issues.
 *
 * @param {string} roomName - The room identifier
 * @param {Object} config - Config object with STORAGE.ROOM_KEY_PREFIX and DEFAULT_KEY
 * @returns {string} Sanitized storage key
 */
function getRoomStorageKey(roomName, config) {
    const defaultKey = config?.STORAGE?.DEFAULT_KEY || 'openmind_autosave';
    const prefix = config?.STORAGE?.ROOM_KEY_PREFIX || 'openmind_room_';

    if (!roomName || typeof roomName !== 'string') {
        return defaultKey;
    }

    // Sanitize: keep only alphanumeric, dash, underscore
    const sanitized = roomName.replace(/[^a-zA-Z0-9_-]/g, '_');
    return prefix + sanitized;
}

// ============================================================================
// EXPORTS
// ============================================================================

// Export to global scope for use by sketch.js
if (typeof window !== 'undefined') {
    window.UrlUtils = {
        parseFileFromLocation,
        parseServerFromUrl,
        parseRoomFromHash,
        extractMapName,
        namesAreSimilar,
        getRoomStorageKey
    };
}
