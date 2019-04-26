/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var {ExtensionTestUtils} = ChromeUtils.import("resource://testing-common/ExtensionXPCShellUtils.jsm");
ExtensionTestUtils.init(this);

async function run_test() {
  let account = createAccount();
  let rootFolder = account.incomingServer.rootFolder;
  rootFolder.createSubfolder("test1", null);
  let subFolders = [...rootFolder.subFolders];
  createMessages(subFolders[2], 5); // test1

  run_next_test();
}

add_task(async function test_managers() {
  let extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      let [testAccount] = await browser.accounts.list();
      let testFolder = testAccount.folders.find(f => f.name == "test1");
      let { messages: [testMessage] } = await browser.messages.list(testFolder);

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
      browser.test.assertEq(testMessage.subject, messageList.messages[0].subject);

      messageList = await browser.messages.continueList(messageList.id);
      browser.test.assertEq(null, messageList.id);
      browser.test.assertEq(1, messageList.messages.length);
      browser.test.assertTrue(testMessage.subject != messageList.messages[0].subject);

      browser.test.notifyPass("finished");
    },
    files: {
      "schema.json": JSON.stringify([{
        namespace: "testapi",
        functions: [{
          name: "testCanGetFolder",
          type: "function",
          async: true,
          parameters: [{
            name: "folder",
            $ref: "folders.MailFolder",
          }],
        }, {
          name: "testCanConvertFolder",
          type: "function",
          async: true,
          parameters: [],
        }, {
          name: "testCanGetMessage",
          type: "function",
          async: true,
          parameters: [{
            name: "messageId",
            type: "integer",
          }],
        }, {
          name: "testCanConvertMessage",
          type: "function",
          async: true,
          parameters: [],
        }, {
          name: "testCanStartMessageList",
          type: "function",
          async: true,
          parameters: [],
        }],
      }]),
      "implementation.js": `
        var { ExtensionCommon } = ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm");
        var { MailServices } = ChromeUtils.import("resource:///modules/MailServices.jsm");
        var testapi = class extends ExtensionCommon.ExtensionAPI {
          getAPI(context) {
            return {
              testapi: {
                async testCanGetFolder({accountId, path}) {
                  let realFolder = context.extension.folderManager.get(accountId, path);
                  return realFolder.getTotalMessages(false);
                },
                async testCanConvertFolder() {
                  let realFolder = [...MailServices.accounts.allFolders.enumerate()].find(f => f.name == "test1");
                  return context.extension.folderManager.convert(realFolder);
                },
                async testCanGetMessage(messageId) {
                  let realMessage = context.extension.messageManager.get(messageId);
                  return realMessage.subject;
                },
                async testCanConvertMessage() {
                  let realFolder = [...MailServices.accounts.allFolders.enumerate()].find(f => f.name == "test1");
                  let realMessage = realFolder.messages.getNext();
                  return context.extension.messageManager.convert(realMessage);
                },
                async testCanStartMessageList() {
                  let realFolder = [...MailServices.accounts.allFolders.enumerate()].find(f => f.name == "test1");
                  return context.extension.messageManager.startMessageList(realFolder.messages);
                },
              },
            };
          }
        };
      `,
    },
    manifest: {
      permissions: ["accountsRead", "messagesRead"],
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
  Services.prefs.setIntPref("extensions.webextensions.messagesPerPage", 4);
  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
  Services.prefs.clearUserPref("extensions.webextensions.messagesPerPage");
});
