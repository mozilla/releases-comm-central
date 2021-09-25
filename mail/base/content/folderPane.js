/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Implements a tree of folders. It shows icons depending on folder type
// and other fancy styling.
// This is used in the main folder pane, but also some dialogs that need
// to show a nice list of folders.

/* import-globals-from commandglue.js */
/* import-globals-from folderDisplay.js */
/* import-globals-from mailWindow.js */

var {
  getFolderProperties,
  allAccountsSorted,
  getMostRecentFolders,
  folderNameCompare,
} = ChromeUtils.import("resource:///modules/folderUtils.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");
var { FeedUtils } = ChromeUtils.import("resource:///modules/FeedUtils.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

if (typeof FeedMessageHandler != "object") {
  Services.scriptloader.loadSubScript(
    "chrome://messenger-newsblog/content/newsblogOverlay.js"
  );
}

var kDefaultMode = "all";

/**
 * This file contains the controls and functions for the folder pane.
 * The following definitions will be useful to know:
 *
 * gFolderTreeView - the controller for the folder tree.
 * FtvItem  - folder tree view item, representing a row in the tree
 * mode - folder view type, e.g., all folders, favorite folders, MRU...
 */

/**
 * An interface that needs to be implemented in order to add a new view to the
 * folder tree. For default behavior, it is recommended that implementers
 * subclass this interface instead of relying on duck typing.
 *
 * For implementation examples, see |gFolderTreeView._modes|. For how to
 * register this mode with |gFolderTreeView|, see
 * |gFolderTreeView.registerFolderTreeMode|.
 */
var IFolderTreeMode = {
  /**
   * Generates the folder map for this mode.
   *
   * @param aFolderTreeView The gFolderTreeView for which this mode is being
   *     activated.
   *
   * @returns An array containing FtvItem instances representing the top-level
   *     folders in this view.
   */
  generateMap(aFolderTreeView) {
    return null;
  },

  /**
   * Given an nsIMsgFolder, returns its parent in the map. The default behaviour
   * is to return the folder's actual parent (aFolder.parent). Folder tree modes
   * may decide to override it.
   *
   * If the parent isn't easily computable given just the folder, you may
   * consider generating the entire FtvItem tree at once and using a map from
   * folders to FtvItems.
   *
   * @returns an nsIMsgFolder representing the parent of the folder in the view,
   *     or null if the folder is a top-level folder in the map. It is expected
   *     that the returned parent will have the given folder as one of its
   *     children.
   * @note This function need not guarantee that either the folder or its parent
   *       is actually in the view.
   */
  getParentOfFolder(aFolder) {
    return aFolder.parent;
  },

  /**
   * Given an nsIMsgDBHdr, returns the folder it is considered to be contained
   * in, in this mode. This is usually just the physical folder it is contained
   * in (aMsgHdr.folder), but some modes may decide to override this. For
   * example, combined views like Smart Folders return the smart inbox for any
   * messages in any inbox.
   *
   * The folder returned doesn't need to be in the view.

   * @returns The folder the message header is considered to be contained in, in
   *     this mode. The returned folder may or may not actually be in the view
   *     -- however, given a valid nsIMsgDBHdr, it is expected that a) a
   *     non-null folder is returned, and that b) the folder that is returned
   *     actually does contain the message header.
   */
  getFolderForMsgHdr(aMsgHdr) {
    return aMsgHdr.folder;
  },

  /**
   * Notified when a folder is added. The default behavior is to add it as a
   * child of the parent item, but some views may decide to override this. For
   * example, combined views like Smart Folders add any new inbox as a child of
   * the smart inbox.
   *
   * @param aParent The parent of the folder that was added.
   * @param aFolder The folder that was added.
   */
  onFolderAdded(aParent, aFolder) {
    gFolderTreeView.addFolder(aParent, aFolder);
  },

  /**
   * Notified when a folder int property is changed.
   *
   * Returns true if the event was processed inside the function and no further
   * default handling should be done in the caller. Otherwise false.
   *
   * @param aItem      The folder with a change.
   * @param aProperty  The changed property string.
   * @param aOld       The old value of the property.
   * @param aNew       The new value of the property.
   */
  handleChangedIntProperty(aItem, aProperty, aOld, aNew) {
    return false;
  },
};

/**
 * This is our controller for the folder-tree. It includes our nsITreeView
 * implementation, as well as other control functions.
 */
var gFolderTreeView = {
  // Keep track of the initialization status of the folder tree.
  isInited: false,
  messengerBundle: null,

  /**
   * Called when the window is initially loaded. This function initializes the
   * folder-pane to the view last shown before the application was closed.
   * @param {XULTreeElement} aTree - the tree to load
   * @param {string} [aJSONFile] - name of JSON file to load data from.
   */
  async load(aTree, aJSONFile = null) {
    if (this.isInited) {
      return;
    }

    this._treeElement = aTree;
    this.messengerBundle = document.getElementById("bundle_messenger");
    this.folderColorStyle = document.getElementById("folderColorsStyle");
    this.folderColorPreview = document.getElementById(
      "folderColorsStylePreview"
    );

    // The folder pane can be used for other trees which may not have these
    // elements. Collapse them if no account is currently available.
    let hasAccounts = MailServices.accounts.accounts.length > 0;
    if (document.getElementById("folderpane_splitter")) {
      document.getElementById("folderpane_splitter").collapsed = !hasAccounts;
      document
        .getElementById("folderpane_splitter")
        .setAttribute("state", hasAccounts ? "open" : "collapsed");
    }
    if (document.getElementById("folderPaneBox")) {
      document.getElementById("folderPaneBox").collapsed = !hasAccounts;
    }

    if (aJSONFile) {
      // Parse our persistent-state json file
      let spec = PathUtils.join(
        Services.dirsvc.get("ProfD", Ci.nsIFile).path,
        aJSONFile
      );
      try {
        let data = await IOUtils.readJSON(spec);
        // Migrate all the data from the old stored object if the "open"
        // object doesn't exist.
        this._persistOpenMap = data.open || data;
        this._persistColorMap = data.colors;
      } catch (ex) {
        if (!["NotFoundError"].includes(ex.name)) {
          Cu.reportError(
            gFolderTreeView.messengerBundle.getFormattedString(
              "failedToReadFile",
              [aJSONFile, ex]
            )
          );
        }
      }
    }

    // Load our data
    this._rebuild();
    // And actually draw the tree
    aTree.view = this;

    this.toggleCols(true);
    gFolderStatsHelpers.init();

    // Add this listener so that we can update the tree when things change
    MailServices.mailSession.AddFolderListener(this, Ci.nsIFolderListener.all);

    // We did everything, now we can update the variable.
    this.isInited = true;
  },

  /**
   * Called when the window is being torn down. Here we undo everything we did
   * onload. That means removing our listener and serializing our JSON.
   * @param {string} [filename] - Name of the file to serialize to.
   */
  async unload(filename = null) {
    // Remove our listener
    MailServices.mailSession.RemoveFolderListener(this);

    // Update the JSON file only if we have a file, the folder tree was inited
    // and we have at least one available folder in order to avoid overriding
    // existing data in case the UI is broken on startup.
    if (filename && this.isInited && this.rowCount) {
      let data = {
        open: this._persistOpenMap,
        colors: this._persistColorMap,
      };
      let spec = PathUtils.join(
        Services.dirsvc.get("ProfD", Ci.nsIFile).path,
        filename
      );
      await IOUtils.writeJSON(spec, data);
    }
  },

  /**
   * Extensions can use this function to add a new mode to the folder pane.
   *
   * @param aCommonName  an internal name to identify this mode. Must be unique
   * @param aMode An implementation of |IFolderTreeMode| for this mode.
   * @param aDisplayName  a localized name for this mode
   */
  registerFolderTreeMode(aCommonName, aMode, aDisplayName) {
    this._modeNames.push(aCommonName);
    this._modes[aCommonName] = aMode;
    this._modeDisplayNames[aCommonName] = aDisplayName;
  },

  /**
   * Unregisters a previously registered mode. Since common-names must be unique
   * this is all that need be provided to unregister.
   * @param aCommonName  the common-name with which the mode was previously
   *                     registered
   */
  unregisterFolderTreeMode(aCommonName) {
    this._modeNames.splice(this._modeNames.indexOf(aCommonName), 1);
    delete this._modes[aCommonName];
    delete this._modeDisplayNames[aCommonName];

    // If this mode is currently used, assign it again and the setter will take
    // care of removing it and reloading the folder tree.
    if (this._activeModes.includes(aCommonName)) {
      this._activeModes = aCommonName;
    }
  },

  /**
   * Retrieves a specific mode object
   * @param aCommonName  the common-name with which the mode was previously
   *                     registered
   */
  getFolderTreeMode(aCommonName) {
    return this._modes[aCommonName];
  },

  /**
   * If the hidden pref is set, then double-clicking on a folder should open it
   *
   * @param event  the double-click event
   */
  onDoubleClick(aEvent) {
    if (
      aEvent.button != 0 ||
      aEvent.target.localName == "twisty" ||
      aEvent.target.localName == "slider" ||
      aEvent.target.localName == "scrollbarbutton"
    ) {
      return;
    }

    let row = gFolderTreeView._treeElement.getRowAt(
      aEvent.clientX,
      aEvent.clientY
    );
    let folderItem = gFolderTreeView._rowMap[row];
    if (folderItem && !folderItem.mode) {
      folderItem.command();
    }

    // Don't let the double-click toggle the open state of the folder here
    aEvent.stopPropagation();
  },

  getFolderAtCoords(aX, aY) {
    let row = gFolderTreeView._treeElement.getRowAt(aX, aY);
    if (row in gFolderTreeView._rowMap) {
      return gFolderTreeView._rowMap[row]._folder;
    }
    return null;
  },

  /**
   * Toggle displaying the headers of columns in the folder pane.
   * @param aSetup  Set to true if the columns should be set up according
   *                to the pref, not toggle them.
   */
  toggleCols(aSetup = false) {
    if (this._treeElement.getAttribute("simplelist") == "true") {
      return;
    }
    let hide = Services.prefs.getBoolPref("mail.folderpane.showColumns");
    if (aSetup) {
      hide = !hide;
    }
    this._treeElement.setAttribute("hidecolumnpicker", hide ? "true" : "false");
    for (let columnName of [
      "folderNameCol",
      "folderUnreadCol",
      "folderTotalCol",
      "folderSizeCol",
    ]) {
      let column = document.getElementById(columnName);
      if (!column) {
        continue;
      }
      if (hide) {
        column.setAttribute("hideheader", "true");
        column.removeAttribute("label");
        if (columnName != "folderNameCol") {
          if (!aSetup) {
            // If user hides the columns store their visible state in a special attribute
            // that is persisted by XUL.
            column.setAttribute("hiddeninactive", column.hidden);
          }
          column.setAttribute("hidden", "true");
        }
      } else {
        column.setAttribute("label", column.getAttribute("label2"));
        column.setAttribute("hideheader", "false");
        if (!aSetup) {
          // If user unhides the columns restore their visible state
          // from our special attribute.
          if (column.hasAttribute("hiddeninactive")) {
            let state = column.getAttribute("hiddeninactive");
            column.setAttribute("hidden", state);
          } else if (columnName == "folderTotalCol") {
            // If there was no hiddeninactive attribute set, that means this is
            // our first showing of the folder pane columns. Show the TotalCol
            // as a sample so the user notices what is happening.
            column.setAttribute("hidden", "false");
          }
        }
      }
    }

    if (!aSetup) {
      Services.prefs.setBoolPref("mail.folderpane.showColumns", !hide);
    }
  },

  /**
   * An array representing the currently visible display-modes. Each value here
   * must correspond to an entry in _modeNames.
   */
  _activeModes: [],
  get activeModes() {
    if (!this._activeModes.length) {
      let modes = this._treeElement.getAttribute("mode").split(",");
      // Remove duplicate modes.
      modes = modes.filter((c, index) => {
        return modes.indexOf(c) === index;
      });

      // Transition from the pre Thunderbird 86 "*_compact" folder modes.
      // This might be dropped in the future after the next ESR if deemed safe.
      modes = modes.map(mode => {
        if (mode.includes("_compact")) {
          mode = mode.split("_")[0];
          this._treeElement.setAttribute("compact", "true");
        }
        return mode;
      });

      // Exclude non-existing modes from the activeModes array. This can happen
      // when an extension is removed.
      this._activeModes = modes.filter(mode => this._modeNames.includes(mode));

      // If we end up with an empty array, add the default mode.
      if (!this._activeModes.length) {
        this._activeModes.push(kDefaultMode);
        this._updateMenuItems(kDefaultMode);
      }
    }

    return this._activeModes;
  },

  /**
   * The _activeModes setter.
   *
   * @param mode - The name of the mode to add or remove.
   */
  set activeModes(mode) {
    // Ignore unknown modes.
    if (!(mode in this._modes)) {
      return;
    }

    if (this._activeModes.includes(mode)) {
      let pos = this._activeModes.indexOf(mode);
      this._activeModes.splice(pos, 1);
    } else {
      this._activeModes.push(mode);
    }

    // Remove modes that don't exist anymore. This might happen if an extension
    // is disabled since we don't require a full restart.
    this._activeModes = this._activeModes.filter(mode => mode in this._modes);

    // Store the current mode as a tree attribute.
    this._treeElement.setAttribute("mode", this._activeModes);
    // Build the folder pane.
    this._rebuild();
    this._updateMenuItems(mode);
  },

  /**
   * Update all the menu items listing the currently selected mode in order to
   * update the UI everywhere regardless from where the change was triggered.
   *
   * @param {string} mode - The toggled mode.
   */
  _updateMenuItems(mode) {
    // Check if the clicked mode is currently active.
    let isActive = this._activeModes.includes(mode);
    // Check if only the All Folders mode is currently active.
    let isDefault =
      this._activeModes.includes(kDefaultMode) && this._activeModes.length == 1;

    // Update the main App Menu.
    let appPanelItem = document.getElementById(`appmenu_${mode}Folders`);
    if (appPanelItem) {
      appPanelItem.checked = isActive;
    }
    document.getElementById("appmenu_allFolders").disabled = isDefault;

    // Update the main Menu Bar.
    let menuItem = document.getElementById(`menu_${mode}Folders`);
    if (menuItem) {
      menuItem.toggleAttribute("checked", isActive);
    }
    document.getElementById("menu_allFolders").disabled = isDefault;

    // Check if the currently active modes have a compact variation.
    let hasCompact = this._activeModes.find(
      mode => mode == "favorite" || mode == "unread"
    );
    // Update the compact items for both menus.
    let appPanelCompact = document.getElementById("appmenu_compactMode");
    let menuItemCompact = document.getElementById("menu_compactMode");
    appPanelCompact.disabled = !hasCompact;
    menuItemCompact.disabled = !hasCompact;
    // Uncheck the items only if we're disabling it.
    if (!hasCompact) {
      this.toggleCompactMode(false);
    }

    // Update the menupopup.
    let popup = document.getElementById("folderPaneOptionsPopup");
    // Interrupt if the popup has never been initialized.
    if (!popup.childNodes.length) {
      return;
    }

    if (isActive) {
      popup.querySelector(`[value="${mode}"]`).setAttribute("checked", "true");
    } else {
      popup.querySelector(`[value="${mode}"]`).removeAttribute("checked");
    }

    popup.querySelector(`[value="${kDefaultMode}"]`).disabled = isDefault;
    popup.querySelector(`[value="compact"]`).disabled = !hasCompact;
  },

  /**
   * Handle click and keypress events of the #folderPaneOptionsButton.
   */
  folderPaneOptionsButtonOnCommand(event) {
    document
      .getElementById("folderPaneOptionsPopup")
      .openPopup(event.target, "bottomcenter topright", 0, 0, false);
  },

  initFolderPaneOptionsPopup() {
    let popup = document.getElementById("folderPaneOptionsPopup");

    // Interrupt if the popup is already filled with menu items.
    if (popup.childNodes.length) {
      return;
    }

    // Loop through all the modes and create the necessary buttons.
    // Available modes: all, unread, favorite, smart, recent.
    for (let mode of this._modeNames) {
      let modeMenuitem = document.createXULElement("menuitem");
      modeMenuitem.setAttribute("type", "checkbox");
      modeMenuitem.setAttribute("value", mode);
      modeMenuitem.setAttribute("closemenu", "none");
      modeMenuitem.classList.add("subviewbutton", "subviewbutton-iconic");
      document.l10n.setAttributes(modeMenuitem, `show-${mode}-folders-label`);

      if (this.activeModes.includes(mode)) {
        modeMenuitem.setAttribute("checked", "true");

        // Disable the item if is the All Folders and only this mode is active.
        if (mode == kDefaultMode && this.activeModes.length == 1) {
          modeMenuitem.setAttribute("disabled", "true");
        }
      }

      modeMenuitem.addEventListener("command", event => {
        // Pass the mode value to the activeModes setter which will take care
        // of adding it or removing it if already in the array.
        this.activeModes = event.target.getAttribute("value");
      });

      popup.appendChild(modeMenuitem);
    }

    popup.appendChild(document.createXULElement("toolbarseparator"));

    // Create the "Compact View" toggle.
    let compactMenuitem = document.createXULElement("menuitem");
    compactMenuitem.setAttribute("type", "checkbox");
    compactMenuitem.setAttribute("value", "compact");
    compactMenuitem.setAttribute("closemenu", "none");
    compactMenuitem.classList.add("subviewbutton", "subviewbutton-iconic");
    document.l10n.setAttributes(
      compactMenuitem,
      "folder-toolbar-toggle-folder-compact-view"
    );

    if (gFolderTreeController._tree.getAttribute("compact") == "true") {
      compactMenuitem.setAttribute("checked", "true");
    }

    // Disable and uncheck the item if the currently active modes don't have a
    // compact variation.
    let hasCompact = this.activeModes.find(
      mode => mode == "favorite" || mode == "unread"
    );
    compactMenuitem.disabled = !hasCompact;
    // Keep the checked alteration inside this condition in order to enable and
    // disable the item without affecting the checked status.
    if (!hasCompact) {
      compactMenuitem.removeAttribute("checked");
    }

    compactMenuitem.addEventListener("command", () => {
      this.toggleCompactMode(compactMenuitem.getAttribute("checked") == "true");
    });
    popup.appendChild(compactMenuitem);

    // Create the "Hide Toolbar" toggle.
    let hideToolbarMenuitem = document.createXULElement("menuitem");
    hideToolbarMenuitem.classList.add("subviewbutton", "subviewbutton-iconic");
    document.l10n.setAttributes(
      hideToolbarMenuitem,
      "folder-toolbar-hide-toolbar-toolbarbutton"
    );
    hideToolbarMenuitem.addEventListener("command", () => {
      let toolbar = document.getElementById("folderPaneHeader");
      toolbar.setAttribute("collapsed", "true");
      Services.xulStore.persist(toolbar, "collapsed");
    });
    popup.appendChild(hideToolbarMenuitem);
  },

  /**
   * Pass the menuitem value to the activeModes setter. If the mode is already
   * active, the setter will take care of removing it.
   *
   * @param {Event} event - The DOM Event.
   */
  setFolderMode(event) {
    this.activeModes = event.target.value;
  },

  /**
   * Selects a given nsIMsgFolder in the tree.  This function will also ensure
   * that the folder is actually being displayed (that is, that none of its
   * ancestors are collapsed.
   *
   * @param aFolder  the nsIMsgFolder to select
   * @param [aForceSelect] Whether we should switch to the default mode to
   *      select the folder in case we didn't find the folder in the current
   *      view. Defaults to false.
   * @returns true if the folder selection was successful, false if it failed
   *     (probably because the folder isn't in the view at all)
   */
  selectFolder(aFolder, aForceSelect = false) {
    // "this" inside the nested function refers to the function...
    // Also note that openIfNot is recursive.
    let tree = this;
    let mode = this.getModeForIndex(this.getIndexOfFolder(aFolder));
    let folderTreeMode = this._modes[mode];

    function openIfNot(aFolderToOpen) {
      let index = tree.getIndexOfFolder(aFolderToOpen);
      if (index != null) {
        if (!tree._rowMap[index].open) {
          tree._toggleRow(index, false);
        }
        return true;
      }

      // not found, so open the parent
      let parent = folderTreeMode.getParentOfFolder(aFolderToOpen);
      if (parent && openIfNot(parent)) {
        // now our parent is open, so we can open ourselves
        index = tree.getIndexOfFolder(aFolderToOpen);
        if (index != null) {
          tree._toggleRow(index, false);
          return true;
        }
      }

      // No way we can find the folder now.
      return false;
    }

    // If the folder belongs to a currently active compact mode, return null
    // since this is a flat view and we don't have a parent folder.
    let parent =
      ["favorite", "unread"].includes(mode) &&
      gFolderTreeController._tree.getAttribute("compact") == "true"
        ? null
        : folderTreeMode.getParentOfFolder(aFolder);
    if (parent) {
      openIfNot(parent);
    }

    let folderIndex = tree.getIndexOfFolder(aFolder);
    if (folderIndex == null) {
      if (aForceSelect) {
        // Switch to the default mode. The assumption here is that the default
        // mode can display every folder
        this.activeModes = kDefaultMode;
        // We don't want to get stuck in an infinite recursion, so pass in false
        return this.selectFolder(aFolder, false);
      }

      return false;
    }

    this.selection.select(folderIndex);
    this._treeElement.ensureRowIsVisible(folderIndex);
    return true;
  },

  /**
   * Returns the index of a folder in the current display.
   *
   * @param aFolder  the folder whose index should be returned.
   * @returns The index of the folder in the view (a number).
   * @note If the folder is not in the display (perhaps because one of its
   *       anscetors is collapsed), this function returns null.
   */
  getIndexOfFolder(aFolder) {
    for (let [iRow, row] of this._rowMap.entries()) {
      if (row.id == aFolder.URI) {
        return iRow;
      }
    }
    return null;
  },

  /**
   * Returns the folder for an index in the current display.
   *
   * @param aIndex the index for which the folder should be returned.
   * @note If the index is out of bounds, this function returns null.
   */
  getFolderForIndex(aIndex) {
    if (aIndex < 0 || aIndex >= this._rowMap.length) {
      return null;
    }
    return this._rowMap[aIndex]._folder;
  },

  /**
   * Returns the parent of a folder in the current view. This may be, but is not
   * necessarily, the actual parent of the folder (aFolder.parent). In
   * particular, in the smart view, special folders are usually children of the
   * smart folder of that kind.
   *
   * @param {nsIMsgFolder} aFolder - The folder to get the parent of.
   * @param {string} index - The selected folder position.
   * @returns The parent of the folder, or null if the parent wasn't found.
   * @note This function does not guarantee that either the folder or its parent
   *       is actually in the view.
   */
  getParentOfFolder(aFolder, index) {
    let mode = this.getModeForIndex(index);

    // If the folder belongs to a currently active compact mode, return null
    // since this is a flat view and we don't have a parent folder.
    if (
      ["favorite", "unread"].includes(mode) &&
      gFolderTreeController._tree.getAttribute("compact") == "true"
    ) {
      return null;
    }

    return this._modes[mode].getParentOfFolder(aFolder);
  },

  /**
   * Given an nsIMsgDBHdr, returns the folder it is considered to be contained
   * in, in the current mode. This is usually, but not necessarily, the actual
   * folder the message is in (aMsgHdr.folder). For more details, see
   * |IFolderTreeMode.getFolderForMsgHdr|.
   */
  getFolderForMsgHdr(aMsgHdr) {
    let mode = this.getModeForIndex(this.getIndexOfFolder(aMsgHdr.folder));
    return this._modes[mode].getFolderForMsgHdr(aMsgHdr);
  },

  /**
   * Returns the |FtvItem| for an index in the current display. Intended for use
   * by folder tree mode implementers.
   *
   * @param aIndex The index for which the FtvItem should be returned.
   * @note If the index is out of bounds, this function returns null.
   */
  getFTVItemForIndex(aIndex) {
    return this._rowMap[aIndex];
  },

  /**
   * Returns the FtvItem mode of the currently selected folder or the currently
   * active mode if only one is available.
   *
   * @param {?string} index - The selected folder position or null.
   * @returns {string} - The FtvItem mode.
   */
  getModeForIndex(index) {
    // Return the first available mode if the user doesn't have more than one
    // mode currently visible, or the folder index is null.
    if (this.activeModes.length == 1 || index === null) {
      return this.activeModes[0];
    }

    // This is a bit brutal. Let's go up till we meet the modeHeader.
    // Start with a lower index to ignore the current folder.
    index--;
    while (!this._rowMap[index].mode) {
      index--;
    }

    return this._rowMap[index].mode;
  },

  /**
   * Returns an array of nsIMsgFolders corresponding to the current selection
   * in the tree
   */
  getSelectedFolders() {
    let selection = this.selection;
    if (!selection) {
      return [];
    }

    let folderArray = [];
    let rangeCount = selection.getRangeCount();
    for (let i = 0; i < rangeCount; i++) {
      let startIndex = {};
      let endIndex = {};
      selection.getRangeAt(i, startIndex, endIndex);
      for (let j = startIndex.value; j <= endIndex.value; j++) {
        let folder = gFolderTreeView.getFolderForIndex(j);
        // Header Modes don't have a folder, so we need to exclude it from the
        // selection array in case the user selects all tree items, or the
        // selection range includes a Mode Header.
        if (folder) {
          folderArray.push(folder);
        }
      }
    }
    return folderArray;
  },

  /**
   * Adds a new child |FtvItem| to the given parent |FtvItem|. Intended for use
   * by folder tree mode implementers.
   *
   * @param aParentItem The parent FtvItem. It is assumed that this is visible
   *     in the view.
   * @param aParentIndex The index of the parent FtvItem in the view.
   * @param aItem The item to add.
   */
  addChildItem(aParentItem, aParentIndex, aItem) {
    this._addChildToView(aParentItem, aParentIndex, aItem);
  },

  // ****************** Start of nsITreeView implementation **************** //

  get rowCount() {
    return this._rowMap.length;
  },

  /**
   * drag drop interfaces
   */
  /* eslint-disable complexity */
  canDrop(aRow, aOrientation) {
    let targetFolder = gFolderTreeView._rowMap[aRow]._folder;

    // Disable drag & drop if we don't have a folder.
    if (!targetFolder) {
      return false;
    }

    let dt = this._currentTransfer;
    let types = Array.from(dt.mozTypesAt(0));
    if (types.includes("text/x-moz-message")) {
      if (aOrientation != Ci.nsITreeView.DROP_ON) {
        return false;
      }
      // Don't allow drop onto server itself.
      if (targetFolder.isServer) {
        return false;
      }
      // Don't allow drop into a folder that cannot take messages.
      if (!targetFolder.canFileMessages) {
        return false;
      }
      let messenger = Cc["@mozilla.org/messenger;1"].createInstance(
        Ci.nsIMessenger
      );
      for (let i = 0; i < dt.mozItemCount; i++) {
        let msgHdr = messenger.msgHdrFromURI(
          dt.mozGetDataAt("text/x-moz-message", i)
        );
        // Don't allow drop onto original folder.
        if (msgHdr.folder == targetFolder) {
          return false;
        }
      }
      return true;
    } else if (types.includes("text/x-moz-folder")) {
      if (aOrientation != Ci.nsITreeView.DROP_ON) {
        return false;
      }
      // If cannot create subfolders then don't allow drop here.
      if (!targetFolder.canCreateSubfolders) {
        return false;
      }
      for (let i = 0; i < dt.mozItemCount; i++) {
        let folder = dt
          .mozGetDataAt("text/x-moz-folder", i)
          .QueryInterface(Ci.nsIMsgFolder);
        // Don't allow to drop on itself.
        if (targetFolder == folder) {
          return false;
        }
        // Don't copy within same server.
        if (folder.server == targetFolder.server && dt.dropEffect == "copy") {
          return false;
        }
        // Don't allow immediate child to be dropped onto its parent.
        if (targetFolder == folder.parent) {
          return false;
        }
        // Don't allow dragging of virtual folders across accounts.
        if (
          folder.getFlag(Ci.nsMsgFolderFlags.Virtual) &&
          folder.server != targetFolder.server
        ) {
          return false;
        }
        // Don't allow parent to be dropped on its ancestors.
        if (folder.isAncestorOf(targetFolder)) {
          return false;
        }
        // If there is a folder that can't be renamed, don't allow it to be
        // dropped if it is not to "Local Folders" or is to the same account.
        if (
          !folder.canRename &&
          (targetFolder.server.type != "none" ||
            folder.server == targetFolder.server)
        ) {
          return false;
        }
      }
      return true;
    } else if (types.includes("text/x-moz-newsfolder")) {
      // Don't allow dragging onto element.
      if (aOrientation == Ci.nsITreeView.DROP_ON) {
        return false;
      }
      // Don't allow drop onto server itself.
      if (targetFolder.isServer) {
        return false;
      }
      for (let i = 0; i < dt.mozItemCount; i++) {
        let folder = dt
          .mozGetDataAt("text/x-moz-newsfolder", i)
          .QueryInterface(Ci.nsIMsgFolder);
        // Don't allow dragging newsgroup to other account.
        if (targetFolder.rootFolder != folder.rootFolder) {
          return false;
        }
        // Don't allow dragging newsgroup to before/after itself.
        if (targetFolder == folder) {
          return false;
        }
        // Don't allow dragging newsgroup to before item after or
        // after item before.
        let row = aRow + aOrientation;
        if (
          row in gFolderTreeView._rowMap &&
          gFolderTreeView._rowMap[row]._folder == folder
        ) {
          return false;
        }
      }
      return true;
    } else if (targetFolder.server.type == "rss" && dt.mozItemCount == 1) {
      // Allow subscribing to feeds by dragging an url to a feed account.
      return !!FeedUtils.getFeedUriFromDataTransfer(dt);
    } else if (types.includes("application/x-moz-file")) {
      if (aOrientation != Ci.nsITreeView.DROP_ON) {
        return false;
      }
      // Don't allow drop onto server itself.
      if (targetFolder.isServer) {
        return false;
      }
      // Don't allow drop into a folder that cannot take messages.
      if (!targetFolder.canFileMessages) {
        return false;
      }
      for (let i = 0; i < dt.mozItemCount; i++) {
        let extFile = dt.mozGetDataAt("application/x-moz-file", i);
        if (!extFile) {
          continue;
        }

        extFile = extFile.QueryInterface(Ci.nsIFile);
        return extFile.isFile();
      }
    }
    return false;
  },
  /* eslint-enable complexity */
  drop(aRow, aOrientation) {
    let targetFolder = gFolderTreeView._rowMap[aRow]._folder;

    // Prevent drop if we don't have a folder.
    if (!targetFolder) {
      return;
    }

    let dt = this._currentTransfer;
    let count = dt.mozItemCount;
    let cs = MailServices.copy;

    // This is a potential rss feed.  A link image as well as link text url
    // should be handled; try to extract a url from non moz apps as well.
    let feedUri =
      targetFolder.server.type == "rss" && count == 1
        ? FeedUtils.getFeedUriFromDataTransfer(dt)
        : null;

    // we only support drag of a single flavor at a time.
    let types = Array.from(dt.mozTypesAt(0));
    if (types.includes("text/x-moz-folder")) {
      for (let i = 0; i < count; i++) {
        let folder = dt
          .mozGetDataAt("text/x-moz-folder", i)
          .QueryInterface(Ci.nsIMsgFolder);
        cs.copyFolder(
          folder,
          targetFolder,
          folder.server == targetFolder.server,
          null,
          msgWindow
        );
      }
    } else if (types.includes("text/x-moz-newsfolder")) {
      // Start by getting folders into order.
      let folders = [];
      for (let i = 0; i < count; i++) {
        let folder = dt
          .mozGetDataAt("text/x-moz-newsfolder", i)
          .QueryInterface(Ci.nsIMsgFolder);
        folders[this.getIndexOfFolder(folder)] = folder;
      }
      let newsFolder = targetFolder.rootFolder.QueryInterface(
        Ci.nsIMsgNewsFolder
      );
      // When moving down, want to insert first one last.
      // When moving up, want to insert first one first.
      let i = aOrientation == 1 ? folders.length - 1 : 0;
      while (i >= 0 && i < folders.length) {
        let folder = folders[i];
        if (folder) {
          newsFolder.moveFolder(folder, targetFolder, aOrientation);
          this.selection.toggleSelect(this.getIndexOfFolder(folder));
        }
        i -= aOrientation;
      }
    } else if (types.includes("text/x-moz-message")) {
      let array = [];
      let sourceFolder;
      let messenger = Cc["@mozilla.org/messenger;1"].createInstance(
        Ci.nsIMessenger
      );
      for (let i = 0; i < count; i++) {
        let msgHdr = messenger.msgHdrFromURI(
          dt.mozGetDataAt("text/x-moz-message", i)
        );
        if (!i) {
          sourceFolder = msgHdr.folder;
        }
        array.push(msgHdr);
      }
      let prefBranch = Services.prefs.getBranch("mail.");
      let isMove =
        Cc["@mozilla.org/widget/dragservice;1"]
          .getService(Ci.nsIDragService)
          .getCurrentSession().dragAction ==
        Ci.nsIDragService.DRAGDROP_ACTION_MOVE;
      let isNews = sourceFolder.flags & Ci.nsMsgFolderFlags.Newsgroup;
      if (!sourceFolder.canDeleteMessages || isNews) {
        isMove = false;
      }

      prefBranch.setCharPref("last_msg_movecopy_target_uri", targetFolder.URI);
      prefBranch.setBoolPref("last_msg_movecopy_was_move", isMove);
      // ### ugh, so this won't work with cross-folder views. We would
      // really need to partition the messages by folder.
      cs.copyMessages(
        sourceFolder,
        array,
        targetFolder,
        isMove,
        null,
        msgWindow,
        true
      );
    } else if (feedUri) {
      Cc["@mozilla.org/newsblog-feed-downloader;1"]
        .getService(Ci.nsINewsBlogFeedDownloader)
        .subscribeToFeed(feedUri.spec, targetFolder, msgWindow);
    } else if (types.includes("application/x-moz-file")) {
      for (let i = 0; i < count; i++) {
        let extFile = dt
          .mozGetDataAt("application/x-moz-file", i)
          .QueryInterface(Ci.nsIFile);
        if (extFile.isFile()) {
          let len = extFile.leafName.length;
          if (len > 4 && extFile.leafName.toLowerCase().endsWith(".eml")) {
            cs.copyFileMessage(
              extFile,
              targetFolder,
              null,
              false,
              1,
              "",
              null,
              msgWindow
            );
          }
        }
      }
    }
  },

  _onDragStart(aEvent) {
    // Ugh, this is ugly but necessary
    let view = gFolderTreeView;

    if (aEvent.target.localName != "treechildren") {
      return;
    }

    let folders = view.getSelectedFolders();
    folders = folders.filter(f => !f.isServer);
    for (let i in folders) {
      let flavor =
        folders[i].server.type == "nntp"
          ? "text/x-moz-newsfolder"
          : "text/x-moz-folder";
      aEvent.dataTransfer.mozSetDataAt(flavor, folders[i], i);
    }
    aEvent.dataTransfer.effectAllowed = "copyMove";
    aEvent.dataTransfer.addElement(aEvent.target);
  },

  _onDragOver(event) {
    let view = gFolderTreeView;
    let folder = view.getFolderAtCoords(event.clientX, event.clientY);

    // Interrupt if the target is not a folder.
    if (!folder) {
      return;
    }

    this._currentTransfer = event.dataTransfer;
  },

  _onDragDrop(event) {
    let view = gFolderTreeView;
    let folder = view.getFolderAtCoords(event.clientX, event.clientY);

    // Interrupt if the target is not a folder.
    if (!folder) {
      return;
    }

    this._currentTransfer = event.dataTransfer;
  },

  /**
   * CSS files will cue off of these.  Note that we reach into the rowMap's
   * items so that custom data-displays can define their own properties
   */
  getCellProperties(aRow, aCol) {
    return this._rowMap[aRow].getProperties(aCol);
  },

  /**
   * The actual text to display in the tree
   */
  getCellText(aRow, aCol) {
    if (
      aCol.id == "folderNameCol" ||
      aCol.id == "folderUnreadCol" ||
      aCol.id == "folderTotalCol" ||
      aCol.id == "folderSizeCol"
    ) {
      return this._rowMap[aRow].getText(aCol.id);
    }
    return "";
  },

  /**
   * For feed folders get, cache, and return a favicon. Otherwise return "" to
   * let css set the image per nsITreeView requirements.
   */
  getImageSrc(aRow, aCol) {
    if (aCol.id != "folderNameCol") {
      return "";
    }

    let rowItem = gFolderTreeView._rowMap[aRow];
    let folder = rowItem._folder;
    if (!folder || folder.server.type != "rss" || folder.isServer) {
      return "";
    }

    let properties = this.getFolderCacheProperty(folder, "properties");
    if (properties.includes("hasError") || properties.includes("isBusy")) {
      return "";
    }

    let favicon = this.getFolderCacheProperty(folder, "favicon");
    if (favicon != null) {
      return favicon;
    }

    let callback = iconUrl => {
      this.setFolderCacheProperty(folder, "favicon", iconUrl);
      this.clearFolderCacheProperty(folder, "properties");
      this._tree.invalidateRow(aRow);
    };

    // Cache empty string initially to return default while getting favicon,
    // so as to never return here. Alternatively, a blank image could be cached.
    this.setFolderCacheProperty(folder, "favicon", "");

    if (this._treeElement.getAttribute("simplelist") == "true") {
      return "";
    }

    // On startup, allow the ui to paint first before spawning potentially
    // many requests for favicons, even though they are async.
    setTimeout(() => {
      FeedUtils.getFavicon(folder, null, favicon, window, callback);
    }, 0);

    return "";
  },

  /**
   * The FtvItems take care of assigning this when created.
   */
  getLevel(aIndex) {
    return this._rowMap[aIndex].level;
  },

  /**
   * The FtvItems take care of assigning this when building children lists
   */
  getServerNameAdded(aIndex) {
    return this._rowMap[aIndex].addServerName;
  },

  /**
   * This is easy since the ftv items assigned the _parent property when making
   * the child lists
   */
  getParentIndex(aIndex) {
    return this._rowMap.indexOf(this._rowMap[aIndex]._parent);
  },

  /**
   * This is duplicative for our normal ftv views, but custom data-displays may
   * want to do something special here
   */
  getRowProperties(aRow) {
    return this._rowMap[aRow].getProperties();
  },

  /**
   * Check whether there are any more rows with our level before the next row
   * at our parent's level
   */
  hasNextSibling(aIndex, aNextIndex) {
    var currentLevel = this._rowMap[aIndex].level;
    for (var i = aNextIndex + 1; i < this._rowMap.length; i++) {
      if (this._rowMap[i].level == currentLevel) {
        return true;
      }
      if (this._rowMap[i].level < currentLevel) {
        return false;
      }
    }
    return false;
  },

  /**
   * All folders are containers, so we can drag drop messages to them.
   */
  isContainer(aIndex) {
    return true;
  },

  isContainerEmpty(aIndex) {
    // If the folder has no children, the container is empty.
    return !this._rowMap[aIndex].children.length;
  },

  /**
   * Just look at the FtvItem here
   */
  isContainerOpen(aIndex) {
    return this._rowMap[aIndex].open;
  },
  getSummarizedCounts(aIndex, aColName) {
    return this._rowMap[aIndex]._summarizedCounts.get(aColName);
  },
  isEditable(aRow, aCol) {
    // We don't support editing rows in the tree yet.  We may want to later as
    // an easier way to rename folders.
    return false;
  },
  isSeparator(aIndex) {
    // There are no separators in our trees
    return false;
  },
  isSorted() {
    // We do our own customized sorting
    return false;
  },
  setTree(aTree) {
    this._tree = aTree;
  },

  /**
   * Opens or closes a folder with children.  The logic here is a bit hairy, so
   * be very careful about changing anything.
   */
  toggleOpenState(aIndex) {
    this._toggleRow(aIndex, true);
  },

  recursivelyAddToMap(aChild, aNewIndex) {
    // When we add sub-children, we're going to need to increase our index
    // for the next add item at our own level.
    let count = 0;
    if (aChild.children.length && aChild.open) {
      for (let [i, child] of Array.from(
        this._rowMap[aNewIndex].children
      ).entries()) {
        count++;
        let index = Number(aNewIndex) + Number(i) + 1;
        this._rowMap.splice(index, 0, child);

        let kidsAdded = this.recursivelyAddToMap(child, index);
        count += kidsAdded;
        // Somehow the aNewIndex turns into a string without this.
        aNewIndex = Number(aNewIndex) + kidsAdded;
      }
    }
    return count;
  },

  _toggleRow(aIndex, aExpandServer) {
    if (!this._rowMap[aIndex].open) {
      // We're opening the container. Add the children to our map.
      this._rowMap[aIndex].open = true;

      // Note that these children may have been open when we were last closed,
      // and if they are, we also have to add those grandchildren to the map.
      let oldCount = this._rowMap.length;
      this.recursivelyAddToMap(this._rowMap[aIndex], aIndex);

      // Add this folder to the persist map.
      this._persistItemOpen(this._rowMap[aIndex]._folder, aIndex);

      // Notify the tree of changes.
      if (this._tree) {
        this._tree.rowCountChanged(aIndex + 1, this._rowMap.length - oldCount);
        this.clearFolderCacheProperty(
          this._rowMap[aIndex]._folder,
          "properties"
        );
        this._tree.invalidateRow(aIndex);
      }

      if (this._treeElement.getAttribute("simplelist") == "true") {
        return;
      }

      // If this was a server that was expanded, let it update its counts.
      let folder = this._rowMap[aIndex]._folder;

      // Interrupt if we don't have a folder, meaning this is a Mode Header and
      // no row toggle will be performed.
      if (!folder) {
        return;
      }

      if (aExpandServer) {
        if (folder.isServer) {
          folder.server.performExpand(msgWindow);
        } else if (folder instanceof Ci.nsIMsgImapMailFolder) {
          folder.performExpand(msgWindow);
        }
      }

      return;
    }

    this._rowMap[aIndex].open = false;

    // We're closing the current container. Remove the children.

    // Note that we can't simply splice out children.length, because some of
    // them might have children too. Find out how many items we're actually
    // going to splice.
    let count = 0;
    let i = aIndex + 1;
    let row = this._rowMap[i];
    while (row && row.level > this._rowMap[aIndex].level) {
      count++;
      row = this._rowMap[++i];
    }
    this._rowMap.splice(aIndex + 1, count);

    // Remove us from the persist map.
    this._persistItemClosed(this._rowMap[aIndex]._folder, aIndex);

    // Notify the tree of changes.
    if (this._tree) {
      this._tree.rowCountChanged(aIndex + 1, -1 * count);
      this.clearFolderCacheProperty(this._rowMap[aIndex]._folder, "properties");
      this._tree.invalidateRow(aIndex);
    }
  },

  _subFoldersWithStringProperty(folder, folders, aFolderName, deep) {
    for (let child of folder.subFolders) {
      // if the folder selection is based on a string property, use that
      if (aFolderName == getSmartFolderName(child)) {
        folders.push(child);
        // Add sub-folders if requested.
        if (deep) {
          this.addSubFolders(child, folders);
        }
      } else {
        // if this folder doesn't have a property set, check Its children
        this._subFoldersWithStringProperty(child, folders, aFolderName, deep);
      }
    }
  },

  _allFoldersWithStringProperty(accounts, aFolderName, deep) {
    let folders = [];
    for (let acct of accounts) {
      let folder = acct.incomingServer.rootFolder;
      this._subFoldersWithStringProperty(folder, folders, aFolderName, deep);
    }
    return folders;
  },

  _allFoldersWithFlag(accounts, aFolderFlag, deep) {
    let folders = [];
    for (let acct of accounts) {
      let foldersWithFlag = acct.incomingServer.rootFolder.getFoldersWithFlags(
        aFolderFlag
      );
      if (foldersWithFlag.length > 0) {
        for (let folderWithFlag of foldersWithFlag) {
          folders.push(folderWithFlag);
          // Add sub-folders of Sent and Archive to the result.
          if (
            deep &&
            aFolderFlag &
              (Ci.nsMsgFolderFlags.SentMail | Ci.nsMsgFolderFlags.Archive)
          ) {
            this.addSubFolders(folderWithFlag, folders);
          }
        }
      }
    }
    return folders;
  },

  /**
   * get folders by flag or property based on the value of flag
   */
  _allSmartFolders(accounts, flag, folderName, deep) {
    return flag
      ? gFolderTreeView._allFoldersWithFlag(accounts, flag, deep)
      : gFolderTreeView._allFoldersWithStringProperty(
          accounts,
          folderName,
          deep
        );
  },

  /**
   * Add a smart folder for folders with the passed flag set. But if there's
   * only one folder with the flag set, just put it at the top level.
   *
   * @param {FtvItem[]} map - Array to add folder item to.
   * @param {Array} accounts - Array of accounts.
   * @param {nsIMsgFolder} smartRootFolder - Root folder of the smart folders
   *   server.
   * @param {Ci.nsMsgFolderFlags} flag - Folder flag for the newly created smart
   *   folders.
   * @param {string} folderName - Name to give to the smart folder.
   * @param {?Integer} position - Optional place to put folder item in map.
   *   If not specified, folder item will be appended at the end of map.
   *
   * @returns {?FtvItem} The smart folder's FtvItem if one was added, null
   *   otherwise.
   */
  _addSmartFoldersForFlag(
    map,
    accounts,
    smartRootFolder,
    flag,
    folderName,
    position
  ) {
    // If there's only one subFolder, just put it at the root.
    let subFolders = gFolderTreeView._allSmartFolders(
      accounts,
      flag,
      folderName,
      false
    );

    if (flag && subFolders.length == 1) {
      let folderItem = new FtvItem(subFolders[0]);
      folderItem._level = 0;
      if (flag & Ci.nsMsgFolderFlags.Inbox) {
        folderItem.__defineGetter__("children", () => []);
      }
      if (position == undefined) {
        map.push(folderItem);
      } else {
        map[position] = folderItem;
      }
      // No smart folder was added
      return null;
    }

    let smartFolder;
    try {
      let folderUri = smartRootFolder.URI + "/" + encodeURI(folderName);
      smartFolder = smartRootFolder.getChildWithURI(folderUri, false, true);
    } catch (ex) {
      smartFolder = null;
    }
    if (!smartFolder) {
      let searchFolders = gFolderTreeView._allSmartFolders(
        accounts,
        flag,
        folderName,
        true
      );
      let searchFolderURIs = "";
      for (let searchFolder of searchFolders) {
        if (searchFolderURIs.length) {
          searchFolderURIs += "|";
        }
        searchFolderURIs += searchFolder.URI;
      }
      if (!searchFolderURIs.length) {
        return null;
      }
      smartFolder = gFolderTreeView._createVFFolder(
        folderName,
        smartRootFolder,
        searchFolderURIs,
        flag
      );
    }

    let smartFolderItem = new FtvItem(smartFolder);
    smartFolderItem._level = 0;
    if (position == undefined) {
      map.push(smartFolderItem);
    } else {
      map[position] = smartFolderItem;
    }
    // Add the actual special folders as sub-folders of the saved search.
    // By setting _children directly, we bypass the normal calculation
    // of subfolders.
    smartFolderItem._children = subFolders.map(f => new FtvItem(f));

    let prevChild = null;
    // Each child is a level one below the smartFolder
    for (let child of smartFolderItem._children) {
      child._level = smartFolderItem._level + 1;
      child._parent = smartFolderItem;
      // don't show sub-folders of the inbox, but I think Archives/Sent, etc
      // should have the sub-folders.
      if (flag & Ci.nsMsgFolderFlags.Inbox) {
        child.__defineGetter__("children", () => []);
      }
      // If we have consecutive children with the same server, then both
      // should display as folder - server.
      if (prevChild && child._folder.server == prevChild._folder.server) {
        child.addServerName = true;
        prevChild.addServerName = true;
        prevChild.useServerNameOnly = false;
      } else if (flag) {
        child.useServerNameOnly = true;
      } else {
        child.addServerName = true;
      }
      prevChild = child;
    }
    // new custom folders from addons may contain lots of children, sort them
    if (flag == 0) {
      sortFolderItems(smartFolderItem._children);
    }
    return smartFolderItem;
  },
  _createVFFolder(newName, parentFolder, searchFolderURIs, folderFlag) {
    let newFolder;
    try {
      if (parentFolder instanceof Ci.nsIMsgLocalMailFolder) {
        newFolder = parentFolder.createLocalSubfolder(newName);
      } else {
        newFolder = parentFolder.addSubfolder(newName);
      }
      newFolder.setFlag(Ci.nsMsgFolderFlags.Virtual);
      // provide a way to make the top level folder just a container, not
      // a search folder
      let type = this._modes.smart.getSmartFolderTypeByName(newName);
      if (type[3]) {
        // isSearch
        let vfdb = newFolder.msgDatabase;
        let dbFolderInfo = vfdb.dBFolderInfo;
        // set the view string as a property of the db folder info
        // set the original folder name as well.
        dbFolderInfo.setCharProperty("searchStr", "ALL");
        dbFolderInfo.setCharProperty("searchFolderUri", searchFolderURIs);
        dbFolderInfo.setUint32Property("searchFolderFlag", folderFlag);
        dbFolderInfo.setBooleanProperty("searchOnline", true);
        vfdb.summaryValid = true;
        vfdb.Close(true);
      }
      parentFolder.NotifyItemAdded(newFolder);
      MailServices.accounts.saveVirtualFolders();
    } catch (e) {
      dump("Exception : creating virtual folder \n");
      throw e;
    }
    return newFolder;
  },

  // We don't implement any of these at the moment
  selectionChanged() {},
  setCellText(aRow, aCol, aValue) {},
  setCellValue(aRow, aCol, aValue) {},
  getCellValue(aRow, aCol) {},
  getColumnProperties(aCol) {
    return "";
  },
  getProgressMode(aRow, aCol) {},
  cycleCell(aRow, aCol) {},
  cycleHeader(aCol) {},

  // ****************** End of nsITreeView implementation **************** //

  // WARNING: Everything below this point is considered private. Touch at your
  //          own risk.

  /**
   * This is an array of all possible modes for the folder tree. You should not
   * modify this directly, but rather use registerFolderTreeMode.
   */
  _modeNames: ["all", "smart", "unread", "favorite", "recent"],
  _modeDisplayNames: {},

  /**
   * This is a JavaScript map of which folders we had open, so that we can
   * persist their state over-time. It is designed to be used as a JSON object.
   */
  _persistOpenMap: {},
  _notPersistedModes: ["unread", "recent"],

  /**
   * This is a JavaScript map of which folders have a custom color so that we
   * can persist the customization state over-time. It is designed to be used
   * as a JSON object.
   */
  _persistColorMap: {},

  /**
   * Iterate over the persistent list and open the items (folders) stored in it.
   */
  _restoreOpenStates() {
    let curLevel = 0;
    let tree = this;
    let rowMode = tree.activeModes.length == 1 ? tree.activeModes[0] : null;

    function openLevel(map, mode) {
      let goOn = false;
      // We can't use a js iterator because we're changing the array as we go.
      // So fallback on old trick of going backwards from the end, which
      // doesn't care when you add things at the end.
      for (let i = tree._rowMap.length - 1; i >= 0; i--) {
        let row = tree._rowMap[i];

        // Reset the rowMode since we're currently looping through a Header Mode
        // which means we need to fetch the new mode next time we loop.
        if (row.mode) {
          rowMode = null;
          continue;
        }

        // Fetch the row mode only if multiple modes are currently active and
        // the current rowMode is null. This is to prevent unnecessary loops if
        // we're still in the same mode hierarchy or we only have 1 mode.
        if (tree.activeModes.length > 1 && !rowMode) {
          rowMode = tree.getModeForIndex(i);
        }

        // Avoid running old levels or toggling a row that doesn't belong to the
        // current mode or doesn't have any children.
        if (
          (rowMode && rowMode != mode) ||
          row.level != curLevel ||
          !row.children.length
        ) {
          continue;
        }

        // The initial state of all rows is closed, so toggle those we want open.
        if (!map || map.includes(row.id)) {
          tree._toggleRow(i, false);
          goOn = true;
        }
      }

      // If we opened up any new kids, we need to check their level as well.
      curLevel++;
      if (goOn) {
        openLevel(map, mode);
      }
    }

    for (let mode of tree.activeModes) {
      // Remove any saved state of modes where open states should not be
      // persisted. This is mostly for migration from older profiles that may
      // have the info stored.
      if (tree._notPersistedModes.includes(mode)) {
        delete tree._persistOpenMap[mode];
      }

      // Reset the row level tracker when we change mode.
      curLevel = 0;
      openLevel(tree._persistOpenMap[mode], mode);
    }
  },

  /**
   * Iterate over the custom color list and apply the CSS style stored in it.
   */
  _restoreCustomColors() {
    // Interrupt if the user never defined any custom color.
    if (!this._persistColorMap) {
      return;
    }

    // Loop through all the saved folders and restore their colors.
    for (const [key, value] of Object.entries(this._persistColorMap)) {
      // Store the color in the cache property so we can use this for
      // properties changes and updates.
      gFolderTreeView.setFolderCacheProperty(
        {
          URI: key,
        },
        "folderIconColor",
        value
      );

      // Append the color to the inline CSS.
      this.appendColor(value);
    }
  },

  /**
   * Remove the item from the persisted list of custom colored folder.
   *
   * @param {string} folderId - The URI of the folder item.
   */
  _removeCustomColor(folderId) {
    // Interrupt if the map hasn't been defined.
    if (!this._persistColorMap) {
      return;
    }

    delete this._persistColorMap[folderId];
  },

  /**
   * Add the item to the persisted list of custom colored folder.
   *
   * @param {string} folderId - The URI of the folder item.
   * @param {string} color - The selected custom color.
   */
  _addCustomColor(folderId, color) {
    // Always remove the previous color if it exists.
    this._removeCustomColor(folderId);

    // Interrupt if no custom color was defined.
    if (!color) {
      return;
    }

    // Create the map if it is undefined.
    if (!this._persistColorMap) {
      this._persistColorMap = {};
    }

    this._persistColorMap[folderId] = color;

    // Store the color in the cache property so we can use this for
    // properties changes and updates.
    gFolderTreeView.setFolderCacheProperty(
      {
        URI: folderId,
      },
      "folderIconColor",
      color
    );

    // Append the color to the inline CSS.
    this.appendColor(color);
  },

  /**
   * Remove the item from the persistent list, meaning the item should be
   * persisted as closed in the tree.
   *
   * @param {?nsIMsgFolder} item - The folder item if it exists.
   * @param {string} index - The selected folder position.
   */
  _persistItemClosed(item, index) {
    if (!item) {
      return;
    }

    let mode = this.getModeForIndex(index);
    if (this._notPersistedModes.includes(mode)) {
      return;
    }

    // If the whole mode is not in the map yet, we can silently ignore the
    // folder removal.
    if (!this._persistOpenMap[mode]) {
      return;
    }

    let persistMapIndex = this._persistOpenMap[mode].indexOf(item.URI);
    if (persistMapIndex != -1) {
      this._persistOpenMap[mode].splice(persistMapIndex, 1);
    }
  },

  /**
   * Add the item from the persistent list, meaning the item should be persisted
   * as open (expanded) in the tree.
   *
   * @param {?nsIMsgFolder} item - The folder item if it exists.
   * @param {Integer} index - The row index of the folder item.
   */
  _persistItemOpen(item, index) {
    if (!item) {
      return;
    }

    let mode = this.getModeForIndex(index);
    if (this._notPersistedModes.includes(mode)) {
      return;
    }

    if (!this._persistOpenMap[mode]) {
      this._persistOpenMap[mode] = [];
    }

    if (!this._persistOpenMap[mode].includes(item.URI)) {
      this._persistOpenMap[mode].push(item.URI);
    }
  },

  _tree: null,
  selection: null,
  /**
   * An array of FtvItems, where each item corresponds to a row in the tree
   */
  _rowMap: null,

  /**
   * Check if multiple view modes are currently active and forces a full rebuild
   * in order to properly refresh the folder list for any substantial change in
   * the row map.
   */
  rebuildAfterChange() {
    if (this.activeModes.length == 1) {
      return;
    }

    let selected = this.getSelectedFolders()[0];
    this._rebuild();

    // Restore the selection after the rebuild.
    if (selected) {
      this.selectFolder(selected);
    }
  },

  /**
   * Completely discards the current tree and rebuilds it based on current
   * settings.
   */
  _rebuild() {
    let newRowMap = [];
    for (let mode of this.activeModes) {
      try {
        newRowMap = [...this._modes[mode].generateMap(this), ...newRowMap];
      } catch (ex) {
        Services.console.logStringMessage(
          "generator " + mode + " failed with exception: " + ex
        );
      }
    }

    if (!newRowMap.length) {
      newRowMap = [...this._modes[kDefaultMode].generateMap(this)];
    }

    let selectedFolders = this.getSelectedFolders();
    if (this.selection) {
      this.selection.clearSelection();
    }
    // There's a chance the call to the map generator altered this._rowMap, so
    // evaluate oldCount after calling it rather than before
    let oldCount = this._rowMap ? this._rowMap.length : null;
    this._rowMap = newRowMap;

    this._treeElement.dispatchEvent(
      new Event(
        "mapRebuild", // Introduced in bug 474822 for add-ons.
        { bubbles: true, cancelable: false }
      )
    );

    if (this._tree) {
      if (oldCount !== null) {
        this._tree.rowCountChanged(0, this._rowMap.length - oldCount);
      }
      this._tree.invalidate();
    }
    this._restoreOpenStates();
    this._restoreCustomColors();

    // restore selection.
    for (let folder of selectedFolders) {
      if (folder) {
        let index = this.getIndexOfFolder(folder);
        if (index != null) {
          this.selection.toggleSelect(index);
        }
      }
    }
  },

  _sortedAccounts() {
    let accounts = allAccountsSorted(true);

    // Don't show deferred pop accounts.
    accounts = accounts.filter(function(a) {
      let server = a.incomingServer;
      return !(
        server instanceof Ci.nsIPop3IncomingServer && server.deferredToAccount
      );
    });

    return accounts;
  },

  /*
   * Session cache keyed by folder url, for properties intended to survive
   * a _rowMap rebuild and avoid expensive requeries. Not for persistence
   * across restarts; _persistOpenMap could be used for that.
   */
  _cache: {},

  /**
   * Update a folder property in the session cache.
   *
   * @param  nsIMsgFolder aFolder   - folder.
   * @param  string aProperty       - property, currently in "favicon".
   * @param  aValue                 - string or object value.
   */
  setFolderCacheProperty(aFolder, aProperty, aValue) {
    if (!aFolder || !aProperty) {
      return;
    }

    if (!this._cache[aFolder.URI]) {
      this._cache[aFolder.URI] = {};
    }

    this._cache[aFolder.URI][aProperty] = aValue;
  },

  /**
   * Get a folder property from the session cache.
   *
   * @param  nsIMsgFolder aFolder   - folder.
   * @param  string aProperty       - property key.
   * @return value or null          - null indicates uninitialized.
   */
  getFolderCacheProperty(aFolder, aProperty) {
    if (!aFolder || !aProperty) {
      return null;
    }

    if (
      !(aFolder.URI in this._cache) ||
      !(aProperty in this._cache[aFolder.URI])
    ) {
      return null;
    }

    return this._cache[aFolder.URI][aProperty];
  },

  /**
   * Delete a previously cached property if present.
   *
   * @param {nsIMsgFolder} folder - The folder with the cached property.
   * @param {string} property - The property name.
   */
  clearFolderCacheProperty(folder, property) {
    if (!folder || !property) {
      return;
    }

    if (
      !(folder.URI in this._cache) ||
      !(property in this._cache[folder.URI])
    ) {
      return;
    }

    delete this._cache[folder.URI][property];
  },

  /**
   * Contains the set of modes registered with the folder tree, initially those
   * included by default. This is a map from names of modes to their
   * implementations of |IFolderTreeMode|.
   */
  _modes: {
    /**
     * The all mode returns all folders, arranged in a hierarchy
     */
    all: {
      __proto__: IFolderTreeMode,

      generateMap(ftv) {
        let accounts = gFolderTreeView._sortedAccounts();
        // force each root folder to do its local subfolder discovery.
        MailUtils.discoverFolders();

        let map = accounts.map(
          acct => new FtvItem(acct.incomingServer.rootFolder)
        );

        // Create the header only if multiple modes are currently displayed.
        if (gFolderTreeView.activeModes.length > 1) {
          map.unshift(new FtvItemHeader("all"));
        }

        return map;
      },
    },

    /**
     * The unread mode returns all folders that are not root-folders and that
     * have unread items. Also always keep the currently selected folder
     * so it doesn't disappear under the user.
     * It also includes parent folders of the Unread folders so the hierarchy
     * shown.
     */
    unread: {
      __proto__: IFolderTreeMode,

      generateMap(ftv) {
        // Return the compact variation of this mode view.
        if (gFolderTreeController._tree.getAttribute("compact") == "true") {
          return this.generateCompactMap(ftv);
        }

        let filterUnread = function(aFolder) {
          let currentFolder = gFolderTreeView.getSelectedFolders()[0];
          return aFolder.getNumUnread(true) > 0 || aFolder == currentFolder;
        };

        let accounts = gFolderTreeView._sortedAccounts();
        // Force each root folder to do its local subfolder discovery.
        MailUtils.discoverFolders();

        let unreadRootFolders = [];
        for (let acct of accounts) {
          let rootFolder = acct.incomingServer.rootFolder;
          // Add rootFolders of accounts that contain at least one Favorite folder.
          if (rootFolder.getNumUnread(true) > 0) {
            unreadRootFolders.push(new FtvItem(rootFolder, filterUnread));
          }
        }

        // Create the header only if multiple modes are currently displayed or
        // the "All Folder" modes is not part of the array.
        if (
          gFolderTreeView.activeModes.length > 1 ||
          !gFolderTreeView.activeModes.includes("all")
        ) {
          unreadRootFolders.unshift(new FtvItemHeader("unread"));
        }

        return unreadRootFolders;
      },

      /**
       * A compact variant of this mode. This does not include the parent
       * folders and the unread folders are shown in a flat list with no
       * hierarchy.
       */
      generateCompactMap(ftv) {
        let map = [];
        let currentFolder = gFolderTreeView.getSelectedFolders()[0];
        for (let folder of ftv._enumerateFolders) {
          if (
            (!folder.isServer && folder.getNumUnread(false) > 0) ||
            folder == currentFolder
          ) {
            map.push(new FtvItem(folder));
          }
        }

        // There are no children in this view!
        for (let folder of map) {
          folder.__defineGetter__("children", () => []);
          folder.addServerName = true;
        }
        sortFolderItems(map);

        // Create the header only if multiple modes are currently displayed or
        // the "All Folder" modes is not part of the array.
        if (
          gFolderTreeView.activeModes.length > 1 ||
          !gFolderTreeView.activeModes.includes("all")
        ) {
          map.unshift(new FtvItemHeader("unread"));
        }

        return map;
      },

      handleChangedIntProperty(aItem, aProperty, aOld, aNew) {
        // We want to rebuild only if we have a newly unread folder
        // and we didn't already have the folder.
        if (
          aProperty == "TotalUnreadMessages" &&
          aOld == 0 &&
          aNew > 0 &&
          gFolderTreeView.getIndexOfFolder(aItem) == null
        ) {
          gFolderTreeView._rebuild();
          return true;
        }
        return false;
      },
    },

    /**
     * The favorites mode returns all folders whose flags are set to include
     * the favorite flag.
     * It also includes parent folders of the Unread folders so the hierarchy
     * shown.
     */
    favorite: {
      __proto__: IFolderTreeMode,

      generateMap(ftv) {
        // Return the compact variation of this mode view.
        if (gFolderTreeController._tree.getAttribute("compact") == "true") {
          return this.generateCompactMap(ftv);
        }

        let accounts = gFolderTreeView._sortedAccounts();
        // Force each root folder to do its local subfolder discovery.
        MailUtils.discoverFolders();

        let favRootFolders = [];
        let filterFavorite = function(aFolder) {
          return (
            aFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Favorite) != null
          );
        };
        for (let acct of accounts) {
          let rootFolder = acct.incomingServer.rootFolder;
          // Add rootFolders of accounts that contain at least one Favorite folder.
          if (filterFavorite(rootFolder)) {
            favRootFolders.push(new FtvItem(rootFolder, filterFavorite));
          }
        }

        // Create the header only if multiple modes are currently displayed or
        // the "All Folder" modes is not part of the array.
        if (
          gFolderTreeView.activeModes.length > 1 ||
          !gFolderTreeView.activeModes.includes("all")
        ) {
          favRootFolders.unshift(new FtvItemHeader("favorite"));
        }

        return favRootFolders;
      },

      /**
       * A compact variant of this mode. This does not include the parent
       * folders and the unread folders are shown in a flat list with no
       * hierarchy.
       */
      generateCompactMap(ftv) {
        let faves = [];
        for (let folder of ftv._enumerateFolders) {
          if (folder.getFlag(Ci.nsMsgFolderFlags.Favorite)) {
            faves.push(new FtvItem(folder));
          }
        }

        // We want to display the account name alongside folders that have
        // duplicated folder names.
        let uniqueNames = new Set(); // set of folder names seen at least once
        let dupeNames = new Set(); // set of folders seen at least twice
        for (let item of faves) {
          let name = item._folder.abbreviatedName.toLocaleLowerCase();
          if (uniqueNames.has(name)) {
            if (!dupeNames.has(name)) {
              dupeNames.add(name);
            }
          } else {
            uniqueNames.add(name);
          }
        }

        // There are no children in this view!
        for (let item of faves) {
          let name = item._folder.abbreviatedName.toLocaleLowerCase();
          item.__defineGetter__("children", () => []);
          item.addServerName = dupeNames.has(name);
        }
        sortFolderItems(faves);

        // Create the header only if multiple modes are currently displayed or
        // the "All Folder" modes is not part of the array.
        if (
          gFolderTreeView.activeModes.length > 1 ||
          !gFolderTreeView.activeModes.includes("all")
        ) {
          faves.unshift(new FtvItemHeader("favorite"));
        }

        return faves;
      },

      handleChangedIntProperty(aItem, aProperty, aOld, aNew) {
        // We want to rebuild if the favorite status of a folder changed.
        if (
          aProperty == "FolderFlag" &&
          (aOld & Ci.nsMsgFolderFlags.Favorite) !=
            (aNew & Ci.nsMsgFolderFlags.Favorite)
        ) {
          gFolderTreeView._rebuild();
          return true;
        }
        return false;
      },
    },

    recent: {
      __proto__: IFolderTreeMode,

      generateMap(ftv) {
        // Get the most recently accessed folders.
        let recentFolders = getMostRecentFolders(
          ftv._enumerateFolders,
          Services.prefs.getIntPref("mail.folder_widget.max_recent"),
          "MRUTime",
          null
        );

        // Sort the folder names alphabetically.
        recentFolders.sort(function(a, b) {
          let aLabel = a.prettyName;
          let bLabel = b.prettyName;
          if (aLabel == bLabel) {
            aLabel = a.server.prettyName;
            bLabel = b.server.prettyName;
          }
          return folderNameCompare(aLabel, bLabel);
        });

        let items = recentFolders.map(f => new FtvItem(f));

        // There are no children in this view!
        // And we want to display the account name to distinguish folders w/
        // the same name.
        for (let folder of items) {
          folder.__defineGetter__("children", () => []);
          folder.addServerName = true;
        }

        // Create the header only if multiple modes are currently displayed or
        // the "All Folder" modes is not part of the array.
        if (
          gFolderTreeView.activeModes.length > 1 ||
          !gFolderTreeView.activeModes.includes("all")
        ) {
          items.unshift(new FtvItemHeader("recent"));
        }

        return items;
      },

      getParentOfFolder(aFolder) {
        // This is a flat view, so no folders have parents.
        return null;
      },
    },

    /**
     * The smart folder mode combines special folders of a particular type
     * across accounts into a single cross-folder saved search.
     */
    smart: {
      __proto__: IFolderTreeMode,

      /**
       * The smart server. This will create the server if it doesn't exist.
       */
      get _smartServer() {
        let smartServer;
        try {
          smartServer = MailServices.accounts.FindServer(
            "nobody",
            "smart mailboxes",
            "none"
          );
        } catch (ex) {
          smartServer = MailServices.accounts.createIncomingServer(
            "nobody",
            "smart mailboxes",
            "none"
          );
          // We don't want the "smart" server/account leaking out into the ui in
          // other places, so set it as hidden.
          smartServer.hidden = true;
          let account = MailServices.accounts.createAccount();
          account.incomingServer = smartServer;
        }
        delete this._smartServer;
        return (this._smartServer = smartServer);
      },

      /**
       * A list of [flag, name, isDeep, isSearch] for smart folders. isDeep ==
       * false means that subfolders are displayed as subfolders of the account,
       * not of the smart folder. This list is expected to be constant through a
       * session.
       */
      _flagNameList: [
        [Ci.nsMsgFolderFlags.Inbox, "Inbox", false, true],
        [Ci.nsMsgFolderFlags.Drafts, "Drafts", false, true],
        [Ci.nsMsgFolderFlags.SentMail, "Sent", true, true],
        [Ci.nsMsgFolderFlags.Trash, "Trash", true, true],
        [Ci.nsMsgFolderFlags.Templates, "Templates", false, true],
        [Ci.nsMsgFolderFlags.Archive, "Archives", true, true],
        [Ci.nsMsgFolderFlags.Junk, "Junk", false, true],
        [Ci.nsMsgFolderFlags.Queue, "Outbox", true, true],
      ],

      /**
       * support for addons to add special folder types, this must be called
       * prior to onload.
       *
       * @param aFolderName  name of the folder
       * @param isDeep  include subfolders
       * @param folderOptions  object with searchStr and searchOnline options, or null
       */
      addSmartFolderType(aFolderName, isDeep, isSearchFolder) {
        this._flagNameList.push([0, aFolderName, isDeep, isSearchFolder]);
      },

      /**
       * Returns an array of 4 elements describing the smart folder
       * if the given folder is a special folder, else returns null.
       */
      getSmartFolderTypeByName(aName) {
        for (let type of this._flagNameList) {
          if (type[1] == aName) {
            return type;
          }
        }
        return null;
      },
      /**
       * check to see if a folder is a smart folder
       */
      isSmartFolder(aFolder) {
        if (aFolder.flags & this._allSmartFlags) {
          return true;
        }
        // Also check the folder name itself, as containers do not
        // have the smartFolderName property.  We check all folders here, since
        // a "real" folder might be marked as a child of a smart folder.
        let smartFolderName = getSmartFolderName(aFolder);
        return (
          (smartFolderName && this.getSmartFolderTypeByName(smartFolderName)) ||
          this.getSmartFolderTypeByName(aFolder.name)
        );
      },

      /**
       * All the flags above, bitwise ORed.
       */
      get _allSmartFlags() {
        delete this._allSmartFlags;
        return (this._allSmartFlags = this._flagNameList.reduce(
          (res, [flag, , isDeep]) => res | flag,
          0
        ));
      },

      /**
       * All the "shallow" flags above (isDeep set to false), bitwise ORed.
       */
      get _allShallowFlags() {
        delete this._allShallowFlags;
        return (this._allShallowFlags = this._flagNameList.reduce(
          (res, [flag, , isDeep]) => (isDeep ? res : res | flag),
          0
        ));
      },

      /**
       * Returns an array of 4 elements describing the smart folder
       * if the given folder is a special folder, else returns null.
       */
      _getSmartFolderType(aFolder) {
        let smartFolderName = getSmartFolderName(aFolder);
        for (let type of this._flagNameList) {
          if (smartFolderName) {
            if (type[1] == smartFolderName) {
              return type;
            }
            continue;
          }
          if (aFolder.flags & type[0]) {
            return type;
          }
        }
        return null;
      },

      /**
       * Returns the smart folder with the given name.
       */
      _getSmartFolderNamed(aName) {
        let smartRoot = this._smartServer.rootFolder;
        return smartRoot.getChildWithURI(
          smartRoot.URI + "/" + encodeURI(aName),
          false,
          true
        );
      },

      generateMap(ftv) {
        let map = [];
        let accounts = gFolderTreeView._sortedAccounts();
        let smartServer = this._smartServer;
        smartServer.prettyName = gFolderTreeView.messengerBundle.getString(
          "unifiedAccountName"
        );
        smartServer.canHaveFilters = false;

        let smartRoot = smartServer.rootFolder;
        let smartChildren = [];
        for (let [flag, name] of this._flagNameList) {
          gFolderTreeView._addSmartFoldersForFlag(
            smartChildren,
            accounts,
            smartRoot,
            flag,
            name
          );
        }

        sortFolderItems(smartChildren);
        for (let smartChild of smartChildren) {
          map.push(smartChild);
        }

        MailUtils.discoverFolders();

        for (let acct of accounts) {
          map.push(new FtvSmartItem(acct.incomingServer.rootFolder));
        }

        // Create the header only if multiple modes are currently displayed or
        // the "All Folder" modes is not part of the array.
        if (
          gFolderTreeView.activeModes.length > 1 ||
          !gFolderTreeView.activeModes.includes("all")
        ) {
          map.unshift(new FtvItemHeader("smart"));
        }

        return map;
      },

      /**
       * Returns the parent of a folder in the view.
       *
       * - The smart mailboxes are all top-level, so there's no parent.
       * - For one of the special folders, it is the smart folder of that kind
       *   if we're showing it (this happens when there's more than one folder
       *   of the kind). Otherwise it's a top-level folder, so there isn't a
       *   parent.
       * - For a child of a "shallow" special folder (see |_flagNameList| for
       *   the definition), it is the account.
       * - Otherwise it is simply the folder's actual parent.
       */
      getParentOfFolder(aFolder) {
        let smartServer = this._smartServer;
        if (aFolder.server == smartServer) {
          // This is a smart mailbox
          return null;
        }

        let smartType = this._getSmartFolderType(aFolder);
        if (smartType) {
          // This is a special folder
          let smartFolder = this._getSmartFolderNamed(smartType[1]);
          if (
            smartFolder &&
            gFolderTreeView.getIndexOfFolder(smartFolder) != null
          ) {
            return smartFolder;
          }

          return null;
        }

        let parent = aFolder.parent;
        if (parent && parent.isSpecialFolder(this._allShallowFlags, false)) {
          // Child of a shallow special folder
          return aFolder.server.rootFolder;
        }

        return parent;
      },

      /**
       * For a folder of a particular type foo, this returns the smart folder of
       * that type (if it's displayed). Otherwise this returns the folder the
       * message is in.
       */
      getFolderForMsgHdr(aMsgHdr) {
        let folder = aMsgHdr.folder;

        let smartType = this._getSmartFolderType(folder);
        if (smartType) {
          let smartFolder = this._getSmartFolderNamed(smartType[1]);
          if (
            smartFolder &&
            gFolderTreeView.getIndexOfFolder(smartFolder) != null
          ) {
            return smartFolder;
          }
        }
        return folder;
      },

      /**
       * Handles the case of a new folder being added.
       *
       * - If a new special folder is added, we need to add it as a child of the
       *   corresponding smart folder.
       * - If the parent is a shallow special folder, we need to add it as a
       *   top-level folder in its account.
       * - Otherwise, we need to add it as a child of its parent (as normal).
       */
      onFolderAdded(aParent, aFolder) {
        // Add as child of corresponding smart folder.
        if (aFolder.flags & this._allSmartFlags) {
          let smartRoot = this._smartServer.rootFolder;
          // In theory, a folder can have multiple flags set, so we need to
          // check each flag separately.
          for (let [flag, name] of this._flagNameList) {
            if (aFolder.flags & flag) {
              gFolderTreeView._addSmartSubFolder(
                aFolder,
                smartRoot,
                name,
                flag
              );
            }
          }
          return;
        }

        // The parent is Smart Folder, add as child of the account.
        if (aParent.isSpecialFolder(this._allShallowFlags, false)) {
          let rootIndex = gFolderTreeView.getIndexOfFolder(
            aFolder.server.rootFolder
          );
          let root = gFolderTreeView._rowMap[rootIndex];
          if (!root) {
            return;
          }

          let newChild = new FtvSmartItem(aFolder);
          root.children.push(newChild);
          newChild._level = root._level + 1;
          newChild._parent = root;
          sortFolderItems(root._children);

          gFolderTreeView._addChildToView(root, rootIndex, newChild);
          return;
        }

        // Add as a normal folder.
        gFolderTreeView.addFolder(aParent, aFolder);
      },
    },
  },

  /**
   * This is a helper attribute that simply returns a flat list of all folders
   */
  get _enumerateFolders() {
    let folders = [];

    for (let server of MailServices.accounts.allServers) {
      // Skip deferred accounts
      if (
        server instanceof Ci.nsIPop3IncomingServer &&
        server.deferredToAccount
      ) {
        continue;
      }

      let rootFolder = server.rootFolder;
      folders.push(rootFolder);
      this.addSubFolders(rootFolder, folders);
    }
    return folders;
  },

  /**
   * This is a recursive function to add all subfolders to the array. It
   * assumes that the passed in folder itself has already been added.
   *
   * @param aFolder  the folder whose subfolders should be added
   * @param folders  the array to add the folders to.
   */
  addSubFolders(folder, folders) {
    for (let f of folder.subFolders) {
      folders.push(f);
      this.addSubFolders(f, folders);
    }
  },

  /**
   * This updates the rowmap and invalidates the right row(s) in the tree
   */
  _addChildToView(aParent, aParentIndex, aNewChild) {
    if (!aParent.open) {
      this.clearFolderCacheProperty(aParent, "properties");
      this._tree.invalidateRow(aParentIndex);
      return;
    }

    let newChildIndex;
    let newChildNum = aParent._children.indexOf(aNewChild);
    // only child - go right after our parent
    if (newChildNum == 0) {
      newChildIndex = Number(aParentIndex) + 1;
    } else if (newChildNum < aParent._children.length - 1) {
      // if we're not the last child, insert ourselves before the next child.
      newChildIndex = this.getIndexOfFolder(
        aParent._children[Number(newChildNum) + 1]._folder
      );
    } else {
      // otherwise, go after the last child
      let lastElementChild = aParent._children[newChildNum - 1];
      let lastChildIndex = this.getIndexOfFolder(lastElementChild._folder);
      newChildIndex = Number(lastChildIndex) + 1;
      while (
        newChildIndex < this.rowCount &&
        this._rowMap[newChildIndex].level > this._rowMap[lastChildIndex].level
      ) {
        newChildIndex++;
      }
    }
    this._rowMap.splice(newChildIndex, 0, aNewChild);
    this._tree.rowCountChanged(newChildIndex, 1);
  },

  _addSmartSubFolder(aItem, aSmartRoot, aName, aFlag) {
    let smartFolder = aSmartRoot.getChildWithURI(
      aSmartRoot.URI + "/" + encodeURI(aName),
      false,
      true
    );
    let parent = null;
    let parentIndex = -1;
    let newChild;
    let newChildIndex = 0;
    if (!smartFolder || this.getIndexOfFolder(smartFolder) == null) {
      newChild = new FtvSmartItem(aItem);
      newChild._level = 0;
      while (newChildIndex < this.rowCount) {
        // Skip the loop if we don't have a folder, meaning the current index
        // is a visible Mode Header.
        if (!this._rowMap[newChildIndex]._folder) {
          newChildIndex++;
          continue;
        }

        if (this._rowMap[newChildIndex]._folder.getFlag(aFlag)) {
          // This type of folder seems to already exist, so replace the row
          // with a smartFolder.
          this._addSmartFoldersForFlag(
            this._rowMap,
            this._sortedAccounts(),
            aSmartRoot,
            aFlag,
            aName,
            newChildIndex
          );
          return;
        }
        if (this._rowMap[newChildIndex]._folder.isServer) {
          break;
        }
        newChildIndex++;
      }
    } else {
      parentIndex = this.getIndexOfFolder(smartFolder);
      parent = this._rowMap[parentIndex];
      if (!parent) {
        return;
      }

      newChild = new FtvSmartItem(aItem);
      parent.children.push(newChild);
      newChild._level = parent._level + 1;
      newChild._parent = parent;
      sortFolderItems(parent._children);
      newChild.useServerNameOnly = true;
    }
    if (aItem.getFlag(Ci.nsMsgFolderFlags.Inbox)) {
      newChild.__defineGetter__("children", () => []);
    }
    if (parent) {
      this._addChildToView(parent, parentIndex, newChild);
    } else {
      this._rowMap.splice(newChildIndex, 0, newChild);
      this._tree.rowCountChanged(newChildIndex, 1);
    }
  },

  /**
   * This is our implementation of nsIMsgFolderListener to watch for changes
   */
  OnItemAdded(aParentItem, aItem) {
    // Ignore this item if it's not a folder, or we knew about it.
    if (
      !(aItem instanceof Ci.nsIMsgFolder) ||
      this.getIndexOfFolder(aItem) != null
    ) {
      return;
    }

    // if no parent, this is an account, so let's rebuild.
    if (!aParentItem) {
      if (!aItem.server.hidden) {
        // ignore hidden server items
        this._rebuild();
      }
      return;
    }

    for (let mode of this.activeModes) {
      this._modes[mode].onFolderAdded(
        aParentItem.QueryInterface(Ci.nsIMsgFolder),
        aItem
      );
    }

    // Force the rebuild of the tree if the user is using multiple modes at
    // once. This is to avoid showing multiple new folders in the same mode.
    // See bug 1696965.
    if (this.activeModes.length > 1) {
      this._rebuild();
    }
  },

  addFolder(aParentItem, aItem) {
    // This intentionally adds any new folder even if it would not pass the
    // _filterFunction. The idea is that the user can add new folders even
    // in modes like "unread" or "favorite" and could wonder why they
    // are not appearing (forgetting they do not meet the criteria of the view).
    // The folders will be hidden properly next time the view is rebuilt.
    let parentIndex = this.getIndexOfFolder(aParentItem);
    let parent = this._rowMap[parentIndex];
    if (!parent) {
      return;
    }

    // Getting these children might have triggered our parent to build its
    // array just now, in which case the added item will already exist
    let children = parent.children;
    let newChild;
    for (let child of children) {
      if (child._folder == aItem) {
        newChild = child;
        break;
      }
    }

    if (!newChild) {
      newChild = new FtvItem(aItem);
      parent.children.push(newChild);
      newChild._level = parent._level + 1;
      newChild._parent = parent;
      sortFolderItems(parent._children);
    }
    // If the parent is open, add the new child into the folder pane.
    // Otherwise, just invalidate the parent row. Note that this code doesn't
    // get called for the smart folder case.
    if (!parent.open) {
      // Special case adding a special folder when the parent is collapsed.
      // Expand the parent so the user can see the special child.
      // Expanding the parent is sufficient to add the folder to the view,
      // because either we knew about it, or we will have added a child item
      // for it above.
      if (newChild._folder.getFlag(Ci.nsMsgFolderFlags.SpecialUse)) {
        this._toggleRow(parentIndex, false);
        return;
      }
    }
    this._addChildToView(parent, parentIndex, newChild);
  },

  OnItemRemoved(aParentItem, aItem) {
    if (!(aItem instanceof Ci.nsIMsgFolder)) {
      return;
    }

    let index = this.getIndexOfFolder(aItem);
    if (index == null) {
      return;
    }

    this._persistItemClosed(aItem, index);

    // forget our parent's children; they'll get rebuilt
    if (aParentItem && this._rowMap[index]._parent) {
      this._rowMap[index]._parent._children = null;
    }
    let kidCount = 1;
    let walker = Number(index) + 1;
    while (
      walker < this.rowCount &&
      this._rowMap[walker].level > this._rowMap[index].level
    ) {
      walker++;
      kidCount++;
    }
    this._rowMap.splice(index, kidCount);
    this._tree.rowCountChanged(index, -1 * kidCount);
    this.clearFolderCacheProperty(aItem, "properties");
    this._tree.invalidateRow(index);

    if (aParentItem === null && MailServices.accounts.accounts.length === 0) {
      gFolderDisplay.show();
    }
  },

  OnItemPropertyChanged(aItem, aProperty, aOld, aNew) {},
  OnItemIntPropertyChanged(aItem, aProperty, aOld, aNew) {
    // First try mode specific handling of the changed property.
    for (let mode of this.activeModes) {
      if (
        this._modes[mode].handleChangedIntProperty(aItem, aProperty, aOld, aNew)
      ) {
        continue;
      }

      if (!(aItem instanceof Ci.nsIMsgFolder)) {
        return;
      }

      let index = this.getIndexOfFolder(aItem);
      let folder = aItem;
      let folderTreeMode = this._modes[mode];
      // look for first visible ancestor
      while (index == null) {
        folder = folderTreeMode.getParentOfFolder(folder);
        if (!folder) {
          break;
        }
        index = this.getIndexOfFolder(folder);
      }
      if (index != null) {
        this.clearFolderCacheProperty(folder, "properties");
        this._tree.invalidateRow(index);
      }
    }
  },

  OnItemBoolPropertyChanged(aItem, aProperty, aOld, aNew) {
    let index = this.getIndexOfFolder(aItem);
    if (index != null) {
      this.clearFolderCacheProperty(aItem, "properties");
      this._tree.invalidateRow(index);
    }
  },

  OnItemUnicharPropertyChanged(aItem, aProperty, aOld, aNew) {
    let index = this.getIndexOfFolder(aItem);
    if (index != null) {
      this.clearFolderCacheProperty(aItem, "properties");
      this._tree.invalidateRow(index);
    }
  },

  OnItemPropertyFlagChanged(aItem, aProperty, aOld, aNew) {},
  OnItemEvent(aFolder, aEvent) {
    let index = this.getIndexOfFolder(aFolder);
    if (index != null) {
      this.clearFolderCacheProperty(aFolder, "properties");
      this._tree.invalidateRow(index);
    }
  },

  /**
   * Append inline CSS style for those icons where a custom color was defined.
   *
   * @param {string} iconColor - The hash color.
   */
  appendColor(iconColor) {
    if (!this.folderColorStyle || !iconColor) {
      return;
    }

    // Append the new CSS styling.
    this.folderColorStyle.textContent += `treechildren::-moz-tree-image(folderNameCol, customColor-${iconColor.replace(
      "#",
      ""
    )}) {fill: ${iconColor};}`;
  },

  /**
   * Set the status of the compact mode, rebuild the tree, and update all the
   * menu items to reflect the newly selected state.
   *
   * @param {boolean} toggle - True if the compact mode needs to be activated.
   */
  toggleCompactMode(toggle) {
    // Interrupt if the tree hasn't been defined yet. This might happen on
    // startup if a user still has old deprecated folder modes from removed
    // extensions.
    if (!this._tree) {
      return;
    }

    this._tree.setAttribute("compact", toggle);
    Services.xulStore.persist(this._tree, "compact");
    this._rebuild();

    // Update the main App Menu.
    let appPanelItem = document.getElementById("appmenu_compactMode");
    if (appPanelItem) {
      appPanelItem.checked = toggle;
    }

    // Update the main Menu Bar.
    let menuItem = document.getElementById("menu_compactMode");
    if (menuItem) {
      menuItem.toggleAttribute("checked", toggle);
    }

    // Update the menupopup.
    let popup = document.getElementById("folderPaneOptionsPopup");
    // Interrupt if the popup has never been initialized.
    if (!popup.childNodes.length) {
      return;
    }

    let compactLabel = popup.querySelector(`[value="compact"]`);
    if (toggle) {
      compactLabel.setAttribute("checked", "true");
      return;
    }

    compactLabel.removeAttribute("checked");
  },
};

