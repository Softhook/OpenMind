# Changelog

## [Optimized Version] - 2025-10-28

### Performance Improvements
- **Text Wrapping Cache**: Added caching mechanism to TextBox class to avoid redundant text wrapping calculations
  - Cached wrapped lines are reused until text or width changes
  - Significantly reduces CPU usage during rendering
  
- **Debounced Window Resize**: Implemented 16ms debounce on window resize operations
  - Prevents expensive recalculations during window dragging
  - Maintains ~60fps during resize operations

- **Memory Management**: Enhanced undo/redo system
  - Increased undo stack from 5 to 20 snapshots for better UX
  - Implemented proper cleanup in fromJSON to prevent memory leaks
  - Added deep cloning to prevent reference issues

### Code Organization
- **Configuration Constants**: Extracted all magic numbers into centralized constants
  - Created CONFIG object in sketch.js for all application constants
  - Added static constants to TextBox, Connection, and MindMap classes
  - Improves maintainability and consistency

- **Function Extraction**: Separated UI setup into dedicated function
  - Improved readability of setup() function
  - Better code organization

- **Line Height Consistency**: Replaced all hardcoded line height calculations
  - Now uses TextBox.LINE_HEIGHT_MULTIPLIER constant (1.5)
  - Ensures consistent spacing throughout application

### Error Handling
- **Enhanced File Loading**: Comprehensive validation and error messages
  - File type validation
  - JSON structure validation
  - User-friendly error messages
  - Graceful error recovery

- **Setup Error Handling**: Added try-catch around setup() function
  - Prevents application crash on initialization errors
  - Provides helpful error messages to users

- **Input Validation**: Enhanced validation throughout
  - All mouse coordinate checks verify finite values
  - Box data validation with sensible fallbacks
  - Connection validation before creation

### New Features
- **Dirty Flag System**: Added isDirty flag to MindMap
  - Tracks when content changes
  - Enables future optimizations for conditional rendering

### Constants Added

#### sketch.js (CONFIG object)
- ZOOM: MIN (0.2), MAX (3.0), STEP (1.05)
- CAMERA: PAN_MARGIN (500)
- UI: TOOLBAR_HEIGHT (40), MENU_TRIGGER_X (50), MENU_TRIGGER_Y (50)
- EXPORT: PADDING (50), MARGIN (20)

#### TextBox.js (static constants)
- PADDING (15), MIN_WIDTH (80), MIN_HEIGHT (40), MAX_WIDTH (300)
- FONT_SIZE (14), CORNER_RADIUS (10)
- DELETE_ICON_SIZE (20), RESIZE_HANDLE_SIZE (12)
- CURSOR_BLINK_RATE (530), DRAG_EDGE_THICKNESS (16)
- COLOR_CIRCLE_RADIUS (8), COLOR_CIRCLE_SPACING (10)
- LINE_HEIGHT_MULTIPLIER (1.5)

#### Connection.js (static constants)
- ARROW_SIZE (10), HIT_THRESHOLD (5)
- STROKE_WEIGHT_NORMAL (2), STROKE_WEIGHT_SELECTED (3)

#### MindMap.js (static constants)
- MAX_UNDO_STACK (20), ALIGN_TOLERANCE (12)

### Documentation
- Updated README.md with Performance Optimizations section
- Created OPTIMIZATIONS.md with detailed technical documentation
- Created this CHANGELOG.md for tracking changes

### Backward Compatibility
- All optimizations maintain full backward compatibility
- Existing saved mind maps load without issues
- No breaking changes to the API or file format

### Bug Fixes
- Fixed potential memory leaks in undo system
- Improved error handling to prevent crashes
- Better validation prevents invalid state

### Technical Debt Reduction
- Removed scattered magic numbers
- Consolidated duplicate code
- Improved function naming and organization
- Better separation of concerns

---

## Previous Version
All features and functionality from the original version are maintained and enhanced.
