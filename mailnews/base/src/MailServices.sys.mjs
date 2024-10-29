/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

export var MailServices = {
  /**
   * Gets the `nsIMsgMessageService` for a given message URI. This should have
   * the same behaviour as `GetMessageServiceFromURI` (nsMsgUtils.cpp).
   *
   * @param {string} uri - The URI of a folder or message.
   * @returns {nsIMsgMessageService}
   */
  messageServiceFromURI(uri) {
    const index = uri.indexOf(":");
    if (index == -1) {
      throw new Components.Exception(
        `Bad message URI: ${uri}`,
        Cr.NS_ERROR_FAILURE
      );
    }

    let protocol = uri.substring(0, index);
    if (protocol == "file") {
      protocol = "mailbox";
    }
    return Cc[
      `@mozilla.org/messenger/messageservice;1?type=${protocol}`
    ].getService(Ci.nsIMsgMessageService);
  },

  /**
   * Get the necko URL for the given message URI.
   *
   * @param {string} messageURI - The URI of a message.
   * @returns {string}
   */
  neckoURLForMessageURI(messageURI) {
    const msgSvc = this.messageServiceFromURI(messageURI);
    const neckoURI = msgSvc.getUrlForUri(messageURI);
    return neckoURI.spec;
  },
};

XPCOMUtils.defineLazyServiceGetter(
  MailServices,
  "mailSession",
  "@mozilla.org/messenger/services/session;1",
  "nsIMsgMailSession"
);

XPCOMUtils.defineLazyServiceGetter(
  MailServices,
  "accounts",
  "@mozilla.org/messenger/account-manager;1",
  "nsIMsgAccountManager"
);

XPCOMUtils.defineLazyServiceGetter(
  MailServices,
  "pop3",
  "@mozilla.org/messenger/popservice;1",
  "nsIPop3Service"
);

XPCOMUtils.defineLazyServiceGetter(
  MailServices,
  "imap",
  "@mozilla.org/messenger/imapservice;1",
  "nsIImapService"
);

XPCOMUtils.defineLazyServiceGetter(
  MailServices,
  "nntp",
  "@mozilla.org/messenger/nntpservice;1",
  "nsINntpService"
);

XPCOMUtils.defineLazyServiceGetter(
  MailServices,
  "outgoingServer",
  "@mozilla.org/messengercompose/outgoingserverservice;1",
  "nsIMsgOutgoingServerService"
);

XPCOMUtils.defineLazyServiceGetter(
  MailServices,
  "compose",
  "@mozilla.org/messengercompose;1",
  "nsIMsgComposeService"
);

XPCOMUtils.defineLazyServiceGetter(
  MailServices,
  "ab",
  "@mozilla.org/abmanager;1",
  "nsIAbManager"
);

XPCOMUtils.defineLazyServiceGetter(
  MailServices,
  "copy",
  "@mozilla.org/messenger/messagecopyservice;1",
  "nsIMsgCopyService"
);

XPCOMUtils.defineLazyServiceGetter(
  MailServices,
  "mfn",
  "@mozilla.org/messenger/msgnotificationservice;1",
  "nsIMsgFolderNotificationService"
);

XPCOMUtils.defineLazyServiceGetter(
  MailServices,
  "headerParser",
  "@mozilla.org/messenger/headerparser;1",
  "nsIMsgHeaderParser"
);

XPCOMUtils.defineLazyServiceGetter(
  MailServices,
  "mimeConverter",
  "@mozilla.org/messenger/mimeconverter;1",
  "nsIMimeConverter"
);

XPCOMUtils.defineLazyServiceGetter(
  MailServices,
  "tags",
  "@mozilla.org/messenger/tagservice;1",
  "nsIMsgTagService"
);

XPCOMUtils.defineLazyServiceGetter(
  MailServices,
  "filters",
  "@mozilla.org/messenger/services/filters;1",
  "nsIMsgFilterService"
);

XPCOMUtils.defineLazyServiceGetter(
  MailServices,
  "junk",
  "@mozilla.org/messenger/filter-plugin;1?name=bayesianfilter",
  "nsIJunkMailPlugin"
);

XPCOMUtils.defineLazyServiceGetter(
  MailServices,
  "newMailNotification",
  "@mozilla.org/newMailNotificationService;1",
  "mozINewMailNotificationService"
);

XPCOMUtils.defineLazyServiceGetter(
  MailServices,
  "folderLookup",
  "@mozilla.org/mail/folder-lookup;1",
  "nsIFolderLookupService"
);

// Clean up all of these references at shutdown, so that they don't appear as
// a memory leak in test logs.
Services.obs.addObserver(
  {
    observe() {
      for (const key of Object.keys(MailServices)) {
        delete MailServices[key];
      }
      Services.obs.removeObserver(this, "xpcom-shutdown");
    },
  },
  "xpcom-shutdown"
);
