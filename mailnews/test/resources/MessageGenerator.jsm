/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = [
  "MessageGenerator",
  "addMessagesToFolder",
  "MessageScenarioFactory",
  "SyntheticPartLeaf",
  "SyntheticDegeneratePartEmpty",
  "SyntheticPartMulti",
  "SyntheticPartMultiMixed",
  "SyntheticPartMultiParallel",
  "SyntheticPartMultiDigest",
  "SyntheticPartMultiAlternative",
  "SyntheticPartMultiRelated",
  "SyntheticPartMultiSignedSMIME",
  "SyntheticPartMultiSignedPGP",
  "SyntheticMessage",
  "SyntheticMessageSet",
];

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

/**
 * A list of first names for use by MessageGenerator to create deterministic,
 *  reversible names.  To keep things easily reversible, if you add names, make
 *  sure they have no spaces in them!
 */
var FIRST_NAMES = [
  "Andy",
  "Bob",
  "Chris",
  "David",
  "Emily",
  "Felix",
  "Gillian",
  "Helen",
  "Idina",
  "Johnny",
  "Kate",
  "Lilia",
  "Martin",
  "Neil",
  "Olof",
  "Pete",
  "Quinn",
  "Rasmus",
  "Sarah",
  "Troels",
  "Ulf",
  "Vince",
  "Will",
  "Xavier",
  "Yoko",
  "Zig",
];

/**
 * A list of last names for use by MessageGenerator to create deterministic,
 *  reversible names.  To keep things easily reversible, if you add names, make
 *  sure they have no spaces in them!
 */
var LAST_NAMES = [
  "Anway",
  "Bell",
  "Clarke",
  "Davol",
  "Ekberg",
  "Flowers",
  "Gilbert",
  "Hook",
  "Ivarsson",
  "Jones",
  "Kurtz",
  "Lowe",
  "Morris",
  "Nagel",
  "Orzabal",
  "Price",
  "Quinn",
  "Rolinski",
  "Stanley",
  "Tennant",
  "Ulvaeus",
  "Vannucci",
  "Wiggs",
  "Xavier",
  "Young",
  "Zig",
];

/**
 * A list of adjectives used to construct a deterministic, reversible subject
 *  by MessageGenerator.  To keep things easily reversible, if you add more,
 *  make sure they have no spaces in them!  Also, make sure your additions
 *  don't break the secret Monty Python reference!
 */
var SUBJECT_ADJECTIVES = [
  "Big",
  "Small",
  "Huge",
  "Tiny",
  "Red",
  "Green",
  "Blue",
  "My",
  "Happy",
  "Sad",
  "Grumpy",
  "Angry",
  "Awesome",
  "Fun",
  "Lovely",
  "Funky",
];

/**
 * A list of nouns used to construct a deterministic, reversible subject
 *  by MessageGenerator.  To keep things easily reversible, if you add more,
 *  make sure they have no spaces in them!  Also, make sure your additions
 *  don't break the secret Monty Python reference!
 */
var SUBJECT_NOUNS = [
  "Meeting",
  "Party",
  "Shindig",
  "Wedding",
  "Document",
  "Report",
  "Spreadsheet",
  "Hovercraft",
  "Aardvark",
  "Giraffe",
  "Llama",
  "Velociraptor",
  "Laser",
  "Ray-Gun",
  "Pen",
  "Sword",
];

/**
 * A list of suffixes used to construct a deterministic, reversible subject
 *  by MessageGenerator.  These can (clearly) have spaces in them.  Make sure
 *  your additions don't break the secret Monty Python reference!
 */
var SUBJECT_SUFFIXES = [
  "Today",
  "Tomorrow",
  "Yesterday",
  "In a Fortnight",
  "Needs Attention",
  "Very Important",
  "Highest Priority",
  "Full Of Eels",
  "In The Lobby",
  "On Your Desk",
  "In Your Car",
  "Hiding Behind The Door",
];

/**
 * Base class for MIME Part representation.
 */
function SyntheticPart(aProperties) {
  if (aProperties) {
    if ("contentType" in aProperties) {
      this._contentType = aProperties.contentType;
    }
    if ("charset" in aProperties) {
      this._charset = aProperties.charset;
    }
    if ("format" in aProperties) {
      this._format = aProperties.format;
    }
    if ("filename" in aProperties) {
      this._filename = aProperties.filename;
    }
    if ("boundary" in aProperties) {
      this._boundary = aProperties.boundary;
    }
    if ("encoding" in aProperties) {
      this._encoding = aProperties.encoding;
    }
    if ("contentId" in aProperties) {
      this._contentId = aProperties.contentId;
    }
    if ("disposition" in aProperties) {
      this._forceDisposition = aProperties.disposition;
    }
    if ("extraHeaders" in aProperties) {
      this._extraHeaders = aProperties.extraHeaders;
    }
  }
}
SyntheticPart.prototype = {
  _forceDisposition: null,
  _encoding: null,

  get contentTypeHeaderValue() {
    let s = this._contentType;
    if (this._charset) {
      s += "; charset=" + this._charset;
    }
    if (this._format) {
      s += "; format=" + this._format;
    }
    if (this._filename) {
      s += ';\r\n name="' + this._filename + '"';
    }
    if (this._contentTypeExtra) {
      for (const [key, value] of Object.entries(this._contentTypeExtra)) {
        s += ";\r\n " + key + '="' + value + '"';
      }
    }
    if (this._boundary) {
      s += ';\r\n boundary="' + this._boundary + '"';
    }
    return s;
  },
  get hasTransferEncoding() {
    return this._encoding;
  },
  get contentTransferEncodingHeaderValue() {
    return this._encoding;
  },
  get hasDisposition() {
    return this._forceDisposition || this._filename || false;
  },
  get contentDispositionHeaderValue() {
    let s = "";
    if (this._forceDisposition) {
      s += this._forceDisposition;
    } else if (this._filename) {
      s += 'attachment;\r\n filename="' + this._filename + '"';
    }
    return s;
  },
  get hasContentId() {
    return this._contentId || false;
  },
  get contentIdHeaderValue() {
    return "<" + this._contentId + ">";
  },
  get hasExtraHeaders() {
    return this._extraHeaders || false;
  },
  get extraHeaders() {
    return this._extraHeaders || false;
  },
};

/**
 * Leaf MIME part, defaulting to text/plain.
 */
function SyntheticPartLeaf(aBody, aProperties) {
  SyntheticPart.call(this, aProperties);
  this.body = aBody;
}
SyntheticPartLeaf.prototype = {
  __proto__: SyntheticPart.prototype,
  _contentType: "text/plain",
  _charset: "ISO-8859-1",
  _format: "flowed",
  _encoding: "7bit",
  toMessageString() {
    return this.body;
  },
  prettyString(aIndent) {
    return "Leaf: " + this._contentType;
  },
};

