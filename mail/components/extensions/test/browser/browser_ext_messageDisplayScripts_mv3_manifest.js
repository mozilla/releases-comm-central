/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

let gDefaultTabmail, gDefaultAbout3Pane, gDefaultMessagePane;

add_setup(async () => {
  const account = createAccount();
  const rootFolder = account.incomingServer.rootFolder;
  const folder = await createSubfolder(
    rootFolder,
    "messageDisplayScriptsManifestMV3"
  );
  await createMessages(folder, 5);

  gDefaultTabmail = document.getElementById("tabmail");
  gDefaultAbout3Pane =
    gDefaultTabmail.currentTabInfo.chromeBrowser.contentWindow;
  gDefaultAbout3Pane.displayFolder(folder.URI);
  gDefaultMessagePane =
    gDefaultAbout3Pane.messageBrowser.contentDocument.getElementById(
      "messagepane"
    );
});

async function selectMessageAndWaitForScript(index) {
  const scriptPromise = BrowserTestUtils.waitForEvent(
    window,
    "extension-scripts-added"
  );
  gDefaultAbout3Pane.threadTree.selectedIndex = index;
  await scriptPromise;
}

add_task(async function test_manifest_message_display_scripts_mv3() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "test.css": "body { background-color: green; }",
      "test.js": () => {
        document.body.setAttribute("foo", "bar");
      },
    },
    manifest: {
      manifest_version: 3,
      message_display_scripts: [
        {
          css: ["test.css"],
          js: ["test.js"],
        },
      ],
      permissions: ["messagesModify"],
    },
  });

  gDefaultAbout3Pane.threadTree.selectedIndex = 0;
  await awaitBrowserLoaded(gDefaultMessagePane);

  await extension.startup();

  await checkContent(gDefaultMessagePane, {
    backgroundColor: "rgba(0, 0, 0, 0)",
  });

  await selectMessageAndWaitForScript(1);
  await checkContent(gDefaultMessagePane, {
    backgroundColor: "rgb(0, 128, 0)",
    foo: "bar",
  });

  await extension.unload();
});
