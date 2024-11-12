/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { default: customizableItemDetails } = ChromeUtils.importESModule(
  "resource:///modules/CustomizableItemsDetails.mjs"
);

/**
 * Check if commands that the templates of customizable items use are available.
 * Checks for the command execution methods used by the unified-toolbar-button
 * custom element.
 *
 * @param {string} [space] - Space to check items for. If omitted checks items
 *   that can be used in any space.
 */
function subtest_check_commands_supported_for_space(space) {
  for (const item of customizableItemDetails) {
    if (
      !item.templateId ||
      (space && item.spaces?.length && !item.spaces.includes(space)) ||
      (!space && item.spaces?.length)
    ) {
      continue;
    }
    const template = document.getElementById(item.templateId);
    Assert.ok(
      template,
      `Should find template for ${item.id} in space ${space}`
    );
    const commandButton = template.content.querySelector("button[command]");
    if (!commandButton) {
      continue;
    }
    const command = commandButton.getAttribute("command");
    const controller =
      document.commandDispatcher.getControllerForCommand(command);
    if (controller) {
      Assert.ok(
        controller.supportsCommand(command),
        `Command "${command}" for ${item.id} should be supported in space ${space}`
      );
      continue;
    }
    const commandElement = document.getElementById(command);
    Assert.ok(
      commandElement,
      `Should find element for command "${command}" of ${item.id} in space ${space}`
    );
    Assert.equal(
      commandElement.tagName,
      "command",
      `Should have command element for ${item.id} in space ${space}`
    );
  }
}

add_task(async function test_commands_supported() {
  subtest_check_commands_supported_for_space();

  const tabmail = document.getElementById("tabmail");
  for (const space of window.gSpacesToolbar.spaces) {
    info(`Checking items in space ${space.name}`);
    const tab = window.gSpacesToolbar.openSpace(tabmail, space);
    if (tab.browser) {
      await BrowserTestUtils.browserLoaded(tab.browser);
    }
    subtest_check_commands_supported_for_space(space.name);
    tabmail.closeTab(tab);
  }
});

add_task(async function test_popups_exist() {
  for (const item of customizableItemDetails) {
    if (!item.templateId) {
      continue;
    }
    const template = document.getElementById(item.templateId);
    Assert.ok(template, `Should find template for ${item.id}`);
    const popupId = template.content
      .querySelector("[popup]")
      ?.getAttribute("popup");
    if (!popupId) {
      continue;
    }
    const popup = document.getElementById(popupId);
    Assert.ok(popup, `Should find popup "${popupId}" for item ${item.id}`);
    Assert.equal(
      popup.tagName,
      "menupopup",
      `Should have menupopup element for ${item.id}`
    );
  }
});
