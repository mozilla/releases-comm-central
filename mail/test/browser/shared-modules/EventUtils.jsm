// Export all available functions for Mozmill
var EXPORTED_SYMBOLS = [
  "sendChar",
  "sendString",
  "synthesizeMouse",
  "synthesizeMouseAtCenter",
  "synthesizeMouseScroll",
  "synthesizeKey",
  "synthesizeMouseExpectEvent",
];

function computeButton(aEvent) {
  if (typeof aEvent.button != "undefined") {
    return aEvent.button;
  }
  return aEvent.type == "contextmenu" ? 2 : 0;
}

function computeButtons(aEvent, utils) {
  if (typeof aEvent.buttons != "undefined") {
    return aEvent.buttons;
  }

  if (typeof aEvent.button != "undefined") {
    return utils.MOUSE_BUTTONS_NOT_SPECIFIED;
  }

  if (typeof aEvent.type != "undefined" && aEvent.type != "mousedown") {
    return utils.MOUSE_BUTTONS_NO_BUTTON;
  }

  return utils.MOUSE_BUTTONS_NOT_SPECIFIED;
}

/**
 * Parse the key modifier flags from aEvent. Used to share code between
 * synthesizeMouse and synthesizeKey.
 */
function _parseModifiers(aEvent) {
  var hwindow = Services.appShell.hiddenDOMWindow;

  var mval = 0;
  if (aEvent.shiftKey) {
    mval |= Ci.nsIDOMWindowUtils.MODIFIER_SHIFT;
  }
  if (aEvent.ctrlKey) {
    mval |= Ci.nsIDOMWindowUtils.MODIFIER_CONTROL;
  }
  if (aEvent.altKey) {
    mval |= Ci.nsIDOMWindowUtils.MODIFIER_ALT;
  }
  if (aEvent.metaKey) {
    mval |= Ci.nsIDOMWindowUtils.MODIFIER_META;
  }
  if (aEvent.accelKey) {
    mval |= hwindow.navigator.platform.includes("Mac")
      ? Ci.nsIDOMWindowUtils.MODIFIER_META
      : Ci.nsIDOMWindowUtils.MODIFIER_CONTROL;
  }

  return mval;
}

/**
 * Send the char aChar to the focused element.  This method handles casing of
 * chars (sends the right charcode, and sends a shift key for uppercase chars).
 * No other modifiers are handled at this point.
 *
 * For now this method only works for ASCII characters and emulates the shift
 * key state on US keyboard layout.
 */
function sendChar(aChar, aWindow) {
  var hasShift;
  // Emulate US keyboard layout for the shiftKey state.
  switch (aChar) {
    case "!":
    case "@":
    case "#":
    case "$":
    case "%":
    case "^":
    case "&":
    case "*":
    case "(":
    case ")":
    case "_":
    case "+":
    case "{":
    case "}":
    case ":":
    case '"':
    case "|":
    case "<":
    case ">":
    case "?":
      hasShift = true;
      break;
    default:
      hasShift =
        aChar.toLowerCase() != aChar.toUpperCase() &&
        aChar == aChar.toUpperCase();
      break;
  }
  synthesizeKey(aChar, { shiftKey: hasShift }, aWindow);
}

/**
 * Send the string aStr to the focused element.
 *
 * For now this method only works for ASCII characters and emulates the shift
 * key state on US keyboard layout.
 */
function sendString(aStr, aWindow) {
  for (let i = 0; i < aStr.length; ++i) {
    // Do not split a surrogate pair to call synthesizeKey.  Dispatching two
    // sets of keydown and keyup caused by two calls of synthesizeKey is not
    // good behavior.  It could happen due to a bug, but a surrogate pair should
    // be introduced with one key press operation.  Therefore, calling it with
    // a surrogate pair is the right thing.
    // Note that TextEventDispatcher will consider whether a surrogate pair
    // should cause one or two keypress events automatically.  Therefore, we
    // don't need to check the related prefs here.
    if (
      (aStr.charCodeAt(i) & 0xfc00) == 0xd800 &&
      i + 1 < aStr.length &&
      (aStr.charCodeAt(i + 1) & 0xfc00) == 0xdc00
    ) {
      sendChar(aStr.substring(i, i + 2), aWindow);
      i++;
    } else {
      sendChar(aStr.charAt(i), aWindow);
    }
  }
}

