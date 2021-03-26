// ***** BEGIN LICENSE BLOCK *****
// Version: MPL 1.1/GPL 2.0/LGPL 2.1
//
// The contents of this file are subject to the Mozilla Public License Version
// 1.1 (the "License"); you may not use this file except in compliance with
// the License. You may obtain a copy of the License at
// http://www.mozilla.org/MPL/
//
// Software distributed under the License is distributed on an "AS IS" basis,
// WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
// for the specific language governing rights and limitations under the
// License.
//
// The Original Code is Mozilla Corporation Code.
//
// The Initial Developer of the Original Code is
// Adam Christian.
// Portions created by the Initial Developer are Copyright (C) 2008
// the Initial Developer. All Rights Reserved.
//
// Contributor(s):
//  Adam Christian <adam.christian@gmail.com>
//  Mikeal Rogers <mikeal.rogers@gmail.com>
//  Henrik Skupin <hskupin@mozilla.com>
//  Aaron Train <atrain@mozilla.com>
//
// Alternatively, the contents of this file may be used under the terms of
// either the GNU General Public License Version 2 or later (the "GPL"), or
// the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
// in which case the provisions of the GPL or the LGPL are applicable instead
// of those above. If you wish to allow use of your version of this file only
// under the terms of either the GPL or the LGPL, and not to allow others to
// use your version of this file under the terms of the MPL, indicate your
// decision by deleting the provisions above and replace them with the notice
// and other provisions required by the GPL or the LGPL. If you do not delete
// the provisions above, a recipient may use your version of this file under
// the terms of any one of the MPL, the GPL or the LGPL.
//
// ***** END LICENSE BLOCK *****

var EXPORTED_SYMBOLS = ["MozMillController", "sleep"];

var EventUtils = ChromeUtils.import(
  "resource://testing-common/mozmill/EventUtils.jsm"
);

var events = ChromeUtils.import("resource://testing-common/mozmill/events.jsm");
var utils = ChromeUtils.import("resource://testing-common/mozmill/utils.jsm");

// Declare most used utils functions in the controller namespace
var sleep = utils.sleep;

/**
 * Class to handle menus and context menus
 *
 * @constructor
 * @param {MozMillController} controller
 *        Mozmill controller of the window under test
 * @param {string} menuSelector
 *        jQuery like selector string of the element
 * @param {object} document
 *        Document to use for finding the menu
 *        [optional - default: aController.window.document]
 */
var Menu = function(controller, menuSelector, document) {
  this._controller = controller;
  this._menu = null;

  document = document || controller.window.document;
  var node = document.querySelector(menuSelector);
  if (node) {
    // We don't unwrap nodes automatically yet (Bug 573185)
    this._menu = node.wrappedJSObject || node;
  } else {
    throw new Error("Menu element '" + menuSelector + "' not found.");
  }
};

Menu.prototype = {
  /**
   * Open and populate the menu
   *
   * @param {Element} contextElement
   *        Element whose context menu has to be opened
   * @returns {Menu} The Menu instance
   */
  open(contextElement) {
    // We have to open the context menu
    var menu = this._menu;
    if (
      (menu.localName == "popup" || menu.localName == "menupopup") &&
      contextElement
    ) {
      this._controller.rightClick(contextElement);
      this._controller.waitFor(function() {
        return menu.state == "open";
      }, "Context menu has been opened.");
    }

    // Run through the entire menu and populate with dynamic entries
    this._buildMenu(menu);

    return this;
  },

  /**
   * Close the menu
   *
   * @returns {Menu} The Menu instance
   */
  close() {
    var menu = this._menu;
    menu.focus();
    EventUtils.synthesizeKey("VK_ESCAPE", {}, this._controller.window);
    this._controller.waitFor(function() {
      return menu.state == "closed";
    }, "Context menu has been closed.");

    return this;
  },

  /**
   * Retrieve the specified menu entry
   *
   * @param {string} itemSelector
   *        jQuery like selector string of the menu item
   * @returns {Element} Menu element
   * @throws Error If menu element has not been found
   */
  getItem(itemSelector) {
    var node = this._menu.querySelector(itemSelector);

    if (!node) {
      throw new Error("Menu entry '" + itemSelector + "' not found.");
    }

    return node;
  },

  /**
   * Click the specified menu entry
   *
   * @param {string} itemSelector
   *        jQuery like selector string of the menu item
   *
   * @returns {Menu} The Menu instance
   */
  click(itemSelector) {
    this._controller.click(this.getItem(itemSelector));

    return this;
  },

  /**
   * Opens the context menu, click the specified entry and
   * make sure that the menu has been closed.
   *
   * @param {string} itemSelector
   *        jQuery like selector string of the element
   * @param {ElemBase} contextElement
   *        Element whose context menu has to be opened
   *
   * @returns {Menu} The Menu instance
   */
  select(itemSelector, contextElement) {
    this.open(contextElement);
    this.click(itemSelector);
    this.close();
  },

  /**
   * Recursive function which iterates through all menu elements and
   * populates the menus with dynamic menu entries.
   *
   * @param {node} menu
   *        Top menu node whose elements have to be populated
   */
  _buildMenu(menu) {
    var items = menu ? menu.children : [];

    Array.from(items).forEach(function(item) {
      // When we have a menu node, fake a click onto it to populate
      // the sub menu with dynamic entries
      if (item.tagName == "menu") {
        var popup = item.querySelector("menupopup");
        if (popup) {
          if (popup.getAttribute("allowevents") === "true") {
            events.fakeOpenPopup(this._controller.window, popup);
          }
          this._buildMenu(popup);
        }
      }
    }, this);
  },
};

