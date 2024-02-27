/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

const ParserUtils = Cc["@mozilla.org/parserutils;1"].getService(
  Ci.nsIParserUtils
);

var kMessagesStylePrefBranch = "messenger.options.messagesStyle.";
var kThemePref = "theme";
var kVariantPref = "variant";
var kCombineConsecutivePref = "combineConsecutive";
var kCombineConsecutiveIntervalPref = "combineConsecutiveInterval";

var DEFAULT_THEME = "bubbles";
var DEFAULT_THEMES = ["bubbles", "dark", "mail", "papersheets", "simple"];

var kLineBreak = "@mozilla.org/windows-registry-key;1" in Cc ? "\r\n" : "\n";

ChromeUtils.defineLazyGetter(lazy, "gPrefBranch", () =>
  Services.prefs.getBranch(kMessagesStylePrefBranch)
);

ChromeUtils.defineLazyGetter(lazy, "TXTToHTML", function () {
  const cs = Cc["@mozilla.org/txttohtmlconv;1"].getService(
    Ci.mozITXTToHTMLConv
  );
  return aTXT => cs.scanTXT(aTXT, cs.kEntities);
});

ChromeUtils.defineLazyGetter(lazy, "gTimeFormatter", () => {
  return new Services.intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
});

ChromeUtils.defineESModuleGetters(lazy, {
  DownloadUtils: "resource://gre/modules/DownloadUtils.sys.mjs",
  ToLocaleFormat: "resource:///modules/ToLocaleFormat.sys.mjs",
});

var gCurrentTheme = null;

function getChromeFile(aURI) {
  try {
    const channel = Services.io.newChannel(
      aURI,
      null,
      null,
      null,
      Services.scriptSecurityManager.getSystemPrincipal(),
      null,
      Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
      Ci.nsIContentPolicy.TYPE_OTHER
    );
    const stream = channel.open();
    const sstream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
      Ci.nsIScriptableInputStream
    );
    sstream.init(stream);
    const text = sstream.read(sstream.available());
    sstream.close();
    return text;
  } catch (e) {
    if (e.result != Cr.NS_ERROR_FILE_NOT_FOUND) {
      dump("Getting " + aURI + ": " + e + "\n");
    }
    return null;
  }
}

function HTMLTheme(aBaseURI) {
  const files = {
    footer: "Footer.html",
    header: "Header.html",
    status: "Status.html",
    statusNext: "NextStatus.html",
    incomingContent: "Incoming/Content.html",
    incomingContext: "Incoming/Context.html",
    incomingNextContent: "Incoming/NextContent.html",
    incomingNextContext: "Incoming/NextContext.html",
    outgoingContent: "Outgoing/Content.html",
    outgoingContext: "Outgoing/Context.html",
    outgoingNextContent: "Outgoing/NextContent.html",
    outgoingNextContext: "Outgoing/NextContext.html",
  };

  for (const id in files) {
    const html = getChromeFile(aBaseURI + files[id]);
    if (html) {
      Object.defineProperty(this, id, { value: html });
    }
  }

  if (!("incomingContent" in files)) {
    throw new Error("Invalid theme: Incoming/Content.html is missing!");
  }
}

HTMLTheme.prototype = {
  get footer() {
    return "";
  },
  get header() {
    return "";
  },
  get status() {
    return this.incomingContent;
  },
  get statusNext() {
    return this.status;
  },
  get incomingContent() {
    throw new Error("Incoming/Content.html is a required file");
  },
  get incomingNextContent() {
    return this.incomingContent;
  },
  get outgoingContent() {
    return this.incomingContent;
  },
  get outgoingNextContent() {
    return this.incomingNextContent;
  },
  get incomingContext() {
    return this.incomingContent;
  },
  get incomingNextContext() {
    return this.incomingNextContent;
  },
  get outgoingContext() {
    return this.hasOwnProperty("outgoingContent")
      ? this.outgoingContent
      : this.incomingContext;
  },
  get outgoingNextContext() {
    return this.hasOwnProperty("outgoingNextContent")
      ? this.outgoingNextContent
      : this.incomingNextContext;
  },
};

function plistToJSON(aElt) {
  switch (aElt.localName) {
    case "true":
      return true;
    case "false":
      return false;
    case "string":
    case "data":
      return aElt.textContent;
    case "real":
      return parseFloat(aElt.textContent);
    case "integer":
      return parseInt(aElt.textContent, 10);
    case "dict": {
      const res = {};
      const nodes = aElt.children;
      for (let i = 0; i < nodes.length; ++i) {
        if (nodes[i].nodeName == "key") {
          const key = nodes[i].textContent;
          ++i;
          while (!Element.isInstance(nodes[i])) {
            ++i;
          }
          res[key] = plistToJSON(nodes[i]);
        }
      }
      return res;
    }
    case "array": {
      const array = [];
      const nodes = aElt.children;
      for (let i = 0; i < nodes.length; ++i) {
        if (Element.isInstance(nodes[i])) {
          array.push(plistToJSON(nodes[i]));
        }
      }
      return array;
    }
    default:
      throw new Error("Unknown tag in plist file");
  }
}

