/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export const IMServices = {};

// eslint-disable-next-line mozilla/lazy-getter-object-name
ChromeUtils.defineESModuleGetters(IMServices, {
  accounts: "resource:///modules/imAccounts.sys.mjs",
  cmd: "resource:///modules/imCommands.sys.mjs",
  contacts: "resource:///modules/imContacts.sys.mjs",
  conversations: "resource:///modules/imConversations.sys.mjs",
  core: "resource:///modules/imCore.sys.mjs",
  logs: "resource:///modules/logger.sys.mjs",
  tags: "resource:///modules/imContacts.sys.mjs",
});