/**
 * Deprecated - Has to be removed with Mozmill 2.0
 */
var MenuTree = function(aWindow, aMenu) {
  var items = aMenu ? aMenu.children : null;
  if (!items) {
    return;
  }
  for (var node of items) {
    var entry = null;

    switch (node.tagName) {
      case "menu":
        // Fake a click onto the menu to add dynamic entries
        var popup = node.querySelector("menupopup");
        if (popup) {
          if (popup.getAttribute("allowevents") === "true") {
            events.fakeOpenPopup(aWindow, popup);
          }
          entry = new MenuTree(aWindow, popup);
        }
        break;
      case "menuitem":
        entry = node;
        break;
      default:
        continue;
    }

    if (entry) {
      var label = node.getAttribute("label");
      this[label] = entry;

      if (node.id) {
        this[node.id] = this[label];
      }
    }
  }
};

var MozMillController = function(window) {
  this.window = window;

  utils.waitFor(
    function() {
      return window != null && this.isLoaded();
    },
    "controller(): Window could not be initialized.",
    undefined,
    undefined,
    this
  );
};

MozMillController.prototype.sleep = utils.sleep;

/**
 * Synthesize keypress events for each character on the given element
 *
 * @param {Element} element
 *        Element which will receive the type event
 * @param {string} aText
 *        The text to send as single keypress events
 * @param {object} aExpectedEvent
 *        Information about the expected event to occur
 *        Elements: target     - Element which should receive the event
 *                               [optional - default: current element]
 *                  type       - Type of the expected key event
 */
MozMillController.prototype.type = function(element, aText, aExpectedEvent) {
  if (!element) {
    throw new Error("type: Missing element");
  }

  Array.from(aText).forEach(function(letter) {
    events.triggerKeyEvent(element, "keypress", letter, {}, aExpectedEvent);
  });

  return true;
};

/**
 * Synthesize a general mouse event on the given element
 *
 * @param {Element} element
 *        Element which will receive the mouse event
 * @param {number} aOffsetX
 *        Relative x offset in the elements bounds to click on
 * @param {number} aOffsetY
 *        Relative y offset in the elements bounds to click on
 * @param {object} aEvent
 *        Information about the event to send
 *        Elements: accelKey   - Hold down the accelerator key (ctrl/meta)
 *                               [optional - default: false]
 *                  altKey     - Hold down the alt key
 *                               [optional - default: false]
 *                  button     - Mouse button to use
 *                               [optional - default: 0]
 *                  clickCount - Number of counts to click
 *                               [optional - default: 1]
 *                  ctrlKey    - Hold down the ctrl key
 *                               [optional - default: false]
 *                  metaKey    - Hold down the meta key (command key on Mac)
 *                               [optional - default: false]
 *                  shiftKey   - Hold down the shift key
 *                               [optional - default: false]
 *                  type       - Type of the mouse event ('click', 'mousedown',
 *                               'mouseup', 'mouseover', 'mouseout')
 *                               [optional - default: 'mousedown' + 'mouseup']
 * @param {object} aExpectedEvent
 *        Information about the expected event to occur
 *        Elements: target     - Element which should receive the event
 *                               [optional - default: current element]
 *                  type       - Type of the expected mouse event
 */
