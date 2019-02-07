/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global MozXULElement */
/* global openUILink */
/* global MessageIdClick */
/* global onClickEmailStar */
/* global onClickEmailPresence */
/* global gFolderDisplay */

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
var {MailUtils} = ChromeUtils.import("resource:///modules/MailUtils.jsm");
var {DBViewWrapper} = ChromeUtils.import("resource:///modules/DBViewWrapper.jsm");

class MozMailHeaderfield extends MozXULElement {
  connectedCallback() {
    this.setAttribute("context", "copyPopup");
    this.classList.add("headerValue");
  }

  set headerValue(val) {
    return (this.textContent = val);
  }
}

class MozMailUrlfield extends MozMailHeaderfield {
  connectedCallback() {
    super.connectedCallback();
    this.setAttribute("context", "copyUrlPopup");
    this.classList.add("text-link", "headerValueUrl");
    this.addEventListener("click", (event) => {
      if (event.button != 2) {
        openUILink(encodeURI(event.target.textContent), event);
      }
    });
  }
}

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

      // now create a label for the tag name, and set the color
      const label = document.createElement("label");
      label.setAttribute("value", tagName);
      label.className = "tagvalue blc-" + color.substr(1);

      this.appendChild(label);
    }
  }
}

class MozMailNewsgroup extends MozXULElement {
  connectedCallback() {
    this.classList.add("emailDisplayButton");
    this.setAttribute("context", "newsgroupPopup");
    this.setAttribute("popup", "newsgroupPopup");
  }
}

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
      const newNode = document.createElement("mail-newsgroup");
      if (i > 0) {
        const textNode = document.createElement("text");
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

class MozMailMessageid extends MozXULElement {
  static get observedAttributes() {
    return ["label"];
  }

  connectedCallback() {
    this.classList.add("messageIdDisplayButton");
    this.setAttribute("context", "messageIdContext");
    this._updateAttributes();

    this.addEventListener("click", (event) => {
      MessageIdClick(this, event);
    });
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
    this.classList.add("emailDisplayButton");
    this.setAttribute("context", "emailAddressPopup");
    this.setAttribute("popup", "emailAddressPopup");

    const label = document.createElement("label");
    label.classList.add("emaillabel");

    const emailStarImage = document.createElement("image");
    emailStarImage.classList.add("emailStar");
    emailStarImage.setAttribute("context", "emailAddressPopup");

    const emailPresenceImage = document.createElement("image");
    emailPresenceImage.classList.add("emailPresence");

    this.appendChild(label);
    this.appendChild(emailStarImage);
    this.appendChild(emailPresenceImage);

    this._areChildrenAppended = true;

    this._update();
    this._setupEventListeners();
  }

  attributeChangedCallback() {
    this._update();
  }

  _update() {
    if (!this.isConnected || !this._areChildrenAppended) {
      return;
    }

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

class MozMailEmailheaderfield extends MozXULElement {
  connectedCallback() {
    this._mailEmailAddress = document.createElement("mail-emailaddress");
    this._mailEmailAddress.classList.add("headerValue");
    this._mailEmailAddress.setAttribute("containsEmail", "true");

    this.appendChild(this._mailEmailAddress);
  }

  get emailAddressNode() {
    return this._mailEmailAddress;
  }
}

class MozTreecolImage extends customElements.get("treecol") {
  static get observedAttributes() {
    return ["src"];
  }

  connectedCallback() {
    this.image = document.createElement("image");
    this.image.classList.add("treecol-icon");

    this.appendChild(this.image);
    this._updateAttributes();
  }

  attributeChangedCallback() {
    this._updateAttributes();
  }

  _updateAttributes() {
    if (!this.isConnected || !this.image) {
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
            <menupopup class="applyToFolder" type="folder" showFileHereLabel="true" position="start_before"></menupopup>
          </menu>
          <menu class="applyToFolderAndChildren-menu" label="&columnPicker.applyToFolderAndChildren.label;">
            <menupopup class="applyToFolderAndChildren" type="folder" showFileHereLabel="true" showAccountsFileHere="true" position="start_before"></menupopup>
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

  // XXX: this shouldn't need to be overridden. ATM, the removal of children
  // while aPopup.childNodes.length > 2 is forcing us. We have three since we
  // add one menu.
  /** @override */
  buildPopup(aPopup) {
    // We no longer cache the picker content, remove the old content related to
    // the cols - menuitem and separator should stay.
    this.querySelectorAll("[colindex]").forEach((e) => { e.remove(); });

    var refChild = aPopup.firstChild;

    var tree = this.parentNode.parentNode;
    for (var currCol = tree.columns.getFirstColumn(); currCol; currCol = currCol.getNext()) {
      // Construct an entry for each column in the row, unless
      // it is not being shown.
      var currElement = currCol.element;
      if (!currElement.hasAttribute("ignoreincolumnpicker")) {
        var popupChild = document.createElement("menuitem");
        popupChild.setAttribute("type", "checkbox");
        var columnName = currElement.getAttribute("display") ||
          currElement.getAttribute("label");
        popupChild.setAttribute("label", columnName);
        popupChild.setAttribute("colindex", currCol.index);
        if (currElement.getAttribute("hidden") != "true")
          popupChild.setAttribute("checked", "true");
        if (currCol.primary)
          popupChild.setAttribute("disabled", "true");
        aPopup.insertBefore(popupChild, refChild);
      }
    }

    var hidden = !tree.enableColumnDrag;
    this.querySelectorAll(":not([colindex])").forEach((e) => { e.hidden = hidden; });
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

customElements.define("mail-headerfield", MozMailHeaderfield);
customElements.define("mail-urlfield", MozMailUrlfield);
customElements.define("mail-tagfield", MozMailHeaderfieldTags);
customElements.define("mail-newsgroup", MozMailNewsgroup);
customElements.define("mail-newsgroups-headerfield", MozMailNewsgroupsHeaderfield);
customElements.define("mail-messageid", MozMailMessageid);
customElements.define("mail-emailaddress", MozMailEmailaddress);
customElements.define("mail-emailheaderfield", MozMailEmailheaderfield);