/**
 * The FtvItem object represents a single row in the tree view. Because I'm lazy
 * I'm just going to define the expected interface here.  You are free to return
 * an alternative object, provided that it matches this interface:
 *
 * id (attribute) - a unique string for this object. Must persist over sessions
 * text (attribute) - the text to display in the tree
 * level (attribute) - the level in the tree to display the item at
 * open (rw, attribute) - whether or not this container is open
 * children (attribute) - an array of child items also conforming to this spec
 * getProperties (function) - a call from getRowProperties or getCellProperties
 *                            for this item will be passed into this function
 * command (function) - this function will be called when the item is double-
 *                      clicked
 */

/**
 * The FtvItem constructor takes these arguments:
 *
 * @param aFolder        The folder attached to this row in the tree.
 * @param aFolderFilter  When showing children folders of this one,
 *                       only show those that pass this filter function.
 *                       If unset, show all subfolders.
 */
/**
 * The FtvItem constructor for the fodler row.
 *
 * @param {nsIMsgFolder} aFolder - The folder attached to this row in the tree.
 * @param {Function} [aFolderFilter] - When showing children folders of this
 *   one, only show those that pass this filter function. If null, show all
 *   subfolders.
 */
function FtvItem(aFolder, aFolderFilter) {
  this._folder = aFolder;
  this._level = 0;
  this._parent = null;
  this._folderFilter = aFolderFilter;
  // The map contains message counts for each folder column.
  // Each key is a column name (ID) from the folder tree.
  // Value is an array of the format "[value_for_folder, value_for_all_its_subfolders]".
  this._summarizedCounts = new Map();
}

