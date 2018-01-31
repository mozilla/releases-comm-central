/*
 * Test bug 676916 - nsParseMailbox parses multi-line message-id header incorrectly
 */


ChromeUtils.import("resource:///modules/mailServices.js");
ChromeUtils.import("resource://testing-common/mailnews/localAccountUtils.js");

var gMessenger = Cc["@mozilla.org/messenger;1"].
                   createInstance(Ci.nsIMessenger);

var headers =
  "from: alice@t1.example.com\r\n" +
  "to: bob@t2.example.net\r\n" +
  "message-id:   \r\n   <abcmessageid>\r\n";

function testMsgID()
{
  let localFolder = localAccountUtils.inboxFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  localAccountUtils.inboxFolder.addMessage("From \r\n"+ headers + "\r\nhello\r\n");
  let msgHdr = localAccountUtils.inboxFolder.firstNewMessage;
  Assert.equal(msgHdr.messageId, "abcmessageid");
}

function run_test()
{
  for (let storeID of localAccountUtils.pluggableStores) {
    localAccountUtils.loadLocalMailAccount(storeID);
    testMsgID();
  }
}
