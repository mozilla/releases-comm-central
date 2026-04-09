/*
 * MIT License
 *
 * Copyright (c) 2019 papnkukn
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  MailStringUtils: "resource:///modules/MailStringUtils.sys.mjs",
});

/**
 * MorkParser. Reads Mork formatted Data from a (.msf) file and transforms it
 * to an object that can then be JSON'd.
 *
 * Example usage:
 *
 *  var { MorkParser } = ChromeUtils.importESModule("resource:///modules/MorkParser.sys.mjs");
 *  await MorkParser.dumpFile("~/.thunderbird/qyjeoqu0.conv/ImapMail/raspberrypi-1.local/INBOX.msf");
 *
 * @see https://github.com/papnkukn/mork-parser
 */
export class MorkParser {
  constructor() {
    this.key_table = null;
    this.val_table = null;
    this.row_hash = null;
    this.skipped = 0;
    this.total = 0;
    this.strictDecoder = null;
    this.warnings = [];
  }

  /**
   * Convenience method to print the JSON-ified Mork data to stdout.
   * Parser warnings are output via console.warn() to keep the returned data pure.
   *
   * @param {string} path - Path to the .msf file to dump.
   * @param {boolean} [prettify=false] - Show human readable msg hdr data.
   * @param {string} [folderURI=null] - Folder URI.
   * @returns {object[]} An array of table objects containing the parsed Mork data.
   */
  static async dumpFile(path, prettify = false, folderURI = null) {
    const msf = lazy.MailStringUtils.uint8ArrayToByteString(
      await IOUtils.read(path)
    );

    const parser = new MorkParser();
    let parsedData = parser.parseContent(msf);

    if (prettify) {
      const prettifiedData = [];

      // Iterate through the array of table objects
      for (const table of parsedData) {
        const prettyRows = table.data
          .filter(o => "message-id" in o)
          .map(o => MorkParser.readableMsgHdrData(o, folderURI));

        // Only keep tables that actually contain messages after filtering
        if (prettyRows.length > 0) {
          prettifiedData.push({
            "@id": table["@id"],
            data: prettyRows,
          });
        }
      }
      parsedData = prettifiedData;
    }

    const jsonOutput = JSON.stringify(parsedData, null, 2);
    if (Services.prefs.getBoolPref("browser.dom.window.dump.enabled", false)) {
      dump(jsonOutput + "\n");
    } else {
      // eslint-disable-next-line no-console
      console.info(jsonOutput);
    }

    if (parser.warnings.length > 0) {
      console.warn(
        `MorkParser completed with ${parser.warnings.length} warnings:`
      );
      parser.warnings.forEach(w => console.warn(w));
    }

    return parsedData;
  }

