/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { ExtensionTestUtils } = ChromeUtils.import(
  "resource://testing-common/ExtensionXPCShellUtils.jsm"
);

add_task(async function() {
  let account = createAccount();
  let inbox = await createSubfolder(account.incomingServer.rootFolder, "test1");

  let files = {
    "background.js": async () => {
      browser.messages.onNewMailReceived.addListener((folder, messageList) => {
        window.assertDeepEqual(
          { accountId: "account1", name: "test1", path: "/test1" },
          folder
        );
        browser.test.sendMessage("newMessages", messageList.messages);
      });
    },
    "utils.js": await getUtilsJS(),
  };
  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead"],
    },
  });

  await extension.startup();

  // Create a new message.

  await createMessages(inbox, 1);
  inbox.hasNewMessages = true;
  inbox.setNumNewMessages(1);
  inbox.biffState = Ci.nsIMsgFolder.nsMsgBiffState_NewMail;

  let inboxMessages = [...inbox.messages];
  let newMessages = await extension.awaitMessage("newMessages");
  equal(newMessages.length, 1);
  equal(newMessages[0].subject, inboxMessages[0].subject);

  // Create 2 more new messages.

  await createMessages(inbox, 2);
  inbox.hasNewMessages = true;
  inbox.setNumNewMessages(2);
  inbox.biffState = Ci.nsIMsgFolder.nsMsgBiffState_NewMail;

  inboxMessages = [...inbox.messages];
  newMessages = await extension.awaitMessage("newMessages");
  equal(newMessages.length, 2);
  equal(newMessages[0].subject, inboxMessages[1].subject);
  equal(newMessages[1].subject, inboxMessages[2].subject);

  await extension.unload();
});
