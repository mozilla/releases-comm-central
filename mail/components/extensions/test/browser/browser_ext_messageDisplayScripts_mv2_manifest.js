/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

let gAccount, gMessages;
let gDefaultTabmail, gDefaultAbout3Pane, gDefaultMessagePane;

add_setup(async () => {
  gAccount = createAccount();
  const rootFolder = gAccount.incomingServer.rootFolder;
  const folder = await createSubfolder(
    rootFolder,
    "messageDisplayScriptsManifest"
  );
  await createMessages(folder, 5);
  gMessages = [...folder.messages];

  gDefaultTabmail = document.getElementById("tabmail");
  gDefaultAbout3Pane =
    gDefaultTabmail.currentTabInfo.chromeBrowser.contentWindow;
  gDefaultAbout3Pane.displayFolder(folder.URI);
  gDefaultMessagePane =
    gDefaultAbout3Pane.messageBrowser.contentDocument.getElementById(
      "messagepane"
    );
});

async function checkMessageBody(expected) {
  await checkContent(gDefaultMessagePane, expected);
}

/**
 * Select a message and wait for the message display script to be injected.
 *
 * @param {number} index
 */
async function selectMessageAndWaitForScript(index) {
  // extension-scripts-added is dispatched on the top chrome window.
  const scriptPromise = BrowserTestUtils.waitForEvent(
    window,
    "extension-scripts-added"
  );
  gDefaultAbout3Pane.threadTree.selectedIndex = index;
  await scriptPromise;
}

/**
 * Tests that message_display_scripts declared in the manifest inject CSS and
 * JavaScript into message display pages.
 */
add_task(async function test_manifest_message_display_scripts() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "test.css": "body { background-color: green; }",
      "test.js": () => {
        document.body.setAttribute("foo", "bar");
      },
    },
    manifest: {
      manifest_version: 2,
      message_display_scripts: [
        {
          css: ["test.css"],
          js: ["test.js"],
        },
      ],
      permissions: ["messagesModify"],
    },
  });

  // Load a message before the extension starts.
  gDefaultAbout3Pane.threadTree.selectedIndex = 0;
  await awaitBrowserLoaded(gDefaultMessagePane);

  await extension.startup();

  // The already-loaded message should not be affected.
  await checkMessageBody({
    backgroundColor: "rgba(0, 0, 0, 0)",
  });

  // Load a new message — the manifest script should inject.
  await selectMessageAndWaitForScript(1);
  await checkMessageBody({
    backgroundColor: "rgb(0, 128, 0)",
    foo: "bar",
  });

  // Load another message to confirm it keeps working.
  await selectMessageAndWaitForScript(2);
  await checkMessageBody({
    backgroundColor: "rgb(0, 128, 0)",
    foo: "bar",
  });

  await extension.unload();
});

/**
 * Tests that the run_at manifest property controls when scripts are injected.
 */
add_task(async function test_manifest_message_display_scripts_runAt() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        browser.runtime.onMessage.addListener(message => {
          if (message?.runAt) {
            browser.test.sendMessage(`ScriptLoaded:${message.runAt}`, message);
          }
        });
        browser.test.sendMessage("Ready");
      },
      "start.js": () => {
        browser.runtime.sendMessage({
          runAt: "document_start",
          readyState: document?.readyState,
          body: !!document?.body,
        });
      },
      "end.js": () => {
        browser.runtime.sendMessage({
          runAt: "document_end",
          readyState: document?.readyState,
          body: !!document?.body,
        });
      },
      "idle.js": () => {
        browser.runtime.sendMessage({
          runAt: "document_idle",
          readyState: document?.readyState,
          body: !!document?.body,
        });
      },
    },
    manifest: {
      manifest_version: 2,
      background: { scripts: ["background.js"] },
      message_display_scripts: [
        { js: ["start.js"], run_at: "document_start" },
        { js: ["end.js"], run_at: "document_end" },
        { js: ["idle.js"], run_at: "document_idle" },
      ],
      permissions: ["messagesModify"],
    },
  });

  gDefaultAbout3Pane.threadTree.selectedIndex = 0;
  await awaitBrowserLoaded(gDefaultMessagePane);

  await extension.startup();
  await extension.awaitMessage("Ready");

  // Select a new message to trigger the scripts.
  gDefaultAbout3Pane.threadTree.selectedIndex = 1;

  const startResult = await extension.awaitMessage(
    "ScriptLoaded:document_start"
  );
  Assert.equal(
    startResult.readyState,
    "loading",
    "document_start should run during loading"
  );
  Assert.equal(
    startResult.body,
    false,
    "document_start should not have a body"
  );

  const endResult = await extension.awaitMessage("ScriptLoaded:document_end");
  Assert.equal(
    endResult.readyState,
    "interactive",
    "document_end should run during interactive"
  );
  Assert.equal(endResult.body, true, "document_end should have a body");

  const idleResult = await extension.awaitMessage("ScriptLoaded:document_idle");
  Assert.equal(
    idleResult.readyState,
    "complete",
    "document_idle should run during complete"
  );
  Assert.equal(idleResult.body, true, "document_idle should have a body");

  await extension.unload();
});
