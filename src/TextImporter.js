/**
 * TextImporter.js
 * 
 * Module for importing and parsing text files into mind map diagrams.
 * Handles text file imports, parsing, heading detection, and diagram generation.
 */

class TextImporter {
  /**
   * Triggers the file selection dialog for text import
   * @param {Object} fileInput - The p5.js file input element
   */
  static triggerImport(fileInput) {
    try {
      if (fileInput && fileInput.elt && typeof fileInput.elt.click === 'function') {
        fileInput.elt.click();
      } else if (fileInput && typeof fileInput.elt === 'undefined' && typeof fileInput.click === 'function') {
        fileInput.click();
      } else {
        console.warn('Text import input not available');
      }
    } catch (e) {
      console.warn('Failed to trigger text import input:', e);
    }
  }

  /**
   * Handles importing text from a file and converting it into a diagram.
   * Detects headings (single-sentence lines) and paragraphs, then creates:
   * - Orange boxes (key 2) for headings, placed horizontally
   * - White boxes for paragraphs, arranged vertically under each heading
   * - Connections between sequential paragraphs
   * @param {Object} file - p5.js file object with text content
   * @param {Object} fileInput - The p5.js file input element to reset
   */
  static async handleFileImport(file, fileInput) {
    if (!file) {
      console.error('No file provided');
      alert('Please select a valid text file');
      return;
    }

    // Validate file type
    const isTextFile = file.type.includes('text') ||
      file.name.endsWith('.txt') ||
      file.name.endsWith('.md') ||
      file.name.endsWith('.text');

    if (!isTextFile) {
      console.error('Invalid file type:', file.type);
      alert('Please select a text file (.txt, .md, or .text)');
      return;
    }

    try {
      // Get the text data
      let textContent = file.data;

      // Check if it's a data URL (base64 encoded) and decode it
      if (typeof textContent === 'string' && textContent.startsWith('data:')) {
        try {
          // Extract base64 part
          const base64Part = textContent.split(',')[1];
          if (base64Part) {
            textContent = atob(base64Part);
            // Decode potential UTF-8 characters if they were encoded
            try {
              textContent = decodeURIComponent(escape(textContent));
            } catch (e) {
              // Ignore decoding errors, stick with atob result
            }
          }
        } catch (e) {
          console.warn('Failed to decode base64 file content:', e);
          // Fallback to original content
        }
      }

      if (!textContent || typeof textContent !== 'string') {
        throw new Error('File content is empty or invalid');
      }

      // Import the text and create diagram
      await this.importTextAsDiagram(textContent);

      // Reset file input
      try {
        if (fileInput && fileInput.elt) {
          fileInput.elt.value = '';
        } else if (fileInput && typeof fileInput.value === 'function') {
          fileInput.value('');
        }
      } catch (e) {
        console.warn('Failed to reset text import input value:', e);
      }
    } catch (e) {
      console.error('Failed to import text:', e);
      alert('Failed to import text: ' + e.message);
    }
  }

