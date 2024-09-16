/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";
import { EnigmailConstants } from "chrome://openpgp/content/modules/constants.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  EnigmailCore: "chrome://openpgp/content/modules/core.sys.mjs",
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.sys.mjs",
  EnigmailKeyRing: "chrome://openpgp/content/modules/keyRing.sys.mjs",
  EnigmailPersistentCrypto:
    "chrome://openpgp/content/modules/persistentCrypto.sys.mjs",
  EnigmailStreams: "chrome://openpgp/content/modules/streams.sys.mjs",
  MailStringUtils: "resource:///modules/MailStringUtils.sys.mjs",
  NetUtil: "resource://gre/modules/NetUtil.sys.mjs",
  getMimeTree: "chrome://openpgp/content/modules/MimeTree.sys.mjs",
  jsmime: "resource:///modules/jsmime.sys.mjs",
});
ChromeUtils.defineLazyGetter(lazy, "log", () => {
  return console.createInstance({
    prefix: "openpgp",
    maxLogLevel: "Warn",
    maxLogLevelPref: "openpgp.loglevel",
  });
});

const l10n = new Localization(["messenger/openpgp/openpgp.ftl"], true);

var gNewMailListenerInitiated = false;

/**
 * Filter action for creating a decrypted version of the mail and
 * deleting the original mail at the same time.
 */
const filterActionMoveDecrypt = {
  /**
   * @param {nsIMsgDBHdr[]} hdrs - Messages to apply to.
   * @param {string} actionValue - Action value.
   */
  async applyAction(hdrs, actionValue) {
    for (const msgHdr of hdrs) {
      await lazy.EnigmailPersistentCrypto.cryptMessage(
        msgHdr,
        actionValue,
        true,
        null
      );
    }
  },

  isValidForType() {
    return true;
  },

  validateActionValue(value) {
    // This code used to show the following warning text to the user:
    //   Warning - the filter action “Decrypt permanently” may lead
    //   to destroyed messages. We strongly recommend that you first try
    //   the “Create decrypted Copy” filter, test the result carefully,
    //   and only start using this filter once you are satisfied with
    //   the result.

    if (value === "") {
      return l10n.formatValueSync("filter-folder-required");
    }

    return null;
  },
};

/**
 * Filter action for creating a decrypted copy of the mail, leaving the original
 * message untouched.
 */
const filterActionCopyDecrypt = {
  /**
   * @param {nsIMsgDBHdr[]} hdrs - Messages to apply to.
   * @param {string} actionValue - Action value.
   */
  async applyAction(hdrs, actionValue) {
    for (const msgHdr of hdrs) {
      await lazy.EnigmailPersistentCrypto.cryptMessage(
        msgHdr,
        actionValue,
        false,
        null
      );
    }
  },

  isValidForType(_type) {
    return true;
  },

  validateActionValue(value) {
    if (value === "") {
      return l10n.formatValueSync("filter-folder-required");
    }
    return null;
  },
};

/**
 * Filter action for to encrypt a mail to a specific key.
 */
const filterActionEncrypt = {
  /**
   * @param {nsIMsgDBHdr[]} hdrs - Messages to apply to.
   * @param {string} actionValue - Action value.
   * @param {nsIMsgCopyServiceListener} listener
   */
  async applyAction(hdrs, actionValue, listener) {
    // Ensure KeyRing is loaded.
    lazy.EnigmailCore.init();
    lazy.EnigmailKeyRing.getAllKeys();

    let keyObj = lazy.EnigmailKeyRing.getKeyById(actionValue);

    if (keyObj === null) {
      const keyId = lazy.EnigmailKeyRing.getValidKeyForRecipient(actionValue);
      if (keyId) {
        keyObj = lazy.EnigmailKeyRing.getKeyById(keyId);
      }
    }

    if (keyObj === null && listener) {
      // No valid key, aborting.
      listener.onStartCopy();
      listener.onStopCopy(Cr.NS_ERROR_ABORT);
      return;
    }

    lazy.log.debug(`Encrypting to 0x${keyObj.id} - ${keyObj.userId}`);

    // Maybe skip messages here if they are already encrypted to
    // the target key? There might be some use case for unconditionally
    // encrypting here. E.g. to use the local preferences and remove all
    // other recipients.
    // Also not encrypting to already encrypted messages would make the
    // behavior less transparent as it's not obvious.

    for (const msgHdr of hdrs) {
      await lazy.EnigmailPersistentCrypto.cryptMessage(
        msgHdr,
        null /* same folder */,
        true /* move */,
        keyObj /* target key */
      );
    }
  },

  isValidForType() {
    return true;
  },

  validateActionValue(value) {
    // Initialize KeyRing. Ugly as it blocks the GUI but we need it.
    lazy.EnigmailCore.init();
    lazy.EnigmailKeyRing.getAllKeys();

    if (value === "") {
      return l10n.formatValueSync("filter-key-required");
    }

    let keyObj = lazy.EnigmailKeyRing.getKeyById(value);

    if (keyObj === null) {
      const keyId = lazy.EnigmailKeyRing.getValidKeyForRecipient(value);
      if (keyId) {
        keyObj = lazy.EnigmailKeyRing.getKeyById(keyId);
      }
    }

    if (keyObj === null) {
      return l10n.formatValueSync("filter-key-not-found", {
        desc: value,
      });
    }

    if (!keyObj.secretAvailable) {
      // We warn but we allow it. There might be use cases where
      // thunderbird + enigmail is used as a gateway filter with
      // the secret not available on one machine and the decryption
      // is intended to happen on different systems.
      l10n
        .formatValue("filter-warn-key-not-secret", {
          desc: value,
        })
        .then(value2 => {
          Services.prompt.alert(null, null, value2);
        });
    }
    return null;
  },
};

