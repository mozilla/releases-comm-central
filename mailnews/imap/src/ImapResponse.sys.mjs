/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { ImapUtils } from "resource:///modules/ImapUtils.sys.mjs";

/**
 * A structure to represent a server response.
 */
export class ImapResponse {
  constructor() {
    // @type {MailboxData[]} The mailbox-data in this response.
    this.mailboxes = [];
    // @type {MessageData[]} The message-data in this response.
    this.messages = [];
    // A holder for attributes.
    this.attributes = {};
    // Expunged message sequences.
    this.expunged = [];

    // The remaining string to parse.
    this._response = "";

    this.onMessage = () => {};
  }

  /**
   * A server response can span multiple chunks, this function parses one chunk.
   *
   * @param {string} str - A chunk of server response.
   */
  parse(str) {
    this._response += str;
    if (this._pendingMessage) {
      // We have an unfinished message in the last chunk.
      const remaining =
        this._pendingMessage.bodySize - this._pendingMessage.body.length;
      if (remaining + ")\r\n".length <= this._response.length) {
        // Consume the message together with the ending ")\r\n".
        this._pendingMessage.body += this._response.slice(0, remaining);
        this.onMessage(this._pendingMessage);
        this._pendingMessage = null;
        this._advance(remaining + ")\r\n".length);
      } else {
        this.done = false;
        return;
      }
    }
    this._parse();
  }

  /**
   * Drop n characters from _response.
   *
   * @param {number} n - The number of characters to drop.
   */
  _advance(n) {
    this._response = this._response.slice(n);
  }

  /**
   * Parse the response line by line. Because a single response can contain
   * multiple types of data, update the corresponding properties after parsing
   * a line, e.g. this.capabilities, this.flags, this.messages.
   */
  _parse() {
    if (!this._response && this.tag != "*") {
      // Nothing more to parse.
      this.done = true;
      return;
    }
    const index = this._response.indexOf("\r\n");
    if (index == -1) {
      // Expect more string in the next chunk.
      this.done = false;
      return;
    }

    const line = this._response.slice(0, index);
    this._advance(index + 2); // Consume the line and "\r\n".
    const tokens = this._parseLine(line);
    this.tag = tokens[0];
    this.status = tokens[1];
    if (this.tag == "+") {
      this.statusText = tokens.slice(1).join(" ");
      if (!this._response) {
        this.done = true;
        return;
      }
    }

    let parsed;

    if (this.tag == "*") {
      parsed = true;
      switch (tokens[1].toUpperCase()) {
        case "CAPABILITY": {
          // * CAPABILITY IMAP4rev1 IDLE STARTTLS AUTH=LOGIN AUTH=PLAIN
          const { capabilities, authMethods } = new CapabilityData(
            tokens.slice(2)
          );
          this.capabilities = capabilities;
          this.authMethods = authMethods;
          break;
        }
        case "FLAGS":
          // * FLAGS (\Seen \Draft $Forwarded)
          this.flags = ImapUtils.stringsToFlags(tokens[2]);
          if (tokens[2].includes("\\*")) {
            this.supportedUserFlags =
              ImapUtils.FLAG_LABEL |
              ImapUtils.FLAG_MDN_SENT |
              ImapUtils.FLAG_SUPPORT_FORWARDED_FLAG |
              ImapUtils.FLAG_SUPPORT_USER_FLAG;
          }
          break;
        case "ID":
          // * ID ("name" "imap" "vendor" "Example, Inc.")
          this.id = line.slice("* ID ".length);
          break;
        case "LIST":
        case "LSUB":
          // * LIST (\Subscribed \NoInferiors \UnMarked \Sent) "/" Sent
          this.mailboxes.push(new MailboxData(tokens));
          break;
        case "QUOTAROOT":
          // * QUOTAROOT Sent INBOX
          this.quotaRoots = tokens.slice(3);
          break;
        case "QUOTA":
          // S: * QUOTA INBOX (STORAGE 95295 97656832)
          if (!this.quotas) {
            this.quotas = [];
          }
          this.quotas.push([tokens[2], ...tokens[3]]);
          break;
        case "SEARCH":
          // * SEARCH 1 4 9
          this.search = tokens.slice(2).map(x => Number(x));
          break;
        case "STATUS":
          // * STATUS \"folder 2\" (UIDNEXT 2 MESSAGES 1 UNSEEN 1)
          this.attributes = new StatusData(tokens).attributes;
          break;
        default:
          if (Number.isInteger(+tokens[1])) {
            this._parseNumbered(tokens);
          } else {
            parsed = false;
          }
          break;
      }
    }
    if (!parsed && Array.isArray(tokens[2])) {
      const type = tokens[2][0].toUpperCase();
      const data = tokens[2].slice(1);
      switch (type) {
        case "CAPABILITY": {
          // 32 OK [CAPABILITY IMAP4rev1 IDLE STARTTLS AUTH=LOGIN AUTH=PLAIN]
          const { capabilities, authMethods } = new CapabilityData(data);
          this.capabilities = capabilities;
          this.authMethods = authMethods;
          break;
        }
        case "PERMANENTFLAGS": {
          // * OK [PERMANENTFLAGS (\\Seen \\Draft $Forwarded \\*)]
          this.permanentflags = ImapUtils.stringsToFlags(tokens[2][1]);
          if (tokens[2][1].includes("\\*")) {
            this.supportedUserFlags =
              ImapUtils.FLAG_LABEL |
              ImapUtils.FLAG_MDN_SENT |
              ImapUtils.FLAG_SUPPORT_FORWARDED_FLAG |
              ImapUtils.FLAG_SUPPORT_USER_FLAG;
          }
          break;
        }
        default: {
          const field = type.toLowerCase();
          if (tokens[2].length == 1) {
            // A boolean attribute, e.g. 12 OK [READ-WRITE]
            this[field] = true;
          } else if (tokens[2].length == 2) {
            // An attribute/value pair, e.g. 12 OK [UIDNEXT 600]
            this[field] = tokens[2][1];
          } else {
            // Hold other attributes.
            this.attributes[field] = data;
          }
        }
      }
    }
    this._parse();
  }

