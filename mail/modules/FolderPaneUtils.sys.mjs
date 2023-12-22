/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};
XPCOMUtils.defineLazyModuleGetters(lazy, {
  MailStringUtils: "resource:///modules/MailStringUtils.jsm",
});

export const FolderPaneUtils = {
  /**
   * Used for comparing folder names. This matches the collator used in
   * `nsMsgDBFolder::createCollationKeyGenerator`.
   * @type {Intl.Collator}
   */
  nameCollator: new Intl.Collator(undefined, {
    sensitivity: "base",
  }),

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
