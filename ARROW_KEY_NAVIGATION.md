# Arrow Key Navigation Feature

## Overview
Arrow key navigation allows users to move focus between text boxes using the keyboard arrow keys (UP, DOWN, LEFT, RIGHT). The navigation follows a priority-based system that considers box color and position.

## Priority System

### Color Priority (First)
1. **Red boxes** (r=255, g=140, b=140) - Highest priority
2. **Orange boxes** (r=255, g=200, b=140) - Medium priority  
3. **White/Other boxes** (r=255, g=255, b=255) - Lowest priority

### Position Priority (Second)
Within each color group, boxes are sorted by:
1. **Top-to-bottom** (Y position)
2. **Left-to-right** (X position) for boxes at similar Y positions

## Usage

### When NOT Editing Text
- **Arrow Keys (UP/DOWN/LEFT/RIGHT)**: Navigate through boxes in priority order
  - UP/LEFT: Move to previous box in the sequence
  - DOWN/RIGHT: Move to next box in the sequence
  - Navigation wraps around (from last to first and vice versa)

### When Editing Text
- Arrow keys move the cursor within the text box (existing behavior)
- Click outside the box or press ESC to exit editing mode

## Features

### Automatic Camera Panning
- When navigating to a box that's outside the visible viewport, the camera automatically pans to center it
- Boxes within 100px margin of viewport edges are considered visible

### Visual Feedback
- Selected box is highlighted with a blue outline
- Box color circles are visible on selected boxes (when not editing)

## Implementation Details

### Main Method: `navigateBoxes(keyCode)`
Located in `MindMap.js`, this method:
1. Sorts all boxes by color priority and position
2. Finds the current selected box in the sorted list
3. Calculates the next box based on arrow key direction
4. Selects and focuses the next box
5. Pans camera if needed

### Helper Method: `panToBox(box)`
Handles automatic camera panning to keep the selected box visible.

## Code Changes

### Files Modified:
1. **MindMap.js**
   - Added `navigateBoxes(keyCode)` method
   - Added `panToBox(box)` helper method
   - Updated `handleKeyPressed()` to call navigation when not editing

2. **sketch.js**
   - Added prevention of default behavior for arrow keys when navigating

3. **todo.md**
   - Updated with implementation notes

## Testing
See `test_navigation.md` for detailed testing instructions.

## Future Enhancements
- Consider adding modifier keys for different navigation modes
- Add visual indicators for navigation order
- Allow customization of color priorities