  /**
   * Map known header data to a more human readable format.
   *
   * @param {object} o - Object from Mork.
   * @param {string} [folderURI=null] - Folder URI. If set will be used to form
   *   message uri one can use to display a message.
   */
  static readableMsgHdrData(o, folderURI = null) {
    // mailbox://" -> "mailbox-message://, mail:// -> imap-message:// etc.
    const baseMessageURI = folderURI?.replace(
      /^(.*):\/\/(.+)/,
      "$1-message://$2"
    );

    // The Mork row ID corresponds to the message key and is used to construct
    // the message URI.
    const rowId = o["@id"];
    const messageKey = rowId ? parseInt(rowId, 16) : NaN;

    // Smarter split that ignores commas inside quoted names
    // (e.g., "Last, First" <email@ex.com>).
    const splitEmails = str => {
      const matches = str.match(/\s*"[^"]*"[^,]*|[^,]+/g) || [];
      return matches.map(r => r.trim()).filter(Boolean);
    };

    const splitKeywords = str => str.trim().split(/\s+/).filter(Boolean);

    const parseHex = str => (str ? parseInt(str, 16) : undefined);

    return {
      "@id": rowId,
      messageKey,
      uri:
        baseMessageURI && !Number.isNaN(messageKey)
          ? `${baseMessageURI}#${messageKey}`
          : undefined,
      messageId: o["message-id"],
      // Arrays for space-separated lists
      references: (o.references || "")
        .trim()
        .replaceAll(/\s+/g, " ")
        .replaceAll(/[<>]/g, "")
        .split(" ")
        .filter(Boolean),

      // Dates (Mork usually stores these as Hex seconds since epoch)
      date: o.date ? new Date(parseInt(o.date, 16) * 1000) : null,
      received: o.dateReceived
        ? new Date(parseInt(o.dateReceived, 16) * 1000)
        : null,

      subject: o.subject,
      from: o.sender ? splitEmails(o.sender) : [],
      recipients: o.recipients ? splitEmails(o.recipients) : [],
      ccList: o.ccList ? splitEmails(o.ccList) : undefined,
      flags: o.flags ? "0x" + o.flags.padStart(8, "0") : undefined,

      priority: (() => {
        if (!o.priority) {
          return undefined;
        }
        const priorityMap = {
          0: "Not Set",
          1: "None",
          2: "Lowest",
          3: "Low",
          4: "Normal",
          5: "High",
          6: "Highest",
        };
        return priorityMap[parseInt(o.priority, 16)];
      })(),

      size: parseHex(o.size),
      storeToken: o.storeToken,
      offlineMsgSize: parseHex(o.offlineMsgSize),
      numLines: parseHex(o.numLines),
      preview: o.preview || undefined,
      junkScore: o.junkscore ? parseInt(o.junkscore, 10) : undefined,
      junkScoreOrigin: o.junkscoreorigin || undefined,
      junkPercent: o.junkpercent ? parseInt(o.junkpercent, 10) : undefined,
      senderName: o.sender_name || undefined,
      prevKeywords: o.prevkeywords ? splitKeywords(o.prevkeywords) : undefined,
      keywords: o.keywords ? splitKeywords(o.keywords) : undefined,
      remoteContentPolicy: parseHex(o.remoteContentPolicy),
      protoThreadFlags: parseHex(o.ProtoThreadFlags),
      account: o.account || undefined,
      glodaId: parseHex(o["gloda-id"]),
      glodaIdDescription: (() => {
        if (!o["gloda-id"]) {
          return undefined;
        }
        const gid = parseInt(o["gloda-id"], 16);
        if (gid >= 32) {
          return "Valid";
        }
        return (
          {
            1: "Old Bad (Re-index Eligible)",
            2: "Bad (Do Not Index)",
          }[gid] || `Invalid`
        );
      })(),
      glodaDirty: parseHex(o["gloda-dirty"]),
      glodaDirtyDescription: (() => {
        if (!o["gloda-dirty"]) {
          return undefined;
        }
        return { 0: "clean", 1: "dirty", 2: "filthy" }[o["gloda-dirty"]];
      })(),

      xGmMsgId: o["X-GM-MSGID"] || undefined,
      xGmThrId: o["X-GM-THRID"] || undefined,
      xGmLabels: o["X-GM-LABELS"] || undefined,
      pseudoHdr: parseHex(o.pseudoHdr),
      enigmail: parseHex(o.enigmail),
      notAPhishMessage: parseHex(o.notAPhishMessage),
    };
  }