/**
 * A part that tells us to produce NO output in a multipart section.  So if our
 *  separator is "--BOB", we might produce "--BOB\n--BOB--\n" instead of having
 *  some headers and actual content in there.
 * This is not a good idea and probably not legal either, but it happens and
 *  we need to test for it.
 */
function SyntheticDegeneratePartEmpty() {}
SyntheticDegeneratePartEmpty.prototype = {
  prettyString(aIndent) {
    return "Degenerate Empty Part";
  },
};

/**
 * Multipart (multipart/*) MIME part base class.
 */
function SyntheticPartMulti(aParts, aProperties) {
  SyntheticPart.call(this, aProperties);

  this._boundary = "--------------CHOPCHOP" + this.BOUNDARY_COUNTER;
  this.BOUNDARY_COUNTER_HOME.BOUNDARY_COUNTER += 1;
  this.parts = aParts != null ? aParts : [];
}
SyntheticPartMulti.prototype = {
  __proto__: SyntheticPart.prototype,
  BOUNDARY_COUNTER: 0,
  toMessageString() {
    let s = "This is a multi-part message in MIME format.\r\n";
    for (const part of this.parts) {
      s += "--" + this._boundary + "\r\n";
      if (part instanceof SyntheticDegeneratePartEmpty) {
        continue;
      }
      s += "Content-Type: " + part.contentTypeHeaderValue + "\r\n";
      if (part.hasTransferEncoding) {
        s +=
          "Content-Transfer-Encoding: " +
          part.contentTransferEncodingHeaderValue +
          "\r\n";
      }
      if (part.hasDisposition) {
        s +=
          "Content-Disposition: " + part.contentDispositionHeaderValue + "\r\n";
      }
      if (part.hasContentId) {
        s += "Content-ID: " + part.contentIdHeaderValue + "\r\n";
      }
      if (part.hasExtraHeaders) {
        for (const k in part.extraHeaders) {
          const v = part.extraHeaders[k];
          s += k + ": " + v + "\r\n";
        }
      }
      s += "\r\n";
      s += part.toMessageString() + "\r\n";
    }
    s += "--" + this._boundary + "--";
    return s;
  },
  prettyString(aIndent) {
    const nextIndent = aIndent != null ? aIndent + "  " : "";

    let s = "Container: " + this._contentType;

    for (let iPart = 0; iPart < this.parts.length; iPart++) {
      const part = this.parts[iPart];
      s +=
        "\n" + nextIndent + (iPart + 1) + " " + part.prettyString(nextIndent);
    }

    return s;
  },
};
SyntheticPartMulti.prototype.BOUNDARY_COUNTER_HOME =
  SyntheticPartMulti.prototype;

/**
 * Multipart mixed (multipart/mixed) MIME part.
 */
function SyntheticPartMultiMixed(...aArgs) {
  SyntheticPartMulti.apply(this, aArgs);
}
SyntheticPartMultiMixed.prototype = {
  __proto__: SyntheticPartMulti.prototype,
  _contentType: "multipart/mixed",
};

/**
 * Multipart mixed (multipart/mixed) MIME part.
 */
function SyntheticPartMultiParallel(...aArgs) {
  SyntheticPartMulti.apply(this, aArgs);
}
SyntheticPartMultiParallel.prototype = {
  __proto__: SyntheticPartMulti.prototype,
  _contentType: "multipart/parallel",
};

/**
 * Multipart digest (multipart/digest) MIME part.
 */
function SyntheticPartMultiDigest(...aArgs) {
  SyntheticPartMulti.apply(this, aArgs);
}
SyntheticPartMultiDigest.prototype = {
  __proto__: SyntheticPartMulti.prototype,
  _contentType: "multipart/digest",
};

/**
 * Multipart alternative (multipart/alternative) MIME part.
 */
function SyntheticPartMultiAlternative(...aArgs) {
  SyntheticPartMulti.apply(this, aArgs);
}
SyntheticPartMultiAlternative.prototype = {
  __proto__: SyntheticPartMulti.prototype,
  _contentType: "multipart/alternative",
};

/**
 * Multipart related (multipart/related) MIME part.
 */
function SyntheticPartMultiRelated(...aArgs) {
  SyntheticPartMulti.apply(this, aArgs);
}
SyntheticPartMultiRelated.prototype = {
  __proto__: SyntheticPartMulti.prototype,
  _contentType: "multipart/related",
};

var PKCS_SIGNATURE_MIME_TYPE = "application/x-pkcs7-signature";
/**
 * Multipart signed (multipart/signed) SMIME part.  This is helperish and makes
 *  up a gibberish signature.  We wrap the provided parts in the standard
 *  signature idiom
 *
 * @param {string} aPart - The content part to wrap. Only one part!
 *    Use a multipart if you need to cram extra stuff in there.
 * @param {object} aProperties - Properties, propagated to SyntheticPart, see that.
 */
function SyntheticPartMultiSignedSMIME(aPart, aProperties) {
  SyntheticPartMulti.call(this, [aPart], aProperties);
  this.parts.push(
    new SyntheticPartLeaf(
      "I am not really a signature but let's hope no one figures it out.",
      {
        contentType: PKCS_SIGNATURE_MIME_TYPE,
        name: "smime.p7s",
      }
    )
  );
}
SyntheticPartMultiSignedSMIME.prototype = {
  __proto__: SyntheticPartMulti.prototype,
  _contentType: "multipart/signed",
  _contentTypeExtra: {
    protocol: PKCS_SIGNATURE_MIME_TYPE,
    micalg: "SHA1",
  },
};

var PGP_SIGNATURE_MIME_TYPE = "application/pgp-signature";
/**
 * Multipart signed (multipart/signed) PGP part.  This is helperish and makes
 *  up a gibberish signature.  We wrap the provided parts in the standard
 *  signature idiom
 *
 * @param {string} aPart - The content part to wrap. Only one part!
 *    Use a multipart if you need to cram extra stuff in there.
 * @param {object} aProperties - Properties, propagated to SyntheticPart, see that.
 */
function SyntheticPartMultiSignedPGP(aPart, aProperties) {
  SyntheticPartMulti.call(this, [aPart], aProperties);
  this.parts.push(
    new SyntheticPartLeaf(
      "I am not really a signature but let's hope no one figures it out.",
      {
        contentType: PGP_SIGNATURE_MIME_TYPE,
      }
    )
  );
}
SyntheticPartMultiSignedPGP.prototype = {
  __proto__: SyntheticPartMulti.prototype,
  _contentType: "multipart/signed",
  _contentTypeExtra: {
    protocol: PGP_SIGNATURE_MIME_TYPE,
    micalg: "pgp-sha1",
  },
};

var _DEFAULT_META_STATES = {
  junk: false,
  read: false,
};