  /**
   * Handle the tokens of a line in the form of "* NUM TYPE".
   *
   * @params {Array<string|string[]>} tokens - The tokens of the line.
   */
  _parseNumbered(tokens) {
    const intValue = +tokens[1];
    const type = tokens[2].toUpperCase();
    switch (type) {
      case "FETCH": {
        // * 1 FETCH (UID 5 FLAGS (\SEEN) BODY[HEADER.FIELDS (FROM TO)] {12}
        const message = new MessageData(intValue, tokens[3]);
        this.messages.push(message);
        if (message.bodySize) {
          if (message.bodySize + ")\r\n".length <= this._response.length) {
            // Consume the message together with the ending ")\r\n".
            message.body = this._response.slice(0, message.bodySize);
            this.onMessage(message);
          } else {
            message.body = this._response;
            this._pendingMessage = message;
            this.done = false;
          }
          this._advance(message.bodySize + ")\r\n".length);
        } else {
          this.onMessage(message);
        }
        break;
      }
      case "EXISTS":
        // * 6 EXISTS
        this.exists = intValue;
        break;
      case "EXPUNGE":
        // * 2 EXPUNGE
        this.expunged.push(intValue);
        break;
      case "RECENT":
        // Deprecated in rfc9051.
        break;
      default:
        throw Components.Exception(
          `Unrecognized response: ${tokens.join(" ")}`,
          Cr.NS_ERROR_ILLEGAL_VALUE
        );
    }
  }

