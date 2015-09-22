/* -*- Mode: javascript; tab-width: 20; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/Services.jsm");

/**
 * Launch the given url (string) in the external browser. If an event is passed,
 * then this is only done on left click and the event propagation is stopped.
 *
 * @param url       The URL to open, as a string
 * @param event     (optional) The event that caused the URL to open
 */
function launchBrowser(url, event)
{
  // Bail out if there is no url set, or an event was passed without left-click
  if (!url || (event && event.button != 0)) {
    return;
  }

  // 0. Prevent people from trying to launch URLs such as javascript:foo();
  //    by only allowing URLs starting with http or https.
  // XXX: We likely will want to do this using nsIURLs in the future to
  //      prevent sneaky nasty escaping issues, but this is fine for now.
  if (!url.startsWith("http")) {
    Components.utils.reportError ("launchBrowser: " +
                                  "Invalid URL provided: " + url +
                                  " Only http:// and https:// URLs are valid.");
    return;
  }

  Components.classes["@mozilla.org/uriloader/external-protocol-service;1"]
            .getService(Components.interfaces.nsIExternalProtocolService)
            .loadUrl(Services.io.newURI(url, null, null));

  // Make sure that any default click handlers don't do anything, we have taken
  // care of all processing
  if (event) {
      event.stopPropagation();
      event.preventDefault();
  }
}
