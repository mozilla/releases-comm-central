/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var gAccount;
var gMessages;
var gFolder;

add_setup(() => {
  // Use an ascending order because this test relies on message arrays matching.
  Services.prefs.setIntPref("mailnews.default_sort_order", 1);

  gAccount = createAccount();
  const rootFolder = gAccount.incomingServer.rootFolder;
  rootFolder.createSubfolder("test0", null);
  rootFolder.createSubfolder("test1", null);
  rootFolder.createSubfolder("test2", null);

  const subFolders = {};
  for (const folder of rootFolder.subFolders) {
    subFolders[folder.name] = folder;
  }
  createMessages(subFolders.test0, 5);
  createMessages(subFolders.test1, 5);
  createMessages(subFolders.test2, 6);

  gFolder = subFolders.test0;
  gMessages = [...subFolders.test0.messages];

  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("mailnews.default_sort_order");
  });
});

add_task(async function testGetDisplayedMessage() {
  const files = {
    "background.js": async () => {
      const [{ id: firstTabId, displayedFolder }] =
        await browser.mailTabs.query({
          active: true,
          currentWindow: true,
        });

      const { messages } = await browser.messages.list(displayedFolder.id);

      async function checkResults(action, expectedMessages, sameTab) {
        const msgListener = window.waitForEvent(
          "messageDisplay.onMessageDisplayed"
        );
        const msgsListener = window.waitForEvent(
          "messageDisplay.onMessagesDisplayed"
        );

        if (typeof action == "string") {
          await window.sendMessage(action);
        } else {
          action();
        }

        let tab;
        let message;
        if (expectedMessages.length == 1) {
          [tab, message] = await msgListener;
          const [msgsTab, msgs] = await msgsListener;
          // Check listener results.
          if (sameTab) {
            browser.test.assertEq(firstTabId, tab.id);
            browser.test.assertEq(firstTabId, msgsTab.id);
          } else {
            browser.test.assertTrue(firstTabId != tab.id);
            browser.test.assertTrue(firstTabId != msgsTab.id);
          }
          browser.test.assertEq(
            messages[expectedMessages[0]].subject,
            message.subject
          );
          browser.test.assertEq(
            messages[expectedMessages[0]].subject,
            msgs[0].subject
          );

          // Check displayed message result.
          message = await browser.messageDisplay.getDisplayedMessage(tab.id);
          browser.test.assertEq(
            messages[expectedMessages[0]].subject,
            message.subject
          );
        } else {
          // onMessageDisplayed doesn't fire for the multi-message case.
          let msgs;
          [tab, msgs] = await msgsListener;

          for (const [i, expected] of expectedMessages.entries()) {
            browser.test.assertEq(messages[expected].subject, msgs[i].subject);
          }

          // More than one selected, so getDisplayMessage returns null.
          message = await browser.messageDisplay.getDisplayedMessage(tab.id);
          browser.test.assertEq(null, message);
        }

        const displayMsgs = await browser.messageDisplay.getDisplayedMessages(
          tab.id
        );
        browser.test.assertEq(expectedMessages.length, displayMsgs.length);
        for (const [i, expected] of expectedMessages.entries()) {
          browser.test.assertEq(
            messages[expected].subject,
            displayMsgs[i].subject
          );
        }
        return tab;
      }

      async function testGetDisplayedMessageFunctions(tabId, expected) {
        const messages = await browser.messageDisplay.getDisplayedMessages(
          tabId
        );
        if (expected) {
          browser.test.assertEq(1, messages.length);
          browser.test.assertEq(expected.subject, messages[0].subject);
        } else {
          browser.test.assertEq(0, messages.length);
        }

        const message = await browser.messageDisplay.getDisplayedMessage(tabId);
        if (expected) {
          browser.test.assertEq(expected.subject, message.subject);
        } else {
          browser.test.assertEq(null, message);
        }
      }

      // Test that selecting a different message fires the event.
      await checkResults("show message 1", [1], true);

      // ... and again, for good measure.
      await checkResults("show message 2", [2], true);

      // Test that opening a message in a new tab fires the event.
      let tab = await checkResults("open message 0 in tab", [0], false);

      // The opened tab should return message #0.
      await testGetDisplayedMessageFunctions(tab.id, messages[0]);

      // The first tab should return message #2, even if it is currently not displayed.
      await testGetDisplayedMessageFunctions(firstTabId, messages[2]);

      // Closing the tab should return us to the first tab.
      await browser.tabs.remove(tab.id);

      // Test that opening a message in a new window fires the event.
      tab = await checkResults("open message 1 in window", [1], false);

      // Test the windows API being able to return the messageDisplay window as
      // the current one.
      const msgWindow = await browser.windows.get(tab.windowId);
      browser.test.assertEq(msgWindow.type, "messageDisplay");
      const curWindow = await browser.windows.getCurrent();
      browser.test.assertEq(tab.windowId, curWindow.id);
      // Test the tabs API being able to return the correct current tab.
      const [currentTab] = await browser.tabs.query({
        currentWindow: true,
        active: true,
      });
      browser.test.assertEq(tab.id, currentTab.id);

      // Close the window.
      browser.tabs.remove(tab.id);

      // Test that selecting a multiple messages fires the event.
      await checkResults("show messages 1 and 2", [1, 2], true);

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

  const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  about3Pane.displayFolder(gFolder);
  about3Pane.threadTree.selectedIndex = 0;

  await extension.startup();

  await extension.awaitMessage("show message 1");
  about3Pane.threadTree.selectedIndex = 1;
  extension.sendMessage();

  await extension.awaitMessage("show message 2");
  about3Pane.threadTree.selectedIndex = 2;
  extension.sendMessage();

  await extension.awaitMessage("open message 0 in tab");
  await openMessageInTab(gMessages[0]);
  extension.sendMessage();

  await extension.awaitMessage("open message 1 in window");
  await openMessageInWindow(gMessages[1]);
  extension.sendMessage();

  await extension.awaitMessage("show messages 1 and 2");
  about3Pane.threadTree.selectedIndices = [1, 2];
  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();
});

add_task(async function testOpenMessagesInTabs() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        // Helper class to keep track of expected tab states and cycle though all
        // tabs after each test to enure the returned values are as expected under
        // different active/inactive scenarios.
        class TabTest {
          constructor() {
            this.expectedTabs = new Map();
          }

          // Check the given tab to match the expected values, update the internal
          // tracker Map, and cycle through all tabs to make sure they still match
          // the expected values.
          async check(description, tabId, expected) {
            browser.test.log(`TabTest: ${description}`);
            if (expected.active) {
              // Mark all other tabs inactive.
              this.expectedTabs.forEach((v, k) => {
                v.active = k == tabId;
              });
            }
            // When we call this.check() to cycle thru all tabs, we do not specify
            // an expected value. Do not update the tracker map in this case.
            if (!expected.skip) {
              this.expectedTabs.set(tabId, expected);
            }

            // Wait till the loaded url is as expected. Only checking the last part,
            // since running this test with --verify causes multiple accounts to
            // be created, changing the expected first part of message urls.
            await window.waitForCondition(async () => {
              const tab = await browser.tabs.get(tabId);
              const expected = this.expectedTabs.get(tabId);
              return tab.status == "complete" && tab.url.endsWith(expected.url);
            }, `Should have loaded the correct URL in tab ${tabId}`);

            // Check if all existing tabs match their expected values.
            await this._verify();

            // Cycle though all tabs, if there is more than one and run the check
            // for each active tab.
            if (!expected.skip && this.expectedTabs.size > 1) {
              // Loop over all tabs, activate each and verify all of them. Test the currently active
              // tab last, so we end up with the original condition.
              const currentActiveTab = this._toArray().find(tab => tab.active);
              const tabsToVerify = this._toArray()
                .filter(tab => tab.id != currentActiveTab.id)
                .concat(currentActiveTab);
              for (const tab of tabsToVerify) {
                await browser.tabs.update(tab.id, { active: true });
                await this.check("Activating tab " + tab.id, tab.id, {
                  active: true,
                  skip: true,
                });
              }
            }
          }

          // Return the expectedTabs Map as an array.
          _toArray() {
            return Array.from(this.expectedTabs.entries(), tab => {
              return { id: tab[0], ...tab[1] };
            });
          }

          // Verify that all tabs match their currently expected values.
          async _verify() {
            const tabs = await browser.tabs.query({});
            browser.test.assertEq(
              this.expectedTabs.size,
              tabs.length,
              `number of tabs should be correct`
            );

            for (const [tabId, expectedTab] of this.expectedTabs) {
              const tab = await browser.tabs.get(tabId);
              browser.test.assertEq(
                expectedTab.active,
                tab.active,
                `${tab.type} tab (id:${tabId}) should have the correct active setting`
              );

              if (expectedTab.hasOwnProperty("message")) {
                // Getthe currently displayed message.
                const message =
                  await browser.messageDisplay.getDisplayedMessage(tabId);

                // Test message either being correct or not displayed if not
                // expected.
                if (expectedTab.message) {
                  browser.test.assertTrue(
                    !!message,
                    `${tab.type} tab (id:${tabId}) should have a message`
                  );
                  if (message) {
                    browser.test.assertEq(
                      expectedTab.message.id,
                      message.id,
                      `${tab.type} tab (id:${tabId}) should have the correct message`
                    );
                  }
                } else {
                  browser.test.assertEq(
                    null,
                    message,
                    `${tab.type} tab (id:${tabId}) should not display a message`
                  );
                }
              }

              // Testing url parameter.
              if (expectedTab.url) {
                browser.test.assertTrue(
                  tab.url.endsWith(expectedTab.url),
                  `${tab.type} tab (id:${tabId}) should display the correct url`
                );
              }
            }
          }
        }

        // Verify startup conditions.
        const accounts = await browser.accounts.list();
        browser.test.assertEq(
          1,
          accounts.length,
          `number of accounts should be correct`
        );

        const folder1 = accounts[0].folders.find(f => f.name == "test1");
        browser.test.assertTrue(!!folder1, "folder should exist");
        const { messages: messages1 } = await browser.messages.list(folder1.id);
        browser.test.assertEq(
          5,
          messages1.length,
          `number of messages should be correct`
        );

        const folder2 = accounts[0].folders.find(f => f.name == "test2");
        browser.test.assertTrue(!!folder2, "folder should exist");
        const { messages: messages2 } = await browser.messages.list(folder2.id);
        browser.test.assertEq(
          6,
          messages2.length,
          `number of messages should be correct`
        );

        // Test reject on invalid openProperties.
        await browser.test.assertRejects(
          browser.messageDisplay.open({ messageId: 578 }),
          `Unknown or invalid messageId: 578.`,
          "browser.messageDisplay.open() should reject, if invalid messageId is specified"
        );

        await browser.test.assertRejects(
          browser.messageDisplay.open({ headerMessageId: "1" }),
          `Unknown or invalid headerMessageId: 1.`,
          "browser.messageDisplay.open() should reject, if invalid headerMessageId is specified"
        );

        await browser.test.assertRejects(
          browser.messageDisplay.open({}),
          "Exactly one of messageId, headerMessageId or file must be specified.",
          "browser.messageDisplay.open() should reject, if no messageId and no headerMessageId is specified"
        );

        await browser.test.assertRejects(
          browser.messageDisplay.open({ messageId: 578, headerMessageId: "1" }),
          "Exactly one of messageId, headerMessageId or file must be specified.",
          "browser.messageDisplay.open() should reject, if messageId and headerMessageId are specified"
        );

        // Create a TabTest to cycle through all existing tabs after each test to
        // verify returned values under different active/inactive scenarios.
        const tabTest = new TabTest();

        // Load a content tab into the primary mail tab, to have a known startup
        // condition.
        const tabs = await browser.tabs.query({});
        browser.test.assertEq(1, tabs.length);
        const mailTab = tabs[0];
        await browser.tabs.update(mailTab.id, {
          url: "https://www.example.com/mailTab/1",
        });
        await tabTest.check(
          "Load a url into the default mail tab.",
          mailTab.id,
          {
            active: true,
            url: "https://www.example.com/mailTab/1",
          }
        );

        // Create an active content tab.
        const tab1 = await browser.tabs.create({
          url: "https://www.example.com/contentTab1/1",
        });
        await tabTest.check("Create a content tab #1.", tab1.id, {
          active: true,
          url: "https://www.example.com/contentTab1/1",
        });

        // Open an inactive message tab.
        const tab2 = await browser.messageDisplay.open({
          messageId: messages1[0].id,
          location: "tab",
          active: false,
        });
        await tabTest.check("messageDisplay.open with active: false", tab2.id, {
          active: false,
          message: messages1[0],
          // To be able to run this test with --verify, specify only the last part
          // of the expected message url, which is independent of the associated
          // account.
          url: "/localhost/test1?number=1",
        });

        // Open an active message tab.
        const tab3 = await browser.messageDisplay.open({
          messageId: messages1[0].id,
          location: "tab",
          active: true,
        });
        await tabTest.check(
          "Opening the same message again should create a new tab.",
          tab3.id,
          {
            active: true,
            message: messages1[0],
            url: "/localhost/test1?number=1",
          }
        );

        // Open another content tab.
        const tab4 = await browser.tabs.create({
          url: "https://www.example.com/contentTab1/2",
        });
        await tabTest.check("Create a content tab #2.", tab4.id, {
          active: true,
          url: "https://www.example.com/contentTab1/2",
        });

        await browser.tabs.remove(tab1.id);
        await browser.tabs.remove(tab2.id);
        await browser.tabs.remove(tab3.id);
        await browser.tabs.remove(tab4.id);

        // Test opening multiple tabs.
        const promisedTabs = [];
        promisedTabs.push(
          browser.messageDisplay.open({
            messageId: messages1[0].id,
            location: "tab",
          })
        );
        promisedTabs.push(
          browser.messageDisplay.open({
            messageId: messages1[1].id,
            location: "tab",
          })
        );
        promisedTabs.push(
          browser.messageDisplay.open({
            messageId: messages1[2].id,
            location: "tab",
          })
        );
        promisedTabs.push(
          browser.messageDisplay.open({
            messageId: messages1[3].id,
            location: "tab",
          })
        );
        promisedTabs.push(
          browser.messageDisplay.open({
            messageId: messages1[4].id,
            location: "tab",
          })
        );
        const openedTabs = await Promise.allSettled(promisedTabs);
        for (let i = 0; i < 5; i++) {
          browser.test.assertEq(
            "fulfilled",
            openedTabs[i].status,
            `Promise for the opened message should have been fulfilled for tab ${i}`
          );
          const msg = await browser.messageDisplay.getDisplayedMessage(
            openedTabs[i].value.id
          );
          browser.test.assertEq(
            messages1[i].id,
            msg.id,
            `Should see the correct message in window ${i}`
          );
          await browser.tabs.remove(openedTabs[i].value.id);
        }

        browser.test.notifyPass();
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead", "tabs"],
    },
  });

  await extension.startup();
  await extension.awaitFinish();
  await extension.unload();
});

