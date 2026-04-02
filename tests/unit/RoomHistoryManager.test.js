/**
 * Unit tests for RoomHistoryManager
 */

const vm = require('vm');
const fs = require('fs');
const path = require('path');

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: jest.fn((key) => store[key] || null),
    setItem: jest.fn((key, value) => {
      store[key] = value.toString();
    }),
    removeItem: jest.fn((key) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

// Create a sandbox context with browser-like globals
const sandbox = {
  window: {},
  console: console,
  localStorage: localStorageMock,
  Date: {
    now: jest.fn(() => 1625091200000), // Fixed timestamp for tests
  },
  JSON: JSON,
};

// Load and run RoomHistoryManager.js in the sandbox
const managerCode = fs.readFileSync(path.join(__dirname, '../../src/RoomHistoryManager.js'), 'utf8');
const script = new vm.Script(managerCode);
script.runInNewContext(sandbox);

const RoomHistoryManager = sandbox.window.RoomHistoryManager;

describe('RoomHistoryManager', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  test('getHistory should return an empty array initially', () => {
    expect(RoomHistoryManager.getHistory()).toEqual([]);
  });

  test('addRoom should add a new room to history', () => {
    RoomHistoryManager.addRoom('test-room', 'wss://example.com');
    const history = RoomHistoryManager.getHistory();
    
    expect(history.length).toBe(1);
    expect(history[0]).toEqual({
      roomName: 'test-room',
      serverUrl: 'wss://example.com',
      lastVisited: 1625091200000
    });
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'openmind_room_history', 
        expect.stringContaining('"roomName":"test-room"')
    );
  });

  test('addRoom should move existing room to the top', () => {
    RoomHistoryManager.addRoom('room1');
    sandbox.Date.now.mockReturnValue(1625091200001);
    RoomHistoryManager.addRoom('room2');
    sandbox.Date.now.mockReturnValue(1625091200002);
    RoomHistoryManager.addRoom('room1'); // Move room1 to top
    
    const history = RoomHistoryManager.getHistory();
    expect(history.length).toBe(2);
    expect(history[0].roomName).toBe('room1');
    expect(history[0].lastVisited).toBe(1625091200002);
    expect(history[1].roomName).toBe('room2');
  });

  test('addRoom should preserve an existing server URL when re-added without one', () => {
    RoomHistoryManager.addRoom('room1', 'wss://example.com');
    sandbox.Date.now.mockReturnValue(1625091200001);
    RoomHistoryManager.addRoom('room1');

    const history = RoomHistoryManager.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].serverUrl).toBe('wss://example.com');
    expect(history[0].lastVisited).toBe(1625091200001);
  });

  test('addRoom should cap history at 15 items', () => {
    for (let i = 1; i <= 20; i++) {
        sandbox.Date.now.mockReturnValue(1625091200000 + i);
        RoomHistoryManager.addRoom(`room${i}`);
    }
    
    const history = RoomHistoryManager.getHistory();
    expect(history.length).toBe(15);
    expect(history[0].roomName).toBe('room20');
    expect(history[14].roomName).toBe('room6'); // 20 - 15 + 1 = 6
  });

  test('removeRoom should remove a specific room', () => {
    RoomHistoryManager.addRoom('room1');
    RoomHistoryManager.addRoom('room2');
    RoomHistoryManager.removeRoom('room1');
    
    const history = RoomHistoryManager.getHistory();
    expect(history.length).toBe(1);
    expect(history[0].roomName).toBe('room2');
  });

  test('clearHistory should wipe all history', () => {
    RoomHistoryManager.addRoom('room1');
    RoomHistoryManager.clearHistory();
    
    expect(RoomHistoryManager.getHistory()).toEqual([]);
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('openmind_room_history');
  });

  test('should handle localStorage errors gracefully', () => {
    localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error('QuotaExceededError');
    });
    
    // Should not throw
    RoomHistoryManager.addRoom('test-room');
  });

  test('getHistory should return an empty array for invalid JSON', () => {
    localStorageMock.getItem.mockReturnValueOnce('{invalid json');

    expect(RoomHistoryManager.getHistory()).toEqual([]);
  });
});