/**
 * Synthesize a mouse event on a target. The actual client point is determined
 * by taking the aTarget's client box and offseting it by aOffsetX and
 * aOffsetY. This allows mouse clicks to be simulated by calling this method.
 *
 * aEvent is an object which may contain the properties:
 *   `shiftKey`, `ctrlKey`, `altKey`, `metaKey`, `accessKey`, `clickCount`,
 *   `button`, `type`.
 *   For valid `type`s see nsIDOMWindowUtils' `sendMouseEvent`.
 *
 * If the type is specified, an mouse event of that type is fired. Otherwise,
 * a mousedown followed by a mouseup is performed.
 *
 * aWindow is optional, and defaults to the current window object.
 *
 * Returns whether the event had preventDefault() called on it.
 */
function synthesizeMouse(aTarget, aOffsetX, aOffsetY, aEvent, aWindow) {
  var rect = aTarget.getBoundingClientRect();
  return synthesizeMouseAtPoint(
    rect.left + aOffsetX,
    rect.top + aOffsetY,
    aEvent,
    aWindow
  );
}

/*
 * Synthesize a mouse event at a particular point in aWindow.
 *
 * aEvent is an object which may contain the properties:
 *   `shiftKey`, `ctrlKey`, `altKey`, `metaKey`, `accessKey`, `clickCount`,
 *   `button`, `type`.
 *   For valid `type`s see nsIDOMWindowUtils' `sendMouseEvent`.
 *
 * If the type is specified, an mouse event of that type is fired. Otherwise,
 * a mousedown followed by a mouseup is performed.
 *
 * aWindow is optional, and defaults to the current window object.
 */
function synthesizeMouseAtPoint(left, top, aEvent, aWindow) {
  var utils = aWindow.windowUtils;
  var defaultPrevented = false;

  if (utils) {
    var button = computeButton(aEvent);
    var clickCount = aEvent.clickCount || 1;
    var modifiers = _parseModifiers(aEvent, aWindow);
    var pressure = "pressure" in aEvent ? aEvent.pressure : 0;

    // aWindow might be cross-origin from us.
    var MouseEvent = aWindow.MouseEvent;

    // Default source to mouse.
    var inputSource =
      "inputSource" in aEvent
        ? aEvent.inputSource
        : MouseEvent.MOZ_SOURCE_MOUSE;
    // Compute a pointerId if needed.
    var id;
    if ("id" in aEvent) {
      id = aEvent.id;
    } else {
      var isFromPen = inputSource === MouseEvent.MOZ_SOURCE_PEN;
      id = isFromPen
        ? utils.DEFAULT_PEN_POINTER_ID
        : utils.DEFAULT_MOUSE_POINTER_ID;
    }

    var isDOMEventSynthesized =
      "isSynthesized" in aEvent ? aEvent.isSynthesized : true;
    var isWidgetEventSynthesized =
      "isWidgetEventSynthesized" in aEvent
        ? aEvent.isWidgetEventSynthesized
        : false;
    if ("type" in aEvent && aEvent.type) {
      defaultPrevented = utils.sendMouseEvent(
        aEvent.type,
        left,
        top,
        button,
        clickCount,
        modifiers,
        false,
        pressure,
        inputSource,
        isDOMEventSynthesized,
        isWidgetEventSynthesized,
        computeButtons(aEvent, utils),
        id
      );
    } else {
      utils.sendMouseEvent(
        "mousedown",
        left,
        top,
        button,
        clickCount,
        modifiers,
        false,
        pressure,
        inputSource,
        isDOMEventSynthesized,
        isWidgetEventSynthesized,
        computeButtons(Object.assign({ type: "mousedown" }, aEvent), utils),
        id
      );
      utils.sendMouseEvent(
        "mouseup",
        left,
        top,
        button,
        clickCount,
        modifiers,
        false,
        pressure,
        inputSource,
        isDOMEventSynthesized,
        isWidgetEventSynthesized,
        computeButtons(Object.assign({ type: "mouseup" }, aEvent), utils),
        id
      );
    }
  }

  return defaultPrevented;
}

