/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

let account = createAccount("pop3");
createAccount("local");
MailServices.accounts.defaultAccount = account;

addIdentity(account);

let rootFolder = account.incomingServer.rootFolder;
rootFolder.createSubfolder("test", null);
let folder = rootFolder.getChildNamed("test");
createMessages(folder, 4);

add_task(async function test_update_plaintext_before_send() {
  let files = {
    "background.js": async () => {
      let accounts = await browser.accounts.list();
      browser.test.assertEq(2, accounts.length, "number of accounts");
      let popAccount = accounts.find(a => a.type == "pop3");
      let folder = popAccount.folders.find(f => f.name == "test");
      let { messages } = await browser.messages.list(folder);
      browser.test.assertEq(4, messages.length, "number of messages");

      // Setup onBeforeSend listener.

      let listener = async tab => {
        let details1 = await browser.compose.getComposeDetails(tab.id);
        details1.plainTextBody =
          "Pre Text\n\n" + details1.plainTextBody + "\n\nPost Text";
        await browser.compose.setComposeDetails(tab.id, details1);
        await new Promise(resolve => window.setTimeout(resolve));

        let details2 = await browser.compose.getComposeDetails(tab.id);
        browser.test.assertEq(
          details1.plainTextBody,
          details2.plainTextBody,
          "PlainTextBody should be correct after updated in onBeforeSend"
        );

        return {};
      };
      browser.compose.onBeforeSend.addListener(listener);

      // Reply to a message.

      let createdWindowPromise = window.waitForEvent("windows.onCreated");
      let tab = await browser.compose.beginReply(messages[0].id, {
        isPlainText: true,
      });
      await createdWindowPromise;

      // Send message and trigger onBeforeSend event.

      await new Promise(resolve => window.setTimeout(resolve));
      let closedWindowPromise = window.waitForEvent("windows.onRemoved");
      await browser.compose.sendMessage(tab.id, { mode: "sendLater" });
      await closedWindowPromise;

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose", "accountsRead", "messagesRead", "compose.send"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
