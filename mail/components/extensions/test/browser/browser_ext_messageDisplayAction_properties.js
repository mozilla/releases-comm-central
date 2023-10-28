/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  const account = createAccount();
  addIdentity(account);
  const rootFolder = account.incomingServer.rootFolder;
  rootFolder.createSubfolder("test", null);
  const folder = rootFolder.getChildNamed("test");
  createMessages(folder, 1);
  const [message] = [...folder.messages];

  const tabmail = document.getElementById("tabmail");
  const about3Pane = tabmail.currentAbout3Pane;
  about3Pane.restoreState({
    folderPaneVisible: true,
    folderURI: folder.URI,
    messagePaneVisible: true,
  });
  about3Pane.threadTree.selectedIndex = 0;
  await awaitBrowserLoaded(
    about3Pane.messageBrowser.contentWindow.getMessagePaneBrowser()
  );

  await openMessageInTab(message);
  await openMessageInWindow(message);
  await new Promise(resolve => executeSoon(resolve));

  const files = {
    "background.js": async () => {
      async function checkProperty(property, expectedDefault, ...expected) {
        browser.test.log(
          `${property}: ${expectedDefault}, ${expected.join(", ")}`
        );

        browser.test.assertEq(
          expectedDefault,
          await browser.messageDisplayAction[property]({})
        );
        for (let i = 0; i < 3; i++) {
          browser.test.assertEq(
            expected[i],
            await browser.messageDisplayAction[property]({ tabId: tabIDs[i] })
          );
        }

        await window.sendMessage("checkProperty", property, expected);
      }

      const tabs = await browser.tabs.query({});
      browser.test.assertEq(3, tabs.length);
      const tabIDs = tabs.map(t => t.id);

      await checkProperty("isEnabled", true, true, true, true);
      await browser.messageDisplayAction.disable();
      await checkProperty("isEnabled", false, false, false, false);
      await browser.messageDisplayAction.enable(tabIDs[0]);
      await checkProperty("isEnabled", false, true, false, false);
      await browser.messageDisplayAction.enable();
      await checkProperty("isEnabled", true, true, true, true);
      await browser.messageDisplayAction.disable();
      await checkProperty("isEnabled", false, true, false, false);
      await browser.messageDisplayAction.disable(tabIDs[0]);
      await checkProperty("isEnabled", false, false, false, false);
      await browser.messageDisplayAction.enable();
      await checkProperty("isEnabled", true, false, true, true);

      await checkProperty(
        "getTitle",
        "default",
        "default",
        "default",
        "default"
      );
      await browser.messageDisplayAction.setTitle({
        tabId: tabIDs[2],
        title: "tab2",
      });
      await checkProperty("getTitle", "default", "default", "default", "tab2");
      await browser.messageDisplayAction.setTitle({ title: "new" });
      await checkProperty("getTitle", "new", "new", "new", "tab2");
      await browser.messageDisplayAction.setTitle({
        tabId: tabIDs[1],
        title: "tab1",
      });
      await checkProperty("getTitle", "new", "new", "tab1", "tab2");
      await browser.messageDisplayAction.setTitle({
        tabId: tabIDs[2],
        title: null,
      });
      await checkProperty("getTitle", "new", "new", "tab1", "new");
      await browser.messageDisplayAction.setTitle({ title: null });
      await checkProperty("getTitle", "default", "default", "tab1", "default");
      await browser.messageDisplayAction.setTitle({
        tabId: tabIDs[1],
        title: null,
      });
      await checkProperty(
        "getTitle",
        "default",
        "default",
        "default",
        "default"
      );

      await browser.tabs.remove(tabIDs[0]);
      await browser.tabs.remove(tabIDs[1]);
      await browser.tabs.remove(tabIDs[2]);
      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      applications: {
        gecko: {
          id: "message_display_action_properties@mochi.test",
        },
      },
      background: { scripts: ["utils.js", "background.js"] },
      message_display_action: {
        default_title: "default",
      },
    },
  });

  await extension.startup();

  const mainWindowTabs = tabmail.tabInfo;
  is(mainWindowTabs.length, 2);

  const messageWindow = Services.wm.getMostRecentWindow("mail:messageWindow");
  const messageWindowButton =
    messageWindow.messageBrowser.contentDocument.getElementById(
      "message_display_action_properties_mochi_test-messageDisplayAction-toolbarbutton"
    );

  extension.onMessage("checkProperty", async (property, expected) => {
    function checkButton(button, expectedIndex) {
      switch (property) {
        case "isEnabled":
          is(
            button.disabled,
            !expected[expectedIndex],
            `button ${expectedIndex} enabled state`
          );
          break;
        case "getTitle":
          is(
            button.getAttribute("label"),
            expected[expectedIndex],
            `button ${expectedIndex} label`
          );
          break;
      }
    }

    for (let i = 0; i < 2; i++) {
      tabmail.switchToTab(mainWindowTabs[i]);
      let aboutMessage = mainWindowTabs[i].chromeBrowser.contentWindow;
      if (aboutMessage.location.href == "about:3pane") {
        aboutMessage = aboutMessage.messageBrowser.contentWindow;
      }
      await new Promise(resolve => aboutMessage.requestAnimationFrame(resolve));
      checkButton(
        aboutMessage.document.getElementById(
          "message_display_action_properties_mochi_test-messageDisplayAction-toolbarbutton"
        ),
        i
      );
    }
    checkButton(messageWindowButton, 2);

    extension.sendMessage();
  });

  await extension.awaitFinish("finished");
  await extension.unload();

  messageWindow.close();
  tabmail.closeOtherTabs(0);
});
