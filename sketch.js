let mindMap;
let newBoxButton;
let saveButton;
let loadButton;
let fileInput;
let exportPNGButton;
let exportPDFButton;
let menuIsVisible = false;
let fullScreenButton;
let alignButton;
let menuRightEdge = 600; // Updated after layout to cover hover band width
let saveCloudButton;
let loadCloudButton;

// Camera/zoom state
let camX = 0;
let camY = 0;
let zoom = 1;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3.0;
const ZOOM_STEP = 1.05; // per wheel notch

// Panning state
let isPanning = false;
let panStartMouseX = 0;
let panStartMouseY = 0;
let panStartCamX = 0;
let panStartCamY = 0;

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
  createCanvas(windowWidth, windowHeight);
  
  mindMap = new MindMap();
  
  // Create initial boxes as examples
  mindMap.addBox(new TextBox(300, 200, "Main Idea"));
  mindMap.addBox(new TextBox(500, 300, "Sub Topic 1"));
  mindMap.addBox(new TextBox(500, 100, "Sub Topic 2"));
  
  // Create UI buttons
  newBoxButton = createButton('New Box');
  newBoxButton.position(10, 10);
  newBoxButton.mousePressed(createNewBox);
  
  saveButton = createButton('Save');
  saveButton.position(100, 10);
  saveButton.mousePressed(() => mindMap.save());
  
  loadButton = createButton('Load');
  loadButton.position(160, 10);
  loadButton.mousePressed(triggerFileLoad);
  
  // New: Cloud save/load
  saveCloudButton = createButton('Save Cloud');
  saveCloudButton.position(220, 10);
  saveCloudButton.mousePressed(saveToJsonBase);

  loadCloudButton = createButton('Load Cloud');
  loadCloudButton.position(310, 10);
  loadCloudButton.mousePressed(loadFromJsonBase);
  
  exportPNGButton = createButton('Export PNG');
  exportPNGButton.position(220, 10);
  exportPNGButton.mousePressed(exportPNG);
  
  exportPDFButton = createButton('Export PDF');
  exportPDFButton.position(330, 10);
  exportPDFButton.mousePressed(exportPDF);
  
  fullScreenButton = createButton('Full Screen');
  fullScreenButton.position(430, 10);
  fullScreenButton.mousePressed(toggleFullScreen);

  alignButton = createButton('Align');
  alignButton.position(520, 10);
  alignButton.mousePressed(() => {
    try {
      if (mindMap) { mindMap.pushUndo(); mindMap.alignBoxes(12); }
    } catch (e) { console.error('Align failed:', e); }
  });
  
  // Create hidden file input for loading
  fileInput = createFileInput(handleFileLoad);
  fileInput.position(-200, -200); // Hide it off-screen
  fileInput.style('display', 'none');

  // Lay out buttons neatly left-to-right in requested order
  layoutMenuButtons();

  // Hide menu buttons initially
  hideMenuButtons();
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
  }
}

// Set mouse cursor based on what the user is hovering over
function updateCursorForHover() {
  if (!mindMap || !mindMap.boxes) { cursor('default'); return; }
  const validMouse = Number.isFinite(mouseX) && Number.isFinite(mouseY);
  if (!validMouse) { cursor('default'); return; }

  // Panning cursor states
  const toolbarHeight = 40;
  const isEditing = mindMap.selectedBox && mindMap.selectedBox.isEditing;
  const hasMulti = mindMap.selectedBoxes && mindMap.selectedBoxes.size > 0;
  const noSelection = !mindMap.selectedBox && !mindMap.selectedConnection && !hasMulti;
  if (isPanning) { cursor('grabbing'); return; }
  if (mouseY > toolbarHeight && noSelection && !isEditing && keyIsDown(32)) { cursor('grab'); return; }

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
  // Define a small top-left trigger zone and a band covering the buttons area
  const triggerX = 50;
  const triggerY = 50;
  // Buttons span from x=10 to menuRightEdge (computed after layout)
  const buttonsRightEdge = menuRightEdge;
  const buttonsBandHeight = 50; // top row height

  const validMouse = Number.isFinite(mouseX) && Number.isFinite(mouseY);
  const inTrigger = validMouse && mouseX >= 0 && mouseY >= 0 && mouseX <= triggerX && mouseY <= triggerY;
  const inButtonsBand = validMouse && mouseY >= 0 && mouseY <= buttonsBandHeight && mouseX >= 0 && mouseX <= buttonsRightEdge;
  const shouldShow = inTrigger || inButtonsBand;

  if (shouldShow !== menuIsVisible) {
    if (shouldShow) showMenuButtons(); else hideMenuButtons();
    menuIsVisible = shouldShow;
  }
}

