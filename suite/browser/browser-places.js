/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyScriptGetter(this, ["PlacesToolbar", "PlacesMenu",
                                         "PlacesPanelview", "PlacesPanelMenuView"],
                                  "chrome://communicator/content/places/browserPlacesViews.js");

var StarUI = {
  _itemGuids: null,
  uri: null,
  _batching: false,

  _element: function(aID) {
    return document.getElementById(aID);
  },

  // Edit-bookmark panel
  get panel() {
    delete this.panel;
    var element = this._element("editBookmarkPanel");
    // initially the panel is hidden
    // to avoid impacting startup / new window performance
    element.hidden = false;
    element.addEventListener("popuphidden", this);
    element.addEventListener("keypress", this);
    element.addEventListener("keypress", this);
    element.addEventListener("mousedown", this);
    element.addEventListener("mouseout", this);
    element.addEventListener("mousemove", this);
    element.addEventListener("compositionstart", this);
    element.addEventListener("compositionend", this);
    element.addEventListener("input", this);
    element.addEventListener("popuphidden", this);
    element.addEventListener("popupshown", this);
    return this.panel = element;
  },

  // Array of command elements to disable when the panel is opened.
  get _blockedCommands() {
    delete this._blockedCommands;
    return this._blockedCommands =
      ["cmd_close", "cmd_closeWindow"].map(id => this._element(id));
  },

  _blockCommands: function SU__blockCommands() {
    this._blockedCommands.forEach(function (elt) {
      // make sure not to permanently disable this item (see bug 409155)
      if (elt.hasAttribute("wasDisabled"))
        return;
      if (elt.getAttribute("disabled") == "true") {
        elt.setAttribute("wasDisabled", "true");
      } else {
        elt.setAttribute("wasDisabled", "false");
        elt.setAttribute("disabled", "true");
      }
    });
  },

  _restoreCommandsState: function SU__restoreCommandsState() {
    this._blockedCommands.forEach(function (elt) {
      if (elt.getAttribute("wasDisabled") != "true")
        elt.removeAttribute("disabled");
      elt.removeAttribute("wasDisabled");
    });
  },

  // EventListener
  handleEvent: function SU_handleEvent(aEvent) {
    switch (aEvent.type) {
      case "popuphidden":
        if (aEvent.originalTarget == this.panel) {
          if (!this._element("editBookmarkPanelContent").hidden)
            this.quitEditMode();

          this._restoreCommandsState();
          let guidsForRemoval = this._itemGuids;
          this._itemGuids = null;

          if (this._batching) {
            this.endBatch();
          }

          switch (this._actionOnHide) {
            case "cancel": {
              PlacesTransactions.undo().catch(Cu.reportError);
              break;
            }
            case "remove": {
              PlacesTransactions.Remove(guidsForRemoval)
                                .transact().catch(Cu.reportError);
              break;
            }
          }
          this._actionOnHide = "";
        }
        break;
      case "keypress":
        if (aEvent.defaultPrevented) {
          // The event has already been consumed inside of the panel.
          break;
        }
        switch (aEvent.keyCode) {
          case KeyEvent.DOM_VK_ESCAPE:
            if (!this._element("editBookmarkPanelContent").hidden)
              this.cancelButtonOnCommand();
            break;
          case KeyEvent.DOM_VK_RETURN:
            if (aEvent.target.className == "expander-up" ||
                aEvent.target.className == "expander-down" ||
                aEvent.target.id == "editBMPanel_newFolderButton") {
              //XXX Why is this necessary? The defaultPrevented check should
              //    be enough.
              break;
            }
            this.panel.hidePopup(true);
            break;
        }
        break;
    }
  },

  _overlayLoaded: false,
  _overlayLoading: false,
  async showEditBookmarkPopup(aNode, aAnchorElement, aPosition, aIsNewBookmark, aUrl) {
    // Slow double-clicks (not true double-clicks) shouldn't
    // cause the panel to flicker.
    if (this.panel.state == "showing" ||
        this.panel.state == "open") {
      return;
    }

    this._isNewBookmark = aIsNewBookmark;
    this._uriForRemoval = "";
    this._itemGuids = null;

    // Performance: load the overlay the first time the panel is opened
    // (see bug 392443).
    if (this._overlayLoading)
      return;

    if (this._overlayLoaded) {
      await this._doShowEditBookmarkPanel(aNode, aAnchorElement, aPosition, aUrl);
      return;
    }

    this._overlayLoading = true;
    document.loadOverlay(
      "chrome://communicator/content/places/editBookmarkOverlay.xul",
      (aSubject, aTopic, aData) => {
        // Move the header (star, title, button) into the grid,
        // so that it aligns nicely with the other items (bug 484022).
        let header = this._element("editBookmarkPanelHeader");
        let rows = this._element("editBookmarkPanelGrid").lastChild;
        rows.insertBefore(header, rows.firstChild);
        header.hidden = false;

        this._overlayLoading = false;
        this._overlayLoaded = true;
        this._doShowEditBookmarkPanel(aNode, aAnchorElement, aPosition, aUrl);
      }
    );
  },

  async _doShowEditBookmarkPanel(aNode, aAnchorElement, aPosition, aUrl) {
    if (this.panel.state != "closed")
      return;

    this._blockCommands(); // un-done in the popuphiding handler

    // Set panel title:
    // if we are batching, i.e. the bookmark has been added now,
    // then show Page Bookmarked, else if the bookmark did already exist,
    // we are about editing it, then use Edit This Bookmark.
    this._element("editBookmarkPanelTitle").value =
      this._isNewBookmark ?
        gNavigatorBundle.getString("editBookmarkPanel.pageBookmarkedTitle") :
        gNavigatorBundle.getString("editBookmarkPanel.editBookmarkTitle");

    this._element("editBookmarkPanelBottomButtons").hidden = false;
    this._element("editBookmarkPanelContent").hidden = false;

    // The label of the remove button differs if the URI is bookmarked
    // multiple times.
    this._itemGuids = [];

    await PlacesUtils.bookmarks.fetch({url: aUrl},
      bookmark => this._itemGuids.push(bookmark.guid));

    let forms = gNavigatorBundle.getString("editBookmark.removeBookmarks.label");
    let bookmarksCount = this._itemGuids.length;
    let label = PluralForm.get(bookmarksCount, forms)
                          .replace("#1", bookmarksCount);
    this._element("editBookmarkPanelRemoveButton").label = label;

    this.beginBatch();

    let onPanelReady = fn => {
      let target = this.panel;
      if (target.parentNode) {
        // By targeting the panel's parent and using a capturing listener, we
        // can have our listener called before others waiting for the panel to
        // be shown (which probably expect the panel to be fully initialized)
        target = target.parentNode;
      }
      target.addEventListener("popupshown", function(event) {
        fn();
      }, {"capture": true, "once": true});
    };
    gEditItemOverlay.initPanel({ node: aNode,
                                 onPanelReady,
                                 hiddenRows: ["description", "location",
                                              "loadInSidebar", "keyword"],
                                 focusedElement: "preferred"});
    this.panel.openPopup(aAnchorElement, aPosition);
  },

  panelShown:
  function SU_panelShown(aEvent) {
    if (aEvent.target == this.panel) {
      if (!this._element("editBookmarkPanelContent").hidden) {
        let fieldToFocus = "editBMPanel_" +
          Services.prefs.getCharPref("browser.bookmarks.editDialog.firstEditField");
        var elt = this._element(fieldToFocus);
        elt.focus();
        elt.select();
      }
      else {
        // Note this isn't actually used anymore, we should remove this
        // once we decide not to bring back the page bookmarked notification
        this.panel.focus();
      }
    }
  },

  quitEditMode: function SU_quitEditMode() {
    this._element("editBookmarkPanelContent").hidden = true;
    this._element("editBookmarkPanelBottomButtons").hidden = true;
    gEditItemOverlay.uninitPanel(true);
  },

  editButtonCommand: function SU_editButtonCommand() {
    this.showEditBookmarkPopup();
  },

  cancelButtonOnCommand: function SU_cancelButtonOnCommand() {
    this._actionOnHide = "cancel";
    this.panel.hidePopup();
  },

  removeBookmarkButtonCommand: function SU_removeBookmarkButtonCommand() {
    this._removeBookmarksOnPopupHidden = true;
    this._actionOnHide = "remove";
    this.panel.hidePopup();
  },

  _batchBlockingDeferred: null,
  beginBatch() {
    if (this._batching)
      return;
    this._batchBlockingDeferred = PromiseUtils.defer();
    PlacesTransactions.batch(async () => {
      await this._batchBlockingDeferred.promise;
    });
    this._batching = true;
  },

  endBatch() {
    if (!this._batching)
      return;

    this._batchBlockingDeferred.resolve();
    this._batchBlockingDeferred = null;
    this._batching = false;
  },
};

