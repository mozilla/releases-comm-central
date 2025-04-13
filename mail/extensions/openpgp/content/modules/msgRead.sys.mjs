/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint-enable valid-jsdoc */

/**
 * OpenPGP message reading related functions.
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.sys.mjs",
  EnigmailKeyRing: "chrome://openpgp/content/modules/keyRing.sys.mjs",
});

export var EnigmailMsgRead = {
  /**
   * Ensure that Thunderbird prepares certain headers during message reading
   */
  ensureExtraAddonHeaders() {
    const prefName = "mailnews.headers.extraAddonHeaders";
    let hdr = Services.prefs.getCharPref(prefName);

    if (hdr !== "*") {
      let modified = false;
      // do nothing if extraAddonHeaders is "*" (all headers)
      for (const h of ["autocrypt", "openpgp"]) {
        if (hdr.search(h) < 0) {
          if (hdr.length > 0) {
            hdr += " ";
          }
          hdr += h;
          modified = true;
        }
      }
      if (modified) {
        Services.prefs.setCharPref(prefName, hdr);
      }
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
   * Determine if an we seem to have a signature included along side the
   * actual attachment.
   * That is, for an attachment:
   *  - foo.txt we should have a file foo.txt.sig or foo.txt.asc
   *  - foo.pgp we should have a file
   *     A) foo.sig or foo.asc or
   *     B) foo.pgp.sig or foo.pgp.asc
   *  - contentType is application/pgp-signature and the name is the same
   *
   * @param {AttachmentInfo} attachment - Attachment to check.
   * @param {AttachmentInfo[]} currentAttachments - The list of attachments in
   *   the mail.
   * @returns {?AttachmentInfo} The detached signature attachment, if any.
   */
  checkSignedAttachment(attachment, currentAttachments) {
    const baseName = attachment.name.replace(/\.pgp$/, "");
    const signatureRegex = new RegExp(
      `^${RegExp.escape(baseName)}(\\.pgp)?\\.(sig|asc)$`,
      "i"
    );
    return currentAttachments.find(
      a =>
        a !== attachment &&
        (signatureRegex.test(a.name) ||
          (a.contentType == "application/pgp-signature" &&
            a.name == attachment.name))
    );
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
   * @returns {?Promise<string>} the matching email address
   */
  matchUidToSender(keyId, fromAddr) {
    if (!fromAddr || !keyId) {
      return null;
    }

    try {
      fromAddr = lazy.EnigmailFuncs.stripEmail(fromAddr).toLowerCase();
    } catch (e) {}

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
          return lazy.EnigmailFuncs.stripEmail(userIdList[i].userId);
        }
      }
    } catch (e) {
      // stripEmail can throw
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