/**
 * A synthetic message, created by the MessageGenerator.  Captures both the
 *  ingredients that went into the synthetic message as well as the rfc822 form
 *  of the message.
 *
 * @param {object} [aHeaders] A dictionary of rfc822 header payloads.
 *   The key should be capitalized as you want it to appear in the output.
 *   This requires adherence to convention of this class. You are best to just
 *   use the helpers provided by this class.
 * @param {object} [aBodyPart] - An instance of one of the many Synthetic part
 *   types available in this file.
 * @param {object} [aMetaState] - A dictionary of meta-state about the message
 *   that is only relevant to the MessageInjection logic and perhaps some
 *   testing logic.
 * @param {boolean} [aMetaState.junk=false] Is the method junk?
 */
function SyntheticMessage(aHeaders, aBodyPart, aMetaState) {
  // we currently do not need to call SyntheticPart's constructor...
  this.headers = aHeaders || {};
  this.bodyPart = aBodyPart || new SyntheticPartLeaf("");
  this.metaState = aMetaState || {};
  for (const key in _DEFAULT_META_STATES) {
    const value = _DEFAULT_META_STATES[key];
    if (!(key in this.metaState)) {
      this.metaState[key] = value;
    }
  }
}

SyntheticMessage.prototype = {
  __proto__: SyntheticPart.prototype,
  _contentType: "message/rfc822",
  _charset: null,
  _format: null,
  _encoding: null,

  /** @returns {string} The Message-Id header value. */
  get messageId() {
    return this._messageId;
  },
  /**
   * Sets the Message-Id header value.
   *
   * @param {string} aMessageId - A unique string without the greater-than and
   *   less-than, we add those for you.
   */
  set messageId(aMessageId) {
    this._messageId = aMessageId;
    this.headers["Message-Id"] = "<" + aMessageId + ">";
  },

  /** @returns {Date} The message Date header value. */
  get date() {
    return this._date;
  },
  /**
   * Sets the Date header to the given javascript Date object.
   *
   * @param {Date} aDate The date you want the message to claim to be from.
   */
  set date(aDate) {
    this._date = aDate;
    const dateParts = aDate.toString().split(" ");
    this.headers.Date =
      dateParts[0] +
      ", " +
      dateParts[2] +
      " " +
      dateParts[1] +
      " " +
      dateParts[3] +
      " " +
      dateParts[4] +
      " " +
      dateParts[5].substring(3);
  },

  /** @returns {string} The message subject. */
  get subject() {
    return this._subject;
  },
  /**
   * Sets the message subject.
   *
   * @param {string} aSubject - A string sans newlines or other illegal characters.
   */
  set subject(aSubject) {
    this._subject = aSubject;
    this.headers.Subject = aSubject;
  },

  /**
   * Given a tuple containing [a display name, an e-mail address], returns a
   *  string suitable for use in a to/from/cc header line.
   *
   * @param {string[]} aNameAndAddress - A list with two elements. The first
   *   should be the display name (sans wrapping quotes). The second element
   *   should be the e-mail address (sans wrapping greater-than/less-than).
   */
  _formatMailFromNameAndAddress(aNameAndAddress) {
    // if the name is encoded, do not put it in quotes!
    if (aNameAndAddress[0].startsWith("=")) {
      return aNameAndAddress[0] + " <" + aNameAndAddress[1] + ">";
    }
    return '"' + aNameAndAddress[0] + '" <' + aNameAndAddress[1] + ">";
  },

  /**
   * Given a mailbox, parse out name and email. The mailbox
   * can (per rfc 2822) be of two forms:
   *  1) Name <me@example.org>
   *  2) me@example.org
   *
   * @returns {string[]} A tuple of name, email.
   */
  _parseMailbox(mailbox) {
    const matcher = mailbox.match(/(.*)<(.+@.+)>/);
    if (!matcher) {
      // no match -> second form
      return ["", mailbox];
    }

    const name = matcher[1].trim();
    const email = matcher[2].trim();
    return [name, email];
  },

  /** @returns {string[]} The name-and-address tuple used when setting the From header. */
  get from() {
    return this._from;
  },
  /**
   * Sets the From header using the given tuple containing [a display name,
   *  an e-mail address].
   *
   * @param {string[]} aNameAndAddress - A list with two elements. The first
   *   should be the display name (sans wrapping quotes). The second element
   *   should be the e-mail address (sans wrapping greater-than/less-than).
   *   Can also be a string, should then be a valid raw From: header value.
   */
  set from(aNameAndAddress) {
    if (typeof aNameAndAddress === "string") {
      this._from = this._parseMailbox(aNameAndAddress);
      this.headers.From = aNameAndAddress;
      return;
    }
    this._from = aNameAndAddress;
    this.headers.From = this._formatMailFromNameAndAddress(aNameAndAddress);
  },

  /** @returns {string} The display name part of the From header. */
  get fromName() {
    return this._from[0];
  },
  /** @returns {string} The e-mail address part of the From header (no display name). */
  get fromAddress() {
    return this._from[1];
  },

  /**
   * For our header storage, we may need to pre-add commas, this does it.
   *
   * @param {string[]} aList - A list of strings that is mutated so that every
   *   string in the list except the last one has a comma appended to it.
   */
  _commaize(aList) {
    for (let i = 0; i < aList.length - 1; i++) {
      aList[i] = aList[i] + ",";
    }
    return aList;
  },

  /**
   * @returns {string[][]} the comma-ized list of name-and-address tuples used
   *   to set the To header.
   */
  get to() {
    return this._to;
  },
  /**
   * Sets the To header using a list of tuples containing [a display name,
   *  an e-mail address].
   *
   * @param {string[][]} aNameAndAddresses - A list of name-and-address tuples.
   *   Each tuple is alist with two elements. The first should be the
   *   display name (sans wrapping quotes).  The second element should be the
   *   e-mail address (sans wrapping greater-than/less-than).
   *   Can also be a string, should then be a valid raw To: header value.
   */
  set to(aNameAndAddresses) {
    if (typeof aNameAndAddresses === "string") {
      this._to = [];
      const people = aNameAndAddresses.split(",");
      for (let i = 0; i < people.length; i++) {
        this._to.push(this._parseMailbox(people[i]));
      }

      this.headers.To = aNameAndAddresses;
      return;
    }
    this._to = aNameAndAddresses;
    this.headers.To = this._commaize(
      aNameAndAddresses.map(nameAndAddr =>
        this._formatMailFromNameAndAddress(nameAndAddr)
      )
    );
  },
  /** @returns {string} The display name of the first intended recipient. */
  get toName() {
    return this._to[0][0];
  },
  /** @returns {string} The email address (no display name) of the first recipient. */
  get toAddress() {
    return this._to[0][1];
  },

  /**
   * @returns {string[][]} The comma-ized list of name-and-address tuples used
   *   to set the Cc header.
   */
  get cc() {
    return this._cc;
  },
  /**
   * Sets the Cc header using a list of tuples containing [a display name,
   *  an e-mail address].
   *
   * @param {string[][]} aNameAndAddresses - A list of name-and-address tuples.
   *   Each tuple is a list with two elements. The first should be the
   *   display name (sans wrapping quotes). The second element should be the
   *   e-mail address (sans wrapping greater-than/less-than).
   *   Can also be a string, should then be a valid raw Cc: header value.
   */
  set cc(aNameAndAddresses) {
    if (typeof aNameAndAddresses === "string") {
      this._cc = [];
      const people = aNameAndAddresses.split(",");
      for (let i = 0; i < people.length; i++) {
        this._cc.push(this._parseMailbox(people[i]));
      }
      this.headers.Cc = aNameAndAddresses;
      return;
    }
    this._cc = aNameAndAddresses;
    this.headers.Cc = this._commaize(
      aNameAndAddresses.map(nameAndAddr =>
        this._formatMailFromNameAndAddress(nameAndAddr)
      )
    );
  },

  get bodyPart() {
    return this._bodyPart;
  },
  set bodyPart(aBodyPart) {
    this._bodyPart = aBodyPart;
    this.headers["Content-Type"] = this._bodyPart.contentTypeHeaderValue;
  },

  /**
   * Normalizes header values, which may be strings or arrays of strings, into
   *  a suitable string suitable for appending to the header name/key.
   *
   * @returns {string} A normalized string representation of the header
   *   value(s), which may include spanning multiple lines.
   */
  _formatHeaderValues(aHeaderValues) {
    // may not be an array
    if (!(aHeaderValues instanceof Array)) {
      return aHeaderValues;
    }
    // it's an array!
    if (aHeaderValues.length == 1) {
      return aHeaderValues[0];
    }
    return aHeaderValues.join("\r\n\t");
  },

  /**
   * @returns {string} A string uniquely identifying this message, at least
   *   as long as the messageId is set and unique.
   */
  toString() {
    return "msg:" + this._messageId;
  },

  /**
   * Convert the message and its hierarchy into a "pretty string".  The message
   *  and each MIME part get their own line.  The string never ends with a
   *  newline.  For a non-multi-part message, only a single line will be
   *  returned.
   * Messages have their subject displayed, everyone else just shows their
   *  content type.
   */
  prettyString(aIndent) {
    if (aIndent === undefined) {
      aIndent = "";
    }
    const nextIndent = aIndent + "  ";

    let s = "Message: " + this.subject;
    s += "\n" + nextIndent + "1 " + this.bodyPart.prettyString(nextIndent);

    return s;
  },

  /**
   * @returns {string} This messages in rfc822 format, or something close enough.
   */
  toMessageString() {
    const lines = Object.keys(this.headers).map(
      headerKey =>
        headerKey + ": " + this._formatHeaderValues(this.headers[headerKey])
    );

    return lines.join("\r\n") + "\r\n\r\n" + this.bodyPart.toMessageString();
  },

  /**
   * @returns {nsIStringInputStream} This message in rfc822 format in a string stream.
   */
  toStream() {
    const stream = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(
      Ci.nsIStringInputStream
    );
    const str = this.toMessageString();
    stream.setData(str, str.length);
    return stream;
  },
};

