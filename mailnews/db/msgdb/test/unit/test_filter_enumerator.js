/* import-globals-from ../../../../test/resources/messageGenerator.js */
load("../../../../resources/messageGenerator.js");

var gMessages = [];

const kSetCount = 13;
const kNumExpectedMatches = 10;

function setupGlobals() {
  localAccountUtils.loadLocalMailAccount();
  // Create a message generator
  let messageGenerator = new MessageGenerator();
  let localInbox = localAccountUtils.inboxFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );

  for (let i = 0; i < kSetCount; i++) {
    let message = messageGenerator.makeMessage();
    gMessages.push(message);
    localInbox.addMessage(message.toMboxString());
  }
}

function run_test() {
  setupGlobals();
  do_test_pending();
  let inboxDB = localAccountUtils.inboxFolder.msgDatabase;

  // give messages 1,3,5 gloda-ids. These won't end up in our search hits.
  let msgHdr1 = inboxDB.getMsgHdrForMessageID(gMessages[0].messageId);
  msgHdr1.setUint32Property("gloda-id", 11111);
  let msgHdr3 = inboxDB.getMsgHdrForMessageID(gMessages[2].messageId);
  msgHdr3.setUint32Property("gloda-id", 33333);
  let msgHdr5 = inboxDB.getMsgHdrForMessageID(gMessages[4].messageId);
  msgHdr5.setUint32Property("gloda-id", 5555);
  // set up a search term array that will give us the array of messages
  // that gloda should index, as defined by this function:
  let searchSession = Cc[
    "@mozilla.org/messenger/searchSession;1"
  ].createInstance(Ci.nsIMsgSearchSession);
  let searchTerms = Cc["@mozilla.org/array;1"].createInstance(
    Ci.nsIMutableArray
  );

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
  searchTerms.appendElement(searchTerm);

  searchTerm = searchSession.createTerm();
  searchTerm.booleanAnd = true;
  searchTerm.attrib = Ci.nsMsgSearchAttrib.FolderFlag;
  searchTerm.op = Ci.nsMsgSearchOp.Isnt;
  value = searchTerm.value;
  value.status = Ci.nsMsgFolderFlags.ImapBox;
  value.attrib = Ci.nsMsgSearchAttrib.FolderFlag;
  searchTerm.value = value;
  searchTerm.endsGrouping = true;
  searchTerms.appendElement(searchTerm);

  searchTerm = searchSession.createTerm();
  searchTerm.booleanAnd = true;
  searchTerm.attrib = Ci.nsMsgSearchAttrib.HdrProperty;
  searchTerm.hdrProperty = "gloda-id";
  searchTerm.op = Ci.nsMsgSearchOp.IsEmpty;
  value = searchTerm.value;
  value.str = "gloda-id";
  value.attrib = Ci.nsMsgSearchAttrib.HdrProperty;
  searchTerm.value = value;
  searchTerms.appendElement(searchTerm);

  let filterEnumerator = inboxDB.getFilterEnumerator(searchTerms);
  let numMatches = {};
  let keepGoing = inboxDB.nextMatchingHdrs(
    filterEnumerator,
    100,
    100,
    null,
    numMatches
  );
  Assert.equal(kNumExpectedMatches, numMatches.value);
  Assert.ok(!keepGoing);
  filterEnumerator = inboxDB.getFilterEnumerator(searchTerms);
  let matchingHdrs = Cc["@mozilla.org/array;1"].createInstance(
    Ci.nsIMutableArray
  );
  do {
    keepGoing = inboxDB.nextMatchingHdrs(
      filterEnumerator,
      5,
      5,
      matchingHdrs,
      numMatches
    );
  } while (keepGoing);
  Assert.equal(kNumExpectedMatches, matchingHdrs.length);
  let firstMatch = matchingHdrs.queryElementAt(0, Ci.nsIMsgDBHdr);
  Assert.equal(firstMatch.messageId, gMessages[1].messageId);
  let secondMatch = matchingHdrs.queryElementAt(1, Ci.nsIMsgDBHdr);
  Assert.equal(secondMatch.messageId, gMessages[3].messageId);

  // try it backwards, with roller skates:
  filterEnumerator = inboxDB.getFilterEnumerator(searchTerms, true);
  matchingHdrs.clear();
  do {
    keepGoing = inboxDB.nextMatchingHdrs(
      filterEnumerator,
      5,
      5,
      matchingHdrs,
      numMatches
    );
  } while (keepGoing);
  Assert.equal(kNumExpectedMatches, matchingHdrs.length);
  firstMatch = matchingHdrs.queryElementAt(0, Ci.nsIMsgDBHdr);
  Assert.equal(firstMatch.messageId, gMessages[12].messageId);
  secondMatch = matchingHdrs.queryElementAt(1, Ci.nsIMsgDBHdr);
  Assert.equal(secondMatch.messageId, gMessages[11].messageId);
  let tenthMatch = matchingHdrs.queryElementAt(9, Ci.nsIMsgDBHdr);
  Assert.equal(tenthMatch.messageId, gMessages[1].messageId);

  do_test_finished();
}