function getInfoPlistContent(aBaseURI) {
  try {
    const channel = Services.io.newChannel(
      aBaseURI + "Info.plist",
      null,
      null,
      null,
      Services.scriptSecurityManager.getSystemPrincipal(),
      null,
      Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
      Ci.nsIContentPolicy.TYPE_OTHER
    );
    const stream = channel.open();
    const parser = new DOMParser();
    const doc = parser.parseFromStream(
      stream,
      null,
      stream.available(),
      "text/xml"
    );
    if (doc.documentElement.localName != "plist") {
      throw new Error("Invalid Info.plist file");
    }
    let node = doc.documentElement.firstElementChild;
    while (node && !Element.isInstance(node)) {
      node = node.nextElementSibling;
    }
    if (!node || node.localName != "dict") {
      throw new Error("Empty or invalid Info.plist file");
    }
    return plistToJSON(node);
  } catch (e) {
    console.error(e);
    return null;
  }
}

function getChromeBaseURI(aThemeName) {
  if (DEFAULT_THEMES.includes(aThemeName)) {
    return "chrome://messenger-messagestyles/skin/" + aThemeName + "/";
  }
  return "chrome://" + aThemeName + "/skin/";
}

export function getThemeByName(aName) {
  const baseURI = getChromeBaseURI(aName);
  const metadata = getInfoPlistContent(baseURI);
  if (!metadata) {
    throw new Error("Cannot load theme " + aName);
  }

  return {
    name: aName,
    variant: "default",
    baseURI,
    metadata,
    html: new HTMLTheme(baseURI),
    combineConsecutive: lazy.gPrefBranch.getBoolPref(kCombineConsecutivePref),
    combineConsecutiveInterval: lazy.gPrefBranch.getIntPref(
      kCombineConsecutiveIntervalPref
    ),
  };
}

export function getCurrentTheme() {
  const name = lazy.gPrefBranch.getCharPref(kThemePref);
  const variant = lazy.gPrefBranch.getCharPref(kVariantPref);
  if (
    gCurrentTheme &&
    gCurrentTheme.name == name &&
    gCurrentTheme.variant == variant
  ) {
    return gCurrentTheme;
  }

  try {
    gCurrentTheme = getThemeByName(name);
    gCurrentTheme.variant = variant;
  } catch (e) {
    console.error(e);
    gCurrentTheme = getThemeByName(DEFAULT_THEME);
    gCurrentTheme.variant = "default";
  }

  return gCurrentTheme;
}

function getDirectoryEntries(aDir) {
  let uri = Services.io.newURI(aDir);
  const cr = Cc["@mozilla.org/chrome/chrome-registry;1"].getService(
    Ci.nsIXULChromeRegistry
  );
  while (uri.scheme == "chrome") {
    uri = cr.convertChromeURL(uri);
  }

  // remove any trailing file name added by convertChromeURL
  const spec = uri.spec.replace(/[^\/]+$/, "");
  uri = Services.io.newURI(spec);

  const results = [];
  if (uri.scheme == "jar") {
    uri.QueryInterface(Ci.nsIJARURI);
    const strEntry = uri.JAREntry;
    if (!strEntry) {
      return [];
    }

    const zr = Cc["@mozilla.org/libjar/zip-reader;1"].createInstance(
      Ci.nsIZipReader
    );
    const jarFile = uri.JARFile;
    if (jarFile instanceof Ci.nsIJARURI) {
      const innerZr = Cc["@mozilla.org/libjar/zip-reader;1"].createInstance(
        Ci.nsIZipReader
      );
      innerZr.open(jarFile.JARFile.QueryInterface(Ci.nsIFileURL).file);
      zr.openInner(innerZr, jarFile.JAREntry);
    } else {
      zr.open(jarFile.QueryInterface(Ci.nsIFileURL).file);
    }

    if (!zr.hasEntry(strEntry) || !zr.getEntry(strEntry).isDirectory) {
      zr.close();
      return [];
    }

    const escapedEntry = strEntry.replace(/([*?$[\]^~()\\])/g, "\\$1");
    const filter = escapedEntry + "?*~" + escapedEntry + "?*/?*";
    const entries = zr.findEntries(filter);

    const parentLength = strEntry.length;
    for (const entry of entries) {
      results.push(entry.substring(parentLength));
    }
    zr.close();
  } else if (uri.scheme == "file") {
    uri.QueryInterface(Ci.nsIFileURL);
    const dir = uri.file;

    if (!dir.exists() || !dir.isDirectory()) {
      return [];
    }

    for (const file of dir.directoryEntries) {
      results.push(file.leafName);
    }
  }

  return results;
}

export function getThemeVariants(aTheme) {
  const variants = getDirectoryEntries(aTheme.baseURI + "Variants/");
  return variants
    .filter(v => v.endsWith(".css"))
    .map(v => v.substring(0, v.length - 4));
}

/* helper function for replacements in messages */
function getBuddyFromMessage(aMsg) {
  if (aMsg.incoming) {
    const conv = aMsg.conversation;
    if (!conv.isChat) {
      return conv.buddy;
    }
  }

  return null;
}

