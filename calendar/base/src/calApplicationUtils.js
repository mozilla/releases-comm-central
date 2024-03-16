/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported launchBrowser */

/**
 * Launch the given url (string) in the external browser. If an event is passed,
 * then this is only done on left click and the event propagation is stopped.
 *
 * @param url       The URL to open, as a string
 * @param event     (optional) The event that caused the URL to open
 */
function launchBrowser(url, event) {
  // Bail out if there is no url set, or an event was passed without left-click
  if (!url || (event && event.button != 0)) {
    return;
  }

  // 0. Prevent people from trying to launch URLs such as javascript:foo();
  //    by only allowing URLs starting with http or https or mid.
  // XXX: We likely will want to do this using nsIURLs in the future to
  //      prevent sneaky nasty escaping issues, but this is fine for now.
  if (!/^https?:/i.test(url) && !/^mid:/i.test(url)) {
    console.error(
      "launchBrowser: Invalid URL provided: " + url + " Only http(s):// and mid:// URLs are valid."
    );
    return;
  }

  if (/^mid:/i.test(url)) {
    const { MailUtils } = ChromeUtils.importESModule("resource:///modules/MailUtils.sys.mjs");
    MailUtils.openMessageByMessageId(url.slice(4));
    return;
  }

  Cc["@mozilla.org/uriloader/external-protocol-service;1"]
    .getService(Ci.nsIExternalProtocolService)
    .loadURI(Services.io.newURI(url));

  // Make sure that any default click handlers don't do anything, we have taken
  // care of all processing
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
}