FtvItem.prototype = {
  open: false,
  addServerName: false,
  useServerNameOnly: false,

  get id() {
    return this._folder.URI;
  },
  get text() {
    return this.getText("folderNameCol");
  },

  getText(aColName) {
    // Only show counts / total size of subtree if the pref is set,
    // we are in "All folders" mode and this folder row is not expanded.
    gFolderStatsHelpers.sumSubfolders =
      gFolderStatsHelpers.sumSubfoldersPref &&
      kDefaultMode in gFolderTreeView._modes &&
      this._folder.hasSubFolders &&
      !this.open;

    this._summarizedCounts.delete(aColName);
    switch (aColName) {
      case "folderNameCol":
        let text;
        if (this.useServerNameOnly) {
          text = this._folder.server.prettyName;
        } else {
          text = this._folder.abbreviatedName;
          if (this.addServerName) {
            text = gFolderTreeView.messengerBundle.getFormattedString(
              "folderWithAccount",
              [text, this._folder.server.prettyName]
            );
          }
        }

        // In a simple list tree we don't care for attributes other than folder name.
        if (gFolderTreeView._treeElement.getAttribute("simplelist") == "true") {
          return text;
        }

        // If the unread column is shown, we don't need to add the count
        // to the name.
        if (!document.getElementById("folderUnreadCol").hidden) {
          return text;
        }

        let unread = this._folder.getNumUnread(false);
        let totalUnread = gFolderStatsHelpers.sumSubfolders
          ? this._folder.getNumUnread(true)
          : unread;
        this._summarizedCounts.set(aColName, [unread, totalUnread - unread]);
        if (totalUnread > 0) {
          text = gFolderTreeView.messengerBundle.getFormattedString(
            "folderWithUnreadMsgs",
            [
              text,
              gFolderStatsHelpers.addSummarizedPrefix(
                totalUnread,
                unread != totalUnread
              ),
            ]
          );
        }
        return text;

      case "folderUnreadCol":
        let folderUnread = this._folder.getNumUnread(false);
        let subfoldersUnread = gFolderStatsHelpers.sumSubfolders
          ? this._folder.getNumUnread(true)
          : folderUnread;
        this._summarizedCounts.set(aColName, [
          folderUnread,
          subfoldersUnread - folderUnread,
        ]);
        return gFolderStatsHelpers.fixNum(
          subfoldersUnread,
          folderUnread != subfoldersUnread
        );

      case "folderTotalCol":
        let folderTotal = this._folder.getTotalMessages(false);
        let subfoldersTotal = gFolderStatsHelpers.sumSubfolders
          ? this._folder.getTotalMessages(true)
          : folderTotal;
        this._summarizedCounts.set(aColName, [
          folderTotal,
          subfoldersTotal - folderTotal,
        ]);
        return gFolderStatsHelpers.fixNum(
          subfoldersTotal,
          folderTotal != subfoldersTotal
        );

      case "folderSizeCol":
        let thisFolderSize = gFolderStatsHelpers.getFolderSize(this._folder);
        let subfoldersSize = gFolderStatsHelpers.sumSubfolders
          ? gFolderStatsHelpers.getSubfoldersSize(this._folder)
          : 0;

        if (
          subfoldersSize == gFolderStatsHelpers.kUnknownSize ||
          thisFolderSize == gFolderStatsHelpers.kUnknownSize
        ) {
          return gFolderStatsHelpers.kUnknownSize;
        }

        let totalSize = thisFolderSize + subfoldersSize;
        if (totalSize == 0) {
          return "";
        }

        let [totalText, folderUnit] = gFolderStatsHelpers.formatFolderSize(
          totalSize
        );
        let folderText =
          subfoldersSize == 0
            ? totalText
            : gFolderStatsHelpers.formatFolderSize(
                thisFolderSize,
                folderUnit
              )[0];
        let subfoldersText =
          subfoldersSize == 0
            ? ""
            : gFolderStatsHelpers.formatFolderSize(
                subfoldersSize,
                folderUnit
              )[0];
        this._summarizedCounts.set(aColName, [folderText, subfoldersText]);
        return gFolderStatsHelpers.addSummarizedPrefix(
          totalText,
          totalSize != thisFolderSize
        );

      default:
        return "";
    }
  },

  get level() {
    return this._level;
  },

  getProperties(aColumn) {
    if (aColumn && aColumn.id != "folderNameCol") {
      return "";
    }

    // Return the cached properties string if we have it.
    let cachedProperties = gFolderTreeView.getFolderCacheProperty(
      this._folder,
      "properties"
    );
    if (cachedProperties) {
      return cachedProperties;
    }

    // From folderUtils.jsm.
    let properties = getFolderProperties(this._folder, this.open);
    if (this._folder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
      properties += " specialFolder-Smart";
      // A second possibility for customized smart folders.
      properties += " specialFolder-" + this._folder.name.replace(/\s+/g, "");
    }

    // If there is a smartFolder name property, add it.
    let smartFolderName = getSmartFolderName(this._folder);
    if (smartFolderName) {
      properties += " specialFolder-" + smartFolderName.replace(/\s+/g, "");
    }

    let customColor = gFolderTreeView.getFolderCacheProperty(
      this._folder,
      "folderIconColor"
    );
    // Add the property if a custom color was defined for this folder.
    if (customColor) {
      properties += ` customColor-${customColor.replace("#", "")}`;
    }

    if (FeedUtils.isFeedFolder(this._folder)) {
      properties += FeedUtils.getFolderProperties(this._folder, null);
    }

    // Store the full properties string in the cache so we don't need to
    // generate it again if the row hasn't been invalidated.
    gFolderTreeView.setFolderCacheProperty(
      this._folder,
      "properties",
      properties
    );

    return properties;
  },

  command() {
    if (!Services.prefs.getBoolPref("mailnews.reuse_thread_window2")) {
      MsgOpenNewWindowForFolder(this._folder.URI, -1 /* key */);
    }
  },

  _children: null,
  get children() {
    // We're caching our child list to save perf.
    if (!this._children) {
      let subFolders;
      try {
        subFolders = this._folder.subFolders;
      } catch (ex) {
        Services.console.logStringMessage(
          "Discovering children for " +
            this._folder.URI +
            " failed with exception: " +
            ex
        );
        subFolders = [];
      }
      this._children = [];
      // Out of all children, only keep those that match the _folderFilter
      // and those that contain such children.
      for (let folder of subFolders) {
        if (!this._folderFilter || this._folderFilter(folder)) {
          this._children.push(new FtvItem(folder, this._folderFilter));
        }
      }
      sortFolderItems(this._children);
      // Each child is a level one below us
      for (let child of this._children) {
        child._level = this._level + 1;
        child._parent = this;
      }
    }
    return this._children;
  },
};