function showMenuButtons() {
  newBoxButton.style('display', 'inline-block');
  saveButton.style('display', 'inline-block');
  loadButton.style('display', 'inline-block');
  if (saveCloudButton) saveCloudButton.style('display', 'inline-block');
  if (loadCloudButton) loadCloudButton.style('display', 'inline-block');
  exportPNGButton.style('display', 'inline-block');
  exportPDFButton.style('display', 'inline-block');
  fullScreenButton.style('display', 'inline-block');
  alignButton.style('display', 'inline-block');
}

function hideMenuButtons() {
  newBoxButton.style('display', 'none');
  saveButton.style('display', 'none');
  loadButton.style('display', 'none');
  if (saveCloudButton) saveCloudButton.style('display', 'none');
  if (loadCloudButton) loadCloudButton.style('display', 'none');
  exportPNGButton.style('display', 'none');
  exportPDFButton.style('display', 'none');
  fullScreenButton.style('display', 'none');
  alignButton.style('display', 'none');
}

// Arrange buttons: Load, Save, Save Cloud, Load Cloud, Export PNG, Export PDF, Full Screen, Align, then New Box
function layoutMenuButtons() {
  const startX = 10;
  const y = 10;
  const gap = 10;

  // Ensure buttons are displayed to get proper widths
  loadButton.style('display', 'inline-block');
  saveButton.style('display', 'inline-block');
  if (saveCloudButton) saveCloudButton.style('display', 'inline-block');
  if (loadCloudButton) loadCloudButton.style('display', 'inline-block');
  exportPNGButton.style('display', 'inline-block');
  exportPDFButton.style('display', 'inline-block');
  fullScreenButton.style('display', 'inline-block');
  alignButton.style('display', 'inline-block');
  newBoxButton.style('display', 'inline-block');

  const w = (el) => (el && el.elt && el.elt.offsetWidth) ? el.elt.offsetWidth : 100;

  let x = startX;
  loadButton.position(x, y); x += w(loadButton) + gap;
  saveButton.position(x, y); x += w(saveButton) + gap;
  if (saveCloudButton) { saveCloudButton.position(x, y); x += w(saveCloudButton) + gap; }
  if (loadCloudButton) { loadCloudButton.position(x, y); x += w(loadCloudButton) + gap; }
  exportPNGButton.position(x, y); x += w(exportPNGButton) + gap;
  exportPDFButton.position(x, y); x += w(exportPDFButton) + gap;
  fullScreenButton.position(x, y); x += w(fullScreenButton) + gap;
  alignButton.position(x, y); x += w(alignButton) + gap;
  newBoxButton.position(x, y); x += w(newBoxButton) + gap;

  // Update the hover band to cover to the right of the last button
  menuRightEdge = x + 10;
}

