/**
 * Tests nsMsgCompose determineHTMLAction.
 */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

/**
 * Helper to check population worked as expected.
 * @param aTo          text in the To field
 * @param aNewsgroups  text for the Newsgroups field
 * @param aSendFormat  |nsIMsgCompSendFormat| format to send
 * @param aConvertible |nsIMsgCompConvertible| parameter to check (defaults to
 *                     nsIMsgCompConvertible.No if undefined)
 */
function checkPopulate(
  aTo,
  aNewsgroups,
  aSendFormat,
  aConvertible = Ci.nsIMsgCompConvertible.No
) {
  var msgCompose = Cc["@mozilla.org/messengercompose/compose;1"].createInstance(
    Ci.nsIMsgCompose
  );

  // Set up some basic fields for compose.
  var fields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);

  fields.to = aTo;
  fields.newsgroups = aNewsgroups;

  // Set up some params
  var params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);

  params.composeFields = fields;

  msgCompose.initialize(params);

  msgCompose.expandMailingLists();
  Assert.equal(msgCompose.determineHTMLAction(aConvertible), aSendFormat);
}

function run_test() {
  loadABFile("../../../data/abLists1", kPABData.fileName);
  loadABFile("../../../data/abLists2", kCABData.fileName);

  // Test - Check we can initialize with fewest specified
  // parameters and don't fail/crash like we did in bug 411646.

  var msgCompose = Cc["@mozilla.org/messengercompose/compose;1"].createInstance(
    Ci.nsIMsgCompose
  );

  // Set up some params
  var params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);

  msgCompose.initialize(params);

  // Test - determineHTMLAction basic functionality.

  // Re-initialize
  msgCompose = Cc["@mozilla.org/messengercompose/compose;1"].createInstance(
    Ci.nsIMsgCompose
  );

  // Set up some basic fields for compose.
  var fields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);

  // These aren't in the address book copied above.
  fields.from = "test1@foo1.invalid";
  fields.to = "test2@foo1.invalid";
  fields.cc = "test3@foo1.invalid";
  fields.bcc = "test4@foo1.invalid";

  // Set up some params
  params = Cc["@mozilla.org/messengercompose/composeparams;1"].createInstance(
    Ci.nsIMsgComposeParams
  );

  params.composeFields = fields;

  msgCompose.initialize(params);

  Services.prefs.setIntPref(
    "mail.default_html_action",
    Ci.nsIMsgCompSendFormat.AskUser
  );
  Assert.equal(
    msgCompose.determineHTMLAction(Ci.nsIMsgCompConvertible.No),
    Ci.nsIMsgCompSendFormat.AskUser
  );

  Assert.equal(fields.to, "test2@foo1.invalid");
  Assert.equal(fields.cc, "test3@foo1.invalid");
  Assert.equal(fields.bcc, "test4@foo1.invalid");

  // Test - determineHTMLAction with plain text.

  checkPopulate("test4@foo.invalid", "", Ci.nsIMsgCompSendFormat.PlainText);

  // Test - determineHTMLAction with html.

  checkPopulate("test5@foo.invalid", "", Ci.nsIMsgCompSendFormat.HTML);

  // Test - determineHTMLAction with a list of three items.

  checkPopulate("TestList1 <TestList1>", "", Ci.nsIMsgCompSendFormat.AskUser);
  checkPopulate(
    "TestList1 <TestList1>",
    "",
    Ci.nsIMsgCompSendFormat.PlainText,
    Ci.nsIMsgCompConvertible.Plain
  );

  // Test - determineHTMLAction with a list of one item.

  checkPopulate("TestList2 <TestList2>", "", Ci.nsIMsgCompSendFormat.PlainText);

  checkPopulate("TestList3 <TestList3>", "", Ci.nsIMsgCompSendFormat.HTML);

  // Test determineHTMLAction w/ mailnews.html_domains set.
  Services.prefs.setCharPref(
    "mailnews.html_domains",
    "foo.invalid,bar.invalid"
  );
  checkPopulate(
    "htmlformat@foo.invalid,unknownformat@nonfoo.invalid",
    "",
    Ci.nsIMsgCompSendFormat.AskUser
  );
  Services.prefs.clearUserPref("mailnews.html_domains");

  // Test determineHTMLAction w/ mailnews.plaintext_domains set.
  Services.prefs.setCharPref(
    "mailnews.plaintext_domains",
    "foo.invalid,bar.invalid"
  );
  checkPopulate(
    "plainformat@foo.invalid,unknownformat@nonfoo.invalid",
    "",
    Ci.nsIMsgCompSendFormat.AskUser
  );
  checkPopulate(
    "plainformat@foo.invalid,plainformat@cc.bar.invalid",
    "",
    Ci.nsIMsgCompSendFormat.PlainText
  );
  Services.prefs.clearUserPref("mailnews.plaintext_domains");

  // Test - determineHTMLAction with items from multiple address books.

  checkPopulate(
    "TestList1 <TestList1>, test3@com.invalid",
    "",
    Ci.nsIMsgCompSendFormat.AskUser
  );

  checkPopulate(
    "TestList2 <TestList2>, ListTest2 <ListTest2>",
    "",
    Ci.nsIMsgCompSendFormat.PlainText
  );

  checkPopulate(
    "TestList3 <TestList3>, ListTest1 <ListTest1>",
    "",
    Ci.nsIMsgCompSendFormat.AskUser
  );

  // test bug 254519 rfc 2047 encoding
  checkPopulate(
    "=?iso-8859-1?Q?Sure=F6name=2C_Forename__Dr=2E?= <pb@bieringer.invalid>",
    "",
    Ci.nsIMsgCompSendFormat.AskUser
  );

  // Try some fields with newsgroups
  checkPopulate(
    "test4@foo.invalid",
    "mozilla.test",
    Ci.nsIMsgCompSendFormat.AskUser
  );
  checkPopulate(
    "test5@foo.invalid",
    "mozilla.test",
    Ci.nsIMsgCompSendFormat.AskUser
  );
  checkPopulate("", "mozilla.test", Ci.nsIMsgCompSendFormat.AskUser);
}
