/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Testing of junk whitelisting
 */

// add address book setup
/* import-globals-from ../../../test/resources/abSetup.js */
load("../../../resources/abSetup.js");

// add fake POP3 server driver
/* import-globals-from ../../../test/resources/POP3pump.js */
load("../../../resources/POP3pump.js");

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

/*
 * The address available in the test address book is "PrimaryEmail1@test.invalid"
 * Test emails may also include the address "invalid@example.com"
 *
 * Map of test email contents: (P is "Prim...", I is "inva.." address)
 *
 *  Index  Bugmail#      From
 *    0        1          P
 *    1        3          I
 *
 */

// indices into hdrs[] of email by domain
var kDomainTest = 0;
var kDomainExample = 1;

var Files = ["../../../data/bugmail1", "../../../data/bugmail3"];

var hdrs = [];

function run_test() {
  loadABFile(
    "../../../addrbook/test/unit/data/cardForEmail",
    kPABData.fileName
  );

  do_test_pending();

  // kick off copying
  gPOP3Pump.files = Files;
  gPOP3Pump.onDone = continueTest;
  gPOP3Pump.run();
}

function continueTest() {
  // get the message headers
  for (const header of localAccountUtils.inboxFolder.messages) {
    hdrs.push(header);
  }

  // check with spam properties set on the local server
  doChecks(localAccountUtils.incomingServer);

  // Free our globals
  hdrs = null;
  gPOP3Pump = null;
  do_test_finished();
}

function doChecks(server) {
  const spamSettings = server.spamSettings;

  // default is to use the whitelist
  Assert.ok(spamSettings.useWhiteList);

  // check email with the address PrimaryEmail1@test.invalid
  Assert.ok(spamSettings.checkWhiteList(hdrs[kDomainTest]));

  // check email without the address
  Assert.ok(!spamSettings.checkWhiteList(hdrs[kDomainExample]));

  //
  // check changes in server-level settings. Although the spamSettings object
  // has methods to set these, those methods are not persistent (which seems
  // strange). You need to set the actual preference, and call initialize on
  // spam settings, to get the settings to be saved persistently and stick, then
  // be recalled into the program. So that's the way that I will test it.
  //

  // disable whitelisting
  server.setBoolValue("useWhiteList", false);
  spamSettings.initialize(server);

  // check that the change was propagated to spamSettings
  Assert.ok(!spamSettings.useWhiteList);

  // and affects whitelisting calculationss
  Assert.ok(!spamSettings.checkWhiteList(hdrs[kDomainTest]));

  // re-enable whitelisting
  server.setBoolValue("useWhiteList", true);
  spamSettings.initialize(server);
  Assert.ok(spamSettings.checkWhiteList(hdrs[kDomainTest]));

  // Set an empty white list.
  // To really empty this, I have to change the default value as well
  Services.prefs.setCharPref("mail.server.default.whiteListAbURI", "");
  server.setCharValue("whiteListAbURI", "");
  spamSettings.initialize(server);
  Assert.ok(!spamSettings.checkWhiteList(hdrs[kDomainTest]));

  // add a trusted domain. This is a global preference
  Services.prefs.setCharPref("mail.trusteddomains", "example.com");
  spamSettings.initialize(server);

  // check email with the address invalid@example.com, a trusted domain
  Assert.ok(spamSettings.checkWhiteList(hdrs[kDomainExample]));

  // check email without the address
  Assert.ok(!spamSettings.checkWhiteList(hdrs[kDomainTest]));

  // disable the trusted domain
  Services.prefs.setCharPref("mail.trusteddomains", "");
  spamSettings.initialize(server);
  Assert.ok(!spamSettings.checkWhiteList(hdrs[kDomainExample]));

  // add back the Personal Address Book
  server.setCharValue("whiteListAbURI", kPABData.URI);
  spamSettings.initialize(server);
  Assert.ok(spamSettings.checkWhiteList(hdrs[kDomainTest]));

  /*
   * tests of whitelist suppression by identity
   */

  // setup
  const account = MailServices.accounts.findAccountForServer(server);
  const identity = MailServices.accounts.createIdentity();
  // start with an email that does not match
  identity.email = "iAmNotTheSender@test.invalid";
  account.addIdentity(identity);

  // setup account and identify for the deferred-from fake server
  const fakeAccount = MailServices.accounts.createAccount();
  fakeAccount.incomingServer = gPOP3Pump.fakeServer;
  const fakeIdentity = MailServices.accounts.createIdentity();
  // start with an email that does not match
  fakeIdentity.email = "iAmNotTheSender@wrong.invalid";
  fakeAccount.addIdentity(fakeIdentity);

  // gPOP3Pump delivers messages to the local inbox regardless of other
  // settings. But because we are testing here one of those other settings,
  // let's just pretend that it works like the real POP3 stuff, and set
  // the correct setting for deferring.
  gPOP3Pump.fakeServer.setCharValue("deferred_to_account", "account1");

  // suppress whitelisting for sender
  server.setBoolValue("inhibitWhiteListingIdentityUser", true);
  spamSettings.initialize(server);
  // (email does not match yet though)
  Assert.ok(spamSettings.checkWhiteList(hdrs[kDomainTest]));

  // add a matching email (mixing case)
  identity.email = "PrimaryEMAIL1@test.INVALID";
  spamSettings.initialize(server);
  Assert.ok(!spamSettings.checkWhiteList(hdrs[kDomainTest]));

  // remove the matching email
  identity.email = "iAmNotTheSender@test.invalid";
  spamSettings.initialize(server);
  Assert.ok(spamSettings.checkWhiteList(hdrs[kDomainTest]));

  // add the email to the deferred-from server
  fakeIdentity.email = "PrimaryEMAIL1@test.INVALID";
  spamSettings.initialize(server);
  Assert.ok(!spamSettings.checkWhiteList(hdrs[kDomainTest]));

  // stop suppressing identity users
  server.setBoolValue("inhibitWhiteListingIdentityUser", false);
  spamSettings.initialize(server);
  Assert.ok(spamSettings.checkWhiteList(hdrs[kDomainTest]));

  // remove the matching email from the fake identity
  fakeIdentity.email = "iAmNotTheSender@wrong.invalid";

  // add a fully non-matching domain to the identity
  identity.email = "PrimaryEmail1@wrong.invalid";

  // suppress whitelist by matching domain
  server.setBoolValue("inhibitWhiteListingIdentityDomain", true);
  spamSettings.initialize(server);
  // but domain still does not match
  Assert.ok(spamSettings.checkWhiteList(hdrs[kDomainTest]));

  // add a matching email to the identity, in the domain (mixing case)
  identity.email = "iAmNotTheSender@TEST.invalid";
  spamSettings.initialize(server);
  Assert.ok(!spamSettings.checkWhiteList(hdrs[kDomainTest]));

  // stop suppressing whitelist by domain
  server.setBoolValue("inhibitWhiteListingIdentityDomain", false);
  spamSettings.initialize(server);
  Assert.ok(spamSettings.checkWhiteList(hdrs[kDomainTest]));
}
