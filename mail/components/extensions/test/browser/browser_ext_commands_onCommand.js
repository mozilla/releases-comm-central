/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
"use strict";

add_task(async function test_user_defined_commands() {
  const testCommands = [
    // Ctrl Shortcuts
    {
      name: "toggle-ctrl-a",
      shortcut: "Ctrl+A",
      key: "A",
      // Does not work in compose window on Linux.
      skip: ["messageCompose"],
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

  let win1 = await openNewMailWindow();

  let commands = {};
  let isMac = AppConstants.platform == "macosx";
  let totalMacOnlyCommands = 0;
  let numberNumericCommands = 4;

  for (let testCommand of testCommands) {
    let command = {
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
      browser.test.sendMessage("oncommand", { commandName, activeTab });
    });
    browser.test.sendMessage("ready");
  }
  let extension = ExtensionTestUtils.loadExtension({
    manifest: {
      commands,
    },
    background,
  });

  SimpleTest.waitForExplicitFinish();
  let waitForConsole = new Promise(resolve => {
    SimpleTest.monitorConsole(resolve, [
      {
        message: /Reading manifest: Warning processing commands.*.unrecognized_property: An unexpected property was found/,
      },
    ]);
  });

  // Unrecognized_property in manifest triggers warning.
  ExtensionTestUtils.failOnSchemaWarnings(false);
  await extension.startup();
  ExtensionTestUtils.failOnSchemaWarnings(true);
  await extension.awaitMessage("ready");

  async function runTest(window, expectedTabType) {
    for (let testCommand of testCommands) {
      if (testCommand.skip && testCommand.skip.includes(expectedTabType)) {
        continue;
      }
      if (testCommand.shortcutMac && !testCommand.shortcut && !isMac) {
        continue;
      }
      EventUtils.synthesizeKey(testCommand.key, testCommand.modifiers, window);
      let message = await extension.awaitMessage("oncommand");
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
  let win2 = await openNewMailWindow();

  let totalTestCommands =
    Object.keys(testCommands).length + numberNumericCommands;
  let expectedCommandsRegistered = isMac
    ? totalTestCommands
    : totalTestCommands - totalMacOnlyCommands;

  let account = createAccount();
  addIdentity(account);
  let win3 = await openComposeWindow(account);
  // Some key combinations do not work if the TO field has focus.
  win3.document.querySelector("editor").focus();

  // Confirm the keysets have been added to both windows.
  let keysetID = `ext-keyset-id-${makeWidgetId(extension.id)}`;

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

  // Confirm that the commands are registered to both windows.
  await focusWindow(win1);
  await runTest(win1, "mail");

  await focusWindow(win2);
  await runTest(win2, "mail");

  await focusWindow(win3);
  await runTest(win3, "messageCompose");

  // Mitigation for "waiting for vsync to be disabled" error.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(r => win3.setTimeout(r, 250));
  await extension.unload();

  // Confirm that the keysets have been removed from both windows after the extension is unloaded.
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
