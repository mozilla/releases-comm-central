/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
"use strict";

let gMessages;

async function testExecuteMessageDisplayActionWithOptions(msg, options = {}) {
  info(
    `--> Running test commands_execute_message_display_action with the following options: ${JSON.stringify(
      options
    )}`
  );

  let extensionOptions = {};
  extensionOptions.manifest = {
    commands: {
      _execute_message_display_action: {
        suggested_key: {
          default: "Alt+Shift+J",
        },
      },
    },
    message_display_action: {
      browser_style: true,
    },
  };

  if (options.withPopup) {
    extensionOptions.manifest.message_display_action.default_popup =
      "popup.html";

    extensionOptions.files = {
      "popup.html": `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <script src="popup.js"></script>
          </head>
          <body>
            Popup
          </body>
        </html>
      `,
      "popup.js": function() {
        browser.test.log("sending from-message-display-action-popup");
        browser.runtime.sendMessage("from-message-display-action-popup");
      },
    };
  }

  extensionOptions.background = () => {
    browser.test.onMessage.addListener((message, withPopup) => {
      browser.commands.onCommand.addListener(commandName => {
        if (commandName == "_execute_message_display_action") {
          browser.test.fail(
            "The onCommand listener should never fire for _execute_message_display_action."
          );
        }
      });

      browser.messageDisplayAction.onClicked.addListener(() => {
        if (withPopup) {
          browser.test.fail(
            "The onClick listener should never fire if the messageDisplayAction has a popup."
          );
          browser.test.notifyFail(
            "execute-message-display-action-on-clicked-fired"
          );
        } else {
          browser.test.notifyPass(
            "execute-message-display-action-on-clicked-fired"
          );
        }
      });

      browser.runtime.onMessage.addListener(msg => {
        if (msg == "from-message-display-action-popup") {
          browser.test.notifyPass(
            "execute-message-display-action-popup-opened"
          );
        }
      });

      browser.test.log("Sending send-keys");
      browser.test.sendMessage("send-keys");
    });
  };

  let extension = ExtensionTestUtils.loadExtension(extensionOptions);

  extension.onMessage("send-keys", () => {
    info("Simulating ALT+SHIFT+J");
    EventUtils.synthesizeKey(
      "j",
      { altKey: true, shiftKey: true },
      messageWindow
    );
  });

  await extension.startup();

  let messageWindow = window;
  switch (options.displayType) {
    case "tab":
      await openMessageInTab(msg);
      break;
    case "window":
      messageWindow = await openMessageInWindow(msg);
      break;
  }
  await SimpleTest.promiseFocus(messageWindow);

  // trigger setup of listeners in background and the send-keys msg
  extension.sendMessage("withPopup", options.withPopup);

  if (options.withPopup) {
    await extension.awaitFinish("execute-message-display-action-popup-opened");

    if (!getBrowserActionPopup(extension, messageWindow)) {
      await awaitExtensionPanel(extension, messageWindow);
    }
    await closeBrowserAction(extension, messageWindow);
  } else {
    await extension.awaitFinish(
      "execute-message-display-action-on-clicked-fired"
    );
  }

  switch (options.displayType) {
    case "tab":
      document.getElementById("tabmail").closeTab();
      break;
    case "window":
      messageWindow.close();
      break;
  }

  await extension.unload();
}

add_task(async function prepare_test() {
  let account = createAccount();
  let rootFolder = account.incomingServer.rootFolder;
  let subFolders = rootFolder.subFolders;
  createMessages(subFolders[0], 10);
  gMessages = [...subFolders[0].messages];

  window.gFolderTreeView.selectFolder(subFolders[0]);
  window.gFolderDisplay.selectViewIndex(0);
  await BrowserTestUtils.browserLoaded(window.getMessagePaneBrowser());
});

let popupJobs = [true, false];
let displayJobs = ["3pane", "tab", "window"];

for (let popupJob of popupJobs) {
  for (let displayJob of displayJobs) {
    add_task(async () => {
      await testExecuteMessageDisplayActionWithOptions(gMessages[1], {
        withPopup: popupJob,
        displayType: displayJob,
      });
    });
  }
}
