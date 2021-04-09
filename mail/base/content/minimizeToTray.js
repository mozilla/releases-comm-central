/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals docShell, Services, windowState */

addEventListener("sizemodechange", () => {
  if (
    windowState == window.STATE_MINIMIZED &&
    Services.prefs.getBoolPref("mail.minimizeToTray", false)
  ) {
    setTimeout(() => {
      var bw = docShell.treeOwner.QueryInterface(Ci.nsIBaseWindow);
      Cc["@mozilla.org/messenger/osintegration;1"]
        .getService(Ci.nsIMessengerWindowsIntegration)
        .hideWindow(bw);
    });
  }
});