var PlacesCommandHook = {

  /**
   * Adds a bookmark to the page loaded in the given browser using the
   * properties dialog.
   *
   * @param aBrowser
   *        a <browser> element.
   * @param [optional] aShowEditUI
   *        whether or not to show the edit-bookmark UI for the bookmark item
   * @param [optional] aUrl
   *        Option to provide a URL to bookmark rather than the current page
   * @param [optional] aTitle
   *        Option to provide a title for a bookmark to use rather than the
   *        getting the current page's title
   */
  async bookmarkPage(aBrowser, aShowEditUI, aUrl = null, aTitle = null) {
    // If aUrl is provided, we want to bookmark that url rather than the
    // the current page
    let url = aUrl ? new URL(aUrl) : new URL(aBrowser.currentURI.spec);
    let info = await PlacesUtils.bookmarks.fetch({ url });
    let isNewBookmark = !info;
    if (!info) {
      let parentGuid = PlacesUtils.bookmarks.unfiledGuid;
      info = { url, parentGuid };
      let description = null;
      let charset = null;

      let docInfo = aUrl ? {} : await this._getPageDetails(aBrowser);

      try {
        if (docInfo.isErrorPage) {
          let entry = await PlacesUtils.history.fetch(aBrowser.currentURI);
          if (entry) {
            info.title = entry.title;
          }
        } else {
          info.title = aTitle || aBrowser.contentTitle;
        }
        info.title = info.title || url.href;
        description = docInfo.description;
        charset = aUrl ? null : aBrowser.characterSet;
      } catch (e) {
        Cu.reportError(e);
      }

      if (aShowEditUI && isNewBookmark) {
        // If we bookmark the page here but open right into a cancelable
        // state (i.e. new bookmark in Library), start batching here so
        // all of the actions can be undone in a single undo step.
        StarUI.beginBatch();
      }

      if (description) {
        info.annotations = [{ name: PlacesUIUtils.DESCRIPTION_ANNO,
                              value: description }];
      }

      info.guid = await PlacesTransactions.NewBookmark(info).transact();

      // Set the character-set
      if (charset && !PrivateBrowsingUtils.isBrowserPrivate(aBrowser))
         PlacesUtils.setCharsetForURI(makeURI(url.href), charset);
    }

    // If it was not requested to open directly in "edit" mode, we are done.
    if (!aShowEditUI)
      return;

    let node = await PlacesUIUtils.promiseNodeLikeFromFetchInfo(info);

    // Dock the panel to the star icon when possible, otherwise dock
    // it to the content area.
    if (aBrowser.contentWindow == window.content) {
      let ubIcons = aBrowser.ownerDocument.getElementById("urlbar-icons");
      if (ubIcons) {
        await StarUI.showEditBookmarkPopup(node, ubIcons,
                                           "bottomcenter topright",
                                           isNewBookmark, url);
        return;
      }
    }

    await StarUI.showEditBookmarkPopup(node, aBrowser, "overlap",
                                       isNewBookmark, url);
  },

  _getPageDetails(browser) {
    return new Promise(resolve => {
      let mm = browser.messageManager;
      mm.addMessageListener("Bookmarks:GetPageDetails:Result", function listener(msg) {
        mm.removeMessageListener("Bookmarks:GetPageDetails:Result", listener);
        resolve(msg.data);
      });

      mm.sendAsyncMessage("Bookmarks:GetPageDetails", { });
    });
  },

  /**
   * Adds a bookmark to the page targeted by a link.
   * @param parentId
   *        The folder in which to create a new bookmark if aURL isn't
   *        bookmarked.
   * @param url (string)
   *        the address of the link target
   * @param title
   *        The link text
   * @param [optional] description
   *        The linked page description, if available
   */
  async bookmarkLink(parentId, url, title, description = "") {
    let bm = await PlacesUtils.bookmarks.fetch({url});
    if (bm) {
      let node = await PlacesUIUtils.promiseNodeLikeFromFetchInfo(bm);
      PlacesUIUtils.showBookmarkDialog({ action: "edit", node },
                                       window.top);
      return;
    }

    let parentGuid = parentId == PlacesUtils.bookmarksMenuFolderId ?
                       PlacesUtils.bookmarks.menuGuid :
                       await PlacesUtils.promiseItemGuid(parentId);
    let defaultInsertionPoint = new PlacesInsertionPoint({ parentId, parentGuid });

    PlacesUIUtils.showBookmarkDialog({ action: "add",
                                       type: "bookmark",
                                       uri: makeURI(url),
                                       title,
                                       description,
                                       defaultInsertionPoint,
                                       hiddenRows: [ "description",
                                                     "location",
                                                     "loadInSidebar",
                                                     "keyword" ]
                                     }, window.top);
  },

  /**
   * List of nsIURI objects characterizing the tabs currently open in the
   * browser. The URIs will be in the order in which their
   * corresponding tabs appeared and duplicates are discarded.
   */
  get uniqueCurrentPages() {
    let seenURIs = {};
    let URIs = [];

    gBrowser.tabs.forEach(tab => {
      let browser = tab.linkedBrowser;
      let uri = browser.currentURI;
      // contentTitle is usually empty.
      let title = browser.contentTitle || tab.label;
      let spec = uri.spec;
      if (!(spec in seenURIs)) {
        // add to the set of seen URIs
        seenURIs[uri.spec] = null;
        URIs.push({ uri, title });
      }
    });

    return URIs;
  },

  /**
   * Adds a folder with bookmarks to all of the currently open tabs in this
   * window.
   */
  bookmarkCurrentPages: function PCH_bookmarkCurrentPages() {
    let pages = this.uniqueCurrentPages;
    if (pages.length > 1) {
      PlacesUIUtils.showBookmarkDialog({ action: "add",
                                         type: "folder",
                                         URIList: pages,
                                         hiddenRows: [ "description" ]
                                       }, window);
    }
  },

  /**
   * Updates disabled state for the "Bookmark All Tabs" command.
   */
  updateBookmarkAllTabsCommand:
  function PCH_updateBookmarkAllTabsCommand() {
    // There's nothing to do in non-browser windows.
    if (window.location.href != getBrowserURL())
      return;

    // Disable "Bookmark All Tabs" if there are less than two
    // "unique current pages".
    goSetCommandEnabled("Browser:BookmarkAllTabs",
                        this.uniqueCurrentPages.length >= 2);
  },

  /**
   * Adds a Live Bookmark to a feed associated with the current page.
   * @param     url
   *            The nsIURI of the page the feed was attached to
   * @title     title
   *            The title of the feed. Optional.
   * @subtitle  subtitle
   *            A short description of the feed. Optional.
   */
  async addLiveBookmark(url, feedTitle, feedSubtitle) {
    let toolbarIP = new PlacesInsertionPoint({
      parentId: PlacesUtils.toolbarFolderId,
      parentGuid: PlacesUtils.bookmarks.toolbarGuid
    });

    let feedURI = makeURI(url);
    let title = feedTitle || gBrowser.contentTitle;
    let description = feedSubtitle;
    if (!description) {
      description = (await this._getPageDetails(gBrowser.selectedBrowser)).description;
    }

    PlacesUIUtils.showBookmarkDialog({ action: "add",
                                       type: "livemark",
                                       feedURI,
                                       siteURI: gBrowser.currentURI,
                                       title,
                                       description,
                                       defaultInsertionPoint: toolbarIP,
                                       hiddenRows: [ "feedLocation",
                                                     "siteLocation",
                                                     "description" ]
                                     }, window);
  },

  /**
   * Opens the Places Organizer.
   * @param {String} item The item to select in the organizer window,
   *                      options are (case sensitive):
   *                      BookmarksMenu, BookmarksToolbar, UnfiledBookmarks,
   *                      AllBookmarks, History.
   */
  showPlacesOrganizer(item) {
    var organizer = Services.wm.getMostRecentWindow("Places:Organizer");
    // Due to bug 528706, getMostRecentWindow can return closed windows.
    if (!organizer || organizer.closed) {
      // No currently open places window, so open one with the specified mode.
      openDialog("chrome://communicator/content/places/places.xul",
                 "", "chrome,toolbar=yes,dialog=no,resizable", item);
    } else {
      organizer.PlacesOrganizer.selectLeftPaneContainerByHierarchy(item);
      organizer.focus();
    }
  },
};