function isPGPEncrypted(data) {
  // We only check the first mime subpart for application/pgp-encrypted.
  // If it is text/plain or text/html we look into that for the
  // message marker.
  // If there are no subparts we just look in the body.
  //
  // This intentionally does not match more complex cases
  // with sub parts being encrypted etc. as auto processing
  // these kinds of mails will be error prone and better not
  // done through a filter

  var mimeTree = lazy.getMimeTree(data, true);
  if (!mimeTree.subParts.length) {
    // No subParts. Check for PGP Marker in Body
    return mimeTree.body.includes("-----BEGIN PGP MESSAGE-----");
  }

  // Check the type of the first subpart.
  var firstPart = mimeTree.subParts[0];
  var ct = firstPart.fullContentType;
  if (typeof ct == "string") {
    ct = ct.replace(/[\r\n]/g, " ");
    // Proper PGP/MIME ?
    if (ct.search(/application\/pgp-encrypted/i) >= 0) {
      return true;
    }
    // Look into text/plain pgp messages and text/html messages.
    if (ct.search(/text\/plain/i) >= 0 || ct.search(/text\/html/i) >= 0) {
      return firstPart.body.includes("-----BEGIN PGP MESSAGE-----");
    }
  }
  return false;
}

/**
 * Filter term for OpenPGP encrypted mail.
 */
const filterTermPGPEncrypted = {
  id: EnigmailConstants.FILTER_TERM_PGP_ENCRYPTED,
  name: l10n.formatValueSync("filter-term-pgpencrypted-label"),
  needsBody: true,
  match(aMsgHdr, searchValue, searchOp) {
    var folder = aMsgHdr.folder;
    var stream = folder.getMsgInputStream(aMsgHdr, {});

    var messageSize = folder.hasMsgOffline(aMsgHdr.messageKey)
      ? aMsgHdr.offlineMessageSize
      : aMsgHdr.messageSize;
    var data;
    try {
      data = lazy.NetUtil.readInputStreamToString(stream, messageSize);
    } catch (ex) {
      lazy.log.warn("Reading message data FAILED.", ex);
      // If we don't know better to return false.
      stream.close();
      return false;
    }

    var isPGP = isPGPEncrypted(data);

    stream.close();

    return (
      (searchOp == Ci.nsMsgSearchOp.Is && isPGP) ||
      (searchOp == Ci.nsMsgSearchOp.Isnt && !isPGP)
    );
  },

  getEnabled() {
    return true;
  },

  getAvailable() {
    return true;
  },

  getAvailableOperators(scope, length) {
    length.value = 2;
    return [Ci.nsMsgSearchOp.Is, Ci.nsMsgSearchOp.Isnt];
  },
};

function initNewMailListener() {
  if (!gNewMailListenerInitiated) {
    const notificationService = Cc[
      "@mozilla.org/messenger/msgnotificationservice;1"
    ].getService(Ci.nsIMsgFolderNotificationService);
    notificationService.addListener(
      newMailListener,
      notificationService.msgAdded
    );
  }
  gNewMailListenerInitiated = true;
}

function shutdownNewMailListener() {
  if (gNewMailListenerInitiated) {
    const notificationService = Cc[
      "@mozilla.org/messenger/msgnotificationservice;1"
    ].getService(Ci.nsIMsgFolderNotificationService);
    notificationService.removeListener(newMailListener);
    gNewMailListenerInitiated = false;
  }
}

function getIdentityForSender(senderEmail, msgServer) {
  const identities = MailServices.accounts.getIdentitiesForServer(msgServer);
  return identities.find(
    id => id.email.toLowerCase() === senderEmail.toLowerCase()
  );
}

var consumerList = [];

/** @see {MimeTreeEmitter} */
function JsmimeEmitter(requireBody) {
  this.requireBody = requireBody;
  this.mimeTree = {
    partNum: "",
    headers: null,
    body: "",
    parent: null,
    subParts: [],
  };
  this.stack = [];
  this.currPartNum = "";
}

