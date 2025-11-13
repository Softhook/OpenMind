# Text Editing Manual Test Cases

## Purpose
This document describes manual test cases for investigating rare intermittent cursor position issues during text editing in OpenMind.

## Test Environment Setup
1. Open OpenMind in your browser
2. Create a new text box (press N or click to create)
3. Click inside the box to enter edit mode

## Test Cases for Cursor Position Issues

### Test Group 1: Basic Cursor Movement
**Test 1.1: Character-by-character navigation**
- Type: "The quick brown fox"
- Use left arrow to move cursor to the start
- Use right arrow to move cursor to the end
- Expected: Cursor moves one character at a time in each direction
- Watch for: Cursor jumping or skipping characters

**Test 1.2: Word boundaries**
- Type: "word1 word2 word3"
- Position cursor in the middle of "word2"
- Press left/right arrows multiple times
- Expected: Smooth movement, no jumps
- Watch for: Cursor appearing in wrong position after movement

### Test Group 2: Text Wrapping Edge Cases
**Test 2.1: Long text that wraps**
- Type a very long sentence without line breaks until it wraps to 2+ visual lines
- Move cursor up and down between wrapped lines
- Expected: Cursor maintains horizontal position when moving between lines
- Watch for: Cursor jumping to unexpected positions

**Test 2.2: Editing at wrap point**
- Type text until it wraps
- Position cursor exactly where the wrap occurs
- Insert and delete characters
- Expected: Cursor position remains accurate
- Watch for: Cursor position shifting unpredictably

**Test 2.3: Mixed content wrapping**
- Type: "Short line\n[very long line that will wrap to multiple visual lines when displayed]\nShort line"
- Navigate through all lines with arrow keys
- Expected: Smooth navigation through wrapped and non-wrapped lines
- Watch for: Cursor position errors when crossing wrapped sections

### Test Group 3: Special Character Handling
**Test 3.1: Newlines and cursor**
- Type multiple lines with Enter key
- Navigate with up/down arrows between lines
- Expected: Cursor moves between logical lines correctly
- Watch for: Cursor skipping lines or appearing at wrong column

**Test 3.2: Tab characters**
- Type text with Tab characters
- Move cursor through tabs
- Expected: Cursor treats tab as single character
- Watch for: Visual cursor position not matching logical position

**Test 3.3: Emoji and multi-byte characters**
- Type: "Hello 🎉 World 你好"
- Navigate through the text with arrow keys
- Expected: Cursor treats each character (including emoji) as single unit
- Watch for: Cursor appearing inside multi-byte characters

### Test Group 4: Rapid Editing
**Test 4.1: Fast typing**
- Type rapidly: "the quick brown fox jumps over the lazy dog" without pausing
- Expected: All characters appear, cursor at end
- Watch for: Characters appearing in wrong order or cursor position errors

**Test 4.2: Rapid deletion**
- Type a sentence
- Hold backspace to delete all characters
- Expected: Smooth deletion, cursor stays at deletion point
- Watch for: Cursor jumping around during deletion

**Test 4.3: Rapid insertion in middle**
- Type: "ABC XYZ"
- Position cursor between C and X
- Type quickly: "123456789"
- Expected: Numbers inserted in order at cursor position
- Watch for: Characters appearing elsewhere or cursor jumping

### Test Group 5: Selection and Cursor
**Test 5.1: Selection via mouse drag**
- Type: "Select this text"
- Click and drag to select some text
- Release mouse
- Expected: Cursor at end of selection
- Watch for: Cursor position not matching visual selection end

**Test 5.2: Double-click word selection**
- Type: "word1 word2 word3"
- Double-click on "word2"
- Expected: "word2" is selected, cursor at end of selection
- Watch for: Wrong word selected or cursor in wrong position

**Test 5.3: Delete selection then type**
- Type: "Replace this word"
- Select "this"
- Type: "that"
- Expected: "Replace that word" with cursor after "that"
- Watch for: Cursor position error after replacement

### Test Group 6: Copy/Paste and Cursor
**Test 6.1: Paste at cursor**
- Type: "Start"
- Copy "Inserted" to clipboard
- Position cursor after "Start"
- Paste
- Expected: "StartInserted" with cursor after "Inserted"
- Watch for: Cursor not at end of pasted text

**Test 6.2: Paste over selection**
- Type: "Replace middle here"
- Select "middle"
- Paste: "new"
- Expected: "Replace new here" with cursor after "new"
- Watch for: Cursor position error after paste

### Test Group 7: Undo and Cursor Position
**Test 7.1: Undo single character**
- Type: "Test"
- Press Ctrl/Cmd+Z
- Expected: "Tes" with cursor at end
- Watch for: Cursor not at end after undo

**Test 7.2: Multiple undo operations**
- Type several characters
- Undo multiple times
- Expected: Each undo removes one operation, cursor tracks correctly
- Watch for: Cursor position not matching text state

### Test Group 8: Box Resizing and Cursor
**Test 8.1: Resize while editing**
- Type a long paragraph
- While in edit mode, resize the box smaller
- Continue typing
- Expected: Cursor position remains accurate as text reflows
- Watch for: Cursor appearing at wrong position after resize

**Test 8.2: Resize then navigate**
- Type text that fills the box
- Resize box to change wrapping
- Navigate with arrow keys
- Expected: Navigation works correctly with new wrapping
- Watch for: Cursor position errors with changed line breaks

### Test Group 9: Focus/Blur Edge Cases
**Test 9.1: Click outside while editing**
- Start editing a box
- Click on canvas (not in box)
- Click back in box
- Expected: Editing stops then restarts, cursor at click position
- Watch for: Cursor appearing at wrong position on re-entry

**Test 9.2: Switch between boxes**
- Create two boxes
- Edit first box
- Click in second box
- Click back in first box
- Expected: Cursor position preserved or reset appropriately
- Watch for: Cursor data from one box affecting the other

### Test Group 10: Stress Testing
**Test 10.1: Very long text**
- Paste or type 1000+ characters
- Navigate to various positions
- Insert/delete at different points
- Expected: Cursor position always accurate
- Watch for: Performance degradation or position errors in long text

**Test 10.2: Many boxes with editing**
- Create 10+ text boxes
- Edit each one briefly
- Switch between boxes while editing
- Expected: No interference between boxes
- Watch for: Cursor state leaking between boxes

## Recording Issues

When you encounter an issue:
1. Note the exact steps to reproduce
2. Record the expected cursor position (character index)
3. Record the actual cursor position (where it appears visually)
4. Note any text that was being edited
5. Check browser console for any errors
6. Take a screenshot if possible

## Known Potential Causes of Cursor Issues

Based on code review, watch for issues related to:

1. **Wrapped text line mapping**: The `cachedLineCharMap` might not be in sync with actual text
2. **Mouse click position calculation**: The `getCursorPositionFromMouse` function does complex calculations
3. **Multi-byte character handling**: Emoji and unicode might affect cursor calculations
4. **Text sanitization timing**: Character normalization might affect cursor tracking
5. **Selection state**: Cursor might not update correctly when selection changes

## Browser Differences

Test in multiple browsers:
- Chrome/Edge (Chromium)
- Firefox
- Safari (macOS)

Different browsers handle:
- Key repeat rates differently
- Text rendering metrics differently
- Unicode characters differently

## Reporting Results

After testing, document:
1. Which tests passed
2. Which tests failed (with reproduction steps)
3. Any intermittent issues (occurred sometimes but not always)
4. Browser and OS version
5. Any console errors or warnings
