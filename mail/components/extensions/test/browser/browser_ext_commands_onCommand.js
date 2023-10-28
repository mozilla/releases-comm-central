/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
"use strict";

var testCommands = [
  // Ctrl Shortcuts
  {
    name: "toggle-ctrl-a",
    shortcut: "Ctrl+A",
    key: "A",
    // Does not work in compose window on Linux.
    skip: ["messageCompose", "content"],
    modifiers: {
      accelKey: true,
    },
  },
  {
    name: "toggle-ctrl-up",
    shortcut: "Ctrl+Up",
    key: "VK_UP",
    modifiers: {
      accelKey: true,
    },
  },
  // Alt Shortcuts
  {
    name: "toggle-alt-a",
    shortcut: "Alt+A",
    key: "A",
    // Does not work in compose window on Mac.
    skip: ["messageCompose"],
    modifiers: {
      altKey: true,
    },
  },
  {
    name: "toggle-alt-down",
    shortcut: "Alt+Down",
    key: "VK_DOWN",
    modifiers: {
      altKey: true,
    },
  },
  // Mac Shortcuts
  {
    name: "toggle-command-shift-page-up",
    shortcutMac: "Command+Shift+PageUp",
    key: "VK_PAGE_UP",
    modifiers: {
      accelKey: true,
      shiftKey: true,
    },
  },
  {
    name: "toggle-mac-control-shift+period",
    shortcut: "Ctrl+Shift+Period",
    shortcutMac: "MacCtrl+Shift+Period",
    key: "VK_PERIOD",
    modifiers: {
      ctrlKey: true,
      shiftKey: true,
    },
  },
  // Ctrl+Shift Shortcuts
  {
    name: "toggle-ctrl-shift-left",
    shortcut: "Ctrl+Shift+Left",
    key: "VK_LEFT",
    modifiers: {
      accelKey: true,
      shiftKey: true,
    },
  },
  {
    name: "toggle-ctrl-shift-1",
    shortcut: "Ctrl+Shift+1",
    key: "1",
    modifiers: {
      accelKey: true,
      shiftKey: true,
    },
  },
  // Alt+Shift Shortcuts
  {
    name: "toggle-alt-shift-1",
    shortcut: "Alt+Shift+1",
    key: "1",
    modifiers: {
      altKey: true,
      shiftKey: true,
    },
  },
  // TODO: This results in multiple events fired. See bug 1805375.
  /*
  {
    name: "toggle-alt-shift-a",
    shortcut: "Alt+Shift+A",
    key: "A",
    // Does not work in compose window on Mac.
    skip: ["messageCompose"],
    modifiers: {
      altKey: true,
      shiftKey: true,
    },
  },
  */
  {
    name: "toggle-alt-shift-right",
    shortcut: "Alt+Shift+Right",
    key: "VK_RIGHT",
    modifiers: {
      altKey: true,
      shiftKey: true,
    },
  },
  // Function keys
  {
    name: "function-keys-Alt+Shift+F3",
    shortcut: "Alt+Shift+F3",
    key: "VK_F3",
    modifiers: {
      altKey: true,
      shiftKey: true,
    },
  },
  {
    name: "function-keys-F2",
    shortcut: "F2",
    key: "VK_F2",
    modifiers: {
      altKey: false,
      shiftKey: false,
    },
  },
  // Misc Shortcuts
  {
    name: "valid-command-with-unrecognized-property-name",
    shortcut: "Alt+Shift+3",
    key: "3",
    modifiers: {
      altKey: true,
      shiftKey: true,
    },
    unrecognized_property: "with-a-random-value",
  },
  {
    name: "spaces-in-shortcut-name",
    shortcut: "  Alt + Shift + 2  ",
    key: "2",
    modifiers: {
      altKey: true,
      shiftKey: true,
    },
  },
  {
    name: "toggle-ctrl-space",
    shortcut: "Ctrl+Space",
    key: "VK_SPACE",
    modifiers: {
      accelKey: true,
    },
  },
  {
    name: "toggle-ctrl-comma",
    shortcut: "Ctrl+Comma",
    key: "VK_COMMA",
    modifiers: {
      accelKey: true,
    },
  },
  {
    name: "toggle-ctrl-period",
    shortcut: "Ctrl+Period",
    key: "VK_PERIOD",
    modifiers: {
      accelKey: true,
    },
  },
  {
    name: "toggle-ctrl-alt-v",
    shortcut: "Ctrl+Alt+V",
    key: "V",
    modifiers: {
      accelKey: true,
      altKey: true,
    },
  },
];

