/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

export var EnigmailURIs = {
  /**
   * Determine message number and folder from mailnews URI.
   *
   * @param {nsIURI} url - nsIURI of the message.
   * @returns {?object} obj
   * @returns {string} obj.msgNum - The message number, or "" if no URI scheme fits.
   * @returns {string} obj.folder - The folder (or newsgroup) name.
   */
  msgIdentificationFromUrl(url) {
    // sample URLs in Thunderbird
    // Local folder: mailbox:///some/path/to/folder?number=359360
    // IMAP: imap://user@host:port/fetch>some>path>111
    // NNTP: news://some.host/some.service.com?group=some.group.name&key=3510
    // also seen: e.g. mailbox:///some/path/to/folder?number=4455522&part=1.1.2&filename=test.eml
    // mailbox:///...?number=4455522&part=1.1.2&filename=test.eml&type=application/x-message-display&filename=test.eml
    // imap://user@host:port>UID>some>path>10?header=filter&emitter=js&examineEncryptedParts=true

    if (!url) {
      return null;
    }

    let msgNum = "";
    let msgFolder = "";

    const pathQueryRef = "path" in url ? url.path : url.pathQueryRef;

    if (url.schemeIs("mailbox")) {
      msgNum = pathQueryRef.replace(/(.*[?&]number=)([0-9]+)([^0-9].*)?/, "$2");
      msgFolder = pathQueryRef.replace(/\?.*/, "");
    } else if (url.schemeIs("file")) {
      msgNum = "0";
      msgFolder = pathQueryRef.replace(/\?.*/, "");
    } else if (url.schemeIs("imap")) {
      const p = unescape(pathQueryRef);
      msgNum = p.replace(/(.*>)([0-9]+)([^0-9].*)?/, "$2");
      msgFolder = p.replace(/\?.*$/, "").replace(/>[^>]+$/, "");
    } else if (url.schemeIs("news")) {
      msgNum = pathQueryRef.replace(/(.*[?&]key=)([0-9]+)([^0-9].*)?/, "$2");
      msgFolder = pathQueryRef.replace(/(.*[?&]group=)([^&]+)(&.*)?/, "$2");
    }

    return {
      msgNum,
      folder: msgFolder.toLowerCase(),
    };
  },
};
