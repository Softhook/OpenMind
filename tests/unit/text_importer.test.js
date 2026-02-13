
const TextImporter = require('../../src/TextImporter');
const Utils = require('../../src/utils');

// Mock dependencies
global.mindMap = {
    boxes: [],
    connections: [],
    clearBoxSelection: jest.fn(),
    isDirty: false,
    isSaved: true,
    saveToLocalStorage: jest.fn(),
};

global.Utils = {
    sanitizeText: (text) => text.trim(), // Simple mock
};

global.TextBox = class TextBox {
    constructor(x, y, text) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.width = 100;
        this.height = 50;
        this.updateDimensions = jest.fn();
        this.setBackgroundByKey = jest.fn();
    }
};

global.Connection = class Connection {
    constructor(b1, b2) {
        this.b1 = b1;
        this.b2 = b2;
    }
};

global.MindMap = {
    onBoxChange: jest.fn(),
    onConnectionsChange: jest.fn(),
};

global.resetView = jest.fn();
global.alert = jest.fn();

describe('TextImporter', () => {
    beforeEach(() => {
        mindMap.boxes = [];
        mindMap.connections = [];
        jest.clearAllMocks();
    });

    test('should import simple text with heading and paragraphs', async () => {
        const text = `
Heading 1
Paragraph 1.1
Paragraph 1.2

Heading 2
Paragraph 2.1
`;

        // Mock nlp if needed, or rely on fallback
        // TextImporter uses fallback if nlp is undefined, which is fine for this test

        await TextImporter.importTextAsDiagram(text);

        expect(mindMap.boxes.length).toBe(5); // 2 headings + 3 paragraphs
        expect(mindMap.connections.length).toBe(4); // Fallback parser groups everything under first heading
    });

    test('should handle base64 encoded text in handleFileImport', async () => {
        const content = "Heading\nPara";
        const base64Content = "data:text/plain;base64," + Buffer.from(content).toString('base64');

        const file = {
            name: 'test.txt',
            type: 'text/plain',
            data: base64Content
        };

        const fileInput = { elt: { value: 'path/to/file' } };

        await TextImporter.handleFileImport(file, fileInput);

        expect(mindMap.boxes.length).toBe(2);
        expect(mindMap.boxes[0].text).toBe('Heading');
        expect(mindMap.boxes[1].text).toBe('Para');
    });

    test('should alert on empty content', async () => {
        const file = {
            name: 'empty.txt',
            type: 'text/plain',
            data: ''
        };

        await TextImporter.handleFileImport(file, null);

        expect(global.alert).toHaveBeenCalled();
    });
});
