/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionTestUtils } = ChromeUtils.import(
  "resource://testing-common/ExtensionXPCShellUtils.jsm"
);

var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  AddrBookCard: "resource:///modules/AddrBookCard.jsm",
});

add_task(async function setup() {
  Services.prefs.setIntPref("ldap_2.servers.osx.dirType", -1);
});

add_task(async function test_addressBooks() {
  // Copy photo file into the required Photos subfolder of the profile folder.
  await IOUtils.copy(
    do_get_file("images/pixel.png").path,
    PathUtils.join(PathUtils.profileDir, "Photos", "pixel.png")
  );

  async function background() {
    let firstBookId, secondBookId, newContactId;

    let events = [];
    let eventPromise;
    let eventPromiseResolve;
    for (let eventNamespace of ["addressBooks", "contacts", "mailingLists"]) {
      for (let eventName of [
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
              let resolve = eventPromiseResolve;
              eventPromiseResolve = null;
              resolve();
            }
          });
        }
      }
    }

    let outsideEvent = function(action, ...args) {
      eventPromise = new Promise(resolve => {
        eventPromiseResolve = resolve;
      });
      return window.sendMessage("outsideEventsTest", action, ...args);
    };
    let checkEvents = async function(...expectedEvents) {
      if (eventPromiseResolve) {
        await eventPromise;
      }

      browser.test.assertEq(
        expectedEvents.length,
        events.length,
        "Correct number of events"
      );

      if (expectedEvents.length != events.length) {
        for (let event of events) {
          let args = event.args.join(", ");
          browser.test.log(`${event.namespace}.${event.name}(${args})`);
        }
        throw new Error("Wrong number of events, stopping.");
      }

      for (let [namespace, name, ...expectedArgs] of expectedEvents) {
        let event = events.shift();
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
      for (let b of list) {
        browser.test.assertEq(5, Object.keys(b).length);
        browser.test.assertEq(36, b.id.length);
        browser.test.assertEq("addressBook", b.type);
        browser.test.assertTrue("name" in b);
        browser.test.assertFalse(b.readOnly);
        browser.test.assertFalse(b.remote);
      }

      let completeList = await browser.addressBooks.list(true);
      browser.test.assertEq(2, completeList.length);
      for (let b of completeList) {
        browser.test.assertEq(7, Object.keys(b).length);
      }

      firstBookId = list[0].id;
      secondBookId = list[1].id;

      let firstBook = await browser.addressBooks.get(firstBookId);
      browser.test.assertEq(5, Object.keys(firstBook).length);

      let secondBook = await browser.addressBooks.get(secondBookId, true);
      browser.test.assertEq(7, Object.keys(secondBook).length);
      browser.test.assertTrue(Array.isArray(secondBook.contacts));
      browser.test.assertEq(0, secondBook.contacts.length);
      browser.test.assertTrue(Array.isArray(secondBook.mailingLists));
      browser.test.assertEq(0, secondBook.mailingLists.length);
      let newBookId = await browser.addressBooks.create({ name: "test name" });
      browser.test.assertEq(36, newBookId.length);
      await checkEvents([
        "addressBooks",
        "onCreated",
        { type: "addressBook", id: newBookId },
      ]);

      list = await browser.addressBooks.list();
      browser.test.assertEq(3, list.length);

      let newBook = await browser.addressBooks.get(newBookId);
      browser.test.assertEq(newBookId, newBook.id);
      browser.test.assertEq("addressBook", newBook.type);
      browser.test.assertEq("test name", newBook.name);

      await browser.addressBooks.update(newBookId, { name: "new name" });
      await checkEvents([
        "addressBooks",
        "onUpdated",
        { type: "addressBook", id: newBookId },
      ]);
      let updatedBook = await browser.addressBooks.get(newBookId);
      browser.test.assertEq("new name", updatedBook.name);

      list = await browser.addressBooks.list();
      browser.test.assertEq(3, list.length);

      await browser.addressBooks.delete(newBookId);
      await checkEvents(["addressBooks", "onDeleted", newBookId]);

      list = await browser.addressBooks.list();
      browser.test.assertEq(2, list.length);

      for (let operation of ["get", "update", "delete"]) {
        let args = [newBookId];
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

      let newContact = await browser.contacts.get(newContactId);
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
      let fixedContactId = await browser.contacts.create(
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

      let fixedContact = await browser.contacts.get("this is a test");
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

      let newMailingListId = await browser.mailingLists.create(firstBookId, {
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

      let newAddressList = await browser.mailingLists.get(newMailingListId);
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

      let updatedMailingList = await browser.mailingLists.get(newMailingListId);
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

      let anotherContactId = await browser.contacts.create(firstBookId, {
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

      for (let operation of [
        "get",
        "update",
        "delete",
        "listMembers",
        "addMember",
        "removeMember",
      ]) {
        let args = [newMailingListId];
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

      for (let operation of ["get", "update", "delete"]) {
        let args = [newContactId];
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

      let contacts = await browser.contacts.list(firstBookId);
      browser.test.assertEq(0, contacts.length);

      browser.test.assertEq(0, events.length, "No events left unconsumed");
      browser.test.log("Completed contactRemovalTest");
    }

    async function outsideEventsTest() {
      browser.test.log("Starting outsideEventsTest");

      let [bookId, newBookPrefId] = await outsideEvent("createAddressBook");
      let [newBook] = await checkEvents([
        "addressBooks",
        "onCreated",
        { type: "addressBook", id: bookId },
      ]);
      browser.test.assertEq("external add", newBook.name);

      await outsideEvent("updateAddressBook", newBookPrefId);
      let [updatedBook] = await checkEvents([
        "addressBooks",
        "onUpdated",
        { type: "addressBook", id: bookId },
      ]);
      browser.test.assertEq("external edit", updatedBook.name);

      await outsideEvent("deleteAddressBook", newBookPrefId);
      await checkEvents(["addressBooks", "onDeleted", bookId]);

      let [parentId1, contactId] = await outsideEvent("createContact");
      let [newContact] = await checkEvents([
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
      let vCard4Photo = `PHOTO;VALUE=URL:data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAA
 ACQd1PeAAAADElEQVQI12P4//8/AAX+Av7czFnnAAAAAElFTkSuQmCC`.replaceAll(
        "\r\n",
        "\n"
      );

      browser.test.assertTrue(
        newContact.properties.vCard
          .replaceAll("\r\n", "\n")
          .includes(vCard4Photo),
        `vCard should include the correct Photo property [${newContact.properties.vCard}] vs [${vCard4Photo}]`
      );

      await outsideEvent("updateContact", contactId);
      let [updatedContact] = await checkEvents([
        "contacts",
        "onUpdated",
        { type: "contact", parentId: parentId1, id: contactId },
        { LastName: { oldValue: "add", newValue: "edit" } },
      ]);
      browser.test.assertEq("external", updatedContact.properties.FirstName);
      browser.test.assertEq("edit", updatedContact.properties.LastName);

      let [parentId2, listId] = await outsideEvent("createMailingList");
      let [newList] = await checkEvents([
        "mailingLists",
        "onCreated",
        { type: "mailingList", parentId: parentId2, id: listId },
      ]);
      browser.test.assertEq("external add", newList.name);

      await outsideEvent("updateMailingList", listId);
      let [updatedList] = await checkEvents([
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
      let listMembers = await browser.mailingLists.listMembers(listId);
      browser.test.assertEq(1, listMembers.length);

      await outsideEvent("removeMailingListMember", listId, contactId);
      await checkEvents(["mailingLists", "onMemberRemoved", listId, contactId]);

      await outsideEvent("deleteMailingList", listId);
      await checkEvents(["mailingLists", "onDeleted", parentId2, listId]);

      await outsideEvent("deleteContact", contactId);
      await checkEvents(["contacts", "onDeleted", parentId1, contactId]);

      let [parentId3, contactId3] = await outsideEvent(
        "createContactWithBothPhotoProps"
      );
      let [newContact3] = await checkEvents([
        "contacts",
        "onCreated",
        { type: "contact", parentId: parentId3, id: contactId3 },
      ]);
      browser.test.assertEq("external", newContact3.properties.FirstName);
      browser.test.assertEq("add", newContact3.properties.LastName);
      browser.test.assertTrue(
        newContact3.properties.vCard.includes("VERSION:4.0"),
        "vCard should be version 4.0"
      );

      // The card should not include vCard4Photo (which photoName points to), but the value already
      // stored in the vCard photo property.
      let vCard4Photo3 = `PHOTO;VALUE=URL:data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAA
 ACQd1PeAAAADElEQVQI12P4//8/AAX+Av7czFnnAAAAAElFTkSuQm==`.replaceAll(
        "\r\n",
        "\n"
      );

      browser.test.assertTrue(
        newContact3.properties.vCard
          .replaceAll("\r\n", "\n")
          .includes(vCard4Photo3),
        `vCard should include the correct Photo property [${newContact3.properties.vCard}] vs [${vCard4Photo3}]`
      );

      await outsideEvent("deleteContact", contactId3);
      await checkEvents(["contacts", "onDeleted", parentId3, contactId3]);

      let [parentId4, contactId4] = await outsideEvent("createContactV3");
      let [newContact4] = await checkEvents([
        "contacts",
        "onCreated",
        { type: "contact", parentId: parentId4, id: contactId4 },
      ]);
      browser.test.assertEq("external", newContact4.properties.FirstName);
      browser.test.assertEq("add", newContact4.properties.LastName);
      browser.test.assertTrue(
        newContact4.properties.vCard.includes("VERSION:3.0"),
        "vCard should be version 3.0"
      );

      let vCard3Photo4 = `PHOTO;ENCODING=B;TYPE=PNG:iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAAD
 ElEQVQI12P4//8/AAX+Av7czFnnAAAAAElFTkSuQmCC`;

      browser.test.assertTrue(
        newContact4.properties.vCard
          .replaceAll("\r\n", "\n")
          .includes(vCard3Photo4),
        `vCard should include the correct Photo property [${newContact4.properties.vCard}] vs [${vCard3Photo4}]`
      );

      await outsideEvent("deleteContact", contactId4);
      await checkEvents(["contacts", "onDeleted", parentId4, contactId4]);

      browser.test.log("Completed outsideEventsTest");
    }

    await addressBookTest();
    await contactsTest();
    await mailingListsTest();
    await contactRemovalTest();
    await outsideEventsTest();

    browser.test.notifyPass("addressBooks");
  }

  let extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": background,
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["addressBooks"],
    },
  });

  extension.onMessage("outsideEventsTest", (action, ...args) => {
    function findContact(id) {
      for (let child of parent.childCards) {
        if (child.UID == id) {
          return child;
        }
      }
      return null;
    }
    function findMailingList(id) {
      for (let list of parent.childNodes) {
        if (list.UID == id) {
          return list;
        }
      }
      return null;
    }

    let parent = MailServices.ab.getDirectory("jsaddrbook://abook.sqlite");
    switch (action) {
      case "createAddressBook": {
        let dirPrefId = MailServices.ab.newAddressBook(
          "external add",
          "",
          Ci.nsIAbManager.JS_DIRECTORY_TYPE
        );
        let book = MailServices.ab.getDirectoryFromId(dirPrefId);
        extension.sendMessage(book.UID, dirPrefId);
        return;
      }
      case "updateAddressBook": {
        let book = MailServices.ab.getDirectoryFromId(args[0]);
        book.dirName = "external edit";
        extension.sendMessage();
        return;
      }
      case "deleteAddressBook": {
        let book = MailServices.ab.getDirectoryFromId(args[0]);
        MailServices.ab.deleteAddressBook(book.URI);
        extension.sendMessage();
        return;
      }

      case "createContact": {
        let contact = Cc[
          "@mozilla.org/addressbook/cardproperty;1"
        ].createInstance(Ci.nsIAbCard);
        contact.firstName = "external";
        contact.lastName = "add";
        contact.primaryEmail = "test@invalid";
        contact.setProperty("PhotoName", "pixel.png");

        let newContact = parent.addCard(contact);
        extension.sendMessage(parent.UID, newContact.UID);
        return;
      }
      case "createContactWithBothPhotoProps": {
        let contact = new AddrBookCard();
        contact.setProperty("PhotoName", "pixel.png");
        contact.setProperty(
          "_vCard",
          `BEGIN:VCARD
VERSION:4.0
EMAIL;PREF=1:test@invalid
N:add;external;;;
UID:fd9aecf9-2453-4ba1-bec6-574a15bb380b
PHOTO;VALUE=URL:data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAA
 ACQd1PeAAAADElEQVQI12P4//8/AAX+Av7czFnnAAAAAElFTkSuQm==
END:VCARD`
        );
        let newContact = parent.addCard(contact);
        extension.sendMessage(parent.UID, newContact.UID);
        return;
      }
      case "createContactV3": {
        let contact = new AddrBookCard();
        contact.setProperty("PhotoName", "pixel.png");
        contact.setProperty(
          "_vCard",
          `BEGIN:VCARD
VERSION:3.0
EMAIL:test@invalid
N:add;external
UID:fd9aecf9-2453-4ba1-bec6-574a15bb380c
END:VCARD`
        );
        let newContact = parent.addCard(contact);
        extension.sendMessage(parent.UID, newContact.UID);
        return;
      }
      case "updateContact": {
        let contact = findContact(args[0]);
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
        let contact = findContact(args[0]);
        if (contact) {
          parent.deleteCards([contact]);
          extension.sendMessage();
          return;
        }
        break;
      }

      case "createMailingList": {
        let list = Cc[
          "@mozilla.org/addressbook/directoryproperty;1"
        ].createInstance(Ci.nsIAbDirectory);
        list.isMailList = true;
        list.dirName = "external add";

        let newList = parent.addMailList(list);
        extension.sendMessage(parent.UID, newList.UID);
        return;
      }
      case "updateMailingList": {
        let list = findMailingList(args[0]);
        if (list) {
          list.dirName = "external edit";
          list.editMailListToDatabase(null);
          extension.sendMessage();
          return;
        }
        break;
      }
      case "deleteMailingList": {
        let list = findMailingList(args[0]);
        if (list) {
          parent.deleteDirectory(list);
          extension.sendMessage();
          return;
        }
        break;
      }
      case "addMailingListMember": {
        let list = findMailingList(args[0]);
        let contact = findContact(args[1]);

        if (list && contact) {
          list.addCard(contact);
          equal(1, list.childCards.length);
          extension.sendMessage();
          return;
        }
        break;
      }
      case "removeMailingListMember": {
        let list = findMailingList(args[0]);
        let contact = findContact(args[1]);

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

  await IOUtils.remove(
    PathUtils.join(PathUtils.profileDir, "Photos", "pixel.png")
  );
});

registerCleanupFunction(() => {
  // Make sure any open database is given a chance to close.
  Services.startup.advanceShutdownPhase(
    Services.startup.SHUTDOWN_PHASE_APPSHUTDOWNCONFIRMED
  );
});
