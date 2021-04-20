/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// Dialog event listeners.
window.addEventListener("dialogaccept", onAccept);
window.addEventListener("load", init);

var gUndecided = null;
var gUnverified = null;

async function init() {
  let num = window.arguments[0].keys.length;
  let label = document.getElementById("importLabel");
  document.l10n.setAttributes(label, "do-import-multiple", { key: `(${num})` });

  // TODO: This should be changed to use data-l10n-id in the .xhtml
  // at a later time. We reuse strings on the 78 branch that don't have
  // the .label definition in the .ftl file.

  let [rUnd, rUnv] = await document.l10n.formatValues([
    { id: "openpgp-key-undecided" },
    { id: "openpgp-key-unverified" },
  ]);

  gUndecided = document.getElementById("acceptUndecided");
  gUndecided.label = rUnd;
  gUnverified = document.getElementById("acceptUnverified");
  gUnverified.label = rUnv;

  let keyList = document.getElementById("importKeyList");

  for (let key of window.arguments[0].keys) {
    let container = document.createXULElement("hbox");
    container.classList.add("key-import-row");

    let titleContainer = document.createXULElement("vbox");

    let id = document.createXULElement("label");
    id.classList.add("openpgp-key-id");
    id.value = key.fpr;
    titleContainer.appendChild(id);

    for (let uid of key.userIds) {
      let name = document.createXULElement("label");
      name.classList.add("openpgp-key-name");
      name.value = uid.userId;
      titleContainer.appendChild(name);
    }

    container.appendChild(titleContainer);
    keyList.appendChild(container);
  }

  sizeToContent();
}

function onAccept(event) {
  window.arguments[0].confirmed = true;
  if (gUndecided.selected) {
    window.arguments[0].acceptance = "undecided";
  } else if (gUnverified.selected) {
    window.arguments[0].acceptance = "unverified";
  } else {
    throw new Error("internal error, no expected radio button was selected");
  }
}
