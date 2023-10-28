/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global MozXULElement, MozElements */

// Wrap in a block to prevent leaking to window scope.
{
  /**
   * The MozChatGroupRichlistitem widget displays chat group name and behave as a
   * expansion twisty for groups such as "Conversations",
   * "Online Contacts" and "Offline Contacts".
   *
   * @augments {MozElements.MozRichlistitem}
   */
  class MozChatGroupRichlistitem extends MozElements.MozRichlistitem {
    static get inheritedAttributes() {
      return {
        label: "value=name",
      };
    }
    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }

      this.setAttribute("is", "chat-group-richlistitem");
      this.setAttribute("collapsed", "true");

      /* Here we use a div, rather than the usual img because the icon image
       * relies on CSS -moz-locale-dir(rtl). The corresponding icon
       * twisty-collapsed-rtl icon is not a simple mirror transformation of
       * twisty-collapsed.
       * Currently, CSS sets the background-image based on the "closed" state.
       * The element is a visual decoration and does not require any alt text
       * since the aria-expanded attribute describes its state.
       */
      this._image = document.createElement("div");
      this._image.classList.add("twisty");

      this._label = document.createXULElement("label");
      this._label.setAttribute("flex", "1");
      this._label.setAttribute("crop", "end");

      this.appendChild(this._image);
      this.appendChild(this._label);

      this.contacts = [];

      this.contactsById = {};

      this.displayName = "";

      this.addEventListener("click", event => {
        // Check if there was 1 click on the image or 2 clicks on the label
        if (
          (event.detail == 1 && event.target.classList.contains("twisty")) ||
          (event.detail == 2 && event.target.localName == "label")
        ) {
          this.toggleClosed();
        } else if (event.target.localName == "button") {
          this.hide();
        }
      });

      this.addEventListener("contextmenu", event => {
        event.preventDefault();
      });

      if (this.classList.contains("closed")) {
        this.setAttribute("aria-expanded", "true");
      } else {
        this.setAttribute("aria-expanded", "false");
      }

      this.initializeAttributeInheritance();
    }

    /**
     * Takes as input two contact elements (imIContact type) and compares
     * their nicknames alphabetically (case insensitive). This method
     * behaves as a callback that Array.prototype.sort accepts as a
     * parameter.
     */
    sortComparator(contactA, contactB) {
      if (contactA.statusType != contactB.statusType) {
        return contactB.statusType - contactA.statusType;
      }
      const a = contactA.displayName.toLowerCase();
      const b = contactB.displayName.toLowerCase();
      return a.localeCompare(b);
    }

    addContact(contact, tagName) {
      if (this.contactsById.hasOwnProperty(contact.id)) {
        return null;
      }

      let contactElt;
      if (tagName) {
        contactElt = document.createXULElement("richlistitem", {
          is: "chat-imconv-richlistitem",
        });
      } else {
        contactElt = document.createXULElement("richlistitem", {
          is: "chat-contact-richlistitem",
        });
      }
      if (this.classList.contains("closed")) {
        contactElt.setAttribute("collapsed", "true");
      }

      let end = this.contacts.length;
      // Avoid the binary search loop if the contacts were already sorted.
      if (
        end != 0 &&
        this.sortComparator(contact, this.contacts[end - 1].contact) < 0
      ) {
        let start = 0;
        while (start < end) {
          const middle = start + Math.floor((end - start) / 2);
          if (this.sortComparator(contact, this.contacts[middle].contact) < 0) {
            end = middle;
          } else {
            start = middle + 1;
          }
        }
      }
      const last = end == 0 ? this : this.contacts[end - 1];
      this.parentNode.insertBefore(contactElt, last.nextElementSibling);
      contactElt.build(contact);
      contactElt.group = this;
      this.contacts.splice(end, 0, contactElt);
      this.contactsById[contact.id] = contactElt;
      this.removeAttribute("collapsed");
      this._updateGroupLabel();
      return contactElt;
    }

    updateContactPosition(subject, tagName) {
      const contactElt = this.contactsById[subject.id];
      const index = this.contacts.indexOf(contactElt);
      if (index == -1) {
        // Sometimes we get a display-name-changed notification for
        // an offline contact, if it's not in the list, just ignore it.
        return;
      }
      // See if the position of the contact should be changed.
      if (
        (index != 0 &&
          this.sortComparator(
            contactElt.contact,
            this.contacts[index - 1].contact
          ) < 0) ||
        (index != this.contacts.length - 1 &&
          this.sortComparator(
            contactElt.contact,
            this.contacts[index + 1].contact
          ) > 0)
      ) {
        const list = this.parentNode;
        const selectedItem = list.selectedItem;
        const oldItem = this.removeContact(subject);
        const newItem = this.addContact(subject, tagName);
        if (selectedItem == oldItem) {
          list.selectedItem = newItem;
        }
      }
    }

    removeContact(contactForID) {
      const contact = this.contactsById[contactForID.id];
      if (!contact) {
        throw new Error("Can't remove contact for id=" + contactForID.id);
      }

      // create a new array to remove without breaking for each loops.
      this.contacts = this.contacts.filter(c => c !== contact);
      delete this.contactsById[contact.contact.id];

      contact.destroy();

      // Check if some contacts remain in the group, if empty hide it.
      if (!this.contacts.length) {
        this.setAttribute("collapsed", "true");
      } else {
        this._updateGroupLabel();
      }

      return contact;
    }

    _updateClosedState(closed) {
      for (const contact of this.contacts) {
        contact.collapsed = closed;
      }
    }

    toggleClosed() {
      if (this.classList.contains("closed")) {
        this.classList.remove("closed");
        this.setAttribute("aria-expanded", "true");
        this._updateClosedState(false);
      } else {
        this.classList.add("closed");
        this.setAttribute("aria-expanded", "false");
        this._updateClosedState(true);
      }

      this._updateGroupLabel();
    }

    _updateGroupLabel() {
      if (!this.displayName) {
        this.displayName = this.getAttribute("name");
      }
      let name = this.displayName;
      if (this.classList.contains("closed")) {
        name += " (" + this.contacts.length + ")";
      }

      this.setAttribute("name", name);
    }

    keyPress(event) {
      switch (event.keyCode) {
        case event.DOM_VK_RETURN:
          this.toggleClosed();
          break;

        case event.DOM_VK_LEFT:
          if (!this.classList.contains("closed")) {
            this.toggleClosed();
          }
          break;

        case event.DOM_VK_RIGHT:
          if (this.classList.contains("closed")) {
            this.toggleClosed();
          }
          break;
      }
    }
  }

  MozXULElement.implementCustomInterface(MozChatGroupRichlistitem, [
    Ci.nsIDOMXULSelectControlItemElement,
  ]);

  customElements.define("chat-group-richlistitem", MozChatGroupRichlistitem, {
    extends: "richlistitem",
  });
}
