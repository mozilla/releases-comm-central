/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

/* eslint-enable valid-jsdoc */

var EXPORTED_SYMBOLS = ["EnigmailMsgRead"];

/**
 * Message-reading related functions
 */

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

const lazy = {};

XPCOMUtils.defineLazyModuleGetters(lazy, {
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.jsm",
  EnigmailKeyRing: "chrome://openpgp/content/modules/keyRing.jsm",
});

var EnigmailMsgRead = {
  /**
   * Ensure that Thunderbird prepares certain headers during message reading
   */
  ensureExtraAddonHeaders() {
    let hdr = Services.prefs.getCharPref("mailnews.headers.extraAddonHeaders");

    if (hdr !== "*") {
      // do nothing if extraAddonHeaders is "*" (all headers)
      for (const h of ["autocrypt", "openpgp"]) {
        if (hdr.search(h) < 0) {
          if (hdr.length > 0) {
            hdr += " ";
          }
          hdr += h;
        }
      }
      Services.prefs.setCharPref("mailnews.headers.extraAddonHeaders", hdr);
    }
  },

  /**
   * Get a mail URL from a uriSpec
   *
   * @param {string} uriSpec - URI of the desired message.
   *
   * @returns {nsIURI|nsIMsgMailNewsUrl|null}
   */
  getUrlFromUriSpec(uriSpec) {
    return lazy.EnigmailFuncs.getUrlFromUriSpec(uriSpec);
  },

  /**
   * Determine if an attachment is possibly signed
   */
  checkSignedAttachment(attachmentObj, index, currentAttachments) {
    function escapeRegex(string) {
      return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
    }

    var attachmentList;
    if (index !== null) {
      attachmentList = attachmentObj;
    } else {
      attachmentList = currentAttachments;
      for (let i = 0; i < attachmentList.length; i++) {
        if (attachmentList[i].url == attachmentObj.url) {
          index = i;
          break;
        }
      }
      if (index === null) {
        return false;
      }
    }

    var signed = false;
    var findFile;

    var attName = this.getAttachmentName(attachmentList[index])
      .toLowerCase()
      .replace(/\+/g, "\\+");

    // check if filename is a signature
    if (
      this.getAttachmentName(attachmentList[index]).search(/\.(sig|asc)$/i) >
        0 ||
      attachmentList[index].contentType.match(/^application\/pgp-signature/i)
    ) {
      findFile = new RegExp(escapeRegex(attName.replace(/\.(sig|asc)$/, "")));
    } else if (attName.search(/\.pgp$/i) > 0) {
      findFile = new RegExp(
        escapeRegex(attName.replace(/\.pgp$/, "")) + "(\\.pgp)?\\.(sig|asc)$"
      );
    } else {
      findFile = new RegExp(escapeRegex(attName) + "\\.(sig|asc)$");
    }

    for (const i in attachmentList) {
      if (
        i != index &&
        this.getAttachmentName(attachmentList[i])
          .toLowerCase()
          .search(findFile) === 0
      ) {
        signed = true;
      }
    }

    return signed;
  },

  /**
   * Get the name of an attachment from the attachment object
   */
  getAttachmentName(attachment) {
    return attachment.name;
  },

  /**
   * Escape text such that it can be used as HTML text
   */
  escapeTextForHTML(text, hyperlink) {
    // Escape special characters
    if (text.indexOf("&") > -1) {
      text = text.replace(/&/g, "&amp;");
    }

    if (text.indexOf("<") > -1) {
      text = text.replace(/</g, "&lt;");
    }

    if (text.indexOf(">") > -1) {
      text = text.replace(/>/g, "&gt;");
    }

    if (text.indexOf('"') > -1) {
      text = text.replace(/"/g, "&quot;");
    }

    if (!hyperlink) {
      return text;
    }

    // Hyperlink email addresses (we accept at most 1024 characters before and after the @)
    var addrs = text.match(
      /\b[A-Za-z0-9_+.-]{1,1024}@[A-Za-z0-9.-]{1,1024}\b/g
    );

    var newText, offset, loc;
    if (addrs && addrs.length) {
      newText = "";
      offset = 0;

      for (var j = 0; j < addrs.length; j++) {
        var addr = addrs[j];

        loc = text.indexOf(addr, offset);
        if (loc < offset) {
          break;
        }

        if (loc > offset) {
          newText += text.substr(offset, loc - offset);
        }

        // Strip any period off the end of address
        addr = addr.replace(/[.]$/, "");

        if (!addr.length) {
          continue;
        }

        newText += '<a href="mailto:' + addr + '">' + addr + "</a>";

        offset = loc + addr.length;
      }

      newText += text.substr(offset, text.length - offset);

      text = newText;
    }

    // Hyperlink URLs (we don't accept URLS or more than 1024 characters length)
    var urls = text.match(/\b(http|https|ftp):\S{1,1024}\s/g);

    if (urls && urls.length) {
      newText = "";
      offset = 0;

      for (var k = 0; k < urls.length; k++) {
        var url = urls[k];

        loc = text.indexOf(url, offset);
        if (loc < offset) {
          break;
        }

        if (loc > offset) {
          newText += text.substr(offset, loc - offset);
        }

        // Strip delimiters off the end of URL
        url = url.replace(/\s$/, "");
        url = url.replace(/([),.']|&gt;|&quot;)$/, "");

        if (!url.length) {
          continue;
        }

        newText += '<a href="' + url + '">' + url + "</a>";

        offset = loc + url.length;
      }

      newText += text.substr(offset, text.length - offset);

      text = newText;
    }

    return text;
  },

  /**
   * Match the key to the sender's from address.
   *
   * @param {string} keyId - Signing key ID
   * @param {string} fromAddr - Sender's email address.
   *
   * @returns {?Promise<String>} the matching email address
   */
  matchUidToSender(keyId, fromAddr) {
    if (!fromAddr || !keyId) {
      return null;
    }

    try {
      fromAddr = lazy.EnigmailFuncs.stripEmail(fromAddr).toLowerCase();
    } catch (ex) {
      console.debug(ex);
    }

    const keyObj = lazy.EnigmailKeyRing.getKeyById(keyId);
    if (!keyObj) {
      return null;
    }

    const userIdList = keyObj.userIds;

    try {
      for (let i = 0; i < userIdList.length; i++) {
        if (
          fromAddr ==
          lazy.EnigmailFuncs.stripEmail(userIdList[i].userId).toLowerCase()
        ) {
          const result = lazy.EnigmailFuncs.stripEmail(userIdList[i].userId);
          return result;
        }
      }
    } catch (ex) {
      console.debug(ex);
    }
    return null;
  },

  searchQuotedPgp(node) {
    if (
      node.nodeName.toLowerCase() === "blockquote" &&
      node.textContent.includes("-----BEGIN PGP ")
    ) {
      return true;
    }

    if (node.firstChild && this.searchQuotedPgp(node.firstChild)) {
      return true;
    }

    if (node.nextSibling && this.searchQuotedPgp(node.nextSibling)) {
      return true;
    }

    return false;
  },
};
