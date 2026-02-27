/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  openLinkExternally: "resource:///modules/LinkHelper.sys.mjs",
});

/**
 * Single row containing the details for an attachment.
 *
 * Template ID: #calendarDialogAttachmentTemplate
 *
 * @tagname calendar-dialog-attachment
 * @attribute {string} label - The displayed label for the attachment.
 * @attribute {string} url - The full URI pointing to the attachment.
 * @attribute {string} [icon] - The icon URL to display for the attachment.
 */
export default class CalendarDialogAttachment extends HTMLLIElement {
  static get observedAttributes() {
    return ["label", "url", "icon"];
  }

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;
    window.MozXULElement.insertFTLIfNeeded("messenger/calendarDialog.ftl");

    const template = document
      .getElementById("calendarDialogAttachmentTemplate")
      .content.cloneNode(true);

    this.append(template);
    this.setAttribute("is", "calendar-dialog-attachment");

    this.querySelector("a").addEventListener("click", this);
    if (this.hasAttribute("label")) {
      this.attributeChangedCallback("label", null, this.getAttribute("label"));
    }
    if (this.hasAttribute("url")) {
      this.attributeChangedCallback("url", null, this.getAttribute("url"));
    }
    if (this.hasAttribute("icon")) {
      this.attributeChangedCallback("icon", null, this.getAttribute("icon"));
    }
  }

  attributeChangedCallback(attribute, oldValue, newValue) {
    if (!this.hasConnected) {
      return;
    }
    switch (attribute) {
      case "label":
        this.querySelector("a").textContent = newValue;
        break;
      case "url":
        this.querySelector("a").href = newValue;
        break;
      case "icon": {
        const icon = this.querySelector(".attachment-icon");
        if (!newValue) {
          icon.src = "";
          icon.srcset = "";
        } else if (newValue.startsWith("moz-icon://")) {
          icon.src = "";
          icon.srcset = `${newValue}?size=16&scale=1 1x, ${newValue}?size=16&scale=2 2x, ${newValue}?size=16&scale=3 3x`;
        } else {
          icon.src = newValue;
          icon.srcset = "";
        }
      }
    }
  }

  handleEvent(event) {
    switch (event.type) {
      case "click":
        event.preventDefault();
        lazy.openLinkExternally(this.getAttribute("url"), {
          addToHistory: false,
        });
        break;
    }
  }
}

customElements.define("calendar-dialog-attachment", CalendarDialogAttachment, {
  extends: "li",
});