function getStatusIconFromBuddy(aBuddy) {
  let status = "unknown";
  if (aBuddy) {
    if (!aBuddy.online) {
      status = "offline";
    } else if (aBuddy.idle) {
      status = "idle";
    } else if (!aBuddy.available) {
      status = "away";
    } else {
      status = "available";
    }
  }

  return "chrome://chat/skin/" + status + "-16.png";
}

var footerReplacements = {
  chatName: aConv => lazy.TXTToHTML(aConv.title),
  sourceName: aConv =>
    lazy.TXTToHTML(aConv.account.alias || aConv.account.name),
  destinationName: aConv => lazy.TXTToHTML(aConv.name),
  destinationDisplayName: aConv => lazy.TXTToHTML(aConv.title),
  incomingIconPath(aConv) {
    let buddy;
    return (
      (!aConv.isChat && (buddy = aConv.buddy) && buddy.buddyIconFilename) ||
      "incoming_icon.png"
    );
  },
  outgoingIconPath: aConv => "outgoing_icon.png",
  timeOpened(aConv, aFormat) {
    const date = new Date(aConv.startDate / 1000);
    if (aFormat) {
      return lazy.ToLocaleFormat(aFormat, date);
    }
    return lazy.gTimeFormatter.format(date);
  },
};

function formatAutoResponce(aTxt) {
  return Services.strings
    .createBundle("chrome://chat/locale/conversations.properties")
    .formatStringFromName("autoReply", [aTxt]);
}

var statusMessageReplacements = {
  message: aMsg =>
    '<span class="ib-msg-txt">' +
    (aMsg.autoResponse ? formatAutoResponce(aMsg.message) : aMsg.message) +
    "</span>",
  time(aMsg, aFormat) {
    const date = new Date(aMsg.time * 1000);
    if (aFormat) {
      return lazy.ToLocaleFormat(aFormat, date);
    }
    return lazy.gTimeFormatter.format(date);
  },
  timestamp: aMsg => aMsg.time,
  shortTime(aMsg) {
    return lazy.gTimeFormatter.format(new Date(aMsg.time * 1000));
  },
  messageClasses(aMsg) {
    const msgClass = [];

    if (aMsg.system) {
      msgClass.push("event");
    } else {
      msgClass.push("message");

      if (aMsg.incoming) {
        msgClass.push("incoming");
      } else if (aMsg.outgoing) {
        msgClass.push("outgoing");
      }

      if (aMsg.action) {
        msgClass.push("action");
      }

      if (aMsg.autoResponse) {
        msgClass.push("autoreply");
      }
    }

    if (aMsg.containsNick) {
      msgClass.push("nick");
    }
    if (aMsg.error) {
      msgClass.push("error");
    }
    if (aMsg.delayed) {
      msgClass.push("delayed");
    }
    if (aMsg.notification) {
      msgClass.push("notification");
    }
    if (aMsg.noFormat) {
      msgClass.push("monospaced");
    }
    if (aMsg.noCollapse) {
      msgClass.push("no-collapse");
    }

    return msgClass.join(" ");
  },
};

function formatSender(aName, isEncrypted = false) {
  const otr = isEncrypted ? " message-encrypted" : "";
  return `<span class="ib-sender${otr}">${lazy.TXTToHTML(aName)}</span>`;
}
var messageReplacements = {
  userIconPath(aMsg) {
    // If the protocol plugin provides an icon for the message, use it.
    let iconURL = aMsg.iconURL;
    if (iconURL) {
      return iconURL;
    }

    // For outgoing messages, use the current user icon.
    if (aMsg.outgoing) {
      iconURL = aMsg.conversation.account.statusInfo.getUserIcon();
      if (iconURL) {
        return iconURL.spec;
      }
    }

    // Fallback to the theme's default icons.
    return (aMsg.incoming ? "Incoming" : "Outgoing") + "/buddy_icon.svg";
  },
  senderScreenName: aMsg => formatSender(aMsg.who, aMsg.isEncrypted),
  sender: aMsg => formatSender(aMsg.alias || aMsg.who, aMsg.isEncrypted),
  senderColor: aMsg => aMsg.color,
  senderStatusIcon: aMsg => getStatusIconFromBuddy(getBuddyFromMessage(aMsg)),
  messageDirection: aMsg => "ltr",
  // no theme actually use this, don't bother making sure this is the real
  // serverside alias
  senderDisplayName: aMsg =>
    formatSender(aMsg.alias || aMsg.who, aMsg.isEncrypted),
  service: aMsg => aMsg.conversation.account.protocol.name,
  textbackgroundcolor: (aMsg, aFormat) => "transparent", // FIXME?
  __proto__: statusMessageReplacements,
};

var statusReplacements = {
  status: aMsg => "", // FIXME
  statusIcon(aMsg) {
    const conv = aMsg.conversation;
    let buddy = null;
    if (!conv.isChat) {
      buddy = conv.buddy;
    }
    return getStatusIconFromBuddy(buddy);
  },
  __proto__: statusMessageReplacements,
};

var kReplacementRegExp = /%([a-zA-Z]*)(\{([^\}]*)\})?%/g;