/**
 * Functions for handling events in the Bookmarks Toolbar and menu.
 */
var BookmarksEventHandler = {

  onMouseUp(aEvent) {
    // Handles left-click with modifier if not browser.bookmarks.openInTabClosesMenu.
    if (aEvent.button != 0 || PlacesUIUtils.openInTabClosesMenu)
      return;
    let target = aEvent.originalTarget;
    if (target.tagName != "menuitem")
      return;
    let modifKey = AppConstants.platform === "macosx" ? aEvent.metaKey
                                                      : aEvent.ctrlKey;
    // Don't keep menu open for 'Open all in Tabs'.
    if (modifKey && !target.classList.contains("openintabs-menuitem")) {
      target.setAttribute("closemenu", "none");
    }
  },

  /**
   * Handler for click event for an item in the bookmarks toolbar or menu.
   * Menus and submenus from the folder buttons bubble up to this handler.
   * Left-click is handled in the onCommand function.
   * When items are middle-clicked (or clicked with modifier), open in tabs.
   * If the click came through a menu, close the menu.
   * @param aEvent
   *        DOMEvent for the click
   * @param aView
   *        The places view which aEvent should be associated with.
   */
  onClick: function BEH_onClick(aEvent, aView) {
    // Only handle middle-click or left-click with modifiers.
    if (aEvent.button == 2 || (aEvent.button == 0 && !aEvent.shiftKey &&
                               !aEvent.ctrlKey && !aEvent.metaKey))
      return;

    var target = aEvent.originalTarget;
    // If this event bubbled up from a menu or menuitem,
    // close the menus if browser.bookmarks.openInTabClosesMenu.
    if ((PlacesUIUtils.openInTabClosesMenu && target.tagName == "menuitem") ||
        target.tagName == "menu" ||
        target.classList.contains("openintabs-menuitem")) {
      closeMenus(aEvent.target);
    }
    // Command already precesssed so remove any closemenu attr set in onMouseUp.
    if (aEvent.button == 0 &&
        target.tagName == "menuitem" &&
        target.getAttribute("closemenu") == "none") {
      // On Mac we need to extend when we remove the flag, to avoid any pre-close
      // animations.
      setTimeout(() => {
        target.removeAttribute("closemenu");
      }, 500);
    }

    if (target._placesNode && PlacesUtils.nodeIsContainer(target._placesNode)) {
      // Don't open the root folder in tabs when the empty area on the toolbar
      // is middle-clicked or when a non-bookmark item except for Open in Tabs)
      // in a bookmarks menupopup is middle-clicked.
      if (target.localName == "menu" || target.localName == "toolbarbutton")
        PlacesUIUtils.openContainerNodeInTabs(target._placesNode, aEvent, aView);
    }
    else if (aEvent.button == 1) {
      // left-clicks with modifier are already served by onCommand
      this.onCommand(aEvent);
    }
  },

  /**
   * Handler for command event for an item in the bookmarks toolbar.
   * Menus and submenus from the folder buttons bubble up to this handler.
   * Opens the item.
   * @param aEvent
   *        DOMEvent for the command
   */
  onCommand: function BEH_onCommand(aEvent) {
    var target = aEvent.originalTarget;
    if (target._placesNode)
      PlacesUIUtils.openNodeWithEvent(target._placesNode, aEvent);
  },

  onPopupShowing: function BEH_onPopupShowing(aEvent) {
    var browser = getBrowser();
    if (!aEvent.currentTarget.parentNode._placesView)
      new PlacesMenu(aEvent, 'place:folder=BOOKMARKS_MENU');

    document.getElementById("Browser:BookmarkAllTabs")
            .setAttribute("disabled", !browser || browser.tabs.length == 1);
  },

  fillInBHTooltip: function BEH_fillInBHTooltip(aDocument, aEvent) {
    var node;
    var cropped = false;
    var targetURI;

    if (aDocument.tooltipNode.localName == "treechildren") {
      var tree = aDocument.tooltipNode.parentNode;
      var tbo = tree.treeBoxObject;
      var cell = tbo.getCellAt(aEvent.clientX, aEvent.clientY);
      if (cell.row == -1)
        return false;
      node = tree.view.nodeForTreeIndex(cell.row);
      cropped = tbo.isCellCropped(cell.row, cell.col);
    }
    else {
      // Check whether the tooltipNode is a Places node.
      // In such a case use it, otherwise check for targetURI attribute.
      var tooltipNode = aDocument.tooltipNode;
      if (tooltipNode._placesNode)
        node = tooltipNode._placesNode;
      else {
        // This is a static non-Places node.
        targetURI = tooltipNode.getAttribute("targetURI");
      }
    }

    if (!node && !targetURI)
      return false;

    // Show node.label as tooltip's title for non-Places nodes.
    var title = node ? node.title : tooltipNode.label;

    // Show URL only for Places URI-nodes or nodes with a targetURI attribute.
    var url;
    if (targetURI || PlacesUtils.nodeIsURI(node))
      url = targetURI || node.uri;

    // Show tooltip for containers only if their title is cropped.
    if (!cropped && !url)
      return false;

    var tooltipTitle = aDocument.getElementById("bhtTitleText");
    tooltipTitle.hidden = (!title || (title == url));
    if (!tooltipTitle.hidden)
      tooltipTitle.textContent = title;

    var tooltipUrl = aDocument.getElementById("bhtUrlText");
    tooltipUrl.hidden = !url;
    if (!tooltipUrl.hidden)
      tooltipUrl.value = url;

    // Show tooltip.
    return true;
  }
};


