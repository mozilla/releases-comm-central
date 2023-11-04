/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { sinon } = ChromeUtils.importESModule(
  "resource://testing-common/Sinon.sys.mjs"
);

let browser;

/* Test for the CommandController.mjs module. Since the module is expecting to
 * be loaded inside a tab's document we load it with commandController.html. */

add_setup(async () => {
  const tabmail = document.getElementById("tabmail");
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/test/browser/tabmail/html/commandController.html",
  });
  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  browser = tab.browser;
  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

add_task(function test_commandControllerInsertion() {
  Assert.ok(
    browser.contentWindow.commandController,
    "Command controller exposed on window"
  );

  let foundController = false;
  const controllerCount =
    browser.contentWindow.controllers.getControllerCount();
  info(`Controllers: ${controllerCount}`);
  for (let i = 0; i < controllerCount; i++) {
    const controller = browser.contentWindow.controllers.getControllerAt(i);
    if (
      controller.wrappedJSObject === browser.contentWindow.commandController
    ) {
      foundController = true;
      break;
    }
  }
  Assert.ok(foundController, "The controller was inserted in the window");
});

add_task(function test_noRegisteredCommands() {
  const { commandController } = browser.contentWindow;

  Assert.ok(
    !commandController.supportsCommand("cmd_test"),
    "cmd_test is not supported"
  );
  Assert.ok(
    !commandController.isCommandEnabled(
      "cmd_test",
      "cmd_test is not registered, so it can't be enabled"
    )
  );
});

add_task(async function test_disabledCommand() {
  const { commandController } = browser.contentWindow;

  const command = "cmd_disabledCommand";
  const callback = sinon.spy();
  const commandUpdated = BrowserTestUtils.waitForEvent(window, "commandstate");
  commandController.registerCallback(command, callback, false);
  const event = await commandUpdated;

  Assert.equal(
    event.detail.command,
    command,
    "commandstate event fired for the registered command"
  );
  Assert.ok(
    !event.detail.enabled,
    "The registred command isn't enabled per the event"
  );

  Assert.ok(
    commandController.supportsCommand(command),
    "cmd_disabledCommand is supported because we registered it"
  );
  Assert.ok(
    !commandController.isCommandEnabled(command),
    "cmd_disabledCommand is disabled, as declared when we registered it"
  );
  commandController.doCommand(command);
  Assert.equal(
    callback.callCount,
    0,
    "Executing the cmd_disabledCommand command does nothing because it's disabled"
  );
});

add_task(function test_enabledCommand() {
  const { commandController } = browser.contentWindow;

  const command = "cmd_enabledCommand";
  const callback = sinon.spy();
  commandController.registerCallback(command, callback);

  Assert.ok(
    commandController.supportsCommand(command),
    "cmd_enabledCommand is supported becuase we registered it"
  );
  Assert.ok(
    commandController.isCommandEnabled(command),
    "cmd_enabledCommand is enabled"
  );
  commandController.doCommand(command);
  Assert.equal(
    callback.callCount,
    1,
    "Executing cmd_enabledCommand calls the command callback"
  );
});

add_task(function test_commandWithEnabledCallback() {
  const { commandController } = browser.contentWindow;

  const command = "cmd_withEnabledCallback";
  const enabled = sinon.stub();
  const callback = sinon.spy();
  commandController.registerCallback(command, callback, enabled);

  Assert.ok(
    commandController.supportsCommand(command),
    "cmd_withEnabledCallback is registered"
  );

  enabled.returns(true);
  Assert.ok(
    commandController.isCommandEnabled(command),
    "cmd_withEnabledCallback is enabled"
  );

  enabled.returns(false);
  Assert.ok(
    !commandController.isCommandEnabled(command),
    "cmd_withEnabledCallback is disabled"
  );
});

add_task(function test_commandWithArgs() {
  const { commandController } = browser.contentWindow;

  const command = "cmd_withArgs";
  const callback = sinon.spy();
  commandController.registerCallback(command, callback);

  const args = ["foo", "bar", {}];
  commandController.doCommand(command, ...args);
  Assert.ok(
    callback.calledOnceWith(...args),
    "The command was called with the same arguments passed to the controller"
  );
});
