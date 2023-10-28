/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global MozElements, MozXULElement, gChatTab, chatHandler */

// Wrap in a block to prevent leaking to window scope.
{
  const { Status } = ChromeUtils.importESModule(
    "resource:///modules/imStatusUtils.sys.mjs"
  );
  const { AppConstants } = ChromeUtils.importESModule(
    "resource://gre/modules/AppConstants.sys.mjs"
  );
  const { ChatIcons } = ChromeUtils.importESModule(
    "resource:///modules/chatIcons.sys.mjs"
  );

  /**
   * The MozChatConvRichlistitem widget displays opened conversation information from the
   * contacts: i.e name and icon. It gets displayed under conversation expansion
   * twisty in the contactlist richlistbox.
   *
   * @augments {MozElements.MozRichlistitem}
   */
  class MozChatConvRichlistitem extends MozElements.MozRichlistitem {
    static get inheritedAttributes() {
      return {
        ".box-line": "selected",
        ".convDisplayName": "value=displayname,status",
        ".convUnreadTargetedCount": "value=unreadTargetedCount",
        ".convUnreadCount": "value=unreadCount",
        ".convUnreadTargetedCountLabel": "value=unreadTargetedCount",
      };
    }

    static get markup() {
      return `
      <vbox class="box-line"></vbox>
      <button class="closeConversationButton close-icon"
              tooltiptext="&closeConversationButton.tooltip;"></button>
      <stack class="prplBuddyIcon">
        <html:img class="protoIcon" alt="" />
        <html:img class="smallStatusIcon" />
      </stack>
      <hbox flex="1" class="conv-hbox">
        <label crop="end" class="convDisplayName blistDisplayName">
        </label>
        <label class="convUnreadCount" crop="end"></label>
        <box class="convUnreadTargetedCount">
          <label class="convUnreadTargetedCountLabel" crop="end"></label>
        </box>
        <spacer style="flex: 1000000 1000000;"></spacer>
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

      this.setAttribute("is", "chat-imconv-richlistitem");

      this.addEventListener(
        "mousedown",
        event => {
          if (event.target.classList.contains("closeConversationButton")) {
            this.closeConversation();
            event.stopPropagation();
            event.preventDefault();
          }
        },
        true
      );

      this.appendChild(this.constructor.fragment);

      this.convView = null;

      this.directedUnreadCount = 0;

      new MutationObserver(mutations => {
        if (!this.convView || !this.convView.loaded) {
          return;
        }
        if (this.hasAttribute("selected")) {
          this.convView.switchingToPanel();
        } else {
          this.convView.switchingAwayFromPanel(true);
        }
      }).observe(this, { attributes: true, attributeFilter: ["selected"] });

      // @implements {nsIObserver}
      this.observer = {
        QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),
        observe: function (subject, topic, data) {
          if (
            topic == "target-prpl-conversation-changed" ||
            topic == "unread-message-count-changed" ||
            topic == "update-conv-title" ||
            topic == "update-buddy-status" ||
            topic == "update-buddy-status" ||
            topic == "update-conv-chatleft" ||
            topic == "update-conv-chatjoining" ||
            topic == "chat-update-topic"
          ) {
            this.update();
          }
          if (topic == "update-conv-title") {
            this.group.updateContactPosition(
              this.conv,
              "chat-imconv-richlistitem"
            );
          }
        }.bind(this),
      };

      if (this.hasAttribute("is-search-result")) {
        const icon = this.querySelector(".protoIcon");
        icon.classList.add("searchProtoIcon");
        icon.setAttribute("src", "chrome://global/skin/icons/search-glass.svg");
        const statusIcon = this.querySelector(".smallStatusIcon");
        statusIcon.hidden = true;
        this.setAttribute("unreadCount", "0");
        this.setAttribute("unreadTargetedCount", "0");
      }

      this.initializeAttributeInheritance();
    }

    get displayName() {
      return this.conv.title;
    }

    /**
     * This getter exists to provide compatibility with the imgroup sortComparator.
     */
    get contact() {
      return this.conv;
    }

    set selected(val) {
      if (val) {
        this.setAttribute("selected", "true");
      } else {
        this.removeAttribute("selected");
      }
    }

    get selected() {
      return (
        gChatTab &&
        gChatTab.tabNode.selected &&
        this.getAttribute("selected") == "true"
      );
    }

    /**
     * Set the conversation this item should represent. Updates appearance and
     * adds observers to keep it up to date.
     *
     * @param {IMConversation} conv - Conversation this item represents.
     */
    build(conv) {
      this.conv = conv;
      this.conv.addObserver(this.observer);
      this.update();
    }

    update() {
      this.setAttribute("displayname", this.displayName);
      if (this.selected && document.hasFocus()) {
        if (this.convView && this.convView.loaded) {
          this.conv.markAsRead();
          this.directedUnreadCount = 0;
          chatHandler.updateTitle();
          chatHandler.updateChatButtonState();
        }
        this.setAttribute("unreadCount", "0");
        this.setAttribute("unreadTargetedCount", "0");
        this.removeAttribute("unread");
        this.removeAttribute("attention");
      } else {
        let unreadCount =
          this.conv.unreadIncomingMessageCount +
          this.conv.unreadOTRNotificationCount;
        let directedMessages = unreadCount;
        if (unreadCount) {
          this.setAttribute("unread", "true");
          if (this.conv.isChat) {
            directedMessages = this.conv.unreadTargetedMessageCount;
            if (directedMessages) {
              this.setAttribute("attention", "true");
            }
          }
          unreadCount -= directedMessages;
          if (directedMessages > this.directedUnreadCount) {
            this.directedUnreadCount = directedMessages;
          }
        }
        if (unreadCount) {
          unreadCount = "(" + unreadCount + ")";
        }
        this.setAttribute("unreadCount", unreadCount);
        if (
          Services.prefs.getBoolPref(
            "messenger.options.getAttentionOnNewMessages"
          ) &&
          directedMessages > parseInt(this.getAttribute("unreadTargetedCount"))
        ) {
          window.getAttention();
        }
        this.setAttribute("unreadTargetedCount", directedMessages);
        chatHandler.updateTitle();
      }

      const statusIcon = this.querySelector(".smallStatusIcon");
      let statusName;
      statusIcon.hidden = false;
      if (this.conv.isChat) {
        if (this.conv.joining) {
          statusName = "joining";
        } else if (!this.conv.account.connected || this.conv.left) {
          statusName = "left";
        }
        if (statusName) {
          statusIcon.setAttribute(
            "src",
            ChatIcons.getStatusIconURI(statusName)
          );
          // Set alt using messenger/chat.ftl.
          document.l10n.setAttributes(
            statusIcon,
            `chat-${statusName}-chat-icon2`
          );
        } else {
          statusIcon.removeAttribute("src");
          statusIcon.removeAttribute("data-l10n-id");
          statusIcon.removeAttribute("alt");
          statusIcon.hidden = true;
          // Treat protoIcon as if connected.
          statusName = "connected";
        }
      } else {
        let statusType = Ci.imIStatusInfo.STATUS_UNKNOWN;
        const buddy = this.conv.buddy;
        if (buddy && buddy.account.connected) {
          statusType = buddy.statusType;
        }
        statusName = Status.toAttribute(statusType);
        statusIcon.setAttribute("src", ChatIcons.getStatusIconURI(statusName));
        statusIcon.removeAttribute("data-l10n-id");
        statusIcon.setAttribute("alt", Status.toLabel(statusType));
      }

      if (!this.hasAttribute("is-search-result")) {
        const protoIcon = this.querySelector(".protoIcon");
        protoIcon.setAttribute(
          "src",
          ChatIcons.getProtocolIconURI(this.conv.account.protocol)
        );
        ChatIcons.setProtocolIconOpacity(protoIcon, statusName);
      }
    }

    destroy() {
      if (this.conv) {
        this.conv.removeObserver(this.observer);
      }
      if (this.convView) {
        this.convView.destroy();
        this.convView.remove();
      }

      // If the conversation we are destroying was selected, we should
      // select something else, but the 'select' event handler of
      // the listbox will choke while updating the Chat tab title if
      // there are conversation nodes associated with a conversation
      // that no longer exists from the chat core's point of view, so
      // we do the actual selection change only after this conversation
      // item is fully destroyed and removed from the list.
      let newSelectedItem;
      const list = this.parentNode;
      if (list.selectedItem == this) {
        newSelectedItem = this.previousElementSibling;
      }

      if (this.log) {
        this.hidden = true;
        delete this.log;
      } else {
        this.remove();
        delete this.conv;
      }
      if (newSelectedItem) {
        list.selectedItem = newSelectedItem;
      }
    }

    closeConversation() {
      if (this.conv) {
        this.conv.close();
      } else {
        this.destroy();
      }
    }

    keyPress(event) {
      // If Enter or Return is pressed, focus the input box.
      if (event.keyCode == event.DOM_VK_RETURN) {
        this.convView.focus();
        return;
      }

      const accelKeyPressed =
        AppConstants.platform == "macosx" ? event.metaKey : event.ctrlKey;
      // If a character was typed or the accel+v copy shortcut was used,
      // focus the input box and resend the key event.
      if (
        event.charCode != 0 &&
        !event.altKey &&
        ((accelKeyPressed && event.charCode == "v".charCodeAt(0)) ||
          (!event.ctrlKey && !event.metaKey))
      ) {
        this.convView.focus();

        const clonedEvent = new KeyboardEvent("keypress", event);
        this.convView.editor.dispatchEvent(clonedEvent);
        event.preventDefault();
      }
    }

    /**
     * Replace the conversation that this item represents.
     *
     * @param {IMConversation} conv - Updated conversation this should
     *   represent.
     */
    changeConversation(conv) {
      this.conv?.removeObserver(this.observer);
      this.build(conv);
    }

    disconnectedCallback() {
      if (this.conv) {
        this.conv.removeObserver(this.observer);
        delete this.conv;
      }
    }
  }

  MozXULElement.implementCustomInterface(MozChatConvRichlistitem, [
    Ci.nsIDOMXULSelectControlItemElement,
  ]);

  customElements.define("chat-imconv-richlistitem", MozChatConvRichlistitem, {
    extends: "richlistitem",
  });
}
