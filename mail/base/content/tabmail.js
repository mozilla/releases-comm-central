/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict"; // from mailWindow.js

/* global MozElements, MozXULElement */

/* import-globals-from mailCore.js */
/* globals contentProgress, statusFeedback */

ChromeUtils.defineESModuleGetters(this, {
  UIFontSize: "resource:///modules/UIFontSize.sys.mjs",
});

// Wrap in a block to prevent leaking to window scope.
{
  /**
   * The MozTabmailAlltabsMenuPopup widget is used as a menupopup to list all the
   * currently opened tabs.
   *
   * @augments {MozElements.MozMenuPopup}
   * @implements {EventListener}
   */
  class MozTabmailAlltabsMenuPopup extends MozElements.MozMenuPopup {
    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }

      this.tabmail = document.getElementById("tabmail");

      this._mutationObserver = new MutationObserver((records, observer) => {
        records.forEach(mutation => {
          const menuItem = mutation.target.mCorrespondingMenuitem;
          if (menuItem) {
            this._setMenuitemAttributes(menuItem, mutation.target);
          }
        });
      });

      this.addEventListener("popupshowing", event => {
        // Set up the menu popup.
        const tabcontainer = this.tabmail.tabContainer;
        const tabs = tabcontainer.allTabs;

        // Listen for changes in the tab bar.
        this._mutationObserver.observe(tabcontainer, {
          attributes: true,
          subtree: true,
          attributeFilter: ["label", "crop", "busy", "image", "selected"],
        });

        this.tabmail.addEventListener("TabOpen", this);
        tabcontainer.arrowScrollbox.addEventListener("scroll", this);

        // If an animation is in progress and the user
        // clicks on the "all tabs" button, stop the animation.
        tabcontainer._stopAnimation();

        for (let i = 0; i < tabs.length; i++) {
          this._createTabMenuItem(tabs[i]);
        }
        this._updateTabsVisibilityStatus();
      });

      this.addEventListener("popuphiding", event => {
        // Clear out the menu popup and remove the listeners.
        while (this.hasChildNodes()) {
          const menuItem = this.lastElementChild;
          menuItem.removeEventListener("command", this);
          menuItem.tab.removeEventListener("TabClose", this);
          menuItem.tab.mCorrespondingMenuitem = null;
          menuItem.remove();
        }
        this._mutationObserver.disconnect();

        this.tabmail.tabContainer.arrowScrollbox.removeEventListener(
          "scroll",
          this
        );
        this.tabmail.removeEventListener("TabOpen", this);
      });
    }

    _menuItemOnCommand(aEvent) {
      this.tabmail.tabContainer.selectedItem = aEvent.target.tab;
    }

    _tabOnTabClose(aEvent) {
      const menuItem = aEvent.target.mCorrespondingMenuitem;
      if (menuItem) {
        menuItem.remove();
      }
    }

    handleEvent(aEvent) {
      if (!aEvent.isTrusted) {
        return;
      }

      switch (aEvent.type) {
        case "command":
          this._menuItemOnCommand(aEvent);
          break;
        case "TabClose":
          this._tabOnTabClose(aEvent);
          break;
        case "TabOpen":
          this._createTabMenuItem(aEvent.target);
          break;
        case "scroll":
          this._updateTabsVisibilityStatus();
          break;
      }
    }

    _updateTabsVisibilityStatus() {
      const tabStrip = this.tabmail.tabContainer.arrowScrollbox;
      // We don't want menu item decoration unless there is overflow.
      if (tabStrip.getAttribute("overflow") != "true") {
        return;
      }

      const tabStripBox = tabStrip.getBoundingClientRect();

      for (let i = 0; i < this.children.length; i++) {
        const currentTabBox = this.children[i].tab.getBoundingClientRect();

        if (
          currentTabBox.left >= tabStripBox.left &&
          currentTabBox.right <= tabStripBox.right
        ) {
          this.children[i].setAttribute("tabIsVisible", "true");
        } else {
          this.children[i].removeAttribute("tabIsVisible");
        }
      }
    }

    _createTabMenuItem(aTab) {
      const menuItem = document.createXULElement("menuitem");

      menuItem.setAttribute(
        "class",
        "menuitem-iconic alltabs-item menuitem-with-favicon"
      );

      this._setMenuitemAttributes(menuItem, aTab);

      // Keep some attributes of the menuitem in sync with its
      // corresponding tab (e.g. the tab label).
      aTab.mCorrespondingMenuitem = menuItem;
      aTab.addEventListener("TabClose", this);
      menuItem.tab = aTab;
      menuItem.addEventListener("command", this);

      this.appendChild(menuItem);
      return menuItem;
    }

    _setMenuitemAttributes(aMenuitem, aTab) {
      aMenuitem.setAttribute("label", aTab.label);
      aMenuitem.setAttribute("crop", "end");

      if (aTab.hasAttribute("busy")) {
        aMenuitem.setAttribute("busy", aTab.getAttribute("busy"));
        aMenuitem.removeAttribute("image");
      } else {
        aMenuitem.setAttribute("image", aTab.getAttribute("image"));
        aMenuitem.removeAttribute("busy");
      }

      // Change the tab icon accordingly.
      const style = window.getComputedStyle(aTab);
      aMenuitem.style.listStyleImage = style.listStyleImage;
      aMenuitem.style.MozImageRegion = style.MozImageRegion;

      if (aTab.hasAttribute("pending")) {
        aMenuitem.setAttribute("pending", aTab.getAttribute("pending"));
      } else {
        aMenuitem.removeAttribute("pending");
      }

      if (aTab.selected) {
        aMenuitem.setAttribute("selected", "true");
      } else {
        aMenuitem.removeAttribute("selected");
      }
    }
  }

  customElements.define(
    "tabmail-alltabs-menupopup",
    MozTabmailAlltabsMenuPopup,
    { extends: "menupopup" }
  );

  /**
   * Thunderbird's tab UI mechanism.
   *
   * We expect to be instantiated with the following children:
   * One "tabpanels" child element whose id must be placed in the
   *   "panelcontainer" attribute on the element we are being bound to. We do
   *   this because it is important to allow overlays to contribute panels.
   *   When we attempted to have the immediate children of the bound element
   *   be propagated through use of the "children" tag, we found that children
   *   contributed by overlays did not propagate.
   * Any children you want added to the right side of the tab bar.  This is
   *   primarily intended to allow for "open a BLANK tab" buttons, namely
   *   calendar and tasks.  For reasons similar to the tabpanels case, we
   *   expect the instantiating element to provide a child hbox for overlays
   *   to contribute buttons to.
   *
   * From a javascript perspective, there are three types of code that we
   *  expect to interact with:
   * 1) Code that wants to open new tabs.
   * 2) Code that wants to contribute one or more varieties of tabs.
   * 3) Code that wants to monitor to know when the active tab changes.
   *
   * Consumer code should use the following methods:
   * openTab(aTabModeName, aArgs)
   *     Open a tab of the given "mode", passing the provided arguments as an
   *     object. The tab type author should tell you the modes they implement
   *     and the required/optional arguments.
   *
   *     Each tab type can define the set of arguments that it expects, but
   *     there are also a few common ones that all should obey, including:
   *
   *     "background": if this is true, the tab will be loaded in the
   *       background.
   *     "disregardOpener": if this is true, then the tab opener will not
   *       be switched to automatically by tabmail if the new tab is immediately
   *       closed.
   *
   * closeTab(aOptionalTabIndexInfoOrTabNode, aNoUndo):
   *     If no argument is provided, the current tab is closed. The first
   *     argument specifies a specific tab to be closed. It can be a tab index,
   *     a tab info object, or a tab's DOM element. In case the second
   *     argument is true, the closed tab can't be restored by calling
   *     undoCloseTab().
   *     Please note, some tabs cannot be closed. Trying to close such tab,
   *     will fail silently.
   * undoCloseTab():
   *     Restores the most recent tab closed by the user.
   * switchToTab(aTabIndexInfoOrTabNode):
   *     Switch to the tab by providing a tab index, tab info object, or tab
   *     node (tabmail-tab bound element.) Instead of calling this method,
   *     you can also just poke at tabmail.tabContainer and its selectedIndex
   *     and selectedItem properties.
   * replaceTabWithWindow(aTab):
   *     Detaches a tab from this tabbar to new window. The argument "aTab" is
   *     required and can be a tab index, a tab info object or a tabs's
   *     DOM element. Calling this method works only for tabs implementing
   *     session restore.
   * moveTabTo(aTab, aIndex):
   *     moves the given tab to the given Index. The first argument can be
   *     a tab index, a tab info object or a tab's DOM element. The second
   *     argument specifies the tabs new absolute position within the tabbar.
   *
   * Less-friendly consumer methods:
   * * persistTab(tab):
   *     serializes a tab into an object, by passing  a tab info object as
   *     argument. It is used for session restore and moving tabs between
   *     windows. Returns null in case persist fails.
   * * removeCurrentTab():
   *     Close the current tab.
   * * removeTabByNode(aTabElement):
   *     Close the tab whose tabmail-tab bound element is passed in.
   * Changing the currently displayed tab is accomplished by changing
   *  tabmail.tabContainer's selectedIndex or selectedItem property.
   *
   * Code that lives in a tab should use the following methods:
   * * setTabTitle([aOptionalTabInfo]): Tells us that the title of the current
   *   tab (if no argument is provided) or provided tab needs to be updated.
   *   This will result in a call to the tab mode's logic to update the title.
   *   In the event this is not for the current tab, the caller is responsible
   *   for ensuring that the underlying tab mode is capable of providing a tab
   *   title when it is in the background.  (The is currently not the case for
   *   "folder" and "mail" modes because of their implementation.)
   * * setTabBusy(aTabNode, aBusyState): Tells us that the tab in question
   *   is now busy or not busy.  "Busy" means that it is occupied and
   *   will not be able to respond to you until it is no longer busy.
   *   This impacts the cursor display, as well as potentially
   *   providing tab display hints.
   * * setTabThinking(aTabNode, aThinkingState): Tells us that the
   *   tab in question is now thinking or not thinking.  "Thinking" means
   *   that the tab is involved in some ongoing process but you can still
   *   interact with the tab while it is thinking.  A search would be an
   *   example of thinking.  This impacts spinny-thing feedback as well as
   *   potential providing tab display hints.  aThinkingState may be a
   *   boolean or a localized string explaining what you are thinking about.
   *
   * Tab contributing code should define a tab type object and register it
   *  with us by calling registerTabType. You can remove a registered tab
   *  type (eg when unloading a restartless addon) by calling unregisterTabType.
   *  Each tab type can provide multiple tab modes. The rationale behind this
   *  organization is that Thunderbird historically/currently uses a single
   *  3-pane view to display both three-pane folder browsing and single message
   *  browsing across multiple tabs. Each tab type has the ability to use a
   *  single tab panel for all of its display needs. So Thunderbird's "mail"
   *  tab type covers both the "folder" (3-pane folder-based browsing) and
   *  "message" (just a single message) tab modes. Likewise, calendar/lightning
   *  currently displays both its calendar and tasks in the same panel. A tab
   *  type can also create a new tabpanel for each tab as it is created. In
   *  that case, the tab type should probably only have a single mode unless
   *  there are a number of similar modes that can gain from code sharing.
   *
   * If you're adding a new tab type, please update TabmailTab.type in
   *  mail/components/extensions/parent/ext-mail.js.
   *
   * The tab type definition should include the following attributes:
   * * name: The name of the tab-type, mainly to aid in debugging.
   * * panelId or perTabPanel: If using a single tab panel, the id of the
   *     panel must be provided in panelId.  If using one tab panel per tab,
   *     perTabPanel should be either the XUL element name that should be
   *     created for each tab, or a helper function to create and return the
   *     element.
   * * modes: An object whose attributes are mode names (which are
   *     automatically propagated to a 'name' attribute for debugging) and
   *     values are objects with the following attributes...
   * * any of the openTab/closeTab/saveTabState/showTab/onTitleChanged
   *     functions as described on the mode definitions.  These will only be
   *     called if the mode does not provide the functions.  Note that because
   *     the 'this' variable passed to the functions will always reference the
   *     tab type definition (rather than the mode definition), the mode
   *     functions can defer to the tab type functions by calling
   *     this.functionName().  (This should prove convenient.)
   * Mode definition attributes:
   * * type: The "type" attribute to set on the displayed tab for CSS purposes.
   *     Generally, this would be the same as the mode name, but you can do as
   *     you please.
   * * isDefault: This should only be present and should be true for the tab
   *     mode that is the tab displayed automatically on startup.
   * * maxTabs: The maximum number of this mode that can be opened at a time.
   *     If this limit is reached, any additional calls to openTab for this
   *     mode will simply result in the first existing tab of this mode being
   *     displayed.
   * * shouldSwitchTo(aArgs): Optional function. Called when openTab is called
   *     on the top-level tabmail binding. It is used to decide if the openTab
   *     function should switch to an existing tab or actually open a new tab.
   *     If the openTab function should switch to an existing tab, return the
   *     index of that tab; otherwise return -1.
   *     aArgs is a set of named parameters (the ones that are later passed to
   *     openTab).
   * * openTab(aTab, aArgs): Called when a tab of the given mode is in the
   *     process of being opened.  aTab will have its "mode" attribute
   *     set to the mode definition of the tab mode being opened.  You should
   *     set the "title" attribute on it, and may set any other attributes
   *     you wish for your own use in subsequent functions.  Note that 'this'
   *     points to the tab type definition, not the mode definition as you
   *     might expect.  This allows you to place common logic code on the
   *     tab type for use by multiple modes and to defer to it.  Any arguments
   *     provided to the caller of tabmail.openTab will be passed to your
   *     function as well, including background.
   * * closeTab(aTab): Called when aTab is being closed.  The tab need not be
   *     currently displayed.  You are responsible for properly cleaning up
   *     any state you preserved in aTab.
   * * saveTabState(aTab): Called when aTab is being switched away from so that
   *     you can preserve its state on aTab.  This is primarily for single
   *     tab panel implementations; you may not have much state to save if your
   *     tab has its own tab panel.
   * * showTab(aTab): Called when aTab is being displayed and you should
   *     restore its state (if required).
   * * persistTab(aTab): Called when we want to persist the tab because we are
   *     saving the session state.  You should return an object suitable for
   *     JSON serialization.  The object will be provided to your restoreTab
   *     method when we attempt to restore the session.  If your code is
   *     unable or unwilling to persist the tab (some of the time), you should
   *     return null in that case.  If your code never wants to persist the tab
   *     you should not implement this method.  You must implement restoreTab
   *     if you implement this method.
   * * restoreTab(aTabmail, aPersistedState): Called when we are restoring a
   *     tab session and a tab with your mode was previously persisted via a
   *     call to your persistTab implementation.  You are provided with a
   *     reference to this tabmail instance and the (deserialized) state object
   *     you returned from your persistTab implementation.  It is your
   *     function's job to determine if you can restore the tab, and if so,
   *     you should invoke aTabmail.openTab to actually cause your tab to be
   *     opened.  This may seem odd, but it should help keep your code simple
   *     while letting you do whatever you want.  Since openTab is synchronous
   *     and returns the tabInfo structure built for the tab, you can perform
   *     any additional work you need after the call to openTab.
   * * onTitleChanged(aTab): Called when someone calls tabmail.setTabTitle() to
   *     hint that the tab's title needs to be updated.  This function should
   *     update aTab.title if it can.
   * Mode definition functions to do with menu/toolbar commands:
   * * supportsCommand(aCommand, aTab): Called when a menu or toolbar needs to
   *     be updated. Return true if you support that command in
   *     isCommandEnabled and doCommand, return false otherwise.
   * * isCommandEnabled(aCommand, aTab): Called when a menu or toolbar needs
   *     to be updated. Return true if the command can be executed at the
   *     current time, false otherwise.
   * * doCommand(aCommand, aTab): Called when a menu or toolbar command is to
   *     be executed. Perform the action appropriate to the command.
   * * onEvent(aEvent, aTab): This can be used to handle different events on
   *     the window.
   * * getBrowser(aTab): This function should return the browser element for
   *     your tab if there is one (return null or don't define this function
   *     otherwise). It is used for some toolkit functions that require a
   *     global "getBrowser" function, e.g. ZoomManager.
   *
   * Tab monitoring code is expected to be used for widgets on the screen
   *  outside of the tab box that need to update themselves as the active tab
   *  changes.
   * Tab monitoring code (un)registers itself via (un)registerTabMonitor.
   *  The following attributes should be provided on the monitor object:
   * * monitorName: A string value naming the tab monitor/extension.  This is
   *     the canonical name for the tab monitor for all persistence purposes.
   *     If the tab monitor wants to store data in the tab info object and its
   *     name is FOO it should store it in 'tabInfo._ext.FOO'.  This is the
   *     only place the tab monitor should store information on the tab info
   *     object.  The FOO attribute will not be automatically created; it is
   *     up to the code.  The _ext attribute will be there, reliably, however.
   *     The name is also used when persisting state, but the tab monitor
   *     does not need to do anything in that case; the name is automatically
   *     used in the course of wrapping the object.
   *  The following functions should be provided on the monitor object:
   * * onTabTitleChanged(aTab): Called when the tab's title changes.
   * * onTabSwitched(aTab, aOldTab): Called when a new tab is made active.
   *     Also called when the monitor is registered if one or more tabs exist.
   *     If this is the first call, aOldTab will be null, otherwise aOldTab
   *     will be the previously active tab.
   * * onTabOpened(aTab, aIsFirstTab, aWasCurrentTab): Called when a new tab is
   *     opened.  This method is invoked after the tab mode's openTab method
   *     is invoked.  This method is invoked before the tab monitor
   *     onTabSwitched method in the case where it will be invoked.  (It is
   *     not invoked if the tab is opened in the background.)
   * * onTabClosing(aTab): Called when a tab is being closed.  This method is
   *     is invoked before the call to the tab mode's closeTab function.
   * * onTabPersist(aTab): Return a JSON-representable object to persist for
   *     the tab.  Return null if you do not have anything to persist.
   * * onTabRestored(aTab, aState, aIsFirstTab): Called when a tab is being
   *     restored and there is data previously persisted by the tab monitor.
   *     This method is called instead of invoking onTabOpened.  This is done
   *     because the restoreTab method (potentially) uses the tabmail openTab
   *     API to effect restoration.  (Note: the first opened tab is special;
   *     it will produce an onTabOpened notification potentially followed by
   *     an onTabRestored notification.)
   * Tab monitor code is also allowed to hook into the command processing
   *  logic.  We support the standard supportsCommand/isCommandEnabled/
   *  doCommand functions but with a twist to indicate when other tab monitors
   *  and the actual tab itself should get a chance to process: supportsCommand
   *  and isCommandEnabled should return null when they are not handling the
   *  case.  doCommand should return true if it handled the case, null
   *  otherwise.
   */

  /**
   * The MozTabmail widget handles the Tab UI mechanism.
   *
   * @augments {MozXULElement}
   */
  class MozTabmail extends MozXULElement {
    /**
     * Flag indicating that the UI is currently covered by an overlay.
     *
     * @type {boolean}
     */
    globalOverlay = false;

    connectedCallback() {
      if (this.delayConnectedCallback()) {
        return;
      }

      this.tabbox = this.getElementsByTagName("tabbox").item(0);
      this.currentTabInfo = null;

      /**
       * Temporary field that only has a non-null value during a call to
       * openTab, and whose value is the currentTabInfo of the tab that was
       * open when we received the call to openTab.
       */
      this._mostRecentTabInfo = null;
      /**
       * Tab id, incremented on each openTab() and set on the browser.
       */
      this.tabId = 0;
      this.tabTypes = {};
      this.tabModes = {};
      this.defaultTabMode = null;
      this.tabInfo = [];
      this.tabContainer = document.getElementById(
        this.getAttribute("tabcontainer")
      );
      this.panelContainer = document.getElementById(
        this.getAttribute("panelcontainer")
      );
      this.tabMonitors = [];
      this.recentlyClosedTabs = [];
      this.mLastTabOpener = null;
      this.unrestoredTabs = [];

      // @implements {nsIController}
      this.tabController = {
        supportsCommand: aCommand => {
          const tab = this.currentTabInfo;
          // This can happen if we're starting up and haven't got a tab
          // loaded yet.
          if (!tab) {
            return false;
          }

          for (const tabMonitor of this.tabMonitors) {
            try {
              if ("supportsCommand" in tabMonitor) {
                const result = tabMonitor.supportsCommand(aCommand, tab);
                if (result !== null) {
                  return result;
                }
              }
            } catch (ex) {
              console.error(ex);
            }
          }

          const supportsCommandFunc =
            tab.mode.supportsCommand || tab.mode.tabType.supportsCommand;
          if (supportsCommandFunc) {
            return supportsCommandFunc.call(tab.mode.tabType, aCommand, tab);
          }

          return false;
        },

        isCommandEnabled: aCommand => {
          const tab = this.currentTabInfo;
          // This can happen if we're starting up and haven't got a tab
          // loaded yet.
          if (!tab || this.globalOverlay) {
            return false;
          }

          for (const tabMonitor of this.tabMonitors) {
            try {
              if ("isCommandEnabled" in tabMonitor) {
                const result = tabMonitor.isCommandEnabled(aCommand, tab);
                if (result !== null) {
                  return result;
                }
              }
            } catch (ex) {
              console.error(ex);
            }
          }

          const isCommandEnabledFunc =
            tab.mode.isCommandEnabled || tab.mode.tabType.isCommandEnabled;
          if (isCommandEnabledFunc) {
            return isCommandEnabledFunc.call(tab.mode.tabType, aCommand, tab);
          }

          return false;
        },

        doCommand: (aCommand, ...args) => {
          const tab = this.currentTabInfo;
          // This can happen if we're starting up and haven't got a tab
          // loaded yet.
          if (!tab) {
            return;
          }

          for (const tabMonitor of this.tabMonitors) {
            try {
              if ("doCommand" in tabMonitor) {
                const result = tabMonitor.doCommand(aCommand, tab);
                if (result === true) {
                  return;
                }
              }
            } catch (ex) {
              console.error(ex);
            }
          }

          const doCommandFunc =
            tab.mode.doCommand || tab.mode.tabType.doCommand;
          if (doCommandFunc) {
            doCommandFunc.call(tab.mode.tabType, aCommand, tab, ...args);
          }
        },

        onEvent: aEvent => {
          const tab = this.currentTabInfo;
          // This can happen if we're starting up and haven't got a tab
          // loaded yet.
          if (!tab) {
            return null;
          }

          const onEventFunc = tab.mode.onEvent || tab.mode.tabType.onEvent;
          if (onEventFunc) {
            return onEventFunc.call(tab.mode.tabType, aEvent, tab);
          }

          return false;
        },

        QueryInterface: ChromeUtils.generateQI(["nsIController"]),
      };

      // This is the second-highest priority controller. It's preceded by
      // DefaultController and followed by calendarController, then whatever
      // Gecko adds.
      window.controllers.insertControllerAt(1, this.tabController);
      this._restoringTabState = null;
    }

    set selectedTab(val) {
      this.switchToTab(val);
    }

    get selectedTab() {
      if (!this.currentTabInfo) {
        this.currentTabInfo = this.tabInfo[0];
      }

      return this.currentTabInfo;
    }

    get tabs() {
      return this.tabContainer.allTabs;
    }

    get selectedBrowser() {
      return this.getBrowserForSelectedTab();
    }

    registerTabType(aTabType) {
      if (aTabType.name in this.tabTypes) {
        return;
      }

      this.tabTypes[aTabType.name] = aTabType;
      for (const [modeName, modeDetails] of Object.entries(aTabType.modes)) {
        modeDetails.name = modeName;
        modeDetails.tabType = aTabType;
        modeDetails.tabs = [];
        this.tabModes[modeName] = modeDetails;
        if (modeDetails.isDefault) {
          this.defaultTabMode = modeDetails;
        }
      }

      if (aTabType.panelId) {
        aTabType.panel = document.getElementById(aTabType.panelId);
      } else if (!aTabType.perTabPanel) {
        throw new Error(
          "Trying to register a tab type with neither panelId " +
            "nor perTabPanel attributes."
        );
      }

      setTimeout(() => {
        for (const modeName of Object.keys(aTabType.modes)) {
          let i = 0;
          while (i < this.unrestoredTabs.length) {
            const state = this.unrestoredTabs[i];
            if (state.mode == modeName) {
              this.restoreTab(state);
              this.unrestoredTabs.splice(i, 1);
            } else {
              i++;
            }
          }
        }
      }, 0);
    }

    unregisterTabType(aTabType) {
      // we can skip if the tab type was never registered...
      if (!(aTabType.name in this.tabTypes)) {
        return;
      }

      // ... if the tab type is still in use, we can not remove it without
      // breaking the UI. So we throw an exception.
      for (const modeName of Object.keys(aTabType.modes)) {
        if (this.tabModes[modeName].tabs.length) {
          throw new Error("Tab mode " + modeName + " still in use. Close tabs");
        }
      }
      // ... finally get rid of the tab type
      for (const modeName of Object.keys(aTabType.modes)) {
        delete this.tabModes[modeName];
      }

      delete this.tabTypes[aTabType.name];
    }

    registerTabMonitor(aTabMonitor) {
      if (!this.tabMonitors.includes(aTabMonitor)) {
        this.tabMonitors.push(aTabMonitor);
        if (this.tabInfo.length) {
          aTabMonitor.onTabSwitched(this.currentTabInfo, null);
        }
      }
    }

    unregisterTabMonitor(aTabMonitor) {
      if (this.tabMonitors.includes(aTabMonitor)) {
        this.tabMonitors.splice(this.tabMonitors.indexOf(aTabMonitor), 1);
      }
    }

    /**
     * Given an index, tab node or tab info object, return a tuple of
     * [iTab, tab info dictionary, tab DOM node].  If
     * aTabIndexNodeOrInfo is not specified and aDefaultToCurrent is
     * true, the current tab will be returned.  Otherwise, an
     * exception will be thrown.
     */
    _getTabContextForTabbyThing(aTabIndexNodeOrInfo, aDefaultToCurrent) {
      let iTab;
      let tab;
      let tabNode;
      if (aTabIndexNodeOrInfo == null) {
        if (!aDefaultToCurrent) {
          throw new Error("You need to specify a tab!");
        }
        iTab = this.tabContainer.selectedIndex;
        return [iTab, this.tabInfo[iTab], this.tabContainer.allTabs[iTab]];
      }
      if (typeof aTabIndexNodeOrInfo == "number") {
        iTab = aTabIndexNodeOrInfo;
        tabNode = this.tabContainer.allTabs[iTab];
        tab = this.tabInfo[iTab];
      } else if (
        aTabIndexNodeOrInfo.tagName &&
        aTabIndexNodeOrInfo.tagName == "tab"
      ) {
        tabNode = aTabIndexNodeOrInfo;
        iTab = this.tabContainer.getIndexOfItem(tabNode);
        tab = this.tabInfo[iTab];
      } else {
        tab = aTabIndexNodeOrInfo;
        iTab = this.tabInfo.indexOf(tab);
        tabNode = iTab >= 0 ? this.tabContainer.allTabs[iTab] : null;
      }
      return [iTab, tab, tabNode];
    }

    openFirstTab() {
      // From the moment of creation, our customElement already has a visible
      // tab.  We need to create a tab information structure for this tab.
      // In the process we also generate a synthetic tab title changed
      // event to ensure we have an accurate title.  We assume the tab
      // contents will set themselves up correctly.
      if (this.tabInfo.length == 0) {
        const tab = this.openTab("mail3PaneTab", { first: true });
        this.tabs[0].linkedPanel = tab.panel.id;
      }
    }

    // eslint-disable-next-line complexity
    openTab(aTabModeName, aArgs = {}) {
      try {
        if (!(aTabModeName in this.tabModes)) {
          throw new Error("No such tab mode: " + aTabModeName);
        }

        const tabMode = this.tabModes[aTabModeName];
        // if we are already at our limit for this mode, show an existing one
        if (tabMode.tabs.length == tabMode.maxTabs) {
          const desiredTab = tabMode.tabs[0];
          this.tabContainer.selectedIndex = this.tabInfo.indexOf(desiredTab);
          return null;
        }

        // Do this so that we don't generate strict warnings
        const background = aArgs.background;
        // If the mode wants us to, we should switch to an existing tab
        // rather than open a new one. We shouldn't switch to the tab if
        // we're opening it in the background, though.
        const shouldSwitchToFunc =
          tabMode.shouldSwitchTo || tabMode.tabType.shouldSwitchTo;
        if (shouldSwitchToFunc) {
          const tabIndex = shouldSwitchToFunc.apply(tabMode.tabType, [aArgs]);
          if (tabIndex >= 0) {
            if (!background) {
              this.selectTabByIndex(null, tabIndex);
            }
            return this.tabInfo[tabIndex];
          }
        }

        if (!aArgs.first && !background) {
          // we need to save the state before it gets corrupted
          this.saveCurrentTabState();
        }

        const tab = {
          first: !!aArgs.first,
          mode: tabMode,
          busy: false,
          canClose: true,
          thinking: false,
          beforeTabOpen: true,
          favIconUrl: null,
          _ext: {},
        };

        tab.tabId = this.tabId++;
        tabMode.tabs.push(tab);

        let t;
        if (aArgs.first) {
          t = this.tabContainer.querySelector(`tab[is="tabmail-tab"]`);
        } else {
          t = document.createXULElement("tab", { is: "tabmail-tab" });
          t.className = "tabmail-tab";
          t.setAttribute("validate", "never");
          this.tabContainer.appendChild(t);
        }
        tab.tabNode = t;

        if (
          this.tabContainer.mCollapseToolbar.collapsed &&
          (!this.tabContainer.mAutoHide || this.tabContainer.allTabs.length > 1)
        ) {
          this.tabContainer.mCollapseToolbar.collapsed = false;
          this.tabContainer._updateCloseButtons();
          document.documentElement.removeAttribute("tabbarhidden");
        }

        const oldTab = (this._mostRecentTabInfo = this.currentTabInfo);
        // If we're not disregarding the opening, hold a reference to opener
        // so that if the new tab is closed without switching, we can switch
        // back to the opener tab.
        if (aArgs.disregardOpener) {
          this.mLastTabOpener = null;
        } else {
          this.mLastTabOpener = oldTab;
        }

        // the order of the following statements is important
        this.tabInfo[this.tabContainer.allTabs.length - 1] = tab;
        if (!background) {
          this.currentTabInfo = tab;
          // this has a side effect of calling updateCurrentTab, but our
          //  setting currentTabInfo above will cause it to take no action.
          this.tabContainer.selectedIndex =
            this.tabContainer.allTabs.length - 1;
        }

        // make sure we are on the right panel
        if (tab.mode.tabType.perTabPanel) {
          // should we create the element for them, or will they do it?
          if (typeof tab.mode.tabType.perTabPanel == "string") {
            tab.panel = document.createXULElement(tab.mode.tabType.perTabPanel);
          } else {
            tab.panel = tab.mode.tabType.perTabPanel(tab);
          }

          this.panelContainer.appendChild(tab.panel);

          if (!background) {
            this.panelContainer.selectedPanel = tab.panel;
          }
        } else {
          if (!background) {
            this.panelContainer.selectedPanel = tab.mode.tabType.panel;
          }
          t.linkedPanel = tab.mode.tabType.panelId;
        }

        // Make sure the new panel is marked selected.
        const oldPanel = [...this.panelContainer.children].find(p =>
          p.hasAttribute("selected")
        );
        // Blur the currently focused element only if we're actually switching
        // to the newly opened tab.
        if (oldPanel && !background) {
          this.rememberLastActiveElement(oldTab);
          oldPanel.removeAttribute("selected");
          if (oldTab.chromeBrowser) {
            oldTab.chromeBrowser.docShellIsActive = false;
          }
        }

        this.panelContainer.selectedPanel.setAttribute("selected", "true");
        const tabOpenFunc = tab.mode.openTab || tab.mode.tabType.openTab;
        tabOpenFunc.apply(tab.mode.tabType, [tab, aArgs]);
        if (tab.chromeBrowser) {
          tab.chromeBrowser.docShellIsActive = !background;
        }

        if (!t.linkedPanel) {
          if (!tab.panel.id) {
            // No id set. Create our own.
            tab.panel.id = "unnamedTab" + Math.random().toString().substring(2);
            console.warn(`Tab mode ${aTabModeName} should set an id
            on the first argument of openTab.`);
          }
          t.linkedPanel = tab.panel.id;
        }

        // Set the tabId after defining a <browser> and before notifications.
        const browser = this.getBrowserForTab(tab);
        if (browser && !tab.browser) {
          tab.browser = browser;
          if (!tab.linkedBrowser) {
            tab.linkedBrowser = browser;
          }
        }

        const restoreState = this._restoringTabState;
        for (const tabMonitor of this.tabMonitors) {
          try {
            if (
              "onTabRestored" in tabMonitor &&
              restoreState &&
              tabMonitor.monitorName in restoreState.ext
            ) {
              tabMonitor.onTabRestored(
                tab,
                restoreState.ext[tabMonitor.monitorName],
                false
              );
            } else if ("onTabOpened" in tabMonitor) {
              tabMonitor.onTabOpened(tab, false, oldTab);
            }
            if (!background) {
              tabMonitor.onTabSwitched(tab, oldTab);
            }
          } catch (ex) {
            console.error(ex);
          }
        }

        // clear _mostRecentTabInfo; we only needed it during the call to
        //  openTab.
        this._mostRecentTabInfo = null;
        t.setAttribute("label", tab.title);
        // For styling purposes, apply the type to the tab.
        t.setAttribute("type", tab.mode.type);

        if (!background) {
          this.setDocumentTitle(tab);
          // Move the focus on the newly selected tab.
          this.panelContainer.selectedPanel.focus();
        }

        const moving = restoreState ? restoreState.moving : null;
        // Dispatch tab opening event
        const evt = new CustomEvent("TabOpen", {
          bubbles: true,
          detail: { tabInfo: tab, moving },
        });
        t.dispatchEvent(evt);
        delete tab.beforeTabOpen;

        contentProgress.addProgressListenerToBrowser(browser);

        return tab;
      } catch (e) {
        console.error(e);
        return null;
      }
    }

    selectTabByMode(aTabModeName) {
      const tabMode = this.tabModes[aTabModeName];
      if (tabMode.tabs.length) {
        const desiredTab = tabMode.tabs[0];
        this.tabContainer.selectedIndex = this.tabInfo.indexOf(desiredTab);
      }
    }

    selectTabByIndex(aEvent, aIndex) {
      // count backwards for aIndex < 0
      if (aIndex < 0) {
        aIndex += this.tabInfo.length;
      }

      if (
        aIndex >= 0 &&
        aIndex < this.tabInfo.length &&
        aIndex != this.tabContainer.selectedIndex
      ) {
        this.tabContainer.selectedIndex = aIndex;
      }

      if (aEvent) {
        aEvent.preventDefault();
        aEvent.stopPropagation();
      }
    }

    /**
     * If the current/most recent tab is of mode aTabModeName, return its
     *  tab info, otherwise return the tab info for the first tab of the
     *  given mode.
     * You would want to use this method when you would like to mimic the
     *  settings of an existing instance of your mode.  In such a case,
     *  it is reasonable to assume that if the 'current' tab was of the
     *  same mode that its settings should be used.  Otherwise, we must
     *  fall back to another tab.  We currently choose the first tab of
     *  the instance, because for the "folder" tab, it is the canonical tab.
     *  In other cases, having an MRU order and choosing the MRU tab might
     *  be more appropriate.
     *
     * @returns the tab info object for the tab meeting the above criteria,
     *     or null if no such tab exists.
     */
    getTabInfoForCurrentOrFirstModeInstance(aTabMode) {
      // If we're in the middle of opening a new tab
      // (this._mostRecentTabInfo is non-null), we shouldn't consider the
      // current tab
      const tabToConsider = this._mostRecentTabInfo || this.currentTabInfo;
      if (tabToConsider && tabToConsider.mode == aTabMode) {
        return tabToConsider;
      } else if (aTabMode.tabs.length) {
        return aTabMode.tabs[0];
      }

      return null;
    }

    undoCloseTab(aIdx) {
      if (!this.recentlyClosedTabs.length) {
        return;
      }
      if (aIdx >= this.recentlyClosedTabs.length) {
        aIdx = this.recentlyClosedTabs.length - 1;
      }
      // splice always returns an array
      const history = this.recentlyClosedTabs.splice(aIdx, 1)[0];
      if (!history.tab) {
        return;
      }

      if (!this.restoreTab(JSON.parse(history.tab))) {
        return;
      }

      const idx = Math.min(history.idx, this.tabInfo.length);
      const tab = this.tabContainer.allTabs[this.tabInfo.length - 1];
      this.moveTabTo(tab, idx);
      this.switchToTab(tab);
    }

    closeTab(aOptTabIndexNodeOrInfo, aNoUndo) {
      const [iTab, tab, tabNode] = this._getTabContextForTabbyThing(
        aOptTabIndexNodeOrInfo,
        true
      );
      if (!tab.canClose) {
        return;
      }

      // Give the tab type a chance to make its own decisions about
      // whether its tabs can be closed or not. For instance, contentTabs
      // and chromeTabs run onbeforeunload event handlers that may
      // exercise their right to prompt the user for confirmation before
      // closing.
      const tryCloseFunc = tab.mode.tryCloseTab || tab.mode.tabType.tryCloseTab;
      if (tryCloseFunc && !tryCloseFunc.call(tab.mode.tabType, tab)) {
        return;
      }

      const evt = new CustomEvent("TabClose", {
        bubbles: true,
        detail: { tabInfo: tab, moving: tab.moving },
      });

      tabNode.dispatchEvent(evt);
      for (const tabMonitor of this.tabMonitors) {
        try {
          if ("onTabClosing" in tabMonitor) {
            tabMonitor.onTabClosing(tab);
          }
        } catch (ex) {
          console.error(ex);
        }
      }

      if (!aNoUndo) {
        // Allow user to undo accidentally closed tabs
        const session = this.persistTab(tab);
        if (session) {
          this.recentlyClosedTabs.unshift({
            tab: JSON.stringify(session),
            idx: iTab,
            title: tab.title,
          });
          if (this.recentlyClosedTabs.length > 10) {
            this.recentlyClosedTabs.pop();
          }
        }
      }

      tab.closed = true;
      const closeFunc = tab.mode.closeTab || tab.mode.tabType.closeTab;
      closeFunc.call(tab.mode.tabType, tab);
      this.tabInfo.splice(iTab, 1);
      tab.mode.tabs.splice(tab.mode.tabs.indexOf(tab), 1);
      tabNode.remove();

      if (this.tabContainer.selectedIndex == -1) {
        if (this.mLastTabOpener && this.tabInfo.includes(this.mLastTabOpener)) {
          this.tabContainer.selectedIndex = this.tabInfo.indexOf(
            this.mLastTabOpener
          );
        } else {
          this.tabContainer.selectedIndex =
            iTab == this.tabContainer.allTabs.length ? iTab - 1 : iTab;
        }
      }

      // Clear the last tab opener - we don't need this anymore.
      this.mLastTabOpener = null;
      if (this.currentTabInfo == tab) {
        this.updateCurrentTab();
      }

      if (tab.panel) {
        tab.panel.remove();
        delete tab.panel;
        // Ensure current tab is still selected and displayed in the
        // panelContainer.
        this.panelContainer.selectedPanel =
          this.currentTabInfo.panel || this.currentTabInfo.mode.tabType.panel;
      }

      if (
        this.tabContainer.allTabs.length == 1 &&
        this.tabContainer.mAutoHide
      ) {
        this.tabContainer.mCollapseToolbar.collapsed = true;
        document.documentElement.setAttribute("tabbarhidden", "true");
      }
    }

    removeTabByNode(aTabNode) {
      this.closeTab(aTabNode);
    }

    /**
     * Given a tabNode (or tabby thing), close all of the other tabs
     * that are closeable.
     */
    closeOtherTabs(aTabNode, aNoUndo) {
      const [, thisTab] = this._getTabContextForTabbyThing(aTabNode, false);
      // closeTab mutates the tabInfo array, so start from the end.
      for (let i = this.tabInfo.length - 1; i >= 0; i--) {
        const tab = this.tabInfo[i];
        if (tab != thisTab && tab.canClose) {
          this.closeTab(tab, aNoUndo);
        }
      }
    }

    replaceTabWithWindow(aTab, aTargetWindow, aTargetPosition) {
      if (this.tabInfo.length <= 1) {
        return null;
      }

      let tab = this._getTabContextForTabbyThing(aTab, false)[1];
      if (!tab.canClose) {
        return null;
      }

      // We use JSON and session restore transfer the tab to the new window.
      tab = this.persistTab(tab);
      if (!tab) {
        return null;
      }

      // Converting to JSON and back again creates clean javascript
      // object with absolutely no references to our current window.
      tab = JSON.parse(JSON.stringify(tab));
      // Set up an identifier for the move, consumers may want to correlate TabClose and
      // TabOpen events.
      const moveSession = Services.uuid.generateUUID().toString();
      tab.moving = moveSession;
      aTab.moving = moveSession;
      this.closeTab(aTab, true);

      if (aTargetWindow && aTargetWindow !== "popup") {
        const targetTabmail = aTargetWindow.document.getElementById("tabmail");
        targetTabmail.restoreTab(tab);
        if (aTargetPosition) {
          const droppedTab =
            targetTabmail.tabInfo[targetTabmail.tabInfo.length - 1];
          targetTabmail.moveTabTo(droppedTab, aTargetPosition);
        }
        return aTargetWindow;
      }

      const features = ["chrome"];
      if (aTargetWindow === "popup") {
        features.push(
          "dialog",
          "resizable",
          "minimizable",
          "centerscreen",
          "titlebar",
          "close"
        );
      } else {
        features.push("dialog=no", "all", "status", "toolbar");
      }

      return window
        .openDialog(
          "chrome://messenger/content/messenger.xhtml",
          "_blank",
          features.join(","),
          null,
          {
            action: "restore",
            tabs: [tab],
          }
        )
        .focus();
    }

    moveTabTo(aTabIndexNodeOrInfo, aIndex) {
      const [oldIdx, tab, tabNode] = this._getTabContextForTabbyThing(
        aTabIndexNodeOrInfo,
        false
      );
      if (
        !tab ||
        !tabNode ||
        tabNode.tagName != "tab" ||
        oldIdx < 0 ||
        oldIdx == aIndex
      ) {
        return -1;
      }

      // remove the entries from tabInfo, tabMode and the tabContainer
      this.tabInfo.splice(oldIdx, 1);
      tab.mode.tabs.splice(tab.mode.tabs.indexOf(tab), 1);
      tabNode.remove();
      // as we removed items, we might need to update indices
      if (oldIdx < aIndex) {
        aIndex--;
      }

      // Read it into tabInfo and the tabContainer
      this.tabInfo.splice(aIndex, 0, tab);
      this.tabContainer.insertBefore(
        tabNode,
        this.tabContainer.allTabs[aIndex]
      );
      // Now it's getting a bit ugly, as tabModes stores redundant
      // information we need to get it in sync with tabInfo.
      //
      // As tabModes.tabs is a subset of tabInfo, every tab can be mapped
      // to a tabInfo index. So we check for each tab in tabModes if it is
      // directly in front of our moved tab. We do this by looking up the
      // index in tabInfo and compare it with the moved tab's index. If we
      // found our tab, we insert the moved tab directly behind into tabModes
      // In case find no tab we simply append it
      let modeIdx = tab.mode.tabs.length + 1;
      for (let i = 0; i < tab.mode.tabs.length; i++) {
        if (this.tabInfo.indexOf(tab.mode.tabs[i]) < aIndex) {
          continue;
        }
        modeIdx = i;
        break;
      }

      tab.mode.tabs.splice(modeIdx, 0, tab);
      const evt = new CustomEvent("TabMove", {
        bubbles: true,
        view: window,
        detail: { idx: oldIdx, tabInfo: tab },
      });
      tabNode.dispatchEvent(evt);

      return aIndex;
    }

    // Returns null in case persist fails.
    persistTab(tab) {
      const persistFunc = tab.mode.persistTab || tab.mode.tabType.persistTab;
      // if we can't restore the tab we can't move it
      if (!persistFunc) {
        return null;
      }

      //  If there is a non-null tab-state, then persisting succeeded and
      //  we should store it.  We store the tab's persisted state in its
      //  own distinct object rather than mixing things up in a dictionary
      //  to avoid bugs and because we may eventually let extensions store
      //  per-tab information in the persisted state.
      let tabState;
      // Wrap this in an exception handler so that if the persistence
      // logic fails, things like tab closure still run to completion.
      try {
        tabState = persistFunc.call(tab.mode.tabType, tab);
      } catch (ex) {
        // Report this so that our unit testing framework sees this
        // error and (extension) developers likewise can see when their
        // extensions are ill-behaved.
        console.error(ex);
      }

      if (!tabState) {
        return null;
      }

      const ext = {};
      for (const tabMonitor of this.tabMonitors) {
        try {
          if ("onTabPersist" in tabMonitor) {
            const monState = tabMonitor.onTabPersist(tab);
            if (monState !== null) {
              ext[tabMonitor.monitorName] = monState;
            }
          }
        } catch (ex) {
          console.error(ex);
        }
      }

      return { mode: tab.mode.name, state: tabState, ext };
    }

    /**
     * Persist the state of all tab modes implementing persistTab methods
     *  to a JSON-serializable object representation and return it.  Call
     *  restoreTabs with the result to restore the tab state.
     * Calling this method should have no side effects; tabs will not be
     *  closed, displays will not change, etc.  This means the method is
     *  safe to use in an auto-save style so that if we crash we can
     *  restore the (approximate) state at the time of the crash.
     *
     * @returns {object} The persisted tab states.
     */
    persistTabs() {
      const state = {
        // Explicitly specify a revision so we don't wish we had later.
        rev: 0,
        // If our currently selected tab gets persisted, we will update this
        selectedIndex: null,
      };

      const tabs = (state.tabs = []);
      for (const [iTab, tab] of this.tabInfo.entries()) {
        const persistTab = this.persistTab(tab);
        if (!persistTab) {
          continue;
        }
        tabs.push(persistTab);
        // Mark this persisted tab as selected
        if (iTab == this.tabContainer.selectedIndex) {
          state.selectedIndex = tabs.length - 1;
        }
      }

      return state;
    }

    restoreTab(aState) {
      // Migrate old mail tabs to new mail tabs. This can be removed after ESR 115.
      if (aState.mode == "folder") {
        aState.mode = "mail3PaneTab";
      } else if (aState.mode == "message") {
        aState.mode = "mailMessageTab";
      }

      // if we no longer know about the mode, we can't restore the tab
      const mode = this.tabModes[aState.mode];
      if (!mode) {
        this.unrestoredTabs.push(aState);
        return false;
      }

      const restoreFunc = mode.restoreTab || mode.tabType.restoreTab;
      if (!restoreFunc) {
        return false;
      }

      // normalize the state to have an ext attribute if it does not.
      if (!("ext" in aState)) {
        aState.ext = {};
      }

      this._restoringTabState = aState;
      restoreFunc.call(mode.tabType, this, aState.state);
      this._restoringTabState = null;

      return true;
    }

    /**
     * Attempts to restore tabs persisted from a prior call to
     * |persistTabs|. This is currently a synchronous operation, but in
     * the future this may kick off an asynchronous mechanism to restore
     * the tabs one-by-one.
     */
    restoreTabs(aPersistedState, aDontRestoreFirstTab) {
      const tabs = aPersistedState.tabs;
      let indexToSelect = null;

      for (const [iTab, tabState] of tabs.entries()) {
        if (tabState.state.firstTab && aDontRestoreFirstTab) {
          tabState.state.dontRestoreFirstTab = aDontRestoreFirstTab;
        }

        if (!this.restoreTab(tabState)) {
          continue;
        }

        // If this persisted tab was the selected one, then mark the newest
        //  tab as the guy to select.
        if (iTab == aPersistedState.selectedIndex) {
          indexToSelect = this.tabInfo.length - 1;
        }
      }

      if (indexToSelect != null && !aDontRestoreFirstTab) {
        this.tabContainer.selectedIndex = indexToSelect;
      } else {
        this.tabContainer.selectedIndex = 0;
      }

      if (
        this.tabContainer.allTabs.length == 1 &&
        this.tabContainer.mAutoHide
      ) {
        this.tabContainer.mCollapseToolbar.collapsed = true;
        document.documentElement.setAttribute("tabbarhidden", "true");
      }
    }

    clearRecentlyClosedTabs() {
      this.recentlyClosedTabs.length = 0;
    }
    /**
     * Called when the window is being unloaded, this calls the close
     * function for every tab.
     */
    _teardown() {
      for (var i = 0; i < this.tabInfo.length; i++) {
        const tab = this.tabInfo[i];
        const tabCloseFunc = tab.mode.closeTab || tab.mode.tabType.closeTab;
        tabCloseFunc.call(tab.mode.tabType, tab);
      }
    }

    /**
     * The content window of the current tab, if it is a 3-pane tab.
     *
     * @type {?Window}
     */
    get currentAbout3Pane() {
      if (this.currentTabInfo.mode.name == "mail3PaneTab") {
        return this.currentTabInfo.chromeBrowser.contentWindow;
      }
      return null;
    }

    /**
     * The content window of the current tab, if it is a message tab, OR if it
     * is a 3-pane tab, the content window of the message browser within.
     *
     * @type {?Window}
     */
    get currentAboutMessage() {
      switch (this.currentTabInfo.mode.name) {
        case "mail3PaneTab": {
          const messageBrowser = this.currentAbout3Pane.messageBrowser;
          return messageBrowser && !messageBrowser.hidden
            ? messageBrowser.contentWindow
            : null;
        }
        case "mailMessageTab":
          return this.currentTabInfo.chromeBrowser.contentWindow;
        default:
          return null;
      }
    }

    /**
     * getBrowserForSelectedTab is required as some toolkit functions
     * require a getBrowser() function.
     */
    getBrowserForSelectedTab() {
      if (!this.tabInfo) {
        return null;
      }

      if (!this.currentTabInfo) {
        this.currentTabInfo = this.tabInfo[0];
      }

      if (this.currentTabInfo) {
        return this.getBrowserForTab(this.currentTabInfo);
      }

      return null;
    }

    getBrowserForTab(aTab) {
      const browserFunc = aTab
        ? aTab.mode.getBrowser || aTab.mode.tabType.getBrowser
        : null;
      return browserFunc ? browserFunc.call(aTab.mode.tabType, aTab) : null;
    }

    /**
     * getBrowserForDocument is used to find the browser for a specific
     * document that's been loaded
     */
    getBrowserForDocument(aDocument) {
      for (let i = 0; i < this.tabInfo.length; ++i) {
        const browserFunc =
          this.tabInfo[i].mode.getBrowser ||
          this.tabInfo[i].mode.tabType.getBrowser;

        if (browserFunc) {
          const possBrowser = browserFunc.call(
            this.tabInfo[i].mode.tabType,
            this.tabInfo[i]
          );
          if (possBrowser && possBrowser.contentWindow == aDocument) {
            return this.tabInfo[i];
          }
        }
      }

      return null;
    }

    getTabForBrowser(aBrowser) {
      // Check the selected browser first, since that's the most likely.
      if (this.getBrowserForSelectedTab() == aBrowser) {
        return this.currentTabInfo;
      }
      for (const tabInfo of this.tabInfo) {
        if (this.getBrowserForTab(tabInfo) == aBrowser) {
          return tabInfo;
        }
      }
      return null;
    }

    removeCurrentTab() {
      this.removeTabByNode(
        this.tabContainer.allTabs[this.tabContainer.selectedIndex]
      );
    }

    switchToTab(aTabIndexNodeOrInfo) {
      const [iTab] = this._getTabContextForTabbyThing(
        aTabIndexNodeOrInfo,
        false
      );
      this.tabContainer.selectedIndex = iTab;
    }

    /**
     * Finds the active element and stores it on `tabInfo` for restoring focus
     * when this tab next becomes active.
     *
     * @param {object} tabInfo
     */
    rememberLastActiveElement(tabInfo) {
      // Check for anything inside tabmail-container rather than the panel
      // because focus could be in the Today Pane.
      let activeElement = document.activeElement;
      const container = document.getElementById("tabmail-container");
      if (container.contains(activeElement)) {
        while (activeElement.localName == "browser") {
          const next = activeElement.contentDocument?.activeElement;
          if (!next || next.localName == "body") {
            break;
          }
          activeElement = next;
        }
        // If the active element is inside a container, store the container
        // instead of the element, so that `.focus()` returns focus to the
        // right place.
        tabInfo.lastActiveElement =
          activeElement.closest("[aria-activedescendant]") ?? activeElement;
        Services.focus.clearFocus(window);
      } else {
        delete tabInfo.lastActiveElement;
      }
    }

    /**
     * UpdateCurrentTab - called in response to changing the current tab.
     */
    updateCurrentTab() {
      if (
        this.currentTabInfo != this.tabInfo[this.tabContainer.selectedIndex]
      ) {
        if (this.currentTabInfo) {
          this.saveCurrentTabState();
        }

        const oldTab = this.currentTabInfo;
        const oldPanel = [...this.panelContainer.children].find(p =>
          p.hasAttribute("selected")
        );
        const tab = (this.currentTabInfo =
          this.tabInfo[this.tabContainer.selectedIndex]);
        // Update the selected attribute on the current and old tab panel.
        if (oldPanel) {
          this.rememberLastActiveElement(oldTab);
          oldPanel.removeAttribute("selected");
          if (oldTab.chromeBrowser) {
            oldTab.chromeBrowser.docShellIsActive = false;
          }
        }

        this.panelContainer.selectedPanel.setAttribute("selected", "true");
        const showTabFunc = tab.mode.showTab || tab.mode.tabType.showTab;
        showTabFunc.call(tab.mode.tabType, tab);
        if (tab.chromeBrowser) {
          tab.chromeBrowser.docShellIsActive = true;
        }

        const browser = this.getBrowserForTab(tab);
        if (browser && !tab.browser) {
          tab.browser = browser;
          if (!tab.linkedBrowser) {
            tab.linkedBrowser = browser;
          }
        }

        for (const tabMonitor of this.tabMonitors) {
          try {
            tabMonitor.onTabSwitched(tab, oldTab);
          } catch (ex) {
            console.error(ex);
          }
        }

        // always update the cursor status when we switch tabs
        SetBusyCursor(window, tab.busy);
        // active tabs should not have the wasBusy attribute
        this.tabContainer.selectedItem.removeAttribute("wasBusy");
        // update the thinking status when we switch tabs
        this._setActiveThinkingState(tab.thinking);
        // active tabs should not have the wasThinking attribute
        this.tabContainer.selectedItem.removeAttribute("wasThinking");
        this.setDocumentTitle(tab);

        // We switched tabs, so we don't need to know the last tab
        // opener anymore.
        this.mLastTabOpener = null;

        // Try to set focus where it was when the tab was last selected.
        this.panelContainer.selectedPanel.focus();
        if (tab.lastActiveElement) {
          tab.lastActiveElement.focus();
          delete tab.lastActiveElement;
        }

        const evt = new CustomEvent("TabSelect", {
          bubbles: true,
          detail: {
            tabInfo: tab,
            previousTabInfo: oldTab,
          },
        });
        this.tabContainer.selectedItem.dispatchEvent(evt);
      }
    }

    saveCurrentTabState() {
      if (!this.currentTabInfo) {
        this.currentTabInfo = this.tabInfo[0];
      }

      const tab = this.currentTabInfo;
      // save the old tab state before we change the current tab
      const saveTabFunc =
        tab.mode.saveTabState || tab.mode.tabType.saveTabState;
      saveTabFunc.call(tab.mode.tabType, tab);
    }

    setTabTitle(aTabNodeOrInfo) {
      const [iTab, tab] = this._getTabContextForTabbyThing(
        aTabNodeOrInfo,
        true
      );
      if (tab) {
        const tabNode = this.tabContainer.allTabs[iTab];
        const titleChangeFunc =
          tab.mode.onTitleChanged || tab.mode.tabType.onTitleChanged;
        if (titleChangeFunc) {
          titleChangeFunc.call(tab.mode.tabType, tab, tabNode);
        }

        const defaultTabTitle =
          document.documentElement.getAttribute("defaultTabTitle");
        const oldLabel = tabNode.getAttribute("label");
        const newLabel = aTabNodeOrInfo ? tab.title : defaultTabTitle;
        if (oldLabel == newLabel) {
          return;
        }

        for (const tabMonitor of this.tabMonitors) {
          try {
            tabMonitor.onTabTitleChanged(tab);
          } catch (ex) {
            console.error(ex);
          }
        }

        // If the displayed tab is the one at the moment of creation
        // (aTabNodeOrInfo is null), set the default title as its title.
        tabNode.setAttribute("label", newLabel);
        // Update the window title if we're the displayed tab.
        if (iTab == this.tabContainer.selectedIndex) {
          this.setDocumentTitle(tab);
        }

        // Notify tab title change
        if (!tab.beforeTabOpen) {
          const evt = new CustomEvent("TabAttrModified", {
            bubbles: true,
            cancelable: false,
            detail: { changed: ["label"], tabInfo: tab },
          });
          tabNode.dispatchEvent(evt);
        }
      }
    }

    /**
     * Set the favIconUrl for the given tab and display it as the tab's icon.
     * If the given favicon is missing or loads with an error, a fallback icon
     * will be displayed instead.
     *
     * Note that the new favIconUrl is reported to the extension API's
     * tabs.onUpdated.
     *
     * @param {object} tabInfo - The tabInfo object for the tab.
     * @param {string|null} favIconUrl - The favIconUrl to set for the given
     *   tab.
     * @param {string} fallbackSrc - The fallback icon src to display in case
     *   of missing or broken favicons.
     */
    setTabFavIcon(tabInfo, favIconUrl, fallbackSrc) {
      const prevUrl = tabInfo.favIconUrl;
      // The favIconUrl value is used by the TabmailTab _favIconUrl getter,
      // which is used by the tab wrapper in the TabAttrModified callback.
      tabInfo.favIconUrl = favIconUrl;
      // NOTE: we always report the given favIconUrl, rather than the icon that
      // is used in the tab. In particular, if the favIconUrl is null, we pass
      // null rather than the fallbackIcon that is displayed.
      if (favIconUrl != prevUrl && !tabInfo.beforeTabOpen) {
        const evt = new CustomEvent("TabAttrModified", {
          bubbles: true,
          cancelable: false,
          detail: { changed: ["favIconUrl"], tabInfo },
        });
        tabInfo.tabNode.dispatchEvent(evt);
      }

      tabInfo.tabNode.setIcon(favIconUrl, fallbackSrc);
    }

    /**
     * Updates the global state to reflect the active tab's thinking
     * state (which the caller provides).
     */
    _setActiveThinkingState(aThinkingState) {
      if (aThinkingState) {
        statusFeedback.showProgress(0);
        if (typeof aThinkingState == "string") {
          statusFeedback.showStatusString(aThinkingState);
        }
      } else {
        statusFeedback.showProgress(0);
      }
    }

    setTabThinking(aTabNodeOrInfo, aThinking) {
      const [iTab, tab, tabNode] = this._getTabContextForTabbyThing(
        aTabNodeOrInfo,
        false
      );
      const isSelected = iTab == this.tabContainer.selectedIndex;
      // if we are the current tab, update the cursor
      if (isSelected) {
        this._setActiveThinkingState(aThinking);
      }

      // if we are busy, hint our tab
      if (aThinking) {
        tabNode.setAttribute("thinking", "true");
      } else {
        // if we were thinking and are not selected, set the
        //  "wasThinking" attribute.
        if (tab.thinking && !isSelected) {
          tabNode.setAttribute("wasThinking", "true");
        }
        tabNode.removeAttribute("thinking");
      }

      // update the tab info to store the busy state.
      tab.thinking = aThinking;
    }

    setTabBusy(aTabNodeOrInfo, aBusy) {
      const [iTab, tab, tabNode] = this._getTabContextForTabbyThing(
        aTabNodeOrInfo,
        false
      );
      const isSelected = iTab == this.tabContainer.selectedIndex;

      // if we are the current tab, update the cursor
      if (isSelected) {
        SetBusyCursor(window, aBusy);
      }

      // if we are busy, hint our tab
      if (aBusy) {
        tabNode.setAttribute("busy", "true");
      } else {
        // if we were busy and are not selected, set the
        //  "wasBusy" attribute.
        if (tab.busy && !isSelected) {
          tabNode.setAttribute("wasBusy", "true");
        }
        tabNode.removeAttribute("busy");
      }

      // update the tab info to store the busy state.
      tab.busy = aBusy;
    }

    /**
     * Set the document title based on the tab title
     */
    setDocumentTitle(aTab = this.selectedTab) {
      let docTitle = aTab.title ? aTab.title.trim() : "";
      const docElement = document.documentElement;
      // If the document title is blank, add the default title.
      if (!docTitle) {
        docTitle = docElement.getAttribute("defaultTabTitle");
      }

      if (docElement.hasAttribute("titlepreface")) {
        docTitle = docElement.getAttribute("titlepreface") + docTitle;
      }

      // If we're on Mac, don't display the separator and the modifier.
      if (AppConstants.platform != "macosx") {
        docTitle +=
          docElement.getAttribute("titlemenuseparator") +
          docElement.getAttribute("titlemodifier");
      }

      document.title = docTitle;
    }

    // Called by <browser>, unused by tabmail.
    finishBrowserRemotenessChange(browser, loadSwitchId) {}

    /**
     * Returns the find bar for a tab.
     */
    getCachedFindBar(tab = this.selectedTab) {
      return tab.findbar ?? null;
    }

    /**
     * Implementation of gBrowser's lazy-loaded find bar. We don't lazily load
     * the find bar, and some of our tabs don't have a find bar.
     */
    async getFindBar(tab = this.selectedTab) {
      return tab.findbar ?? null;
    }

    disconnectedCallback() {
      window.controllers.removeController(this.tabController);
    }
  }

  customElements.define("tabmail", MozTabmail);
}

