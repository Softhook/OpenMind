// Configuration constants
const CONFIG = {
  ZOOM: {
    MIN: 0.2,
    MAX: 3.0,
    STEP: 1.05
  },
  CAMERA: {
    PAN_MARGIN: 500
  },
  UI: {
    TOOLBAR_HEIGHT: 40,
    MENU_TRIGGER_X: 50,
    MENU_TRIGGER_Y: 50,
    BUTTONS_BAND_HEIGHT: 50,
    BUTTON_START_X: 10,
    BUTTON_Y: 10,
    BUTTON_GAP: 5
  },
  EXPORT: {
    PADDING: 50,
    MARGIN: 20
  }
};

let mindMap;
let saveButton;
let loadButton;
let fileInput;
let exportPNGButton;
let exportPDFButton;
let exportTextButton;
let menuIsVisible = false;
let fullScreenButton;
let menuRightEdge = 600;

// Camera/zoom state
let camX = 0;
let camY = 0;
let zoom = 1;

// Panning state
let isPanning = false;
let panStartMouseX = 0;
let panStartMouseY = 0;
let panStartCamX = 0;
let panStartCamY = 0;
let rightPanActive = false; // true if current pan initiated by right mouse button
let suppressNextRightClick = false; // avoid triggering right-click action after a pan drag

// Multi-box selection drag state
let isSelectingMultiple = false;
let selectionStartX = 0;
let selectionStartY = 0;
let selectionCurrentX = 0;
let selectionCurrentY = 0;

// Performance optimization: debounce expensive operations
let lastResizeTime = 0;
const RESIZE_DEBOUNCE_MS = 16; // ~60fps

// Fallback key-repeat manager (for Backspace/Delete) to ensure repeat works even if the browser/OS doesn't auto-repeat
const KeyRepeat = {
  // Only handle non-character deletion keys to avoid interfering with native typing.
  // Don't rely on p5's keyCode constants being pre-defined at load time.
  isTracked(code) {
    const BK = (typeof BACKSPACE !== 'undefined') ? BACKSPACE : 8;
    const DEL = (typeof DELETE !== 'undefined') ? DELETE : 46;
    return code === BK || code === DEL;
  },
  initialDelay: 400, // ms before repeating starts (match typical OS behavior)
  repeatInterval: 50, // ms between repeats
  nativeRepeatThreshold: 150, // ms - if we see keydowns faster than this, browser is repeating
  state: new Map(), // keyCode -> { active, pressedAt, lastEventAt, lastNativeKeydownAt, prevNativeKeydownAt }

  _ensure(keyCode) {
    // Ensure keyCode is a number for consistent Map lookups
    const code = Number(keyCode);
    if (!this.state.has(code)) {
      this.state.set(code, { active: false, pressedAt: 0, lastEventAt: 0, lastNativeKeydownAt: 0, prevNativeKeydownAt: 0 });
    }
    return this.state.get(code);
  },

  noteNativeKeydown(keyCode) {
    if (!this.isTracked(keyCode)) return;
    const s = this._ensure(keyCode);
    s.prevNativeKeydownAt = s.lastNativeKeydownAt;
    s.lastNativeKeydownAt = millis();
  },

  start(keyCode) {
    if (!this.isTracked(keyCode)) return;
    const now = millis();
    const s = this._ensure(keyCode);
    s.active = true;
    s.pressedAt = now;
    s.lastEventAt = now; // last synthetic repeat time
    // lastNativeKeydownAt updated by noteNativeKeydown from keyPressed
  },

  stop(keyCode) {
    if (!this.isTracked(keyCode)) return;
    const s = this._ensure(keyCode);
    s.active = false;
  },

  reset() {
    // Stop all tracked keys (e.g., on window blur)
    for (const [, s] of this.state) s.active = false;
  },

  update() {
    if (!mindMap) return;
    const now = millis();
    // Iterate over keys that are in the state map (those we've seen pressed)
    for (const [keyCode, s] of this.state) {
      if (!s.active || !this.isTracked(keyCode)) continue;

      // Detect if browser is already delivering native repeats by checking time between consecutive keydowns
      // If we've seen two keydowns close together (faster than our threshold), browser is handling repeat
      const timeBetweenNativeKeydowns = s.lastNativeKeydownAt - s.prevNativeKeydownAt;
      const hasNativeRepeat = s.prevNativeKeydownAt > 0 && 
                              timeBetweenNativeKeydowns > 0 && 
                              timeBetweenNativeKeydowns < this.nativeRepeatThreshold;
      
      if (hasNativeRepeat) {
        // Browser is handling repeat, don't synthesize
        continue;
      }

      // Start our fallback repeat only after initialDelay from the original press
      if (now - s.pressedAt < this.initialDelay) continue;

      // Fire at repeatInterval cadence
      if (now - s.lastEventAt >= this.repeatInterval) {
        s.lastEventAt = now;
        // Call into existing handler with isRepeat = true so we can avoid spamming undo stack
        try {
          // We pass a null/space for key where appropriate; handler keys off keyCode for deletion
          if (typeof mindMap.handleKeyPressed === 'function') {
            mindMap.handleKeyPressed('', keyCode, true);
          }
        } catch (e) {
          // Non-fatal
        }
      }
    }
  }
};