add_task(async function testOpenMessagesInWindows() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        // Verify startup conditions.
        const accounts = await browser.accounts.list();
        browser.test.assertEq(
          1,
          accounts.length,
          `number of accounts should be correct`
        );

        const folder1 = accounts[0].folders.find(f => f.name == "test1");
        browser.test.assertTrue(!!folder1, "folder should exist");
        const { messages: messages1 } = await browser.messages.list(folder1.id);
        browser.test.assertEq(
          5,
          messages1.length,
          `number of messages should be correct`
        );

        // Open multiple different windows.
        {
          const promisedTabs = [];
          promisedTabs.push(
            browser.messageDisplay.open({
              messageId: messages1[0].id,
              location: "window",
            })
          );
          promisedTabs.push(
            browser.messageDisplay.open({
              messageId: messages1[1].id,
              location: "window",
            })
          );
          promisedTabs.push(
            browser.messageDisplay.open({
              messageId: messages1[2].id,
              location: "window",
            })
          );
          promisedTabs.push(
            browser.messageDisplay.open({
              messageId: messages1[3].id,
              location: "window",
            })
          );
          promisedTabs.push(
            browser.messageDisplay.open({
              messageId: messages1[4].id,
              location: "window",
            })
          );
          const openedTabs = await Promise.allSettled(promisedTabs);
          const foundIds = new Set();
          for (let i = 0; i < 5; i++) {
            browser.test.assertEq(
              "fulfilled",
              openedTabs[i].status,
              `Promise for the opened message should have been fulfilled for window ${i}`
            );

            browser.test.assertTrue(
              !foundIds.has(openedTabs[i].value.id),
              `Tab ${i} should have a unique id ${openedTabs[i].value.id}`
            );
            foundIds.add(openedTabs[i].value.id);

            const msg = await browser.messageDisplay.getDisplayedMessage(
              openedTabs[i].value.id
            );
            browser.test.assertEq(
              messages1[i].id,
              msg.id,
              `Should see the correct message in window ${i}`
            );
            await browser.tabs.remove(openedTabs[i].value.id);
          }
        }

        // Open multiple identical windows.
        {
          const promisedTabs = [];
          promisedTabs.push(
            browser.messageDisplay.open({
              messageId: messages1[0].id,
              location: "window",
            })
          );
          promisedTabs.push(
            browser.messageDisplay.open({
              messageId: messages1[0].id,
              location: "window",
            })
          );
          promisedTabs.push(
            browser.messageDisplay.open({
              messageId: messages1[0].id,
              location: "window",
            })
          );
          promisedTabs.push(
            browser.messageDisplay.open({
              messageId: messages1[0].id,
              location: "window",
            })
          );
          promisedTabs.push(
            browser.messageDisplay.open({
              messageId: messages1[0].id,
              location: "window",
            })
          );
          const openedTabs = await Promise.allSettled(promisedTabs);
          const foundIds = new Set();
          for (let i = 0; i < 5; i++) {
            browser.test.assertEq(
              "fulfilled",
              openedTabs[i].status,
              `Promise for the opened message should have been fulfilled for window ${i}`
            );

            browser.test.assertTrue(
              !foundIds.has(openedTabs[i].value.id),
              `Tab ${i} should have a unique id ${openedTabs[i].value.id}`
            );
            foundIds.add(openedTabs[i].value.id);

            const msg = await browser.messageDisplay.getDisplayedMessage(
              openedTabs[i].value.id
            );
            browser.test.assertEq(
              messages1[0].id,
              msg.id,
              `Should see the correct message in window ${i}`
            );
            await browser.tabs.remove(openedTabs[i].value.id);
          }
        }

        browser.test.notifyPass();
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead", "tabs"],
    },
  });

  await extension.startup();
  await extension.awaitFinish();
  await extension.unload();
});

