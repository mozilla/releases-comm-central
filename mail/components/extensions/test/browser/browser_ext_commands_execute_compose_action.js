/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
"use strict";

let gAccount;

async function testExecuteComposeActionWithOptions(options = {}) {
  info(
    `--> Running test commands_execute_compose_action with the following options: ${JSON.stringify(
      options
    )}`
  );

  const extensionOptions = {};
  extensionOptions.manifest = {
    permissions: ["accountsRead"],
    commands: {
      _execute_compose_action: {
        suggested_key: {
          default: "Alt+Shift+J",
          mac: "Ctrl+Shift+J",
        },
      },
    },
    compose_action: {
      browser_style: true,
    },
  };

  if (options.withFormatToolbar) {
    extensionOptions.manifest.compose_action.default_area = "formattoolbar";
  }

  if (options.withPopup) {
    extensionOptions.manifest.compose_action.default_popup = "popup.html";

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
        browser.test.log("sending from-compose-action-popup");
        browser.runtime.sendMessage("from-compose-action-popup");
      },
    };
  }

  extensionOptions.background = async () => {
    const accounts = await browser.accounts.list();
    browser.test.assertEq(1, accounts.length, "number of accounts");

    browser.test.onMessage.addListener((message, withPopup) => {
      browser.commands.onCommand.addListener(commandName => {
        browser.test.fail(
          "The onCommand listener should never fire for a valid _execute_* command."
        );
      });

      browser.composeAction.onClicked.addListener(() => {
        if (withPopup) {
          browser.test.fail(
            "The onClick listener should never fire if the composeAction has a popup."
          );
          browser.test.notifyFail("execute-compose-action-on-clicked-fired");
        } else {
          browser.test.notifyPass("execute-compose-action-on-clicked-fired");
        }
      });

      browser.runtime.onMessage.addListener(msg => {
        if (msg == "from-compose-action-popup") {
          browser.test.notifyPass("execute-compose-action-popup-opened");
        }
      });

      browser.test.log("Sending send-keys");
      browser.test.sendMessage("send-keys");
    });
  };

  const extension = ExtensionTestUtils.loadExtension(extensionOptions);
  await extension.startup();

  const composeWindow = await openComposeWindow(gAccount);
  await focusWindow(composeWindow);

  // trigger setup of listeners in background and the send-keys msg
  extension.sendMessage("withPopup", options.withPopup);

  await extension.awaitMessage("send-keys");
  info("Simulating ALT+SHIFT+J");
  const modifiers =
    AppConstants.platform == "macosx"
      ? { metaKey: true, shiftKey: true }
      : { altKey: true, shiftKey: true };
  EventUtils.synthesizeKey("j", modifiers, composeWindow);

  if (options.withPopup) {
    await extension.awaitFinish("execute-compose-action-popup-opened");

    if (!getBrowserActionPopup(extension, composeWindow)) {
      await awaitExtensionPanel(extension, composeWindow);
    }
    await closeBrowserAction(extension, composeWindow);
  } else {
    await extension.awaitFinish("execute-compose-action-on-clicked-fired");
  }
  composeWindow.close();
  await extension.unload();
}

add_setup(async () => {
  gAccount = createAccount();
  addIdentity(gAccount);
});

const popupJobs = [true, false];
const formatToolbarJobs = [true, false];

for (const popupJob of popupJobs) {
  for (const formatToolbarJob of formatToolbarJobs) {
    add_task(async () => {
      await testExecuteComposeActionWithOptions({
        withPopup: popupJob,
        withFormatToolbar: formatToolbarJob,
      });
    });
  }
}
