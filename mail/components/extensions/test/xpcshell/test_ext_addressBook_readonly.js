/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
);

add_setup(async () => {
  Services.prefs.setIntPref("ldap_2.servers.osx.dirType", -1);

  registerCleanupFunction(() => {
    // Make sure any open database is given a chance to close.
    Services.startup.advanceShutdownPhase(
      Services.startup.SHUTDOWN_PHASE_APPSHUTDOWNCONFIRMED
    );
  });

  const historyAB = MailServices.ab.getDirectory("jsaddrbook://history.sqlite");

  let contact1 = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
    Ci.nsIAbCard
  );
  contact1.UID = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx";
  contact1.displayName = "contact number one";
  contact1.firstName = "contact";
  contact1.lastName = "one";
  contact1.primaryEmail = "contact1@invalid";
  contact1 = historyAB.addCard(contact1);

  const mailList = Cc[
    "@mozilla.org/addressbook/directoryproperty;1"
  ].createInstance(Ci.nsIAbDirectory);
  mailList.isMailList = true;
  mailList.dirName = "Mailing";
  mailList.listNickName = "Mailing";
  mailList.description = "";

  historyAB.addMailList(mailList);
  historyAB.setBoolValue("readOnly", true);

  Assert.ok(historyAB.readOnly);
});

add_task(async function test_addressBooks_readonly() {
  async function background() {
    const list = await browser.addressBooks.list();

    // The read only AB should be in the list.
    const readOnlyAB = list.find(ab => ab.name == "Collected Addresses");
    browser.test.assertTrue(!!readOnlyAB, "Should have found the address book");

    browser.test.assertTrue(
      readOnlyAB.readOnly,
      "Should have marked the address book as read-only"
    );

    const card = await browser.contacts.get(
      "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    );
    browser.test.assertTrue(!!card, "Should have found the card");

    browser.test.assertTrue(
      card.readOnly,
      "Should have marked the card as read-only"
    );

    await browser.test.assertRejects(
      browser.contacts.create(readOnlyAB.id, {
        email: "test@example.com",
      }),
      "Cannot create a contact in a read-only address book",
      "Should reject creating an address book card"
    );

    await browser.test.assertRejects(
      browser.contacts.update(card.id, card.properties),
      "Cannot modify a contact in a read-only address book",
      "Should reject modifying an address book card"
    );

    await browser.test.assertRejects(
      browser.contacts.delete(card.id),
      "Cannot delete a contact in a read-only address book",
      "Should reject deleting an address book card"
    );

    // Mailing List

    const mailingLists = await browser.mailingLists.list(readOnlyAB.id);
    const readOnlyML = mailingLists[0];
    browser.test.assertTrue(!!readOnlyAB, "Should have found the mailing list");

    browser.test.assertTrue(
      readOnlyML.readOnly,
      "Should have marked the mailing list as read-only"
    );

    await browser.test.assertRejects(
      browser.mailingLists.create(readOnlyAB.id, { name: "Test" }),
      "Cannot create a mailing list in a read-only address book",
      "Should reject creating a mailing list"
    );

    await browser.test.assertRejects(
      browser.mailingLists.update(readOnlyML.id, { name: "newTest" }),
      "Cannot modify a mailing list in a read-only address book",
      "Should reject modifying a mailing list"
    );

    await browser.test.assertRejects(
      browser.mailingLists.delete(readOnlyML.id),
      "Cannot delete a mailing list in a read-only address book",
      "Should reject deleting a mailing list"
    );

    await browser.test.assertRejects(
      browser.mailingLists.addMember(readOnlyML.id, card.id),
      "Cannot add to a mailing list in a read-only address book",
      "Should reject deleting a mailing list"
    );

    await browser.test.assertRejects(
      browser.mailingLists.removeMember(readOnlyML.id, card.id),
      "Cannot remove from a mailing list in a read-only address book",
      "Should reject deleting a mailing list"
    );

    browser.test.notifyPass("addressBooks");
  }

  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": background,
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["addressBooks"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("addressBooks");
  await extension.unload();
});