// Helpers to convert between screen and world coordinates
// Transform: screen = world * zoom + cam
// Inverse: world = (screen - cam) / zoom
function worldMouseX() {
  return (mouseX - camX) / zoom;
}
function worldMouseY() {
  return (mouseY - camY) / zoom;
}
function screenX(worldX) {
  return worldX * zoom + camX;
}
function screenY(worldY) {
  return worldY * zoom + camY;
}

function setup() {
  try {
    createCanvas(windowWidth, windowHeight);
    
    mindMap = new MindMap();
    
    // Create initial boxes as examples
    mindMap.addBox(new TextBox(300, 200, "Idea"));
    mindMap.addBox(new TextBox(500, 300, "Sub Topic"));
    mindMap.addBox(new TextBox(500, 100, "Sub Topic"));
    
    // Create UI buttons
    setupUIButtons();
    
    // Lay out buttons neatly
    layoutMenuButtons();

    // Hide menu buttons initially
    hideMenuButtons();
  } catch (e) {
    console.error('Setup failed:', e);
    alert('Failed to initialize application: ' + e.message);
  }
}

// Separate function for UI button setup to improve organization
function setupUIButtons() {
  saveButton = createButton('Save');
  saveButton.position(100, 10);
  saveButton.mousePressed(() => mindMap.save());
  
  loadButton = createButton('Load');
  loadButton.position(160, 10);
  loadButton.mousePressed(triggerFileLoad);
  
  exportPNGButton = createButton('Export PNG');
  exportPNGButton.position(220, 10);
  exportPNGButton.mousePressed(exportPNG);
  
  exportPDFButton = createButton('Export PDF');
  exportPDFButton.position(330, 10);
  exportPDFButton.mousePressed(exportPDF);
  
  exportTextButton = createButton('Export Text');
  exportTextButton.position(430, 10);
  exportTextButton.mousePressed(exportText);
  
  fullScreenButton = createButton('Full Screen');
  fullScreenButton.position(530, 10);
  fullScreenButton.mousePressed(toggleFullScreen);
  
  // Create hidden file input for loading
  fileInput = createFileInput(handleFileLoad);
  fileInput.position(-200, -200);
  fileInput.style('display', 'none');
}

function draw() {
  background(240);
  updateMenuVisibility();
  
  if (mindMap) {
    try {
      // Draw scene with camera transform
      push();
      translate(camX, camY);
      scale(zoom);
      mindMap.draw();
      
      // Draw selection rectangle if selecting multiple boxes
      if (isSelectingMultiple) {
        drawSelectionRectangle();
      }
      pop();
    } catch (e) {
      console.error('Error drawing mindmap:', e);
    }
    // Update mouse cursor based on hover context
    try {
      updateCursorForHover();
    } catch (e) {
      // Non-fatal
    }
    // Drive fallback key repeat after draw so we don't block rendering
    try {
      KeyRepeat.update();
    } catch (_) {}
  }
}

// Set mouse cursor based on what the user is hovering over
function updateCursorForHover() {
  if (!mindMap || !mindMap.boxes) { cursor('default'); return; }
  const validMouse = Number.isFinite(mouseX) && Number.isFinite(mouseY);
  if (!validMouse) { cursor('default'); return; }

  // Panning cursor states (only when spacebar is held)
  const isEditing = mindMap.selectedBox && mindMap.selectedBox.isEditing;
  const hasMulti = mindMap.selectedBoxes && mindMap.selectedBoxes.size > 0;
  const noSelection = !mindMap.selectedBox && !mindMap.selectedConnection && !hasMulti;
  if (mindMap.draggingConnection) { cursor('grabbing'); return; }
  if (isPanning) { cursor('grabbing'); return; }
  if (mouseY > CONFIG.UI.TOOLBAR_HEIGHT && !isEditing && keyIsDown(32)) { cursor('grab'); return; }

  // PRIORITY: Arrowhead hover should override connector-dot hover when overlapping
  if (mindMap && mindMap.connections) {
    for (let i = mindMap.connections.length - 1; i >= 0; i--) {
      const conn = mindMap.connections[i];
      if (!conn || !conn.isMouseOverArrowHead) continue;
      try {
        if (conn.isMouseOverArrowHead()) { cursor('alias'); return; }
      } catch (_) {}
    }
  }

  // Check top-most first
  for (let i = mindMap.boxes.length - 1; i >= 0; i--) {
    const box = mindMap.boxes[i];
    if (!box) continue;
    if (!box.isMouseOver()) continue;

    if (box.isMouseOverResizeHandle && box.isMouseOverResizeHandle()) {
      cursor('nwse-resize');
      return;
    }
    if (box.getConnectorUnderMouse && box.getConnectorUnderMouse()) {
      // Only show crosshair if not over any arrowhead (checked above)
      cursor('crosshair');
      return;
    }
    if (box.isMouseOnEdge && box.isMouseOnEdge()) {
      cursor('move');
      return;
    }
    // Inside center area
    cursor('text');
    return;
  }
  cursor('default');
}

// Show or hide the top-left menu based on cursor position
function updateMenuVisibility() {
  const validMouse = Number.isFinite(mouseX) && Number.isFinite(mouseY);
  const inTrigger = validMouse && mouseX >= 0 && mouseY >= 0 && 
    mouseX <= CONFIG.UI.MENU_TRIGGER_X && mouseY <= CONFIG.UI.MENU_TRIGGER_Y;
  const inButtonsBand = validMouse && mouseY >= 0 && 
    mouseY <= CONFIG.UI.BUTTONS_BAND_HEIGHT && mouseX >= 0 && mouseX <= menuRightEdge;
  const shouldShow = inTrigger || inButtonsBand;

  if (shouldShow !== menuIsVisible) {
    if (shouldShow) showMenuButtons(); else hideMenuButtons();
    menuIsVisible = shouldShow;
  }
}

