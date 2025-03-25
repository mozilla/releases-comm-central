/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://gre/modules/Services.jsm");

function onLoad() {
  let args = window.arguments ? window.arguments[0] : null;
  if (!args) {
    return;
  }

  document.getElementById("ua-version").setAttribute("ua-value", args.ua);
  document.getElementById("version").setAttribute("value", args.version);

  let localizers = document.getElementById("localizers");
  if (args.authors.length > 0) {
    for (let author of args.authors) {
      let loc = document.createElement("label");
      loc.setAttribute("value", author);
      localizers.appendChild(loc);
    }
  } else {
    let localizersHeader = document.getElementById("localizers-header");
    localizersHeader.style.display = "none";
    localizers.style.display = "none";
  }

  if (window.opener) {
    // Force the window to be the right size now, not later.
    window.sizeToContent();

    // Position it centered over, but never up or left of parent.
    var opener = window.opener;
    var sx = Math.max((opener.outerWidth - window.outerWidth) / 2, 0);
    var sy = Math.max((opener.outerHeight - window.outerHeight) / 2, 0);
    window.moveTo(opener.screenX + sx, opener.screenY + sy);
  }

  /* Find and focus the dialog's default button (OK), otherwise the focus
   * lands on the first focusable content - the copy version link. Links in
   * XUL look horrible when focused.
   */
  var binding = document.documentElement;
  var defaultButton = binding.getButton(binding.defaultButton);
  if (defaultButton) {
    setTimeout(function () {
      defaultButton.focus();
    }, 0);
  }
}

function copyVersion(data) {
  var tr = Cc["@mozilla.org/widget/transferable;1"].createInstance(
    Ci.nsITransferable
  );
  var str = Cc["@mozilla.org/supports-string;1"].createInstance(
    Ci.nsISupportsString
  );

  tr.addDataFlavor("text/unicode");
  str.data = data;
  tr.setTransferData("text/unicode", str, str.data.length * 2);
  Services.clipboard.setData(tr, null, Services.clipboard.kGlobalClipboard);
}
