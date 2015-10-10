/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource://gre/modules/Services.jsm");

var defaultOpen = window.open;
window.open = function(aUrl) {
  let uri = Services.io.newURI(aUrl, null, null);

  // http and https are the only schemes that are exposed even
  // though we don't handle them internally.
  if (!uri.schemeIs("http") && !uri.schemeIs("https"))
    defaultOpen.apply(this, arguments);
  else {
    Cc["@mozilla.org/uriloader/external-protocol-service;1"]
      .getService(Ci.nsIExternalProtocolService).loadUrl(uri);
  }
};