function showMenuButtons() {
  // Guard if setup failed and buttons are not yet created
  if (saveButton && saveButton.style) saveButton.style('display', 'inline-block');
  if (loadButton && loadButton.style) loadButton.style('display', 'inline-block');
  if (exportPNGButton && exportPNGButton.style) exportPNGButton.style('display', 'inline-block');
  if (exportPDFButton && exportPDFButton.style) exportPDFButton.style('display', 'inline-block');
  if (exportTextButton && exportTextButton.style) exportTextButton.style('display', 'inline-block');
  if (fullScreenButton && fullScreenButton.style) fullScreenButton.style('display', 'inline-block');
}

function hideMenuButtons() {
  if (saveButton && saveButton.style) saveButton.style('display', 'none');
  if (loadButton && loadButton.style) loadButton.style('display', 'none');
  if (exportPNGButton && exportPNGButton.style) exportPNGButton.style('display', 'none');
  if (exportPDFButton && exportPDFButton.style) exportPDFButton.style('display', 'none');
  if (exportTextButton && exportTextButton.style) exportTextButton.style('display', 'none');
  if (fullScreenButton && fullScreenButton.style) fullScreenButton.style('display', 'none');
}

// Arrange buttons: Load, Save, Export PNG, Export PDF, Export Text, Full Screen
function layoutMenuButtons() {
  const startX = CONFIG.UI.BUTTON_START_X;
  const y = CONFIG.UI.BUTTON_Y;
  const gap = CONFIG.UI.BUTTON_GAP;

  // Ensure buttons are displayed to get proper widths
  loadButton.style('display', 'inline-block');
  saveButton.style('display', 'inline-block');
  exportPNGButton.style('display', 'inline-block');
  exportPDFButton.style('display', 'inline-block');
  exportTextButton.style('display', 'inline-block');
  fullScreenButton.style('display', 'inline-block');

  const w = (el) => (el && el.elt && el.elt.offsetWidth) ? el.elt.offsetWidth : 100;

  let x = startX;
  loadButton.position(x, y); x += w(loadButton) + gap;
  saveButton.position(x, y); x += w(saveButton) + gap;
  exportPNGButton.position(x, y); x += w(exportPNGButton) + gap;
  exportPDFButton.position(x, y); x += w(exportPDFButton) + gap;
  exportTextButton.position(x, y); x += w(exportTextButton) + gap;
  fullScreenButton.position(x, y); x += w(fullScreenButton) + gap;

  // Update the hover band to cover to the right of the last button
  menuRightEdge = x + 10;
}

function mousePressed() {
  // Prevent interaction with canvas when clicking on UI buttons
  if (mouseY > CONFIG.UI.TOOLBAR_HEIGHT && mindMap) {
    try {
      const isEditing = mindMap.selectedBox && mindMap.selectedBox.isEditing;
      const hasMulti = mindMap.selectedBoxes && mindMap.selectedBoxes.size > 0;
      const noSelection = !mindMap.selectedBox && !mindMap.selectedConnection && !hasMulti;
      const spaceHeld = keyIsDown(32);
      const overAny = isOverAnyInteractive();
      const rightDown = (typeof mouseButton !== 'undefined' && mouseButton === RIGHT);
      
      // Panning with spacebar OR right mouse when nothing is selected
      if ((spaceHeld && !isEditing) || (rightDown && noSelection && !isEditing)) {
        isPanning = true;
        panStartMouseX = mouseX;
        panStartMouseY = mouseY;
        panStartCamX = camX;
        panStartCamY = camY;
        rightPanActive = !!rightDown;
        return false;
      }
      
      // Multi-box selection when clicking in empty space with no box selected
      if (noSelection && !isEditing && !overAny) {
        isSelectingMultiple = true;
        selectionStartX = worldMouseX();
        selectionStartY = worldMouseY();
        selectionCurrentX = selectionStartX;
        selectionCurrentY = selectionStartY;
        return false;
      }

      mindMap.handleMousePressed();
    } catch (e) {
      console.error('Error handling mouse press:', e);
    }
  }
}

function mouseReleased() {
  if (isPanning) {
    // If we were panning with right mouse, suppress the subsequent right-click action if it moved
    if (rightPanActive) {
      const dx = mouseX - panStartMouseX;
      const dy = mouseY - panStartMouseY;
      if (dx * dx + dy * dy > 9) { // >3px movement
        suppressNextRightClick = true;
      }
    }
    isPanning = false;
    rightPanActive = false;
    return;
  }
  
  if (isSelectingMultiple) {
    // Complete multi-box selection
    completeMultiBoxSelection();
    isSelectingMultiple = false;
    return;
  }
  
  if (mindMap) {
    try {
      mindMap.handleMouseReleased();
    } catch (e) {
      console.error('Error handling mouse release:', e);
    }
  }
}

