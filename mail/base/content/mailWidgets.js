/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global MozElements */
/* global MozXULElement */
/* global openUILink */
/* global MessageIdClick */
/* global onClickEmailStar */
/* global onClickEmailPresence */
/* global gFolderDisplay */
/* global UpdateEmailNodeDetails */
/* global PluralForm */
/* global UpdateExtraAddressProcessing */

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
var {MailUtils} = ChromeUtils.import("resource:///modules/MailUtils.jsm");
var {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");
var {DBViewWrapper} = ChromeUtils.import("resource:///modules/DBViewWrapper.jsm");
var {TagUtils} = ChromeUtils.import("resource:///modules/TagUtils.jsm");

class MozMailHeaderfield extends MozXULElement {
  connectedCallback() {
    this.setAttribute("context", "copyPopup");
    this.classList.add("headerValue");
  }

  set headerValue(val) {
    return (this.textContent = val);
  }
}
customElements.define("mail-headerfield", MozMailHeaderfield);

class MozMailUrlfield extends MozMailHeaderfield {
  constructor() {
    super();
    this.addEventListener("click", (event) => {
      if (event.button != 2) {
        openUILink(encodeURI(event.target.textContent), event);
      }
    });
  }

  connectedCallback() {
    super.connectedCallback();
    this.setAttribute("context", "copyUrlPopup");
    this.classList.add("text-link", "headerValueUrl");
  }
}
customElements.define("mail-urlfield", MozMailUrlfield);

class MozMailHeaderfieldTags extends MozXULElement {
  connectedCallback() {
    this.classList.add("headerValue");
  }

  set headerValue(val) {
    return this.buildTags(val);
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
      if (!TagUtils.isColorContrastEnough(color)) {
        textColor = "white";
      }

      // now create a label for the tag name, and set the color
      const label = document.createXULElement("label");
      label.setAttribute("value", tagName);
      label.className = "tagvalue";
      label.setAttribute("style", "color: " + textColor + "; background-color: " + color + ";");

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
        const textNode = document.createXULElement("text");
        textNode.setAttribute("value", ",");
        textNode.setAttribute("class", "newsgroupSeparator");
        this.appendChild(textNode);
      }

      newNode.textContent = this.mNewsgroups[i];
      newNode.setAttribute("newsgroup", this.mNewsgroups[i]);
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
customElements.define("mail-newsgroups-headerfield", MozMailNewsgroupsHeaderfield);

class MozMailMessageid extends MozXULElement {
  static get observedAttributes() {
    return ["label"];
  }

  constructor() {
    super();
    this.addEventListener("click", (event) => {
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

    return val;
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

    this.toggleIcon = document.createXULElement("image");
    this.toggleIcon.classList.add("emailToggleHeaderfield");
    this.toggleIcon.addEventListener("click", () => {
      this._toggleWrap();
    });
    this.appendChild(this.toggleIcon);

    this.headerValue = document.createXULElement("hbox");
    this.headerValue.classList.add("headerValue");
    this.headerValue.setAttribute("flex", "1");
    this.appendChild(this.headerValue);
  }

  _toggleWrap() {
    for (let i = 0; i < this.headerValue.childNodes.length; i += 2) {
      if (!this.showFullMessageIds) {
        this.toggleIcon.classList.add("open");
        this.headerValue.childNodes[i].setAttribute("label", this.mMessageIds[i / 2]);
        this.headerValue.childNodes[i].removeAttribute("tooltiptext");
        this.headerValue.removeAttribute("singleline");
      } else {
        this.toggleIcon.classList.remove("open");
        this.headerValue.childNodes[i].setAttribute("label", i / 2 + 1);
        this.headerValue.childNodes[i].setAttribute("tooltiptext", this.mMessageIds[i / 2]);
      }
    }

    this.showFullMessageIds = !this.showFullMessageIds;
  }

  fillMessageIdNodes() {
    while (this.headerValue.childNodes.length > this.mMessageIds.length * 2 - 1) {
      this.headerValue.lastChild.remove();
    }

    this.toggleIcon.hidden = this.mMessageIds.length <= 1;

    for (let i = 0; i < this.mMessageIds.length; i++) {
      if (i * 2 <= this.headerValue.childNodes.length - 1) {
        this._updateMessageIdNode(this.headerValue.childNodes[i * 2], i + 1,
          this.mMessageIds[i], this.mMessageIds.length);
      } else {
        let newMessageIdNode = document.createXULElement("mail-messageid");

        if (i > 0) {
          let textNode = document.createXULElement("text");
          textNode.setAttribute("value", ", ");
          textNode.setAttribute("class", "messageIdSeparator");
          this.headerValue.appendChild(textNode);
        }
        let itemInDocument = this.headerValue.appendChild(newMessageIdNode);
        this._updateMessageIdNode(itemInDocument, i + 1,
          this.mMessageIds[i], this.mMessageIds.length);
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
customElements.define("mail-messageids-headerfield", MozMailMessageidsHeaderfield);

class MozMailEmailaddress extends MozXULElement {
  static get observedAttributes() {
    return [
      "hascard",
      "label",
      "crop",
      "tooltipstar",
      "chatStatus",
      "presenceTooltip",
    ];
  }

  connectedCallback() {
    if (this.hasChildNodes() || this.delayConnectedCallback()) {
      return;
    }
    this.classList.add("emailDisplayButton");
    this.setAttribute("context", "emailAddressPopup");
    this.setAttribute("popup", "emailAddressPopup");

    const label = document.createXULElement("label");
    label.classList.add("emaillabel");

    const emailStarImage = document.createXULElement("image");
    emailStarImage.classList.add("emailStar");
    emailStarImage.setAttribute("context", "emailAddressPopup");

    const emailPresenceImage = document.createXULElement("image");
    emailPresenceImage.classList.add("emailPresence");

    this.appendChild(label);
    this.appendChild(emailStarImage);
    this.appendChild(emailPresenceImage);

    this._update();
    this._setupEventListeners();
  }

  attributeChangedCallback() {
    if (!this.isConnectedAndReady) {
      return;
    }
    this._update();
  }

  _update() {
    const emailLabel = this.querySelector(".emaillabel");
    const emailStarImage = this.querySelector(".emailStar");
    const emailPresenceImage = this.querySelector(".emailPresence");

    this._updateNodeAttributes(emailLabel, "crop");
    this._updateNodeAttributes(emailLabel, "value", "label");

    this._updateNodeAttributes(emailStarImage, "hascard");
    this._updateNodeAttributes(emailStarImage, "chatStatus");
    this._updateNodeAttributes(emailStarImage, "tooltiptext", "tooltipstar");

    this._updateNodeAttributes(emailPresenceImage, "chatStatus");
    this._updateNodeAttributes(
      emailPresenceImage, "tooltiptext", "presenceTooltip"
    );
  }

  _updateNodeAttributes(attrNode, attr, mappedAttr) {
    mappedAttr = mappedAttr || attr;

    if (this.hasAttribute(mappedAttr) && (this.getAttribute(mappedAttr) != null)) {
      attrNode.setAttribute(attr, this.getAttribute(mappedAttr));
    } else {
      attrNode.removeAttribute(attr);
    }
  }

  _setupEventListeners() {
    const emailStarImage = this.querySelector(".emailStar");
    const emailPresenceImage = this.querySelector(".emailPresence");

    emailStarImage.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });

    emailStarImage.addEventListener("click", (event) => {
      onClickEmailStar(event, this);
    });

    emailPresenceImage.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });

    emailPresenceImage.addEventListener("click", (event) => {
      onClickEmailPresence(event, this);
    });
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

    this.appendChild(this._mailEmailAddress);
  }

  get emailAddressNode() {
    return this._mailEmailAddress;
  }
}
customElements.define("mail-emailheaderfield", MozMailEmailheaderfield);

class MozTreecolImage extends customElements.get("treecol") {
  static get observedAttributes() {
    return ["src"];
  }

  connectedCallback() {
    if (this.hasChildNodes() || this.delayConnectedCallback()) {
      return;
    }
    this.image = document.createXULElement("image");
    this.image.classList.add("treecol-icon");

    this.appendChild(this.image);
    this._updateAttributes();
  }

  attributeChangedCallback() {
    if (!this.isConnectedAndReady) {
      return;
    }
    this._updateAttributes();
  }

  _updateAttributes() {
    const src = this.getAttribute("src");

    if (src != null) {
      this.image.setAttribute("src", src);
    } else {
      this.image.removeAttribute("src");
    }
  }
}
customElements.define("treecol-image", MozTreecolImage, { extends: "treecol" });

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
      this.appendChild(MozXULElement.parseXULToFragment(`
        <treecolpicker is="thread-pane-treecolpicker" class="treecol-image" fixed="true"></treecolpicker>
      `));
    }
    // Exceptionally apply super late, so we get the other goodness from there
    // now that the treecolpicker is corrected.
    super.connectedCallback();
  }
}
customElements.define("thread-pane-treecols", MozThreadPaneTreecols, { extends: "treecols" });

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
    popup.appendChild(MozXULElement.parseXULToFragment(`
      <menu class="applyTo-menu" label="&columnPicker.applyTo.label;">
        <menupopup>
          <menu class="applyToFolder-menu" label="&columnPicker.applyToFolder.label;">
            <menupopup is="folder-menupopup" class="applyToFolder" showFileHereLabel="true" position="start_before"></menupopup>
          </menu>
          <menu class="applyToFolderAndChildren-menu" label="&columnPicker.applyToFolderAndChildren.label;">
            <menupopup is="folder-menupopup" class="applyToFolderAndChildren" showFileHereLabel="true" showAccountsFileHere="true" position="start_before"></menupopup>
          </menu>
        </menupopup>
      </menu>
    `, ["chrome://messenger/locale/messenger.dtd"]));

    let confirmApply = (destFolder, useChildren) => {
      // Confirm the action with the user.
      let bundle = document.getElementById("bundle_messenger");
      let title = (useChildren) ?
        "threadPane.columnPicker.confirmFolder.withChildren.title" :
        "threadPane.columnPicker.confirmFolder.noChildren.title";
      let confirmed = Services.prompt.confirm(null, title,
        bundle.getFormattedString(title, [destFolder.prettyName]));
      if (confirmed) {
        this._applyColumns(destFolder, useChildren);
      }
    };

    let applyToFolderMenu = this.querySelector(".applyToFolder-menu");
    applyToFolderMenu.addEventListener("command", (event) => {
      confirmApply(event.originalTarget._folder, false);
    });

    let applyToFolderAndChildrenMenu = this.querySelector(".applyToFolderAndChildren-menu");
    applyToFolderAndChildrenMenu.addEventListener("command", (event) => {
      confirmApply(event.originalTarget._folder, true);
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
        DBViewWrapper.prototype.OUTGOING_FOLDER_FLAGS, true
      );
    };

    let amIOutgoing = isOutgoing(gFolderDisplay.displayedFolder);

    let colStateString = function(folder) {
      return (isOutgoing(folder) == amIOutgoing ? myColStateString :
        swappedColStateString);
    };

    // Now propagate appropriately...
    const propName = gFolderDisplay.PERSISTED_COLUMN_PROPERTY_NAME;
    if (useChildren) {
      // Generate an observer notification when we have finished
      // configuring all folders.  This is currently done for the benefit
      // of our mozmill tests.
      let observerCallback = function() {
        Services.obs.notifyObservers(gFolderDisplay.displayedFolder,
          "msg-folder-columns-propagated");
      };
      MailUtils.setStringPropertyOnFolderAndDescendents(
        propName, colStateString, destFolder, observerCallback
      );
    } else {
      destFolder.setStringProperty(propName, colStateString(destFolder));
      // null out to avoid memory bloat
      destFolder.msgDatabase = null;
    }
  }
}
customElements.define("thread-pane-treecolpicker", MozThreadPaneTreeColpicker, { extends: "treecolpicker" });

