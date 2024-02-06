/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailFilters"];

const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
const { EnigmailConstants } = ChromeUtils.import(
  "chrome://openpgp/content/modules/constants.jsm"
);

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  NetUtil: "resource://gre/modules/NetUtil.sys.mjs",
  getMimeTree: "chrome://openpgp/content/modules/mimeTree.sys.mjs",
});

XPCOMUtils.defineLazyModuleGetters(lazy, {
  EnigmailCore: "chrome://openpgp/content/modules/core.jsm",
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.jsm",
  EnigmailKeyRing: "chrome://openpgp/content/modules/keyRing.jsm",
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  EnigmailPersistentCrypto:
    "chrome://openpgp/content/modules/persistentCrypto.jsm",
  EnigmailStreams: "chrome://openpgp/content/modules/streams.jsm",
  jsmime: "resource:///modules/jsmime.jsm",
  MailStringUtils: "resource:///modules/MailStringUtils.jsm",
});

const l10n = new Localization(["messenger/openpgp/openpgp.ftl"], true);

var gNewMailListenerInitiated = false;

/**
 * filter action for creating a decrypted version of the mail and
 * deleting the original mail at the same time
 */

const filterActionMoveDecrypt = {
  async applyAction(aMsgHdrs, aActionValue, aListener, aType, aMsgWindow) {
    lazy.EnigmailLog.DEBUG(
      "filters.jsm: filterActionMoveDecrypt: Move to: " + aActionValue + "\n"
    );

    for (const msgHdr of aMsgHdrs) {
      await lazy.EnigmailPersistentCrypto.cryptMessage(
        msgHdr,
        aActionValue,
        true,
        null
      );
    }
  },

  isValidForType(type, scope) {
    return true;
  },

  validateActionValue(value, folder, type) {
    l10n.formatValue("filter-decrypt-move-warn-experimental").then(value => {
      Services.prompt.alert(null, null, value);
    });

    if (value === "") {
      return l10n.formatValueSync("filter-folder-required");
    }

    return null;
  },
};

/**
 * filter action for creating a decrypted copy of the mail, leaving the original
 * message untouched
 */
const filterActionCopyDecrypt = {
  async applyAction(aMsgHdrs, aActionValue, aListener, aType, aMsgWindow) {
    lazy.EnigmailLog.DEBUG(
      "filters.jsm: filterActionCopyDecrypt: Copy to: " + aActionValue + "\n"
    );

    for (const msgHdr of aMsgHdrs) {
      await lazy.EnigmailPersistentCrypto.cryptMessage(
        msgHdr,
        aActionValue,
        false,
        null
      );
    }
  },

  isValidForType(type, scope) {
    lazy.EnigmailLog.DEBUG(
      "filters.jsm: filterActionCopyDecrypt.isValidForType(" + type + ")\n"
    );

    const r = true;
    return r;
  },

  validateActionValue(value, folder, type) {
    lazy.EnigmailLog.DEBUG(
      "filters.jsm: filterActionCopyDecrypt.validateActionValue(" +
        value +
        ")\n"
    );

    if (value === "") {
      return l10n.formatValueSync("filter-folder-required");
    }

    return null;
  },
};

/**
 * filter action for to encrypt a mail to a specific key
 */
