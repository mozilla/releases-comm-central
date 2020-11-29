/*
 * Simple tests for copying local messages to a folder whose db is missing
 * or invalid
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

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var gMsg1;
var gMsgId1;

var gTestFolder, gTestFolder2;

function* setup_globals(aNextFunc) {
  var messageGenerator = new MessageGenerator();
  gMsg1 = messageGenerator.makeMessage();
  let msg2 = messageGenerator.makeMessage({ inReplyTo: gMsg1 });

  let messages = [];
  messages = messages.concat([gMsg1, msg2]);
  let msgSet = new SyntheticMessageSet(messages);

  gTestFolder = make_empty_folder();
  gTestFolder2 = make_empty_folder();
  yield add_sets_to_folders(gTestFolder, [msgSet]);
  let msg3 = messageGenerator.makeMessage();
  messages = [msg3];
  msgSet = new SyntheticMessageSet(messages);
  yield add_sets_to_folders(gTestFolder2, [msgSet]);
}

function run_test() {
  configure_message_injection({ mode: "local" });
  do_test_pending();
  async_run({ func: actually_run_test });
}

function* actually_run_test() {
  yield async_run({ func: setup_globals });
  gTestFolder2.msgDatabase.summaryValid = false;
  gTestFolder2.msgDatabase = null;
  gTestFolder2.ForceDBClosed();
  let dbPath = gTestFolder2.filePath;
  dbPath.leafName = dbPath.leafName + ".msf";
  dbPath.remove(false);
  gTestFolder2.msgDatabase = null;

  let msgHdr = mailTestUtils.firstMsgHdr(gTestFolder);
  gMsgId1 = msgHdr.messageId;
  MailServices.copy.CopyMessages(
    gTestFolder,
    [msgHdr],
    gTestFolder2,
    true,
    asyncCopyListener,
    null,
    false
  );
  yield false;
  try {
    gTestFolder2.getDatabaseWithReparse(asyncUrlListener, null);
  } catch (ex) {
    Assert.ok(ex.result == Cr.NS_ERROR_NOT_INITIALIZED);
  }
  yield false;
  let msgRestored = gTestFolder2.msgDatabase.getMsgHdrForMessageID(gMsgId1);
  let msg = mailTestUtils.loadMessageToString(gTestFolder2, msgRestored);
  Assert.equal(msg, gMsg1.toMboxString());
  do_test_finished();
}
