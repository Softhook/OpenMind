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
   * Parses lines of text into sections with headings and paragraphs.
   * 
   * Enhanced algorithm with improved heuristics:
   * 
   * **Heading Detection:**
   * - Short standalone sentence (ends with . ! ?)
   * - Length < 80 characters
   * - Word count 2-10 words
   * - No internal sentence-ending punctuation
   * - Supports numbered lists (e.g., "1.", "4.1", "2.3.1")
   * - Bonus indicators: all caps, title case, no commas
   * 
   * **Paragraph Detection:**
   * - Each non-empty line becomes a separate paragraph box
   * - Single empty line creates paragraph break
   * - Multiple empty lines (2+) create section breaks
   * 
   * @param {string[]} lines - Array of trimmed text lines
   * @returns {Array<{heading: string, paragraphs: string[]}>} Parsed sections
   */
  static parseTextIntoSections(lines) {
    const sections = [];
    let currentHeading = null;
    let currentParagraphs = [];
    let currentParagraphLines = [];

    // Heading detection thresholds
    const HEADING_MAX_LENGTH = 80;
    const HEADING_VERY_SHORT = 50;
    const HEADING_MIN_WORDS = 2;
    const HEADING_MAX_WORDS = 10;
    const HEADING_SIMPLE_MAX_WORDS = 7;
    const TITLE_CASE_THRESHOLD = 0.6;

    const isHeading = (line) => {
      if (!line || line.length === 0) return false;
      
      // Check for numbered list format including decimal numbering
      const numberPrefixPattern = /^\d+(\.\d+)*\s+/;
      const hasNumberPrefix = numberPrefixPattern.test(line);
      
      // Remove number prefix for analysis
      const lineWithoutNumber = hasNumberPrefix ? line.replace(numberPrefixPattern, '') : line;
      
      // Must end with punctuation OR have number prefix
      const endsWithPunctuation = /[.!?]$/.test(line);
      if (!endsWithPunctuation && !hasNumberPrefix) return false;
      
      // Length check
      const isShort = lineWithoutNumber.length < HEADING_MAX_LENGTH;
      if (!isShort) return false;
      
      // Remove ending punctuation once
      const textWithoutEnding = lineWithoutNumber.replace(/[.!?]$/, '');
      
      // No internal punctuation
      const hasInternalPunctuation = /[.!?]/.test(textWithoutEnding);
      if (hasInternalPunctuation) return false;
      
      // Word count analysis
      const wordCount = lineWithoutNumber.split(/\s+/).filter(Boolean).length;
      
      // Additional heuristics
      const hasCommas = lineWithoutNumber.includes(',');
      const hasSemicolon = lineWithoutNumber.includes(';');
      const hasColon = lineWithoutNumber.includes(':');
      const isVeryShort = lineWithoutNumber.length < HEADING_VERY_SHORT;
      
      // Title case detection
      const words = textWithoutEnding.split(/\s+/).filter(Boolean);
      const capitalizedWords = words.filter(w => /^[A-Z]/.test(w)).length;
      const isTitleCase = capitalizedWords >= Math.ceil(words.length * TITLE_CASE_THRESHOLD);
      
      // All caps detection
      const isAllCaps = /^[A-Z\s.!?]+$/.test(lineWithoutNumber) && /[A-Z]/.test(lineWithoutNumber);
      
      // Evaluate heading criteria
      const hasComplexPunctuation = hasCommas || hasSemicolon || hasColon;
      const reasonableWordCount = wordCount >= HEADING_MIN_WORDS && wordCount <= HEADING_MAX_WORDS;
      
      const isLikelyHeading = reasonableWordCount && (
        hasNumberPrefix ||
        isVeryShort ||
        (!hasComplexPunctuation && wordCount <= HEADING_SIMPLE_MAX_WORDS) ||
        isTitleCase ||
        isAllCaps
      );
      
      return isLikelyHeading;
    };

    const finishParagraph = () => {
      if (currentParagraphLines.length > 0) {
        const paragraph = currentParagraphLines.join('\n').trim();
        if (paragraph) {
          currentParagraphs.push(paragraph);
        }
        currentParagraphLines = [];
      }
    };

    const finishSection = () => {
      finishParagraph();
      
      if (currentHeading) {
        if (currentParagraphs.length === 0) {
          sections.push({
            heading: currentHeading,
            paragraphs: [''] // Placeholder
          });
        } else {
          sections.push({
            heading: currentHeading,
            paragraphs: currentParagraphs
          });
        }
      }
      currentHeading = null;
      currentParagraphs = [];
    };

    // Process lines
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Empty line handling
      if (line === '') {
        let emptyLineCount = 1;
        while (i + 1 < lines.length && lines[i + 1] === '') {
          emptyLineCount++;
          i++;
        }

        finishParagraph();

        // Multiple empty lines = section break
        if (emptyLineCount >= 2) {
          finishSection();
        }
        continue;
      }

      // Check if heading
      if (isHeading(line)) {
        finishSection();
        currentHeading = line;
        continue;
      }

      // Regular line
      if (!currentHeading) {
        currentHeading = line;
        continue;
      }

      // Add to paragraph and finish immediately (single-line paragraphs)
      currentParagraphLines.push(line);
      finishParagraph();
    }

    // Finish remaining content
    finishSection();

    return sections;
  }
}