// Call synthesizeMouse with coordinates at the center of aTarget.
function synthesizeMouseAtCenter(aTarget, aEvent, aWindow) {
  var rect = aTarget.getBoundingClientRect();
  return synthesizeMouse(
    aTarget,
    rect.width / 2,
    rect.height / 2,
    aEvent,
    aWindow
  );
}

/**
 * Synthesize a mouse scroll event on a target. The actual client point is determined
 * by taking the aTarget's client box and offsetting it by aOffsetX and
 * aOffsetY.
 *
 * aEvent is an object which may contain the properties:
 *   shiftKey, ctrlKey, altKey, metaKey, accessKey, button, type, axis, delta, hasPixels
 *
 * If the type is specified, a mouse scroll event of that type is fired. Otherwise,
 * "DOMMouseScroll" is used.
 *
 * If the axis is specified, it must be one of "horizontal" or "vertical". If not specified,
 * "vertical" is used.
 *
 * 'delta' is the amount to scroll by (can be positive or negative). It must
 * be specified.
 *
 * 'hasPixels' specifies whether kHasPixels should be set in the scrollFlags.
 *
 * aWindow is optional, and defaults to the current window object.
 */
function synthesizeMouseScroll(aTarget, aOffsetX, aOffsetY, aEvent, aWindow) {
  var utils = aWindow.windowUtils;
  if (utils) {
    // See nsMouseScrollFlags in nsGUIEvent.h
    const kIsVertical = 0x02;
    const kIsHorizontal = 0x04;
    const kHasPixels = 0x08;

    var button = aEvent.button || 0;
    var modifiers = _parseModifiers(aEvent);

    var rect = aTarget.getBoundingClientRect();

    var left = rect.left;
    var top = rect.top;

    var type = ("type" in aEvent && aEvent.type) || "DOMMouseScroll";
    var axis = aEvent.axis || "vertical";
    var scrollFlags = axis == "horizontal" ? kIsHorizontal : kIsVertical;
    if (aEvent.hasPixels) {
      scrollFlags |= kHasPixels;
    }
    utils.sendMouseScrollEvent(
      type,
      left + aOffsetX,
      top + aOffsetY,
      button,
      scrollFlags,
      aEvent.delta,
      modifiers
    );
  }
}

/**
 * Synthesize a key event. It is targeted at whatever would be targeted by an
 * actual keypress by the user, typically the focused element.
 *
 * aKey should be:
 *  - key value (recommended).  If you specify a non-printable key name,
 *    append "KEY_" prefix.  Otherwise, specifying a printable key, the
 *    key value should be specified.
 *  - keyCode name starting with "VK_" (e.g., VK_RETURN).  This is available
 *    only for compatibility with legacy API.  Don't use this with new tests.
 *
 * aEvent is an object which may contain the properties:
 *  - code: If you emulates a physical keyboard's key event, this should be
 *          specified.
 *  - repeat: If you emulates auto-repeat, you should set the count of repeat.
 *            This method will automatically synthesize keydown (and keypress).
 *  - location: If you want to specify this, you can specify this explicitly.
 *              However, if you don't specify this value, it will be computed
 *              from code value.
 *  - type: Basically, you shouldn't specify this.  Then, this function will
 *          synthesize keydown (, keypress) and keyup.
 *          If keydown is specified, this only fires keydown (and keypress if
 *          it should be fired).
 *          If keyup is specified, this only fires keyup.
 *  - altKey, altGraphKey, ctrlKey, capsLockKey, fnKey, fnLockKey, numLockKey,
 *    metaKey, osKey, scrollLockKey, shiftKey, symbolKey, symbolLockKey:
 *        Basically, you shouldn't use these attributes.  nsITextInputProcessor
 *        manages modifier key state when you synthesize modifier key events.
 *        However, if some of these attributes are true, this function activates
 *        the modifiers only during dispatching the key events.
 *        Note that if some of these values are false, they are ignored (i.e.,
 *        not inactivated with this function).
 *  - keyCode: Must be 0 - 255 (0xFF). If this is specified explicitly,
 *             .keyCode value is initialized with this value.
 *
 * aWindow is optional, and defaults to the current window object.
 * aCallback is optional, use the callback for receiving notifications of TIP.
 */
