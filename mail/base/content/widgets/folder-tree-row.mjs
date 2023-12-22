/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

const lazy = {};
XPCOMUtils.defineLazyModuleGetters(lazy, {
  FeedUtils: "resource:///modules/FeedUtils.jsm",
  FolderTreeProperties: "resource:///modules/FolderTreeProperties.jsm",
  FolderUtils: "resource:///modules/FolderUtils.jsm",
  MailServices: "resource:///modules/MailServices.jsm",
});

ChromeUtils.defineESModuleGetters(lazy, {
  FolderPaneUtils: "resource:///modules/FolderPaneUtils.sys.mjs",
});

const XULSTORE_URL = "chrome://messenger/content/messenger.xhtml";

// TODO: This was copied from about3Pane.js. It should be extracted into a
// XULStore utils file to avoid duplication.
const isItemVisible = item =>
  Services.xulStore.getValue(XULSTORE_URL, item, "visible") == "true";

/**
 * Represents a single row in the folder tree. The row can be for a server or
 * a folder. Use `folderPane._createServerRow` or `folderPane._createFolderRow`
 * to create rows.
 */
class FolderTreeRow extends HTMLLIElement {
  /**
   * The name of the folder tree mode this row belongs to.
   * @type {string}
   */
  modeName;
  /**
   * The URI of the folder represented by this row.
   * @type {string}
   */
  uri;
  /**
   * How many times this row is nested. 1 or greater.
   * @type {integer}
   */
  depth;
  /**
   * The sort order of this row's associated folder.
   * @type {integer}
   */
  folderSortOrder;

  /** @type {HTMLSpanElement} */
  nameLabel;
  /** @type {HTMLImageElement} */
  icon;
  /** @type {HTMLSpanElement} */
  unreadCountLabel;
  /** @type {HTMLUListElement} */
  totalCountLabel;
  /** @type {HTMLSpanElement} */
  folderSizeLabel;
  /** @type {HTMLUListElement} */
  childList;

  constructor() {
    super();
    this.setAttribute("is", "folder-tree-row");
    this.append(
      document.getElementById("folderTemplate").content.cloneNode(true)
    );
    this.nameLabel = this.querySelector(".name");
    this.icon = this.querySelector(".icon");
    this.unreadCountLabel = this.querySelector(".unread-count");
    this.totalCountLabel = this.querySelector(".total-count");
    this.folderSizeLabel = this.querySelector(".folder-size");
    this.childList = this.querySelector("ul");
  }

  connectedCallback() {
    // Set the correct CSS `--depth` variable based on where this row was
    // inserted into the tree.
    const parentElement = this.parentNode.closest(`li[is="folder-tree-row"]`);
    this.depth = (parentElement?.depth ?? 0) + 1;
    this.childList.style.setProperty("--depth", this.depth);
  }

  /**
   * The name to display for this folder or server.
   *
   * @type {string}
   */
  get name() {
    return this.nameLabel.textContent;
  }

  set name(value) {
    if (this.name != value) {
      this.nameLabel.textContent = value;
      this.#updateAriaLabel();
    }
  }

  /**
   * Format and set the name label of this row.
   */
  _setName() {
    switch (this._nameStyle) {
      case "server":
        this.name = this._serverName;
        break;
      case "folder":
        this.name = this._folderName;
        break;
      case "both":
        this.name = `${this._folderName} - ${this._serverName}`;
        break;
    }
  }

  /**
   * The number of unread messages for this folder.
   *
   * @type {integer}
   */
  get unreadCount() {
    return parseInt(this.unreadCountLabel.textContent, 10) || 0;
  }

  set unreadCount(value) {
    this.classList.toggle("unread", value > 0);
    // Avoid setting `textContent` if possible, each change notifies the
    // MutationObserver on `folderTree`, and there could be *many* changes.
    const textNode = this.unreadCountLabel.firstChild;
    if (textNode) {
      textNode.nodeValue = value;
    } else {
      this.unreadCountLabel.textContent = value;
    }
    this.#updateAriaLabel();
  }

  /**
   * The total number of messages for this folder.
   *
   * @type {integer}
   */
  get totalCount() {
    return parseInt(this.totalCountLabel.textContent, 10) || 0;
  }