function mouseDragged() {
  if (isPanning) {
    // Screen-space pan with soft limits
    camX = panStartCamX + (mouseX - panStartMouseX);
    camY = panStartCamY + (mouseY - panStartMouseY);
    
    // Apply soft pan limits based on content bounds
    if (mindMap && mindMap.boxes && mindMap.boxes.length > 0) {
      const bounds = getContentBounds();
      const margin = CONFIG.CAMERA.PAN_MARGIN;
      const minCamX = -bounds.maxX * zoom - margin;
      const maxCamX = -bounds.minX * zoom + width + margin;
      const minCamY = -bounds.maxY * zoom - margin;
      const maxCamY = -bounds.minY * zoom + height + margin;
      
      camX = constrain(camX, minCamX, maxCamX);
      camY = constrain(camY, minCamY, maxCamY);
    }
    return false;
  }
  
  if (isSelectingMultiple) {
    // Update selection rectangle current corner
    selectionCurrentX = worldMouseX();
    selectionCurrentY = worldMouseY();
    return false;
  }

  if (mindMap) {
    try {
      mindMap.handleMouseDragged();
    } catch (e) {
      console.error('Error handling mouse drag:', e);
    }
  }
}

function keyPressed() {
  if (mindMap) {
    try {
      // Handle CMD/CTRL+Z for undo at the top level
      const isCmd = keyIsDown(91) || keyIsDown(93) || keyIsDown(17);
      if (isCmd && (key === 'z' || key === 'Z')) {
        if (mindMap.undo) mindMap.undo();
        return false; // prevent browser undo
      }
      // Space handling: if not editing, always prevent default, and still allow MindMap to react (e.g., reverse connection)
      const isEditing = mindMap.selectedBox && mindMap.selectedBox.isEditing;
      if ((key === ' ' || keyCode === 32) && !isEditing) {
        // Route to MindMap first (may reverse a selected connection)
        mindMap.handleKeyPressed(key, keyCode);
        // Prevent page scroll regardless (space is used for panning and shortcuts)
        return false;
      }
      // All other keys
      mindMap.handleKeyPressed(key, keyCode);
    } catch (e) {
      console.error('Error handling key press:', e);
    }
  }
  // Track native keydowns for deletion keys to coordinate with fallback repeat
  KeyRepeat.noteNativeKeydown(keyCode);
  // Start fallback repeat tracking for deletion keys
  KeyRepeat.start(keyCode);
  
  // Prevent default behavior for backspace
  if (keyCode === BACKSPACE) {
    return false;
  }
  // Prevent default behavior for forward delete
  if (keyCode === DELETE) {
    return false;
  }
  
  // Prevent default behavior for arrow keys when editing
  if (mindMap && mindMap.selectedBox && mindMap.selectedBox.isEditing) {
    if (keyCode === LEFT_ARROW || keyCode === RIGHT_ARROW || 
        keyCode === UP_ARROW || keyCode === DOWN_ARROW) {
      return false;
    }
  }
  
  // Prevent default behavior for CMD+A/C/V/X/Z when editing or when we handle undo
  if ((keyIsDown(91) || keyIsDown(93) || keyIsDown(17))) {
    if (key === 'a' || key === 'A' || key === 'c' || key === 'C' || key === 'v' || key === 'V' || key === 'x' || key === 'X' || key === 'z' || key === 'Z') {
      return false;
    }
  }

  // Global shortcut: N key to create a new box when not editing text
  if (mindMap && (!mindMap.selectedBox || !mindMap.selectedBox.isEditing)) {
    const hasModifier = keyIsDown(91) || keyIsDown(93) || keyIsDown(17) || keyIsDown(18); // CMD/CTRL/ALT
    if (!hasModifier && (key === 'n' || key === 'N')) {
      createNewBox();
      return false;
    }
    // Reset view: press 0 or Home key
    if (!hasModifier && (key === '0' || keyCode === 36)) {
      resetView();
      return false;
    }
    // Align boxes: press A key
    if (!hasModifier && (key === 'a' || key === 'A')) {
      if (mindMap.pushUndo && mindMap.alignBoxes) {
        mindMap.pushUndo();
        mindMap.alignBoxes(12);
      }
      return false;
    }
  }
}

function keyReleased() {
  // Stop fallback repeat on key release
  KeyRepeat.stop(keyCode);
}

// Ensure repeats stop if the window loses focus
if (typeof window !== 'undefined') {
  window.addEventListener('blur', () => {
    try { KeyRepeat.reset(); } catch (_) {}
  });
}

// Note: Right-click no longer triggers any connection action; context menu is prevented below.

// Prevent default context menu
document.addEventListener('contextmenu', event => event.preventDefault());

function createNewBox() {
  // Ensure mindMap exists
  if (!mindMap) {
    console.error('MindMap not initialized');
    return;
  }
  if (mindMap.pushUndo) mindMap.pushUndo();
  
  // Create box at cursor position in world space if over canvas, else at viewport center
  let x, y;
  
  if (mouseY > CONFIG.UI.TOOLBAR_HEIGHT && mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height) {
    // Mouse is over canvas (in screen space) - use world position
    x = worldMouseX();
    y = worldMouseY();
  } else {
    // Mouse not over canvas - create at center of current viewport in world space
    x = worldMouseX.call(null, width / 2);
    y = worldMouseY.call(null, height / 2);
    // Actually, we need to convert viewport center to world coords
    x = (width / 2 - camX) / zoom;
    y = (height / 2 - camY) / zoom;
  }

  mindMap.addBox(new TextBox(x, y, ""));
}

function triggerFileLoad() {
  // Trigger the hidden file input
  fileInput.elt.click();
}

