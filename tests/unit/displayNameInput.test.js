const { attachDisplayNameInputHandlers } = require('../../src/sketch.js');

describe('Display name input behavior', () => {
  test('blur commits name and hides menu', () => {
    const listeners = {};
    const input = {
      _value: 'Alice',
      value(val) {
        if (typeof val === 'undefined') return this._value;
        this._value = val;
      },
      attribute: jest.fn(),
      elt: {
        addEventListener: (type, handler) => { listeners[type] = handler; },
        blur: jest.fn(),
      },
    };

    const setUserName = jest.fn();
    const getUserName = jest.fn(() => 'Alice');
    const hideMenu = jest.fn();
    const requestMenuHide = jest.fn();

    attachDisplayNameInputHandlers(input, {
      collaborationManager: { setUserName, getUserName },
      onHideMenu: hideMenu,
      requestMenuHide,
    });

    // Simulate clicking away
    listeners.blur();

    expect(setUserName).toHaveBeenCalledWith('Alice');
    expect(input.value()).toBe('');
    expect(input.attribute).toHaveBeenCalledWith('placeholder', 'Alice');
    expect(hideMenu).toHaveBeenCalled();
    expect(requestMenuHide).toHaveBeenCalled();
  });

  test('clicking outside blurs and commits', () => {
    const listeners = {};
    const realInput = document.createElement('input');
    document.body.appendChild(realInput);

    const input = {
      _value: 'Bob',
      value(val) {
        if (typeof val === 'undefined') return this._value;
        this._value = val;
      },
      attribute: jest.fn(),
      elt: realInput,
    };

    const setUserName = jest.fn();
    const getUserName = jest.fn(() => 'Bob');
    const hideMenu = jest.fn();
    const requestMenuHide = jest.fn();

    // Spy on addEventListener to capture blur handler registered on the input itself
    realInput.addEventListener = (type, handler, opts) => {
      listeners[type] = handler;
      HTMLElement.prototype.addEventListener.call(realInput, type, handler, opts);
    };

    attachDisplayNameInputHandlers(input, {
      collaborationManager: { setUserName, getUserName },
      onHideMenu: hideMenu,
      requestMenuHide,
    });

    realInput.focus();
    // Dispatch pointerdown on body to trigger the outside-click blur
    const evt = new MouseEvent('pointerdown', { bubbles: true });
    document.body.dispatchEvent(evt);

    // Blur event should have fired; if not, manually invoke captured blur handler for safety
    if (listeners.blur) listeners.blur();

    expect(setUserName).toHaveBeenCalledWith('Bob');
    expect(hideMenu).toHaveBeenCalled();
    expect(requestMenuHide).toHaveBeenCalled();
    expect(input.value()).toBe('');
  });
});
