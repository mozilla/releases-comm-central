/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */

/**
 * Tests nsMsgCompose expandMailingLists.
 */

/**
 * Helper to check population worked as expected.
 *
 * @param {string} aTo - Text in the To field.
 * @param {string} aCheckTo - The expected To addresses (after possible list population)
 */
function checkPopulate(aTo, aCheckTo) {
  var msgCompose = Cc["@mozilla.org/messengercompose/compose;1"].createInstance(
    Ci.nsIMsgCompose
  );

  // Set up some basic fields for compose.
  var fields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);

  fields.to = aTo;

  // Set up some params
  var params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);

  params.composeFields = fields;

  msgCompose.initialize(params);

  msgCompose.expandMailingLists();
  const addresses = fields.getHeader("To");
  const checkEmails = MailServices.headerParser.parseDecodedHeader(aCheckTo);
  Assert.equal(addresses.length, checkEmails.length);
  for (let i = 0; i < addresses.length; i++) {
    Assert.equal(addresses[i].name, checkEmails[i].name);
    Assert.equal(addresses[i].email, checkEmails[i].email);
  }
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

  // Test - expandMailingLists basic functionality.

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

  msgCompose.expandMailingLists();
  Assert.equal(fields.to, "test2@foo1.invalid");
  Assert.equal(fields.cc, "test3@foo1.invalid");
  Assert.equal(fields.bcc, "test4@foo1.invalid");

  // Test - expandMailingLists with plain text.

  checkPopulate("test4@foo.invalid", "test4@foo.invalid");

  // Test - expandMailingLists with html.

  checkPopulate("test5@foo.invalid", "test5@foo.invalid");

  // Test - expandMailingLists with a list of three items.

  checkPopulate(
    "TestList1 <TestList1>",
    "test1@foo.invalid,test2@foo.invalid,test3@foo.invalid"
  );

  // Test - expandMailingLists with a list of one item.

  checkPopulate("TestList2 <TestList2>", "test4@foo.invalid");

  checkPopulate("TestList3 <TestList3>", "test5@foo.invalid");

  // Test - expandMailingLists with items from multiple address books.

  checkPopulate(
    "TestList1 <TestList1>, test3@com.invalid",
    "test1@foo.invalid,test2@foo.invalid,test3@foo.invalid,test3@com.invalid"
  );

  checkPopulate(
    "TestList2 <TestList2>, ListTest2 <ListTest2>",
    "test4@foo.invalid,test4@com.invalid"
  );

  checkPopulate(
    "TestList3 <TestList3>, ListTest1 <ListTest1>",
    "test5@foo.invalid,test1@com.invalid,test2@com.invalid,test3@com.invalid"
  );

  // test bug 254519 rfc 2047 encoding
  checkPopulate(
    "=?iso-8859-1?Q?Sure=F6name=2C_Forename_Dr=2E?= <pb@bieringer.invalid>",
    '"Sure\u00F6name, Forename Dr." <pb@bieringer.invalid>'
  );
}