  /**
   * Parses a raw nsMsgMessageFlags bitmask into an array of human-readable states.
   *
   * @param {number} rawFlags
   * @returns {string[]} Array of active flag strings
   */
  static getFlagsArray(rawFlags) {
    if (!rawFlags) {
      return [];
    }

    const flagMap = {
      isRead: !!(rawFlags & 0x00000001),
      isReplied: !!(rawFlags & 0x00000002),
      isFlagged: !!(rawFlags & 0x00000004),
      isExpunged: !!(rawFlags & 0x00000008),
      hasRe: !!(rawFlags & 0x00000010),
      isElided: !!(rawFlags & 0x00000020),
      isFeedMsg: !!(rawFlags & 0x00000040),
      isOffline: !!(rawFlags & 0x00000080),
      isWatched: !!(rawFlags & 0x00000100),
      isSenderAuthed: !!(rawFlags & 0x00000200),
      isPartial: !!(rawFlags & 0x00000400),
      isQueued: !!(rawFlags & 0x00000800),
      isForwarded: !!(rawFlags & 0x00001000),
      isRedirected: !!(rawFlags & 0x00002000),
      isNew: !!(rawFlags & 0x00010000),
      isIgnored: !!(rawFlags & 0x00040000),
      isIMAPDeleted: !!(rawFlags & 0x00200000),
      isMDNReportNeeded: !!(rawFlags & 0x00400000),
      isMDNReportSent: !!(rawFlags & 0x00800000),
      isTemplate: !!(rawFlags & 0x01000000),
      hasAttachment: !!(rawFlags & 0x10000000),
    };

    return Object.keys(flagMap).filter(key => flagMap[key]);
  }

  /**
   * Parse mork content and return an array grouped by Mork table scopes.
   *
   * @param {string} body
   * @returns {object[]} An array of objects, where each object represents a table
   * containing an `@id` string (the table scope) and a `data` array (the row objects).
   */
  parseContent(body) {
    // Reset global variables,
    this.key_table = {};
    this.val_table = {};
    this.row_hash = {};
    this.skipped = 0;
    this.total = 0;
    this.warnings = [];

    // Windows Mozilla uses \r\n, presumably Mac Mozilla is similarly dumb.
    body = body.replace(/\r\n?/g, "\n");

    // Sometimes backslash is quoted with a backslash; convert to hex.
    body = body.replace(/\\\\/g, "$5C");

    // Close-paren is quoted with a backslash; convert to hex.
    body = body.replace(/\\\)/g, "$29");

    // Backslash at end of line is continuation.
    body = body.replace(/\\\n/g, "");

    let pos = 0;
    let section = "top level";
    const length = body.length;

    // Hoist the sticky regex to avoid GC pressure during the parsing loop
    const markerRegex = /@\$\$(\{|\})([\dA-F]+)(\{|\})@/iy;

    // Cursor-based parsing loop
    while (pos < length) {
      // 1. Skip whitespace
      while (
        pos < length &&
        (body[pos] === " " ||
          body[pos] === "\n" ||
          body[pos] === "\t" ||
          body[pos] === "\f")
      ) {
        pos++;
      }
      if (pos >= length) {
        break;
      }

      const char = body[pos];

      // 2. Comments (//)
      if (char === "/" && body[pos + 1] === "/") {
        const nextNewline = body.indexOf("\n", pos);
        pos = nextNewline === -1 ? length : nextNewline;
        continue;
      }

      // 3. Section Markers (@$${...{@ or @$$}...}@)
      // Used to provide accurate forensics in the warnings array if parsing
      // fails.
      if (char === "@") {
        markerRegex.lastIndex = pos;
        const match = markerRegex.exec(body);
        if (match) {
          section = match[1] === "{" ? match[2] : "top level";
          pos = markerRegex.lastIndex;
          continue;
        }
      }

      // 4. Key and Value Tables (<...>)
      if (char === "<") {
        const block = this.consumeBlock(body, pos, "<", ">");
        if (!block) {
          this.warnings.push(
            `[Section ${section}] Unterminated < block at pos ${pos}. Recovering.`
          );
          pos++;
          continue;
        }

        // Strip the outer angle brackets to pass clean content
        let tableContent = block.text.substring(1, block.text.length - 1);

        // Mork key tables are indicated by the (a=c) directive.
        // It can appear as (a=c) or nested as <(a=c)>.
        // We strip it so it doesn't pollute the dictionary.
        if (tableContent.includes("(a=c)")) {
          tableContent = tableContent.replace(/<?\(a=c\)>?/, "");
          this.parseKeyTable(tableContent);
        } else {
          this.parseValueTable(tableContent);
        }

        pos = block.nextPos;
        continue;
      }

      // 5. Tables ({...})
      if (char === "{") {
        const block = this.consumeBlock(body, pos, "{", "}");
        if (!block) {
          this.warnings.push(
            `[Section ${section}] Unterminated { block at pos ${pos}. Recovering.`
          );
          pos++;
          continue;
        }
        this.parseTable(block.text);
        pos = block.nextPos;
        continue;
      }

      // 6. Rows ([...])
      if (char === "[") {
        const block = this.consumeBlock(body, pos, "[", "]");
        if (!block) {
          this.warnings.push(
            `[Section ${section}] Unterminated [ block at pos ${pos}. Recovering.`
          );
          pos++;
          continue;
        }
        this.parseTable(block.text);
        pos = block.nextPos;
        continue;
      }

      // 7. Unknown segment / Error Recovery
      pos++;
    }

