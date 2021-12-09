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
          // HTML and plain text. Invalid.
          funcName: "beginNew",
          arguments: [{ body: "", plainTextBody: "" }],
          throws: true,
        },
        {
          // HTML and isPlainText. Invalid.
          funcName: "beginNew",
          arguments: [{ body: "", isPlainText: true }],
          throws: true,
        },
        {
          // HTML and isPlainText. Invalid.
          funcName: "beginNew",
          arguments: [{ plainTextBody: "", isPlainText: false }],
          throws: true,
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

/* Test if line breaks in HTML are ignored (see bug 1691254). */
add_task(async function testBR() {
  let files = {
    "background.js": async () => {
      let accounts = await browser.accounts.list();
      browser.test.assertEq(2, accounts.length, "number of accounts");
      let popAccount = accounts.find(a => a.type == "pop3");
      let folder = popAccount.folders.find(f => f.name == "test");
      let { messages } = await browser.messages.list(folder);
      browser.test.assertEq(4, messages.length, "number of messages");

      let body = `<html><head>\r\n\r\n \r\n<meta http-equiv="content-type" content="text/html; charset=UTF-8">\r\n\r\n </head><body>\r\n \r\n<p><font face="monospace">This is some <br> HTML text</font><br>\r\n </p>\r\n\r\n \r\n\r\n\r\n</body></html>\r\n\r\n\r\n`;
      let tests = [
        {
          description: "Begin new.",
          funcName: "beginNew",
          arguments: [{ body }],
        },
        {
          description: "Edit as new.",
          funcName: "beginNew",
          arguments: [messages[0].id, { body }],
        },
        {
          description: "Reply default.",
          funcName: "beginReply",
          arguments: [messages[0].id, { body }],
        },
        {
          description: "Reply as replyToSender.",
          funcName: "beginReply",
          arguments: [messages[0].id, "replyToSender", { body }],
        },
        {
          description: "Reply as replyToList.",
          funcName: "beginReply",
          arguments: [messages[0].id, "replyToList", { body }],
        },
        {
          description: "Reply as replyToAll.",
          funcName: "beginReply",
          arguments: [messages[0].id, "replyToAll", { body }],
        },
        {
          description: "Forward default.",
          funcName: "beginForward",
          arguments: [messages[0].id, { body }],
        },
        {
          description: "Forward inline.",
          funcName: "beginForward",
          arguments: [messages[0].id, "forwardInline", { body }],
        },
        {
          description: "Forward as attachment.",
          funcName: "beginForward",
          arguments: [messages[0].id, "forwardAsAttachment", { body }],
        },
      ];

      for (let test of tests) {
        browser.test.log(JSON.stringify(test));
        let createdWindowPromise = window.waitForEvent("windows.onCreated");
        await browser.compose[test.funcName](...test.arguments);

        let [createdWindow] = await createdWindowPromise;
        browser.test.assertEq("messageCompose", createdWindow.type);
        browser.test.sendMessage("checkBody", test);
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
      permissions: ["accountsRead", "messagesRead"],
    },
  });
  extension.onMessage("checkBody", async test => {
    let composeWindows = [...Services.wm.getEnumerator("msgcompose")];
    is(composeWindows.length, 1);
    await new Promise(resolve => composeWindows[0].setTimeout(resolve));

    is(composeWindows[0].IsHTMLEditor(), true, "composition mode");

    let editor = composeWindows[0].GetCurrentEditor();
    let actualHTML = editor.outputToString(
      "text/html",
      Ci.nsIDocumentEncoder.OutputRaw
    );
    let brCounts = (actualHTML.match(/<br>/g) || []).length;
    is(
      brCounts,
      2,
      `[${test.description}] Number of br tags in html is correct (${actualHTML}).`
    );

    let eqivCounts = (actualHTML.match(/http-equiv/g) || []).length;
    is(
      eqivCounts,
      1,
      `[${test.description}] Number of http-equiv meta tags in html is correct (${actualHTML}).`
    );
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