function replaceKeywordsInHTML(aHTML, aReplacements, aReplacementArg) {
  kReplacementRegExp.lastIndex = 0;
  let previousIndex = 0;
  let result = "";
  let match;
  while ((match = kReplacementRegExp.exec(aHTML))) {
    let content = "";
    if (match[1] in aReplacements) {
      content = aReplacements[match[1]](aReplacementArg, match[3]);
    } else {
      console.error(
        "Unknown replacement string %" + match[1] + "% in message styles."
      );
    }
    result += aHTML.substring(previousIndex, match.index) + content;
    previousIndex = kReplacementRegExp.lastIndex;
  }

  return result + aHTML.slice(previousIndex);
}

/**
 * Determine if a message should be grouped with a previous message.
 *
 * @param {object} aTheme - The theme the messages will be displayed in.
 * @param {imIMessage} aMsg - The message that is about to be appended.
 * @param {imIMessage} aPreviousMsg - The last message that was displayed.
 * @returns {boolean} If the message should be grouped with the previous one.
 */
export function isNextMessage(aTheme, aMsg, aPreviousMsg) {
  if (
    !aTheme.combineConsecutive ||
    (hasMetadataKey(aTheme, "DisableCombineConsecutive") &&
      getMetadata(aTheme, "DisableCombineConsecutive"))
  ) {
    return false;
  }

  if (!aPreviousMsg) {
    return false;
  }

  if (aMsg.system && aPreviousMsg.system) {
    return true;
  }

  if (
    aMsg.who != aPreviousMsg.who ||
    aMsg.outgoing != aPreviousMsg.outgoing ||
    aMsg.incoming != aPreviousMsg.incoming ||
    aMsg.system != aPreviousMsg.system
  ) {
    return false;
  }

  const timeDifference = aMsg.time - aPreviousMsg.time;
  return (
    timeDifference >= 0 && timeDifference <= aTheme.combineConsecutiveInterval
  );
}

/**
 * Determine whether the message was a next message when it was initially
 * inserted.
 *
 * @param {imIMessage} msg
 * @param {DOMDocument} doc
 * @returns {boolean} If the message is a next message. Returns false if the
 *   message doesn't already exist in the conversation.
 */
export function wasNextMessage(msg, doc) {
  return Boolean(
    doc.querySelector(`#Chat [data-remote-id="${CSS.escape(msg.remoteId)}"]`)
      ?.dataset.isNext
  );
}

/**
 * Create an HTML string to insert the message into the conversation.
 *
 * @param {imIMessage} aMsg
 * @param {object} aTheme
 * @param {boolean} aIsNext - If this message is immediately following a
 *   message of the same origin. Used for visual grouping.
 * @param {boolean} aIsContext - If this message was already read by the user
 *   previously and just provided for context.
 * @returns {string} Raw HTML for the message.
 */
export function getHTMLForMessage(aMsg, aTheme, aIsNext, aIsContext) {
  let html, replacements;
  if (aMsg.system) {
    html = aIsNext ? aTheme.html.statusNext : aTheme.html.status;
    replacements = statusReplacements;
  } else {
    html = aMsg.incoming ? "incoming" : "outgoing";
    if (aIsNext) {
      html += "Next";
    }
    html += aIsContext ? "Context" : "Content";
    html = aTheme.html[html];
    replacements = messageReplacements;
    if (aMsg.action) {
      let actionMessageTemplate = "* %message% *";
      if (hasMetadataKey(aTheme, "ActionMessageTemplate")) {
        actionMessageTemplate = getMetadata(aTheme, "ActionMessageTemplate");
      }
      html = html.replace(/%message%/g, actionMessageTemplate);
    }
  }

  return replaceKeywordsInHTML(html, replacements, aMsg);
}

/**
 *
 * @param {imIMessage} aMsg
 * @param {string} aHTML
 * @param {DOMDocument} aDoc
 * @param {boolean} aIsNext
 * @returns {Element}
 */
export function insertHTMLForMessage(aMsg, aHTML, aDoc, aIsNext) {
  let insert = aDoc.getElementById("insert");
  if (insert && !aIsNext) {
    insert.remove();
    insert = null;
  }

  const parent = insert ? insert.parentNode : aDoc.getElementById("Chat");
  const documentFragment = getDocumentFragmentFromHTML(aDoc, aHTML);

  // If the parent already has a remote ID, we remove it, since it now contains
  // multiple different messages.
  if (parent.dataset.remoteId) {
    for (const child of parent.children) {
      child.dataset.remoteId = parent.dataset.remoteId;
      child.dataset.isNext = true;
    }
    delete parent.dataset.remoteId;
  }

  let result = documentFragment.firstElementChild;
  // store the prplIMessage object in each of the "root" node that
  // will be inserted into the document, so that selection code can
  // retrieve the message by just looking at the parent node until it
  // finds something.
  for (let root = result; root; root = root.nextElementSibling) {
    // Skip the insert placeholder.
    if (root.id === "insert") {
      continue;
    }
    root._originalMsg = aMsg;
    // Store remote ID of the message in the DOM for fast retrieval
    root.dataset.remoteId = aMsg.remoteId;
    if (aIsNext) {
      root.dataset.isNext = aIsNext;
    }
  }

  // make sure the result is an HTMLElement and not some text (whitespace)...
  while (
    result &&
    !(
      result.nodeType == result.ELEMENT_NODE &&
      result.namespaceURI == "http://www.w3.org/1999/xhtml"
    )
  ) {
    result = result.nextElementSibling;
  }
  if (insert) {
    parent.replaceChild(documentFragment, insert);
  } else {
    parent.appendChild(documentFragment);
  }
  return result;
}

