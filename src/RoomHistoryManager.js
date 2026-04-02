/**
 * RoomHistoryManager - Manages the history of visited collaboration rooms
 * 
 * This module provides persistence for a list of recently visited rooms
 * using localStorage. It maintains a capped list of room metadata.
 */

const ROOM_HISTORY_KEY = 'openmind_room_history';
const MAX_HISTORY_ITEMS = 15;

class RoomHistoryManager {
    static _saveHistory(history) {
        try {
            localStorage.setItem(ROOM_HISTORY_KEY, JSON.stringify(history));
        } catch (e) {
            console.warn('RoomHistoryManager: Failed to save to localStorage', e);
        }
    }

    static _readHistory() {
        try {
            const stored = localStorage.getItem(ROOM_HISTORY_KEY);
            if (!stored) return [];

            const history = JSON.parse(stored);
            return Array.isArray(history) ? history : [];
        } catch (e) {
            console.warn('RoomHistoryManager: Failed to read from localStorage', e);
            return [];
        }
    }

    /**
     * Adds a room to the history or updates its last visited time.
     * @param {string} roomName - The name of the room
     * @param {string|null} serverUrl - The signaling server URL
     */
    static addRoom(roomName, serverUrl = null) {
        if (!roomName) return;

        const history = this.getHistory();
        const existingEntry = history.find(item => item.roomName === roomName);

        // Remove existing entry if it exists (we'll re-add it at the top)
        const filteredHistory = history.filter(item => item.roomName !== roomName);

        // Add new entry to the front
        const newEntry = {
            roomName,
            serverUrl: serverUrl || existingEntry?.serverUrl || null,
            lastVisited: Date.now()
        };

        filteredHistory.unshift(newEntry);

        // Cap the history
        const cappedHistory = filteredHistory.slice(0, MAX_HISTORY_ITEMS);

        this._saveHistory(cappedHistory);
    }

    /**
     * Retrieves the room history from localStorage.
     * @returns {Array} Array of room history items
     */
    static getHistory() {
        return this._readHistory();
    }

    /**
     * Removes a specific room from the history.
     * @param {string} roomName - The name of the room to remove
     */
    static removeRoom(roomName) {
        if (!roomName) return;

        const history = this.getHistory();
        const filteredHistory = history.filter(item => item.roomName !== roomName);

        this._saveHistory(filteredHistory);
    }

    /**
     * Clears the entire room history.
     */
    static clearHistory() {
        try {
            localStorage.removeItem(ROOM_HISTORY_KEY);
        } catch (e) {
            console.warn('RoomHistoryManager: Failed to clear localStorage', e);
        }
    }
}

// Expose globally for browser usage
if (typeof window !== 'undefined') {
    window.RoomHistoryManager = RoomHistoryManager;
}