JsmimeEmitter.prototype = {
  createPartObj(partNum, headers, parent) {
    return {
      partNum,
      headers,
      body: "",
      parent,
      subParts: [],
    };
  },

  getMimeTree() {
    return this.mimeTree.subParts[0];
  },

  startMessage() {
    this.currentPart = this.mimeTree;
  },
  endMessage() {},

  startPart(partNum, headers) {
    const newPart = this.createPartObj(partNum, headers, this.currentPart);

    if (partNum.indexOf(this.currPartNum) === 0) {
      // found sub-part
      this.currentPart.subParts.push(newPart);
    } else {
      // found same or higher level
      this.currentPart.subParts.push(newPart);
    }
    this.currPartNum = partNum;
    this.currentPart = newPart;
  },

  endPart(_partNum) {
    this.currentPart = this.currentPart.parent;
  },

  deliverPartData(partNum, data) {
    if (this.requireBody) {
      if (typeof data === "string") {
        this.currentPart.body += data;
      } else {
        this.currentPart.body +=
          lazy.MailStringUtils.uint8ArrayToByteString(data);
      }
    }
  },
};

function processIncomingMail(url, requireBody, aMsgHdr) {
  const inputStream = lazy.EnigmailStreams.newStringStreamListener(msgData => {
    const opt = {
      strformat: "unicode",
      bodyformat: "decode",
    };

    try {
      const e = new JsmimeEmitter(requireBody);
      const p = new lazy.jsmime.MimeParser(e, opt);
      p.deliverData(msgData);

      for (const c of consumerList) {
        try {
          c.consumeMessage(e.getMimeTree(), msgData, aMsgHdr);
        } catch (ex) {
          lazy.log.error("Processing incoming mail FAILED.", ex);
        }
      }
    } catch (ex) {}
  });

  try {
    const channel = lazy.EnigmailStreams.createChannel(url);
    channel.asyncOpen(inputStream, null);
  } catch (ex) {
    lazy.log.error("Opening channel FAILED.", ex);
  }
}

function getRequireMessageProcessing(aMsgHdr) {
  const isInbox =
    aMsgHdr.folder.getFlag(Ci.nsMsgFolderFlags.CheckNew) ||
    aMsgHdr.folder.getFlag(Ci.nsMsgFolderFlags.Inbox);
  let requireBody = false;
  let inboxOnly = true;
  let selfSentOnly = false;
  let processReadMail = false;

  for (const c of consumerList) {
    if (!c.incomingMailOnly) {
      inboxOnly = false;
    }
    if (!c.unreadOnly) {
      processReadMail = true;
    }
    if (!c.headersOnly) {
      requireBody = true;
    }
    if (c.selfSentOnly) {
      selfSentOnly = true;
    }
  }

  if (!processReadMail && aMsgHdr.isRead) {
    return null;
  }
  if (inboxOnly && !isInbox) {
    return null;
  }
  if (selfSentOnly) {
    const sender = lazy.EnigmailFuncs.parseEmails(aMsgHdr.author, true);
    let id = null;
    if (sender && sender[0]) {
      id = getIdentityForSender(sender[0].email, aMsgHdr.folder.server);
    }

    if (!id) {
      return null;
    }
  }

  const u = lazy.EnigmailFuncs.getUrlFromUriSpec(
    aMsgHdr.folder.getUriForMsg(aMsgHdr)
  );

  if (!u) {
    return null;
  }

  const op = u.spec.indexOf("?") > 0 ? "&" : "?";
  const url = u.spec + op + "header=enigmailFilter";

  return {
    url,
    requireBody,
  };
}

/** @implements {nsIMsgFolderListener} */
const newMailListener = {
  msgAdded(aMsgHdr) {
    if (consumerList.length === 0) {
      return;
    }

    const ret = getRequireMessageProcessing(aMsgHdr);
    if (ret) {
      processIncomingMail(ret.url, ret.requireBody, aMsgHdr);
    }
  },
};

export var EnigmailFilters = {
  onStartup() {
    const filterService = Cc[
      "@mozilla.org/messenger/services/filters;1"
    ].getService(Ci.nsIMsgFilterService);
    filterService.addCustomTerm(filterTermPGPEncrypted);
    initNewMailListener();
  },

  onShutdown() {
    shutdownNewMailListener();
  },

  /**
   * Add a new consumer to listen to new mails.
   *
   * @param {object} consumer - Consumer object to add.
   * @param {boolean} consumer.headersOnly - Needs full message body? [FUTURE]
   * @param {boolean} consumer.incomingMailOnly - Only work on folder(s) that
   *   obtain new mail (Inbox and folders that listen to new mail).
   * @param {boolean} consumer.unreadOnly - Only process unread mails
   * @param {boolean} consumer.selfSentOnly - Only process mails with sender
   *   Email == Account Email
   * @param {Function} consumer.consumeMessage - Callback function(mimeTreePart, rawMessageData, nsIMsgHdr)
   */
  addNewMailConsumer(consumer) {
    consumerList.push(consumer);
  },

  removeNewMailConsumer() {},

  moveDecrypt: filterActionMoveDecrypt,
  copyDecrypt: filterActionCopyDecrypt,
  encrypt: filterActionEncrypt,
};
