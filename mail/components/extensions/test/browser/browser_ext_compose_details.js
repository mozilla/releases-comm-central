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

add_task(async function testHeaders() {
  let files = {
    "background.js": async () => {
      async function checkWindow(expected) {
        let state = await browser.compose.getComposeDetails(createdTab.id);
        for (let field of [
          "to",
          "cc",
          "bcc",
          "replyTo",
          "followupTo",
          "newsgroups",
        ]) {
          if (field in expected) {
            browser.test.assertEq(
              expected[field].length,
              state[field].length,
              `${field} has the right number of values`
            );
            for (let i = 0; i < expected[field].length; i++) {
              browser.test.assertEq(expected[field][i], state[field][i]);
            }
          } else {
            browser.test.assertEq(0, state[field].length, `${field} is empty`);
          }
        }

        if (expected.from) {
          // From will always return a value, only check if explicitly requested.
          browser.test.assertEq(expected.from, state.from, "from is correct");
        }

        if (expected.subject) {
          browser.test.assertEq(
            expected.subject,
            state.subject,
            "subject is correct"
          );
        } else {
          browser.test.assertTrue(!state.subject, "subject is empty");
        }

        await window.sendMessage("checkWindow", expected);
      }

      let [account] = await browser.accounts.list();
      let [defaultIdentity, nonDefaultIdentity] = account.identities;

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
        empty: await browser.contacts.create(addressBook, {
          DisplayName: "Jim Moriarty",
          PrimaryEmail: "",
        }),
      };
      let list = await browser.mailingLists.create(addressBook, {
        name: "Holmes and Watson",
        description: "Tenants221B",
      });
      await browser.mailingLists.addMember(list, contacts.sherlock);
      await browser.mailingLists.addMember(list, contacts.john);

      let identityChanged = null;
      browser.compose.onIdentityChanged.addListener((tab, identityId) => {
        identityChanged = identityId;
      });

      // Start a new message.

      let createdWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew();
      let [createdWindow] = await createdWindowPromise;
      let [createdTab] = await browser.tabs.query({
        windowId: createdWindow.id,
      });

      await checkWindow({ identityId: defaultIdentity.id });

      let tests = [
        {
          // Change the identity and check default from.
          input: { identityId: nonDefaultIdentity.id },
          expected: {
            identityId: nonDefaultIdentity.id,
            from: "mochitest@localhost",
          },
          expectIdentityChanged: nonDefaultIdentity.id,
        },
        {
          // Don't change the identity.
          input: {},
          expected: {
            identityId: nonDefaultIdentity.id,
            from: "mochitest@localhost",
          },
        },
        {
          // Change the identity back again.
          input: { identityId: defaultIdentity.id },
          expected: {
            identityId: defaultIdentity.id,
            from: "mochitest@localhost",
          },
          expectIdentityChanged: defaultIdentity.id,
        },
        {
          // Single input, string.
          input: { to: "Greg Lestrade <greg@bakerstreet.invalid>" },
          expected: { to: ["Greg Lestrade <greg@bakerstreet.invalid>"] },
        },
        {
          // Empty string. Done here so we have something to clear.
          input: { to: "" },
          expected: {},
        },
        {
          // Single input, array with string.
          input: { to: ["John Watson <john@bakerstreet.invalid>"] },
          expected: { to: ["John Watson <john@bakerstreet.invalid>"] },
        },
        {
          // Name with a comma, not quoted per RFC 822. This is how
          // getComposeDetails returns names with a comma.
          input: { to: ["Holmes, Mycroft <mycroft@bakerstreet.invalid>"] },
          expected: { to: ["Holmes, Mycroft <mycroft@bakerstreet.invalid>"] },
        },
        {
          // Name with a comma, quoted per RFC 822. This should work too.
          input: { to: [`"Holmes, Mycroft" <mycroft@bakerstreet.invalid>`] },
          expected: { to: ["Holmes, Mycroft <mycroft@bakerstreet.invalid>"] },
        },
        {
          // Name and address with non-ASCII characters.
          input: { to: ["Jïm Morïarty <morïarty@bakerstreet.invalid>"] },
          expected: { to: ["Jïm Morïarty <morïarty@bakerstreet.invalid>"] },
        },
        {
          // Empty array. Done here so we have something to clear.
          input: { to: [] },
          expected: {},
        },
        {
          // Single input, array with contact.
          input: { to: [{ id: contacts.sherlock, type: "contact" }] },
          expected: { to: ["Sherlock Holmes <sherlock@bakerstreet.invalid>"] },
        },
        {
          // Null input. This should not clear the field.
          input: { to: null },
          expected: { to: ["Sherlock Holmes <sherlock@bakerstreet.invalid>"] },
        },
        {
          // Single input, array with mailing list.
          input: { to: [{ id: list, type: "mailingList" }] },
          expected: { to: ["Holmes and Watson <Tenants221B>"] },
        },
        {
          // Multiple inputs, string.
          input: {
            to:
              "Molly Hooper <molly@bakerstreet.invalid>, Mrs Hudson <mrs_hudson@bakerstreet.invalid>",
          },
          expected: {
            to: [
              "Molly Hooper <molly@bakerstreet.invalid>",
              "Mrs Hudson <mrs_hudson@bakerstreet.invalid>",
            ],
          },
        },
        {
          // Multiple inputs, array with strings.
          input: {
            to: [
              "Irene Adler <irene@bakerstreet.invalid>",
              "Mary Watson <mary@bakerstreet.invalid>",
            ],
          },
          expected: {
            to: [
              "Irene Adler <irene@bakerstreet.invalid>",
              "Mary Watson <mary@bakerstreet.invalid>",
            ],
          },
        },
        {
          // Multiple inputs, mixed.
          input: {
            to: [
              { id: contacts.sherlock, type: "contact" },
              "Mycroft Holmes <mycroft@bakerstreet.invalid>",
            ],
          },
          expected: {
            to: [
              "Sherlock Holmes <sherlock@bakerstreet.invalid>",
              "Mycroft Holmes <mycroft@bakerstreet.invalid>",
            ],
          },
        },
        {
          // A newsgroup, string.
          input: {
            to: "",
            newsgroups: "invalid.fake.newsgroup",
          },
          expected: {
            newsgroups: ["invalid.fake.newsgroup"],
          },
        },
        {
          // Multiple newsgroups, string.
          input: {
            newsgroups: "invalid.fake.newsgroup, invalid.real.newsgroup",
          },
          expected: {
            newsgroups: ["invalid.fake.newsgroup", "invalid.real.newsgroup"],
          },
        },
        {
          // A newsgroup, array with string.
          input: {
            newsgroups: ["invalid.real.newsgroup"],
          },
          expected: {
            newsgroups: ["invalid.real.newsgroup"],
          },
        },
        {
          // Multiple newsgroup, array with string.
          input: {
            newsgroups: ["invalid.fake.newsgroup", "invalid.real.newsgroup"],
          },
          expected: {
            newsgroups: ["invalid.fake.newsgroup", "invalid.real.newsgroup"],
          },
        },
        {
          // Change the subject.
          input: {
            newsgroups: "",
            subject: "This is a test",
          },
          expected: {
            subject: "This is a test",
          },
        },
        {
          // Clear the subject.
          input: {
            subject: "",
          },
          expected: {},
        },
        {
          // Override from with string address
          input: { from: "Mycroft Holmes <mycroft@bakerstreet.invalid>" },
          expected: { from: "Mycroft Holmes <mycroft@bakerstreet.invalid>" },
        },
        {
          // Override from with contact id
          input: { from: { id: contacts.sherlock, type: "contact" } },
          expected: { from: "Sherlock Holmes <sherlock@bakerstreet.invalid>" },
        },
        {
          // Override from with multiple string address
          input: {
            from:
              "Mycroft Holmes <mycroft@bakerstreet.invalid>, Mary Watson <mary@bakerstreet.invalid>",
          },
          expected: {
            errorDescription:
              "Setting from to multiple addresses should throw.",
            errorRejected:
              "ComposeDetails.from: Exactly one address instead of 2 is required.",
          },
        },
        {
          // Override from with empty string address 1
          input: { from: "Mycroft Holmes <>" },
          expected: {
            errorDescription:
              "Setting from to a display name without address should throw (#1).",
            errorRejected: "ComposeDetails.from: Invalid address: ",
          },
        },
        {
          // Override from with empty string address 2
          input: { from: "Mycroft Holmes" },
          expected: {
            errorDescription:
              "Setting from to a display name without address should throw (#2).",
            errorRejected:
              "ComposeDetails.from: Invalid address: Mycroft Holmes",
          },
        },
        {
          // Override from with contact id with empty address
          input: { from: { id: contacts.empty, type: "contact" } },
          expected: {
            errorDescription:
              "Setting from to a contact with an empty PrimaryEmail should throw.",
            errorRejected: `ComposeDetails.from: Contact does not have a valid email address: ${contacts.empty}`,
          },
        },
        {
          // Override from with invalid contact id
          input: { from: { id: "1234", type: "contact" } },
          expected: {
            errorDescription:
              "Setting from to a contact with an invalid contact id should throw.",
            errorRejected:
              "ComposeDetails.from: contact with id=1234 could not be found.",
          },
        },
        {
          // Override from with mailinglist id
          input: { from: { id: list, type: "mailingList" } },
          expected: {
            errorDescription: "Setting from to a mailing list should throw.",
            errorRejected: "ComposeDetails.from: Mailing list not allowed.",
          },
        },
        {
          // From may not be cleared.
          input: { from: "" },
          expected: {
            errorDescription: "Setting from to an empty string should throw.",
            errorRejected:
              "ComposeDetails.from: Address must not be set to an empty string.",
          },
        },
      ];
      for (let test of tests) {
        browser.test.log(`Checking input: ${JSON.stringify(test.input)}`);

        if (test.expected.errorRejected) {
          await browser.test.assertRejects(
            browser.compose.setComposeDetails(createdTab.id, test.input),
            test.expected.errorRejected,
            test.expected.errorDescription
          );
          continue;
        }

        await browser.compose.setComposeDetails(createdTab.id, test.input);
        await checkWindow(test.expected);

        if (test.expectIdentityChanged) {
          browser.test.assertEq(
            test.expectIdentityChanged,
            identityChanged,
            "onIdentityChanged fired"
          );
        } else {
          browser.test.assertEq(
            null,
            identityChanged,
            "onIdentityChanged not fired"
          );
        }
        identityChanged = null;
      }

      // Change the identity through the UI to check onIdentityChanged works.

      browser.test.log("Checking external identity change");
      await window.sendMessage("changeIdentity", nonDefaultIdentity.id);
      browser.test.assertEq(
        nonDefaultIdentity.id,
        identityChanged,
        "onIdentityChanged fired"
      );

      // Clean up.

      let removedWindowPromise = window.waitForEvent("windows.onRemoved");
      browser.windows.remove(createdWindow.id);
      await removedWindowPromise;

      await browser.addressBooks.delete(addressBook);
      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  let extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "addressBooks", "compose", "messagesRead"],
    },
  });

  extension.onMessage("checkWindow", async expected => {
    await checkComposeHeaders(expected);
    extension.sendMessage();
  });

  extension.onMessage("changeIdentity", newIdentity => {
    let composeWindows = [...Services.wm.getEnumerator("msgcompose")];
    is(composeWindows.length, 1);
    let composeDocument = composeWindows[0].document;

    let identityList = composeDocument.getElementById("msgIdentity");
    let identityItem = identityList.querySelector(
      `[identitykey="${newIdentity}"]`
    );
    ok(identityItem);
    identityList.selectedItem = identityItem;
    composeWindows[0].LoadIdentity(false);
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function testPlainTextBody() {
  let files = {
    "background.js": async () => {
      async function checkWindow(expected) {
        let state = await browser.compose.getComposeDetails(createdTab.id);
        for (let field of ["isPlainText"]) {
          if (field in expected) {
            browser.test.assertEq(
              expected[field],
              state[field],
              `Check value for ${field}`
            );
          }
        }
        // Windows and Linux return different line endings. Just check for the
        // actual line content. The expected value is given as an array, to
        // indicate the return value of getComposeDetails is not expected to be
        // a specific line ending.
        for (let field of ["plainTextBody"]) {
          if (field in expected) {
            browser.test.assertEq(
              JSON.stringify(expected[field]),
              JSON.stringify(state[field].replaceAll("\r\n", "\n").split("\n")),
              `Check value for ${field}`
            );
          }
        }
      }

      // Start a new message.
      let createdWindowPromise = window.waitForEvent("windows.onCreated");
      await browser.compose.beginNew({ isPlainText: true });
      let [createdWindow] = await createdWindowPromise;
      let [createdTab] = await browser.tabs.query({
        windowId: createdWindow.id,
      });

      await checkWindow({ isPlainText: true });

      let tests = [
        {
          // Set plaintextBody with Windows style newlines. The test will check
          // the content of the returned lines, independent of their endings.
          input: { isPlainText: true, plainTextBody: "123\r\n456\r\n789" },
          expected: { isPlainText: true, plainTextBody: ["123", "456", "789"] },
        },
        {
          // Set plaintextBody with Linux style newlines. The test will check
          // the content of the returned lines, independent of their endings.
          input: { isPlainText: true, plainTextBody: "ABC\nDEF\nGHI" },
          expected: { isPlainText: true, plainTextBody: ["ABC", "DEF", "GHI"] },
        },
      ];
      for (let test of tests) {
        browser.test.log(`Checking input: ${JSON.stringify(test.input)}`);
        await browser.compose.setComposeDetails(createdTab.id, test.input);
        await checkWindow(test.expected);
      }

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
      permissions: ["accountsRead", "compose"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function testBody() {
  // Open an compose window with HTML body.

  let params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  params.composeFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  params.composeFields.body = "<p>This is some <i>HTML</i> text.</p>";

  let htmlWindowPromise = BrowserTestUtils.domWindowOpened();
  MailServices.compose.OpenComposeWindowWithParams(null, params);
  let htmlWindow = await htmlWindowPromise;
  await BrowserTestUtils.waitForEvent(htmlWindow, "load");

  // Open another compose window with plain text body.

  params = Cc["@mozilla.org/messengercompose/composeparams;1"].createInstance(
    Ci.nsIMsgComposeParams
  );
  params.composeFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  params.format = Ci.nsIMsgCompFormat.PlainText;
  params.composeFields.body = "This is some plain text.";

  let plainTextComposeWindowPromise = BrowserTestUtils.domWindowOpened();
  MailServices.compose.OpenComposeWindowWithParams(null, params);
  let plainTextWindow = await plainTextComposeWindowPromise;
  await BrowserTestUtils.waitForEvent(plainTextWindow, "load");

  // Run the extension.

  let extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      let windows = await browser.windows.getAll({
        populate: true,
        windowTypes: ["messageCompose"],
      });
      let [htmlTabId, plainTextTabId] = windows.map(w => w.tabs[0].id);

      let plainTextBodyTag =
        '<body style="font-family: -moz-fixed; white-space: pre-wrap; width: 72ch;">';

      // Get details, HTML message.

      let htmlDetails = await browser.compose.getComposeDetails(htmlTabId);
      browser.test.log(JSON.stringify(htmlDetails));
      browser.test.assertTrue(!htmlDetails.isPlainText);
      browser.test.assertTrue(
        htmlDetails.body.includes("<p>This is some <i>HTML</i> text.</p>")
      );
      browser.test.assertEq(
        "This is some HTML text.",
        htmlDetails.plainTextBody
      );

      // Set details, HTML message.

      await browser.compose.setComposeDetails(htmlTabId, {
        body: htmlDetails.body.replace("<i>HTML</i>", "<code>HTML</code>"),
      });
      htmlDetails = await browser.compose.getComposeDetails(htmlTabId);
      browser.test.log(JSON.stringify(htmlDetails));
      browser.test.assertTrue(!htmlDetails.isPlainText);
      browser.test.assertTrue(
        htmlDetails.body.includes("<p>This is some <code>HTML</code> text.</p>")
      );
      browser.test.assertTrue(
        "This is some HTML text.",
        htmlDetails.plainTextBody
      );

      // Get details, plain text message.

      let plainTextDetails = await browser.compose.getComposeDetails(
        plainTextTabId
      );
      browser.test.log(JSON.stringify(plainTextDetails));
      browser.test.assertTrue(plainTextDetails.isPlainText);
      browser.test.assertTrue(
        plainTextDetails.body.includes(
          plainTextBodyTag + "This is some plain text.</body>"
        )
      );
      browser.test.assertEq(
        "This is some plain text.",
        plainTextDetails.plainTextBody
      );

      // Set details, plain text message.

      await browser.compose.setComposeDetails(plainTextTabId, {
        plainTextBody:
          plainTextDetails.plainTextBody + "\nIndeed, it is plain.",
      });
      plainTextDetails = await browser.compose.getComposeDetails(
        plainTextTabId
      );
      browser.test.log(JSON.stringify(plainTextDetails));
      browser.test.assertTrue(plainTextDetails.isPlainText);
      browser.test.assertTrue(
        plainTextDetails.body.includes(
          plainTextBodyTag +
            "This is some plain text.<br>Indeed, it is plain.</body>"
        )
      );
      browser.test.assertEq(
        "This is some plain text.\nIndeed, it is plain.",
        // Fold Windows line-endings \r\n to \n.
        plainTextDetails.plainTextBody.replace(/\r/g, "")
      );

      // Some things that should fail.

      try {
        await browser.compose.setComposeDetails(plainTextTabId, {
          body: "Trying to set HTML in a plain text message",
        });
        browser.test.fail(
          "calling setComposeDetails with these arguments should throw"
        );
      } catch (ex) {
        browser.test.succeed(`expected exception thrown: ${ex.message}`);
      }

      try {
        await browser.compose.setComposeDetails(htmlTabId, {
          body: "Trying to set HTML",
          plainTextBody: "and plain text at the same time",
        });
        browser.test.fail(
          "calling setComposeDetails with these arguments should throw"
        );
      } catch (ex) {
        browser.test.succeed(`expected exception thrown: ${ex.message}`);
      }

      try {
        await browser.compose.setComposeDetails(htmlTabId, {
          plainTextBody: "Trying to set a plain text in an html message.",
        });
        browser.test.fail(
          "calling setComposeDetails with these arguments should throw"
        );
      } catch (ex) {
        browser.test.succeed(`expected exception thrown: ${ex.message}`);
      }

      browser.test.notifyPass("finished");
    },
    manifest: {
      permissions: ["compose"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();

  // Check the HTML message was edited.

  ok(htmlWindow.gMsgCompose.composeHTML);
  let htmlDocument = htmlWindow.GetCurrentEditor().document;
  info(htmlDocument.body.innerHTML);
  is(htmlDocument.querySelectorAll("i").length, 0, "<i> was removed");
  is(htmlDocument.querySelectorAll("code").length, 1, "<code> was added");

  // Close the HTML message.

  let closePromises = [
    // If the window is not marked as dirty, this Promise will never resolve.
    BrowserTestUtils.promiseAlertDialog("extra1"),
    BrowserTestUtils.domWindowClosed(htmlWindow),
  ];
  Assert.ok(
    htmlWindow.ComposeCanClose(),
    "compose window should be allowed to close"
  );
  htmlWindow.close();
  await Promise.all(closePromises);

  // Check the plain text message was edited.

  ok(!plainTextWindow.gMsgCompose.composeHTML);
  let plainTextDocument = plainTextWindow.GetCurrentEditor().document;
  info(plainTextDocument.body.innerHTML);
  ok(/Indeed, it is plain\./.test(plainTextDocument.body.innerHTML));

  // Close the plain text message.

  closePromises = [
    // If the window is not marked as dirty, this Promise will never resolve.
    BrowserTestUtils.promiseAlertDialog("extra1"),
    BrowserTestUtils.domWindowClosed(plainTextWindow),
  ];
  Assert.ok(
    plainTextWindow.ComposeCanClose(),
    "compose window should be allowed to close"
  );
  plainTextWindow.close();
  await Promise.all(closePromises);
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
        await browser.windows.remove(tab.windowId);
      }

      let tests = [
        {
          funcName: "beginNew",
          args: [],
          expected: { type: "new" },
        },
        {
          funcName: "beginReply",
          args: [messages[0].id],
          expected: { type: "reply" },
        },
        {
          funcName: "beginReply",
          args: [messages[1].id, "replyToAll"],
          expected: { type: "reply" },
        },
        {
          funcName: "beginReply",
          args: [messages[2].id, "replyToList"],
          expected: { type: "reply" },
        },
        {
          funcName: "beginReply",
          args: [messages[3].id, "replyToSender"],
          expected: { type: "reply" },
        },
        {
          funcName: "beginForward",
          args: [messages[0].id],
          expected: { type: "forward" },
        },
        {
          funcName: "beginForward",
          args: [messages[1].id, "forwardAsAttachment"],
          expected: { type: "forward" },
        },
        // Uses a different code path.
        {
          funcName: "beginForward",
          args: [messages[2].id, "forwardInline"],
          expected: { type: "forward" },
        },
        {
          funcName: "beginNew",
          args: [messages[3].id],
          expected: { type: "new" },
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
          await checkComposer(tab, { type: "draft" });
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
    [gDraftsFolder.generateMessageURI(1)]
  );

  await extension.awaitFinish("Finish");
  await extension.unload();
});

add_task(async function testCJK() {
  let longCJKString = "안".repeat(400);

  // Open an compose window with HTML body.

  let params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  params.composeFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  params.composeFields.body = longCJKString;

  let htmlWindowPromise = BrowserTestUtils.domWindowOpened();
  MailServices.compose.OpenComposeWindowWithParams(null, params);
  let htmlWindow = await htmlWindowPromise;
  await BrowserTestUtils.waitForEvent(htmlWindow, "load");

  // Open another compose window with plain text body.

  params = Cc["@mozilla.org/messengercompose/composeparams;1"].createInstance(
    Ci.nsIMsgComposeParams
  );
  params.composeFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  params.format = Ci.nsIMsgCompFormat.PlainText;
  params.composeFields.body = longCJKString;

  let plainTextComposeWindowPromise = BrowserTestUtils.domWindowOpened();
  MailServices.compose.OpenComposeWindowWithParams(null, params);
  let plainTextWindow = await plainTextComposeWindowPromise;
  await BrowserTestUtils.waitForEvent(plainTextWindow, "load");

  // Run the extension.

  let extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      let longCJKString = "안".repeat(400);
      let windows = await browser.windows.getAll({
        populate: true,
        windowTypes: ["messageCompose"],
      });
      let [htmlTabId, plainTextTabId] = windows.map(w => w.tabs[0].id);

      let plainTextBodyTag =
        '<body style="font-family: -moz-fixed; white-space: pre-wrap; width: 72ch;">';

      // Get details, HTML message.

      let htmlDetails = await browser.compose.getComposeDetails(htmlTabId);
      browser.test.log(JSON.stringify(htmlDetails));
      browser.test.assertTrue(!htmlDetails.isPlainText);
      browser.test.assertTrue(
        htmlDetails.body.includes(longCJKString),
        "getComposeDetails.body from html composer returned CJK correctly"
      );
      browser.test.assertEq(
        longCJKString,
        htmlDetails.plainTextBody,
        "getComposeDetails.plainTextBody from html composer returned CJK correctly"
      );

      // Set details, HTML message.

      await browser.compose.setComposeDetails(htmlTabId, {
        body: longCJKString,
      });
      htmlDetails = await browser.compose.getComposeDetails(htmlTabId);
      browser.test.log(JSON.stringify(htmlDetails));
      browser.test.assertTrue(!htmlDetails.isPlainText);
      browser.test.assertTrue(
        htmlDetails.body.includes(longCJKString),
        "getComposeDetails.body from html composer returned CJK correctly as set by setComposeDetails"
      );
      browser.test.assertTrue(
        longCJKString,
        htmlDetails.plainTextBody,
        "getComposeDetails.plainTextBody from html composer returned CJK correctly as set by setComposeDetails"
      );

      // Get details, plain text message.

      let plainTextDetails = await browser.compose.getComposeDetails(
        plainTextTabId
      );
      browser.test.log(JSON.stringify(plainTextDetails));
      browser.test.assertTrue(plainTextDetails.isPlainText);
      browser.test.assertTrue(
        plainTextDetails.body.includes(plainTextBodyTag + longCJKString),
        "getComposeDetails.body from text composer returned CJK correctly"
      );
      browser.test.assertEq(
        longCJKString,
        plainTextDetails.plainTextBody,
        "getComposeDetails.plainTextBody from text composer returned CJK correctly"
      );

      // Set details, plain text message.

      await browser.compose.setComposeDetails(plainTextTabId, {
        plainTextBody: longCJKString,
      });
      plainTextDetails = await browser.compose.getComposeDetails(
        plainTextTabId
      );
      browser.test.log(JSON.stringify(plainTextDetails));
      browser.test.assertTrue(plainTextDetails.isPlainText);
      browser.test.assertTrue(
        plainTextDetails.body.includes(plainTextBodyTag + longCJKString),
        "getComposeDetails.body from text composer returned CJK correctly as set by setComposeDetails"
      );
      browser.test.assertEq(
        longCJKString,
        // Fold Windows line-endings \r\n to \n.
        plainTextDetails.plainTextBody.replace(/\r/g, ""),
        "getComposeDetails.plainTextBody from text composer returned CJK correctly as set by setComposeDetails"
      );

      browser.test.notifyPass("finished");
    },
    manifest: {
      permissions: ["compose"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();

  // Close the HTML message.

  let closePromises = [
    // If the window is not marked as dirty, this Promise will never resolve.
    BrowserTestUtils.promiseAlertDialog("extra1"),
    BrowserTestUtils.domWindowClosed(htmlWindow),
  ];
  Assert.ok(
    htmlWindow.ComposeCanClose(),
    "compose window should be allowed to close"
  );
  htmlWindow.close();
  await Promise.all(closePromises);

  // Close the plain text message.

  closePromises = [
    // If the window is not marked as dirty, this Promise will never resolve.
    BrowserTestUtils.promiseAlertDialog("extra1"),
    BrowserTestUtils.domWindowClosed(plainTextWindow),
  ];
  Assert.ok(
    plainTextWindow.ComposeCanClose(),
    "compose window should be allowed to close"
  );
  plainTextWindow.close();
  await Promise.all(closePromises);
});
