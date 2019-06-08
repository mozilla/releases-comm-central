/* This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* globals MozElements */

// Wrap in a block to prevent leaking to window scope.
{
  const { FeedUtils } = ChromeUtils.import("resource:///modules/FeedUtils.jsm");
  const { allAccountsSorted, folderNameCompare, getSpecialFolderString, getMostRecentFolders } =
    ChromeUtils.import("resource:///modules/folderUtils.jsm");
  const { fixIterator, toArray } = ChromeUtils.import("resource:///modules/iteratorUtils.jsm");
  const { MailServices } = ChromeUtils.import("resource:///modules/MailServices.jsm");
  const { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");
  const { StringBundle } = ChromeUtils.import("resource:///modules/StringBundle.js");

  /**
   * The MozFolderMenupopup widget is used as a menupopup for selecting
   * a folder from the list of all the folders from every account. It is also
   * used for selecting the account from the list of all the accounts. The each
   * menuitem gets displayed with the folder or account name and icon.
   *
   * @extends {MozElements.MozMenuPopup}
   */
  class MozFolderMenupopup extends MozElements.MozMenuPopup {
    constructor() {
      super();

      // In order to improve performance, we're not going to build any of the
      // menu until we're shown.
      // note: _ensureInitialized can be called repeatedly without issue, so
      //       don't worry about it here.
      this.addEventListener("popupshowing", (event) => {
        this._ensureInitialized();
      }, true);

      window.addEventListener("unload", () => {
        this._removeListener();
      }, { once: true });

      // If non-null, the subFolders of this nsIMsgFolder will be used to
      // populate this menu.  If this is null, the menu will be populated
      // using the root-folders for all accounts.
      this._parentFolder = null;

      this._stringBundle = null;

      // Various filtering modes can be used with this menu-binding. To use
      // one of them, append the mode="foo" attribute to the element. When
      // building the menu, we will then use this._filters[mode] as a filter
      // function to eliminate folders that should not be shown.
      // note: extensions should feel free to plug in here.
      this._filters = {
        // Returns true if messages can be filed in the folder.
        filing(folder) {
          if (!folder.server.canFileMessagesOnServer) {
            return false;
          }

          return (folder.canFileMessages || folder.hasSubFolders);
        },

        // Returns true if we can get mail for this folder. (usually this just
        // means the "root" fake folder).
        getMail(folder) {
          if (folder.isServer && folder.server.type != "none") {
            return true;
          }
          if (folder.server.type == "nntp" || folder.server.type == "rss") {
            return true;
          }
          return false;
        },

        // Returns true if we can add filters to this folder/account.
        filters(folder) {
          // We can always filter news.
          if (folder.server.type == "nntp") {
            return true;
          }

          return folder.server.canHaveFilters;
        },

        subscribe(folder) {
          return folder.canSubscribe;
        },

        newFolder(folder) {
          return folder.canCreateSubfolders &&
            folder.server.canCreateFoldersOnServer;
        },

        deferred(folder) {
          return folder.server.canCreateFoldersOnServer &&
            !folder.supportsOffline;
        },

        // Folders that are not in a deferred account.
        notDeferred(folder) {
          let server = folder.server;
          return !(server instanceof Ci.nsIPop3IncomingServer &&
            server.deferredToAccount);
        },

        // Folders that can be searched.
        search(folder) {
          if (!folder.server.canSearchMessages ||
              folder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
            return false;
          }
          return true;
        },

        // Folders that can subscribe feeds.
        feeds(folder) {
          if (folder.server.type != "rss" ||
              folder.getFlag(Ci.nsMsgFolderFlags.Trash) ||
              folder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
            return false;
          }
          return true;
        },

        junk(folder) {
          // Don't show servers (nntp & any others) which do not allow search or filing
          // I don't really understand why canSearchMessages is needed, but it was included in
          // earlier code, so I include it as well.
          if (!folder.server.canFileMessagesOnServer || !folder.server.canSearchMessages) {
            return false;
          }
          // Show parents that might have usable subfolders, or usable folders.
          return folder.hasSubFolders || folder.canFileMessages;
        },
      };

      // The maximum number of entries in the "Recent" menu.
      this._MAXRECENT = 15;

      // Is this list containing only servers (accounts) and no real folders?
      this._serversOnly = true;

      /**
       * Our listener to let us know when folders change/appear/disappear so
       * we can know to rebuild ourselves.
       *
       * @implements {nsIFolderListener}
       */
      this._listener = {
        _menu: this,
        _clearMenu(menu) {
          // I'm not quite sure why this isn't always a function (bug 514445).
          if (menu._teardown) {
            menu._teardown();
          }
        },

        _setCssSelectorsForItem(item) {
          const child = this._getChildForItem(item);
          if (child) {
            this._menu._setCssSelectors(child._folder, child);
          }
        },

        _itemAddedOrRemoved(item) {
          if (!(item instanceof Ci.nsIMsgFolder)) {
            return;
          }
          if (this._filterFunction && !this._filterFunction(item)) {
            return;
          }
          // xxx we can optimize this later
          this._clearMenu(this._menu);
        },

        OnItemAdded(ParentItem, item) {
          this._itemAddedOrRemoved(item);
        },
        OnItemRemoved(ParentItem, item) {
          this._itemAddedOrRemoved(item);
        },

        // xxx I stole this listener list from nsMsgFolderDatasource.cpp, but
        // someone should really document what events are fired when, so that
        // we make sure we're updating at the right times.
        OnItemPropertyChanged(item, property, old, newItem) { },
        OnItemIntPropertyChanged(item, property, old, aNew) {
          if (item instanceof Ci.nsIMsgFolder) {
            if (property == "FolderFlag") {
              if (this._menu.getAttribute("showFavorites") != "true" ||
                  !this._menu._initializedSpecials.has("favorites")) {
                return;
              }

              if ((old & Ci.nsMsgFolderFlags.Favorite) !=
                  (aNew & Ci.nsMsgFolderFlags.Favorite)) {
                setTimeout(this._clearMenu, 0, this._menu);
              }
            }
          }
          this._setCssSelectorsForItem(item);
        },
        OnItemBoolPropertyChanged(item, property, old, newItem) {
          this._setCssSelectorsForItem(item);
        },
        OnItemUnicharPropertyChanged(item, property, old, newItem) {
          this._setCssSelectorsForItem(item);
        },
        OnItemPropertyFlagChanged(item, property, old, newItem) { },
        OnItemEvent(folder, eventName) {
          if (eventName == "MRMTimeChanged") {
            if (this._menu.getAttribute("showRecent") != "true" ||
                !this._menu._initializedSpecials.has("recent") ||
                !this._menu.firstChild || !this._menu.firstChild.firstChild) {
              return;
            }
            // If this folder is already in the recent menu, return.
            if (this._getChildForItem(folder,
                  this._menu.firstChild.firstChild)) {
              return;
            }
          } else if (eventName == "RenameCompleted") {
            // Special casing folder renames here, since they require more work
            // since sort-order may have changed.
            if (!this._getChildForItem(folder)) {
              return;
            }
          } else {
            return;
          }
          // Folder renamed, or new recent folder, so rebuild.
          setTimeout(this._clearMenu, 0, this._menu);
        },

        /**
         * Helper function to check and see whether we have a menuitem for this
         * particular nsIMsgFolder.
         *
         * @param {nsIMsgFolder} item  The folder to check.
         * @param {Element} [menu]     Optional menu to look in, defaults to this._menu.
         * @returns {Element|null}     The menuitem for that folder, or null if no
         *                             child for that folder exists.
         */
        _getChildForItem(item, menu) {
          let _menu = menu || this._menu;
          if (!_menu || !_menu.hasChildNodes()) {
            return null;
          }
          if (!(item instanceof Ci.nsIMsgFolder)) {
            return null;
          }
          for (let i = 0; i < _menu.childNodes.length; i++) {
            let folder = _menu.childNodes[i]._folder;
            if (folder && folder.URI == item.URI) {
              return _menu.childNodes[i];
            }
          }
          return null;
        },
      };

      // True if we have already built our menu items and are now just
      // listening for changes.
      this._initialized = false;

      // A Set listing which of our special menus are already built.
      // E.g. "recent", "favorites".
      this._initializedSpecials = new Set();

      // The format for displaying names of folders.
      this._displayformat = null;
    }

    connectedCallback() {
      if (this.delayConnectedCallback()) {
        return;
      }

      this.setAttribute("is", "folder-menupopup");

      this._stringBundle = new StringBundle("chrome://messenger/locale/folderWidgets.properties");

      // Get the displayformat if set.
      if (this.parentNode && this.parentNode.localName == "menulist") {
        this._displayformat = this.parentNode.getAttribute("displayformat");
      }

      // Find out if we are in a wrapper (customize toolbars mode is active).
      let inWrapper = false;
      let node = this;
      while (node instanceof XULElement) {
        if (node.id.startsWith("wrapper-")) {
          inWrapper = true;
          break;
        }
        node = node.parentNode;
      }

      if (!inWrapper) {
        if (this.hasAttribute("original-width")) {
           // If we were in a wrapper before and have a width stored, restore it now.
          if (this.getAttribute("original-width") == "none") {
            this.removeAttribute("width");
          } else {
            this.setAttribute("width", this.getAttribute("original-width"));
          }

          this.removeAttribute("original-width");
        }

        // If we are a child of a menulist, and we aren't in a wrapper, we
        // need to build our content right away, otherwise the menulist
        // won't have proper sizing.
        if (this.parentNode && this.parentNode.localName == "menulist") {
          this._ensureInitialized();
        }
      } else {
        // But if we're in a wrapper, remove our children, because we're
        // getting re-created when the toolbar customization closes.
        this._teardown();

        // Store our current width and set a safe small width when we show
        // in a wrapper.
        if (!this.hasAttribute("original-width")) {
          this.setAttribute("original-width", this.hasAttribute("width") ?
            this.getAttribute("width") : "none");
          this.setAttribute("width", "100");
        }
      }
    }

    set parentFolder(val) {
      return this._parentFolder = val;
    }

    get parentFolder() {
      return this._parentFolder;
    }

    /**
     * Make sure we remove our listener when the window is being destroyed
     * or the widget torn down.
     */
    _removeListener() {
      if (!this._initialized) {
        return;
      }
      MailServices.mailSession.RemoveFolderListener(this._listener);
    }

    /**
     * Call this if you do not know whether the menu items have been built,
     * but know that they need to be built now if they haven't been yet.
     */
    _ensureInitialized() {
      if (this._initialized) {
        return;
      }

      // The excludeServers attribute is a comma separated list of server keys.
      const excludeServers = this.hasAttribute("excludeServers") ?
        this.getAttribute("excludeServers").split(",") : [];

      // Extensions and other consumers can add to these modes too, see the
      // note on the _filters field. (Note: empty strings ("") are falsy in JS.)
      const mode = this.getAttribute("mode");

      const filterFunction = mode ? this._filters[mode] : (folder) => true;

      const folders = this._getFolders(this._parentFolder, excludeServers,
        (mode ? filterFunction : null));

      this._listener._filterFunction = filterFunction;

      this._build(folders, mode);

      // Lastly, we add a listener to get notified of changes in the folder
      // structure.
      MailServices.mailSession.AddFolderListener(this._listener,
        Ci.nsIFolderListener.all);

      this._initialized = true;
    }

    /**
     * Get the folders that will appear in the menu.
     *
     * @param {Element} parentFolder       The parent menu popup/view element.
     * @param {string[]} excludeServers    Server keys for the servers to exclude.
     * @param {Function} [filterFunction]  Function for filtering the folders.
     */
    _getFolders(parentFolder, excludeServers, filterFunction) {
      let folders;

      // If we have a parent folder, just get the subFolders for that parent.
      if (parentFolder) {
        folders = toArray(fixIterator(parentFolder.subFolders,
          Ci.nsIMsgFolder));
      } else {
        // If we don't have a parent, then we assume we should build the
        // top-level accounts. (Actually we build the fake root folders for
        // those accounts.)
        let accounts = allAccountsSorted(true);

        // Now generate our folder list. Note that we'll special case this
        // situation elsewhere, to avoid destroying the sort order we just made.
        folders = accounts.map(acct => acct.incomingServer.rootFolder);
      }

      if (filterFunction) {
        folders = folders.filter(filterFunction);
      }

      if (excludeServers.length > 0) {
        folders = folders.filter(folder =>
          !excludeServers.includes(folder.server.key));
      }
      return folders;
    }

    /**
     * Actually constructs the menu items based on the folders given.
     *
     * @param {nsIMsgFolder[]} folders  An array of nsIMsgFolders to use for building.
     * @param {string} [mode]  The filtering mode. See comment on _filters field.
     */
    _build(folders, mode) {
      let globalInboxFolder = null;

      // See if this is the toplevel menu (usually with accounts).
      if (!this._parentFolder) {
        this._addTopLevelMenuItems();

        // If we are showing the accounts for deferring, move Local Folders to the top.
        if (mode == "deferred") {
          globalInboxFolder = MailServices.accounts.localFoldersServer
            .rootFolder;
          let localFoldersIndex = folders.indexOf(globalInboxFolder);
          if (localFoldersIndex != -1) {
            folders.splice(localFoldersIndex, 1);
            folders.unshift(globalInboxFolder);
          }
        }
        // If we're the root of the folder hierarchy, then we actually don't
        // want to sort the folders, but rather the accounts to which the
        // folders belong. Since that sorting was already done, we don't need
        // to do anything for that case here.
      } else {
        this._maybeAddParentFolderMenuItem(mode);

        // Sort the list of folders. We give first priority to the sortKey
        // property if it is available, otherwise a case-insensitive
        // comparison of names.
        folders = folders.sort((a, b) => a.compareSortKeys(b));
      }

      this._addFoldersMenuItems(folders, mode, globalInboxFolder);
    }

    /**
     * Add menu items that only appear at top level, like "Recent".
     */
    _addTopLevelMenuItems() {
      const showRecent = this.getAttribute("showRecent") == "true";
      const showFavorites = this.getAttribute("showFavorites") == "true";

      if (showRecent) {
        this.appendChild(this._buildSpecialMenu("recent"));
      }
      if (showFavorites) {
        this.appendChild(this._buildSpecialMenu("favorites"));
      }
      if (showRecent || showFavorites) {
        // If we added Recent and/or Favorites, separate them from the rest of the items.
        const sep = document.createXULElement("menuseparator");
        sep.setAttribute("generated", "true");
        this.appendChild(sep);
      }
    }

    /**
     * This only creates the menu item (or toolbarbutton) in the top-level
     * menulist. The submenu is created once the popup is really shown,
     * via the _buildSpecialSubmenu method.
     *
     * @param {string} type  Type of special menu (e.g. "recent", "favorites").
     * @return {Element}     The `menu` or `toolbarbutton` element.
     */
    _buildSpecialMenu(type) {
      // Now create the Recent folder menu and its children.
      let menu = document.createXULElement("menu");
      menu.setAttribute("special", type);

      menu.setAttribute("label", this.getAttribute((type == "recent") ?
        "recentLabel" : "favoritesLabel"));

      menu.setAttribute("accesskey", this.getAttribute((type == "recent") ?
        "recentAccessKey" : "favoritesAccessKey"));

      menu.setAttribute("generated", "true");

      let popup = document.createXULElement("menupopup");
      popup.setAttribute("class", this.getAttribute("class"));
      popup.addEventListener("popupshowing", (event) => {
        this._buildSpecialSubmenu(menu);
      }, { once: true });

      menu.appendChild(popup);
      return menu;
    }

    /**
     * Builds a submenu with all of the recently used folders in it, to
     * allow for easy access.
     *
     * @param {Element} menu  The menu element for which one wants to build the special sub menu.
     */
    _buildSpecialSubmenu(menu) {
      let specialType = menu.getAttribute("special");
      if (this._initializedSpecials.has(specialType)) {
        return;
      }

      // Iterate through all folders in all accounts matching the current filter.
      let specialFolders = toArray(
        fixIterator(MailServices.accounts.allFolders, Ci.nsIMsgFolder));
      if (this._listener._filterFunction) {
        specialFolders = specialFolders.filter(this._listener._filterFunction);
      }

      switch (specialType) {
        case "recent":
          // Find 15 (_MAXRECENT) of most recently modified ones.
          specialFolders = getMostRecentFolders(specialFolders,
            this._MAXRECENT,
            "MRMTime");
          break;
        case "favorites":
          specialFolders = specialFolders.filter(folder => folder.getFlag(Ci.nsMsgFolderFlags.Favorite));
          break;
      }

      // Cache the pretty names so that they do not need to be fetched
      // _MAXRECENT^2 times later.
      let specialFoldersMap = specialFolders.map(folder => {
        return {
          folder,
          name: folder.prettyName,
        };
      });

      // Because we're scanning across multiple accounts, we can end up with
      // several folders with the same name. Find those dupes.
      let dupeNames = new Set();
      for (let i = 0; i < specialFoldersMap.length; i++) {
        for (let j = i + 1; j < specialFoldersMap.length; j++) {
          if (specialFoldersMap[i].name == specialFoldersMap[j].name) {
            dupeNames.add(specialFoldersMap[i].name);
          }
        }
      }

      for (let folderItem of specialFoldersMap) {
        // If this folder name appears multiple times in the recent list,
        // append the server name to disambiguate.
        // TODO:
        //  - maybe this could use verboseFolderFormat from messenger.properties
        //  instead of hardcoded " - ".
        //  - disambiguate folders with same name in same account
        //  (in different subtrees).
        let label = folderItem.name;
        if (dupeNames.has(label)) {
          label += " - " + folderItem.folder.server.prettyName;
        }

        folderItem.label = label;
      }

      // Make sure the entries are sorted alphabetically.
      specialFoldersMap.sort((a, b) => folderNameCompare(a.label, b.label));

      // Create entries for each of the recent folders.
      for (let folderItem of specialFoldersMap) {
        let node = document.createXULElement("menuitem");

        node.setAttribute("label", folderItem.label);
        node._folder = folderItem.folder;

        node.setAttribute("class", "folderMenuItem menuitem-iconic");
        this._setCssSelectors(folderItem.folder, node);
        node.setAttribute("generated", "true");
        menu.menupopup.appendChild(node);
      }

      if (specialFoldersMap.length == 0) {
        menu.setAttribute("disabled", "true");
      }

      this._initializedSpecials.add(specialType);
    }

    /**
     * Add a menu item that refers back to the parent folder when there is a
     * showFileHereLabel attribute or no mode attribute. However don't
     * add such a menu item if one of the following conditions is met:
     * (-) There is no parent folder.
     * (-) Folder is server and showAccountsFileHere is explicitly false.
     * (-) Current folder has a mode, the parent folder can be selected,
     *     no messages can be filed into the parent folder (e.g. when the
     *     parent folder is a news group or news server) and the folder
     *     mode is not equal to newFolder.
     *  The menu item will have the value of the fileHereLabel attribute as
     *  label or if the attribute does not exist the name of the parent
     *  folder instead.
     *
     * @param {string} mode  The mode attribute.
     */
    _maybeAddParentFolderMenuItem(mode) {
      let parent = this._parentFolder;
      if (parent && (this.getAttribute("showFileHereLabel") == "true" || !mode)) {
        let showAccountsFileHere = this.getAttribute("showAccountsFileHere");
        if ((!parent.isServer || showAccountsFileHere != "false") &&
             (!mode || mode == "newFolder" || parent.noSelect ||
               parent.canFileMessages || showAccountsFileHere == "true")) {
          let menuitem = document.createXULElement("menuitem");

          menuitem._folder = parent;
          menuitem.setAttribute("generated", "true");
          if (this.hasAttribute("fileHereLabel")) {
            menuitem.setAttribute("label", this.getAttribute("fileHereLabel"));
            menuitem.setAttribute("accesskey", this.getAttribute("fileHereAccessKey"));
          } else {
            menuitem.setAttribute("label", parent.prettyName);
            menuitem.setAttribute("class", "folderMenuItem menuitem-iconic");
            this._setCssSelectors(parent, menuitem);
          }
          this.appendChild(menuitem);

          if (parent.noSelect) {
            menuitem.setAttribute("disabled", "true");
          }

          let sep = document.createXULElement("menuseparator");
          sep.setAttribute("generated", "true");
          this.appendChild(sep);
        }
      }
    }

    /**
     * Add menu items, one for each folder.
     *
     * @param {nsIMsgFolder[]} folders          Array of folder objects.
     * @param {string} mode                     The mode attribute.
     * @param {nsIMsgFolder} globalInboxFolder  The root/global inbox folder.
     */
    _addFoldersMenuItems(folders, mode, globalInboxFolder) {
      // disableServers attribute is a comma separated list of server keys.
      const disableServers = this.hasAttribute("disableServers") ?
        this.getAttribute("disableServers").split(",") : [];

      // We need to call this, or hasSubFolders will always return false.
      // Remove this workaround when Bug 502900 is fixed.
      MailUtils.discoverFolders();
      this._serversOnly = true;

      let [shouldExpand, labels] = this._getShouldExpandAndLabels();

      for (let folder of folders) {
        let node;
        if (!folder.isServer) {
          this._serversOnly = false;
        }

        // If we're going to add subFolders, we need to make menus, not
        // menuitems.
        if (!folder.hasSubFolders || !shouldExpand(folder.server.type)) {
          node = document.createXULElement("menuitem");
          node.setAttribute("class", "folderMenuItem menuitem-iconic");
          node.setAttribute("generated", "true");
          this.appendChild(node);
        } else {
          this._serversOnly = false;
          // xxx this is slightly problematic in that we haven't confirmed
          //     whether any of the subfolders will pass the filter.
          node = document.createXULElement("menu");
          node.setAttribute("class", "folderMenuItem menu-iconic");
          node.setAttribute("generated", "true");
          this.appendChild(node);

          // Create the submenu.
          let popup = document.createXULElement("menupopup", { "is": "folder-menupopup" });
          popup._parentFolder = folder;

          ["class", "type", "fileHereLabel", "showFileHereLabel", "oncommand",
            "mode", "disableServers", "position"].forEach(attribute => {
            if (this.hasAttribute(attribute)) {
              popup.setAttribute(attribute, this.getAttribute(attribute));
            }
          });

          // If there are labels, add the labels now.
          if (labels) {
            let serverNode = document.createXULElement("menuitem");
            serverNode.setAttribute("label", labels[folder.server.type]);
            serverNode._folder = folder;
            serverNode.setAttribute("generated", "true");
            popup.appendChild(serverNode);
            let sep = document.createXULElement("menuseparator");
            sep.setAttribute("generated", "true");
            popup.appendChild(sep);
          }
          popup.setAttribute("generated", "true");
          node.appendChild(popup);
        }

        if (disableServers.includes(folder.server.key)) {
          node.setAttribute("disabled", "true");
        }

        node._folder = folder;
        let label = "";
        if (mode == "deferred" && folder.isServer &&
            folder.server.rootFolder == globalInboxFolder) {
          label = this._stringBundle.get("globalInbox", [folder.prettyName]);
        } else {
          label = folder.prettyName;
        }
        node.setAttribute("label", label);
        this._setCssSelectors(folder, node);
      }
    }

    /**
     * Let the user have a list of subfolders for all account types, none of
     * them, or only some of them.  Returns an array containing a function that
     * determines whether to show subfolders for a given account type, and an
     * object mapping account types to label names (may be null).
     *
     * @return {[Function, Object|null]}  Array containing the shouldExpand
     *                                    function and the labels object.
     */
    _getShouldExpandAndLabels() {
      let shouldExpand;
      let labels = null;
      if (this.getAttribute("expandFolders") == "true" ||
          !this.hasAttribute("expandFolders")) {
        shouldExpand = () => true;
      } else if (this.getAttribute("expandFolders") == "false") {
        shouldExpand = () => false;
      } else {
        // We want a subfolder list for only some servers. We also may need
        // to create headers to select the servers. If so, then headlabels
        // is a comma-delimited list of labels corresponding to the server
        // types specified in expandFolders.
        let types = this.getAttribute("expandFolders").split(/ *, */);
        // Set the labels. labels[type] = label
        if (this.hasAttribute("headlabels")) {
          let labelNames = this.getAttribute("headlabels").split(/ *, */);
          labels = {};
          // If the length isn't equal, don't give them any of the labels,
          // since any combination will probably be wrong.
          if (labelNames.length == types.length) {
            for (let index in types) {
              labels[types[index]] = labelNames[index];
            }
          }
        }
        shouldExpand = (e) => types.includes(e);
      }
      return [shouldExpand, labels];
    }

    /**
     * This function adds attributes on menu/menuitems to make it easier for
     * css to style them.
     *
     * @param {nsIMsgFolder} folder  The folder that corresponds to the menu/menuitem.
     * @param {Element} menuNode     The actual DOM node to set attributes on.
     */
    _setCssSelectors(folder, menuNode) {
      // First set the SpecialFolder attribute.
      menuNode.setAttribute("SpecialFolder", getSpecialFolderString(folder));

      // Now set the biffState.
      let biffStates = ["NewMail", "NoMail", "UnknownMail"];
      for (let state of biffStates) {
        if (folder.biffState == Ci.nsIMsgFolder["nsMsgBiffState_" + state]) {
          menuNode.setAttribute("BiffState", state);
          break;
        }
      }

      menuNode.setAttribute("IsServer", folder.isServer);
      menuNode.setAttribute("IsSecure", folder.server.isSecure);
      menuNode.setAttribute("ServerType", folder.server.type);
      menuNode.setAttribute("IsFeedFolder", !!FeedUtils.getFeedUrlsInFolder(folder));
    }

    /**
     * This function returns a formatted display name for a menulist
     * selected folder. The desired format is set as the 'displayformat'
     * attribute of the folderpicker's <menulist>, one of:
     * 'name' (default) - Folder
     * 'verbose'        - Folder on Account
     * 'path'           - Account/Folder/Subfolder
     *
     * @param {nsIMsgFolder} folder  The folder that corresponds to the menu/menuitem.
     * @return {string}              The display name.
     */
    getDisplayName(folder) {
      if (folder.isServer) {
        return folder.prettyName;
      }

      if (this._displayformat == "verbose") {
        return this._stringBundle.getFormattedString("verboseFolderFormat",
          [folder.prettyName, folder.server.prettyName]);
      }

      if (this._displayformat == "path") {
        return FeedUtils.getFolderPrettyPath(folder) || folder.name;
      }

      return folder.name;
    }

    /**
     * Makes a given folder selected.
     *
     * @param {nsIMsgFolder} inputFolder  The folder to select (if none, then Choose Folder).
     * @return {boolean}                  Is true if any usable folder was found, otherwise false.
     * @note  If inputFolder is not in this popup, but is instead a descendant of
     *        a member of the popup, that ancestor will be selected.
     */
    selectFolder(inputFolder) {
      // Set the label of the menulist element as if folder had been selected.
      function setupParent(folder, menulist, noFolders) {
        let menupopup = menulist.menupopup;
        if (folder) {
          menulist.setAttribute("label", menupopup.getDisplayName(folder));
        } else if (noFolders) {
          menulist.setAttribute("label", menupopup._stringBundle.getString("noFolders"));
        } else if (menupopup._serversOnly) {
          menulist.setAttribute("label", menupopup._stringBundle.getString("chooseAccount"));
        } else {
          menulist.setAttribute("label", menupopup._stringBundle.getString("chooseFolder"));
        }
        menulist.setAttribute("value",
          folder ? folder.URI : "");
        menulist.setAttribute("IsServer",
          folder ? folder.isServer : false);
        menulist.setAttribute("IsSecure",
          folder ? folder.server.isSecure : false);
        menulist.setAttribute("ServerType",
          folder ? folder.server.type : "none");
        menulist.setAttribute("SpecialFolder",
          folder ? getSpecialFolderString(folder) : "none");
        menulist.setAttribute("IsFeedFolder", Boolean(
          folder && FeedUtils.getFeedUrlsInFolder(folder)));
      }

      let folder;
      if (inputFolder) {
        for (let child of this.childNodes) {
          if (child && child._folder && !child.disabled &&
              (child._folder.URI == inputFolder.URI ||
                (child.tagName == "menu" &&
                  child._folder.isAncestorOf(inputFolder)))) {
            if (child._folder.URI == inputFolder.URI) {
              this.parentNode.selectedItem = child;
            }
            folder = inputFolder;
            break;
          }
        }
      }

      // If the caller specified a folder to select and it was not
      // found, or if the caller didn't pass a folder (meaning a logical
      // and valid folder wasn't determined), don't blow up but reset
      // attributes and set a nice Choose Folder label so the user may
      // select a valid folder per the filter for this picker. If there are
      // no children, then no folder passed the filter; disable the menulist
      // as there's nothing to choose from.
      let noFolders;
      if (!this.childElementCount) {
        this.parentNode.setAttribute("disabled", true);
        noFolders = true;
      } else {
        this.parentNode.removeAttribute("disabled");
        noFolders = false;
      }

      setupParent(folder, this.parentNode, noFolders);
      return !!folder;
    }

    /**
     * Removes all menu items for this popup, resets all fields, and
     * removes the listener. This function is invoked when a change
     * that affects this menu is detected by our listener.
     */
    _teardown() {
      if (!this._initialized) {
        return;
      }

      for (let i = this.childNodes.length - 1; i >= 0; i--) {
        let child = this.childNodes[i];
        if (child.getAttribute("generated") != "true") {
          continue;
        }
        if ("_teardown" in child) {
          child._teardown();
        }
        child.remove();
      }

      this._removeListener();

      this._initialized = false;
      this._initializedSpecials.clear();
    }
    disconnectedCallback() {
      // Clean up when being destroyed.
      this._removeListener();
      this._teardown();
    }
  }

  customElements.define("folder-menupopup", MozFolderMenupopup, { extends: "menupopup" });
}
