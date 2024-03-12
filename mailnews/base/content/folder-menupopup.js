/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* globals MozElements MozXULElement PanelUI */

// This file implements `folder-menupopup` custom elements used in traditional
// menus.

// Wrap in a block to prevent leaking to window scope.
{
  const { MailServices } = ChromeUtils.importESModule(
    "resource:///modules/MailServices.sys.mjs"
  );

  const lazy = {};
  ChromeUtils.defineESModuleGetters(lazy, {
    FeedUtils: "resource:///modules/FeedUtils.sys.mjs",
    FolderUtils: "resource:///modules/FolderUtils.sys.mjs",
    MailUtils: "resource:///modules/MailUtils.sys.mjs",
  });

  /**
   * Creates an element, sets attributes on it, including always setting the
   * "generated" attribute to "true", and returns the element. The "generated"
   * attribute is used to determine which elements to remove when clearing
   * the menu.
   *
   * @param {string} tagName - The tag name of the element to generate.
   * @param {object} [attributes] - Optional attributes to set on the element.
   * @param {object} [isObject] - The optional "is" object to use when creating
   *                             the element, typically `{is: "folder-menupopup"}`.
   */
  function generateElement(tagName, attributes, isObject) {
    const element = document.createXULElement(tagName, isObject);
    element.setAttribute("generated", "true");

    if (attributes) {
      Object.entries(attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
      });
    }
    return element;
  }

  /**
   * A function to add shared code to the classes for the `folder-menupopup`
   * custom element. Takes a "Base" class, and returns a class that extends
   * the "Base" class.
   *
   * @param {Class} Base - A class to be extended with shared functionality.
   * @returns {Class} A class that extends the first class.
   */
  const FolderMenu = Base =>
    class extends Base {
      constructor() {
        super();

        window.addEventListener(
          "unload",
          () => {
            // Clean up when being destroyed.
            this._removeListener();
            this._teardown();
          },
          { once: true }
        );

        // If non-null, the subFolders of this nsIMsgFolder will be used to
        // populate this menu.  If this is null, the menu will be populated
        // using the root-folders for all accounts.
        this._parentFolder = null;

        this._stringBundle = Services.strings.createBundle(
          "chrome://messenger/locale/folderWidgets.properties"
        );

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

            return folder.canFileMessages || folder.hasSubFolders;
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
            return (
              folder.canCreateSubfolders &&
              folder.server.canCreateFoldersOnServer
            );
          },

          deferred(folder) {
            return (
              folder.server.canCreateFoldersOnServer && !folder.supportsOffline
            );
          },

          // Folders that are not in a deferred account.
          notDeferred(folder) {
            const server = folder.server;
            return !(
              server instanceof Ci.nsIPop3IncomingServer &&
              server.deferredToAccount
            );
          },

          // Folders that can be searched.
          search(folder) {
            if (
              !folder.server.canSearchMessages ||
              folder.getFlag(Ci.nsMsgFolderFlags.Virtual)
            ) {
              return false;
            }
            return true;
          },

          // Folders that can subscribe feeds.
          feeds(folder) {
            if (
              folder.server.type != "rss" ||
              folder.getFlag(Ci.nsMsgFolderFlags.Trash) ||
              folder.getFlag(Ci.nsMsgFolderFlags.Virtual)
            ) {
              return false;
            }
            return true;
          },

          junk(folder) {
            // Don't show servers (nntp & any others) which do not allow search or filing
            // I don't really understand why canSearchMessages is needed, but it was included in
            // earlier code, so I include it as well.
            if (
              !folder.server.canFileMessagesOnServer ||
              !folder.server.canSearchMessages
            ) {
              return false;
            }
            // Show parents that might have usable subfolders, or usable folders.
            return folder.hasSubFolders || folder.canFileMessages;
          },
        };

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

          _folderAddedOrRemoved(folder) {
            if (this._filterFunction && !this._filterFunction(folder)) {
              return;
            }
            // xxx we can optimize this later
            this._clearMenu(this._menu);
          },

          onFolderAdded(parentFolder, child) {
            this._folderAddedOrRemoved(child);
          },
          onMessageAdded(parentFolder, msg) {},
          onFolderRemoved(parentFolder, child) {
            this._folderAddedOrRemoved(child);
          },
          onMessageRemoved(parentFolder, msg) {},

          // xxx I stole this listener list from nsMsgFolderDatasource.cpp, but
          // someone should really document what events are fired when, so that
          // we make sure we're updating at the right times.
          onFolderPropertyChanged(item, property, old, newItem) {},
          onFolderIntPropertyChanged(item, property, old, aNew) {
            if (item instanceof Ci.nsIMsgFolder) {
              if (property == "FolderFlag") {
                if (
                  this._menu.getAttribute("showFavorites") != "true" ||
                  !this._menu._initializedSpecials.has("favorites")
                ) {
                  return;
                }

                if (
                  (old & Ci.nsMsgFolderFlags.Favorite) !=
                  (aNew & Ci.nsMsgFolderFlags.Favorite)
                ) {
                  setTimeout(this._clearMenu, 0, this._menu);
                }
              }
            }
            this._setCssSelectorsForItem(item);
          },
          onFolderBoolPropertyChanged(item, property, old, newItem) {
            this._setCssSelectorsForItem(item);
          },
          onFolderUnicharPropertyChanged(item, property, old, newItem) {
            this._setCssSelectorsForItem(item);
          },
          onFolderPropertyFlagChanged(item, property, old, newItem) {},

          onFolderEvent(folder, eventName) {
            if (eventName == "MRMTimeChanged") {
              if (
                this._menu.getAttribute("showRecent") != "true" ||
                !this._menu._initializedSpecials.has("recent") ||
                !this._menu.childWrapper.firstElementChild
              ) {
                return;
              }

              const recentMenuItem = this._menu.childWrapper.firstElementChild;
              const recentSubMenu =
                this._menu._getSubMenuForMenuItem(recentMenuItem);

              // If this folder is already in the recent menu, return.
              if (
                !recentSubMenu ||
                this._getChildForItem(folder, recentSubMenu)
              ) {
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
           * @param {nsIMsgFolder} item - The folder to check.
           * @param {Element} [menu] - Optional menu to look in, defaults to this._menu.
           * @returns {Element|null} The menuitem for that folder, or null if no
           *                             child for that folder exists.
           */
          _getChildForItem(item, menu = this._menu) {
            if (
              !menu ||
              !menu.childWrapper.hasChildNodes() ||
              !(item instanceof Ci.nsIMsgFolder)
            ) {
              return null;
            }
            for (const child of menu.childWrapper.children) {
              if (child._folder && child._folder.URI == item.URI) {
                return child;
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
        // Call the connectedCallback of the "base" class this mixin class is extending.
        super.connectedCallback();

        // Get the displayformat if set.
        if (this.parentNode && this.parentNode.localName == "menulist") {
          this._displayformat = this.parentNode.getAttribute("displayformat");
        }
      }

      set parentFolder(val) {
        this._parentFolder = val;
        this._teardown();
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
        const excludeServers = this.hasAttribute("excludeServers")
          ? this.getAttribute("excludeServers").split(",")
          : [];

        // Extensions and other consumers can add to these modes too, see the
        // note on the _filters field. (Note: empty strings ("") are falsy in JS.)
        const mode = this.getAttribute("mode");

        const filterFunction = mode ? this._filters[mode] : folder => true;

        const folders = this._getFolders(
          this._parentFolder,
          excludeServers,
          mode ? filterFunction : null
        );

        this._listener._filterFunction = filterFunction;

        this._build(folders, mode);

        // Lastly, we add a listener to get notified of changes in the folder
        // structure.
        MailServices.mailSession.AddFolderListener(
          this._listener,
          Ci.nsIFolderListener.all
        );

        this._initialized = true;
      }

      /**
       * Get the folders that will appear in the menu.
       *
       * @param {Element} parentFolder - The parent menu popup/view element.
       * @param {string[]} excludeServers - Server keys for the servers to exclude.
       * @param {Function} [filterFunction] - Function for filtering the folders.
       */
      _getFolders(parentFolder, excludeServers, filterFunction) {
        let folders;

        // If we have a parent folder, just get the subFolders for that parent.
        if (parentFolder) {
          folders = parentFolder.subFolders;
        } else {
          // If we don't have a parent, then we assume we should build the
          // top-level accounts. (Actually we build the fake root folders for
          // those accounts.)
          const accounts = lazy.FolderUtils.allAccountsSorted(true);

          // Now generate our folder list. Note that we'll special case this
          // situation elsewhere, to avoid destroying the sort order we just made.
          folders = accounts.map(acct => acct.incomingServer.rootFolder);
        }

        if (filterFunction) {
          folders = folders.filter(filterFunction);
        }

        if (excludeServers.length > 0) {
          folders = folders.filter(
            folder => !excludeServers.includes(folder.server.key)
          );
        }
        return folders;
      }

      /**
       * Actually constructs the menu items based on the folders given.
       *
       * @param {nsIMsgFolder[]} folders - An array of nsIMsgFolders to use for building.
       * @param {string} [mode] - The filtering mode. See comment on _filters field.
       */
      _build(folders, mode) {
        let globalInboxFolder = null;

        // See if this is the toplevel menu (usually with accounts).
        if (!this._parentFolder) {
          this._addTopLevelMenuItems();

          // If we are showing the accounts for deferring, move Local Folders to the top.
          if (mode == "deferred") {
            globalInboxFolder =
              MailServices.accounts.localFoldersServer.rootFolder;
            const localFoldersIndex = folders.indexOf(globalInboxFolder);
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
        if (!this._parentFolder) {
          this._addTopLevelBottomMenuItems();
        }
      }

      /**
       * Add menu items that only appear at top level, like "Recent".
       */
      _addTopLevelMenuItems() {
        const showRecent = this.getAttribute("showRecent") == "true";
        const showFavorites = this.getAttribute("showFavorites") == "true";

        if (showRecent) {
          this.childWrapper.appendChild(
            this._buildSpecialMenu({
              special: "recent",
              label: this.getAttribute("recentLabel"),
              accessKey: this.getAttribute("recentAccessKey"),
            })
          );
        }
        if (showFavorites) {
          this.childWrapper.appendChild(
            this._buildSpecialMenu({
              special: "favorites",
              label: this.getAttribute("favoritesLabel"),
              accessKey: this.getAttribute("favoritesAccessKey"),
            })
          );
        }
        if (showRecent || showFavorites) {
          this.childWrapper.appendChild(this._buildSeparator());
        }
      }

      /**
       * Add menu items that only appear at top level (but last), like "<last>".
       */
      _addTopLevelBottomMenuItems() {
        if (this.getAttribute("showLast") != "true") {
          return;
        }
        const folderURI = Services.prefs.getStringPref(
          "mail.last_msg_movecopy_target_uri"
        );
        const folder = folderURI && lazy.MailUtils.getExistingFolder(folderURI);
        if (!folder) {
          return;
        }

        this.childWrapper.appendChild(this._buildSeparator());
        const attributes = {
          label: `${folder.prettyName} - ${folder.server.prettyName}`,
          ...this._getCssSelectorAttributes(folder),
        };
        this.childWrapper.appendChild(this._buildMenuItem(attributes, folder));
      }

      /**
       * Populate a "recent" or "favorites" special submenu with either the
       * recently used or favorite folders, to allow for easy access.
       *
       * @param {Element} menu - The menu or toolbarbutton element for which one
       *                        wants to populate the special sub menu.
       * @param {Element} submenu - The submenu element, typically a menupopup.
       */
      _populateSpecialSubmenu(menu, submenu) {
        const specialType = menu.getAttribute("special");
        if (this._initializedSpecials.has(specialType)) {
          return;
        }

        // Iterate through all folders in all accounts matching the current filter.
        let specialFolders = MailServices.accounts.allFolders;
        if (this._listener._filterFunction) {
          specialFolders = specialFolders.filter(
            this._listener._filterFunction
          );
        }

        switch (specialType) {
          case "recent":
            // Find the most recently modified ones.
            specialFolders = lazy.FolderUtils.getMostRecentFolders(
              specialFolders,
              Services.prefs.getIntPref("mail.folder_widget.max_recent"),
              "MRMTime"
            );
            break;
          case "favorites":
            specialFolders = specialFolders.filter(folder =>
              folder.getFlag(Ci.nsMsgFolderFlags.Favorite)
            );
            break;
        }

        // Cache the pretty names so that they do not need to be fetched
        // with quadratic complexity when sorting by name.
        const specialFoldersMap = specialFolders.map(folder => {
          return {
            folder,
            name: folder.prettyName,
          };
        });

        // Because we're scanning across multiple accounts, we can end up with
        // several folders with the same name. Find those dupes.
        const dupeNames = new Set();
        for (let i = 0; i < specialFoldersMap.length; i++) {
          for (let j = i + 1; j < specialFoldersMap.length; j++) {
            if (specialFoldersMap[i].name == specialFoldersMap[j].name) {
              dupeNames.add(specialFoldersMap[i].name);
            }
          }
        }

        for (const folderItem of specialFoldersMap) {
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
        specialFoldersMap.sort((a, b) =>
          lazy.FolderUtils.folderNameCompare(a.label, b.label)
        );

        // Create entries for each of the recent folders.
        for (const folderItem of specialFoldersMap) {
          const attributes = {
            label: folderItem.label,
            ...this._getCssSelectorAttributes(folderItem.folder),
          };

          submenu.childWrapper.appendChild(
            this._buildMenuItem(attributes, folderItem.folder)
          );
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
       * @param {string} mode - The mode attribute.
       */
      _maybeAddParentFolderMenuItem(mode) {
        const folder = this._parentFolder;
        if (
          folder &&
          (this.getAttribute("showFileHereLabel") == "true" || !mode)
        ) {
          const showAccountsFileHere = this.getAttribute(
            "showAccountsFileHere"
          );
          if (
            (!folder.isServer || showAccountsFileHere != "false") &&
            (!mode ||
              mode == "newFolder" ||
              folder.noSelect ||
              folder.canFileMessages ||
              showAccountsFileHere == "true")
          ) {
            const attributes = {};

            if (this.hasAttribute("fileHereLabel")) {
              attributes.label = this.getAttribute("fileHereLabel");
              attributes.accesskey = this.getAttribute("fileHereAccessKey");
            } else {
              attributes.label = folder.prettyName;
              Object.assign(attributes, this._getCssSelectorAttributes(folder));
            }

            if (folder.noSelect) {
              attributes.disabled = "true";
            }

            this.childWrapper.appendChild(
              this._buildMenuItem(attributes, folder)
            );
            this.childWrapper.appendChild(this._buildSeparator());
          }
        }
      }

      /**
       * Add menu items, one for each folder.
       *
       * @param {nsIMsgFolder[]} folders - Array of folder objects.
       * @param {string} mode - The mode attribute.
       * @param {nsIMsgFolder} globalInboxFolder - The root/global inbox folder.
       */
      _addFoldersMenuItems(folders, mode, globalInboxFolder) {
        // disableServers attribute is a comma separated list of server keys.
        const disableServers = this.hasAttribute("disableServers")
          ? this.getAttribute("disableServers").split(",")
          : [];

        // We need to call this, or hasSubFolders will always return false.
        // Remove this workaround when Bug 502900 is fixed.
        lazy.MailUtils.discoverFolders();
        this._serversOnly = true;

        const [shouldExpand, labels] = this._getShouldExpandAndLabels();

        for (const folder of folders) {
          if (!folder.isServer) {
            this._serversOnly = false;
          }

          const attributes = {
            label: this._getFolderLabel(mode, globalInboxFolder, folder),
            ...this._getCssSelectorAttributes(folder),
          };

          if (disableServers.includes(folder.server.key)) {
            attributes.disabled = "true";
          }

          if (!folder.hasSubFolders || !shouldExpand(folder.server.type)) {
            // There are no subfolders, create a simple menu item.
            this.childWrapper.appendChild(
              this._buildMenuItem(attributes, folder)
            );
          } else {
            // There are subfolders, create a menu item with a submenu.
            // xxx this is slightly problematic in that we haven't confirmed
            //     whether any of the subfolders will pass the filter.

            this._serversOnly = false;

            const submenuAttributes = {};

            [
              "class",
              "type",
              "fileHereLabel",
              "showFileHereLabel",
              "oncommand",
              "showAccountsFileHere",
              "mode",
              "disableServers",
              "position",
            ].forEach(attribute => {
              if (this.hasAttribute(attribute)) {
                submenuAttributes[attribute] = this.getAttribute(attribute);
              }
            });

            const [menuItem, submenu] = this._buildMenuItemWithSubmenu(
              attributes,
              true,
              folder,
              submenuAttributes
            );

            // If there are labels, we add an item and separator to the submenu.
            if (labels) {
              const serverAttributes = { label: labels[folder.server.type] };

              submenu.childWrapper.appendChild(
                this._buildMenuItem(serverAttributes, folder, this)
              );

              submenu.childWrapper.appendChild(this._buildSeparator());
            }

            this.childWrapper.appendChild(menuItem);
          }
        }
      }

      /**
       * Return the label to use for a folder.
       *
       * @param {string} mode - The mode, e.g. "deferred".
       * @param {nsIMsgFolder} globalInboxFolder - The root/global inbox folder.
       * @param {nsIMsgFolder} folder - The folder for which we are getting a label.
       * @returns {string} The label to use for the folder.
       */
      _getFolderLabel(mode, globalInboxFolder, folder) {
        if (
          mode == "deferred" &&
          folder.isServer &&
          folder.server.rootFolder == globalInboxFolder
        ) {
          return this._stringBundle.formatStringFromName("globalInbox", [
            folder.prettyName,
          ]);
        }
        return folder.prettyName;
      }

      /**
       * Let the user have a list of subfolders for all account types, none of
       * them, or only some of them.  Returns an array containing a function that
       * determines whether to show subfolders for a given account type, and an
       * object mapping account types to label names (may be null).
       *
       * @returns {any[]} - An array; [0] is the shouldExpand function, [1] is
       *   the labels object.
       */
      _getShouldExpandAndLabels() {
        let shouldExpand;
        let labels = null;
        if (
          this.getAttribute("expandFolders") == "true" ||
          !this.hasAttribute("expandFolders")
        ) {
          shouldExpand = () => true;
        } else if (this.getAttribute("expandFolders") == "false") {
          shouldExpand = () => false;
        } else {
          // We want a subfolder list for only some servers. We also may need
          // to create headers to select the servers. If so, then headlabels
          // is a comma-delimited list of labels corresponding to the server
          // types specified in expandFolders.
          const types = this.getAttribute("expandFolders").split(/ *, */);
          // Set the labels. labels[type] = label
          if (this.hasAttribute("headlabels")) {
            const labelNames = this.getAttribute("headlabels").split(/ *, */);
            labels = {};
            // If the length isn't equal, don't give them any of the labels,
            // since any combination will probably be wrong.
            if (labelNames.length == types.length) {
              for (const index in types) {
                labels[types[index]] = labelNames[index];
              }
            }
          }
          shouldExpand = e => types.includes(e);
        }
        return [shouldExpand, labels];
      }

      /**
       * Set attributes on a menu, menuitem, or toolbarbutton element to allow
       * for CSS styling.
       *
       * @param {nsIMsgFolder} folder - The folder that corresponds to the menu/menuitem.
       * @param {Element} menuNode - The actual DOM node to set attributes on.
       */
      _setCssSelectors(folder, menuNode) {
        const cssAttributes = this._getCssSelectorAttributes(folder);

        Object.entries(cssAttributes).forEach(([key, value]) =>
          menuNode.setAttribute(key, value)
        );
      }

      /**
       * Returns attributes to be set on a menu, menuitem, or toolbarbutton
       * element to allow for CSS styling.
       *
       * @param {nsIMsgFolder} folder - The folder that corresponds to the menu item.
       * @returns {object} Contains the CSS selector attributes.
       */
      _getCssSelectorAttributes(folder) {
        const attributes = {};

        // First the SpecialFolder attribute.
        attributes.SpecialFolder =
          lazy.FolderUtils.getSpecialFolderString(folder);

        // Now the biffState.
        const biffStates = ["NewMail", "NoMail", "UnknownMail"];
        for (const state of biffStates) {
          if (folder.biffState == Ci.nsIMsgFolder["nsMsgBiffState_" + state]) {
            attributes.BiffState = state;
            break;
          }
        }

        attributes.IsServer = folder.isServer;
        attributes.IsSecure = folder.server.isSecure;
        attributes.ServerType = folder.server.type;
        attributes.IsFeedFolder = !!lazy.FeedUtils.getFeedUrlsInFolder(folder);

        return attributes;
      }

      /**
       * This function returns a formatted display name for a menulist
       * selected folder. The desired format is set as the 'displayformat'
       * attribute of the folderpicker's <menulist>, one of:
       * 'name' (default) - Folder
       * 'verbose'        - Folder on Account
       * 'path'           - Account/Folder/Subfolder
       *
       * @param {nsIMsgFolder} folder - The folder that corresponds to the menu/menuitem.
       * @returns {string} The display name.
       */
      getDisplayName(folder) {
        if (folder.isServer) {
          return folder.prettyName;
        }

        if (this._displayformat == "verbose") {
          return this._stringBundle.formatStringFromName(
            "verboseFolderFormat",
            [folder.prettyName, folder.server.prettyName]
          );
        }

        if (this._displayformat == "path") {
          return lazy.FeedUtils.getFolderPrettyPath(folder) || folder.name;
        }

        return folder.name;
      }

      /**
       * Makes a given folder selected.
       * TODO: This function does not work yet for the appmenu. However, as of
       * June 2019, this functionality is not used in the appmenu.
       *
       * @param {nsIMsgFolder} inputFolder - The folder to select (if none,
       *   then Choose Folder). If inputFolder is not in this popup, but is
       *   instead a descendant of a member of the popup, that ancestor will be
       *   selected.
       * @returns {boolean} Is true if any usable folder was found, otherwise false.
       */
      selectFolder(inputFolder) {
        // Set the label of the menulist element as if folder had been selected.
        function setupParent(folder, menulist, noFolders) {
          const menupopup = menulist.menupopup;
          if (folder) {
            menulist.setAttribute("label", menupopup.getDisplayName(folder));
          } else if (noFolders) {
            menulist.setAttribute(
              "label",
              menupopup._stringBundle.GetStringFromName("noFolders")
            );
          } else if (menupopup._serversOnly) {
            menulist.setAttribute(
              "label",
              menupopup._stringBundle.GetStringFromName("chooseAccount")
            );
          } else {
            menulist.setAttribute(
              "label",
              menupopup._stringBundle.GetStringFromName("chooseFolder")
            );
          }
          menulist.setAttribute("value", folder ? folder.URI : "");
          menulist.setAttribute("IsServer", folder ? folder.isServer : false);
          menulist.setAttribute(
            "IsSecure",
            folder ? folder.server.isSecure : false
          );
          menulist.setAttribute(
            "ServerType",
            folder ? folder.server.type : "none"
          );
          menulist.setAttribute(
            "SpecialFolder",
            folder ? lazy.FolderUtils.getSpecialFolderString(folder) : "none"
          );
          menulist.setAttribute(
            "IsFeedFolder",
            Boolean(folder && lazy.FeedUtils.getFeedUrlsInFolder(folder))
          );
        }

        let folder;
        if (inputFolder) {
          for (const child of this.children) {
            if (
              child &&
              child._folder &&
              !child.disabled &&
              (child._folder.URI == inputFolder.URI ||
                (child.tagName == "menu" &&
                  child._folder.isAncestorOf(inputFolder)))
            ) {
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
       * Removes all menu items from this menu, removes their submenus. This
       * function is called when a change that affects this menu is detected
       * by the listener.
       */
      _teardown() {
        if (!this._initialized) {
          return;
        }
        const children = this.childWrapper.children;
        // We iterate in reverse order because children is live so it changes
        // as we remove child nodes.
        for (let i = children.length - 1; i >= 0; i--) {
          const item = children[i];
          if (item.getAttribute("generated") != "true") {
            continue;
          }
          const submenu = this._getSubMenuForMenuItem(item);

          if (submenu && "_teardown" in submenu) {
            submenu._teardown();
            submenu.remove();
          }
          item.remove();
        }

        this._removeListener();

        this._initialized = false;
        this._initializedSpecials.clear();
      }
    };

  /**
   * The MozFolderMenupopup widget is used as a menupopup that contains menu
   * items and submenus for all folders from every account (or some subset of
   * folders and accounts). It is also used to provide a menu with a menuitem
   * for each account. Each menu item gets displayed with the folder or
   * account name and icon.
   *
   * @augments {MozElements.MozMenuPopup}
   */
  const MozFolderMenuPopup = FolderMenu(
    class extends MozElements.MozMenuPopup {
      constructor() {
        super();

        // To improve performance, only build the menu when it is shown.
        this.addEventListener(
          "popupshowing",
          event => {
            this._ensureInitialized();
          },
          true
        );

        // Because the menu items in a panelview go inside a child vbox but are
        // direct children of a menupopup, we set up a consistent way to append
        // and access menu items for both cases.
        this.childWrapper = this;
      }

      connectedCallback() {
        if (this.delayConnectedCallback()) {
          return;
        }

        this.setAttribute("is", "folder-menupopup");

        // Find out if we are in a wrapper (customize toolbars mode is active).
        let inWrapper = false;
        let node = this;
        while (XULElement.isInstance(node)) {
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
            this.setAttribute(
              "original-width",
              this.hasAttribute("width") ? this.getAttribute("width") : "none"
            );
            this.setAttribute("width", "100");
          }
        }
      }

      /**
       * Given a menu item, return the menupopup that it opens.
       *
       * @param {Element} menu - The menu item, typically a `menu` element.
       * @returns {Element|null} The `menupopup` element or null if none found.
       */
      _getSubMenuForMenuItem(menu) {
        return menu.querySelector("menupopup");
      }

      /**
       * Returns a `menuseparator` element for use in a `menupopup`.
       */
      _buildSeparator() {
        return generateElement("menuseparator");
      }

      /**
       * Builds a menu item (`menuitem`) element that does not open a submenu
       * (i.e. not a `menu` element).
       *
       * @param {object} [attributes] - Attributes to set on the element.
       * @param {nsIMsgFolder} folder - The folder associated with the menu item.
       * @returns {Element} A `menuitem`.
       */
      _buildMenuItem(attributes, folder) {
        const menuitem = generateElement("menuitem", attributes);
        menuitem.classList.add("folderMenuItem", "menuitem-iconic");
        menuitem._folder = folder;
        return menuitem;
      }

      /**
       * Builds a menu item (`menu`) element and an associated submenu
       * (`menupopup`) element.
       *
       * @param {object} attributes - Attributes to set on the `menu` element.
       * @param {boolean} folderSubmenu - Whether the submenu is to be a
       *                                    `folder-menupopup` element.
       * @param {nsIMsgFolder} [folder] - The folder associated with the menu item.
       * @param {object} submenuAttributes - Attributes to set on the `menupopup` element.
       * @returns {Element[]} Array containing the `menu` and
       *                                    `menupopup` elements.
       */
      _buildMenuItemWithSubmenu(
        attributes,
        folderSubmenu,
        folder,
        submenuAttributes
      ) {
        const menu = generateElement("menu", attributes);
        menu.classList.add("folderMenuItem", "menu-iconic");

        const isObject = folderSubmenu ? { is: "folder-menupopup" } : null;

        const menupopup = generateElement(
          "menupopup",
          submenuAttributes,
          isObject
        );

        if (folder) {
          menu._folder = folder;
          menupopup._parentFolder = folder;
        }

        if (!menupopup.childWrapper) {
          menupopup.childWrapper = menupopup;
        }

        menu.appendChild(menupopup);

        return [menu, menupopup];
      }

      /**
       * Build a special menu item (`menu`) and an empty submenu (`menupopup`)
       * for it. The submenu is populated just before it is shown by
       * `_populateSpecialSubmenu`.
       *
       * The submenu (`menupopup`) is just a standard element, not a custom
       * element (`folder-menupopup`).
       *
       * @param {object} [attributes] - Attributes to set on the menu item element.
       * @returns {Element} The menu item (`menu`) element.
       */
      _buildSpecialMenu(attributes) {
        const [menu, menupopup] = this._buildMenuItemWithSubmenu(attributes);

        menupopup.addEventListener(
          "popupshowing",
          event => {
            this._populateSpecialSubmenu(menu, menupopup);
          },
          { once: true }
        );

        return menu;
      }
    }
  );

  customElements.define("folder-menupopup", MozFolderMenuPopup, {
    extends: "menupopup",
  });
}
