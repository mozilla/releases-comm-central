/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This test verifies that we emit a message/rfc822 body part as an attachment
 * whether or not mail.inline_attachments is true.
 */
load("../../../resources/logHelper.js");
load("../../../resources/asyncTestUtils.js");

load("../../../resources/messageGenerator.js");
load("../../../resources/messageModifier.js");
load("../../../resources/messageInjection.js");

var gMessenger = Cc["@mozilla.org/messenger;1"]
                   .createInstance(Ci.nsIMessenger);

// Create a message generator
var msgGen = gMessageGenerator = new MessageGenerator();

var messages = [
  // a message whose body is itself a message
  { bodyPart: msgGen.makeMessage(),
    attachmentCount: inline => 1,
  },
  // a message whose body is itself a message, and which has an attachment
  { bodyPart: msgGen.makeMessage({
      attachments: [{ body: "I'm an attachment!",
                      filename: "attachment.txt",
                      format: "" }]
    }),
    attachmentCount: inline => inline ? 2 : 1,
  },
];

var gStreamListener = {
  stream: null,
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIStreamListener]),

  // nsIRequestObserver part
  onStartRequest: function (aRequest, aContext) {
  },
  onStopRequest: function (aRequest, aContext, aStatusCode) {
    do_check_eq(gMessageHeaderSink.attachmentCount,
                this.expectedAttachmentCount);
    async_driver();
  },

  // nsIStreamListener part
  onDataAvailable: function (aRequest,aContext,aInputStream,aOffset,aCount) {
    if (this.stream === null) {
      this.stream = Cc["@mozilla.org/scriptableinputstream;1"].
                    createInstance(Ci.nsIScriptableInputStream);
      this.stream.init(aInputStream);
    }
  }
};

var gMessageHeaderSink = {
  attachmentCount: 0,

  handleAttachment: function(aContentType, aUrl, aDisplayName, aUri,
                             aIsExternalAttachment) {
    this.attachmentCount++;
  },

  // stub functions from nsIMsgHeaderSink
  addAttachmentField: function(aName, aValue) {},
  onStartHeaders: function() {},
  onEndHeaders: function() {},
  processHeaders: function(aHeaderNames, aHeaderValues, dontCollectAddrs) {},
  onEndAllAttachments: function() {},
  onEndMsgDownload: function() {},
  onEndMsgHeaders: function(aUrl) {},
  onMsgHasRemoteContent: function(aMsgHdr, aContentURI) {},
  securityInfo: null,
  mDummyMsgHeader: null,
  properties: null,
  resetProperties: function () {
    this.attachmentCount = 0;
  },
};

var msgWindow = Cc["@mozilla.org/messenger/msgwindow;1"]
                  .createInstance(Ci.nsIMsgWindow);
msgWindow.msgHeaderSink = gMessageHeaderSink;

function help_test_rfc822_body(info, inline) {
  Services.prefs.setBoolPref("mail.inline_attachments", inline);
  let synMsg = gMessageGenerator.makeMessage(info);
  let synSet = new SyntheticMessageSet([synMsg]);
  yield add_sets_to_folder(gInbox, [synSet]);

  let msgURI = synSet.getMsgURI(0);
  let msgService = gMessenger.messageServiceFromURI(msgURI);

  gStreamListener.expectedAttachmentCount = info.attachmentCount(inline);
  let streamURI = msgService.streamMessage(
    msgURI,
    gStreamListener,
    msgWindow,
    null,
    true, // have them create the converter
    // additional uri payload, note that "header=" is prepended automatically
    "filter",
    false);

  yield false;
}

function test_rfc822_body_display_inline(info) {
  return help_test_rfc822_body(info, true);
}

function test_rfc822_body_no_display_inline(info) {
  return help_test_rfc822_body(info, false);
}

/* ===== Driver ===== */

var tests = [
  parameterizeTest(test_rfc822_body_display_inline, messages),
  parameterizeTest(test_rfc822_body_no_display_inline, messages),
];

var gInbox;

function run_test() {
  gInbox = configure_message_injection({mode: "local"});
  async_run_tests(tests);
}
