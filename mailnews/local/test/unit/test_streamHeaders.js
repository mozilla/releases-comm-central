/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This mainly tests that streamHeaders does not result in the crash
 * of bug 752768
 *
 * adapted from test_pop3Pump.js by Kent James <kent@caspia.com>
 */

// async support
/* import-globals-from ../../../test/resources/logHelper.js */
/* import-globals-from ../../../test/resources/asyncTestUtils.js */
/* import-globals-from ../../../test/resources/alertTestUtils.js */
/* import-globals-from ../../../test/resources/POP3pump.js */
load("../../../resources/logHelper.js");
load("../../../resources/asyncTestUtils.js");
load("../../../resources/alertTestUtils.js");

load("../../../resources/POP3pump.js");

var testSubjects = ["Hello, did you receive my bugmail?"];
var tests = [loadMessages, goodStreaming, badStreaming];

function run_test() {
  async_run_tests(tests);
}

var gHdr;
function* loadMessages() {
  gPOP3Pump.files = ["../../../data/draft1"];
  gPOP3Pump.onDone = async_driver;
  gPOP3Pump.run();
  yield false;

  // get message headers for the inbox folder
  var msgCount = 0;
  for (gHdr of localAccountUtils.inboxFolder.msgDatabase.EnumerateMessages()) {
    msgCount++;
    Assert.equal(gHdr.subject, testSubjects[msgCount - 1]);
  }
  Assert.equal(msgCount, 1);
  gPOP3Pump = null;
}

function* goodStreaming() {
  // try to stream the headers of the last message
  let uri = gHdr.folder.getUriForMsg(gHdr);
  let messageService = Cc["@mozilla.org/messenger;1"]
    .createInstance(Ci.nsIMessenger)
    .messageServiceFromURI(uri);
  messageService.streamHeaders(
    uri,
    createStreamListener(function theString(k) {
      dump("the string:\n" + k + "\n");
      // The message contains this header
      Assert.ok(
        k.includes(
          "X-Mozilla-Draft-Info: internal/draft; vcard=0; receipt=0; DSN=0; uuencode=0"
        )
      );
      async_driver();
    }),
    null,
    true
  );
  yield false;
}

// crash from bug 752768
function badStreaming() {
  // try to stream the headers of the last message
  let folder = gHdr.folder;
  let uri = folder.getUriForMsg(gHdr);

  let dbFile = folder.summaryFile;
  // force invalid database
  folder.msgDatabase.ForceClosed();
  dbFile.remove(false);
  folder.msgDatabase = null;

  let messageService = Cc["@mozilla.org/messenger;1"]
    .createInstance(Ci.nsIMessenger)
    .messageServiceFromURI(uri);
  let haveError = false;
  try {
    messageService.streamHeaders(
      uri,
      createStreamListener(function theString(k) {}),
      null,
      true
    );
  } catch (e) {
    haveError = true;
  }
  Assert.ok(haveError);
}

// This function is adapted from the Conversations addon, which
//  seems to be one of the drivers for the creation of streamHeaders
/**
 * Creates a stream listener that will call k once done, passing it the string
 * that has been read.
 */
function createStreamListener(k) {
  return {
    _data: "",
    _stream: null,

    QueryInterface: ChromeUtils.generateQI([
      "nsIStreamListener",
      "nsIRequestObserver",
    ]),

    // nsIRequestObserver
    onStartRequest(aRequest) {},
    onStopRequest(aRequest, aStatusCode) {
      k(this._data);
    },

    // nsIStreamListener
    onDataAvailable(aRequest, aInputStream, aOffset, aCount) {
      if (this._stream == null) {
        this._stream = Cc[
          "@mozilla.org/scriptableinputstream;1"
        ].createInstance(Ci.nsIScriptableInputStream);
        this._stream.init(aInputStream);
      }
      this._data += this._stream.read(aCount);
    },
  };
}
