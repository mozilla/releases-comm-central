/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const tabmail = document.getElementById("tabmail");
const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

let browser;
let testDocument;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/unifiedtoolbar/test/browser/files/unifiedToolbarButton.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  browser = tab.browser;
  testDocument = tab.browser.contentWindow.document;

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

add_task(async function test_bareInitialState() {
  const button = testDocument.createElement("button", {
    is: "unified-toolbar-button",
  });
  testDocument.body.appendChild(button);
  await waitForRender();

  Assert.ok(button.hasConnected, "Button connected to the DOM");
  Assert.ok(
    Boolean(button.querySelector(".button-icon")),
    "Image from template appended to button"
  );
  Assert.ok(
    Boolean(button.querySelector(".button-label")),
    "Label from template appended to button"
  );
  Assert.ok(
    button.classList.contains("unified-toolbar-button"),
    "unified-toolbar-button class added to element"
  );
  Assert.ok(!button.observedCommand, "No observed command");
  Assert.equal(
    button.label,
    button.querySelector(".button-label"),
    "Label reference added"
  );
  Assert.equal(button.label.textContent, "", "No label content specified");
  Assert.equal(button.badge, null, "No badge text specified");

  button.remove();
});

add_task(async function test_setupWithCommand() {
  browser.contentWindow.getEnabledControllerForCommand = command => {
    Assert.equal(
      command,
      "test-command",
      "Only expecting to check state of test-command"
    );
    return {
      doCommand() {
        Assert.fail("Should not call doCommand");
      },
    };
  };
  const command = testDocument.createElementNS(XUL_NS, "command");
  command.id = "test-command";
  const button = testDocument.createElement("button", {
    is: "unified-toolbar-button",
  });
  button.setAttribute("command", "test-command");
  testDocument.body.append(command, button);
  await waitForRender();

  Assert.ok(button.hasConnected, "Button connected to the DOM");
  Assert.equal(
    button.observedCommand,
    "test-command",
    "Button is observing command"
  );
  Assert.ok(
    !button.disabled,
    "Button is enabled since we find a command controller"
  );

  button.remove();
  command.remove();
  delete browser.contentWindow.getEnabledControllerForCommand;
});

add_task(async function test_setupWithObserves() {
  browser.contentWindow.getEnabledControllerForCommand = command => {
    Assert.equal(
      command,
      "test-command",
      "Only expecting to check state of test-command"
    );
    return null;
  };
  const command = testDocument.createElementNS(XUL_NS, "command");
  command.id = "test-command";
  const button = testDocument.createElement("button", {
    is: "unified-toolbar-button",
  });
  button.setAttribute("observes", "test-command");
  testDocument.body.append(command, button);
  await waitForRender();

  Assert.ok(button.hasConnected, "Button connected to the DOM");
  Assert.equal(
    button.observedCommand,
    "test-command",
    "Button is observing command"
  );
  Assert.ok(button.disabled, "Button is disabled since we have no controller");

  button.remove();
  command.remove();
  delete browser.contentWindow.getEnabledControllerForCommand;
});

add_task(async function test_setupWithObservesAndCommand() {
  browser.contentWindow.getEnabledControllerForCommand = command => {
    Assert.equal(
      command,
      "test-command",
      "Only expecting to check state of test-command"
    );
    throw new Error("Test exception: no controller for commands");
  };
  const command = testDocument.createElementNS(XUL_NS, "command");
  command.id = "test-command";
  const button = testDocument.createElement("button", {
    is: "unified-toolbar-button",
  });
  button.setAttribute("observes", "test-command");
  button.setAttribute("command", "made-up-command");
  testDocument.body.append(command, button);
  await waitForRender();

  Assert.ok(button.hasConnected, "Button connected to the DOM");
  Assert.equal(
    button.observedCommand,
    "test-command",
    "Button is observing command"
  );
  Assert.ok(
    !button.disabled,
    "Button is enabled because command is enabled, even though controller errors"
  );

  button.remove();
  command.remove();
  delete browser.contentWindow.getEnabledControllerForCommand;
});

