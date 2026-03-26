/**
 * RoomHistoryManager - Manages the history of visited collaboration rooms
 * 
 * This module provides persistence for a list of recently visited rooms
 * using localStorage. It maintains a capped list of room metadata.
 */

const ROOM_HISTORY_KEY = 'openmind_room_history';
const MAX_HISTORY_ITEMS = 15;

class RoomHistoryManager {
    /**
     * Adds a room to the history or updates its last visited time.
     * @param {string} roomName - The name of the room
     * @param {string|null} serverUrl - The signaling server URL
     */
    static addRoom(roomName, serverUrl = null) {
        if (!roomName) return;

        let history = this.getHistory();
        
        // Remove existing entry if it exists (we'll re-add it at the top)
        const filteredHistory = history.filter(item => item.roomName !== roomName);
        
        // Add new entry to the front
        const newEntry = {
            roomName: roomName,
            serverUrl: serverUrl,
            lastVisited: Date.now()
        };
        
        filteredHistory.unshift(newEntry);
        
        // Cap the history
        const cappedHistory = filteredHistory.slice(0, MAX_HISTORY_ITEMS);
        
        // Save to localStorage
        try {
            localStorage.setItem(ROOM_HISTORY_KEY, JSON.stringify(cappedHistory));
        } catch (e) {
            console.warn('RoomHistoryManager: Failed to save to localStorage', e);
        }
    }

    /**
     * Retrieves the room history from localStorage.
     * @returns {Array} Array of room history items
     */
    static getHistory() {
        try {
            const stored = localStorage.getItem(ROOM_HISTORY_KEY);
            if (!stored) return [];
            
            const history = JSON.parse(stored);
            if (!Array.isArray(history)) return [];
            
            return history;
        } catch (e) {
            console.warn('RoomHistoryManager: Failed to read from localStorage', e);
            return [];
        }
    }

    /**
     * Removes a specific room from the history.
     * @param {string} roomName - The name of the room to remove
     */
    static removeRoom(roomName) {
        if (!roomName) return;

        let history = this.getHistory();
        const filteredHistory = history.filter(item => item.roomName !== roomName);
        
        try {
            localStorage.setItem(ROOM_HISTORY_KEY, JSON.stringify(filteredHistory));
        } catch (e) {
            console.warn('RoomHistoryManager: Failed to update localStorage', e);
        }
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