  /**
   * Converts imported text into a mind map diagram.
   * 
   * Algorithm:
   * 1. Sanitize and parse the text into sections (headings + paragraphs)
   * 2. Detect headings: single-sentence lines (ending with . ! ?)
   * 3. Group paragraphs under their respective headings
   * 4. Place headings horizontally with orange boxes (key 2)
   * 5. Place paragraphs vertically under each heading with white boxes
   * 6. Connect sequential paragraphs with arrows
   * 7. Maintain good spacing between all elements
   * 
   * @param {string} text - The raw text content to import
   */
  static async importTextAsDiagram(text) {
    if (!mindMap) {
      throw new Error('MindMap not initialized');
    }

    // Sanitize the text using the existing utility
    const sanitizedText = Utils.sanitizeText(text);

    // Split into lines and remove empty lines at start/end
    let lines = sanitizedText.split('\n').map(line => line.trim());

    // Remove leading and trailing empty lines
    while (lines.length > 0 && lines[0] === '') {
      lines.shift();
    }
    while (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }

    if (lines.length === 0) {
      alert('No content found in the text file');
      return;
    }

    // Parse the text into sections with headings and paragraphs
    const sections = this.parseTextIntoSections(lines);

    if (sections.length === 0) {
      alert('No valid content found to import');
      return;
    }

    // Layout configuration
    const IMPORT_LAYOUT = {
      START_X: 300,
      START_Y: 200,
      HORIZONTAL_SPACING: 450,   // Space between heading columns
      VERTICAL_SPACING: 50,      // Gap between paragraph boxes
      IMPORTED_BOX_WIDTH: 400    // Width for all imported boxes
    };

    // Clear current selection
    mindMap.clearBoxSelection();
    if (mindMap.selectedBox) {
      mindMap.selectedBox.stopEditing();
      mindMap.selectedBox = null;
    }

    const allNewBoxes = [];
    let currentX = IMPORT_LAYOUT.START_X;

    // Detect the title section index
    const titleSectionIdx = this.detectTitleIndex(sections);

    // Wrap all additions in a single transaction for atomicity and single undo step
    mindMap._wrapInTransaction(() => {
      // Process each section
      for (let sectionIdx = 0; sectionIdx < sections.length; sectionIdx++) {
        const section = sections[sectionIdx];
        const heading = section.heading;
        const paragraphs = section.paragraphs;

        // Create heading box
        const headingBox = new TextBox(currentX, IMPORT_LAYOUT.START_Y, heading);

        // Style title red (key 3), others orange (key 2)
        if (sectionIdx === titleSectionIdx) {
          headingBox.setBackgroundByKey('red');
        } else {
          headingBox.setBackgroundByKey('orange');
        }

        // Set fixed width for imported boxes
        headingBox.width = IMPORT_LAYOUT.IMPORTED_BOX_WIDTH;
        headingBox.userResized = true;
        headingBox.updateDimensions();

        // Ensure target position is updated
        headingBox.targetX = headingBox.x;
        headingBox.targetY = headingBox.y;

        mindMap.addBox(headingBox);

        // Start positioning paragraphs below the heading
        let currentY = IMPORT_LAYOUT.START_Y + headingBox.height / 2 + IMPORT_LAYOUT.VERTICAL_SPACING;
        let previousParagraphBox = null;

        // Create paragraph boxes vertically under the heading
        for (let paraIdx = 0; paraIdx < paragraphs.length; paraIdx++) {
          const paragraph = paragraphs[paraIdx];

          // Skip empty paragraphs
          if (!paragraph || paragraph.trim() === '') {
            continue;
          }

          // Create paragraph box
          const paragraphBox = new TextBox(currentX, currentY, paragraph);

          // Set fixed width for imported boxes
          paragraphBox.width = IMPORT_LAYOUT.IMPORTED_BOX_WIDTH;
          paragraphBox.userResized = true;
          paragraphBox.updateDimensions();

          // Adjust Y to center position
          paragraphBox.y = currentY + paragraphBox.height / 2;

          // Ensure target position is updated to prevent interpolation snap-back
          paragraphBox.targetX = paragraphBox.x;
          paragraphBox.targetY = paragraphBox.y;

          mindMap.addBox(paragraphBox);

          // Connect to previous box
          if (previousParagraphBox) {
            mindMap.addConnection(previousParagraphBox, paragraphBox);
          } else {
            // First paragraph: connect to heading
            mindMap.addConnection(headingBox, paragraphBox);
          }

          // Calculate next box position
          currentY = paragraphBox.y + paragraphBox.height / 2 + IMPORT_LAYOUT.VERTICAL_SPACING;
          previousParagraphBox = paragraphBox;
        }

        // Move to next column
        currentX += IMPORT_LAYOUT.HORIZONTAL_SPACING;
      }
    }, 'Import Text');

    // Mark map as dirty
    mindMap.isDirty = true;
    mindMap.isSaved = false;

    // Sync connections
    if (MindMap.onConnectionsChange) {
      MindMap.onConnectionsChange();
    }

    // Save to localStorage
    try {
      mindMap.saveToLocalStorage();
    } catch (e) {
      console.warn('Failed to autosave after text import:', e);
    }

    // Reset view
    try {
      resetView();
    } catch (e) {
      console.warn('resetView failed after text import:', e);
    }
  }