    // Convert dictionary to a grouped object based on Mork table scopes.
    const grouped = {};

    for (const key of Object.keys(this.row_hash)) {
      const originalRow = this.row_hash[key];

      // Create a brand new object so we can dictate the insertion order.
      const newRow = {};

      let tableName = "unscoped";

      // Split the key into ID and Scope
      const colonIndex = key.indexOf(":");
      if (colonIndex != -1) {
        newRow["@id"] = key.substring(0, colonIndex); // Inserted First
        newRow.scope = key.substring(colonIndex + 1); // Inserted Second

        const scopeStr = newRow.scope;

        if (scopeStr.startsWith("^")) {
          // It is a hex pointer (e.g., ^80), resolve its full name from the
          // dictionaries
          const scopeHex = scopeStr.substring(1);
          tableName =
            this.key_table[scopeHex] ||
            this.val_table[scopeHex] ||
            `scope:^${scopeHex}`;
        } else {
          // It is a literal row scope alias (e.g., 'm' for the Meta scope)
          tableName = scopeStr == "m" ? "Meta" : scopeStr;
        }
      } else {
        // Fallback for completely unscoped rows
        newRow["@id"] = key;
      }

      // Now copy all the parsed data columns into our perfectly ordered object
      Object.assign(newRow, originalRow);

      if (!grouped[tableName]) {
        grouped[tableName] = [];
      }
      grouped[tableName].push(newRow);
    }

    const result = [];
    for (const [scope, rows] of Object.entries(grouped)) {
      result.push({
        "@id": scope,
        data: rows,
      });
    }