function synthesizeKey(aKey, aEvent, aWindow, aCallback) {
  var TIP = _getTIP(aWindow, aCallback);
  if (!TIP) {
    return;
  }
  var KeyboardEvent = _getKeyboardEvent(aWindow);
  var modifiers = _emulateToActivateModifiers(TIP, aEvent, aWindow);
  var keyEventDict = _createKeyboardEventDictionary(aKey, aEvent, aWindow);
  var keyEvent = new KeyboardEvent("", keyEventDict.dictionary);
  var dispatchKeydown =
    !("type" in aEvent) || aEvent.type === "keydown" || !aEvent.type;
  var dispatchKeyup =
    !("type" in aEvent) || aEvent.type === "keyup" || !aEvent.type;

  try {
    if (dispatchKeydown) {
      TIP.keydown(keyEvent, keyEventDict.flags);
      if ("repeat" in aEvent && aEvent.repeat > 1) {
        keyEventDict.dictionary.repeat = true;
        var repeatedKeyEvent = new KeyboardEvent("", keyEventDict.dictionary);
        for (var i = 1; i < aEvent.repeat; i++) {
          TIP.keydown(repeatedKeyEvent, keyEventDict.flags);
        }
      }
    }
    if (dispatchKeyup) {
      TIP.keyup(keyEvent, keyEventDict.flags);
    }
  } finally {
    _emulateToInactivateModifiers(TIP, modifiers, aWindow);
  }
}

var _gSeenEvent = false;

/**
 * Indicate that an event with an original target of aExpectedTarget and
 * a type of aExpectedEvent is expected to be fired, or not expected to
 * be fired.
 */
function _expectEvent(aExpectedTarget, aExpectedEvent, aTestName) {
  if (!aExpectedTarget || !aExpectedEvent) {
    return null;
  }

  _gSeenEvent = false;

  var type =
    aExpectedEvent.charAt(0) == "!"
      ? aExpectedEvent.substring(1)
      : aExpectedEvent;
  var eventHandler = function (event) {
    var epassed =
      !_gSeenEvent && event.target == aExpectedTarget && event.type == type;
    if (!epassed) {
      throw new Error(
        aTestName + " " + type + " event target " + (_gSeenEvent ? "twice" : "")
      );
    }
    _gSeenEvent = true;
  };

  aExpectedTarget.addEventListener(type, eventHandler);
  return eventHandler;
}

/**
 * Check if the event was fired or not. The event handler aEventHandler
 * will be removed.
 */
function _checkExpectedEvent(
  aExpectedTarget,
  aExpectedEvent,
  aEventHandler,
  aTestName
) {
  if (aEventHandler) {
    var expectEvent = aExpectedEvent.charAt(0) != "!";
    var type = expectEvent ? aExpectedEvent : aExpectedEvent.substring(1);
    aExpectedTarget.removeEventListener(type, aEventHandler);
    var desc = type + " event";
    if (expectEvent) {
      desc += " not";
    }
    if (_gSeenEvent != expectEvent) {
      throw new Error(aTestName + ": " + desc + " fired.");
    }
  }

  _gSeenEvent = false;
}

/**
 * Similar to synthesizeMouse except that a test is performed to see if an
 * event is fired at the right target as a result.
 *
 * aExpectedTarget - the expected originalTarget of the event.
 * aExpectedEvent - the expected type of the event, such as 'select'.
 * aTestName - the test name when outputting results
 *
 * To test that an event is not fired, use an expected type preceded by an
 * exclamation mark, such as '!select'. This might be used to test that a
 * click on a disabled element doesn't fire certain events for instance.
 *
 * aWindow is optional, and defaults to the current window object.
 */
