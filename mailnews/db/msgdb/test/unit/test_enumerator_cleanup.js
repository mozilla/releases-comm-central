/*
 * Test nsMsgDatabase's cleanup of nsMsgDBEnumerators
 */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var anyOldMessage = do_get_file("../../../../data/bugmail1");

/**
 * Test closing a db with an outstanding enumerator.
 */
function test_enumerator_cleanup() {
  let db = localAccountUtils.inboxFolder.msgDatabase;
  const enumerator = db.enumerateMessages();
  Cc["@mozilla.org/msgDatabase/msgDBService;1"]
    .getService(Ci.nsIMsgDBService)
    .forceFolderDBClosed(localAccountUtils.inboxFolder);
  localAccountUtils.inboxFolder.msgDatabase = null;
  db = null;
  gc();
  [...enumerator];
  do_test_finished();
}

/*
 * This infrastructure down here exists just to get
 *  test_references_header_parsing its message header.
 */

function run_test() {
  localAccountUtils.loadLocalMailAccount();
  do_test_pending();
  MailServices.copy.copyFileMessage(
    anyOldMessage,
    localAccountUtils.inboxFolder,
    null,
    false,
    0,
    "",
    messageHeaderGetterListener,
    null
  );
  return true;
}

var messageHeaderGetterListener = {
  OnStartCopy() {},
  OnProgress() {},
  GetMessageId() {},
  SetMessageKey() {},
  OnStopCopy() {
    do_timeout(0, test_enumerator_cleanup);
  },
};
