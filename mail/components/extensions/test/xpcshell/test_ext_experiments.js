/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
);

add_task(async function test_managers() {
  let account = createAccount();
  let folder = await createSubfolder(
    account.incomingServer.rootFolder,
    "test1"
  );
  await createMessages(folder, 5);

  let files = {
    "background.js": async () => {
      let [testAccount] = await browser.accounts.list();
      let testFolder = testAccount.folders.find(f => f.name == "test1");
      let {
        messages: [testMessage],
      } = await browser.messages.list(testFolder);

      let messageCount = await browser.testapi.testCanGetFolder(testFolder);
      browser.test.assertEq(5, messageCount);

      let convertedFolder = await browser.testapi.testCanConvertFolder();
      browser.test.assertEq(testFolder.accountId, convertedFolder.accountId);
      browser.test.assertEq(testFolder.path, convertedFolder.path);

      let subject = await browser.testapi.testCanGetMessage(testMessage.id);
      browser.test.assertEq(testMessage.subject, subject);

      let convertedMessage = await browser.testapi.testCanConvertMessage();
      browser.test.log(JSON.stringify(convertedMessage));
      browser.test.assertEq(testMessage.id, convertedMessage.id);
      browser.test.assertEq(testMessage.subject, convertedMessage.subject);

      let messageList = await browser.testapi.testCanStartMessageList();
      browser.test.assertEq(36, messageList.id.length);
      browser.test.assertEq(4, messageList.messages.length);
      browser.test.assertEq(
        testMessage.subject,
        messageList.messages[0].subject
      );

      messageList = await browser.messages.continueList(messageList.id);
      browser.test.assertEq(null, messageList.id);
      browser.test.assertEq(1, messageList.messages.length);
      browser.test.assertTrue(
        testMessage.subject != messageList.messages[0].subject
      );

      let [bookUID, contactUID, listUID] = await window.sendMessage("get UIDs");
      let [foundBook, foundContact, foundList] =
        await browser.testapi.testCanFindAddressBookItems(
          bookUID,
          contactUID,
          listUID
        );
      browser.test.assertEq("new book", foundBook.name);
      browser.test.assertEq("new contact", foundContact.properties.DisplayName);
      browser.test.assertEq("new list", foundList.name);

      browser.test.notifyPass("finished");
    },
  };
  let extension = ExtensionTestUtils.loadExtension({
    files: {
      ...files,
      "schema.json": [
        {
          namespace: "testapi",
          functions: [
            {
              name: "testCanGetFolder",
              type: "function",
              async: true,
              parameters: [
                {
                  name: "folder",
                  $ref: "folders.MailFolder",
                },
              ],
            },
            {
              name: "testCanConvertFolder",
              type: "function",
              async: true,
              parameters: [],
            },
            {
              name: "testCanGetMessage",
              type: "function",
              async: true,
              parameters: [
                {
                  name: "messageId",
                  type: "integer",
                },
              ],
            },
            {
              name: "testCanConvertMessage",
              type: "function",
              async: true,
              parameters: [],
            },
            {
              name: "testCanStartMessageList",
              type: "function",
              async: true,
              parameters: [],
            },
            {
              name: "testCanFindAddressBookItems",
              type: "function",
              async: true,
              parameters: [
                { name: "bookUID", type: "string" },
                { name: "contactUID", type: "string" },
                { name: "listUID", type: "string" },
              ],
            },
          ],
        },
      ],
      "implementation.js": () => {
        var { ExtensionCommon } = ChromeUtils.importESModule(
          "resource://gre/modules/ExtensionCommon.sys.mjs"
        );
        var { MailServices } = ChromeUtils.import(
          "resource:///modules/MailServices.jsm"
        );
        this.testapi = class extends ExtensionCommon.ExtensionAPI {
          getAPI(context) {
            return {
              testapi: {
                async testCanGetFolder({ accountId, path }) {
                  let realFolder = context.extension.folderManager.get(
                    accountId,
                    path
                  );
                  return realFolder.getTotalMessages(false);
                },
                async testCanConvertFolder() {
                  let realFolder = MailServices.accounts.allFolders.find(
                    f => f.name == "test1"
                  );
                  return context.extension.folderManager.convert(realFolder);
                },
                async testCanGetMessage(messageId) {
                  let realMessage =
                    context.extension.messageManager.get(messageId);
                  return realMessage.subject;
                },
                async testCanConvertMessage() {
                  let realFolder = MailServices.accounts.allFolders.find(
                    f => f.name == "test1"
                  );
                  let realMessage = [...realFolder.messages][0];
                  return context.extension.messageManager.convert(realMessage);
                },
                async testCanStartMessageList() {
                  let realFolder = MailServices.accounts.allFolders.find(
                    f => f.name == "test1"
                  );
                  return context.extension.messageManager.startMessageList(
                    realFolder.messages
                  );
                },
                async testCanFindAddressBookItems(
                  bookUID,
                  contactUID,
                  listUID
                ) {
                  let foundBook =
                    context.extension.addressBookManager.findAddressBookById(
                      bookUID
                    );
                  let foundContact =
                    context.extension.addressBookManager.findContactById(
                      contactUID
                    );
                  let foundList =
                    context.extension.addressBookManager.findMailingListById(
                      listUID
                    );

                  return [
                    await context.extension.addressBookManager.convert(
                      foundBook
                    ),
                    await context.extension.addressBookManager.convert(
                      foundContact
                    ),
                    await context.extension.addressBookManager.convert(
                      foundList
                    ),
                  ];
                },
              },
            };
          }
        };
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "addressBooks", "messagesRead"],
      experiment_apis: {
        testapi: {
          schema: "schema.json",
          parent: {
            scopes: ["addon_parent"],
            paths: [["testapi"]],
            script: "implementation.js",
          },
        },
      },
    },
  });

  let dirPrefId = MailServices.ab.newAddressBook(
    "new book",
    "",
    Ci.nsIAbManager.JS_DIRECTORY_TYPE
  );
  let book = MailServices.ab.getDirectoryFromId(dirPrefId);

  let contact = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
    Ci.nsIAbCard
  );
  contact.displayName = "new contact";
  contact.firstName = "new";
  contact.lastName = "contact";
  contact.primaryEmail = "new.contact@invalid";
  contact = book.addCard(contact);

  let list = Cc["@mozilla.org/addressbook/directoryproperty;1"].createInstance(
    Ci.nsIAbDirectory
  );
  list.isMailList = true;
  list.dirName = "new list";
  list = book.addMailList(list);
  list.addCard(contact);

  Services.prefs.setIntPref("extensions.webextensions.messagesPerPage", 4);

  await extension.startup();
  await extension.awaitMessage("get UIDs");
  extension.sendMessage(book.UID, contact.UID, list.UID);
  await extension.awaitFinish("finished");
  await extension.unload();

  Services.prefs.clearUserPref("extensions.webextensions.messagesPerPage");

  await new Promise(resolve => {
    let observer = {
      observe() {
        Services.obs.removeObserver(observer, "addrbook-directory-deleted");
        resolve();
      },
    };
    Services.obs.addObserver(observer, "addrbook-directory-deleted");
    MailServices.ab.deleteAddressBook(book.URI);
  });
});

registerCleanupFunction(() => {
  // Make sure any open database is given a chance to close.
  Services.startup.advanceShutdownPhase(
    Services.startup.SHUTDOWN_PHASE_APPSHUTDOWNCONFIRMED
  );
});