/**
 * Add a list of messages to a local folder.
 *
 * @param {SyntheticMessage[]} messages - The list of SyntheticMessages instances to write.
 * @param {nsIMsgFolder} folder - The folder to write to.
 */
function addMessagesToFolder(messages, folder) {
  const localFolder = folder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  localFolder.addMessageBatch(messages.map(m => m.toMessageString()));
}

/**
 * Represents a set of synthetic messages, also supporting insertion into and
 *  tracking of the message folders to which they belong.  This then allows
 *  mutations of the messages (in their folders) for testing purposes.
 *
 * In general, you would create a synthetic message set by passing in only a
 *  list of synthetic messages, and then add then messages to nsIMsgFolders by
 *  using one of the addMessage* methods.  This will populate the aMsgFolders
 *  and aFolderIndices values.  (They are primarily intended for reasons of
 *  slicing, but people who know what they are doing can also use them.)
 *
 * @param {SyntheticMessage[]} aSynMessages The synthetic messages that should belong to this set.
 * @param {nsIMsgFolder|nsIMsgFolder[]} [aMsgFolders] Optional nsIMsgFolder or list of folders.
 * @param {number[]} [aFolderIndices] Optional list where each value is an index into the
 *     msgFolders attribute, specifying what folder the message can be found
 *     in.  The value may also be null if the message has not yet been
 *     inserted into a folder.
 */
