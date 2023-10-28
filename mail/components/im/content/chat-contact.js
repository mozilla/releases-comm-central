/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global MozXULElement, MozElements, Status, chatHandler */

// Wrap in a block to prevent leaking to window scope.
{
  const { IMServices } = ChromeUtils.importESModule(
    "resource:///modules/IMServices.sys.mjs"
  );
  const { ChatIcons } = ChromeUtils.importESModule(
    "resource:///modules/chatIcons.sys.mjs"
  );

  /**
   * The MozChatContactRichlistitem widget displays contact information about user under
   * chat-groups, online contacts and offline contacts: i.e. icon and username.
   * On double clicking the element, it gets moved into the conversations.
   *
   * @augments {MozElements.MozRichlistitem}
   */
  class MozChatContactRichlistitem extends MozElements.MozRichlistitem {
    static get inheritedAttributes() {
      return {
        ".box-line": "selected",
        ".contactDisplayName": "value=displayname",
        ".contactDisplayNameInput": "value=displayname",
        ".contactStatusText": "value=statusTextWithDash",
      };
    }

    static get markup() {
      return `
      <vbox class="box-line"></vbox>
      <stack class="prplBuddyIcon">
        <html:img class="protoIcon" alt="" />
        <html:img class="smallStatusIcon" />
      </stack>
      <hbox flex="1" class="contact-hbox">
        <stack>
          <label crop="end"
                 class="contactDisplayName blistDisplayName">
          </label>
          <html:input type="text"
                      class="contactDisplayNameInput"
                      hidden="hidden"/>
        </stack>
        <label crop="end"
               style="flex: 100000 100000;"
               class="contactStatusText">
        </label>
        <button class="startChatBubble"
                tooltiptext="&openConversationButton.tooltip;">
        </button>
      </hbox>
      `;
    }

    static get entities() {
      return ["chrome://messenger/locale/chat.dtd"];
    }

    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }

      this.setAttribute("is", "chat-contact-richlistitem");

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
          event.target.classList.contains("startChatBubble")
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
        QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),
        observe: function (subject, topic, data) {
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

      this.appendChild(this.constructor.fragment);

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
      const statusType = this.contact.statusType;

      const statusIcon = this.querySelector(".smallStatusIcon");
      const statusName = Status.toAttribute(statusType);
      statusIcon.setAttribute("src", ChatIcons.getStatusIconURI(statusName));
      statusIcon.setAttribute("alt", Status.toLabel(statusType));

      if (this.contact.canSendMessage) {
        this.setAttribute("cansend", "true");
      } else {
        this.removeAttribute("cansend");
      }

      const protoIcon = this.querySelector(".protoIcon");
      protoIcon.setAttribute(
        "src",
        ChatIcons.getProtocolIconURI(this.contact.preferredBuddy.protocol)
      );
      ChatIcons.setProtocolIconOpacity(protoIcon, statusName);
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
      const input = this.querySelector(".contactDisplayNameInput");
      const label = this.querySelector(".contactDisplayName");
      input.removeAttribute("hidden");
      label.setAttribute("hidden", "true");
      input.focus();

      this._inputBlurListener = function (event) {
        this.finishAliasing(true);
      }.bind(this);
      input.addEventListener("blur", this._inputBlurListener);

      // Some keys (home/end for example) can make the selected item
      // of the richlistbox change without producing a blur event on
      // our textbox. Make sure we watch richlistbox selection changes.
      this._parentSelectListener = function (event) {
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
      const listbox = this.parentNode;
      const input = this.querySelector(".contactDisplayNameInput");
      const label = this.querySelector(".contactDisplayName");
      input.setAttribute("hidden", "hidden");
      label.removeAttribute("hidden");
      if (save) {
        this.contact.alias = input.value;
      }
      this.removeAttribute("aliasing");
      listbox.removeEventListener("select", this._parentSelectListener);
      input.removeEventListener("blur", this._inputBlurListener);
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
      const prplConv = this.contact.createConversation();
      const uiConv = IMServices.conversations.getUIConversation(prplConv);
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

  MozXULElement.implementCustomInterface(MozChatContactRichlistitem, [
    Ci.nsIDOMXULSelectControlItemElement,
  ]);

  customElements.define(
    "chat-contact-richlistitem",
    MozChatContactRichlistitem,
    {
      extends: "richlistitem",
    }
  );
}
