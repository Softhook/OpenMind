/**
 * Unit tests for UrlUtils module
 * Tests the URL parsing, map name utilities, and storage key functions
 */

const vm = require('vm');
const fs = require('fs');
const path = require('path');

// Create a sandbox context with browser-like globals
const sandbox = {
    window: {
        location: {
            search: '',
            hash: '',
            pathname: '/'
        }
    },
    console: console,
    URLSearchParams: URLSearchParams,
    decodeURIComponent: decodeURIComponent
};

// Load and run UrlUtils.js in the sandbox
const urlUtilsCode = fs.readFileSync(path.join(__dirname, '../../src/UrlUtils.js'), 'utf8');
const script = new vm.Script(urlUtilsCode);
script.runInNewContext(sandbox);

// Extract the functions from sandbox.window.UrlUtils
const UrlUtils = sandbox.window.UrlUtils;
const {
    parseFileFromLocation,
    parseServerFromUrl,
    parseRoomFromHash,
    extractMapName,
    namesAreSimilar,
    getRoomStorageKey
} = UrlUtils;

describe('UrlUtils - extractMapName', () => {
    test('should extract basename from full path', () => {
        expect(extractMapName('/path/to/mymap.json')).toBe('mymap');
        expect(extractMapName('C:\\Users\\test\\map.json')).toBe('map');
    });

    test('should remove .json extension', () => {
        expect(extractMapName('mymap.json')).toBe('mymap');
        expect(extractMapName('MyMap.JSON')).toBe('mymap');
    });

    test('should remove query params and hash', () => {
        expect(extractMapName('mymap.json?v=1')).toBe('mymap');
        expect(extractMapName('mymap.json#section')).toBe('mymap');
    });

    test('should normalize to lowercase', () => {
        expect(extractMapName('MyMap')).toBe('mymap');
        expect(extractMapName('UPPERCASE')).toBe('uppercase');
    });

    test('should handle edge cases', () => {
        expect(extractMapName(null)).toBe('');
        expect(extractMapName(undefined)).toBe('');
        expect(extractMapName('')).toBe('');
    });
});

describe('UrlUtils - namesAreSimilar', () => {
    test('should return true for exact matches', () => {
        expect(namesAreSimilar('mymap', 'mymap')).toBe(true);
        expect(namesAreSimilar('MyMap', 'mymap')).toBe(true);
    });

    test('should match when one ends with the other (with separator)', () => {
        expect(namesAreSimilar('project-mymap', 'mymap')).toBe(true);
        expect(namesAreSimilar('mymap', 'project_mymap')).toBe(true);
        expect(namesAreSimilar('prefix-test-map', 'test-map')).toBe(true);
    });

    test('should NOT match partial word endings', () => {
        expect(namesAreSimilar('important', 'ant')).toBe(false);
        expect(namesAreSimilar('testing', 'ing')).toBe(false);
    });

    test('should handle edge cases', () => {
        expect(namesAreSimilar(null, 'map')).toBe(false);
        expect(namesAreSimilar('map', null)).toBe(false);
        expect(namesAreSimilar('', '')).toBe(false);
    });
});

describe('UrlUtils - getRoomStorageKey', () => {
    const mockConfig = {
        STORAGE: {
            DEFAULT_KEY: 'openmind_autosave',
            ROOM_KEY_PREFIX: 'openmind_room_'
        }
    };

    test('should generate prefixed storage key', () => {
        expect(getRoomStorageKey('myroom', mockConfig)).toBe('openmind_room_myroom');
    });

    test('should sanitize special characters', () => {
        expect(getRoomStorageKey('my room!@#', mockConfig)).toBe('openmind_room_my_room___');
    });

    test('should allow alphanumeric, dash, underscore', () => {
        expect(getRoomStorageKey('my-room_123', mockConfig)).toBe('openmind_room_my-room_123');
    });

    test('should return default key for invalid input', () => {
        expect(getRoomStorageKey(null, mockConfig)).toBe('openmind_autosave');
        expect(getRoomStorageKey('', mockConfig)).toBe('openmind_autosave');
    });
});

describe('UrlUtils - parseFileFromLocation (with mocked location)', () => {
    // Helper to set up location mock
    function setLocation(search = '', hash = '', pathname = '/') {
        sandbox.window.location = { search, hash, pathname };
    }

    beforeEach(() => {
        setLocation('', '', '/');
    });

    test('should parse file from query param', () => {
        setLocation('?file=maps/test.json', '', '/');
        expect(parseFileFromLocation()).toBe('maps/test.json');
    });

    test('should parse file from hash (auto-append .json)', () => {
        setLocation('', '#mymap', '/');
        expect(parseFileFromLocation()).toBe('mymap.json');
    });

    test('should parse file from hash with .json extension', () => {
        setLocation('', '#mymap.json', '/');
        expect(parseFileFromLocation()).toBe('mymap.json');
    });

    test('should return null for room= hashes', () => {
        setLocation('', '#room=collaboration-room', '/');
        expect(parseFileFromLocation()).toBe(null);
    });

    test('should return null when server param is present', () => {
        setLocation('?server=wss://example.com', '#myroom', '/');
        expect(parseFileFromLocation()).toBe(null);
    });

    test('should parse file from pathname ending with .json', () => {
        setLocation('', '', '/maps/test.json');
        expect(parseFileFromLocation()).toBe('/maps/test.json');
    });

    test('should return null when no file found', () => {
        setLocation('', '', '/');
        expect(parseFileFromLocation()).toBe(null);
    });
});

describe('UrlUtils - parseServerFromUrl', () => {
    function setLocation(search = '') {
        sandbox.window.location = { search, hash: '', pathname: '/' };
    }

    test('should parse wss:// server URL', () => {
        setLocation('?server=wss://example.com');
        expect(parseServerFromUrl()).toBe('wss://example.com');
    });

    test('should parse ws:// server URL', () => {
        setLocation('?server=ws://localhost:1234');
        expect(parseServerFromUrl()).toBe('ws://localhost:1234');
    });

    test('should return null for non-URL values', () => {
        setLocation('?server=public');
        expect(parseServerFromUrl()).toBe(null);
    });

    test('should return null when no server param', () => {
        setLocation('');
        expect(parseServerFromUrl()).toBe(null);
    });
});

describe('UrlUtils - parseRoomFromHash', () => {
    function setLocation(search = '', hash = '') {
        sandbox.window.location = { search, hash, pathname: '/' };
    }

    test('should parse room from explicit room param', () => {
        setLocation('', '#room=my-collaboration-room');
        const result = parseRoomFromHash();
        expect(result).not.toBe(null);
        expect(result.room).toBe('my-collaboration-room');
        expect(result.isStarting).toBe(false);
    });

    test('should detect isStarting mode', () => {
        setLocation('', '#room=myroom&mode=start');
        const result = parseRoomFromHash();
        expect(result.isStarting).toBe(true);
    });

    test('should return null for empty hash', () => {
        setLocation('', '');
        expect(parseRoomFromHash()).toBe(null);
    });

    test('should return null for file hash', () => {
        setLocation('', '#mymap.json');
        expect(parseRoomFromHash()).toBe(null);
    });

    test('should handle legacy format with server param', () => {
        setLocation('?server=wss://example.com', '#roomname');
        const result = parseRoomFromHash();
        expect(result).not.toBe(null);
        expect(result.room).toBe('roomname');
    });
});