// The menulist CE is defined lazily. Create one now to get menulist defined,
// allowing us to inherit from it.
if (!customElements.get("menulist")) {
  delete document.createXULElement("menulist");
}
customElements.whenDefined("menulist").then(() => {
  /**
   * MozMenulistEditable is a menulist widget that can be made editable by setting editable="true".
   * With an additional type="description" the list also contains an additional label that can hold
   * for instance, a description of a menu item.
   * It is typically used e.g. for the "Custom From Address..." feature to let the user chose and
   * edit the address to send from.
   * @extends {MozMenuList}
   */
  class MozMenulistEditable extends customElements.get("menulist") {
    connectedCallback() {
      if (this.delayConnectedCallback()) {
        return;
      }

      this.prepend(MozMenulistEditable.fragment.cloneNode(true));
      this._inputField = this.querySelector(".menulist-input");
      this._labelBox = this.querySelector(".menulist-label-box");
      this._dropmarker = this.querySelector(".menulist-dropmarker");

      if (this.getAttribute("type") == "description") {
        this._description = document.createXULElement("label");
        this._description.classList.add("menulist-description");
        this._description.setAttribute("crop", "right");
        this._description.setAttribute("flex", "10000");
        this._description.setAttribute("role", "none");
        this.querySelector(".menulist-label").after(this._description);
      }

      this.initializeAttributeInheritance();

      this.mSelectedInternal = null;
      this.setInitialSelection();

      this._handleMutation = (mutations) => {
        this.editable = this.getAttribute("editable") == "true";
      };
      this.mAttributeObserver = new MutationObserver(this._handleMutation);
      this.mAttributeObserver.observe(this, {
        attributes: true,
        attributeFilter: ["editable"],
      });

      this._keypress = (event) => {
        if (event.key == "ArrowDown") {
          this.open = true;
        }
      };
      this._inputField.addEventListener("keypress", this._keypress);
      this._change = (event) => {
        event.stopPropagation();
        this.selectedItem = null;
        this.setAttribute("value", this._inputField.value);
        // Start the event again, but this time with the menulist as target.
        this.dispatchEvent(new CustomEvent("change", { bubbles: true }));
      };
      this._inputField.addEventListener("change", this._change);

      this._popupHiding = (event) => {
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

      for (let prop of ["_inputField", "_labelBox", "_dropmarker", "_description"]) {
        if (this[prop]) {
          this[prop].remove();
          this[prop] = null;
        }
      }
    }

    static get fragment() {
      // Accessibility information of these nodes will be
      // presented on XULComboboxAccessible generated from <menulist>;
      // hide these nodes from the accessibility tree.
      return document.importNode(MozXULElement.parseXULToFragment(`
        <textbox class="menulist-input" allowevents="true" flex="1" role="none"/>
        <hbox class="menulist-label-box" flex="1" role="none">
          <image class="menulist-icon" role="none"/>
          <label class="menulist-label" crop="right" flex="1" role="none"/>
          <label class="menulist-highlightable-label" crop="right" flex="1" role="none"/>
        </hbox>
        <dropmarker class="menulist-dropmarker" type="menu" role="none"/>
      `), true);
    }

    static get inheritedAttributes() {
      let attrs = super.inheritedAttributes;
      attrs[".menulist-input"] = "value,disabled";
      attrs[".menulist-description"] = "value=description";
      return attrs;
    }

    set editable(val) {
      if (val == this.editable)
        return val;

      if (!val) {
        // If we were focused and transition from editable to not editable,
        // focus the parent menulist so that the focus does not get stuck.
        if (this._inputField == document.activeElement)
          window.setTimeout(() => this.focus(), 0);
      }

      this.setAttribute("editable", val);
      return val;
    }

    get editable() {
      return this.getAttribute("editable") == "true";
    }

    set value(val) {
      this._inputField.value = val;
      this.setAttribute("value", val);
      this.setAttribute("label", val);
      return val;
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

    select() {
      if (this.editable) {
        this._inputField.select();
      }
    }
  }

  const MenuBaseControl = MozElements.BaseControlMixin(MozElements.MozElementMixin(XULMenuElement));
  MenuBaseControl.implementCustomInterface(
    MozMenulistEditable, [Ci.nsIDOMXULMenuListElement, Ci.nsIDOMXULSelectControlElement]
  );

  customElements.define("menulist-editable", MozMenulistEditable, { extends: "menulist" });
});
/**
 * The mail-multiemail-headerfield widgets shows multiple emails. It collapses long rows and allows
 * toggling the full view open. This widget is typically used in the message header pane to show
 * addresses for To, Cc, Bcc, and any other addressing type header that can contain more than one
 * mailbox.
 *
 * extends {MozXULElement}
 */
class MozMailMultiEmailheaderfield extends MozXULElement {
  constructor() {
    super();

    // This field is used to buffer the width of the comma node so that it only has to be determined
    // once during the lifetime of this widget. Otherwise it would cause an expensive reflow every
    // time.
    this.commaNodeWidth = 0;

    // The number of lines of addresses we will display before adding a (more) indicator to the
    // widget. This can be increased using the preference mailnews.headers.show_n_lines_before_more.
    this.maxLinesBeforeMore = 1;

    // The number addresses which did fit up to now before the (more) indicator became necessary to
    // be added. This determines how many address elements are cached for the lifetime of the
    // widget.
    this.maxAddressesBeforeMore = 1;

    // This field is used to specify the maximum number of addresses in the more button tooltip
    // text.
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
    this.emailAddresses.classList.add("class", "headerValue");
    this.emailAddresses.setAttribute("containsEmail", "true");
    this.emailAddresses.setAttribute("flex", "1");
    this.emailAddresses.setAttribute("orient", "vertical");
    this.emailAddresses.setAttribute("pack", "start");

    this.more = document.createXULElement("label");
    this.more.classList.add("class", "moreIndicator");
    this.more.addEventListener("click", this.toggleWrap.bind(this));
    this.more.setAttribute("collapsed", "true");

    this.longEmailAddresses.appendChild(this.emailAddresses);
    this.appendChild(this.longEmailAddresses);
    this.appendChild(this.more);
  }

  set maxAddressesInMoreTooltipValue(val) {
    return this.tooltipLength = val;
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
    emailNode.setAttribute("label", address.fullAddress || address.displayName || "");
    emailNode.removeAttribute("tooltiptext");
    emailNode.setAttribute("emailAddress", address.emailAddress || "");
    emailNode.setAttribute("fullAddress", address.fullAddress || "");
    emailNode.setAttribute("displayName", address.displayName || "");

    if (("UpdateEmailNodeDetails" in top) && address.emailAddress) {
      UpdateEmailNodeDetails(address.emailAddress, emailNode);
    }
  }

  /**
   * Private method used to create email address nodes for either our short or long view.
   *
   * @param {Boolean} all   If false, show only a few addresses + "more".
   * @return {Integer}      Number of addresses we have put into the list.
   */
  _fillAddressesNode(all) {
    // try to leverage any cached nodes before creating new ones
    // XXX look for possible perf win using heuristic for the 2nd param instead of hardcoding 1.
    let cached = this.emailAddresses.childNodes.length;

    // XXXdmose one or more of the ancestor nodes could be collapsed, so this hack just undoes that
    // for all ancestors.  We should do better.  Observed causes include the message header pane
    // being collapsed before the first message has been read, as well as (more common), the <row>
    // containing this widget being collapsed because the previously displayed message didn't have
    // this header.
    for (let node = this.emailAddresses; node; node = node.parentNode) {
      node.collapsed = false;
    }

    // This ensures that the worst-case "n more" width is considered.
    this.addNMore(this.addresses.length);
    const availableWidth = this.emailAddresses.clientWidth;
    this.more.collapsed = true;

    // Add addresses until we're done, or we overflow the allowed lines.
    let i = 0;
    for (let curLine = 0, curLineWidth = 0;
         i < this.addresses.length && (all || curLine < this.maxLinesBeforeMore); i++) {
      let newAddressNode;

      // First, add a comma as long as this isn't the first address.
      if (i > 0) {
        if (cached-- > 0) {
          this.emailAddresses.childNodes[i * 2 - 1].hidden = false;
        } else {
          this.appendComma();
          if (this.commaNodeWidth == 0)
            this.commaNodeWidth = this.emailAddresses.lastChild.clientWidth;
        }
      }

      // Now add an email address.
      if (cached-- > 0) {
        newAddressNode = this.emailAddresses.childNodes[i * 2];
        newAddressNode.hidden = false;
      } else {
        newAddressNode = document.createXULElement("mail-emailaddress");

        // Stash the headerName somewhere that UpdateEmailNodeDetails will be able to find it.
        newAddressNode.setAttribute("headerName", this.headerName);

        newAddressNode = this.emailAddresses.appendChild(newAddressNode);
      }
      this._updateEmailAddressNode(newAddressNode, this.addresses[i]);

      // Reading .clientWidth triggers an expensive reflow, so only do it when necessary for
      // possible early loop exit to display (X more).
      if (!all) {
        // Calculate width and lines, consider the i+1 comma node if we have to
        // <http://www.w3.org/TR/cssom-view/#client-attributes>
        // <https://developer.mozilla.org/en/Determining_the_dimensions_of_elements>
        let newLineWidth = i + 1 < this.addresses.length ?
          newAddressNode.clientWidth + this.commaNodeWidth :
          newAddressNode.clientWidth;
        curLineWidth += newLineWidth;

        let overLineWidth = curLineWidth - availableWidth;
        if (overLineWidth > 0 && i > 0) {
          curLine++;
          curLineWidth = newLineWidth;
        }

        // Hide the last node spanning into the additional line (n>1)
        // also hide it if <30px left after sliding the address (n=1)
        // or if the last address would be truncated without "more"
        if (curLine >= this.maxLinesBeforeMore &&
            (this.maxLinesBeforeMore > 1 ||
            (i + 1 == this.addresses.length && overLineWidth > 30) ||
            newLineWidth - overLineWidth < 30)) {
          this.emailAddresses.lastChild.hidden = true;
          i--;
        }
      }
    }

    // Update maxAddressesBeforeMore if we exceed the current cache estimate, but only if we aren't
    // supposed to show all addresses.
    if (!all && this.maxAddressesBeforeMore < i)
      this.maxAddressesBeforeMore = i;

    // Hide any extra nodes but keep them around for later.
    cached = this.emailAddresses.childNodes.length;
    for (let j = Math.max(i * 2 - 1, 0); j < cached; j++) {
      this.emailAddresses.childNodes[j].hidden = true;
    }

    // If we're not required to show all addresses, and there are still addresses remaining, add an
    // (N more) widget.
    if (!all) {
      let remainingAddresses = this.addresses.length - i;
      if (remainingAddresses > 0) {
        if (this.emailAddresses.childNodes.length % 2 == 0) {
          this.emailAddresses.lastChild.hidden = false;
        } else {
          this.appendComma();
        }

        this.addNMore(remainingAddresses);
        this.setNMoreTooltiptext(this.addresses.slice(-remainingAddresses));
      }
    }

    return i; // number of addresses shown
  }

  /**
   * Public method to build the DOM nodes for display, to be called after all the addresses have
   * been added to the widget. It uses _fillAddressesNode to display at most maxLinesBeforeMore lines
   * of ddresses plus the (more) widget which can be clicked to reveal the rest. The "singleline"
   * attribute is set for one line only.
   */
  buildViews() {
    this.maxLinesBeforeMore = Services.prefs.getIntPref(
      "mailnews.headers.show_n_lines_before_more");
    const dt = Ci.nsMimeHeaderDisplayTypes;
    let headerchoice = Services.prefs.getIntPref("mail.show_headers");
    if (this.maxLinesBeforeMore < 1 || headerchoice == dt.AllHeaders) {
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
    let commaNode = document.createXULElement("text");
    commaNode.setAttribute("value", ",");
    commaNode.setAttribute("class", "emailSeparator");
    this.emailAddresses.appendChild(commaNode);
  }

  /**
   * Add a (N more) widget which can be clicked to reveal the rest.
   */
  addNMore(number) {
    // Figure out the right plural for the language we're using
    let words = document.getElementById("bundle_messenger").getString("headerMoreAddrs");
    let moreForm = PluralForm.get(number, words).replace("#1", number);

    // Set the "n more" text node.
    this.more.setAttribute("value", moreForm);
    // Remove the tooltip text of the more widget.
    this.more.removeAttribute("tooltiptext");

    this.more.collapsed = false;
  }

  /**
   * Populate the tooltiptext of the (N more) widget with hidden email addresses.
   */
  setNMoreTooltiptext(addresses) {
    if (addresses.length == 0) {
      return;
    }

    let tttArray = [];
    for (let i = 0; (i < addresses.length) && (i < this.tooltipLength); i++) {
      tttArray.push(addresses[i].fullAddress);
    }
    let ttText = tttArray.join(", ");

    let remainingAddresses = addresses.length - tttArray.length;
    // Not all missing addresses fit in the tooltip.
    if (remainingAddresses > 0) {
      // Figure out the right plural for the language we're using,
      let words = document.getElementById("bundle_messenger").getString("headerMoreAddrsTooltip");
      let moreForm = PluralForm.get(remainingAddresses, words).replace("#1", remainingAddresses);
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
      const childNodes = this.emailAddresses.childNodes;
      for (let i = 0; i < this.addresses.length; i++) {
        UpdateExtraAddressProcessing(this.addresses[i], childNodes[i * 2], param1, param2, param3);
      }
    }
  }

  /**
   * Called when the (more) indicator has been clicked on; re-renders the widget with all the
   * addresses.
   */
  toggleWrap() {
    // Workaround the fact that XUL line-wrapping and "overflow: auto" don't interact properly
    // (bug 492645), without which we would be inadvertently occluding too much of the message
    // header text and forcing the user to scroll unnecessarily (bug 525225).
    //
    // Fake the "All Headers" mode, so that we get a scroll bar.
    // Will be reset when a new message loads.
    document.getElementById("expandedHeaderView").setAttribute("show_header_mode", "all");

    // Causes different CSS selectors to be used, which allows all of the addresses to be properly
    // displayed and wrapped.
    this.longEmailAddresses.removeAttribute("singleline");

    this.clearChildNodes();

    // Re-render the node, this time with all the addresses.
    this._fillAddressesNode(true);
    // Compute height of 'expandedHeaderView' from 'expandedHeadersBox'.
    document.getElementById("expandedHeaderView").setAttribute(
      "height",
      document.getElementById("expandedHeadersBox").clientHeight
    );
    // This attribute will be reinit in the 'UpdateExpandedMessageHeaders()' method.
  }

  /**
   * Clears both our divs.
   */
  clearChildNodes() {
    this.more.collapsed = true;

    // We want to keep around the first maxAddressesBeforeMore email address nodes as well as any
    // intervening comma nodes.
    const numItemsToPreserve = this.maxAddressesBeforeMore * 2 - 1;
    let numItemsInNode = this.emailAddresses.childNodes.length;

    while (numItemsInNode && (numItemsInNode > numItemsToPreserve)) {
      this.emailAddresses.lastChild.remove();
      numItemsInNode--;
    }
  }

  clearHeaderValues() {
    // Clear out our local state.
    this.addresses = [];
    this.longEmailAddresses.setAttribute("singleline", "true");
    // Remove anything inside of each of our labels.
    this.clearChildNodes();
  }
}
customElements.define("mail-multi-emailheaderfield", MozMailMultiEmailheaderfield);

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

    this.messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);

    this.addEventListener("keypress", (event) => {
      // The spacebar should work just like the arrow keys, except that the
      // focused element doesn't change, so use moveByOffset here.
      if (event.keyCode == KeyEvent.DOM_VK_SPACE) {
        this.moveByOffset(0, !event.ctrlKey, event.shiftKey);
        event.preventDefault();
      } else if (event.keyCode == KeyEvent.DOM_VK_RETURN) {
        if (this.currentItem) {
          this.addItemToSelection(this.currentItem);
          let evt = document.createEvent("XULCommandEvent");
          evt.initCommandEvent("command", true, true, window, 0, event.ctrlKey,
            event.altKey, event.shiftKey, event.metaKey, null);
          this.currentItem.dispatchEvent(evt);
        }
      }
    });

    this.addEventListener("click", (event) => {
      if (event.button != 0 || event.target.classList.contains("attachmentItem")) {
        return;
      }

      if (this.selType != "multiple" || (!event.ctrlKey && !event.shiftKey && !event.metaKey)) {
        this.clearSelection();
      }
    });

    // Make sure we keep the focus.
    this.addEventListener("mousedown", (event) => {
      if (event.button != 0) {
        return;
      }

      if (document.commandDispatcher.focusedElement != this) {
        this.focus();
      }
    });

    if (this.orient === "horizontal") {
      this.addEventListener("keypress", (event) => {
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
            this.moveByOffset(this._itemsPerRow(), !event.ctrlKey, event.shiftKey);
            event.preventDefault();
            break;

          case KeyEvent.DOM_VK_UP:
            this.moveByOffset(-this._itemsPerRow(), !event.ctrlKey, event.shiftKey);
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

    this.sizes = { small: 16, large: 32, tile: 32 };

    let children = Array.from(this._childNodes);

    children.filter(child => child.getAttribute("selected") == "true")
      .forEach(this.selectedItems.append, this.selectedItems);

    children.filter(child => !child.hasAttribute("context"))
      .forEach(child => child.setAttribute("context", this.getAttribute("itemcontext")));
  }

  set view(val) {
    this.setAttribute("view", val);
    this._setImageSize();
    return val;
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
    return val;
  }

  get orient() {
    return this.getAttribute("orient");
  }

  get itemCount() {
    return this._childNodes.length;
  }

  /**
   * Get the preferred height (the height that would allow us to fit everything without scrollbars)
   * of the attachmentlist's bounding rectangle.
   */
  get preferredHeight() {
    return this.scrollHeight - this.clientHeight + this.getBoundingClientRect().height;
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
    let estimatedRow = Math.floor(box.scrollTop / this._childNodes[0].getBoundingClientRect().height);
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

    // We didn't go far enough! Keep going until we find an item atleast partially on-screen.
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
      box.scrollTop = item.getBoundingClientRect().y - box.getBoundingClientRect().y;
    } else if (
      item.screenY + item.getBoundingClientRect().height > box.screenY + box.getBoundingClientRect().height
    ) {
      // ... or not far enough?
      box.scrollTop = item.getBoundingClientRect().y + item.getBoundingClientRect().height -
        box.getBoundingClientRect().y - box.getBoundingClientRect().height;
    }
  }

  scrollToIndex(index) {
    let box = this;
    let item = this.getItemAtIndex(index);
    if (!item) {
      return;
    }
    box.scrollTop = item.getBoundingClientRect().y - box.getBoundingClientRect().y;
  }

  appendItem(attachment, name) {
    // -1 appends due to the way getItemAtIndex is implemented.
    return this.insertItemAt(-1, attachment, name);
  }

  insertItemAt(index, attachment, name) {
    let item = this.ownerDocument.createXULElement("richlistitem");
    item.classList.add("attachmentItem");
    item.setAttribute("name", name || attachment.name);
    item.setAttribute("role", "option");

    item.addEventListener("dblclick", (event) => {
      let evt = document.createEvent("XULCommandEvent");
      evt.initCommandEvent("command", true, true, window, 0, event.ctrlKey,
        event.altKey, event.shiftKey, event.metaKey, null);
      event.originalTarget.dispatchEvent(evt);
    });

    let iconContainer = this.ownerDocument.createXULElement("hbox");
    iconContainer.setAttribute("align", "center");
    let icon = this.ownerDocument.createXULElement("image");
    icon.classList.add("attachmentcell-icon");
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
    textLabel.setAttribute("value", name || attachment.name);
    textName.appendChild(textLabel);

    let spacer = this.ownerDocument.createXULElement("spacer");
    spacer.setAttribute("flex", "99999");

    let sizeLabel = this.ownerDocument.createXULElement("label");
    sizeLabel.classList.add("attachmentcell-size");

    textContainer.appendChild(textName);
    textContainer.appendChild(spacer);
    textContainer.appendChild(sizeLabel);

    item.appendChild(iconContainer);
    item.appendChild(textContainer);

    let size;
    if (attachment.size != null && attachment.size != -1) {
      size = this.messenger.formatFileSize(attachment.size);
    } else {
      // Use a zero-width space so the size label has the right height.
      size = "\u200b";
    }
    item.setAttribute("size", size);
    sizeLabel.setAttribute("value", size);

    // Pick out some nice icons (small and large) for the attachment
    if (attachment.contentType == "text/x-moz-deleted") {
      let base = "chrome://messenger/skin/icons/";
      item.setAttribute("image16", base + "attachment-deleted.png");
      item.setAttribute("image32", base + "attachment-deleted-large.png");
    } else {
      item.setAttribute("image16", "moz-icon://" + attachment.name +
        "?size=16&contentType=" + attachment.contentType);
      item.setAttribute("image32", "moz-icon://" + attachment.name +
        "?size=32&contentType=" + attachment.contentType);
    }

    let imageSize = this.sizes[this.getAttribute("view")] || 16;
    item.setAttribute("imagesize", imageSize);
    item.setAttribute("context", this.getAttribute("itemcontext"));
    item.attachment = attachment;

    let attr = "image" + imageSize;
    if (item.hasAttribute(attr)) {
      icon.setAttribute("src", item.getAttribute(attr));
    }

    this.insertBefore(item, this.getItemAtIndex(index));
    return item;
  }

  /**
   * Find the attachmentitem node for the specified nsIMsgAttachment.
   */
  findItemForAttachment(aAttachment) {
    for (let i = 0; i < this.itemCount; i++) {
      let item = this.getItemAtIndex(i);
      if (item.attachment == aAttachment) { return item; }
    }
    return null;
  }

  _fireOnSelect() {
    if (!this._suppressOnSelect && !this.suppressOnSelect) {
      this.dispatchEvent(new Event("select", { bubbles: false, cancelable: true }));
    }
  }

  _itemsPerRow() {
    if (this.orient === "vertical") {
      // Vertical attachment lists have one item per row by definition.
      return 1;
    }

    // For 0 or 1 children, we can assume that they all fit in one row.
    if (this._childNodes.length < 2) { return this._childNodes.length; }

    let itemWidth = this._childNodes[1].getBoundingClientRect().x -
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

    let itemHeight = this._childNodes[itemsPerRow].getBoundingClientRect().y -
      this._childNodes[0].getBoundingClientRect().y;

    return Math.floor(this.clientHeight / itemHeight);
  }

  _setImageSize() {
    let size = this.sizes[this.view] || 16;

    for (let i = 0; i < this._childNodes.length; i++) {
      this._childNodes[i].imageSize = size;
    }
  }

  /**
   * Only used by attachmentlist with horizontal orient.
   */
  setOptimumWidth() {
    if (this._childNodes.length == 0) {
      return;
    }

    let width = 0;
    let border = this._childNodes[0].getBoundingClientRect().width -
      this._childNodes[0].clientWidth;

    // If widths have changed after the initial calculation (updated
    // size string), clear each item's prior hardcoded width so
    // scrollwidth is natural, then get the width for the widest item
    // and set it on all the items again.
    for (let child of this._childNodes) {
      child.width = "";
      width = Math.max(width, child.scrollWidth);
    }
    for (let child of this._childNodes) {
      child.width = width + border;
    }
  }
}

customElements.define("attachment-list", MozAttachmentlist, { extends: "richlistbox" });
