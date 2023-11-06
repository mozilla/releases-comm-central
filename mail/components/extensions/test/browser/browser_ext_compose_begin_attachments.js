/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

const account = createAccount("pop3");
createAccount("local");
MailServices.accounts.defaultAccount = account;

addIdentity(account);

const rootFolder = account.incomingServer.rootFolder;
rootFolder.createSubfolder("test", null);
const folder = rootFolder.getChildNamed("test");
createMessages(folder, 4);

add_task(async function testAttachments() {
  const extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      const accounts = await browser.accounts.list();
      browser.test.assertEq(2, accounts.length, "number of accounts");
      const popAccount = accounts.find(a => a.type == "pop3");
      const folder = popAccount.folders.find(f => f.name == "test");
      const { messages } = await browser.messages.list(folder.id);

      const newTab = await browser.compose.beginNew({
        attachments: [
          { file: new File(["one"], "attachment1.txt") },
          { file: new File(["two"], "attachment-två.txt") },
        ],
      });

      let attachments = await browser.compose.listAttachments(newTab.id);
      browser.test.assertEq(2, attachments.length);
      browser.test.assertEq("attachment1.txt", attachments[0].name);
      browser.test.assertEq("attachment-två.txt", attachments[1].name);

      const replyTab = await browser.compose.beginReply(messages[0].id, {
        attachments: [
          { file: new File(["three"], "attachment3.txt") },
          { file: new File(["four"], "attachment4.txt") },
        ],
      });

      attachments = await browser.compose.listAttachments(replyTab.id);
      browser.test.assertEq(2, attachments.length);
      browser.test.assertEq("attachment3.txt", attachments[0].name);
      browser.test.assertEq("attachment4.txt", attachments[1].name);

      const forwardTab = await browser.compose.beginForward(
        messages[1].id,
        "forwardAsAttachment",
        {
          attachments: [
            { file: new File(["five"], "attachment5.txt") },
            { file: new File(["six"], "attachment6.txt") },
          ],
        }
      );

      attachments = await browser.compose.listAttachments(forwardTab.id);
      browser.test.assertEq(3, attachments.length);
      browser.test.assertEq(`${messages[1].subject}.eml`, attachments[0].name);
      browser.test.assertEq("attachment5.txt", attachments[1].name);
      browser.test.assertEq("attachment6.txt", attachments[2].name);

      // Forward inline adds attachments differently, so check it works too.

      const forwardTab2 = await browser.compose.beginForward(
        messages[2].id,
        "forwardInline",
        {
          attachments: [
            { file: new File(["seven"], "attachment7.txt") },
            { file: new File(["eight"], "attachment-åtta.txt") },
          ],
        }
      );

      attachments = await browser.compose.listAttachments(forwardTab2.id);
      browser.test.assertEq(2, attachments.length);
      browser.test.assertEq("attachment7.txt", attachments[0].name);
      browser.test.assertEq("attachment-åtta.txt", attachments[1].name);

      const newTab2 = await browser.compose.beginNew(messages[3].id, {
        attachments: [
          { file: new File(["nine"], "attachment9.txt") },
          { file: new File(["ten"], "attachment10.txt") },
        ],
      });

      attachments = await browser.compose.listAttachments(newTab2.id);
      browser.test.assertEq(2, attachments.length);
      browser.test.assertEq("attachment9.txt", attachments[0].name);
      browser.test.assertEq("attachment10.txt", attachments[1].name);

      await browser.tabs.remove(newTab.id);
      await browser.tabs.remove(replyTab.id);
      await browser.tabs.remove(forwardTab.id);
      await browser.tabs.remove(forwardTab2.id);
      await browser.tabs.remove(newTab2.id);

      browser.test.notifyPass();
    },
    manifest: {
      permissions: ["compose", "accountsRead", "messagesRead"],
    },
  });

  await extension.startup();
  await extension.awaitFinish();
  await extension.unload();
});
