/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This test verifies that we don't display text attachments inline
 * when mail.inline_attachments is false.
 */
/* import-globals-from ../../../test/resources/logHelper.js */
/* import-globals-from ../../../test/resources/asyncTestUtils.js */
/* import-globals-from ../../../test/resources/MessageGenerator.jsm */
/* import-globals-from ../../../test/resources/messageModifier.js */
/* import-globals-from ../../../test/resources/messageInjection.js */
load("../../../resources/logHelper.js");
load("../../../resources/asyncTestUtils.js");

load("../../../resources/MessageGenerator.jsm");
load("../../../resources/messageModifier.js");
load("../../../resources/messageInjection.js");

var gMessenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);

// Create a message generator
var gMessageGenerator = new MessageGenerator();

var textAttachment = "inline text attachment";

// create a message with a text attachment
var messages = [
  {
    // text attachment
    attachments: [
      {
        body: textAttachment,
        filename: "test.txt",
        format: "",
      },
    ],
  },
];

var gStreamListener = {
  QueryInterface: ChromeUtils.generateQI(["nsIStreamListener"]),

  _str: "",
  // nsIRequestObserver part
  onStartRequest(aRequest) {
    this.str = "";
    this._stream = null;
  },
  onStopRequest(aRequest, aStatusCode) {
    // check that text attachment contents didn't end up inline.
    Assert.ok(!this._str.includes(textAttachment));
    async_driver();
  },

  /* okay, our onDataAvailable should actually never be called.  the stream
     converter is actually eating everything except the start and stop
     notification. */
  // nsIStreamListener part
  _stream: null,

  onDataAvailable(aRequest, aInputStream, aOffset, aCount) {
    if (this._stream === null) {
      this._stream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
        Ci.nsIScriptableInputStream
      );
      this._stream.init(aInputStream);
    }
    this._str += this._stream.read(aCount);
  },
};

var msgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
  Ci.nsIMsgWindow
);

function* test_message_attachments(info, inline, inline_text) {
  Services.prefs.setBoolPref("mail.inline_attachments", inline);
  Services.prefs.setBoolPref("mail.inline_attachments.text", inline_text);
  let synMsg = gMessageGenerator.makeMessage(info);
  let synSet = new SyntheticMessageSet([synMsg]);
  yield add_sets_to_folder(gInbox, [synSet]);

  let msgURI = synSet.getMsgURI(0);
  let msgService = gMessenger.messageServiceFromURI(msgURI);

  msgService.streamMessage(
    msgURI,
    gStreamListener,
    msgWindow,
    null,
    true, // have them create the converter
    // additional uri payload, note that "header=" is prepended automatically
    "filter",
    false
  );

  yield false;
}

function test_message_attachments_no_inline(info) {
  return test_message_attachments(info, false, true);
}

function test_message_attachments_no_inline_text(info) {
  return test_message_attachments(info, true, false);
}

/* ===== Driver ===== */

var tests = [
  parameterizeTest(test_message_attachments_no_inline, messages),
  parameterizeTest(test_message_attachments_no_inline_text, messages),
];

var gInbox;

function run_test() {
  gInbox = configure_message_injection({ mode: "local" });
  async_run_tests(tests);
}
