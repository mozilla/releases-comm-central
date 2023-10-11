/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

export const IMServices = {};

// eslint-disable-next-line mozilla/lazy-getter-object-name
ChromeUtils.defineESModuleGetters(IMServices, {
  cmd: "resource:///modules/imCommands.sys.mjs",
  core: "resource:///modules/imCore.sys.mjs",
  logs: "resource:///modules/logger.sys.mjs",
});

XPCOMUtils.defineLazyServiceGetter(
  IMServices,
  "accounts",
  "@mozilla.org/chat/accounts-service;1",
  "imIAccountsService"
);
XPCOMUtils.defineLazyServiceGetter(
  IMServices,
  "contacts",
  "@mozilla.org/chat/contacts-service;1",
  "imIContactsService"
);
XPCOMUtils.defineLazyServiceGetter(
  IMServices,
  "conversations",
  "@mozilla.org/chat/conversations-service;1",
  "imIConversationsService"
);
XPCOMUtils.defineLazyServiceGetter(
  IMServices,
  "tags",
  "@mozilla.org/chat/tags-service;1",
  "imITagsService"
);
