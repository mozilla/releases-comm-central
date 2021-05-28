/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* globals MozElements MozXULElement */

// Wrap in a block to prevent leaking to window scope.
{
  const { Services } = ChromeUtils.import("resource:///modules/imServices.jsm");
  const { XPCOMUtils } = ChromeUtils.import(
    "resource://gre/modules/XPCOMUtils.jsm"
  );
  const { ChatIcons } = ChromeUtils.import("resource:///modules/chatIcons.jsm");

  ChromeUtils.defineModuleGetter(this, "OTR", "resource:///modules/OTR.jsm");
  ChromeUtils.defineModuleGetter(
    this,
    "OTRUI",
    "resource:///modules/OTRUI.jsm"
  );

  XPCOMUtils.defineLazyGetter(this, "gOtrNotification", () => {
    return new MozElements.NotificationBox(element => {
      element.setAttribute("flex", "1");
      document.getElementById("otr-notification-box").append(element);
    });
  });

  /**
   * The MozChatConversationInfo widget displays information about a chat:
   * e.g. the channel name and topic of an IRC channel, or nick, user image and
   * status of a conversation partner.
   * It is typically shown at the top right of the chat UI.
   * @extends {MozXULElement}
   */
  class MozChatConversationInfo extends MozXULElement {
    static get inheritedAttributes() {
      return { ".displayName": "value=displayName" };
    }

    connectedCallback() {
      if (this.hasChildNodes() || this.delayConnectedCallback()) {
        return;
      }
      this.setAttribute("orient", "vertical");

      this.appendChild(
        MozXULElement.parseXULToFragment(`
          <linkset>
            <html:link rel="localization" href="messenger/otr/chat.ftl"/>
          </linkset>

          <html:div class="displayUserAccount">
            <stack>
              <html:img class="userIcon" alt="" />
              <html:img class="statusTypeIcon" alt="" />
            </stack>
            <html:div class="nameAndStatusGrid">
              <description class="displayName" crop="end"></description>
              <html:img class="protoIcon" alt="" />
              <html:hr />
              <description class="statusMessage" crop="end"></description>
              <!-- FIXME: A keyboard user cannot focus the hidden input, nor
                 - click the above description box in order to reveal it. -->
              <html:input class="statusMessageInput input-inline"
                          hidden="hidden"/>
            </html:div>
          </html:div>
          <hbox class="otr-container themeable-brighttext"
                align="middle"
                hidden="true">
            <label class="otr-label"
                   crop="end"
                   data-l10n-id="state-label"
                   flex="1"/>
            <toolbarbutton id="otrButton"
                           mode="dialog"
                           class="otr-button"
                           type="menu"
                           wantdropmarker="true"
                           label="Insecure"
                           data-l10n-id="start-tooltip">
              <menupopup class="otr-menu-popup">
                <menuitem class="otr-start" data-l10n-id="start-label"
                          oncommand='this.closest("chat-conversation-info").onOtrStartClicked();'/>
                <menuitem class="otr-end" data-l10n-id="end-label"
                          oncommand='this.closest("chat-conversation-info").onOtrEndClicked();'/>
                <menuitem class="otr-auth" data-l10n-id="auth-label"
                          oncommand='this.closest("chat-conversation-info").onOtrAuthClicked();'/>
              </menupopup>
            </toolbarbutton>
          </hbox>
          <hbox id="otr-notification-box"></hbox>
        `)
      );

      this.topicEditable = false;
      this.editingTopic = false;
      this.noTopic = false;

      this.topic.addEventListener("click", this.startEditTopic.bind(this));

      if (Services.prefs.getBoolPref("chat.otr.enable")) {
        let otrButton = this.querySelector(".otr-button");
        otrButton.addEventListener("command", this.otrButtonClicked);
        OTRUI.setNotificationBox(gOtrNotification);
      }
      this.initializeAttributeInheritance();
    }

    get topic() {
      return this.querySelector(".statusMessage");
    }

    get topicInput() {
      return this.querySelector(".statusMessageInput");
    }

    finishEditTopic(save) {
      if (!this.editingTopic) {
        return;
      }

      let panel = this.getSelectedPanel();
      let topic = this.topic;
      let topicInput = this.topicInput;
      topic.removeAttribute("hidden");
      topicInput.hidden = true;
      if (save) {
        // apply the new topic only if it is different from the current one
        if (topicInput.value != topicInput.getAttribute("value")) {
          panel._conv.topic = topicInput.value;
        }
      }
      this.editingTopic = false;

      topicInput.removeEventListener("keypress", this._topicKeyPress, true);
      delete this._topicKeyPress;
      topicInput.removeEventListener("blur", this._topicBlur);
      delete this._topicBlur;

      // After hiding the input, the focus is on an element that can't receive
      // keyboard events, so move it to somewhere else.
      // FIXME: jumping focus should be removed once editing the topic input
      // becomes accessible to keyboard users.
      panel.editor.focus();
    }

    topicKeyPress(event) {
      switch (event.keyCode) {
        case event.DOM_VK_RETURN:
          this.finishEditTopic(true);
          break;

        case event.DOM_VK_ESCAPE:
          this.finishEditTopic(false);
          event.stopPropagation();
          event.preventDefault();
          break;
      }
    }

    topicBlur(event) {
      if (event.target == this.topicInput) {
        this.finishEditTopic(true);
      }
    }

    startEditTopic() {
      let topic = this.topic;
      let topicInput = this.topicInput;
      if (!this.topicEditable || this.editingTopic) {
        return;
      }

      this.editingTopic = true;

      topicInput.hidden = false;
      topic.setAttribute("hidden", "true");
      this._topicKeyPress = this.topicKeyPress.bind(this);
      topicInput.addEventListener("keypress", this._topicKeyPress);
      this._topicBlur = this.topicBlur.bind(this);
      topicInput.addEventListener("blur", this._topicBlur);
      topicInput.getBoundingClientRect();
      if (this.noTopic) {
        topicInput.value = "";
      } else {
        topicInput.value = topic.value;
      }
      topicInput.select();
    }

    otrButtonClicked(aEvent) {
      aEvent.preventDefault();
      let otrMenu = this.querySelector(".otr-menu-popup");
      otrMenu.openPopup(otrMenu.parentNode, "after_start");
    }

    onOtrStartClicked() {
      // check if start-menu-command is disabled, if yes exit
      let convBinding = this.getSelectedPanel();
      let uiConv = convBinding._conv;
      let conv = uiConv.target;
      let context = OTR.getContext(conv);
      let bundleId =
        "alert-" +
        (context.msgstate === OTR.getMessageState().OTRL_MSGSTATE_ENCRYPTED
          ? "refresh"
          : "start");
      OTRUI.sendSystemAlert(uiConv, conv, bundleId);
      OTR.sendQueryMsg(conv);
    }

    onOtrEndClicked() {
      let convBinding = this.getSelectedPanel();
      let uiConv = convBinding._conv;
      let conv = uiConv.target;
      OTR.disconnect(conv, false);
      let bundleId = "alert-gone-insecure";
      OTRUI.sendSystemAlert(uiConv, conv, bundleId);
    }

    onOtrAuthClicked() {
      let convBinding = this.getSelectedPanel();
      let uiConv = convBinding._conv;
      let conv = uiConv.target;
      OTRUI.openAuth(window, conv.normalizedName, "start", uiConv);
    }

    getSelectedPanel() {
      for (let element of document.getElementById("conversationsBox")
        .children) {
        if (!element.hidden) {
          return element;
        }
      }
      return null;
    }

    /**
     * Sets the shown protocol icon.
     *
     * @param {prplIProtocol} protocol - The protocol to show.
     */
    setProtocol(protocol) {
      this.querySelector(".protoIcon").setAttribute(
        "src",
        ChatIcons.getProtocolIconURI(protocol)
      );
    }

    /**
     * Sets the shown user icon.
     *
     * @param {string|null} iconURI - The image uri to show, or "" to use the
     *   fallback, or null to hide the icon.
     * @param {boolean} useFallback - True if the "fallback" icon should be shown
     *   if iconUri isn't provided.
     */
    setUserIcon(iconURI, useFallback) {
      ChatIcons.setUserIconSrc(
        this.querySelector(".userIcon"),
        iconURI,
        useFallback
      );
    }

    /**
     * Sets the shown status icon.
     *
     * @param {string} statusName - The name of the status.
     */
    setStatusIcon(statusName) {
      let statusIcon = this.querySelector(".statusTypeIcon");
      if (statusName === null) {
        statusIcon.hidden = true;
        statusIcon.removeAttribute("src");
      } else {
        statusIcon.hidden = false;
        let src = ChatIcons.getStatusIconURI(statusName);
        if (src) {
          statusIcon.setAttribute("src", src);
        } else {
          /* Unexpected missing icon. */
          statusIcon.removeAttribute("src");
        }
      }
    }

    /**
     * Sets the text for the status of a user, or the topic of a chat.
     *
     * @param {string} text - The text to display.
     * @param {boolean} [noTopic=false] - Whether to stylize the status to
     *   indicate the status is some fallback text.
     */
    setStatusText(text, noTopic = false) {
      let statusEl = this.topic;

      statusEl.setAttribute("value", text);
      statusEl.setAttribute("tooltiptext", text);
      statusEl.toggleAttribute("noTopic", noTopic);
    }

    /**
     * Sets the element to display a user status. The user icon needs to be set
     * separately with setUserIcon.
     *
     * @param {string} statusName - The internal name for the status.
     * @param {string} statusText - The text to display as the status.
     */
    setStatus(statusName, statusText) {
      this.setStatusIcon(statusName);
      this.setStatusText(statusText);
      this.topicEditable = false;
    }

    /**
     * Sets the element to display a chat status.
     *
     * @param {string} topicText - The topic text for the chat, or some fallback
     *   text used if the chat has no topic.
     * @param {boolean} noTopic - Whether the chat has no topic.
     * @param {boolean} topicEditable - Whether the topic can be set by the
     *   user.
     */
    setAsChat(topicText, noTopic, topicEditable) {
      this.noTopic = noTopic;
      this.topicEditable = topicEditable;
      this.setStatusText(topicText, noTopic);
      this.setStatusIcon("chat");
    }

    /**
     * Empty the element's display.
     */
    clear() {
      this.querySelector(".protoIcon").removeAttribute("src");
      this.setStatusText("");
      this.setStatusIcon(null);
      this.setUserIcon("", false);
      this.topicEditable = false;
    }
  }
  customElements.define("chat-conversation-info", MozChatConversationInfo);
}
