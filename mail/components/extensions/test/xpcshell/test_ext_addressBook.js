/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
);

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  AddrBookCard: "resource:///modules/AddrBookCard.sys.mjs",
  AddrBookUtils: "resource:///modules/AddrBookUtils.sys.mjs",
});

var { AddonTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/AddonTestUtils.sys.mjs"
);

ExtensionTestUtils.mockAppInfo();
AddonTestUtils.maybeInit(this);

add_setup(async () => {
  Services.prefs.setIntPref("ldap_2.servers.osx.dirType", -1);

  registerCleanupFunction(() => {
    // Make sure any open database is given a chance to close.
    Services.startup.advanceShutdownPhase(
      Services.startup.SHUTDOWN_PHASE_APPSHUTDOWNCONFIRMED
    );
  });
});

add_task(async function test_addressBooks() {
  async function background() {
    let firstBookId, secondBookId, newContactId;

    const events = [];
    let eventPromise;
    let eventPromiseResolve;
    for (const eventNamespace of ["addressBooks", "contacts", "mailingLists"]) {
      for (const eventName of [
        "onCreated",
        "onUpdated",
        "onDeleted",
        "onMemberAdded",
        "onMemberRemoved",
      ]) {
        if (eventName in browser[eventNamespace]) {
          browser[eventNamespace][eventName].addListener((...args) => {
            events.push({ namespace: eventNamespace, name: eventName, args });
            if (eventPromiseResolve) {
              const resolve = eventPromiseResolve;
              eventPromiseResolve = null;
              resolve();
            }
          });
        }
      }
    }

    const outsideEvent = function (action, ...args) {
      eventPromise = new Promise(resolve => {
        eventPromiseResolve = resolve;
      });
      return window.sendMessage("outsideEventsTest", action, ...args);
    };
    const checkEvents = async function (...expectedEvents) {
      if (eventPromiseResolve) {
        await eventPromise;
      }

      browser.test.assertEq(
        expectedEvents.length,
        events.length,
        "Correct number of events"
      );

      if (expectedEvents.length != events.length) {
        for (const event of events) {
          const args = event.args.join(", ");
          browser.test.log(`${event.namespace}.${event.name}(${args})`);
        }
        throw new Error("Wrong number of events, stopping.");
      }

      for (const [namespace, name, ...expectedArgs] of expectedEvents) {
        const event = events.shift();
        browser.test.assertEq(
          namespace,
          event.namespace,
          "Event namespace is correct"
        );
        browser.test.assertEq(name, event.name, "Event type is correct");
        browser.test.assertEq(
          expectedArgs.length,
          event.args.length,
          "Argument count is correct"
        );
        window.assertDeepEqual(expectedArgs, event.args);
        if (expectedEvents.length == 1) {
          return event.args;
        }
      }

      return null;
    };

    async function addressBookTest() {
      browser.test.log("Starting addressBookTest");
      let list = await browser.addressBooks.list();
      browser.test.assertEq(2, list.length);
      for (const b of list) {
        browser.test.assertEq(5, Object.keys(b).length);
        browser.test.assertEq(36, b.id.length);
        browser.test.assertEq("addressBook", b.type);
        browser.test.assertTrue("name" in b);
        browser.test.assertFalse(b.readOnly);
        browser.test.assertFalse(b.remote);
      }

      const completeList = await browser.addressBooks.list(true);
      browser.test.assertEq(2, completeList.length);
      for (const b of completeList) {
        browser.test.assertEq(7, Object.keys(b).length);
      }

      firstBookId = list[0].id;
      secondBookId = list[1].id;

      const firstBook = await browser.addressBooks.get(firstBookId);
      browser.test.assertEq(5, Object.keys(firstBook).length);

      const secondBook = await browser.addressBooks.get(secondBookId, true);
      browser.test.assertEq(7, Object.keys(secondBook).length);
      browser.test.assertTrue(Array.isArray(secondBook.contacts));
      browser.test.assertEq(0, secondBook.contacts.length);
      browser.test.assertTrue(Array.isArray(secondBook.mailingLists));
      browser.test.assertEq(0, secondBook.mailingLists.length);
      const newBookId = await browser.addressBooks.create({
        name: "test name",
      });
      browser.test.assertEq(36, newBookId.length);
      await checkEvents([
        "addressBooks",
        "onCreated",
        { type: "addressBook", id: newBookId },
      ]);

      list = await browser.addressBooks.list();
      browser.test.assertEq(3, list.length);

      const newBook = await browser.addressBooks.get(newBookId);
      browser.test.assertEq(newBookId, newBook.id);
      browser.test.assertEq("addressBook", newBook.type);
      browser.test.assertEq("test name", newBook.name);

      await browser.addressBooks.update(newBookId, { name: "new name" });
      await checkEvents([
        "addressBooks",
        "onUpdated",
        { type: "addressBook", id: newBookId },
      ]);
      const updatedBook = await browser.addressBooks.get(newBookId);
      browser.test.assertEq("new name", updatedBook.name);

      list = await browser.addressBooks.list();
      browser.test.assertEq(3, list.length);

      await browser.addressBooks.delete(newBookId);
      await checkEvents(["addressBooks", "onDeleted", newBookId]);

      list = await browser.addressBooks.list();
      browser.test.assertEq(2, list.length);

      for (const operation of ["get", "update", "delete"]) {
        const args = [newBookId];
        if (operation == "update") {
          args.push({ name: "" });
        }

        try {
          await browser.addressBooks[operation].apply(
            browser.addressBooks,
            args
          );
          browser.test.fail(
            `Calling ${operation} on a non-existent address book should throw`
          );
        } catch (ex) {
          browser.test.assertEq(
            `addressBook with id=${newBookId} could not be found.`,
            ex.message,
            `browser.addressBooks.${operation} threw exception`
          );
        }
      }

      // Test the prevention of creating new address book with an empty name
      await browser.test.assertRejects(
        browser.addressBooks.create({ name: "" }),
        "An unexpected error occurred",
        "browser.addressBooks.create threw exception"
      );

      browser.test.assertEq(0, events.length, "No events left unconsumed");
      browser.test.log("Completed addressBookTest");
    }

    async function contactsTest() {
      browser.test.log("Starting contactsTest");
      let contacts = await browser.contacts.list(firstBookId);
      browser.test.assertTrue(Array.isArray(contacts));
      browser.test.assertEq(0, contacts.length);

      newContactId = await browser.contacts.create(firstBookId, {
        FirstName: "first",
        LastName: "last",
        Notes: "Notes",
        SomethingCustom: "Custom property",
      });
      browser.test.assertEq(36, newContactId.length);
      await checkEvents([
        "contacts",
        "onCreated",
        { type: "contact", parentId: firstBookId, id: newContactId },
      ]);

      contacts = await browser.contacts.list(firstBookId);
      browser.test.assertEq(1, contacts.length, "Contact added to first book.");
      browser.test.assertEq(contacts[0].id, newContactId);

      contacts = await browser.contacts.list(secondBookId);
      browser.test.assertEq(
        0,
        contacts.length,
        "Contact not added to second book."
      );

      const newContact = await browser.contacts.get(newContactId);
      browser.test.assertEq(6, Object.keys(newContact).length);
      browser.test.assertEq(newContactId, newContact.id);
      browser.test.assertEq(firstBookId, newContact.parentId);
      browser.test.assertEq("contact", newContact.type);
      browser.test.assertEq(false, newContact.readOnly);
      browser.test.assertEq(false, newContact.remote);
      browser.test.assertEq(5, Object.keys(newContact.properties).length);
      browser.test.assertEq("first", newContact.properties.FirstName);
      browser.test.assertEq("last", newContact.properties.LastName);
      browser.test.assertEq("Notes", newContact.properties.Notes);
      browser.test.assertEq(
        "Custom property",
        newContact.properties.SomethingCustom
      );
      browser.test.assertEq(
        `BEGIN:VCARD\r\nVERSION:4.0\r\nNOTE:Notes\r\nN:last;first;;;\r\nUID:${newContactId}\r\nEND:VCARD\r\n`,
        newContact.properties.vCard
      );

      // Changing the UID should throw.
      try {
        await browser.contacts.update(newContactId, {
          vCard: `BEGIN:VCARD\r\nVERSION:4.0\r\nN:;first;;;\r\nEMAIL;PREF=1:first@last\r\nUID:SomethingNew\r\nEND:VCARD\r\n`,
        });
        browser.test.fail(
          `Updating a contact with a vCard with a differnt UID should throw`
        );
      } catch (ex) {
        browser.test.assertEq(
          `The card's UID ${newContactId} may not be changed: BEGIN:VCARD\r\nVERSION:4.0\r\nN:;first;;;\r\nEMAIL;PREF=1:first@last\r\nUID:SomethingNew\r\nEND:VCARD\r\n.`,
          ex.message,
          `browser.contacts.update threw exception`
        );
      }

      // Test Custom1.
      {
        await browser.contacts.update(newContactId, {
          vCard: `BEGIN:VCARD\r\nVERSION:4.0\r\nNOTE:Notes\r\nN:last;first;;;\r\nX-CUSTOM1;VALUE=TEXT:Original custom value\r\nEND:VCARD`,
        });
        await checkEvents([
          "contacts",
          "onUpdated",
          { type: "contact", parentId: firstBookId, id: newContactId },
          {
            Custom1: { oldValue: null, newValue: "Original custom value" },
          },
        ]);
        const updContact1 = await browser.contacts.get(newContactId);
        browser.test.assertEq(
          "Original custom value",
          updContact1.properties.Custom1
        );

        await browser.contacts.update(newContactId, {
          Custom1: "Updated custom value",
        });
        await checkEvents([
          "contacts",
          "onUpdated",
          { type: "contact", parentId: firstBookId, id: newContactId },
          {
            Custom1: {
              oldValue: "Original custom value",
              newValue: "Updated custom value",
            },
          },
        ]);
        const updContact2 = await browser.contacts.get(newContactId);
        browser.test.assertEq(
          "Updated custom value",
          updContact2.properties.Custom1
        );
        browser.test.assertTrue(
          updContact2.properties.vCard.includes(
            "X-CUSTOM1;VALUE=TEXT:Updated custom value"
          ),
          "vCard should include the correct x-custom1 entry"
        );
      }

      // If a vCard and legacy properties are given, vCard must win.
      await browser.contacts.update(newContactId, {
        vCard: `BEGIN:VCARD\r\nVERSION:4.0\r\nN:;first;;;\r\nEMAIL;PREF=1:first@last\r\nUID:${newContactId}\r\nEND:VCARD\r\n`,
        FirstName: "Superman",
        PrimaryEmail: "c.kent@dailyplanet.com",
        PreferDisplayName: "0",
        OtherCustom: "Yet another custom property",
        Notes: "Ignored Notes",
      });
      await checkEvents([
        "contacts",
        "onUpdated",
        { type: "contact", parentId: firstBookId, id: newContactId },
        {
          PrimaryEmail: { oldValue: null, newValue: "first@last" },
          LastName: { oldValue: "last", newValue: null },
          OtherCustom: {
            oldValue: null,
            newValue: "Yet another custom property",
          },
          PreferDisplayName: { oldValue: null, newValue: "0" },
          Custom1: { oldValue: "Updated custom value", newValue: null },
        },
      ]);

      let updatedContact = await browser.contacts.get(newContactId);
      browser.test.assertEq(6, Object.keys(updatedContact.properties).length);
      browser.test.assertEq("first", updatedContact.properties.FirstName);
      browser.test.assertEq(
        "first@last",
        updatedContact.properties.PrimaryEmail
      );
      browser.test.assertTrue(!("LastName" in updatedContact.properties));
      browser.test.assertTrue(
        !("Notes" in updatedContact.properties),
        "The vCard is not specifying Notes and the specified Notes property should be ignored."
      );
      browser.test.assertEq(
        "Custom property",
        updatedContact.properties.SomethingCustom,
        "Untouched custom properties should not be changed by updating the vCard"
      );
      browser.test.assertEq(
        "Yet another custom property",
        updatedContact.properties.OtherCustom,
        "Custom properties should be added even while updating a vCard"
      );
      browser.test.assertEq(
        "0",
        updatedContact.properties.PreferDisplayName,
        "Setting non-banished properties parallel to a vCard should update"
      );
      browser.test.assertEq(
        `BEGIN:VCARD\r\nVERSION:4.0\r\nN:;first;;;\r\nEMAIL;PREF=1:first@last\r\nUID:${newContactId}\r\nEND:VCARD\r\n`,
        updatedContact.properties.vCard
      );

      // Manually Remove properties.
      await browser.contacts.update(newContactId, {
        LastName: "lastname",
        PrimaryEmail: null,
        SecondEmail: "test@invalid.de",
        SomethingCustom: null,
        OtherCustom: null,
      });
      await checkEvents([
        "contacts",
        "onUpdated",
        { type: "contact", parentId: firstBookId, id: newContactId },
        {
          LastName: { oldValue: null, newValue: "lastname" },
          // It is how it is. Defining a 2nd email with no 1st, will make it the first.
          PrimaryEmail: { oldValue: "first@last", newValue: "test@invalid.de" },
          SomethingCustom: { oldValue: "Custom property", newValue: null },
          OtherCustom: {
            oldValue: "Yet another custom property",
            newValue: null,
          },
        },
      ]);

      updatedContact = await browser.contacts.get(newContactId);
      browser.test.assertEq(5, Object.keys(updatedContact.properties).length);
      // LastName and FirstName are stored in the same multi field property and changing LastName should not change FirstName.
      browser.test.assertEq("first", updatedContact.properties.FirstName);
      browser.test.assertEq("lastname", updatedContact.properties.LastName);
      browser.test.assertEq(
        "test@invalid.de",
        updatedContact.properties.PrimaryEmail
      );
      browser.test.assertTrue(
        !("SomethingCustom" in updatedContact.properties)
      );
      browser.test.assertTrue(!("OtherCustom" in updatedContact.properties));
      browser.test.assertEq(
        `BEGIN:VCARD\r\nVERSION:4.0\r\nN:lastname;first;;;\r\nEMAIL:test@invalid.de\r\nUID:${newContactId}\r\nEND:VCARD\r\n`,
        updatedContact.properties.vCard
      );

      // Add an email address, going from 1 to 2.Also remove FirstName, LastName should stay.
      await browser.contacts.update(newContactId, {
        FirstName: null,
        PrimaryEmail: "new1@invalid.de",
        SecondEmail: "new2@invalid.de",
      });
      await checkEvents([
        "contacts",
        "onUpdated",
        { type: "contact", parentId: firstBookId, id: newContactId },
        {
          PrimaryEmail: {
            oldValue: "test@invalid.de",
            newValue: "new1@invalid.de",
          },
          SecondEmail: { oldValue: null, newValue: "new2@invalid.de" },
          FirstName: { oldValue: "first", newValue: null },
        },
      ]);

      updatedContact = await browser.contacts.get(newContactId);
      browser.test.assertEq(5, Object.keys(updatedContact.properties).length);
      browser.test.assertEq("lastname", updatedContact.properties.LastName);
      browser.test.assertEq(
        "new1@invalid.de",
        updatedContact.properties.PrimaryEmail
      );
      browser.test.assertEq(
        "new2@invalid.de",
        updatedContact.properties.SecondEmail
      );
      browser.test.assertEq(
        `BEGIN:VCARD\r\nVERSION:4.0\r\nN:lastname;;;;\r\nEMAIL;PREF=1:new1@invalid.de\r\nUID:${newContactId}\r\nEMAIL:new2@invalid.de\r\nEND:VCARD\r\n`,
        updatedContact.properties.vCard
      );

      // Remove and email address, going from 2 to 1.
      await browser.contacts.update(newContactId, {
        SecondEmail: null,
      });
      await checkEvents([
        "contacts",
        "onUpdated",
        { type: "contact", parentId: firstBookId, id: newContactId },
        {
          SecondEmail: { oldValue: "new2@invalid.de", newValue: null },
        },
      ]);

      updatedContact = await browser.contacts.get(newContactId);
      browser.test.assertEq(4, Object.keys(updatedContact.properties).length);
      browser.test.assertEq("lastname", updatedContact.properties.LastName);
      browser.test.assertEq(
        "new1@invalid.de",
        updatedContact.properties.PrimaryEmail
      );
      browser.test.assertEq(
        `BEGIN:VCARD\r\nVERSION:4.0\r\nN:lastname;;;;\r\nEMAIL;PREF=1:new1@invalid.de\r\nUID:${newContactId}\r\nEND:VCARD\r\n`,
        updatedContact.properties.vCard
      );

      // Set a fixed UID.
      const fixedContactId = await browser.contacts.create(
        firstBookId,
        "this is a test",
        {
          FirstName: "a",
          LastName: "test",
        }
      );
      browser.test.assertEq("this is a test", fixedContactId);
      await checkEvents([
        "contacts",
        "onCreated",
        { type: "contact", parentId: firstBookId, id: "this is a test" },
      ]);

      const fixedContact = await browser.contacts.get("this is a test");
      browser.test.assertEq("this is a test", fixedContact.id);

      await browser.contacts.delete("this is a test");
      await checkEvents([
        "contacts",
        "onDeleted",
        firstBookId,
        "this is a test",
      ]);

      try {
        await browser.contacts.create(firstBookId, newContactId, {
          FirstName: "uh",
          LastName: "oh",
        });
        browser.test.fail(`Adding a contact with a duplicate id should throw`);
      } catch (ex) {
        browser.test.assertEq(
          `Duplicate contact id: ${newContactId}`,
          ex.message,
          `browser.contacts.create threw exception`
        );
      }

      browser.test.assertEq(0, events.length, "No events left unconsumed");
      browser.test.log("Completed contactsTest");
    }

    async function mailingListsTest() {
      browser.test.log("Starting mailingListsTest");
      let mailingLists = await browser.mailingLists.list(firstBookId);
      browser.test.assertTrue(Array.isArray(mailingLists));
      browser.test.assertEq(0, mailingLists.length);

      const newMailingListId = await browser.mailingLists.create(firstBookId, {
        name: "name",
      });
      browser.test.assertEq(36, newMailingListId.length);
      await checkEvents([
        "mailingLists",
        "onCreated",
        { type: "mailingList", parentId: firstBookId, id: newMailingListId },
      ]);

      mailingLists = await browser.mailingLists.list(firstBookId);
      browser.test.assertEq(
        1,
        mailingLists.length,
        "List added to first book."
      );

      mailingLists = await browser.mailingLists.list(secondBookId);
      browser.test.assertEq(
        0,
        mailingLists.length,
        "List not added to second book."
      );

      const newAddressList = await browser.mailingLists.get(newMailingListId);
      browser.test.assertEq(8, Object.keys(newAddressList).length);
      browser.test.assertEq(newMailingListId, newAddressList.id);
      browser.test.assertEq(firstBookId, newAddressList.parentId);
      browser.test.assertEq("mailingList", newAddressList.type);
      browser.test.assertEq("name", newAddressList.name);
      browser.test.assertEq("", newAddressList.nickName);
      browser.test.assertEq("", newAddressList.description);
      browser.test.assertEq(false, newAddressList.readOnly);
      browser.test.assertEq(false, newAddressList.remote);

      // Test that a valid name is ensured for an existing mail list
      await browser.test.assertRejects(
        browser.mailingLists.update(newMailingListId, {
          name: "",
        }),
        "An unexpected error occurred",
        "browser.mailingLists.update threw exception"
      );

      await browser.test.assertRejects(
        browser.mailingLists.update(newMailingListId, {
          name: "Two  spaces invalid name",
        }),
        "An unexpected error occurred",
        "browser.mailingLists.update threw exception"
      );

      await browser.test.assertRejects(
        browser.mailingLists.update(newMailingListId, {
          name: "><<<",
        }),
        "An unexpected error occurred",
        "browser.mailingLists.update threw exception"
      );

      await browser.mailingLists.update(newMailingListId, {
        name: "name!",
        nickName: "nickname!",
        description: "description!",
      });
      await checkEvents([
        "mailingLists",
        "onUpdated",
        { type: "mailingList", parentId: firstBookId, id: newMailingListId },
      ]);

      const updatedMailingList = await browser.mailingLists.get(
        newMailingListId
      );
      browser.test.assertEq("name!", updatedMailingList.name);
      browser.test.assertEq("nickname!", updatedMailingList.nickName);
      browser.test.assertEq("description!", updatedMailingList.description);

      await browser.mailingLists.addMember(newMailingListId, newContactId);
      await checkEvents([
        "mailingLists",
        "onMemberAdded",
        { type: "contact", parentId: newMailingListId, id: newContactId },
      ]);

      let listMembers = await browser.mailingLists.listMembers(
        newMailingListId
      );
      browser.test.assertTrue(Array.isArray(listMembers));
      browser.test.assertEq(1, listMembers.length);

      const anotherContactId = await browser.contacts.create(firstBookId, {
        FirstName: "second",
        LastName: "last",
        PrimaryEmail: "em@il",
      });
      await checkEvents([
        "contacts",
        "onCreated",
        {
          type: "contact",
          parentId: firstBookId,
          id: anotherContactId,
          readOnly: false,
        },
      ]);

      await browser.mailingLists.addMember(newMailingListId, anotherContactId);
      await checkEvents([
        "mailingLists",
        "onMemberAdded",
        { type: "contact", parentId: newMailingListId, id: anotherContactId },
      ]);

      listMembers = await browser.mailingLists.listMembers(newMailingListId);
      browser.test.assertEq(2, listMembers.length);

      await browser.contacts.delete(anotherContactId);
      await checkEvents(
        ["contacts", "onDeleted", firstBookId, anotherContactId],
        ["mailingLists", "onMemberRemoved", newMailingListId, anotherContactId]
      );
      listMembers = await browser.mailingLists.listMembers(newMailingListId);
      browser.test.assertEq(1, listMembers.length);

      await browser.mailingLists.removeMember(newMailingListId, newContactId);
      await checkEvents([
        "mailingLists",
        "onMemberRemoved",
        newMailingListId,
        newContactId,
      ]);
      listMembers = await browser.mailingLists.listMembers(newMailingListId);
      browser.test.assertEq(0, listMembers.length);

      await browser.mailingLists.delete(newMailingListId);
      await checkEvents([
        "mailingLists",
        "onDeleted",
        firstBookId,
        newMailingListId,
      ]);

      mailingLists = await browser.mailingLists.list(firstBookId);
      browser.test.assertEq(0, mailingLists.length);

      for (const operation of [
        "get",
        "update",
        "delete",
        "listMembers",
        "addMember",
        "removeMember",
      ]) {
        const args = [newMailingListId];
        switch (operation) {
          case "update":
            args.push({ name: "" });
            break;
          case "addMember":
          case "removeMember":
            args.push(newContactId);
            break;
        }

        try {
          await browser.mailingLists[operation].apply(
            browser.mailingLists,
            args
          );
          browser.test.fail(
            `Calling ${operation} on a non-existent mailing list should throw`
          );
        } catch (ex) {
          browser.test.assertEq(
            `mailingList with id=${newMailingListId} could not be found.`,
            ex.message,
            `browser.mailingLists.${operation} threw exception`
          );
        }
      }

      // Test that a valid name is ensured for a new mail list
      await browser.test.assertRejects(
        browser.mailingLists.create(firstBookId, {
          name: "",
        }),
        "An unexpected error occurred",
        "browser.mailingLists.update threw exception"
      );

      await browser.test.assertRejects(
        browser.mailingLists.create(firstBookId, {
          name: "Two  spaces invalid name",
        }),
        "An unexpected error occurred",
        "browser.mailingLists.update threw exception"
      );

      await browser.test.assertRejects(
        browser.mailingLists.create(firstBookId, {
          name: "><<<",
        }),
        "An unexpected error occurred",
        "browser.mailingLists.update threw exception"
      );

      browser.test.assertEq(0, events.length, "No events left unconsumed");
      browser.test.log("Completed mailingListsTest");
    }

    async function contactRemovalTest() {
      browser.test.log("Starting contactRemovalTest");
      await browser.contacts.delete(newContactId);
      await checkEvents(["contacts", "onDeleted", firstBookId, newContactId]);

      for (const operation of ["get", "update", "delete"]) {
        const args = [newContactId];
        if (operation == "update") {
          args.push({});
        }

        try {
          await browser.contacts[operation].apply(browser.contacts, args);
          browser.test.fail(
            `Calling ${operation} on a non-existent contact should throw`
          );
        } catch (ex) {
          browser.test.assertEq(
            `contact with id=${newContactId} could not be found.`,
            ex.message,
            `browser.contacts.${operation} threw exception`
          );
        }
      }

      const contacts = await browser.contacts.list(firstBookId);
      browser.test.assertEq(0, contacts.length);

      browser.test.assertEq(0, events.length, "No events left unconsumed");
      browser.test.log("Completed contactRemovalTest");
    }

    async function outsideEventsTest() {
      browser.test.log("Starting outsideEventsTest");
      const [bookId, newBookPrefId] = await outsideEvent("createAddressBook");
      const [newBook] = await checkEvents([
        "addressBooks",
        "onCreated",
        { type: "addressBook", id: bookId },
      ]);
      browser.test.assertEq("external add", newBook.name);

      await outsideEvent("updateAddressBook", newBookPrefId);
      const [updatedBook] = await checkEvents([
        "addressBooks",
        "onUpdated",
        { type: "addressBook", id: bookId },
      ]);
      browser.test.assertEq("external edit", updatedBook.name);

      await outsideEvent("deleteAddressBook", newBookPrefId);
      await checkEvents(["addressBooks", "onDeleted", bookId]);

      const [parentId1, contactId] = await outsideEvent("createContact");
      const [newContact] = await checkEvents([
        "contacts",
        "onCreated",
        { type: "contact", parentId: parentId1, id: contactId },
      ]);
      browser.test.assertEq("external", newContact.properties.FirstName);
      browser.test.assertEq("add", newContact.properties.LastName);
      browser.test.assertTrue(
        newContact.properties.vCard.includes("VERSION:4.0"),
        "vCard should be version 4.0"
      );

      // Update the contact from outside.
      await outsideEvent("updateContact", contactId);
      const [updatedContact] = await checkEvents([
        "contacts",
        "onUpdated",
        { type: "contact", parentId: parentId1, id: contactId },
        { LastName: { oldValue: "add", newValue: "edit" } },
      ]);
      browser.test.assertEq("external", updatedContact.properties.FirstName);
      browser.test.assertEq("edit", updatedContact.properties.LastName);

      const [parentId2, listId] = await outsideEvent("createMailingList");
      const [newList] = await checkEvents([
        "mailingLists",
        "onCreated",
        { type: "mailingList", parentId: parentId2, id: listId },
      ]);
      browser.test.assertEq("external add", newList.name);

      await outsideEvent("updateMailingList", listId);
      const [updatedList] = await checkEvents([
        "mailingLists",
        "onUpdated",
        { type: "mailingList", parentId: parentId2, id: listId },
      ]);
      browser.test.assertEq("external edit", updatedList.name);

      await outsideEvent("addMailingListMember", listId, contactId);
      await checkEvents([
        "mailingLists",
        "onMemberAdded",
        { type: "contact", parentId: listId, id: contactId },
      ]);
      const listMembers = await browser.mailingLists.listMembers(listId);
      browser.test.assertEq(1, listMembers.length);

      await outsideEvent("removeMailingListMember", listId, contactId);
      await checkEvents(["mailingLists", "onMemberRemoved", listId, contactId]);

      await outsideEvent("deleteMailingList", listId);
      await checkEvents(["mailingLists", "onDeleted", parentId2, listId]);

      await outsideEvent("deleteContact", contactId);
      await checkEvents(["contacts", "onDeleted", parentId1, contactId]);

      browser.test.log("Completed outsideEventsTest");
    }

    await addressBookTest();
    await contactsTest();
    await mailingListsTest();
    await contactRemovalTest();
    await outsideEventsTest();

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

  const parent = MailServices.ab.getDirectory("jsaddrbook://abook.sqlite");
  function findContact(id) {
    for (const child of parent.childCards) {
      if (child.UID == id) {
        return child;
      }
    }
    return null;
  }
  function findMailingList(id) {
    for (const list of parent.childNodes) {
      if (list.UID == id) {
        return list;
      }
    }
    return null;
  }

  extension.onMessage("outsideEventsTest", async (action, ...args) => {
    switch (action) {
      case "createAddressBook": {
        const dirPrefId = MailServices.ab.newAddressBook(
          "external add",
          "",
          Ci.nsIAbManager.JS_DIRECTORY_TYPE
        );
        const book = MailServices.ab.getDirectoryFromId(dirPrefId);
        extension.sendMessage(book.UID, dirPrefId);
        return;
      }
      case "updateAddressBook": {
        const book = MailServices.ab.getDirectoryFromId(args[0]);
        book.dirName = "external edit";
        extension.sendMessage();
        return;
      }
      case "deleteAddressBook": {
        const book = MailServices.ab.getDirectoryFromId(args[0]);
        MailServices.ab.deleteAddressBook(book.URI);
        extension.sendMessage();
        return;
      }
      case "createContact": {
        const contact = new AddrBookCard();
        contact.firstName = "external";
        contact.lastName = "add";
        contact.primaryEmail = "test@invalid";

        const newContact = parent.addCard(contact);
        extension.sendMessage(parent.UID, newContact.UID);
        return;
      }
      case "updateContact": {
        const contact = findContact(args[0]);
        if (contact) {
          contact.firstName = "external";
          contact.lastName = "edit";
          parent.modifyCard(contact);
          extension.sendMessage();
          return;
        }
        break;
      }
      case "deleteContact": {
        const contact = findContact(args[0]);
        if (contact) {
          parent.deleteCards([contact]);
          extension.sendMessage();
          return;
        }
        break;
      }
      case "createMailingList": {
        const list = Cc[
          "@mozilla.org/addressbook/directoryproperty;1"
        ].createInstance(Ci.nsIAbDirectory);
        list.isMailList = true;
        list.dirName = "external add";

        const newList = parent.addMailList(list);
        extension.sendMessage(parent.UID, newList.UID);
        return;
      }
      case "updateMailingList": {
        const list = findMailingList(args[0]);
        if (list) {
          list.dirName = "external edit";
          list.editMailListToDatabase(null);
          extension.sendMessage();
          return;
        }
        break;
      }
      case "deleteMailingList": {
        const list = findMailingList(args[0]);
        if (list) {
          parent.deleteDirectory(list);
          extension.sendMessage();
          return;
        }
        break;
      }
      case "addMailingListMember": {
        const list = findMailingList(args[0]);
        const contact = findContact(args[1]);

        if (list && contact) {
          list.addCard(contact);
          equal(1, list.childCards.length);
          extension.sendMessage();
          return;
        }
        break;
      }
      case "removeMailingListMember": {
        const list = findMailingList(args[0]);
        const contact = findContact(args[1]);

        if (list && contact) {
          list.deleteCards([contact]);
          equal(0, list.childCards.length);
          ok(findContact(args[1]), "Contact was not removed");
          extension.sendMessage();
          return;
        }
        break;
      }
    }
    throw new Error(
      `Message "${action}" passed to handler didn't do anything.`
    );
  });

  await extension.startup();
  await extension.awaitFinish("addressBooks");
  await extension.unload();
});

add_task(async function test_addressBooks_MV3_event_pages() {
  await AddonTestUtils.promiseStartupManager();

  const files = {
    "background.js": async () => {
      // Whenever the extension starts or wakes up, hasFired is set to false. In
      // case of a wake-up, the first fired event is the one that woke up the background.
      let hasFired = false;

      // Create and register event listener.
      for (const event of [
        "addressBooks.onCreated",
        "addressBooks.onUpdated",
        "addressBooks.onDeleted",
        "contacts.onCreated",
        "contacts.onUpdated",
        "contacts.onDeleted",
        "mailingLists.onCreated",
        "mailingLists.onUpdated",
        "mailingLists.onDeleted",
        "mailingLists.onMemberAdded",
        "mailingLists.onMemberRemoved",
      ]) {
        const [apiName, eventName] = event.split(".");
        browser[apiName][eventName].addListener((...args) => {
          // Only send the first event after background wake-up, this should be
          // the only one expected.
          if (!hasFired) {
            hasFired = true;
            browser.test.sendMessage(`${apiName}.${eventName} received`, args);
          }
        });
      }

      browser.test.sendMessage("background started");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["addressBooks"],
      browser_specific_settings: { gecko: { id: "addressbook@xpcshell.test" } },
    },
  });

  const parent = MailServices.ab.getDirectory("jsaddrbook://abook.sqlite");
  function findContact(id) {
    for (const child of parent.childCards) {
      if (child.UID == id) {
        return child;
      }
    }
    return null;
  }
  function findMailingList(id) {
    for (const list of parent.childNodes) {
      if (list.UID == id) {
        return list;
      }
    }
    return null;
  }
  function outsideEvent(action, ...args) {
    switch (action) {
      case "createAddressBook": {
        const dirPrefId = MailServices.ab.newAddressBook(
          "external add",
          "",
          Ci.nsIAbManager.JS_DIRECTORY_TYPE
        );
        const book = MailServices.ab.getDirectoryFromId(dirPrefId);
        return [book, dirPrefId];
      }
      case "updateAddressBook": {
        const book = MailServices.ab.getDirectoryFromId(args[0]);
        book.dirName = "external edit";
        return [];
      }
      case "deleteAddressBook": {
        const book = MailServices.ab.getDirectoryFromId(args[0]);
        MailServices.ab.deleteAddressBook(book.URI);
        return [];
      }
      case "createContact": {
        const contact = new AddrBookCard();
        contact.firstName = "external";
        contact.lastName = "add";
        contact.primaryEmail = "test@invalid";

        const newContact = parent.addCard(contact);
        return [parent.UID, newContact.UID];
      }
      case "updateContact": {
        const contact = findContact(args[0]);
        if (contact) {
          contact.firstName = "external";
          contact.lastName = "edit";
          parent.modifyCard(contact);
          return [];
        }
        break;
      }
      case "deleteContact": {
        const contact = findContact(args[0]);
        if (contact) {
          parent.deleteCards([contact]);
          return [];
        }
        break;
      }
      case "createMailingList": {
        const list = Cc[
          "@mozilla.org/addressbook/directoryproperty;1"
        ].createInstance(Ci.nsIAbDirectory);
        list.isMailList = true;
        list.dirName = "external add";

        const newList = parent.addMailList(list);
        return [parent.UID, newList.UID];
      }
      case "updateMailingList": {
        const list = findMailingList(args[0]);
        if (list) {
          list.dirName = "external edit";
          list.editMailListToDatabase(null);
          return [];
        }
        break;
      }
      case "deleteMailingList": {
        const list = findMailingList(args[0]);
        if (list) {
          parent.deleteDirectory(list);
          return [];
        }
        break;
      }
      case "addMailingListMember": {
        const list = findMailingList(args[0]);
        const contact = findContact(args[1]);

        if (list && contact) {
          list.addCard(contact);
          equal(1, list.childCards.length);
          return [];
        }
        break;
      }
      case "removeMailingListMember": {
        const list = findMailingList(args[0]);
        const contact = findContact(args[1]);

        if (list && contact) {
          list.deleteCards([contact]);
          equal(0, list.childCards.length);
          ok(findContact(args[1]), "Contact was not removed");
          return [];
        }
        break;
      }
    }
    throw new Error(
      `Message "${action}" passed to handler didn't do anything.`
    );
  }

  function checkPersistentListeners({ primed }) {
    // A persistent event is referenced by its moduleName as defined in
    // ext-mails.json, not by its actual namespace.
    const persistent_events = [
      "addressBook.onAddressBookCreated",
      "addressBook.onAddressBookUpdated",
      "addressBook.onAddressBookDeleted",
      "addressBook.onContactCreated",
      "addressBook.onContactUpdated",
      "addressBook.onContactDeleted",
      "addressBook.onMailingListCreated",
      "addressBook.onMailingListUpdated",
      "addressBook.onMailingListDeleted",
      "addressBook.onMemberAdded",
      "addressBook.onMemberRemoved",
    ];

    for (const event of persistent_events) {
      const [moduleName, eventName] = event.split(".");
      assertPersistentListeners(extension, moduleName, eventName, {
        primed,
      });
    }
  }

  await extension.startup();
  await extension.awaitMessage("background started");
  checkPersistentListeners({ primed: false });

  // addressBooks.onCreated.

  await extension.terminateBackground({ disableResetIdleForTest: true });
  checkPersistentListeners({ primed: true });
  const [newBook, dirPrefId] = outsideEvent("createAddressBook");
  // The event should have restarted the background.
  await extension.awaitMessage("background started");
  Assert.deepEqual(
    [
      {
        id: newBook.UID,
        type: "addressBook",
        name: "external add",
        readOnly: false,
        remote: false,
      },
    ],
    await extension.awaitMessage("addressBooks.onCreated received"),
    "The primed addressBooks.onCreated event should return the correct values"
  );
  checkPersistentListeners({ primed: false });

  // addressBooks.onUpdated.

  await extension.terminateBackground({ disableResetIdleForTest: true });
  checkPersistentListeners({ primed: true });
  outsideEvent("updateAddressBook", dirPrefId);
  // The event should have restarted the background.
  await extension.awaitMessage("background started");
  Assert.deepEqual(
    [
      {
        id: newBook.UID,
        type: "addressBook",
        name: "external edit",
        readOnly: false,
        remote: false,
      },
    ],
    await extension.awaitMessage("addressBooks.onUpdated received"),
    "The primed addressBooks.onUpdated event should return the correct values"
  );
  checkPersistentListeners({ primed: false });

  // addressBooks.onDeleted.

  await extension.terminateBackground({ disableResetIdleForTest: true });
  checkPersistentListeners({ primed: true });
  outsideEvent("deleteAddressBook", dirPrefId);
  // The event should have restarted the background.
  await extension.awaitMessage("background started");
  Assert.deepEqual(
    [newBook.UID],
    await extension.awaitMessage("addressBooks.onDeleted received"),
    "The primed addressBooks.onDeleted event should return the correct values"
  );
  checkPersistentListeners({ primed: false });

  // contacts.onCreated.

  await extension.terminateBackground({ disableResetIdleForTest: true });
  checkPersistentListeners({ primed: true });
  const [parentId1, contactId] = outsideEvent("createContact");
  // The event should have restarted the background.
  await extension.awaitMessage("background started");
  const [createdNode] = await extension.awaitMessage(
    "contacts.onCreated received"
  );
  Assert.deepEqual(
    {
      type: "contact",
      parentId: parentId1,
      id: contactId,
    },
    {
      type: createdNode.type,
      parentId: createdNode.parentId,
      id: createdNode.id,
    },
    "The primed contacts.onCreated event should return the correct values"
  );
  checkPersistentListeners({ primed: false });

  // contacts.onUpdated.

  await extension.terminateBackground({ disableResetIdleForTest: true });
  checkPersistentListeners({ primed: true });
  outsideEvent("updateContact", contactId);
  // The event should have restarted the background.
  await extension.awaitMessage("background started");
  const [updatedNode, changedProperties] = await extension.awaitMessage(
    "contacts.onUpdated received"
  );
  Assert.deepEqual(
    [
      { type: "contact", parentId: parentId1, id: contactId },
      { LastName: { oldValue: "add", newValue: "edit" } },
    ],
    [
      {
        type: updatedNode.type,
        parentId: updatedNode.parentId,
        id: updatedNode.id,
      },
      changedProperties,
    ],
    "The primed contacts.onUpdated event should return the correct values"
  );
  checkPersistentListeners({ primed: false });

  // mailingLists.onCreated.

  await extension.terminateBackground({ disableResetIdleForTest: true });
  checkPersistentListeners({ primed: true });
  const [parentId2, listId] = outsideEvent("createMailingList");
  // The event should have restarted the background.
  await extension.awaitMessage("background started");
  Assert.deepEqual(
    [
      {
        type: "mailingList",
        parentId: parentId2,
        id: listId,
        name: "external add",
        nickName: "",
        description: "",
        readOnly: false,
        remote: false,
      },
    ],
    await extension.awaitMessage("mailingLists.onCreated received"),
    "The primed mailingLists.onCreated event should return the correct values"
  );
  checkPersistentListeners({ primed: false });

  // mailingList.onUpdated.

  await extension.terminateBackground({ disableResetIdleForTest: true });
  checkPersistentListeners({ primed: true });
  outsideEvent("updateMailingList", listId);
  // The event should have restarted the background.
  await extension.awaitMessage("background started");
  Assert.deepEqual(
    [
      {
        type: "mailingList",
        parentId: parentId2,
        id: listId,
        name: "external edit",
        nickName: "",
        description: "",
        readOnly: false,
        remote: false,
      },
    ],
    await extension.awaitMessage("mailingLists.onUpdated received"),
    "The primed mailingLists.onUpdated event should return the correct values"
  );
  checkPersistentListeners({ primed: false });

  // mailingList.onMemberAdded.

  await extension.terminateBackground({ disableResetIdleForTest: true });
  checkPersistentListeners({ primed: true });
  outsideEvent("addMailingListMember", listId, contactId);
  // The event should have restarted the background.
  await extension.awaitMessage("background started");
  const [addedNode] = await extension.awaitMessage(
    "mailingLists.onMemberAdded received"
  );
  Assert.deepEqual(
    { type: "contact", parentId: listId, id: contactId },
    { type: addedNode.type, parentId: addedNode.parentId, id: addedNode.id },
    "The primed mailingLists.onMemberAdded event should return the correct values"
  );
  checkPersistentListeners({ primed: false });

  // mailingList.onMemberRemoved.

  await extension.terminateBackground({ disableResetIdleForTest: true });
  checkPersistentListeners({ primed: true });
  outsideEvent("removeMailingListMember", listId, contactId);
  // The event should have restarted the background.
  await extension.awaitMessage("background started");
  Assert.deepEqual(
    [listId, contactId],
    await extension.awaitMessage("mailingLists.onMemberRemoved received"),
    "The primed mailingLists.onMemberRemoved event should return the correct values"
  );
  checkPersistentListeners({ primed: false });

  // mailingList.onDeleted.

  await extension.terminateBackground({ disableResetIdleForTest: true });
  checkPersistentListeners({ primed: true });
  outsideEvent("deleteMailingList", listId);
  // The event should have restarted the background.
  await extension.awaitMessage("background started");
  Assert.deepEqual(
    [parentId2, listId],
    await extension.awaitMessage("mailingLists.onDeleted received"),
    "The primed mailingLists.onDeleted event should return the correct values"
  );
  checkPersistentListeners({ primed: false });

  // contacts.onDeleted.

  await extension.terminateBackground({ disableResetIdleForTest: true });
  checkPersistentListeners({ primed: true });
  outsideEvent("deleteContact", contactId);
  // The event should have restarted the background.
  await extension.awaitMessage("background started");
  Assert.deepEqual(
    [parentId1, contactId],
    await extension.awaitMessage("contacts.onDeleted received"),
    "The primed contacts.onDeleted event should return the correct values"
  );
  checkPersistentListeners({ primed: false });

  await extension.unload();

  await AddonTestUtils.promiseShutdownManager();
});

