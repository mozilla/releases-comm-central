/* This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global MozXULElement */

/**
 * The MozChatConversationInfo widget displays information about a chat:
 * e.g. the channel name and topic of an IRC channel, or nick, user image and
 * status of a conversation partner.
 * It is typically shown at the top right of the chat UI.
 * @extends {MozXULElement}
 */
class MozChatConversationInfo extends MozXULElement {
  static get observedAttributes() {
    return ["userIcon", "status", "typing", "statusTypeTooltiptext",
      "displayName", "prplIcon", "statusMessage", "statusTooltiptext",
      "topicEditable", "editing", "noTopic"];
  }

  connectedCallback() {
    this.appendChild(MozXULElement.parseXULToFragment(`
      <stack class="statusImageStack">
        <box class="userIconHolder">
          <image class="userIcon" mousethrough="always"></image>
        </box>
        <image class="statusTypeIcon"></image>
      </stack>
      <stack class="displayNameAndstatusMessageStack" mousethrough="always" flex="1">
        <hbox align="center" flex="1">
          <description class="displayName" flex="1" crop="end">
          </description>
          <image class="prplIcon"></image>
        </hbox>
        <description class="statusMessage" mousethrough="never" crop="end" flex="100000">
        </description>
      </stack>
    `));
    this.topic.addEventListener("click", this.startEditTopic.bind(this));
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (!this.firstChild) {
      return;
    }
    this._updateAttributes();
  }

  _updateAttributes() {
    let userIconHolder = this.querySelector(".userIconHolder");
    this.inheritAttribute(userIconHolder, "userIcon");

    let userIcon = this.querySelector(".userIcon");
    this.inheritAttribute(userIcon, "src=userIcon");

    let statusTypeIcon = this.querySelector(".statusTypeIcon");
    this.inheritAttribute(statusTypeIcon, "status");
    this.inheritAttribute(statusTypeIcon, "typing");
    this.inheritAttribute(statusTypeIcon, "tooltiptext=statusTypeTooltiptext");

    let displayName = this.querySelector(".displayName");
    this.inheritAttribute(displayName, "value=displayName");

    let prplIcon = this.querySelector(".prplIcon");
    this.inheritAttribute(prplIcon, "src=prplIcon");

    let description = this.querySelector(".statusMessage");
    this.inheritAttribute(description, "value=statusMessage");
    this.inheritAttribute(description, "tooltiptext=statusTooltiptext");
    this.inheritAttribute(description, "editable=topicEditable");
    this.inheritAttribute(description, "editing");
    this.inheritAttribute(description, "noTopic");
  }

  get topic() {
    return this.querySelector(".statusMessage");
  }

  finishEditTopic(save) {
    if (!this.hasAttribute("editing")) {
      return;
    }

    let panel = document.getElementById("conversationsDeck").selectedPanel;

    let elt = this.topic;
    if (save) {
      // apply the new topic only if it is different from the current one
      if (elt.value != elt.getAttribute("value")) {
        panel._conv.topic = elt.value;
      }
    }
    this.removeAttribute("editing");
    elt.removeEventListener("keypress", this._topicKeyPress, true);
    delete this._topicKeyPress;
    elt.removeEventListener("blur", this._topicBlur);
    delete this._topicBlur;

    // After removing the "editing" attribute, the focus is on an element
    // that can't receive keyboard events, so move it to somewhere else.
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
    if (event.originalTarget == this.topic.inputField) {
      this.finishEditTopic(true);
    }
  }

  startEditTopic() {
    let elt = this.topic;
    if (!elt.hasAttribute("editable") || this.hasAttribute("editing")) {
      return;
    }

    this.setAttribute("editing", "true");
    this._topicKeyPress = this.topicKeyPress.bind(this);
    elt.addEventListener("keypress", this._topicKeyPress);
    this._topicBlur = this.topicBlur.bind(this);
    elt.addEventListener("blur", this._topicBlur);
    elt.getBoundingClientRect();
    if (this.hasAttribute("noTopic")) {
      elt.value = "";
    }
    elt.select();
  }
}
customElements.define("chat-conversation-info", MozChatConversationInfo);