/**
 * Refresh the contents of the recently closed tags popup menu/panel.
 * Used for example for appmenu/Go/Recently_Closed_Tabs panel.
 *
 * @param {Element} parent - Parent element that will contain the menu items.
 * @param {string} [elementName] - Type of menu item, e.g. "menuitem", "toolbarbutton".
 * @param {string} [classes] - Classes to set on the menu items.
 * @param {string} [separatorName] - Type of separator, e.g. "menuseparator", "toolbarseparator".
 */
function InitRecentlyClosedTabsPopup(
  parent,
  elementName = "menuitem",
  classes,
  separatorName = "menuseparator"
) {
  const tabs = document.getElementById("tabmail").recentlyClosedTabs;

  // Show Popup only when there are restorable tabs.
  if (!tabs.length) {
    return false;
  }

  // Clear the list.
  while (parent.hasChildNodes()) {
    parent.lastChild.remove();
  }

  // Insert menu items to rebuild the recently closed tab list.
  tabs.forEach((tab, index) => {
    const item = document.createXULElement(elementName);
    item.setAttribute("label", tab.title);
    item.setAttribute(
      "oncommand",
      `document.getElementById("tabmail").undoCloseTab(${index});`
    );
    if (classes) {
      item.setAttribute("class", classes);
    }

    if (index == 0) {
      item.setAttribute("key", "key_undoCloseTab");
    }
    parent.appendChild(item);
  });

  // Only show "Restore All Tabs" if there is more than one tab to restore.
  if (tabs.length > 1) {
    parent.appendChild(document.createXULElement(separatorName));

    const item = document.createXULElement(elementName);
    item.setAttribute(
      "label",
      document.getElementById("bundle_messenger").getString("restoreAllTabs")
    );

    item.addEventListener("command", () => {
      const tabmail = document.getElementById("tabmail");
      let len = tabmail.recentlyClosedTabs.length;
      while (len--) {
        document.getElementById("tabmail").undoCloseTab();
      }
    });

    if (classes) {
      item.setAttribute("class", classes);
    }
    parent.appendChild(item);
  }

  return true;
}

