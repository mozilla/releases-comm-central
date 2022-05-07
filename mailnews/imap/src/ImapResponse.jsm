/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = [
  "CapabilityResponse",
  "FetchResponse",
  "FlagsResponse",
  "ImapResponse",
];

var { ImapUtils } = ChromeUtils.import("resource:///modules/ImapUtils.jsm");

/**
 * A structure to represent a server response.
 */
class ImapResponse {
  constructor() {
    // @type {MessageData[]} The message-data in this response.
    this.messages = [];
    // A holder for attributes.
    this.attributes = {};
    // Expunged message sequences.
    this.expunged = [];

    // The remaining string to parse.
    this._response = "";
  }

  /**
   * A server response can span multiple chunks, this function parses one chunk.
   * @param {string} str - A chunk of server response.
   */
  parse(str) {
    this._response += str;
    if (this._pendingMessage) {
      // We have an unfinished message in the last chunk.
      let bodySize = this._pendingMessage.bodySize;
      if (bodySize + 3 <= this._response.length) {
        // Consume the message together with the ending ")\r\n".
        this._pendingMessage.body = this._response.slice(0, bodySize);
        this._pendingMessage = null;
        this._advance(bodySize + 3);
      } else {
        this.done = false;
        return;
      }
    }
    this._parse();
  }

  /**
   * Drop n characters from _response.
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
    let index = this._response.indexOf("\r\n");
    if (index == -1) {
      // Expect more string in the next chunk.
      this.done = false;
      return;
    }

    let line = this._response.slice(0, index);
    this._advance(index + 2); // Consume the line and "\r\n".
    let tokens = this._parseLine(line);
    this.tag = tokens[0];
    if (this.tag == "+") {
      this.done = true;
      return;
    }

    if (this.tag == "*" && tokens[1].toUpperCase() == "FLAGS") {
      // * FLAGS (\Seen \Draft $Forwarded)
      this.flags = ImapUtils.stringsToFlags(tokens[2]);
    } else if (this.tag == "*" && Number.isInteger(+tokens[1])) {
      let intValue = +tokens[1];
      let type = tokens[2].toUpperCase();
      switch (type) {
        case "FETCH":
          // * 1 FETCH (UID 5 FLAGS (\SEEN) BODY[HEADER.FIELDS (FROM TO)] {12}
          let message = new MessageData(intValue, tokens[3]);
          this.messages.push(message);
          if (message.bodySize) {
            if (message.bodySize + 3 <= this._response.length) {
              // Consume the message together with the ending ")\r\n".
              message.body = this._response.slice(0, message.bodySize);
              this._advance(message.bodySize + 3);
            } else {
              this._pendingMessage = message;
              this.done = false;
              return;
            }
          }
          break;
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
            `Unrecognized response: ${line}`,
            Cr.NS_ERROR_ILLEGAL_VALUE
          );
      }
    } else if (tokens[1].toUpperCase() == "OK" && Array.isArray(tokens[2])) {
      let type = tokens[2][0].toLowerCase();
      let data = tokens[2].slice(1);
      switch (type) {
        case "capability":
          // 32 OK [CAPABILITY IMAP4rev1 IDLE STARTTLS AUTH=LOGIN AUTH=PLAIN]
          let { capabilities, authMethods } = new CapabilityData(data);
          this.capabilities = capabilities;
          this.authMethods = authMethods;
          break;
        case "permanentflags":
          // * OK [PERMANENTFLAGS (\\Seen \\Draft $Forwarded \\*)]
          this.permanentflags = ImapUtils.stringsToFlags(tokens[2][1]);
          break;
        default:
          if (tokens[2].length == 1) {
            // A boolean attribute, e.g. 12 OK [READ-WRITE]
            this[type] = true;
          } else if (tokens[2].length == 2) {
            // An attribute/value pair, e.g. 12 OK [UIDNEXT 600]
            this[type] = tokens[2][1];
          } else {
            // Hold other attributes.
            this.attributes[type] = data;
          }
      }
    }
    this._parse();
  }

  /**
   * Break a line into flat tokens array. For example,
   *   "(UID 24 FLAGS (NonJunk))" will be tokenized to
   *   ["(", "UID", "24", "FLAGS", "(", "NonJunk", ")", ")"].
   * @param {string} line - A single line of string.
   * @returns {string[]}
   */
  _tokenize(line) {
    let tokens = [];
    while (line) {
      // Find the first separator.
      let match = line.match(/[()\[\] ]/);
      if (!match) {
        tokens.push(line);
        break;
      }
      let sep = match[0];
      let index = line.indexOf(sep);
      let token = line.slice(0, index);
      if (token) {
        tokens.push(token);
      }
      if (sep != " ") {
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
   * @param {string} line - A single line of string.
   * @returns {Array<string|string[]>}
   */
  _parseLine(line) {
    let tokens = [];
    let arrayDepth = 0;

    for (let token of this._tokenize(line)) {
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
  // tokens looks like:
  // ["IMAP4rev1", "IDLE", "STARTTLS", "AUTH=LOGIN", "AUTH=PLAIN"]
  /**
   * @param {number} sequence - The sequence number of this message.
   * @param {string[]} tokens - An array like: ["UID", "24", "FLAGS", ["\Seen"]].
   */
  constructor(sequence, tokens) {
    this.sequence = sequence;
    for (let i = 0; i < tokens.length; i++) {
      let name = tokens[i].toLowerCase();
      switch (name) {
        case "uid":
          this.uid = +tokens[i + 1];
          i++;
          break;
        case "flags":
          this.flags = ImapUtils.stringsToFlags(tokens[i + 1]);
          i++;
          break;
        case "body": {
          // bodySection is the part between [ and ].
          this.bodySection = tokens[i + 1];
          i++;
          // {123} means the following 123 bytes are the body.
          let matches = tokens[i + 1].match(/{(\d+)}/);
          if (matches) {
            this.bodySize = +matches[1];
            this.body = "";
          }
          break;
        }
      }
    }
  }
}
