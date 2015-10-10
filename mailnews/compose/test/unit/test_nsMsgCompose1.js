/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */

/**
 * Tests nsMsgCompose expandMailingLists.
 */

var MsgComposeContractID = "@mozilla.org/messengercompose/compose;1";
var MsgComposeParamsContractID = "@mozilla.org/messengercompose/composeparams;1";
var MsgComposeFieldsContractID = "@mozilla.org/messengercompose/composefields;1";
var nsIMsgCompose = Components.interfaces.nsIMsgCompose;
var nsIMsgComposeParams = Components.interfaces.nsIMsgComposeParams;
var nsIMsgCompFields = Components.interfaces.nsIMsgCompFields;

Components.utils.import("resource://gre/modules/Services.jsm");

/**
 * Helper to check population worked as expected.
 * @param aTo - text in the To field
 * @param aCheckTo - the expected To addresses (after possible ist population)
 */
function checkPopulate(aTo, aCheckTo)
{
  var msgCompose = Components.classes[MsgComposeContractID]
                             .createInstance(nsIMsgCompose);

  // Set up some basic fields for compose.
  var fields = Components.classes[MsgComposeFieldsContractID]
                         .createInstance(nsIMsgCompFields);

  fields.to = aTo;

  // Set up some params
  var params = Components.classes[MsgComposeParamsContractID]
                         .createInstance(nsIMsgComposeParams);

  params.composeFields = fields;

  msgCompose.initialize(params);

  msgCompose.expandMailingLists();
  let addresses = fields.getHeader("To");
  let checkEmails = MailServices.headerParser.parseDecodedHeader(aCheckTo);
  do_check_eq(addresses.length, checkEmails.length);
  for (let i = 0; i < addresses.length; i++) {
    do_check_eq(addresses[i].name, checkEmails[i].name);
    do_check_eq(addresses[i].email, checkEmails[i].email);
  }
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

  // Test - expandMailingLists basic functionality.

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

  msgCompose.expandMailingLists();
  do_check_eq(fields.to, "test2@foo1.invalid");
  do_check_eq(fields.cc, "test3@foo1.invalid");
  do_check_eq(fields.bcc, "test4@foo1.invalid");

  // Test - expandMailingLists with plain text.

  checkPopulate("test4@foo.invalid", "test4@foo.invalid");

  // Test - expandMailingLists with html.

  checkPopulate("test5@foo.invalid", "test5@foo.invalid");

  // Test - expandMailingLists with a list of three items.

  checkPopulate("TestList1 <TestList1>",
                "test1@foo.invalid,test2@foo.invalid,test3@foo.invalid");

  // Test - expandMailingLists with a list of one item.

  checkPopulate("TestList2 <TestList2>", "test4@foo.invalid");

  checkPopulate("TestList3 <TestList3>", "test5@foo.invalid");

  // Test expandMailingLists w/ mailnews.html_domains set.
  Services.prefs.setCharPref("mailnews.html_domains", "foo.invalid,bar.invalid");
  checkPopulate("htmlformat@foo.invalid,unknownformat@nonfoo.invalid",
                "htmlformat@foo.invalid,unknownformat@nonfoo.invalid");
  Services.prefs.clearUserPref("mailnews.html_domains");

  // Test expandMailingLists w/ mailnews.plaintext_domains set.
  Services.prefs.setCharPref("mailnews.plaintext_domains", "foo.invalid,bar.invalid");
  checkPopulate("plainformat@foo.invalid,unknownformat@nonfoo.invalid",
                "plainformat@foo.invalid,unknownformat@nonfoo.invalid");
  checkPopulate("plainformat@foo.invalid,plainformat@cc.bar.invalid",
                "plainformat@foo.invalid,plainformat@cc.bar.invalid");
  Services.prefs.clearUserPref("mailnews.plaintext_domains");

  // Test - expandMailingLists with items from multiple address books.

  checkPopulate("TestList1 <TestList1>, test3@com.invalid",
                "test1@foo.invalid,test2@foo.invalid,test3@foo.invalid,test3@com.invalid");

  checkPopulate("TestList2 <TestList2>, ListTest2 <ListTest2>",
                "test4@foo.invalid,test4@com.invalid");

  checkPopulate("TestList3 <TestList3>, ListTest1 <ListTest1>",
                "test5@foo.invalid,test1@com.invalid,test2@com.invalid,test3@com.invalid");
                
  // test bug 254519 rfc 2047 encoding
  checkPopulate("=?iso-8859-1?Q?Sure=F6name=2C_Forename_Dr=2E?= <pb@bieringer.invalid>",
                "\"Sure\u00F6name, Forename Dr.\" <pb@bieringer.invalid>");
};
