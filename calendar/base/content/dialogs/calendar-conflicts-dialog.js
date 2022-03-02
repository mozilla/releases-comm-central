/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals getPreviewForItem */ // From mouseoverPreviews.js

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

window.addEventListener("DOMContentLoaded", onLoad);

function onLoad() {
  let dialog = document.querySelector("dialog");
  let item = window.arguments[0].item;
  let vbox = getPreviewForItem(item, false);
  if (vbox) {
    document.getElementById("item-box").replaceWith(vbox);
  }

  let descr = document.getElementById("conflicts-description");

  // TODO These strings should move to Fluent.
  // For that matter, this dialog should be reworked!
  document.title = cal.l10n.getCalString("itemModifiedOnServerTitle");
  descr.textContent = cal.l10n.getCalString("itemModifiedOnServer");

  if (window.arguments[0].mode == "modify") {
    descr.textContent += cal.l10n.getCalString("modifyWillLoseData");
    dialog.getButton("accept").setAttribute("label", cal.l10n.getCalString("proceedModify"));
  } else {
    descr.textContent += cal.l10n.getCalString("deleteWillLoseData");
    dialog.getButton("accept").setAttribute("label", cal.l10n.getCalString("proceedDelete"));
  }

  dialog.getButton("cancel").setAttribute("label", cal.l10n.getCalString("updateFromServer"));
}

document.addEventListener("dialogaccept", () => {
  window.arguments[0].overwrite = true;
});

document.addEventListener("dialogcancel", () => {
  window.arguments[0].overwrite = false;
});