function FtvItemHeader(mode) {
  this._folder = null;
  this._name = gFolderTreeView.messengerBundle.getString(
    `folderPaneModeHeader_${mode}`
  );
  this._level = 0;
  this._parent = null;
  this._mode = mode;
}

FtvItemHeader.prototype = {
  get id() {
    return `folderView-${this._name}`;
  },

  get text() {
    return this._name;
  },

  getText(aColName) {
    return aColName == "folderNameCol" ? this._name : "";
  },

  get mode() {
    return this._mode;
  },

  getProperties(aColumn) {
    if (aColumn && aColumn.id != "folderNameCol") {
      return "";
    }

    let properties = "modeHeader";
    // If this is the first visible header, add another property to remove the
    // CSS border top.
    if (gFolderTreeView._rowMap[0].id == this.id) {
      properties += " firstHeader";
    }

    return properties;
  },

  command() {},

  _children: null,
  get children() {
    return [];
  },
};
/**
 * This handles the invocation of most commands dealing with folders, based off
 * of the current selection, or a passed in folder.
 */
var gFolderTreeController = {
  /**
   * Opens the dialog to create a new sub-folder, and creates it if the user
   * accepts.
   *
   * @param {?nsIMsgFolder} aParent - The parent for the new subfolder.
   */
  newFolder(aParent) {
    let folder = aParent || gFolderTreeView.getSelectedFolders()[0];

    // Make sure we actually can create subfolders.
    if (!folder.canCreateSubfolders) {
      // Check if we can create them at the root, otherwise use the default
      // account as root folder.
      let rootMsgFolder = folder.server.rootMsgFolder;
      folder = rootMsgFolder.canCreateSubfolders
        ? rootMsgFolder
        : GetDefaultAccountRootFolder();
    }

    if (!folder) {
      return;
    }

    let dualUseFolders = true;
    if (folder.server instanceof Ci.nsIImapIncomingServer) {
      dualUseFolders = folder.server.dualUseFolders;
    }

    function newFolderCallback(aName, aFolder) {
      // createSubfolder can throw an exception, causing the newFolder dialog
      // to not close and wait for another input.
      // TODO: Rewrite this logic and also move the opening of alert dialogs from
      // nsMsgLocalMailFolder::CreateSubfolderInternal to here (bug 831190#c16).
      if (!aName) {
        return;
      }
      aFolder.createSubfolder(aName, msgWindow);
      // Don't call the rebuildAfterChange() here as we'll need to wait for the
      // new folder to be properly created before rebuilding the tree.
    }

    window.openDialog(
      "chrome://messenger/content/newFolderDialog.xhtml",
      "",
      "chrome,modal,resizable=no,centerscreen",
      { folder, dualUseFolders, okCallback: newFolderCallback }
    );
  },

  /**
   * Opens the dialog to edit the properties for a folder
   *
   * @param aTabID  (optional) the tab to show in the dialog
   * @param aFolder (optional) the folder to edit, if not the selected one
   */
  editFolder(aTabID, aFolder) {
    let folder = aFolder || gFolderTreeView.getSelectedFolders()[0];

    // If this is actually a server, send it off to that controller
    if (folder.isServer) {
      MsgAccountManager(null, folder.server);
      return;
    }

    if (folder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
      this.editVirtualFolder(folder);
      return;
    }
    let title = gFolderTreeView.messengerBundle.getString("folderProperties");

    // xxx useless param
    function editFolderCallback(aNewName, aOldName, aUri) {
      if (aNewName != aOldName) {
        folder.rename(aNewName, msgWindow);
        gFolderTreeView.rebuildAfterChange();
      }
    }

    // xxx useless param
    function rebuildSummary(aFolder) {
      // folder is already introduced in our containing function and is
      // lexically captured and available to us.
      if (folder.locked) {
        folder.throwAlertMsg("operationFailedFolderBusy", msgWindow);
        return;
      }
      if (folder.supportsOffline) {
        // Remove the offline store, if any.
        let offlineStore = folder.filePath;
        // XXX todo: figure out how to delete a maildir directory async. This
        // delete causes main thread lockup for large maildir folders.
        if (offlineStore.exists()) {
          offlineStore.remove(true);
        }
      }

      // We may be rebuilding a folder that is not the displayed one.
      let sameFolder = gFolderDisplay.displayedFolder == folder;
      if (sameFolder) {
        gFolderDisplay.view.close();
      }

      // Send a notification that we are triggering a database rebuild.
      MailServices.mfn.notifyFolderReindexTriggered(folder);

      folder.msgDatabase.summaryValid = false;

      var msgDB = folder.msgDatabase;
      msgDB.summaryValid = false;
      try {
        folder.closeAndBackupFolderDB("");
      } catch (e) {
        // In a failure, proceed anyway since we're dealing with problems
        folder.ForceDBClosed();
      }
      folder.updateFolder(msgWindow);
      if (sameFolder) {
        gFolderDisplay.show(folder);
      }
    }

    window.openDialog(
      "chrome://messenger/content/folderProps.xhtml",
      "",
      "chrome,modal,centerscreen",
      {
        folder,
        treeView: gFolderTreeView,
        serverType: folder.server.type,
        msgWindow,
        title,
        okCallback: editFolderCallback,
        tabID: aTabID,
        name: folder.prettyName,
        rebuildSummaryCallback: rebuildSummary,
        previewSelectedColorCallback:
          gFolderTreeController.previewSelectedColor,
        clearFolderSelectionCallback:
          gFolderTreeController.clearFolderSelection,
        selectFolderCallback: gFolderTreeController.selectFolder,
        updateColorCallback: gFolderTreeController.updateColor,
      }
    );
  },

  /**
   * Opens the dialog to rename a particular folder, and does the renaming if
   * the user clicks OK in that dialog
   *
   * @param aFolder (optional)  the folder to rename, if different than the
   *                            currently selected one
   */
  renameFolder(aFolder) {
    let folder = aFolder || gFolderTreeView.getSelectedFolders()[0];

    // xxx no need for uri now
    let controller = this;
    function renameCallback(aName, aUri) {
      if (aUri != folder.URI) {
        Cu.reportError("got back a different folder to rename!");
      }

      controller._tree.view.selection.clearSelection();

      // Actually do the rename.
      folder.rename(aName, msgWindow);
      gFolderTreeView.rebuildAfterChange();
    }
    window.openDialog(
      "chrome://messenger/content/renameFolderDialog.xhtml",
      "",
      "chrome,modal,centerscreen",
      {
        preselectedURI: folder.URI,
        okCallback: renameCallback,
        name: folder.prettyName,
      }
    );
  },

  /**
   * Deletes a folder from its parent. Also handles unsubscribe from newsgroups
   * if the selected folder/s happen to be nntp.
   *
   * @param aFolder (optional) the folder to delete, if not the selected one
   */
  deleteFolder(aFolder) {
    let folders = aFolder ? [aFolder] : gFolderTreeView.getSelectedFolders();
    let folder = folders[0];

    // For newsgroups, "delete" means "unsubscribe".
    if (
      folder.server.type == "nntp" &&
      !folder.getFlag(Ci.nsMsgFolderFlags.Virtual)
    ) {
      MsgUnsubscribe(folders);
      return;
    }

    var canDelete = folder.isSpecialFolder(Ci.nsMsgFolderFlags.Junk, false)
      ? CanRenameDeleteJunkMail(folder.URI)
      : folder.deletable;

    if (!canDelete) {
      throw new Error("Can't delete folder: " + folder.name);
    }

    if (folder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
      let confirmation = gFolderTreeView.messengerBundle.getString(
        "confirmSavedSearchDeleteMessage"
      );
      let title = gFolderTreeView.messengerBundle.getString(
        "confirmSavedSearchTitle"
      );
      if (
        Services.prompt.confirmEx(
          window,
          title,
          confirmation,
          Services.prompt.STD_YES_NO_BUTTONS +
            Services.prompt.BUTTON_POS_1_DEFAULT,
          "",
          "",
          "",
          "",
          {}
        ) != 0
      ) {
        /* the yes button is in position 0 */
        return;
      }
    }

    try {
      folder.deleteSelf(msgWindow);
    } catch (ex) {
      // Ignore known errors from canceled warning dialogs.
      const NS_MSG_ERROR_COPY_FOLDER_ABORTED = 0x8055001a;
      if (ex.result != NS_MSG_ERROR_COPY_FOLDER_ABORTED) {
        throw ex;
      }
    }

    gFolderTreeView.rebuildAfterChange();
  },

  /**
   * Prompts the user to confirm and empties the trash for the selected folder.
   * The folder and its children are only emptied if it has the proper Trash flag.
   *
   * @param aFolder (optional)  The trash folder to empty. If unspecified or not
   *                            a trash folder, the currently selected server's
   *                            trash folder is used.
   */
  emptyTrash(aFolder) {
    let folder = aFolder || gFolderTreeView.getSelectedFolders()[0];
    if (!folder.getFlag(Ci.nsMsgFolderFlags.Trash)) {
      folder = folder.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Trash);
    }
    if (!folder) {
      return;
    }

    if (!this._checkConfirmationPrompt("emptyTrash", folder)) {
      return;
    }

    // Check if this is a top-level smart folder. If so, we're going
    // to empty all the trash folders.
    if (folder.server.hostName == "smart mailboxes" && folder.parent.isServer) {
      let subFolders = gFolderTreeView._allFoldersWithFlag(
        gFolderTreeView._sortedAccounts(),
        Ci.nsMsgFolderFlags.Trash,
        false
      );
      for (let trash of subFolders) {
        trash.emptyTrash(msgWindow, null);
      }
    } else {
      folder.emptyTrash(msgWindow, null);
    }
    gFolderTreeView.rebuildAfterChange();
  },

  /**
   * Deletes everything (folders and messages) in the selected folder.
   * The folder is only emptied if it has the proper Junk flag.
   *
   * @param aFolder (optional)  The folder to empty. If unspecified, the currently
   *                            selected folder is used, if it is junk.
   */
  emptyJunk(aFolder) {
    let folder = aFolder || gFolderTreeView.getSelectedFolders()[0];

    if (!folder || !folder.getFlag(Ci.nsMsgFolderFlags.Junk)) {
      return;
    }

    if (!this._checkConfirmationPrompt("emptyJunk", folder)) {
      return;
    }

    // Delete any subfolders this folder might have
    for (let subFolder of folder.subFolders) {
      folder.propagateDelete(subFolder, true, msgWindow);
    }

    // Now delete the messages
    folder.deleteMessages(
      [...folder.messages],
      msgWindow,
      true,
      false,
      null,
      false
    );

    gFolderTreeView.rebuildAfterChange();
  },

  /**
   * Compacts either particular folder/s, or selected folders.
   *
   * @param aFolders (optional) the folders to compact, if different than the
   *                            currently selected ones
   */
  compactFolders(aFolders) {
    let folders = aFolders || gFolderTreeView.getSelectedFolders();
    for (let i = 0; i < folders.length; i++) {
      // Can't compact folders that have just been compacted.
      if (folders[i].server.type != "imap" && !folders[i].expungedBytes) {
        continue;
      }

      folders[i].compact(null, msgWindow);
    }
  },

  /**
   * Compacts all folders for accounts that the given folders belong
   * to, or all folders for accounts of the currently selected folders.
   *
   * @param aFolders (optional) the folders for whose accounts we should compact
   *                            all folders, if different than the currently
   *                            selected ones
   */
  compactAllFoldersForAccount(aFolders) {
    let folders = aFolders || gFolderTreeView.getSelectedFolders();
    for (let i = 0; i < folders.length; i++) {
      folders[i].compactAll(
        null,
        msgWindow,
        folders[i].server.type == "imap" || folders[i].server.type == "nntp"
      );
    }
  },

  /**
   * Opens the dialog to create a new virtual folder
   *
   * @param aName - the default name for the new folder
   * @param aSearchTerms - the search terms associated with the folder
   * @param aParent - the folder to run the search terms on
   */
  newVirtualFolder(aName, aSearchTerms, aParent) {
    let folder =
      aParent ||
      gFolderTreeView.getSelectedFolders()[0] ||
      GetDefaultAccountRootFolder();
    if (!folder) {
      return;
    }

    let name = folder.prettyName;
    if (aName) {
      name += "-" + aName;
    }

    window.openDialog(
      "chrome://messenger/content/virtualFolderProperties.xhtml",
      "",
      "chrome,modal,centerscreen",
      { folder, searchTerms: aSearchTerms, newFolderName: name }
    );
  },

  editVirtualFolder(aFolder) {
    let folder = aFolder || gFolderTreeView.getSelectedFolders()[0];

    // xxx should pass the folder object
    function editVirtualCallback(aURI) {
      // we need to reload the folder if it is the currently loaded folder...
      if (
        gFolderDisplay.displayedFolder &&
        aURI == gFolderDisplay.displayedFolder.URI
      ) {
        FolderPaneSelectionChange();
        gFolderTreeView.rebuildAfterChange();
      }
    }
    window.openDialog(
      "chrome://messenger/content/virtualFolderProperties.xhtml",
      "",
      "chrome,modal,centerscreen",
      {
        folder,
        treeView: gFolderTreeView,
        editExistingFolder: true,
        onOKCallback: editVirtualCallback,
        previewSelectedColorCallback:
          gFolderTreeController.previewSelectedColor,
        clearFolderSelectionCallback:
          gFolderTreeController.clearFolderSelection,
        selectFolderCallback: gFolderTreeController.selectFolder,
        updateColorCallback: gFolderTreeController.updateColor,
        msgWindow,
      }
    );
  },

  /**
   * Opens a search window with the given folder, or the selected one if none
   * is given.
   *
   * @param [aFolder] the folder to open the search window for, if different
   *                  from the selected one
   */
  searchMessages(aFolder) {
    MsgSearchMessages(aFolder || gFolderTreeView.getSelectedFolders()[0]);
  },

  /**
   * Prompts for confirmation, if the user hasn't already chosen the "don't ask
   * again" option.
   *
   * @param aCommand  the command to prompt for
   * @param aFolder   The folder for which the confirmation is requested.
   */
  _checkConfirmationPrompt(aCommand, aFolder) {
    // If no folder was specified, reject the operation.
    if (!aFolder) {
      return false;
    }

    let showPrompt = !Services.prefs.getBoolPref(
      "mailnews." + aCommand + ".dontAskAgain",
      false
    );

    if (showPrompt) {
      let checkbox = { value: false };
      let title = gFolderTreeView.messengerBundle.getFormattedString(
        aCommand + "FolderTitle",
        [aFolder.prettyName]
      );
      let msg = gFolderTreeView.messengerBundle.getString(
        aCommand + "FolderMessage"
      );
      let ok =
        Services.prompt.confirmEx(
          window,
          title,
          msg,
          Services.prompt.STD_YES_NO_BUTTONS,
          null,
          null,
          null,
          gFolderTreeView.messengerBundle.getString(aCommand + "DontAsk"),
          checkbox
        ) == 0;
      if (checkbox.value) {
        Services.prefs.setBoolPref(
          "mailnews." + aCommand + ".dontAskAgain",
          true
        );
      }
      if (!ok) {
        return false;
      }
    }
    return true;
  },

  get _tree() {
    let tree = document.getElementById("folderTree");
    delete this._tree;
    return (this._tree = tree);
  },

  /**
   * Update the inline preview style in the messagener.xhtml file to show
   * users a preview of the defined color.
   *
   * @param {FtvItem} folder - The folder where the color is defined.
   * @param {string} newColor - The new hash color to preview.
   */
  previewSelectedColor(folder, newColor) {
    // If the color is null, it means we're resetting to the default value.
    if (!newColor) {
      gFolderTreeView.setFolderCacheProperty(folder, "folderIconColor", "");

      // Clear the preview CSS.
      gFolderTreeView.folderColorPreview.textContent = "";

      // Remove the stored value from the json map if present.
      gFolderTreeView._removeCustomColor(folder.URI);

      // Remove the cached folder properties.
      gFolderTreeView.clearFolderCacheProperty(folder, "properties");

      // Force the folder update to see the new color.
      gFolderTreeView._tree.invalidateRow(
        gFolderTreeView.getIndexOfFolder(folder)
      );
      return;
    }

    // Add the new color property.
    gFolderTreeView.setFolderCacheProperty(folder, "folderIconColor", newColor);

    let selector = `customColor-${newColor.replace("#", "")}`;
    // Add the inline CSS styling.
    gFolderTreeView.folderColorPreview.textContent = `treechildren::-moz-tree-image(folderNameCol, ${selector}) {fill: ${newColor};}`;

    // Remove the cached folder properties.
    gFolderTreeView.clearFolderCacheProperty(folder, "properties");

    // Force the folder update to set the new color.
    gFolderTreeView._tree.invalidateRow(
      gFolderTreeView.getIndexOfFolder(folder)
    );
  },

  /**
   * Clear the preview style and add the new selected color to the persistent
   * inline style in the messenger.xhtml file.
   *
   * @param {FtvItem} folder - The folder where the new color was defined.
   */
  updateColor(folder) {
    // Clear the preview CSS.
    gFolderTreeView.folderColorPreview.textContent = "";

    let newColor = gFolderTreeView.getFolderCacheProperty(
      folder,
      "folderIconColor"
    );

    // Store the new color in the json map.
    gFolderTreeView._addCustomColor(folder.URI, newColor);

    // Remove the cached folder properties.
    gFolderTreeView.clearFolderCacheProperty(folder, "properties");

    // Force the folder update to set the new color.
    gFolderTreeView._tree.invalidateRow(
      gFolderTreeView.getIndexOfFolder(folder)
    );
  },

  /**
   * Force the clear of the selection when the color picker is opened to allow
   * users to see the color preview.
   */
  clearFolderSelection() {
    gFolderTreeView.selection.clearSelection();
  },

  /**
   * Restore the selection to the folder that opened the properties dialog after
   * the user interacted with the color picker. We use this simple method to
   * quickly restore the selection instead of using the
   * gFolderTreeView.selectFolder() as we don't need to go through all those
   * conditions.
   *
   * @param {FtvItem} folder - The folder where the color was edited.
   */
  selectFolder(folder) {
    gFolderTreeView.selection.select(gFolderTreeView.getIndexOfFolder(folder));
  },
};

