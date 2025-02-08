/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_setup(() => {
  const gAccount = createAccount();
  const rootFolder = gAccount.incomingServer.rootFolder;
  rootFolder.createSubfolder("test", null);

  const subFolders = {};
  for (const folder of rootFolder.subFolders) {
    subFolders[folder.name] = folder;
  }
  createMessages(subFolders.test, 6);
});

// Ensure the UI is properly updated if junk and tags are updated simultaneously.
add_task(async function testMessagesUpdate() {
  const files = {
    "background.js": async () => {
      const [testFolder] = await browser.folders.query({ name: "test" });
      const { messages } = await browser.messages.list(testFolder.id);

      const msgId = messages[0].id;
      await browser.mailTabs.setSelectedMessages([msgId]);

      const tests = [
        {
          expectedAPI: {
            junk: false,
            tags: [],
          },
          expectedUI: {
            tags: [],
          },
        },
        {
          expectedAPI: {
            junk: true,
            tags: ["$label1"],
          },
          expectedUI: {
            tags: ["Important"],
          },
        },
        {
          expectedAPI: {
            junk: false,
            tags: ["$label2"],
          },
          expectedUI: {
            tags: ["Work"],
          },
        },
      ];

      for (const idx in tests) {
        await browser.messages.update(msgId, tests[idx].expectedAPI);

        const data = await browser.messages.get(msgId);
        window.assertDeepEqual(
          tests[idx].expectedAPI,
          data,
          `message properties for test ${idx} should be correct`
        );

        const [tagsFromUI] = await window.sendMessage("getTagsFromUI");
        window.assertDeepEqual(
          tests[idx].expectedUI.tags,
          tagsFromUI,
          `UI properties for test ${idx} should be correct`
        );
      }

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead", "messagesUpdate"],
    },
  });

  extension.onMessage("getTagsFromUI", () => {
    const win = Services.wm.getMostRecentWindow("mail:3pane");
    const messagePane =
      win.document.getElementById("tabmail").currentAboutMessage;
    const tags = [
      ...messagePane.document.querySelectorAll("#expandedtagsBox .tag"),
    ].map(e => e.textContent);
    extension.sendMessage(tags);
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
