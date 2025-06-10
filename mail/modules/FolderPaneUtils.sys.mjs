/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  MailStringUtils: "resource:///modules/MailStringUtils.sys.mjs",
});

export const FolderPaneUtils = {
  /**
   * Creates an identifier unique for the given mode name and folder URI.
   *
   * @param {string} modeName
   * @param {string} uri
   * @returns {string}
   */
  makeRowID(modeName, uri) {
    return `${modeName}-${btoa(lazy.MailStringUtils.stringToByteString(uri))}`;
  },
};
