/**
 * The intent of this file is to test that pop3 download code message storage
 * works correctly.
 */

/* import-globals-from ../../../test/resources/POP3pump.js */
load("../../../resources/POP3pump.js");

var testSubjects = [
  "[Bug 397009] A filter will let me tag, but not untag",
  "Hello, did you receive my bugmail?",
  "[Bug 655578] list-id filter broken",
];

var gMsgHdrs = [];
var gHdrIndex = 0;
var gFiles = [
  "../../../data/bugmail1",
  "../../../data/draft1",
  "../../../data/bugmail19",
];

// This combination of prefs is required to reproduce bug 713611, which
// is what this test is about.
Services.prefs.setBoolPref("mailnews.downloadToTempFile", false);
Services.prefs.setBoolPref("mail.server.default.leave_on_server", true);

function run_test() {
  // add 3 messages
  gPOP3Pump.files = gFiles;
  gPOP3Pump.onDone = continueTest;
  do_test_pending();
  gPOP3Pump.run();
}

function continueTest() {
  // get message headers for the inbox folder
  var msgCount = 0;
  for (const hdr of localAccountUtils.inboxFolder.msgDatabase.enumerateMessages()) {
    gMsgHdrs.push(hdr);
    Assert.equal(hdr.subject, testSubjects[msgCount++]);
  }
  Assert.equal(msgCount, 3);
  gPOP3Pump = null;
  streamNextMessage();
}

function streamNextMessage() {
  const msghdr = gMsgHdrs[gHdrIndex];
  const msgURI = msghdr.folder.getUriForMsg(msghdr);
  const msgServ = MailServices.messageServiceFromURI(msgURI);
  msgServ.streamMessage(msgURI, gStreamListener, null, null, false, "", true);
}

var gStreamListener = {
  QueryInterface: ChromeUtils.generateQI(["nsIStreamListener"]),
  _stream: null,
  _data: null,
  onStartRequest(aRequest) {
    this._stream = null;
    this._data = "";
  },
  onStopRequest(aRequest, aStatusCode) {
    // check that the streamed message starts with "From "
    Assert.ok(this._data.startsWith("From "));
    if (++gHdrIndex == gFiles.length) {
      do_test_finished();
    } else {
      streamNextMessage();
    }
  },
  onDataAvailable(aRequest, aInputStream, aOff, aCount) {
    if (this._stream == null) {
      this._stream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
        Ci.nsIScriptableInputStream
      );
      this._stream.init(aInputStream);
    }
    this._data += this._stream.read(aCount);
  },
};
