# Critical Reflection: UI Refactoring & Global State Management

## Overview
This document reflects on the recent refactoring of `sketch.js`, specifically the extraction of `ExportManager` and `UIManager`, and the resulting `ReferenceError: ExportManager is not defined` incident. It analyzes the architectural tension between modern JavaScript practices and the p5.js "global mode" environment.

## The Incident: `ReferenceError: ExportManager is not defined`

### Root Cause
The `ExportManager` class was defined in a separate file and used inside `sketch.js`. While the file was loaded correctly via `index.html`, the class definition was not explicitly attached to the `window` object.
In strict browser environments or specific loading contexts, top-level class declarations in non-module scripts usually land in the global scope, but this behavior can be fragile when mixed with:
1.  Variable hosting/scoping nuances.
2.  Potential future migration to strict modules (`type="module"`).
3.  Implicit dependencies in `p5.js` setup functions.

**Failure Mode**: `setup()` in `sketch.js` attempted to instantiate `new ExportManager()` before the runtime could resolve the global identifier, or the identifier was never effectively promoted to the global scope expected by `sketch.js`.

### The Fix
Explicitly attaching the class to `window.ExportManager` ensures it is available globally, bypassing ambiguity in scope resolution.
```javascript
if (typeof window !== 'undefined') {
  window.ExportManager = ExportManager;
}
```

## Architectural Analysis

### 1. The Global Scope Tension
The OpenMind codebase exists in a "Split World":
*   **Legacy p5.js**: Relies heavily on global functions (`setup`, `draw`, `mousePressed`) and global variables.
*   **Modern Refactoring**: Attempts to encapsulate logic into Classes (`MindMap`, `ExportManager`, `UIManager`).

**Risk**: Extracting logic from `sketch.js` into classes is good for organization (separation of concerns), but creating instances of these classes inside `sketch.js` requires them to be globally accessible. This increases the "Surface Area" of the global namespace, exactly what modular code tries to avoid.

### 2. State Synchronization Fragility (`menuIsVisible`)
The UI refactoring introduced a synchronization pattern:
*   **Authority**: `UIManager` holds the true state of the menu.
*   **Replica**: `sketch.js` holds a `menuIsVisible` flag to decide whether to process mouse clicks.
*   **Sync**: `draw()` loop copies `uiManager.isMenuVisible()` to `menuIsVisible` every frame.

**Critique**: This is a "Polling" architectural pattern.
*   **Pros**: Decoupled. `sketch.js` doesn't need to subscribe to events.
*   **Cons**: Frame-delay issues. A click might be processed based on the *previous* frame's visibility state.
*   **Improvement**: `sketch.js` should query `uiManager.isMenuVisible()` *directly* in event handlers (`mousePressed`), rather than relying on a synced variable. (See recent fix in `mousePressed`).

### 3. Click-Away Behavior
 The requirement "background click should hide menu" highlighted an interaction gap.
*   **Previous Logic**: Menu hid only on specific interactions (button click) or input blur.
*   **Gap**: The canvas itself captures clicks but didn't explicitly signal the UI to close.
*   **Refinement**: We improved the `mousePressed` handler to act as a "Click Outside" detector for the UI overlay.

## Recommendations

### Short Term (Stability)
1.  **Explicit Globals**: Continue to explicitly export critical classes to `window` to prevent reference errors.
2.  **Defensive Initialization**: Ensure `sketch.js`'s `setup()` verifies dependencies exist (`if (typeof ExportManager === 'undefined') ...`) before crashing.
3.  **Direct Querying**: Remove synced flags like `menuIsVisible` in `sketch.js` favor of direct calls `uiManager.isMenuVisible()`.

### Long Term (Modernization)
1.  **ES Modules**: Switch `index.html` to use `<script type="module">`. This forces explicit imports/exports and eliminates global scope leakage/fragility.
    *   *Challenge*: p5.js "global mode" (auto-detecting `setup`/`draw`) breaks with modules. Requires switching to p5.js "instance mode".
2.  **Instance Mode Migration**: Rewrite `sketch.js` to wrap the sketch in a closure `new p5(p => { ... })`. This would allow proper module imports without polluting `window`.

## Conclusion
The refactoring successfully reduced `sketch.js` complexity but exposed the fragility of the global execution environment. The fixes applied (explicit window assignment, direct state querying) stabilize the current architecture, but a transition to ES Modules + p5 Instance Mode remains the robust long-term solution.