function SyntheticMessageSet(aSynMessages, aMsgFolders, aFolderIndices) {
  this.synMessages = aSynMessages;

  if (Array.isArray(aMsgFolders)) {
    this.msgFolders = aMsgFolders;
  } else if (aMsgFolders) {
    this.msgFolders = [aMsgFolders];
  } else {
    this.msgFolders = [];
  }
  if (aFolderIndices == null) {
    this.folderIndices = aSynMessages.map(_ => null);
  } else {
    this.folderIndices = aFolderIndices;
  }
}
SyntheticMessageSet.prototype = {
  /**
   * Helper method for messageInjection to use to tell us it is injecting a
   *  message in a given folder.  As a convenience, we also return the
   *  synthetic message.
   *
   * @protected
   */
  _trackMessageAddition(aFolder, aMessageIndex) {
    let aFolderIndex = this.msgFolders.indexOf(aFolder);
    if (aFolderIndex == -1) {
      aFolderIndex = this.msgFolders.push(aFolder) - 1;
    }
    this.folderIndices[aMessageIndex] = aFolderIndex;
    return this.synMessages[aMessageIndex];
  },
  /**
   * Helper method for use by |MessageInjection.async_move_messages| to tell us that it moved
   *  all the messages from aOldFolder to aNewFolder.
   */
  _folderSwap(aOldFolder, aNewFolder) {
    const folderIndex = this.msgFolders.indexOf(aOldFolder);
    this.msgFolders[folderIndex] = aNewFolder;
  },

  /**
   * Union this set with another set and return the (new) result.
   *
   * @param {SyntheticMessageSet} aOtherSet - The other synthetic message set.
   * @returns {SyntheticMessageSet} A new SyntheticMessageSet containing the
   *   union of this set and the other set.
   */
  union(aOtherSet) {
    const messages = this.synMessages.concat(aOtherSet.synMessages);
    const folders = this.msgFolders.concat();
    const indices = this.folderIndices.concat();

    const folderUrisToIndices = {};
    for (const [iFolder, folder] of this.msgFolders.entries()) {
      folderUrisToIndices[folder.URI] = iFolder;
    }

    for (let iOther = 0; iOther < aOtherSet.synMessages.length; iOther++) {
      const folderIndex = aOtherSet.folderIndices[iOther];
      if (folderIndex == null) {
        indices.push(folderIndex);
      } else {
        const folder = aOtherSet.msgFolders[folderIndex];
        if (!(folder.URI in folderUrisToIndices)) {
          folderUrisToIndices[folder.URI] = folders.length;
          folders.push(folder);
        }
        indices.push(folderUrisToIndices[folder.URI]);
      }
    }

    return new SyntheticMessageSet(messages, folders, indices);
  },

  /**
   * Get the single message header of the message at the given index; use
   *  |msgHdrs| if you want to get all the headers at once.
   *
   * @param {integer} aIndex
   */
  getMsgHdr(aIndex) {
    const folder = this.msgFolders[this.folderIndices[aIndex]];
    const synMsg = this.synMessages[aIndex];
    return folder.msgDatabase.getMsgHdrForMessageID(synMsg.messageId);
  },

  /**
   * Get the URI for the message at the given index.
   *
   * @param {integer} aIndex
   */
  getMsgURI(aIndex) {
    const msgHdr = this.getMsgHdr(aIndex);
    return msgHdr.folder.getUriForMsg(msgHdr);
  },

  /**
   * @yields {nsIMsgDBHdr} A JS iterator of the message headers for all
   *   messages inserted into a folder.
   */
  *msgHdrs() {
    // get the databases
    const msgDatabases = this.msgFolders.map(folder => folder.msgDatabase);
    for (const [iMsg, synMsg] of this.synMessages.entries()) {
      const folderIndex = this.folderIndices[iMsg];
      if (folderIndex != null) {
        yield msgDatabases[folderIndex].getMsgHdrForMessageID(synMsg.messageId);
      }
    }
  },
  /**
   * @returns {nsIMsgDBHdr} A JS list of the message headers for all
   *   messages inserted into a  folder.
   */
  get msgHdrList() {
    return Array.from(this.msgHdrs());
  },

  /**
   * @returns {object[]} - A list where each item is a list with two elements;
   *   the first is an nsIMsgFolder, and the second is a list of all of the nsIMsgDBHdrs
   *   for the synthetic messages in the set inserted into that folder.
   */
  get foldersWithMsgHdrs() {
    const results = this.msgFolders.map(folder => [folder, []]);
    for (const [iMsg, synMsg] of this.synMessages.entries()) {
      const folderIndex = this.folderIndices[iMsg];
      if (folderIndex != null) {
        const [folder, msgHdrs] = results[folderIndex];
        msgHdrs.push(
          folder.msgDatabase.getMsgHdrForMessageID(synMsg.messageId)
        );
      }
    }
    return results;
  },
  /**
   * Sets the status of the messages to read/unread.
   *
   * @param {boolean} aRead - true/false to set messages as read/unread
   * @param {nsIMsgDBHdr} aMsgHdr - A message header to work on. If not
   *    specified, mark all messages in the current set.
   */
  setRead(aRead, aMsgHdr) {
    const msgHdrs = aMsgHdr ? [aMsgHdr] : this.msgHdrList;
    for (const msgHdr of msgHdrs) {
      msgHdr.markRead(aRead);
    }
  },
  /**
   * Sets the starred status of the messages.
   *
   * @param {boolean} aStarred - Starred status.
   */
  setStarred(aStarred) {
    for (const msgHdr of this.msgHdrs()) {
      msgHdr.markFlagged(aStarred);
    }
  },
  /**
   * Adds tag to the messages.
   *
   * @param {string} aTagName - Tag to add
   */
  addTag(aTagName) {
    for (const [folder, msgHdrs] of this.foldersWithMsgHdrs) {
      folder.addKeywordsToMessages(msgHdrs, aTagName);
    }
  },
  /**
   * Removes tag from the messages.
   *
   * @param {string} aTagName - Tag to remove
   */
  removeTag(aTagName) {
    for (const [folder, msgHdrs] of this.foldersWithMsgHdrs) {
      folder.removeKeywordsFromMessages(msgHdrs, aTagName);
    }
  },
  /**
   * Sets the junk score for the messages to junk/non-junk.  It does not
   *  involve the bayesian classifier because we really don't want it
   *  affecting our unit tests!  (Unless we were testing the bayesian
   *  classifier.  Which I'm conveniently not.  Feel free to add a
   *  "setJunkForRealsies" method if you are.)
   *
   * @param {boolean} aIsJunk - true/false to set messages to junk/non-junk
   * @param {nsIMsgDBHdr} aMsgHdr - A message header to work on. If not
   *   specified, mark all messages in the current set.
   * Generates a msgsJunkStatusChanged nsIMsgFolderListener notification.
   */
  setJunk(aIsJunk, aMsgHdr) {
    const junkscore = aIsJunk ? "100" : "0";
    const msgHdrs = aMsgHdr ? [aMsgHdr] : this.msgHdrList;
    for (const msgHdr of msgHdrs) {
      msgHdr.setStringProperty("junkscore", junkscore);
    }
    MailServices.mfn.notifyMsgsJunkStatusChanged(msgHdrs);
  },

  /**
   * Slice the message set using the exact Array.prototype.slice semantics
   * (because we call Array.prototype.slice).
   */
  slice(...aArgs) {
    const slicedMessages = this.synMessages.slice(...aArgs);
    const slicedIndices = this.folderIndices.slice(...aArgs);
    const sliced = new SyntheticMessageSet(
      slicedMessages,
      this.msgFolders,
      slicedIndices
    );
    if ("glodaMessages" in this && this.glodaMessages) {
      sliced.glodaMessages = this.glodaMessages.slice(...aArgs);
    }
    return sliced;
  },
};

/**
 * Provides mechanisms for creating vaguely interesting, but at least valid,
 *  SyntheticMessage instances.
 */
function MessageGenerator() {
  this._clock = new Date(2000, 1, 1);
  this._nextNameNumber = 0;
  this._nextSubjectNumber = 0;
  this._nextMessageIdNum = 0;
}

