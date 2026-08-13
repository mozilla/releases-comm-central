/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the UID attribute of identities.
 */
add_task(async function testUID() {
  const UUID_REGEXP =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  // Create an identity and check it the UID is set when accessed.

  const identityA = MailServices.accounts.createIdentity();
  Assert.stringMatches(
    identityA.UID,
    UUID_REGEXP,
    "identity A's UID should exist and be a UUID"
  );
  Assert.equal(
    Services.prefs.getStringPref(`mail.identity.${identityA.key}.uid`),
    identityA.UID,
    "identity A's UID should be saved to the preferences"
  );
  Assert.throws(
    () => (identityA.UID = "00001111-2222-3333-4444-555566667777"),
    /NS_ERROR_ABORT/,
    "identity A's UID should be unchangeable after it is set"
  );

  // Create a second identity and check the two UIDs don't match.

  const identityB = MailServices.accounts.createIdentity();
  Assert.stringMatches(
    identityB.UID,
    UUID_REGEXP,
    "identity B's UID should exist and be a UUID"
  );
  Assert.equal(
    Services.prefs.getStringPref(`mail.identity.${identityB.key}.uid`),
    identityB.UID,
    "identity B's UID should be saved to the preferences"
  );
  Assert.notEqual(
    identityB.UID,
    identityA.UID,
    "identity B's UID should not be the same as identity A's"
  );

  // Create a third identity and set the UID before it is accessed.

  const identityC = MailServices.accounts.createIdentity();
  identityC.UID = "11112222-3333-4444-5555-666677778888";
  Assert.equal(
    identityC.UID,
    "11112222-3333-4444-5555-666677778888",
    "identity C's UID set correctly"
  );
  Assert.equal(
    Services.prefs.getStringPref(`mail.identity.${identityC.key}.uid`),
    "11112222-3333-4444-5555-666677778888",
    "identity C's UID should be saved to the preferences"
  );
  Assert.throws(
    () => (identityC.UID = "22223333-4444-5555-6666-777788889999"),
    /NS_ERROR_ABORT/,
    "identity C's UID should be unchangeable after it is set"
  );
});

/**
 * Tests that changing an identity's special folder removes the flag from the
 * old folder, but only if no other identity is using the folder.
 */
add_task(function testOldFolderFlagIsReset() {
  const localAccount = MailServices.accounts.createLocalMailAccount();
  const localRoot = localAccount.incomingServer.rootFolder;
  localRoot.QueryInterface(Ci.nsIMsgLocalMailFolder);

  const drafts1 = localRoot.createLocalSubfolder("drafts 1");
  const drafts2 = localRoot.createLocalSubfolder("drafts 2");
  Assert.ok(
    !drafts1.getFlag(Ci.nsMsgFolderFlags.Drafts),
    "first folder should start without the flag"
  );
  Assert.ok(
    !drafts2.getFlag(Ci.nsMsgFolderFlags.Drafts),
    "second folder should start without the flag"
  );

  const identity1 = MailServices.accounts.createIdentity();
  localAccount.addIdentity(identity1);
  identity1.draftsFolderURI = drafts1.URI;
  Assert.ok(
    drafts1.getFlag(Ci.nsMsgFolderFlags.Drafts),
    "first folder should now have the flag"
  );
  Assert.ok(
    !drafts2.getFlag(Ci.nsMsgFolderFlags.Drafts),
    "second folder should still not have the flag"
  );

  const identity2 = MailServices.accounts.createIdentity();
  localAccount.addIdentity(identity2);
  identity2.draftsFolderURI = drafts1.URI;
  Assert.ok(
    drafts1.getFlag(Ci.nsMsgFolderFlags.Drafts),
    "first folder should still have the flag"
  );
  Assert.ok(
    !drafts2.getFlag(Ci.nsMsgFolderFlags.Drafts),
    "second folder should still not have the flag"
  );

  identity1.draftsFolderURI = drafts2.URI;
  Assert.ok(
    drafts1.getFlag(Ci.nsMsgFolderFlags.Drafts),
    "first folder should still have the flag"
  );
  Assert.ok(
    drafts2.getFlag(Ci.nsMsgFolderFlags.Drafts),
    "second folder should now have the flag"
  );

  identity2.draftsFolderURI = drafts2.URI;
  Assert.ok(
    !drafts1.getFlag(Ci.nsMsgFolderFlags.Drafts),
    "first folder should have lost the flag"
  );
  Assert.ok(
    drafts2.getFlag(Ci.nsMsgFolderFlags.Drafts),
    "second folder should still have the flag"
  );

  identity1.draftsFolderURI = "";
  Assert.ok(
    drafts2.getFlag(Ci.nsMsgFolderFlags.Drafts),
    "second folder should still have the flag"
  );
  identity2.draftsFolderURI = "";
  Assert.ok(
    !drafts2.getFlag(Ci.nsMsgFolderFlags.Drafts),
    "second folder should have lost the flag"
  );

  MailServices.accounts.removeAccount(localAccount, false);
});
