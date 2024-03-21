/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../components/compose/content/addressingWidgetOverlay.js */
/* import-globals-from ../../../components/compose/content/MsgComposeCommands.js */

/* global MozElements */
/* global MozXULElement */
/* global gFolderDisplay */
/* global onRecipientsChanged */

// Wrap in a block to prevent leaking to window scope.
{
  const { MailServices } = ChromeUtils.importESModule(
    "resource:///modules/MailServices.sys.mjs"
  );
  const lazy = {};
  ChromeUtils.defineESModuleGetters(lazy, {
    MimeParser: "resource:///modules/mimeParser.sys.mjs",
  });

  /**
   * A tree column header with an icon instead of a label.
   *
   * @augments MozTreecol
   *
   * @note Icon column headers should have their "label" attribute set to
   * describe the icon for the accessibility tree.
   *
   * @note Ideally we could listen for the "alt" attribute and pass it on to the
   * contained <img>, but the accessibility tree only seems to read the "label"
   * for a <treecol>, and ignores the alt text.
   */
  class MozTreecolImage extends customElements.get("treecol") {
    static get observedAttributes() {
      return ["src", ...super.observedAttributes];
    }

    connectedCallback() {
      if (this.hasChildNodes() || this.delayConnectedCallback()) {
        return;
      }
      this.image = document.createElement("img");
      this.image.classList.add("treecol-icon");

      this.appendChild(this.image);
      this._updateAttributes();

      this.initializeAttributeInheritance();
      if (this.hasAttribute("ordinal")) {
        this.style.order = this.getAttribute("ordinal");
      }
    }

    attributeChangedCallback(name, oldValue, newValue) {
      super.attributeChangedCallback(name, oldValue, newValue);
      this._updateAttributes();
    }

    _updateAttributes() {
      if (!this.image) {
        return;
      }

      const src = this.getAttribute("src");

      if (src != null) {
        this.image.setAttribute("src", src);
      } else {
        this.image.removeAttribute("src");
      }
    }
  }
  customElements.define("treecol-image", MozTreecolImage, {
    extends: "treecol",
  });

  // The menulist CE is defined lazily. Create one now to get menulist defined,
  // allowing us to inherit from it.
  if (!customElements.get("menulist")) {
    delete document.createXULElement("menulist");
  }
  {
    /**
     * MozMenulistEditable is a menulist widget that can be made editable by setting editable="true".
     * With an additional type="description" the list also contains an additional label that can hold
     * for instance, a description of a menu item.
     * It is typically used e.g. for the "Custom From Address..." feature to let the user chose and
     * edit the address to send from.
     *
     * @augments {MozMenuList}
     */
    class MozMenulistEditable extends customElements.get("menulist") {
      static get markup() {
        // Accessibility information of these nodes will be
        // presented on XULComboboxAccessible generated from <menulist>;
        // hide these nodes from the accessibility tree.
        return `
        <html:link rel="stylesheet" href="chrome://global/skin/menulist.css"/>
        <html:input part="text-input" type="text" allowevents="true"/>
        <hbox id="label-box" part="label-box" flex="1" role="none">
          <label id="label" part="label" crop="end" flex="1" role="none"/>
          <label id="highlightable-label" part="label" crop="end" flex="1" role="none"/>
        </hbox>
        <dropmarker part="dropmarker" exportparts="icon: dropmarker-icon" type="menu" role="none"/>
        <html:slot/>
      `;
      }

      connectedCallback() {
        if (this.delayConnectedCallback()) {
          return;
        }

        this.shadowRoot.appendChild(this.constructor.fragment);
        this._inputField = this.shadowRoot.querySelector("input");
        this._labelBox = this.shadowRoot.getElementById("label-box");
        this._dropmarker = this.shadowRoot.querySelector("dropmarker");

        if (this.getAttribute("type") == "description") {
          this._description = document.createXULElement("label");
          this._description.id = this._description.part = "description";
          this._description.setAttribute("crop", "end");
          this._description.setAttribute("role", "none");
          this.shadowRoot.getElementById("label").after(this._description);
        }

        this.initializeAttributeInheritance();

        this.mSelectedInternal = null;
        this.setInitialSelection();

        this._handleMutation = mutations => {
          this.editable = this.getAttribute("editable") == "true";
        };
        this.mAttributeObserver = new MutationObserver(this._handleMutation);
        this.mAttributeObserver.observe(this, {
          attributes: true,
          attributeFilter: ["editable"],
        });

        this._keypress = event => {
          if (event.key == "ArrowDown") {
            this.open = true;
          }
        };
        this._inputField.addEventListener("keypress", this._keypress);
        this._change = event => {
          event.stopPropagation();
          this.selectedItem = null;
          this.setAttribute("value", this._inputField.value);
          // Start the event again, but this time with the menulist as target.
          this.dispatchEvent(new CustomEvent("change", { bubbles: true }));
        };
        this._inputField.addEventListener("change", this._change);

        this._popupHiding = event => {
          // layerX is 0 if the user clicked outside the popup.
          if (this.editable && event.layerX > 0) {
            this._inputField.select();
          }
        };
        if (!this.menupopup) {
          this.appendChild(MozXULElement.parseXULToFragment(`<menupopup />`));
        }
        this.menupopup.addEventListener("popuphiding", this._popupHiding);
      }

      disconnectedCallback() {
        super.disconnectedCallback();

        this.mAttributeObserver.disconnect();
        this._inputField.removeEventListener("keypress", this._keypress);
        this._inputField.removeEventListener("change", this._change);
        this.menupopup.removeEventListener("popuphiding", this._popupHiding);

        for (const prop of [
          "_inputField",
          "_labelBox",
          "_dropmarker",
          "_description",
        ]) {
          if (this[prop]) {
            this[prop].remove();
            this[prop] = null;
          }
        }
      }

      static get inheritedAttributes() {
        const attrs = super.inheritedAttributes;
        attrs.input = "value,disabled";
        attrs["#description"] = "value=description";
        return attrs;
      }

      set editable(val) {
        if (val == this.editable) {
          return;
        }

        if (!val) {
          // If we were focused and transition from editable to not editable,
          // focus the parent menulist so that the focus does not get stuck.
          if (this._inputField == document.activeElement) {
            window.setTimeout(() => this.focus(), 0);
          }
        }

        this.setAttribute("editable", val);
      }

      get editable() {
        return this.getAttribute("editable") == "true";
      }

      set value(val) {
        this._inputField.value = val;
        this.setAttribute("value", val);
        this.setAttribute("label", val);
      }

      get value() {
        if (this.editable) {
          return this._inputField.value;
        }
        return super.value;
      }

      get label() {
        if (this.editable) {
          return this._inputField.value;
        }
        return super.label;
      }

      set placeholder(val) {
        this._inputField.placeholder = val;
      }

      get placeholder() {
        return this._inputField.placeholder;
      }

      set selectedItem(val) {
        if (val) {
          this._inputField.value = val.getAttribute("value");
        }
        super.selectedItem = val;
      }

      get selectedItem() {
        return super.selectedItem;
      }

      focus() {
        if (this.editable) {
          this._inputField.focus();
        } else {
          super.focus();
        }
      }

      select() {
        if (this.editable) {
          this._inputField.select();
        }
      }
    }

    const MenuBaseControl = MozElements.BaseControlMixin(
      MozElements.MozElementMixin(XULMenuElement)
    );
    MenuBaseControl.implementCustomInterface(MozMenulistEditable, [
      Ci.nsIDOMXULMenuListElement,
      Ci.nsIDOMXULSelectControlElement,
    ]);

    customElements.define("menulist-editable", MozMenulistEditable, {
      extends: "menulist",
    });
  }

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
              const evt = document.createEvent("XULCommandEvent");
              evt.initCommandEvent(
                "command",
                true,
                true,
                window,
                0,
                event.ctrlKey,
                event.altKey,
                event.shiftKey,
                event.metaKey,
                null
              );
              this.currentItem.dispatchEvent(evt);
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
    }

    get itemCount() {
      return this._childNodes.length;
    }

    /**
     * Get the preferred height (the height that would allow us to fit
     * everything without scrollbars) of the attachmentlist's bounding
     * rectangle. Add 3px to account for item's margin.
     */
    get preferredHeight() {
      return this.scrollHeight + this.getBoundingClientRect().height + 3;
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

    appendItem(attachment, name) {
      // -1 appends due to the way getItemAtIndex is implemented.
      return this.insertItemAt(-1, attachment, name);
    }

    insertItemAt(index, attachment, name) {
      const item = this.ownerDocument.createXULElement("richlistitem");
      item.classList.add("attachmentItem");
      item.setAttribute("role", "option");

      item.addEventListener("dblclick", event => {
        const evt = document.createEvent("XULCommandEvent");
        evt.initCommandEvent(
          "command",
          true,
          true,
          window,
          0,
          event.ctrlKey,
          event.altKey,
          event.shiftKey,
          event.metaKey,
          null
        );
        item.dispatchEvent(evt);
      });

      const makeDropIndicator = placementClass => {
        const img = document.createElement("img");
        img.setAttribute(
          "src",
          "chrome://messenger/skin/icons/tab-drag-indicator.svg"
        );
        img.setAttribute("alt", "");
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
      this.invalidateItem(item, name);
      this.insertBefore(item, this.getItemAtIndex(index));
      return item;
    }

    /**
     * Set the attachment icon source.
     *
     * @param {MozRichlistitem} item - The attachment item to set the icon of.
     * @param {string|null} src - The src to set.
     */
    setAttachmentIconSrc(item, src) {
      const icon = item.querySelector(".attachmentcell-icon");
      icon.setAttribute("src", src);
    }

    /**
     * Refresh the attachment icon using the attachment details.
     *
     * @param {MozRichlistitem} item - The attachment item to refresh the icon
     *   for.
     */
    refreshAttachmentIcon(item) {
      let src;
      const attachment = item.attachment;
      const type = attachment.contentType;
      if (type == "text/x-moz-deleted") {
        src = "chrome://messenger/skin/icons/attachment-deleted.svg";
      } else if (!item.loaded || item.uploading) {
        src = "chrome://global/skin/icons/loading.png";
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
          if (
            url instanceof Ci.nsIURL &&
            url.fileName &&
            !url.schemeIs("file")
          ) {
            iconName = url.fileName;
          }
        }
        src = `moz-icon://${iconName}?size=16&contentType=${type}`;
      }

      this.setAttachmentIconSrc(item, src);
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
     * @param {string} name - The name to display for the attachment.
     */
    setAttachmentName(item, name) {
      item.setAttribute("name", name);
      // Extract what looks like the file extension so we can always show it,
      // even if the full name would overflow.
      // NOTE: This is a convenience feature rather than a security feature
      // since the content type of an attachment need not match the extension.
      const found = name.match(/^(.+)(\.[a-zA-Z0-9_#$!~+-]{1,16})$/);
      item.querySelector(".attachmentcell-name").textContent =
        found?.[1] || name;
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

    invalidateItem(item, name) {
      const attachment = item.attachment;

      this.setAttachmentName(item, name || attachment.name);
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

  /**
   * The MailAddressPill widget is used to display the email addresses in the
   * messengercompose.xhtml window.
   *
   * @augments {MozXULElement}
   */
  class MailAddressPill extends MozXULElement {
    static get inheritedAttributes() {
      return {
        ".pill-label": "crop,value=label",
      };
    }

    /**
     * Indicates whether the address of this pill is for a mail list.
     *
     * @type {boolean}
     */
    isMailList = false;

    /**
     * If this pill is for a mail list, this provides the URI.
     *
     * @type {?string}
     */
    listURI = null;

    /**
     * If this pill is for a mail list, this provides the total count of
     * its addresses.
     *
     * @type {number}
     */
    listAddressCount = 0;

    connectedCallback() {
      if (this.hasChildNodes() || this.delayConnectedCallback()) {
        return;
      }

      this.classList.add("address-pill");
      this.setAttribute("context", "emailAddressPillPopup");
      this.setAttribute("allowevents", "true");

      this.labelView = document.createXULElement("hbox");
      this.labelView.setAttribute("flex", "1");

      this.pillLabel = document.createXULElement("label");
      this.pillLabel.classList.add("pill-label");
      this.pillLabel.setAttribute("crop", "center");

      this.pillIndicator = document.createElement("img");
      this.pillIndicator.setAttribute(
        "src",
        "chrome://messenger/skin/icons/pill-indicator.svg"
      );
      this.pillIndicator.setAttribute("alt", "");
      this.pillIndicator.classList.add("pill-indicator");
      this.pillIndicator.hidden = true;

      this.labelView.appendChild(this.pillLabel);
      this.labelView.appendChild(this.pillIndicator);

      this.appendChild(this.labelView);
      this._setupEmailInput();

      this._setupEventListeners();
      this.initializeAttributeInheritance();

      // @implements {nsIObserver}
      this.inputObserver = {
        observe: (subject, topic, data) => {
          if (topic == "autocomplete-did-enter-text" && this.isEditing) {
            this.updatePill();
          }
        },
      };

      Services.obs.addObserver(
        this.inputObserver,
        "autocomplete-did-enter-text"
      );

      // Remove the observer on window unload as the disconnectedCallback()
      // will never be called when closing a window, so we might therefore
      // leak if XPCOM isn't smart enough.
      window.addEventListener(
        "unload",
        () => {
          this.removeObserver();
        },
        { once: true }
      );
    }

    get emailAddress() {
      return this.getAttribute("emailAddress");
    }

    set emailAddress(val) {
      this.setAttribute("emailAddress", val);
    }

    get label() {
      return this.getAttribute("label");
    }

    set label(val) {
      this.setAttribute("label", val);
    }

    get fullAddress() {
      return this.getAttribute("fullAddress");
    }

    set fullAddress(val) {
      this.setAttribute("fullAddress", val);
    }

    get displayName() {
      return this.getAttribute("displayName");
    }

    set displayName(val) {
      this.setAttribute("displayName", val);
    }

    get emailInput() {
      return this.querySelector(`input[is="autocomplete-input"]`);
    }

    /**
     * Get the main addressing input field the pill belongs to.
     */
    get rowInput() {
      return this.closest(".address-container").querySelector(
        ".address-row-input"
      );
    }

    /**
     * Check if the pill is currently in "Edit Mode", meaning the label is
     * hidden and the html:input field is visible.
     *
     * @returns {boolean} true if the pill is currently being edited.
     */
    get isEditing() {
      return !this.emailInput.hasAttribute("hidden");
    }

    get fragment() {
      if (!this.constructor.hasOwnProperty("_fragment")) {
        this.constructor._fragment = MozXULElement.parseXULToFragment(`
          <html:input is="autocomplete-input"
                      type="text"
                      class="input-pill"
                      disableonsend="true"
                      autocompletesearch="mydomain addrbook ldap news"
                      autocompletesearchparam="{}"
                      timeout="200"
                      maxrows="6"
                      completedefaultindex="true"
                      forcecomplete="true"
                      completeselectedindex="true"
                      minresultsforpopup="2"
                      ignoreblurwhilesearching="true"
                      hidden="hidden"/>
        `);
      }
      return document.importNode(this.constructor._fragment, true);
    }

    _setupEmailInput() {
      this.appendChild(this.fragment);
      this.emailInput.value = this.fullAddress;
    }

    _setupEventListeners() {
      this.addEventListener("blur", event => {
        // Prevent deselecting a pill on blur if:
        // - The related target is null (context menu was opened, bug 1729741).
        // - The related target is another pill (multi selection and deslection
        //   are handled by the click event listener added on pill creation).
        if (
          !event.relatedTarget ||
          event.relatedTarget.tagName == "mail-address-pill"
        ) {
          return;
        }

        this.closest("mail-recipients-area").deselectAllPills();
      });

      this.emailInput.addEventListener("keypress", event => {
        if (this.hasAttribute("disabled")) {
          return;
        }
        this.onEmailInputKeyPress(event);
      });

      // Disable the inbuilt autocomplete on blur as we handle it here.
      this.emailInput._dontBlur = true;

      this.emailInput.addEventListener("blur", () => {
        // If the input is still the active element after blur (when switching
        // to another window), return to prevent autocompletion and
        // pillification and let the user continue editing the address later.
        if (document.activeElement == this.emailInput) {
          return;
        }

        if (
          this.emailInput.forceComplete &&
          this.emailInput.mController.matchCount >= 1
        ) {
          // If input.forceComplete is true and there are autocomplete matches,
          // we need to call the inbuilt Enter handler to force the input text
          // to the best autocomplete match because we've set input._dontBlur.
          this.emailInput.mController.handleEnter(true);
          return;
        }

        this.updatePill();
      });
    }

    /**
     * Simple email address validation.
     *
     * @param {string} address - An email address.
     */
    isValidAddress(address) {
      return /^[^\s@]+@[^\s@]+$/.test(address);
    }

    /**
     * Convert the pill into "Edit Mode" by hiding the label and showing the
     * html:input element.
     */
    startEditing() {
      // Record the intention of editing a pill as a change in the recipient
      // even if the text is not actually changed in order to prevent accidental
      // data loss.
      onRecipientsChanged();

      // We need to set the min and max width before hiding and showing the
      // child nodes in order to prevent unwanted jumps in the resizing of the
      // edited pill. Both properties are necessary to handle flexbox.
      this.style.setProperty("max-width", `${this.clientWidth}px`);
      this.style.setProperty("min-width", `${this.clientWidth}px`);

      this.classList.add("editing");
      this.labelView.setAttribute("hidden", "true");
      this.emailInput.removeAttribute("hidden");
      this.emailInput.focus();

      // Account for pill padding.
      const inputWidth = this.emailInput.clientWidth + 15;

      // In case the original address is shorter than the input field child node
      // force resize the pill container to prevent overflows.
      if (inputWidth > this.clientWidth) {
        this.style.setProperty("max-width", `${inputWidth}px`);
        this.style.setProperty("min-width", `${inputWidth}px`);
      }
    }

    /**
     * Revert the pill UI to a regular selectable element, meaning the label is
     * visible and the html:input field is hidden.
     *
     * @param {Event} event - The DOM Event.
     */
    onEmailInputKeyPress(event) {
      switch (event.key) {
        case "Escape":
          this.emailInput.value = this.fullAddress;
          this.resetPill();
          break;
        case "Delete":
        case "Backspace":
          if (!this.emailInput.value.trim() && !event.repeat) {
            this.rowInput.focus();
            this.remove();
          }
          break;
      }
    }

    async updatePill() {
      const addresses = MailServices.headerParser.makeFromDisplayAddress(
        this.emailInput.value
      );
      const row = this.closest(".address-row");

      if (!addresses[0]) {
        this.rowInput.focus();
        this.remove();
        // Update aria labels of all pills in the row, as pill count changed.
        updateAriaLabelsOfAddressRow(row);
        onRecipientsChanged();
        return;
      }

      this.label = addresses[0].toString();
      this.emailAddress = addresses[0].email || "";
      this.fullAddress = addresses[0].toString();
      this.displayName = addresses[0].name || "";
      // We need to detach the autocomplete Controller to prevent the input
      // to be filled with the previously selected address when the "blur"
      // event gets triggered.
      this.emailInput.detachController();
      // Attach it again to enable autocomplete.
      this.emailInput.attachController();

      this.resetPill();

      // Update the aria label of edited pill only, as pill count didn't change.
      // Unfortunately, we still need to get the row's pills for counting once.
      const pills = row.querySelectorAll("mail-address-pill");
      this.setAttribute(
        "aria-label",
        await document.l10n.formatValue("pill-aria-label", {
          email: this.fullAddress,
          count: pills.length,
        })
      );

      onRecipientsChanged();
    }

    resetPill() {
      this.updatePillStatus();
      this.style.removeProperty("max-width");
      this.style.removeProperty("min-width");
      this.classList.remove("editing");
      this.labelView.removeAttribute("hidden");
      this.emailInput.setAttribute("hidden", "hidden");
      const textLength = this.emailInput.value.length;
      this.emailInput.setSelectionRange(textLength, textLength);
      this.rowInput.focus();
    }

    /**
     * Check if an address is valid or it exists in the address book and update
     * the helper icons accordingly.
     */
    async updatePillStatus() {
      const isValid = this.isValidAddress(this.emailAddress);
      const listNames = lazy.MimeParser.parseHeaderField(
        this.fullAddress,
        lazy.MimeParser.HEADER_ADDRESS
      );

      if (listNames.length > 0) {
        const mailList = MailServices.ab.getMailListFromName(listNames[0].name);
        this.isMailList = !!mailList;
        if (this.isMailList) {
          this.listURI = mailList.URI;
          this.listAddressCount = mailList.childCards.length;
        } else {
          this.listURI = "";
          this.listAddressCount = 0;
        }
      }

      const isNewsgroup = this.emailInput.classList.contains("news-input");

      if (!isValid && !this.isMailList && !isNewsgroup) {
        this.classList.add("invalid-address");
        this.setAttribute(
          "tooltiptext",
          await document.l10n.formatValue("pill-tooltip-invalid-address", {
            email: this.fullAddress,
          })
        );
        this.pillIndicator.hidden = true;

        // Interrupt if the address is not valid as we don't need to check for
        // other conditions.
        return;
      }

      this.classList.remove("invalid-address");
      this.removeAttribute("tooltiptext");
      this.pillIndicator.hidden = true;

      // Check if the address is not in the Address Book only if it's not a
      // mail list or a newsgroup.
      if (
        !isNewsgroup &&
        !this.isMailList &&
        !MailServices.ab.cardForEmailAddress(this.emailAddress)
      ) {
        this.setAttribute(
          "tooltiptext",
          await document.l10n.formatValue("pill-tooltip-not-in-address-book", {
            email: this.fullAddress,
          })
        );
        this.pillIndicator.hidden = false;
      }
    }

    /**
     * Get the nearest sibling pill which is not selected.
     *
     * @param {("next"|"previous")} [siblingsType="next"] - Iterate next or
     *   previous siblings.
     * @returns {HTMLElement} - The nearest unselected sibling element, or null.
     */
    getUnselectedSiblingPill(siblingsType = "next") {
      if (siblingsType == "next") {
        // Check for next siblings.
        let element = this.nextElementSibling;
        while (element) {
          if (!element.hasAttribute("selected")) {
            return element;
          }
          element = element.nextElementSibling;
        }

        return null;
      }

      // Check for previous siblings.
      let element = this.previousElementSibling;
      while (element) {
        if (!element.hasAttribute("selected")) {
          return element;
        }
        element = element.previousElementSibling;
      }

      return null;
    }

    removeObserver() {
      Services.obs.removeObserver(
        this.inputObserver,
        "autocomplete-did-enter-text"
      );
    }
  }

  customElements.define("mail-address-pill", MailAddressPill);

  /**
   * The MailRecipientsArea widget is used to display the recipient rows in the
   * header area of the messengercompose.xul window.
   *
   * @augments {MozXULElement}
   */
  class MailRecipientsArea extends MozXULElement {
    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      for (const input of this.querySelectorAll(".mail-input,.news-input")) {
        // Disable inbuilt autocomplete on blur to handle it with our handlers.
        input._dontBlur = true;

        this.#setupAutocompleteInput(input);

        input.addEventListener("keypress", event => {
          // Ctrl+Shift+Tab is handled by moveFocusToNeighbouringArea.
          if (event.key != "Tab" || !event.shiftKey || event.ctrlKey) {
            return;
          }
          event.preventDefault();
          this.moveFocusToPreviousElement(input);
        });

        input.addEventListener("input", event => {
          addressInputOnInput(event, false);
        });
      }

      // Force the focus on the first available input field if Tab is
      // pressed on the extraAddressRowsMenuButton label.
      document
        .getElementById("extraAddressRowsMenuButton")
        .addEventListener("keypress", event => {
          if (event.key == "Tab" && !event.shiftKey) {
            event.preventDefault();
            const row = this.querySelector(".address-row:not(.hidden)");
            const removeFieldButton = row.querySelector(".remove-field-button");
            // If the close button is hidden, focus on the input field.
            if (removeFieldButton.hidden) {
              row.querySelector(".address-row-input").focus();
              return;
            }
            // Focus on the close button.
            removeFieldButton.focus();
          }
        });

      this.addEventListener("dragstart", event => {
        // Check if we're dragging a pill, as the drag target might be another
        // element like row or pill <input> when dragging selected plain text.
        const targetPill = event.target.closest(
          "mail-address-pill:not(.editing)"
        );
        if (!targetPill) {
          return;
        }
        if (!targetPill.hasAttribute("selected")) {
          // If the drag action starts from a non-selected pill,
          // deselect all selected pills and select only the target pill.
          for (const pill of this.getAllSelectedPills()) {
            pill.removeAttribute("selected");
          }
          targetPill.toggleAttribute("selected");
        }
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.dropEffect = "move";
        event.dataTransfer.setData("text/pills", "pills");
        event.dataTransfer.setDragImage(targetPill, 50, 12);
      });

      this.addEventListener("dragover", event => {
        event.preventDefault();
      });

      this.addEventListener("dragenter", event => {
        if (!event.dataTransfer.getData("text/pills")) {
          return;
        }

        // If the current drop target is a pill, add drop indicator style to it.
        event.target
          .closest("mail-address-pill")
          ?.classList.add("drop-indicator");

        // If the current drop target is inside an address row, add the
        // indicator style for the row's address container.
        event.target
          .closest(".address-row")
          ?.querySelector(".address-container")
          .classList.add("drag-address-container");
      });

      this.addEventListener("dragleave", event => {
        if (!event.dataTransfer.getData("text/pills")) {
          return;
        }
        // If dragleave from pill, remove its drop indicator style.
        event.target
          .closest("mail-address-pill")
          ?.classList.remove("drop-indicator");

        // If dragleave from address row, remove the indicator style of its
        // address container.
        event.target
          .closest(".address-row")
          ?.querySelector(".address-container")
          .classList.remove("drag-address-container");
      });

      this.addEventListener("drop", event => {
        // First handle cases where the dropped data is not pills.
        if (!event.dataTransfer.getData("text/pills")) {
          // Bail out if the dropped data comes from the contacts sidebar.
          // Those addresses will be added immediately as pills without going
          // through the input field as plain text.
          if (event.dataTransfer.types.includes("moz/abcard")) {
            return;
          }

          // Dropped data should be plain text (images are handled elsewhere).
          // We currently only support dropping text directly into the row input
          // (Bug 1706187), which is inbuilt: no further handling required here.
          // Input element resizing is automatically handled by its input event.
          return;
        }

        // Pills have been dropped ("text/pills").
        const targetAddressRow = event.target.closest(".address-row");
        // Return if pills have been dropped outside an address row.
        if (
          !targetAddressRow ||
          targetAddressRow.classList.contains("address-row-raw")
        ) {
          return;
        }

        // Pills have been dropped somewhere inside an address row.
        // If they have been dropped directly on an address container, use that.
        // Otherwise ensure having an addressContainer for drop targets inside
        // the row, but outside the address container (e.g. the row label).
        const targetAddressContainer =
          event.target.closest(".address-container");
        const addressContainer =
          targetAddressContainer ||
          targetAddressRow.querySelector(".address-container");

        // Recreate pills in the target address container.
        // If dropped on a pill, append pills before that pill. Otherwise if
        // dropped into an address container, append pills after existing pills.
        // Otherwise if dropped elsewhere on the row (e.g. on the row label),
        // append pills before existing pills.
        const targetPill = event.target.closest("mail-address-pill");
        this.createDNDPills(
          addressContainer,
          targetPill || !targetAddressContainer,
          targetPill ? targetPill.fullAddress : null
        );
        addressContainer.classList.remove("drag-address-container");
      });
    }

    /**
     * Check if the current size of the recipient input field doesn't exceed its
     * container width. This might happen if the user pastes a very long string
     * with multiple addresses when pills are already present.
     *
     * @param {Element} input - The HTML input field.
     * @param {integer} length - The amount of characters in the input field.
     */
    resizeInputField(input, length) {
      // Set a minimum size of 1 in case no characters were written in the field
      // in order to force the smallest size possible and avoid blank rows when
      // multiple pills fill the entire recipient row.
      input.setAttribute("size", length || 1);

      // If the previously set size causes the input field to grow beyond 80% of
      // its parent container, we remove the size attribute to let the CSS flex
      // attribute let it grow naturally to fill the available space.
      if (
        input.clientWidth >
        input.closest(".address-container").clientWidth * 0.8
      ) {
        input.removeAttribute("size");
      }
    }

    /**
     * Move the dragged pills to another address row.
     *
     * @param {string} addressContainer - The address container on which pills
     *   have been dropped.
     * @param {boolean} [appendStart] - If the selected addresses should be
     *   appended at the start or at the end of existing addresses.
     *   Specifying targetAddress will override this.
     * @param {string} [targetAddress] - The existing address before which all
     *   selected addresses should be appended.
     */
    createDNDPills(addressContainer, appendStart, targetAddress) {
      const existingPills =
        addressContainer.querySelectorAll("mail-address-pill");
      const existingAddresses = [...existingPills].map(
        pill => pill.fullAddress
      );
      const selectedAddresses = [...this.getAllSelectedPills()].map(
        pill => pill.fullAddress
      );
      const originalTargetIndex = existingAddresses.indexOf(targetAddress);

      // Remove all the duplicate existing addresses.
      for (const address of selectedAddresses) {
        const index = existingAddresses.indexOf(address);
        if (index > -1) {
          existingAddresses.splice(index, 1);
        }
      }

      let combinedAddresses;
      // If selected pills have been dropped on another pill, they should be
      // inserted before that pill, otherwise use appendStart.
      if (targetAddress) {
        // Merge the two arrays in the right order. If the target address has
        // been removed by deduplication above, use its original index.
        existingAddresses.splice(
          existingAddresses.includes(targetAddress)
            ? existingAddresses.indexOf(targetAddress)
            : originalTargetIndex,
          0,
          ...selectedAddresses
        );
        combinedAddresses = existingAddresses;
      } else {
        combinedAddresses = appendStart
          ? selectedAddresses.concat(existingAddresses)
          : existingAddresses.concat(selectedAddresses);
      }

      // Remove all selected pills.
      for (const pill of this.getAllSelectedPills()) {
        pill.remove();
      }

      // Existing pills are removed before creating new ones in the right order.
      for (const pill of existingPills) {
        pill.remove();
      }

      // Create pills for all the combined addresses.
      const row = addressContainer.closest(".address-row");
      for (const address of combinedAddresses) {
        addressRowAddRecipientsArray(
          row,
          [address],
          selectedAddresses.includes(address)
        );
      }

      // Move the focus to the first selected pill.
      this.getAllSelectedPills()[0].focus();
    }

    /**
     * Create a new address row and a menuitem for revealing it.
     *
     * @param {object} recipient - An object for various element attributes.
     * @param {boolean} rawInput - A flag to disable pills and autocompletion.
     * @returns {object} - The newly created elements.
     * @property {Element} row - The address row.
     * @property {Element} showRowMenuItem - The menu item that shows the row.
     */
    // NOTE: This is currently never called with rawInput = false, so it may be
    // out of date if used.
    buildRecipientRow(recipient, rawInput = false) {
      const row = document.createXULElement("hbox");
      row.setAttribute("id", recipient.rowId);
      row.classList.add("address-row");
      row.dataset.recipienttype = recipient.type;

      const firstCol = document.createXULElement("hbox");
      firstCol.classList.add("aw-firstColBox");

      row.classList.add("hidden");

      const closeButton = document.createElement("button");
      closeButton.classList.add("remove-field-button", "plain-button");
      document.l10n.setAttributes(closeButton, "remove-address-row-button", {
        type: recipient.type,
      });
      const closeIcon = document.createElement("img");
      closeIcon.setAttribute("src", "chrome://global/skin/icons/close.svg");
      // Button's title is the accessible name.
      closeIcon.setAttribute("alt", "");
      closeButton.appendChild(closeIcon);

      closeButton.addEventListener("click", event => {
        closeLabelOnClick(event);
      });
      firstCol.appendChild(closeButton);
      row.appendChild(firstCol);

      const labelContainer = document.createXULElement("hbox");
      labelContainer.setAttribute("align", "top");
      labelContainer.setAttribute("pack", "end");
      labelContainer.classList.add("address-label-container");
      labelContainer.setAttribute(
        "style",
        getComposeBundle().getString("headersSpaceStyle")
      );

      const label = document.createXULElement("label");
      label.setAttribute("id", recipient.labelId);
      label.setAttribute("value", recipient.type);
      label.setAttribute("control", recipient.inputId);
      label.setAttribute("flex", 1);
      label.setAttribute("crop", "end");
      label.style.justifyContent = "end";
      labelContainer.appendChild(label);
      row.appendChild(labelContainer);

      const inputContainer = document.createXULElement("hbox");
      inputContainer.setAttribute("id", recipient.containerId);
      inputContainer.setAttribute("flex", 1);
      inputContainer.setAttribute("align", "center");
      inputContainer.classList.add(
        "input-container",
        "wrap-container",
        "address-container"
      );
      inputContainer.addEventListener("click", focusAddressInputOnClick);

      // Set up the row input for the row.
      const input = document.createElement(
        "input",
        rawInput
          ? undefined
          : {
              is: "autocomplete-input",
            }
      );
      input.setAttribute("id", recipient.inputId);
      input.setAttribute("size", 1);
      input.setAttribute("type", "text");
      input.setAttribute("disableonsend", true);
      input.classList.add("plain", "address-input", "address-row-input");

      if (!rawInput) {
        // Regular autocomplete address input, not other header with raw input.
        // Set various attributes for autocomplete.
        input.setAttribute("autocompletesearch", "mydomain addrbook ldap news");
        input.setAttribute("autocompletesearchparam", "{}");
        input.setAttribute("timeout", 200);
        input.setAttribute("maxrows", 6);
        input.setAttribute("completedefaultindex", true);
        input.setAttribute("forcecomplete", true);
        input.setAttribute("completeselectedindex", true);
        input.setAttribute("minresultsforpopup", 2);
        input.setAttribute("ignoreblurwhilesearching", true);
        // Disable the inbuilt autocomplete on blur as we handle it below.
        input._dontBlur = true;

        this.#setupAutocompleteInput(input);

        // Handle keydown event in autocomplete address input of row with pills.
        // input.onBeforeHandleKeyDown() gets called by the toolkit autocomplete
        // before going into autocompletion.
        input.onBeforeHandleKeyDown = event => {
          addressInputOnBeforeHandleKeyDown(event);
        };
      } else {
        // Handle keydown event in other header input (rawInput), which does not
        // have autocomplete and its associated keydown handling.
        row.classList.add("address-row-raw");
        input.addEventListener("keydown", otherHeaderInputOnKeyDown);
        input.addEventListener("input", event => {
          addressInputOnInput(event, true);
        });
      }

      input.addEventListener("blur", () => {
        addressInputOnBlur(input);
      });
      input.addEventListener("focus", () => {
        addressInputOnFocus(input);
      });

      inputContainer.appendChild(input);
      row.appendChild(inputContainer);

      // Create the menuitem that shows the row on selection.
      const showRowMenuItem = document.createXULElement("menuitem");
      showRowMenuItem.classList.add("subviewbutton", "menuitem-iconic");
      showRowMenuItem.setAttribute("id", recipient.showRowMenuItemId);
      showRowMenuItem.setAttribute("disableonsend", true);
      showRowMenuItem.setAttribute("label", recipient.type);

      showRowMenuItem.addEventListener("command", () =>
        showAndFocusAddressRow(row.id)
      );

      row.dataset.showSelfMenuitem = showRowMenuItem.id;

      return { row, showRowMenuItem };
    }

    /**
     * Set up autocomplete search parameters for address inputs of inbuilt headers.
     *
     * @param {Element} input - The address input of an inbuilt header field.
     */
    #setupAutocompleteInput(input) {
      const params = JSON.parse(input.getAttribute("autocompletesearchparam"));
      params.type = input.closest(".address-row").dataset.recipienttype;
      input.setAttribute("autocompletesearchparam", JSON.stringify(params));

      // This method overrides the autocomplete binding's openPopup (essentially
      // duplicating the logic from the autocomplete popup binding's
      // openAutocompletePopup method), modifying it so that the popup is aligned
      // and sized based on the parentNode of the input field.
      input.openPopup = () => {
        if (input.focused) {
          input.popup.openAutocompletePopup(
            input.nsIAutocompleteInput,
            input.closest(".address-container")
          );
        }
      };
    }

    /**
     * Create a new recipient pill.
     *
     * @param {HTMLElement} element - The original autocomplete input that
     *   generated the pill.
     * @param {Array} address - The array containing the recipient's info.
     * @returns {Element} The newly created pill.
     */
    createRecipientPill(element, address) {
      const pill = document.createXULElement("mail-address-pill");

      pill.label = address.toString();
      pill.emailAddress = address.email || "";
      pill.fullAddress = address.toString();
      pill.displayName = address.name || "";

      pill.addEventListener("click", event => {
        if (pill.hasAttribute("disabled")) {
          return;
        }
        // Remove pills on middle mouse button click, but not with selection
        // modifier keys.
        if (
          event.button == 1 &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey
        ) {
          if (!pill.hasAttribute("selected")) {
            this.deselectAllPills();
            pill.setAttribute("selected", "selected");
          }
          this.removeSelectedPills();
          return;
        }

        // Edit pill on unmodified single left-click on single selected pill,
        // which also fires for unmodified double-click ("dblclick") on a pill.
        if (
          event.button == 0 &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey &&
          !pill.isEditing &&
          pill.hasAttribute("selected") &&
          this.getAllSelectedPills().length == 1
        ) {
          this.startEditing(pill, event);
          return;
        }

        // Handle selection, especially with Ctrl/Cmd and/or Shift modifiers.
        this.checkSelected(pill, event);
      });

      pill.addEventListener("keydown", event => {
        if (!pill.isEditing || pill.hasAttribute("disabled")) {
          return;
        }
        this.handleKeyDown(pill, event);
      });

      pill.addEventListener("keypress", event => {
        if (pill.hasAttribute("disabled")) {
          return;
        }
        this.handleKeyPress(pill, event);
      });

      element.closest(".address-container").insertBefore(pill, element);

      // The emailInput attribute is accessible only after the pill has been
      // appended to the DOM.
      const excludedClasses = [
        "mail-primary-input",
        "news-primary-input",
        "address-row-input",
      ];
      for (const cssClass of element.classList) {
        if (excludedClasses.includes(cssClass)) {
          continue;
        }
        pill.emailInput.classList.add(cssClass);
      }
      pill.emailInput.setAttribute(
        "aria-labelledby",
        element.getAttribute("aria-labelledby")
      );
      element.removeAttribute("aria-labelledby");

      const params = JSON.parse(
        pill.emailInput.getAttribute("autocompletesearchparam")
      );
      params.type = element.closest(".address-row").dataset.recipienttype;
      pill.emailInput.setAttribute(
        "autocompletesearchparam",
        JSON.stringify(params)
      );

      pill.updatePillStatus();

      return pill;
    }

    /**
     * Handle keydown event on a pill in the mail-recipients-area.
     *
     * @param {Element} pill - The mail-address-pill element where Event fired.
     * @param {Event} event - The DOM Event.
     */
    handleKeyDown(pill, event) {
      switch (event.key) {
        case " ":
        case ",": {
          // Behaviour consistent with row input:
          // If keydown would normally replace all of the current trimmed input,
          // including if the current input is empty, then suppress the key and
          // clear the input instead.
          const input = pill.emailInput;
          const selection = input.value.substring(
            input.selectionStart,
            input.selectionEnd
          );
          if (selection.includes(input.value.trim())) {
            event.preventDefault();
            input.value = "";
          }
          break;
        }
      }
    }

    /**
     * Handle keypress event on a pill in the mail-recipients-area.
     *
     * @param {Element} pill - The mail-address-pill element where Event fired.
     * @param {Event} event - The DOM Event.
     */
    handleKeyPress(pill, event) {
      if (pill.isEditing) {
        return;
      }

      switch (event.key) {
        case "Enter":
        case "F2": // For Windows users
          this.startEditing(pill, event);
          break;

        case "Delete":
        case "Backspace": {
          // We must never delete a focused pill which is not selected.
          // If no pills selected, just select the focused pill.
          // For rapid repeated deletions (esp. from holding BACKSPACE),
          // stop before selecting another focused pill for deletion.
          if (!this.hasSelectedPills() && !event.repeat) {
            pill.setAttribute("selected", "selected");
            break;
          }
          // Delete selected pills, handle focus and select another pill
          // where applicable.
          const focusType = event.key == "Delete" ? "next" : "previous";
          this.removeSelectedPills(focusType, true);
          break;
        }

        case "ArrowLeft":
          if (pill.previousElementSibling) {
            this.checkKeyboardSelected(event, pill.previousElementSibling);
          }
          break;

        case "ArrowRight":
          this.checkKeyboardSelected(event, pill.nextElementSibling);
          break;

        case " ":
          this.checkSelected(pill, event);
          break;

        case "Home": {
          const firstPill = pill
            .closest(".address-container")
            .querySelector("mail-address-pill");
          if (!event.ctrlKey) {
            // Unmodified navigation: select only first pill and focus it below.
            // ### Todo: We can't handle Shift+Home yet, so it ends up here.
            this.deselectAllPills();
            firstPill.setAttribute("selected", "selected");
          }
          firstPill.focus();
          break;
        }
        case "End": {
          if (!event.ctrlKey) {
            // Unmodified navigation: focus row input.
            // ### Todo: We can't handle Shift+End yet, so it ends up here.
            pill.rowInput.focus();
            break;
          }
          // Navigation with Ctrl modifier key: focus last pill.
          pill
            .closest(".address-container")
            .querySelector("mail-address-pill:last-of-type")
            .focus();
          break;
        }
        case "Tab": {
          for (const item of this.getSiblingPills(pill)) {
            item.removeAttribute("selected");
          }
          // Ctrl+Tab is handled by moveFocusToNeighbouringArea.
          if (event.ctrlKey) {
            return;
          }
          event.preventDefault();
          if (event.shiftKey) {
            this.moveFocusToPreviousElement(pill);
            return;
          }
          pill.rowInput.focus();
          break;
        }
        case "a": {
          if (
            !(event.ctrlKey || event.metaKey) ||
            event.repeat ||
            event.shiftKey
          ) {
            // Bail out if it's not Ctrl+A or Cmd+A, if the Shift key is
            // pressed, or if repeated keypress.
            break;
          }
          if (
            pill
              .closest(".address-container")
              .querySelector("mail-address-pill:not([selected])")
          ) {
            // For non-repeated Ctrl+A, if there's at least one unselected pill,
            // first select all pills of the same .address-container.
            this.selectSiblingPills(pill);
            break;
          }
          // For non-repeated Ctrl+A, if pills in same container are already
          // selected, select all pills of the entire <mail-recipients-area>.
          this.selectAllPills();
          break;
        }
        case "c": {
          if (event.ctrlKey || event.metaKey) {
            this.copySelectedPills();
          }
          break;
        }
        case "x": {
          if (event.ctrlKey || event.metaKey) {
            this.cutSelectedPills();
          }
          break;
        }
      }
    }

    /**
     * Handle the selection and focus of recipient pill elements on mouse click
     * and spacebar keypress events.
     *
     * @param {HTMLElement} pill - The <mail-address-pill> element, event target.
     * @param {Event} event - A DOM click or keypress Event.
     */
    checkSelected(pill, event) {
      // Interrupt if the pill is in edit mode or a right click was detected.
      // Selecting pills on right click will be handled by the opening of the
      // context menu.
      if (pill.isEditing || event.button == 2) {
        return;
      }

      if (!event.ctrlKey && !event.metaKey && event.key != " ") {
        this.deselectAllPills();
      }

      pill.toggleAttribute("selected");

      // We need to force the focus on a pill that receives a click event
      // (or a spacebar keypress), as macOS doesn't automatically move the focus
      // on this custom element (bug 1645643, bug 1645916).
      pill.focus();
    }

    /**
     * Handle the selection and focus of the pill elements on keyboard
     * navigation.
     *
     * @param {Event} event - A DOM keyboard event.
     * @param {HTMLElement} targetElement - A mail-address-pill or address input
     *   element navigated to.
     */
    checkKeyboardSelected(event, targetElement) {
      const sourcePill =
        event.target.tagName == "mail-address-pill" ? event.target : null;
      const targetPill =
        targetElement.tagName == "mail-address-pill" ? targetElement : null;

      if (event.shiftKey) {
        if (sourcePill) {
          sourcePill.setAttribute("selected", "selected");
        }
        if (event.key == "Home" && !sourcePill) {
          // Shift+Home from address input.
          this.selectSiblingPills(targetPill);
        }
        if (targetPill) {
          targetPill.setAttribute("selected", "selected");
        }
      } else if (!event.ctrlKey) {
        // Non-modified navigation keys must select the target pill and deselect
        // all others. Also some other keys like Backspace from rowInput.
        this.deselectAllPills();
        if (targetPill) {
          targetPill.setAttribute("selected", "selected");
        } else {
          // Focus the input navigated to.
          targetElement.focus();
        }
      }

      // If targetElement is a pill, focus it.
      if (targetPill) {
        targetPill.focus();
      }
    }

    /**
     * Trigger the pill.startEditing() method.
     *
     * @param {XULElement} pill - The mail-address-pill element.
     * @param {Event} event - The DOM Event.
     */
    startEditing(pill, event) {
      if (pill.isEditing) {
        event.stopPropagation();
        return;
      }

      pill.startEditing();
    }

    /**
     * Copy the selected pills to clipboard.
     */
    copySelectedPills() {
      const selectedAddresses = [
        ...document.getElementById("recipientsContainer").getAllSelectedPills(),
      ].map(pill => pill.fullAddress);

      const clipboard = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(
        Ci.nsIClipboardHelper
      );
      clipboard.copyString(selectedAddresses.join(", "));
    }

    /**
     * Cut the selected pills to clipboard.
     */
    cutSelectedPills() {
      this.copySelectedPills();
      this.removeSelectedPills();
    }

    /**
     * Move the selected email address pills to another address row.
     *
     * @param {Element} row - The address row to move the pills to.
     */
    moveSelectedPills(row) {
      // Store all the selected addresses inside an array.
      const selectedAddresses = [...this.getAllSelectedPills()].map(
        pill => pill.fullAddress
      );

      // Return if no pills selected.
      if (!selectedAddresses.length) {
        return;
      }

      // Remove the selected pills.
      this.removeSelectedPills("next", false, true);

      // Create new address pills inside the target address row and
      // maintain the current selection.
      addressRowAddRecipientsArray(row, selectedAddresses, true);

      // Move focus to the last selected pill.
      const selectedPills = this.getAllSelectedPills();
      selectedPills[selectedPills.length - 1].focus();
    }

    /**
     * Delete all selected pills and handle focus and selection smartly as needed.
     *
     * @param {("next"|"previous")} [focusType="next"] - How to move focus after
     *   removing pills: try to focus one of the next siblings (for DEL etc.)
     *   or one of the previous siblings (for BACKSPACE).
     * @param {boolean} [select=false] - After deletion, whether to select the
     *   focused pill where applicable.
     * @param {boolean} [moved=false] - Whether the method was originally called
     *   from moveSelectedPills().
     */
    removeSelectedPills(focusType = "next", select = false, moved = false) {
      // Return if no pills selected.
      const firstSelectedPill = this.querySelector(
        "mail-address-pill[selected]"
      );
      if (!firstSelectedPill) {
        return;
      }
      // Get the pill which has focus before we start removing selected pills,
      // which may or may not include the focused pill. If no pill has focus,
      // consider the first selected pill as focused pill for our purposes.
      const pill =
        this.querySelector("mail-address-pill:focus") || firstSelectedPill;

      // We'll look hard for an appropriate element to focus after the removal.
      let focusElement = null;
      // Get addressContainer and rowInput now as pill might be deleted later.
      const addressContainer = pill.closest(".address-container");
      const rowInput = pill.rowInput;
      let unselectedSourcePill = false;

      if (pill.hasAttribute("selected")) {
        // Find focus (1): Focused pill is selected and will be deleted;
        // try nearest sibling, observing focusType direction.
        focusElement = pill.getUnselectedSiblingPill(focusType);
      } else {
        // The source pill isn't selected; keep it focused ("satellite focus").
        unselectedSourcePill = true;
        focusElement = pill;
      }

      // Remove selected pills.
      const selectedPills = this.getAllSelectedPills();
      for (const sPill of selectedPills) {
        sPill.remove();
      }

      // Find focus (2): When deleting backwards, if no previous sibling found,
      // this means that the first pill was deleted. Try the first remaining pill,
      // but don't auto-select it because it's in the opposite direction.
      if (!focusElement && focusType == "previous") {
        focusElement = addressContainer.querySelector("mail-address-pill");
      } else if (
        select &&
        focusElement &&
        selectedPills.length == 1 &&
        !unselectedSourcePill
      ) {
        // If select = true (DEL or BACKSPACE), and we found a pill to focus in
        // round (1), and we have removed a single pill only, and it's not a
        // case of "satellite focus" (see above):
        // Conveniently select the nearest pill for rapid consecutive deletions.
        focusElement.setAttribute("selected", "selected");
      }
      // Find focus (3): If all else fails (no pills left in addressContainer,
      // or last pill deleted forwards): Focus rowInput.
      if (!focusElement) {
        focusElement = rowInput;
      }
      focusElement.focus();

      // Update aria labels for all rows as we allow cross-row pill removal.
      // This may not yet be micro-performance optimized; see bug 1671261.
      updateAriaLabelsAndTooltipsOfAllAddressRows();

      // Don't trigger some methods if the pills were removed automatically
      // during the move to another addressing widget.
      if (!moved) {
        onRecipientsChanged();
      }
    }

    /**
     * Select all pills of the same address row (.address-container).
     *
     * @param {Element} pill - A <mail-address-pill> element. All pills in the
     *   same .address-container will be selected.
     */
    selectSiblingPills(pill) {
      for (const sPill of this.getSiblingPills(pill)) {
        sPill.setAttribute("selected", "selected");
      }
    }

    /**
     * Select all pills of the <mail-recipients-area> element.
     */
    selectAllPills() {
      for (const pill of this.getAllPills()) {
        pill.setAttribute("selected", "selected");
      }
    }

    /**
     * Deselect all the pills of the <mail-recipients-area> element.
     */
    deselectAllPills() {
      for (const pill of this.querySelectorAll(`mail-address-pill[selected]`)) {
        pill.removeAttribute("selected");
      }
    }

    /**
     * Return all pills of the same address row (.address-container).
     *
     * @param {Element} pill - A <mail-address-pill> element. All pills in the
     *   same .address-container will be returned.
     * @returns {NodeList} NodeList of <mail-address-pill> elements in same field.
     */
    getSiblingPills(pill) {
      return pill
        .closest(".address-container")
        .querySelectorAll("mail-address-pill");
    }

    /**
     * Return all pills of the <mail-recipients-area> element.
     *
     * @returns {NodeList} NodeList of all <mail-address-pill> elements.
     */
    getAllPills() {
      return this.querySelectorAll("mail-address-pill");
    }

    /**
     * Return all currently selected pills in the <mail-recipients-area>.
     *
     * @returns {NodeList} NodeList of all selected <mail-address-pill> elements.
     */
    getAllSelectedPills() {
      return this.querySelectorAll("mail-address-pill[selected]");
    }

    /**
     * Check if any pill in the <mail-recipients-area> is selected.
     *
     * @returns {boolean} true if any pill is selected.
     */
    hasSelectedPills() {
      return Boolean(this.querySelector("mail-address-pill[selected]"));
    }

    /**
     * Move the focus to the previous focusable element.
     *
     * @param {Element} element - The element where the event was triggered.
     */
    moveFocusToPreviousElement(element) {
      const row = element.closest(".address-row");
      // Move focus on the close label if not collapsed.
      if (!row.querySelector(".remove-field-button").hidden) {
        row.querySelector(".remove-field-button").focus();
        return;
      }
      // If a previous address row is available and not hidden,
      // focus on the autocomplete input field.
      let previousRow = row.previousElementSibling;
      while (previousRow) {
        if (!previousRow.classList.contains("hidden")) {
          previousRow.querySelector(".address-row-input").focus();
          return;
        }
        previousRow = previousRow.previousElementSibling;
      }
      // Move the focus on the previous button: either the
      // extraAddressRowsMenuButton, or one of "<type>ShowAddressRowButton".
      const buttons = document.querySelectorAll(
        "#extraAddressRowsArea button:not([hidden])"
      );
      if (buttons.length) {
        // Select the last available label.
        buttons[buttons.length - 1].focus();
        return;
      }
      // Move the focus on the msgIdentity if no extra recipients are available.
      document.getElementById("msgIdentity").focus();
    }
  }

  customElements.define("mail-recipients-area", MailRecipientsArea);
}
