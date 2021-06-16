/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../components/compose/content/addressingWidgetOverlay.js */

/* global MozElements */
/* global MozXULElement */
/* global openUILink */
/* global MessageIdClick */
/* global EditContact */
/* global AddContact */
/* global gFolderDisplay */
/* global UpdateEmailNodeDetails */
/* global PluralForm */
/* global UpdateExtraAddressProcessing */
/* global onRecipientsChanged */

// Wrap in a block to prevent leaking to window scope.
{
  const { Services } = ChromeUtils.import(
    "resource://gre/modules/Services.jsm"
  );
  const { MailServices } = ChromeUtils.import(
    "resource:///modules/MailServices.jsm"
  );
  const LazyModules = {};

  ChromeUtils.defineModuleGetter(
    LazyModules,
    "DBViewWrapper",
    "resource:///modules/DBViewWrapper.jsm"
  );
  ChromeUtils.defineModuleGetter(
    LazyModules,
    "DisplayNameUtils",
    "resource:///modules/DisplayNameUtils.jsm"
  );
  ChromeUtils.defineModuleGetter(
    LazyModules,
    "MailUtils",
    "resource:///modules/MailUtils.jsm"
  );
  ChromeUtils.defineModuleGetter(
    LazyModules,
    "MimeParser",
    "resource:///modules/mimeParser.jsm"
  );
  ChromeUtils.defineModuleGetter(
    LazyModules,
    "TagUtils",
    "resource:///modules/TagUtils.jsm"
  );

  class MozMailHeaderfield extends MozXULElement {
    connectedCallback() {
      this.setAttribute("context", "copyPopup");
      this.classList.add("headerValue");

      this._ariaBaseLabel = null;
      if (this.getAttribute("aria-labelledby")) {
        this._ariaBaseLabel = document.getElementById(
          this.getAttribute("aria-labelledby")
        );
        this.removeAttribute("aria-labelledby");
      }
    }

    set headerValue(val) {
      // Solve the accessibility problem by manually fetching the translated
      // string from the label and updating the attribute. Bug 1493608
      if (this._ariaBaseLabel) {
        this.setAttribute("aria-label", `${this._ariaBaseLabel.value}: ${val}`);
      }

      this.textContent = val;
    }
  }
  customElements.define("mail-headerfield", MozMailHeaderfield);

  class MozMailUrlfield extends MozMailHeaderfield {
    constructor() {
      super();
      this.addEventListener("click", event => {
        if (event.button != 2) {
          openUILink(encodeURI(event.target.textContent), event);
        }
      });
      this.addEventListener("keypress", event => {
        if (event.key == "Enter") {
          openUILink(encodeURI(event.target.textContent), event);
        }
      });
    }

    connectedCallback() {
      super.connectedCallback();
      this.setAttribute("context", "copyUrlPopup");
      this.setAttribute("tabindex", "0");
      this.classList.add("text-link", "headerValueUrl");
    }
  }
  customElements.define("mail-urlfield", MozMailUrlfield);

  class MozMailHeaderfieldTags extends MozXULElement {
    connectedCallback() {
      this.classList.add("headerValue");
    }

    set headerValue(val) {
      this.buildTags(val);
    }

    buildTags(tags) {
      // tags contains a list of actual tag names (not the keys), delimited by spaces
      // each tag name is encoded.

      // remove any existing tag items we've appended to the list
      while (this.hasChildNodes()) {
        this.lastChild.remove();
      }

      // tokenize the keywords based on ' '
      const tagsArray = tags.split(" ");
      for (let i = 0; i < tagsArray.length; i++) {
        // for each tag, create a label, give it the font color that corresponds to the
        // color of the tag and append it.
        let tagName;
        try {
          // if we got a bad tag name, getTagForKey will throw an exception, skip it
          // and go to the next one.
          tagName = MailServices.tags.getTagForKey(tagsArray[i]);
        } catch (ex) {
          continue;
        }

        let color = MailServices.tags.getColorForKey(tagsArray[i]);
        let textColor = "black";
        if (!LazyModules.TagUtils.isColorContrastEnough(color)) {
          textColor = "white";
        }

        // now create a label for the tag name, and set the color
        const label = document.createXULElement("label");
        label.setAttribute("value", tagName);
        label.className = "tagvalue";
        label.setAttribute(
          "style",
          "color: " + textColor + "; background-color: " + color + ";"
        );

        // Solve the accessibility problem by manually fetching the translated
        // string from the label and updating the attribute. Bug 1493608
        let ariaLabel = document.getElementById(
          this.getAttribute("aria-labelledby")
        );
        label.setAttribute("aria-label", `${ariaLabel.value}: ${tagName}`);
        label.removeAttribute("aria-labelledby");

        this.appendChild(label);
      }
    }
  }
  customElements.define("mail-tagfield", MozMailHeaderfieldTags);

  class MozMailNewsgroup extends MozXULElement {
    connectedCallback() {
      this.classList.add("emailDisplayButton");
      this.setAttribute("context", "newsgroupPopup");
      this.setAttribute("popup", "newsgroupPopup");

      // Solve the accessibility problem by manually fetching the translated
      // string from the label and updating the attribute. Bug 1493608
      let ariaLabel = document.getElementById(
        this.getAttribute("aria-labelledby")
      );
      this.setAttribute(
        "aria-label",
        `${ariaLabel.value}: ${this.getAttribute("newsgroup")}`
      );
      this.removeAttribute("aria-labelledby");
    }
  }
  customElements.define("mail-newsgroup", MozMailNewsgroup);

  class MozMailNewsgroupsHeaderfield extends MozXULElement {
    connectedCallback() {
      this.classList.add("headerValueBox");
      this.mNewsgroups = [];
    }

    addNewsgroupView(aNewsgroup) {
      this.mNewsgroups.push(aNewsgroup);
    }

    buildViews() {
      for (let i = 0; i < this.mNewsgroups.length; i++) {
        const newNode = document.createXULElement("mail-newsgroup");
        if (i > 0) {
          const textNode = document.createXULElement("label");
          textNode.setAttribute("value", ",");
          textNode.setAttribute("class", "newsgroupSeparator");
          this.appendChild(textNode);
        }

        newNode.textContent = this.mNewsgroups[i];
        newNode.setAttribute("newsgroup", this.mNewsgroups[i]);
        newNode.setAttribute(
          "aria-labelledby",
          this.getAttribute("aria-labelledby")
        );
        this.appendChild(newNode);
      }
    }

    clearHeaderValues() {
      this.mNewsgroups = [];
      while (this.hasChildNodes()) {
        this.lastChild.remove();
      }
    }
  }
  customElements.define(
    "mail-newsgroups-headerfield",
    MozMailNewsgroupsHeaderfield
  );

  class MozMailMessageid extends MozXULElement {
    static get observedAttributes() {
      return ["label"];
    }

    constructor() {
      super();
      this.addEventListener("click", event => {
        MessageIdClick(this, event);
      });
    }

    connectedCallback() {
      this.classList.add("messageIdDisplayButton");
      this.setAttribute("context", "messageIdContext");
      this._updateAttributes();
    }

    attributeChangedCallback() {
      this._updateAttributes();
    }

    _updateAttributes() {
      this.textContent = this.label || "";
    }

    set label(val) {
      if (val == null) {
        this.removeAttribute("label");
      } else {
        this.setAttribute("label", val);
      }
    }

    get label() {
      return this.getAttribute("label");
    }
  }
  customElements.define("mail-messageid", MozMailMessageid);

  /**
   * MozMailMessageidsHeaderfield is a widget used to show/link messages in the message header.
   * Shown by default for nntp messages, not for regular emails.
   * @extends {MozXULElement}
   */
  class MozMailMessageidsHeaderfield extends MozXULElement {
    connectedCallback() {
      if (this.hasChildNodes() || this.delayConnectedCallback()) {
        return;
      }

      this.setAttribute("context", "messageIdsHeaderfieldContext");

      this.mMessageIds = [];
      this.showFullMessageIds = false;

      this.toggleButton = document.createElement("button");
      this.toggleButton.classList.add("icon-button", "email-action-button");
      // FIXME: Is the twisty icon the best representation since toggling the
      // twisty icon does not expand hidden content vertically?
      // A list of <details> elements may be more appropriate to capture this,
      // and would be more accessible.
      // NOTE: We currently style the toggle button as a twisty icon, which
      // relies on the CSS -moz-locale-dir(rtl) selector to choose the image.
      // Therefore, we use a <div> rather than an <img> for convenience.
      // However, this means we cannot set alt text that describes the behaviour
      // of the button to screen readers. We use aria-expanded to hint that the
      // behaviour is _similar_ to tree expansion.
      this.toggleButton.setAttribute("aria-expanded", this.showFullMessageIds);
      this.toggleIcon = document.createElement("div");
      this.toggleIcon.classList.add("emailToggleHeaderfield");
      this.toggleButton.appendChild(this.toggleIcon);

      this.toggleButton.addEventListener("click", () => {
        this._toggleWrap();
      });
      this.appendChild(this.toggleButton);

      this.headerValue = document.createXULElement("hbox");
      this.headerValue.classList.add("headerValue");
      this.headerValue.setAttribute("flex", "1");
      this.appendChild(this.headerValue);
    }

    _toggleWrap() {
      this.showFullMessageIds = !this.showFullMessageIds;
      this.toggleButton.setAttribute("aria-expanded", this.showFullMessageIds);
      this.toggleIcon.classList.toggle("open", this.showFullMessageIds);
      for (let i = 0; i < this.headerValue.children.length; i += 2) {
        if (this.showFullMessageIds) {
          this.headerValue.children[i].setAttribute(
            "label",
            this.mMessageIds[i / 2]
          );
          this.headerValue.children[i].removeAttribute("tooltiptext");
        } else {
          this.headerValue.children[i].setAttribute("label", i / 2 + 1);
          this.headerValue.children[i].setAttribute(
            "tooltiptext",
            this.mMessageIds[i / 2]
          );
        }
      }
    }

    fillMessageIdNodes() {
      while (
        this.headerValue.children.length >
        this.mMessageIds.length * 2 - 1
      ) {
        this.headerValue.lastElementChild.remove();
      }

      this.toggleButton.hidden = this.mMessageIds.length <= 1;

      for (let i = 0; i < this.mMessageIds.length; i++) {
        if (i * 2 <= this.headerValue.children.length - 1) {
          this._updateMessageIdNode(
            this.headerValue.children[i * 2],
            i + 1,
            this.mMessageIds[i],
            this.mMessageIds.length
          );
        } else {
          let newMessageIdNode = document.createXULElement("mail-messageid");

          if (i > 0) {
            let textNode = document.createXULElement("label");
            textNode.setAttribute("value", ", ");
            textNode.setAttribute("class", "messageIdSeparator");
            this.headerValue.appendChild(textNode);
          }
          let itemInDocument = this.headerValue.appendChild(newMessageIdNode);
          this._updateMessageIdNode(
            itemInDocument,
            i + 1,
            this.mMessageIds[i],
            this.mMessageIds.length
          );
        }
      }
    }

    _updateMessageIdNode(messageIdNode, index, messageId, lastId) {
      if (this.showFullMessageIds || index == lastId) {
        messageIdNode.setAttribute("label", messageId);
        messageIdNode.removeAttribute("tooltiptext");
      } else {
        messageIdNode.setAttribute("label", index);
        messageIdNode.setAttribute("tooltiptext", messageId);
      }

      messageIdNode.setAttribute("index", index);
      messageIdNode.setAttribute("messageid", messageId);
    }

    addMessageIdView(messageId) {
      this.mMessageIds.push(messageId);
    }

    clearHeaderValues() {
      this.mMessageIds = [];
      if (this.showFullMessageIds) {
        this.showFullMessageIds = false;
        this.toggleIcon.classList.remove("open");
      }
    }
  }
  customElements.define(
    "mail-messageids-headerfield",
    MozMailMessageidsHeaderfield
  );

  class MozMailEmailaddress extends MozXULElement {
    static get observedAttributes() {
      return ["label", "crop"];
    }

    connectedCallback() {
      if (this.hasChildNodes() || this.delayConnectedCallback()) {
        return;
      }
      this.classList.add("emailDisplayButton");
      this.setAttribute("context", "emailAddressPopup");
      // FIXME: popup is not accessible to keyboard users.
      this.setAttribute("popup", "emailAddressPopup");
      this.setAttribute("align", "center");

      const label = document.createXULElement("label");
      label.classList.add("emaillabel");

      // FIXME: The star button uses "title" to describe its action, but the
      // tooltip is not currently accessible to keyboard users and doesn't
      // appear as a node in the accessibility tree.
      this.starButton = document.createElement("button");
      this.starButton.classList.add("icon-button", "email-action-button");
      this.starButton.setAttribute("contextmenu", "emailAddressPopup");
      this.starIcon = document.createElement("img");
      this.starIcon.classList.add("emailStar");
      this.starButton.appendChild(this.starIcon);

      this.starButton.addEventListener("mousedown", event => {
        // Don't trigger popup.
        event.preventDefault();
      });
      this.starButton.addEventListener("click", this.onClickStar.bind(this));

      this.appendChild(label);
      this.appendChild(this.starButton);

      this.createdStarButton = true;

      this._updateStarButton();
      this._update();
    }

    onClickStar(event) {
      // Only care about left-click events
      if (event.button != 0) {
        return;
      }

      // FIXME: both methods use properties set outside of this class in
      // msgHdrView.js. Would be cleaner if the logic could be brought within
      // this class since they are currently quite interdependent.
      if (this.hasCard) {
        EditContact(this);
      } else {
        AddContact(this);
      }
    }

    _updateStarButton() {
      let src;
      let title;
      if (this.hasCard) {
        src = "chrome://messenger/skin/icons/starred.svg";
        // Set the alt text.
        document.l10n.setAttributes(
          this.starIcon,
          "message-header-address-in-address-book-icon"
        );
        title = document.getElementById("editContactItem").label;
      } else {
        src = "chrome://messenger/skin/icons/star.svg";
        // Set the alt text.
        document.l10n.setAttributes(
          this.starIcon,
          "message-header-address-not-in-address-book-icon"
        );
        title = document.getElementById("addToAddressBookItem").label;
      }
      this.starIcon.setAttribute("src", src);
      this.starIcon.classList.toggle("starredFill", this.hasCard);
      this.starButton.setAttribute("title", title);
    }

    /**
     * Set the address book action for the star button depending on whether the
     * shown address exists in the address book.
     *
     * @param {boolean} hasCard - Whether the shown address is already in the
     *   address book.
     */
    setAddressBookState(hasCard) {
      if (hasCard === this.hasCard) {
        return;
      }
      this.hasCard = hasCard;
      if (this.createdStarButton) {
        this._updateStarButton();
      }
    }

    attributeChangedCallback() {
      if (!this.isConnectedAndReady) {
        return;
      }
      this._update();
    }

    _update() {
      const emailLabel = this.querySelector(".emaillabel");

      this._updateNodeAttributes(emailLabel, "crop");
      this._updateNodeAttributes(emailLabel, "value", "label");
    }

    _updateNodeAttributes(attrNode, attr, mappedAttr) {
      mappedAttr = mappedAttr || attr;

      if (
        this.hasAttribute(mappedAttr) &&
        this.getAttribute(mappedAttr) != null
      ) {
        attrNode.setAttribute(attr, this.getAttribute(mappedAttr));
      } else {
        attrNode.removeAttribute(attr);
      }
    }
  }
  customElements.define("mail-emailaddress", MozMailEmailaddress);

  class MozMailEmailheaderfield extends MozXULElement {
    connectedCallback() {
      if (this.hasChildNodes() || this.delayConnectedCallback()) {
        return;
      }
      this._mailEmailAddress = document.createXULElement("mail-emailaddress");
      this._mailEmailAddress.classList.add("headerValue");
      this._mailEmailAddress.setAttribute("containsEmail", "true");
      this._mailEmailAddress.setAttribute(
        "aria-labelledby",
        this.getAttribute("aria-labelledby")
      );
      this._mailEmailAddress.removeAttribute("aria-labelledby");

      this.appendChild(this._mailEmailAddress);
    }

    get emailAddressNode() {
      return this._mailEmailAddress;
    }
  }
  customElements.define("mail-emailheaderfield", MozMailEmailheaderfield);

  // NOTE: Icon column headers should have their "label" attribute set to
  // describe the icon for the accessibility tree.
  //
  // NOTE: Ideally we could listen for the "alt" attribute and pass it on to the
  // contained <img>, but the accessibility tree only seems to read the "label"
  // for a <treecol>, and ignores the alt text.
  class MozTreecolImage extends customElements.get("treecol") {
    static get observedAttributes() {
      return ["src"];
    }

    connectedCallback() {
      if (this.hasChildNodes() || this.delayConnectedCallback()) {
        return;
      }
      this.image = document.createElement("img");
      this.image.classList.add("treecol-icon");

      this.appendChild(this.image);
      this._updateAttributes();
    }

    attributeChangedCallback() {
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

  /**
   * Class extending treecols. This features a customized treecolpicker that
   * features a menupopup with more items than the standard one.
   * @augments {MozTreecols}
   */
  class MozThreadPaneTreecols extends customElements.get("treecols") {
    connectedCallback() {
      if (this.delayConnectedCallback()) {
        return;
      }
      let treecolpicker = this.querySelector("treecolpicker:not([is]");

      // Can't change the super treecolpicker by setting
      // is="thread-pane-treecolpicker" since that needs to be there at the
      // parsing stage to take effect.
      // So, remove the existing treecolpicker, and add a new one.
      if (treecolpicker) {
        treecolpicker.remove();
      }
      if (!this.querySelector("treecolpicker[is=thread-pane-treecolpicker]")) {
        this.appendChild(
          MozXULElement.parseXULToFragment(
            `
            <treecolpicker is="thread-pane-treecolpicker"
                           class="thread-tree-col-picker"
                           tooltiptext="&columnChooser2.tooltip;"
                           fixed="true">
            </treecolpicker>
            `,
            ["chrome://messenger/locale/messenger.dtd"]
          )
        );
      }
      // Exceptionally apply super late, so we get the other goodness from there
      // now that the treecolpicker is corrected.
      super.connectedCallback();
    }
  }
  customElements.define("thread-pane-treecols", MozThreadPaneTreecols, {
    extends: "treecols",
  });

  /**
   * Class extending treecolpicker. This implements UI to apply column settings
   * of the current thread pane to other mail folders too.
   * @augments {MozTreecolPicker}
   */
  class MozThreadPaneTreeColpicker extends customElements.get("treecolpicker") {
    connectedCallback() {
      super.connectedCallback();
      if (this.delayConnectedCallback()) {
        return;
      }
      let popup = this.querySelector(`menupopup[anonid="popup"]`);

      // We'll add an "Apply columns to..." menu
      popup.appendChild(
        MozXULElement.parseXULToFragment(
          `
          <menu class="applyTo-menu" label="&columnPicker.applyTo.label;">
            <menupopup>
              <menu class="applyToFolder-menu"
                    label="&columnPicker.applyToFolder.label;">
                <menupopup is="folder-menupopup"
                           class="applyToFolder"
                           showFileHereLabel="true"
                           position="start_before"></menupopup>
              </menu>
              <menu class="applyToFolderAndChildren-menu"
                    label="&columnPicker.applyToFolderAndChildren.label;">
                <menupopup is="folder-menupopup"
                           class="applyToFolderAndChildren"
                           showFileHereLabel="true"
                           showAccountsFileHere="true"
                           position="start_before"></menupopup>
              </menu>
            </menupopup>
          </menu>
          `,
          ["chrome://messenger/locale/messenger.dtd"]
        )
      );

      let confirmApply = (destFolder, useChildren) => {
        // Confirm the action with the user.
        let bundle = document.getElementById("bundle_messenger");
        let title = useChildren
          ? "threadPane.columnPicker.confirmFolder.withChildren.title"
          : "threadPane.columnPicker.confirmFolder.noChildren.title";
        let message = useChildren
          ? "threadPane.columnPicker.confirmFolder.withChildren.message"
          : "threadPane.columnPicker.confirmFolder.noChildren.message";
        let confirmed = Services.prompt.confirm(
          null,
          bundle.getString(title),
          bundle.getFormattedString(message, [destFolder.prettyName])
        );
        if (confirmed) {
          this._applyColumns(destFolder, useChildren);
        }
      };

      let applyToFolderMenu = this.querySelector(".applyToFolder-menu");
      applyToFolderMenu.addEventListener("command", event => {
        confirmApply(event.target._folder, false);
      });

      let applyToFolderAndChildrenMenu = this.querySelector(
        ".applyToFolderAndChildren-menu"
      );
      applyToFolderAndChildrenMenu.addEventListener("command", event => {
        confirmApply(event.target._folder, true);
      });
    }

    _applyColumns(destFolder, useChildren) {
      // Get the current folder's column state, plus the "swapped" column
      // state, which swaps "From" and "Recipient" if only one is shown.
      // This is useful for copying an incoming folder's columns to an
      // outgoing folder, or vice versa.
      let colState = gFolderDisplay.getColumnStates();

      let myColStateString = JSON.stringify(colState);
      let swappedColStateString;
      if (colState.senderCol.visible != colState.recipientCol.visible) {
        let tmp = colState.senderCol;
        colState.senderCol = colState.recipientCol;
        colState.recipientCol = tmp;
        swappedColStateString = JSON.stringify(colState);
      } else {
        swappedColStateString = myColStateString;
      }

      let isOutgoing = function(folder) {
        return folder.isSpecialFolder(
          LazyModules.DBViewWrapper.prototype.OUTGOING_FOLDER_FLAGS,
          true
        );
      };

      let amIOutgoing = isOutgoing(gFolderDisplay.displayedFolder);

      let colStateString = function(folder) {
        return isOutgoing(folder) == amIOutgoing
          ? myColStateString
          : swappedColStateString;
      };

      // Now propagate appropriately...
      const propName = gFolderDisplay.PERSISTED_COLUMN_PROPERTY_NAME;
      if (useChildren) {
        // Generate an observer notification when we have finished
        // configuring all folders.  This is currently done for the benefit
        // of our tests.
        let observerCallback = function() {
          Services.obs.notifyObservers(
            gFolderDisplay.displayedFolder,
            "msg-folder-columns-propagated"
          );
        };
        LazyModules.MailUtils.setStringPropertyOnFolderAndDescendents(
          propName,
          colStateString,
          destFolder,
          observerCallback
        );
      } else {
        destFolder.setStringProperty(propName, colStateString(destFolder));
        // null out to avoid memory bloat
        destFolder.msgDatabase = null;
      }
    }
  }
  customElements.define(
    "thread-pane-treecolpicker",
    MozThreadPaneTreeColpicker,
    { extends: "treecolpicker" }
  );

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
     * @extends {MozMenuList}
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
          <label id="label" part="label" crop="right" flex="1" role="none"/>
          <label id="highlightable-label" part="label" crop="right" flex="1" role="none"/>
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
          this._description.setAttribute("crop", "right");
          this._description.setAttribute("flex", "10000");
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

        for (let prop of [
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
        let attrs = super.inheritedAttributes;
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
   * The MozMailMultiEmailheaderfield widget shows multiple emails. It collapses
   * long rows and allows toggling the full view open. This widget is typically
   * used in the message header pane to show addresses for To, Cc, Bcc, and any
   * other addressing type header that can contain more than one mailbox.
   *
   * extends {MozXULElement}
   */
  class MozMailMultiEmailheaderfield extends MozXULElement {
    constructor() {
      super();

      // This field is used to buffer the width of the comma node so that it
      // only has to be determined once during the lifetime of this widget.
      // Otherwise it would cause an expensive reflow every time.
      this.commaNodeWidth = 0;

      // The number of lines of addresses we will display before adding a (more)
      // indicator to the widget. This can be increased using the preference
      // mailnews.headers.show_n_lines_before_more.
      this.maxLinesBeforeMore = 1;

      // The maximum number of addresses in the more button tooltip text.
      this.tooltipLength = 20;

      this.addresses = [];
    }

    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }

      this.longEmailAddresses = document.createXULElement("hbox");
      this.longEmailAddresses.classList.add("headerValueBox");
      this.longEmailAddresses.setAttribute("flex", "1");
      this.longEmailAddresses.setAttribute("singleline", "true");
      this.longEmailAddresses.setAttribute("align", "baseline");

      this.emailAddresses = document.createXULElement("description");
      this.emailAddresses.classList.add("headerValue");
      this.emailAddresses.setAttribute("containsEmail", "true");
      this.emailAddresses.setAttribute("flex", "1");
      this.emailAddresses.setAttribute("orient", "vertical");
      this.emailAddresses.setAttribute("pack", "start");

      this.more = document.createXULElement("label");
      this.more.classList.add("moreIndicator");
      this.more.addEventListener("click", this.toggleWrap.bind(this));
      this.more.setAttribute("collapsed", "true");

      this.longEmailAddresses.appendChild(this.emailAddresses);
      this.appendChild(this.longEmailAddresses);
      this.appendChild(this.more);
    }

    set maxAddressesInMoreTooltipValue(val) {
      this.tooltipLength = val;
    }

    get maxAddressesInMoreTooltipValue() {
      return this.tooltipLength;
    }

    /**
     * Add an address to be shown in this widget.
     *
     * @param {Object} address                address to be added
     * @param {String} address.displayName    display name of the address
     * @param {String} address.emailAddress   email address of the address
     * @param {String} address.fullAddress    full address of the address
     */
    addAddressView(address) {
      this.addresses.push(address);
    }

    /**
     * Method used to reset addresses shown by this widget.
     */
    resetAddressView() {
      this.addresses.length = 0;
    }

    /**
     * Private method used to set properties on an address node.
     */
    _updateEmailAddressNode(emailNode, address) {
      emailNode.setAttribute(
        "label",
        address.fullAddress || address.displayName || ""
      );
      emailNode.removeAttribute("tooltiptext");
      emailNode.setAttribute("emailAddress", address.emailAddress || "");
      emailNode.setAttribute("fullAddress", address.fullAddress || "");
      emailNode.setAttribute("displayName", address.displayName || "");

      if ("UpdateEmailNodeDetails" in top && address.emailAddress) {
        UpdateEmailNodeDetails(address.emailAddress, emailNode);
      }
    }

    /**
     * Private method used to create email address nodes for either our short or
     * long view.
     *
     * @param {boolean} all - If false, show only a few addresses + "more".
     * @return {integer} The number of addresses we have put into the list.
     */
    _fillAddressesNode(all) {
      while (this.emailAddresses.lastChild) {
        this.emailAddresses.lastChild.remove();
      }

      // This ensures that the worst-case "n more" width is considered.
      this.setNMore(this.addresses.length);
      this.more.collapsed = false;
      let availableWidth =
        this.emailAddresses.clientWidth - this.more.clientWidth;

      // Add addresses until we're done, or we overflow the allowed lines.
      let addrCount = 0;
      for (let i = 0, line = 0, lineWidth = 0; i < this.addresses.length; i++) {
        if (i > 0) {
          this.appendComma();
          // Calculate comma node width only the first time.
          if (this.commaNodeWidth == 0) {
            this.commaNodeWidth = this.emailAddresses.lastElementChild.clientWidth;
          }
        }

        let newAddressNode = document.createXULElement("mail-emailaddress");
        // Stash the headerName somewhere that UpdateEmailNodeDetails will be
        // able to find it.
        newAddressNode.setAttribute("headerName", this.headerName);

        // Solve the accessibility problem by manually fetching the translated
        // string from the label and updating the attribute. Bug 1493608
        let ariaLabel = document.getElementById(
          this.getAttribute("aria-labelledby")
        );
        newAddressNode.setAttribute(
          "aria-label",
          `${ariaLabel.value}: ${this.addresses[i].fullAddress ||
            this.addresses[i].displayName ||
            ""}`
        );
        newAddressNode.removeAttribute("aria-labelledby");

        this._updateEmailAddressNode(newAddressNode, this.addresses[i]);
        newAddressNode = this.emailAddresses.appendChild(newAddressNode);
        addrCount++;

        if (all) {
          continue;
        }

        // Reading .clientWidth triggers an expensive reflow, so only do it
        // when necessary for possible early loop exit to display (X more).
        // Calculate width and lines, consider the i+1 comma node if we have to
        // <http://www.w3.org/TR/cssom-view/#client-attributes>
        // <https://developer.mozilla.org/en/Determining_the_dimensions_of_elements>
        let newLineWidth =
          i + 1 < this.addresses.length
            ? newAddressNode.clientWidth + this.commaNodeWidth
            : newAddressNode.clientWidth;
        lineWidth += newLineWidth;

        let overLineWidth = lineWidth - availableWidth;
        if (overLineWidth > 0 && i > 0) {
          line++;
          lineWidth = newLineWidth;
        }

        if (line >= this.maxLinesBeforeMore) {
          // Hide the last node spanning into the additional line (n>1)
          // also hide it if <50px left after sliding the address (n=1)
          // or if the last address would be truncated without "more"
          if (
            this.maxLinesBeforeMore > 1 ||
            (i + 1 == this.addresses.length && overLineWidth > 50) ||
            newLineWidth - overLineWidth < 50
          ) {
            this.emailAddresses.lastElementChild.remove(); // last addr
            this.emailAddresses.lastElementChild.remove(); // last comma
            addrCount--;
          }
          break;
        }
      }

      this.more.collapsed = all || addrCount == this.addresses.length;

      // If there are addresses we're not showing, set up the (N more) widget.
      if (!this.more.collapsed) {
        let remainingAddresses = this.addresses.length - addrCount;
        this.setNMore(remainingAddresses);
        this.setNMoreTooltiptext(this.addresses.slice(-remainingAddresses));
      }

      return addrCount; // number of addresses shown
    }

    /**
     * Public method to build the DOM nodes for display, to be called after all the addresses have
     * been added to the widget. It uses _fillAddressesNode to display at most maxLinesBeforeMore lines
     * of ddresses plus the (more) widget which can be clicked to reveal the rest. The "singleline"
     * attribute is set for one line only.
     */
    buildViews() {
      this.maxLinesBeforeMore = Services.prefs.getIntPref(
        "mailnews.headers.show_n_lines_before_more"
      );
      let headerchoice = Services.prefs.getIntPref("mail.show_headers");
      if (
        this.maxLinesBeforeMore < 1 ||
        headerchoice == Ci.nsMimeHeaderDisplayTypes.AllHeaders
      ) {
        this._fillAddressesNode(true);
        this.longEmailAddresses.removeAttribute("singleline");
      } else {
        this._fillAddressesNode(false);
        // force a single line only in the default n=1 case
        if (this.maxLinesBeforeMore > 1) {
          this.longEmailAddresses.removeAttribute("singleline");
        }
      }
    }

    /**
     * Append a comma after the (currently) final (email address, we hope!) node of
     * this.emailAddresses.
     */
    appendComma() {
      // Create and append a comma.
      let commaNode = document.createXULElement("label");
      commaNode.setAttribute("value", ",");
      commaNode.setAttribute("class", "emailSeparator");
      this.emailAddresses.appendChild(commaNode);
    }

    /**
     * Set up a (N more) widget which can be clicked to reveal the rest.
     * @param {integer} number - the number of addresses "more" will reveal
     */
    setNMore(number) {
      // Figure out the right plural for the language we're using
      let words = document
        .getElementById("bundle_messenger")
        .getString("headerMoreAddrs");
      let moreForm = PluralForm.get(number, words).replace("#1", number);

      // Set the "n more" text node.
      this.more.setAttribute("value", moreForm);
      // Remove the tooltip text of the more widget.
      this.more.removeAttribute("tooltiptext");
    }

    /**
     * Populate the tooltiptext of the (N more) widget with hidden email addresses.
     */
    setNMoreTooltiptext(addresses) {
      if (addresses.length == 0) {
        return;
      }

      let tttArray = [];
      for (let i = 0; i < addresses.length && i < this.tooltipLength; i++) {
        tttArray.push(addresses[i].fullAddress);
      }
      let ttText = tttArray.join(", ");

      let remainingAddresses = addresses.length - tttArray.length;
      // Not all missing addresses fit in the tooltip.
      if (remainingAddresses > 0) {
        // Figure out the right plural for the language we're using,
        let words = document
          .getElementById("bundle_messenger")
          .getString("headerMoreAddrsTooltip");
        let moreForm = PluralForm.get(remainingAddresses, words).replace(
          "#1",
          remainingAddresses
        );
        ttText += moreForm;
      }
      this.more.setAttribute("tooltiptext", ttText);
    }

    /**
     * Updates the nodes of this field with a call to UpdateExtraAddressProcessing. The parameters are
     * optional fields that can contain extra information to be passed to
     * UpdateExtraAddressProcessing, the implementation of that function should be checked to
     * determine what it requires
     */
    updateExtraAddressProcessing(param1, param2, param3) {
      customElements.upgrade(this);
      if (UpdateExtraAddressProcessing) {
        const children = this.emailAddresses.children;
        for (let i = 0; i < this.addresses.length; i++) {
          UpdateExtraAddressProcessing(
            this.addresses[i],
            children[i * 2],
            param1,
            param2,
            param3
          );
        }
      }
    }

    /**
     * Called when the (more) indicator has been clicked on; re-renders the
     * widget with all the addresses.
     */
    toggleWrap() {
      // Workaround the fact that XUL line-wrapping and "overflow: auto" don't interact properly
      // (bug 492645), without which we would be inadvertently occluding too much of the message
      // header text and forcing the user to scroll unnecessarily (bug 525225).
      //
      // Fake the "All Headers" mode, so that we get a scroll bar.
      // Will be reset when a new message loads.
      document
        .getElementById("expandedHeaderView")
        .setAttribute("show_header_mode", "all");

      // Causes different CSS selectors to be used, which allows all of the addresses to be properly
      // displayed and wrapped.
      this.longEmailAddresses.removeAttribute("singleline");

      // Re-render the node, this time with all the addresses.
      this._fillAddressesNode(true);
      document
        .getElementById("expandedHeaderView")
        .setAttribute(
          "height",
          document.getElementById("expandedHeadersTopBox").clientHeight +
            document.getElementById("expandedHeaders2").clientHeight
        );
      // This attribute will be reinit in the 'UpdateExpandedMessageHeaders()' method.
    }

    clearHeaderValues() {
      // Clear out our local state.
      this.addresses = [];
      this.longEmailAddresses.setAttribute("singleline", "true");
      while (this.emailAddresses.lastChild) {
        this.emailAddresses.lastChild.remove();
      }
    }
  }
  customElements.define(
    "mail-multi-emailheaderfield",
    MozMailMultiEmailheaderfield
  );

  /**
   * The MozAttachmentlist widget lists attachments for a mail. This is typically used to show
   * attachments while writing a new mail as well as when reading mails.
   * It has two layouts, which you can set by orient="horizontal" and orient="vertical" respectively.
   *
   * @extends {MozElements.RichListBox}
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
              let evt = document.createEvent("XULCommandEvent");
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

      this.addEventListener("click", event => {
        if (
          event.button != 0 ||
          event.target.classList.contains("attachmentItem")
        ) {
          return;
        }

        if (
          this.selType != "multiple" ||
          (!event.ctrlKey && !event.shiftKey && !event.metaKey)
        ) {
          this.clearSelection();
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

      if (this.getAttribute("orient") === "horizontal") {
        this.addEventListener("keypress", event => {
          switch (event.keyCode) {
            case KeyEvent.DOM_VK_LEFT:
              this.moveByOffset(-1, !event.ctrlKey, event.shiftKey);
              event.preventDefault();
              break;

            case KeyEvent.DOM_VK_RIGHT:
              this.moveByOffset(1, !event.ctrlKey, event.shiftKey);
              event.preventDefault();
              break;

            case KeyEvent.DOM_VK_DOWN:
              this.moveByOffset(
                this._itemsPerRow(),
                !event.ctrlKey,
                event.shiftKey
              );
              event.preventDefault();
              break;

            case KeyEvent.DOM_VK_UP:
              this.moveByOffset(
                -this._itemsPerRow(),
                !event.ctrlKey,
                event.shiftKey
              );
              event.preventDefault();
              break;

            default:
              break;
          }
        });
      }
    }

    connectedCallback() {
      super.connectedCallback();
      if (this.delayConnectedCallback()) {
        return;
      }

      let children = Array.from(this._childNodes);

      children
        .filter(child => child.getAttribute("selected") == "true")
        .forEach(this.selectedItems.append, this.selectedItems);

      children
        .filter(child => !child.hasAttribute("context"))
        .forEach(child =>
          child.setAttribute("context", this.getAttribute("itemcontext"))
        );
    }

    set view(val) {
      this.setAttribute("view", val);
    }

    get view() {
      return this.getAttribute("view");
    }

    set orient(val) {
      // The current item can get messed up when changing orientation.
      let curr = this.currentItem;
      this.currentItem = null;

      this.setAttribute("orient", val);
      this.currentItem = curr;
    }

    get orient() {
      return this.getAttribute("orient");
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
      let box = this;
      let estimatedRow = Math.floor(
        box.scrollTop / this._childNodes[0].getBoundingClientRect().height
      );
      let estimatedIndex = estimatedRow * this._itemsPerRow();
      let offset = this._childNodes[estimatedIndex].screenY - box.screenY;

      if (offset > 0) {
        // We went too far! Go back until we find an item totally off-screen, then return the one
        // after that.
        for (let i = estimatedIndex - 1; i >= 0; i--) {
          let childBoxObj = this._childNodes[i].getBoundingClientRect();
          if (childBoxObj.screenY + childBoxObj.height <= box.screenY) {
            return i + 1;
          }
        }

        // If we get here, we must have gone back to the beginning of the list, so just return 0.
        return 0;
      }

      // We didn't go far enough! Keep going until we find an item at least partially on-screen.
      for (let i = estimatedIndex; i < this._childNodes.length; i++) {
        let childBoxObj = this._childNodes[i].getBoundingClientRect();
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
      let box = this;

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
      let box = this;
      let item = this.getItemAtIndex(index);
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
      let item = this.ownerDocument.createXULElement("richlistitem");
      item.classList.add("attachmentItem");
      item.setAttribute("role", "option");

      let itemContainer = this.ownerDocument.createXULElement("hbox");
      itemContainer.setAttribute("flex", "1");
      itemContainer.classList.add("attachmentcell-content");

      item.addEventListener("dblclick", event => {
        let evt = document.createEvent("XULCommandEvent");
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
        event.target.dispatchEvent(evt);
      });

      let iconContainer = this.ownerDocument.createXULElement("hbox");
      iconContainer.setAttribute("align", "center");
      let icon = this.ownerDocument.createElement("img");
      icon.setAttribute("alt", "");
      icon.classList.add("attachmentcell-icon");
      // Hide if invalid.
      icon.addEventListener("error", () => icon.classList.add("invalid-src"));
      iconContainer.appendChild(icon);

      let textContainer = this.ownerDocument.createXULElement("hbox");
      textContainer.setAttribute("flex", "1");
      textContainer.classList.add("attachmentcell-text");
      let textName = this.ownerDocument.createXULElement("hbox");
      textName.setAttribute("flex", "1");
      textName.classList.add("attachmentcell-nameselection");
      let textLabel = this.ownerDocument.createXULElement("label");
      textLabel.setAttribute("flex", "1");
      textLabel.setAttribute("crop", "center");
      textLabel.classList.add("attachmentcell-name");
      textName.appendChild(textLabel);

      let spacer = this.ownerDocument.createXULElement("spacer");
      spacer.setAttribute("flex", "99999");

      let sizeLabel = this.ownerDocument.createXULElement("label");
      sizeLabel.classList.add("attachmentcell-size");

      textContainer.appendChild(textName);
      textContainer.appendChild(spacer);
      textContainer.appendChild(sizeLabel);

      let dropIndicatorBefore = document.createElement("img");
      dropIndicatorBefore.setAttribute(
        "src",
        "chrome://messenger/skin/icons/tab-drag-indicator.svg"
      );
      dropIndicatorBefore.classList.add("attach-drop-indicator", "before");
      let dropIndicatorAfter = document.createElement("img");
      dropIndicatorAfter.setAttribute(
        "src",
        "chrome://messenger/skin/icons/tab-drag-indicator.svg"
      );
      dropIndicatorAfter.classList.add("attach-drop-indicator", "after");

      itemContainer.appendChild(dropIndicatorBefore);
      itemContainer.appendChild(iconContainer);
      itemContainer.appendChild(textContainer);
      itemContainer.appendChild(dropIndicatorAfter);
      item.appendChild(itemContainer);

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
      let icon = item.querySelector(".attachmentcell-icon");
      if (!src) {
        icon.classList.add("invalid-src");
        icon.removeAttribute("src");
        return;
      }
      icon.classList.remove("invalid-src");
      // NOTE: Setting the same value for "src" should still trigger the
      // reloading of the image, and re-add the invalid-src class if the same
      // error occurs.
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
      let attachment = item.attachment;
      let type = attachment.contentType;
      if (type == "text/x-moz-deleted") {
        src = "chrome://messenger/skin/icons/attachment-deleted.svg";
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
          let url = Services.io.newURI(attachment.url);
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
      for (let item of this.querySelectorAll(".attachmentItem")) {
        if (!item.loaded) {
          return false;
        }
      }
      return true;
    }

    /**
     * Set the attachment's loaded state.
     *
     * @param {MozRichlistitem} item - The attachment item.
     * @param {boolean} loaded - Whether the attachment is fully loaded.
     * @param {string} [cloudIcon] - The icon for the cloud provider where the
     *   attachment was loaded, if any.
     */
    setAttachmentLoaded(item, loaded, cloudIcon) {
      item.loaded = loaded;
      if (loaded) {
        if (cloudIcon !== undefined) {
          this.setAttachmentIconSrc(item, cloudIcon);
        } else {
          this.refreshAttachmentIcon(item);
        }
      } else {
        this.setAttachmentIconSrc(
          item,
          "chrome://global/skin/icons/loading.png"
        );
      }
    }

    invalidateItem(item, name) {
      let attachment = item.attachment;
      item.setAttribute("name", name || attachment.name);
      item
        .querySelector(".attachmentcell-name")
        .setAttribute("value", name || attachment.name);

      let size;
      if (attachment.size != null && attachment.size != -1) {
        size = this.messenger.formatFileSize(attachment.size);
      } else {
        // Use a zero-width space so the size label has the right height.
        size = "\u200b";
      }
      item.setAttribute("size", size);
      item.querySelector(".attachmentcell-size").setAttribute("value", size);

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
        let item = this.getItemAtIndex(i);
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
      if (this.getAttribute("orient") === "vertical") {
        // Vertical attachment lists have one item per row by definition.
        return 1;
      }

      // For 0 or 1 children, we can assume that they all fit in one row.
      if (this._childNodes.length < 2) {
        return this._childNodes.length;
      }

      let itemWidth =
        this._childNodes[1].getBoundingClientRect().x -
        this._childNodes[0].getBoundingClientRect().x;

      // Each item takes up a full row
      if (itemWidth == 0) {
        return 1;
      }
      return Math.floor(this.clientWidth / itemWidth);
    }

    _itemsPerCol(aItemsPerRow) {
      let itemsPerRow = aItemsPerRow || this._itemsPerRow();

      if (this._childNodes.length == 0) {
        return 0;
      }

      if (this._childNodes.length <= itemsPerRow) {
        return 1;
      }

      let itemHeight =
        this._childNodes[itemsPerRow].getBoundingClientRect().y -
        this._childNodes[0].getBoundingClientRect().y;

      return Math.floor(this.clientHeight / itemHeight);
    }

    /**
     * Only used by attachmentlist with horizontal orient.
     */
    setOptimumWidth() {
      if (this._childNodes.length == 0) {
        return;
      }

      let width = 0;

      // If widths have changed after the initial calculation (updated
      // size string), clear each item's prior hardcoded width so
      // getBoundingClientRect is natural, then get the width for
      // the widest item and set it on all the items again.
      // Use Math.ceil to always round to the next higher integer.
      for (let child of this._childNodes) {
        child.width = "";
        width = Math.max(width, Math.ceil(child.getBoundingClientRect().width));
      }
      for (let child of this._childNodes) {
        child.width = width;
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
   * @extends {MozXULElement}
   */
  class MailAddressPill extends MozXULElement {
    static get inheritedAttributes() {
      return {
        ".pill-label": "crop,value=label",
      };
    }

    /**
     * Indicates whether the address of this pill is for a mail list.
     * @type {boolean}
     */
    isMailList = false;

    /**
     * If this pill is for a mail list, this provides the URI.
     * @type {?string}
     */
    listURI = null;

    /**
     * If this pill is for a mail list, this provides the total count of
     * its addreses.
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
        `input[is="autocomplete-input"][recipienttype]`
      );
    }

    /**
     * Check if the pill is currently in "Edit Mode", meaning the label is
     * hidden and the html:input field is visible.
     *
     * @return {boolean} true if the pill is currently being edited.
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
      this.emailInput.addEventListener("keypress", event => {
        if (this.hasAttribute("disabled")) {
          return;
        }
        this.finishEditing(event);
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
     * @param {String} address - An email address.
     */
    isValidAddress(address) {
      return address.includes("@", 1) && !address.endsWith("@");
    }

    /**
     * Convert the pill into "Edit Mode" by hiding the label and showing the
     * html:input element.
     */
    startEditing() {
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
      let inputWidth = this.emailInput.clientWidth + 15;

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
    finishEditing(event = null) {
      let key = event ? event.key : "Escape";

      switch (key) {
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
      let addresses = MailServices.headerParser.makeFromDisplayAddress(
        this.emailInput.value
      );
      let row = this.closest(".address-row");

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
      let pills = row.querySelectorAll("mail-address-pill");
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
      this.rowInput.focus();
    }

    /**
     * Check if an address is valid or it exists in the address book and update
     * the helper icons accordingly.
     */
    async updatePillStatus() {
      let isValid = this.isValidAddress(this.emailAddress);
      let listNames = LazyModules.MimeParser.parseHeaderField(
        this.fullAddress,
        LazyModules.MimeParser.HEADER_ADDRESS
      );

      if (listNames.length > 0) {
        let mailList = MailServices.ab.getMailListFromName(listNames[0].name);
        this.isMailList = !!mailList;
        if (this.isMailList) {
          this.listURI = mailList.URI;
          this.listAddressCount = mailList.childCards.length;
        } else {
          this.listURI = "";
          this.listAddressCount = 0;
        }
      }

      let isNewsgroup = this.emailInput.classList.contains("news-input");

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
      // mail list.
      if (
        !this.isMailList &&
        !LazyModules.DisplayNameUtils.getCardForEmail(this.emailAddress)?.card
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
     * @return {HTMLElement} - The nearest unselected sibling element, or null.
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
   * @extends {MozXULElement}
   */
  class MailRecipientsArea extends MozXULElement {
    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      for (let input of this.querySelectorAll(".mail-input,.news-input")) {
        // Disable inbuilt autocomplete on blur to handle it with our handlers.
        input._dontBlur = true;

        setupAutocompleteInput(input);

        input.addEventListener("keypress", event => {
          if (event.key != "Tab" || !event.shiftKey) {
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
      // pressed on the extraRecipientsLabel label.
      document
        .getElementById("extraRecipientsLabel")
        .addEventListener("keypress", event => {
          if (event.key == "Tab" && !event.shiftKey) {
            event.preventDefault();
            let row = this.querySelector(".address-row:not(.hidden)");
            // If the close label is collapsed, focus on the input field.
            if (row.querySelector(".remove-field-button").hidden) {
              row
                .querySelector(`input[is="autocomplete-input"][recipienttype]`)
                .focus();
              return;
            }
            // Focus on the close label.
            row.querySelector(".remove-field-button").focus();
          }
        });

      this.addEventListener("dragstart", event => {
        // Check if we're dragging a pill, as the drag target might be another
        // element like row or pill <input> when dragging selected plain text.
        let targetPill = event.target.closest(
          "mail-address-pill:not(.editing)"
        );
        if (!targetPill) {
          return;
        }
        if (!targetPill.hasAttribute("selected")) {
          // If the drag action starts from a non-selected pill,
          // deselect all selected pills and select only the target pill.
          for (let pill of this.getAllSelectedPills()) {
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

      this.addEventListener("dragexit", event => {
        if (!event.dataTransfer.getData("text/pills")) {
          return;
        }
        // If dragexit from pill, remove its drop indicator style.
        event.target
          .closest("mail-address-pill")
          ?.classList.remove("drop-indicator");

        // If dragexit from address row, remove the indicator style of its
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
        let targetAddressRow = event.target.closest(".address-row");
        // Return if pills have been dropped outside an address row (edge cases).
        if (!targetAddressRow) {
          return;
        }

        // Pills have been dropped somewhere inside an address row.
        // If they have been dropped directly on an address container, use that.
        // Otherwise ensure having an addressContainer for drop targets inside
        // the row, but outside the address container (e.g. the row label).
        let targetAddressContainer = event.target.closest(".address-container");
        let addressContainer =
          targetAddressContainer ||
          targetAddressRow.querySelector(".address-container");

        // Recreate pills in the target address container.
        // If dropped on a pill, append pills before that pill. Otherwise if
        // dropped into an address container, append pills after existing pills.
        // Otherwise if dropped elsewhere on the row (e.g. on the row label),
        // append pills before existing pills.
        let targetPill = event.target.closest("mail-address-pill");
        this.createDNDPills(
          addressContainer,
          targetPill || !targetAddressContainer,
          targetPill ? targetPill.fullAddress : null
        );
        addressContainer.classList.remove("drag-address-container");
      });

      // We want to deselect pills when focus moves away from them. To simplify
      // things, we listen to focusout event which bubbles from any element of
      // the entire mail-recipients-area, including all pills.
      this.addEventListener("focusout", event => {
        // Return if focusout did not occur on a pill (nothing to deselect),
        // if the element receiving focus is a pill (allow preserving selection),
        // or if event.target remains the active element, i.e. focus was
        // moved to another window (do nothing, preserve selection if any).
        if (
          event.target.tagName != "mail-address-pill" ||
          event?.relatedTarget?.tagName == "mail-address-pill" ||
          event.target == document.activeElement
        ) {
          return;
        }

        // If focus moves out from pills, deselect all of them. Luckily,
        // pill context menu does not trigger focusout on addressing area.
        this.deselectAllPills();
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
      let existingPills = addressContainer.querySelectorAll(
        "mail-address-pill"
      );
      let existingAddresses = [...existingPills].map(pill => pill.fullAddress);
      let selectedAddresses = [...this.getAllSelectedPills()].map(
        pill => pill.fullAddress
      );
      let originalTargetIndex = existingAddresses.indexOf(targetAddress);

      // Remove all the duplicate existing addresses.
      for (let address of selectedAddresses) {
        let index = existingAddresses.indexOf(address);
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
      for (let pill of this.getAllSelectedPills()) {
        pill.remove();
      }

      // Existing pills are removed before creating new ones in the right order.
      for (let pill of existingPills) {
        pill.remove();
      }

      // Create pills for all the combined addresses.
      let recipientType = addressContainer
        .querySelector(".address-input[recipienttype]")
        .getAttribute("recipienttype");
      for (let address of combinedAddresses) {
        awAddRecipientsArray(
          recipientType,
          [address],
          selectedAddresses.includes(address)
        );
      }

      // Move the focus to the first selected pill.
      this.getAllSelectedPills()[0].focus();
    }

    /**
     * Create a new recipient row container with a row input.
     *
     * @param {Object} recipient - An object for various element attributes.
     * @param {boolean} rawInput - A flag to disable pills and autocompletion.
     * @return {Element} - The newly created recipient row.
     */
    buildRecipientRow(recipient, rawInput = false) {
      let row = document.createXULElement("hbox");
      row.setAttribute("id", recipient.row);
      row.classList.add("addressingWidgetItem", "address-row");
      row.setAttribute("data-labelid", recipient.labelId);
      row.setAttribute("data-labeltype", recipient.type);

      let firstCol = document.createXULElement("hbox");
      firstCol.classList.add("aw-firstColBox");

      row.classList.add("hidden");

      let closeButton = document.createElement("button");
      closeButton.classList.add("remove-field-button", "icon-button");
      document.l10n.setAttributes(closeButton, "remove-address-row-button", {
        type: recipient.labelId,
      });
      let closeIcon = document.createElement("img");
      closeIcon.setAttribute("src", "chrome://global/skin/icons/close.svg");
      // Button's title is the accessible name.
      closeIcon.setAttribute("alt", "");
      closeButton.appendChild(closeIcon);

      closeButton.addEventListener("click", event => {
        closeLabelOnClick(event);
      });
      firstCol.appendChild(closeButton);
      row.appendChild(firstCol);

      let labelContainer = document.createXULElement("hbox");
      labelContainer.setAttribute("align", "top");
      labelContainer.setAttribute("pack", "end");
      labelContainer.setAttribute("flex", 1);
      labelContainer.classList.add("address-label-container");
      labelContainer.setAttribute(
        "style",
        getComposeBundle().getString("headersSpaceStyle")
      );

      let label = document.createXULElement("label");
      label.setAttribute("id", recipient.label);
      label.setAttribute("value", recipient.labelId);
      label.setAttribute("control", recipient.id);
      label.setAttribute("flex", 1);
      label.setAttribute("crop", "end");
      labelContainer.appendChild(label);
      row.appendChild(labelContainer);

      let inputContainer = document.createXULElement("hbox");
      inputContainer.setAttribute("id", recipient.container);
      inputContainer.setAttribute("flex", 1);
      inputContainer.setAttribute("align", "center");
      inputContainer.classList.add(
        "input-container",
        "wrap-container",
        "address-container"
      );
      inputContainer.addEventListener("click", focusAddressInput);

      // Set up the row input for the row.
      let input = document.createElement(
        "input",
        rawInput
          ? undefined
          : {
              is: "autocomplete-input",
            }
      );
      input.setAttribute("id", recipient.id);
      input.setAttribute("recipienttype", recipient.type);
      input.setAttribute("size", 1);
      input.setAttribute("type", "text");
      input.setAttribute("disableonsend", true);
      input.classList.add("plain", "address-input");
      if (recipient.class) {
        input.classList.add(recipient.class);
      }

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

        setupAutocompleteInput(input);

        // Handle keydown event in autocomplete address input of row with pills.
        // input.onBeforeHandleKeyDown() gets called by the toolkit autocomplete
        // before going into autocompletion.
        input.onBeforeHandleKeyDown = event => {
          addressInputOnBeforeHandleKeyDown(event);
        };
      } else {
        // Handle keydown event in other header input (rawInput), which does not
        // have autocomplete and its associated keydown handling.
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

      return row;
    }

    /**
     * Create a new recipient pill.
     *
     * @param {HTMLElement} element - The original autocomplete input that
     *   generated the pill.
     * @param {Array} address - The array containing the recipient's info.
     * @return {Element} The newly created pill.
     */
    createRecipientPill(element, address) {
      let pill = document.createXULElement("mail-address-pill");

      pill.label = address.toString();
      pill.emailAddress = address.email || "";
      pill.fullAddress = address.toString();
      pill.displayName = address.name || "";
      pill.setAttribute("recipienttype", element.getAttribute("recipienttype"));

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
            this.clearSelected();
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

      pill.addEventListener("contextmenu", event => {
        if (pill.hasAttribute("disabled")) {
          event.preventDefault();
          return;
        }
        // Update the context menu options only if opened via the context menu
        // keyboard button.
        if (event.buttons == 0) {
          emailAddressPillOnPopupShown();
        }
      });

      element.closest(".address-container").insertBefore(pill, element);

      // The emailInput attribute is accessible only after the pill has been
      // appended to the DOM.
      let classes = element.getAttribute("class").split(" ");
      var fixedClassed = classes.filter(value => {
        return value != "mail-primary-input" && value != "news-primary-input";
      });
      for (let css of fixedClassed) {
        pill.emailInput.classList.add(css);
      }
      pill.emailInput.setAttribute(
        "aria-labelledby",
        element.getAttribute("aria-labelledby")
      );
      element.removeAttribute("aria-labelledby");

      let params = JSON.parse(
        pill.emailInput.getAttribute("autocompletesearchparam")
      );
      params.type = element.getAttribute("recipienttype");
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
        case ",":
          // Behaviour consistent with row input:
          // If keydown would normally replace all of the current trimmed input,
          // including if the current input is empty, then suppress the key and
          // clear the input instead.
          let input = pill.emailInput;
          let selection = input.value.substring(
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
        case "Backspace":
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
          let focusType = event.key == "Delete" ? "next" : "previous";
          this.removeSelectedPills(focusType, true);
          break;

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

        case "Home":
          let firstPill = pill
            .closest(".address-container")
            .querySelector("mail-address-pill");
          if (!event.ctrlKey) {
            // Unmodified navigation: select only first pill and focus it below.
            // ### Todo: We can't handle Shift+Home yet, so it ends up here.
            this.clearSelected();
            firstPill.setAttribute("selected", "selected");
          }
          firstPill.focus();
          break;

        case "End":
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

        case "Tab":
          event.preventDefault();
          for (let item of this.getSiblingPills(pill)) {
            item.removeAttribute("selected");
          }
          if (event.shiftKey && !event.ctrlKey) {
            this.moveFocusToPreviousElement(pill);
            return;
          }
          pill.rowInput.focus();
          break;

        case "a":
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

        case "c":
          if (event.ctrlKey || event.metaKey) {
            this.copySelectedPills();
          }
          break;

        case "x":
          if (event.ctrlKey || event.metaKey) {
            this.cutSelectedPills();
          }
          break;
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
      if (pill.isEditing) {
        return;
      }

      if (pill.hasAttribute("selected") && event.button == 2) {
        emailAddressPillOnPopupShown();
        return;
      }

      if (!event.ctrlKey && !event.metaKey && event.key != " ") {
        this.clearSelected();
      }

      pill.toggleAttribute("selected");

      // We need to force the focus on a pill that receives a click event
      // (or a spacebar keypress), as macOS doesn't automatically move the focus
      // on this custom element (bug 1645643, bug 1645916).
      pill.focus();

      // Update the options in the context menu only after the pills were
      // selected and if the event was a right click.
      if (event.button == 2) {
        emailAddressPillOnPopupShown();
      }
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
      let sourcePill =
        event.target.tagName == "mail-address-pill" ? event.target : null;
      let targetPill =
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
        this.clearSelected();
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

    clearSelected() {
      for (let pill of this.getAllPills()) {
        pill.removeAttribute("selected");
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
      let selectedAddresses = [
        ...document.getElementById("recipientsContainer").getAllSelectedPills(),
      ].map(pill => pill.fullAddress);

      let clipboard = Cc["@mozilla.org/widget/clipboardhelper;1"].getService(
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
     * @param {string} targetFieldType - The target recipient type,
     *   e.g. "addr_to".
     */
    moveSelectedPills(targetFieldType) {
      // Store all the selected addresses inside an array.
      let selectedAddresses = [...this.getAllSelectedPills()].map(
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
      awAddRecipientsArray(targetFieldType, selectedAddresses, true);

      // Move focus to the last selected pill.
      let selectedPills = this.getAllSelectedPills();
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
      let firstSelectedPill = this.querySelector("mail-address-pill[selected]");
      if (!firstSelectedPill) {
        return;
      }
      // Get the pill which has focus before we start removing selected pills,
      // which may or may not include the focused pill. If no pill has focus,
      // consider the first selected pill as focused pill for our purposes.
      let pill =
        this.querySelector("mail-address-pill:focus") || firstSelectedPill;

      // We'll look hard for an appropriate element to focus after the removal.
      let focusElement = null;
      // Get addressContainer and rowInput now as pill might be deleted later.
      let addressContainer = pill.closest(".address-container");
      let rowInput = pill.rowInput;
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
      let selectedPills = this.getAllSelectedPills();
      for (let sPill of selectedPills) {
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
        calculateHeaderHeight();
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
      for (let sPill of this.getSiblingPills(pill)) {
        sPill.setAttribute("selected", "selected");
      }
    }

    /**
     * Select all pills of the <mail-recipients-area> element.
     */
    selectAllPills() {
      for (let pill of this.getAllPills()) {
        pill.setAttribute("selected", "selected");
      }
    }

    /**
     * Deselect all the pills of the <mail-recipients-area> element.
     */
    deselectAllPills() {
      for (let pill of this.querySelectorAll(`mail-address-pill[selected]`)) {
        pill.removeAttribute("selected");
      }
    }

    /**
     * Return all pills of the same address row (.address-container).
     *
     * @param {Element} pill - A <mail-address-pill> element. All pills in the
     *   same .address-container will be returned.
     * @return {NodeList} NodeList of <mail-address-pill> elements in same field.
     */
    getSiblingPills(pill) {
      return pill
        .closest(".address-container")
        .querySelectorAll("mail-address-pill");
    }

    /**
     * Return all pills of the <mail-recipients-area> element.
     *
     * @return {NodeList} NodeList of all <mail-address-pill> elements.
     */
    getAllPills() {
      return this.querySelectorAll("mail-address-pill");
    }

    /**
     * Return all currently selected pills in the <mail-recipients-area>.
     *
     * @return {NodeList} NodeList of all selected <mail-address-pill> elements.
     */
    getAllSelectedPills() {
      return this.querySelectorAll("mail-address-pill[selected]");
    }

    /**
     * Check if any pill in the <mail-recipients-area> is selected.
     *
     * @return {boolean} true if any pill is selected.
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
      let row = element.closest(".address-row");
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
          previousRow
            .querySelector(`input[is="autocomplete-input"][recipienttype]`)
            .focus();
          return;
        }
        previousRow = previousRow.previousElementSibling;
      }
      // Move the focus on the extra recipients label if not collapsed
      if (!document.querySelector(".extra-recipients-label").collapsed) {
        document.querySelector(".extra-recipients-label").focus();
        return;
      }
      // Move the focus on the msgIdentity if no extra recipients are available.
      let labels = document
        .querySelector(".address-extra-recipients")
        .querySelectorAll(`label:not([collapsed="true"])`);
      if (labels.length == 0) {
        document.getElementById("msgIdentity").focus();
        return;
      }
      // Select the last available label.
      labels[labels.length - 1].focus();
    }
  }

  customElements.define("mail-recipients-area", MailRecipientsArea);
}
