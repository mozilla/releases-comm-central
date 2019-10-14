/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global MozXULElement */
/* global getBrowser */

// Wrap in a block to prevent leaking to window scope.
{
  let { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
  let { Status } = ChromeUtils.import("resource:///modules/imStatusUtils.jsm");

  /**
   * The MozChatTooltip widget implements a custom tooltip for chat. This tooltip
   * is used to display a rich tooltip when you mouse over contacts, channels
   * etc. in the chat view.
   * @extends {MozXULElement}
   */
  class MozChatTooltip extends MozXULElement {
    static get inheritedAttributes() {
      return {
        ".userIconHolder": "userIcon",
        ".userIcon": "src=userIcon",
        ".statusTypeIcon": "status,left",
        ".tooltipDisplayName": "value=displayname",
        ".tooltipProtoIcon": "src=iconPrpl,status",
        ".tooltipMessage": "noTopic",
      };
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
          Ci.nsIObserver,
          Ci.nsISupportsWeakReference,
        ]),
      };

      this.addEventListener("popupshowing", event => {
        if (!this._onPopupShowing()) {
          event.preventDefault();
        }
      });

      this.addEventListener("popuphiding", event => {
        this.buddy = null;
        this.removeAttribute("noTopic");
        this.removeAttribute("left");
        if ("observedUserInfo" in this && this.observedUserInfo) {
          Services.obs.removeObserver(this.observer, "user-info-received");
          delete this.observedUserInfo;
        }
      });
    }

    _onPopupShowing() {
      // No tooltip above the context menu.
      if (document.popupNode) {
        return false;
      }

      let elt = document.tooltipNode;
      // No tooltip for elements that have already been removed.
      if (!elt.parentNode) {
        return false;
      }

      // Reset tooltip.
      let largeTooltip = this.querySelector(".largeTooltip");
      largeTooltip.hidden = false;
      this.removeAttribute("label");

      let localName = elt.localName;

      if (
        localName == "richlistitem" &&
        elt.getAttribute("is") == "chat-group-richlistitem"
      ) {
        return false;
      }

      if (
        localName == "richlistitem" &&
        elt.getAttribute("is") == "chat-imconv-richlistitem" &&
        elt.conv
      ) {
        return this.updateTooltipFromConversation(elt.conv);
      }

      if (
        localName == "richlistitem" &&
        elt.getAttribute("is") == "chat-contact-richlistitem"
      ) {
        return this.updateTooltipFromBuddy(
          elt.contact.preferredBuddy.preferredAccountBuddy
        );
      }

      if (localName == "richlistitem") {
        let contactlistbox = document.getElementById("contactlistbox");
        let conv = contactlistbox.selectedItem.conv;
        return this.updateTooltipFromParticipant(
          elt.chatBuddy.name,
          conv,
          elt.chatBuddy
        );
      }

      let classList = elt.classList;
      if (
        classList.contains("ib-nick") ||
        classList.contains("ib-sender") ||
        classList.contains("ib-person")
      ) {
        let conv = getBrowser()._conv;
        if (conv.isChat) {
          return this.updateTooltipFromParticipant(elt.textContent, conv);
        }
        if (elt.textContent == conv.name) {
          return this.updateTooltipFromConversation(conv);
        }
      }

      // Are we over a message?
      for (let node = elt; node; node = node.parentNode) {
        if (!node._originalMsg) {
          continue;
        }
        // It's a message, so add a date/time tooltip.
        let date = new Date(node._originalMsg.time * 1000);
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
        break;
      }

      // Use the default content tooltip.
      largeTooltip.hidden = true;
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
            <hbox align="start" crop="end" flex="1">
              <vbox flex="1">
                <stack>
                  <!-- The box around the user icon is a workaround for bug 955673. -->
                  <box class="userIconHolder">
                    <image class="userIcon"></image>
                  </box>
                  <image class="statusTypeIcon status"></image>
                </stack>
                <spacer flex="1"></spacer>
              </vbox>
              <stack class="displayNameMessageBox" flex="1">
                <vbox flex="1">
                  <hbox align="start" flex="1">
                    <description class="tooltipDisplayName" flex="1" crop="end"></description>
                    <image class="tooltipProtoIcon status"></image>
                  </hbox>
                  <spacer flex="1"></spacer>
                </vbox>
                <description class="tooltipMessage"></description>
              </stack>
            </hbox>
            <html:table class="tooltipTable">
            </html:table>
          </vbox>
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
        return val;
      }

      if (!val) {
        this._buddy.buddy.removeObserver(this.observer);
      } else {
        val.buddy.addObserver(this.observer);
      }

      return (this._buddy = val);
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

    setBuddyIcon(aSrc) {
      let img = this.querySelector(".userIcon");
      if (aSrc) {
        img.setAttribute("userIcon", aSrc);
      } else {
        img.removeAttribute("userIcon");
      }
    }

    setMessage(aMessage) {
      // Setting the textContent directly allows text wrapping.
      let msg = this.querySelector(".tooltipMessage");
      msg.textContent = aMessage;
    }

    reset() {
      while (this.table.hasChildNodes()) {
        this.table.lastChild.remove();
      }
    }

    addRow(aLabel, aValue) {
      let description;
      let row = [...this.table.querySelectorAll("tr")].find(row => {
        return row.querySelector("th").textContent == aLabel;
      });
      if (!row) {
        // Create a new row for this label.
        row = document.createElementNS("http://www.w3.org/1999/xhtml", "tr");
        let th = document.createElementNS("http://www.w3.org/1999/xhtml", "th");
        th.textContent = aLabel;
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
      description.textContent = aValue;
    }

    addSeparator() {
      if (this.table.hasChildNodes()) {
        let lastElement = this.table.lastElementChild;
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
      if (!aAccount.prplAccount.wrappedJSObject) {
        return;
      }
      this.observedUserInfo = aObservedName;
      Services.obs.addObserver(this.observer, "user-info-received");
      aAccount.requestBuddyInfo(aObservedName);
    }

    updateTooltipFromBuddy(aBuddy) {
      this.buddy = aBuddy;

      this.reset();
      let name = aBuddy.userName;
      let displayName = aBuddy.displayName;
      this.setAttribute("displayname", displayName);
      let account = aBuddy.account;
      this.setAttribute("iconPrpl", account.protocol.iconBaseURI + "icon.png");
      this.setBuddyIcon(aBuddy.buddyIconFilename);

      let statusType = aBuddy.statusType;
      this.setAttribute("status", Status.toAttribute(statusType));
      this.setMessage(Status.toLabel(statusType, aBuddy.statusText));

      if (displayName != name) {
        this.addRow(this.bundle.GetStringFromName("buddy.username"), name);
      }

      this.addRow(this.bundle.GetStringFromName("buddy.account"), account.name);

      this.requestBuddyInfo(account, aBuddy.normalizedName);

      let tooltipInfo = aBuddy.getTooltipInfo();
      if (tooltipInfo) {
        this.updateTooltipInfo(tooltipInfo);
      }
      return true;
    }

    updateTooltipInfo(aTooltipInfo) {
      while (aTooltipInfo.hasMoreElements()) {
        let elt = aTooltipInfo.getNext().QueryInterface(Ci.prplITooltipInfo);
        switch (elt.type) {
          case Ci.prplITooltipInfo.pair:
          case Ci.prplITooltipInfo.sectionHeader:
            this.addRow(elt.label, elt.value);
            break;
          case Ci.prplITooltipInfo.sectionBreak:
            this.addSeparator();
            break;
          case Ci.prplITooltipInfo.status:
            let statusType = parseInt(elt.label);
            this.setAttribute("status", Status.toAttribute(statusType));
            this.setMessage(Status.toLabel(statusType, elt.value));
            break;
          case Ci.prplITooltipInfo.icon:
            this.setBuddyIcon(elt.value);
            break;
        }
      }
    }

    updateTooltipFromConversation(aConv) {
      if (!aConv.isChat && aConv.buddy) {
        return this.updateTooltipFromBuddy(aConv.buddy);
      }

      this.reset();
      this.setAttribute("displayname", aConv.name);
      let account = aConv.account;
      this.setAttribute("iconPrpl", account.protocol.iconBaseURI + "icon.png");
      this.setBuddyIcon(null);
      if (aConv.isChat) {
        this.setAttribute("status", "chat");
        if (!aConv.account.connected || aConv.left) {
          this.setAttribute("left", true);
        }
        let topic = aConv.topic;
        if (!topic) {
          this.setAttribute("noTopic", true);
          topic = aConv.noTopicString;
        }
        this.setMessage(topic);
      } else {
        this.setAttribute("status", "unknown");
        this.setMessage(Status.toLabel("unknown"));
        // Last ditch attempt to get some tooltip info. This call relies on
        // the account's requestBuddyInfo implementation working correctly
        // with aConv.normalizedName.
        this.requestBuddyInfo(account, aConv.normalizedName);
      }
      this.addRow(this.bundle.GetStringFromName("buddy.account"), account.name);
      return true;
    }

    updateTooltipFromParticipant(aNick, aConv, aParticipant) {
      if (!aConv.target) {
        return false; // We're viewing a log.
      }
      if (!aParticipant) {
        aParticipant = aConv.target.getParticipant(aNick);
      }

      let account = aConv.account;
      let normalizedNick = aConv.target.getNormalizedChatBuddyName(aNick);
      // To try to ensure that we aren't misidentifying a nick with a
      // contact, we require at least that the normalizedChatBuddyName of
      // the nick is normalized like a normalizedName for contacts.
      if (normalizedNick == account.normalize(normalizedNick)) {
        let accountBuddy = Services.contacts.getAccountBuddyByNameAndAccount(
          normalizedNick,
          account
        );
        if (accountBuddy) {
          return this.updateTooltipFromBuddy(accountBuddy);
        }
      }

      this.reset();
      this.setAttribute("displayname", aNick);
      this.setAttribute("iconPrpl", account.protocol.iconBaseURI + "icon.png");
      this.setAttribute("status", "unknown");
      this.setMessage(Status.toLabel("unknown"));
      this.setBuddyIcon(aParticipant ? aParticipant.buddyIconFilename : null);
      this.requestBuddyInfo(account, normalizedNick);
      return true;
    }
  }

  customElements.define("chat-tooltip", MozChatTooltip);
}
