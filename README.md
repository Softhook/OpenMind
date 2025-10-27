# OpenMind - Mind Mapping Software

A simple and intuitive mind mapping application built with p5.js.

## Features

- **Create Nodes**: Click the "New Box" button to add new nodes to your mind map
- **Edit Text**: Click inside any box to edit its text. The box automatically resizes to fit the content
- **Move Nodes**: Click and drag any box to reposition it
- **Create Connections**: Click on the edge of a box, then click on another box to create a directed connection
- **Save/Load**: Save your mind maps as JSON files and load them later

## How to Use

1. Open `index.html` in a web browser
2. Use the buttons at the top:
   - **New Box**: Creates a new node at a random position
   - **Save**: Downloads your mind map as a JSON file
   - **Load**: Loads a previously saved mind map

### Keyboard Controls

- Type normally to add text to a selected box
- Press **Backspace** to delete characters
- Press **Enter** to add a new line

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
