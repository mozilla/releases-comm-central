/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export class MailMessageChild extends JSWindowActorChild {
  receiveMessage(message) {
    switch (message.name) {
      case "MailMessage:GetSelectionForQuoting":
        return this.getSelectionForQuoting();
    }
    return undefined;
  }

  /**
   * Returns the selection (as an HTML fragment) for quoting.
   *
   * @returns {string}
   */
  getSelectionForQuoting() {
    const selection = this.browsingContext.associatedWindow?.getSelection();
    if (!selection || selection.type != "Range") {
      return "";
    }

    const node = selection.focusNode;
    if (!node) {
      return "";
    }

    const requireMultipleWords = Services.prefs.getBoolPref(
      "mailnews.reply_quoting_selection.multi_word"
    );
    const charsOnlyIf = Services.prefs.getStringPref(
      "mailnews.reply_quoting_selection.only_if_chars"
    );

    if (requireMultipleWords || charsOnlyIf) {
      const plain = selection.toStringWithFormat(
        "text/plain",
        Ci.nsIDocumentEncoder.OutputRaw |
          Ci.nsIDocumentEncoder.SkipInvisibleContent,
        0
      );

      // If "mailnews.reply_quoting_selection.multi_word" is on, then there
      // must be at least two words selected in order to quote just the
      // selected text.
      if (requireMultipleWords) {
        if (!plain || !/\S\s+\S/.test(plain)) {
          return "";
        }
      }

      // If "mailnews.reply_quoting_selection.only_if_chars" has a value,
      // then at least one of the characters must be present in order to
      // quote just the selected text.
      if (charsOnlyIf) {
        let foundChar = false;
        for (const char of Array.from(charsOnlyIf)) {
          if (plain.includes(char)) {
            foundChar = true;
            break;
          }
        }
        if (!foundChar) {
          return "";
        }
      }
    }

    let html = selection.toStringWithFormat(
      "text/html",
      Ci.nsIDocumentEncoder.OutputRaw |
        Ci.nsIDocumentEncoder.SkipInvisibleContent,
      0
    );

    // Now remove <span class="moz-txt-citetags">&gt; </span>.
    let spanInd = html.indexOf(`<span class="moz-txt-citetags">`);
    while (spanInd != -1) {
      const endInd = html.indexOf("</span>", spanInd);
      if (endInd == -1) {
        break; // Oops, where is the closing tag gone?
      }
      html = html.substring(0, spanInd) + html.substring(endInd + 7);
      spanInd = html.indexOf(`<span class="moz-txt-citetags">`);
    }

    // Wrap in <pre> if it's an actual HTML <pre> block or a plain-text email.
    let isInPre = false;
    if (node.closest) {
      isInPre = node.closest("pre");
    } else {
      isInPre =
        node.parentNode.closest("pre") ||
        node.ownerDocument.querySelector(
          "body > div:first-of-type.moz-text-plain"
        );
    }
    if (isInPre) {
      return `<pre class="moz-quote-pre" wrap="">${html}</pre>`;
    }
    return html;
  }
}
