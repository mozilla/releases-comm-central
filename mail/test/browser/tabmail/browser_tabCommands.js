/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Checks the enabled state of the shared command elements.
 *
 * @param {Record<string, boolean>} expected - Expected enabled states by command.
 */
function assertCommandStates(expected) {
  for (const [command, enabled] of Object.entries(expected)) {
    const node = document.getElementById(command);
    Assert.ok(node, `${command} should have a command element`);
    Assert.equal(
      !node.hasAttribute("disabled"),
      enabled,
      `${command} should be ${enabled ? "enabled" : "disabled"} in the active tab`
    );
  }
}

add_task(async function test_updateCommandsOnTabSwitch() {
  const tabmail = document.getElementById("tabmail");
  const mailTab = tabmail.currentTabInfo;
  const mailCommands = {
    cmd_CustomizeMailToolbar: true,
    cmd_toggleMessagePane: true,
    cmd_viewClassicMailLayout: true,
    cmd_showQuickFilterBar: true,
    cmd_toggleQuickFilterBar: true,
    cmd_reload: true,
  };
  const contentCommands = {
    cmd_CustomizeMailToolbar: true,
    cmd_toggleMessagePane: false,
    cmd_viewClassicMailLayout: false,
    cmd_showQuickFilterBar: false,
    cmd_toggleQuickFilterBar: false,
    cmd_reload: true,
  };

  registerCleanupFunction(() => tabmail.closeOtherTabs(mailTab));
  assertCommandStates(mailCommands);

  const contentTab = tabmail.openTab("contentTab", {
    url: "about:buildconfig",
    background: true,
  });
  await BrowserTestUtils.browserLoaded(contentTab.browser);
  Assert.equal(
    tabmail.currentTabInfo,
    mailTab,
    "Opening a background tab should keep Mail active"
  );
  assertCommandStates(mailCommands);

  tabmail.switchToTab(contentTab);
  assertCommandStates(contentCommands);
  tabmail.switchToTab(mailTab);
  assertCommandStates(mailCommands);
  tabmail.switchToTab(contentTab);
  assertCommandStates(contentCommands);
  tabmail.closeTab(contentTab);
  assertCommandStates(mailCommands);

  const calendarTab = tabmail.openTab("calendar");
  assertCommandStates({ ...contentCommands, cmd_reload: false });
  tabmail.switchToTab(mailTab);
  assertCommandStates(mailCommands);

  const tasksTab = tabmail.openTab("tasks");
  assertCommandStates({
    ...contentCommands,
    cmd_showQuickFilterBar: true,
    cmd_reload: false,
  });
  tabmail.switchToTab(mailTab);
  assertCommandStates(mailCommands);
  tabmail.closeTab(calendarTab);
  tabmail.closeTab(tasksTab);
});

add_task(async function test_updateCommandsOnMailTabLoad() {
  const tabmail = document.getElementById("tabmail");
  const mailTab = tabmail.currentTabInfo;
  registerCleanupFunction(() => tabmail.closeOtherTabs(mailTab));

  const newMailTab = tabmail.openTab("mail3PaneTab");
  await BrowserTestUtils.waitForEvent(
    newMailTab.chromeBrowser,
    "load",
    true,
    event =>
      event.target == newMailTab.chromeBrowser.contentDocument &&
      event.target.documentURI == "about:3pane"
  );
  assertCommandStates({
    cmd_toggleMessagePane: true,
    cmd_viewClassicMailLayout: true,
    cmd_showQuickFilterBar: true,
    cmd_toggleQuickFilterBar: true,
  });
  tabmail.closeTab(newMailTab);
});
