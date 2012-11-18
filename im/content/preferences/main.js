/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

if (!("Core" in window))
  Components.utils.import("resource:///modules/ibCore.jsm");

var gMainPane = {
  _pane: null,

  /**
   * Initialization of this.
   */
  init: function ()
  {
    this._pane = document.getElementById("paneMain");
  },

  /**
   * Displays the Add-ons Manager.
   */
  showAccountsMgr: function ()
  {
    Core.showAccounts();
  },

  /**
   * Displays the Add-ons Manager.
   */
  showAddonsMgr: function ()
  {
    Core.showAddons();
  }
};
