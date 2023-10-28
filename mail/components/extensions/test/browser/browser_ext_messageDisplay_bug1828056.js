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

async function getTestExtension_open_msg() {
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

      // Open a message in the specified location and request the displayed
      // message immediately.
      const { message: message2, tab: messageTab } = await new Promise(
        resolve => {
          const createListener = async tab => {
            browser.tabs.onCreated.removeListener(createListener);
            const message = await browser.messageDisplay.getDisplayedMessage(
              tab.id
            );
            resolve({ tab, message });
          };
          browser.tabs.onCreated.addListener(createListener);
          browser.messageDisplay.open({
            location,
            messageId: message1.id,
          });
        }
      );
      browser.test.assertTrue(
        !!message2,
        "We should have a displayed message."
      );
      browser.test.assertTrue(
        message1.id == message2?.id,
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
 * Open a message tab and request its message immediately.
 */
add_task(async function test_message_tab() {
  const extension = await getTestExtension_open_msg();

  const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  about3Pane.displayFolder(gFolder);
  about3Pane.threadTree.selectedIndex = 0;

  await extension.startup();
  extension.sendMessage("tab");

  await extension.awaitFinish("finished");
  await extension.unload();
});

/**
 * Open a message window and request its message immediately.
 */
add_task(async function test_message_window() {
  const extension = await getTestExtension_open_msg();

  const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  about3Pane.displayFolder(gFolder);
  about3Pane.threadTree.selectedIndex = 0;

  await extension.startup();
  extension.sendMessage("window");

  await extension.awaitFinish("finished");
  await extension.unload();
});

async function getTestExtension_select_msg() {
  const files = {
    "background.js": async () => {
      const [expected] = await window.waitForMessage();

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
      const message = await browser.messageDisplay.getDisplayedMessage(
        mailTab.id
      );
      browser.test.assertTrue(!!message, "We should have a displayed message.");

      await window.sendMessage("select");
      const messages = await browser.messageDisplay.getDisplayedMessages(
        mailTab.id
      );
      browser.test.assertEq(
        expected,
        messages.length,
        "The returned number of messages should be correct."
      );
      for (const msg of messages) {
        browser.test.assertTrue(
          message.id != msg.id,
          "The returned message must not be the original selected message."
        );
      }

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
 * Select a single message in a mail tab and request it immediately.
 */
add_task(async function test_single_message() {
  const extension = await getTestExtension_select_msg();

  const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  about3Pane.displayFolder(gFolder);
  about3Pane.threadTree.selectedIndex = 0;

  extension.onMessage("select", () => {
    about3Pane.threadTree.selectedIndex = 1;
    extension.sendMessage();
  });

  await extension.startup();
  extension.sendMessage(1);

  await extension.awaitFinish("finished");
  await extension.unload();
});

/**
 * Select multiple messages in a mail tab and request them immediately.
 */
add_task(async function test_multiple_message() {
  const extension = await getTestExtension_select_msg();

  const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  about3Pane.displayFolder(gFolder);
  about3Pane.threadTree.selectedIndex = 0;

  extension.onMessage("select", () => {
    about3Pane.threadTree.selectedIndices = [2, 3];
    extension.sendMessage();
  });

  await extension.startup();
  extension.sendMessage(2);

  await extension.awaitFinish("finished");
  await extension.unload();
});
