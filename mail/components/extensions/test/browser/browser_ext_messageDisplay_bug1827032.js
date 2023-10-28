/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test to make sure messageDisplay.getDisplayedMessage() returns null for
 * non-message tabs.
 */
add_task(async function testGetDisplayedMessageInComposeTab() {
  const files = {
    "background.js": async () => {
      const composeTab = await browser.compose.beginNew();
      browser.test.assertEq(
        composeTab.type,
        "messageCompose",
        "Should have found a compose tab"
      );

      const msg = await browser.messageDisplay.getDisplayedMessage(
        composeTab.id
      );
      browser.test.assertTrue(!msg, "Should not have found a message");

      await browser.tabs.remove(composeTab.id);
      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose", "messagesRead"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
