/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var propBag, args;

var { openLinkExternally } = ChromeUtils.importESModule(
  "resource:///modules/LinkHelper.sys.mjs"
);

document.addEventListener("DOMContentLoaded", compactDialogOnDOMContentLoaded);
// Bug 1720540: Call sizeToContent only after the entire window has been loaded,
// including the shadow DOM and the updated fluent strings.
window.addEventListener("load", window.sizeToContent);
window.addEventListener("unload", compactDialogOnUnload);

function compactDialogOnDOMContentLoaded() {
  propBag = window.arguments[0]
    .QueryInterface(Ci.nsIWritablePropertyBag2)
    .QueryInterface(Ci.nsIWritablePropertyBag);

  // Convert to a JS object.
  args = {};
  for (const prop of propBag.enumerator) {
    args[prop.name] = prop.value;
  }

  // We're deliberately adding the data-l10n-args attribute synchronously to
  // avoid race issues for window.sizeToContent later on.
  document
    .getElementById("compactFoldersText")
    .setAttribute("data-l10n-args", JSON.stringify({ data: args.compactSize }));

  document.addEventListener("dialogaccept", function () {
    args.buttonNumClicked = 0;
    args.checked = document.getElementById("neverAskCheckbox").checked;
  });

  document.addEventListener("dialogcancel", function () {
    args.buttonNumClicked = 1;
  });

  document.addEventListener("dialogextra1", function () {
    // Open the support article URL and leave the dialog open.
    const uri = Services.io.newURI(
      "https://support.mozilla.org/kb/compacting-folders"
    );
    openLinkExternally(uri, { addToHistory: false });
  });
}

function compactDialogOnUnload() {
  // Convert args back into property bag.
  for (const propName in args) {
    propBag.setProperty(propName, args[propName]);
  }
}