  /**
   * Break a line into flat tokens array. For example,
   *   "(UID 24 FLAGS (NonJunk))" will be tokenized to
   *   ["(", "UID", "24", "FLAGS", "(", "NonJunk", ")", ")"].
   *
   * @param {string} line - A single line of string.
   * @returns {string[]}
   */
  _tokenize(line) {
    const SEPARATORS = /[()\[\]" ]/;
    const tokens = [];
    while (line) {
      // Find the first separator.
      let index = line.search(SEPARATORS);
      if (index == -1) {
        tokens.push(line);
        break;
      }
      const sep = line[index];
      const token = line.slice(0, index);
      if (token) {
        tokens.push(token);
      }
      if (sep == '"') {
        // Parse the whole string as a token.
        line = line.slice(index + 1);
        let str = sep;
        // @see https://github.com/eslint/eslint/issues/17807
        // eslint-disable-next-line no-constant-condition
        while (true) {
          index = line.indexOf('"');
          if (line[index - 1] == "\\") {
            // Not the ending quote.
            str += line.slice(0, index + 1);
            line = line.slice(index + 1);
            continue;
          } else {
            // The ending quote.
            str += line.slice(0, index + 1);
            tokens.push(str);
            line = line.slice(index + 1);
            break;
          }
        }
        continue;
      } else if (sep != " ") {
        tokens.push(sep);
      }
      line = line.slice(index + 1);
    }
    return tokens;
  }

  /**
   * Parse a line into nested tokens array. For example,
   *   "(UID 24 FLAGS (NonJunk))" will be parsed to
   *   ["UID", "24", "FLAGS", ["NonJunk"]].
   *
   * @param {string} line - A single line of string.
   * @returns {Array<string|string[]>}
   */
  _parseLine(line) {
    const tokens = [];
    let arrayDepth = 0;

    for (const token of this._tokenize(line)) {
      let depth = arrayDepth;
      let arr = tokens;
      while (depth-- > 0) {
        arr = arr.at(-1);
      }
      switch (token) {
        case "(":
        case "[":
          arr.push([]);
          arrayDepth++;
          break;
        case ")":
        case "]":
          arrayDepth--;
          break;
        default:
          arr.push(token);
      }
    }

    return tokens;
  }
}

/**
 * A structure to represent capability-data.
 */
class CapabilityData {
  /**
   * @param {string[]} tokens - An array like: ["IMAP4rev1", "IDLE", "STARTTLS",
   *   "AUTH=LOGIN", "AUTH=PLAIN"].
   */
  constructor(tokens) {
    this.capabilities = [];
    this.authMethods = [];
    for (let cap of tokens) {
      cap = cap.toUpperCase();
      if (cap.startsWith("AUTH=")) {
        this.authMethods.push(cap.slice(5));
      } else {
        this.capabilities.push(cap);
      }
    }
  }
}

/**
 * A structure to represent message-data.
 */
class MessageData {
  /**
   * @param {number} sequence - The sequence number of this message.
   * @param {string[]} tokens - An array like: ["UID", "24", "FLAGS", ["\Seen"]].
   */
  constructor(sequence, tokens) {
    this.sequence = sequence;
    this.customAttributes = {};
    for (let i = 0; i < tokens.length; i += 2) {
      const name = tokens[i].toUpperCase();
      switch (name) {
        case "UID":
          this.uid = +tokens[i + 1];
          break;
        case "FLAGS":
          this.flags = ImapUtils.stringsToFlags(tokens[i + 1]);
          this.keywords = tokens[i + 1]
            .filter(x => !x.startsWith("\\"))
            .join(" ");
          break;
        case "BODY": {
          // bodySection is the part between [ and ].
          this.bodySection = tokens[i + 1];
          i++;
          // {123} means the following 123 bytes are the body.
          const matches = tokens[i + 1].match(/{(\d+)}/);
          if (matches) {
            this.bodySize = +matches[1];
            this.body = "";
          }
          break;
        }
        case "RFC822.SIZE": {
          this.size = +tokens[i + 1];
          break;
        }
        default:
          this.customAttributes[tokens[i]] = tokens[i + 1];
          break;
      }
    }
  }
}

/**
 * A structure to represent mailbox-data.
 */
class MailboxData {
  constructor(tokens) {
    const [, , attributes, delimiter, name] = tokens;
    this.flags = this._stringsToFlags(attributes);
    this.delimiter = unwrapString(delimiter);
    this.name = unwrapString(name);
  }