// Handles special drag and drop functionality for Places menus that are not
// part of a Places view (e.g. the bookmarks menu in the menubar).
var PlacesMenuDNDHandler = {
  _springLoadDelay: 350, // milliseconds
  _loadTimer: null,

  /**
   * Called when the user enters the <menu> element during a drag.
   * @param   event
   *          The DragEnter event that spawned the opening.
   */
  onDragEnter: function PMDH_onDragEnter(event) {
    // Opening menus in a Places popup is handled by the view itself.
    if (!this._isStaticContainer(event.target))
      return;

    this._loadTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    this._loadTimer.initWithCallback(function() {
      PlacesMenuDNDHandler._loadTimer = null;
      event.target.lastChild.setAttribute("autoopened", "true");
      event.target.lastChild.showPopup(event.target.lastChild);
    }, this._springLoadDelay, Ci.nsITimer.TYPE_ONE_SHOT);
    event.preventDefault();
    event.stopPropagation();
  },

  /**
   * Handles dragexit on the <menu> element.
   * @returns true if the element is a container element (menu or
   *          menu-toolbarbutton), false otherwise.
   */
  onDragExit: function PMDH_onDragExit(event) {
    // Closing menus in a Places popup is handled by the view itself.
    if (!this._isStaticContainer(event.target))
      return;

    if (this._loadTimer) {
      this._loadTimer.cancel();
      this._loadTimer = null;
    }
    let closeTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    closeTimer.initWithCallback(function() {
      let node = PlacesControllerDragHelper.currentDropTarget;
      let inHierarchy = false;
      while (node && !inHierarchy) {
        inHierarchy = node == event.target;
        node = node.parentNode;
      }
      if (!inHierarchy && event.target.lastChild &&
          event.target.lastChild.hasAttribute("autoopened")) {
        event.target.lastChild.removeAttribute("autoopened");
        event.target.lastChild.hidePopup();
      }
    }, this._springLoadDelay, Ci.nsITimer.TYPE_ONE_SHOT);
  },

  /**
   * Determines if a XUL element represents a static container.
   * @returns true if the element is a container element (menu or
   *          menu-toolbarbutton), false otherwise.
   */
  _isStaticContainer: function PMDH__isContainer(node) {
    let isMenu = node.localName == "menu" ||
                 (node.localName == "toolbarbutton" &&
                  node.getAttribute("type") == "menu");
    let isStatic = !("_placesNode" in node) && node.lastChild &&
                   node.lastChild.hasAttribute("placespopup") &&
                   !node.parentNode.hasAttribute("placespopup");
    return isMenu && isStatic;
  },

  /**
   * Called when the user drags over the <menu> element.
   * @param   event
   *          The DragOver event.
   */
  onDragOver: function PMDH_onDragOver(event) {
    let ip = new PlacesInsertionPoint({
      parentId: PlacesUtils.bookmarksMenuFolderId,
      parentGuid: PlacesUtils.bookmarks.menuGuid
    });
    if (ip && PlacesControllerDragHelper.canDrop(ip, event.dataTransfer))
      event.preventDefault();

    event.stopPropagation();
  },

  /**
   * Called when the user drops on the <menu> element.
   * @param   event
   *          The Drop event.
   */
  onDrop: function PMDH_onDrop(event) {
    // Put the item at the end of bookmark menu.
    let ip = new PlacesInsertionPoint({
      parentId: PlacesUtils.bookmarksMenuFolderId,
      parentGuid: PlacesUtils.bookmarks.menuGuid
    });
    PlacesControllerDragHelper.onDrop(ip, event.dataTransfer);
    event.stopPropagation();
  }
};


