/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ["MatrixMessageContent"];

var { XPCOMUtils } = ChromeUtils.import("resource:///modules/imXPCOMUtils.jsm");
XPCOMUtils.defineLazyModuleGetters(this, {
  getHttpUriForMxc: "resource:///modules/matrix-sdk.jsm",
  EventType: "resource:///modules/matrix-sdk.jsm",
  MsgType: "resource:///modules/matrix-sdk.jsm",
});

const kRichBodiedTypes = [MsgType.Text, MsgType.Notice, MsgType.Emote];
const kHtmlFormat = "org.matrix.custom.html";
const kEmotePrefix = "/me ";
const kAttachmentTypes = [
  MsgType.Image,
  MsgType.File,
  MsgType.Audio,
  MsgType.Video,
];
XPCOMUtils.defineLazyGetter(this, "domParser", () => new DOMParser());
XPCOMUtils.defineLazyGetter(this, "TXTToHTML", function() {
  let cs = Cc["@mozilla.org/txttohtmlconv;1"].getService(Ci.mozITXTToHTMLConv);
  return aTxt => cs.scanTXT(aTxt, cs.kEntities);
});

/**
 * Gets the user-consumable URI to an attachment from an mxc URI and
 * potentially encrypted file.
 *
 * @param {IContent} content - Event content to get the attachment URL from.
 * @param {string} homeserverUrl - Homeserver URL to load the attachment from.
 * @returns {string} https or data URI to the attachment file.
 */
function getAttachmentUrl(content, homeserverUrl) {
  if (content.file?.v == "v2") {
    return getHttpUriForMxc(homeserverUrl, content.file.url);
    //TODO Actually handle encrypted file contents.
  }
  if (!content.url.startsWith("mxc:")) {
    // Ignore content not served by the homeserver's media repo
    return "";
  }
  return getHttpUriForMxc(homeserverUrl, content.url);
}

/**
 * Turn an attachment event into a link to the attached file.
 *
 * @param {IContent} content - The event contents.
 * @param {string} homeserverUrl - The base URL of the homeserver.
 * @returns {string} HTML string to link to the attachment.
 */
function formatMediaAttachment(content, homeserverUrl) {
  const realUrl = getAttachmentUrl(content, homeserverUrl);
  if (!realUrl) {
    return content.body;
  }
  return `<a href="${realUrl}">${content.body}</a>`;
}

/**
 * Format a user ID so it always gets a user tooltip.
 *
 * @param {string} userId - User ID to mention.
 * @param {DOMDocument} doc - DOM Document the mention will appear in.
 * @returns {HTMLSpanElement} Element to insert for the mention.
 */
function formatMention(userId, doc) {
  const ibPerson = doc.createElement("span");
  ibPerson.classList.add("ib-person");
  ibPerson.textContent = userId;
  return ibPerson;
}

/**
 * Get the raw text content of the reply event.
 *
 * @param {MatrixEvent} replyEvent - Event to quote.
 * @param {string} homeserverUrl - The base URL of the homeserver.
 * @param {string => MatrixEvent} getEvent - Get the event with the given ID.
 *  Used to fetch the replied to event.
 * @param {boolean} rich - When true prefers the HTML representation of the
 *  event body.
 * @returns {string} Formatted text body of the event to quote.
 */
function getReplyContent(replyEvent, homeserverUrl, getEvent, rich) {
  let replyContent =
    (rich &&
      MatrixMessageContent.getIncomingHTML(
        replyEvent,
        homeserverUrl,
        getEvent,
        false
      )) ||
    MatrixMessageContent.getIncomingPlain(
      replyEvent,
      homeserverUrl,
      getEvent,
      false
    );
  const isEmoteReply = replyEvent.getContent()?.msgtype == MsgType.Emote;
  if (replyContent.startsWith(kEmotePrefix) && isEmoteReply) {
    replyContent = `* ${replyEvent.getSender()} ${replyContent.slice(
      kEmotePrefix.length
    )} *`;
  }
  return replyContent;
}

/**
 * Adapts the formatted body of an event for display.
 *
 * @param {MatrixEvent} event - The event to format the body of.
 * @param {string} homeserverUrl - The base URL of the homeserver.
 * @param {(string) => MatrixEvent} getEvent - Get the event with the given ID.
 *  Used to fetch the replied to event.
 * @param {boolean} [includeReply=true] - If the message should contain the
 *  message it's replying to.
 * @returns {string} Formatted body of the event.
 */
