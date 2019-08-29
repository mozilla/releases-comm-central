/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported loadErrorPrompt, toggleDetails */

function loadErrorPrompt() {
  let args = window.arguments[0].QueryInterface(Ci.nsIDialogParamBlock);
  document.getElementById("general-text").value = args.GetString(0);
  document.getElementById("error-code").value = args.GetString(1);
  document.getElementById("error-description").value = args.GetString(2);
  window.sizeToContent();
}
function toggleDetails() {
  let options = document.getElementById("details-box");
  if (options.collapsed) {
    options.collapsed = false;
  } else {
    options.collapsed = true;
  }
  window.sizeToContent();
}
