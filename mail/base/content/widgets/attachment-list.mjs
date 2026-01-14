/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* global MozElements */
/* global goDoCommand */

/**
 * The MozAttachmentlist widget lists attachments for a mail. This is typically used to show
 * attachments while writing a new mail as well as when reading mails.
 *
 * @augments {MozElements.RichListBox}
 */
class MozAttachmentlist extends MozElements.RichListBox {
  constructor() {
    super();

    this.messenger = Cc["@mozilla.org/messenger;1"].createInstance(
      Ci.nsIMessenger
    );

    this.addEventListener("keypress", event => {
      switch (event.key) {
        case " ":
          // Allow plain spacebar to select the focused item.
          if (!event.shiftKey && !event.ctrlKey) {
            this.addItemToSelection(this.currentItem);
          }
          // Prevent inbuilt scrolling.
          event.preventDefault();
          break;

        case "Enter":
          if (this.currentItem && !event.ctrlKey && !event.shiftKey) {
            this.addItemToSelection(this.currentItem);
            this.currentItem.dispatchEvent(
              new CustomEvent("command", { bubbles: true, cancelable: true })
            );
          }
          break;
      }
    });

    // Make sure we keep the focus.
    this.addEventListener("mousedown", event => {
      if (event.button != 0) {
        return;
      }

      if (document.commandDispatcher.focusedElement != this) {
        this.focus();
      }
    });
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.delayConnectedCallback()) {
      return;
    }

    const children = Array.from(this._childNodes);

    children
      .filter(child => child.getAttribute("selected") == "true")
      .forEach(this.selectedItems.append, this.selectedItems);

    children
      .filter(child => !child.hasAttribute("context"))
      .forEach(child =>
        child.setAttribute("context", this.getAttribute("itemcontext"))
      );

