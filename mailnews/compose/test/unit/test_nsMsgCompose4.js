/**
 * Tests nsMsgCompose determineHTMLAction.
 */

var MsgComposeContractID = "@mozilla.org/messengercompose/compose;1";
var MsgComposeParamsContractID = "@mozilla.org/messengercompose/composeparams;1";
var MsgComposeFieldsContractID = "@mozilla.org/messengercompose/composefields;1";
var nsIMsgCompose = Components.interfaces.nsIMsgCompose;
var nsIMsgComposeParams = Components.interfaces.nsIMsgComposeParams;
var nsIMsgCompConvertible = Components.interfaces.nsIMsgCompConvertible;
var nsIMsgCompFields = Components.interfaces.nsIMsgCompFields;
var SendFormat = Components.interfaces.nsIMsgCompSendFormat;

Components.utils.import("resource://gre/modules/Services.jsm");

/**
 * Helper to check population worked as expected.
 * @param aTo          text in the To field
 * @param aNewsgroups  text for the Newsgroups field
 * @param aSendFormat  |nsIMsgCompSendFormat| format to send
 * @param aConvertible |nsIMsgCompConvertible| parameter to check (defaults to
 *                     nsIMsgCompConvertible.No if undefined)
 */
function checkPopulate(aTo, aNewsgroups, aSendFormat,
                       aConvertible=nsIMsgCompConvertible.No)
{
  var msgCompose = Components.classes[MsgComposeContractID]
                             .createInstance(nsIMsgCompose);

  // Set up some basic fields for compose.
  var fields = Components.classes[MsgComposeFieldsContractID]
                         .createInstance(nsIMsgCompFields);

  fields.to = aTo;
  fields.newsgroups = aNewsgroups;

  // Set up some params
  var params = Components.classes[MsgComposeParamsContractID]
                         .createInstance(nsIMsgComposeParams);

  params.composeFields = fields;

  msgCompose.initialize(params);

  msgCompose.expandMailingLists();
  do_check_eq(msgCompose.determineHTMLAction(aConvertible), aSendFormat);
}

function run_test() {
  // Test setup - copy the data files into place
  var testAB = do_get_file("../../../data/abLists1.mab");

  // Copy the file to the profile directory for a PAB
  testAB.copyTo(do_get_profile(), kPABData.fileName);

  testAB = do_get_file("../../../data/abLists2.mab");

  // Copy the file to the profile directory for a CAB
  testAB.copyTo(do_get_profile(), kCABData.fileName);

  // Test - Check we can initalize with fewest specified
  // parameters and don't fail/crash like we did in bug 411646.

  var msgCompose = Components.classes[MsgComposeContractID]
                             .createInstance(nsIMsgCompose);

  // Set up some params
  var params = Components.classes[MsgComposeParamsContractID]
                         .createInstance(nsIMsgComposeParams);

  msgCompose.initialize(params);

  // Test - determineHTMLAction basic functionality.

  // Re-initialize
  msgCompose = Components.classes[MsgComposeContractID]
                         .createInstance(nsIMsgCompose);

  // Set up some basic fields for compose.
  var fields = Components.classes[MsgComposeFieldsContractID]
                         .createInstance(nsIMsgCompFields);

  // These aren't in the address book copied above.
  fields.from = "test1@foo1.invalid";
  fields.to = "test2@foo1.invalid";
  fields.cc = "test3@foo1.invalid";
  fields.bcc = "test4@foo1.invalid";

  // Set up some params
  params = Components.classes[MsgComposeParamsContractID]
                     .createInstance(nsIMsgComposeParams);

  params.composeFields = fields;

  msgCompose.initialize(params);

  var nonHTMLRecipients = new Object();

  Services.prefs.setIntPref("mail.default_html_action", SendFormat.AskUser);
  do_check_eq(msgCompose.determineHTMLAction(nsIMsgCompConvertible.No),
              SendFormat.AskUser);

  do_check_eq(fields.to, "test2@foo1.invalid");
  do_check_eq(fields.cc, "test3@foo1.invalid");
  do_check_eq(fields.bcc, "test4@foo1.invalid");

  // Test - determineHTMLAction with plain text.

  checkPopulate("test4@foo.invalid", "", SendFormat.PlainText);

  // Test - determineHTMLAction with html.

  checkPopulate("test5@foo.invalid", "", SendFormat.HTML);

  // Test - determineHTMLAction with a list of three items.

  checkPopulate("TestList1 <TestList1>", "", SendFormat.AskUser);
  checkPopulate("TestList1 <TestList1>", "", SendFormat.PlainText,
    nsIMsgCompConvertible.Plain);

  // Test - determineHTMLAction with a list of one item.

  checkPopulate("TestList2 <TestList2>", "", SendFormat.PlainText);

  checkPopulate("TestList3 <TestList3>", "", SendFormat.HTML);

  // Test determineHTMLAction w/ mailnews.html_domains set.
  Services.prefs.setCharPref("mailnews.html_domains", "foo.invalid,bar.invalid");
  checkPopulate("htmlformat@foo.invalid,unknownformat@nonfoo.invalid", "",
                SendFormat.AskUser);
  Services.prefs.clearUserPref("mailnews.html_domains");

  // Test determineHTMLAction w/ mailnews.plaintext_domains set.
  Services.prefs.setCharPref("mailnews.plaintext_domains", "foo.invalid,bar.invalid");
  checkPopulate("plainformat@foo.invalid,unknownformat@nonfoo.invalid", "",
                SendFormat.AskUser);
  checkPopulate("plainformat@foo.invalid,plainformat@cc.bar.invalid", "",
                SendFormat.PlainText);
  Services.prefs.clearUserPref("mailnews.plaintext_domains");

  // Test - determineHTMLAction with items from multiple address books.

  checkPopulate("TestList1 <TestList1>, test3@com.invalid", "",
                SendFormat.AskUser);

  checkPopulate("TestList2 <TestList2>, ListTest2 <ListTest2>", "",
                SendFormat.PlainText);

  checkPopulate("TestList3 <TestList3>, ListTest1 <ListTest1>", "",
                SendFormat.AskUser);
                
  // test bug 254519 rfc 2047 encoding
  checkPopulate("=?iso-8859-1?Q?Sure=F6name=2C_Forename__Dr=2E?= <pb@bieringer.invalid>", "",
                SendFormat.AskUser);

  // Try some fields with newsgroups
  checkPopulate("test4@foo.invalid", "mozilla.test", SendFormat.AskUser);
  checkPopulate("test5@foo.invalid", "mozilla.test", SendFormat.AskUser);
  checkPopulate("", "mozilla.test", SendFormat.AskUser);
};
