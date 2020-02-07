/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Helpers to deal with message (nsIMsgDBHdr) parsing.
 */

"use strict";

const EXPORTED_SYMBOLS = ["to_mime_message"];

var frame = ChromeUtils.import("resource://testing-common/mozmill/frame.jsm");
var utils = ChromeUtils.import("resource://testing-common/mozmill/utils.jsm");

var { MsgHdrToMimeMessage } = ChromeUtils.import(
  "resource:///modules/gloda/MimeMessage.jsm"
);

/**
 * Given a message header, converts it to a MimeMessage. If aCallback throws,
 * the test will be marked failed. See the documentation for MsgHdrToMimeMessage
 * for more details.
 */
function to_mime_message(
  aMsgHdr,
  aCallbackThis,
  aCallback,
  aAllowDownload,
  aOptions
) {
  let called = false;
  let currentTest = frame.events.currentTest;
  MsgHdrToMimeMessage(
    aMsgHdr,
    aCallbackThis,
    function(aRecdMsgHdr, aMimeMsg) {
      try {
        aCallback(aRecdMsgHdr, aMimeMsg);
      } catch (ex) {
        Cu.reportError(ex);
        frame.events.fail({ exception: ex, test: currentTest });
      } finally {
        called = true;
      }
    },
    aAllowDownload,
    aOptions
  );
  utils.waitFor(() => called, "Timeout waiting for message to be parsed");
}
