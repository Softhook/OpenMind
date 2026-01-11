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
      VERTICAL_SPACING: 30,      // Gap between paragraph boxes
      IMPORTED_BOX_WIDTH: 400    // Width for all imported boxes
    };

    // Clear current selection
    mindMap.clearBoxSelection();
    if (mindMap.selectedBox) {
      mindMap.selectedBox.stopEditing();
      mindMap.selectedBox = null;
    }

    // Create all boxes and track them for undo
    mindMap.pushUndo();

    const allNewBoxes = [];
    let currentX = IMPORT_LAYOUT.START_X;

    // Process each section
    for (let sectionIdx = 0; sectionIdx < sections.length; sectionIdx++) {
      const section = sections[sectionIdx];
      const heading = section.heading;
      const paragraphs = section.paragraphs;

      // Create heading box (orange - key 2)
      const headingBox = new TextBox(currentX, IMPORT_LAYOUT.START_Y, heading);
      headingBox.setBackgroundByKey('orange'); // Key 2 = orange

      // Set fixed width for imported boxes
      headingBox.width = IMPORT_LAYOUT.IMPORTED_BOX_WIDTH;
      headingBox.userResized = true;
      headingBox.updateDimensions();

      mindMap.boxes.push(headingBox);
      allNewBoxes.push(headingBox);

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

        mindMap.boxes.push(paragraphBox);
        allNewBoxes.push(paragraphBox);

        // Connect to previous box
        if (previousParagraphBox) {
          mindMap.connections.push(new Connection(previousParagraphBox, paragraphBox));
        } else {
          // First paragraph: connect to heading
          mindMap.connections.push(new Connection(headingBox, paragraphBox));
        }

        // Calculate next box position
        currentY = paragraphBox.y + paragraphBox.height / 2 + IMPORT_LAYOUT.VERTICAL_SPACING;
        previousParagraphBox = paragraphBox;
      }

      // Move to next column
      currentX += IMPORT_LAYOUT.HORIZONTAL_SPACING;
    }

    // Mark map as dirty
    mindMap.isDirty = true;
    mindMap.isSaved = false;

    // Sync to collaboration system
    if (MindMap.onBoxChange) {
      for (const box of allNewBoxes) {
        if (box && box.id) {
          MindMap.onBoxChange(box);
        }
      }
    }

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

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        // Handle empty lines
        let emptyLineCount = 1;
        while (i + 1 < lines.length && lines[i + 1].trim() === '') {
          emptyLineCount++;
          i++;
        }

        // Multi-line break resets the section if we have content
        if (emptyLineCount >= 2 && (currentHeading || currentParagraphs.length > 0)) {
          this.commitSection(sections, currentHeading, currentParagraphs);
          currentHeading = null;
          currentParagraphs = [];
        }

        wasPreviousLineEmpty = true;
        continue;
      }

      const nextLine = (i + 1 < lines.length) ? lines[i + 1].trim() : null;
      const headingDetected = this.nlpDetectHeading(line, wasPreviousLineEmpty, nextLine);

      if (headingDetected) {
        // If we found a NEW heading format, commit previous
        if (currentHeading || currentParagraphs.length > 0) {
          this.commitSection(sections, currentHeading, currentParagraphs);
        }

        currentHeading = line;
        currentParagraphs = [];

        // If it was a Setext underline, skip the next line
        if (nextLine && /^(={3,}|-{3,})$/.test(nextLine)) {
          i++;
        }
      } else if (!currentHeading) {
        // If no heading yet, this line MUST be the heading unless it's very long
        // (Better to have an untitled section than lost content)
        currentHeading = line;
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
   * Helper to commit a section to the results
   */
  static commitSection(sections, heading, paragraphs) {
    if (!heading && paragraphs.length === 0) return;

    let processedParagraphs = paragraphs;

    // Check if this is a bibliography/references section
    // Use compromise to match keywords if available
    let isBibliography = false;
    if (heading && typeof nlp !== 'undefined') {
      isBibliography = nlp(heading).match('(bibliography|references|sources|citations)').found;
    } else if (heading) {
      // Basic fallback check
      const lowerHeading = heading.toLowerCase();
      isBibliography = lowerHeading.includes('references') ||
        lowerHeading.includes('bibliography') ||
        lowerHeading.includes('sources');
    }

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
  static nlpDetectHeading(line, previousLineEmpty, nextLine) {
    if (!line) return false;

    // 1. Explicit Bibliography/Reference keywords (High Priority)
    const isBibHeading = /^(references|bibliography|sources|citations|refrences|works cited)$/i.test(line);
    if (isBibHeading) return true;

    // 2. Hard Markdown Checks (High Confidence)
    if (/^#+\s/.test(line)) return true;
    if (nextLine && /^(={3,}|-{3,})$/.test(nextLine)) return true;

    // 2. Clear Paragraph Patterns (Early Exit)
    if (/^[\s]*([-*+]|\d+\.)\s/.test(line)) return false; // List items
    if (/^[\s]*>/.test(line)) return false; // Quotes

    // 3. Punctuation Check
    // Standard headings rarely end with a period. 
    // If it ends with . or ; it's almost certainly a paragraph.
    if (/[.;]$/.test(line)) return false;

    // 4. NLP Analysis
    const doc = nlp(line);
    const hasVerbs = doc.verbs().found;
    const wordCount = doc.wordCount();

    // Headings are usually short fragments
    const isShort = wordCount > 0 && wordCount <= 12;
    if (!isShort) return false;

    // Case analysis
    const isAllCaps = line === line.toUpperCase() && /[A-Z]/.test(line);
    const isTitleCase = doc.has('@isTitleCase');

    // Numbered headings (e.g. "1.1 Introduction") - usually headings even if short
    if (/^\d+(\.\d+)*\s+[A-Z]/.test(line)) return true;

    // Heuristic weighting
    // A short, verbless line is a heading if it follows a gap OR has strong formatting.
    if (!hasVerbs) {
      if (previousLineEmpty || isTitleCase || isAllCaps) return true;
    }

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