function handleFileLoad(file) {
  if (!file) {
    console.error('No file provided');
    alert('Please select a valid file');
    return;
  }
  
  // Validate file type
  if (!file.type.includes('application') && !file.name.endsWith('.json')) {
    console.error('Invalid file type:', file.type);
    alert('Please load a JSON file');
    return;
  }
  
  try {
    // Validate file.data exists
    if (!file.data) {
      throw new Error('File data is empty or invalid');
    }
    
    // If data is a string, try to parse it
    let data = file.data;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch (e) {
        throw new Error('Failed to parse JSON: ' + e.message);
      }
    }
    
    // Validate data structure
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid JSON structure');
    }
    
    if (!data.boxes || !Array.isArray(data.boxes)) {
      throw new Error('Missing or invalid boxes data');
    }
    
    mindMap.load(data);
  } catch (e) {
    console.error('Failed to load file:', e);
    alert('Failed to load file: ' + e.message);
  }
}

function windowResized() {
  const now = millis();
  // Debounce resize to avoid expensive recalculations
  if (now - lastResizeTime > RESIZE_DEBOUNCE_MS) {
    resizeCanvas(windowWidth, windowHeight);
    lastResizeTime = now;
  }
}

// Mouse wheel to zoom the whole view around the cursor
function mouseWheel(event) {
  // Only when over the canvas area
  const overCanvas = mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height;
  if (!overCanvas) return;

  // Compute world point under mouse before zoom
  const wx = worldMouseX();
  const wy = worldMouseY();

  // Zoom in (negative deltaY) or out (positive)
  const factor = event.deltaY < 0 ? CONFIG.ZOOM.STEP : 1 / CONFIG.ZOOM.STEP;
  const newZoom = constrain(zoom * factor, CONFIG.ZOOM.MIN, CONFIG.ZOOM.MAX);

  // Adjust camera to keep the world point under the cursor stationary
  camX = mouseX - wx * newZoom;
  camY = mouseY - wy * newZoom;
  zoom = newZoom;

  // Prevent page scroll
  return false;
}

// Get bounding box of all content in world space
function getContentBounds() {
  if (!mindMap || !mindMap.boxes || mindMap.boxes.length === 0) {
    return { minX: 0, maxX: width, minY: 0, maxY: height };
  }
  
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let box of mindMap.boxes) {
    if (!box) continue;
    const left = box.x - box.width / 2;
    const right = box.x + box.width / 2;
    const top = box.y - box.height / 2;
    const bottom = box.y + box.height / 2;
    
    minX = min(minX, left);
    maxX = max(maxX, right);
    minY = min(minY, top);
    maxY = max(maxY, bottom);
  }
  
  return { minX, maxX, minY, maxY };
}

// Reset camera to fit all content or default view
function resetView() {
  if (!mindMap || !mindMap.boxes || mindMap.boxes.length === 0) {
    // No content - reset to default
    camX = 0;
    camY = 0;
    zoom = 1;
    return;
  }
  
  const bounds = getContentBounds();
  const contentWidth = bounds.maxX - bounds.minX;
  const contentHeight = bounds.maxY - bounds.minY;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  
  // Calculate zoom to fit all content with 10% margin
  const margin = 1.1;
  const zoomX = width / (contentWidth * margin);
  const zoomY = height / (contentHeight * margin);
  zoom = constrain(min(zoomX, zoomY), CONFIG.ZOOM.MIN, CONFIG.ZOOM.MAX);
  
  // Center the content in viewport
  camX = width / 2 - centerX * zoom;
  camY = height / 2 - centerY * zoom;
}

// Determine if the mouse is over any interactive object (box or connection)
function isOverAnyInteractive() {
  if (!mindMap) return false;
  // Check boxes from top-most first
  for (let i = mindMap.boxes.length - 1; i >= 0; i--) {
    const box = mindMap.boxes[i];
    if (!box) continue;
    if (box.isMouseOver()) return true;
  }
  // Check connections
  for (let i = 0; i < mindMap.connections.length; i++) {
    const conn = mindMap.connections[i];
    if (!conn) continue;
    try {
      if (conn.isMouseOver && conn.isMouseOver()) return true;
      if (conn.isMouseOverArrowHead && conn.isMouseOverArrowHead()) return true;
    } catch (_) {}
  }
  return false;
}

