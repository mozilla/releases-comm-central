/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailConstants"];

var EnigmailConstants = {
  POSSIBLE_PGPMIME: -2081,

  // possible values for
  // - encryptByRule, signByRules, pgpmimeByRules
  // - encryptForced, signForced, pgpmimeForced (except CONFLICT)
  // NOTE:
  // - values 0/1/2 are used with this fixed semantics in the persistent rules
  // - see also enigmailEncryptionDlg.xhtml
  ENIG_FORCE_SMIME: 3,
  ENIG_AUTO_ALWAYS: 22,
  ENIG_CONFLICT: 99,

  ENIG_FINAL_UNDEF: -1,
  ENIG_FINAL_NO: 0,
  ENIG_FINAL_YES: 1,
  ENIG_FINAL_FORCENO: 10,
  ENIG_FINAL_FORCEYES: 11,
  ENIG_FINAL_SMIME: 97, // use S/MIME (automatically chosen)
  ENIG_FINAL_FORCESMIME: 98, // use S/MIME (forced by user)
  ENIG_FINAL_CONFLICT: 99,

  MIME_HANDLER_UNDEF: 0,
  MIME_HANDLER_SMIME: 1,
  MIME_HANDLER_PGPMIME: 2,

  ICONTYPE_INFO: 1,
  ICONTYPE_QUESTION: 2,
  ICONTYPE_ALERT: 3,
  ICONTYPE_ERROR: 4,

  FILTER_MOVE_DECRYPT: "enigmail@enigmail.net#filterActionMoveDecrypt",
  FILTER_COPY_DECRYPT: "enigmail@enigmail.net#filterActionCopyDecrypt",
  FILTER_ENCRYPT: "enigmail@enigmail.net#filterActionEncrypt",
  FILTER_TERM_PGP_ENCRYPTED: "enigmail@enigmail.net#filterTermPGPEncrypted",

  /* taken over from old nsIEnigmail */

  /* Cleartext signature parts */
  SIGNATURE_TEXT: 1,
  SIGNATURE_HEADERS: 2,
  SIGNATURE_ARMOR: 3,

  /* User interaction flags */
  UI_INTERACTIVE: 0x01,
  UI_ALLOW_KEY_IMPORT: 0x02,
  UI_UNVERIFIED_ENC_OK: 0x04,
  UI_PGP_MIME: 0x08,
  UI_TEST: 0x10,
  UI_RESTORE_STRICTLY_MIME: 0x20,
  UI_IGNORE_MDC_ERROR: 0x40, // force decryption, even if we got an MDC error

  /* Send message flags */
  SEND_SIGNED: 0x0001, //    1
  SEND_ENCRYPTED: 0x0002, //    2
  SEND_DEFAULT: 0x0004, //    4
  SEND_LATER: 0x0008, //    8
  SEND_WITH_CHECK: 0x0010, //   16
  SEND_ALWAYS_TRUST: 0x0020, //   32
  SEND_ENCRYPT_TO_SELF: 0x0040, //   64
  SEND_PGP_MIME: 0x0080, //  128
  SEND_TEST: 0x0100, //  256
  SAVE_MESSAGE: 0x0200, //  512
  SEND_STRIP_WHITESPACE: 0x0400, // 1024
  SEND_ATTACHMENT: 0x0800, // 2048
  ENCRYPT_SUBJECT: 0x1000, // 4096
  SEND_VERBATIM: 0x2000, // 8192
  SEND_TWO_MIME_LAYERS: 0x4000, // 16384
  SEND_SENDER_KEY_EXTERNAL: 0x8000, // 32768

  /* Status flags */
  GOOD_SIGNATURE: 0x00000001,
  BAD_SIGNATURE: 0x00000002,
  UNCERTAIN_SIGNATURE: 0x00000004,
  EXPIRED_SIGNATURE: 0x00000008,
  EXPIRED_KEY_SIGNATURE: 0x00000010,
  EXPIRED_KEY: 0x00000020,
  REVOKED_KEY: 0x00000040,
  NO_PUBKEY: 0x00000080,
  NO_SECKEY: 0x00000100,
  IMPORTED_KEY: 0x00000200,
  INVALID_RECIPIENT: 0x00000400,
  MISSING_PASSPHRASE: 0x00000800,
  BAD_PASSPHRASE: 0x00001000,
  BAD_ARMOR: 0x00002000,
  NODATA: 0x00004000,
  DECRYPTION_INCOMPLETE: 0x00008000,
  DECRYPTION_FAILED: 0x00010000,
  DECRYPTION_OKAY: 0x00020000,
  MISSING_MDC: 0x00040000,
  TRUSTED_IDENTITY: 0x00080000,
  PGP_MIME_SIGNED: 0x00100000,
  PGP_MIME_ENCRYPTED: 0x00200000,
  DISPLAY_MESSAGE: 0x00400000,
  INLINE_KEY: 0x00800000,
  PARTIALLY_PGP: 0x01000000,
  PHOTO_AVAILABLE: 0x02000000,
  OVERFLOWED: 0x04000000,
  CARDCTRL: 0x08000000,
  SC_OP_FAILURE: 0x10000000,
  UNKNOWN_ALGO: 0x20000000,
  SIG_CREATED: 0x40000000,
  END_ENCRYPTION: 0x80000000,

  /* Extended status flags */
  EXT_SELF_IDENTITY: 0x00000001,
  EXT_SIGNING_TIME_MISMATCH: 0x00000002,

  /* UI message status flags */
  MSG_SIG_NONE: 0,
  MSG_SIG_VALID_SELF: 1,
  MSG_SIG_VALID_KEY_VERIFIED: 2,
  MSG_SIG_VALID_KEY_UNVERIFIED: 3,
  MSG_SIG_UNCERTAIN_KEY_UNAVAILABLE: 4,
  MSG_SIG_UNCERTAIN_UID_MISMATCH: 5,
  MSG_SIG_UNCERTAIN_KEY_NOT_ACCEPTED: 6,
  MSG_SIG_INVALID: 7,
  MSG_SIG_INVALID_KEY_REJECTED: 8,
  MSG_SIG_INVALID_DATE_MISMATCH: 9,

  MSG_ENC_NONE: 0,
  MSG_ENC_OK: 1,
  MSG_ENC_FAILURE: 2,
  MSG_ENC_NO_SECRET_KEY: 3,

  /*** key handling functions ***/

  EXTRACT_SECRET_KEY: 0x01,

  /* Keyserver Action Flags */
  SEARCH_KEY: 1,
  DOWNLOAD_KEY: 2,
  UPLOAD_KEY: 3,
  REFRESH_KEY: 4,
  UPLOAD_WKD: 6,
  GET_CONFIRMATION_LINK: 7,
  DOWNLOAD_KEY_NO_IMPORT: 8,

  /* attachment handling */

  /* per-recipient rules */
  AC_RULE_PREFIX: "autocrypt://",

  CARD_PIN_CHANGE: 1,
  CARD_PIN_UNBLOCK: 2,
  CARD_ADMIN_PIN_CHANGE: 3,

  /* Keyserver error codes (in keyserver.jsm) */
  KEYSERVER_ERR_ABORTED: 1,
  KEYSERVER_ERR_SERVER_ERROR: 2,
  KEYSERVER_ERR_SECURITY_ERROR: 3,
  KEYSERVER_ERR_CERTIFICATE_ERROR: 4,
  KEYSERVER_ERR_SERVER_UNAVAILABLE: 5,
  KEYSERVER_ERR_IMPORT_ERROR: 6,
  KEYSERVER_ERR_UNKNOWN: 7,

  /* AutocryptSeup Setup Type */
  AUTOSETUP_NOT_INITIALIZED: 0,
  AUTOSETUP_AC_SETUP_MSG: 1,
  AUTOSETUP_AC_HEADER: 2,
  AUTOSETUP_PEP_HEADER: 3,
  AUTOSETUP_ENCRYPTED_MSG: 4,
  AUTOSETUP_NO_HEADER: 5,
  AUTOSETUP_NO_ACCOUNT: 6,

  /* Bootstrapped Addon constants */
  APP_STARTUP: 1, // The application is starting up.
  APP_SHUTDOWN: 2, // The application is shutting down.
  ADDON_ENABLE: 3, // The add-on is being enabled.
  ADDON_DISABLE: 4, // The add-on is being disabled. (Also sent during uninstallation)
  ADDON_INSTALL: 5, // The add-on is being installed.
  ADDON_UNINSTALL: 6, // The add-on is being uninstalled.
  ADDON_UPGRADE: 7, // The add-on is being upgraded.
  ADDON_DOWNGRADE: 8, // The add-on is being downgraded.
};
