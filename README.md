# OpenMind - Mind Mapping Software

Author: Christian Nold (2025) • Live App: https://softhook.github.io/OpenMind

![OpenMind mind map screenshot](./screenshot.png)

OpenMind is a fast, keyboard-driven mind mapping app built with p5.js. Create, connect, and export ideas with minimal friction.

## Quick Start

- Use it instantly in the browser: https://softhook.github.io/OpenMind

## Loading and Saving Maps

- Click **Save** to download a JSON map. On Chrome/Edge you can pick a folder; other browsers download to `Downloads`.
- Click **Load** to import a saved JSON. Sample maps live in the `maps/` folder (e.g., `maps/ResearchSummary.json`).
- Export your canvas via **Export PNG**, **Export PDF**, or **Export Text** from the menu.

## Features

- Create and edit nodes with auto-resizing text boxes
- Move nodes, resize via the bottom-right circular handle, and multi-select
- Multi-select & group drag: toggle selection with Shift, then drag from a selected box edge to move as a group
- Create connections between boxes; drag a connection’s arrowhead to reattach to a different box
- Reverse a connection via Space (when selected)
- Copy/Paste nodes (Cmd/Ctrl+C, Cmd/Ctrl+V) at the cursor location
- Delete selected nodes or connections (Backspace/Delete)
- Undo (Cmd/Ctrl+Z)
- Pan and zoom the entire view, reset to fit
- Export PNG, PDF, and Text
- Save/Load maps as JSON files
   - On Chromium-based browsers (Chrome/Edge), Save opens a system Save As dialog (File System Access API)
   - On other browsers, it downloads to your default Downloads folder

## Menu Reference

- **New Box**: Create a node at a random position
- **Save**: Download your mind map as JSON
- **Load**: Import a previously saved map
- **Export PNG/PDF/Text**: Download image, PDF, or plain-text outline
- **Reset View**: Fit all boxes to the viewport

## How to Use

### Keyboard Controls

Global (when NOT editing text):

- N: create a new box at the cursor
- Space: reverse the selected connection
- 0 or Home: reset view to fit all content
- Q: left-align all selected boxes (aligns to leftmost box's left edge)
- W: apply hierarchical layout to selected boxes (organizes based on connections)
- Backspace/Delete: delete selected box(es) or selected connection
- Cmd/Ctrl+C: copy selected box(es)
- Cmd/Ctrl+V: paste copied box(es) at the cursor location
- Cmd/Ctrl+Z: undo last action

While editing a text box:

- Type to insert characters; Enter inserts a newline
- Backspace: delete character before the caret
- Delete (Fn+Backspace on macOS laptops): delete character after the caret

- Line deletion (macOS): Cmd+Backspace (to start of line), Cmd+Delete (to end of line)
- Selection and clipboard:
  - Cmd/Ctrl+A: select all text in the box
  - Cmd/Ctrl+C: copy selection
  - Cmd/Ctrl+X: cut selection
  - Cmd/Ctrl+V: paste
  - Cmd/Ctrl+B: toggle highlight on the selected text (adds/removes persistent highlight)

Presentation Mode
- Arrow keys move the caret; Up/Down move between wrapped lines

- Native OS paste and voice dictation: You can paste via the Edit menu, right-click menu, or dictation tools. The app listens for the browser's native paste/copy/cut events and inserts text into the focused box while editing.

- Permissions: Browser clipboard APIs (navigator.clipboard) work best on HTTPS or localhost. If you open this app from a `file://` URL, native paste events still work, but programmatic clipboard reads may be blocked by the browser.



### Mouse/Trackpad Controls

- Scroll over the canvas to zoom in/out around the cursor
- Hold Space (when not editing) and drag to pan the view
- Right-click and drag on empty canvas (when nothing is selected) to pan
- Click-drag on empty canvas (with nothing selected) to draw a selection rectangle; release to select boxes whose centers are inside; hold Shift to add to selection
- Click near a box edge to drag the box; click inside to edit text
- Drag the circular handle at the bottom-right of a box to resize it
- Create a connection: hover to show connector dots, click a connector dot on a box edge, then click another box
- Reattach a connection: drag its arrowhead to a different target box
- Click a connection to select it
- With a connection selected, press Space to reverse its direction

## File Structure

- `index.html` - Main HTML file
- `sketch.js` - p5.js main sketch and application logic with optimized rendering
- `TextBox.js` - TextBox class for node boxes with cached text wrapping
- `Connection.js` - Connection class for arrows between boxes
- `MindMap.js` - MindMap class for managing the entire mind map with undo/redo
- `style.css` - Styling for the UI
