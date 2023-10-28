var gAccount;
var gMessages;
var gFolder;

add_setup(() => {
  gAccount = createAccount();
  addIdentity(gAccount);
  const rootFolder = gAccount.incomingServer.rootFolder;
  rootFolder.createSubfolder("test0", null);

  const subFolders = {};
  for (const folder of rootFolder.subFolders) {
    subFolders[folder.name] = folder;
  }
  createMessages(subFolders.test0, 5);

  gFolder = subFolders.test0;
  gMessages = [...subFolders.test0.messages];
});

async function getTestExtension() {
  const files = {
    "background.js": async () => {
      const [location] = await window.waitForMessage();

      const [mailTab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      browser.test.assertEq(
        "mail",
        mailTab.type,
        "Should have found a mail tab."
      );

      // Get displayed message.
      const message1 = await browser.messageDisplay.getDisplayedMessage(
        mailTab.id
      );
      browser.test.assertTrue(
        !!message1,
        "We should have a displayed message."
      );

      // Open message in a new tab, wait for onCreated and for onUpdated.
      const messageTab = await new Promise(resolve => {
        const createListener = tab => {
          browser.tabs.onCreated.removeListener(createListener);
          browser.test.assertEq(
            "loading",
            tab.status,
            "The tab is expected to be still loading."
          );
          browser.tabs.onUpdated.addListener(updateListener, {
            tabId: tab.id,
          });
        };
        const updateListener = (tabId, changeInfo, tab) => {
          if (changeInfo.status) {
            browser.test.assertEq(
              tab.status,
              changeInfo.status,
              "We should see the same status in tab and in changeInfo."
            );
            if (changeInfo.status == "complete") {
              browser.tabs.onUpdated.removeListener(updateListener);
              resolve(tab);
            }
          }
        };
        browser.tabs.onCreated.addListener(createListener);
        browser.messageDisplay.open({
          location,
          messageId: message1.id,
        });
      });

      // We should now be able to get the message.
      const message2 = await browser.messageDisplay.getDisplayedMessage(
        messageTab.id
      );
      browser.test.assertTrue(
        !!message2,
        "We should have a displayed message."
      );
      browser.test.assertTrue(
        message1.id == message2?.id,
        "We should see the same message."
      );

      // We should be able to get the message later as well.
      await new Promise(resolve => window.setTimeout(resolve));
      const message3 = await browser.messageDisplay.getDisplayedMessage(
        messageTab.id
      );
      browser.test.assertTrue(
        !!message3,
        "We should have a displayed message."
      );
      browser.test.assertTrue(
        message1.id == message3?.id,
        "We should see the same message."
      );

      browser.tabs.remove(messageTab.id);

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  return ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead", "tabs"],
    },
  });
}

/**
 * Open a message tab and check its status, wait till loaded and get the message.
 */
add_task(async function test_onCreated_message_tab() {
  const extension = await getTestExtension();

  const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  about3Pane.displayFolder(gFolder);
  about3Pane.threadTree.selectedIndex = 0;

  await extension.startup();
  extension.sendMessage("tab");

  await extension.awaitFinish("finished");
  await extension.unload();
});

/**
 * Open a message window and check its status, wait till loaded and get the message.
 */
add_task(async function test_onCreated_message_window() {
  const extension = await getTestExtension();

  const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  about3Pane.displayFolder(gFolder);
  about3Pane.threadTree.selectedIndex = 0;

  await extension.startup();
  extension.sendMessage("window");

  await extension.awaitFinish("finished");
  await extension.unload();
});

/**
 * Open an address book tab and check its status.
 */
add_task(async function test_onCreated_addressBook_tab() {
  const files = {
    "background.js": async () => {
      const [mailTab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      browser.test.assertEq(
        "mail",
        mailTab.type,
        "Should have found a mail tab."
      );

      // Open ab tab, wait for onCreated and for onUpdated.
      const abTab = await new Promise(resolve => {
        const createListener = tab => {
          browser.test.assertEq(
            "loading",
            tab.status,
            "The tab is expected to be still loading."
          );
          browser.tabs.onUpdated.addListener(updateListener, {
            tabId: tab.id,
          });
        };
        const updateListener = (tabId, changeInfo, tab) => {
          if (changeInfo.status) {
            browser.test.assertEq(
              tab.status,
              changeInfo.status,
              "We should see the same status in tab and in changeInfo."
            );
            if (changeInfo.status == "complete") {
              browser.tabs.onUpdated.removeListener(updateListener);
              resolve(tab);
            }
          }
        };
        browser.tabs.onCreated.addListener(createListener);
        browser.addressBooks.openUI();
      });
      browser.test.assertEq(
        "addressBook",
        abTab.type,
        "We should find an addressBook tab."
      );
      browser.tabs.remove(abTab.id);

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["addressBooks"],
    },
  });

  const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  about3Pane.displayFolder(gFolder);
  about3Pane.threadTree.selectedIndex = 0;

  await extension.startup();
  extension.sendMessage("window");

  await extension.awaitFinish("finished");
  await extension.unload();
});
