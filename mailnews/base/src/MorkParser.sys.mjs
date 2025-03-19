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
 * Mork reader. Read an .msf file and transform it to JSON.
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
  }

  /**
   * Convenience method to print the JSON-ified Mork data to stdout.
   *
   * @param {string} path - Path to the .msf file to dump.
   * @param {boolean} [prettify=false] - Show human readable msg hdr data.
   * @param {string} [folderURI=null] - Folder URI.
   * @returns {object[]} the parsed Mork data.
   */
  static async dumpFile(path, prettify = false, folderURI = null) {
    const msf = lazy.MailStringUtils.uint8ArrayToByteString(
      await IOUtils.read(path)
    );
    let data = new MorkParser().parseContent(msf);
    if (prettify) {
      data = data
        .filter(o => "message-id" in o)
        .map(o => MorkParser.readableMsgHdrData(o, folderURI));
    }
    dump(JSON.stringify(data, null, 2) + "\n");
    return data;
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
    return {
      uri: baseMessageURI
        ? `${baseMessageURI}#${parseInt(o["@id"], 16)}`
        : undefined,
      messageId: o["message-id"],
      references: (o.references || "")
        .trim()
        .replaceAll(/\s+/g, " ")
        .replaceAll(/[<>]/g, "")
        .split(" ")
        .filter(Boolean),
      date: o.date ? new Date(parseInt(o.date, 16) * 1000) : null,
      received: o.dateReceived
        ? new Date(parseInt(o.dateReceived, 16) * 1000)
        : null,
      subject: o.subject,
      from: o.sender ? [o.sender] : [],
      recipients: (o.recipients || "")
        .split(",")
        .map(r => r.trim())
        .filter(Boolean), // TODO: use real header parsing!
      ccList: (o.ccList || "")
        .split(",")
        .map(r => r.trim())
        .filter(Boolean), // TODO: use real header parsing!

      flags: o.flags ? parseInt(o.flags, 16) : undefined,
      priority: o.priority ? parseInt(o.priority, 16) : undefined,
      size: o.size ? parseInt(o.size, 16) : undefined,
      storeToken: o.storeToken,
      offlineMsgSize: o.offlineMsgSize
        ? parseInt(o.offlineMsgSize, 16)
        : undefined,
      numLines: o.numLines ? parseInt(o.numLines, 16) : undefined,
      preview: o.preview || undefined,
      junkscoreorigin: o.junkscoreorigin ? o.junkscoreorigin : null,
      junkpercent: o.junkpercent ? o.junkpercent : undefined,
      senderName: o.sender_name ? o.sender_name : undefined,
      prevkeywords: o.prevkeywords ? o.prevkeywords : undefined,
      keywords: o.keywords ? o.keywords : undefined,
      remoteContentPolicy: o.remoteContentPolicy
        ? parseInt(o.remoteContentPolicy, 16)
        : undefined,
      protoThreadFlags: o.ProtoThreadFlags
        ? parseInt(o.ProtoThreadFlags, 16)
        : undefined,
      account: o.account ? o.account : undefined,
      glodaId: o["gloda-id"] ? parseInt(o["gloda-id"], 16) : undefined,
      xGmMsgId: o["X-GM-MSGID"] || undefined,
      xGmThrId: o["X-GM-THRID"] || undefined,
      xGmLabels: o["X-GM-LABELS"] || undefined,
      pseudoHdr: o.pseudoHdr ? parseInt(o.pseudoHdr, 16) : undefined,
      enigmail: o.enigmail ? parseInt(o.enigmail, 16) : undefined,
      notAPhishMessage: o.notAPhishMessage
        ? parseInt(o.notAPhishMessage, 16)
        : undefined,
    };
  }

  /**
   * Parse mork content and return an array of objects.
   *
   * @param {string} body
   * @returns {string[]} an array of hashes.
   */
  parseContent(body) {
    // Reset global variables,
    this.key_table = {};
    this.val_table = {};
    this.row_hash = {};
    this.skipped = 0;
    this.total = 0;

    // Local variables
    let section_end_re = null;
    let section = "top level";

    // Windows Mozilla uses \r\n
    body = body.replace(/\r\n/g, "\n");

    // Presumably Mac Mozilla is similarly dumb
    body = body.replace(/\r/g, "\n");

    // Sometimes backslash is quoted with a backslash; convert to hex.
    body = body.replace(/\\\\/g, "$5C");

    // Close-paren is quoted with a backslash; convert to hex.
    body = body.replace(/\\\)/g, "$29");

    // Backslash at end of line is continuation.
    body = body.replace(/\\\n/g, "");

    // Figure out what we're looking at, and parse it.
    while (body.trim()) {
      // Comment.
      let m = /^\s*\/\/.*?\n/g.exec(body);
      if (m) {
        body = body.substring(m[0].length);
        continue;
      }

      // Key table <(a=c)>.
      m = /^\s*<\s*<\(a=c\)>[\S\s]+?(([^>]*))>\s*/g.exec(body);
      if (m) {
        const captured = m[1];
        body = body.replace(m[0], "");
        this.parseKeyTable(section, captured);
        continue;
      }

      // Values <...>.
      m = /^\s*<([\S\s]*?\))>\s*/g.exec(body);
      if (m) {
        const captured = m[1];
        body = body.replace(m[0], "");
        this.parseValueTable(section, captured);
        continue;
      }

      // Table {...}.
      m = /^\s*\{-?[\dA-F]+:[\S\s]*?\{(([\S\s]*?\})([\S\s]*?\}))\s*/gi.exec(
        body
      );
      if (m) {
        const captured = m[1];
        body = body.replace(m[0], "");
        this.parseTable(section, captured);
        continue;
      }

      // Rows (-> table) [...].
      m = /^\s*((\[[\S\s]*?\]\s*)+)/g.exec(body);
      if (m) {
        const captured = m[1];
        body = body.replace(m[0], "");
        this.parseTable(section, captured);
        continue;
      }

      // Section end.
      if (section_end_re) {
        m = section_end_re.exec(body);
        if (m) {
          body = body.replace(m[0], "");
          section_end_re = null;
          section = "top level";
          continue;
        }
      }

      // Section begin.
      m = /\@\$\$\{([\dA-F]+)\{\@\s*/gi.exec(body);
      if (m) {
        const captured = m[1];
        section = captured;
        body = body.replace(m[0], "");
        section_end_re = new RegExp(
          "^\\s*\\@\\$\\$\\}" + section + "\\}\\@\\s*",
          "g"
        );
        continue;
      }

      // Unknown segment.
      const segment = body.substring(0, 255 < body.length ? 255 : body.length);
      console.error(section + ": Cannot parse");
      console.error(segment);
      return [{ error: "Cannot parse!", section, segment }];
    }

    if (section_end_re) {
      console.error("Unterminated section " + section);
    }

    // Convert dictionary to array.
    const list = [];
    const keys = Object.keys(this.row_hash);
    for (const key of keys) {
      const o = this.row_hash[key];
      o["@id"] = key;
      list.push(o);
    }

    return list;
  }

  /**
   * Parse a row and column table.
   *
   * @param {string} section
   * @param {string} table_part
   */
  parseTable(section, table_part) {
    // Assumption: no relevant spaces in values in this section
    table_part = table_part.replace(/\s+/g, "");

    // Grab each complete [...] block.
    const regex = /[^[]*\[([\S\s]+?)\]/g;
    let m;
    while ((m = regex.exec(table_part)) != null) {
      let hash = {};

      // Break up the table - each line cosists of a $id and the rest are
      // records.
      const parts = m[1].split(/[()]+/);
      let id = parts[0];
      const cells = parts;

      // A long way of saying skip the line if there are no records in the
      // cells array.
      if (cells.length < 1) {
        continue;
      }

      // Trim junk.
      id = id.replace(/^-/g, "");
      id = id.replace(/:[\S\s]*/g, "");

      // Check that the id number we've been given corresponds to one we pulled
      // out from the key_table index.
      if (this.row_hash[id]) {
        hash = this.row_hash[id];
      }

      for (let i = 1; i < cells.length; i++) {
        const cell = cells[i];

        // Skip empty record.
        if (!cell?.trim()) {
          continue;
        }

        // Extract key and value
        const cm = /^\^([-\dA-F]+)([\^=])([\S\s]*)$/gi.exec(cell);
        if (!cm) {
          continue;
        }

        const keyi = cm[1];
        const which = cm[2];
        const vali = cm[3];

        // Empty value.
        if (!vali?.trim()) {
          // console.warn("Unparsable cell: " + cell);
        }

        // Ignore the key if it isn't in the key table.
        const key = this.key_table[keyi];
        if (!key) {
          continue;
        }

        let val = which == "=" ? vali : this.val_table[vali];

        // Fix character encoding.
        val = this.fixEncoding(val);

        hash[key] = val;
      }

      this.total++;
      this.row_hash[id] = hash;
    }
  }

  /**
   * Parse a values table.
   *
   * @param {string}section
   * @param {string} val_part
   */
  parseValueTable(section, val_part) {
    if (!val_part) {
      return {};
    }

    // Extract pairs (key=value)
    const pairs = val_part.split(/\(([^\)]+)\)/g);

    for (const pair of pairs) {
      // Skip empty line
      if (!pair.trim()) {
        continue;
      }

      const m = /([\dA-F]*)[\t\n ]*=[\t\n ]*([\S\s]*)/gi.exec(pair);
      if (!m) {
        continue;
      }

      const key = m[1];
      const val = m[2];

      if (!val?.trim()) {
        // console.warn(section + ": unparsable value: " + pair);
        continue;
      }

      // Approximate wchar_t -> ASCII and remove NULs
      // val = this.fixEncoding(val);

      this.val_table[key] = val;
    }

    return this.val_table;
  }

  /**
   * Parse a key table.
   *
   * @param {string} section
   * @param {string} key_part
   */
  parseKeyTable(section, key_part) {
    // Remove comments (starting with "//" until the end of the line).
    key_part = key_part.replace(/\s*\/\/.*$/gm, "");

    // Extract pairs (key=value).
    const pairs = key_part.split(/\(([^\)]+)\)/g);

    // Convert to dictionary object.
    for (const pair of pairs) {
      // Skip empty line
      if (!pair.trim()) {
        continue;
      }

      // Parse key-value pairs.
      const m = /([\dA-F]+)\s*=\s*([\S\s]*)/gi.exec(pair);
      if (m) {
        const key = m[1];
        const val = m[2];
        this.key_table[key] = val;
      }
    }

    return this.key_table;
  }

  /**
   * Fix character encoding, e.g. remove $00 but keep \$ff (escaped with slash).
   *
   * @param {string} value
   */
  fixEncoding(value) {
    if (value && value.includes("$")) {
      function fixASCII(m, m0, m1) {
        const n1 = parseInt(m1, 16);
        const ch = String.fromCharCode(n1); // Convert byte to ASCII.
        return m0 + ch;
      }

      function fixUTF8(m, m0, m1, m2) {
        const n1 = parseInt(m1, 16);
        const n2 = parseInt(m2, 16);
        const arr = new Uint8Array(2);
        arr[0] = n1;
        arr[1] = n2;
        const ch = new TextDecoder().decode(arr);
        return m0 + ch;
      }
      // e.g. $E2$80$93 $E2$80$9D == – ”
      function fixUTF8_3(m, m0, m1, m2, m3) {
        const n1 = parseInt(m1, 16);
        const n2 = parseInt(m2, 16);
        const n3 = parseInt(m3, 16);
        const arr = new Uint8Array(3);
        arr[0] = n1;
        arr[1] = n2;
        arr[2] = n3;
        const ch = new TextDecoder().decode(arr);
        return m0 + ch;
      }

      return value
        .replace(/([^\\])\$00/g, "$1")
        .replace(
          /([^\\])\$([0-9A-Z][0-9A-Z])\$([0-9A-Z][0-9A-Z])\$([0-9A-Z][0-9A-Z])/gi,
          fixUTF8_3
        ) // Replace non-escaped $xx$yy$zz but ignore \$xx$yy
        .replace(/([^\\])\$([0-9A-Z][0-9A-Z])\$([0-9A-Z][0-9A-Z])/gi, fixUTF8) // Replace non-escaped $xx$yy but ignore \$xx$yy
        .replace(/^()\$([0-9A-Z][0-9A-Z])\$([0-9A-Z][0-9A-Z])/gi, fixUTF8) // Replace value starting with $xx$yy
        .replace(/([^\\])\$([0-9A-Z][0-9A-Z])/gi, fixASCII) // Replace non-escaped $xx but ignore \$xx
        .replace(/^()\$([0-9A-Z][0-9A-Z])/gi, fixASCII); // Replace value starting with $xx
    }
    return value;
  }
}
