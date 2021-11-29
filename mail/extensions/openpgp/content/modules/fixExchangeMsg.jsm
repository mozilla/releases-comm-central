/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailFixExchangeMsg"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.jsm",
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  EnigmailMime: "chrome://openpgp/content/modules/mime.jsm",
  EnigmailStreams: "chrome://openpgp/content/modules/streams.jsm",
  EnigmailPersistentCrypto:
    "chrome://openpgp/content/modules/persistentCrypto.jsm",
});

var EnigmailFixExchangeMsg = {
  /*
   * Fix a broken message from MS-Exchange and replace it with the original message
   *
   * @param {nsIMsgDBHdr} hdr        Header of the message to fix (= pointer to message)
   * @param {string} brokenByApp     Type of app that created the message. Currently one of
   *                                 exchange, iPGMail
   * @param {string} [destFolderUri] optional destination Folder URI
   *
   * @return {nsMsgKey}              upon success, the promise returns the messageKey
   */
  async fixExchangeMessage(hdr, brokenByApp, destFolderUri = null) {
    let msgUriSpec = hdr.folder.getUriForMsg(hdr);
    EnigmailLog.DEBUG(
      "fixExchangeMsg.jsm: fixExchangeMessage: msgUriSpec: " + msgUriSpec + "\n"
    );

    this.hdr = hdr;
    this.brokenByApp = brokenByApp;
    this.destFolderUri = destFolderUri;

    let messenger = Cc["@mozilla.org/messenger;1"].createInstance(
      Ci.nsIMessenger
    );
    this.msgSvc = messenger.messageServiceFromURI(msgUriSpec);

    let fixedMsgData = await this.getMessageBody();

    EnigmailLog.DEBUG(
      "fixExchangeMsg.jsm: fixExchangeMessage: got fixedMsgData\n"
    );
    this.ensureExpectedStructure(fixedMsgData);
    return EnigmailPersistentCrypto.copyMessageToFolder(
      this.hdr,
      this.destFolderUri,
      true,
      fixedMsgData,
      null
    );
  },

  getMessageBody() {
    EnigmailLog.DEBUG("fixExchangeMsg.jsm: getMessageBody:\n");

    var self = this;

    return new Promise(function(resolve, reject) {
      let url = EnigmailFuncs.getUrlFromUriSpec(
        self.hdr.folder.getUriForMsg(self.hdr)
      );

      EnigmailLog.DEBUG(
        "fixExchangeMsg.jsm: getting data from URL " + url + "\n"
      );

      let s = EnigmailStreams.newStringStreamListener(function(data) {
        EnigmailLog.DEBUG(
          "fixExchangeMsg.jsm: analyzeDecryptedData: got " +
            data.length +
            " bytes\n"
        );

        if (EnigmailLog.getLogLevel() > 5) {
          EnigmailLog.DEBUG(
            "*** start data ***\n'" + data + "'\n***end data***\n"
          );
        }

        let [good, errorCode, msg] = self.getRepairedMessage(data);

        if (!good) {
          reject(errorCode);
        } else {
          resolve(msg);
        }
      });

      try {
        let channel = EnigmailStreams.createChannel(url);
        channel.asyncOpen(s, null);
      } catch (e) {
        EnigmailLog.DEBUG(
          "fixExchangeMsg.jsm: getMessageBody: exception " + e + "\n"
        );
      }
    });
  },

  getRepairedMessage(data) {
    this.determineCreatorApp(data);

    let hdrEnd = data.search(/\r?\n\r?\n/);

    if (hdrEnd <= 0) {
      // cannot find end of header data
      return [false, 0, ""];
    }

    let hdrLines = data.substr(0, hdrEnd).split(/\r?\n/);
    let hdrObj = this.getFixedHeaderData(hdrLines);

    if (hdrObj.headers.length === 0 || hdrObj.boundary.length === 0) {
      return [false, 1, ""];
    }

    let boundary = hdrObj.boundary;
    let body;

    switch (this.brokenByApp) {
      case "exchange":
        body = this.getCorrectedExchangeBodyData(
          data.substr(hdrEnd + 2),
          boundary
        );
        break;
      case "iPGMail":
        body = this.getCorrectediPGMailBodyData(
          data.substr(hdrEnd + 2),
          boundary
        );
        break;
      default:
        EnigmailLog.ERROR(
          "fixExchangeMsg.jsm: getRepairedMessage: unknown appType " +
            this.brokenByApp +
            "\n"
        );
        return [false, 99, ""];
    }

    if (body) {
      return [true, 0, hdrObj.headers + "\r\n" + body];
    }
    return [false, 22, ""];
  },

  determineCreatorApp(msgData) {
    // perform extra testing if iPGMail is assumed
    if (this.brokenByApp === "exchange") {
      return;
    }

    let msgTree = EnigmailMime.getMimeTree(msgData, false);

    try {
      let isIPGMail =
        msgTree.subParts.length === 3 &&
        msgTree.subParts[0].headers.get("content-type").type.toLowerCase() ===
          "text/plain" &&
        msgTree.subParts[1].headers.get("content-type").type.toLowerCase() ===
          "application/pgp-encrypted" &&
        msgTree.subParts[2].headers.get("content-type").type.toLowerCase() ===
          "text/plain";

      if (!isIPGMail) {
        this.brokenByApp = "exchange";
      }
    } catch (x) {}
  },

  /**
   *  repair header data, such that they are working for PGP/MIME
   *
   *  @return: object: {
   *        headers:  String - all headers ready for appending to message
   *        boundary: String - MIME part boundary (incl. surrounding "" or '')
   *      }
   */
  getFixedHeaderData(hdrLines) {
    EnigmailLog.DEBUG(
      "fixExchangeMsg.jsm: getFixedHeaderData: hdrLines[]:'" +
        hdrLines.length +
        "'\n"
    );
    let r = {
      headers: "",
      boundary: "",
    };

    for (let i = 0; i < hdrLines.length; i++) {
      if (hdrLines[i].search(/^content-type:/i) >= 0) {
        // Join the rest of the content type lines together.
        // See RFC 2425, section 5.8.1
        let contentTypeLine = hdrLines[i];
        i++;
        while (i < hdrLines.length) {
          // Does the line start with a space or a tab, followed by something else?
          if (hdrLines[i].search(/^[ \t]+?/) === 0) {
            contentTypeLine += hdrLines[i];
            i++;
          } else {
            // we got the complete content-type header
            contentTypeLine = contentTypeLine.replace(/[\r\n]/g, "");
            let h = EnigmailFuncs.getHeaderData(contentTypeLine);
            r.boundary = h.boundary || "";
            break;
          }
        }
      } else {
        r.headers += hdrLines[i] + "\r\n";
      }
    }

    r.boundary = r.boundary.replace(/^(['"])(.*)(\1)$/, "$2");

    r.headers +=
      "Content-Type: multipart/encrypted;\r\n" +
      '  protocol="application/pgp-encrypted";\r\n' +
      '  boundary="' +
      r.boundary +
      '"\r\n' +
      "X-Enigmail-Info: Fixed broken PGP/MIME message\r\n";

    return r;
  },

  /**
   * Get corrected body for MS-Exchange messages
   */
  getCorrectedExchangeBodyData(bodyData, boundary) {
    EnigmailLog.DEBUG(
      "fixExchangeMsg.jsm: getCorrectedExchangeBodyData: boundary='" +
        boundary +
        "'\n"
    );
    // Escape regex chars in the boundary.
    boundary = boundary.replace(/[.*+\-?^${}()|[\]\\]/g, "\\$&");
    let boundRx = new RegExp("^--" + boundary, "gm");
    let match = boundRx.exec(bodyData);

    if (match.index < 0) {
      EnigmailLog.DEBUG(
        "fixExchangeMsg.jsm: getCorrectedExchangeBodyData: did not find index of mime type to skip\n"
      );
      return null;
    }

    let skipStart = match.index;
    // found first instance -- that's the message part to ignore
    match = boundRx.exec(bodyData);
    if (match.index <= 0) {
      EnigmailLog.DEBUG(
        "fixExchangeMsg.jsm: getCorrectedExchangeBodyData: did not find boundary of PGP/MIME version identification\n"
      );
      return null;
    }

    let versionIdent = match.index;

    if (
      bodyData
        .substring(skipStart, versionIdent)
        .search(/^content-type:[ \t]*text\/(plain|html)/im) < 0
    ) {
      EnigmailLog.DEBUG(
        "fixExchangeMsg.jsm: getCorrectedExchangeBodyData: first MIME part is not content-type text/plain or text/html\n"
      );
      return null;
    }

    match = boundRx.exec(bodyData);
    if (match.index < 0) {
      EnigmailLog.DEBUG(
        "fixExchangeMsg.jsm: getCorrectedExchangeBodyData: did not find boundary of PGP/MIME encrypted data\n"
      );
      return null;
    }

    let encData = match.index;
    let mimeHdr = Cc["@mozilla.org/messenger/mimeheaders;1"].createInstance(
      Ci.nsIMimeHeaders
    );
    mimeHdr.initialize(bodyData.substring(versionIdent, encData));
    let ct = mimeHdr.extractHeader("content-type", false);

    if (!ct || ct.search(/application\/pgp-encrypted/i) < 0) {
      EnigmailLog.DEBUG(
        "fixExchangeMsg.jsm: getCorrectedExchangeBodyData: wrong content-type of version-identification\n"
      );
      EnigmailLog.DEBUG("   ct = '" + ct + "'\n");
      return null;
    }

    mimeHdr.initialize(bodyData.substr(encData, 5000));
    ct = mimeHdr.extractHeader("content-type", false);
    if (!ct || ct.search(/application\/octet-stream/i) < 0) {
      EnigmailLog.DEBUG(
        "fixExchangeMsg.jsm: getCorrectedExchangeBodyData: wrong content-type of PGP/MIME data\n"
      );
      EnigmailLog.DEBUG("   ct = '" + ct + "'\n");
      return null;
    }

    return bodyData.substr(versionIdent);
  },

  /**
   * Get corrected body for iPGMail messages
   */
  getCorrectediPGMailBodyData(bodyData, boundary) {
    EnigmailLog.DEBUG(
      "fixExchangeMsg.jsm: getCorrectediPGMailBodyData: boundary='" +
        boundary +
        "'\n"
    );
    // Escape regex chars.
    boundary = boundary.replace(/[.*+\-?^${}()|[\]\\]/g, "\\$&");
    let boundRx = new RegExp("^--" + boundary, "gm");
    let match = boundRx.exec(bodyData);

    if (match.index < 0) {
      EnigmailLog.DEBUG(
        "fixExchangeMsg.jsm: getCorrectediPGMailBodyData: did not find index of mime type to skip\n"
      );
      return null;
    }

    // found first instance -- that's the message part to ignore
    match = boundRx.exec(bodyData);
    if (match.index <= 0) {
      EnigmailLog.DEBUG(
        "fixExchangeMsg.jsm: getCorrectediPGMailBodyData: did not find boundary of text/plain msg part\n"
      );
      return null;
    }

    let encData = match.index;

    match = boundRx.exec(bodyData);
    if (match.index < 0) {
      EnigmailLog.DEBUG(
        "fixExchangeMsg.jsm: getCorrectediPGMailBodyData: did not find end boundary of PGP/MIME encrypted data\n"
      );
      return null;
    }

    let mimeHdr = Cc["@mozilla.org/messenger/mimeheaders;1"].createInstance(
      Ci.nsIMimeHeaders
    );

    mimeHdr.initialize(bodyData.substr(encData, 5000));
    let ct = mimeHdr.extractHeader("content-type", false);
    if (!ct || ct.search(/application\/pgp-encrypted/i) < 0) {
      EnigmailLog.DEBUG(
        "fixExchangeMsg.jsm: getCorrectediPGMailBodyData: wrong content-type of PGP/MIME data\n"
      );
      EnigmailLog.DEBUG("   ct = '" + ct + "'\n");
      return null;
    }

    return (
      "--" +
      boundary +
      "\r\n" +
      "Content-Type: application/pgp-encrypted\r\n" +
      "Content-Description: PGP/MIME version identification\r\n\r\n" +
      "Version: 1\r\n\r\n" +
      bodyData
        .substring(encData, match.index)
        .replace(
          /^Content-Type: +application\/pgp-encrypted/im,
          "Content-Type: application/octet-stream"
        ) +
      "--" +
      boundary +
      "--\r\n"
    );
  },

  ensureExpectedStructure(msgData) {
    let msgTree = EnigmailMime.getMimeTree(msgData, true);

    // check message structure
    let ok =
      msgTree.headers.get("content-type").type.toLowerCase() ===
        "multipart/encrypted" &&
      msgTree.headers
        .get("content-type")
        .get("protocol")
        .toLowerCase() === "application/pgp-encrypted" &&
      msgTree.subParts.length === 2 &&
      msgTree.subParts[0].headers.get("content-type").type.toLowerCase() ===
        "application/pgp-encrypted" &&
      msgTree.subParts[1].headers.get("content-type").type.toLowerCase() ===
        "application/octet-stream";

    if (ok) {
      // check for existence of PGP Armor
      let body = msgTree.subParts[1].body;
      let p0 = body.search(/^-----BEGIN PGP MESSAGE-----$/m);
      let p1 = body.search(/^-----END PGP MESSAGE-----$/m);

      ok = p0 >= 0 && p1 > p0 + 32;
    }
    if (!ok) {
      throw new Error("unexpected MIME structure");
    }
  },
};