function synthesizeMouseExpectEvent(
  aTarget,
  aOffsetX,
  aOffsetY,
  aEvent,
  aExpectedTarget,
  aExpectedEvent,
  aTestName,
  aWindow
) {
  var eventHandler = _expectEvent(aExpectedTarget, aExpectedEvent, aTestName);
  synthesizeMouse(aTarget, aOffsetX, aOffsetY, aEvent, aWindow);
  _checkExpectedEvent(aExpectedTarget, aExpectedEvent, eventHandler, aTestName);
}

/**
 * The functions that follow were copied from
 * mozilla-central/testing/mochitest/tests/SimpleTest/EventUtils.js
 */

var TIPMap = new WeakMap();

function _getTIP(aWindow, aCallback) {
  var tip;
  if (TIPMap.has(aWindow)) {
    tip = TIPMap.get(aWindow);
  } else {
    tip = Cc["@mozilla.org/text-input-processor;1"].createInstance(
      Ci.nsITextInputProcessor
    );
    TIPMap.set(aWindow, tip);
  }
  if (!tip.beginInputTransactionForTests(aWindow, aCallback)) {
    tip = null;
    TIPMap.delete(aWindow);
  }
  return tip;
}

function _getKeyboardEvent(aWindow) {
  if (typeof KeyboardEvent != "undefined") {
    try {
      // See if the object can be instantiated; sometimes this yields
      // 'TypeError: can't access dead object' or 'KeyboardEvent is not a constructor'.
      new KeyboardEvent("", {});
      return KeyboardEvent;
    } catch (ex) {}
  }
  return aWindow.KeyboardEvent;
}

