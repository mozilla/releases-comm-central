/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported launchBrowser */

var { openLinkExternally } = ChromeUtils.importESModule("resource:///modules/LinkHelper.sys.mjs");

/**
 * Launch the given url (string) in the external browser. If an event is passed,
 * then this is only done on left click and the event propagation is stopped.
 *
 * @param {string} url - The URL to open, as a string.
 * @param {Event} [event] - The event that caused the URL to open.
 */
function launchBrowser(url, event) {
  // Bail out if there is no URL set, an event was passed without left-click,
  // or the URL is already being handled by the MailLink actor.
  if (!url || (event && event.button != 0) || /^(mid|mailto|s?news):/i.test(url)) {
    return;
  }

  openLinkExternally(url, { addToHistory: false });

  // Make sure that any default click handlers don't do anything, we have taken
  // care of all processing
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
}
