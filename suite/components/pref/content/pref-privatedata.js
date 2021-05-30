/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function Startup() {
  let pref = document.getElementById("privacy.sanitize.sanitizeOnShutdown");
  updateClearOnShutdownBox(pref.valueFromPreferences);
}

/**
 * Disable/enable clear on shutdown items in dialog depending on general pref
 *  to clear on shutdown.
 */
function updateClearOnShutdownBox(aDisable) {
  let clearOnShutdownBox = document.getElementById("clearOnShutdownBox");
  for (let childNode of clearOnShutdownBox.childNodes) {
    childNode.disabled = !aDisable;
  }
}

/**
 * Displays a dialog from which individual parts of private data may be
 * cleared.
 */
function clearPrivateDataNow() {
  Cc["@mozilla.org/suite/suiteglue;1"]
    .getService(Ci.nsISuiteGlue)
    .sanitize(window);
}
