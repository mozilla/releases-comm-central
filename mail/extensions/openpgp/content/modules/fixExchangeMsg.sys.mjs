/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.sys.mjs",
  EnigmailPersistentCrypto:
    "chrome://openpgp/content/modules/persistentCrypto.sys.mjs",
  EnigmailStreams: "chrome://openpgp/content/modules/streams.sys.mjs",
  getMimeTree: "chrome://openpgp/content/modules/MimeTree.sys.mjs",
});
ChromeUtils.defineLazyGetter(lazy, "log", () => {
  return console.createInstance({
    prefix: "openpgp",
    maxLogLevel: "Warn",
    maxLogLevelPref: "openpgp.loglevel",
  });
});

export var EnigmailFixExchangeMsg = {
  /*
   * Fix a broken message from MS-Exchange and replace it with the original message
   *
   * @param {nsIMsgDBHdr} hdr - Header of the message to fix (= pointer to message)
   * @param {string} brokenByApp - Type of app that created the message. Currently one of
   *   exchange, iPGMail.
   * @param {string} [destFolderUri] - Destination folder URI.
   * @returns {Promise<nsMsgKey>}
   */
  async fixExchangeMessage(hdr, brokenByApp, destFolderUri = null) {
    this.hdr = hdr;
    this.brokenByApp = brokenByApp;
    this.destFolderUri = destFolderUri;

    const fixedMsgData = await this.getMessageBody();

    this.ensureExpectedStructure(fixedMsgData);
    return lazy.EnigmailPersistentCrypto.copyMessageToFolder(
      this.hdr,
      this.destFolderUri,
      true,
      fixedMsgData,
      null
    );
  },

  /**
   * @returns {Promise<string>}
   */
  async getMessageBody() {
    return new Promise((resolve, reject) => {
      const url = lazy.EnigmailFuncs.getUrlFromUriSpec(
        this.hdr.folder.getUriForMsg(this.hdr)
      );
      const s = lazy.EnigmailStreams.newStringStreamListener(data => {
        const [good, errorCode, msg] = this.getRepairedMessage(data);
        if (!good) {
          reject(errorCode);
        } else {
          resolve(msg);
        }
      });

      try {
        const channel = lazy.EnigmailStreams.createChannel(url);
        channel.asyncOpen(s, null);
      } catch (e) {
        lazy.log.warn("Create channel FAILED.", e);
      }
    });
  },

  getRepairedMessage(data) {
    this.determineCreatorApp(data);

    const hdrEnd = data.search(/\r?\n\r?\n/);

    if (hdrEnd <= 0) {
      // cannot find end of header data
      return [false, 0, ""];
    }

    const hdrLines = data.substr(0, hdrEnd).split(/\r?\n/);
    const hdrObj = this.getFixedHeaderData(hdrLines);

    if (hdrObj.headers.length === 0 || hdrObj.boundary.length === 0) {
      return [false, 1, ""];
    }

    const boundary = hdrObj.boundary;
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
        lazy.log.warn(`Unknown appType to repair for: ${this.brokenByApp}`);
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

    const msgTree = lazy.getMimeTree(msgData, false);

    try {
      const isIPGMail =
        msgTree.subParts.length === 3 &&
        (msgTree.subParts[0].headers.get("content-type").type.toLowerCase() ===
          "text/plain" ||
          msgTree.subParts[0].headers.get("content-type").type.toLowerCase() ===
            "multipart/alternative") &&
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
   * Repair header data, such that they are working for PGP/MIME.
   *
   * @param {string} hdrLines - Input headers.
   * @returns {object} data
   * @returns {string} data.headers all headers ready for appending to message
   * @returns {string} data.boundary MIME part boundary (incl. surrounding "" or '')
   */
  getFixedHeaderData(hdrLines) {
    let headers = "";
    let boundary = "";

    for (let i = 0; i < hdrLines.length; i++) {
      if (hdrLines[i].search(/^content-type:/i) >= 0) {
        // Join the rest of the content type lines together.
        // See RFC 2425, section 5.8.1
        let contentTypeLine = hdrLines[i];
        i++;
        while (i < hdrLines.length) {
          let endOfCTL = false;
          // Does the line start with a space or a tab, followed by something else?
          if (hdrLines[i].search(/^[ \t]+?/) === 0) {
            contentTypeLine += hdrLines[i];
            i++;
            if (i == hdrLines.length) {
              endOfCTL = true;
            }
          } else {
            endOfCTL = true;
          }
          if (endOfCTL) {
            // we got the complete content-type header
            contentTypeLine = contentTypeLine.replace(/[\r\n]/g, "");
            const h = lazy.EnigmailFuncs.getHeaderData(contentTypeLine);
            boundary = h.boundary || "";
            break;
          }
        }
      } else {
        headers += hdrLines[i] + "\r\n";
      }
    }

    boundary = boundary.replace(/^(['"])(.*)(\1)$/, "$2");

    headers +=
      "Content-Type: multipart/encrypted;\r\n" +
      '  protocol="application/pgp-encrypted";\r\n' +
      '  boundary="' +
      boundary +
      '"\r\n' +
      "X-Enigmail-Info: Fixed broken PGP/MIME message\r\n";

    return { headers, boundary };
  },

  /**
   * Get corrected body for MS-Exchange messages.
   */
  getCorrectedExchangeBodyData(bodyData, boundary) {
    // Escape regex chars in the boundary.
    boundary = boundary.replace(/[.*+\-?^${}()|[\]\\]/g, "\\$&");
    const boundRx = new RegExp("^--" + boundary, "gm");
    let match = boundRx.exec(bodyData);

    if (match.index < 0) {
      return null;
    }

    const skipStart = match.index;
    // found first instance -- that's the message part to ignore
    match = boundRx.exec(bodyData);
    if (match.index <= 0) {
      return null;
    }

    const versionIdent = match.index;

    if (
      bodyData
        .substring(skipStart, versionIdent)
        .search(
          /^content-type:[ \t]*(text\/(plain|html)|multipart\/alternative)/im
        ) < 0
    ) {
      // First MIME part is not content-type text/plain or text/html.
      return null;
    }

    match = boundRx.exec(bodyData);
    if (match.index < 0) {
      // Did not find boundary of PGP/MIME encrypted data.
      return null;
    }

    const encData = match.index;
    const mimeHdr = Cc["@mozilla.org/messenger/mimeheaders;1"].createInstance(
      Ci.nsIMimeHeaders
    );
    mimeHdr.initialize(bodyData.substring(versionIdent, encData));
    let ct = mimeHdr.extractHeader("content-type", false);

    if (!ct || ct.search(/application\/pgp-encrypted/i) < 0) {
      // Wrong content-type of version-identification.
      return null;
    }

    mimeHdr.initialize(bodyData.substr(encData, 5000));
    ct = mimeHdr.extractHeader("content-type", false);
    if (!ct || ct.search(/application\/octet-stream/i) < 0) {
      // Wrong content-type of PGP/MIME data.
      return null;
    }

    return bodyData.substr(versionIdent);
  },

  /**
   * Get corrected body for iPGMail messages.
   */
  getCorrectediPGMailBodyData(bodyData, boundary) {
    // Escape regex chars.
    boundary = boundary.replace(/[.*+\-?^${}()|[\]\\]/g, "\\$&");
    const boundRx = new RegExp("^--" + boundary, "gm");
    let match = boundRx.exec(bodyData);

    if (match.index < 0) {
      // Did not find index of mime type to skip.
      return null;
    }

    // found first instance -- that's the message part to ignore
    match = boundRx.exec(bodyData);
    if (match.index <= 0) {
      // Did not find boundary of text/plain msg part.
      return null;
    }

    const encData = match.index;

    match = boundRx.exec(bodyData);
    if (match.index < 0) {
      // Did not find end boundary of PGP/MIME encrypted data.
      return null;
    }

    const mimeHdr = Cc["@mozilla.org/messenger/mimeheaders;1"].createInstance(
      Ci.nsIMimeHeaders
    );

    mimeHdr.initialize(bodyData.substr(encData, 5000));
    const ct = mimeHdr.extractHeader("content-type", false);
    if (!ct || ct.search(/application\/pgp-encrypted/i) < 0) {
      // Wrong content-type of PGP/MIME data.
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

  /**
   * @param {string} msgData - Data to check.
   * @throws {Error} if the message MIME structure is incorrect.
   */
  ensureExpectedStructure(msgData) {
    const msgTree = lazy.getMimeTree(msgData, true);

    // check message structure
    let ok =
      msgTree.headers.get("content-type").type.toLowerCase() ===
        "multipart/encrypted" &&
      msgTree.headers.get("content-type").get("protocol").toLowerCase() ===
        "application/pgp-encrypted" &&
      msgTree.subParts.length === 2 &&
      msgTree.subParts[0].headers.get("content-type").type.toLowerCase() ===
        "application/pgp-encrypted" &&
      msgTree.subParts[1].headers.get("content-type").type.toLowerCase() ===
        "application/octet-stream";

    if (ok) {
      // check for existence of PGP Armor
      const body = msgTree.subParts[1].body;
      const p0 = body.search(/^-----BEGIN PGP MESSAGE-----$/m);
      const p1 = body.search(/^-----END PGP MESSAGE-----$/m);

      ok = p0 >= 0 && p1 > p0 + 32;
    }
    if (!ok) {
      throw new Error("Unexpected MIME structure");
    }
  },
};
