/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function FeedItem() {
  this.mDate = FeedUtils.getValidRFC5322Date();
  this.mParserUtils = Cc["@mozilla.org/parserutils;1"].getService(Ci.nsIParserUtils);
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
  MESSAGE_TEMPLATE: "\n" +
    "<html>\n" +
    "  <head>\n" +
    "    <title>%TITLE%</title>\n" +
    "    <base href=\"%BASE%\">\n" +
    "  </head>\n" +
    "  <body id=\"msgFeedSummaryBody\" selected=\"false\">\n" +
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

    FeedUtils.log.trace("FeedItem.normalizeMessageID: messageID - " + messageID);
    return messageID;
  },

  get itemUniqueURI() {
    return this.createURN(this.id);
  },

  get contentBase() {
    if (this.xmlContentBase) {
      return this.xmlContentBase;
    }

    return this.mURL;
  },

  store() {
    // this.title and this.content contain HTML.
    // this.mUrl and this.contentBase contain plain text.

    let stored = false;
    let resource = this.findStoredResource();
    if (!this.feed.folder) {
      return stored;
    }

    if (resource == null) {
      resource = FeedUtils.rdf.GetResource(this.itemUniqueURI);
      if (!this.content) {
        FeedUtils.log.trace("FeedItem.store: " + this.identity +
                            " no content; storing description or title");
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
    return stored;
  },

  findStoredResource() {
    // Checks to see if the item has already been stored in its feed's
    // message folder.
    FeedUtils.log.trace("FeedItem.findStoredResource: checking if stored - " +
                        this.identity);

    let server = this.feed.server;
    let folder = this.feed.folder;

    if (!folder) {
      FeedUtils.log.debug("FeedItem.findStoredResource: folder '" +
                          this.feed.folderName +
                          "' doesn't exist; creating as child of " +
                          server.rootMsgFolder.prettyName + "\n");
      this.feed.createFolder();
      return null;
    }

    let ds = FeedUtils.getItemsDS(server);
    let itemURI = this.itemUniqueURI;
    let itemResource = FeedUtils.rdf.GetResource(itemURI);

    let downloaded = ds.GetTarget(itemResource, FeedUtils.FZ_STORED, true);

    if (!downloaded ||
        downloaded.QueryInterface(Ci.nsIRDFLiteral).Value == "false") {
      FeedUtils.log.trace("FeedItem.findStoredResource: not stored");
      return null;
    }

    FeedUtils.log.trace("FeedItem.findStoredResource: already stored");
    return itemResource;
  },

  markValid(resource) {
    let ds = FeedUtils.getItemsDS(this.feed.server);

    let newTimeStamp = FeedUtils.rdf.GetLiteral(new Date().getTime());
    let currentTimeStamp = ds.GetTarget(resource,
                                        FeedUtils.FZ_LAST_SEEN_TIMESTAMP,
                                        true);
    if (currentTimeStamp) {
      ds.Change(resource, FeedUtils.FZ_LAST_SEEN_TIMESTAMP,
                currentTimeStamp, newTimeStamp);
    } else {
      ds.Assert(resource, FeedUtils.FZ_LAST_SEEN_TIMESTAMP,
                newTimeStamp, true);
    }

    if (!ds.HasAssertion(resource, FeedUtils.FZ_FEED,
                         FeedUtils.rdf.GetResource(this.feed.url), true)) {
      ds.Assert(resource, FeedUtils.FZ_FEED,
                FeedUtils.rdf.GetResource(this.feed.url), true);
    }

    if (ds.hasArcOut(resource, FeedUtils.FZ_VALID)) {
      let currentValue = ds.GetTarget(resource, FeedUtils.FZ_VALID, true);
      ds.Change(resource, FeedUtils.FZ_VALID,
                currentValue, FeedUtils.RDF_LITERAL_TRUE);
    } else {
      ds.Assert(resource, FeedUtils.FZ_VALID, FeedUtils.RDF_LITERAL_TRUE, true);
    }
  },

  markStored(resource) {
    let ds = FeedUtils.getItemsDS(this.feed.server);

    if (!ds.HasAssertion(resource, FeedUtils.FZ_FEED,
                         FeedUtils.rdf.GetResource(this.feed.url), true)) {
      ds.Assert(resource, FeedUtils.FZ_FEED,
                FeedUtils.rdf.GetResource(this.feed.url), true);
    }

    let currentValue;
    if (ds.hasArcOut(resource, FeedUtils.FZ_STORED)) {
      currentValue = ds.GetTarget(resource, FeedUtils.FZ_STORED, true);
      ds.Change(resource, FeedUtils.FZ_STORED,
                currentValue, FeedUtils.RDF_LITERAL_TRUE);
    } else {
      ds.Assert(resource, FeedUtils.FZ_STORED,
                FeedUtils.RDF_LITERAL_TRUE, true);
    }
  },

  writeToFolder() {
    FeedUtils.log.trace("FeedItem.writeToFolder: " + this.identity +
                        " writing to message folder " + this.feed.name);
    // The subject may contain HTML entities.  Convert these to their unencoded
    // state. i.e. &amp; becomes '&'.
    let title = this.title;
    title = this.mParserUtils.convertToPlainText(
        title,
        Ci.nsIDocumentEncoder.OutputSelectionOnly |
        Ci.nsIDocumentEncoder.OutputAbsoluteLinks,
        0);

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
    let inreplytoHdrsStr = this.inReplyTo ?
      ("References: " + this.inReplyTo + "\n" +
       "In-Reply-To: " + this.inReplyTo + "\n") : "";

    // Support multiple authors in From.
    let fromStr = this.createHeaderStrFromArray("From: ", this.author);

    // If there are keywords (categories), create the headers.
    let keywordsStr = this.createHeaderStrFromArray("Keywords: ", this.keywords);

    // Escape occurrences of "From " at the beginning of lines of
    // content per the mbox standard, since "From " denotes a new
    // message, and add a line break so we know the last line has one.
    this.content = this.content.replace(/([\r\n]+)(>*From )/g, "$1>$2");
    this.content += "\n";

    // The opening line of the message, mandated by standards to start
    // with "From ".  It's useful to construct this separately because
    // we not only need to write it into the message, we also need to
    // use it to calculate the offset of the X-Mozilla-Status lines from
    // the front of the message for the statusOffset property of the
    // DB header object.
    let openingLine = "From - " + this.mDate + "\n";

    let source =
      openingLine +
      "X-Mozilla-Status: 0000\n" +
      "X-Mozilla-Status2: 00000000\n" +
      "X-Mozilla-Keys: " + " ".repeat(80) + "\n" +
      "Received: by localhost; " + FeedUtils.getValidRFC5322Date() + "\n" +
      "Date: " + this.mDate + "\n" +
      "Message-Id: " + this.normalizeMessageID(this.id) + "\n" +
      fromStr +
      "MIME-Version: 1.0\n" +
      "Subject: " + this.title + "\n" +
      inreplytoHdrsStr +
      keywordsStr +
      "Content-Transfer-Encoding: 8bit\n" +
      "Content-Base: " + this.mURL + "\n";

    if (this.enclosures.length) {
      let boundaryID = source.length;
      source += "Content-Type: multipart/mixed; boundary=\"" +
                this.ENCLOSURE_HEADER_BOUNDARY_PREFIX + boundaryID + "\"\n\n" +
                "This is a multi-part message in MIME format.\n" +
                this.ENCLOSURE_BOUNDARY_PREFIX + boundaryID + "\n" +
                "Content-Type: text/html; charset=" + this.characterSet + "\n" +
                "Content-Transfer-Encoding: 8bit\n" +
                this.content;

      this.enclosures.forEach(function(enclosure) {
        source += enclosure.convertToAttachment(boundaryID);
      });

      source += this.ENCLOSURE_BOUNDARY_PREFIX + boundaryID + "--\n\n\n";
    } else {
      source += "Content-Type: text/html; charset=" + this.characterSet + "\n" +
                this.content;
    }

    FeedUtils.log.trace("FeedItem.writeToFolder: " + this.identity +
                        " is " + source.length + " characters long");

    // Get the folder and database storing the feed's messages and headers.
    let folder = this.feed.folder.QueryInterface(Ci.nsIMsgLocalMailFolder);
    let msgFolder = folder.QueryInterface(Ci.nsIMsgFolder);
    msgFolder.gettingNewMessages = true;
    // Source is a unicode js string, as UTF-16, and we want to save a
    // char * cpp |string| as UTF-8 bytes. The source xml doc encoding is utf8.
    source = unescape(encodeURIComponent(source));
    let msgDBHdr = folder.addMessage(source);
    msgDBHdr.OrFlags(Ci.nsMsgMessageFlags.FeedMsg);
    msgFolder.gettingNewMessages = false;
    this.tagItem(msgDBHdr, this.keywords);
  },

/**
 * Create a header string from an array. Intended for comma separated headers
 * like From or Keywords. In the case of a longer than RFC5322 recommended
 * line length, create multiple folded lines (easier to parse than multiple
 * headers).
 *
 * @param  {String} headerName          - Name of the header.
 * @param  {String}[] headerItemsArray  - An Array of strings to concatenate.
 *
 * @returns {String}
 */
  createHeaderStrFromArray(headerName, headerItemsArray) {
    let headerStr = "";
    if (!headerItemsArray || headerItemsArray.length == 0) {
      return headerStr;
    }

    const HEADER = headerName;
    const LINELENGTH = 78;
    const MAXLINELENGTH = 990;
    let items = [].concat(headerItemsArray);
    let lines = [];
    headerStr = HEADER;
    while (items.length) {
      let item = items.shift();
      if (headerStr.length + item.length > LINELENGTH &&
          headerStr.length > HEADER.length) {
        lines.push(headerStr);
        headerStr = " ".repeat(HEADER.length);
      }

      headerStr += headerStr.length + item.length > MAXLINELENGTH ?
                     item.substr(0, MAXLINELENGTH - headerStr.length) + "…, " :
                     item + ", ";
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
    let category = this.feed.options.category;
    if (!aKeywords.length || !category.enabled) {
      return;
    }

    let msgArray = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
    msgArray.appendElement(aMsgDBHdr);

    let prefix = category.prefixEnabled ? category.prefix : "";
    let rtl = Services.prefs.getIntPref("bidi.direction") == 2;

    let keys = [];
    for (let keyword of aKeywords) {
      keyword = rtl ? keyword + prefix : prefix + keyword;
      let keyForTag = MailServices.tags.getKeyForTag(keyword);
      if (!keyForTag) {
        // Add the tag if it doesn't exist.
        MailServices.tags.addTag(keyword, "", FeedUtils.AUTOTAG);
        keyForTag = MailServices.tags.getKeyForTag(keyword);
      }

      // Add the tag key to the keys array.
      keys.push(keyForTag);
    }

    if (keys.length) {
      // Add the keys to the message.
      aMsgDBHdr.folder.addKeywordsToMessages(msgArray, keys.join(" "));
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

  createURN(aName) {
    // Returns name as a URN in the 'feeditem' namespace. The returned URN is
    // (or is intended to be) RFC2141 compliant.
    // The builtin encodeURI provides nearly the exact encoding functionality
    // required by the RFC.  The exceptions are that NULL characters should not
    // appear, and that #, /, ?, &, and ~ should be escaped.
    // NULL characters are removed before encoding.

    let name = aName.replace(/\0/g, "");
    let encoded = encodeURI(name);
    encoded = encoded.replace(/\#/g, "%23");
    encoded = encoded.replace(/\//g, "%2f");
    encoded = encoded.replace(/\?/g, "%3f");
    encoded = encoded.replace(/\&/g, "%26");
    encoded = encoded.replace(/\~/g, "%7e");

    return FeedUtils.FZ_ITEM_NS + encoded;
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
      this.mFileName = Services.io.newURI(this.mURL).
                                   QueryInterface(Ci.nsIURL).
                                   fileName;
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
    return "\n" +
      this.ENCLOSURE_BOUNDARY_PREFIX + aBoundaryID + "\n" +
      "Content-Type: " + this.mContentType +
                     "; name=\"" + (this.mTitle || this.mFileName) +
                     (this.mLength ? "\"; size=" + this.mLength : "\"") + "\n" +
      "X-Mozilla-External-Attachment-URL: " + this.mURL + "\n" +
      "Content-Disposition: attachment; filename=\"" + this.mFileName + "\"\n\n" +
      FeedUtils.strings.GetStringFromName("externalAttachmentMsg") + "\n";
  },
};