function exportPNG() {
  try {
    // Validate mindMap
    if (!mindMap || !mindMap.boxes || mindMap.boxes.length === 0) {
      alert('No content to export');
      return;
    }
    
    // Get content bounds in world space
    const bounds = getContentBounds();
    const contentWidth = bounds.maxX - bounds.minX;
    const contentHeight = bounds.maxY - bounds.minY;
    
    // Add padding
    const padding = CONFIG.EXPORT.PADDING;
    const totalWidth = contentWidth + padding * 2;
    const totalHeight = contentHeight + padding * 2;
    
    // Create an offscreen graphics buffer at the content size
    const pg = createGraphics(totalWidth, totalHeight);
    
    // Calculate the offset to map world space to buffer space
    const offsetX = padding - bounds.minX;
    const offsetY = padding - bounds.minY;
    
    // Draw the mind map into the buffer
    pg.push();
    pg.translate(offsetX, offsetY);
    pg.background(240);
    
    // Draw connections
    for (let conn of mindMap.connections) {
      if (!conn || !conn.fromBox || !conn.toBox) continue;
      
      let start = conn.fromBox.getConnectionPoint(conn.toBox);
      let end = conn.toBox.getConnectionPoint(conn.fromBox);
      
      if (!start || !end || isNaN(start.x) || isNaN(start.y) || isNaN(end.x) || isNaN(end.y)) {
        continue;
      }
      
      pg.stroke(80);
      pg.strokeWeight(2);
      pg.line(start.x, start.y, end.x, end.y);
      
      // Draw arrow
      let angle = Math.atan2(end.y - start.y, end.x - start.x);
      if (!isNaN(angle)) {
        pg.fill(80);
        pg.noStroke();
        pg.push();
        pg.translate(end.x, end.y);
        pg.rotate(angle);
        pg.triangle(0, 0, -10, -5, -10, 5);
        pg.pop();
      }
    }
    
    // Draw boxes
    for (let box of mindMap.boxes) {
      if (!box) continue;
      
      if (box.x == null || box.y == null || box.width == null || box.height == null ||
          isNaN(box.x) || isNaN(box.y) || isNaN(box.width) || isNaN(box.height)) {
        continue;
      }
      
      // Draw box background (use box background color if available)
      if (box.backgroundColor && Number.isFinite(box.backgroundColor.r)) {
        pg.fill(box.backgroundColor.r, box.backgroundColor.g, box.backgroundColor.b);
      } else {
        pg.fill(255);
      }
      pg.stroke(100);
      pg.strokeWeight(1);
      pg.rect(box.x - box.width/2, box.y - box.height/2, box.width, box.height, box.cornerRadius);
      
      // Draw text
      pg.fill(0);
      pg.noStroke();
      pg.textAlign(LEFT, CENTER);
      pg.textSize(box.fontSize);
      
      let wrappedLines = getWrappedLinesForBox(box);
      let lineHeight = box.fontSize * (TextBox.LINE_HEIGHT_MULTIPLIER || 1.5);
      let startY = (box.y - box.height / 2) + box.padding + lineHeight / 2;
      let textX = box.x - box.width / 2 + box.padding;
      
      for (let i = 0; i < wrappedLines.length; i++) {
        if (wrappedLines[i] != null) {
          pg.text(String(wrappedLines[i]), textX, startY + i * lineHeight);
        }
      }
    }
    
    pg.pop();
    
    // Save the buffer as PNG
    save(pg, 'mindmap.png');
  } catch (e) {
    console.error('Failed to export PNG:', e);
    alert('Failed to export PNG: ' + e.message);
  }
}

// Helper to get wrapped lines (needed for PNG export since it uses offscreen buffer)
function getWrappedLinesForBox(box) {
  if (!box || !box.text) return [''];
  
  let lines = String(box.text).split('\n');
  let wrappedLines = [];
  let baseWidth = (box.width != null && isFinite(box.width)) ? box.width : (box.minWidth || 80);
  let maxTextWidth = max(10, baseWidth - box.padding * 2);
  
  // Ensure text measurements match the box font size
  // Note: textWidth uses the current global p5 textSize, not the offscreen buffer.
  // We set it here to match how the text will be drawn into the PNG buffer.
  textSize(box.fontSize || 14);
  
  for (let line of lines) {
    if (!line || line === '') {
      wrappedLines.push('');
      continue;
    }
    
    if (textWidth(line) <= maxTextWidth) {
      wrappedLines.push(line);
    } else {
      let words = line.split(' ');
      let currentLine = '';
      
      for (let i = 0; i < words.length; i++) {
        let testLine = currentLine + (currentLine ? ' ' : '') + words[i];
        
        if (textWidth(testLine) <= maxTextWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) {
            wrappedLines.push(currentLine);
            currentLine = words[i];
          } else {
            let word = words[i];
            let charLine = '';
            for (let char of word) {
              if (textWidth(charLine + char) <= maxTextWidth) {
                charLine += char;
              } else {
                if (charLine) wrappedLines.push(charLine);
                charLine = char;
              }
            }
            currentLine = charLine;
          }
        }
      }
      
      if (currentLine) {
        wrappedLines.push(currentLine);
      }
    }
  }
  
  return wrappedLines.length > 0 ? wrappedLines : [''];
}

