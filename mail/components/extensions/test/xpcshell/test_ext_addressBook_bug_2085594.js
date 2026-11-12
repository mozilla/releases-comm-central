/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
);

add_setup(async () => {
  registerCleanupFunction(() => {
    // Make sure any open database is given a chance to close.
    Services.startup.advanceShutdownPhase(
      Services.startup.SHUTDOWN_PHASE_APPSHUTDOWNCONFIRMED
    );
  });
});

function getCard(id) {
  for (const dir of MailServices.ab.directories) {
    const card = dir.childCards.find(c => c.UID == id);
    if (card) {
      return { dir, card };
    }
  }
  throw new Error(`Card ${id} not found`);
}

function getPropertyNames(id) {
  return Array.from(getCard(id).card.properties, p => p.name);
}

// In MV3, contacts.create() and contacts.update() take the vCard as a string,
// which must not be split into one custom property per character.
add_task(async function test_mv3_vcard_not_stored_as_properties() {
  const extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      const books = await browser.addressBooks.list();
      const book = books.find(b => !b.readOnly && !b.remote);
      const id = await browser.addressBooks.contacts.create(
        book.id,
        "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Original\r\nEND:VCARD\r\n"
      );
      browser.test.onMessage.addListener(async () => {
        await browser.addressBooks.contacts.update(
          id,
          "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Updated\r\nEND:VCARD\r\n"
        );
        browser.test.sendMessage("updated");
      });
      browser.test.sendMessage("created", id);
    },
    manifest: {
      manifest_version: 3,
      permissions: ["addressBooks"],
    },
  });

  await extension.startup();
  const id = await extension.awaitMessage("created");

  const createdNames = getPropertyNames(id);
  Assert.ok(
    !createdNames.some(name => /^\d+$/.test(name)),
    `Created card should not have digit-only properties: ${createdNames}`
  );

  // Simulate a card damaged by the bug, which also has a custom property set
  // by a Manifest V2 add-on.
  const { dir, card } = getCard(id);
  card.setProperty("0", "B");
  card.setProperty("1", "E");
  card.setProperty("CustomProperty", "custom value");
  dir.modifyCard(card);

  extension.sendMessage("update");
  await extension.awaitMessage("updated");

  const updatedNames = getPropertyNames(id);
  Assert.ok(
    !updatedNames.some(name => /^\d+$/.test(name)),
    `Updated card should not have digit-only properties: ${updatedNames}`
  );
  Assert.equal(
    getCard(id).card.getProperty("CustomProperty", ""),
    "custom value",
    "Existing custom property should be preserved"
  );
  Assert.equal(
    getCard(id).card.displayName,
    "Updated",
    "Card should be updated"
  );

  await extension.unload();
});
