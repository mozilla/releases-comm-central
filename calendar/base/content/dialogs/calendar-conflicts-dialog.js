/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals getPreviewForItem */ // From mouseoverPreviews.js

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var lazy = {};
ChromeUtils.defineLazyGetter(lazy, "l10n", () => new Localization(["calendar/calendar.ftl"], true));
window.addEventListener("DOMContentLoaded", onLoad);

function onLoad() {
  const dialog = document.querySelector("dialog");
  const item = window.arguments[0].item;
  const vbox = getPreviewForItem(item, false);
  if (vbox) {
    document.getElementById("item-box").replaceWith(vbox);
  }

  const descr = document.getElementById("conflicts-description");

  // TODO This dialog should be reworked!
  descr.textContent = lazy.l10n.formatValueSync("item-modified-on-server");

  if (window.arguments[0].mode == "modify") {
    descr.textContent += lazy.l10n.formatValueSync("modify-will-lose-data");
    document.l10n.setAttributes(dialog.getButton("accept"), "proceed-modify");
  } else {
    descr.textContent += lazy.l10n.formatValueSync("delete-will-lose-data");
    document.l10n.setAttributes(dialog.getButton("accept"), "proceed-delete");
  }
}

document.addEventListener("dialogaccept", () => {
  window.arguments[0].overwrite = true;
});

document.addEventListener("dialogcancel", () => {
  window.arguments[0].overwrite = false;
});