  /**
   * Parses text into sections (headings + paragraphs) using the Compromise NLP library.
   * 
   * Enhanced NLP Algorithm:
   * 1. Detects Markdown ATX and Setext headings first.
   * 2. Uses NLP to identify "heading-like" fragments (short, no verbs, noun-heavy).
   * 3. Groups sentences into paragraphs under their respective headings.
   * 
   * @param {string[]} lines - Array of raw lines from the text file
   * @returns {Array<{heading: string, paragraphs: string[]}>} Parsed sections
   */
  static parseTextIntoSections(lines) {
    if (typeof nlp === 'undefined') {
      console.warn('Compromise NLP library not loaded. Falling back to basic parsing.');
      return this.basicFallbackParse(lines);
    }

    const sections = [];
    let currentHeading = null;
    let currentParagraphs = [];
    let wasPreviousLineEmpty = true;
    let inBibliography = false;

    // Detect if the document uses Markdown style headers (#)
    const hasMarkdownHeaders = lines.some(l => /^#+\s/.test(l.trim()));

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        // Handle empty lines
        let emptyLineCount = 1;
        while (i + 1 < lines.length && lines[i + 1].trim() === '') {
          emptyLineCount++;
          i++;
        }

        // Multi-line break used to reset the section, but now we keep paragraphs 
        // together in the same column unless a new heading is explicitly detected.
        // This ensures a "neat round trip" where sequential white boxes stay grouped.
        if (inBibliography && (currentHeading || currentParagraphs.length > 0)) {
          // Keep bibliography behavior
        }

        wasPreviousLineEmpty = true;
        continue;
      }

      const nextLine = (i + 1 < lines.length) ? lines[i + 1].trim() : null;
      const headingDetected = this.nlpDetectHeading(line, wasPreviousLineEmpty, nextLine, hasMarkdownHeaders, inBibliography);

      if (headingDetected) {
        // If we found a NEW heading, commit previous
        if (currentHeading || currentParagraphs.length > 0) {
          this.commitSection(sections, currentHeading, currentParagraphs);
        }

        currentHeading = line;
        currentParagraphs = [];

        // Check if this new heading is a bibliography
        inBibliography = this.isBibliographyHeading(line);

        // If it was a Setext underline, skip the next line
        if (nextLine && /^(={3,}|-{3,})$/.test(nextLine)) {
          i++;
        }
      } else if (!currentHeading) {
        currentHeading = line;
        inBibliography = this.isBibliographyHeading(line);
      } else {
        // It's a paragraph
        currentParagraphs.push(line);
      }

      wasPreviousLineEmpty = false;
    }

    // Final commit
    if (currentHeading || currentParagraphs.length > 0) {
      this.commitSection(sections, currentHeading || 'Untitled', currentParagraphs);
    }