/**
 * Constructor for FtvSmartItem. This is a top level item in the "smart"
 * (a.k.a. "Unified") folder mode.
 */
function FtvSmartItem(aFolder) {
  FtvItem.call(this, aFolder); // call super constructor
  this._level = 0;
}

FtvSmartItem.prototype = {
  __proto__: FtvItem.prototype,
  get children() {
    let smartMode = gFolderTreeView.getFolderTreeMode("smart");

    // We're caching our child list to save perf.
    if (!this._children) {
      this._children = [];
      for (let folder of this._folder.subFolders) {
        if (!smartMode.isSmartFolder(folder)) {
          this._children.push(new FtvSmartItem(folder));
        } else if (folder.getFlag(Ci.nsMsgFolderFlags.Inbox)) {
          for (let subfolder of folder.subFolders) {
            if (!smartMode.isSmartFolder(subfolder)) {
              this._children.push(new FtvSmartItem(subfolder));
            }
          }
        }
      }
      sortFolderItems(this._children);
      // Each child is a level one below us
      for (let child of this._children) {
        child._level = this._level + 1;
        child._parent = this;
      }
    }
    return this._children;
  },
};

/**
 * Sorts the passed array of folder items using the folder sort key.
 *
 * @param {?FtvItem[]} aFtvItems - The array of FtvItems to sort.
 */
