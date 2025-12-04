/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);

add_setup(async function () {
  MailServices.accounts.createLocalMailAccount();

  const [ewsServer] = await ServerTestUtils.createServers([
    ServerTestUtils.serverDefs.ews.plain,
  ]);

  const ewsAccount = MailServices.accounts.createAccount();
  ewsAccount.addIdentity(MailServices.accounts.createIdentity());
  ewsAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "test.test",
    "ews"
  );
  ewsAccount.incomingServer.setStringValue(
    "ews_url",
    `http://localhost:${ewsServer.port}/EWS/Exchange.asmx`
  );
  ewsAccount.incomingServer.prettyName = "EWS Account";
  ewsAccount.incomingServer.username = "user";
  ewsAccount.incomingServer.password = "password";
  const ewsRootFolder = ewsAccount.incomingServer.rootFolder;
  ewsAccount.incomingServer.performExpand(null);

  const ewsTestFolder = await TestUtils.waitForCondition(
    () => ewsRootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox),
    "waiting for EWS folders to sync"
  );

  const generator = new MessageGenerator();
  await ewsServer.addMessages("inbox", generator.makeMessages({}));
  ewsAccount.incomingServer.getNewMessages(ewsRootFolder, null, null);
  await TestUtils.waitForCondition(
    () => ewsTestFolder.getTotalMessages(false) == 10
  );
});

/**
 * Test if ews messages are considdered to be MESSAGE_PROTOCOLS and thus allow
 * content scripts to be injected.
 */
add_task(async function test() {
  const files = {
    "loaded.js": () => {
      browser.runtime.sendMessage({ type: "loaded" });
    },
    "background.js": async () => {
      const accounts = await browser.accounts.list();
      window.assertDeepEqual(
        accounts.map(e => ({ name: e.name, type: e.type })),
        [
          { name: "EWS Account", type: "ews" },
          { name: "Local Folders", type: "local" },
        ],
        "The found accounts should be correct"
      );
      const ewsAccount = accounts.find(a => a.type == "ews");

      await browser.scripting.messageDisplay.registerScripts([
        {
          id: "report-loaded",
          js: ["loaded.js"],
        },
      ]);

      browser.runtime.onMessage.addListener(message => {
        if (message.type === "loaded") {
          cleanUp();
        }
      });

      // Force open a message.
      const ewsMessages = await browser.messages.query({
        accountId: ewsAccount.id,
      });
      browser.test.assertEq(
        10,
        ewsMessages.messages.length,
        "Should find the correct number of messages"
      );
      const messageTab = await browser.messageDisplay.open({
        active: true,
        location: "tab",
        messageId: ewsMessages.messages[0].id,
      });

      const cleanUp = async () => {
        await browser.tabs.remove(messageTab.id);
        browser.test.notifyPass("finished");
      };
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead", "scripting"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
