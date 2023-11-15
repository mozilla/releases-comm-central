/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["FeedItem", "FeedEnclosure"];

const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

const lazy = {};
ChromeUtils.defineModuleGetter(
  lazy,
  "FeedUtils",
  "resource:///modules/FeedUtils.jsm"
);

function FeedItem() {
  this.mDate = lazy.FeedUtils.getValidRFC5322Date();
  this.mParserUtils = Cc["@mozilla.org/parserutils;1"].getService(
    Ci.nsIParserUtils
  );
}

FeedItem.prototype = {
  // Only for IETF Atom.
  xmlContentBase: null,
  id: null,
  feed: null,
  description: null,
  content: null,
  enclosures: [],
  title: null,
  // Author must be angle bracket enclosed to function as an addr-spec, in the
  // absence of an addr-spec portion of an RFC5322 email address, as other
  // functionality (gloda search) depends on this.
  author: "<anonymous>",
  inReplyTo: "",
  keywords: [],
  mURL: null,
  characterSet: "UTF-8",

  ENCLOSURE_BOUNDARY_PREFIX: "--------------", // 14 dashes
  ENCLOSURE_HEADER_BOUNDARY_PREFIX: "------------", // 12 dashes
  MESSAGE_TEMPLATE:
    "\n" +
    "<!DOCTYPE html>\n" +
    "<html>\n" +
    "  <head>\n" +
    "    <title>%TITLE%</title>\n" +
    '    <base href="%BASE%">\n' +
    "  </head>\n" +
    '  <body id="msgFeedSummaryBody" selected="false">\n' +
    "    %CONTENT%\n" +
    "  </body>\n" +
    "</html>\n",

  get url() {
    return this.mURL;
  },

  set url(aVal) {
    try {
      this.mURL = Services.io.newURI(aVal).spec;
    } catch (ex) {
      // The url as published or constructed can be a non url.  It's used as a
      // feeditem identifier in feeditems.rdf, as a messageId, and as an href
      // and for the content-base header.  Save as is; ensure not null.
      this.mURL = aVal ? aVal : "";
    }
  },

  get date() {
    return this.mDate;
  },

  set date(aVal) {
    this.mDate = aVal;
  },

  get identity() {
    return this.feed.name + ": " + this.title + " (" + this.id + ")";
  },

  normalizeMessageID(messageID) {
    // Escape occurrences of message ID meta characters <, >, and @.
    messageID.replace(/</g, "%3C");
    messageID.replace(/>/g, "%3E");
    messageID.replace(/@/g, "%40");
    messageID = "<" + messageID.trim() + "@localhost.localdomain>";

    lazy.FeedUtils.log.trace(
      "FeedItem.normalizeMessageID: messageID - " + messageID
    );
    return messageID;
  },

  get contentBase() {
    if (this.xmlContentBase) {
      return this.xmlContentBase;
    }

    return this.mURL;
  },

  /**
   * Writes the item to the folder as a message and updates the feeditems db.
   *
   * @returns {void}
   */
  store() {
    // this.title and this.content contain HTML.
    // this.mUrl and this.contentBase contain plain text.

    let stored = false;
    const ds = lazy.FeedUtils.getItemsDS(this.feed.server);
    let resource = this.findStoredResource();
    if (!this.feed.folder) {
      return stored;
    }

    if (resource == null) {
      resource = {
        feedURLs: [this.feed.url],
        lastSeenTime: 0,
        valid: false,
        stored: false,
      };
      ds.data[this.id] = resource;
      if (!this.content) {
        lazy.FeedUtils.log.trace(
          "FeedItem.store: " +
            this.identity +
            " no content; storing description or title"
        );
        this.content = this.description || this.title;
      }

      let content = this.MESSAGE_TEMPLATE;
      content = content.replace(/%TITLE%/, this.title);
      content = content.replace(/%BASE%/, this.htmlEscape(this.contentBase));
      content = content.replace(/%CONTENT%/, this.content);
      this.content = content;
      this.writeToFolder();
      this.markStored(resource);
      stored = true;
    }

    this.markValid(resource);
    ds.saveSoon();
    return stored;
  },

  findStoredResource() {
    // Checks to see if the item has already been stored in its feed's
    // message folder.
    lazy.FeedUtils.log.trace(
      "FeedItem.findStoredResource: checking if stored - " + this.identity
    );

    const server = this.feed.server;
    const folder = this.feed.folder;

    if (!folder) {
      lazy.FeedUtils.log.debug(
        "FeedItem.findStoredResource: folder '" +
          this.feed.folderName +
          "' doesn't exist; creating as child of " +
          server.rootMsgFolder.prettyName +
          "\n"
      );
      this.feed.createFolder();
      return null;
    }

    const ds = lazy.FeedUtils.getItemsDS(server);
    const item = ds.data[this.id];
    if (!item || !item.stored) {
      lazy.FeedUtils.log.trace("FeedItem.findStoredResource: not stored");
      return null;
    }

    lazy.FeedUtils.log.trace("FeedItem.findStoredResource: already stored");
    return item;
  },

  markValid(resource) {
    resource.lastSeenTime = new Date().getTime();
    // Items can be in multiple feeds.
    if (!resource.feedURLs.includes(this.feed.url)) {
      resource.feedURLs.push(this.feed.url);
    }
    resource.valid = true;
  },

  markStored(resource) {
    // Items can be in multiple feeds.
    if (!resource.feedURLs.includes(this.feed.url)) {
      resource.feedURLs.push(this.feed.url);
    }
    resource.stored = true;
  },

  writeToFolder() {
    lazy.FeedUtils.log.trace(
      "FeedItem.writeToFolder: " +
        this.identity +
        " writing to message folder " +
        this.feed.name
    );
    // The subject may contain HTML entities.  Convert these to their unencoded
    // state. i.e. &amp; becomes '&'.
    let title = this.title;
    title = this.mParserUtils.convertToPlainText(
      title,
      Ci.nsIDocumentEncoder.OutputSelectionOnly |
        Ci.nsIDocumentEncoder.OutputAbsoluteLinks,
      0
    );

    // Compress white space in the subject to make it look better.  Trim
    // leading/trailing spaces to prevent mbox header folding issue at just
    // the right subject length.
    this.title = title.replace(/[\t\r\n]+/g, " ").trim();

    // If the date looks like it's in W3C-DTF format, convert it into
    // an IETF standard date.  Otherwise assume it's in IETF format.
    if (this.mDate.search(/^\d\d\d\d/) != -1) {
      this.mDate = new Date(this.mDate).toUTCString();
    }

    // If there is an inreplyto value, create the headers.
    const inreplytoHdrsStr = this.inReplyTo
      ? "References: " +
        this.inReplyTo +
        "\n" +
        "In-Reply-To: " +
        this.inReplyTo +
        "\n"
      : "";

    // Support multiple authors in From.
    const fromStr = this.createHeaderStrFromArray("From: ", this.author);

    // If there are keywords (categories), create the headers.
    const keywordsStr = this.createHeaderStrFromArray(
      "Keywords: ",
      this.keywords
    );

    let source =
      "X-Mozilla-Status: 0000\n" +
      "X-Mozilla-Status2: 00000000\n" +
      "X-Mozilla-Keys: " +
      " ".repeat(80) +
      "\n" +
      "Received: by localhost; " +
      lazy.FeedUtils.getValidRFC5322Date() +
      "\n" +
      "Date: " +
      this.mDate +
      "\n" +
      "Message-Id: " +
      this.normalizeMessageID(this.id) +
      "\n" +
      fromStr +
      "MIME-Version: 1.0\n" +
      "Subject: " +
      this.title +
      "\n" +
      inreplytoHdrsStr +
      keywordsStr +
      "Content-Transfer-Encoding: 8bit\n" +
      "Content-Base: " +
      this.mURL +
      "\n";

    if (this.enclosures.length) {
      const boundaryID = source.length;
      source +=
        'Content-Type: multipart/mixed; boundary="' +
        this.ENCLOSURE_HEADER_BOUNDARY_PREFIX +
        boundaryID +
        '"\n\n' +
        "This is a multi-part message in MIME format.\n" +
        this.ENCLOSURE_BOUNDARY_PREFIX +
        boundaryID +
        "\n" +
        "Content-Type: text/html; charset=" +
        this.characterSet +
        "\n" +
        "Content-Transfer-Encoding: 8bit\n" +
        this.content;

      this.enclosures.forEach(function (enclosure) {
        source += enclosure.convertToAttachment(boundaryID);
      });

      source += this.ENCLOSURE_BOUNDARY_PREFIX + boundaryID + "--\n\n\n";
    } else {
      source +=
        "Content-Type: text/html; charset=" +
        this.characterSet +
        "\n" +
        this.content;
    }

    lazy.FeedUtils.log.trace(
      "FeedItem.writeToFolder: " +
        this.identity +
        " is " +
        source.length +
        " characters long"
    );

    // Get the folder and database storing the feed's messages and headers.
    const folder = this.feed.folder.QueryInterface(Ci.nsIMsgLocalMailFolder);
    const msgFolder = folder.QueryInterface(Ci.nsIMsgFolder);
    msgFolder.gettingNewMessages = true;
    // Source is a unicode js string, as UTF-16, and we want to save a
    // char * cpp |string| as UTF-8 bytes. The source xml doc encoding is utf8.
    source = unescape(encodeURIComponent(source));
    const msgDBHdr = folder.addMessage(source);
    msgDBHdr.orFlags(Ci.nsMsgMessageFlags.FeedMsg);
    msgFolder.gettingNewMessages = false;
    this.tagItem(msgDBHdr, this.keywords);
  },

  /**
   * Create a header string from an array. Intended for comma separated headers
   * like From or Keywords. In the case of a longer than RFC5322 recommended
   * line length, create multiple folded lines (easier to parse than multiple
   * headers).
   *
   * @param  {string} headerName          - Name of the header.
   * @param  {string[]} headerItemsArray  - An Array of strings to concatenate.
   *
   * @returns {String} - The header string.
   */
  createHeaderStrFromArray(headerName, headerItemsArray) {
    let headerStr = "";
    if (!headerItemsArray || headerItemsArray.length == 0) {
      return headerStr;
    }

    const HEADER = headerName;
    const LINELENGTH = 78;
    const MAXLINELENGTH = 990;
    const items = [].concat(headerItemsArray);
    const lines = [];
    headerStr = HEADER;
    while (items.length) {
      const item = items.shift();
      if (
        headerStr.length + item.length > LINELENGTH &&
        headerStr.length > HEADER.length
      ) {
        lines.push(headerStr);
        headerStr = " ".repeat(HEADER.length);
      }

      headerStr +=
        headerStr.length + item.length > MAXLINELENGTH
          ? item.substr(0, MAXLINELENGTH - headerStr.length) + "…, "
          : item + ", ";
    }

    headerStr = headerStr.replace(/,\s$/, "\n");
    lines.push(headerStr);
    headerStr = lines.join("\n");

    return headerStr;
  },

  /**
   * Autotag messages.
   *
   * @param  {nsIMsgDBHdr} aMsgDBHdr - message to tag
   * @param  {Array} aKeywords       - keywords (tags)
   * @returns {void}
   */
  tagItem(aMsgDBHdr, aKeywords) {
    const category = this.feed.options.category;
    if (!aKeywords.length || !category.enabled) {
      return;
    }

    const prefix = category.prefixEnabled ? category.prefix : "";
    const rtl = Services.prefs.getIntPref("bidi.direction") == 2;

    const keys = [];
    for (let keyword of aKeywords) {
      keyword = rtl ? keyword + prefix : prefix + keyword;
      let keyForTag = MailServices.tags.getKeyForTag(keyword);
      if (!keyForTag) {
        // Add the tag if it doesn't exist.
        MailServices.tags.addTag(keyword, "", lazy.FeedUtils.AUTOTAG);
        keyForTag = MailServices.tags.getKeyForTag(keyword);
      }

      // Add the tag key to the keys array.
      keys.push(keyForTag);
    }

    if (keys.length) {
      // Add the keys to the message.
      aMsgDBHdr.folder.addKeywordsToMessages([aMsgDBHdr], keys.join(" "));
    }
  },

  htmlEscape(s) {
    s = s.replace(/&/g, "&amp;");
    s = s.replace(/>/g, "&gt;");
    s = s.replace(/</g, "&lt;");
    s = s.replace(/'/g, "&#39;");
    s = s.replace(/"/g, "&quot;");
    return s;
  },
};

// A feed enclosure is to RSS what an attachment is for e-mail.  We make
// enclosures look like attachments in the UI.
function FeedEnclosure(aURL, aContentType, aLength, aTitle) {
  this.mURL = aURL;
  // Store a reasonable mimetype if content-type is not present.
  this.mContentType = aContentType || "application/unknown";
  this.mLength = aLength;
  this.mTitle = aTitle;

  // Generate a fileName from the URL.
  if (this.mURL) {
    try {
      const uri = Services.io.newURI(this.mURL).QueryInterface(Ci.nsIURL);
      this.mFileName = uri.fileName;
      // Determine mimetype from extension if content-type is not present.
      if (!aContentType) {
        const contentType = Cc["@mozilla.org/mime;1"]
          .getService(Ci.nsIMIMEService)
          .getTypeFromExtension(uri.fileExtension);
        this.mContentType = contentType;
      }
    } catch (ex) {
      this.mFileName = this.mURL;
    }
  }
}

FeedEnclosure.prototype = {
  mURL: "",
  mContentType: "",
  mLength: 0,
  mFileName: "",
  mTitle: "",
  ENCLOSURE_BOUNDARY_PREFIX: "--------------", // 14 dashes

  // Returns a string that looks like an e-mail attachment which represents
  // the enclosure.
  convertToAttachment(aBoundaryID) {
    return (
      "\n" +
      this.ENCLOSURE_BOUNDARY_PREFIX +
      aBoundaryID +
      "\n" +
      "Content-Type: " +
      this.mContentType +
      '; name="' +
      (this.mTitle || this.mFileName) +
      (this.mLength ? '"; size=' + this.mLength : '"') +
      "\n" +
      "X-Mozilla-External-Attachment-URL: " +
      this.mURL +
      "\n" +
      'Content-Disposition: attachment; filename="' +
      this.mFileName +
      '"\n\n' +
      lazy.FeedUtils.strings.GetStringFromName("externalAttachmentMsg") +
      "\n"
    );
  },
};