    return result;
  }
  /**
   * Helper: Extracts a bracketed block of text safely, accounting for nested
   * brackets and escaped characters.
   *
   * @param {string} body - The full Mork text being parsed.
   * @param {number} startPos - The index where the block starts (pointing at
   *   the openChar).
   * @param {string} openChar - The character that opens the block
   *   (e.g., '{', '[', '<').
   * @param {string} closeChar - The character that closes the block
   *   (e.g., '}', ']', '>').
   * @returns {{text: string, nextPos: number}|null} An object containing the
   *   extracted text and the next cursor position, or null if the block is
   *   unterminated.
   */
  consumeBlock(body, startPos, openChar, closeChar) {
    let depth = 0;
    let inParens = false;
    let i = startPos;
    const length = body.length;

    while (i < length) {
      const char = body[i];

      if (char === "\\") {
        i += 2; // Skip the backslash and the escaped character
        continue;
      }

      // Mork does not guarantee balanced parentheses (e.g. unescaped '(' in
      // text). We rely on the boolean flag turning off at the first unescaped
      //  ')'.
      if (char === "(") {
        inParens = true;
      } else if (char === ")") {
        inParens = false;
      }

      if (!inParens) {
        if (char === openChar) {
          depth++;
        } else if (char === closeChar) {
          depth--;
          if (depth === 0) {
            return {
              text: body.substring(startPos, i + 1),
              nextPos: i + 1,
            };
          }
        }
      }
      i++;
    }
    return null; // Unterminated block
  }

  /**
   * Helper to unpack JSON strings hidden inside Mork values.
   */
  static unpackEmbeddedJson(value) {
    if (typeof value !== "string") {
      return value;
    }

    // 1. Remove Mork line-continuation backslashes.
    // Note: When called via parseContent(), these sequences are already
    // stripped globally. This regex is retained here to ensure this static
    // utility functions correctly if called directly by an external consumer.
    let cleaned = value.replace(/\\\r?\n/g, "");

    // 2. Clean off any surrounding whitespace and remaining Mork line wraps.
    cleaned = cleaned.replace(/[\r\n]+/g, "").trim();

    // 3. If it doesn't look like an object or array, bail out early.
    if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) {
      return value;
    }

    try {
      return JSON.parse(cleaned);
    } catch (e) {
      return value;
    }
  }

  /**
   * Parse a row and column table.
   *
   * @param {string} table_part
   */
  parseTable(table_part) {
    // Find the default scope if this block is a Table.
    // The regex \s* allows for structural newlines/spaces before the block
    // starts.
    let defaultScope = "";
    const scopeMatch = /^\s*\{[-\dA-F]+(:[\w\^]+)/i.exec(table_part);
    if (scopeMatch) {
      defaultScope = scopeMatch[1];
    }
    let lastId = "";
    let pos = 0;
    const length = table_part.length;

    // State machine row extractor (Immune to the [127.0.0.1] bracket bug)
    while (pos < length) {
      if (table_part[pos] === "[") {
        const block = this.consumeBlock(table_part, pos, "[", "]");
        if (!block) {
          pos++;
          continue;
        }

        // Strip the outer brackets to get the inner row content
        const rowContent = block.text.substring(1, block.text.length - 1);

        // Extract the ID (everything before the first '(')
        const firstParen = rowContent.indexOf("(");
        let id = (
          firstParen === -1 ? rowContent : rowContent.substring(0, firstParen)
        ).trim();

        // Guard against completely empty brackets (e.g., `[]` or `[  ]`)
        if (!id && firstParen === -1) {
          pos = block.nextPos;
          continue;
        }

        // 1. Handle Mork's "Clear Row" operator (-)
        let clearRow = false;
        if (id.startsWith("-")) {
          clearRow = true;
          id = id.substring(1);
        }

        // 2. Handle continuations and implicit scopes
        if (!id) {
          id = lastId;
        } else if (!id.includes(":") && defaultScope) {
          id += defaultScope;
        }

        // Prevent collisions from empty IDs (e.g. whitespace-only brackets).
        if (!id) {
          this.warnings.push(
            `Skipping malformed row with empty ID near position ${pos}`
          );
          pos = block.nextPos;
          continue;
        }

        lastId = id;
        // 3. Fetch or Create the Row
        const hash = this.row_hash[id] && !clearRow ? this.row_hash[id] : {};

        // Iterate strictly over well-formed cells, ignoring unescaped '(' inside values
        for (const match of rowContent.matchAll(/\(([^)]+)\)/g)) {
          const cell = match[1].trim();
          if (!cell) {
            continue;
          }

          const cm = /^\^([-\dA-F]+)\s*([\^=])\s*([\S\s]*)/i.exec(cell);
          if (!cm) {
            this.warnings.push(
              `[Row ${id}] Malformed cell data: "${cell}". Skipping cell.`
            );
            continue;
          }

          const keyi = cm[1];
          const which = cm[2];
          const vali = cm[3];

          const key = this.key_table[keyi];
          if (!key) {
            this.warnings.push(
              `[Row ${id}] Missing key reference ^${keyi}. Dropping cell.`
            );
            continue;
          }

          let val = vali;
          if (which === "^") {
            val = this.val_table[vali];
            if (val === undefined) {
              this.warnings.push(
                `[Row ${id}] Missing value reference ^${vali} for key ${key}. Dropping cell.`
              );
              continue;
            }
          }
          val = this.fixEncoding(val);

          // For now, only the "columnStates" key is known to contain embedded
          // JSON.
          if (
            key == "columnStates" &&
            (val.startsWith("{") || val.startsWith("["))
          ) {
            val = MorkParser.unpackEmbeddedJson(val);
          }

          hash[key] = val;
        }

        this.total++;
        this.row_hash[id] = hash;

        // Jump the cursor to the end of this row block
        pos = block.nextPos;
      } else {
        // Not a row bracket, advance the cursor
        pos++;
      }
    }
  }

  /**
   * Parse a values table.
   */
  parseValueTable(val_part) {
    if (!val_part) {
      return {};
    }

    // Use matchAll to strictly iterate only over contents inside parentheses
    for (const match of val_part.matchAll(/\(([^)]+)\)/g)) {
      const pair = match[1];

      if (!pair.trim()) {
        continue;
      }

      const m = /([\dA-F]+)[\t\n ]*=[\t\n ]*([\S\s]*)/i.exec(pair);
      if (m) {
        const key = m[1];
        const val = m[2];
        if (val.trim()) {
          this.val_table[key] = val;
        }
      } else {
        this.warnings.push(
          `Malformed value dictionary pair: "(${pair})". Skipping.`
        );
      }
    }

    return this.val_table;
  }

  /**
   * Parse a key table.
   *
   * @param {string} key_part
   */
  parseKeyTable(key_part) {
    // Safely remove comments while preserving preceding structural whitespace
    key_part = key_part.replace(/(^|\s)\/\/.*$/gm, "$1");

    if (!key_part) {
      return {};
    }

    // Use matchAll to strictly iterate only over contents inside parentheses
    for (const match of key_part.matchAll(/\(([^)]+)\)/g)) {
      const pair = match[1];

      if (!pair.trim()) {
        continue;
      }

      const m = /([\dA-F]+)\s*=\s*([\S\s]*)/i.exec(pair);
      if (m) {
        const key = m[1];
        const val = m[2];
        this.key_table[key] = val;
      } else {
        this.warnings.push(
          `Malformed key dictionary pair: "(${pair})". Skipping.`
        );
      }
    }

    return this.key_table;
  }

  /**
   * Fix character encoding.
   *
   * @param {string} value
   */
  fixEncoding(value) {
    if (!value || !value.includes("$")) {
      return value;
    }

    // 1. Strip unescaped $00 (null bytes)
    value = value.replace(/(\\?)\$00/g, (match, esc) => (esc ? match : ""));

    // We need a strictly-validating decoder for the fallback logic
    if (!this.strictDecoder) {
      this.strictDecoder = new TextDecoder("utf-8", { fatal: true });
    }

    // 2. Match exactly one escaped hex pair OR contiguous unescaped hex
    // sequences
    return value.replace(/\\\$[0-9A-Fa-f]{2}|(?:\$[0-9A-Fa-f]{2})+/g, match => {
      // If it's an escaped sequence (starts with \), leave it untouched
      if (match.startsWith("\\")) {
        return match;
      }

      // Otherwise, it's a contiguous block of valid hex to decode
      const hexStrings = match.split("$").slice(1);
      const arr = new Uint8Array(hexStrings.length);

      for (let i = 0; i < hexStrings.length; i++) {
        arr[i] = parseInt(hexStrings[i], 16);
      }

      try {
        // Attempt strict UTF-8 decoding
        return this.strictDecoder.decode(arr);
      } catch (e) {
        // FALLBACK: Legacy ISO-8859-1 single-byte encoding
        let legacyString = "";
        for (let i = 0; i < arr.length; i++) {
          legacyString += String.fromCharCode(arr[i]);
        }
        return legacyString;
      }
    });
  }
}