  set totalCount(value) {
    this.classList.toggle("total", value > 0);
    this.totalCountLabel.textContent = value;
    this.#updateAriaLabel();
  }

  /**
   * The folder size for this folder.
   *
   * @type {integer}
   */
  get folderSize() {
    return this.folderSizeLabel.textContent;
  }

  set folderSize(value) {
    this.folderSizeLabel.textContent = value;
    this.#updateAriaLabel();
  }

  #updateAriaLabel() {
    // Collect the various strings and fluent IDs to build the full string for
    // the folder aria-label.
    const ariaLabelPromises = [];
    ariaLabelPromises.push(this.name);

    // If unread messages.
    const count = this.unreadCount;
    if (count > 0) {
      ariaLabelPromises.push(
        document.l10n.formatValue("folder-pane-unread-aria-label", { count })
      );
    }

    // If total messages is visible.
    if (isItemVisible("totalMsgCount")) {
      ariaLabelPromises.push(
        document.l10n.formatValue("folder-pane-total-aria-label", {
          count: this.totalCount,
        })
      );
    }

    if (isItemVisible("folderPaneFolderSize")) {
      ariaLabelPromises.push(this.folderSize);
    }

    Promise.allSettled(ariaLabelPromises).then(results => {
      const folderLabel = results
        .map(settledPromise => settledPromise.value ?? "")
        .filter(value => value.trim() != "")
        .join(", ");
      this.setAttribute("aria-label", folderLabel);
      this.title = folderLabel;
    });
  }

  /**
   * Set some common properties based on the URI for this row.
   * `this.modeName` must be set before calling this function.
   *
   * @param {string} uri
   */
  _setURI(uri) {
    this.id = lazy.FolderPaneUtils.makeRowID(this.modeName, uri);
    this.uri = uri;
    if (!lazy.FolderTreeProperties.getIsExpanded(uri, this.modeName)) {
      this.classList.add("collapsed");
    }
    this.setIconColor();
  }

  /**
   * Set the icon color to the given color, or if none is given the value from
   * FolderTreeProperties, or the default.
   *
   * @param {string?} iconColor
   */
  setIconColor(iconColor) {
    if (!iconColor) {
      iconColor = lazy.FolderTreeProperties.getColor(this.uri);
    }
    this.icon.style.setProperty("--icon-color", iconColor ?? "");
  }

  /**
   * Set some properties based on the server for this row.
   *
   * @param {nsIMsgIncomingServer} server
   */
  setServer(server) {
    this._setURI(server.rootFolder.URI);
    this.dataset.serverKey = server.key;
    this.dataset.serverType = server.type;
    this.dataset.serverSecure = server.isSecure;
    this._nameStyle = "server";
    this._serverName = server.prettyName;
    this._setName();
    const isCollapsed = this.classList.contains("collapsed");
    if (isCollapsed) {
      this.unreadCount = server.rootFolder.getNumUnread(isCollapsed);
      this.totalCount = server.rootFolder.getTotalMessages(isCollapsed);
    }
    this.setFolderPropertiesFromFolder(server.rootFolder);
  }

  /**
   * Set some properties based on the folder for this row.
   *
   * @param {nsIMsgFolder} folder
   * @param {"folder"|"server"|"both"} nameStyle
   */
  setFolder(folder, nameStyle = "folder") {
    this._setURI(folder.URI);
    this.dataset.serverKey = folder.server.key;
    this.setFolderTypeFromFolder(folder);
    this.setFolderPropertiesFromFolder(folder);
    this._nameStyle = nameStyle;
    this._serverName = folder.server.prettyName;
    this._folderName = folder.abbreviatedName;
    this._setName();
    const isCollapsed = this.classList.contains("collapsed");
    this.unreadCount = folder.getNumUnread(isCollapsed);
    this.totalCount = folder.getTotalMessages(isCollapsed);
    if (isItemVisible("folderPaneFolderSize")) {
      this.folderSize = this.formatFolderSize(folder.sizeOnDisk);
    }
    this.folderSortOrder = folder.sortOrder;
    if (folder.noSelect) {
      this.classList.add("noselect-folder");
    } else {
      this.setAttribute("draggable", "true");
    }
  }

  /**
   * Update new message state of the row.
   *
   * @param {boolean} [notifiedOfNewMessages=false] - When true there are new
   *   messages on the server, but they may not yet be downloaded locally.
   */
  updateNewMessages(notifiedOfNewMessages = false) {
    const folder = lazy.MailServices.folderLookup.getFolderForURL(this.uri);
    const foldersHaveNewMessages = this.classList.contains("collapsed")
      ? folder.hasFolderOrSubfolderNewMessages
      : folder.hasNewMessages;
    this.classList.toggle(
      "new-messages",
      notifiedOfNewMessages || foldersHaveNewMessages
    );
  }

  updateUnreadMessageCount() {
    this.unreadCount = lazy.MailServices.folderLookup
      .getFolderForURL(this.uri)
      .getNumUnread(this.classList.contains("collapsed"));
  }

  updateTotalMessageCount() {
    const folder = lazy.MailServices.folderLookup.getFolderForURL(this.uri);
    this.totalCount = folder.getTotalMessages(
      this.classList.contains("collapsed")
    );
    if (isItemVisible("folderPaneFolderSize")) {
      this.updateSizeCount(false, folder);
    }
  }

  updateSizeCount(isHidden, folder = null) {
    this.folderSizeLabel.hidden = isHidden;
    if (!isHidden) {
      folder ??= lazy.MailServices.folderLookup.getFolderForURL(this.uri);
      this.folderSize = this.formatFolderSize(folder.sizeOnDisk);
    }
  }

  /**
   * Format the folder file size to display in the folder pane.
   *
   * @param {integer} size - The folder size on disk.
   * @returns {string} - The formatted folder size.
   */
  formatFolderSize(size) {
    return size / 1024 < 1 ? "" : top.messenger.formatFileSize(size, true);
  }

  /**
   * Update the visibility of the total count badge.
   *
   * @param {boolean} isHidden
   */
  toggleTotalCountBadgeVisibility(isHidden) {
    this.totalCountLabel.hidden = isHidden;
    this.#updateAriaLabel();
  }

  /**
   * Sets the folder type property based on the folder for the row.
   *
   * @param {nsIMsgFolder} folder
   */
  setFolderTypeFromFolder(folder) {
    const folderType = lazy.FolderUtils.getSpecialFolderString(folder);
    if (folderType != "none") {
      this.dataset.folderType = folderType.toLowerCase();
    }
  }

  /**
   * Sets folder properties based on the folder for the row.
   *
   * @param {nsIMsgFolder} folder
   */
  setFolderPropertiesFromFolder(folder) {
    if (folder.server.type != "rss") {
      return;
    }
    const urls = !folder.isServer
      ? lazy.FeedUtils.getFeedUrlsInFolder(folder)
      : null;
    if (urls?.length == 1) {
      const url = urls[0];
      this.icon.style = `content: url("page-icon:${url}"); background-image: none;`;
    }
    const props = lazy.FeedUtils.getFolderProperties(folder);
    for (const property of ["hasError", "isBusy", "isPaused"]) {
      if (props.includes(property)) {
        this.dataset[property] = "true";
      } else {
        delete this.dataset[property];
      }
    }
  }

  /**
   * Update this row's name label to match the new `prettyName` of the server.
   *
   * @param {string} serverName
   */
  setServerName(serverName) {
    this._serverName = serverName;
    if (this._nameStyle != "folder") {
      this._setName();
    }
  }

  /**
   * Add a child row in the correct sort order.
   *
   * @param {FolderTreeRow} newChild
   * @returns {FolderTreeRow}
   */
  insertChildInOrder(newChild) {
    const { folderSortOrder, name: folderName } = newChild;
    for (const child of this.childList.children) {
      if (folderSortOrder < child.folderSortOrder) {
        return this.childList.insertBefore(newChild, child);
      }
      if (
        folderSortOrder == child.folderSortOrder &&
        lazy.FolderPaneUtils.nameCollator.compare(folderName, child.name) < 0
      ) {
        return this.childList.insertBefore(newChild, child);
      }
    }
    return this.childList.appendChild(newChild);
  }
}
customElements.define("folder-tree-row", FolderTreeRow, { extends: "li" });