function sortFolderItems(aFtvItems) {
  // Interrupt if no array has been passed. E.g. This might happen if an account
  // was configured but it never properly connected.
  if (!aFtvItems) {
    return;
  }

  function sorter(a, b) {
    return a._folder.compareSortKeys(b._folder);
  }
  aFtvItems.sort(sorter);
}

/**
 * An extension wishing to set a folderpane tree property must use
 * gFolderTreeView.setFolderCacheProperty(). Due to severe perf and memory
 * issues, direct access by nsITreeView methods to any call which opens a
 * folder's msgDatabase is disallowed.
 *
 * Example:
 *   gFolderTreeView.setFolderCacheProperty(folder, // nsIMsgFolder
 *                                          "smartFolderName",
 *                                          "My Smart Folder");
 * Note: for css styling using nsITreeView pseudo elements, the name property
 * is returned with all spaces removed, eg |specialFolder-MySmartFolder|.
 *
 * @param nsIMsgFolder aFolder  - The folder.
 * @return property || null     - Cached property value, or null if not set.
 */
function getSmartFolderName(aFolder) {
  return gFolderTreeView.getFolderCacheProperty(aFolder, "smartFolderName");
}

function setSmartFolderName(aFolder, aName) {
  gFolderTreeView.setFolderCacheProperty(aFolder, "smartFolderName", aName);
}

