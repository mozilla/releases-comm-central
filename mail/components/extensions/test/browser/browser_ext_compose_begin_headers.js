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

add_task(async function testHeaders() {
  const files = {
    "background.js": async () => {
      async function checkHeaders(expected) {
        const [createdWindow] = await createdWindowPromise;
        browser.test.assertEq("messageCompose", createdWindow.type);
        browser.test.sendMessage("checkHeaders", expected);
        await window.waitForMessage();
        const removedWindowPromise = window.waitForEvent("windows.onRemoved");
        browser.windows.remove(createdWindow.id);
        await removedWindowPromise;
      }

      const accounts = await browser.accounts.list();
      browser.test.assertEq(2, accounts.length, "number of accounts");
      const popAccount = accounts.find(a => a.type == "pop3");
      const folder = popAccount.folders.find(f => f.name == "test");
      const { messages } = await browser.messages.list(folder.id);
      browser.test.assertEq(4, messages.length, "number of messages");

      const addressBook = await browser.addressBooks.create({
        name: "Baker Street",
      });
      const contacts = {
        sherlock: await browser.contacts.create(addressBook, {
          DisplayName: "Sherlock Holmes",
          PrimaryEmail: "sherlock@bakerstreet.invalid",
        }),
        john: await browser.contacts.create(addressBook, {
          DisplayName: "John Watson",
          PrimaryEmail: "john@bakerstreet.invalid",
        }),
      };
      const list = await browser.mailingLists.create(addressBook, {
        name: "Holmes and Watson",
        description: "Tenants221B",
      });
      await browser.mailingLists.addMember(list, contacts.sherlock);
      await browser.mailingLists.addMember(list, contacts.john);

      let createdWindowPromise;

      // Start a new message.

      createdWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew();
      await checkHeaders({});

      // Start a new message, with a subject and recipients as strings.

      createdWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew({
        to: "Sherlock Holmes <sherlock@bakerstreet.invalid>",
        cc: "John Watson <john@bakerstreet.invalid>",
        subject: "Did you miss me?",
      });
      await checkHeaders({
        to: ["Sherlock Holmes <sherlock@bakerstreet.invalid>"],
        cc: ["John Watson <john@bakerstreet.invalid>"],
        subject: "Did you miss me?",
      });

      // Start a new message, with a subject and recipients as string arrays.

      createdWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew({
        to: ["Sherlock Holmes <sherlock@bakerstreet.invalid>"],
        cc: ["John Watson <john@bakerstreet.invalid>"],
        subject: "Did you miss me?",
      });
      await checkHeaders({
        to: ["Sherlock Holmes <sherlock@bakerstreet.invalid>"],
        cc: ["John Watson <john@bakerstreet.invalid>"],
        subject: "Did you miss me?",
      });

      // Start a new message, with a subject and recipients as contacts.

      createdWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew({
        to: [{ id: contacts.sherlock, type: "contact" }],
        cc: [{ id: contacts.john, type: "contact" }],
        subject: "Did you miss me?",
      });
      await checkHeaders({
        to: ["Sherlock Holmes <sherlock@bakerstreet.invalid>"],
        cc: ["John Watson <john@bakerstreet.invalid>"],
        subject: "Did you miss me?",
      });

      // Start a new message, with a subject and recipients as a mailing list.

      createdWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew({
        to: [{ id: list, type: "mailingList" }],
        subject: "Did you miss me?",
      });
      await checkHeaders({
        to: ["Holmes and Watson <Tenants221B>"],
        subject: "Did you miss me?",
      });

      // Reply to a message.

      createdWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginReply(messages[0].id);
      await checkHeaders({
        to: [messages[0].author.replace(/"/g, "")],
        subject: `Re: ${messages[0].subject}`,
      });

      // Forward a message.

      createdWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginForward(
        messages[1].id,
        "forwardAsAttachment",
        {
          to: ["Mycroft Holmes <mycroft@bakerstreet.invalid>"],
        }
      );
      await checkHeaders({
        to: ["Mycroft Holmes <mycroft@bakerstreet.invalid>"],
        subject: `Fwd: ${messages[1].subject}`,
      });

      // Forward a message inline. This uses a different code path.

      createdWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginForward(messages[2].id, "forwardInline", {
        to: ["Mycroft Holmes <mycroft@bakerstreet.invalid>"],
      });
      await checkHeaders({
        to: ["Mycroft Holmes <mycroft@bakerstreet.invalid>"],
        subject: `Fwd: ${messages[2].subject}`,
      });

      await browser.addressBooks.delete(addressBook);
      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "addressBooks", "messagesRead"],
    },
  });

  extension.onMessage("checkHeaders", async expected => {
    await checkComposeHeaders(expected);
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
