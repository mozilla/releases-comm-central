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
   * That number is the count of unread messages in the chat. It also gets
   * filled blue when there are any unread messages.
   *
   * @extends MozToolbarbutton
   */
  class MozBadgebutton extends customElements.get("toolbarbutton") {
    static get inheritedAttributes() {
      return {
        ".toolbarbutton-icon": "validate,src=image,label",
        ".toolbarbutton-text": "value=label,accesskey,crop",
      };
    }
    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }
      this.setAttribute("is", "toolbarbutton-badge-button");
      this.appendChild(
        MozXULElement.parseXULToFragment(`
          <stack>
            <hbox>
              <image class="toolbarbutton-icon"></image>
            </hbox>
            <box class="badgeButton-badge">
              <label class="badgeButton-badgeLabel"></label>
            </box>
          </stack>
          <label class="toolbarbutton-text" crop="right" flex="1"></label>
        `)
      );

      this._badgeCount = 0;
      this.initializeAttributeInheritance();
    }

    set badgeCount(val) {
      this._setBadgeCount(val);
    }

    get badgeCount() {
      return this._badgeCount;
    }

    _setBadgeCount(aNewCount) {
      this._badgeCount = aNewCount;
      let badge = this.querySelector(".badgeButton-badgeLabel");
      badge.value = this._badgeCount;

      if (this._badgeCount > 0) {
        this.setAttribute("showingBadge", "true");
      } else {
        this.removeAttribute("showingBadge");
      }
    }
  }

  customElements.define("toolbarbutton-badge-button", MozBadgebutton, {
    extends: "toolbarbutton",
  });
}
