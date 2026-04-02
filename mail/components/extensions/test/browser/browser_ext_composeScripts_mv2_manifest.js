/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

let gAccount;

add_setup(async () => {
  gAccount = createAccount();
  addIdentity(gAccount);
});

add_task(async function test_manifest_compose_scripts() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "test.css": "body { background-color: green; }",
      "test.js": () => {
        document.body.setAttribute("foo", "bar");
      },
    },
    manifest: {
      manifest_version: 2,
      compose_scripts: [
        {
          css: ["test.css"],
          js: ["test.js"],
        },
      ],
      permissions: ["compose"],
    },
  });

  await extension.startup();

  const composeWindow = await openComposeWindow(gAccount);
  await BrowserTestUtils.waitForEvent(composeWindow, "extension-scripts-added");

  const composeEditor = composeWindow.GetCurrentEditorElement();
  await checkContent(composeEditor, {
    backgroundColor: "rgb(0, 128, 0)",
    foo: "bar",
  });

  const closePromise = BrowserTestUtils.domWindowClosed(composeWindow);
  composeWindow.close();
  await closePromise;

  await extension.unload();
});