var BookmarkingUI = {
  _hasBookmarksObserver: false,
  _itemGuids: new Set(),

  uninit: function BUI_uninit()
  {
    if (this._hasBookmarksObserver) {
      PlacesUtils.bookmarks.removeObserver(this);
    }

    if (this._pendingUpdate) {
      delete this._pendingUpdate;
    }
  },

  QueryInterface: XPCOMUtils.generateQI([
    Ci.nsINavBookmarkObserver
  ]),

  get _starredTooltip()
  {
    delete this._starredTooltip;
    return this._starredTooltip =
      gNavigatorBundle.getString("starButtonOn.tooltip");
  },

  get _unstarredTooltip()
  {
    delete this._unstarredTooltip;
    return this._unstarredTooltip =
      gNavigatorBundle.getString("starButtonOff.tooltip");
  },

  updateStarState: function BUI_updateStarState() {
    this._uri = gBrowser.currentURI;
    this._itemGuids = [];
    let aItemGuids = [];

    // those objects are use to check if we are in the current iteration before
    // returning any result.
    let pendingUpdate = this._pendingUpdate = {};

    PlacesUtils.bookmarks.fetch({url: this._uri}, b => aItemGuids.push(b.guid))
      .catch(Cu.reportError)
      .then(() => {
         if (pendingUpdate != this._pendingUpdate) {
           return;
         }

         // It's possible that onItemAdded gets called before the async statement
         // calls back.  For such an edge case, retain all unique entries from the
         // array.
         this._itemGuids = this._itemGuids.filter(
           guid => !aItemGuids.includes(guid)
         ).concat(aItemGuids);

         this._updateStar();

         // Start observing bookmarks if needed.
         if (!this._hasBookmarksObserver) {
           try {
             PlacesUtils.bookmarks.addObserver(this);
             this._hasBookmarksObserver = true;
           } catch (ex) {
             Cu.reportError("BookmarkingUI failed adding a bookmarks observer: " + ex);
           }
         }

         delete this._pendingUpdate;
       });
  },

  _updateStar: function BUI__updateStar()
  {
    let starIcon = document.getElementById("star-button");
    if (this._itemGuids.length > 0) {
      starIcon.setAttribute("starred", "true");
      starIcon.setAttribute("tooltiptext", this._starredTooltip);
    }
    else {
      starIcon.removeAttribute("starred");
      starIcon.setAttribute("tooltiptext", this._unstarredTooltip);
    }
  },

  onClick: function BUI_onClick(aEvent)
  {
    // Ignore clicks on the star while we update its state.
    if (aEvent.button == 0 && !this._pendingUpdate)
      PlacesCommandHook.bookmarkPage(gBrowser.selectedBrowser,
                                     this._itemGuids.length > 0);

  },

  // nsINavBookmarkObserver
  onItemAdded(aItemId, aParentId, aIndex, aItemType, aURI, aTitle, aDateAdded, aGuid) {
    if (aURI && aURI.equals(this._uri)) {
      // If a new bookmark has been added to the tracked uri, register it.
      if (!this._itemGuids.includes(aGuid)) {
        this._itemGuids.push(aGuid);
        // Only need to update the UI if it wasn't marked as starred before:
        if (this._itemGuids.length == 1) {
          this._updateStar();
        }
      }
    }
  },

  onItemRemoved(aItemId, aParentId, aIndex, aItemType, aURI, aGuid) {
    let index = this._itemGuids.indexOf(aGuid);
    // If one of the tracked bookmarks has been removed, unregister it.
    if (index != -1) {
      this._itemGuids.splice(index, 1);
      // Only need to update the UI if the page is no longer starred
      if (this._itemGuids.length == 0) {
        this._updateStar();
      }
    }
  },

  onItemChanged(aItemId, aProperty, aIsAnnotationProperty, aNewValue, aLastModified,
                aItemType, aParentId, aGuid) {
    if (aProperty == "uri") {
      let index = this._itemGuids.indexOf(aGuid);
      // If the changed bookmark was tracked, check if it is now pointing to
      // a different uri and unregister it.
      if (index != -1 && aNewValue != this._uri.spec) {
        this._itemGuids.splice(index, 1);
        // Only need to update the UI if the page is no longer starred
        if (this._itemGuids.length == 0) {
          this._updateStar();
        }
      } else if (index == -1 && aNewValue == this._uri.spec) {
        // If another bookmark is now pointing to the tracked uri, register it.
        this._itemGuids.push(aGuid);
        // Only need to update the UI if it wasn't marked as starred before:
        if (this._itemGuids.length == 1) {
          this._updateStar();
        }
      }
    }
  },

  onBeginUpdateBatch: function () {},
  onEndUpdateBatch: function () {},
  onItemVisited: function () {},
  onItemMoved: function () {}
};


