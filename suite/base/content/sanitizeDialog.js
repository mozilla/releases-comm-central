/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Sanitizer } = ChromeUtils.import("resource:///modules/Sanitizer.jsm");

var gSanitizePromptDialog = {

  init() {
    var preferences = document.getElementById("sanitizePreferences").childNodes;
    for (var pref of preferences) {
      var name = pref.getAttribute("name");
      pref.checked = Sanitizer.willClearItem(name);
    }
  },

  onCommand(aEvent) {
    var item = aEvent.target.getAttribute("name");
    Sanitizer.setClearItem(item, aEvent.target.checked);

    var found = false;
    var preferences = document.getElementById("sanitizePreferences").childNodes;
    for (var pref of preferences) {
      if (pref.checked && !pref.disabled) {
        found = true;
        break;
      }
    }
    document.documentElement.getButton("accept").disabled = !found;
  },

  clearSettings() {
    Sanitizer.clearSettings();
  },
};
