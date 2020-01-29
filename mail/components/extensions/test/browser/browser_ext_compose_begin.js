/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  let account = createAccount();
  addIdentity(account);
  let rootFolder = account.incomingServer.rootFolder;
  rootFolder.createSubfolder("test", null);
  let folder = rootFolder.getChildNamed("test");
  createMessages(folder, 3);

  window.gFolderTreeView.selectFolder(folder);
  await new Promise(resolve => executeSoon(resolve));

  let extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      function waitForEvent(eventName) {
        return new Promise(resolve => {
          let listener = window => {
            browser.windows[eventName].removeListener(listener);
            resolve(window);
          };
          browser.windows[eventName].addListener(listener);
        });
      }

      async function checkWindow(expected) {
        let createdWindow = await createdWindowPromise;
        browser.test.assertEq("messageCompose", createdWindow.type);
        browser.test.sendMessage("checkWindow", expected);
        await new Promise(resolve => {
          browser.test.onMessage.addListener(function listener() {
            browser.test.onMessage.removeListener(listener);
            resolve();
          });
        });
        let removedWindowPromise = waitForEvent("onRemoved");
        browser.windows.remove(createdWindow.id);
        await removedWindowPromise;
      }

      let accounts = await browser.accounts.list();
      browser.test.assertEq(1, accounts.length);
      let folder = accounts[0].folders.find(f => f.name == "test");
      let { messages } = await browser.messages.list(folder);
      browser.test.assertEq(3, messages.length);

      let addressBook = await browser.addressBooks.create({
        name: "Baker Street",
      });
      let contacts = {
        sherlock: await browser.contacts.create(addressBook, {
          DisplayName: "Sherlock Holmes",
          PrimaryEmail: "sherlock@bakerstreet.invalid",
        }),
        john: await browser.contacts.create(addressBook, {
          DisplayName: "John Watson",
          PrimaryEmail: "john@bakerstreet.invalid",
        }),
      };
      let list = await browser.mailingLists.create(addressBook, {
        name: "Holmes and Watson",
        description: "Tenants at 221B",
      });
      await browser.mailingLists.addMember(list, contacts.sherlock);
      await browser.mailingLists.addMember(list, contacts.john);

      let createdWindowPromise;

      // Start a new message.

      createdWindowPromise = waitForEvent("onCreated");
      await browser.compose.beginNew();
      await checkWindow({});

      // Start a new message, with a subject and recipients.

      createdWindowPromise = waitForEvent("onCreated");
      await browser.compose.beginNew({
        to: ["Sherlock Holmes <sherlock@bakerstreet.invalid>"],
        cc: ["John Watson <john@bakerstreet.invalid>"],
        subject: "Did you miss me?",
      });
      await checkWindow({
        to: "Sherlock Holmes <sherlock@bakerstreet.invalid>",
        cc: "John Watson <john@bakerstreet.invalid>",
        subject: "Did you miss me?",
      });

      // Start a new message, with a subject and recipients as contacts.

      createdWindowPromise = waitForEvent("onCreated");
      await browser.compose.beginNew({
        to: [{ id: contacts.sherlock, type: "contact" }],
        cc: [{ id: contacts.john, type: "contact" }],
        subject: "Did you miss me?",
      });
      await checkWindow({
        to: "Sherlock Holmes <sherlock@bakerstreet.invalid>",
        cc: "John Watson <john@bakerstreet.invalid>",
        subject: "Did you miss me?",
      });

      // Start a new message, with a subject and recipients as a mailing list.

      createdWindowPromise = waitForEvent("onCreated");
      await browser.compose.beginNew({
        to: [{ id: list, type: "mailingList" }],
        subject: "Did you miss me?",
      });
      await checkWindow({
        to: 'Holmes and Watson <"Tenants at 221B">',
        subject: "Did you miss me?",
      });

      // Reply to a message.

      createdWindowPromise = waitForEvent("onCreated");
      await browser.compose.beginReply(messages[0].id);
      await checkWindow({
        to: messages[0].author.replace(/"/g, ""),
        subject: `Re: ${messages[0].subject}`,
      });

      // Forward a message.

      createdWindowPromise = waitForEvent("onCreated");
      await browser.compose.beginForward(
        messages[1].id,
        "forwardAsAttachment",
        {
          to: ["Mycroft Holmes <mycroft@bakerstreet.invalid>"],
        }
      );
      await checkWindow({
        to: "Mycroft Holmes <mycroft@bakerstreet.invalid>",
        subject: `Fwd: ${messages[1].subject}`,
      });

      await browser.addressBooks.delete(addressBook);
      browser.test.notifyPass("finished");
    },
    manifest: { permissions: ["accountsRead", "addressBooks", "messagesRead"] },
  });

  extension.onMessage("checkWindow", async expected => {
    let composeWindows = [...Services.wm.getEnumerator("msgcompose")];
    is(composeWindows.length, 1);
    await new Promise(resolve => composeWindows[0].setTimeout(resolve));

    let fields = Cc[
      "@mozilla.org/messengercompose/composefields;1"
    ].createInstance(Ci.nsIMsgCompFields);
    composeWindows[0].Recipients2CompFields(fields);
    for (let field of ["to", "cc", "bcc", "replyTo"]) {
      if (field in expected) {
        is(fields[field], expected[field], `${field} is correct`);
      } else {
        is(fields[field], "", `${field} is empty`);
      }
    }

    let subject = composeWindows[0].document.getElementById("msgSubject").value;
    if ("subject" in expected) {
      is(subject, expected.subject, "subject is correct");
    } else {
      is(subject, "", "subject is empty");
    }

    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