/**
 * Replace the HTML of an already displayed message based on the matching
 * remote ID.
 *
 * @param {imIMessage} msg - Message to insert the updated contents of.
 * @param {string} html - The HTML contents to insert.
 * @param {Document} doc - The HTML document the message should be replaced
 *   in.
 * @param {boolean} isNext - If this message is immediately following a
 *   message of the same origin. Used for visual grouping.
 */
export function replaceHTMLForMessage(msg, html, doc, isNext) {
  // If the updated message has no remote ID, do nothing.
  if (!msg.remoteId) {
    return;
  }
  const message = getExistingMessage(msg.remoteId, doc);

  // If we couldn't find a matching message, do nothing.
  if (!message.length) {
    return;
  }

  const documentFragment = getDocumentFragmentFromHTML(doc, html);
  // We don't want to add an insert point when replacing a message.
  documentFragment.querySelector("#insert")?.remove();
  // store the prplIMessage object in each of the "root" nodes that
  // will be inserted into the document, so that the selection code can
  // retrieve the message by just looking at the parent node until it
  // finds something.
  for (
    let root = documentFragment.firstElementChild;
    root;
    root = root.nextElementSibling
  ) {
    root._originalMsg = msg;
    root.dataset.remoteId = msg.remoteId;
    if (isNext) {
      root.dataset.isNext = isNext;
    }
  }

  // Remove all but the first element of the original message
  if (message.length > 1) {
    const range = doc.createRange();
    range.setStartBefore(message[1]);
    range.setEndAfter(message[message.length - 1]);
    range.deleteContents();
  }
  // Insert the new message into the DOM
  message[0].replaceWith(documentFragment);
}

/**
 * Remove all elements belonging to a message from the document, based on the
 * remote ID of the message.
 *
 * @param {string} remoteId
 * @param {Document} doc
 */
export function removeMessage(remoteId, doc) {
  const message = getExistingMessage(remoteId, doc);

  // If we couldn't find a matching message, do nothing.
  if (!message.length) {
    return;
  }

  // Remove all elements of the original message
  const range = doc.createRange();
  range.setStartBefore(message[0]);
  range.setEndAfter(message[message.length - 1]);
  range.deleteContents();
}

function hasMetadataKey(aTheme, aKey) {
  return (
    aKey in aTheme.metadata ||
    (aTheme.variant != "default" &&
      aKey + ":" + aTheme.variant in aTheme.metadata) ||
    ("DefaultVariant" in aTheme.metadata &&
      aKey + ":" + aTheme.metadata.DefaultVariant in aTheme.metadata)
  );
}

function getMetadata(aTheme, aKey) {
  if (
    aTheme.variant != "default" &&
    aKey + ":" + aTheme.variant in aTheme.metadata
  ) {
    return aTheme.metadata[aKey + ":" + aTheme.variant];
  }

  if (
    "DefaultVariant" in aTheme.metadata &&
    aKey + ":" + aTheme.metadata.DefaultVariant in aTheme.metadata
  ) {
    return aTheme.metadata[aKey + ":" + aTheme.metadata.DefaultVariant];
  }

  return aTheme.metadata[aKey];
}

export function initHTMLDocument(aConv, aTheme, aDoc) {
  const base = aDoc.createElement("base");
  base.href = aTheme.baseURI;
  aDoc.head.appendChild(base);

  // Screen readers may read the title of the document, so provide one
  // to avoid an ugly fallback to the URL (see bug 1165).
  aDoc.title = aConv.title;

  function addCSS(aHref) {
    const link = aDoc.createElement("link");
    link.setAttribute("rel", "stylesheet");
    link.setAttribute("href", aHref);
    link.setAttribute("type", "text/css");
    aDoc.head.appendChild(link);
  }
  addCSS("chrome://chat/skin/conv.css");
  addCSS("chrome://messenger/skin/icons.css");

  // add css to handle DefaultFontFamily and DefaultFontSize
  let cssText = "";
  if (hasMetadataKey(aTheme, "DefaultFontFamily")) {
    cssText += "font-family: " + getMetadata(aTheme, "DefaultFontFamily") + ";";
  }
  if (hasMetadataKey(aTheme, "DefaultFontSize")) {
    cssText += "font-size: " + getMetadata(aTheme, "DefaultFontSize") + ";";
  }
  if (cssText) {
    addCSS("data:text/css,*{ " + cssText + " }");
  }

  // add the main CSS file of the theme
  if (aTheme.metadata.MessageViewVersion >= 3 || aTheme.variant == "default") {
    addCSS("main.css");
  }

  // add the CSS file of the variant
  if (aTheme.variant != "default") {
    addCSS("Variants/" + aTheme.variant + ".css");
  } else if ("DefaultVariant" in aTheme.metadata) {
    addCSS("Variants/" + aTheme.metadata.DefaultVariant + ".css");
  }
  aDoc.body.id = "ibcontent";

  // We insert the whole content of body: chat div, footer
  let html = '<div id="Chat" aria-live="polite"></div>';
  html += replaceKeywordsInHTML(aTheme.html.footer, footerReplacements, aConv);

  const frag = getDocumentFragmentFromHTML(aDoc, html);
  aDoc.body.appendChild(frag);
  if (!aTheme.metadata.NoScript) {
    const scriptTag = aDoc.createElement("script");
    scriptTag.src = "inline.js";
    aDoc.body.appendChild(scriptTag);
  }
  aDoc.defaultView.convertTimeUnits = lazy.DownloadUtils.convertTimeUnits;
}

