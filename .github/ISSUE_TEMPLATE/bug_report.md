---
name: Bug Report
about: Report a bug in the OpenMind application
title: ''
labels: bug
assignees: ''
---

## Describe the Bug

A clear and concise description of what the bug is.

## Steps to Reproduce

1. Go to '...'
2. Click on '...'
3. See error

## Expected Behaviour

What you expected to happen.

## Actual Behaviour

What actually happened.

## Browser Console Errors

Open the browser developer tools (F12), go to the Console tab, and paste any red error messages here.

```
(paste console errors here)
```

## Environment

- **Browser**: (e.g. Chrome 130, Firefox 130, Safari 18)
- **Operating System**: (e.g. macOS 14, Windows 11, Ubuntu 22)
- **OpenMind Version**: (shown in the bottom-right corner of the app)

## Note on Browser Crashes

If Chrome or another browser crashes **without any errors shown in the application**, the crash is most likely caused by the browser itself rather than this application. Browser crashes that occur:

- before any OpenMind page has fully loaded,
- with a stack trace that only contains browser-internal symbols (e.g. `ChromeMain`), or
- that are reproducible without visiting OpenMind at all

should be reported to the browser vendor instead (e.g. [Chrome Bug Tracker](https://bugs.chromium.org/p/chromium/issues/list)).

If you believe OpenMind is contributing to browser instability (e.g. high memory or CPU usage leading to a crash), please include steps to reproduce and the console output above.