const filterActionEncrypt = {
  async applyAction(aMsgHdrs, aActionValue, aListener, aType, aMsgWindow) {
    // Ensure KeyRing is loaded.
    lazy.EnigmailCore.init();
    lazy.EnigmailKeyRing.getAllKeys();

    lazy.EnigmailLog.DEBUG(
      "filters.jsm: filterActionEncrypt: Encrypt to: " + aActionValue + "\n"
    );
    let keyObj = lazy.EnigmailKeyRing.getKeyById(aActionValue);

    if (keyObj === null) {
      lazy.EnigmailLog.DEBUG(
        "filters.jsm: failed to find key by id: " + aActionValue + "\n"
      );
      const keyId = lazy.EnigmailKeyRing.getValidKeyForRecipient(aActionValue);
      if (keyId) {
        keyObj = lazy.EnigmailKeyRing.getKeyById(keyId);
      }
    }

    if (keyObj === null && aListener) {
      lazy.EnigmailLog.DEBUG("filters.jsm: no valid key - aborting\n");

      aListener.OnStartCopy();
      aListener.OnStopCopy(1);

      return;
    }

    lazy.EnigmailLog.DEBUG(
      "filters.jsm: key to encrypt to: " +
        JSON.stringify(keyObj) +
        ", userId: " +
        keyObj.userId +
        "\n"
    );

    // Maybe skip messages here if they are already encrypted to
    // the target key? There might be some use case for unconditionally
    // encrypting here. E.g. to use the local preferences and remove all
    // other recipients.
    // Also not encrypting to already encrypted messages would make the
    // behavior less transparent as it's not obvious.

    for (const msgHdr of aMsgHdrs) {
      await lazy.EnigmailPersistentCrypto.cryptMessage(
        msgHdr,
        null /* same folder */,
        true /* move */,
        keyObj /* target key */
      );
    }
  },

  isValidForType(type, scope) {
    return true;
  },

  validateActionValue(value, folder, type) {
    // Initialize KeyRing. Ugly as it blocks the GUI but
    // we need it.
    lazy.EnigmailCore.init();
    lazy.EnigmailKeyRing.getAllKeys();

    lazy.EnigmailLog.DEBUG(
      "filters.jsm: validateActionValue: Encrypt to: " + value + "\n"
    );
    if (value === "") {
      return l10n.formatValueSync("filter-key-required");
    }

    let keyObj = lazy.EnigmailKeyRing.getKeyById(value);

    if (keyObj === null) {
      lazy.EnigmailLog.DEBUG(
        "filters.jsm: failed to find key by id. Looking for uid.\n"
      );
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
        .then(value => {
          Services.prompt.alert(null, null, value);
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
 * filter term for OpenPGP Encrypted mail
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
      lazy.EnigmailLog.DEBUG(
        "filters.jsm: filterTermPGPEncrypted: failed to get data.\n"
      );
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

  getEnabled(scope, op) {
    return true;
  },

  getAvailable(scope, op) {
    return true;
  },

  getAvailableOperators(scope, length) {
    length.value = 2;
    return [Ci.nsMsgSearchOp.Is, Ci.nsMsgSearchOp.Isnt];
  },
};

function initNewMailListener() {
  lazy.EnigmailLog.DEBUG("filters.jsm: initNewMailListener()\n");

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
  lazy.EnigmailLog.DEBUG("filters.jsm: shutdownNewMailListener()\n");

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

  /** JSMime API */
  startMessage() {
    this.currentPart = this.mimeTree;
  },
  endMessage() {},

  startPart(partNum, headers) {
    lazy.EnigmailLog.DEBUG(
      "filters.jsm: JsmimeEmitter.startPart: partNum=" + partNum + "\n"
    );
    //this.stack.push(partNum);
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

  endPart(partNum) {
    lazy.EnigmailLog.DEBUG(
      "filters.jsm: JsmimeEmitter.startPart: partNum=" + partNum + "\n"
    );
    this.currentPart = this.currentPart.parent;
  },

  deliverPartData(partNum, data) {
    lazy.EnigmailLog.DEBUG(
      "filters.jsm: JsmimeEmitter.deliverPartData: partNum=" + partNum + "\n"
    );
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
  lazy.EnigmailLog.DEBUG("filters.jsm: processIncomingMail()\n");

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
          lazy.EnigmailLog.DEBUG(
            "filters.jsm: processIncomingMail: exception: " +
              ex.toString() +
              "\n"
          );
        }
      }
    } catch (ex) {}
  });

  try {
    const channel = lazy.EnigmailStreams.createChannel(url);
    channel.asyncOpen(inputStream, null);
  } catch (e) {
    lazy.EnigmailLog.DEBUG(
      "filters.jsm: processIncomingMail: open stream exception " +
        e.toString() +
        "\n"
    );
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

  lazy.EnigmailLog.DEBUG(
    "filters.jsm: getRequireMessageProcessing: author: " + aMsgHdr.author + "\n"
  );

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

const newMailListener = {
  msgAdded(aMsgHdr) {
    lazy.EnigmailLog.DEBUG(
      "filters.jsm: newMailListener.msgAdded() - got new mail in " +
        aMsgHdr.folder.prettiestName +
        "\n"
    );

    if (consumerList.length === 0) {
      return;
    }

    const ret = getRequireMessageProcessing(aMsgHdr);
    if (ret) {
      processIncomingMail(ret.url, ret.requireBody, aMsgHdr);
    }
  },
};

/**
  messageStructure - Object:
    - partNum: String                       - MIME part number
    - headers: Object(nsIStructuredHeaders) - MIME part headers
    - body: String or typedarray            - the body part
    - parent: Object(messageStructure)      - link to the parent part
    - subParts: Array of Object(messageStructure) - array of the sub-parts
 */

var EnigmailFilters = {
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
   * add a new consumer to listen to new mails
   *
   * @param consumer - Object
   *   - headersOnly:      Boolean - needs full message body? [FUTURE]
   *   - incomingMailOnly: Boolean - only work on folder(s) that obtain new mail
   *                                  (Inbox and folders that listen to new mail)
   *   - unreadOnly:       Boolean - only process unread mails
   *   - selfSentOnly:     Boolean - only process mails with sender Email == Account Email
   *  - consumeMessage: function(messageStructure, rawMessageData, nsIMsgHdr)
   */
  addNewMailConsumer(consumer) {
    lazy.EnigmailLog.DEBUG("filters.jsm: addNewMailConsumer()\n");
    consumerList.push(consumer);
  },

  removeNewMailConsumer(consumer) {},

  moveDecrypt: filterActionMoveDecrypt,
  copyDecrypt: filterActionCopyDecrypt,
  encrypt: filterActionEncrypt,
};
