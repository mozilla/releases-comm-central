/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

window.addEventListener("close", event => {
  if (!Services.prefs.getBoolPref("mail.closeToTray", false)) {
    return;
  }

  // Only move to the tray when the last three-pane window is being closed.
  if (Array.from(Services.wm.getEnumerator("mail:3pane")).length > 1) {
    return;
  }

  event.preventDefault();

  const baseWindow = window.docShell.treeOwner.QueryInterface(Ci.nsIBaseWindow);
  Cc["@mozilla.org/messenger/osintegration;1"]
    .getService(Ci.nsIMessengerWindowsIntegration)
    .hideWindow(baseWindow);
});
