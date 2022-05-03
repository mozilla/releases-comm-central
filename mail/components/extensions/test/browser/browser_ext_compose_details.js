/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

let account = createAccount();
let defaultIdentity = addIdentity(account);
let nonDefaultIdentity = addIdentity(account);
let gRootFolder = account.incomingServer.rootFolder;

gRootFolder.createSubfolder("test", null);
let gTestFolder = gRootFolder.getChildNamed("test");
createMessages(gTestFolder, 4);

gRootFolder.createSubfolder("drafts", null);
let gDraftsFolder = gRootFolder.getChildNamed("drafts");
gDraftsFolder.flags = Ci.nsMsgFolderFlags.Drafts;
createMessages(gDraftsFolder, 2);
let gDrafts = [...gDraftsFolder.messages];

// Verifies ComposeDetails of a given composer can be applied to a different
// composer, even if they have different compose formats. The composer should pick
// the matching body/plaintextBody value, if both are specified. The value for
// isPlainText is ignored by setComposeDetails.
add_task(async function testIsReflexive() {
  let files = {
    "background.js": async () => {
      // Start a new TEXT message.
      let createdTextWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew({
        plainTextBody: "This is some PLAIN text.",
        isPlainText: true,
      });
      let [createdTextWindow] = await createdTextWindowPromise;
      let [createdTextTab] = await browser.tabs.query({
        windowId: createdTextWindow.id,
      });

      // Get details, TEXT message.
      let textDetails = await browser.compose.getComposeDetails(
        createdTextTab.id
      );
      browser.test.assertTrue(textDetails.isPlainText);
      browser.test.assertTrue(
        textDetails.body.includes("This is some PLAIN text")
      );
      browser.test.assertEq(
        "This is some PLAIN text.",
        textDetails.plainTextBody
      );

      // Start a new HTML message.
      let createdHtmlWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew({
        body: "<p>This is some <i>HTML</i> text.</p>",
        isPlainText: false,
      });
      let [createdHtmlWindow] = await createdHtmlWindowPromise;
      let [createdHtmlTab] = await browser.tabs.query({
        windowId: createdHtmlWindow.id,
      });

      // Get details, HTML message.
      let htmlDetails = await browser.compose.getComposeDetails(
        createdHtmlTab.id
      );
      browser.test.assertFalse(htmlDetails.isPlainText);
      browser.test.assertTrue(
        htmlDetails.body.includes("<p>This is some <i>HTML</i> text.</p>")
      );
      browser.test.assertEq(
        "This is some HTML text.",
        htmlDetails.plainTextBody
      );

      // Set HTML details on HTML composer. It should not throw.
      await browser.compose.setComposeDetails(createdHtmlTab.id, htmlDetails);

      // Set TEXT details on TEXT composer. It should not throw.
      await browser.compose.setComposeDetails(createdTextTab.id, textDetails);

      // Set TEXT details on HTML composer and verify the changed content.
      await browser.compose.setComposeDetails(createdHtmlTab.id, textDetails);
      let htmlDetails2 = await browser.compose.getComposeDetails(
        createdHtmlTab.id
      );
      browser.test.assertFalse(htmlDetails2.isPlainText);
      browser.test.assertTrue(
        htmlDetails2.body.includes("This is some PLAIN text")
      );
      browser.test.assertEq(
        "This is some PLAIN text.",
        htmlDetails2.plainTextBody
      );

      // Set HTML details on TEXT composer and verify the changed content.
      await browser.compose.setComposeDetails(createdTextTab.id, htmlDetails);
      let textDetails2 = await browser.compose.getComposeDetails(
        createdTextTab.id
      );
      browser.test.assertTrue(textDetails2.isPlainText);
      browser.test.assertTrue(
        textDetails2.body.includes("This is some HTML text.")
      );
      browser.test.assertEq(
        "This is some HTML text.",
        textDetails2.plainTextBody
      );

      // Clean up.

      let removedHtmlWindowPromise = window.waitForEvent("windows.onRemoved");
      browser.windows.remove(createdHtmlWindow.id);
      await removedHtmlWindowPromise;

      let removedTextWindowPromise = window.waitForEvent("windows.onRemoved");
      browser.windows.remove(createdTextWindow.id);
      await removedTextWindowPromise;

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "compose"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function testType() {
  let files = {
    "background.js": async () => {
      let accounts = await browser.accounts.list();
      browser.test.assertEq(1, accounts.length, "number of accounts");

      let testFolder = accounts[0].folders.find(f => f.name == "test");
      let messages = (await browser.messages.list(testFolder)).messages;
      browser.test.assertEq(4, messages.length, "number of messages");

      let draftFolder = accounts[0].folders.find(f => f.name == "drafts");
      let drafts = (await browser.messages.list(draftFolder)).messages;
      browser.test.assertEq(2, drafts.length, "number of drafts");

      async function checkComposer(tab, expected) {
        browser.test.assertEq("object", typeof tab, "type of tab");
        browser.test.assertEq("number", typeof tab.id, "type of tab ID");
        browser.test.assertEq(
          "number",
          typeof tab.windowId,
          "type of window ID"
        );

        let details = await browser.compose.getComposeDetails(tab.id);
        browser.test.assertEq(expected.type, details.type, "type of composer");
        browser.test.assertEq(
          expected.relatedMessageId,
          details.relatedMessageId,
          `related message id (${details.type})`
        );
        await browser.windows.remove(tab.windowId);
      }

      let tests = [
        {
          funcName: "beginNew",
          args: [],
          expected: { type: "new", relatedMessageId: null },
        },
        {
          funcName: "beginReply",
          args: [messages[0].id],
          expected: { type: "reply", relatedMessageId: messages[0].id },
        },
        {
          funcName: "beginReply",
          args: [messages[1].id, "replyToAll"],
          expected: { type: "reply", relatedMessageId: messages[1].id },
        },
        {
          funcName: "beginReply",
          args: [messages[2].id, "replyToList"],
          expected: { type: "reply", relatedMessageId: messages[2].id },
        },
        {
          funcName: "beginReply",
          args: [messages[3].id, "replyToSender"],
          expected: { type: "reply", relatedMessageId: messages[3].id },
        },
        {
          funcName: "beginForward",
          args: [messages[0].id],
          expected: { type: "forward", relatedMessageId: messages[0].id },
        },
        {
          funcName: "beginForward",
          args: [messages[1].id, "forwardAsAttachment"],
          expected: { type: "forward", relatedMessageId: messages[1].id },
        },
        // Uses a different code path.
        {
          funcName: "beginForward",
          args: [messages[2].id, "forwardInline"],
          expected: { type: "forward", relatedMessageId: messages[2].id },
        },
        {
          funcName: "beginNew",
          args: [messages[3].id],
          expected: { type: "new", relatedMessageId: messages[3].id },
        },
      ];
      for (let test of tests) {
        browser.test.log(test.funcName);
        let tab = await browser.compose[test.funcName](...test.args);
        await checkComposer(tab, test.expected);
      }

      browser.tabs.onCreated.addListener(async tab => {
        // Bug 1702957, if composeWindow.GetComposeDetails() is not delayed
        // until the compose window is ready, it will overwrite the compose
        // fields.
        let details = await browser.compose.getComposeDetails(tab.id);
        browser.test.assertEq(
          "Johnny Jones <johnny@jones.invalid>",
          details.to.pop(),
          "Check Recipients in draft after calling getComposeDetails()"
        );

        let window = await browser.windows.get(tab.windowId);
        if (window.type == "messageCompose") {
          await checkComposer(tab, {
            type: "draft",
            relatedMessageId: drafts[0].id,
          });
          browser.test.notifyPass("Finish");
        }
      });
      browser.test.sendMessage("openDrafts");
    },
    "utils.js": await getUtilsJS(),
  };
  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose", "accountsRead", "messagesRead"],
    },
  });

  await extension.startup();

  // The first part of the test is done in the background script using the
  // compose API to open compose windows. For the second part we need to open
  // a draft, which is not possible with the compose API.
  await extension.awaitMessage("openDrafts");
  window.ComposeMessage(
    Ci.nsIMsgCompType.Draft,
    Ci.nsIMsgCompFormat.Default,
    gDraftsFolder,
    [gDraftsFolder.generateMessageURI(gDrafts[0].messageKey)]
  );

  await extension.awaitFinish("Finish");
  await extension.unload();
});