/* Selection stuff */
function getEllipsis() {
  let ellipsis = "[\u2026]";

  try {
    ellipsis = Services.prefs.getComplexValue(
      "messenger.conversations.selections.ellipsis",
      Ci.nsIPrefLocalizedString
    ).data;
  } catch (e) {}
  return ellipsis;
}

function _serializeDOMObject(aDocument, aInitFunction) {
  // This shouldn't really be a constant, as we want to support
  // text/html too in the future.
  const type = "text/plain";

  const encoder = Cu.createDocumentEncoder(type);
  encoder.init(aDocument, type, Ci.nsIDocumentEncoder.OutputPreformatted);
  aInitFunction(encoder);
  const result = encoder.encodeToString();
  return result;
}

function serializeRange(aRange) {
  return _serializeDOMObject(
    aRange.startContainer.ownerDocument,
    function (aEncoder) {
      aEncoder.setRange(aRange);
    }
  );
}

function serializeNode(aNode) {
  return _serializeDOMObject(aNode.ownerDocument, function (aEncoder) {
    aEncoder.setNode(aNode);
  });
}

/* This function is used to pretty print a selection inside a conversation area */
export function serializeSelection(aSelection) {
  // We have two kinds of selection serialization:
  //  - The short version, used when only a part of message is
  //    selected, or if nothing interesting is selected
  let shortSelection = "";

  //  - The long version, which is used:
  //      * when both some of the message text and some of the context
  //        (sender, time, ...) is selected;
  //      * when several messages are selected at once
  //    This version uses an array, with each message formatted
  //    through the theme system.
  const longSelection = [];

  // We first assume that we are going to use the short version, but
  // while working on creating the short version, we prepare
  // everything to be able to switch to the long version if we later
  // discover that it is in fact needed.
  let shortVersionPossible = true;

  // Sometimes we need to know if a selection range is inside the same
  // message as the previous selection range, so we keep track of the
  // last message we have processed.
  let lastMessage = null;

  for (let i = 0; i < aSelection.rangeCount; ++i) {
    const range = aSelection.getRangeAt(i);
    let messages = getMessagesForRange(range);

    // If at least one selected message has some of its text selected,
    // remove from the selection all the messages that have no text
    // selected
    const testFunction = msg => msg.isTextSelected();
    if (messages.some(testFunction)) {
      messages = messages.filter(testFunction);
    }

    if (!messages.length) {
      // Do it only if it wouldn't override a better already found selection
      if (!shortSelection) {
        shortSelection = serializeRange(range);
      }
      continue;
    }

    if (
      shortVersionPossible &&
      messages.length == 1 &&
      (!messages[0].isTextSelected() || messages[0].onlyTextSelected()) &&
      (!lastMessage ||
        lastMessage.msg == messages[0].msg ||
        lastMessage.msg.who == messages[0].msg.who)
    ) {
      if (shortSelection) {
        if (lastMessage.msg != messages[0].msg) {
          // Add the ellipsis only if the previous message was cut
          if (lastMessage.cutEnd) {
            shortSelection += " " + getEllipsis();
          }
          shortSelection += kLineBreak;
        } else {
          shortSelection += " " + getEllipsis() + " ";
        }
      }
      shortSelection += serializeRange(range);
      longSelection.push(messages[0].getFormattedMessage());
    } else {
      shortVersionPossible = false;
      for (let m = 0; m < messages.length; ++m) {
        const message = messages[m];
        if (m == 0 && lastMessage && lastMessage.msg == message.msg) {
          let text = message.getSelectedText();
          if (message.cutEnd) {
            text += " " + getEllipsis();
          }
          longSelection[longSelection.length - 1] += " " + text;
        } else {
          longSelection.push(message.getFormattedMessage());
        }
      }
    }
    lastMessage = messages[messages.length - 1];
  }

  if (shortVersionPossible) {
    return shortSelection || aSelection.toString();
  }
  return longSelection.join(kLineBreak);
}

function SelectedMessage(aRootNode, aRange) {
  this._rootNodes = [aRootNode];
  this._range = aRange;
}

