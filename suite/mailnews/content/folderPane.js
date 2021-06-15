/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Implements a tree of folders. It shows icons depending on folder type
// and other fancy styling.
// This is used in the main folder pane, but also some dialogs that need
// to show a nice list of folders.

var { FeedUtils } =
  ChromeUtils.import("resource:///modules/FeedUtils.jsm");
var { folderUtils } =
  ChromeUtils.import("resource:///modules/folderUtils.jsm");
var { IOUtils } =
  ChromeUtils.import("resource:///modules/IOUtils.js");
var { IteratorUtils } =
  ChromeUtils.import("resource:///modules/iteratorUtils.jsm");
var { mailServices } =
  ChromeUtils.import("resource:///modules/mailServices.js");
var { MailUtils } =
  ChromeUtils.import("resource:///modules/MailUtils.js");
var { Services } =
  ChromeUtils.import("resource://gre/modules/Services.jsm");

if (typeof FeedMessageHandler != "object") {
  Services.scriptloader.loadSubScript("chrome://messenger-newsblog/content/newsblogOverlay.js");
}

const kDefaultMode = "all";

/**
  * This file contains the controls and functions for the folder pane.
  * The following definitions will be useful to know:
  *
  * gFolderTreeView - the controller for the folder tree.
  * ftvItem  - folder tree view item, representing a row in the tree
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
let IFolderTreeMode = {
  /**
   * Generates the folder map for this mode.
   *
   * @param aFolderTreeView The gFolderTreeView for which this mode is being
   *     activated.
   *
   * @returns An array containing ftvItem instances representing the top-level
   *     folders in this view.
   */
  generateMap: function IFolderTreeMode_generateMap(aFolderTreeView) {
    return null;
  },

  /**
   * Given an nsIMsgFolder, returns its parent in the map. The default behaviour
   * is to return the folder's actual parent (aFolder.parent). Folder tree modes
   * may decide to override it.
   *
   * If the parent isn't easily computable given just the folder, you may
   * consider generating the entire ftvItem tree at once and using a map from
   * folders to ftvItems.
   *
   * @returns an nsIMsgFolder representing the parent of the folder in the view,
   *     or null if the folder is a top-level folder in the map. It is expected
   *     that the returned parent will have the given folder as one of its
   *     children.
   * @note This function need not guarantee that either the folder or its parent
   *       is actually in the view.
   */
  getParentOfFolder: function IFolderTreeMode_getParentOfFolder(aFolder) {
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
   *
   * @returns The folder the message header is considered to be contained in, in
   *     this mode. The returned folder may or may not actually be in the view
   *     -- however, given a valid nsIMsgDBHdr, it is expected that a) a
   *     non-null folder is returned, and that b) the folder that is returned
   *     actually does contain the message header.
   */
  getFolderForMsgHdr: function IFolderTreeMode_getFolderForMsgHdr(aMsgHdr) {
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
  onFolderAdded: function IFolderTreeMode_onFolderAdded(aParent, aFolder) {
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
  handleChangedIntProperty: function(aItem, aProperty, aOld, aNew) {
    return false;
  }
};

/**
 * This is our controller for the folder-tree. It includes our nsITreeView
 * implementation, as well as other control functions.
 */
let gFolderTreeView = {
  messengerBundle: null,

  /**
   * Called when the window is initially loaded.  This function initializes the
   * folder-pane to the view last shown before the application was closed.
   */
  load: function ftv_load(aTree, aJSONFile) {
    this._treeElement = aTree;
    this.messengerBundle = document.getElementById("bundle_messenger");

    // The folder pane can be used for other trees which may not have these
    // elements.
    if (document.getElementById("folderpane-splitter"))
      document.getElementById("folderpane-splitter").collapsed = false;
    if (document.getElementById("folderPaneBox"))
      document.getElementById("folderPaneBox").collapsed = false;

    if (aJSONFile) {
      // Parse our persistent-open-state json file.
      let data = IOUtils.loadFileToString(aJSONFile);
      if (data) {
        try {
          this._persistOpenMap = JSON.parse(data);
        } catch (x) {
          Cu.reportError(gFolderTreeView.messengerBundle.getFormattedString("failedToReadFile", [aJSONFile, x]));
        }
      }
    }

    // Load our data.
    this._rebuild();
    // And actually draw the tree.
    aTree.view = this;

    gFolderStatsHelpers.init();

    // Add this listener so that we can update the tree when things change.
    MailServices.mailSession.AddFolderListener(this, Ci.nsIFolderListener.all);
  },

  /**
   * Called when the window is being torn down.  Here we undo everything we did
   * onload.  That means removing our listener and serializing our JSON.
   */
  unload: function ftv_unload(aJSONFile) {
    // Remove our listener.
    MailServices.mailSession.RemoveFolderListener(this);

    if (aJSONFile) {
      // Write out our json file...
      let data = JSON.stringify(this._persistOpenMap);
      IOUtils.saveStringToFile(aJSONFile, data);
    }
  },

  /**
   * Extensions can use this function to add a new mode to the folder pane.
   *
   * @param aCommonName  an internal name to identify this mode. Must be unique
   * @param aMode An implementation of |IFolderTreeMode| for this mode.
   * @param aDisplayName  a localized name for this mode
   */
  registerFolderTreeMode: function ftv_registerFolderTreeMode(aCommonName,
                                                              aMode,
                                                              aDisplayName) {
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
  unregisterFolderTreeMode: function ftv_unregisterFolderTreeMode(aCommonName) {
    this._modeNames.splice(this._modeNames.indexOf(aCommonName), 1);
    delete this._modes[aCommonName];
    delete this._modeDisplayNames[aCommonName];
    if (this._mode == aCommonName)
      this.mode = kDefaultMode;
  },

  /**
   * Retrieves a specific mode object
   * @param aCommonName  the common-name with which the mode was previously
   *                     registered
   */
  getFolderTreeMode: function ftv_getFolderTreeMode(aCommonName) {
    return this._modes[aCommonName];
  },

  /**
   * Called to move to the next/prev folder-mode in the list
   *
   * @param aForward  whether or not we should move forward in the list
   */
  cycleMode: function ftv_cycleMode(aForward) {
    let index = this._modeNames.indexOf(this.mode);
    let offset = aForward ? 1 : this._modeNames.length - 1;
    index = (index + offset) % this._modeNames.length;

    this.mode = this._modeNames[index];
  },

  /**
   * If the hidden pref is set, then double-clicking on a folder should open it
   *
   * @param event  the double-click event
   */
  onDoubleClick: function ftv_onDoubleClick(aEvent) {
    if (aEvent.button != 0 || aEvent.originalTarget.localName == "twisty" ||
        aEvent.originalTarget.localName == "slider" ||
        aEvent.originalTarget.localName == "scrollbarbutton")
      return;

    let row = gFolderTreeView._treeElement.treeBoxObject.getRowAt(aEvent.clientX,
                                                                  aEvent.clientY);
    let folderItem = gFolderTreeView._rowMap[row];
    if (folderItem)
      folderItem.command();

    // Don't let the double-click toggle the open state of the folder here.
    aEvent.stopPropagation();
  },

  getFolderAtCoords: function ftv_getFolderAtCoords(aX, aY) {
    let row = gFolderTreeView._treeElement.treeBoxObject.getRowAt(aX, aY);
    if (row in gFolderTreeView._rowMap)
      return gFolderTreeView._rowMap[row]._folder;
    return null;
  },

  /**
   * A string representation for the current display-mode.  Each value here must
   * correspond to an entry in _modes
   */
  _mode: null,
  get mode() {
    if (!this._mode) {
      this._mode = this._treeElement.getAttribute("mode");
      // This can happen when an extension is removed.
      if (!(this._mode in this._modes))
        this._mode = kDefaultMode;
    }
    return this._mode;
  },

  /**
   * @param aMode  The final name of the mode to switch to.
   */
  set mode(aMode) {
    // Ignore unknown modes.
    if (!(aMode in this._modes))
      return;

    this._mode = aMode;

    // Store current mode and actually build the folder pane.
    this._treeElement.setAttribute("mode", this._mode);
    this._rebuild();
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
  selectFolder: function ftv_selectFolder(aFolder, aForceSelect = false) {
    // "this" inside the nested function refers to the function...
    // Also note that openIfNot is recursive.
    let tree = this;
    let folderTreeMode = this._modes[this._mode];
    function openIfNot(aFolderToOpen) {
      let index = tree.getIndexOfFolder(aFolderToOpen);
      if (index != null) {
        if (!tree._rowMap[index].open)
          tree._toggleRow(index, false);
        return true;
      }

      // Not found, so open the parent.
      let parent = folderTreeMode.getParentOfFolder(aFolderToOpen);
      if (parent && openIfNot(parent)) {
        // Now our parent is open, so we can open ourselves.
        index = tree.getIndexOfFolder(aFolderToOpen);
        if (index != null) {
          tree._toggleRow(index, false);
          return true;
        }
      }

      // No way we can find the folder now.
      return false;
    }
    let parent = folderTreeMode.getParentOfFolder(aFolder);
    if (parent)
      openIfNot(parent);

    let folderIndex = tree.getIndexOfFolder(aFolder);
    if (folderIndex == null) {
      if (aForceSelect) {
        // Switch to the default mode. The assumption here is that the default
        // mode can display every folder.
        this.mode = kDefaultMode;
        // We don't want to get stuck in an infinite recursion,
        // so pass in false.
        return this.selectFolder(aFolder, false);
      }

      return false;
    }

    this.selection.select(folderIndex);
    this._treeElement.treeBoxObject.ensureRowIsVisible(folderIndex);
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
  getIndexOfFolder: function ftv_getIndexOfFolder(aFolder) {
    for (let [iRow, row] of this._rowMap.entries()) {
      if (row.id == aFolder.URI)
        return iRow;
    }
    return null;
  },

  /**
   * Returns the folder for an index in the current display.
   *
   * @param aIndex the index for which the folder should be returned.
   * @note If the index is out of bounds, this function returns null.
   */
  getFolderForIndex: function ftv_getFolderForIndex(aIndex) {
    if (aIndex < 0 || aIndex >= this._rowMap.length)
      return null;
    return this._rowMap[aIndex]._folder;
  },

  /**
   * Returns the parent of a folder in the current view. This may be, but is not
   * necessarily, the actual parent of the folder (aFolder.parent). In
   * particular, in the smart view, special folders are usually children of the
   * smart folder of that kind.
   *
   * @param aFolder The folder to get the parent of.
   * @returns The parent of the folder, or null if the parent wasn't found.
   * @note This function does not guarantee that either the folder or its parent
   *       is actually in the view.
   */
  getParentOfFolder: function ftv_getParentOfFolder(aFolder) {
    return this._modes[this._mode].getParentOfFolder(aFolder);
  },

  /**
   * Given an nsIMsgDBHdr, returns the folder it is considered to be contained
   * in, in the current mode. This is usually, but not necessarily, the actual
   * folder the message is in (aMsgHdr.folder). For more details, see
   * |IFolderTreeMode.getFolderForMsgHdr|.
   */
  getFolderForMsgHdr: function ftv_getFolderForMsgHdr(aMsgHdr) {
    return this._modes[this._mode].getFolderForMsgHdr(aMsgHdr);
  },

  /**
   * Returns the |ftvItem| for an index in the current display. Intended for use
   * by folder tree mode implementers.
   *
   * @param aIndex The index for which the ftvItem should be returned.
   * @note If the index is out of bounds, this function returns null.
   */
  getFTVItemForIndex: function ftv_getFTVItemForIndex(aIndex) {
    return this._rowMap[aIndex];
  },

  /**
   * Returns an array of nsIMsgFolders corresponding to the current selection
   * in the tree
   */
  getSelectedFolders: function ftv_getSelectedFolders() {
    let selection = this.selection;
    if (!selection)
      return [];

    let folderArray = [];
    let rangeCount = selection.getRangeCount();
    for (let i = 0; i < rangeCount; i++) {
      let startIndex = {};
      let endIndex = {};
      selection.getRangeAt(i, startIndex, endIndex);
      for (let j = startIndex.value; j <= endIndex.value; j++) {
        if (j < this._rowMap.length)
          folderArray.push(this._rowMap[j]._folder);
      }
    }
    return folderArray;
  },

  /**
   * Adds a new child |ftvItem| to the given parent |ftvItem|. Intended for use
   * by folder tree mode implementers.
   *
   * @param aParentItem The parent ftvItem. It is assumed that this is visible
   *     in the view.
   * @param aParentIndex The index of the parent ftvItem in the view.
   * @param aItem The item to add.
   */
  addChildItem: function ftv_addChildItem(aParentItem, aParentIndex, aItem) {
    this._addChildToView(aParentItem, aParentIndex, aItem);
  },

  // ****************** Start of nsITreeView implementation **************** //

  get rowCount() {
    return this._rowMap.length;
  },

  /**
   * drag drop interfaces
   */
  canDrop: function ftv_canDrop(aRow, aOrientation) {
    let targetFolder = gFolderTreeView._rowMap[aRow]._folder;
    if (!targetFolder)
      return false;
    let dt = this._currentTransfer;
    let types = Array.from(dt.mozTypesAt(0));
    if (types.includes("text/x-moz-message")) {
      if (aOrientation != Ci.nsITreeView.DROP_ON)
        return false;
      // Don't allow drop onto server itself.
      if (targetFolder.isServer)
        return false;
      // Don't allow drop into a folder that cannot take messages.
      if (!targetFolder.canFileMessages)
        return false;
      let messenger = Cc["@mozilla.org/messenger;1"]
                        .createInstance(Ci.nsIMessenger);
      for (let i = 0; i < dt.mozItemCount; i++) {
        let msgHdr = messenger.msgHdrFromURI(dt.mozGetDataAt("text/x-moz-message", i));
        // Don't allow drop onto original folder.
        if (msgHdr.folder == targetFolder)
          return false;
      }
      return true;
    }
    else if (types.includes("text/x-moz-folder")) {
      if (aOrientation != Ci.nsITreeView.DROP_ON)
        return false;
      // If cannot create subfolders then don't allow drop here.
      if (!targetFolder.canCreateSubfolders)
        return false;
      for (let i = 0; i < dt.mozItemCount; i++) {
        let folder = dt.mozGetDataAt("text/x-moz-folder", i)
                       .QueryInterface(Ci.nsIMsgFolder);
        // Don't allow to drop on itself.
        if (targetFolder == folder)
          return false;
        // Don't copy within same server.
        if ((folder.server == targetFolder.server) &&
             (dt.dropEffect == 'copy'))
          return false;
        // Don't allow immediate child to be dropped onto its parent.
        if (targetFolder == folder.parent)
          return false;
        // Don't allow dragging of virtual folders across accounts.
        if ((folder.flags & Ci.nsMsgFolderFlags.Virtual) &&
            folder.server != targetFolder.server)
          return false;
        // Don't allow parent to be dropped on its ancestors.
        if (folder.isAncestorOf(targetFolder))
          return false;
        // If there is a folder that can't be renamed, don't allow it to be
        // dropped if it is not to "Local Folders" or is to the same account.
        if (!folder.canRename && (targetFolder.server.type != "none" ||
                                  folder.server == targetFolder.server))
          return false;
      }
      return true;
    }
    else if (types.includes("text/x-moz-newsfolder")) {
      // Don't allow dragging onto element.
      if (aOrientation == Ci.nsITreeView.DROP_ON)
        return false;
      // Don't allow drop onto server itself.
      if (targetFolder.isServer)
        return false;
      for (let i = 0; i < dt.mozItemCount; i++) {
        let folder = dt.mozGetDataAt("text/x-moz-newsfolder", i)
                       .QueryInterface(Ci.nsIMsgFolder);
        // Don't allow dragging newsgroup to other account.
        if (targetFolder.rootFolder != folder.rootFolder)
          return false;
        // Don't allow dragging newsgroup to before/after itself.
        if (targetFolder == folder)
          return false;
        // Don't allow dragging newsgroup to before item after or
        // after item before.
        let row = aRow + aOrientation;
        if (row in gFolderTreeView._rowMap &&
            (gFolderTreeView._rowMap[row]._folder == folder))
          return false;
      }
      return true;
    }
    // Allow subscribing to feeds by dragging an url to a feed account.
    else if (targetFolder.server.type == "rss" && dt.mozItemCount == 1)
      return FeedUtils.getFeedUriFromDataTransfer(dt) ? true : false;
    else if (types.includes("application/x-moz-file")) {
      if (aOrientation != Ci.nsITreeView.DROP_ON)
        return false;
      // Don't allow drop onto server itself.
      if (targetFolder.isServer)
        return false;
      // Don't allow drop into a folder that cannot take messages.
      if (!targetFolder.canFileMessages)
        return false;
      for (let i = 0; i < dt.mozItemCount; i++) {
        let extFile = dt.mozGetDataAt("application/x-moz-file", i);
        if (!extFile) {
          continue;
        }
        return extFile.QueryInterface(Ci.nsIFile).isFile();
      }
    }
    return false;
  },
  drop: function ftv_drop(aRow, aOrientation) {
    let targetFolder = gFolderTreeView._rowMap[aRow]._folder;

    let dt = this._currentTransfer;
    let count = dt.mozItemCount;
    let cs = MailServices.copy;

    // This is a potential rss feed.  A link image as well as link text url
    // should be handled; try to extract a url from non moz apps as well.
    let feedUri = targetFolder.server.type == "rss" && count == 1 ?
                    FeedUtils.getFeedUriFromDataTransfer(dt) : null;

    // We only support drag of a single flavor at a time.
    let types = Array.from(dt.mozTypesAt(0));
    if (types.includes("text/x-moz-folder")) {
      for (let i = 0; i < count; i++) {
        let folder = dt.mozGetDataAt("text/x-moz-folder", i)
                     .QueryInterface(Ci.nsIMsgFolder);
        cs.copyFolders(folder, targetFolder,
                      (folder.server == targetFolder.server), null,
                       msgWindow);
      }
    }
    else if (types.includes("text/x-moz-newsfolder")) {
      // Start by getting folders into order.
      let folders = new Array;
      for (let i = 0; i < count; i++) {
        let folder = dt.mozGetDataAt("text/x-moz-newsfolder", i)
                       .QueryInterface(Ci.nsIMsgFolder);
        folders[this.getIndexOfFolder(folder)] = folder;
      }
      let newsFolder = targetFolder.rootFolder
                                   .QueryInterface(Ci.nsIMsgNewsFolder);
      // When moving down, want to insert first one last.
      // When moving up, want to insert first one first.
      let i = (aOrientation == 1) ? folders.length - 1 : 0;
      while (i >= 0 && i < folders.length) {
        let folder = folders[i];
        if (folder) {
          newsFolder.moveFolder(folder, targetFolder, aOrientation);
          this.selection.toggleSelect(this.getIndexOfFolder(folder));
        }
        i -= aOrientation;
      }
    }
    else if (types.includes("text/x-moz-message")) {
      let array = Cc["@mozilla.org/array;1"]
                    .createInstance(Ci.nsIMutableArray);
      let sourceFolder;
      let messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
      for (let i = 0; i < count; i++) {
        let msgHdr = messenger.msgHdrFromURI(dt.mozGetDataAt("text/x-moz-message", i));
        if (!i)
          sourceFolder = msgHdr.folder;
        array.appendElement(msgHdr);
      }
      let isMove = Cc["@mozilla.org/widget/dragservice;1"]
                      .getService(Ci.nsIDragService).getCurrentSession()
                      .dragAction == Ci.nsIDragService.DRAGDROP_ACTION_MOVE;
      if (!sourceFolder.canDeleteMessages)
        isMove = false;

      Services.prefs.setCharPref("mail.last_msg_movecopy_target_uri",
                                 targetFolder.URI);
      Services.prefs.setBoolPref("mail.last_msg_movecopy_was_move", isMove);
      // ### ugh, so this won't work with cross-folder views. We would
      // really need to partition the messages by folder.
      cs.copyMessages(sourceFolder, array, targetFolder, isMove, null,
                      msgWindow, true);
    }
    else if (feedUri) {
      Cc["@mozilla.org/newsblog-feed-downloader;1"]
         .getService(Ci.nsINewsBlogFeedDownloader)
         .subscribeToFeed(feedUri.spec, targetFolder, msgWindow);
    }
    else if (types.includes("application/x-moz-file")) {
      for (let i = 0; i < count; i++) {
        let extFile = dt.mozGetDataAt("application/x-moz-file", i)
                        .QueryInterface(Ci.nsIFile);
        if (extFile.isFile()) {
          let len = extFile.leafName.length;
          if (len > 4 && extFile.leafName.toLowerCase().endsWith(".eml"))
            cs.copyFileMessage(extFile, targetFolder, null, false, 1, "", null,
                               msgWindow);
        }
      }
    }
  },

  _onDragStart: function ftv_dragStart(aEvent) {
    // Ugh, this is ugly but necessary.
    let view = gFolderTreeView;

    if (aEvent.originalTarget.localName != "treechildren")
      return;

    let folders = view.getSelectedFolders();
    folders = folders.filter(function(f) { return !f.isServer; });
    for (let i in folders) {
      let flavor = folders[i].server.type == "nntp" ? "text/x-moz-newsfolder" :
                                                      "text/x-moz-folder";
      aEvent.dataTransfer.mozSetDataAt(flavor, folders[i], i);
    }
    aEvent.dataTransfer.effectAllowed = "copyMove";
    aEvent.dataTransfer.addElement(aEvent.originalTarget);
    return;
  },

  _onDragOver: function ftv_onDragOver(aEvent) {
    this._currentTransfer = aEvent.dataTransfer;
  },

  _onDragDrop: function ftv_onDragDrop(aEvent) {
    this._currentTransfer = aEvent.dataTransfer;
  },

  /**
   * CSS files will cue off of these.  Note that we reach into the rowMap's
   * items so that custom data-displays can define their own properties
   */
  getCellProperties: function ftv_getCellProperties(aRow, aCol) {
    return this._rowMap[aRow].getProperties(aCol);
  },

  /**
   * The actual text to display in the tree
   */
  getCellText: function ftv_getCellText(aRow, aCol) {
    if ((aCol.id == "folderNameCol") ||
        (aCol.id == "folderUnreadCol") ||
        (aCol.id == "folderTotalCol") ||
        (aCol.id == "folderSizeCol"))
      return this._rowMap[aRow].getText(aCol.id);
    return "";
  },

  /**
   * The ftvItems take care of assigning this when created.
   */
  getLevel: function ftv_getLevel(aIndex) {
    return this._rowMap[aIndex].level;
  },

  /**
   * The ftvItems take care of assigning this when building children lists
   */
  getServerNameAdded: function ftv_getServerNameAdded(aIndex) {
    return this._rowMap[aIndex].addServerName;
  },

  /**
   * This is easy since the ftv items assigned the _parent property when making
   * the child lists
   */
  getParentIndex: function ftv_getParentIndex(aIndex) {
    return this._rowMap.indexOf(this._rowMap[aIndex]._parent);
  },

  /**
   * This is duplicative for our normal ftv views, but custom data-displays may
   * want to do something special here
   */
  getRowProperties: function ftv_getRowProperties(aRow) {
    return this._rowMap[aRow].getProperties();
  },

  /**
   * Check whether there are any more rows with our level before the next row
   * at our parent's level
   */
  hasNextSibling: function ftv_hasNextSibling(aIndex, aNextIndex) {
    var currentLevel = this._rowMap[aIndex].level;
    for (var i = aNextIndex + 1; i < this._rowMap.length; i++) {
      if (this._rowMap[i].level == currentLevel)
        return true;
      if (this._rowMap[i].level < currentLevel)
        return false;
    }
    return false;
  },

  /**
   * All folders are containers, so we can drag drop messages to them.
   */
  isContainer: function ftv_isContainer(aIndex) {
    return true;
  },

  isContainerEmpty: function ftv_isContainerEmpty(aIndex) {
    // If the folder has no children, the container is empty.
    return !this._rowMap[aIndex].children.length;
  },

  /**
   * Just look at the ftvItem here
   */
  isContainerOpen: function ftv_isContainerOpen(aIndex) {
    return this._rowMap[aIndex].open;
  },
  getSummarizedCounts: function(aIndex, aColName) {
    return this._rowMap[aIndex]._summarizedCounts.get(aColName);
  },
  isEditable: function ftv_isEditable(aRow, aCol) {
    // We don't support editing rows in the tree yet.  We may want to later as
    // an easier way to rename folders.
    return false;
  },
  isSeparator: function ftv_isSeparator(aIndex) {
    // There are no separators in our trees.
    return false;
  },
  isSorted: function ftv_isSorted() {
    // We do our own customized sorting.
    return false;
  },
  setTree: function ftv_setTree(aTree) {
    this._tree = aTree;
  },

  /**
   * Opens or closes a folder with children.  The logic here is a bit hairy, so
   * be very careful about changing anything.
   */
  toggleOpenState: function ftv_toggleOpenState(aIndex) {
    this._toggleRow(aIndex, true);
  },

  recursivelyAddToMap: function ftv_recursivelyAddToMap(aChild, aNewIndex) {
    // When we add sub-children, we're going to need to increase our index
    // for the next add item at our own level.
    let count = 0;
    if (aChild.children.length && aChild.open) {
      for (let [i, child] of Array.from(this._rowMap[aNewIndex].children).entries()) {
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

  _toggleRow: function toggleRow(aIndex, aExpandServer)
  {
    // Ok, this is a bit tricky.
    this._rowMap[aIndex].open = !this._rowMap[aIndex].open;
    if (!this._rowMap[aIndex].open) {
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
      this._persistItemClosed(this._rowMap[aIndex].id);

      // Notify the tree of changes.
      if (this._tree) {
        this._tree.rowCountChanged(aIndex + 1, (-1) * count);
        this._tree.invalidateRow(aIndex);
      }
    } else {
      // We're opening the container.  Add the children to our map.

      // Note that these children may have been open when we were last closed,
      // and if they are, we also have to add those grandchildren to the map.
      let oldCount = this._rowMap.length;
      this.recursivelyAddToMap(this._rowMap[aIndex], aIndex);

      // Add this folder to the persist map.
      this._persistItemOpen(this._rowMap[aIndex].id);

      // Notify the tree of changes.
      if (this._tree) {
        this._tree.rowCountChanged(aIndex + 1, this._rowMap.length - oldCount);
        this._tree.invalidateRow(aIndex);
      }

      if (this._treeElement.getAttribute("simplelist") == "true")
        return;

      // If this was a server that was expanded, let it update its counts.
      let folder = this._rowMap[aIndex]._folder;
      if (aExpandServer) {
        if (folder.isServer)
          folder.server.performExpand(msgWindow);
        else if (folder instanceof Ci.nsIMsgImapMailFolder)
          folder.performExpand(msgWindow);
      }
    }
  },

  // We don't implement any of these at the moment.
  performAction: function ftv_performAction(aAction) {},
  performActionOnCell: function ftv_performActionOnCell(aAction, aRow, aCol) {},
  performActionOnRow: function ftv_performActionOnRow(aAction, aRow) {},
  selectionChanged: function ftv_selectionChanged() {},
  setCellText: function ftv_setCellText(aRow, aCol, aValue) {},
  setCellValue: function ftv_setCellValue(aRow, aCol, aValue) {},
  getCellValue: function ftv_getCellValue(aRow, aCol) {},
  getColumnProperties: function ftv_getColumnProperties(aCol) { return ""; },
  getImageSrc: function ftv_getImageSrc(aRow, aCol) {},
  getProgressMode: function ftv_getProgressMode(aRow, aCol) {},
  cycleCell: function ftv_cycleCell(aRow, aCol) {},
  cycleHeader: function ftv_cycleHeader(aCol) {},

  // ****************** End of nsITreeView implementation **************** //

  //
  // WARNING: Everything below this point is considered private.  Touch at your
  //          own risk.

  /**
   * This is an array of all possible modes for the folder tree. You should not
   * modify this directly, but rather use registerFolderTreeMode.
   *
   * Internally each mode is defined separately. But in the UI we currently
   * expose only the "base" name (see baseMode()) of the mode plus a
   * "Compact view" option. The internal name of the mode to use is then
   * constructed from the base name and "_compact" suffix if compact view is
   * selected. See bug 978592.
   */
  _modeNames: ["all", "unread", "unread_compact", "favorite", "favorite_compact", "recent_compact"],
  _modeDisplayNames: {},

  /**
   * This is a javascript map of which folders we had open, so that we can
   * persist their state over-time.  It is designed to be used as a JSON object.
   */
  _persistOpenMap: {},
  _notPersistedModes: ["unread", "unread_compact", "favorite", "favorite_compact", "recent_compact"],

  /**
   * Iterate over the persistent list and open the items (folders) stored in it.
   */
  _restoreOpenStates: function ftv__persistOpenStates() {
    let mode = this.mode;
    // Remove any saved state of modes where open state should not be persisted.
    // This is mostly for migration from older profiles that may have the info
    // stored.
    if (this._notPersistedModes.includes(mode)) {
      delete this._persistOpenMap[mode];
    }

    let curLevel = 0;
    let tree = this;
    let map = tree._persistOpenMap[mode]; // may be undefined
    function openLevel() {
      let goOn = false;
      // We can't use a js iterator because we're changing the array as we go.
      // So fallback on old trick of going backwards from the end, which
      // doesn't care when you add things at the end.
      for (let i = tree._rowMap.length - 1; i >= 0; i--) {
        let row = tree._rowMap[i];
        if (row.level != curLevel)
          continue;

        // The initial state of all rows is closed,
        // so toggle those we want open.
        if (!map || map.includes(row.id)) {
          tree._toggleRow(i, false);
          goOn = true;
        }
      }

      // If we opened up any new kids, we need to check their level as well.
      curLevel++;
      if (goOn)
        openLevel();
    }
    openLevel();
  },

  /**
   * Remove the item from the persistent list, meaning the item should
   * be persisted as closed in the tree.
   *
   * @param aItemId  The URI of the folder item.
   */
  _persistItemClosed: function ftv_unpersistItem(aItemId) {
    let mode = this.mode;
    if (this._notPersistedModes.includes(mode))
      return;

    // If the whole mode is not in the map yet,
    // we can silently ignore the folder removal.
    if (!this._persistOpenMap[mode])
      return;

    let persistMapIndex = this._persistOpenMap[mode].indexOf(aItemId);
    if (persistMapIndex != -1)
      this._persistOpenMap[mode].splice(persistMapIndex, 1);
  },

  /**
   * Add the item from the persistent list, meaning the item should
   * be persisted as open (expanded) in the tree.
   *
   * @param aItemId  The URI of the folder item.
   */
  _persistItemOpen: function ftv_persistItem(aItemId) {
    let mode = this.mode;
    if (this._notPersistedModes.includes(mode))
      return;

    if (!this._persistOpenMap[mode])
      this._persistOpenMap[mode] = [];

    if (!this._persistOpenMap[mode].includes(aItemId))
      this._persistOpenMap[mode].push(aItemId);
  },

  _tree: null,
  selection: null,
  /**
   * An array of ftvItems, where each item corresponds to a row in the tree
   */
  _rowMap: null,

  /**
   * Completely discards the current tree and rebuilds it based on current
   * settings
   */
  _rebuild: function ftv__rebuild() {
    let newRowMap;
    try {
      newRowMap = this._modes[this.mode].generateMap(this);
    } catch(ex) {
      Services.console.logStringMessage("generator " + this.mode +
                                        " failed with exception: " + ex);
      this.mode = kDefaultMode;
      newRowMap = this._modes[this.mode].generateMap(this);
    }
    let selectedFolders = this.getSelectedFolders();
    if (this.selection)
      this.selection.clearSelection();
    // There's a chance the call to the map generator altered this._rowMap, so
    // evaluate oldCount after calling it rather than before.
    let oldCount = this._rowMap ? this._rowMap.length : null;
    this._rowMap = newRowMap;

    this._treeElement.dispatchEvent(new Event("mapRebuild",
      { bubbles: true, cancelable: false }));

    if (this._tree) {
      if (oldCount !== null)
        this._tree.rowCountChanged(0, this._rowMap.length - oldCount);
      this._tree.invalidate();
    }

    this._restoreOpenStates();
    // Restore selection.
    for (let folder of selectedFolders) {
      if (folder) {
        let index = this.getIndexOfFolder(folder);
        if (index != null)
          this.selection.toggleSelect(index);
      }
    }
  },

  _sortedAccounts: function ftv_getSortedAccounts() {
    let accounts = allAccountsSorted(true);

    // Don't show deferred pop accounts.
    accounts = accounts.filter(function isNotDeferred(a) {
      let server = a.incomingServer;
      return !(server instanceof Ci.nsIPop3IncomingServer &&
               server.deferredToAccount);
    });

    return accounts;
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

      generateMap: function(ftv) {
        let accounts = gFolderTreeView._sortedAccounts();
        // Force each root folder to do its local subfolder discovery.
        MailUtils.discoverFolders();

        return accounts.map(acct => new ftvItem(acct.incomingServer.rootFolder));
      }
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

      generateMap: function(ftv) {
        let filterUnread = function filterUnread(aFolder) {
          let currentFolder = gFolderTreeView.getSelectedFolders()[0];
          return ((aFolder.getNumUnread(true) > 0) ||
                  (aFolder == currentFolder));
        }

        let accounts = gFolderTreeView._sortedAccounts();
        // Force each root folder to do its local subfolder discovery.
        MailUtils.discoverFolders();

        let unreadRootFolders = [];
        for (let acct of accounts) {
          let rootFolder = acct.incomingServer.rootFolder;
          // Add rootFolders of accounts that contain at least one Favorite
          // folder.
          if (rootFolder.getNumUnread(true) > 0)
            unreadRootFolders.push(new ftvItem(rootFolder, filterUnread));
        }

        return unreadRootFolders;
      },

      handleChangedIntProperty: function(aItem, aProperty, aOld, aNew) {
        // We want to rebuild only if we have a newly unread folder
        // and we didn't already have the folder.
        if (aProperty == "TotalUnreadMessages" && aOld == 0 && aNew > 0 &&
            gFolderTreeView.getIndexOfFolder(aItem) == null) {
          gFolderTreeView._rebuild();
          return true;
        }
        return false;
      }
    },

    /**
     * A variant of the 'unread' mode above. This does not include the parent
     * folders and the unread folders are shown in a flat list with no
     * hierarchy.
     */
    unread_compact: {
      __proto__: IFolderTreeMode,

      generateMap: function(ftv) {
        let map = [];
        let currentFolder = gFolderTreeView.getSelectedFolders()[0];
        for (let folder of ftv._enumerateFolders) {
          if ((!folder.isServer && folder.getNumUnread(false) > 0) ||
              (folder == currentFolder))
            map.push(new ftvItem(folder));
        }

        // There are no children in this view!
        for (let folder of map) {
          folder.__defineGetter__("children", () => []);
          folder.addServerName = true;
        }
        sortFolderItems(map);
        return map;
      },

      getParentOfFolder: function(aFolder) {
        // This is a flat view, so no folders have parents.
        return null;
      },

      handleChangedIntProperty: function(aItem, aProperty, aOld, aNew) {
        // We want to rebuild only if we have a newly unread folder
        // and we didn't already have the folder.
        if (aProperty == "TotalUnreadMessages" && aOld == 0 && aNew > 0 &&
            gFolderTreeView.getIndexOfFolder(aItem) == null) {
          gFolderTreeView._rebuild();
          return true;
        }
        return false;
      }
    },

    /**
     * The favorites mode returns all folders whose flags are set to include
     * the favorite flag.
     * It also includes parent folders of the Unread folders so the hierarchy
     * shown.
     */
    favorite: {
      __proto__: IFolderTreeMode,

      generateMap: function(ftv) {
        let accounts = gFolderTreeView._sortedAccounts();
        // Force each root folder to do its local subfolder discovery.
        MailUtils.discoverFolders();

        let favRootFolders = [];
        let filterFavorite = function filterFavorite(aFolder) {
          return aFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Favorite) != null;
        }
        for (let acct of accounts) {
          let rootFolder = acct.incomingServer.rootFolder;
          // Add rootFolders of accounts that contain at least one Favorite folder.
          if (filterFavorite(rootFolder))
            favRootFolders.push(new ftvItem(rootFolder, filterFavorite));
        }

        return favRootFolders;
      },

      handleChangedIntProperty: function(aItem, aProperty, aOld, aNew) {
        // We want to rebuild if the favorite status of a folder changed.
        if (aProperty == "FolderFlag" &&
            ((aOld & Ci.nsMsgFolderFlags.Favorite) !=
            (aNew & Ci.nsMsgFolderFlags.Favorite))) {
          gFolderTreeView._rebuild();
          return true;
        }
        return false;
      }
    },

    /**
     * A variant of the 'favorite' mode above. This does not include the parent
     * folders and the unread folders are shown in a compact list with no
     * hierarchy.
     */
    favorite_compact: {
      __proto__: IFolderTreeMode,

      generateMap: function(ftv) {
        let faves = [];
        for (let folder of ftv._enumerateFolders) {
          if (folder.flags & Ci.nsMsgFolderFlags.Favorite)
            faves.push(new ftvItem(folder));
        }

        // We want to display the account name alongside folders that have
        // duplicated folder names.
        let uniqueNames = new Set(); // set of folder names seen at least once
        let dupeNames = new Set(); // set of folders seen at least twice
        for (let item of faves) {
          let name = item._folder.abbreviatedName.toLocaleLowerCase();
          if (uniqueNames.has(name)) {
            if (!dupeNames.has(name))
              dupeNames.add(name);
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
        return faves;
      },

      getParentOfFolder: function(aFolder) {
        // This is a flat view, so no folders have parents.
        return null;
      },

      handleChangedIntProperty: function(aItem, aProperty, aOld, aNew) {
        // We want to rebuild if the favorite status of a folder changed.
        if (aProperty == "FolderFlag" &&
            ((aOld & Ci.nsMsgFolderFlags.Favorite) !=
             (aNew & Ci.nsMsgFolderFlags.Favorite))) {
          gFolderTreeView._rebuild();
          return true;
        }
        return false;
      }
    },

    /**
     * The recent mode is a flat view of the 15 most recently used folders
     */
    recent_compact: {
      __proto__: IFolderTreeMode,

      generateMap: function(ftv) {
        const MAXRECENT = 15;

        // Get 15 (MAXRECENT) most recently accessed folders.
        let recentFolders = getMostRecentFolders(ftv._enumerateFolders,
                                                 MAXRECENT,
                                                 "MRUTime",
                                                 null);

        // Sort the folder names alphabetically.
        recentFolders.sort(function rf_sort(a, b){
          let aLabel = a.prettyName;
          let bLabel = b.prettyName;
          if (aLabel == bLabel) {
            aLabel = a.server.prettyName;
            bLabel = b.server.prettyName;
          }
          return folderNameCompare(aLabel, bLabel);
        });

        let items = recentFolders.map(f => new ftvItem(f));

        // There are no children in this view!
        // And we want to display the account name to distinguish folders w/
        // the same name.
        for (let folder of items) {
          folder.__defineGetter__("children", () => []);
          folder.addServerName = true;
        }

        return items;
      },

      getParentOfFolder: function(aFolder) {
        // This is a flat view, so no folders have parents.
        return null;
      }
    }
  },

  /**
   * This is a helper attribute that simply returns a flat list of all folders
   */
  get _enumerateFolders() {
    let folders = [];

    for (let server of fixIterator(MailServices.accounts.allServers, Ci.nsIMsgIncomingServer)) {
      // Skip deferred accounts.
      if (server instanceof Ci.nsIPop3IncomingServer &&
          server.deferredToAccount)
        continue;

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
  addSubFolders : function ftv_addSubFolders (folder, folders) {
    for (let f of fixIterator(folder.subFolders, Ci.nsIMsgFolder)) {
      folders.push(f);
      this.addSubFolders(f, folders);
    }
  },

  /**
   * This updates the rowmap and invalidates the right row(s) in the tree
   */
  _addChildToView: function ftl_addChildToView(aParent, aParentIndex, aNewChild) {
    if (aParent.open) {
      let newChildIndex;
      let newChildNum = aParent._children.indexOf(aNewChild);
      // Only child - go right after our parent.
      if (newChildNum == 0) {
        newChildIndex = Number(aParentIndex) + 1
      }
      // If we're not the last child, insert ourselves before the next child.
      else if (newChildNum < aParent._children.length - 1) {
        newChildIndex = this.getIndexOfFolder(aParent._children[Number(newChildNum) + 1]._folder);
      }
      // Otherwise, go after the last child.
      else {
        let lastChild = aParent._children[newChildNum - 1];
        let lastChildIndex = this.getIndexOfFolder(lastChild._folder);
        newChildIndex = Number(lastChildIndex) + 1;
        while (newChildIndex < this.rowCount &&
               this._rowMap[newChildIndex].level > this._rowMap[lastChildIndex].level)
          newChildIndex++;
      }
      this._rowMap.splice(newChildIndex, 0, aNewChild);
      this._tree.rowCountChanged(newChildIndex, 1);
    } else {
      this._tree.invalidateRow(aParentIndex);
    }
  },

  /**
   * This is our implementation of nsIMsgFolderListener to watch for changes
   */
  OnItemAdded: function ftl_add(aParentItem, aItem) {
    // Ignore this item if it's not a folder, or we knew about it.
    if (!(aItem instanceof Ci.nsIMsgFolder) ||
        this.getIndexOfFolder(aItem) != null)
      return;

    // If no parent, this is an account, so let's rebuild.
    if (!aParentItem) {
      if (!aItem.server.hidden) // Ignore hidden server items.
        this._rebuild();
      return;
    }
    this._modes[this._mode].onFolderAdded(
      aParentItem.QueryInterface(Ci.nsIMsgFolder), aItem);
  },

  addFolder: function ftl_add_folder(aParentItem, aItem) {
    // This intentionally adds any new folder even if it would not pass the
    // _filterFunction. The idea is that the user can add new folders even
    // in modes like "unread" or "favorite" and could wonder why they
    // are not appearing (forgetting they do not meet the criteria of the view).
    // The folders will be hidden properly next time the view is rebuilt.
    let parentIndex = this.getIndexOfFolder(aParentItem);
    let parent = this._rowMap[parentIndex];
    if (!parent)
      return;

    // Getting these children might have triggered our parent to build its
    // array just now, in which case the added item will already exist.
    let children = parent.children;
    var newChild;
    for (let child of children) {
      if (child._folder == aItem) {
        newChild = child;
        break;
      }
    }
    if (!newChild) {
      newChild = new ftvItem(aItem);
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
      if (newChild._folder.flags & Ci.nsMsgFolderFlags.SpecialUse) {
        this._toggleRow(parentIndex, false);
        return;
      }
    }
    this._addChildToView(parent, parentIndex, newChild);
  },

  OnItemRemoved: function ftl_remove(aRDFParentItem, aItem) {
    if (!(aItem instanceof Ci.nsIMsgFolder))
      return;

    this._persistItemClosed(aItem.URI);

    let index = this.getIndexOfFolder(aItem);
    if (index == null)
      return;
    // Forget our parent's children; they'll get rebuilt.
    if (aRDFParentItem && this._rowMap[index]._parent)
      this._rowMap[index]._parent._children = null;
    let kidCount = 1;
    let walker = Number(index) + 1;
    while (walker < this.rowCount &&
           this._rowMap[walker].level > this._rowMap[index].level) {
      walker++;
      kidCount++;
    }
    this._rowMap.splice(index, kidCount);
    this._tree.rowCountChanged(index, -1 * kidCount);
    this._tree.invalidateRow(index);
  },

  OnItemPropertyChanged: function(aItem, aProperty, aOld, aNew) {},
  OnItemIntPropertyChanged: function(aItem, aProperty, aOld, aNew) {
    // First try mode specific handling of the changed property.
    if (this._modes[this.mode].handleChangedIntProperty(aItem, aProperty, aOld,
                                                        aNew))
      return;

    if (aItem instanceof Ci.nsIMsgFolder) {
      let index = this.getIndexOfFolder(aItem);
      let folder = aItem;
      let folderTreeMode = this._modes[this._mode];
      // Look for first visible ancestor.
      while (index == null) {
        folder = folderTreeMode.getParentOfFolder(folder);
        if (!folder)
          break;
        index = this.getIndexOfFolder(folder);
      }
      if (index != null)
        this._tree.invalidateRow(index);
    }
  },

  OnItemBoolPropertyChanged: function(aItem, aProperty, aOld, aNew) {
    let index = this.getIndexOfFolder(aItem);
    if (index != null)
      this._tree.invalidateRow(index);
  },
  OnItemUnicharPropertyChanged: function(aItem, aProperty, aOld, aNew) {},
  OnItemPropertyFlagChanged: function(aItem, aProperty, aOld, aNew) {},
  OnItemEvent: function(aFolder, aEvent) {
    let index = this.getIndexOfFolder(aFolder);
    if (index != null)
      this._tree.invalidateRow(index);
  }
};

/**
 * The ftvItem object represents a single row in the tree view. Because I'm lazy
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
 * The ftvItem constructor takes these arguments:
 *
 * @param aFolder        The folder attached to this row in the tree.
 * @param aFolderFilter  When showing children folders of this one,
 *                       only show those that pass this filter function.
 *                       If unset, show all subfolders.
 */
function ftvItem(aFolder, aFolderFilter) {
  this._folder = aFolder;
  this._level = 0;
  this._parent = null;
  this._folderFilter = aFolderFilter;
  // The map contains message counts for each folder column.
  // Each key is a column name (ID) from the folder tree.
  // Value is an array of the format
  // "[value_for_folder, value_for_all_its_subfolders]".
  this._summarizedCounts = new Map();
}

ftvItem.prototype = {
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
      (gFolderTreeView.mode == kDefaultMode) &&
      this._folder.hasSubFolders && !this.open;

    this._summarizedCounts.delete(aColName);
    switch (aColName) {
      case "folderNameCol":
        let text;
        if (this.useServerNameOnly)
          text = this._folder.server.prettyName;
        else {
          text = this._folder.abbreviatedName;
          if (this.addServerName) {
            text = gFolderTreeView.messengerBundle.getFormattedString(
              "folderWithAccount", [text, this._folder.server.prettyName]);
          }
        }

        // In a simple list tree we don't care for attributes other than folder
        // name.
        if (gFolderTreeView._treeElement.getAttribute("simplelist") == "true")
          return text;

        // If the unread column is shown, we don't need to add the count
        // to the name.
        if (!document.getElementById("folderUnreadCol").hidden)
          return text;

        let unread = this._folder.getNumUnread(false);
        let totalUnread = gFolderStatsHelpers.sumSubfolders ?
                          this._folder.getNumUnread(true) : unread;
        this._summarizedCounts.set(aColName, [unread, totalUnread - unread]);
        if (totalUnread > 0) {
          text = gFolderTreeView.messengerBundle.getFormattedString(
            "folderWithUnreadMsgs",
            [text,
             gFolderStatsHelpers.addSummarizedPrefix(totalUnread,
                                                     unread != totalUnread)]);
        }
        return text;

      case "folderUnreadCol":
        let folderUnread = this._folder.getNumUnread(false);
        let subfoldersUnread = gFolderStatsHelpers.sumSubfolders ?
                               this._folder.getNumUnread(true) : folderUnread;
        this._summarizedCounts.set(aColName, [folderUnread,
                                              subfoldersUnread - folderUnread]);
        return gFolderStatsHelpers
                 .fixNum(subfoldersUnread, folderUnread != subfoldersUnread);

      case "folderTotalCol":
        let folderTotal = this._folder.getTotalMessages(false);
        let subfoldersTotal = gFolderStatsHelpers.sumSubfolders ?
                              this._folder.getTotalMessages(true) : folderTotal;
        this._summarizedCounts.set(aColName, [folderTotal,
                                              subfoldersTotal - folderTotal]);
        return gFolderStatsHelpers
                 .fixNum(subfoldersTotal, folderTotal != subfoldersTotal);

      case "folderSizeCol":
        let thisFolderSize = gFolderStatsHelpers.getFolderSize(this._folder);
        let subfoldersSize = gFolderStatsHelpers.sumSubfolders ?
                             gFolderStatsHelpers.getSubfoldersSize(this._folder) : 0;

        if (subfoldersSize == gFolderStatsHelpers.kUnknownSize ||
            thisFolderSize == gFolderStatsHelpers.kUnknownSize)
          return gFolderStatsHelpers.kUnknownSize;

        let totalSize = thisFolderSize + subfoldersSize;
        if (totalSize == 0)
          return "";

        let [totalText, folderUnit] = gFolderStatsHelpers.formatFolderSize(totalSize);
        let folderText = (subfoldersSize == 0) ? totalText :
                         gFolderStatsHelpers.formatFolderSize(thisFolderSize, folderUnit)[0];
        let subfoldersText = (subfoldersSize == 0) ? "" :
                             gFolderStatsHelpers.formatFolderSize(subfoldersSize, folderUnit)[0];
        this._summarizedCounts.set(aColName, [folderText, subfoldersText]);
        return gFolderStatsHelpers
                 .addSummarizedPrefix(totalText, totalSize != thisFolderSize);

      default:
        return "";
    }
  },

  get level() {
    return this._level;
  },

  getProperties: function (aColumn) {
    if (aColumn && aColumn.id != "folderNameCol")
      return "";

    // From folderUtils.jsm
    let properties = getFolderProperties(this._folder, this.open);

    return properties;
  },

  command: function fti_command() {
    if (!Services.prefs.getBoolPref("mailnews.reuse_thread_window2")) {
      MsgOpenNewWindowForFolder(this._folder.URI, -1 /* key */);
    }
  },

  _children: null,
  get children() {
    // We're caching our child list to save perf.
    if (!this._children) {
      let iter;
      try {
        iter = fixIterator(this._folder.subFolders, Ci.nsIMsgFolder);
      } catch (ex) {
        Services.console.logStringMessage("Discovering children for " +
                                          this._folder.URI + " failed with " +
                                          "exception: " + ex);
        iter = [];
      }
      this._children = [];
      // Out of all children, only keep those that match the _folderFilter
      // and those that contain such children.
      for (let folder of iter) {
        if (!this._folderFilter || this._folderFilter(folder)) {
          this._children.push(new ftvItem(folder, this._folderFilter));
        }
      }
      sortFolderItems(this._children);
      // Each child is a level one below us.
      for (let child of this._children) {
        child._level = this._level + 1;
        child._parent = this;
      }
    }
    return this._children;
  }
};

/**
 * This handles the invocation of most commands dealing with folders, based off
 * of the current selection, or a passed in folder.
 */
var gFolderTreeController = {
  /**
   * Opens the dialog to create a new sub-folder, and creates it if the user
   * accepts
   *
   * @param aParent (optional)  the parent for the new subfolder
   */
  newFolder(aParent) {
    let folder = aParent || GetSelectedMsgFolders()[0];

    // Make sure we actually can create subfolders.
    if (!folder.canCreateSubfolders) {
      // Check if we can create them at the root.
      let rootMsgFolder = folder.server.rootMsgFolder;
      if (rootMsgFolder.canCreateSubfolders)
        folder = rootMsgFolder;
      else // just use the default account
        folder = GetDefaultAccountRootFolder();
    }

    let dualUseFolders = true;
    if (folder.server instanceof Ci.nsIImapIncomingServer)
      dualUseFolders = folder.server.dualUseFolders;

    function newFolderCallback(aName, aFolder) {
      // createSubfolder can throw an exception, causing the newFolder dialog
      // to not close and wait for another input.
      // TODO: Rewrite this logic and move the opening of alert dialogs from
      // nsMsgLocalMailFolder::CreateSubfolderInternal to here (bug 831190#c16).
      if (aName)
        aFolder.createSubfolder(aName, msgWindow);
    }

    window.openDialog("chrome://messenger/content/newFolderDialog.xul",
                      "",
                      "chrome,modal,centerscreen",
                      {folder: folder,
                       dualUseFolders: dualUseFolders,
                       okCallback: newFolderCallback});
  },

  /**
   * Opens the dialog to edit the properties for a folder
   *
   * @param aTabID  (optional) the tab to show in the dialog
   * @param aFolder (optional) the folder to edit, if not the selected one
   */
  editFolder(aTabID, aFolder) {
    let folder = aFolder || GetSelectedMsgFolders()[0];

    // If a server is selected, view settings for that account.
    if (folder.isServer) {
      MsgAccountManager(null, folder.server);
      return;
    }

    if (folder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
      // virtual folders get their own property dialog that contains all of the
      // search information related to the virtual folder.
      this.editVirtualFolder(folder);
      return;
    }

    let title = gFolderTreeView.messengerBundle.getString("folderProperties");

    function editFolderCallback(aNewName, aOldName, aUri) {
      if (aNewName != aOldName)
        folder.rename(aNewName, msgWindow);
    }

    function rebuildSummary(msgFolder) {
      if (msgFolder.locked) {
        msgFolder.throwAlertMsg("operationFailedFolderBusy", msgWindow);
        return;
      }
      if (msgFolder.supportsOffline) {
        // Remove the offline store, if any.
        let offlineStore = msgFolder.filePath;
        // XXX todo: figure out how to delete a maildir directory async. This
        // delete causes main thread lockup for large maildir folders.
        if (offlineStore.exists())
          offlineStore.remove(true);
      }

      // Send a notification that we are triggering a database rebuild.
      MailServices.mfn.notifyItemEvent(folder, "FolderReindexTriggered", null,
                                       null);

      msgFolder.msgDatabase.summaryValid = false;

      try {
        msgFolder.closeAndBackupFolderDB("");
      }
      catch(e) {
        // In a failure, proceed anyway since we're dealing with problems
        msgFolder.ForceDBClosed();
      }
      // these two lines will cause the thread pane to get reloaded
      // when the download/reparse is finished. Only do this
      // if the selected folder is loaded (i.e., not thru the
      // context menu on a non-loaded folder).
      if (msgFolder == GetLoadedMsgFolder()) {
        gRerootOnFolderLoad = true;
        gCurrentFolderToReroot = msgFolder.URI;
      }
      msgFolder.updateFolder(msgWindow);
    }

    window.openDialog("chrome://messenger/content/folderProps.xul",
                      "", "chrome,modal,centerscreen",
                      {folder: folder, serverType: folder.server.type,
                       msgWindow: msgWindow, title: title,
                       okCallback: editFolderCallback, tabID: aTabID,
                       name: folder.prettyName,
                       rebuildSummaryCallback: rebuildSummary});
  },

 /**
   * Opens the dialog to rename a particular folder, and does the renaming if
   * the user clicks OK in that dialog
   *
   * @param aFolder (optional)  the folder to rename, if different than the
   *                            currently selected one
   */
  renameFolder(aFolder) {
    let folder = aFolder || GetSelectedMsgFolders()[0];

    let controller = this;
    function renameCallback(aName, aUri) {
      if (aUri != folder.URI)
        Cu.reportError("got back a different folder to rename!");

      controller._resetThreadPane();
      let folderTree = document.getElementById("folderTree");
      folderTree.view.selection.clearSelection();

      folder.rename(aName, msgWindow);
    }

    window.openDialog("chrome://messenger/content/renameFolderDialog.xul",
                      "", "chrome,modal,centerscreen",
                      {preselectedURI: folder.URI,
                       okCallback: renameCallback, name: folder.prettyName});
  },

  /**
   * Deletes a folder from its parent. Also handles unsubscribe from newsgroups
   * if the selected folder/s happen to be nntp.
   *
   * @param aFolder (optional) the folder to delete, if not the selected one
   */
  deleteFolder(aFolder) {
    let folders = aFolder ? [aFolder] : GetSelectedMsgFolders();
    let prompt = Services.prompt;
    for (let folder of folders) {
      // For newsgroups, "delete" means "unsubscribe".
      if (folder.server.type == "nntp" &&
          !folder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
        MsgUnsubscribe([folder]);
        continue;
      }

      let canDelete = folder.isSpecialFolder(Ci.nsMsgFolderFlags.Junk, false) ?
        CanRenameDeleteJunkMail(folder.URI) : folder.deletable;
      if (!canDelete)
        continue;

      if (folder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
        let confirmation = gMessengerBundle.getString("confirmSavedSearchDeleteMessage");
        let title = gMessengerBundle.getString("confirmSavedSearchDeleteTitle");
        let buttonTitle = gMessengerBundle.getString("confirmSavedSearchDeleteButton");
        let buttonFlags = prompt.BUTTON_TITLE_IS_STRING * prompt.BUTTON_POS_0 +
                          prompt.BUTTON_TITLE_CANCEL * prompt.BUTTON_POS_1;
        if (prompt.confirmEx(window, title, confirmation, buttonFlags, buttonTitle,
                             "", "", "", {}) != 0) /* the yes button is in position 0 */
          continue;
        if (gCurrentVirtualFolderUri == folder.URI)
          gCurrentVirtualFolderUri = null;
      }

      // We can delete this folder.
      try {
        folder.deleteSelf(msgWindow);
      }
      // Ignore known errors from canceled warning dialogs.
      catch (ex) {
        const NS_MSG_ERROR_COPY_FOLDER_ABORTED = 0x8055001a;
        if (ex.result != NS_MSG_ERROR_COPY_FOLDER_ABORTED) {
          throw ex;
        }
      }
    }
  },

  /**
   * Prompts the user to confirm and empties the trash for the selected folder.
   * The folder and its children are only emptied if it has the proper Trash
   * flag.
   *
   * @param aFolder (optional)  The trash folder to empty. If unspecified or not
   *                            a trash folder, the currently selected server's
   *                            trash folder is used.
   */
  emptyTrash(aFolder) {
    let folder = aFolder || GetSelectedMsgFolders()[0];
    if (!folder.getFlag(Ci.nsMsgFolderFlags.Trash))
      folder = folder.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Trash);
    if (!folder)
      return;

    if (this._checkConfirmationPrompt("emptyTrash"))
      folder.emptyTrash(msgWindow, null);
  },

  /**
   * Deletes everything (folders and messages) in the selected folder.
   * The folder is only emptied if it has the proper Junk flag.
   *
   * @param aFolder (optional)  The folder to empty. If unspecified, the
   *                            currently selected folder is used, if it
   *                            is junk.
   */
  emptyJunk(aFolder) {
    let folder = aFolder || GetSelectedMsgFolders()[0];

    if (!folder || !folder.getFlag(Ci.nsMsgFolderFlags.Junk))
      return;

    if (!this._checkConfirmationPrompt("emptyJunk"))
      return;

    // Delete any sub-folders this folder might have.
    for (let f of folder.subFolders) {
      folder.propagateDelete(f, true, msgWindow);
    }

    // Now delete the messages.
    folder.deleteMessages([...folder.messages], msgWindow, true, false, null, false);
  },

  /**
   * Compacts either particular folder/s, or selected folders.
   *
   * @param aFolders (optional) the folders to compact, if different than the
   *                            currently selected ones
   */
  compactFolders(aFolders) {
    let folders = aFolders || GetSelectedMsgFolders();
    for (let folder of folders) {
      let isImapFolder = folder.server.type == "imap";
      // Can't compact folders that have just been compacted
      if (!isImapFolder && !folder.expungedBytes)
        return;

      // Reset thread pane for non-imap folders.
      if (!isImapFolder && gDBView && gDBView.msgFolder == folder) {
        this._resetThreadPane();
      }

      folder.compact(null, msgWindow);
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
    let folders = aFolders || GetSelectedMsgFolders();
    for (let folder of folders) {
      let isImapFolder = folder.server.type == "imap";
      folder.compactAll(null, msgWindow, isImapFolder ||
                                         folder.server.type == "nntp");
      // Reset thread pane for non-imap folders.
      if (gDBView && !isImapFolder)
        this._resetThreadPane();
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
    let folder = aParent || GetSelectedMsgFolders()[0];
    if (!folder)
      folder = GetDefaultAccountRootFolder();

    let name = folder.prettyName;
    if (aName)
      name += "-" + aName;

    window.openDialog("chrome://messenger/content/virtualFolderProperties.xul",
                      "", "chrome,modal,centerscreen",
                      {folder: folder, searchTerms: aSearchTems,
                       newFolderName: name});
  },

  /**
   * Opens the dialog to edit the properties for a virtual folder
   *
   * @param aFolder (optional) the folder to edit, if not the selected one
   */
  editVirtualFolder(aFolder) {
    let folder = aFolder || GetSelectedMsgFolders()[0];

    function editVirtualCallback(aURI) {
      // we need to reload the folder if it is the currently loaded folder...
      if (gMsgFolderSelected && aURI == gMsgFolderSelected.URI) {
        // force the folder pane to reload the virtual folder
        gMsgFolderSelected = null;
        FolderPaneSelectionChange();
      }
    }
    window.openDialog("chrome://messenger/content/virtualFolderProperties.xul",
                      "", "chrome,modal,centerscreen",
                      {folder: folder, editExistingFolder: true,
                       onOKCallback: editVirtualCallback,
                       msgWindow:msgWindow});
  },

  /**
   * Opens a search window with the given folder, or the selected one if none
   * is given.
   *
   * @param [aFolder] the folder to open the search window for, if different
   *                  from the selected one
   */
  searchMessages(aFolder) {
    MsgSearchMessages(aFolder || GetSelectedMsgFolders()[0]);
  },

  /**
   * For certain folder commands, the thread pane needs to be invalidated, this
   * takes care of doing so.
   */
  _resetThreadPane() {
    if (gDBView)
      gCurrentlyDisplayedMessage = gDBView.currentlyDisplayedMessage;

    ClearThreadPaneSelection();
    ClearThreadPane();
    ClearMessagePane();
  },

  /**
   * Prompts for confirmation, if the user hasn't already chosen the "don't ask
   * again" option.
   *
   * @param aCommand - the command to prompt for
   */
  _checkConfirmationPrompt(aCommand) {
    const kDontAskAgainPref = "mailnews." + aCommand + ".dontAskAgain";
    // default to ask user if the pref is not set
    if (!Services.prefs.getBoolPref(kDontAskAgainPref, false)) {
      let checkbox = {value: false};
      let choice = Services.prompt.confirmEx(
                     window,
                     gMessengerBundle.getString(aCommand + "Title"),
                     gMessengerBundle.getString(aCommand + "Message"),
                     Services.prompt.STD_YES_NO_BUTTONS,
                     null, null, null,
                     gMessengerBundle.getString(aCommand + "DontAsk"),
                     checkbox);
      if (checkbox.value)
        Services.prefs.setBoolPref(kDontAskAgainPref, true);

      if (choice != 0)
        return false;
    }
    return true;
  },
}

/**
 * Sorts the passed in array of folder items using the folder sort key
 *
 * @param aFolders - the array of ftvItems to sort.
 */
function sortFolderItems (aFtvItems) {
  function sorter(a, b) {
    return a._folder.compareSortKeys(b._folder);
  }
  aFtvItems.sort(sorter);
}

var gFolderStatsHelpers = {
  kUnknownSize: "-",
  sumSubfoldersPref: false,
  sumSubfolders: false,
  sizeUnits: "",
  kiloUnit: "KB",
  megaUnit: "MB",

  init: function() {
    // We cache these values because the cells in the folder pane columns
    // using these helpers can be redrawn often.
    this.sumSubfoldersPref = Services.prefs.getBoolPref("mail.folderpane.sumSubfolders");
    this.sizeUnits = Services.prefs.getCharPref("mail.folderpane.sizeUnits");
    this.kiloUnit = gFolderTreeView.messengerBundle.getString("kiloByteAbbreviation2");
    this.megaUnit = gFolderTreeView.messengerBundle.getString("megaByteAbbreviation2");
  },

  /**
   * Add a prefix to denote the value is actually a sum of all the subfolders.
   * The prefix is useful as this sum may not always be the exact sum of
   * individual folders when they are shown expanded (due to rounding to a
   * unit).
   * E.g. folder1 600bytes -> 1KB, folder2 700bytes -> 1KB
   * summarized at parent folder: 1300bytes -> 1KB
   *
   * @param aValue                  The value to be displayed.
   * @param aSubfoldersContributed  Boolean indicating whether subfolders
   *                                contributed to the accumulated total value.
   */
  addSummarizedPrefix: function(aValue, aSubfoldersContributed) {
    if (!this.sumSubfolders)
      return aValue;

    if (!aSubfoldersContributed)
      return aValue;

    return gFolderTreeView.messengerBundle.getFormattedString("folderSummarizedSymbolValue", [aValue]);
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
  fixNum: function(aNumber, aSubfoldersContributed) {
    if (aNumber < 0)
      return this.kUnknownSize;

    return (aNumber == 0 ? ""
                         : this.addSummarizedPrefix(aNumber,
                                                    aSubfoldersContributed));
  },

  /**
   * Get the size of the specified folder.
   *
   * @param aFolder  The nsIMsgFolder to analyze.
   */
  getFolderSize: function(aFolder) {
    let folderSize = 0;
    try {
      folderSize = aFolder.sizeOnDisk;
      if (folderSize < 0)
        return this.kUnknownSize;
    } catch(ex) {
      return this.kUnknownSize;
    }
    return folderSize;
  },

  /**
   * Get the total size of all subfolders of the specified folder.
   *
   * @param aFolder  The nsIMsgFolder to analyze.
   */
  getSubfoldersSize: function(aFolder) {
    let folderSize = 0;
    if (aFolder.hasSubFolders) {
      let subFolders = aFolder.subFolders;
      while (subFolders.hasMoreElements()) {
        let subFolder = subFolders.getNext().QueryInterface(Ci.nsIMsgFolder);
        let subSize = this.getFolderSize(subFolder);
        let subSubSize = this.getSubfoldersSize(subFolder);
        if (subSize == this.kUnknownSize || subSubSize == this.kUnknownSize)
          return subSize;

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
   * @return       An array with 2 values.
   *               First is the resulting formatted strings.
   *               The second one is the final unit used to format the string.
   */
  formatFolderSize: function(aSize, aUnit = gFolderStatsHelpers.sizeUnits) {
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
    return [unit.replace("%.*f", size).replace(" ",""), aUnit];
  }
};
