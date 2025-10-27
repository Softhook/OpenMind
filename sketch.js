let mindMap;
let newBoxButton;
let saveButton;
let loadButton;
let fileInput;

function setup() {
  createCanvas(1200, 800);
  
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
  
  // Create hidden file input for loading
  fileInput = createFileInput(handleFileLoad);
  fileInput.position(-200, -200); // Hide it off-screen
  fileInput.style('display', 'none');
}

function draw() {
  background(240);
  
  // Draw instructions
  push();
  fill(80);
  textAlign(LEFT, TOP);
  textSize(12);
  text("Click inside a box to edit | Click on edge to connect | Drag to move", 10, 50);
  pop();
  
  mindMap.draw();
}

function mousePressed() {
  // Prevent interaction with canvas when clicking on UI buttons
  if (mouseY > 40) {
    mindMap.handleMousePressed();
  }
}

function mouseReleased() {
  mindMap.handleMouseReleased();
}

function mouseDragged() {
  mindMap.handleMouseDragged();
}

function keyPressed() {
  mindMap.handleKeyPressed(key, keyCode);
  
  // Prevent default behavior for backspace
  if (keyCode === BACKSPACE) {
    return false;
  }
  
  // Prevent default behavior for arrow keys when editing
  if (mindMap.selectedBox && mindMap.selectedBox.isEditing) {
    if (keyCode === LEFT_ARROW || keyCode === RIGHT_ARROW || 
        keyCode === UP_ARROW || keyCode === DOWN_ARROW) {
      return false;
    }
  }
  
  // Prevent default behavior for CMD+A, CMD+C, CMD+V when editing
  if ((keyIsDown(91) || keyIsDown(93) || keyIsDown(17))) {
    if (key === 'a' || key === 'A' || key === 'c' || key === 'C' || key === 'v' || key === 'V') {
      return false;
    }
  }
}

function mouseClicked(event) {
  // Handle right click (context menu)
  if (event.button === 2) {
    if (mindMap.handleRightClick()) {
      return false; // Prevent context menu
    }
  }
}

// Prevent default context menu
document.addEventListener('contextmenu', event => event.preventDefault());

function createNewBox() {
  // Create a new box at a semi-random position
  let x = random(200, width - 200);
  let y = random(150, height - 150);
  mindMap.addBox(new TextBox(x, y, "New Node"));
}

function triggerFileLoad() {
  // Trigger the hidden file input
  fileInput.elt.click();
}

function handleFileLoad(file) {
  if (file.type === 'application' || file.name.endsWith('.json')) {
    // file.data is already a parsed object from p5.js
    mindMap.load(file.data);
  } else {
    console.error('Please load a JSON file');
  }
}