add_task(async function test_MV3_event_pages_onMessageDisplayed() {
  const files = {
    "background.js": async () => {
      // Whenever the extension starts or wakes up, hasFired is set to false. In
      // case of a wake-up, the first fired event is the one that woke up the background.
      let hasFired = false;

      browser.messageDisplay.onMessageDisplayed.addListener((tab, message) => {
        // Only send the first event after background wake-up, this should be
        // the only one expected.
        if (!hasFired) {
          hasFired = true;
          browser.test.sendMessage("onMessageDisplayed received", {
            tab,
            message,
          });
        }
      });

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
        gecko: { id: "onMessageDisplayed@mochi.test" },
      },
    },
  });

  function checkPersistentListeners({ primed }) {
    // A persistent event is referenced by its moduleName as defined in
    // ext-mails.json, not by its actual namespace.
    const persistent_events = ["messageDisplay.onMessageDisplayed"];

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

  // Select a message.

  {
    const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
    about3Pane.displayFolder(gFolder);
    about3Pane.threadTree.selectedIndex = 2;

    const displayInfo = await extension.awaitMessage(
      "onMessageDisplayed received"
    );
    Assert.equal(
      displayInfo.message.subject,
      "Huge Shindig Yesterday",
      "The primed onMessageDisplayed event should return the correct message."
    );
    Assert.deepEqual(
      {
        active: true,
        type: "mail",
      },
      {
        active: displayInfo.tab.active,
        type: displayInfo.tab.type,
      },
      "The primed onMessageDisplayed event should return the correct values"
    );

    await extension.awaitMessage("background started");
    // The listeners should be persistent, but not primed.
    checkPersistentListeners({ primed: false });
  }

  await extension.terminateBackground({ disableResetIdleForTest: true });
  // Verify the primed persistent listeners.
  checkPersistentListeners({ primed: true });

  // Open a message in a window.

  {
    const messageWindow = await openMessageInWindow(gMessages[0]);
    const displayInfo = await extension.awaitMessage(
      "onMessageDisplayed received"
    );
    Assert.equal(
      displayInfo.message.subject,
      "Big Meeting Today",
      "The primed onMessageDisplayed event should return the correct message."
    );
    Assert.deepEqual(
      {
        active: true,
        type: "messageDisplay",
      },
      {
        active: displayInfo.tab.active,
        type: displayInfo.tab.type,
      },
      "The primed onMessageDisplayed event should return the correct values"
    );

    await extension.awaitMessage("background started");
    // The listeners should be persistent, but not primed.
    checkPersistentListeners({ primed: false });
    messageWindow.close();
  }

  await extension.terminateBackground({ disableResetIdleForTest: true });
  // Verify the primed persistent listeners.
  checkPersistentListeners({ primed: true });

  // Open a message in a tab.

  {
    await openMessageInTab(gMessages[1]);
    const displayInfo = await extension.awaitMessage(
      "onMessageDisplayed received"
    );
    Assert.equal(
      displayInfo.message.subject,
      "Small Party Tomorrow",
      "The primed onMessageDisplayed event should return the correct message."
    );
    Assert.deepEqual(
      {
        active: true,
        type: "messageDisplay",
      },
      {
        active: displayInfo.tab.active,
        type: displayInfo.tab.type,
      },
      "The primed onMessageDisplayed event should return the correct values"
    );

    await extension.awaitMessage("background started");
    // The listeners should be persistent, but not primed.
    checkPersistentListeners({ primed: false });
    document.getElementById("tabmail").closeTab();
  }

  await extension.unload();
});

