/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var propBag, args;

document.addEventListener("DOMContentLoaded", function() {
  compactDialogOnLoad();
});

function compactDialogOnLoad() {
  propBag = window.arguments[0]
    .QueryInterface(Ci.nsIWritablePropertyBag2)
    .QueryInterface(Ci.nsIWritablePropertyBag);

  // Convert to a JS object.
  args = {};
  for (let prop of propBag.enumerator) {
    args[prop.name] = prop.value;
  }

  document.l10n.setAttributes(
    document.getElementById("compactFoldersText"),
    "compact-dialog-message",
    { data: args.compactSize }
  );

  document.addEventListener("dialogaccept", function() {
    args.buttonNumClicked = 0;
    args.checked = document.getElementById("neverAskCheckbox").checked;
  });

  document.addEventListener("dialogcancel", function() {
    args.buttonNumClicked = 1;
  });

  document.addEventListener("dialogextra1", function() {
    // Open the support article URL and leave the dialog open.
    let uri = Services.io.newURI(
      "https://support.mozilla.org/kb/compacting-folders"
    );
    Cc["@mozilla.org/uriloader/external-protocol-service;1"]
      .getService(Ci.nsIExternalProtocolService)
      .loadURI(uri);
  });

  // Resize the window to the content after an arbitrary waiting for all the
  // content to load.
  setTimeout(() => {
    sizeToContent();
  }, 80);
}

function compactDialogOnUnload() {
  // Convert args back into property bag.
  for (let propName in args) {
    propBag.setProperty(propName, args[propName]);
  }
}