    this.addEventListener("keydown", event => {
      if (event.key == "Enter") {
        goDoCommand("cmd_openAttachment");
      }
    });
  }

  get itemCount() {
    return this._childNodes.length;
  }

  get _childNodes() {
    return this.querySelectorAll("richlistitem.attachmentItem");
  }

  getIndexOfItem(item) {
    for (let i = 0; i < this._childNodes.length; i++) {
      if (this._childNodes[i] === item) {
        return i;
      }
    }
    return -1;
  }

  getItemAtIndex(index) {
    if (index >= 0 && index < this._childNodes.length) {
      return this._childNodes[index];
    }
    return null;
  }

  getRowCount() {
    return this._childNodes.length;
  }

  getIndexOfFirstVisibleRow() {
    if (this._childNodes.length == 0) {
      return -1;
    }

    // First try to estimate which row is visible, assuming they're all the same height.
    const box = this;
    const estimatedRow = Math.floor(
      box.scrollTop / this._childNodes[0].getBoundingClientRect().height
    );
    const estimatedIndex = estimatedRow * this._itemsPerRow();
    const offset = this._childNodes[estimatedIndex].screenY - box.screenY;

    if (offset > 0) {
      // We went too far! Go back until we find an item totally off-screen, then return the one
      // after that.
      for (let i = estimatedIndex - 1; i >= 0; i--) {
        const childBoxObj = this._childNodes[i].getBoundingClientRect();
        if (childBoxObj.screenY + childBoxObj.height <= box.screenY) {
          return i + 1;
        }
      }

      // If we get here, we must have gone back to the beginning of the list, so just return 0.
      return 0;
    }

    // We didn't go far enough! Keep going until we find an item at least partially on-screen.
    for (let i = estimatedIndex; i < this._childNodes.length; i++) {
      const childBoxObj = this._childNodes[i].getBoundingClientRect();
      if (childBoxObj.screenY + childBoxObj.height > box.screenY > 0) {
        return i;
      }
    }

    return null;
  }

  ensureIndexIsVisible(index) {
    this.ensureElementIsVisible(this.getItemAtIndex(index));
  }

  ensureElementIsVisible(item) {
    const box = this;

    // Are we too far down?
    if (item.screenY < box.screenY) {
      box.scrollTop =
        item.getBoundingClientRect().y - box.getBoundingClientRect().y;
    } else if (
      item.screenY + item.getBoundingClientRect().height >
      box.screenY + box.getBoundingClientRect().height
    ) {
      // ... or not far enough?
      box.scrollTop =
        item.getBoundingClientRect().y +
        item.getBoundingClientRect().height -
        box.getBoundingClientRect().y -
        box.getBoundingClientRect().height;
    }
  }

  scrollToIndex(index) {
    const box = this;
    const item = this.getItemAtIndex(index);
    if (!item) {
      return;
    }
    box.scrollTop =
      item.getBoundingClientRect().y - box.getBoundingClientRect().y;
  }

  appendItem(attachment, attachmentName) {
    // -1 appends due to the way getItemAtIndex is implemented.
    return this.insertItemAt(-1, attachment, attachmentName);
  }

  insertItemAt(index, attachment, attachmentName) {
    const item = this.ownerDocument.createXULElement("richlistitem");
    item.classList.add("attachmentItem");
    item.setAttribute("role", "option");

    item.addEventListener("dblclick", () => goDoCommand("cmd_openAttachment"));

    const makeDropIndicator = placementClass => {
      const img = document.createElement("img", { is: "drop-indicator" });
      img.classList.add("attach-drop-indicator", placementClass);
      return img;
    };

    item.appendChild(makeDropIndicator("before"));

    const icon = this.ownerDocument.createElement("img");
    icon.setAttribute("alt", "");
    icon.setAttribute("draggable", "false");
    // Allow the src to be invalid.
    icon.classList.add("attachmentcell-icon", "invisible-on-broken");
    item.appendChild(icon);

    const textLabel = this.ownerDocument.createElement("span");
    textLabel.classList.add("attachmentcell-name");
    item.appendChild(textLabel);

    const extensionLabel = this.ownerDocument.createElement("span");
    extensionLabel.classList.add("attachmentcell-extension");
    item.appendChild(extensionLabel);

    const sizeLabel = this.ownerDocument.createElement("span");
    sizeLabel.setAttribute("role", "note");
    sizeLabel.classList.add("attachmentcell-size");
    item.appendChild(sizeLabel);

    item.appendChild(makeDropIndicator("after"));

    item.setAttribute("context", this.getAttribute("itemcontext"));

    item.attachment = attachment;
    this.invalidateItem(item, attachmentName);
    this.insertBefore(item, this.getItemAtIndex(index));
    return item;
  }

  /**
   * Set the attachment icon source.
   *
   * @param {MozRichlistitem} item - The attachment item to set the icon of.
   * @param {string|null} src - The src to set.
   * @param {boolean} srcset - Is the src a srcset?
   */
  setAttachmentIconSrc(item, src, srcset) {
    const icon = item.querySelector(".attachmentcell-icon");
    if (!srcset) {
      icon.setAttribute("src", src);
      icon.removeAttribute("srcset");
    } else {
      icon.setAttribute("srcset", src);
      icon.removeAttribute("src");
    }
  }

  /**
   * Refresh the attachment icon using the attachment details.
   *
   * @param {MozRichlistitem} item - The attachment item to refresh the icon
   *   for.
   */
  refreshAttachmentIcon(item) {
    let src;
    let srcset = false;
    const attachment = item.attachment;
    const type = attachment.contentType;
    if (type == "text/x-moz-deleted") {
      src = "chrome://messenger/skin/icons/attachment-deleted.svg";
    } else if (!item.loaded || item.uploading) {
      src = "chrome://messenger/skin/icons/spinning.svg";
    } else if (item.cloudIcon) {
      src = item.cloudIcon;
    } else {
      let iconName = attachment.name;
      if (iconName.toLowerCase().endsWith(".eml")) {
        // Discard file names derived from subject headers with special
        // characters.
        iconName = "message.eml";
      } else if (attachment.url) {
        // For local file urls, we are better off using the full file url
        // because moz-icon will actually resolve the file url and get the
        // right icon from the file url. All other urls, we should try to
        // extract the file name from them. This fixes issues where an icon
        // wasn't showing up if you dragged a web url that had a query or
        // reference string after the file name and for mailnews urls where
        // the filename is hidden in the url as a &filename=  part.
        const url = Services.io.newURI(attachment.url);
        if (url instanceof Ci.nsIURL && url.fileName && !url.schemeIs("file")) {
          iconName = url.fileName;
        }
      }
      src = `moz-icon://${iconName}?size=16&contentType=${type}&scale=1 1x, moz-icon://${iconName}?size=16&contentType=${type}&scale=2 2x, moz-icon://${iconName}?size=16&contentType=${type}&scale=3 3x`;
      srcset = true;
    }

    this.setAttachmentIconSrc(item, src, srcset);
  }

  /**
   * Get whether the attachment list is fully loaded.
   *
   * @returns {boolean} - Whether all the attachments in the list are fully
   *   loaded.
   */
  isLoaded() {
    // Not loaded if at least one loading.
    for (const item of this.querySelectorAll(".attachmentItem")) {
      if (!item.loaded) {
        return false;
      }
    }
    return true;
  }

  /**
   * Set the attachment item's loaded state.
   *
   * @param {MozRichlistitem} item - The attachment item.
   * @param {boolean} loaded - Whether the attachment is fully loaded.
   */
  setAttachmentLoaded(item, loaded) {
    item.loaded = loaded;
    this.refreshAttachmentIcon(item);
  }

  /**
   * Set the attachment item's cloud icon, if any.
   *
   * @param {MozRichlistitem} item - The attachment item.
   * @param {?string} cloudIcon - The icon of the cloud provider where the
   *   attachment was uploaded. Will be used as file type icon in the list of
   *   attachments, if specified.
   */
  setCloudIcon(item, cloudIcon) {
    item.cloudIcon = cloudIcon;
    this.refreshAttachmentIcon(item);
  }

  /**
   * Set the attachment item's displayed name.
   *
   * @param {MozRichlistitem} item - The attachment item.
   * @param {string} attachmentName - The name to display for the attachment.
   */
  setAttachmentName(item, attachmentName) {
    item.setAttribute("name", attachmentName);
    // Extract what looks like the file extension so we can always show it,
    // even if the full name would overflow.
    // NOTE: This is a convenience feature rather than a security feature
    // since the content type of an attachment need not match the extension.
    const found = attachmentName.match(/^(.+)(\.[a-zA-Z0-9_#$!~+-]{1,16})$/);
    item.querySelector(".attachmentcell-name").textContent =
      found?.[1] || attachmentName;
    item.querySelector(".attachmentcell-extension").textContent =
      found?.[2] || "";
  }

  /**
   * Set the attachment item's displayed size.
   *
   * @param {MozRichlistitem} item - The attachment item.
   * @param {string} size - The size to display for the attachment.
   */
  setAttachmentSize(item, size) {
    item.setAttribute("size", size);
    const sizeEl = item.querySelector(".attachmentcell-size");
    sizeEl.textContent = size;
    sizeEl.hidden = !size;
  }

  invalidateItem(item, attachmentName) {
    const attachment = item.attachment;

    this.setAttachmentName(item, attachmentName || attachment.name);
    let size =
      attachment.size == null || attachment.size == -1
        ? ""
        : this.messenger.formatFileSize(attachment.size);
    if (size && item.cloudHtmlFileSize > 0) {
      size = `${this.messenger.formatFileSize(
        item.cloudHtmlFileSize
      )} (${size})`;
    }
    this.setAttachmentSize(item, size);

    // By default, items are considered loaded.
    item.loaded = true;
    this.refreshAttachmentIcon(item);
    return item;
  }

  /**
   * Find the attachmentitem node for the specified nsIMsgAttachment.
   */
  findItemForAttachment(aAttachment) {
    for (let i = 0; i < this.itemCount; i++) {
      const item = this.getItemAtIndex(i);
      if (item.attachment == aAttachment) {
        return item;
      }
    }
    return null;
  }

  _fireOnSelect() {
    if (!this._suppressOnSelect && !this.suppressOnSelect) {
      this.dispatchEvent(
        new Event("select", { bubbles: false, cancelable: true })
      );
    }
  }

  _itemsPerRow() {
    // For 0 or 1 children, we can assume that they all fit in one row.
    if (this._childNodes.length < 2) {
      return this._childNodes.length;
    }

    const itemWidth =
      this._childNodes[1].getBoundingClientRect().x -
      this._childNodes[0].getBoundingClientRect().x;

    // Each item takes up a full row
    if (itemWidth == 0) {
      return 1;
    }
    return Math.floor(this.clientWidth / itemWidth);
  }

  _itemsPerCol(aItemsPerRow) {
    const itemsPerRow = aItemsPerRow || this._itemsPerRow();

    if (this._childNodes.length == 0) {
      return 0;
    }

    if (this._childNodes.length <= itemsPerRow) {
      return 1;
    }

    const itemHeight =
      this._childNodes[itemsPerRow].getBoundingClientRect().y -
      this._childNodes[0].getBoundingClientRect().y;

    return Math.floor(this.clientHeight / itemHeight);
  }

  /**
   * Set the width of each child to the largest width child to create a
   * grid-like effect for the flex-wrapped attachment list.
   */
  setOptimumWidth() {
    if (this._childNodes.length == 0) {
      return;
    }

    let width = 0;
    for (const child of this._childNodes) {
      // Unset the width, then the child will expand or shrink to its
      // "natural" size in the flex-wrapped container. I.e. its preferred
      // width bounded by the width of the container's content space.
      child.style.width = null;
      width = Math.max(width, child.getBoundingClientRect().width);
    }
    for (const child of this._childNodes) {
      child.style.width = `${width}px`;
    }
  }
}

customElements.define("attachment-list", MozAttachmentlist, {
  extends: "richlistbox",
});