function exportPDF() {
  try {
    // Validate dependencies
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error('jsPDF library not loaded');
    }
    
    // Validate mindMap and its data
    if (!mindMap || !mindMap.boxes || !mindMap.connections) {
      throw new Error('MindMap not properly initialized');
    }
    
    if (mindMap.boxes.length === 0) {
      alert('No content to export');
      return;
    }
    
    // Create PDF using jsPDF
    const { jsPDF } = window.jspdf;
    
    // Get content bounds in world space
    const bounds = getContentBounds();
    const contentWidth = bounds.maxX - bounds.minX;
    const contentHeight = bounds.maxY - bounds.minY;
    const contentCenterX = (bounds.minX + bounds.maxX) / 2;
    const contentCenterY = (bounds.minY + bounds.maxY) / 2;
    
    // Add some padding around content
    const padding = CONFIG.EXPORT.PADDING;
    const totalWidth = contentWidth + padding * 2;
    const totalHeight = contentHeight + padding * 2;
    
    // Choose orientation based on content aspect ratio
    const isLandscape = totalWidth > totalHeight;
    const pdf = new jsPDF({
      orientation: isLandscape ? 'landscape' : 'portrait',
      unit: 'pt',
      format: 'a4'
    });
    
    // Get PDF dimensions
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    
    // Calculate scaling to fit all content to page with margins
    const margin = CONFIG.EXPORT.MARGIN;
    const scale = Math.min(
      (pageWidth - 2 * margin) / totalWidth,
      (pageHeight - 2 * margin) / totalHeight
    );
    
    // Validate scale
    if (!isFinite(scale) || scale <= 0 || isNaN(scale)) {
      throw new Error('Invalid scaling calculation');
    }
    
    // Calculate offset to center the content on the page
    // We need to map world space to PDF space
    const offsetX = margin - bounds.minX * scale + (pageWidth - totalWidth * scale) / 2;
    const offsetY = margin - bounds.minY * scale + (pageHeight - totalHeight * scale) / 2;
    
    // Helper function to transform world coordinates to PDF coordinates
    function tx(worldX) { return offsetX + worldX * scale; }
    function ty(worldY) { return offsetY + worldY * scale; }
    function ts(size) { return size * scale; }
    
    // Draw connections first (behind boxes)
    pdf.setLineWidth(ts(2));
    for (let conn of mindMap.connections) {
      if (!conn || !conn.fromBox || !conn.toBox) continue;
      
      let start = conn.fromBox.getConnectionPoint(conn.toBox);
      let end = conn.toBox.getConnectionPoint(conn.fromBox);
      
      // Validate connection points
      if (!start || !end || isNaN(start.x) || isNaN(start.y) || isNaN(end.x) || isNaN(end.y)) {
        continue;
      }
      
      // Set color
      if (conn.selected) {
        pdf.setDrawColor(100, 150, 255);
        pdf.setFillColor(100, 150, 255);
        pdf.setLineWidth(ts(3));
      } else {
        pdf.setDrawColor(80, 80, 80);
        pdf.setFillColor(80, 80, 80);
        pdf.setLineWidth(ts(2));
      }
      
      // Draw line
      pdf.line(tx(start.x), ty(start.y), tx(end.x), ty(end.y));
      
      // Draw arrow head
      let angle = Math.atan2(end.y - start.y, end.x - start.x);
      
      // Validate angle
      if (isNaN(angle)) continue;
      
      let arrowSize = ts(10);
      
      let x1 = tx(end.x);
      let y1 = ty(end.y);
      let x2 = x1 - arrowSize * Math.cos(angle - Math.PI / 6);
      let y2 = y1 - arrowSize * Math.sin(angle - Math.PI / 6);
      let x3 = x1 - arrowSize * Math.cos(angle + Math.PI / 6);
      let y3 = y1 - arrowSize * Math.sin(angle + Math.PI / 6);
      
      pdf.triangle(x1, y1, x2, y2, x3, y3, 'F');
    }
    
    // Draw boxes
    pdf.setLineWidth(ts(1));
    for (let box of mindMap.boxes) {
      if (!box) continue;
      
      // Validate box properties
      if (box.x == null || box.y == null || box.width == null || box.height == null ||
          isNaN(box.x) || isNaN(box.y) || isNaN(box.width) || isNaN(box.height)) {
        continue;
      }
      
      let boxX = tx(box.x - box.width / 2);
      let boxY = ty(box.y - box.height / 2);
      let boxW = ts(box.width);
      let boxH = ts(box.height);
      
      // Set fill color from box background; outline slightly heavier when selected
      if (box.backgroundColor && Number.isFinite(box.backgroundColor.r)) {
        pdf.setFillColor(box.backgroundColor.r, box.backgroundColor.g, box.backgroundColor.b);
      } else {
        pdf.setFillColor(255, 255, 255);
      }
      if (box.selected) {
        pdf.setDrawColor(60, 120, 255);
        pdf.setLineWidth(ts(2));
      } else {
        pdf.setDrawColor(100, 100, 100);
        pdf.setLineWidth(ts(1));
      }
      
      // Draw rounded rectangle
      pdf.roundedRect(boxX, boxY, boxW, boxH, ts(box.cornerRadius), ts(box.cornerRadius), 'FD');
      
      // Draw text
      pdf.setFontSize(ts(box.fontSize));
      pdf.setTextColor(0, 0, 0);
      
      let wrappedLines = getWrappedLines(box);
      let lineHeight = ts(box.fontSize * (TextBox.LINE_HEIGHT_MULTIPLIER || 1.5));
      // Top-anchored text in PDF: start at box top + padding
      let startY = ty(box.y - box.height / 2) + ts(box.padding) + lineHeight * 0.7;
      let textX = tx(box.x - box.width / 2 + box.padding);
      
      for (let i = 0; i < wrappedLines.length; i++) {
        if (wrappedLines[i] != null) {
          pdf.text(String(wrappedLines[i]), textX, startY + i * lineHeight);
        }
      }
    }
    
    // Save the PDF
    pdf.save('mindmap.pdf');
  } catch (e) {
    console.error('Failed to export PDF:', e);
    alert('Failed to export PDF: ' + e.message);
  }
}

function toggleFullScreen() {
  try {
    const fs = fullscreen();
    fullscreen(!fs);
  } catch (e) {
    console.error('Failed to toggle fullscreen:', e);
  }
}

