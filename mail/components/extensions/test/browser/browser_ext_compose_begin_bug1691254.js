/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

requestLongerTimeout(2);

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

const account = createAccount("pop3");
createAccount("local");
MailServices.accounts.defaultAccount = account;

const defaultIdentity = addIdentity(account);
defaultIdentity.composeHtml = true;
const nonDefaultIdentity = addIdentity(account);
nonDefaultIdentity.composeHtml = false;

const rootFolder = account.incomingServer.rootFolder;
rootFolder.createSubfolder("test", null);
const folder = rootFolder.getChildNamed("test");
createMessages(folder, 4);

/* Test if line breaks in HTML are ignored (see bug 1691254). */
add_task(async function testBR() {
  const files = {
    "background.js": async () => {
      const accounts = await browser.accounts.list();
      browser.test.assertEq(2, accounts.length, "number of accounts");
      const popAccount = accounts.find(a => a.type == "pop3");
      const folder = popAccount.folders.find(f => f.name == "test");
      const { messages } = await browser.messages.list(folder);
      browser.test.assertEq(4, messages.length, "number of messages");

      const body = `<html><head>\r\n\r\n \r\n<meta http-equiv="content-type" content="text/html; charset=UTF-8">\r\n\r\n </head><body>\r\n \r\n<p><font face="monospace">This is some <br> HTML text</font><br>\r\n </p>\r\n\r\n \r\n\r\n\r\n</body></html>\r\n\r\n\r\n`;
      const tests = [
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

      for (const test of tests) {
        browser.test.log(JSON.stringify(test));
        const createdWindowPromise = window.waitForEvent("windows.onCreated");
        await browser.compose[test.funcName](...test.arguments);

        const [createdWindow] = await createdWindowPromise;
        browser.test.assertEq("messageCompose", createdWindow.type);
        browser.test.sendMessage("checkBody", test);
        await window.waitForMessage();
        const removedWindowPromise = window.waitForEvent("windows.onRemoved");
        browser.windows.remove(createdWindow.id);
        await removedWindowPromise;
      }

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead"],
    },
  });
  extension.onMessage("checkBody", async test => {
    const composeWindows = [...Services.wm.getEnumerator("msgcompose")];
    is(composeWindows.length, 1);
    await new Promise(resolve => composeWindows[0].setTimeout(resolve));

    is(composeWindows[0].IsHTMLEditor(), true, "composition mode");

    const editor = composeWindows[0].GetCurrentEditor();
    const actualHTML = editor.outputToString(
      "text/html",
      Ci.nsIDocumentEncoder.OutputRaw
    );
    const brCounts = (actualHTML.match(/<br>/g) || []).length;
    is(
      brCounts,
      2,
      `[${test.description}] Number of br tags in html is correct (${actualHTML}).`
    );

    const eqivCounts = (actualHTML.match(/http-equiv/g) || []).length;
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
