/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  let tabmail = document.getElementById("tabmail");

  let account = createAccount();
  let rootFolder = account.incomingServer.rootFolder;
  rootFolder.createSubfolder("tabsEvents", null);
  let testFolder = rootFolder.findSubFolder("tabsEvents");
  createMessages(testFolder, 5);
  let messages = testFolder.messages;

  let extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      let listener = {
        events: [],
        currentPromise: null,
        ignoringUpdated: false,

        pushEvent(...args) {
          browser.test.log(JSON.stringify(args));
          this.ignoringUpdated = false;
          this.events.push(args);
          if (this.currentPromise) {
            let p = this.currentPromise;
            this.currentPromise = null;
            p.resolve();
          }
        },
        onCreated(...args) {
          this.pushEvent("onCreated", ...args);
        },
        onUpdated(...args) {
          if (this.ignoringUpdated) {
            browser.test.log(JSON.stringify(["onUpdated", ...args]));
            browser.test.log("Ignored an onUpdated event");
          } else {
            this.pushEvent("onUpdated", ...args);
          }
        },
        onActivated(...args) {
          this.pushEvent("onActivated", ...args);
        },
        onRemoved(...args) {
          this.pushEvent("onRemoved", ...args);
        },
        setIgnoringUpdated() {
          this.ignoringUpdated = true;
          while (this.events.length > 0) {
            if (this.events[0][0] == "onUpdated") {
              browser.test.log("Discarded an onUpdated event");
              this.events.shift();
            } else {
              return;
            }
          }
        },
        async checkEvent(expectedEvent, ...expectedArgs) {
          if (this.events.length == 0) {
            await new Promise(resolve => (this.currentPromise = { resolve }));
          }
          let [actualEvent, ...actualArgs] = this.events.shift();
          browser.test.assertEq(expectedEvent, actualEvent);
          browser.test.assertEq(expectedArgs.length, actualArgs.length);

          for (let i = 0; i < expectedArgs.length; i++) {
            browser.test.assertEq(typeof expectedArgs[i], typeof actualArgs[i]);
            if (typeof expectedArgs[i] == "object") {
              for (let key of Object.keys(expectedArgs[i])) {
                browser.test.assertEq(expectedArgs[i][key], actualArgs[i][key]);
              }
            } else {
              browser.test.assertEq(expectedArgs[i], actualArgs[i]);
            }
          }

          return actualArgs;
        },
        async pageLoad(tab) {
          await listener.checkEvent(
            "onUpdated",
            tab,
            { status: "loading" },
            {
              id: tab,
              windowId: initialWindow,
              active: true,
              mailTab: false,
            }
          );
          await listener.checkEvent(
            "onUpdated",
            tab,
            { status: "complete" },
            {
              id: tab,
              windowId: initialWindow,
              active: true,
              mailTab: false,
            }
          );
        },
      };
      browser.tabs.onCreated.addListener(listener.onCreated.bind(listener));
      browser.tabs.onUpdated.addListener(listener.onUpdated.bind(listener), {
        properties: ["status"],
      });
      browser.tabs.onActivated.addListener(listener.onActivated.bind(listener));
      browser.tabs.onRemoved.addListener(listener.onRemoved.bind(listener));

      browser.test.log(
        "Collect the ID of the initial tab (there must be only one) and window."
      );

      let initialTabs = await browser.tabs.query({});
      browser.test.assertEq(1, initialTabs.length);
      browser.test.assertEq(0, initialTabs[0].index);
      browser.test.assertTrue(initialTabs[0].mailTab);
      let [{ id: initialTab, windowId: initialWindow }] = initialTabs;

      browser.test.log("Add a first content tab and wait for it to load.");

      await browser.tabs.create({ url: browser.runtime.getURL("page1.html") });
      let [{ id: contentTab1 }] = await listener.checkEvent("onCreated", {
        index: 1,
        windowId: initialWindow,
        active: true,
        mailTab: false,
      });
      browser.test.assertTrue(contentTab1 != initialTab);
      await listener.pageLoad(contentTab1);

      browser.test.log("Add a second content tab and wait for it to load.");

      await browser.tabs.create({ url: browser.runtime.getURL("page2.html") });
      let [{ id: contentTab2 }] = await listener.checkEvent("onCreated", {
        index: 2,
        windowId: initialWindow,
        active: true,
        mailTab: false,
      });
      browser.test.assertTrue(![initialTab, contentTab1].includes(contentTab2));
      await listener.pageLoad(contentTab2);

      browser.test.log("Add the calendar tab.");

      browser.test.sendMessage("openCalendarTab");
      let [{ id: calendarTab }] = await listener.checkEvent("onCreated", {
        index: 3,
        windowId: initialWindow,
        active: true,
        mailTab: false,
      });
      browser.test.assertTrue(
        ![initialTab, contentTab1, contentTab2].includes(calendarTab)
      );

      browser.test.log("Add the task tab.");

      browser.test.sendMessage("openTaskTab");
      let [{ id: taskTab }] = await listener.checkEvent("onCreated", {
        index: 4,
        windowId: initialWindow,
        active: true,
        mailTab: false,
      });
      browser.test.assertTrue(
        ![initialTab, contentTab1, contentTab2, calendarTab].includes(taskTab)
      );

      browser.test.log("Open a folder in a tab.");

      browser.test.sendMessage("openFolderTab");
      let [{ id: folderTab }] = await listener.checkEvent("onCreated", {
        index: 5,
        windowId: initialWindow,
        active: true,
        mailTab: true,
      });
      browser.test.assertTrue(
        ![initialTab, contentTab1, contentTab2, calendarTab, taskTab].includes(
          folderTab
        )
      );

      browser.test.log("Open a first message in a tab.");

      browser.test.sendMessage("openMessageTab", false);
      listener.setIgnoringUpdated();
      let [{ id: messageTab1 }] = await listener.checkEvent("onCreated", {
        index: 6,
        windowId: initialWindow,
        active: true,
        mailTab: false,
      });
      browser.test.assertTrue(
        ![
          initialTab,
          contentTab1,
          contentTab2,
          calendarTab,
          taskTab,
          folderTab,
        ].includes(messageTab1)
      );
      await listener.pageLoad(messageTab1);

      browser.test.log(
        "Open a second message in a tab. In the background, just because."
      );

      browser.test.sendMessage("openMessageTab", true);
      let [{ id: messageTab2 }] = await listener.checkEvent("onCreated", {
        index: 7,
        windowId: initialWindow,
        active: false,
        mailTab: false,
      });
      browser.test.assertTrue(
        ![
          initialTab,
          contentTab1,
          contentTab2,
          calendarTab,
          taskTab,
          folderTab,
          messageTab1,
        ].includes(messageTab2)
      );

      browser.test.log(
        "Activate each of the tabs in a somewhat random order to test the onActivated event."
      );

      for (let tab of [
        initialTab,
        calendarTab,
        messageTab1,
        taskTab,
        contentTab1,
        messageTab2,
        folderTab,
        contentTab2,
      ]) {
        await browser.tabs.update(tab, { active: true });
        if ([messageTab1, messageTab2].includes(tab)) {
          await listener.checkEvent(
            "onUpdated",
            tab,
            { status: "loading" },
            {
              id: tab,
              windowId: initialWindow,
              active: true,
              mailTab: false,
            }
          );
        }
        await listener.checkEvent("onActivated", {
          tabId: tab,
          windowId: initialWindow,
        });
        if ([messageTab1, messageTab2].includes(tab)) {
          await listener.pageLoad(tab);
        }
      }

      browser.test.log(
        "Remove the first content tab. This was not active so no new tab should be activated."
      );

      await browser.tabs.remove(contentTab1);
      await listener.checkEvent("onRemoved", contentTab1, {
        windowId: initialWindow,
        isWindowClosing: false,
      });

      browser.test.log(
        "Remove the second content tab. This was active, and the calendar tab is after it, so that should be activated."
      );

      await browser.tabs.remove(contentTab2);
      await listener.checkEvent("onRemoved", contentTab2, {
        windowId: initialWindow,
        isWindowClosing: false,
      });
      await listener.checkEvent("onActivated", {
        tabId: calendarTab,
        windowId: initialWindow,
      });

      browser.test.log("Remove the remaining tabs.");

      for (let tab of [
        taskTab,
        messageTab1,
        messageTab2,
        folderTab,
        calendarTab,
      ]) {
        await browser.tabs.remove(tab);
        await listener.checkEvent("onRemoved", tab, {
          windowId: initialWindow,
          isWindowClosing: false,
        });
      }

      await listener.checkEvent("onActivated", {
        tabId: initialTab,
        windowId: initialWindow,
      });

      browser.test.assertEq(0, listener.events.length);
      browser.test.notifyPass("finished");
    },
    files: {
      "page1.html": "<html><body>Page 1</body></html>",
      "page2.html": "<html><body>Page 2</body></html>",
    },
    manifest: {
      permissions: ["tabs"],
    },
  });

  extension.onMessage("openCalendarTab", async () => {
    let calendarTabButton = document.getElementById("calendar-tab-button");
    EventUtils.synthesizeMouseAtCenter(calendarTabButton, { clickCount: 1 });
  });

  extension.onMessage("openTaskTab", async () => {
    let calendarTabButton = document.getElementById("task-tab-button");
    EventUtils.synthesizeMouseAtCenter(calendarTabButton, { clickCount: 1 });
  });

  extension.onMessage("openFolderTab", async () => {
    tabmail.openTab("folder", { folder: rootFolder, background: false });
  });

  extension.onMessage("openMessageTab", async background => {
    tabmail.openTab("message", { msgHdr: messages.getNext(), background });
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