function exportText() {
  try {
    // Validate mindMap
    if (!mindMap || !mindMap.boxes || mindMap.boxes.length === 0) {
      alert('No content to export');
      return;
    }
    
    // Build a hierarchy based on connections
    const hierarchy = buildTextHierarchy();
    
    // Generate text output
    let textOutput = hierarchy.join('\n\n');
    
    // Create a blob and download
    const blob = new Blob([textOutput], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mindmap-text.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error('Failed to export text:', e);
    alert('Failed to export text: ' + e.message);
  }
}

function buildTextHierarchy() {
  // Build adjacency list from connections (from -> to)
  const children = new Map(); // box -> array of child boxes
  const parents = new Map();  // box -> array of parent boxes
  
  for (let box of mindMap.boxes) {
    children.set(box, []);
    parents.set(box, []);
  }
  
  for (let conn of mindMap.connections) {
    if (!conn.fromBox || !conn.toBox) continue;
    children.get(conn.fromBox).push(conn.toBox);
    parents.get(conn.toBox).push(conn.fromBox);
  }
  
  // Find root nodes (boxes with no parents)
  const roots = mindMap.boxes.filter(box => parents.get(box).length === 0);
  
  // If no roots found (circular graph), use all boxes sorted by position
  if (roots.length === 0) {
    return mindMap.boxes
      .map(box => box.text || '')
      .filter(text => text.trim() !== '');
  }
  
  // Traverse from each root using depth-first search
  const visited = new Set();
  const result = [];
  
  function traverse(box) {
    if (visited.has(box)) return;
    visited.add(box);
    
    // Add this box's text
    if (box.text && box.text.trim() !== '') {
      result.push(box.text.trim());
    }
    
    // Traverse children
    const boxChildren = children.get(box) || [];
    for (let child of boxChildren) {
      traverse(child);
    }
  }
  
  // Sort roots by y-position (top to bottom), then x-position (left to right)
  roots.sort((a, b) => {
    const yDiff = a.y - b.y;
    if (Math.abs(yDiff) > 50) return yDiff; // Different rows
    return a.x - b.x; // Same row, sort by x
  });
  
  // Traverse from each root
  for (let root of roots) {
    traverse(root);
  }
  
  // Add any unvisited boxes (disconnected components)
  const unvisited = mindMap.boxes.filter(box => !visited.has(box));
  unvisited.sort((a, b) => {
    const yDiff = a.y - b.y;
    if (Math.abs(yDiff) > 50) return yDiff;
    return a.x - b.x;
  });
  
  for (let box of unvisited) {
    if (box.text && box.text.trim() !== '') {
      result.push(box.text.trim());
    }
  }
  
  return result;
}

// Draw the selection rectangle during multi-box selection
function drawSelectionRectangle() {
  const x1 = min(selectionStartX, selectionCurrentX);
  const y1 = min(selectionStartY, selectionCurrentY);
  const x2 = max(selectionStartX, selectionCurrentX);
  const y2 = max(selectionStartY, selectionCurrentY);
  
  push();
  // Semi-transparent blue fill
  fill(100, 150, 255, 50);
  // Blue border
  stroke(100, 150, 255);
  strokeWeight(2 / zoom);
  rect(x1, y1, x2 - x1, y2 - y1);
  pop();
}

// Complete multi-box selection by selecting all boxes within the rectangle
function completeMultiBoxSelection() {
  if (!mindMap) return;
  
  const x1 = min(selectionStartX, selectionCurrentX);
  const y1 = min(selectionStartY, selectionCurrentY);
  const x2 = max(selectionStartX, selectionCurrentX);
  const y2 = max(selectionStartY, selectionCurrentY);
  
  // Clear current selection if shift is not held
  const shiftHeld = keyIsDown(16);
  if (!shiftHeld) {
    mindMap.clearBoxSelection();
  }
  
  // Select all boxes whose centers fall within the rectangle
  for (const box of mindMap.boxes) {
    if (!box) continue;
    
    // Check if box center is within selection rectangle
    if (box.x >= x1 && box.x <= x2 && box.y >= y1 && box.y <= y2) {
      mindMap.addBoxToSelection(box);
    }
  }
}

// Helper function to get wrapped lines for a text box (duplicates TextBox logic)
function getWrappedLines(box) {
  // Validate box and its properties
  if (!box || !box.text || box.width == null || box.padding == null || box.fontSize == null) {
    return [''];
  }
  
  let lines = String(box.text).split('\n');
  let wrappedLines = [];
  // Guard width in case it's not initialized yet
  let baseWidth = (box.width != null && isFinite(box.width)) ? box.width : (box.minWidth || 80);
  let maxTextWidth = max(10, baseWidth - box.padding * 2);
  
  textSize(box.fontSize);
  
  for (let line of lines) {
    if (!line || line === '') {
      wrappedLines.push('');
      continue;
    }
    
    if (textWidth(line) <= maxTextWidth) {
      wrappedLines.push(line);
    } else {
      let words = line.split(' ');
      let currentLine = '';
      
      for (let i = 0; i < words.length; i++) {
        let testLine = currentLine + (currentLine ? ' ' : '') + words[i];
        
        if (textWidth(testLine) <= maxTextWidth) {
          currentLine = testLine;
        } else {
          if (currentLine) {
            wrappedLines.push(currentLine);
            currentLine = words[i];
          } else {
            let word = words[i];
            let charLine = '';
            for (let char of word) {
              if (textWidth(charLine + char) <= maxTextWidth) {
                charLine += char;
              } else {
                if (charLine) wrappedLines.push(charLine);
                charLine = char;
              }
            }
            currentLine = charLine;
          }
        }
      }
      
      if (currentLine) {
        wrappedLines.push(currentLine);
      }
    }
  }
  
  return wrappedLines.length > 0 ? wrappedLines : [''];
}