/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { close_compose_window, open_compose_new_mail } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/ComposeHelpers.sys.mjs"
  );

/**
 * Tests that restoring the default toolbar set does not end customization.
 */
add_task(async function test_restoreDefaultToolbarSet() {
  const composeWindow = await open_compose_new_mail();
  const toolbox = composeWindow.document.getElementById("compose-toolbox");
  const toolbar = composeWindow.document.getElementById("composeToolbar2");

  Assert.ok(
    !toolbar.currentSet.split(",").includes("button-print"),
    "The print button should not be in the default toolbar set"
  );
  toolbar.insertItem("button-print");
  Assert.ok(
    toolbar.currentSet.split(",").includes("button-print"),
    "The print button should be added to the toolbar"
  );

  const useSheet = Services.prefs.getBoolPref("toolbar.customization.usesheet");
  let customizeWindowPromise;
  if (useSheet) {
    const customizeFrame = composeWindow.document.getElementById(
      "customizeToolbarSheetIFrame"
    );
    customizeWindowPromise = TestUtils.waitForCondition(
      () =>
        customizeFrame.contentDocument?.documentURI ==
          "chrome://messenger/content/customizeToolbar.xhtml" &&
        customizeFrame.contentDocument.readyState == "complete",
      "The toolbar customization sheet should finish loading"
    ).then(() => customizeFrame.contentWindow);
  } else {
    customizeWindowPromise = BrowserTestUtils.domWindowOpenedAndLoaded(
      null,
      win =>
        win.document.documentURI ==
        "chrome://messenger/content/customizeToolbar.xhtml"
    );
  }
  composeWindow.CustomizeMailToolbar(
    "compose-toolbox",
    "CustomizeComposeToolbar"
  );
  const customizeWindow = await customizeWindowPromise;
  registerCleanupFunction(async () => {
    if (useSheet && toolbox.customizing) {
      customizeWindow.onClose();
    } else if (!useSheet && !customizeWindow.closed) {
      await BrowserTestUtils.closeWindow(customizeWindow);
    }
    if (!composeWindow.closed) {
      await close_compose_window(composeWindow, false);
    }
  });

  Assert.ok(toolbox.customizing, "The toolbar should be in customization mode");
  customizeWindow.document.getElementById("restoreDefault").click();
  await TestUtils.waitForTick();

  Assert.ok(
    !customizeWindow.closed,
    "The customization window should remain open"
  );
  Assert.ok(
    toolbox.customizing,
    "The toolbar should remain in customization mode"
  );
  Assert.ok(
    !toolbar.querySelector("#button-print"),
    "The print button should be removed by restoring the default set"
  );

  const closePromise = customizeWindow.frameElement
    ? null
    : BrowserTestUtils.domWindowClosed(customizeWindow);
  customizeWindow.document.getElementById("donebutton").click();
  if (closePromise) {
    await closePromise;
  }
  await TestUtils.waitForCondition(
    () => !toolbox.customizing,
    "Customization mode should end after clicking Done"
  );
  Assert.ok(!toolbox.customizing, "Customization mode should end when done");

  await close_compose_window(composeWindow, false);
});
