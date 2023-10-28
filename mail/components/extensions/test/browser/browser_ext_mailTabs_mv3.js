/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let account, rootFolder, subFolders;
const tabmail = document.getElementById("tabmail");

add_setup(async () => {
  account = createAccount();
  rootFolder = account.incomingServer.rootFolder;
  rootFolder.createSubfolder("test1", null);
  rootFolder.createSubfolder("test2", null);
  subFolders = {};
  for (const folder of rootFolder.subFolders) {
    subFolders[folder.name] = folder;
  }
  createMessages(subFolders.test1, 10);
  createMessages(subFolders.test2, 50);

  tabmail.currentTabInfo.folder = rootFolder;

  Services.prefs.setIntPref("extensions.webextensions.messagesPerPage", 10);
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("extensions.webextensions.messagesPerPage");
  });
  await new Promise(resolve => executeSoon(resolve));
});

add_task(async function test_MV3_event_pages() {
  const files = {
    "background.js": async () => {
      // Whenever the extension starts or wakes up, hasFired is set to false. In
      // case of a wake-up, the first fired event is the one that woke up the background.
      let hasFired = false;

      for (const eventName of [
        "onDisplayedFolderChanged",
        "onSelectedMessagesChanged",
      ]) {
        browser.mailTabs[eventName].addListener((...args) => {
          // Only send the first event after background wake-up, this should be
          // the only one expected.
          if (!hasFired) {
            hasFired = true;
            browser.test.sendMessage(`${eventName} received`, args);
          }
        });
      }

      browser.test.sendMessage("background started");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead"],
      browser_specific_settings: {
        gecko: { id: "mailtabs@mochi.test" },
      },
    },
  });

  function checkPersistentListeners({ primed }) {
    // A persistent event is referenced by its moduleName as defined in
    // ext-mails.json, not by its actual namespace.
    const persistent_events = [
      "mailTabs.onDisplayedFolderChanged",
      "mailTabs.onSelectedMessagesChanged",
    ];

    for (const event of persistent_events) {
      const [moduleName, eventName] = event.split(".");
      assertPersistentListeners(extension, moduleName, eventName, {
        primed,
      });
    }
  }

  await extension.startup();
  await extension.awaitMessage("background started");
  // The listeners should be persistent, but not primed.
  checkPersistentListeners({ primed: false });
  await extension.terminateBackground({ disableResetIdleForTest: true });
  // Verify the primed persistent listeners.
  checkPersistentListeners({ primed: true });

  // Select a folder.

  {
    tabmail.currentTabInfo.folder = subFolders.test1;
    const displayInfo = await extension.awaitMessage(
      "onDisplayedFolderChanged received"
    );
    Assert.deepEqual(
      [
        {
          active: true,
          type: "mail",
        },
        { name: "test1", path: "/test1" },
      ],
      [
        {
          active: displayInfo[0].active,
          type: displayInfo[0].type,
        },
        { name: displayInfo[1].name, path: displayInfo[1].path },
      ],
      "The primed onDisplayedFolderChanged event should return the correct values"
    );

    await extension.awaitMessage("background started");
    // The listeners should be persistent, but not primed.
    checkPersistentListeners({ primed: false });
    await extension.terminateBackground({ disableResetIdleForTest: true });
    // Verify the primed persistent listeners.
    checkPersistentListeners({ primed: true });
  }

  // Select multiple messages.

  {
    const messages = [...subFolders.test1.messages].slice(0, 5);
    tabmail.currentAbout3Pane.threadTree.selectedIndices = messages.map(m =>
      tabmail.currentAbout3Pane.gDBView.findIndexOfMsgHdr(m, false)
    );
    const displayInfo = await extension.awaitMessage(
      "onSelectedMessagesChanged received"
    );
    Assert.deepEqual(
      [
        "Big Meeting Today",
        "Small Party Tomorrow",
        "Huge Shindig Yesterday",
        "Tiny Wedding In a Fortnight",
        "Red Document Needs Attention",
      ],
      displayInfo[1].messages.reverse().map(e => e.subject),
      "The primed onSelectedMessagesChanged event should return the correct values"
    );
    Assert.deepEqual(
      {
        active: true,
        type: "mail",
      },
      {
        active: displayInfo[0].active,
        type: displayInfo[0].type,
      },
      "The primed onSelectedMessagesChanged event should return the correct values"
    );

    await extension.awaitMessage("background started");
    // The listeners should be persistent, but not primed.
    checkPersistentListeners({ primed: false });
  }

  await extension.unload();
});