/* eslint-disable complexity */
function _guessKeyNameFromKeyCode(aKeyCode, aWindow) {
  var KeyboardEvent = _getKeyboardEvent(aWindow);
  switch (aKeyCode) {
    case KeyboardEvent.DOM_VK_CANCEL:
      return "Cancel";
    case KeyboardEvent.DOM_VK_HELP:
      return "Help";
    case KeyboardEvent.DOM_VK_BACK_SPACE:
      return "Backspace";
    case KeyboardEvent.DOM_VK_TAB:
      return "Tab";
    case KeyboardEvent.DOM_VK_CLEAR:
      return "Clear";
    case KeyboardEvent.DOM_VK_RETURN:
      return "Enter";
    case KeyboardEvent.DOM_VK_SHIFT:
      return "Shift";
    case KeyboardEvent.DOM_VK_CONTROL:
      return "Control";
    case KeyboardEvent.DOM_VK_ALT:
      return "Alt";
    case KeyboardEvent.DOM_VK_PAUSE:
      return "Pause";
    case KeyboardEvent.DOM_VK_EISU:
      return "Eisu";
    case KeyboardEvent.DOM_VK_ESCAPE:
      return "Escape";
    case KeyboardEvent.DOM_VK_CONVERT:
      return "Convert";
    case KeyboardEvent.DOM_VK_NONCONVERT:
      return "NonConvert";
    case KeyboardEvent.DOM_VK_ACCEPT:
      return "Accept";
    case KeyboardEvent.DOM_VK_MODECHANGE:
      return "ModeChange";
    case KeyboardEvent.DOM_VK_PAGE_UP:
      return "PageUp";
    case KeyboardEvent.DOM_VK_PAGE_DOWN:
      return "PageDown";
    case KeyboardEvent.DOM_VK_END:
      return "End";
    case KeyboardEvent.DOM_VK_HOME:
      return "Home";
    case KeyboardEvent.DOM_VK_LEFT:
      return "ArrowLeft";
    case KeyboardEvent.DOM_VK_UP:
      return "ArrowUp";
    case KeyboardEvent.DOM_VK_RIGHT:
      return "ArrowRight";
    case KeyboardEvent.DOM_VK_DOWN:
      return "ArrowDown";
    case KeyboardEvent.DOM_VK_SELECT:
      return "Select";
    case KeyboardEvent.DOM_VK_PRINT:
      return "Print";
    case KeyboardEvent.DOM_VK_EXECUTE:
      return "Execute";
    case KeyboardEvent.DOM_VK_PRINTSCREEN:
      return "PrintScreen";
    case KeyboardEvent.DOM_VK_INSERT:
      return "Insert";
    case KeyboardEvent.DOM_VK_DELETE:
      return "Delete";
    case KeyboardEvent.DOM_VK_WIN:
      return "OS";
    case KeyboardEvent.DOM_VK_CONTEXT_MENU:
      return "ContextMenu";
    case KeyboardEvent.DOM_VK_SLEEP:
      return "Standby";
    case KeyboardEvent.DOM_VK_F1:
      return "F1";
    case KeyboardEvent.DOM_VK_F2:
      return "F2";
    case KeyboardEvent.DOM_VK_F3:
      return "F3";
    case KeyboardEvent.DOM_VK_F4:
      return "F4";
    case KeyboardEvent.DOM_VK_F5:
      return "F5";
    case KeyboardEvent.DOM_VK_F6:
      return "F6";
    case KeyboardEvent.DOM_VK_F7:
      return "F7";
    case KeyboardEvent.DOM_VK_F8:
      return "F8";
    case KeyboardEvent.DOM_VK_F9:
      return "F9";
    case KeyboardEvent.DOM_VK_F10:
      return "F10";
    case KeyboardEvent.DOM_VK_F11:
      return "F11";
    case KeyboardEvent.DOM_VK_F12:
      return "F12";
    case KeyboardEvent.DOM_VK_F13:
      return "F13";
    case KeyboardEvent.DOM_VK_F14:
      return "F14";
    case KeyboardEvent.DOM_VK_F15:
      return "F15";
    case KeyboardEvent.DOM_VK_F16:
      return "F16";
    case KeyboardEvent.DOM_VK_F17:
      return "F17";
    case KeyboardEvent.DOM_VK_F18:
      return "F18";
    case KeyboardEvent.DOM_VK_F19:
      return "F19";
    case KeyboardEvent.DOM_VK_F20:
      return "F20";
    case KeyboardEvent.DOM_VK_F21:
      return "F21";
    case KeyboardEvent.DOM_VK_F22:
      return "F22";
    case KeyboardEvent.DOM_VK_F23:
      return "F23";
    case KeyboardEvent.DOM_VK_F24:
      return "F24";
    case KeyboardEvent.DOM_VK_NUM_LOCK:
      return "NumLock";
    case KeyboardEvent.DOM_VK_SCROLL_LOCK:
      return "ScrollLock";
    case KeyboardEvent.DOM_VK_VOLUME_MUTE:
      return "AudioVolumeMute";
    case KeyboardEvent.DOM_VK_VOLUME_DOWN:
      return "AudioVolumeDown";
    case KeyboardEvent.DOM_VK_VOLUME_UP:
      return "AudioVolumeUp";
    case KeyboardEvent.DOM_VK_META:
      return "Meta";
    case KeyboardEvent.DOM_VK_ALTGR:
      return "AltGraph";
    case KeyboardEvent.DOM_VK_ATTN:
      return "Attn";
    case KeyboardEvent.DOM_VK_CRSEL:
      return "CrSel";
    case KeyboardEvent.DOM_VK_EXSEL:
      return "ExSel";
    case KeyboardEvent.DOM_VK_EREOF:
      return "EraseEof";
    case KeyboardEvent.DOM_VK_PLAY:
      return "Play";
    default:
      return "Unidentified";
  }
}
/* eslint-enable complexity */

