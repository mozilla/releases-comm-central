/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

requestLongerTimeout(2);

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

let account = createAccount("pop3");
createAccount("local");
MailServices.accounts.defaultAccount = account;

let defaultIdentity = addIdentity(account);
defaultIdentity.composeHtml = true;
let nonDefaultIdentity = addIdentity(account);
nonDefaultIdentity.composeHtml = false;

let rootFolder = account.incomingServer.rootFolder;
rootFolder.createSubfolder("test", null);
let folder = rootFolder.getChildNamed("test");
createMessages(folder, 4);

add_task(async function testBody() {
  let files = {
    "background.js": async () => {
      let accounts = await browser.accounts.list();
      browser.test.assertEq(2, accounts.length, "number of accounts");
      let popAccount = accounts.find(a => a.type == "pop3");
      browser.test.assertEq(
        2,
        popAccount.identities.length,
        "number of identities"
      );
      let [htmlIdentity, plainTextIdentity] = popAccount.identities;
      let folder = popAccount.folders.find(f => f.name == "test");
      let { messages } = await browser.messages.list(folder);
      browser.test.assertEq(4, messages.length, "number of messages");

      let message0 = await browser.messages.getFull(messages[0].id);
      let message0body = message0.parts[0].body;

      // Editor content of a newly opened composeWindow without setting a body.
      let defaultHTML = "<body><p><br></p></body>";
      // Editor content after composeWindow.SetComposeDetails() has been used
      // to clear the body.
      let setEmptyHTML = "<body><br></body>";
      let plainTextBodyTag =
        '<body style="font-family: -moz-fixed; white-space: pre-wrap; width: 72ch;">';
      let tests = [
        {
          // No arguments.
          funcName: "beginNew",
          arguments: [],
          expected: {
            isHTML: true,
            htmlIncludes: defaultHTML,
            plainTextIs: "\n",
          },
        },
        {
          // Empty arguments.
          funcName: "beginNew",
          arguments: [{}],
          expected: {
            isHTML: true,
            htmlIncludes: defaultHTML,
            plainTextIs: "\n",
          },
        },
        {
          // Empty HTML.
          funcName: "beginNew",
          arguments: [{ body: "" }],
          expected: {
            isHTML: true,
            htmlIncludes: setEmptyHTML,
            plainTextIs: "",
          },
        },
        {
          // Empty plain text.
          funcName: "beginNew",
          arguments: [{ plainTextBody: "" }],
          expected: {
            isHTML: false,
            plainTextIs: "",
          },
        },
        {
          // Empty enforced plain text with default identity.
          funcName: "beginNew",
          arguments: [{ plainTextBody: "", isPlainText: true }],
          expected: {
            isHTML: false,
            plainTextIs: "",
          },
        },
        {
          // Empty HTML for plaintext identity.
          funcName: "beginNew",
          arguments: [{ body: "", identityId: plainTextIdentity.id }],
          expected: {
            isHTML: true,
            htmlIncludes: setEmptyHTML,
            plainTextIs: "",
          },
        },
        {
          // Empty plain text for plaintext identity.
          funcName: "beginNew",
          arguments: [{ plainTextBody: "", identityId: plainTextIdentity.id }],
          expected: {
            isHTML: false,
            plainTextIs: "",
          },
        },
        {
          // Empty HTML for plaintext identity enforcing HTML.
          funcName: "beginNew",
          arguments: [
            { body: "", identityId: plainTextIdentity.id, isPlainText: false },
          ],
          expected: {
            isHTML: true,
            htmlIncludes: setEmptyHTML,
            plainTextIs: "",
          },
        },
        {
          // Empty plain text and isPlainText.
          funcName: "beginNew",
          arguments: [{ plainTextBody: "", isPlainText: true }],
          expected: { isHTML: false, plainTextIs: "" },
        },
        {
          // Non-empty HTML.
          funcName: "beginNew",
          arguments: [{ body: "<p>I'm an HTML message!</p>" }],
          expected: {
            isHTML: true,
            htmlIncludes: "<body><p>I'm an HTML message!</p></body>",
            plainTextIs: "I'm an HTML message!",
          },
        },
        {
          // Non-empty plain text.
          funcName: "beginNew",
          arguments: [{ plainTextBody: "I'm a plain text message!" }],
          expected: {
            isHTML: false,
            htmlIncludes: plainTextBodyTag + "I'm a plain text message!</body>",
            plainTextIs: "I'm a plain text message!",
          },
        },
        {
          // Non-empty plain text and isPlainText.
          funcName: "beginNew",
          arguments: [
            {
              plainTextBody: "I'm a plain text message!",
              isPlainText: true,
            },
          ],
          expected: {
            isHTML: false,
            htmlIncludes: plainTextBodyTag + "I'm a plain text message!</body>",
            plainTextIs: "I'm a plain text message!",
          },
        },
        {
          // HTML body and plain text body without isPlainText. Use default format.
          funcName: "beginNew",
          arguments: [{ body: "I am HTML", plainTextBody: "I am TEXT" }],
          expected: {
            isHTML: true,
            htmlIncludes: "I am HTML",
            plainTextIs: "I am HTML",
          },
        },
        {
          // HTML body and plain text body with isPlainText. Use the specified
          // format.
          funcName: "beginNew",
          arguments: [
            {
              body: "I am HTML",
              plainTextBody: "I am TEXT",
              isPlainText: true,
            },
          ],
          expected: {
            isHTML: false,
            plainTextIs: "I am TEXT",
          },
        },
        {
          // Providing an HTML body only and isPlainText = true. Conflicting and
          // thus invalid.
          funcName: "beginNew",
          arguments: [{ body: "I am HTML", isPlainText: true }],
          throws: true,
        },
        {
          // Providing a plain text body only and isPlainText = false. Conflicting
          // and thus invalid.
          funcName: "beginNew",
          arguments: [{ plainTextBody: "I am TEXT", isPlainText: false }],
          throws: true,
        },
        {
          // HTML body only and isPlainText false.
          funcName: "beginNew",
          arguments: [{ body: "I am HTML", isPlainText: false }],
          expected: {
            isHTML: true,
            htmlIncludes: "I am HTML",
            plainTextIs: "I am HTML",
          },
        },
        {
          // Edit as new.
          funcName: "beginNew",
          arguments: [messages[0].id],
          expected: {
            isHTML: true,
            htmlIncludes: message0body.trim(),
          },
        },
        {
          // Edit as new with plaintext identity
          funcName: "beginNew",
          arguments: [messages[0].id, { identityId: plainTextIdentity.id }],
          expected: {
            isHTML: false,
            plainTextIs: message0body,
          },
        },
        {
          // Edit as new with default identity enforcing HTML
          funcName: "beginNew",
          arguments: [messages[0].id, { isPlainText: false }],
          expected: {
            isHTML: true,
            htmlIncludes: message0body.trim(),
          },
        },
        {
          // Edit as new with plaintext identity enforcing HTML by setting a body.
          funcName: "beginNew",
          arguments: [
            messages[0].id,
            {
              body: "<p>This is some HTML text</p>",
              identityId: plainTextIdentity.id,
            },
          ],
          expected: {
            isHTML: true,
            htmlIncludes: "<p>This is some HTML text</p>",
          },
        },
        {
          // Edit as new with html identity enforcing plain text by setting a plainTextBody.
          funcName: "beginNew",
          arguments: [
            messages[0].id,
            {
              plainTextBody: "This is some plain text",
              identityId: htmlIdentity.id,
            },
          ],
          expected: {
            isHTML: false,
            plainText: "This is some plain text",
          },
        },
        {
          // ForwardInline with plaintext identity enforcing HTML
          funcName: "beginForward",
          arguments: [
            messages[0].id,
            { identityId: plainTextIdentity.id, isPlainText: false },
          ],
          expected: {
            isHTML: true,
            htmlIncludes: message0body.trim(),
          },
        },
        {
          // Reply.
          funcName: "beginReply",
          arguments: [messages[0].id],
          expected: {
            isHTML: true,
            htmlIncludes: message0body.trim(),
          },
        },
        {
          // Forward inline.
          funcName: "beginForward",
          arguments: [messages[0].id],
          expected: {
            isHTML: true,
            htmlIncludes: message0body.trim(),
          },
        },
        {
          // Forward as attachment.
          funcName: "beginForward",
          arguments: [messages[0].id, "forwardAsAttachment"],
          expected: {
            isHTML: true,
            htmlIncludes: defaultHTML,
            plainText: "",
          },
        },
      ];

      for (let test of tests) {
        browser.test.log(JSON.stringify(test));
        let createdWindowPromise = window.waitForEvent("windows.onCreated");
        try {
          await browser.compose[test.funcName](...test.arguments);
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
        }

        let [createdWindow] = await createdWindowPromise;
        browser.test.assertEq("messageCompose", createdWindow.type);
        if (test.expected) {
          browser.test.sendMessage("checkBody", test.expected);
          await window.waitForMessage();
        }
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
      permissions: ["accountsRead", "messagesRead"],
    },
  });
  extension.onMessage("checkBody", async expected => {
    let composeWindows = [...Services.wm.getEnumerator("msgcompose")];
    is(composeWindows.length, 1);
    await new Promise(resolve => composeWindows[0].setTimeout(resolve));

    is(composeWindows[0].IsHTMLEditor(), expected.isHTML, "composition mode");

    let editor = composeWindows[0].GetCurrentEditor();
    // Get the actual message body. Fold Windows line-endings \r\n to \n.
    let actualHTML = editor
      .outputToString("text/html", Ci.nsIDocumentEncoder.OutputRaw)
      .replace(/\r/g, "");
    let actualPlainText = editor
      .outputToString("text/plain", Ci.nsIDocumentEncoder.OutputRaw)
      .replace(/\r/g, "");
    if ("htmlIncludes" in expected) {
      info(actualHTML);
      ok(
        actualHTML.includes(expected.htmlIncludes.replace(/\r/g, "")),
        `HTML content is correct (${actualHTML} vs ${expected.htmlIncludes})`
      );
    }
    if ("plainTextIs" in expected) {
      is(
        actualPlainText,
        expected.plainTextIs.replace(/\r/g, ""),
        "plainText content is correct"
      );
    }

    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