var gFolderStatsHelpers = {
  kUnknownSize: "-",
  sumSubfoldersPref: false,
  sumSubfolders: false,
  sizeUnits: "",
  kiloUnit: "KB",
  megaUnit: "MB",

  init() {
    // We cache these values because the cells in the folder pane columns
    // using these helpers can be redrawn often.
    this.sumSubfoldersPref = Services.prefs.getBoolPref(
      "mail.folderpane.sumSubfolders"
    );
    this.sizeUnits = Services.prefs.getCharPref("mail.folderpane.sizeUnits");
    this.kiloUnit = gFolderTreeView.messengerBundle.getString(
      "kiloByteAbbreviation2"
    );
    this.megaUnit = gFolderTreeView.messengerBundle.getString(
      "megaByteAbbreviation2"
    );
  },

  /**
   * Add a prefix to denote the value is actually a sum of all the subfolders.
   * The prefix is useful as this sum may not always be the exact sum of individual
   * folders when they are shown expanded (due to rounding to a unit).
   * E.g. folder1 600bytes -> 1KB, folder2 700bytes -> 1KB
   * summarized at parent folder: 1300bytes -> 1KB
   *
   * @param aValue                  The value to be displayed.
   * @param aSubfoldersContributed  Boolean indicating whether subfolders
   *                                contributed to the accumulated total value.
   */
  addSummarizedPrefix(aValue, aSubfoldersContributed) {
    if (!this.sumSubfolders) {
      return aValue;
    }

    if (!aSubfoldersContributed) {
      return aValue;
    }

    return gFolderTreeView.messengerBundle.getFormattedString(
      "folderSummarizedSymbolValue",
      [aValue]
    );
  },

  /**
   * nsIMsgFolder uses -1 as a magic number to mean "I don't know". In those
   * cases we indicate it to the user. The user has to open the folder
   * so that the property is initialized from the DB.
   *
   * @param aNumber                 The number to translate for the user.
   * @param aSubfoldersContributed  Boolean indicating whether subfolders
   *                                contributed to the accumulated total value.
   */
  fixNum(aNumber, aSubfoldersContributed) {
    if (aNumber < 0) {
      return this.kUnknownSize;
    }

    return aNumber == 0
      ? ""
      : this.addSummarizedPrefix(aNumber, aSubfoldersContributed);
  },

  /**
   * Get the size of the specified folder.
   *
   * @param aFolder  The nsIMsgFolder to analyze.
   */
  getFolderSize(aFolder) {
    let folderSize = 0;
    try {
      folderSize = aFolder.sizeOnDisk;
      if (folderSize < 0) {
        return this.kUnknownSize;
      }
    } catch (ex) {
      return this.kUnknownSize;
    }
    return folderSize;
  },

  /**
   * Get the total size of all subfolders of the specified folder.
   *
   * @param aFolder  The nsIMsgFolder to analyze.
   */
  getSubfoldersSize(aFolder) {
    let folderSize = 0;
    if (aFolder.hasSubFolders) {
      for (let subFolder of aFolder.subFolders) {
        let subSize = this.getFolderSize(subFolder);
        let subSubSize = this.getSubfoldersSize(subFolder);
        if (subSize == this.kUnknownSize || subSubSize == this.kUnknownSize) {
          return subSize;
        }

        folderSize += subSize + subSubSize;
      }
    }
    return folderSize;
  },

  /**
   * Format the given folder size into a string with an appropriate unit.
   *
   * @param aSize  The size in bytes to format.
   * @param aUnit  Optional unit to use for the format.
   *               Possible values are "KB" or "MB".
   * @return       An array with 2 values. First is the resulting formatted strings.
   *               The second one is the final unit used to format the string.
   */
  formatFolderSize(aSize, aUnit = gFolderStatsHelpers.sizeUnits) {
    let size = Math.round(aSize / 1024);
    let unit = gFolderStatsHelpers.kiloUnit;
    // If size is non-zero try to show it in a unit that fits in 3 digits,
    // but if user specified a fixed unit, use that.
    if (aUnit != "KB" && (size > 999 || aUnit == "MB")) {
      size = Math.round(size / 1024);
      unit = gFolderStatsHelpers.megaUnit;
      aUnit = "MB";
    }
    // This needs to be updated if the "%.*f" placeholder string
    // in "*ByteAbbreviation2" in messenger.properties changes.
    return [unit.replace("%.*f", size).replace(" ", ""), aUnit];
  },
};