    return sections;
  }

  /**
   * Identifies the index of the most likely title section.
   * Scans early sections for Markdown H1, "Title:" markers, or short fragments
   * that don't look like metadata.
   */
  static detectTitleIndex(sections) {
    if (sections.length === 0) return -1;

    // Matches standalone sections or explicit metadata prefixes
    const metadataKeywords = /^(author|date|doi|issn|preprint|page|submitted|id|abstract|introduction|methodology|results|discussion|conclusion|references|bibliography)$|^(author|date|doi|issn|id|title):|^submitted to/i;

    // Scan the first few sections (title is usually near the top)
    const scanLimit = Math.min(sections.length, 5);

    // Priority 1: Markdown H1 or "Title:" prefix
    for (let i = 0; i < scanLimit; i++) {
      const h = sections[i].heading.trim();
      if (/^#\s/.test(h) || /^title:\s*/i.test(h)) {
        return i;
      }
    }

    // Priority 2: First short heading that isn't common metadata
    for (let i = 0; i < scanLimit; i++) {
      const h = sections[i].heading.trim();
      // Use NLP word count for consistency if available
      let wordCount;
      if (typeof nlp !== 'undefined') {
        const doc = nlp(h);
        wordCount = doc.wordCount();
      } else {
        // Fallback word count
        wordCount = h.trim().split(/\s+/).length;
      }

      // Titles are usually fragments, 1-15 words, no terminal punctuation
      if (!metadataKeywords.test(h)) {
        if (wordCount >= 1 && wordCount <= 15 && !/[.;]$/.test(h)) {
          return i;
        }
      }
    }

    // Fallback: first section
    return 0;
  }

  /**
   * Checks if a heading string indicates a bibliography section
   */
  static isBibliographyHeading(heading) {
    if (!heading) return false;

    // Bibliography headings are short fragments, not long sentences
    const words = heading.trim().split(/\s+/);
    if (words.length > 5) return false;

    const keywords = '(bibliography|references|sources|citations|refrences|works cited)';

    // Check with NLP first
    if (typeof nlp !== 'undefined') {
      if (nlp(heading).match(keywords).found) return true;
    }

    // Regex fallback/supplement with word boundaries
    const lower = heading.toLowerCase();
    return /\b(references|bibliography|sources|citations|works cited|works-cited)\b/.test(lower);
  }

  /**
   * Helper to commit a section to the results
   */
  static commitSection(sections, heading, paragraphs) {
    if (!heading && paragraphs.length === 0) return;

    let processedParagraphs = paragraphs;

    // Check if this is a bibliography/references section
    let isBibliography = this.isBibliographyHeading(heading);

    // If bibliography, group all paragraphs into a single entry
    if (isBibliography && paragraphs.length > 0) {
      processedParagraphs = [paragraphs.join('\n')];
    }

    sections.push({
      heading: heading || 'Section',
      paragraphs: processedParagraphs.length > 0 ? processedParagraphs : ['']
    });
  }

  /**
   * Uses NLP and heuristics to detect if a line is a heading
   */
  static nlpDetectHeading(line, previousLineEmpty, nextLine, hasMarkdownHeaders = false, inBibliography = false) {
    if (!line) return false;

    // 1. Hard Markdown Checks (High Confidence)
    if (/^#+\s/.test(line)) return true;
    if (nextLine && /^(={3,}|-{3,})$/.test(nextLine)) return true;

    // IF IN A BIBLIOGRAPHY SECTION: Skip fragment detection to avoid false positives with citations
    if (inBibliography) {
      // Still allow NEW numbered sections (e.g. "7. References" -> "8. Conclusion")
      // but avoid things that look like citations (Authors, Initial. (2023)...)
      // FIX: Added \.? to match the dot after the number
      if (/^\d+(\.\d+)*\.?[\s\t]+[A-Z]/.test(line) && !/\(\d{4}\)/.test(line)) return true;
      return false;
    }

    // IF DOCUMENT USES MARKDOWN HEADERS: Only follow Markdown/Explicit rules
    // This ensures a "neat round trip" for exported .md files.
    if (hasMarkdownHeaders) {
      if (this.isBibliographyHeading(line)) return true;
      return false;
    }

    // 2. Clear Paragraph Patterns (Early Exit)
    // Bullet points are always list items
    if (/^[\s]*([-*+])\s/.test(line)) return false;

    // Numbered lines - check if it's a heading or a list item
    // Matches "1. ", "1.1 ", "1.2.3 ", etc. Supporting both space and tab.
    const numberedMatch = line.match(/^(\d+(?:\.\d+)*)\.[\s\t]+(.*)/);
    if (numberedMatch) {
      const number = numberedMatch[1];
      const title = numberedMatch[2];

      // Multi-level (1.1, 1.2.3) are almost certainly headings
      if (number.includes('.')) return true;

      // If followed by another sequential-looking number, it's likely a list
      if (nextLine) {
        const nextNumberedMatch = nextLine.match(/^(\d+(?:\.\d+)*)\.[\s\t]+/);
        if (nextNumberedMatch) return false;
      }

      // If it ends with punctuation like a sentence (period, exclamation, colon), 
      // it's likely a list item/paragraph. However, we allow QUESTION MARKS for headings.
      if (/[.!:]\s*$/.test(line)) return false;

      // Use NLP to verify if it's a single sentence
      const doc = nlp(line);
      if (doc.sentences().length > 1) return false;

      // If it's short and isolated (preceded by empty line), it's likely a heading
      const wordCount = doc.wordCount();
      if (wordCount <= 12 && previousLineEmpty) return true;

      // Special case for questions: if it's a short numbered question, it's likely a heading
      // even if there is no empty line above it (common in research papers).
      if (line.trim().endsWith('?') && wordCount <= 15) return true;

      // Otherwise, keep evaluating (might still be caught by NLP or title case checks)
    }

    if (/^[\s]*>/.test(line)) return false; // Quotes

    // 3. Punctuation Check - Headings rarely end with a period.
    // However, if it's a short numbered heading (e.g. "1. Introduction"), it's fine.
    // We already handled valid numbered heads above.
    if (/[.;]$/.test(line) && !/^\d+(\.\d+)*\s/.test(line)) return false;

    // 4. Citation check: looks like "Author, A. (Year)" or has a year in parens.
    // Skip these as headings even if not explicitly in a bibliography section.
    if (/\(\d{4}\)/.test(line) || /^[A-Z][a-z]+, [A-Z]\./.test(line)) return false;

    // 5. NLP Analysis
    const doc = nlp(line);
    const hasVerbs = doc.verbs().found;
    const wordCount = doc.wordCount();

    // 5. Context-aware check: If NO empty line, we need stronger signals
    const nextDoc = nextLine ? nlp(nextLine) : null;
    const nextHasVerbs = nextDoc ? nextDoc.verbs().found : false;
    const nextEndsWithPunctuation = nextLine && /[.?!]$/.test(nextLine);

    // Headings are usually short fragments
    const isShort = wordCount > 0 && wordCount <= 12;
    if (!isShort) return false;

    // Case analysis - more robust Title Case check than compromise's loose default
    const isAllCaps = line === line.toUpperCase() && /[A-Z]/.test(line);
    const words = line.split(/\s+/).filter(w => w.length > 0);
    const cappedWords = words.filter(w => /^[A-Z]/.test(w));
    // Most words capped (ignoring typical small words)
    const isTitleCase = words.length > 0 && (cappedWords.length / words.length >= 0.7 || doc.has('@isTitleCase'));

    // Numbered headings (already covered by specialized logic above, but keeping regex fallback)
    if (/^\d+(\.\d+)*\s+[A-Z]/.test(line)) return true;

    // Heuristic weighting
    // A short line is likely a heading if it has no verbs (noun fragment) 
    // OR it contains verbs but is in Title Case (e.g. "Attention Is All You Need")
    if (!hasVerbs || isTitleCase) {
      // If it's title case or all caps, it's a strong signal
      if (isTitleCase || isAllCaps) return true;

      // If no empty line, but next line looks like a proper sentence starting a paragraph
      // This helps catch headings like "Playful Intervention" that are immediately followed by a block of text
      if (!previousLineEmpty && nextLine && (nextHasVerbs || nextEndsWithPunctuation)) {
        return true;
      }

      // If previous line WAS empty, we're more lenient
      if (previousLineEmpty) return true;
    }

    // Special case: Explicit Bibliography keywords (High Priority)
    if (this.isBibliographyHeading(line)) return true;

    return false;
  }

  /**
   * Fallback for when nlp library is missing
   */
  static basicFallbackParse(lines) {
    // Simplified version of our previous heuristic
    const sections = [];
    let currentHeading = null;
    let currentParagraphs = [];

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      if (!currentHeading) {
        currentHeading = line;
      } else {
        currentParagraphs.push(line);
      }
    }
    if (currentHeading) {
      sections.push({ heading: currentHeading, paragraphs: currentParagraphs });
    }
    return sections;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TextImporter;
}

// Expose globally for browser usage
if (typeof window !== 'undefined') {
  window.TextImporter = TextImporter;
}