requestLongerTimeout(2);

add_task(async function test_user_defined_commands() {
  const win1 = await openNewMailWindow();

  const commands = {};
  const isMac = AppConstants.platform == "macosx";
  let totalMacOnlyCommands = 0;
  const numberNumericCommands = 4;

  for (const testCommand of testCommands) {
    const command = {
      suggested_key: {},
    };

    if (testCommand.shortcut) {
      command.suggested_key.default = testCommand.shortcut;
    }

    if (testCommand.shortcutMac) {
      command.suggested_key.mac = testCommand.shortcutMac;
    }

    if (testCommand.shortcutMac && !testCommand.shortcut) {
      totalMacOnlyCommands++;
    }

    if (testCommand.unrecognized_property) {
      command.unrecognized_property = testCommand.unrecognized_property;
    }

    commands[testCommand.name] = command;
  }

  function background() {
    browser.commands.onCommand.addListener((commandName, activeTab) => {
      browser.test.sendMessage("oncommand event received", {
        commandName,
        activeTab,
      });
    });
    browser.test.sendMessage("ready");
  }

  const extension = ExtensionTestUtils.loadExtension({
    manifest: {
      commands,
    },
    background,
  });

  SimpleTest.waitForExplicitFinish();
  const waitForConsole = new Promise(resolve => {
    SimpleTest.monitorConsole(resolve, [
      {
        message:
          /Reading manifest: Warning processing commands.*.unrecognized_property: An unexpected property was found/,
      },
    ]);
  });

  // Unrecognized_property in manifest triggers warning.
  ExtensionTestUtils.failOnSchemaWarnings(false);
  await extension.startup();
  ExtensionTestUtils.failOnSchemaWarnings(true);
  await extension.awaitMessage("ready");

  async function runTest(window, expectedTabType) {
    for (const testCommand of testCommands) {
      if (testCommand.skip && testCommand.skip.includes(expectedTabType)) {
        continue;
      }
      if (testCommand.shortcutMac && !testCommand.shortcut && !isMac) {
        continue;
      }
      await BrowserTestUtils.synthesizeKey(
        testCommand.key,
        testCommand.modifiers,
        window.browsingContext
      );
      const message = await extension.awaitMessage("oncommand event received");
      is(
        message.commandName,
        testCommand.name,
        `Expected onCommand listener to fire with the correct name: ${testCommand.name}`
      );
      is(
        message.activeTab.type,
        expectedTabType,
        `Expected onCommand listener to fire with the correct tab type: ${expectedTabType}`
      );
    }
  }

  // Create another window after the extension is loaded.
  const win2 = await openNewMailWindow();

  const totalTestCommands =
    Object.keys(testCommands).length + numberNumericCommands;
  const expectedCommandsRegistered = isMac
    ? totalTestCommands
    : totalTestCommands - totalMacOnlyCommands;

  const account = createAccount();
  addIdentity(account);
  const win3 = await openComposeWindow(account);
  // Some key combinations do not work if the TO field has focus.
  win3.document.querySelector("editor").focus();

  // Confirm the keysets have been added to all windows.
  const keysetID = `ext-keyset-id-${makeWidgetId(extension.id)}`;

  let keyset = win1.document.getElementById(keysetID);
  ok(keyset != null, "Expected keyset to exist");
  is(
    keyset.children.length,
    expectedCommandsRegistered,
    "Expected keyset of window #1 to have the correct number of children"
  );

  keyset = win2.document.getElementById(keysetID);
  ok(keyset != null, "Expected keyset to exist");
  is(
    keyset.children.length,
    expectedCommandsRegistered,
    "Expected keyset of window #2 to have the correct number of children"
  );

  keyset = win3.document.getElementById(keysetID);
  ok(keyset != null, "Expected keyset to exist");
  is(
    keyset.children.length,
    expectedCommandsRegistered,
    "Expected keyset of window #3 to have the correct number of children"
  );

  // Confirm that the commands are registered to all windows.
  await focusWindow(win1);
  await runTest(win1, "mail");

  await focusWindow(win2);
  await runTest(win2, "mail");

  await focusWindow(win3);
  await runTest(win3, "messageCompose");

  // Unload the extension and confirm that the keysets have been removed from all windows.
  await extension.unload();

  keyset = win1.document.getElementById(keysetID);
  is(keyset, null, "Expected keyset to be removed from the window #1");

  keyset = win2.document.getElementById(keysetID);
  is(keyset, null, "Expected keyset to be removed from the window #2");

  keyset = win3.document.getElementById(keysetID);
  is(keyset, null, "Expected keyset to be removed from the window #3");

  await BrowserTestUtils.closeWindow(win1);
  await BrowserTestUtils.closeWindow(win2);
  await BrowserTestUtils.closeWindow(win3);

  SimpleTest.endMonitorConsole();
  await waitForConsole;
});

