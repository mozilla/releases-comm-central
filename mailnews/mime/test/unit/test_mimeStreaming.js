/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This test iterates over the test files in gTestFiles, and streams
 * each as a message and makes sure the streaming doesn't assert or crash.
 */
const { localAccountUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/LocalAccountUtils.jsm"
);

var gTestFiles = ["../../../data/bug505221", "../../../data/bug513543"];

var gMessages;

var gMessenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);

var gUrlListener = {
  OnStartRunningUrl(aUrl) {},
  OnStopRunningUrl(aUrl, aExitCode) {
    do_test_finished();
  },
};

localAccountUtils.loadLocalMailAccount();

add_task(async function run_the_test() {
  do_test_pending();
  localAccountUtils.inboxFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  for (const fileName of gTestFiles) {
    localAccountUtils.inboxFolder.addMessage(
      await IOUtils.readUTF8(do_get_file(fileName).path)
    );
  }
  gMessages = [
    ...localAccountUtils.inboxFolder.msgDatabase.enumerateMessages(),
  ];
  doNextTest();
});

function streamMsg(msgHdr) {
  const msgURI = localAccountUtils.inboxFolder.getUriForMsg(msgHdr);
  const msgService = MailServices.messageServiceFromURI(msgURI);
  msgService.streamMessage(
    msgURI,
    gStreamListener,
    null,
    gUrlListener,
    true, // have them create the converter
    // additional uri payload, note that "header=" is prepended automatically
    "filter",
    true
  );
}

var gStreamListener = {
  QueryInterface: ChromeUtils.generateQI(["nsIStreamListener"]),
  _stream: null,
  // nsIRequestObserver part
  onStartRequest(aRequest) {},
  onStopRequest(aRequest, aStatusCode) {
    doNextTest();
  },

  /* okay, our onDataAvailable should actually never be called.  the stream
     converter is actually eating everything except the start and stop
     notification. */
  // nsIStreamListener part
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

function doNextTest() {
  if (gMessages.length > 0) {
    const msgHdr = gMessages.shift();
    streamMsg(msgHdr);
  } else {
    do_test_finished();
  }
}
