/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

async function testExecuteBrowserActionWithOptions_mv2(options = {}) {
  // Make sure the mouse isn't hovering over the browserAction widget.
  const folderTree = document
    .getElementById("tabmail")
    .currentAbout3Pane.document.getElementById("folderTree");
  EventUtils.synthesizeMouseAtCenter(folderTree, { type: "mouseover" }, window);

  const extensionOptions = {
    useAddonManager: "temporary",
  };

  extensionOptions.manifest = {
    commands: {
      _execute_browser_action: {
        suggested_key: {
          default: "Alt+Shift+J",
        },
      },
    },
    browser_action: {
      browser_style: true,
    },
  };

  if (options.withPopup) {
    extensionOptions.manifest.browser_action.default_popup = "popup.html";

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
        browser.runtime.sendMessage("from-browser-action-popup");
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

      browser.browserAction.onClicked.addListener(() => {
        if (withPopup) {
          browser.test.fail(
            "The onClick listener should never fire if the browserAction has a popup."
          );
          browser.test.notifyFail("execute-browser-action-on-clicked-fired");
        } else {
          browser.test.notifyPass("execute-browser-action-on-clicked-fired");
        }
      });

      browser.runtime.onMessage.addListener(msg => {
        if (msg == "from-browser-action-popup") {
          browser.test.notifyPass("execute-browser-action-popup-opened");
        }
      });

      browser.test.sendMessage("send-keys");
    });
  };

  const extension = ExtensionTestUtils.loadExtension(extensionOptions);

  extension.onMessage("send-keys", () => {
    EventUtils.synthesizeKey("j", { altKey: true, shiftKey: true });
  });

  await extension.startup();

  await SimpleTest.promiseFocus(window);

  // trigger setup of listeners in background and the send-keys msg
  extension.sendMessage("withPopup", options.withPopup);

  if (options.withPopup) {
    await extension.awaitFinish("execute-browser-action-popup-opened");

    if (!getBrowserActionPopup(extension)) {
      await awaitExtensionPanel(extension);
    }
    await closeBrowserAction(extension);
  } else {
    await extension.awaitFinish("execute-browser-action-on-clicked-fired");
  }
  await extension.unload();
}

add_setup(async () => {
  // This test uses default_area in an anction manifest, to ensure we do not
  // throw but simply ignore this property, which is used by Firefox, but not by
  // us. However, by default, tests throw when deprecated properties are used,
  // which can be disabled by setting the following pref to false.
  Services.prefs.setBoolPref(
    "extensions.webextensions.warnings-as-errors",
    false
  );
  registerCleanupFunction(async () => {
    Services.prefs.clearUserPref("extensions.webextensions.warnings-as-errors");
  });
});

add_task(async function test_execute_browser_action_with_popup_mv2() {
  await testExecuteBrowserActionWithOptions_mv2({
    withPopup: true,
  });
});

add_task(async function test_execute_browser_action_without_popup_mv2() {
  await testExecuteBrowserActionWithOptions_mv2();
});

async function testExecuteActionWithOptions_mv3(options = {}) {
  // Make sure the mouse isn't hovering over the action widget.
  const folderTree = document
    .getElementById("tabmail")
    .currentAbout3Pane.document.getElementById("folderTree");
  EventUtils.synthesizeMouseAtCenter(folderTree, { type: "mouseover" }, window);

  const extensionOptions = {
    useAddonManager: "temporary",
  };

  extensionOptions.manifest = {
    manifest_version: 3,
    commands: {
      _execute_action: {
        suggested_key: {
          default: "Alt+Shift+J",
        },
      },
    },
    action: {
      browser_style: true,
      // Ignored in MV3, but should not throw.
      default_area: "tabstoolbar",
    },
  };

  if (options.withPopup) {
    extensionOptions.manifest.action.default_popup = "popup.html";

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
        browser.runtime.sendMessage("from-action-popup");
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

      browser.action.onClicked.addListener(() => {
        if (withPopup) {
          browser.test.fail(
            "The onClick listener should never fire if the action has a popup."
          );
          browser.test.notifyFail("execute-action-on-clicked-fired");
        } else {
          browser.test.notifyPass("execute-action-on-clicked-fired");
        }
      });

      browser.runtime.onMessage.addListener(msg => {
        if (msg == "from-action-popup") {
          browser.test.notifyPass("execute-action-popup-opened");
        }
      });

      browser.test.sendMessage("send-keys");
    });
  };

  const extension = ExtensionTestUtils.loadExtension(extensionOptions);

  extension.onMessage("send-keys", () => {
    EventUtils.synthesizeKey("j", { altKey: true, shiftKey: true });
  });

  await extension.startup();

  await SimpleTest.promiseFocus(window);

  // trigger setup of listeners in background and the send-keys msg
  extension.sendMessage("withPopup", options.withPopup);

  if (options.withPopup) {
    await extension.awaitFinish("execute-action-popup-opened");

    if (!getBrowserActionPopup(extension)) {
      await awaitExtensionPanel(extension);
    }
    await closeBrowserAction(extension);
  } else {
    await extension.awaitFinish("execute-action-on-clicked-fired");
  }
  await extension.unload();
}

add_task(async function test_execute_browser_action_with_popup_mv3() {
  await testExecuteActionWithOptions_mv3({
    withPopup: true,
  });
});

add_task(async function test_execute_browser_action_without_popup_mv3() {
  await testExecuteActionWithOptions_mv3();
});
