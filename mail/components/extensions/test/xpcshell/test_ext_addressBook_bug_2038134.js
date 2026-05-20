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

// `addrbook-contact-properties-updated` must refresh the global `_contacts`
// map even when the per-book contacts map has not yet been populated, so a
// later `contacts.get` returns the post-update vCard. This test enters that
// state by avoiding any call that would populate the per-book contacts map
// before the update.
add_task(async function test_contacts_cache_resync_on_update() {
  const extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      // Populates the cache's `_addressBooks` map but does not iterate any
      // book's contacts.
      const books = await browser.addressBooks.list();
      const book = books.find(b => !b.readOnly && !b.remote);
      browser.test.assertTrue(!!book, "Found a writable, local address book");

      // Create without a UID in the vCard so the create handler does not
      // perform a duplicate-id check (which would populate the parent
      // book's contacts map and mask bug 2038134).
      const id = await browser.addressBooks.contacts.create(
        book.id,
        "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Original Name\r\nN:Last;First;;;\r\nNOTE:original\r\nEND:VCARD\r\n"
      );

      await browser.addressBooks.contacts.update(
        id,
        `BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Updated Name\r\nN:NewLast;NewFirst;;;\r\nNOTE:updated\r\nUID:${id}\r\nEND:VCARD\r\n`
      );

      // Read via the API; this returns the cached node. With the bug the
      // cached node still references the pre-update card snapshot.
      const fetched = await browser.addressBooks.contacts.get(id);
      browser.test.assertTrue(
        fetched.vCard.includes("FN:Updated Name"),
        `vCard should reflect the update; got: ${fetched.vCard}`
      );
      browser.test.assertTrue(
        fetched.vCard.includes("NOTE:updated"),
        `vCard should include the updated note; got: ${fetched.vCard}`
      );
      browser.test.assertFalse(
        fetched.vCard.includes("FN:Original Name"),
        `vCard must not contain the stale name; got: ${fetched.vCard}`
      );

      // Listing the parent book populates the per-book contacts map (which
      // also re-reads cards from the directory), so this should always
      // agree.
      const listed = await browser.addressBooks.contacts.list(book.id);
      const fromList = listed.find(c => c.id === id);
      browser.test.assertTrue(
        fromList && fromList.vCard.includes("FN:Updated Name"),
        `contacts.list should also see the update; got: ${fromList?.vCard}`
      );

      await browser.addressBooks.contacts.delete(id);

      browser.test.notifyPass("done");
    },
    manifest: {
      manifest_version: 3,
      permissions: ["addressBooks"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("done");
  await extension.unload();
});

// Additional coverage for the same handler: when a contact is also a member of
// a mailing list whose `contacts` map has been populated, the cache stores a
// distinct node inside the list. The `addrbook-contact-properties-updated`
// handler must refresh that node's `item`. Otherwise, `mailingLists.listMembers`
// returns stale vCards.
add_task(async function test_mailing_list_contact_item_refresh_on_update() {
  const extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      const books = await browser.addressBooks.list();
      const book = books.find(b => !b.readOnly && !b.remote);

      // Mailing-list `addCard` silently no-ops on contacts without a
      // primaryEmail, so the EMAIL line is required for addMember below.
      const contactId = await browser.addressBooks.contacts.create(
        book.id,
        "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Original Name\r\nN:Last;First;;;\r\nEMAIL;PREF=1:original@example.invalid\r\nEND:VCARD\r\n"
      );

      const listId = await browser.addressBooks.mailingLists.create(book.id, {
        name: "list",
      });
      await browser.addressBooks.mailingLists.addMember(listId, contactId);

      // The update handler iterates `parentNode.mailingLists` and skips the
      // refresh entirely when that map is undefined. Populate it via
      // `mailingLists.list(book.id)`, then populate the per-list `contacts`
      // map via `listMembers(listId)` so both inner checks succeed.
      await browser.addressBooks.mailingLists.list(book.id);
      const before =
        await browser.addressBooks.mailingLists.listMembers(listId);
      browser.test.assertEq(1, before.length, "list has one member");
      browser.test.assertTrue(
        before[0].vCard.includes("FN:Original Name"),
        "list member has original vCard"
      );

      await browser.addressBooks.contacts.update(
        contactId,
        `BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Updated Name\r\nN:NewLast;NewFirst;;;\r\nEMAIL;PREF=1:updated@example.invalid\r\nUID:${contactId}\r\nEND:VCARD\r\n`
      );

      // Cache read: `mailingList.contacts` is already populated from above,
      // so getListContacts returns the cached map without re-reading the
      // directory. The assertion fails if the update handler did not mutate
      // the cached node's `item`.
      const after = await browser.addressBooks.mailingLists.listMembers(listId);
      browser.test.assertTrue(
        after[0].vCard.includes("FN:Updated Name"),
        `list member's cached item should be refreshed; got: ${after[0].vCard}`
      );
      browser.test.assertFalse(
        after[0].vCard.includes("FN:Original Name"),
        `list member must not retain stale name; got: ${after[0].vCard}`
      );

      await browser.addressBooks.mailingLists.delete(listId);
      await browser.addressBooks.contacts.delete(contactId);

      browser.test.notifyPass("done");
    },
    manifest: {
      manifest_version: 3,
      permissions: ["addressBooks"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("done");
  await extension.unload();
});

// `addrbook-contact-created` must write the new node into `_contacts` even
// when the parent book's `contacts` map has never been populated.
add_task(async function test_contact_created_populates_top_level_cache() {
  const extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      const books = await browser.addressBooks.list();
      const book = books.find(b => !b.readOnly && !b.remote);

      // No `contacts.list(book.id)` here: the parent's contacts map stays
      // unpopulated, so the only path that puts the new contact into
      // `_contacts` is the `addrbook-contact-created` handler.
      const id = await browser.addressBooks.contacts.create(
        book.id,
        "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Created\r\nN:Last;First;;;\r\nEND:VCARD\r\n"
      );

      // Cache read: `_contacts` already has the id from the create handler,
      // so findContactById returns the cached node directly.
      const fetched = await browser.addressBooks.contacts.get(id);
      browser.test.assertEq(id, fetched.id, "get returns the new contact");
      browser.test.assertEq(book.id, fetched.parentId, "parentId matches");
      browser.test.assertTrue(
        fetched.vCard.includes("FN:Created"),
        `vCard reflects the create payload; got: ${fetched.vCard}`
      );

      await browser.addressBooks.contacts.delete(id);
      browser.test.notifyPass("done");
    },
    manifest: {
      manifest_version: 3,
      permissions: ["addressBooks"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("done");
  await extension.unload();
});

// `addrbook-contact-deleted` must remove the entry from `_contacts`
// unconditionally and from `parentNode.contacts` when that map has been
// populated.
add_task(async function test_contact_deleted_clears_cache() {
  const extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      const books = await browser.addressBooks.list();
      const book = books.find(b => !b.readOnly && !b.remote);

      const id = await browser.addressBooks.contacts.create(
        book.id,
        "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Doomed\r\nN:Last;First;;;\r\nEND:VCARD\r\n"
      );

      // Populate the per-book contacts map so the delete handler hits the
      // `if (parentNode.contacts)` branch.
      const before = await browser.addressBooks.contacts.list(book.id);
      browser.test.assertTrue(
        before.some(c => c.id === id),
        "contact present in per-book list before delete"
      );

      await browser.addressBooks.contacts.delete(id);

      // Top-level cache: `get` resolves via `_contacts`. A stale entry
      // would either succeed (returning the deleted contact) or throw a
      // different error.
      await browser.test.assertRejects(
        browser.addressBooks.contacts.get(id),
        `contact with id=${id} could not be found.`,
        "get throws after delete"
      );

      // Per-book cache: still populated, so this `list` returns directly
      // from the cached map without re-reading the directory.
      const after = await browser.addressBooks.contacts.list(book.id);
      browser.test.assertFalse(
        after.some(c => c.id === id),
        "contact removed from per-book list after delete"
      );

      browser.test.notifyPass("done");
    },
    manifest: {
      manifest_version: 3,
      permissions: ["addressBooks"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("done");
  await extension.unload();
});
