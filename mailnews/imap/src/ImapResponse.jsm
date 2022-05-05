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
 * A structure to represent a server response status.
 * @typedef {Object} ImapStatus
 * @property {string} tag - Can be "*", "+" or client tag.
 * @property {string} status - Can be "OK", "NO" or "BAD".
 * @property {string} statusData - The third part of the status line.
 * @property {string} statusText - The fourth part of the status line.
 */

/**
 * A structure to represent a server response.
 */
class ImapResponse {
  /**
   * @param {ImapStatus} status - The status part of the response.
   * @param {string} lines - The data part of the response.
   */
  constructor({ tag, status, statusData, statusText }, lines) {
    this.tag = tag;
    this.status = status;
    this.statusData = statusData;
    this.statusText = statusText;

    this._lines = lines;
  }

  /**
   * Parse the status line.
   * @param {string} line - The status line.
   * @returns {ImapStatus}
   */
  static _parseStatusLine(line) {
    let [tag, status, ...rest] = line.split(" ");
    line = rest.join(" ");
    let statusData;
    if (line[0] == "[") {
      let cursor = line.indexOf("]");
      statusData = line.slice(1, cursor);
      line = line.slice(cursor + 1);
    }
    return { tag, status, statusData, statusText: line };
  }

  /**
   * Parse the full response.
   * @param {string} str - The server response.
   * @returns {ImapResponse} Returns null if str doesn't form a complete response.
   */
  static parse(str) {
    let lines = str.trimRight().split("\r\n");
    if (lines.length == 1) {
      let result = this._parseStatusLine(lines[0]);
      if (result.statusData?.toUpperCase().startsWith("CAPABILITY")) {
        let response = new CapabilityResponse(result);
        response.parse();
        return response;
      }
      return result;
    }
    let { tag, status, statusData, statusText } = this._parseStatusLine(
      lines.at(-1)
    );
    if (tag == "*" || !str.endsWith("\r\n")) {
      // Server response is broken to multiple chunks, expect more chunks
      // to complete this response.
      return null;
    }

    let [firstLineTag, sequenceOrType, type] = lines[0].split(" ");
    if (firstLineTag != "*") {
      throw Components.Exception(
        `Unrecognized response: ${lines[0]}`,
        Cr.NS_ERROR_ILLEGAL_VALUE
      );
    }
    if (!Number.isInteger(+sequenceOrType)) {
      type = sequenceOrType;
    }

    let ResponseClass = {
      FETCH: FetchResponse,
      FLAGS: FlagsResponse,
    }[type.toUpperCase()];
    if (!ResponseClass) {
      throw Components.Exception(
        `Parser not implemented yet for type=${type} line=${lines[0]}`,
        Cr.NS_ERROR_ILLEGAL_VALUE
      );
    }

    let response = new ResponseClass(
      { tag, status, statusData, statusText },
      lines.slice(0, -1)
    );
    response.parse();
    return response;
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
  parseLine(line) {
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
 * A structure to represent CAPABILITY response.
 */
class CapabilityResponse extends ImapResponse {
  parse() {
    this.capabilities = [];
    this.authMethods = [];
    // statusData looks like:
    // CAPABILITY IMAP4rev1 IDLE STARTTLS AUTH=LOGIN AUTH=PLAIN
    for (let cap of this.statusData
      .toUpperCase()
      .split(" ")
      .slice(1)) {
      if (cap.startsWith("AUTH=")) {
        this.authMethods.push(cap.slice(5));
      } else {
        this.capabilities.push(cap);
      }
    }
  }
}

/**
 * A structure to represent FETCH response.
 */
class FetchResponse extends ImapResponse {
  parse() {
    this.messages = [];
    while (this._lines.length) {
      let attributes = {};
      // A line may look like this
      //   * 7 FETCH (UID 24 FLAGS (NonJunk))
      // Or this
      //   * 7 FETCH (UID 24 FLAGS (NonJunk) BODY[] {123}
      let [, , type, attrArray] = this.parseLine(this._lines[0]);
      for (let i = 0; i < attrArray.length; i++) {
        let name = attrArray[i].toUpperCase();
        switch (name) {
          case "UID":
            attributes[name] = +attrArray[i + 1];
            i++;
            break;
          case "FLAGS":
            attributes[name] = attrArray[i + 1];
            i++;
            break;
          case "BODY": {
            // bodySection is the part between [ and ].
            attributes.bodySection = attrArray[i + 1];
            i++;
            // {123} means the following 123 bytes are the body.
            let matches = attrArray[i + 1].match(/{(\d+)}/);
            if (matches) {
              let body = "";
              let bytes = +matches[1];
              this._lines = this._lines.slice(1);
              while (bytes > 0) {
                // Keep consuming the next line until remaining bytes become 0.
                let line = this._lines[0] + "\r\n";
                body += line;
                bytes -= line.length;
                this._lines = this._lines.slice(1);
              }
              attributes.body = body;
            }
            break;
          }
        }
      }
      this.messages.push({ type, attributes });
      this._lines = this._lines.slice(1);
    }
  }
}

/**
 * A structure to represent FLAGS response.
 */
class FlagsResponse extends ImapResponse {
  parse() {
    let flags = [];

    for (let line of this._lines) {
      let [, tagOrType, data] = this.parseLine(line);
      tagOrType = tagOrType.toUpperCase();
      if (tagOrType == "FLAGS" && !flags.length) {
        flags = data;
      } else if (data[0] == "PERMANENTFLAGS") {
        flags = data[1];
      }
    }

    this.flags = 0;
    for (let flag of flags) {
      this.flags |= ImapUtils.stringToFlag(flag);
    }
  }
}