function formatHTMLBody(event, homeserverUrl, getEvent, includeReply = true) {
  const content = event.getContent();
  const parsedBody = domParser.parseFromString(
    content.formatted_body,
    "text/html"
  );
  const textColors = parsedBody.querySelectorAll(
    "span[data-mx-color], font[data-mx-color]"
  );
  for (const coloredElement of textColors) {
    coloredElement.style.color = `#${coloredElement.dataset.mxColor}`;
    delete coloredElement.dataset.mxColor;
  }
  //TODO background color
  const userMentions = parsedBody.querySelectorAll(
    'a[href^="https://matrix.to/#/@"]'
  );
  for (const mention of userMentions) {
    let endIndex = mention.hash.indexOf("?");
    if (endIndex == -1) {
      endIndex = undefined;
    }
    const userId = mention.hash.slice(2, endIndex);
    const ibPerson = formatMention(userId, parsedBody);
    mention.replaceWith(ibPerson);
  }
  //TODO handle room mentions but avoid event permalinks
  const inlineImages = parsedBody.querySelectorAll("img");
  for (const image of inlineImages) {
    if (image.alt) {
      if (image.src.startsWith("mxc:")) {
        const link = parsedBody.createElement("a");
        link.href = getHttpUriForMxc(homeserverUrl, image.src);
        link.textContent = image.alt;
        if (image.title) {
          link.title = image.title;
        }
        image.replaceWith(link);
      } else {
        image.replaceWith(image.alt);
      }
    }
  }
  const reply = parsedBody.querySelector("mx-reply");
  if (reply) {
    if (includeReply && content.msgtype != MsgType.Emote) {
      const eventId = event.replyEventId;
      const replyEvent = getEvent(eventId);
      if (replyEvent) {
        let replyContent = getReplyContent(
          replyEvent,
          homeserverUrl,
          getEvent,
          true
        );
        const isEmoteReply = replyEvent.getContent()?.msgtype == MsgType.Emote;
        const newReply = parsedBody.createDocumentFragment();
        if (!isEmoteReply) {
          const replyTo = formatMention(replyEvent.getSender(), parsedBody);
          newReply.append(replyTo, ":");
        }
        const quote = parsedBody.createElement("blockquote");
        newReply.append(quote);
        // eslint-disable-next-line no-unsanitized/method
        quote.insertAdjacentHTML("afterbegin", replyContent);
        reply.replaceWith(newReply);
      } else {
        // Strip mx-reply from DOM
        reply.normalize();
        reply.replaceWith(...reply.childNodes);
      }
    } else {
      reply.remove();
    }
  }
  //TODO spoilers
  if (content.msgtype == MsgType.Emote) {
    parsedBody.body.insertAdjacentText("afterbegin", kEmotePrefix);
  }
  return parsedBody.body.innerHTML;
}

var MatrixMessageContent = {
  /**
   * Format the plain text body of an incoming message for display.
   *
   * @param {MatrixEvent} event - Event to format the body of.
   * @param {string} homeserverUrl - The base URL of the homserver used to
   *  resolve mxc URIs.
   * @param {string => MatrixEvent} getEvent - Get the event with the given ID.
   *  Used to fetch the replied to event.
   * @param {boolean} [includeReply=true] - If the message should contain the
   *  message it's replying to.
   * @returns {string} Returns the formatted body ready for display or an empty
   *  string if formatting wasn't possible.
   */
  getIncomingPlain(event, homeserverUrl, getEvent, includeReply = true) {
    if (!event) {
      return "";
    }
    const type = event.getType();
    const content = event.getContent();
    if (type == EventType.RoomMessage) {
      if (kRichBodiedTypes.includes(content.msgtype)) {
        let body = TXTToHTML(content.body);
        const eventId = event.replyEventId;
        if (body.startsWith("&gt;") && eventId) {
          let nonQuote = Number.MAX_SAFE_INTEGER;
          const replyEvent = getEvent(eventId);
          if (!includeReply || replyEvent) {
            // Strip the fallback quote
            body = body
              .split("\n")
              .filter((line, index) => {
                const isQuoteLine = line.startsWith("&gt;");
                if (!isQuoteLine && nonQuote > index) {
                  nonQuote = index;
                }
                return nonQuote < index || !isQuoteLine;
              })
              .join("\n");
          }
          if (includeReply && replyEvent && content.msgtype != MsgType.Emote) {
            let replyContent = getReplyContent(
              replyEvent,
              homeserverUrl,
              getEvent,
              false
            );
            const isEmoteReply =
              replyEvent.getContent()?.msgtype == MsgType.Emote;
            replyContent = replyContent
              .split("\n")
              .map(line => `&gt; ${line}`)
              .join("\n");
            if (!isEmoteReply) {
              replyContent = `${replyEvent.getSender()}:
${replyContent}`;
            }
            body = replyContent + "\n" + body;
          }
        }
        if (content.msgtype == MsgType.Emote) {
          body = kEmotePrefix + body.trimStart();
        }
        return body;
      } else if (kAttachmentTypes.includes(content.msgtype)) {
        const attachmentUrl = getAttachmentUrl(content, homeserverUrl);
        if (attachmentUrl) {
          return attachmentUrl;
        }
      }
    } else if (type == EventType.Sticker) {
      const attachmentUrl = getAttachmentUrl(content, homeserverUrl);
      if (attachmentUrl) {
        return attachmentUrl;
      }
    }
    return TXTToHTML(content.body ?? "");
  },
  /**
   * Format the HTML body of an incoming message for display.
   *
   * @param {MatrixEvent} event - Event to format the body of.
   * @param {string} homeserverUrl - The base URL of the homserver used to
   *  resolve mxc URIs.
   * @param {string => MatrixEvent} getEvent - Get the event with the given ID.
   * @param {boolean} [includeReply=true] - If the message should contain the
   *  message it's replying to.
   * @returns {string} Returns a formatted body ready for display or an empty
   *  string if formatting wasn't possible.
   */
  getIncomingHTML(event, homeserverUrl, getEvent, includeReply = true) {
    if (!event) {
      return "";
    }
    const type = event.getType();
    const content = event.getContent();
    if (type == EventType.RoomMessage) {
      if (
        kRichBodiedTypes.includes(content.msgtype) &&
        content.format == kHtmlFormat &&
        content.formatted_body
      ) {
        return formatHTMLBody(event, homeserverUrl, getEvent, includeReply);
      } else if (kAttachmentTypes.includes(content.msgtype)) {
        return formatMediaAttachment(content, homeserverUrl);
      }
    } else if (type == EventType.Sticker) {
      return formatMediaAttachment(content, homeserverUrl);
    }
    return MatrixMessageContent.getIncomingPlain(
      event,
      homeserverUrl,
      getEvent
    );
  },
};