  /**
   * Convert an array of flag string to an internal flag number.
   *
   * @param {string[]} arr - An array of flag string.
   * @returns {number} An internal flag number.
   */
  _stringsToFlags(arr) {
    const stringToFlag = {
      "\\MARKED": ImapUtils.FLAG_MARKED,
      "\\UNMARKED": ImapUtils.FLAG_UNMARKED,
      "\\NOINFERIORS":
        // RFC 5258 \NoInferiors implies \HasNoChildren
        ImapUtils.FLAG_NO_INFERIORS | ImapUtils.FLAG_HAS_NO_CHILDREN,
      "\\NOSELECT": ImapUtils.FLAG_NO_SELECT,
      "\\TRASH": ImapUtils.FLAG_IMAP_TRASH | ImapUtils.FLAG_IMAP_XLIST_TRASH,
      "\\SENT": ImapUtils.FLAG_IMAP_SENT,
      "\\DRAFTS": ImapUtils.FLAG_IMAP_DRAFTS,
      "\\SPAM": ImapUtils.FLAG_IMAP_SPAM,
      "\\JUNK": ImapUtils.FLAG_IMAP_SPAM,
      "\\ARCHIVE": ImapUtils.FLAG_IMAP_ARCHIVE,
      "\\ALL": ImapUtils.FLAG_IMAP_ALL_MAIL,
      "\\ALLMAIL": ImapUtils.FLAG_IMAP_ALL_MAIL,
      "\\INBOX": ImapUtils.FLAG_IMAP_INBOX,
      "\\NONEXISTENT":
        // RFC 5258 \NonExistent implies \NoSelect
        ImapUtils.FLAG_NON_EXISTENT | ImapUtils.FLAG_NO_SELECT,
      "\\SUBSCRIBED": ImapUtils.FLAG_SUBSCRIBED,
      "\\REMOTE": ImapUtils.FLAG_REMOTE,
      "\\HASCHILDREN": ImapUtils.FLAG_HAS_CHILDREN,
      "\\HASNOCHILDREN": ImapUtils.FLAG_HAS_NO_CHILDREN,
    };
    let flags = 0;
    for (const str of arr) {
      flags |= stringToFlag[str.toUpperCase()] || 0;
    }
    return flags;
  }
}

/**
 * A structure to represent STATUS data.
 *   STATUS \"folder 2\" (UIDNEXT 2 MESSAGES 1 UNSEEN 1)
 */
class StatusData {
  /**
   * @params {Array<string|string[]>} tokens - The tokens of the line.
   */
  constructor(tokens) {
    this.attributes = {};

    // The first two tokens are ["*", "STATUS"], the last token is the attribute
    // list, the middle part is the mailbox name.
    this.attributes.mailbox = unwrapString(tokens[2]);

    const attributes = tokens.at(-1);
    for (let i = 0; i < attributes.length; i += 2) {
      const type = attributes[i].toLowerCase();
      this.attributes[type] = attributes[i + 1];
    }
  }
}

/**
 * Following rfc3501 section-5.1 and section-9, this function does two things:
 *   1. Remove the wrapping DQUOTE.
 *   2. Unesacpe QUOTED-CHAR.
 *
 * @params {string} name - E.g. `"a \"b\" c"` will become `a "b" c`.
 */
function unwrapString(name) {
  return name.replace(/(^"|"$)/g, "").replaceAll('\\"', '"');
}
