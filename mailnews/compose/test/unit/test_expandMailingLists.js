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
Components.utils.import("resource:///modules/mailServices.js");

/**
 * Helper to check population worked as expected.
 * @param aTo - text in the To field
 * @param aCheckTo - the expected To addresses (after possible ist population)
 */
function checkPopulate(aTo, aCheckTo)
{
  let msgCompose = Components.classes[MsgComposeContractID]
                             .createInstance(nsIMsgCompose);

  // Set up some basic fields for compose.
  let fields = Components.classes[MsgComposeFieldsContractID]
                         .createInstance(nsIMsgCompFields);

  fields.to = aTo;

  // Set up some params
  let params = Components.classes[MsgComposeParamsContractID]
                         .createInstance(nsIMsgComposeParams);

  params.composeFields = fields;

  msgCompose.initialize(params);

  msgCompose.expandMailingLists();
  equal(fields.to, aCheckTo);
}

function run_test() {
  // Test setup - copy the data files into place
  let testAB = do_get_file("./data/listexpansion.mab");

  // Copy the file to the profile directory for a PAB
  testAB.copyTo(do_get_profile(), kPABData.fileName);

  // XXX Getting all directories ensures we create all ABs because mailing
  // lists need help initialising themselves
  MailServices.ab.directories;

  // Test expansion of list with no description.
  checkPopulate("simpson <simpson>", "Simpson <homer@example.com>, Marge <marge@example.com>, Bart <bart@foobar.invalid>, \"lisa@example.com\" <lisa@example.com>");

  // Test expansion fo list with description.
  checkPopulate("marge <marges own list>", "Simpson <homer@example.com>, Marge <marge@example.com>");

  // Test we don't mistake an email address for a list, with a few variations.
  checkPopulate("Simpson <homer@example.com>", "Simpson <homer@example.com>");
  checkPopulate("simpson <homer@example.com>", "simpson <homer@example.com>");
  checkPopulate("simpson <homer@not-in-ab.invalid>", "simpson <homer@not-in-ab.invalid>");

  checkPopulate("Marge <marge@example.com>", "Marge <marge@example.com>");
  checkPopulate("marge <marge@example.com>", "marge <marge@example.com>");
  checkPopulate("marge <marge@not-in-ab.invalid>", "marge <marge@not-in-ab.invalid>");

};
