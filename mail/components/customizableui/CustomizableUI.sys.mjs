/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This file is a copy of a file with the same name in Firefox. Only the
// pieces we're using, and a few pieces the devtools rely on such as the
// constants, remain.

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  PanelMultiView: "resource:///modules/PanelMultiView.sys.mjs",
});

/**
 * gPanelsForWindow is a list of known panels in a window which we may need to close
 * should command events fire which target them.
 */
var gPanelsForWindow = new WeakMap();

var CustomizableUIInternal = {
  addPanelCloseListeners(aPanel) {
    aPanel.addEventListener("click", this, { mozSystemGroup: true });
    aPanel.addEventListener("keypress", this, { mozSystemGroup: true });
    const win = aPanel.ownerGlobal;
    if (!gPanelsForWindow.has(win)) {
      gPanelsForWindow.set(win, new Set());
    }
    gPanelsForWindow.get(win).add(this._getPanelForNode(aPanel));
  },

  removePanelCloseListeners(aPanel) {
    aPanel.removeEventListener("click", this, { mozSystemGroup: true });
    aPanel.removeEventListener("keypress", this, { mozSystemGroup: true });
    const win = aPanel.ownerGlobal;
    const panels = gPanelsForWindow.get(win);
    if (panels) {
      panels.delete(this._getPanelForNode(aPanel));
    }
  },

  handleEvent(aEvent) {
    switch (aEvent.type) {
      case "click":
      case "keypress":
        this.maybeAutoHidePanel(aEvent);
        break;
    }
  },

  _getPanelForNode(aNode) {
    return aNode.closest("panel");
  },

  /*
   * If people put things in the panel which need more than single-click interaction,
   * we don't want to close it. Right now we check for text inputs and menu buttons.
   * We also check for being outside of any toolbaritem/toolbarbutton, ie on a blank
   * part of the menu.
   */
  _isOnInteractiveElement(aEvent) {
    function getMenuPopupForDescendant(aNode) {
      let lastPopup = null;
      while (
        aNode &&
        aNode.parentNode &&
        aNode.parentNode.localName.startsWith("menu")
      ) {
        lastPopup = aNode.localName == "menupopup" ? aNode : lastPopup;
        aNode = aNode.parentNode;
      }
      return lastPopup;
    }

    let target = aEvent.target;
    const panel = this._getPanelForNode(aEvent.currentTarget);
    // This can happen in e.g. customize mode. If there's no panel,
    // there's clearly nothing for us to close; pretend we're interactive.
    if (!panel) {
      return true;
    }
    // We keep track of:
    // whether we're in an input container (text field)
    let inInput = false;
    // whether we're in a popup/context menu
    let inMenu = false;
    // whether we're in a toolbarbutton/toolbaritem
    let inItem = false;
    // whether the current menuitem has a valid closemenu attribute
    let menuitemCloseMenu = "auto";

    // While keeping track of that, we go from the original target back up,
    // to the panel if we have to. We bail as soon as we find an input,
    // a toolbarbutton/item, or the panel:
    while (target) {
      // Skip out of iframes etc:
      if (target.nodeType == target.DOCUMENT_NODE) {
        if (!target.defaultView) {
          // Err, we're done.
          break;
        }
        // Find containing browser or iframe element in the parent doc.
        target = target.defaultView.docShell.chromeEventHandler;
        if (!target) {
          break;
        }
      }
      const tagName = target.localName;
      inInput = tagName == "input";
      inItem = tagName == "toolbaritem" || tagName == "toolbarbutton";
      const isMenuItem = tagName == "menuitem";
      inMenu = inMenu || isMenuItem;

      if (isMenuItem && target.hasAttribute("closemenu")) {
        const closemenuVal = target.getAttribute("closemenu");
        menuitemCloseMenu =
          closemenuVal == "single" || closemenuVal == "none"
            ? closemenuVal
            : "auto";
      }

      // Keep the menu open and break out of the loop if the click happened on
      // the ShadowRoot or a disabled menu item.
      if (
        target.nodeType == target.DOCUMENT_FRAGMENT_NODE ||
        target.getAttribute("disabled") == "true"
      ) {
        return true;
      }

      // This isn't in the loop condition because we want to break before
      // changing |target| if any of these conditions are true
      if (inInput || inItem || target == panel) {
        break;
      }
      // We need specific code for popups: the item on which they were invoked
      // isn't necessarily in their parentNode chain:
      if (isMenuItem) {
        const topmostMenuPopup = getMenuPopupForDescendant(target);
        target =
          (topmostMenuPopup && topmostMenuPopup.triggerNode) ||
          target.parentNode;
      } else {
        target = target.parentNode;
      }
    }

    // If the user clicked a menu item...
    if (inMenu) {
      // We care if we're in an input also,
      // or if the user specified closemenu!="auto":
      if (inInput || menuitemCloseMenu != "auto") {
        return true;
      }
      // Otherwise, we're probably fine to close the panel
      return false;
    }
    // If we're not in a menu, and we *are* in a type="menu" toolbarbutton,
    // we'll now interact with the menu
    if (inItem && target.getAttribute("type") == "menu") {
      return true;
    }
    return inInput || !inItem;
  },

  hidePanelForNode(aNode) {
    const panel = this._getPanelForNode(aNode);
    if (panel) {
      lazy.PanelMultiView.hidePopup(panel);
    }
  },

  maybeAutoHidePanel(aEvent) {
    const eventType = aEvent.type;
    if (eventType == "keypress" && aEvent.keyCode != aEvent.DOM_VK_RETURN) {
      return;
    }

    if (eventType == "click" && aEvent.button != 0) {
      return;
    }

    // We don't check preventDefault - it makes sense that this was prevented,
    // but we probably still want to close the panel. If consumers don't want
    // this to happen, they should specify the closemenu attribute.
    if (eventType != "command" && this._isOnInteractiveElement(aEvent)) {
      return;
    }

    // We can't use event.target because we might have passed an anonymous
    // content boundary as well, and so target points to the outer element in
    // that case. Unfortunately, this means we get anonymous child nodes instead
    // of the real ones, so looking for the 'stoooop, don't close me' attributes
    // is more involved.
    let target = aEvent.originalTarget;
    while (target.parentNode && target.localName != "panel") {
      if (
        target.getAttribute("closemenu") == "none" ||
        target.getAttribute("widget-type") == "view" ||
        target.getAttribute("widget-type") == "button-and-view"
      ) {
        return;
      }
      target = target.parentNode;
    }

    // If we get here, we can actually hide the popup:
    this.hidePanelForNode(aEvent.target);
  },
};
Object.freeze(CustomizableUIInternal);

