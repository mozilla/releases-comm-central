/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["ImapUtils"];

/**
 * Collection of helper functions for IMAP.
 */
var ImapUtils = {
  /** @see nsImapCore.h */
  FLAG_NONE: 0x0000,
  FLAG_SEEN: 0x0001,
  FLAG_ANSWERED: 0x0002,
  FLAG_FLAGGED: 0x0004,
  FLAG_DELETED: 0x0008,
  FLAG_DRAFT: 0x0010,
  FLAG_FORWARDED: 0x0040,
  FLAG_MDN_SENT: 0x0080,
  FLAG_CUSTOM_KEYWORD: 0x0100,
  FLAG_LABEL: 0x0e00,
  FLAG_SUPPORT_USER_FLAG: 0x8000,

  /**
   * Convert internal flag number to flag string, for example,
   *   0x3 will become "(\\Seen \\Answered)".
   * @param {number} flags - Internal flag number.
   * @param {number} supportedFlags - Server supported flags.
   * @returns {string} Flags string that can be sent to the server.
   */
  flagsToString(flags, supportedFlags) {
    let arr = [];
    let strFlags = [
      ["\\Seen", this.FLAG_SEEN],
      ["\\Answered", this.FLAG_ANSWERED],
      ["\\Flagged", this.FLAG_FLAGGED],
      ["\\Deleted", this.FLAG_DELETED],
      ["\\Draft", this.FLAG_DRAFT],
      ["\\Forwarded", this.FLAG_FORWARDED],
      ["\\MDNSent", this.FLAG_MDN_SENT],
    ];
    for (let [str, flag] of strFlags) {
      if (flags & flag && supportedFlags & flag) {
        arr.push(str);
      }
    }
    return `(${arr.join(" ")})`;
  },

  /**
   * Convert flag string internal flag number, for example,
   *   "\\Seen" will become 0x1.
   * @param {string} str - A single flag string.
   * @returns {number} An internal flag number.
   */
  stringToFlag(str) {
    return (
      {
        "\\SEEN": this.FLAG_SEEN,
        "\\ANSWERED": this.FLAG_ANSWERED,
        "\\FLAGGED": this.FLAG_FLAGGED,
        "\\DELETED": this.FLAG_DELETED,
        "\\DRAFT": this.FLAG_DRAFT,
        "\\*":
          this.FLAG_LABEL |
          this.FLAG_MDN_SENT |
          this.FLAG_FORWARDED |
          this.FLAG_SUPPORT_USER_FLAG,
        $MDNSENT: this.FLAG_MDN_SENT,
        $FORWARDED: this.FLAG_FORWARDED,
      }[str.toUpperCase()] || this.FLAG_NONE
    );
  },
};
