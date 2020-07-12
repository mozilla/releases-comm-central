/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This test creates some messages with attachments of different types and
 * checks that libmime emits (or doesn't emit) the attachments as appropriate.
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

// create some messages that have various types of attachments
var messages = [
  {},

  /* Attachments with Content-Disposition: attachment */

  {
    // inline-able attachment with a name
    attachments: [
      {
        body: "attachment",
        filename: "ubik.txt",
        disposition: "attachment",
        format: "",
        shouldShow: true,
      },
    ],
  },
  {
    // inline-able attachment with no name
    attachments: [
      {
        body: "attachment",
        filename: "",
        disposition: "attachment",
        format: "",
        shouldShow: true,
      },
    ],
  },
  {
    // non-inline-able attachment with a name
    attachments: [
      {
        body: "attachment",
        filename: "ubik.ubk",
        disposition: "attachment",
        contentType: "application/x-ubik",
        format: "",
        shouldShow: true,
      },
    ],
  },
  {
    // non-inline-able attachment with no name
    attachments: [
      {
        body: "attachment",
        filename: "",
        disposition: "attachment",
        contentType: "application/x-ubik",
        format: "",
        shouldShow: true,
      },
    ],
  },

  /* Attachments with Content-Disposition: inline */

  {
    // inline-able attachment with a name
    attachments: [
      {
        body: "attachment",
        filename: "ubik.txt",
        disposition: "inline",
        format: "",
        shouldShow: true,
      },
    ],
  },
  {
    // inline-able attachment with no name
    attachments: [
      {
        body: "attachment",
        filename: "",
        disposition: "inline",
        format: "",
        shouldShow: false,
      },
    ],
  },
  {
    // non-inline-able attachment with a name
    attachments: [
      {
        body: "attachment",
        filename: "ubik.ubk",
        disposition: "inline",
        contentType: "application/x-ubik",
        format: "",
        shouldShow: true,
      },
    ],
  },
  {
    // non-inline-able attachment with no name
    attachments: [
      {
        body: "attachment",
        filename: "",
        disposition: "inline",
        contentType: "application/x-ubik",
        format: "",
        shouldShow: true,
      },
    ],
  },
];

var gStreamListener = {
  QueryInterface: ChromeUtils.generateQI(["nsIStreamListener"]),

  // nsIRequestObserver part
  onStartRequest(aRequest) {},
  onStopRequest(aRequest, aStatusCode) {
    let expectedAttachments = this.allAttachments
      .filter(i => i.shouldShow)
      .map(i => i.filename);
    Assert.equal(
      expectedAttachments.length,
      gMessageHeaderSink.attachments.length
    );

    for (let i = 0; i < gMessageHeaderSink.attachments.length; i++) {
      // If the expected attachment's name is empty, we probably generated a
      // name like "Part 1.2", so don't bother checking that the names match
      // (they won't).
      if (expectedAttachments[i]) {
        Assert.equal(expectedAttachments[i], gMessageHeaderSink.attachments[i]);
      }
    }
    this._stream = null;

    async_driver();
  },

  // nsIStreamListener part
  _stream: null,

  onDataAvailable(aRequest, aInputStream, aOffset, aCount) {
    if (this._stream === null) {
      this._stream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
        Ci.nsIScriptableInputStream
      );
      this._stream.init(aInputStream);
    }
    this._stream.read(aCount);
  },
};

var gMessageHeaderSink = {
  onEndMsgHeaders(aUrl) {
    this.attachments = [];
  },
  handleAttachment(
    aContentType,
    aUrl,
    aDisplayName,
    aUri,
    aIsExternalAttachment
  ) {
    this.attachments.push(aDisplayName);
  },

  // stub functions from nsIMsgHeaderSink
  onStartHeaders() {},
  onEndHeaders() {},
  processHeaders(aHeaderNames, aHeaderValues, dontCollectAddrs) {},
  addAttachmentField(aName, aValue) {},
  onEndAllAttachments() {},
  onEndMsgDownload() {},
  onMsgHasRemoteContent(aMsgHdr, aContentURI) {},
  securityInfo: null,
  mDummyMsgHeader: null,
  properties: null,
  resetProperties() {},
};

var msgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
  Ci.nsIMsgWindow
);
msgWindow.msgHeaderSink = gMessageHeaderSink;

function* test_message_attachments(info) {
  let synMsg = gMessageGenerator.makeMessage(info);
  let synSet = new SyntheticMessageSet([synMsg]);
  yield add_sets_to_folder(gInbox, [synSet]);

  let msgURI = synSet.getMsgURI(0);
  let msgService = gMessenger.messageServiceFromURI(msgURI);

  gStreamListener.allAttachments = info.attachments || [];
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

/* ===== Driver ===== */

var tests = [parameterizeTest(test_message_attachments, messages)];

var gInbox;

function run_test() {
  // use mbox injection because the fake server chokes sometimes right now
  gInbox = configure_message_injection({ mode: "local" });
  async_run_tests(tests);
}
