
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

    test('detects heading without empty line below', () => {
        const lines = [
            'Main Heading',
            'This paragraph starts immediately on the next line.'
        ];
        const sections = TextImporterClass.parseTextIntoSections(lines);
        expect(sections).toHaveLength(1);
        expect(sections[0].heading).toBe('Main Heading');
        expect(sections[0].paragraphs[0]).toBe('This paragraph starts immediately on the next line.');
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

    test('treats short lines with punctuation as paragraphs, not headings', () => {
        const lines = [
            'Analysis',
            '',
            'This is a statement.'
        ];
        const sections = TextImporterClass.parseTextIntoSections(lines);
        expect(sections[0].heading).toBe('Analysis');
        expect(sections[0].paragraphs[0]).toBe('This is a statement.');
    });

    test('allows period in numbered headings', () => {
        const lines = [
            '1. Introduction',
            'Content follows.'
        ];
        const sections = TextImporterClass.parseTextIntoSections(lines);
        expect(sections[0].heading).toBe('1. Introduction');
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

    test('groups bibliography entries into a single box even with empty lines', () => {
        const lines = [
            'Main Topic',
            '',
            'Discussion point.',
            '',
            'References',
            'Smith, J. (2020). Book Title.',
            '',
            'Doe, A. (2021). Paper Title.',
            '',
            '',
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

    test('handles academic paper snippet: Abstract and Introduction', () => {
        const lines = [
            'Abstract',
            '"Attention Is All You Need" (Vaswani et al., 2017) introduced the Transformer, a novel deep learning architecture that revolutionized sequence transduction by relying solely on attention mechanisms, thereby dispensing with recurrence and convolutions entirely.',
            '',
            'Introduction',
            'Before 2017, the dominant sequence processing models, particularly for tasks like machine translation, primarily relied on recurrent neural networks (RNNs) and convolutional neural networks (CNNs).'
        ];
        const sections = TextImporterClass.parseTextIntoSections(lines);
        expect(sections).toHaveLength(2);
        expect(sections[0].heading).toBe('Abstract');
        expect(sections[1].heading).toBe('Introduction');
    });

    test('handles academic methodology with bold fragments and no empty lines', () => {
        const lines = [
            'Methodology',
            'The Transformer architecture is an encoder-decoder model.',
            'Self-Attention Mechanism',
            'At its core, self-attention allows the model to weigh the importance of different words in a sequence relative to each other.',
            'Multi-Head Attention (MHA)',
            'Instead of performing self-attention once, MHA employs multiple attention mechanisms in parallel.'
        ];
        // Note: "Self-Attention Mechanism" and "Multi-Head Attention (MHA)" should be headings
        const sections = TextImporterClass.parseTextIntoSections(lines);
        expect(sections.length).toBeGreaterThanOrEqual(3);
        expect(sections.some(s => s.heading === 'Self-Attention Mechanism')).toBe(true);
        expect(sections.some(s => s.heading === 'Multi-Head Attention (MHA)')).toBe(true);
    });

    test('groups complex academic references block', () => {
        const lines = [
            'References',
            '* Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A. N., Kaiser, L., & Polosukhin, I. (2017). Attention Is All You Need. Advances in Neural Information Processing Systems, 30.',
            '',
            '* Bahdanau, D., Cho, K., & Bengio, Y. (2014). Neural machine translation by jointly learning to align and translate. CoRR, abs/1409.0473.',
            '',
            '* Devlin, J., Chang, M. W., Lee, K., & Toutanova, K. (2018). BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding. arXiv preprint arXiv:1810.04805.'
        ];
        const sections = TextImporterClass.parseTextIntoSections(lines);
        const refSection = sections.find(s => s.heading === 'References');
        expect(refSection).toBeDefined();
        expect(refSection.paragraphs).toHaveLength(1); // Grouped
        expect(refSection.paragraphs[0]).toContain('Vaswani');
        expect(refSection.paragraphs[0]).toContain('Bahdanau');
        expect(refSection.paragraphs[0]).toContain('Devlin');
    });

    test('detectTitleIndex identifies Markdown H1 as title', () => {
        const sections = [
            { heading: 'Author: John Doe', paragraphs: [''] },
            { heading: '# The Real Title', paragraphs: [''] },
            { heading: 'Abstract', paragraphs: [''] }
        ];
        const titleIdx = TextImporterClass.detectTitleIndex(sections);
        expect(titleIdx).toBe(1);
    });

    test('detectTitleIndex identifies "Title:" prefix', () => {
        const sections = [
            { heading: 'Preprint', paragraphs: [''] },
            { heading: 'Title: Exploring AI', paragraphs: [''] }
        ];
        const titleIdx = TextImporterClass.detectTitleIndex(sections);
        expect(titleIdx).toBe(1);
    });

    test('detectTitleIndex skips preamble metadata', () => {
        const sections = [
            { heading: 'Submitted to NeurIPS 2024', paragraphs: [''] },
            { heading: 'Author: Jane Smith', paragraphs: [''] },
            { heading: 'Deep Reinforcement Learning via Proxy', paragraphs: [''] },
            { heading: 'Abstract', paragraphs: [''] }
        ];
        // Should skip "Submitted..." and "Author..." and pick the third one
        const titleIdx = TextImporterClass.detectTitleIndex(sections);
        expect(titleIdx).toBe(2);
    });

    test('detects title with verbs if it is Title Case', () => {
        const lines = [
            'Attention Is All You Need',
            'This is the first sentence of the abstract.'
        ];
        const sections = TextImporterClass.parseTextIntoSections(lines);
        expect(sections).toHaveLength(1);
        expect(sections[0].heading).toBe('Attention Is All You Need');
    });

    test('detectTitleIndex does not skip titles starting with metadata words but containing more text', () => {
        const sections = [
            { heading: 'Discussion on the Future of NLP', paragraphs: ['Text'] },
            { heading: 'Results of the Experiment', paragraphs: ['Text'] }
        ];
        // Should NOT skip "Discussion on..." because it doesn't match the strict metadata pattern
        const titleIdx = TextImporterClass.detectTitleIndex(sections);
        expect(titleIdx).toBe(0);
    });

    test('round-trip: preserves structured hierarchy with double newlines', () => {
        const lines = [
            '# Main Title',
            '',
            '## Section 1',
            'Paragraph 1',
            '',
            'Paragraph 2',
            '',
            '',
            'Paragraph 3',
            '',
            '## Section 2',
            'Final thoughts'
        ];
        const sections = TextImporterClass.parseTextIntoSections(lines);

        // Should have 3 sections regardless of double newlines between Paragraph 2 and 3
        expect(sections).toHaveLength(3);
        expect(sections[0].heading).toBe('# Main Title');
        expect(sections[1].heading).toBe('## Section 1');

        // Paragraphs 1, 2, and 3 should all be under Section 1
        expect(sections[1].paragraphs).toHaveLength(3);
        expect(sections[1].paragraphs).toContain('Paragraph 3');

        expect(sections[2].heading).toBe('## Section 2');
    });
});