add_task(async function test_setupWithCommandWithoutController() {
  browser.contentWindow.getEnabledControllerForCommand = command => {
    Assert.equal(
      command,
      "test-command",
      "Only expecting to check state of test-command"
    );
    return null;
  };
  const command = testDocument.createElementNS(XUL_NS, "command");
  command.id = "test-command";
  command.setAttribute("oncommand", 'Assert.fail("should not invoke command")');
  const button = testDocument.createElement("button", {
    is: "unified-toolbar-button",
  });
  button.setAttribute("command", command.id);
  testDocument.body.append(command, button);
  await waitForRender();

  Assert.ok(button.hasConnected, "Button connected to the DOM");
  Assert.equal(
    button.observedCommand,
    "test-command",
    "Button is observing command"
  );
  Assert.ok(
    !button.disabled,
    "Button is enabled since the command has an oncommand callback"
  );

  button.remove();
  command.remove();
  delete browser.contentWindow.getEnabledControllerForCommand;
});

add_task(async function test_setupObservesWithoutCommandOrController() {
  const button = testDocument.createElement("button", {
    is: "unified-toolbar-button",
  });
  button.setAttribute("observes", "test-command");
  testDocument.body.append(button);
  await waitForRender();

  Assert.ok(button.hasConnected, "Button connected to the DOM");
  Assert.equal(
    button.observedCommand,
    "test-command",
    "Button is observing command"
  );
  Assert.ok(button.disabled, "Button is disabled by default");

  button.remove();
});

add_task(async function test_setupWithObservesAndToggling() {
  browser.contentWindow.getEnabledControllerForCommand = command => {
    Assert.equal(
      command,
      "test-command",
      "Only expecting to check state of test-command"
    );
    return null;
  };
  const command = testDocument.createElementNS(XUL_NS, "command");
  command.id = "test-command";
  command.setAttribute("checked", "true");
  const button = testDocument.createElement("button", {
    is: "unified-toolbar-button",
  });
  button.setAttribute("observes", "test-command");
  button.ariaPressed = "false";
  testDocument.body.append(command, button);
  await waitForRender();

  Assert.equal(button.ariaPressed, "true", "Checked state copied from command");

  button.remove();
  command.remove();
  delete browser.contentWindow.getEnabledControllerForCommand;
});

add_task(async function test_popup() {
  const submenu = testDocument.createElementNS(XUL_NS, "menupopup");
  const menu = testDocument.createElementNS(XUL_NS, "menu");
  menu.setAttribute("label", "Submenu");
  menu.append(submenu);
  const popup = testDocument.createElementNS(XUL_NS, "menupopup");
  popup.id = "test-popup";
  popup.append(menu);
  const button = testDocument.createElement("button", {
    is: "unified-toolbar-button",
  });
  button.setAttribute("popup", popup.id);
  testDocument.body.append(popup, button);
  await waitForRender();

  await BrowserTestUtils.synthesizeMouseAtCenter("button", {}, browser);
  await BrowserTestUtils.waitForPopupEvent(popup, "shown");
  Assert.equal(
    button.ariaPressed,
    "true",
    "When the popup is open the button is shown as pressed"
  );

  await BrowserTestUtils.synthesizeMouseAtCenter("menu", {}, browser);
  await BrowserTestUtils.waitForPopupEvent(submenu, "shown");
  submenu.hidePopup();
  await BrowserTestUtils.waitForPopupEvent(submenu, "hidden");

  Assert.equal(
    button.ariaPressed,
    "true",
    "Closing submenu doesn't disable pressed state"
  );

  popup.hidePopup();
  await BrowserTestUtils.waitForPopupEvent(popup, "hidden");
  Assert.ok(
    !button.hasAttribute("aria-pressed"),
    "pressed state is removed when the popup is hidden"
  );

  button.remove();
  popup.remove();
});

add_task(async function test_clickToggle() {
  const button = testDocument.createElement("button", {
    is: "unified-toolbar-button",
  });
  button.ariaPressed = "false";
  testDocument.body.append(button);
  await waitForRender();

  await BrowserTestUtils.synthesizeMouseAtCenter("button", {}, browser);

  Assert.equal(button.ariaPressed, "true", "Toggled to true");

  await BrowserTestUtils.synthesizeMouseAtCenter("button", {}, browser);

  Assert.equal(button.ariaPressed, "false", "Toggled back to false");

  button.remove();
});

