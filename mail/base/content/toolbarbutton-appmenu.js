/* This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global MozXULElement */

// Wrap in a block to prevent leaking to window scope.
{
  /**
   * The MozToolbarButtonAppmenu is a toolbarbutton to display an appmenu
   * (a.k.a. hamburger menu) button.
   *
   * @extends MozToolbarbutton
   */
  class MozToolbarButtonAppmenu extends customElements.get("toolbarbutton") {
    constructor() {
      super();
      // While it would seem we could do this by handling oncommand, we can't
      // because any external oncommand handlers might get called before ours,
      // and then they would see the incorrect value of checked. Additionally
      // a command attribute would redirect the command events anyway.
      // Also, the appmenu-popup needs to be appended to the target 'Hamburger
      // button' dynamically at every button click (as opposed to appended
      // once in the binding's constructor) otherwise only one of the four
      // Hamburger buttons (on the Mail, Calendar, Tasks and Chat tabs) will
      // get the popup menu (namely, Mail). See Bug 890332.
      this.addEventListener("mousedown", (event) => {
        if (event.button != 0) {
          return;
        }
        this._setupAppmenu(event);
      });

      this.addEventListener("keypress", (event) => {
        this._setupAppmenu(event); }
      );
    }

    _setupAppmenu(event) {
      if (event.target == this) {
        let appmenuPopup = document.getElementById("appmenu-popup");
        if (this.lastChild != appmenuPopup) {
          this.appendChild(appmenuPopup);
        }
      }
    }
  }
  customElements.define("toolbarbutton-appmenu",
    MozToolbarButtonAppmenu, { extends: "toolbarbutton" }
  );
}
