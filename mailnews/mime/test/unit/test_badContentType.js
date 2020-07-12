/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This test checks handling of bad content type of the
 * type reported in bug 659355.
 * Adapted from test_attachment_size.js
 */
/* import-globals-from ../../../test/resources/logHelper.js */
/* import-globals-from ../../../test/resources/asyncTestUtils.js */
load("../../../resources/logHelper.js");
load("../../../resources/asyncTestUtils.js");

/* import-globals-from ../../../test/resources/MessageGenerator.jsm */
/* import-globals-from ../../../test/resources/messageModifier.js */
/* import-globals-from ../../../test/resources/messageInjection.js */
load("../../../resources/MessageGenerator.jsm");
load("../../../resources/messageModifier.js");
load("../../../resources/messageInjection.js");

var gMessenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);

// Create a message generator
var gMessageGenerator = new MessageGenerator();

var imageAttachment =
  "iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAYAAABWdVznAAAABHNCSVQICAgIfAhkiAAAAAlwS" +
  "FlzAAAN1wAADdcBQiibeAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAA" +
  "A5SURBVCiRY/z//z8DKYCJJNXkaGBgYGD4D8NQ5zUgiTVAxeBqSLaBkVRPM0KtIhrQ3km0jwe" +
  "SNQAAlmAY+71EgFoAAAAASUVORK5CYII=";

// create some messages that have various types of attachments
var messages = [
  // image attachment (normal content type sanity test)
  {
    attachments: [
      {
        body: imageAttachment,
        contentType: "image/png",
        filename: "lines.png",
        encoding: "base64",
        format: "",
      },
    ],
    testContentType: "image/png",
  },
  {
    attachments: [
      {
        body: imageAttachment,
        contentType: "=?windows-1252?q?application/pdf",
        filename: "lines.pdf",
        encoding: "base64",
        format: "",
      },
    ],
    testContentType: "application/pdf",
  },
];

var gStreamListener = {
  QueryInterface: ChromeUtils.generateQI(["nsIStreamListener"]),

  // nsIRequestObserver part
  onStartRequest(aRequest) {
    // We reset the size here because we know that we only expect one attachment
    //  per test email
    // msgHdrViewOverlay.js has a stack of attachment infos that properly
    //  handles this.
    gMessageHeaderSink.size = null;
  },
  onStopRequest(aRequest, aStatusCode) {
    dump(
      "*** ContentType is " +
        gMessageHeaderSink.contentType +
        " (expecting " +
        this.expectedContentType +
        ")\n\n"
    );
    Assert.equal(gMessageHeaderSink.contentType, this.expectedContentType);
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
  handleAttachment(
    aContentType,
    aUrl,
    aDisplayName,
    aUri,
    aIsExternalAttachment
  ) {
    gMessageHeaderSink.contentType = aContentType;
  },

  // stub functions from nsIMsgHeaderSink
  addAttachmentField(aName, aValue) {},
  onStartHeaders() {},
  onEndHeaders() {},
  processHeaders(aHeaderNames, aHeaderValues, dontCollectAddrs) {},
  onEndAllAttachments() {},
  onEndMsgDownload() {},
  onEndMsgHeaders(aUrl) {},
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

  gStreamListener.expectedContentType = info.testContentType;

  dump("*** original ContentType=" + info.attachments[0].contentType + "\n");
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
