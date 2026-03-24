# OpenMind

Collaborative real-time mind mapping application.

## Documentation

- [System Architecture](./docs/ARCHITECTURE.md)
- [Project Documentation](./docs/README.md)
- [Todo List](./docs/TODO.md)
- [Undo System](./docs/UNDO_SYSTEM.md)
- [Critical Analysis](./docs/CRITICAL_ANALYSIS.md)
- [Risk Assessment](./docs/CRITICAL_REVIEW_2.md)

## Browser Requirements

OpenMind runs entirely in the browser and requires a modern browser with support for:

- Canvas 2D API (p5.js rendering)
- IndexedDB (local persistence)
- WebSocket (real-time collaboration)
- ES2017+ (async/await, `createImageBitmap`, etc.)

Tested browsers: Chrome 120+, Firefox 120+, Safari 17+.

> **Note on browser crashes:** If your browser crashes and the crash stack trace contains only browser-internal symbols (e.g. `ChromeMain`) with no web-content or JavaScript frames, the crash is a browser bug unrelated to this application. Please report such crashes to the browser vendor (e.g. the [Chromium issue tracker](https://bugs.chromium.org/p/chromium/issues/list)).

## Development

Run `npm test` to run the test suite.
Open `index.html` in a browser to start the application.
