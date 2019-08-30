/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global MozXULElement, MozElements, Status, chatHandler */

// Wrap in a block to prevent leaking to window scope.
{
  const { Services } = ChromeUtils.import(
    "resource://gre/modules/Services.jsm"
  );

  /**
   * The MozChatContact widget displays contact information about user under
   * chat-groups, online contacts and offline contacts: i.e. icon and username.
   * On double clicking the element, it gets moved into the conversations.
   *
   * @extends {MozElements.MozRichlistitem}
   */
  class MozChatContact extends MozElements.MozRichlistitem {
    static get inheritedAttributes() {
      return {
        ".box-line": "selected",
        ".protoIcon": "src=iconPrpl,status",
        ".statusIcon": "status",
        ".contactDisplayName": "value=displayname,status",
        ".contactStatusText": "value=statusTextWithDash",
      };
    }
    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }

      this.setAttribute("is", "chat-contact");

      this.addEventListener("blur", event => {
        if (!this.hasAttribute("aliasing")) {
          return;
        }

        if (Services.focus.activeWindow == document.defaultView) {
          this.finishAliasing(true);
        }
      });

      this.addEventListener("mousedown", event => {
        if (
          !this.hasAttribute("aliasing") &&
          this.canOpenConversation() &&
          event.originalTarget.classList.contains("startChatBubble")
        ) {
          this.openConversation();
          event.preventDefault();
        }
      });

      this.addEventListener("click", event => {
        if (
          !this.hasAttribute("aliasing") &&
          this.canOpenConversation() &&
          event.detail == 2
        ) {
          this.openConversation();
        }
      });

      this.parentNode.addEventListener("mousedown", event => {
        event.preventDefault();
      });

      // @implements {nsIObserver}
      this.observer = {
        QueryInterface: ChromeUtils.generateQI([Ci.nsIObserver]),
        observe: function(subject, topic, data) {
          if (
            topic == "contact-preferred-buddy-changed" ||
            topic == "contact-display-name-changed" ||
            topic == "contact-status-changed"
          ) {
            this.update();
          }
          if (
            topic == "contact-availability-changed" ||
            topic == "contact-display-name-changed"
          ) {
            this.group.updateContactPosition(subject);
          }
        }.bind(this),
      };

      this.appendChild(
        MozXULElement.parseXULToFragment(
          `
        <vbox class="box-line"></vbox>
        <stack class="prplBuddyIcon" mousethrough="always">
          <image class="protoIcon"></image>
          <image class="statusIcon"></image>
        </stack>
        <hbox flex="1" class="contact-hbox" mousethrough="always">
          <label crop="end" flex="1" mousethrough="always"
            class="contactDisplayName blistDisplayName">
          </label>
          <label crop="end" flex="100000" mousethrough="always"
            class="contactStatusText">
          </label>
          <button class="startChatBubble" tooltiptext="&openConversationButton.tooltip;">
          </button>
        </hbox>
      `,
          ["chrome://messenger/locale/chat.dtd"]
        )
      );

      this.initializeAttributeInheritance();
    }

    get displayName() {
      return this.contact.displayName;
    }

    update() {
      this.setAttribute("displayname", this.contact.displayName);

      let statusText = this.contact.statusText;
      if (statusText) {
        statusText = " - " + statusText;
      }
      this.setAttribute("statusTextWithDash", statusText);
      let statusType = this.contact.statusType;
      this.setAttribute("statusText", Status.toLabel(statusType) + statusText);
      this.setAttribute("status", Status.toAttribute(statusType));

      if (this.contact.canSendMessage) {
        this.setAttribute("cansend", "true");
      } else {
        this.removeAttribute("cansend");
      }

      let proto = this.contact.preferredBuddy.protocol;
      this.setAttribute("iconPrpl", proto.iconBaseURI + "icon.png");
    }

    build(contact) {
      this.contact = contact;
      this.contact.addObserver(this.observer);
      this.update();
    }

    destroy() {
      this.contact.removeObserver(this.observer);
      delete this.contact;
      this.remove();
    }

    startAliasing() {
      if (this.hasAttribute("aliasing")) {
        return; // prevent re-entry.
      }

      this.setAttribute("aliasing", "true");
      let textbox = this.querySelector(".contactDisplayName");
      textbox.getBoundingClientRect(); // force binding attachmant by forcing layout
      textbox.select();

      // Some keys (home/end for example) can make the selected item
      // of the richlistbox change without producing a blur event on
      // our textbox. Make sure we watch richlistbox selection changes.
      this._parentSelectListener = function(event) {
        if (event.target == this.parentNode) {
          this.finishAliasing(true);
        }
      }.bind(this);
      this.parentNode.addEventListener("select", this._parentSelectListener);
    }

    finishAliasing(save) {
      // Cache the parentNode because when we change the contact alias, we
      // trigger a re-order (and a removeContact call), which sets
      // this.parentNode to undefined.
      let listbox = this.parentNode;
      if (save) {
        this.contact.alias = this.querySelector(".contactDisplayName").value;
      }
      this.removeAttribute("aliasing");
      listbox.removeEventListener("select", this._parentSelectListener);
      delete this._parentSelectListener;
      listbox.focus();
    }

    deleteContact() {
      this.contact.remove();
    }

    canOpenConversation() {
      return this.contact.canSendMessage;
    }

    openConversation() {
      let prplConv = this.contact.createConversation();
      let uiConv = Services.conversations.getUIConversation(prplConv);
      chatHandler.focusConversation(uiConv);
    }

    keyPress(event) {
      switch (event.keyCode) {
        // If Enter or Return is pressed, open a new conversation
        case event.DOM_VK_RETURN:
          if (this.hasAttribute("aliasing")) {
            this.finishAliasing(true);
          } else if (this.canOpenConversation()) {
            this.openConversation();
          }
          break;

        case event.DOM_VK_F2:
          if (!this.hasAttribute("aliasing")) {
            this.startAliasing();
          }
          break;

        case event.DOM_VK_ESCAPE:
          if (this.hasAttribute("aliasing")) {
            this.finishAliasing(false);
          }
          break;
      }
    }
    disconnectedCallback() {
      if (this.contact) {
        this.contact.removeObserver(this.observer);
        delete this.contact;
      }
    }
  }

  MozXULElement.implementCustomInterface(MozChatContact, [
    Ci.nsIDOMXULSelectControlItemElement,
  ]);

  customElements.define("chat-contact", MozChatContact, {
    extends: "richlistitem",
  });
}
