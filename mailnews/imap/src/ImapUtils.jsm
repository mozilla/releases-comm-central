/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["ImapUtils"];

/**
 * Collection of helper functions for IMAP.
 */
var ImapUtils = {
  NS_MSG_ERROR_IMAP_COMMAND_FAILED: 0x80550021,

  /** @see nsImapCore.h */
  FLAG_NONE: 0x0000,
  /** mailbox flags */
  FLAG_MARKED: 0x01,
  FLAG_UNMARKED: 0x02,
  FLAG_NO_INFERIORS: 0x04,
  FLAG_NO_SELECT: 0x08,
  FLAG_IMAP_TRASH: 0x10,
  FLAG_JUST_EXPUNGED: 0x20,
  FLAG_PERSONAL_MAILBOX: 0x40,
  FLAG_PUBLIC_MAILBOX: 0x80,
  FLAG_OTHER_USERS_MAILBOX: 0x100,
  FLAG_NAMESPACE: 0x200,
  FLAG_NEWLY_CREATED_FOLDER: 0x400,
  FLAG_IMAP_DRAFTS: 0x800,
  FLAG_IMAP_SPAM: 0x1000,
  FLAG_IMAP_SENT: 0x2000,
  FLAG_IMAP_INBOX: 0x4000,
  FLAG_IMAP_ALL_MAIL: 0x8000,
  FLAG_IMAP_XLIST_TRASH: 0x10000,
  FLAG_NON_EXISTENT: 0x20000,
  FLAG_SUBSCRIBED: 0x40000,
  FLAG_REMOTE: 0x80000,
  FLAG_HAS_CHILDREN: 0x100000,
  FLAG_HAS_NO_CHILDREN: 0x200000,
  FLAG_IMAP_ARCHIVE: 0x400000,

  /** message flags */
  FLAG_SEEN: 0x0001,
  FLAG_ANSWERED: 0x0002,
  FLAG_FLAGGED: 0x0004,
  FLAG_DELETED: 0x0008,
  FLAG_DRAFT: 0x0010,
  FLAG_FORWARDED: 0x0040,
  FLAG_MDN_SENT: 0x0080,
  FLAG_CUSTOM_KEYWORD: 0x0100,
  FLAG_LABEL: 0x0e00,
  FLAG_SUPPORT_FORWARDED_FLAG: 0x4000,
  FLAG_SUPPORT_USER_FLAG: 0x8000,

  logger: console.createInstance({
    prefix: "mailnews.imap",
    maxLogLevel: "Warn",
    maxLogLevelPref: "mailnews.imap.loglevel",
  }),

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
   * Convert a flag string to an internal flag number, for example,
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

  /**
   * Convert an array of flag string to an internal flag number, for example,
   *   ["\\Seen", "\\Answered"] will become 0x3.
   * @param {string[]} arr - An array of flag string.
   * @returns {number} An internal flag number.
   */
  stringsToFlags(arr) {
    let flags = 0;
    for (let str of arr) {
      flags |= this.stringToFlag(str);
    }
    return flags;
  },
};
