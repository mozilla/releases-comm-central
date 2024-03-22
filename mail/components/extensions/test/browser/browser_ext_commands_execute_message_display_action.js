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

  const extensionOptions = {};
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
      "popup.html": `<!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <script defer="defer" src="popup.js"></script>
          </head>
          <body>
            Popup
          </body>
        </html>`,
      "popup.js": function () {
        browser.test.log("sending from-message-display-action-popup");
        browser.runtime.sendMessage("from-message-display-action-popup");
      },
    };
  }

  extensionOptions.background = () => {
    browser.test.onMessage.addListener((message, withPopup) => {
      browser.commands.onCommand.addListener(() => {
        browser.test.fail(
          "The onCommand listener should never fire for a valid _execute_* command."
        );
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
    browser.test.sendMessage("ready");
  };

  const extension = ExtensionTestUtils.loadExtension(extensionOptions);

  extension.onMessage("send-keys", () => {
    info("Simulating ALT+SHIFT+J");
    EventUtils.synthesizeKey(
      "j",
      { altKey: true, shiftKey: true },
      messageWindow
    );
  });

  await extension.startup();

  const tabmail = document.getElementById("tabmail");
  let messageWindow = window;
  let aboutMessage = tabmail.currentAboutMessage;
  switch (options.displayType) {
    case "tab":
      await openMessageInTab(msg);
      aboutMessage = tabmail.currentAboutMessage;
      break;
    case "window":
      messageWindow = await openMessageInWindow(msg);
      aboutMessage = messageWindow.messageBrowser.contentWindow;
      break;
  }
  await SimpleTest.promiseFocus(aboutMessage);

  await extension.awaitMessage("ready");
  // trigger setup of listeners in background and the send-keys msg
  extension.sendMessage("withPopup", options.withPopup);

  if (options.withPopup) {
    await extension.awaitFinish("execute-message-display-action-popup-opened");

    if (!getBrowserActionPopup(extension, aboutMessage)) {
      await awaitExtensionPanel(extension, aboutMessage);
    }
    await closeBrowserAction(extension, aboutMessage);
  } else {
    await extension.awaitFinish(
      "execute-message-display-action-on-clicked-fired"
    );
  }

  switch (options.displayType) {
    case "tab":
      tabmail.closeTab();
      break;
    case "window":
      messageWindow.close();
      break;
  }

  await extension.unload();
}

add_setup(async () => {
  const account = createAccount();
  const rootFolder = account.incomingServer.rootFolder;
  const subFolders = rootFolder.subFolders;
  createMessages(subFolders[0], 10);
  gMessages = [...subFolders[0].messages];

  const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  about3Pane.displayFolder(subFolders[0].URI);
  about3Pane.threadTree.selectedIndex = 0;
});

const popupJobs = [true, false];
const displayJobs = ["3pane", "tab", "window"];

for (const popupJob of popupJobs) {
  for (const displayJob of displayJobs) {
    add_task(async () => {
      await testExecuteMessageDisplayActionWithOptions(gMessages[1], {
        withPopup: popupJob,
        displayType: displayJob,
      });
    });
  }
}
