/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var editContactInlineUI = {
  _overlayLoaded: false,
  _overlayLoading: false,
  _cardDetails: null,
  _writeable: true,
  _blockedCommands: ["cmd_close"],

  _blockCommands() {
    for (var i = 0; i < this._blockedCommands; ++i) {
      var elt = document.getElementById(this._blockedCommands[i]);
      // make sure not to permanetly disable this item
      if (elt.hasAttribute("wasDisabled")) {
        continue;
      }

      if (elt.getAttribute("disabled") == "true") {
        elt.setAttribute("wasDisabled", "true");
      } else {
        elt.setAttribute("wasDisabled", "false");
        elt.setAttribute("disabled", "true");
      }
    }
  },

  _restoreCommandsState() {
    for (var i = 0; i < this._blockedCommands; ++i) {
      var elt = document.getElementById(this._blockedCommands[i]);
      if (elt.getAttribute("wasDisabled") != "true") {
        elt.removeAttribute("disabled");
      }
      elt.removeAttribute("wasDisabled");
    }
    document.getElementById("editContactAddressBookList").disabled = false;
    document.getElementById("contactMoveDisabledText").hidden = true;
  },

  onPopupHidden(aEvent) {
    if (aEvent.target == this.panel) {
      this._restoreCommandsState();
    }
  },

  onPopupShown(aEvent) {
    if (aEvent.target == this.panel) {
      document.getElementById("editContactName").focus();
    }
  },

  onKeyPress(aEvent, aHandleOnlyReadOnly) {
    // Escape should just close this panel
    if (aEvent.keyCode == KeyEvent.DOM_VK_ESCAPE) {
      this.panel.hidePopup();
      return;
    }

    // Return does the default button (done)
    if (aEvent.keyCode == KeyEvent.DOM_VK_RETURN) {
      if (!aEvent.target.hasAttribute("oncommand")) {
        this.saveChanges();
      }
      return;
    }

    // Only handle the read-only cases here.
    if (aHandleOnlyReadOnly && this._writeable && !aEvent.target.readOnly) {
      return;
    }

    // Any other character and we prevent the default, this stops us doing
    // things in the main message window.
    if (aEvent.charCode) {
      aEvent.preventDefault();
    }
  },

  get panel() {
    // The panel is initially stored in a template for performance reasons.
    // Load it into the DOM now.
    delete this.panel;
    const template = document.getElementById("editContactPanelTemplate");
    template.replaceWith(template.content);
    const element = document.getElementById("editContactPanel");
    return (this.panel = element);
  },

  showEditContactPanel(aCardDetails, aAnchorElement) {
    this._cardDetails = aCardDetails;
    const position = "after_start";
    this._doShowEditContactPanel(aAnchorElement, position);
  },

  _doShowEditContactPanel(aAnchorElement, aPosition) {
    this._blockCommands(); // un-done in the popuphiding handler.
    var bundle = Services.strings.createBundle(
      "chrome://messenger/locale/editContactOverlay.properties"
    );

    // Is this address book writeable?
    this._writeable = !this._cardDetails.book.readOnly;
    var type = this._writeable ? "edit" : "view";

    // Force the panel to be created from the template, if necessary.
    this.panel;

    // Update the labels accordingly.
    document.getElementById("editContactPanelTitle").textContent =
      bundle.GetStringFromName(type + "Title");
    document.getElementById("editContactPanelEditDetailsButton").label =
      bundle.GetStringFromName(type + "DetailsLabel");
    document.getElementById("editContactPanelEditDetailsButton").accessKey =
      bundle.GetStringFromName(type + "DetailsAccessKey");

    // We don't need a delete button for a read only card.
    document.getElementById("editContactPanelDeleteContactButton").hidden =
      !this._writeable;

    var nameElement = document.getElementById("editContactName");

    // Set these to read only if we can't write to the directory.
    if (this._writeable) {
      nameElement.removeAttribute("readonly");
      nameElement.class = "editContactTextbox";
    } else {
      nameElement.setAttribute("readonly", "readonly");
      nameElement.class = "plain";
    }

    // Fill in the card details
    nameElement.value = this._cardDetails.card.displayName;
    document.getElementById("editContactEmail").value =
      aAnchorElement.getAttribute("emailAddress") ||
      aAnchorElement.emailAddress;

    document.getElementById("editContactAddressBookList").value =
      this._cardDetails.book.URI;

    // Is this card contained within mailing lists?
    let inMailList = false;
    if (this._cardDetails.book.supportsMailingLists) {
      // We only have to look in one book here, because cards currently have
      // to be in the address book they belong to.
      for (const list of this._cardDetails.book.childNodes) {
        if (!list.isMailList) {
          continue;
        }

        for (const card of list.childCards) {
          if (card.primaryEmail == this._cardDetails.card.primaryEmail) {
            inMailList = true;
            break;
          }
        }
        if (inMailList) {
          break;
        }
      }
    }

    if (!this._writeable || inMailList) {
      document.getElementById("editContactAddressBookList").disabled = true;
    }

    if (inMailList) {
      document.getElementById("contactMoveDisabledText").hidden = false;
    }

    this.panel.openPopup(aAnchorElement, aPosition, -1, -1);
  },

  editDetails() {
    this.saveChanges();
    top.toAddressBook(["cmd_editContact", this._cardDetails.card]);
  },

  deleteContact() {
    if (this._cardDetails.book.readOnly) {
      // Double check we can delete this.
      return;
    }

    // Hide before the dialog or the panel takes the first click.
    this.panel.hidePopup();

    var bundle = Services.strings.createBundle(
      "chrome://messenger/locale/editContactOverlay.properties"
    );
    if (
      !Services.prompt.confirm(
        window,
        bundle.GetStringFromName("deleteContactTitle"),
        bundle.GetStringFromName("deleteContactMessage")
      )
    ) {
      // XXX Would be nice to bring the popup back up here.
      return;
    }

    MailServices.ab
      .getDirectory(this._cardDetails.book.URI)
      .deleteCards([this._cardDetails.card]);
  },

  saveChanges() {
    // If we're a popup dialog, just hide the popup and return
    if (!this._writeable) {
      this.panel.hidePopup();
      return;
    }

    const originalBook = this._cardDetails.book;

    const abURI = document.getElementById("editContactAddressBookList").value;
    if (abURI != originalBook.URI) {
      this._cardDetails.book = MailServices.ab.getDirectory(abURI);
    }

    // We can assume the email address stays the same, so just update the name
    var newName = document.getElementById("editContactName").value;
    if (newName != this._cardDetails.card.displayName) {
      this._cardDetails.card.displayName = newName;
      this._cardDetails.card.setProperty("PreferDisplayName", true);
    }

    // Save the card
    if (this._cardDetails.book.hasCard(this._cardDetails.card)) {
      // Address book wasn't changed.
      this._cardDetails.book.modifyCard(this._cardDetails.card);
    } else {
      // We changed address books for the card.

      // Add it to the chosen address book...
      this._cardDetails.book.addCard(this._cardDetails.card);

      // ...and delete it from the old place.
      originalBook.deleteCards([this._cardDetails.card]);
    }

    this.panel.hidePopup();
  },
};
