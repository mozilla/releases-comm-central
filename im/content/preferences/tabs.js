/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var gTabsPane = {
  init: function ()
  {
    this.updateMUCWindowSetting();
    document.getElementById("warnCloseMultiple").hidden =
      !document.getElementById("messenger.conversations.alwaysClose").value;
  },

  updateMUCWindowSetting: function ()
  {
    document.getElementById("useSeparateWindowsForMUCs").disabled =
      !document.getElementById("messenger.conversations.openInTabs").value;
  }
};
