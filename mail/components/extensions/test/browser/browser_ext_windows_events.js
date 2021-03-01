/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  let account = createAccount();
  addIdentity(account);
  let rootFolder = account.incomingServer.rootFolder;
  rootFolder.createSubfolder("windowsEvents", null);
  let testFolder = rootFolder.findSubFolder("windowsEvents");
  createMessages(testFolder, 5);

  let extension = ExtensionTestUtils.loadExtension({
    background: async () => {
      let listener = {
        tabEvents: [],
        windowEvents: [],
        currentPromise: null,

        pushEvent(...args) {
          browser.test.log(JSON.stringify(args));
          let queue = args[0].startsWith("windows.")
            ? this.windowEvents
            : this.tabEvents;
          queue.push(args);
          if (queue.currentPromise) {
            let p = queue.currentPromise;
            queue.currentPromise = null;
            p.resolve();
          }
        },
        windowsOnCreated(...args) {
          this.pushEvent("windows.onCreated", ...args);
        },
        windowsOnRemoved(...args) {
          this.pushEvent("windows.onRemoved", ...args);
        },
        tabsOnCreated(...args) {
          this.pushEvent("tabs.onCreated", ...args);
        },
        tabsOnRemoved(...args) {
          this.pushEvent("tabs.onRemoved", ...args);
        },
        async checkEvent(expectedEvent, ...expectedArgs) {
          let queue = expectedEvent.startsWith("windows.")
            ? this.windowEvents
            : this.tabEvents;
          if (queue.length == 0) {
            await new Promise(resolve => (queue.currentPromise = { resolve }));
          }
          let [actualEvent, ...actualArgs] = queue.shift();
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
      };
      browser.tabs.onCreated.addListener(listener.tabsOnCreated.bind(listener));
      browser.tabs.onRemoved.addListener(listener.tabsOnRemoved.bind(listener));
      browser.windows.onCreated.addListener(
        listener.windowsOnCreated.bind(listener)
      );
      browser.windows.onRemoved.addListener(
        listener.windowsOnRemoved.bind(listener)
      );

      browser.test.log(
        "Collect the ID of the initial window (there must be only one) and tab."
      );

      let initialWindows = await browser.windows.getAll({ populate: true });
      browser.test.assertEq(1, initialWindows.length);
      let [{ id: initialWindow, tabs: initialTabs }] = initialWindows;
      browser.test.assertEq(1, initialTabs.length);
      browser.test.assertEq(0, initialTabs[0].index);
      browser.test.assertTrue(initialTabs[0].mailTab);
      let [{ id: initialTab }] = initialTabs;

      browser.test.log("Open a new main window (messenger.xhtml).");

      browser.test.sendMessage("openMainWindow");
      let [{ id: mainWindow }] = await listener.checkEvent(
        "windows.onCreated",
        { type: "normal" }
      );
      let [{ id: mainTab }] = await listener.checkEvent("tabs.onCreated", {
        index: 0,
        windowId: mainWindow,
        active: true,
        mailTab: true,
      });

      browser.test.log("Open the address book window (addressbook.xhtml).");

      await browser.addressBooks.openUI();
      let [{ id: addressBookWindow }] = await listener.checkEvent(
        "windows.onCreated",
        {
          type: "addressBook",
        }
      );
      let [{ id: addressBookTab }] = await listener.checkEvent(
        "tabs.onCreated",
        { index: 0, windowId: addressBookWindow, active: true, mailTab: false }
      );

      browser.test.log("Open a compose window (messengercompose.xhtml).");

      await browser.compose.beginNew();
      let [{ id: composeWindow }] = await listener.checkEvent(
        "windows.onCreated",
        {
          type: "messageCompose",
        }
      );
      let [{ id: composeTab }] = await listener.checkEvent("tabs.onCreated", {
        index: 0,
        windowId: composeWindow,
        active: true,
        mailTab: false,
      });

      browser.test.log("Open a message in a window (messageWindow.xhtml).");

      browser.test.sendMessage("openDisplayWindow");
      let [{ id: displayWindow }] = await listener.checkEvent(
        "windows.onCreated",
        {
          type: "messageDisplay",
        }
      );
      let [{ id: displayTab }] = await listener.checkEvent("tabs.onCreated", {
        index: 0,
        windowId: displayWindow,
        active: true,
        mailTab: false,
      });

      browser.test.log("Open a page in a popup window.");
      await browser.windows.create({
        url: "test.html",
        type: "popup",
        width: 800,
        height: 500,
      });

      let [{ id: popupWindow }] = await listener.checkEvent(
        "windows.onCreated",
        {
          type: "popup",
          width: 800,
          height: 500,
        }
      );
      let [{ id: popupTab }] = await listener.checkEvent("tabs.onCreated", {
        index: 0,
        windowId: popupWindow,
        active: true,
        mailTab: false,
      });

      browser.test.log("Pause to lets windows load properly.");
      // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
      await new Promise(resolve => setTimeout(resolve, 2500));

      browser.test.log("Close the new main window.");

      await browser.windows.remove(mainWindow);
      await listener.checkEvent("windows.onRemoved", mainWindow);
      await listener.checkEvent("tabs.onRemoved", mainTab, {
        windowId: mainWindow,
        isWindowClosing: true,
      });

      browser.test.log("Close the address book window.");

      await browser.addressBooks.closeUI();
      await listener.checkEvent("windows.onRemoved", addressBookWindow);
      await listener.checkEvent("tabs.onRemoved", addressBookTab, {
        windowId: addressBookWindow,
        isWindowClosing: true,
      });

      browser.test.log("Close the compose window.");

      await browser.windows.remove(composeWindow);
      await listener.checkEvent("windows.onRemoved", composeWindow);
      await listener.checkEvent("tabs.onRemoved", composeTab, {
        windowId: composeWindow,
        isWindowClosing: true,
      });

      browser.test.log("Close the message window.");

      await browser.windows.remove(displayWindow);
      await listener.checkEvent("windows.onRemoved", displayWindow);
      await listener.checkEvent("tabs.onRemoved", displayTab, {
        windowId: displayWindow,
        isWindowClosing: true,
      });

      browser.test.log("Close the popup window.");
      await browser.windows.remove(popupWindow);
      await listener.checkEvent("windows.onRemoved", popupWindow);
      await listener.checkEvent("tabs.onRemoved", popupTab, {
        windowId: popupWindow,
        isWindowClosing: true,
      });

      let finalWindows = await browser.windows.getAll({ populate: true });
      browser.test.assertEq(1, finalWindows.length);
      browser.test.assertEq(initialWindow, finalWindows[0].id);
      browser.test.assertEq(1, finalWindows[0].tabs.length);
      browser.test.assertEq(initialTab, finalWindows[0].tabs[0].id);

      browser.test.assertEq(0, listener.tabEvents.length);
      browser.test.assertEq(0, listener.windowEvents.length);
      browser.test.notifyPass("finished");
    },
    manifest: {
      permissions: ["addressBooks"],
    },
  });

  await extension.startup();

  await extension.awaitMessage("openMainWindow");
  window.MsgOpenNewWindowForFolder(testFolder.URI);

  await extension.awaitMessage("openDisplayWindow");
  await openMessageInWindow([...testFolder.messages][0]);

  await extension.awaitFinish("finished");
  await extension.unload();
});
