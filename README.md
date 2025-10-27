# OpenMind - Mind Mapping Software

A simple and intuitive mind mapping application built with p5.js.

## Features

- **Create Nodes**: Click the "New Box" button to add new nodes to your mind map
- **Edit Text**: Click inside any box to edit its text. The box automatically resizes to fit the content
- **Move Nodes**: Click and drag any box to reposition it
- **Multi-select & Group Drag**: Hold Shift and click multiple boxes to select them; while holding Shift, drag from a box edge to move them together
- **Create Connections**: Click on the edge of a box, then click on another box to create a directed connection
- **Save/Load**: Save your mind maps as JSON files and load them later
- **Cloud Save/Load (JSONBase)**: Save and load your mind maps to/from JSONBase using your IID and secret
- **Zoom View**: Use your mouse scroll/trackpad over the canvas to zoom the entire mind map in or out

## How to Use

1. Open `index.html` in a web browser
2. Use the buttons at the top:
   - **New Box**: Creates a new node at a random position
   - **Save**: Downloads your mind map as a JSON file
   - **Load**: Loads a previously saved mind map
   - **Save Cloud**: Saves the current mind map to JSONBase under a key of your choice
   - **Load Cloud**: Loads a mind map from JSONBase by key

### Keyboard Controls

- Type normally to add text to a selected box
- Press **Enter** to add a new line
- Press **Backspace** to delete the character before the caret
- Press **Fn+Backspace** (or **Delete** on extended keyboards) to delete the character after the caret
- Press **N** (when not editing) to create a new box
- Word deletion:
   - macOS: **Option+Backspace** deletes the previous word, **Option+Delete** deletes the next word
   - Windows/Linux: **Ctrl+Backspace** deletes the previous word, **Ctrl+Delete** deletes the next word
- Line deletion (macOS only):
   - **Cmd+Backspace** deletes to the start of the line
   - **Cmd+Delete** deletes to the end of the line
- Selection and clipboard:
   - **Cmd/Ctrl+A** select all text in the box
   - **Cmd/Ctrl+C** copy selection
   - **Cmd/Ctrl+X** cut selection
   - **Cmd/Ctrl+V** paste
- Arrow keys move the caret; Up/Down move between wrapped lines

### Mouse/Trackpad Controls

- **Scroll** over the canvas to zoom in/out of the entire view
- **Hold Space** (when not editing text) and drag to pan the view
- **Click-and-drag** on empty canvas (with nothing selected) to pan
- Click near a box edge to drag the box; click inside to edit text
- Hold **Shift** and click boxes to multi-select; then while holding **Shift**, drag from a selected box's edge to move all selected boxes together
- Right-click a selected connection to reverse its direction
- Press **0** or **Home** key to reset the view and fit all content

## File Structure

- `index.html` - Main HTML file
- `sketch.js` - p5.js main sketch and application logic
- `TextBox.js` - TextBox class for node boxes
- `Connection.js` - Connection class for arrows between boxes
- `MindMap.js` - MindMap class for managing the entire mind map
- `style.css` - Styling for the UI

## Future Enhancements

- Different box shapes and colors
- Delete nodes and connections
- Undo/redo functionality
- Keyboard shortcuts
- Touch/mobile support

## Cloud Save/Load setup (JSONBase)

Direct browser calls to JSONBase may be blocked by CORS (e.g., on GitHub Pages). Use the proxy below for a smooth experience.

### Option A: Local proxy (quickest)

1) Start the proxy server:
    - Open a terminal in the `server` folder and run:
       - Install deps: `npm install`
       - Run: `npm start`
    - It will start at http://localhost:3001
2) In the browser console (on the OpenMind page), set the base URL:
    - `window.JsonBase.setConfig({ baseUrl: 'http://localhost:3001/jsonbase' })`
3) Click Save Cloud/Load Cloud. You'll be prompted for IID and secret once (stored in localStorage on your device). You can clear them via `window.JsonBase.clearConfig()`.

Note: For local proxy you can also set env vars so the browser doesn't need the secret:
- `JSONBASE_IID` and `JSONBASE_SECRET` (or pass via headers X-JSONBASE-IID / X-JSONBASE-SECRET for dev only).

### Option B: Deploy proxy (for GitHub Pages)

Deploy the `server` folder to a host that supports Node (Render, Railway, Fly.io, Heroku, etc.) and set env vars:
- `JSONBASE_IID=o15FSkhapPNV`
- `JSONBASE_SECRET=...your secret...`

Then in the OpenMind page console set:
`window.JsonBase.setConfig({ baseUrl: 'https://<your-proxy-domain>/jsonbase' })`

Security note:
- Avoid exposing your JSONBase secret in client-side code. Prefer setting it on the proxy server via environment variables.