export var CustomizableUI = {
  /**
   * Constant reference to the ID of the navigation toolbar.
   */
  AREA_NAVBAR: "nav-bar",
  /**
   * Constant reference to the ID of the menubar's toolbar.
   */
  AREA_MENUBAR: "toolbar-menubar",
  /**
   * Constant reference to the ID of the tabstrip toolbar.
   */
  AREA_TABSTRIP: "TabsToolbar",
  /**
   * Constant reference to the ID of the bookmarks toolbar.
   */
  AREA_BOOKMARKS: "PersonalToolbar",
  /**
   * Constant reference to the ID of the non-dymanic (fixed) list in the overflow panel.
   */
  AREA_FIXED_OVERFLOW_PANEL: "widget-overflow-fixed-list",

  /**
   * Constant indicating the area is a menu panel.
   */
  TYPE_MENU_PANEL: "menu-panel",
  /**
   * Constant indicating the area is a toolbar.
   */
  TYPE_TOOLBAR: "toolbar",

  /**
   * Constant indicating a XUL-type provider.
   */
  PROVIDER_XUL: "xul",
  /**
   * Constant indicating an API-type provider.
   */
  PROVIDER_API: "api",
  /**
   * Constant indicating dynamic (special) widgets: spring, spacer, and separator.
   */
  PROVIDER_SPECIAL: "special",

  /**
   * Constant indicating the widget is built-in
   */
  SOURCE_BUILTIN: "builtin",
  /**
   * Constant indicating the widget is externally provided
   * (e.g. by add-ons or other items not part of the builtin widget set).
   */
  SOURCE_EXTERNAL: "external",

  /**
   * Constant indicating the reason the event was fired was a window closing
   */
  REASON_WINDOW_CLOSED: "window-closed",
  /**
   * Constant indicating the reason the event was fired was an area being
   * unregistered separately from window closing mechanics.
   */
  REASON_AREA_UNREGISTERED: "area-unregistered",

  /**
   * Add a widget to an area.
   * If the area to which you try to add is not known to CustomizableUI,
   * this will throw.
   * If the area to which you try to add is the same as the area in which
   * the widget is currently placed, this will do the same as
   * moveWidgetWithinArea.
   * If the widget cannot be removed from its original location, this will
   * no-op.
   *
   * This will fire an onWidgetAdded notification,
   * and an onWidgetBeforeDOMChange and onWidgetAfterDOMChange notification
   * for each window CustomizableUI knows about.
   *
   * @param _aWidgetId the ID of the widget to add
   * @param _aArea     the ID of the area to add the widget to
   * @param _aPosition the position at which to add the widget. If you do not
   *                  pass a position, the widget will be added to the end
   *                  of the area.
   */
  addWidgetToArea(_aWidgetId, _aArea, _aPosition) {},
  /**
   * Remove a widget from its area. If the widget cannot be removed from its
   * area, or is not in any area, this will no-op. Otherwise, this will fire an
   * onWidgetRemoved notification, and an onWidgetBeforeDOMChange and
   * onWidgetAfterDOMChange notification for each window CustomizableUI knows
   * about.
   *
   * @param _aWidgetId the ID of the widget to remove
   */
  removeWidgetFromArea(_aWidgetId) {},
  /**
   * Get the placement of a widget. This is by far the best way to obtain
   * information about what the state of your widget is. The internals of
   * this call are cheap (no DOM necessary) and you will know where the user
   * has put your widget.
   *
   * @param _aWidgetId the ID of the widget whose placement you want to know
   * @returns
   *   {
   *     area: "somearea", // The ID of the area where the widget is placed
   *     position: 42 // the index in the placements array corresponding to
   *                  // your widget.
   *   }
   *
   *   OR
   *
   *   null // if the widget is not placed anywhere (ie in the palette)
   */
  getPlacementOfWidget(_aWidgetId) {
    return null;
  },
  /**
   * Add listeners to a panel that will close it. For use from the menu panel
   * and overflowable toolbar implementations, unlikely to be useful for
   * consumers.
   *
   * @param aPanel the panel to which listeners should be attached.
   */
  addPanelCloseListeners(aPanel) {
    CustomizableUIInternal.addPanelCloseListeners(aPanel);
  },
  /**
   * Remove close listeners that have been added to a panel with
   * addPanelCloseListeners. For use from the menu panel and overflowable
   * toolbar implementations, unlikely to be useful for consumers.
   *
   * @param aPanel the panel from which listeners should be removed.
   */
  removePanelCloseListeners(aPanel) {
    CustomizableUIInternal.removePanelCloseListeners(aPanel);
  },
  /**
   * Notify toolbox(es) of a particular event. If you don't pass aWindow,
   * all toolboxes will be notified. For use from Customize Mode only,
   * do not use otherwise.
   *
   * @param _aEvent the name of the event to send.
   * @param _aDetails optional, the details of the event.
   * @param _aWindow optional, the window in which to send the event.
   */
  dispatchToolboxEvent(_aEvent, _aDetails, _aWindow) {},
};
Object.freeze(CustomizableUI);