add_task(async function test_photos() {
  async function background() {
    const events = [];
    let eventPromise;
    let eventPromiseResolve;
    for (const eventNamespace of ["addressBooks", "contacts"]) {
      for (const eventName of ["onCreated", "onUpdated", "onDeleted"]) {
        if (eventName in browser[eventNamespace]) {
          browser[eventNamespace][eventName].addListener((...args) => {
            events.push({ namespace: eventNamespace, name: eventName, args });
            if (eventPromiseResolve) {
              const resolve = eventPromiseResolve;
              eventPromiseResolve = null;
              resolve();
            }
          });
        }
      }
    }

    const getDataUrl = function (file) {
      return new Promise((resolve, reject) => {
        var reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = function () {
          resolve(reader.result);
        };
        reader.onerror = function (error) {
          reject(new Error(error));
        };
      });
    };

    const updateAndVerifyPhoto = async function (
      parentId,
      id,
      photoFile,
      photoData
    ) {
      eventPromise = new Promise(resolve => {
        eventPromiseResolve = resolve;
      });
      await browser.contacts.setPhoto(id, photoFile);

      await checkEvents([
        "contacts",
        "onUpdated",
        { type: "contact", parentId, id },
        {},
      ]);
      const updatedPhoto = await browser.contacts.getPhoto(id);
      // eslint-disable-next-line mozilla/use-isInstance
      browser.test.assertTrue(updatedPhoto instanceof File);
      browser.test.assertEq("image/png", updatedPhoto.type);
      browser.test.assertEq(`${id}.png`, updatedPhoto.name);
      browser.test.assertEq(photoData, await getDataUrl(updatedPhoto));
    };
    const normalizeVCard = function (vCard) {
      return vCard
        .replaceAll("\r\n", "")
        .replaceAll("\n", "")
        .replaceAll(" ", "");
    };
    const outsideEvent = function (action, ...args) {
      eventPromise = new Promise(resolve => {
        eventPromiseResolve = resolve;
      });
      return window.sendMessage("outsideEventsTest", action, ...args);
    };
    const checkEvents = async function (...expectedEvents) {
      if (eventPromiseResolve) {
        await eventPromise;
      }

      browser.test.assertEq(
        expectedEvents.length,
        events.length,
        "Correct number of events"
      );

      if (expectedEvents.length != events.length) {
        for (const event of events) {
          const args = event.args.join(", ");
          browser.test.log(`${event.namespace}.${event.name}(${args})`);
        }
        throw new Error("Wrong number of events, stopping.");
      }

      for (const [namespace, name, ...expectedArgs] of expectedEvents) {
        const event = events.shift();
        browser.test.assertEq(
          namespace,
          event.namespace,
          "Event namespace is correct"
        );
        browser.test.assertEq(name, event.name, "Event type is correct");
        browser.test.assertEq(
          expectedArgs.length,
          event.args.length,
          "Argument count is correct"
        );
        window.assertDeepEqual(expectedArgs, event.args);
        if (expectedEvents.length == 1) {
          return event.args;
        }
      }

      return null;
    };

    const whitePixelData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVQI12P4//8/AAX+Av7czFnnAAAAAElFTkSuQmCC";
    const bluePixelData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVQI12P4//8/AAX+Av7czFnnAAAAAElFTkSuQg==";
    const greenPixelData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAMSURBVBhXY5CeYAMAAbEA6ASxSWcAAAAASUVORK5CYII=";
    const redPixelData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAMSURBVBhXY3growIAAycBLhVrvukAAAAASUVORK5CYII=";
    const vCard3WhitePixel =
      "PHOTO;ENCODING=B;TYPE=PNG:iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVQI12P4//8/AAX+Av7czFnnAAAAAElFTkSuQmCC";
    const vCard4WhitePixel =
      "PHOTO;VALUE=URL:data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVQI12P4//8/AAX+Av7czFnnAAAAAElFTkSuQmCC";
    const vCard4BluePixel =
      "PHOTO;VALUE=URL:data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVQI12P4//8/AAX+Av7czFnnAAAAAElFTkSuQg==";

    // Create a photo file, which is linked to a local file to simulate a file
    // opened through a filepicker.
    const [redPixelRealFile] = await window.sendMessage("getRedPixelFile");

    // Create a photo file, which is a simple data blob.
    const greenPixelFile = await fetch(greenPixelData)
      .then(res => res.arrayBuffer())
      .then(buf => new File([buf], "greenPixel.png", { type: "image/png" }));

    // -------------------------------------------------------------------------
    // Test vCard v4 with a photoName set.
    // -------------------------------------------------------------------------

    const [parentId1, contactId1, photoName1] = await outsideEvent(
      "createV4ContactWithPhotoName"
    );
    const [newContact] = await checkEvents([
      "contacts",
      "onCreated",
      { type: "contact", parentId: parentId1, id: contactId1 },
    ]);
    browser.test.assertEq("external", newContact.properties.FirstName);
    browser.test.assertEq("add", newContact.properties.LastName);
    browser.test.assertTrue(
      newContact.properties.vCard.includes("VERSION:4.0"),
      "vCard should be version 4.0"
    );
    browser.test.assertTrue(
      normalizeVCard(newContact.properties.vCard).includes(vCard4WhitePixel),
      `vCard should include the correct Photo property [${normalizeVCard(
        newContact.properties.vCard
      )}] vs [${vCard4WhitePixel}]`
    );
    // Check internal photoUrl is the correct fileUrl.
    await window.sendMessage(
      "verifyInternalPhotoUrl",
      contactId1,
      `^file:.*?${photoName1}$`
    );

    // Test if we can get the photo through the API.

    const photo = await browser.contacts.getPhoto(contactId1);
    // eslint-disable-next-line mozilla/use-isInstance
    browser.test.assertTrue(photo instanceof File);
    browser.test.assertEq("image/png", photo.type);
    browser.test.assertEq(`${contactId1}.png`, photo.name);
    browser.test.assertEq(
      whitePixelData,
      await getDataUrl(photo),
      "vCard 4.0 contact with photo from internal fileUrl from photoName should return the correct photo file"
    );
    // Re-check internal photoUrl.
    await window.sendMessage(
      "verifyInternalPhotoUrl",
      contactId1,
      `^file:.*?${photoName1}$`
    );

    // Test if we can update the photo through the API by providing a file which
    // is linked to a local file. Since this vCard had only a photoName set and
    // its photo stored as a local file, the updated photo should also be stored
    // as a local file.

    await updateAndVerifyPhoto(
      parentId1,
      contactId1,
      redPixelRealFile,
      redPixelData
    );
    await window.sendMessage(
      "verifyInternalPhotoUrl",
      contactId1,
      `^file:.*?${contactId1}\.png$`
    );

    // Test if we can update the photo through the API, by providing a pure data
    // blob (decoupled from a local file, without file.mozFullPath set).

    await updateAndVerifyPhoto(
      parentId1,
      contactId1,
      greenPixelFile,
      greenPixelData
    );
    await window.sendMessage(
      "verifyInternalPhotoUrl",
      contactId1,
      `^file:.*?${contactId1}-1\.png$`
    );

    // Test if we get the correct photo if it is updated by the user, storing the
    // photo in its vCard (outside of the API).

    await outsideEvent("updateV4ContactWithBluePixel", contactId1);
    const [updatedContact1] = await checkEvents([
      "contacts",
      "onUpdated",
      { type: "contact", parentId: parentId1, id: contactId1 },
      { LastName: { oldValue: "add", newValue: "edit" } },
    ]);
    browser.test.assertEq("external", updatedContact1.properties.FirstName);
    browser.test.assertEq("edit", updatedContact1.properties.LastName);
    const updatedPhoto1 = await browser.contacts.getPhoto(contactId1);
    // eslint-disable-next-line mozilla/use-isInstance
    browser.test.assertTrue(updatedPhoto1 instanceof File);
    browser.test.assertEq("image/png", updatedPhoto1.type);
    browser.test.assertEq(`${contactId1}.png`, updatedPhoto1.name);
    browser.test.assertEq(bluePixelData, await getDataUrl(updatedPhoto1));
    await window.sendMessage(
      "verifyInternalPhotoUrl",
      contactId1,
      bluePixelData
    );

    // -------------------------------------------------------------------------
    // Test vCard v4 with a photoName and also a photo in its vCard.
    // -------------------------------------------------------------------------

    const [parentId2, contactId2] = await outsideEvent(
      "createV4ContactWithBothPhotoProps"
    );
    const [newContact2] = await checkEvents([
      "contacts",
      "onCreated",
      { type: "contact", parentId: parentId2, id: contactId2 },
    ]);
    browser.test.assertEq("external", newContact2.properties.FirstName);
    browser.test.assertEq("add", newContact2.properties.LastName);
    browser.test.assertTrue(
      newContact2.properties.vCard.includes("VERSION:4.0"),
      "vCard should be version 4.0"
    );
    // The card should not include vCard4WhitePixel (which photoName points to),
    // but the value of vCard4BluePixel stored in the vCard photo property.
    browser.test.assertTrue(
      normalizeVCard(newContact2.properties.vCard).includes(vCard4BluePixel),
      `vCard should include the correct Photo property [${normalizeVCard(
        newContact2.properties.vCard
      )}] vs [${vCard4BluePixel}]`
    );
    // Check internal photoUrl is the correct dataUrl.
    await window.sendMessage(
      "verifyInternalPhotoUrl",
      contactId2,
      bluePixelData
    );

    // Test if we can get the correct photo through the API.

    const photo3 = await browser.contacts.getPhoto(contactId2);
    // eslint-disable-next-line mozilla/use-isInstance
    browser.test.assertTrue(photo3 instanceof File);
    browser.test.assertEq("image/png", photo3.type);
    browser.test.assertEq(`${contactId2}.png`, photo3.name);
    browser.test.assertEq(
      bluePixelData,
      await getDataUrl(photo3),
      "vCard 4.0 contact with photo from internal dataUrl from vCard (vCard wins over photoName) should return the correct photo file"
    );
    // Re-check internal photoUrl.
    await window.sendMessage(
      "verifyInternalPhotoUrl",
      contactId2,
      bluePixelData
    );

    // Test if we can update the photo through the API by providing a file which
    // is linked to a local file. Since this vCard had its photo stored as dataUrl
    // in the vCard, the updated photo should be stored as a dataUrl as well.

    await updateAndVerifyPhoto(
      parentId2,
      contactId2,
      redPixelRealFile,
      redPixelData
    );
    await window.sendMessage(
      "verifyInternalPhotoUrl",
      contactId2,
      redPixelData
    );

    // Test if we can update the photo through the API, by providing a pure data
    // blob (decoupled from a local file, without file.mozFullPath set).

    await updateAndVerifyPhoto(
      parentId2,
      contactId2,
      greenPixelFile,
      greenPixelData
    );
    await window.sendMessage(
      "verifyInternalPhotoUrl",
      contactId2,
      greenPixelData
    );

    // -------------------------------------------------------------------------
    // Test vCard v3 with a photoName set.
    // -------------------------------------------------------------------------

    const [parentId3, contactId3, photoName4] = await outsideEvent(
      "createV3ContactWithPhotoName"
    );
    const [newContact4] = await checkEvents([
      "contacts",
      "onCreated",
      { type: "contact", parentId: parentId3, id: contactId3 },
    ]);
    browser.test.assertEq("external", newContact4.properties.FirstName);
    browser.test.assertEq("add", newContact4.properties.LastName);
    browser.test.assertTrue(
      newContact4.properties.vCard.includes("VERSION:3.0"),
      "vCard should be version 3.0"
    );
    browser.test.assertTrue(
      normalizeVCard(newContact4.properties.vCard).includes(vCard3WhitePixel),
      `vCard should include the correct Photo property [${normalizeVCard(
        newContact4.properties.vCard
      )}] vs [${vCard3WhitePixel}]`
    );
    // Check internal photoUrl is the correct fileUrl.
    await window.sendMessage(
      "verifyInternalPhotoUrl",
      contactId3,
      `^file:.*?${photoName4}$`
    );
    const photo4 = await browser.contacts.getPhoto(contactId3);
    // eslint-disable-next-line mozilla/use-isInstance
    browser.test.assertTrue(photo4 instanceof File);
    browser.test.assertEq("image/png", photo4.type);
    browser.test.assertEq(`${contactId3}.png`, photo4.name);
    browser.test.assertEq(
      whitePixelData,
      await getDataUrl(photo4),
      "vCard 3.0 contact with photo from internal fileUrl from photoName should return the correct photo file"
    );
    // Re-check internal photoUrl.
    await window.sendMessage(
      "verifyInternalPhotoUrl",
      contactId3,
      `^file:.*?${photoName4}$`
    );

    // Test if we can update the photo through the API by providing a file which
    // is linked to a local file. Since this vCard had only a photoName set and
    // its photo stored as a local file, the updated photo should also be stored
    // as a local file.

    await updateAndVerifyPhoto(
      parentId3,
      contactId3,
      redPixelRealFile,
      redPixelData
    );
    await window.sendMessage(
      "verifyInternalPhotoUrl",
      contactId3,
      `^file:.*?${contactId3}\.png$`
    );

    // Test if we can update the photo through the API, by providing a pure data
    // blob (decoupled from a local file, without file.mozFullPath set).

    await updateAndVerifyPhoto(
      parentId3,
      contactId3,
      greenPixelFile,
      greenPixelData
    );
    await window.sendMessage(
      "verifyInternalPhotoUrl",
      contactId3,
      `^file:.*?${contactId3}-1\.png$`
    );

    // Test if we get the correct photo if it is updated by the user, storing the
    // photo in its vCard (outside of the API).

    await outsideEvent("updateV3ContactWithBluePixel", contactId3);
    const [updatedContact3] = await checkEvents([
      "contacts",
      "onUpdated",
      { type: "contact", parentId: parentId3, id: contactId3 },
      { LastName: { oldValue: "add", newValue: "edit" } },
    ]);
    browser.test.assertEq("external", updatedContact3.properties.FirstName);
    browser.test.assertEq("edit", updatedContact3.properties.LastName);
    const updatedPhoto3 = await browser.contacts.getPhoto(contactId3);
    // eslint-disable-next-line mozilla/use-isInstance
    browser.test.assertTrue(updatedPhoto3 instanceof File);
    browser.test.assertEq("image/png", updatedPhoto3.type);
    browser.test.assertEq(`${contactId3}.png`, updatedPhoto3.name);
    browser.test.assertEq(bluePixelData, await getDataUrl(updatedPhoto3));
    await window.sendMessage(
      "verifyInternalPhotoUrl",
      contactId3,
      bluePixelData
    );

    // Cleanup. Delete all created contacts.

    await outsideEvent("deleteContact", contactId1);
    await checkEvents(["contacts", "onDeleted", parentId1, contactId1]);
    await outsideEvent("deleteContact", contactId2);
    await checkEvents(["contacts", "onDeleted", parentId2, contactId2]);
    await outsideEvent("deleteContact", contactId3);
    await checkEvents(["contacts", "onDeleted", parentId3, contactId3]);
    browser.test.notifyPass("addressBooksPhotos");
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

  const parent = MailServices.ab.getDirectory("jsaddrbook://abook.sqlite");
  function findContact(id) {
    for (const child of parent.childCards) {
      if (child.UID == id) {
        return child;
      }
    }
    return null;
  }

  async function getUniqueWhitePixelFile() {
    // Copy photo file into the required Photos subfolder of the profile folder.
    const photoName = `${AddrBookUtils.newUID()}.png`;
    await IOUtils.copy(
      do_get_file("images/whitePixel.png").path,
      PathUtils.join(PathUtils.profileDir, "Photos", photoName)
    );
    return photoName;
  }

  extension.onMessage("getRedPixelFile", async () => {
    const redPixelFile = await File.createFromNsIFile(
      do_get_file("images/redPixel.png")
    );
    extension.sendMessage(redPixelFile);
  });

  extension.onMessage("verifyInternalPhotoUrl", (id, expected) => {
    const contact = findContact(id);
    const photoUrl = contact.photoURL;
    if (expected.startsWith("data:")) {
      Assert.equal(expected, photoUrl, `photoURL should be correct`);
    } else {
      const regExp = new RegExp(expected);
      Assert.ok(
        regExp.test(photoUrl),
        `photoURL <${photoUrl}> should match expected regExp <${expected}>`
      );
    }
    extension.sendMessage();
  });

  extension.onMessage("outsideEventsTest", async (action, ...args) => {
    switch (action) {
      case "createV4ContactWithPhotoName": {
        const photoName = await getUniqueWhitePixelFile();
        const contact = new AddrBookCard();
        contact.firstName = "external";
        contact.lastName = "add";
        contact.primaryEmail = "test@invalid";
        contact.setProperty("PhotoName", photoName);

        const newContact = parent.addCard(contact);
        extension.sendMessage(parent.UID, newContact.UID, photoName);
        return;
      }
      case "createV4ContactWithBothPhotoProps": {
        // This contact has whitePixel as file but bluePixel in the vCard.
        const photoName = await getUniqueWhitePixelFile();
        const contact = new AddrBookCard();
        contact.setProperty("PhotoName", photoName);
        contact.setProperty(
          "_vCard",
          formatVCard`
            BEGIN:VCARD
            VERSION:4.0
            EMAIL;PREF=1:test@invalid
            N:add;external;;;
            UID:fd9aecf9-2453-4ba1-bec6-574a15bb380b
            PHOTO;VALUE=URL:data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAA
             ACQd1PeAAAADElEQVQI12P4//8/AAX+Av7czFnnAAAAAElFTkSuQg==
            END:VCARD
          `
        );
        const newContact = parent.addCard(contact);
        extension.sendMessage(parent.UID, newContact.UID, photoName);
        return;
      }
      case "updateV4ContactWithBluePixel": {
        const contact = findContact(args[0]);
        if (contact) {
          contact.setProperty(
            "_vCard",
            formatVCard`
              BEGIN:VCARD
              VERSION:4.0
              EMAIL;PREF=1:test@invalid
              N:edit;external;;;
              PHOTO;VALUE=URL:data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAA
               ACQd1PeAAAADElEQVQI12P4//8/AAX+Av7czFnnAAAAAElFTkSuQg==
              END:VCARD
            `
          );
          parent.modifyCard(contact);
          extension.sendMessage();
          return;
        }
        break;
      }
      case "createV3ContactWithPhotoName": {
        const photoName = await getUniqueWhitePixelFile();
        const contact = new AddrBookCard();
        contact.setProperty("PhotoName", photoName);
        contact.setProperty(
          "_vCard",
          formatVCard`
            BEGIN:VCARD
            VERSION:3.0
            EMAIL:test@invalid
            N:add;external
            UID:fd9aecf9-2453-4ba1-bec6-574a15bb380c
            END:VCARD
          `
        );
        const newContact = parent.addCard(contact);
        extension.sendMessage(parent.UID, newContact.UID, photoName);
        return;
      }
      case "updateV3ContactWithBluePixel": {
        const contact = findContact(args[0]);
        if (contact) {
          contact.setProperty(
            "_vCard",
            formatVCard`
              BEGIN:VCARD
              VERSION:3.0
              EMAIL:test@invalid
              N:edit;external
              PHOTO;ENCODING=b;TYPE=PNG:iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAAD
               ElEQVQI12P4//8/AAX+Av7czFnnAAAAAElFTkSuQg==
              END:VCARD
            `
          );
          parent.modifyCard(contact);
          extension.sendMessage();
          return;
        }
        break;
      }
      case "deleteContact": {
        const contact = findContact(args[0]);
        if (contact) {
          parent.deleteCards([contact]);
          extension.sendMessage();
          return;
        }
        break;
      }
    }
    throw new Error(
      `Message "${action}" passed to handler didn't do anything.`
    );
  });

  await extension.startup();
  await extension.awaitFinish("addressBooksPhotos");
  await extension.unload();
});
