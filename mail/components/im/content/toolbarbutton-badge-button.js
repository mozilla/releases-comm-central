/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* globals MozXULElement */

// Wrap in a block to prevent leaking to window scope.
{
  /**
   * The MozBadgebutton widget is used to display a chat toolbar button in
   * the main Toolbox in the messenger window. It displays icon and label
   * for the button. It also shows a badge on top of the chat icon with a number.
   * That number is the count of unread messages in the chat.
   *
   * @augments MozToolbarbutton
   */
  class MozBadgebutton extends customElements.get("toolbarbutton") {
    static get inheritedAttributes() {
      return {
        ".toolbarbutton-icon": "src=image",
        ".toolbarbutton-text": "value=label,accesskey,crop",
      };
    }

    static get markup() {
      return `
      <stack>
        <html:img class="toolbarbutton-icon" alt="" />
        <html:span class="badgeButton-badge" hidden="hidden"></html:span>
      </stack>
      <label class="toolbarbutton-text" crop="end" flex="1"></label>
      `;
    }

    /**
     * toolbarbutton overwrites the fragment getter from MozXULElement.
     */
    static get fragment() {
      return Reflect.get(MozXULElement, "fragment", this);
    }

    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }
      this.setAttribute("is", "toolbarbutton-badge-button");
      this.appendChild(this.constructor.fragment);

      this._badgeCount = 0;
      this.initializeAttributeInheritance();
    }

    set badgeCount(count) {
      this._badgeCount = count;
      const badge = this.querySelector(".badgeButton-badge");
      badge.textContent = count;
      badge.hidden = count == 0;
    }

    get badgeCount() {
      return this._badgeCount;
    }
  }

  customElements.define("toolbarbutton-badge-button", MozBadgebutton, {
    extends: "toolbarbutton",
  });
}
