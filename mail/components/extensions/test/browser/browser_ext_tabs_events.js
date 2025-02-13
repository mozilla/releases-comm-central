/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  const tabmail = document.getElementById("tabmail");

  const account = createAccount();
  const rootFolder = account.incomingServer.rootFolder;
  rootFolder.createSubfolder("tabsEvents", null);
  const testFolder = rootFolder.findSubFolder("tabsEvents");
  createMessages(testFolder, 5);
  const messages = [...testFolder.messages];

  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "page1.html": "<html><body>Page 1</body></html>",
      "page2.html": "<html><body>Page 2</body></html>",
      "background.js": async () => {
        // Executes a command, but first loads a second extension with terminated
        // background and waits for it to be restarted due to the executed command.
        async function capturePrimedEvent(eventName, callback) {
          const eventPageExtensionReadyPromise = window.waitForMessage();
          browser.test.sendMessage("capturePrimedEvent", eventName);
          await eventPageExtensionReadyPromise;
          const eventPageExtensionFinishedPromise = window.waitForMessage();
          callback();
          return eventPageExtensionFinishedPromise;
        }

        const listener = {
          events: [],
          currentPromise: null,

          pushEvent(...args) {
            browser.test.log(JSON.stringify(args));
            this.events.push(args);
            if (this.currentPromise) {
              const p = this.currentPromise;
              this.currentPromise = null;
              p.resolve(args);
            }
          },
          onCreated(...args) {
            this.pushEvent("onCreated", ...args);
          },
          onUpdated(...args) {
            this.pushEvent("onUpdated", ...args);
          },
          onActivated(...args) {
            this.pushEvent("onActivated", ...args);
          },
          onRemoved(...args) {
            this.pushEvent("onRemoved", ...args);
          },
          async nextEvent() {
            if (this.events.length == 0) {
              return new Promise(
                resolve => (this.currentPromise = { resolve })
              );
            }
            return Promise.resolve(this.events[0]);
          },
          async checkEvent(expectedEvent, ...expectedArgs) {
            await this.nextEvent();
            const [actualEvent, ...actualArgs] = this.events.shift();
            browser.test.assertEq(
              expectedEvent,
              actualEvent,
              "event type should be correct"
            );
            window.assertDeepEqual(
              expectedArgs,
              actualArgs,
              "event args should be correct"
            );
            return actualArgs;
          },
          async pageLoad(tab, type, active = true) {
            // @see https://github.com/eslint/eslint/issues/17807
            // eslint-disable-next-line no-constant-condition
            while (true) {
              // Read the first event without consuming it.
              const [actualEvent, actualTabId, actualInfo, actualTab] =
                await this.nextEvent();
              browser.test.assertEq("onUpdated", actualEvent);
              browser.test.assertEq(tab, actualTabId);

              if (
                actualInfo.status == "loading" ||
                actualTab.url == "about:blank"
              ) {
                // We're not interested in these events. Take them off the list.
                browser.test.log("Skipping this event.");
                this.events.shift();
              } else {
                break;
              }
            }
            await this.checkEvent(
              "onUpdated",
              tab,
              { status: "complete" },
              {
                id: tab,
                windowId: initialWindowId,
                active,
                type,
              }
            );
          },
        };

        browser.tabs.onCreated.addListener(listener.onCreated.bind(listener));
        browser.tabs.onUpdated.addListener(listener.onUpdated.bind(listener), {
          properties: ["status"],
        });
        browser.tabs.onActivated.addListener(
          listener.onActivated.bind(listener)
        );
        browser.tabs.onRemoved.addListener(listener.onRemoved.bind(listener));

        browser.test.log(
          "Collect the ID of the initial tab (there must be only one) and window."
        );

        const initialTabs = await browser.tabs.query({});
        browser.test.assertEq(1, initialTabs.length);
        browser.test.assertEq(0, initialTabs[0].index);
        browser.test.assertEq("mail", initialTabs[0].type);
        const [{ id: initialTabId, windowId: initialWindowId }] = initialTabs;

        browser.test.log("Add a first content tab and wait for it to load.");

        window.assertDeepEqual(
          [
            {
              index: 1,
              windowId: initialWindowId,
              active: true,
              type: "content",
            },
          ],
          await capturePrimedEvent("onCreated", () =>
            browser.tabs.create({
              url: browser.runtime.getURL("page1.html"),
            })
          )
        );
        const [{ id: contentTab1Id }] = await listener.checkEvent("onCreated", {
          index: 1,
          windowId: initialWindowId,
          active: true,
          type: "content",
        });
        browser.test.assertTrue(contentTab1Id != initialTabId);
        await listener.checkEvent("onActivated", {
          tabId: contentTab1Id,
          windowId: initialWindowId,
          previousTabId: initialTabId,
        });

        await listener.pageLoad(contentTab1Id, "content");
        browser.test.assertEq(
          "content",
          (await browser.tabs.get(contentTab1Id)).type
        );

        browser.test.log("Add a second content tab and wait for it to load.");

        // The external extension is looking for the onUpdated event, it either be
        // a loading or completed event. Compare with whatever the local extension
        // is getting.
        const locContentTabUpdateInfoPromise = new Promise(resolve => {
          browser.tabs.onUpdated.addListener(
            function updateListener(...args) {
              browser.tabs.onUpdated.removeListener(updateListener);
              resolve(args);
            },
            {
              properties: ["status"],
            }
          );
        });
        const primedContentTabUpdateInfo = await capturePrimedEvent(
          "onUpdated",
          () =>
            browser.tabs.create({
              url: browser.runtime.getURL("page2.html"),
            })
        );
        const [{ id: contentTab2Id }] = await listener.checkEvent("onCreated", {
          index: 2,
          windowId: initialWindowId,
          active: true,
          type: "content",
        });
        await listener.checkEvent("onActivated", {
          tabId: contentTab2Id,
          windowId: initialWindowId,
          previousTabId: contentTab1Id,
        });

        const locContentTabUpdateInfo = await locContentTabUpdateInfoPromise;
        browser.test.assertEq(
          3,
          locContentTabUpdateInfo.length,
          "locContentTabUpdateInfo should have the correct length"
        );
        browser.test.assertEq(
          3,
          primedContentTabUpdateInfo.length,
          "primedContentTabUpdateInfo should have the correct length"
        );
        browser.test.assertEq(
          locContentTabUpdateInfo[0],
          primedContentTabUpdateInfo[0],
          "tabId should be identical for the normal and the primed extension"
        );
        window.assertDeepEqual(
          locContentTabUpdateInfo[1],
          primedContentTabUpdateInfo[1],
          "change information of the primed onUpdated event and non-primed onUpdeated event should be identical",
          { strict: true }
        );
        // Since primedContentTabUpdateInfo is from a MV3 extension, it does not
        // return the mailTab property. Manually add it, to match the value of
        // locContentTabUpdateInfo, which is returned from a MV2 extension.
        window.assertDeepEqual(
          locContentTabUpdateInfo[2],
          { ...primedContentTabUpdateInfo[2], mailTab: false },
          "tab information of the primed onUpdated event and non-primed onUpdeated event should be identical",
          { strict: true }
        );

        browser.test.assertTrue(
          ![initialTabId, contentTab1Id].includes(contentTab2Id)
        );
        await listener.pageLoad(contentTab2Id, "content");
        browser.test.assertEq(
          "content",
          (await browser.tabs.get(contentTab2Id)).type
        );

        browser.test.log("Add the calendar tab.");

        window.assertDeepEqual(
          [
            {
              index: 3,
              windowId: initialWindowId,
              active: true,
              type: "calendar",
            },
          ],
          await capturePrimedEvent("onCreated", () =>
            browser.test.sendMessage("openCalendarTab")
          )
        );
        const [{ id: calendarTabId }] = await listener.checkEvent("onCreated", {
          index: 3,
          windowId: initialWindowId,
          active: true,
          type: "calendar",
        });
        browser.test.assertTrue(
          ![initialTabId, contentTab1Id, contentTab2Id].includes(calendarTabId)
        );
        await listener.checkEvent("onActivated", {
          tabId: calendarTabId,
          windowId: initialWindowId,
          previousTabId: contentTab2Id,
        });

        browser.test.log("Add the task tab.");

        window.assertDeepEqual(
          [
            {
              index: 4,
              windowId: initialWindowId,
              active: true,
              type: "tasks",
            },
          ],
          await capturePrimedEvent("onCreated", () =>
            browser.test.sendMessage("openTaskTab")
          )
        );
        const [{ id: taskTabId }] = await listener.checkEvent("onCreated", {
          index: 4,
          windowId: initialWindowId,
          active: true,
          type: "tasks",
        });
        browser.test.assertTrue(
          ![initialTabId, contentTab1Id, contentTab2Id, calendarTabId].includes(
            taskTabId
          )
        );
        await listener.checkEvent("onActivated", {
          tabId: taskTabId,
          windowId: initialWindowId,
          previousTabId: calendarTabId,
        });

        browser.test.log("Open a folder in a tab.");

        window.assertDeepEqual(
          [
            {
              index: 5,
              windowId: initialWindowId,
              active: true,
              type: "mail",
            },
          ],
          await capturePrimedEvent("onCreated", () =>
            browser.test.sendMessage("openFolderTab")
          )
        );
        const [{ id: folderTabId }] = await listener.checkEvent("onCreated", {
          index: 5,
          windowId: initialWindowId,
          active: true,
          type: "mail",
        });
        await listener.checkEvent("onActivated", {
          tabId: folderTabId,
          windowId: initialWindowId,
          previousTabId: taskTabId,
        });

        browser.test.assertTrue(
          ![
            initialTabId,
            contentTab1Id,
            contentTab2Id,
            calendarTabId,
            taskTabId,
          ].includes(folderTabId)
        );

        browser.test.log("Open a first message in a tab.");

        window.assertDeepEqual(
          [
            {
              index: 6,
              windowId: initialWindowId,
              active: true,
              type: "messageDisplay",
            },
          ],
          await capturePrimedEvent("onCreated", () =>
            browser.test.sendMessage("openMessageTab", false)
          )
        );

        const [{ id: messageTab1Id }] = await listener.checkEvent("onCreated", {
          index: 6,
          windowId: initialWindowId,
          active: true,
          type: "messageDisplay",
        });
        await listener.checkEvent("onActivated", {
          tabId: messageTab1Id,
          windowId: initialWindowId,
          previousTabId: folderTabId,
        });

        browser.test.assertTrue(
          ![
            initialTabId,
            contentTab1Id,
            contentTab2Id,
            calendarTabId,
            taskTabId,
            folderTabId,
          ].includes(messageTab1Id)
        );
        await listener.pageLoad(messageTab1Id, "messageDisplay");

        browser.test.log(
          "Open a second message in a tab. In the background, just because."
        );

        window.assertDeepEqual(
          [
            {
              index: 7,
              windowId: initialWindowId,
              active: false,
              type: "messageDisplay",
            },
          ],
          await capturePrimedEvent("onCreated", () =>
            browser.test.sendMessage("openMessageTab", true)
          )
        );
        const [{ id: messageTab2Id }] = await listener.checkEvent("onCreated", {
          index: 7,
          windowId: initialWindowId,
          active: false,
          type: "messageDisplay",
        });

        browser.test.assertTrue(
          ![
            initialTabId,
            contentTab1Id,
            contentTab2Id,
            calendarTabId,
            taskTabId,
            folderTabId,
            messageTab1Id,
          ].includes(messageTab2Id)
        );
        await listener.pageLoad(messageTab2Id, "messageDisplay", false);

        browser.test.log(
          "Activate each of the tabs in a somewhat random order to test the onActivated event."
        );

        let previousTabId = messageTab1Id;
        for (const tab of [
          initialTabId,
          calendarTabId,
          messageTab1Id,
          taskTabId,
          contentTab1Id,
          messageTab2Id,
          folderTabId,
          contentTab2Id,
        ]) {
          window.assertDeepEqual(
            [{ tabId: tab, windowId: initialWindowId }],
            await capturePrimedEvent("onActivated", () =>
              browser.tabs.update(tab, { active: true })
            )
          );
          await listener.checkEvent("onActivated", {
            tabId: tab,
            previousTabId,
            windowId: initialWindowId,
          });
          previousTabId = tab;
        }

        browser.test.log(
          "Remove the first content tab. This was not active so no new tab should be activated."
        );

        window.assertDeepEqual(
          [
            contentTab1Id,
            { windowId: initialWindowId, isWindowClosing: false },
          ],
          await capturePrimedEvent("onRemoved", () =>
            browser.tabs.remove(contentTab1Id)
          )
        );
        await listener.checkEvent("onRemoved", contentTab1Id, {
          windowId: initialWindowId,
          isWindowClosing: false,
        });

        browser.test.log(
          "Remove the second content tab. This was active, and the calendar tab is after it, so that should be activated."
        );

        window.assertDeepEqual(
          [
            contentTab2Id,
            { windowId: initialWindowId, isWindowClosing: false },
          ],
          await capturePrimedEvent("onRemoved", () =>
            browser.tabs.remove(contentTab2Id)
          )
        );
        await listener.checkEvent("onRemoved", contentTab2Id, {
          windowId: initialWindowId,
          isWindowClosing: false,
        });
        await listener.checkEvent("onActivated", {
          tabId: calendarTabId,
          windowId: initialWindowId,
        });

        browser.test.log("Remove the remaining tabs.");

        for (const tab of [
          taskTabId,
          messageTab1Id,
          messageTab2Id,
          folderTabId,
          calendarTabId,
        ]) {
          window.assertDeepEqual(
            [tab, { windowId: initialWindowId, isWindowClosing: false }],
            await capturePrimedEvent("onRemoved", () =>
              browser.tabs.remove(tab)
            )
          );
          await listener.checkEvent("onRemoved", tab, {
            windowId: initialWindowId,
            isWindowClosing: false,
          });
        }

        // Since the last tab was activated because all other tabs have been
        // removed, previousTabId should be undefined.
        await listener.checkEvent("onActivated", {
          tabId: initialTabId,
          windowId: initialWindowId,
          previousTabId: undefined,
        });

        browser.test.assertEq(0, listener.events.length);
        browser.test.notifyPass("finished");
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["tabs"],
    },
  });

  // Function to start an event page extension (MV3), which can be called whenever
  // the main test is about to trigger an event. The extension terminates its
  // background and listens for that single event, verifying it is waking up correctly.
  async function event_page_extension(eventName, actionCallback) {
    const ext = ExtensionTestUtils.loadExtension({
      files: {
        "background.js": async () => {
          // Whenever the extension starts or wakes up, hasFired is set to false. In
          // case of a wake-up, the first fired event is the one that woke up the background.
          let hasFired = false;
          const description = browser.runtime.getManifest().description;

          if (["onCreated", "onActivated", "onRemoved"].includes(description)) {
            browser.tabs[description].addListener(async (...args) => {
              // Only send the first event after background wake-up, this should
              // be the only one expected.
              if (!hasFired) {
                hasFired = true;
                browser.test.sendMessage(`${description} received`, args);
              }
            });
          }

          if (description == "onUpdated") {
            browser.tabs.onUpdated.addListener(
              (...args) => {
                // Only send the first event after background wake-up, this should
                // be the only one expected.
                if (!hasFired) {
                  hasFired = true;
                  browser.test.sendMessage("onUpdated received", args);
                }
              },
              {
                properties: ["status"],
              }
            );
          }

          browser.test.sendMessage("background started");
        },
      },
      manifest: {
        manifest_version: 3,
        description: eventName,
        background: { scripts: ["background.js"] },
        permissions: ["tabs"],
        browser_specific_settings: {
          gecko: { id: `tabs.eventpage.${eventName}@mochi.test` },
        },
      },
    });
    await ext.startup();
    await ext.awaitMessage("background started");
    // The listener should be persistent, but not primed.
    assertPersistentListeners(ext, "tabs", eventName, { primed: false });

    await ext.terminateBackground({ disableResetIdleForTest: true });
    // Verify the primed persistent listener.
    assertPersistentListeners(ext, "tabs", eventName, { primed: true });

    await actionCallback();
    const rv = await ext.awaitMessage(`${eventName} received`);
    await ext.awaitMessage("background started");
    // The listener should be persistent, but not primed.
    assertPersistentListeners(ext, "tabs", eventName, { primed: false });

    await ext.unload();
    return rv;
  }

  extension.onMessage("openCalendarTab", () => {
    const calendarTabButton = document.getElementById("calendarButton");
    EventUtils.synthesizeMouseAtCenter(calendarTabButton, {
      clickCount: 1,
    });
  });

  extension.onMessage("openTaskTab", () => {
    const taskTabButton = document.getElementById("tasksButton");
    EventUtils.synthesizeMouseAtCenter(taskTabButton, { clickCount: 1 });
  });

  extension.onMessage("openFolderTab", () => {
    tabmail.openTab("mail3PaneTab", {
      folderURI: rootFolder.URI,
      background: false,
    });
  });

  extension.onMessage("openMessageTab", background => {
    const msgHdr = messages.shift();
    tabmail.openTab("mailMessageTab", {
      messageURI: testFolder.getUriForMsg(msgHdr),
      background,
    });
  });

  extension.onMessage("capturePrimedEvent", async eventName => {
    const primedEventData = await event_page_extension(eventName, () => {
      // Resume execution in the main test, after the event page extension is
      // ready to capture the event with deactivated background.
      extension.sendMessage();
    });
    extension.sendMessage(...primedEventData);
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