SelectedMessage.prototype = {
  get msg() {
    return this._rootNodes[0]._originalMsg;
  },
  addRoot(aRootNode) {
    this._rootNodes.push(aRootNode);
  },

  // Helper function that returns the first span node of class
  // ib-msg-text under the rootNodes of the selected message.
  _getSpanNode() {
    // first use the cached value if any
    if (this._spanNode) {
      return this._spanNode;
    }

    let spanNode = null;
    // If we could use NodeFilter.webidl, we wouldn't have to make up our own
    // object. FILTER_REJECT is not used here, but included for completeness.
    const NodeFilter = {
      SHOW_ELEMENT: 0x1,
      FILTER_ACCEPT: 1,
      FILTER_REJECT: 2,
      FILTER_SKIP: 3,
    };
    // helper filter function for the tree walker
    const filter = function (node) {
      return node.className == "ib-msg-txt"
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP;
    };
    // walk the DOM subtrees of each root, keep the first correct span node
    for (let i = 0; !spanNode && i < this._rootNodes.length; ++i) {
      const rootNode = this._rootNodes[i];
      // the TreeWalker doesn't test the root node, special case it first
      if (filter(rootNode) == NodeFilter.FILTER_ACCEPT) {
        spanNode = rootNode;
        break;
      }
      const treeWalker = rootNode.ownerDocument.createTreeWalker(
        rootNode,
        NodeFilter.SHOW_ELEMENT,
        { acceptNode: filter },
        false
      );
      spanNode = treeWalker.nextNode();
    }

    return (this._spanNode = spanNode);
  },

  // Initialize _textSelected and _otherSelected; if _textSelected is true,
  // also initialize _selectedText and _cutBegin/End.
  _initSelectedText() {
    if ("_textSelected" in this) {
      // Already initialized.
      return;
    }

    const spanNode = this._getSpanNode();
    if (!spanNode) {
      // can happen if the message text is under a separate root node
      // that isn't selected at all
      this._textSelected = false;
      this._otherSelected = true;
      return;
    }
    const startPoint = this._range.comparePoint(spanNode, 0);
    // Note that we are working on the HTML DOM, including text nodes,
    // so we need to use childNodes here and below.
    const endPoint = this._range.comparePoint(
      spanNode,
      spanNode.childNodes.length
    );
    if (startPoint <= 0 && endPoint >= 0) {
      const range = this._range.cloneRange();
      if (startPoint >= 0) {
        range.setStart(spanNode, 0);
      }
      if (endPoint <= 0) {
        range.setEnd(spanNode, spanNode.childNodes.length);
      }
      this._selectedText = serializeRange(range);

      // if the selected text is empty, set _selectedText to false
      // this happens if the carret is at the offset 0 in the span node
      this._textSelected = this._selectedText != "";
    } else {
      this._textSelected = false;
    }
    if (this._textSelected) {
      // to check if the start or end is cut, the result of
      // comparePoint is not enough because the selection range may
      // start or end in a text node instead of the span node

      if (startPoint == -1) {
        const range = spanNode.ownerDocument.createRange();
        range.setStart(spanNode, 0);
        range.setEnd(this._range.startContainer, this._range.startOffset);
        this._cutBegin = serializeRange(range) != "";
      } else {
        this._cutBegin = false;
      }

      if (endPoint == 1) {
        const range = spanNode.ownerDocument.createRange();
        range.setStart(this._range.endContainer, this._range.endOffset);
        range.setEnd(spanNode, spanNode.childNodes.length);
        this._cutEnd = !/^(\r?\n)?$/.test(serializeRange(range));
      } else {
        this._cutEnd = false;
      }
    }
    this._otherSelected =
      (startPoint >= 0 || endPoint <= 0) && // eliminate most negative cases
      (!this._textSelected ||
        serializeRange(this._range).length > this._selectedText.length);
  },
  get cutBegin() {
    this._initSelectedText();
    return this._textSelected && this._cutBegin;
  },
  get cutEnd() {
    this._initSelectedText();
    return this._textSelected && this._cutEnd;
  },
  isTextSelected() {
    this._initSelectedText();
    return this._textSelected;
  },
  onlyTextSelected() {
    this._initSelectedText();
    return !this._otherSelected;
  },
  getSelectedText() {
    this._initSelectedText();
    return this._textSelected ? this._selectedText : "";
  },
  getFormattedMessage() {
    // First, get the selected text
    this._initSelectedText();
    const msg = this.msg;
    let text;
    if (this._textSelected) {
      // Add ellipsis is needed
      text =
        (this._cutBegin ? getEllipsis() + " " : "") +
        this._selectedText +
        (this._cutEnd ? " " + getEllipsis() : "");
    } else {
      const div = this._rootNodes[0].ownerDocument.createElement("div");
      const divChildren = getDocumentFragmentFromHTML(
        div.ownerDocument,
        msg.autoResponse ? formatAutoResponce(msg.message) : msg.message
      );
      div.appendChild(divChildren);
      text = serializeNode(div);
    }

    // then get the suitable replacements and templates for this message
    const getLocalizedPrefWithDefault = function (aName, aDefault) {
      try {
        const prefBranch = Services.prefs.getBranch(
          "messenger.conversations.selections."
        );
        return prefBranch.getComplexValue(aName, Ci.nsIPrefLocalizedString)
          .data;
      } catch (e) {
        return aDefault;
      }
    };
    let html, replacements;
    if (msg.system) {
      replacements = statusReplacements;
      html = getLocalizedPrefWithDefault(
        "systemMessagesTemplate",
        "%time% - %message%"
      );
    } else {
      replacements = messageReplacements;
      if (msg.action) {
        html = getLocalizedPrefWithDefault(
          "actionMessagesTemplate",
          "%time% * %sender% %message%"
        );
      } else {
        html = getLocalizedPrefWithDefault(
          "contentMessagesTemplate",
          "%time% - %sender%: %message%"
        );
      }
    }

    // Overrides default replacements so that they don't add a span node.
    // Also, this uses directly the text variable so that we don't
    // have to change the content of msg.message and revert it
    // afterwards.
    replacements = {
      message: aMsg => text,
      sender: aMsg => aMsg.alias || aMsg.who,
      __proto__: replacements,
    };

    // Finally, let the theme system do the magic!
    return replaceKeywordsInHTML(html, replacements, msg);
  },
};

