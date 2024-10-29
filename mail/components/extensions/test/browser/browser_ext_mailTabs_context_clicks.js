/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var gAccount;
var gMessages;
var gFolder;
var gAbout3Pane;

add_setup(async () => {
  gAccount = createAccount();
  const rootFolder = gAccount.incomingServer.rootFolder;
  rootFolder.createSubfolder("test0", null);

  const subFolders = {};
  for (const folder of rootFolder.subFolders) {
    subFolders[folder.name] = folder;
  }
  createMessages(subFolders.test0, {
    count: 1,
  });
  createMessages(subFolders.test0, {
    count: 3,
    msgsPerThread: 3,
  });

  gFolder = subFolders.test0;
  gMessages = [...subFolders.test0.messages];

  await ensure_table_view();

  gAbout3Pane = document.getElementById("tabmail").currentAbout3Pane;
  gAbout3Pane.displayFolder(gFolder);
  gAbout3Pane.threadTree.selectedIndex = 0;
});

/**
 * The goal of this test is to test the behavior of a context click on a message
 * in the thread pane (not) affecting the return value of
 *  - mailTabs.getSelectedMessages()
 *  - mailTabs.onSelectedMessagesChanged
 *  - messageDisplay.getDisplayedMessages()
 *  - menus.onClicked
 */