// Set up the tabContextMenu, which is used as the context menu for all tabmail
// tabs.
window.addEventListener(
  "DOMContentLoaded",
  () => {
    const tabmail = document.getElementById("tabmail");
    const tabMenu = document.getElementById("tabContextMenu");

    const openInWindowItem = document.getElementById(
      "tabContextMenuOpenInWindow"
    );
    const closeOtherTabsItem = document.getElementById(
      "tabContextMenuCloseOtherTabs"
    );
    const recentlyClosedMenu = document.getElementById(
      "tabContextMenuRecentlyClosed"
    );
    const closeItem = document.getElementById("tabContextMenuClose");

    // Shared variable: the tabNode that was activated to open the context menu.
    let currentTabInfo = null;

    tabMenu.addEventListener("popupshowing", () => {
      const tabNode = tabMenu.triggerNode?.closest("tab");

      // this happens when the user did not actually-click on a tab but
      // instead on the strip behind it.
      if (!tabNode) {
        currentTabInfo = null;
        return false;
      }

      currentTabInfo = tabmail.tabInfo.find(info => info.tabNode == tabNode);
      openInWindowItem.setAttribute(
        "disabled",
        currentTabInfo.canClose && tabmail.persistTab(currentTabInfo)
      );
      closeOtherTabsItem.setAttribute(
        "disabled",
        tabmail.tabInfo.every(info => info == currentTabInfo || !info.canClose)
      );
      recentlyClosedMenu.setAttribute(
        "disabled",
        !tabmail.recentlyClosedTabs.length
      );
      closeItem.setAttribute("disabled", !currentTabInfo.canClose);
      return true;
    });

    // Tidy up.
    tabMenu.addEventListener("popuphidden", () => {
      currentTabInfo = null;
    });

    openInWindowItem.addEventListener("command", () => {
      tabmail.replaceTabWithWindow(currentTabInfo);
    });
    closeOtherTabsItem.addEventListener("command", () => {
      tabmail.closeOtherTabs(currentTabInfo);
    });
    closeItem.addEventListener("command", () => {
      tabmail.closeTab(currentTabInfo);
    });

    const recentlyClosedPopup = recentlyClosedMenu.querySelector("menupopup");
    recentlyClosedPopup.addEventListener("popupshowing", () =>
      InitRecentlyClosedTabsPopup(recentlyClosedPopup)
    );

    // Register the tabmail window font size only after everything else loaded.
    UIFontSize.registerWindow(window);
  },
  { once: true }
);
