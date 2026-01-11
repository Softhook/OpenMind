
const TextImporter = require('../../src/TextImporter');

// Mock specific DOM/P5 parts if necessary, though TextImporter logic 
// seems largely pure JS for the parsing part we are testing.
// However, TextImporter is a class in a file that might look for 'class' 
// keyword which is fine in Node. But we need to make sure the file is exportable.
// Since the source file likely doesn't have module.exports (it's a browser file),
// we might need to pretend-load it or use a rewiring approach. 
// For this environment, let's assume we might need to read the file content 
// and eval it, or if the user has a setup for it.
// Looking at other tests might help, but I'll write standard Jest tests 
// assuming I can load the class.

// To make this robust without changing the source file's export structure (if it lacks one):
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Try to load compromise if available in node_modules
let nlp;
try {
    nlp = require('compromise');
} catch (e) {
    console.warn('compromise not found in node_modules, tests might fail if NLP logic is triggered');
}

// Read the file content
let code = fs.readFileSync(path.resolve(__dirname, '../../src/TextImporter.js'), 'utf8');

// Append an export statement so we can grab the class
code += '\nif (typeof module !== "undefined") module.exports = TextImporter;';

const moduleMock = { exports: {} };
const context = {
    console: console,
    Utils: { sanitizeText: (t) => t }, // Mock Utils dependency
    nlp: nlp, // Inject compromise
    module: moduleMock,
    exports: moduleMock.exports
};

vm.createContext(context);
vm.runInContext(code, context);

const TextImporterClass = moduleMock.exports;


describe('TextImporter.parseTextIntoSections', () => {

    test('detects standard short heading without punctuation', () => {
        const lines = [
            'Introduction',
            '',
            'This is a paragraph associated with the introduction.',
            'It has multiple lines.'
        ];
        const sections = TextImporterClass.parseTextIntoSections(lines);
        expect(sections).toHaveLength(1);
        expect(sections[0].heading).toBe('Introduction');
        expect(sections[0].paragraphs).toHaveLength(2);
        expect(sections[0].paragraphs[0]).toContain('This is a paragraph');
    });

    test('detects all-caps heading', () => {
        const lines = [
            'CHAPTER ONE',
            '',
            'The story begins here.'
        ];
        const sections = TextImporterClass.parseTextIntoSections(lines);
        expect(sections).toHaveLength(1);
        expect(sections[0].heading).toBe('CHAPTER ONE');
    });

    test('detects numbered heading', () => {
        const lines = [
            '1. Overview',
            '',
            'Content here.'
        ];
        const sections = TextImporterClass.parseTextIntoSections(lines);
        expect(sections).toHaveLength(1);
        expect(sections[0].heading).toBe('1. Overview');
    });

    test('detects decimal numbered heading', () => {
        const lines = [
            '2.1.3 Detailed Analysis',
            '',
            'Details here.'
        ];
        const sections = TextImporterClass.parseTextIntoSections(lines);
        expect(sections[0].heading).toBe('2.1.3 Detailed Analysis');
    });

    test('detects markdown style heading', () => {
        const lines = [
            '# Main Title',
            '',
            'Body text.'
        ];
        const sections = TextImporterClass.parseTextIntoSections(lines);
        expect(sections[0].heading).toBe('# Main Title');
    });

    test('treats long sentences as paragraphs', () => {
        const longLine = 'This is a very long line that should not be considered a heading because it is just too long and looks like a regular sentence part of a paragraph even if it is isolated.';
        const lines = [
            'Heading',
            '',
            longLine
        ];
        const sections = TextImporterClass.parseTextIntoSections(lines);
        expect(sections[0].heading).toBe('Heading');
        expect(sections[0].paragraphs[0]).toBe(longLine);
    });

    test('treats disconnected short lines with punctuation as paragraphs', () => {
        // Current logic might struggle here, but "Hello world." is arguably a paragraph if it ends with period.
        // Ideally, if it looks like a sentence (ends with .), it's a paragraph unless it's very short and title-cased?
        // Let's stick thereto: if it ends with punctuation, likely proper sentence/paragraph.
        // BUT, existing logic LOVED punctuation for headers. We want to INVERT that.
        const lines = [
            'Analysis',
            '',
            'This is a statement.'
        ];
        const sections = TextImporterClass.parseTextIntoSections(lines);
        expect(sections[0].heading).toBe('Analysis');
        expect(sections[0].paragraphs[0]).toBe('This is a statement.');
    });

    test('handles multiple sections', () => {
        const lines = [
            'Section 1',
            '',
            'Para 1.',
            '',
            '',
            'Section 2',
            '',
            'Para 2.'
        ];
        const sections = TextImporterClass.parseTextIntoSections(lines);
        expect(sections).toHaveLength(2);
        expect(sections[0].heading).toBe('Section 1');
        expect(sections[1].heading).toBe('Section 2');
    });

    test('detects various markdown ATX heading levels', () => {
        const lines = [
            '# H1',
            '## H2',
            '### H3',
            '#### H4',
            '##### H5',
            '###### H6'
        ];
        // Each will become its own section because they are headings
        const sections = TextImporterClass.parseTextIntoSections(lines);
        expect(sections).toHaveLength(6);
        expect(sections[0].heading).toBe('# H1');
        expect(sections[5].heading).toBe('###### H6');
    });

    test('detects Setext style underlined headings', () => {
        const lines = [
            'H1 Underlined',
            '====',
            '',
            'H2 Underlined',
            '----',
            '',
            'Paragraph.'
        ];
        const sections = TextImporterClass.parseTextIntoSections(lines);
        expect(sections).toHaveLength(2);
        expect(sections[0].heading).toBe('H1 Underlined');
        expect(sections[1].heading).toBe('H2 Underlined');
        expect(sections[1].paragraphs[0]).toBe('Paragraph.');
    });

    test('treats blockquotes as paragraphs', () => {
        const lines = [
            'Heading',
            '',
            '> This is a quote.',
            '> Still part of quote.'
        ];
        const sections = TextImporterClass.parseTextIntoSections(lines);
        expect(sections).toHaveLength(1);
        expect(sections[0].paragraphs[0]).toBe('> This is a quote.');
        expect(sections[0].paragraphs[1]).toBe('> Still part of quote.');
    });

    test('groups bibliography entries into a single box', () => {
        const lines = [
            'Main Topic',
            '',
            'Discussion point.',
            '',
            'References',
            'Smith, J. (2020). Book Title.',
            'Doe, A. (2021). Paper Title.',
            'Blog, X. (2022). Website.'
        ];
        const sections = TextImporterClass.parseTextIntoSections(lines);

        // Find the References section
        const refSection = sections.find(s => s.heading === 'References');
        expect(refSection).toBeDefined();
        // Should have exactly one paragraph entry (the grouped references)
        expect(refSection.paragraphs).toHaveLength(1);
        expect(refSection.paragraphs[0]).toContain('Smith, J.');
        expect(refSection.paragraphs[0]).toContain('Doe, A.');
        expect(refSection.paragraphs[0]).toContain('Blog, X.');
        expect(refSection.paragraphs[0]).toContain('\n');
    });
});