function mousePressed() {
  // Prevent interaction with canvas when clicking on UI buttons
  if (mouseY > 40 && mindMap) {
    try {
      const isEditing = mindMap.selectedBox && mindMap.selectedBox.isEditing;
      const hasMulti = mindMap.selectedBoxes && mindMap.selectedBoxes.size > 0;
      const noSelection = !mindMap.selectedBox && !mindMap.selectedConnection && !hasMulti;
      const spaceHeld = keyIsDown(32);
      const overAny = isOverAnyInteractive();
      if (noSelection && !isEditing && (spaceHeld || !overAny)) {
        // Begin panning
        isPanning = true;
        panStartMouseX = mouseX;
        panStartMouseY = mouseY;
        panStartCamX = camX;
        panStartCamY = camY;
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
    isPanning = false;
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
      const margin = 500; // Allow panning this far beyond content
      const minCamX = -bounds.maxX * zoom - margin;
      const maxCamX = -bounds.minX * zoom + width + margin;
      const minCamY = -bounds.maxY * zoom - margin;
      const maxCamY = -bounds.minY * zoom + height + margin;
      
      camX = constrain(camX, minCamX, maxCamX);
      camY = constrain(camY, minCamY, maxCamY);
    }
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
      // Prevent page scroll when using space to pan (only if not editing)
      const isEditing = mindMap.selectedBox && mindMap.selectedBox.isEditing;
      if ((key === ' ' || keyCode === 32) && !isEditing) {
        return false;
      }
      mindMap.handleKeyPressed(key, keyCode);
    } catch (e) {
      console.error('Error handling key press:', e);
    }
  }
  
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
  }
}

function mouseClicked(event) {
  // Handle right click (context menu)
  if (event && event.button === 2 && mindMap) {
    try {
      if (mindMap.handleRightClick()) {
        return false; // Prevent context menu
      }
    } catch (e) {
      console.error('Error handling right click:', e);
    }
  }
}

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
  const toolbarHeight = 40;
  
  if (mouseY > toolbarHeight && mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height) {
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
    return;
  }
  
  if (file.type === 'application' || file.name.endsWith('.json')) {
    try {
      // Validate file.data exists
      if (!file.data) {
        console.error('File data is empty or invalid');
        return;
      }
      
      // If data is a string, try to parse it
      let data = file.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (e) {
          console.error('Failed to parse JSON:', e);
          return;
        }
      }
      
      mindMap.load(data);
    } catch (e) {
      console.error('Failed to load file:', e);
      alert('Failed to load file. The file may be corrupted or invalid.');
    }
  } else {
    console.error('Please load a JSON file');
    alert('Please load a JSON file');
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
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
  const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
  const newZoom = constrain(zoom * factor, MIN_ZOOM, MAX_ZOOM);

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
  zoom = constrain(min(zoomX, zoomY), MIN_ZOOM, MAX_ZOOM);
  
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
    try { if (conn.isMouseOver()) return true; } catch (_) {}
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
    const padding = 50;
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
      let lineHeight = box.fontSize * 1.5;
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

// Cloud save/load using JSONBase provider
async function saveToJsonBase() {
  try {
    if (!window.JsonBase) throw new Error('JSONBase provider not loaded');
    // Ensure config; if missing, user will be prompted once
    window.JsonBase.ensureConfig(true);

    // Ask for a doc key to save under (default: "mindmap")
    const defaultKey = 'mindmap';
    let key = window.prompt('Enter a document key to save (e.g., "mindmap")', defaultKey);
    if (!key) return;

    const data = mindMap ? mindMap.toJSON() : {};
    const result = await window.JsonBase.saveDocument({ key, data });
    alert(`Saved to JSONBase at:\n${result.url}`);
  } catch (e) {
    console.error('Save Cloud failed:', e);
    alert('Save Cloud failed: ' + e.message);
  }
}

async function loadFromJsonBase() {
  try {
    if (!window.JsonBase) throw new Error('JSONBase provider not loaded');
    window.JsonBase.ensureConfig(true);

    let key = window.prompt('Enter the document key to load (e.g., "mindmap")', 'mindmap');
    if (!key) return;

    const { data, url } = await window.JsonBase.loadDocument({ key });
    if (!data || !data.boxes || !data.connections) {
      throw new Error('Loaded data is missing expected fields. Did you save a mind map under this key?');
    }
    mindMap.load(data);
    alert(`Loaded from:\n${url}`);
  } catch (e) {
    console.error('Load Cloud failed:', e);
    alert('Load Cloud failed: ' + e.message);
  }
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
    const padding = 50;
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
    const margin = 20;
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
      let lineHeight = ts(box.fontSize * 1.5);
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