add_task(async function test_clickCommandHandler() {
  let commandExecutionCount = 0;
  let commandEvent = null;
  browser.contentWindow.getEnabledControllerForCommand = command => {
    Assert.equal(
      command,
      "test-command",
      "Only expecting to check state of test-command"
    );
    return {
      doCommand(cmd, event) {
        Assert.equal(cmd, "test-command", "Only executing test-command");
        ++commandExecutionCount;
        commandEvent = event;
      },
    };
  };
  const command = testDocument.createElementNS(XUL_NS, "command");
  command.id = "test-command";
  const button = testDocument.createElement("button", {
    is: "unified-toolbar-button",
  });
  button.setAttribute("command", "test-command");
  testDocument.body.append(command, button);
  await waitForRender();

  Assert.equal(commandExecutionCount, 0, "Command not yet invoked");

  await BrowserTestUtils.synthesizeMouseAtCenter("button", {}, browser);

  Assert.equal(commandExecutionCount, 1, "Command invoked");
  Assert.equal(
    commandEvent.type,
    "click",
    "Command got passed the click event"
  );

  button.remove();
  command.remove();
  delete browser.contentWindow.getEnabledControllerForCommand;
});

add_task(async function test_clickCommandElement() {
  let commandExecutionCount = 0;
  browser.contentWindow.getEnabledControllerForCommand = command => {
    Assert.equal(
      command,
      "test-command",
      "Only expecting to check state of test-command"
    );
    return null;
  };
  const command = testDocument.createElementNS(XUL_NS, "command");
  command.id = "test-command";
  browser.contentWindow.reportCommand = () => {
    ++commandExecutionCount;
  };
  command.setAttribute("oncommand", "reportCommand()");
  const button = testDocument.createElement("button", {
    is: "unified-toolbar-button",
  });
  button.setAttribute("command", "test-command");
  testDocument.body.append(command, button);
  await waitForRender();

  Assert.equal(commandExecutionCount, 0, "Command not yet invoked");

  await BrowserTestUtils.synthesizeMouseAtCenter("button", {}, browser);

  Assert.equal(commandExecutionCount, 1, "Command invoked");

  button.remove();
  command.remove();
  delete browser.contentWindow.reportCommand;
  delete browser.contentWindow.getEnabledControllerForCommand;
});

add_task(async function test_observeDisabled() {
  const command = testDocument.createElementNS(XUL_NS, "command");
  command.id = "test-command";
  command.setAttribute("disabled", "true");
  const button = testDocument.createElement("button", {
    is: "unified-toolbar-button",
  });
  button.setAttribute("observes", command.id);
  testDocument.body.append(command, button);
  await waitForRender();

  Assert.ok(button.disabled, "Button is disabled like the command");

  command.removeAttribute("disabled");
  await TestUtils.waitForTick();

  Assert.ok(!button.disabled, "Button follows the command to become enabled");

  command.setAttribute("disabled", "true");
  await TestUtils.waitForTick();

  Assert.ok(button.disabled, "Button follows command to disable itself");

  button.remove();

  command.removeAttribute("disabled");
  await TestUtils.waitForTick();

  Assert.ok(
    button.disabled,
    "Button stops observing command after being removed from document"
  );

  command.remove();
});

add_task(async function test_observeChecked() {
  const command = testDocument.createElementNS(XUL_NS, "command");
  command.id = "test-command";
  const button = testDocument.createElement("button", {
    is: "unified-toolbar-button",
  });
  button.setAttribute("observes", command.id);
  button.ariaPressed = "false";
  testDocument.body.append(command, button);
  await waitForRender();

  Assert.equal(button.ariaPressed, "false", "Initially not checked");

  command.setAttribute("checked", "true");
  await TestUtils.waitForTick();

  Assert.equal(
    button.ariaPressed,
    "true",
    "Checked command leads to pressed button"
  );

  command.setAttribute("checked", "false");
  await TestUtils.waitForTick();

  Assert.equal(
    button.ariaPressed,
    "false",
    "Unchecking the command releases button press"
  );

  command.removeAttribute("checked");
  await TestUtils.waitForTick();

  Assert.equal(
    button.ariaPressed,
    "false",
    "No checked attribute is treated as not pressed"
  );

  button.remove();
  command.remove();
});

add_task(async function test_moveNodeWithObserve() {
  const command = testDocument.createElementNS(XUL_NS, "command");
  command.id = "test-command";
  command.setAttribute("disabled", "true");
  const button = testDocument.createElement("button", {
    is: "unified-toolbar-button",
  });
  button.setAttribute("observes", command.id);
  testDocument.body.append(command, button);
  await waitForRender();

  Assert.ok(button.disabled, "Button initially disabled");
  const label = button.label;

  button.remove();
  await waitForRender();
  Assert.ok(
    button.hasConnected,
    "Button still remembers that it once connected"
  );

  command.setAttribute("disabled", "false");

  testDocument.body.append(button);
  await waitForRender();

  Assert.ok(!button.disabled, "Picked up new disabled state on re-insertion");
  Assert.strictEqual(
    button.label,
    label,
    "Didn't change label element on re-insertion"
  );

  command.setAttribute("disabled", "true");
  await TestUtils.waitForTick();

  Assert.ok(button.disabled, "Observing the command again after re-insertion");

  button.remove();
  command.remove();
});

