/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global MozElements */
/* global MozXULElement */
/* global getBrowser */

// Wrap in a block to prevent leaking to window scope.
{
  var { IMServices } = ChromeUtils.importESModule(
    "resource:///modules/IMServices.sys.mjs"
  );
  const { ChatIcons } = ChromeUtils.importESModule(
    "resource:///modules/chatIcons.sys.mjs"
  );
  const LazyModules = {};

  ChromeUtils.defineESModuleGetters(LazyModules, {
    Status: "resource:///modules/imStatusUtils.sys.mjs",
  });

  /**
   * The MozChatTooltip widget implements a custom tooltip for chat. This tooltip
   * is used to display a rich tooltip when you mouse over contacts, channels
   * etc. in the chat view.
   *
   * @augments {XULPopupElement}
   */
  class MozChatTooltip extends MozElements.MozElementMixin(XULPopupElement) {
    static get inheritedAttributes() {
      return { ".displayName": "value=displayname" };
    }

    constructor() {
      super();
      this._buddy = null;

      this.observer = {
        // @see {nsIObserver}
        observe: (subject, topic, data) => {
          if (
            subject == this.buddy &&
            (topic == "account-buddy-status-changed" ||
              topic == "account-buddy-status-detail-changed" ||
              topic == "account-buddy-display-name-changed" ||
              topic == "account-buddy-icon-changed")
          ) {
            this.updateTooltipFromBuddy(this.buddy);
          } else if (
            topic == "user-info-received" &&
            data == this.observedUserInfo
          ) {
            this.updateTooltipInfo(
              subject.QueryInterface(Ci.nsISimpleEnumerator)
            );
          }
        },
        QueryInterface: ChromeUtils.generateQI([
          "nsIObserver",
          "nsISupportsWeakReference",
        ]),
      };

      this.addEventListener("popupshowing", event => {
        if (!this._onPopupShowing()) {
          event.preventDefault();
        }
      });

      this.addEventListener("popuphiding", () => {
        this.buddy = null;
        if ("observedUserInfo" in this && this.observedUserInfo) {
          Services.obs.removeObserver(this.observer, "user-info-received");
          delete this.observedUserInfo;
        }
      });
    }

    _onPopupShowing() {
      // No tooltip for elements that have already been removed.
      if (!this.triggerNode.parentNode) {
        return false;
      }

      let showHTMLTooltip = false;

      // Reset tooltip.
      const largeTooltip = this.querySelector(".largeTooltip");
      largeTooltip.hidden = false;
      this.removeAttribute("label");
      const htmlTooltip = this.querySelector(".htmlTooltip");
      htmlTooltip.hidden = true;

      this.hasBestAvatar = false;

      // We have a few cases that have special behavior. These are richlistitems
      // and have tooltip="<myid>".
      const item = this.triggerNode.closest(
        `[tooltip="${this.id}"] richlistitem`
      );

      // No tooltip on search results
      if (item?.hasAttribute("is-search-result")) {
        return false;
      }

      // No tooltip on the group headers
      if (item && item.matches(`:scope[is="chat-group-richlistitem"]`)) {
        return false;
      }

      if (item && item.matches(`:scope[is="chat-imconv-richlistitem"]`)) {
        return this.updateTooltipFromConversation(item.conv);
      }

      if (item && item.matches(`:scope[is="chat-contact-richlistitem"]`)) {
        return this.updateTooltipFromBuddy(
          item.contact.preferredBuddy.preferredAccountBuddy
        );
      }

      if (item) {
        const contactlistbox = document.getElementById("contactlistbox");
        const conv = contactlistbox.selectedItem.conv;
        return this.updateTooltipFromParticipant(
          item.chatBuddy.name,
          conv,
          item.chatBuddy
        );
      }

      // Tooltips are also used for the chat content, where we need to do
      // some more general checks.
      const elt = this.triggerNode;
      const classList = elt.classList;
      // ib-sender nicks are handled with _originalMsg if possible
      if (classList.contains("ib-nick") || classList.contains("ib-person")) {
        const conv = getBrowser()._conv;
        if (conv.isChat) {
          return this.updateTooltipFromParticipant(elt.textContent, conv);
        }
        if (!conv.isChat && elt.textContent == conv.name) {
          return this.updateTooltipFromConversation(conv);
        }
      }

      let sender = elt.textContent;
      let overrideAvatar = undefined;

      // Are we over a message?
      for (let node = elt; node; node = node.parentNode) {
        if (!node._originalMsg) {
          continue;
        }
        // Nick, build tooltip with original who information from message
        if (classList.contains("ib-sender")) {
          sender = node._originalMsg.who;
          overrideAvatar = node._originalMsg.iconURL;
          break;
        }
        // It's a message, so add a date/time tooltip.
        const date = new Date(node._originalMsg.time * 1000);
        let text;
        if (new Date().toDateString() == date.toDateString()) {
          const dateTimeFormatter = new Services.intl.DateTimeFormat(
            undefined,
            {
              timeStyle: "medium",
            }
          );
          text = dateTimeFormatter.format(date);
        } else {
          const dateTimeFormatter = new Services.intl.DateTimeFormat(
            undefined,
            {
              dateStyle: "short",
              timeStyle: "medium",
            }
          );
          text = dateTimeFormatter.format(date);
        }
        // Setting the attribute on this node means that if the element
        // we are pointing at carries a title set by the prpl,
        // that title won't be overridden.
        node.setAttribute("title", text);
        showHTMLTooltip = true;
        break;
      }

      if (classList.contains("ib-sender")) {
        const conv = getBrowser()._conv;
        if (conv.isChat) {
          return this.updateTooltipFromParticipant(
            sender,
            conv,
            undefined,
            overrideAvatar
          );
        }
        if (!conv.isChat && elt.textContent == conv.name) {
          return this.updateTooltipFromConversation(conv, overrideAvatar);
        }
      }

      largeTooltip.hidden = true;
      // Show the title in the tooltip
      if (showHTMLTooltip) {
        let content = this.triggerNode.getAttribute("title");
        if (!content) {
          const closestTitle = this.triggerNode.closest("[title]");
          if (closestTitle) {
            content = closestTitle.getAttribute("title");
          }
        }
        if (!content) {
          return false;
        }
        htmlTooltip.textContent = content;
        htmlTooltip.hidden = false;
        return true;
      }
      return false;
    }

    connectedCallback() {
      if (this.delayConnectedCallback()) {
        return;
      }
      this.textContent = "";
      this.appendChild(
        MozXULElement.parseXULToFragment(`
          <vbox class="largeTooltip">
            <html:div class="displayUserAccount tooltipDisplayUserAccount">
              <stack>
                <html:img class="userIcon" alt=""/>
                <html:img class="statusTypeIcon status" alt=""/>
              </stack>
              <html:div class="nameAndStatusGrid">
                <description class="displayName" crop="end"></description>
                <html:img class="protoIcon status" alt=""/>
                <html:hr />
                <description class="statusMessage" crop="end"></description>
              </html:div>
            </html:div>
            <html:table class="tooltipTable">
            </html:table>
          </vbox>
          <html:div class="htmlTooltip" hidden="hidden"></html:div>
        `)
      );
      this.initializeAttributeInheritance();
    }

    get bundle() {
      if (!this._bundle) {
        this._bundle = Services.strings.createBundle(
          "chrome://chat/locale/imtooltip.properties"
        );
      }
      return this._bundle;
    }

    set buddy(val) {
      if (val == this._buddy) {
        return;
      }

      if (!val) {
        this._buddy.buddy.removeObserver(this.observer);
      } else {
        val.buddy.addObserver(this.observer);
      }

      this._buddy = val;
    }

    get buddy() {
      return this._buddy;
    }

    get table() {
      if (!("_table" in this)) {
        this._table = this.querySelector(".tooltipTable");
      }
      return this._table;
    }

    setMessage(aMessage, noTopic = false) {
      const msg = this.querySelector(".statusMessage");
      msg.value = aMessage;
      msg.toggleAttribute("noTopic", noTopic);
    }

    reset() {
      while (this.table.hasChildNodes()) {
        this.table.lastChild.remove();
      }
    }

    /**
     * Add a row to the tooltip's table
     *
     * @param {string} aLabel - Label for the table row.
     * @param {string} aValue - Value for the table row.
     * @param {{label: boolean, value: boolean}} [l10nIds] - Treat the label
     *   and value as l10n IDs
     */
    addRow(aLabel, aValue, l10nIds = { label: false, value: false }) {
      let description;
      let row = [...this.table.querySelectorAll("tr")].find(row => {
        const th = row.querySelector("th");
        if (l10nIds?.label) {
          return th.dataset.l10nId == aLabel;
        }
        return th.textContent == aLabel;
      });
      if (!row) {
        // Create a new row for this label.
        row = document.createElementNS("http://www.w3.org/1999/xhtml", "tr");
        const th = document.createElementNS(
          "http://www.w3.org/1999/xhtml",
          "th"
        );
        if (l10nIds?.label) {
          document.l10n.setAttributes(th, aLabel);
        } else {
          th.textContent = aLabel;
        }
        th.setAttribute("valign", "top");
        row.appendChild(th);
        description = document.createElementNS(
          "http://www.w3.org/1999/xhtml",
          "td"
        );
        row.appendChild(description);
        this.table.appendChild(row);
      } else {
        // Row with this label already exists - just update.
        description = row.querySelector("td");
      }
      if (l10nIds?.value) {
        document.l10n.setAttributes(description, aValue);
      } else {
        description.textContent = aValue;
      }
    }

    addSeparator() {
      if (this.table.hasChildNodes()) {
        const lastElement = this.table.lastElementChild;
        lastElement.querySelector("th").classList.add("chatTooltipSeparator");
        lastElement.querySelector("td").classList.add("chatTooltipSeparator");
      }
    }

    requestBuddyInfo(aAccount, aObservedName) {
      // Libpurple prpls don't necessarily return data in response to
      // requestBuddyInfo that is suitable for displaying inside a
      // tooltip (e.g. too many objects, or <img> and <a> tags),
      // so we only use it for JavaScript prpls.
      // This is a terrible, terrible hack to work around the fact that
      // ClassInfo.implementationLanguage has gone.
      if (!aAccount.prplAccount || !aAccount.prplAccount.wrappedJSObject) {
        return;
      }
      this.observedUserInfo = aObservedName;
      Services.obs.addObserver(this.observer, "user-info-received");
      aAccount.requestBuddyInfo(aObservedName);
    }

    /**
     * Sets the shown user icon.
     *
     * @param {string|null} iconURI - The image uri to show, or "" to use the
     *   fallback, or null to hide the icon.
     * @param {boolean} useFallback - True if the "fallback" icon should be shown
     *   if iconUri isn't provided.
     */
    setUserIcon(iconUri, useFalback) {
      ChatIcons.setUserIconSrc(
        this.querySelector(".userIcon"),
        iconUri,
        useFalback
      );
    }

    setProtocolIcon(protocol) {
      this.querySelector(".protoIcon").setAttribute(
        "src",
        ChatIcons.getProtocolIconURI(protocol)
      );
    }

    setStatusIcon(statusName) {
      this.querySelector(".statusTypeIcon").setAttribute(
        "src",
        ChatIcons.getStatusIconURI(statusName)
      );
      ChatIcons.setProtocolIconOpacity(
        this.querySelector(".protoIcon"),
        statusName
      );
    }

    /**
     * Regenerate the tooltip based on a buddy.
     *
     * @param {prplIAccountBuddy} aBuddy - The buddy to generate the conversation.
     * @param {IMConversation} [aConv] - A conversation associated with this buddy.
     * @param {string} [overrideAvatar] - URL for the user avatar to use
     *  instead.
     */
    updateTooltipFromBuddy(aBuddy, aConv, overrideAvatar) {
      this.buddy = aBuddy;

      this.reset();
      const name = aBuddy.userName;
      const displayName = aBuddy.displayName;
      this.setAttribute("displayname", displayName);
      const account = aBuddy.account;
      this.setProtocolIcon(account.protocol);
      // If a conversation is provided, use the icon from it. Otherwise, use the
      // buddy icon filename.
      if (overrideAvatar) {
        this.setUserIcon(overrideAvatar, true);
        this.hasBestAvatar = true;
      } else if (aConv && !aConv.isChat) {
        this.setUserIcon(aConv.convIconFilename, true);
        this.hasBestAvatar = true;
      } else {
        this.setUserIcon(aBuddy.buddyIconFilename, true);
      }

      const statusType = aBuddy.statusType;
      this.setStatusIcon(LazyModules.Status.toAttribute(statusType));
      this.setMessage(
        LazyModules.Status.toLabel(statusType, aBuddy.statusText)
      );

      if (displayName != name) {
        this.addRow(this.bundle.GetStringFromName("buddy.username"), name);
      }

      this.addRow(this.bundle.GetStringFromName("buddy.account"), account.name);

      if (aBuddy.canVerifyIdentity) {
        const identityStatus = aBuddy.identityVerified
          ? "chat-buddy-identity-status-verified"
          : "chat-buddy-identity-status-unverified";
        this.addRow("chat-buddy-identity-status", identityStatus, {
          label: true,
          value: true,
        });
      }

      // Add encryption status.
      if (this.triggerNode.classList.contains("message-encrypted")) {
        this.addRow(
          this.bundle.GetStringFromName("encryption.tag"),
          this.bundle.GetStringFromName("message.status")
        );
      }

      this.requestBuddyInfo(account, aBuddy.normalizedName);

      const tooltipInfo = aBuddy.getTooltipInfo();
      if (tooltipInfo) {
        this.updateTooltipInfo(tooltipInfo);
      }
      return true;
    }

    updateTooltipInfo(aTooltipInfo) {
      for (const elt of aTooltipInfo) {
        switch (elt.type) {
          case Ci.prplITooltipInfo.pair:
          case Ci.prplITooltipInfo.sectionHeader:
            this.addRow(elt.label, elt.value);
            break;
          case Ci.prplITooltipInfo.sectionBreak:
            this.addSeparator();
            break;
          case Ci.prplITooltipInfo.status: {
            const statusType = parseInt(elt.label);
            this.setStatusIcon(LazyModules.Status.toAttribute(statusType));
            this.setMessage(LazyModules.Status.toLabel(statusType, elt.value));
            break;
          }
          case Ci.prplITooltipInfo.icon:
            if (!this.hasBestAvatar) {
              this.setUserIcon(elt.value);
            }
            break;
        }
      }
    }

    /**
     * Regenerate the tooltip based on a conversation.
     *
     * @param {IMConversation} aConv - The conversation to generate the tooltip from.
     * @param {string} [overrideAvatar] - URL for the user avatar to use
     *  instead if the conversation is a direct conversation.
     */
    updateTooltipFromConversation(aConv, overrideAvatar) {
      if (!aConv.isChat && aConv.buddy) {
        return this.updateTooltipFromBuddy(aConv.buddy, aConv, overrideAvatar);
      }

      this.reset();
      this.setAttribute("displayname", aConv.name);
      const account = aConv.account;
      this.setProtocolIcon(account.protocol);
      if (overrideAvatar && !aConv.isChat) {
        this.setUserIcon(overrideAvatar, true);
        this.hasBestAvatar = true;
      } else {
        // Set the icon, potentially showing a fallback icon if this is an IM.
        this.setUserIcon(aConv.convIconFilename, !aConv.isChat);
      }
      if (aConv.isChat) {
        if (!account.connected || aConv.left) {
          this.setStatusIcon("chat-left");
        } else {
          this.setStatusIcon("chat");
        }
        const topic = aConv.topic;
        const noTopic = !topic;
        this.setMessage(topic || aConv.noTopicString, noTopic);
      } else {
        this.setStatusIcon("unknown");
        this.setMessage(LazyModules.Status.toLabel("unknown"));
        // Last ditch attempt to get some tooltip info. This call relies on
        // the account's requestBuddyInfo implementation working correctly
        // with aConv.normalizedName.
        this.requestBuddyInfo(account, aConv.normalizedName);
      }
      this.addRow(this.bundle.GetStringFromName("buddy.account"), account.name);
      return true;
    }

    /**
     * Set the tooltip details based on a conversation participant.
     *
     * @param {string} aNick - Nick of the user this tooltip is for.
     * @param {prplIConversation} aConv - Conversation this tooltip is shown
     *  in.
     * @param {prplIConvChatBuddy} [aParticipant] - Participant to use instead
     *  of looking it up in the conversation by the passed nick.
     * @param {string} [overrideAvatar] - URL for the user avatar to use
     *  instead.
     */
    updateTooltipFromParticipant(aNick, aConv, aParticipant, overrideAvatar) {
      if (!aConv.target) {
        return false; // We're viewing a log.
      }
      if (!aParticipant) {
        aParticipant = aConv.target.getParticipant(aNick);
      }

      const account = aConv.account;
      const normalizedNick = aConv.target.getNormalizedChatBuddyName(aNick);
      // To try to ensure that we aren't misidentifying a nick with a
      // contact, we require at least that the normalizedChatBuddyName of
      // the nick is normalized like a normalizedName for contacts.
      if (normalizedNick == account.normalize(normalizedNick)) {
        const accountBuddy =
          IMServices.contacts.getAccountBuddyByNameAndAccount(
            normalizedNick,
            account
          );
        if (accountBuddy) {
          return this.updateTooltipFromBuddy(
            accountBuddy,
            aConv,
            overrideAvatar
          );
        }
      }

      this.reset();
      this.setAttribute("displayname", aNick);
      this.setProtocolIcon(account.protocol);
      this.setStatusIcon("unknown");
      this.setMessage(LazyModules.Status.toLabel("unknown"));
      this.setUserIcon(overrideAvatar ?? aParticipant?.buddyIconFilename, true);
      if (overrideAvatar) {
        this.hasBestAvatar = true;
      }

      if (aParticipant.canVerifyIdentity) {
        const identityStatus = aParticipant.identityVerified
          ? "chat-buddy-identity-status-verified"
          : "chat-buddy-identity-status-unverified";
        this.addRow("chat-buddy-identity-status", identityStatus, {
          label: true,
          value: true,
        });
      }

      this.requestBuddyInfo(account, normalizedNick);
      return true;
    }
  }
  customElements.define("chat-tooltip", MozChatTooltip, { extends: "tooltip" });
}