function _createKeyboardEventDictionary(aKey, aKeyEvent, aWindow) {
  var result = { dictionary: null, flags: 0 };
  var keyCodeIsDefined = "keyCode" in aKeyEvent;
  var keyCode =
    keyCodeIsDefined && aKeyEvent.keyCode >= 0 && aKeyEvent.keyCode <= 255
      ? aKeyEvent.keyCode
      : 0;
  var keyName = "Unidentified";
  if (aKey.indexOf("KEY_") == 0) {
    keyName = aKey.substr("KEY_".length);
    result.flags |= Ci.nsITextInputProcessor.KEY_NON_PRINTABLE_KEY;
  } else if (aKey.indexOf("VK_") == 0) {
    keyCode = _getKeyboardEvent(aWindow)["DOM_" + aKey];
    if (!keyCode) {
      throw new Error("Unknown key: " + aKey);
    }
    keyName = _guessKeyNameFromKeyCode(keyCode, aWindow);
    result.flags |= Ci.nsITextInputProcessor.KEY_NON_PRINTABLE_KEY;
  } else if (aKey != "") {
    keyName = aKey;
    if (!keyCodeIsDefined) {
      keyCode = _computeKeyCodeFromChar(aKey.charAt(0), aWindow);
    }
    if (!keyCode) {
      result.flags |= Ci.nsITextInputProcessor.KEY_KEEP_KEYCODE_ZERO;
    }
    result.flags |= Ci.nsITextInputProcessor.KEY_FORCE_PRINTABLE_KEY;
  }
  var locationIsDefined = "location" in aKeyEvent;
  if (locationIsDefined && aKeyEvent.location === 0) {
    result.flags |= Ci.nsITextInputProcessor.KEY_KEEP_KEY_LOCATION_STANDARD;
  }
  result.dictionary = {
    key: keyName,
    code: "code" in aKeyEvent ? aKeyEvent.code : "",
    location: locationIsDefined ? aKeyEvent.location : 0,
    repeat: "repeat" in aKeyEvent ? aKeyEvent.repeat === true : false,
    keyCode,
  };
  return result;
}

function _emulateToActivateModifiers(aTIP, aKeyEvent, aWindow) {
  if (!aKeyEvent) {
    return null;
  }
  var KeyboardEvent = _getKeyboardEvent(aWindow);

  var modifiers = {
    normal: [
      { key: "Alt", attr: "altKey" },
      { key: "AltGraph", attr: "altGraphKey" },
      { key: "Control", attr: "ctrlKey" },
      { key: "Fn", attr: "fnKey" },
      { key: "Meta", attr: "metaKey" },
      { key: "OS", attr: "osKey" },
      { key: "Shift", attr: "shiftKey" },
      { key: "Symbol", attr: "symbolKey" },
      {
        key: aWindow.navigator.platform.includes("Mac") ? "Meta" : "Control",
        attr: "accelKey",
      },
    ],
    lockable: [
      { key: "CapsLock", attr: "capsLockKey" },
      { key: "FnLock", attr: "fnLockKey" },
      { key: "NumLock", attr: "numLockKey" },
      { key: "ScrollLock", attr: "scrollLockKey" },
      { key: "SymbolLock", attr: "symbolLockKey" },
    ],
  };

  for (let i = 0; i < modifiers.normal.length; i++) {
    if (!aKeyEvent[modifiers.normal[i].attr]) {
      continue;
    }
    if (aTIP.getModifierState(modifiers.normal[i].key)) {
      continue; // already activated.
    }
    const event = new KeyboardEvent("", { key: modifiers.normal[i].key });
    aTIP.keydown(
      event,
      aTIP.KEY_NON_PRINTABLE_KEY | aTIP.KEY_DONT_DISPATCH_MODIFIER_KEY_EVENT
    );
    modifiers.normal[i].activated = true;
  }
  for (let i = 0; i < modifiers.lockable.length; i++) {
    if (!aKeyEvent[modifiers.lockable[i].attr]) {
      continue;
    }
    if (aTIP.getModifierState(modifiers.lockable[i].key)) {
      continue; // already activated.
    }
    const event = new KeyboardEvent("", { key: modifiers.lockable[i].key });
    aTIP.keydown(
      event,
      aTIP.KEY_NON_PRINTABLE_KEY | aTIP.KEY_DONT_DISPATCH_MODIFIER_KEY_EVENT
    );
    aTIP.keyup(
      event,
      aTIP.KEY_NON_PRINTABLE_KEY | aTIP.KEY_DONT_DISPATCH_MODIFIER_KEY_EVENT
    );
    modifiers.lockable[i].activated = true;
  }
  return modifiers;
}

