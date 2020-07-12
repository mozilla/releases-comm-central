/**
 * This test checks if the imap message service code streams headers correctly.
 * It checks that streaming headers for messages stored for offline use works.
 * It doesn't test streaming messages that haven't been stored for offline use
 * because that's not implemented yet, and it's unclear if anyone will want it.
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

// IMAP pump

setupIMAPPump();

var gMsgFile1 = do_get_file("../../../data/bugmail10");
var gMsgId1 = "200806061706.m56H6RWT004933@mrapp54.mozilla.org";

// We use this as a display consumer
var streamListener = {
  _data: "",
  _stream: null,

  QueryInterface: ChromeUtils.generateQI([
    "nsIStreamListener",
    "nsIRequestObserver",
  ]),

  // nsIRequestObserver
  onStartRequest(aRequest) {},
  onStopRequest(aRequest, aStatusCode) {
    Assert.equal(aStatusCode, 0);
    Assert.ok(this._data.includes("Content-Type"));
    async_driver();
  },

  // nsIStreamListener
  onDataAvailable(aRequest, aInputStream, aOffset, aCount) {
    if (this._stream == null) {
      this._stream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
        Ci.nsIScriptableInputStream
      );
      this._stream.init(aInputStream);
    }
    this._data += this._stream.read(aCount);
  },
};

// Adds some messages directly to a mailbox (eg new mail)
function addMessagesToServer(messages, mailbox) {
  // For every message we have, we need to convert it to a file:/// URI
  messages.forEach(function(message) {
    let URI = Services.io
      .newFileURI(message.file)
      .QueryInterface(Ci.nsIFileURL);
    // Create the imapMessage and store it on the mailbox.
    mailbox.addMessage(new imapMessage(URI.spec, mailbox.uidnext++, []));
  });
}

function run_test() {
  // Add a couple of messages to the INBOX
  // this is synchronous, afaik
  addMessagesToServer(
    [{ file: gMsgFile1, messageId: gMsgId1 }],
    IMAPPump.daemon.getMailbox("INBOX")
  );
  Services.prefs.setBoolPref(
    "mail.server.server1.autosync_offline_stores",
    false
  );
  async_run_tests(tests);
}

var tests = [
  test_updateFolder,
  test_downloadForOffline,
  test_streamHeaders,
  endTest,
];

function* test_updateFolder() {
  IMAPPump.inbox.updateFolderWithListener(null, asyncUrlListener);
  yield false;
}

function* test_downloadForOffline() {
  IMAPPump.inbox.downloadAllForOffline(asyncUrlListener, null);
  yield false;
}

function* test_streamHeaders() {
  let newMsgHdr = IMAPPump.inbox.GetMessageHeader(1);
  let msgURI = newMsgHdr.folder.getUriForMsg(newMsgHdr);
  let messenger = Cc["@mozilla.org/messenger;1"].createInstance(
    Ci.nsIMessenger
  );
  let msgServ = messenger.messageServiceFromURI(msgURI);
  msgServ.streamHeaders(msgURI, streamListener, asyncUrlListener, true);
  yield false;
}

function endTest() {
  teardownIMAPPump();
}