add_task(async function test_commandstateEvent() {
  const button = testDocument.createElement("button", {
    is: "unified-toolbar-button",
  });
  button.setAttribute("observes", "test-command");
  testDocument.body.append(button);
  const testWindow = browser.contentWindow;
  await waitForRender();

  Assert.ok(button.disabled, "Button is initially disabled");
  Assert.equal(
    button.observedCommand,
    "test-command",
    "Button is observing test-command"
  );

  testWindow.dispatchEvent(
    new CustomEvent("commandstate", {
      detail: {
        command: "test-command",
        enabled: true,
      },
    })
  );

  Assert.ok(!button.disabled, "Button got enabled by commandstate event");

  testWindow.dispatchEvent(
    new CustomEvent("commandstate", {
      detail: {
        command: "other-test-command",
        enabled: false,
      },
    })
  );

  Assert.ok(
    !button.disabled,
    "Button unaffected by commandstate event for different command"
  );

  testWindow.dispatchEvent(
    new CustomEvent("commandstate", {
      detail: {
        command: "test-command",
        enabled: false,
      },
    })
  );

  Assert.ok(button.disabled, "Button disabled by commandstate event");

  button.remove();

  testWindow.dispatchEvent(
    new CustomEvent("commandstate", {
      detail: {
        command: "test-command",
        enabled: true,
      },
    })
  );

  Assert.ok(
    button.disabled,
    "Button commandstate listener removed when button removed from document"
  );
});

add_task(async function test_disabledEvents() {
  const button = testDocument.createElement("button", {
    is: "unified-toolbar-button",
  });
  testDocument.body.append(button);
  await waitForRender();
  await TestUtils.waitForCondition(
    () => button.hasConnected,
    "Waiting for button to connect"
  );

  const buttonDisabled = BrowserTestUtils.waitForEvent(
    button.parentElement,
    "buttondisabled"
  );
  button.tabIndex = 0;
  button.disabled = true;
  await buttonDisabled;
  Assert.equal(
    button.tabIndex,
    -1,
    "Disabling the button sets the tab index to -1"
  );

  const buttonEnabled = BrowserTestUtils.waitForEvent(button, "buttonenabled");
  button.disabled = false;
  await buttonEnabled;

  button.remove();
});

add_task(async function test_label() {
  const button = testDocument.createElement("button", {
    is: "unified-toolbar-button",
  });
  button.setAttribute("label", "foo");
  testDocument.body.append(button);
  await waitForRender();

  Assert.equal(
    button.label.textContent,
    "foo",
    "Label is transferred when the element is inserted."
  );

  button.setAttribute("label", "bar");

  Assert.equal(button.label.textContent, "bar", "Label value is updated");

  button.remove();
});

add_task(async function test_labelId() {
  const button = testDocument.createElement("button", {
    is: "unified-toolbar-button",
  });
  button.setAttribute("label-id", "foo");
  testDocument.body.append(button);
  await waitForRender();

  Assert.equal(
    button.label.dataset.l10nId,
    "foo",
    "Label ID is transferred when the element is inserted."
  );

  button.setAttribute("label-id", "bar");

  Assert.equal(button.label.dataset.l10nId, "bar", "Label ID value is updated");

  button.remove();
}).skip(); // Disabled because the content tab has no document.l10n (bug 1864144)

add_task(async function test_badge() {
  const button = testDocument.createElement("button", {
    is: "unified-toolbar-button",
  });
  testDocument.body.append(button);
  await waitForRender();

  Assert.equal(button.badge, null, "No badge set");

  button.badge = "42";

  Assert.equal(button.badge, "42", "Badge set to 42");
  Assert.equal(button.getAttribute("badge"), "42", "Badge attribute set");

  button.badge = null;

  Assert.equal(button.badge, null, "Badge removed");
  Assert.ok(!button.hasAttribute("badge"), "Badge attribute removed");

  button.badge = "";

  Assert.equal(button.badge, null, "Setting to empty string keeps badge off");
  Assert.ok(
    !button.hasAttribute("badge"),
    "Empty string doesn't add attribute"
  );

  button.remove();
});