add_task(async function test_commands_MV3_event_page() {
  const win1 = await openNewMailWindow();

  const commands = {};
  const isMac = AppConstants.platform == "macosx";
  let totalMacOnlyCommands = 0;
  const numberNumericCommands = 4;

  for (const testCommand of testCommands) {
    const command = {
      suggested_key: {},
    };

    if (testCommand.shortcut) {
      command.suggested_key.default = testCommand.shortcut;
    }

    if (testCommand.shortcutMac) {
      command.suggested_key.mac = testCommand.shortcutMac;
    }

    if (testCommand.shortcutMac && !testCommand.shortcut) {
      totalMacOnlyCommands++;
    }

    if (testCommand.unrecognized_property) {
      command.unrecognized_property = testCommand.unrecognized_property;
    }

    commands[testCommand.name] = command;
  }

  function background() {
    // Whenever the extension starts or wakes up, the eventCounter is reset and
    // allows to observe the order of events fired. In case of a wake-up, the
    // first observed event is the one that woke up the background.
    let eventCounter = 0;

    browser.test.onMessage.addListener(async message => {
      if (message == "createPopup") {
        const popup = await browser.windows.create({
          type: "popup",
          url: "example.html",
        });
        browser.test.sendMessage("popupCreated", popup);
      }
    });

    browser.commands.onCommand.addListener(async (commandName, activeTab) => {
      browser.test.sendMessage("oncommand event received", {
        eventCount: ++eventCounter,
        commandName,
        activeTab,
      });
    });
    browser.test.sendMessage("ready");
  }
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": background,
      "utils.js": await getUtilsJS(),
      "example.html": `<!DOCTYPE HTML>
      <html>
      <head>
        <title>EXAMPLE</title>
        <meta http-equiv="content-type" content="text/html; charset=utf-8">
      </head>
      <body>
        <p>This is an example page</p>
      </body>
      </html>`,
    },
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      browser_specific_settings: { gecko: { id: "commands@mochi.test" } },
      commands,
    },
  });

  SimpleTest.waitForExplicitFinish();
  const waitForConsole = new Promise(resolve => {
    SimpleTest.monitorConsole(resolve, [
      {
        message:
          /Reading manifest: Warning processing commands.*.unrecognized_property: An unexpected property was found/,
      },
    ]);
  });

  // Unrecognized_property in manifest triggers warning.
  ExtensionTestUtils.failOnSchemaWarnings(false);
  await extension.startup();
  ExtensionTestUtils.failOnSchemaWarnings(true);
  await extension.awaitMessage("ready");

  // Check for persistent listener.
  assertPersistentListeners(extension, "commands", "onCommand", {
    primed: false,
  });

  let gEventCounter = 0;
  async function runTest(window, expectedTabType) {
    // The second run will terminate the background script before each keypress,
    // verifying that the background script is waking up correctly.
    for (const terminateBackground of [false, true]) {
      for (const testCommand of testCommands) {
        if (testCommand.skip && testCommand.skip.includes(expectedTabType)) {
          continue;
        }
        if (testCommand.shortcutMac && !testCommand.shortcut && !isMac) {
          continue;
        }

        if (terminateBackground) {
          gEventCounter = 0;
        }

        if (terminateBackground) {
          // Terminate the background and verify the primed persistent listener.
          await extension.terminateBackground({
            disableResetIdleForTest: true,
          });
          assertPersistentListeners(extension, "commands", "onCommand", {
            primed: true,
          });
          await BrowserTestUtils.synthesizeKey(
            testCommand.key,
            testCommand.modifiers,
            window.browsingContext
          );
          // Wait for background restart.
          await extension.awaitMessage("ready");
        } else {
          await BrowserTestUtils.synthesizeKey(
            testCommand.key,
            testCommand.modifiers,
            window.browsingContext
          );
        }

        const message = await extension.awaitMessage(
          "oncommand event received"
        );
        is(
          message.commandName,
          testCommand.name,
          `onCommand listener should fire with the correct command name`
        );
        is(
          message.activeTab.type,
          expectedTabType,
          `onCommand listener should fire with the correct tab type`
        );
        is(
          message.eventCount,
          ++gEventCounter,
          `Event counter should be correct`
        );
      }
    }
  }

  // Create another window after the extension is loaded.
  const win2 = await openNewMailWindow();

  const totalTestCommands =
    Object.keys(testCommands).length + numberNumericCommands;
  const expectedCommandsRegistered = isMac
    ? totalTestCommands
    : totalTestCommands - totalMacOnlyCommands;

  const account = createAccount();
  addIdentity(account);
  const win3 = await openComposeWindow(account);
  // Some key combinations do not work if the TO field has focus.
  win3.document.querySelector("editor").focus();

  // Open a popup window.
  const popupPromise = extension.awaitMessage("popupCreated");
  extension.sendMessage("createPopup");
  const popup = await popupPromise;
  const win4 = Services.wm.getOuterWindowWithId(popup.id);

  // Confirm the keysets have been added to all windows.
  const keysetID = `ext-keyset-id-${makeWidgetId(extension.id)}`;

  const windows = [
    { window: win1, autoRemove: false, type: "mail" },
    { window: win2, autoRemove: false, type: "mail" },
    { window: win3, autoRemove: false, type: "messageCompose" },
    { window: win4, autoRemove: true, type: "content" },
  ];
  for (const i in windows) {
    const keyset = windows[i].window.document.getElementById(keysetID);
    ok(keyset != null, "Expected keyset to exist");
    is(
      keyset.children.length,
      expectedCommandsRegistered,
      `Expected keyset of window #${i} to have the correct number of children`
    );

    // Confirm that the commands are registered to all windows.
    await focusWindow(windows[i].window);
    await runTest(windows[i].window, windows[i].type);
  }

  // Unload the extension and confirm that the keysets have been removed from
  // all windows.
  await extension.unload();
  for (const i in windows) {
    // Extension popup windows are removed/closed on extension unload, so they
    // have to skip this part of the test.
    if (windows[i].autoRemove) {
      continue;
    }
    const keyset = windows[i].window.document.getElementById(keysetID);
    is(keyset, null, `Expected keyset to be removed from the window #${i}`);
    await BrowserTestUtils.closeWindow(windows[i].window);
  }

  SimpleTest.endMonitorConsole();
  await waitForConsole;
});