MessageGenerator.prototype = {
  /**
   * The maximum number of unique names makeName can produce.
   */
  MAX_VALID_NAMES: FIRST_NAMES.length * LAST_NAMES.length,
  /**
   * The maximum number of unique e-mail address makeMailAddress can produce.
   */
  MAX_VALID_MAIL_ADDRESSES: FIRST_NAMES.length * LAST_NAMES.length,
  /**
   * The maximum number of unique subjects makeSubject can produce.
   */
  MAX_VALID_SUBJECTS:
    SUBJECT_ADJECTIVES.length * SUBJECT_NOUNS.length * SUBJECT_SUFFIXES,

  /**
   * Generate a consistently determined (and reversible) name from a unique
   *  value.  Currently up to 26*26 unique names can be generated, which
   *  should be sufficient for testing purposes, but if your code cares, check
   *  against MAX_VALID_NAMES.
   *
   * @param {integer} aNameNumber The 'number' of the name you want which must be less
   *     than MAX_VALID_NAMES.
   * @returns {string} The unique name corresponding to the name number.
   */
  makeName(aNameNumber) {
    const iFirst = aNameNumber % FIRST_NAMES.length;
    const iLast =
      (iFirst + Math.floor(aNameNumber / FIRST_NAMES.length)) %
      LAST_NAMES.length;

    return FIRST_NAMES[iFirst] + " " + LAST_NAMES[iLast];
  },

  /**
   * Generate a consistently determined (and reversible) e-mail address from
   *  a unique value; intended to work in parallel with makeName.  Currently
   *  up to 26*26 unique addresses can be generated, but if your code cares,
   *  check against MAX_VALID_MAIL_ADDRESSES.
   *
   * @param {integer} aNameNumber - The 'number' of the mail address you want
   *   which must be ess than MAX_VALID_MAIL_ADDRESSES.
   * @returns {string} The unique name corresponding to the name mail address.
   */
  makeMailAddress(aNameNumber) {
    const iFirst = aNameNumber % FIRST_NAMES.length;
    const iLast =
      (iFirst + Math.floor(aNameNumber / FIRST_NAMES.length)) %
      LAST_NAMES.length;

    return (
      FIRST_NAMES[iFirst].toLowerCase() +
      "@" +
      LAST_NAMES[iLast].toLowerCase() +
      ".invalid"
    );
  },

  /**
   * Generate a pair of name and e-mail address.
   *
   * @param {integer} aNameNumber - The optional 'number' of the name and mail
   *   address you  want. If you do not provide a value, we will increment an
   *   internal counter to ensure that a new name is allocated and that will not
   *   be re-used. If you use our automatic number once, you must use it
   *   always, unless you don't mind or can ensure no collisions occur between
   *   our number allocation and your uses. If provided, the number must be
   *   less than MAX_VALID_NAMES.
   * @returns {string[]} A list containing two elements.
   *   The first is a name produced by a call to makeName, and the second an
   *   e-mail address produced by a call to makeMailAddress.
   *   This representation is used by the SyntheticMessage class when dealing
   *   with names and addresses.
   */
  makeNameAndAddress(aNameNumber) {
    if (aNameNumber === undefined) {
      aNameNumber = this._nextNameNumber++;
    }
    return [this.makeName(aNameNumber), this.makeMailAddress(aNameNumber)];
  },

  /**
   * Generate and return multiple pairs of names and e-mail addresses.  The
   *  names are allocated using the automatic mechanism as documented on
   *  makeNameAndAddress.  You should accordingly not allocate / hard code name
   *  numbers on your own.
   *
   * @param {integer} aCount - The number of people you want name and address tuples for.
   * @returns {string[][]} A list of aCount name-and-address tuples.
   */
  makeNamesAndAddresses(aCount) {
    const namesAndAddresses = [];
    for (let i = 0; i < aCount; i++) {
      namesAndAddresses.push(this.makeNameAndAddress());
    }
    return namesAndAddresses;
  },

  /**
   * Generate a consistently determined (and reversible) subject from a unique
   *  value.  Up to MAX_VALID_SUBJECTS can be produced.
   *
   * @param {integer} aSubjectNumber - The subject number you want generated,
   *   must be less than MAX_VALID_SUBJECTS.
   * @returns {string} The subject corresponding to the given subject number.
   */
  makeSubject(aSubjectNumber) {
    if (aSubjectNumber === undefined) {
      aSubjectNumber = this._nextSubjectNumber++;
    }
    const iAdjective = aSubjectNumber % SUBJECT_ADJECTIVES.length;
    const iNoun =
      (iAdjective + Math.floor(aSubjectNumber / SUBJECT_ADJECTIVES.length)) %
      SUBJECT_NOUNS.length;
    const iSuffix =
      (iNoun +
        Math.floor(
          aSubjectNumber / (SUBJECT_ADJECTIVES.length * SUBJECT_NOUNS.length)
        )) %
      SUBJECT_SUFFIXES.length;
    return (
      SUBJECT_ADJECTIVES[iAdjective] +
      " " +
      SUBJECT_NOUNS[iNoun] +
      " " +
      SUBJECT_SUFFIXES[iSuffix]
    );
  },

  /**
   * Fabricate a message-id suitable for the given synthetic message.  Although
   *  we don't use the message yet, in theory it would let us tailor the
   *  message id to the server that theoretically might be sending it.  Or some
   *  such.
   *
   * @param {SyntheticMessage} aSynthMessage - The synthetic message you would
   *   like us to make up a message-id for. We don't set the message-id on the
   *   message, that's up to you.
   * @returns {string} A Message-Id suitable for the given message.
   */
  makeMessageId(aSynthMessage) {
    const msgId = this._nextMessageIdNum + "@made.up.invalid";
    this._nextMessageIdNum++;
    return msgId;
  },

  /**
   * Generates a valid date which is after all previously issued dates by this
   *  method, ensuring an apparent ordering of time consistent with the order
   *  in which code is executed / messages are generated.
   * If you need a precise time ordering or precise times, make them up
   *  yourself.
   *
   * @returns {Date} - A made-up time in JavaScript Date object form.
   */
  makeDate() {
    const date = this._clock;
    // advance time by an hour
    this._clock = new Date(date.valueOf() + 60 * 60 * 1000);
    return date;
  },

  /**
   * Description for makeMessage options parameter.
   *
   * @typedef MakeMessageOptions
   * @property {number} [age] A dictionary with potential attributes 'minutes',
   *     'hours', 'days', 'weeks' to specify the message be created that far in
   *     the past.
   * @property {object} [attachments] A list of dictionaries suitable for passing to
   *     syntheticPartLeaf, plus a 'body' attribute that has already been
   *     encoded. Line chopping is on you FOR NOW.
   * @property {SyntheticPartLeaf} [body] A dictionary suitable for passing to SyntheticPart plus
   *     a 'body' attribute that has already been encoded (if encoding is
   *     required).  Line chopping is on you FOR NOW.  Alternately, use
   *     bodyPart.
   * @property {SyntheticPartLeaf} [bodyPart] A SyntheticPart to uses as the body.  If you
   *     provide an attachments value, this part will be wrapped in a
   *     multipart/mixed to also hold your attachments.  (You can put
   *     attachments in the bodyPart directly if you want and not use
   *     attachments.)
   * @property {string} [callerData] A value to propagate to the callerData attribute
   *     on the resulting message.
   * @property {string[][]} [cc] A list of cc recipients (name and address pairs).  If
   *     omitted, no cc is generated.
   * @property {string[][]} [from] The name and value pair this message should be from.
   *     Defaults to the first recipient if this is a reply, otherwise a new
   *     person is synthesized via |makeNameAndAddress|.
   * @property {string} [inReplyTo] the SyntheticMessage this message should be in
   *     reply-to.  If that message was in reply to another message, we will
   *     appropriately compensate for that.  If a SyntheticMessageSet is
   *     provided we will use the first message in the set.
   * @property {boolean} [replyAll] a boolean indicating whether this should be a
   *     reply-to-all or just to the author of the message.  (er, to-only, not
   *     cc.)
   * @property {string} [subject] subject to use; you are responsible for doing any
   *     encoding before passing it in.
   * @property {string[][]} [to] The list of recipients for this message, defaults to a
   *     set of toCount newly created persons.
   * @property {number} [toCount=1] the number of people who the message should be to.
   * @property {object} [clobberHeaders] An object whose contents will overwrite the
   *     contents of the headers object.  This should only be used to construct
   *     illegal header values; general usage should use another explicit
   *     mechanism.
   * @property {boolean} [junk] Should this message be flagged as junk for the benefit
   *     of the MessageInjection helper so that it can know to flag the message
   *     as junk?  We have no concept of marking a message as definitely not
   *     junk at this point.
   * @property {boolean} [read] Should this message be marked as already read?
   */
  /**
   * Create a SyntheticMessage.  All arguments are optional, but allow
   *  additional control.  With no arguments specified, a new name/address will
   *  be generated that has not been used before, and sent to a new name/address
   *  that has not been used before.
   *
   * @param {MakeMessageOptions} aArgs
   * @returns {SyntheticMessage} a SyntheticMessage fashioned just to your liking.
   */
  makeMessage(aArgs) {
    aArgs = aArgs || {};
    const msg = new SyntheticMessage();

    if (aArgs.inReplyTo) {
      // If inReplyTo is a SyntheticMessageSet, just use the first message in
      //  the set because the caller may be using them.
      const srcMsg = aArgs.inReplyTo.synMessages
        ? aArgs.inReplyTo.synMessages[0]
        : aArgs.inReplyTo;

      msg.parent = srcMsg;
      msg.parent.children.push(msg);

      msg.subject = srcMsg.subject.startsWith("Re: ")
        ? srcMsg.subject
        : "Re: " + srcMsg.subject;
      if (aArgs.replyAll) {
        msg.to = [srcMsg.from].concat(srcMsg.to.slice(1));
      } else {
        msg.to = [srcMsg.from];
      }
      msg.from = srcMsg.to[0];

      // we want the <>'s.
      msg.headers["In-Reply-To"] = srcMsg.headers["Message-Id"];
      msg.headers.References = (srcMsg.headers.References || []).concat([
        srcMsg.headers["Message-Id"],
      ]);
    } else {
      msg.parent = null;

      msg.subject = aArgs.subject || this.makeSubject();
      msg.from = aArgs.from || this.makeNameAndAddress();
      msg.to = aArgs.to || this.makeNamesAndAddresses(aArgs.toCount || 1);
      if (aArgs.cc) {
        msg.cc = aArgs.cc;
      }
    }

    msg.children = [];
    msg.messageId = this.makeMessageId(msg);
    if (aArgs.age) {
      const age = aArgs.age;
      // start from 'now'
      let ts = new Date().valueOf();
      if (age.minutes) {
        ts -= age.minutes * 60 * 1000;
      }
      if (age.hours) {
        ts -= age.hours * 60 * 60 * 1000;
      }
      if (age.days) {
        ts -= age.days * 24 * 60 * 60 * 1000;
      }
      if (age.weeks) {
        ts -= age.weeks * 7 * 24 * 60 * 60 * 1000;
      }
      msg.date = new Date(ts);
    } else {
      msg.date = this.makeDate();
    }

    if ("clobberHeaders" in aArgs) {
      for (const key in aArgs.clobberHeaders) {
        const value = aArgs.clobberHeaders[key];
        if (value === null) {
          delete msg.headers[key];
        } else {
          msg.headers[key] = value;
        }
        // clobber helper...
        if (key == "From") {
          msg._from = ["", ""];
        }
        if (key == "To") {
          msg._to = [["", ""]];
        }
        if (key == "Cc") {
          msg._cc = [["", ""]];
        }
      }
    }

    if ("junk" in aArgs && aArgs.junk) {
      msg.metaState.junk = true;
    }
    if ("read" in aArgs && aArgs.read) {
      msg.metaState.read = true;
    }

    let bodyPart;
    if (aArgs.bodyPart) {
      bodyPart = aArgs.bodyPart;
    } else if (aArgs.body) {
      bodyPart = new SyntheticPartLeaf(aArgs.body.body, aArgs.body);
    } else {
      // Different messages should have a chance at different bodies.
      bodyPart = new SyntheticPartLeaf("Hello " + msg.toName + "!");
    }

    // if it has any attachments, create a multipart/mixed to be the body and
    //  have it be the parent of the existing body and all the attachments
    if (aArgs.attachments) {
      const parts = [bodyPart];
      for (const attachDesc of aArgs.attachments) {
        parts.push(new SyntheticPartLeaf(attachDesc.body, attachDesc));
      }
      bodyPart = new SyntheticPartMultiMixed(parts);
    }

    msg.bodyPart = bodyPart;

    msg.callerData = aArgs.callerData;

    return msg;
  },

  /**
   * Create an encrypted SMime message. It's just a wrapper around makeMessage,
   * that sets the right content-type. Use like makeMessage.
   *
   * @param {MakeMessageOptions} aOptions
   * @returns {SyntheticMessage}
   */
  makeEncryptedSMimeMessage(aOptions) {
    if (!aOptions) {
      aOptions = {};
    }
    aOptions.clobberHeaders = {
      "Content-Transfer-Encoding": "base64",
      "Content-Disposition": 'attachment; filename="smime.p7m"',
    };
    if (!aOptions.body) {
      aOptions.body = {};
    }
    aOptions.body.contentType = 'application/pkcs7-mime; name="smime.p7m"';
    const msg = this.makeMessage(aOptions);
    return msg;
  },

  /**
   * Create an encrypted OpenPGP message. It's just a wrapper around makeMessage,
   * that sets the right content-type. Use like makeMessage.
   *
   * @param {MakeMessageOptions} aOptions
   * @returns {SyntheticMessage}
   */
  makeEncryptedOpenPGPMessage(aOptions) {
    if (!aOptions) {
      aOptions = {};
    }
    aOptions.clobberHeaders = {
      "Content-Transfer-Encoding": "base64",
    };
    if (!aOptions.body) {
      aOptions.body = {};
    }
    aOptions.body.contentType =
      'multipart/encrypted; protocol="application/pgp-encrypted"';
    const msg = this.makeMessage(aOptions);
    return msg;
  },

  MAKE_MESSAGES_DEFAULTS: {
    count: 10,
  },
  MAKE_MESSAGES_PROPAGATE: [
    "attachments",
    "body",
    "cc",
    "from",
    "inReplyTo",
    "subject",
    "to",
    "clobberHeaders",
    "junk",
    "read",
  ],
  /**
   * Given a set definition, produce a list of synthetic messages.
   *
   * The set definition supports the following attributes:
   *  count: The number of messages to create.
   *  age: As used by makeMessage.
   *  age_incr: Similar to age, but used to increment the values in the age
   *      dictionary (assuming a value of zero if omitted).
   *
   * @param {object} aSetDef - Message properties, see MAKE_MESSAGES_PROPAGATE.
   * @param {integer} [aSetDef.msgsPerThread=1] The number of messages per thread.
   *   If you want to create direct-reply threads, you can pass a value for this
   *   and have it not be one. If you need fancier reply situations,
   *   directly use a scenario or hook us up to support that.
   *
   * Also supported are the following attributes as defined by makeMessage:
   *  attachments, body, from, inReplyTo, subject, to, clobberHeaders, junk
   *
   * If omitted, the following defaults are used, but don't depend on this as we
   *  can change these at any time:
   * - count: 10
   */
  makeMessages(aSetDef) {
    const messages = [];

    const args = {};
    // zero out all the age_incr fields in age (if present)
    if (aSetDef.age_incr) {
      args.age = {};
      for (const unit of Object.keys(aSetDef.age_incr)) {
        args.age[unit] = 0;
      }
    }
    // copy over the initial values from age (if present)
    if (aSetDef.age) {
      args.age = args.age || {};
      for (const [unit, value] of Object.entries(aSetDef.age)) {
        args.age[unit] = value;
      }
    }
    // just copy over any attributes found from MAKE_MESSAGES_PROPAGATE
    for (const propAttrName of this.MAKE_MESSAGES_PROPAGATE) {
      if (aSetDef[propAttrName]) {
        args[propAttrName] = aSetDef[propAttrName];
      }
    }

    const count = aSetDef.count || this.MAKE_MESSAGES_DEFAULTS.count;
    const messagsPerThread = aSetDef.msgsPerThread || 1;
    let lastMessage = null;
    for (let iMsg = 0; iMsg < count; iMsg++) {
      // primitive threading support...
      if (lastMessage && iMsg % messagsPerThread != 0) {
        args.inReplyTo = lastMessage;
      } else if (!("inReplyTo" in aSetDef)) {
        args.inReplyTo = null;
      }
      lastMessage = this.makeMessage(args);
      messages.push(lastMessage);

      if (aSetDef.age_incr) {
        for (const [unit, delta] of Object.entries(aSetDef.age_incr)) {
          args.age[unit] += delta;
        }
      }
    }

    return messages;
  },
};