add_task(async function testFcc() {
  let files = {
    "background.js": async () => {
      async function checkWindow(createdTab, expected) {
        let state = await browser.compose.getComposeDetails(createdTab.id);

        browser.test.assertEq(
          expected.overrideDefaultFcc,
          state.overrideDefaultFcc,
          "overrideDefaultFcc should be correct"
        );

        if (expected.overrideDefaultFccFolder) {
          window.assertDeepEqual(
            state.overrideDefaultFccFolder,
            expected.overrideDefaultFccFolder,
            "overrideDefaultFccFolder should be correct"
          );
        } else {
          browser.test.assertEq(
            expected.overrideDefaultFccFolder,
            state.overrideDefaultFccFolder,
            "overrideDefaultFccFolder should be correct"
          );
        }

        if (expected.additionalFccFolder) {
          window.assertDeepEqual(
            state.additionalFccFolder,
            expected.additionalFccFolder,
            "additionalFccFolder should be correct"
          );
        } else {
          browser.test.assertEq(
            expected.additionalFccFolder,
            state.additionalFccFolder,
            "additionalFccFolder should be correct"
          );
        }

        await window.sendMessage("checkWindow", expected);
      }

      let [account] = await browser.accounts.list();
      let folder1 = account.folders.find(f => f.name == "Trash");
      let folder2 = account.folders.find(f => f.name == "drafts");

      // Start a new message.

      let createdWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew();
      let [createdWindow] = await createdWindowPromise;
      let [createdTab] = await browser.tabs.query({
        windowId: createdWindow.id,
      });

      await checkWindow(createdTab, {
        overrideDefaultFcc: false,
        overrideDefaultFccFolder: null,
        additionalFccFolder: "",
      });

      await browser.test.assertRejects(
        browser.compose.setComposeDetails(createdTab.id, {
          overrideDefaultFcc: true,
        }),
        "Setting overrideDefaultFcc to true requires setting overrideDefaultFccFolder as well",
        "browser.compose.setComposeDetails() should reject setting overrideDefaultFcc to true."
      );

      // Set folders.
      await browser.compose.setComposeDetails(createdTab.id, {
        overrideDefaultFccFolder: folder1,
        additionalFccFolder: folder2,
      });
      await checkWindow(createdTab, {
        overrideDefaultFcc: true,
        overrideDefaultFccFolder: folder1,
        additionalFccFolder: folder2,
      });

      // Setting overrideDefaultFcc true while it is already true should not change any values.
      await browser.compose.setComposeDetails(createdTab.id, {
        overrideDefaultFcc: true,
      });
      await checkWindow(createdTab, {
        overrideDefaultFcc: true,
        overrideDefaultFccFolder: folder1,
        additionalFccFolder: folder2,
      });

      // A no-op should not change any values.
      await browser.compose.setComposeDetails(createdTab.id, {});
      await checkWindow(createdTab, {
        overrideDefaultFcc: true,
        overrideDefaultFccFolder: folder1,
        additionalFccFolder: folder2,
      });

      // Disable fcc.
      await browser.compose.setComposeDetails(createdTab.id, {
        overrideDefaultFccFolder: "",
      });
      await checkWindow(createdTab, {
        overrideDefaultFcc: true,
        overrideDefaultFccFolder: "",
        additionalFccFolder: folder2,
      });

      // Disable additional fcc.
      await browser.compose.setComposeDetails(createdTab.id, {
        additionalFccFolder: "",
      });
      await checkWindow(createdTab, {
        overrideDefaultFcc: true,
        overrideDefaultFccFolder: "",
        additionalFccFolder: "",
      });

      // Clear override.
      await browser.compose.setComposeDetails(createdTab.id, {
        overrideDefaultFcc: false,
      });
      await checkWindow(createdTab, {
        overrideDefaultFcc: false,
        overrideDefaultFccFolder: null,
        additionalFccFolder: "",
      });

      await browser.test.assertRejects(
        browser.compose.setComposeDetails(createdTab.id, {
          overrideDefaultFccFolder: {
            path: "/bad",
            accountId: folder1.accountId,
          },
        }),
        `Invalid MailFolder: {accountId:${folder1.accountId}, path:/bad}`,
        "browser.compose.setComposeDetails() should reject, if an invalid folder is set as overrideDefaultFccFolder."
      );

      await browser.test.assertRejects(
        browser.compose.setComposeDetails(createdTab.id, {
          additionalFccFolder: { path: "/bad", accountId: folder1.accountId },
        }),
        `Invalid MailFolder: {accountId:${folder1.accountId}, path:/bad}`,
        "browser.compose.setComposeDetails() should reject, if an invalid folder is set as additionalFccFolder."
      );

      // Clean up.

      let removedWindowPromise = window.waitForEvent("windows.onRemoved");
      browser.windows.remove(createdWindow.id);
      await removedWindowPromise;

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "compose", "messagesRead"],
    },
  });

  extension.onMessage("checkWindow", async expected => {
    await checkComposeHeaders(expected);
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