MozMillController.prototype.mouseEvent = function(
  element,
  aOffsetX,
  aOffsetY,
  aEvent,
  aExpectedEvent
) {
  if (!element) {
    throw new Error("mouseEvent: Missing element");
  }

  // If no offset is given we will use the center of the element to click on.
  var rect = element.getBoundingClientRect();
  if (isNaN(aOffsetX)) {
    aOffsetX = rect.width / 2;
  }
  if (isNaN(aOffsetY)) {
    aOffsetY = rect.height / 2;
  }

  // Scroll element into view otherwise the click will fail
  if (element.scrollIntoView) {
    element.scrollIntoView();
  }

  if (aExpectedEvent) {
    // The expected event type has to be set
    if (!aExpectedEvent.type) {
      throw new Error("mouseEvent: Expected event type not specified");
    }

    // If no target has been specified use the specified element
    var target = aExpectedEvent.target || element;

    EventUtils.synthesizeMouseExpectEvent(
      element,
      aOffsetX,
      aOffsetY,
      aEvent,
      target,
      aExpectedEvent.event,
      "controller.mouseEvent()",
      element.ownerGlobal
    );
  } else {
    EventUtils.synthesizeMouse(
      element,
      aOffsetX,
      aOffsetY,
      aEvent,
      element.ownerGlobal
    );
  }

  sleep(0);
};

/**
 * Synthesize a mouse click event on the given element
 */
MozMillController.prototype.click = function(
  element,
  left,
  top,
  expectedEvent
) {
  // Handle menu items differently
  if (element && element.tagName == "menuitem") {
    element.click();
  } else {
    this.mouseEvent(element, left, top, {}, expectedEvent);
  }
};

/**
 * Synthesize a double click on the given element
 */
MozMillController.prototype.doubleClick = function(
  element,
  left,
  top,
  expectedEvent
) {
  this.mouseEvent(element, left, top, { clickCount: 2 }, expectedEvent);
  return true;
};

/**
 * Synthesize a mouse right click event on the given element
 */
MozMillController.prototype.rightClick = function(
  element,
  left,
  top,
  expectedEvent
) {
  this.mouseEvent(
    element,
    left,
    top,
    { type: "contextmenu", button: 2 },
    expectedEvent
  );
  return true;
};

/**
 * Synthesize a mouse right click event on the given element (deprecated)
 */
MozMillController.prototype.rightclick = function(...aArgs) {
  this.rightClick(...aArgs);
};

/**
 * Enable/Disable a checkbox depending on the target state
 */
MozMillController.prototype.check = function(element, state) {
  var result = false;

  if (!element) {
    throw new Error("check: Missing element");
  }

  state = typeof state == "boolean" ? state : false;
  if (state != element.checked) {
    this.click(element);
    this.waitFor(
      function() {
        return element.checked == state;
      },
      "Checkbox could not be checked/unchecked",
      500
    );

    result = true;
  }

  return result;
};

/**
 * Select the given radio button
 */
MozMillController.prototype.radio = function(element) {
  if (!element) {
    throw new Error("radio: Missing element");
  }

  this.click(element);
  this.waitFor(
    function() {
      return element.checked || element.selected;
    },
    "Radio button could not be selected",
    500
  );

  return true;
};

/**
 * Checks if the specified window has been loaded
 *
 * @param {DOMWindow} [window=this.window] Window object to check for loaded state
 */
MozMillController.prototype.isLoaded = function(window) {
  var win = window || this.window;

  return (
    win.document.readyState == "complete" && win.location.href != "about:blank"
  );
};

MozMillController.prototype.waitFor = function(
  callback,
  message,
  timeout,
  interval,
  thisObject
) {
  utils.waitFor(callback, message, timeout, interval, thisObject);
};

/**
 * Wrapper function to create a new instance of a menu
 * @see Menu
 */
MozMillController.prototype.getMenu = function(menuSelector, document) {
  return new Menu(this, menuSelector, document);
};

MozMillController.prototype.__defineGetter__("mainMenu", function() {
  return this.getMenu("menubar");
});

MozMillController.prototype.__defineGetter__("menus", function() {
  var menubar = this.window.document.querySelector("menubar");
  return new MenuTree(this.window, menubar);
});