add_task(async function test_MV3_event_pages_onMessagesDisplayed() {
  const files = {
    "background.js": async () => {
      // Whenever the extension starts or wakes up, hasFired is set to false. In
      // case of a wake-up, the first fired event is the one that woke up the background.
      let hasFired = false;

      browser.messageDisplay.onMessagesDisplayed.addListener(
        (tab, messages) => {
          // Only send the first event after background wake-up, this should be
          // the only one expected.
          if (!hasFired) {
            hasFired = true;
            browser.test.sendMessage("onMessagesDisplayed received", {
              tab,
              messages,
            });
          }
        }
      );

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
        gecko: { id: "onMessagesDisplayed@mochi.test" },
      },
    },
  });

  function checkPersistentListeners({ primed }) {
    // A persistent event is referenced by its moduleName as defined in
    // ext-mails.json, not by its actual namespace.
    const persistent_events = ["messageDisplay.onMessagesDisplayed"];

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

  // Select multiple messages.

  {
    const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
    about3Pane.displayFolder(gFolder);
    about3Pane.threadTree.selectedIndices = [0, 1, 2, 3, 4];

    const displayInfo = await extension.awaitMessage(
      "onMessagesDisplayed received"
    );
    Assert.equal(
      displayInfo.messages.length,
      5,
      "The primed onMessagesDisplayed event should return the correct number of messages."
    );
    Assert.deepEqual(
      [
        "Big Meeting Today",
        "Small Party Tomorrow",
        "Huge Shindig Yesterday",
        "Tiny Wedding In a Fortnight",
        "Red Document Needs Attention",
      ],
      displayInfo.messages.map(e => e.subject),
      "The primed onMessagesDisplayed event should return the correct messages."
    );
    Assert.deepEqual(
      {
        active: true,
        type: "mail",
      },
      {
        active: displayInfo.tab.active,
        type: displayInfo.tab.type,
      },
      "The primed onMessagesDisplayed event should return the correct values"
    );

    await extension.awaitMessage("background started");
    // The listeners should be persistent, but not primed.
    checkPersistentListeners({ primed: false });
  }

  await extension.terminateBackground({ disableResetIdleForTest: true });
  // Verify the primed persistent listeners.
  checkPersistentListeners({ primed: true });

  // Open a message in a window.

  {
    const messageWindow = await openMessageInWindow(gMessages[0]);
    const displayInfo = await extension.awaitMessage(
      "onMessagesDisplayed received"
    );
    Assert.equal(
      displayInfo.messages.length,
      1,
      "The primed onMessagesDisplayed event should return the correct number of messages."
    );
    Assert.equal(
      displayInfo.messages[0].subject,
      "Big Meeting Today",
      "The primed onMessagesDisplayed event should return the correct message."
    );
    Assert.deepEqual(
      {
        active: true,
        type: "messageDisplay",
      },
      {
        active: displayInfo.tab.active,
        type: displayInfo.tab.type,
      },
      "The primed onMessagesDisplayed event should return the correct values"
    );

    await extension.awaitMessage("background started");
    // The listeners should be persistent, but not primed.
    checkPersistentListeners({ primed: false });
    messageWindow.close();
  }

  await extension.terminateBackground({ disableResetIdleForTest: true });
  // Verify the primed persistent listeners.
  checkPersistentListeners({ primed: true });

  // Open a message in a tab.

  {
    await openMessageInTab(gMessages[1]);
    const displayInfo = await extension.awaitMessage(
      "onMessagesDisplayed received"
    );
    Assert.equal(
      displayInfo.messages.length,
      1,
      "The primed onMessagesDisplayed event should return the correct number of messages."
    );
    Assert.equal(
      displayInfo.messages[0].subject,
      "Small Party Tomorrow",
      "The primed onMessagesDisplayed event should return the correct message."
    );
    Assert.deepEqual(
      {
        active: true,
        type: "messageDisplay",
      },
      {
        active: displayInfo.tab.active,
        type: displayInfo.tab.type,
      },
      "The primed onMessagesDisplayed event should return the correct values"
    );

    await extension.awaitMessage("background started");
    // The listeners should be persistent, but not primed.
    checkPersistentListeners({ primed: false });
    document.getElementById("tabmail").closeTab();
  }

  await extension.unload();
});