// This object handles the initialization and uninitialization of the bookmarks
// toolbar.  updateStarState is called when the browser window is opened and
// after closing the toolbar customization dialog.
var PlacesToolbarHelper = {
  _place: "place:folder=TOOLBAR",
  get _viewElt() {
    return document.getElementById("PlacesToolbar");
  },

  init: function PTH_init() {
    let viewElt = this._viewElt;
    if (!viewElt || viewElt._placesView)
      return;

    // There is no need to initialize the toolbar if customizing because
    // init() will be called when the customization is done.
    if (this._isCustomizing)
      return;

    new PlacesToolbar(this._place);
  },

  customizeStart: function PTH_customizeStart() {
    let viewElt = this._viewElt;
    if (viewElt && viewElt._placesView)
      viewElt._placesView.uninit();

    this._isCustomizing = true;
  },

  customizeDone: function PTH_customizeDone() {
    this._isCustomizing = false;
    this.init();
  }
};


// Handles the bookmarks menu popup
var BookmarksMenu = {
  _popupInitialized: {},
  onPopupShowing: function BM_onPopupShowing(aEvent, aPrefix) {
    if (!(aPrefix in this._popupInitialized)) {
      // First popupshowing event, initialize immutable attributes.
      this._popupInitialized[aPrefix] = true;

      // Need to set the label on Unsorted Bookmarks menu.
      let unsortedBookmarksElt =
        document.getElementById(aPrefix + "unsortedBookmarksFolderMenu");
      unsortedBookmarksElt.label =
        PlacesUtils.getString("OtherBookmarksFolderTitle");
    }
  },
};
