/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PlacesUtils } from "resource://gre/modules/PlacesUtils.sys.mjs";

/**
 * Forces a url to open in an external application according to the protocol
 * service settings.
 *
 * @param {string|nsIURI} url - A url string or an nsIURI containing the url to
 *   open.
 */
export function openLinkExternally(url) {
  let uri = url;
  if (!(uri instanceof Ci.nsIURI)) {
    uri = Services.io.newURI(url);
  }

  // This can fail if there is a problem with the places database.
  PlacesUtils.history
    .insert({
      url, // accepts both string and nsIURI
      visits: [
        {
          date: new Date(),
        },
      ],
    })
    .catch(console.error);

  Cc["@mozilla.org/uriloader/external-protocol-service;1"]
    .getService(Ci.nsIExternalProtocolService)
    .loadURI(uri);
}

/**
 *
 * @param {string} query - The string to search for.
 */
export function openWebSearch(query) {
  return Services.search.init().then(async () => {
    const engine = await Services.search.getDefault();
    openLinkExternally(engine.getSubmission(query).uri.spec);

    Glean.mail.websearchUsage[engine.name.toLowerCase()].add(1);
  });
}

/**
 * Open a URL from a click listener in the UI only when the primary mouse button
 * is pressed.
 *
 * @param {string|nsIURI} url
 * @param {MouseEvent} event
 */
export function openUILink(url, event) {
  if (!event.button) {
    openLinkExternally(url);
  }
}
