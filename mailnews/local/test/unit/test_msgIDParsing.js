/*
 * Test bug 676916 - nsParseMailbox parses multi-line message-id header incorrectly
 */

var headers =
  "from: alice@t1.example.com\r\n" +
  "to: bob@t2.example.net\r\n" +
  "message-id:   \r\n   <abcmessageid>\r\n";

function testMsgID() {
  localAccountUtils.inboxFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  localAccountUtils.inboxFolder.addMessage(
    "From \r\n" + headers + "\r\nhello\r\n"
  );
  const msgHdr = localAccountUtils.inboxFolder.firstNewMessage;
  Assert.equal(msgHdr.messageId, "abcmessageid");
}

function run_test() {
  for (const storeID of localAccountUtils.pluggableStores) {
    localAccountUtils.loadLocalMailAccount(storeID);
    testMsgID();
  }
}
