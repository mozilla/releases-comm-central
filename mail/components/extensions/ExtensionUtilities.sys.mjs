/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * The default time between events of the same kind, which should be collapsed
 * into a single WebExtension event.
 */
export const NOTIFICATION_COLLAPSE_TIME = 200;

/**
 * Returns the native messageManager group associated with the given WebExtension
 * linkHandler.
 *
 * @param {string} linkHandler
 * @returns {string}
 */
export function getMessageManagerGroup(linkHandler) {
  switch (linkHandler) {
    case "relaxed":
      return "browsers";
    case "strict":
      return "single-page";
    case "balanced":
    default:
      return "single-site";
  }
}
