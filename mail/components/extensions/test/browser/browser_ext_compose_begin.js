/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

let account = createAccount();
let defaultIdentity = addIdentity(account);
let nonDefaultIdentity = addIdentity(account);
let rootFolder = account.incomingServer.rootFolder;
rootFolder.createSubfolder("test", null);
let folder = rootFolder.getChildNamed("test");
createMessages(folder, 3);

add_task(async function testIdentity() {
  let files = {
    "background.js": async () => {
      let [account] = await browser.accounts.list();
      let [defaultIdentity, nonDefaultIdentity] = account.identities;
      let folder = account.folders.find(f => f.name == "test");
      let { messages } = await browser.messages.list(folder);
      browser.test.assertEq(3, messages.length);

      browser.test.log(defaultIdentity.id);
      browser.test.log(nonDefaultIdentity.id);

      let funcs = [
        { name: "beginNew", args: [] },
        { name: "beginReply", args: [messages[0].id] },
        { name: "beginForward", args: [messages[1].id, "forwardAsAttachment"] },
      ];
      let tests = [
        { args: [], isDefault: true },
        {
          args: [{ identityId: defaultIdentity.id }],
          isDefault: true,
        },
        {
          args: [{ identityId: nonDefaultIdentity.id }],
          isDefault: false,
        },
      ];
      for (let func of funcs) {
        browser.test.log(func.name);
        for (let test of tests) {
          browser.test.log(JSON.stringify(test.args));
          let tab = await browser.compose[func.name](
            ...func.args.concat(test.args)
          );
          browser.test.assertEq("object", typeof tab);
          browser.test.assertEq("number", typeof tab.id);
          browser.test.sendMessage("checkIdentity", test.isDefault);
          await window.waitForMessage();
        }
      }

      browser.test.notifyPass("finished");
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

  extension.onMessage("checkIdentity", async isDefault => {
    let composeWindows = [...Services.wm.getEnumerator("msgcompose")];
    is(composeWindows.length, 1);
    await new Promise(resolve => composeWindows[0].setTimeout(resolve));

    is(
      composeWindows[0].getCurrentIdentityKey(),
      isDefault ? defaultIdentity.key : nonDefaultIdentity.key
    );
    composeWindows[0].close();
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function testHeaders() {
  let files = {
    "background.js": async () => {
      async function checkHeaders(expected) {
        let [createdWindow] = await createdWindowPromise;
        browser.test.assertEq("messageCompose", createdWindow.type);
        browser.test.sendMessage("checkHeaders", expected);
        await window.waitForMessage();
        let removedWindowPromise = window.waitForEvent("windows.onRemoved");
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

      await browser.addressBooks.delete(addressBook);
      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  let extension = ExtensionTestUtils.loadExtension({
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

add_task(async function testBody() {
  let files = {
    "background.js": async () => {
      let emptyHTML = "<body>\n<p><br>\n</p>\n";
      let plainTextBodyTag =
        '<body style="font-family: -moz-fixed; white-space: pre-wrap; width: 72ch;">';
      let tests = [
        {
          // No arguments.
          expected: {
            isHTML: true,
            htmlIncludes: emptyHTML,
            plainTextIs: "\n",
          },
        },
        {
          // Empty arguments.
          arguments: {},
          expected: {
            isHTML: true,
            htmlIncludes: emptyHTML,
            plainTextIs: "\n",
          },
        },
        {
          // Empty HTML.
          arguments: { body: "" },
          expected: {
            isHTML: true,
            htmlIncludes: emptyHTML,
            plainTextIs: "\n",
          },
        },
        {
          // Empty plain text.
          arguments: { plainTextBody: "" },
          expected: {
            isHTML: true,
            htmlIncludes: emptyHTML,
            plainTextIs: "\n",
          },
        },
        {
          // Empty plain text and isPlainText.
          arguments: { plainTextBody: "", isPlainText: true },
          expected: { isHTML: false, plainTextIs: "" },
        },
        {
          // Non-empty HTML.
          arguments: { body: "<p>I'm an HTML message!</p>" },
          expected: {
            isHTML: true,
            htmlIncludes: "<body>\n<p>I'm an HTML message!</p>\n</body>",
            plainTextIs: "I'm an HTML message!",
          },
        },
        {
          // Non-empty plain text.
          arguments: { plainTextBody: "I'm a plain text message!" },
          expected: {
            isHTML: true,
            htmlIncludes: "<body>I'm a plain text message!</body>",
            plainTextIs: "I'm a plain text message!",
          },
        },
        {
          // Non-empty plain text and isPlainText.
          arguments: {
            plainTextBody: "I'm a plain text message!",
            isPlainText: true,
          },
          expected: {
            isHTML: false,
            htmlIncludes: plainTextBodyTag + "I'm a plain text message!</body>",
            plainTextIs: "I'm a plain text message!",
          },
        },
        {
          // HTML and plain text. Invalid.
          arguments: { body: "", plainTextBody: "" },
          throws: true,
        },
        {
          // HTML and isPlainText. Invalid.
          arguments: { body: "", isPlainText: true },
          throws: true,
        },
      ];

      for (let test of tests) {
        browser.test.log(JSON.stringify(test));
        let createdWindowPromise = window.waitForEvent("windows.onCreated");
        try {
          await browser.compose.beginNew(test.arguments);
          if (test.throws) {
            browser.test.fail(
              "calling beginNew with these arguments should throw"
            );
          }
        } catch (ex) {
          if (test.throws) {
            browser.test.succeed("expected exception thrown");
          } else {
            browser.test.fail(`unexpected exception thrown: ${ex.message}`);
          }
          continue;
        }

        let [createdWindow] = await createdWindowPromise;
        browser.test.assertEq("messageCompose", createdWindow.type);
        browser.test.sendMessage("checkBody", test.expected);
        await window.waitForMessage();
        let removedWindowPromise = window.waitForEvent("windows.onRemoved");
        browser.windows.remove(createdWindow.id);
        await removedWindowPromise;
      }

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
    },
  });
  extension.onMessage("checkBody", async expected => {
    let composeWindows = [...Services.wm.getEnumerator("msgcompose")];
    is(composeWindows.length, 1);
    await new Promise(resolve => composeWindows[0].setTimeout(resolve));

    is(composeWindows[0].IsHTMLEditor(), expected.isHTML, "composition mode");

    let editor = composeWindows[0].GetCurrentEditor();
    // Get the actual message body. Fold Windows line-endings \r\n to \n.
    let actualHTML = editor.outputToString("text/html", 0).replace(/\r/g, "");
    let actualPlainText = editor
      .outputToString("text/plain", 0)
      .replace(/\r/g, "");
    if ("htmlIncludes" in expected) {
      info(actualHTML);
      ok(actualHTML.includes(expected.htmlIncludes), "HTML content is correct");
    }
    if ("plainTextIs" in expected) {
      is(actualPlainText, expected.plainTextIs, "plainText content is correct");
    }

    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