export function getMessagesForRange(aRange) {
  const result = []; // will hold the final result
  const messages = {}; // used to prevent duplicate messages in the result array

  // cache the range boundaries, they will be used a lot
  const endNode = aRange.endContainer;
  let startNode = aRange.startContainer;

  // Helper function to recursively look for _originalMsg JS
  // properties on DOM nodes, and stop when endNode is reached.
  // Found nodes are pushed into the rootNodes array.
  const processSubtree = function (aNode) {
    if (aNode._originalMsg) {
      // store the result
      if (!(aNode._originalMsg.id in messages)) {
        // we've found a new message!
        const newMessage = new SelectedMessage(aNode, aRange);
        messages[aNode._originalMsg.id] = newMessage;
        result.push(newMessage);
      } else {
        // we've found another root of an already known message
        messages[aNode._originalMsg.id].addRoot(aNode);
      }
    }

    // check if we have reached the end node
    if (aNode == endNode) {
      return true;
    }

    // recurse through children
    if (
      aNode.nodeType == aNode.ELEMENT_NODE &&
      aNode.namespaceURI == "http://www.w3.org/1999/xhtml"
    ) {
      for (let i = 0; i < aNode.children.length; ++i) {
        if (processSubtree(aNode.children[i])) {
          return true;
        }
      }
    }

    return false;
  };

  const currentNode = aRange.commonAncestorContainer;
  if (
    currentNode.nodeType == currentNode.ELEMENT_NODE &&
    currentNode.namespaceURI == "http://www.w3.org/1999/xhtml"
  ) {
    // Determine the index of the first and last children of currentNode
    // that we should process.
    let found = false;
    let start = 0;
    if (currentNode == startNode) {
      // we want to process all children
      found = true;
      start = aRange.startOffset;
    } else {
      // startNode needs to be a direct child of currentNode
      while (startNode.parentNode != currentNode) {
        startNode = startNode.parentNode;
      }
    }
    let end;
    if (currentNode == endNode) {
      end = aRange.endOffset;
    } else {
      end = currentNode.children.length;
    }

    for (let i = start; i < end; ++i) {
      const node = currentNode.children[i];

      // don't do anything until we find the startNode
      found = found || node == startNode;
      if (!found) {
        continue;
      }

      if (processSubtree(node)) {
        break;
      }
    }
  }

  // The selection may not include any root node of the first touched
  // message, in this case, the DOM traversal of the DOM range
  // couldn't give us the first message. Make sure we actually have
  // the message in which the range starts.
  let firstRoot = aRange.startContainer;
  while (firstRoot && !firstRoot._originalMsg) {
    firstRoot = firstRoot.parentNode;
  }
  if (firstRoot && !(firstRoot._originalMsg.id in messages)) {
    result.unshift(new SelectedMessage(firstRoot, aRange));
  }

  return result;
}

/**
 * Turns a raw HTML string into a DocumentFragment usable in the provided
 * document.
 *
 * @param {Document} doc - The Document the fragment will belong to.
 * @param {string} html  - The target HTML to be parsed.
 *
 * @returns {DocumentFragment}
 */
export function getDocumentFragmentFromHTML(doc, html) {
  const uri = Services.io.newURI(doc.baseURI);
  const flags = Ci.nsIParserUtils.SanitizerAllowStyle;
  const context = doc.createElement("div");
  return ParserUtils.parseFragment(html, flags, false, uri, context);
}

/**
 * Get all nodes that make up the given message if any.
 *
 * @param {string} remoteId - Remote ID of the message to get
 * @param {Document} doc - Document the message is in.
 * @returns {NodeList} Node list of all the parts of the message, or an empty
 *  list if the message is not found.
 */
function getExistingMessage(remoteId, doc) {
  const parent = doc.getElementById("Chat");
  return parent.querySelectorAll(`[data-remote-id="${CSS.escape(remoteId)}"]`);
}
