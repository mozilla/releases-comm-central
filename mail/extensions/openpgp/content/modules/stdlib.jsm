/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/**
 * Wrapper library for TB-stdlib to avoid naming conflicts
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailStdlib"];

const {
  composeInIframe,
  getEditorForIframe,
  citeString,
  htmlToPlainText,
  simpleWrap,
  plainTextToHtml,
  replyAllParams,
  determineComposeHtml,
  composeMessageTo,
  getSignatureContentsForAccount,
} = ChromeUtils.import("chrome://openpgp/content/modules/stdlib/compose.jsm");

const {
  gIdentities,
  fillIdentities,
  getIdentities,
  getDefaultIdentity,
  getIdentityForEmail,
  hasConfiguredAccounts,
  range,
  MixIn,
  combine,
  entries,
  dateAsInMessageList,
  escapeHtml,
  sanitize,
  parseMimeLine,
  encodeUrlParameters,
  decodeUrlParameters,
  systemCharset,
  isOSX,
  isWindows,
  isAccel,
} = ChromeUtils.import("chrome://openpgp/content/modules/stdlib/misc.jsm");

const {
  msgHdrToMessageBody,
  msgHdrToNeckoURL,
  msgHdrGetTags,
  msgUriToMsgHdr,
  msgHdrGetUri,
  msgHdrFromNeckoUrl,
  msgHdrSetTags,
  msgHdrIsDraft,
  msgHdrIsSent,
  msgHdrIsArchive,
  msgHdrIsInbox,
  msgHdrIsRss,
  msgHdrIsNntp,
  msgHdrIsJunk,
  msgHdrsMarkAsRead,
  msgHdrsArchive,
  msgHdrsDelete,
  getMail3Pane,
  msgHdrGetHeaders,
  msgHdrsModifyRaw,
} = ChromeUtils.import(
  "chrome://openpgp/content/modules/stdlib/msgHdrUtils.jsm"
);

var EnigmailStdlib = {
  // compose.jsm
  composeInIframe,
  getEditorForIframe,
  citeString,
  htmlToPlainText,
  simpleWrap,
  plainTextToHtml,
  replyAllParams,
  determineComposeHtml,
  composeMessageTo,
  getSignatureContentsForAccount,

  // misc.jsm
  gIdentities,
  fillIdentities,
  getIdentities,
  getDefaultIdentity,
  getIdentityForEmail,
  hasConfiguredAccounts,
  range,
  MixIn,
  combine,
  entries,
  dateAsInMessageList,
  escapeHtml,
  sanitize,
  parseMimeLine,
  encodeUrlParameters,
  decodeUrlParameters,
  systemCharset,
  isOSX,
  isWindows,
  isAccel,

  // msgHdrUtils.jsm
  msgHdrToMessageBody,
  msgHdrToNeckoURL,
  msgHdrGetTags,
  msgUriToMsgHdr,
  msgHdrGetUri,
  msgHdrFromNeckoUrl,
  msgHdrSetTags,
  msgHdrIsDraft,
  msgHdrIsSent,
  msgHdrIsArchive,
  msgHdrIsInbox,
  msgHdrIsRss,
  msgHdrIsNntp,
  msgHdrIsJunk,
  msgHdrsMarkAsRead,
  msgHdrsArchive,
  msgHdrsDelete,
  getMail3Pane,
  msgHdrGetHeaders,
  msgHdrsModifyRaw,
};