add_task(async function test_context_click_in_threadpane() {
  const files = {
    "background.js": async () => {
      // Add a menu entry to trigger menus.onShown.
      await new Promise(resolve => {
        browser.menus.create(
          {
            id: "threadpane",
            title: "Entry in thread pane",
            contexts: ["message_list"],
          },
          resolve
        );
      });

      const selectEvents = [];
      const selectListener = (_tab, messages) => {
        selectEvents.push(messages);
      };

      const row0_thread_of_three = [
        {
          author: "Chris Clarke <chris@clarke.invalid>",
          subject: "Small Party Tomorrow",
          headerMessageId: "1@made.up.invalid",
        },
        {
          author: "David Davol <david@davol.invalid>",
          subject: "Small Party Tomorrow",
          headerMessageId: "2@made.up.invalid",
        },
        {
          author: "Chris Clarke <chris@clarke.invalid>",
          subject: "Small Party Tomorrow",
          headerMessageId: "3@made.up.invalid",
        },
      ];
      const row1_single_message = [
        {
          author: "Andy Anway <andy@anway.invalid>",
          subject: "Big Meeting Today",
          headerMessageId: "0@made.up.invalid",
        },
      ];

      // The selected messages should be the collapsed thread from row #0.
      window.assertDeepEqual(
        {
          id: null,
          messages: row0_thread_of_three,
        },
        await browser.mailTabs.getSelectedMessages(),
        "The rv of getSelectedMessages() should be correct"
      );

      // The dispayed messages should be the collapsed thread from row #0.
      window.assertDeepEqual(
        {
          id: null,
          messages: row0_thread_of_three,
        },
        await browser.messageDisplay.getDisplayedMessages(),
        "The rv of getDisplayedMessages() should be correct"
      );

      // Register a listener for onSelectedMessagesChanged.
      browser.mailTabs.onSelectedMessagesChanged.addListener(selectListener);

      // Context-Click on row #1.
      const onShownRow1 = Promise.withResolvers();
      const onShownListenerRow1 = info => {
        window.assertDeepEqual(
          {
            selectedMessages: {
              id: null,
              messages: row1_single_message,
            },
          },
          info,
          "The rv of the menus.onShown event should be correct"
        );
        browser.menus.onShown.removeListener(onShownListenerRow1);
        onShownRow1.resolve();
      };
      browser.menus.onShown.addListener(onShownListenerRow1);

      await window.sendMessage("context-click on message", "1");
      await onShownRow1.promise;

      // The selected messages should still be the collapsed thread from row #0.
      window.assertDeepEqual(
        {
          id: null,
          messages: row0_thread_of_three,
        },
        await browser.mailTabs.getSelectedMessages(),
        "The rv of getSelectedMessages() should be correct"
      );

      // The dispayed messages should still be the collapsed thread from row #0.
      window.assertDeepEqual(
        {
          id: null,
          messages: row0_thread_of_three,
        },
        await browser.messageDisplay.getDisplayedMessages(),
        "The rv of getDisplayedMessages() should be correct"
      );

      // Verify that no selection event was fired.
      browser.mailTabs.onSelectedMessagesChanged.removeListener(selectListener);
      browser.test.assertEq(
        0,
        selectEvents.length,
        "There should have been no selection event"
      );

      // Verify that the context-menu is still open, and close it.
      await new Promise(resolve => {
        const listener = () => {
          browser.menus.onHidden.removeListener(listener);
          resolve();
        };
        browser.menus.onHidden.addListener(listener);
        browser.test.sendMessage("close-context-menu");
      });

      // Click on row #1, to select the single message.
      await new Promise(resolve => {
        const listener = (_tab, messages) => {
          browser.mailTabs.onSelectedMessagesChanged.removeListener(listener);
          window.assertDeepEqual(
            {
              id: null,
              messages: row1_single_message,
            },
            messages,
            "The rv of the onSelectedMessagesChanged event should be correct"
          );
          resolve();
        };
        browser.mailTabs.onSelectedMessagesChanged.addListener(listener);
        browser.test.sendMessage("click on message", "1");
      });

      // Verify the rv of getSelectedMessages() after the single message was
      // selected.
      window.assertDeepEqual(
        {
          id: null,
          messages: row1_single_message,
        },
        await browser.mailTabs.getSelectedMessages(),
        "The rv of getSelectedMessages() should be correct"
      );

      // Verify the rv of getDisplayedMessages() after the single message was
      // selected.
      window.assertDeepEqual(
        {
          id: null,
          messages: row1_single_message,
        },
        await browser.messageDisplay.getDisplayedMessages(),
        "The rv of getDisplayedMessages() should be correct"
      );

      // Register a listener for onSelectedMessagesChanged.
      browser.mailTabs.onSelectedMessagesChanged.addListener(selectListener);

      // Context-Click on row #0.
      const onShownRow0 = Promise.withResolvers();
      const onShownListenerRow0 = info => {
        window.assertDeepEqual(
          {
            selectedMessages: {
              id: null,
              messages: row0_thread_of_three,
            },
          },
          info,
          "The rv of the menus.onShown event should be correct"
        );
        browser.menus.onShown.removeListener(onShownListenerRow0);
        onShownRow0.resolve();
      };
      browser.menus.onShown.addListener(onShownListenerRow0);

      await window.sendMessage("context-click on message", "0");
      await onShownRow0.promise;

      // The selected messages should still be the single message from row #1.
      window.assertDeepEqual(
        {
          id: null,
          messages: row1_single_message,
        },
        await browser.mailTabs.getSelectedMessages(),
        "The rv of getSelectedMessages() should be correct"
      );

      // The dispayed messages should still be the single message from row #1.
      window.assertDeepEqual(
        {
          id: null,
          messages: row1_single_message,
        },
        await browser.messageDisplay.getDisplayedMessages(),
        "The rv of getDisplayedMessages() should be correct"
      );

      // Verify that no selection event was fired.
      browser.mailTabs.onSelectedMessagesChanged.removeListener(selectListener);
      browser.test.assertEq(
        0,
        selectEvents.length,
        "There should have been no selection event"
      );

      // Verify that the context-menu is still open, and close it.
      await new Promise(resolve => {
        const listener = () => {
          browser.menus.onHidden.removeListener(listener);
          resolve();
        };
        browser.menus.onHidden.addListener(listener);
        browser.test.sendMessage("close-context-menu");
      });

      // Click on row #0 again, to see the collapsed thread being reported by
      // onSelectedMessagesChanged.
      await new Promise(resolve => {
        const listener = (_tab, messages) => {
          browser.mailTabs.onSelectedMessagesChanged.removeListener(listener);
          window.assertDeepEqual(
            {
              id: null,
              messages: row0_thread_of_three,
            },
            messages,
            "The rv of the onSelectedMessagesChanged event should be correct"
          );
          resolve();
        };
        browser.mailTabs.onSelectedMessagesChanged.addListener(listener);
        browser.test.sendMessage("click on message", "0");
      });

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    useAddonManager: "temporary",
    manifest: {
      manifest_version: 3,
      browser_specific_settings: {
        gecko: {
          id: "threadpane_context_click@mochi.test",
        },
      },
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["messagesRead", "menus"],
    },
  });

  extension.onMessage("click on message", rowNr => {
    const row = gAbout3Pane.document.getElementById(`threadTree-row${rowNr}`);
    Assert.ok(!!row, `Should find row${rowNr}`);
    EventUtils.synthesizeMouseAtCenter(row, {}, gAbout3Pane);
  });

  extension.onMessage("context-click on message", async rowNr => {
    const menu = gAbout3Pane.document.getElementById("mailContext");
    Assert.ok(!!menu, `Should find menu "mailContext"`);
    Assert.equal(
      "closed",
      menu.state,
      `The menu "mailContext" should still be closed`
    );

    const row = gAbout3Pane.document.getElementById(`threadTree-row${rowNr}`);
    Assert.ok(!!row, `Should find row${rowNr}`);
    EventUtils.synthesizeMouseAtCenter(
      row,
      { type: "contextmenu" },
      gAbout3Pane
    );
    await BrowserTestUtils.waitForPopupEvent(menu, "shown");
    Assert.equal("open", menu.state, `The menu "mailContext" should be open`);

    extension.sendMessage();
  });

  extension.onMessage("close-context-menu", () => {
    const menu = gAbout3Pane.document.getElementById("mailContext");
    Assert.ok(!!menu, `Should find menu "mailContext"`);
    Assert.equal(
      "open",
      menu.state,
      `The menu "mailContext" should still be open`
    );
    menu.hidePopup();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
