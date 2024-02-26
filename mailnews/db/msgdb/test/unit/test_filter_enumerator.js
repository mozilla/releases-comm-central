var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

var gMessages = [];

const kSetCount = 13;
const kNumExpectedMatches = 10;

function setupGlobals() {
  localAccountUtils.loadLocalMailAccount();
  // Create a message generator
  const messageGenerator = new MessageGenerator();
  const localInbox = localAccountUtils.inboxFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );

  for (let i = 0; i < kSetCount; i++) {
    const message = messageGenerator.makeMessage();
    gMessages.push(message);
    localInbox.addMessage(message.toMessageString());
  }
}

function run_test() {
  setupGlobals();
  do_test_pending();
  const inboxDB = localAccountUtils.inboxFolder.msgDatabase;

  // give messages 1,3,5 gloda-ids. These won't end up in our search hits.
  const msgHdr1 = inboxDB.getMsgHdrForMessageID(gMessages[0].messageId);
  msgHdr1.setUint32Property("gloda-id", 11111);
  const msgHdr3 = inboxDB.getMsgHdrForMessageID(gMessages[2].messageId);
  msgHdr3.setUint32Property("gloda-id", 33333);
  const msgHdr5 = inboxDB.getMsgHdrForMessageID(gMessages[4].messageId);
  msgHdr5.setUint32Property("gloda-id", 5555);
  // set up a search term array that will give us the array of messages
  // that gloda should index, as defined by this function:
  const searchSession = Cc[
    "@mozilla.org/messenger/searchSession;1"
  ].createInstance(Ci.nsIMsgSearchSession);
  const searchTerms = [];

  searchSession.addScopeTerm(
    Ci.nsMsgSearchScope.offlineMail,
    localAccountUtils.inboxFolder
  );
  let searchTerm = searchSession.createTerm();

  // Create the following search term:
  // (folderFlag & Mail && folderFlag != ImapBox) &&
  //    msg property.gloda-id isEmpty

  searchTerm.beginsGrouping = true;
  searchTerm.booleanAnd = true;
  searchTerm.attrib = Ci.nsMsgSearchAttrib.FolderFlag;
  searchTerm.op = Ci.nsMsgSearchOp.Is;
  let value = searchTerm.value;
  value.status = Ci.nsMsgFolderFlags.Mail;
  value.attrib = Ci.nsMsgSearchAttrib.FolderFlag;
  searchTerm.value = value;
  searchTerms.push(searchTerm);

  searchTerm = searchSession.createTerm();
  searchTerm.booleanAnd = true;
  searchTerm.attrib = Ci.nsMsgSearchAttrib.FolderFlag;
  searchTerm.op = Ci.nsMsgSearchOp.Isnt;
  value = searchTerm.value;
  value.status = Ci.nsMsgFolderFlags.ImapBox;
  value.attrib = Ci.nsMsgSearchAttrib.FolderFlag;
  searchTerm.value = value;
  searchTerm.endsGrouping = true;
  searchTerms.push(searchTerm);

  searchTerm = searchSession.createTerm();
  searchTerm.booleanAnd = true;
  searchTerm.attrib = Ci.nsMsgSearchAttrib.HdrProperty;
  searchTerm.hdrProperty = "gloda-id";
  searchTerm.op = Ci.nsMsgSearchOp.IsEmpty;
  value = searchTerm.value;
  value.str = "gloda-id";
  value.attrib = Ci.nsMsgSearchAttrib.HdrProperty;
  searchTerm.value = value;
  searchTerms.push(searchTerm);

  let msgEnumerator = inboxDB.getFilterEnumerator(searchTerms);
  let matchingHdrs = [...msgEnumerator];
  Assert.equal(kNumExpectedMatches, matchingHdrs.length);
  Assert.equal(matchingHdrs[0].messageId, gMessages[1].messageId);
  Assert.equal(matchingHdrs[1].messageId, gMessages[3].messageId);

  // try it backwards, with roller skates:
  msgEnumerator = inboxDB.getFilterEnumerator(searchTerms, true);
  matchingHdrs = [...msgEnumerator];
  Assert.equal(kNumExpectedMatches, matchingHdrs.length);
  Assert.equal(matchingHdrs[0].messageId, gMessages[12].messageId);
  Assert.equal(matchingHdrs[1].messageId, gMessages[11].messageId);
  Assert.equal(matchingHdrs[9].messageId, gMessages[1].messageId);

  do_test_finished();
}
