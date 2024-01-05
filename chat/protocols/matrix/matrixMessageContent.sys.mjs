/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { l10nHelper } from "resource:///modules/imXPCOMUtils.sys.mjs";
import { MatrixSDK } from "resource:///modules/matrix-sdk.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  getMatrixTextForEvent: "resource:///modules/matrixTextForEvent.sys.mjs",
});
ChromeUtils.defineLazyGetter(lazy, "domParser", () => new DOMParser());
ChromeUtils.defineLazyGetter(lazy, "TXTToHTML", function () {
  const cs = Cc["@mozilla.org/txttohtmlconv;1"].getService(
    Ci.mozITXTToHTMLConv
  );
  return aTxt => cs.scanTXT(aTxt, cs.kEntities);
});
ChromeUtils.defineLazyGetter(lazy, "_", () =>
  l10nHelper("chrome://chat/locale/matrix.properties")
);

const kRichBodiedTypes = [
  MatrixSDK.MsgType.Text,
  MatrixSDK.MsgType.Notice,
  MatrixSDK.MsgType.Emote,
];
const kHtmlFormat = "org.matrix.custom.html";
const kAttachmentTypes = [
  MatrixSDK.MsgType.Image,
  MatrixSDK.MsgType.File,
  MatrixSDK.MsgType.Audio,
  MatrixSDK.MsgType.Video,
];

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
    return MatrixSDK.getHttpUriForMxc(homeserverUrl, content.file.url);
    //TODO Actually handle encrypted file contents.
  }
  if (!content.url.startsWith("mxc:")) {
    // Ignore content not served by the homeserver's media repo
    return "";
  }
  return MatrixSDK.getHttpUriForMxc(homeserverUrl, content.url);
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
  if (replyEvent.getContent()?.msgtype === MatrixSDK.MsgType.Emote) {
    replyContent = `* ${replyEvent.getSender()} ${replyContent} *`;
  }
  return replyContent;
}

/**
 * Adapts the plain text body of an event for display.
 *
 * @param {MatrixEvent} event - The event to format the body of.
 * @param {string} homeserverUrl - The base URL of the homeserver.
 * @param {(string) => MatrixEvent} getEvent - Get the event with the given ID.
 * @param {boolean} [includeReply=true] - If the message should contain the message it's replying to.
 * @returns {string} Plain text message for the event.
 */
function formatPlainBody(event, homeserverUrl, getEvent, includeReply = true) {
  const content = event.getContent();
  let body = lazy.TXTToHTML(content.body);
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
    if (
      includeReply &&
      replyEvent &&
      content.msgtype != MatrixSDK.MsgType.Emote
    ) {
      let replyContent = getReplyContent(
        replyEvent,
        homeserverUrl,
        getEvent,
        false
      );
      const isEmoteReply =
        replyEvent.getContent()?.msgtype == MatrixSDK.MsgType.Emote;
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
  return body;
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
  const parsedBody = lazy.domParser.parseFromString(
    `<!DOCTYPE html><html><body>${content.formatted_body}</body></html>`,
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
    'a[href^="https://matrix.to/#/@"],a[href^="https://matrix.to/#/%40"]'
  );
  for (const mention of userMentions) {
    let endIndex = mention.hash.indexOf("?");
    if (endIndex == -1) {
      endIndex = undefined;
    }
    const userId = decodeURIComponent(mention.hash.slice(2, endIndex));
    const ibPerson = formatMention(userId, parsedBody);
    mention.replaceWith(ibPerson);
  }
  //TODO handle room mentions but avoid event permalinks
  const inlineImages = parsedBody.querySelectorAll("img");
  for (const image of inlineImages) {
    if (image.alt) {
      if (image.src.startsWith("mxc:")) {
        const link = parsedBody.createElement("a");
        link.href = MatrixSDK.getHttpUriForMxc(homeserverUrl, image.src);
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
    if (includeReply && content.msgtype != MatrixSDK.MsgType.Emote) {
      const eventId = event.replyEventId;
      const replyEvent = getEvent(eventId);
      if (replyEvent) {
        const replyContent = getReplyContent(
          replyEvent,
          homeserverUrl,
          getEvent,
          true
        );
        const isEmoteReply =
          replyEvent.getContent()?.msgtype == MatrixSDK.MsgType.Emote;
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
  return parsedBody.body.innerHTML;
}

export var MatrixMessageContent = {
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
    if (
      !event ||
      (event.status !== null && event.status !== MatrixSDK.EventStatus.SENT)
    ) {
      return "";
    }
    const type = event.getType();
    const content = event.getContent();
    if (event.isRedacted()) {
      return lazy._("message.redacted");
    }
    const textForEvent = lazy.getMatrixTextForEvent(event);
    if (textForEvent) {
      return textForEvent;
    } else if (
      type == MatrixSDK.EventType.RoomMessage ||
      type == MatrixSDK.EventType.RoomMessageEncrypted
    ) {
      if (kRichBodiedTypes.includes(content?.msgtype)) {
        return formatPlainBody(event, homeserverUrl, getEvent, includeReply);
      } else if (kAttachmentTypes.includes(content?.msgtype)) {
        const attachmentUrl = getAttachmentUrl(content, homeserverUrl);
        if (attachmentUrl) {
          return attachmentUrl;
        }
      } else if (event.isBeingDecrypted() || event.shouldAttemptDecryption()) {
        return lazy._("message.decrypting");
      }
    } else if (type == MatrixSDK.EventType.Sticker) {
      const attachmentUrl = getAttachmentUrl(content, homeserverUrl);
      if (attachmentUrl) {
        return attachmentUrl;
      }
    } else if (type == MatrixSDK.EventType.Reaction) {
      const annotatedEvent = getEvent(content["m.relates_to"]?.event_id);
      if (annotatedEvent && content["m.relates_to"]?.key) {
        return lazy._(
          "message.reaction",
          event.getSender(),
          annotatedEvent.getSender(),
          lazy.TXTToHTML(content["m.relates_to"].key)
        );
      }
    }
    return lazy.TXTToHTML(content.body ?? "");
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
    if (
      !event ||
      (event.status !== null && event.status !== MatrixSDK.EventStatus.SENT)
    ) {
      return "";
    }
    const type = event.getType();
    const content = event.getContent();
    if (event.isRedacted()) {
      return lazy._("message.redacted");
    }
    if (type == MatrixSDK.EventType.RoomMessage) {
      if (
        kRichBodiedTypes.includes(content.msgtype) &&
        content.format == kHtmlFormat &&
        content.formatted_body
      ) {
        return formatHTMLBody(event, homeserverUrl, getEvent, includeReply);
      } else if (kAttachmentTypes.includes(content.msgtype)) {
        return formatMediaAttachment(content, homeserverUrl);
      }
    } else if (type == MatrixSDK.EventType.Sticker) {
      return formatMediaAttachment(content, homeserverUrl);
    } else if (type == MatrixSDK.EventType.Reaction) {
      const annotatedEvent = getEvent(content["m.relates_to"]?.event_id);
      if (annotatedEvent && content["m.relates_to"]?.key) {
        return lazy._(
          "message.reaction",
          `<span class="ib-person">${event.getSender()}</span>`,
          `<span class="ib-person">${annotatedEvent.getSender()}</span>`,
          lazy.TXTToHTML(content["m.relates_to"].key)
        );
      }
    }
    return MatrixMessageContent.getIncomingPlain(
      event,
      homeserverUrl,
      getEvent
    );
  },
};
