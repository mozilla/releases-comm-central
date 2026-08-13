/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PhishingDetector } from "resource:///modules/PhishingDetector.sys.mjs";

export class MailMessageChild extends JSWindowActorChild {
  handleEvent(event) {
    switch (event.type) {
      case "click":
        this.onClick(event);
        break;
      case "resize":
        this.onResize(event);
        break;
    }
  }

  receiveMessage(message) {
    switch (message.name) {
      case "MailMessage:AnalyzeMessageBody":
        return PhishingDetector.analyzeMessageBody(this.document);
      case "MailMessage:GetSelectionForQuoting":
        return this.getSelectionForQuoting();
    }
    return undefined;
  }

  onClick(event) {
    const target = event.target;

    // Is this an image that we might want to scale?
    if (HTMLImageElement.isInstance(target) && target.src) {
      // Make sure it loaded successfully. No action if not or a broken link.
      const req = target.getRequest(Ci.nsIImageLoadingContent.CURRENT_REQUEST);
      if (!req || req.imageStatus & Ci.imgIRequest.STATUS_ERROR) {
        return;
      }

      // Is it an image?
      if (target.localName == "img" && target.hasAttribute("overflowing")) {
        event.preventDefault();
        target.toggleAttribute("shrinktofit");
      }
    }
  }

  onResize(event) {
    const win = event.target;
    const doc = win.document;
    // Bail out if it's http content or we don't have images.
    if (doc?.URL.startsWith("http") || !doc?.images) {
      return;
    }

    const availableWidth = Math.max(
      doc.body.scrollWidth,
      win.visualViewport.width
    );

    const adjustImg = img => {
      if (img.hasAttribute("shrinktofit")) {
        // overflowing: Whether the image is overflowing visible area.
        img.toggleAttribute("overflowing", img.naturalWidth > img.clientWidth);
      } else if (img.hasAttribute("overflowing")) {
        const isOverflowing = img.clientWidth >= availableWidth;
        img.toggleAttribute("overflowing", isOverflowing);
        img.toggleAttribute("shrinktofit", !isOverflowing);
      }
    };

    for (const img of doc.querySelectorAll(
      "img:is([shrinktofit],[overflowing])"
    )) {
      if (img.closest("[href]")) {
        continue;
      }
      if (!img.complete) {
        img.addEventListener("load", event => adjustImg(event.target), {
          once: true,
        });
      } else {
        adjustImg(img);
      }
    }
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