/**
 * Repository of generative message scenarios.  Uses the magic bindMethods
 *  function below to allow you to reference methods/attributes without worrying
 *  about how those methods will get the right 'this' pointer if passed as
 *  simply a function argument to someone.  So if you do:
 *  foo = messageScenarioFactory.method, followed by foo(...), it will be
 *  equivalent to having simply called messageScenarioFactory.method(...).
 *  (Normally this would not be the case when using JavaScript.)
 *
 * @param {MessageGenerator} [aMessageGenerator] The optional message generator we should use.
 *     If you don't pass one, we create our own.  You would want to pass one so
 *     that if you also create synthetic messages directly via the message
 *     generator then the two sources can avoid duplicate use of the same
 *     names/addresses/subjects/message-ids.
 */
function MessageScenarioFactory(aMessageGenerator) {
  if (!aMessageGenerator) {
    aMessageGenerator = new MessageGenerator();
  }
  this._msgGen = aMessageGenerator;
}

MessageScenarioFactory.prototype = {
  /** Create a chain of direct-reply messages of the given length. */
  directReply(aNumMessages) {
    aNumMessages = aNumMessages || 2;
    const messages = [this._msgGen.makeMessage()];
    for (let i = 1; i < aNumMessages; i++) {
      messages.push(this._msgGen.makeMessage({ inReplyTo: messages[i - 1] }));
    }
    return messages;
  },

  /** Two siblings (present), one parent (missing). */
  siblingsMissingParent() {
    const missingParent = this._msgGen.makeMessage();
    const msg1 = this._msgGen.makeMessage({ inReplyTo: missingParent });
    const msg2 = this._msgGen.makeMessage({ inReplyTo: missingParent });
    return [msg1, msg2];
  },

  /** Present parent, missing child, present grand-child. */
  missingIntermediary() {
    const msg1 = this._msgGen.makeMessage();
    const msg2 = this._msgGen.makeMessage({ inReplyTo: msg1 });
    const msg3 = this._msgGen.makeMessage({ inReplyTo: msg2 });
    return [msg1, msg3];
  },

  /**
   * The root message and all non-leaf nodes have aChildrenPerParent children,
   *  for a total of aHeight layers.  (If aHeight is 1, we have just the root;
   *  if aHeight is 2, the root and his aChildrePerParent children.)
   */
  fullPyramid(aChildrenPerParent, aHeight) {
    const msgGen = this._msgGen;
    const root = msgGen.makeMessage();
    const messages = [root];
    function helper(aParent, aRemDepth) {
      for (let iChild = 0; iChild < aChildrenPerParent; iChild++) {
        const child = msgGen.makeMessage({ inReplyTo: aParent });
        messages.push(child);
        if (aRemDepth) {
          helper(child, aRemDepth - 1);
        }
      }
    }
    if (aHeight > 1) {
      helper(root, aHeight - 2);
    }
    return messages;
  },
};

/**
 * Decorate the given object's methods will python-style method binding.  We
 *  create a getter that returns a method that wraps the call, providing the
 *  actual method with the 'this' of the object that was 'this' when the getter
 *  was called.
 * Note that we don't follow the prototype chain; we only process the object you
 *  immediately pass to us.  This does not pose a problem for the 'this' magic
 *  because we are using a getter and 'this' in js always refers to the object
 *  in question (never any part of its prototype chain).  As such, you probably
 *  want to invoke us on your prototype object(s).
 *
 * @param {object} aObj - The object on whom we want to perform magic binding.
 *   This should probably be your prototype object.
 */
function bindMethods(aObj) {
  for (const [name, ubfunc] of Object.entries(aObj)) {
    // the variable binding needs to get captured...
    const realFunc = ubfunc;
    delete aObj[name];
    Object.defineProperty(aObj, name, {
      get() {
        return realFunc.bind(this);
      },
    });
  }
}

bindMethods(MessageScenarioFactory.prototype);