function _emulateToInactivateModifiers(aTIP, aModifiers, aWindow) {
  if (!aModifiers) {
    return;
  }
  var KeyboardEvent = _getKeyboardEvent(aWindow);
  for (let i = 0; i < aModifiers.normal.length; i++) {
    if (!aModifiers.normal[i].activated) {
      continue;
    }
    const event = new KeyboardEvent("", { key: aModifiers.normal[i].key });
    aTIP.keyup(
      event,
      aTIP.KEY_NON_PRINTABLE_KEY | aTIP.KEY_DONT_DISPATCH_MODIFIER_KEY_EVENT
    );
  }
  for (let i = 0; i < aModifiers.lockable.length; i++) {
    if (!aModifiers.lockable[i].activated) {
      continue;
    }
    if (!aTIP.getModifierState(aModifiers.lockable[i].key)) {
      continue; // who already inactivated this?
    }
    const event = new KeyboardEvent("", { key: aModifiers.lockable[i].key });
    aTIP.keydown(
      event,
      aTIP.KEY_NON_PRINTABLE_KEY | aTIP.KEY_DONT_DISPATCH_MODIFIER_KEY_EVENT
    );
    aTIP.keyup(
      event,
      aTIP.KEY_NON_PRINTABLE_KEY | aTIP.KEY_DONT_DISPATCH_MODIFIER_KEY_EVENT
    );
  }
}

/* eslint-disable complexity */
function _computeKeyCodeFromChar(aChar, aWindow) {
  if (aChar.length != 1) {
    return 0;
  }
  var KeyEvent = _getKeyboardEvent(aWindow);
  if (aChar >= "a" && aChar <= "z") {
    return KeyEvent.DOM_VK_A + aChar.charCodeAt(0) - "a".charCodeAt(0);
  }
  if (aChar >= "A" && aChar <= "Z") {
    return KeyEvent.DOM_VK_A + aChar.charCodeAt(0) - "A".charCodeAt(0);
  }
  if (aChar >= "0" && aChar <= "9") {
    return KeyEvent.DOM_VK_0 + aChar.charCodeAt(0) - "0".charCodeAt(0);
  }
  // returns US keyboard layout's keycode
  switch (aChar) {
    case "~":
    case "`":
      return KeyEvent.DOM_VK_BACK_QUOTE;
    case "!":
      return KeyEvent.DOM_VK_1;
    case "@":
      return KeyEvent.DOM_VK_2;
    case "#":
      return KeyEvent.DOM_VK_3;
    case "$":
      return KeyEvent.DOM_VK_4;
    case "%":
      return KeyEvent.DOM_VK_5;
    case "^":
      return KeyEvent.DOM_VK_6;
    case "&":
      return KeyEvent.DOM_VK_7;
    case "*":
      return KeyEvent.DOM_VK_8;
    case "(":
      return KeyEvent.DOM_VK_9;
    case ")":
      return KeyEvent.DOM_VK_0;
    case "-":
    case "_":
      return KeyEvent.DOM_VK_SUBTRACT;
    case "+":
    case "=":
      return KeyEvent.DOM_VK_EQUALS;
    case "{":
    case "[":
      return KeyEvent.DOM_VK_OPEN_BRACKET;
    case "}":
    case "]":
      return KeyEvent.DOM_VK_CLOSE_BRACKET;
    case "|":
    case "\\":
      return KeyEvent.DOM_VK_BACK_SLASH;
    case ":":
    case ";":
      return KeyEvent.DOM_VK_SEMICOLON;
    case "'":
    case '"':
      return KeyEvent.DOM_VK_QUOTE;
    case "<":
    case ",":
      return KeyEvent.DOM_VK_COMMA;
    case ">":
    case ".":
      return KeyEvent.DOM_VK_PERIOD;
    case "?":
    case "/":
      return KeyEvent.DOM_VK_SLASH;
    case "\n":
      return KeyEvent.DOM_VK_RETURN;
    case " ":
      return KeyEvent.DOM_VK_SPACE;
    default:
      return 0;
  }
}
/* eslint-enable complexity */
