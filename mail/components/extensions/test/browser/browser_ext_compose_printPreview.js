/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { ExtensionSupport } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionSupport.sys.mjs"
);

const account = createAccount();
const defaultIdentity = addIdentity(account);

add_task(async function testLockedComposeWindow() {
  const files = {
    "background.js": async () => {
      // Open a compose tab with a message.
      const composeTab = await new Promise(resolve => {
        const tabListener = tab => {
          if (tab.type == "messageCompose") {
            browser.tabs.onCreated.removeListener(tabListener);
            resolve(tab);
          }
        };
        browser.tabs.onCreated.addListener(tabListener);
        browser.compose.beginNew({
          to: ["test@test.invalid"],
          subject: "Test",
          body: "This is a test",
          isPlainText: false,
        });
      });
      await browser.compose.getComposeDetails(composeTab.id);

      // Add a compose action click listener.
      let clickCounts = 0;
      const composeActionClickListener = () => {
        clickCounts++;
      };
      browser.composeAction.onClicked.addListener(composeActionClickListener);

      // Record original state and verify the composeAction button is clickable.
      await window.sendMessage("recordOriginalState");
      browser.test.assertEq(
        1,
        clickCounts,
        "A click on the enabled compose action button should have been counted"
      );

      // Open print preview and verify locked state.
      await window.sendMessage("openPreviewAndVerifyLockedState");
      browser.test.assertEq(
        1,
        clickCounts,
        "A click on the disabled compose action button should have been ignored"
      );

      // After unlocking the compose window, the original state should have been
      // restored. The composeAction button should be clickable again.
      await window.sendMessage("verifyOriginalState");
      browser.test.assertEq(
        2,
        clickCounts,
        "A click on the enabled compose action button should have been counted"
      );

      // Clean up.
      browser.composeAction.onClicked.removeListener(
        composeActionClickListener
      );
      const removedWindowPromise = window.waitForEvent("windows.onRemoved");
      browser.windows.remove(composeTab.windowId);
      await removedWindowPromise;

      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      browser_specific_settings: {
        gecko: {
          id: "printpreview@mochi.test",
        },
      },
      background: { scripts: ["utils.js", "background.js"] },
      compose_action: { default_title: "click" },
      permissions: ["compose"],
    },
  });

  const elements = new Map();

  const isDisabled = element =>
    element.hasAttribute("disabled") &&
    element.getAttribute("disabled") !== "false";

  const clickComposeActionButton = async composeWindow => {
    await promiseAnimationFrame(composeWindow);
    await new Promise(resolve => composeWindow.setTimeout(resolve));
    const buttonId = "printpreview_mochi_test-composeAction-toolbarbutton";
    const button = composeWindow.document.getElementById(buttonId);
    Assert.ok(button, "Button should exist");
    EventUtils.synthesizeMouseAtCenter(
      button,
      { clickCount: 1 },
      composeWindow
    );
    await new Promise(resolve => composeWindow.setTimeout(resolve));
  };

  const recordElementState = (composeWindow, query) => {
    let found = false;
    for (const item of composeWindow.document.querySelectorAll(query)) {
      elements.set(item, isDisabled(item));
      found = true;
    }
    // Make sure the query returned some elements.
    Assert.ok(found, `Should have found elements for the query: ${query}`);
  };

  const elementToString = item => {
    const id = item.id ? ` id="${item.id}"` : ``;
    const command =
      !id && item.hasAttribute("command")
        ? ` command="${item.getAttribute("command")}"`
        : ``;
    const oncommand =
      !id && !command && item.hasAttribute("oncommand")
        ? ` oncommand="${item.getAttribute("oncommand")}"`
        : ``;
    return `<${item.tagName}${id}${command}${oncommand}>`;
  };

  extension.onMessage("recordOriginalState", async () => {
    const composeWindow = Services.wm.getMostRecentWindow("msgcompose");
    const editor = composeWindow.document.getElementById("messageEditor");
    editor.focus();
    editor.contentDocument.execCommand("selectAll");

    // Click on the composeAction button to make sure it is counted.
    await clickComposeActionButton(composeWindow);

    recordElementState(
      composeWindow,
      "menu, toolbarbutton, [command], [oncommand]"
    );
    recordElementState(composeWindow, "#FormatToolbar menulist");
    recordElementState(composeWindow, "#recipientsContainer input");

    extension.sendMessage();
  });

  extension.onMessage("openPreviewAndVerifyLockedState", async () => {
    const composeWindow = Services.wm.getMostRecentWindow("msgcompose");
    const editor = composeWindow.document.getElementById("messageEditor");
    editor.focus();

    Assert.equal(
      composeWindow.document.getElementsByClassName("printSettingsBrowser")
        .length,
      0,
      "There should be no print settings browser"
    );

    // Open Print-Preview.
    composeWindow.DoCommandPrint();

    // Wait for print settings browser.
    await TestUtils.waitForCondition(
      () =>
        composeWindow.document.getElementsByClassName("printSettingsBrowser")
          .length,
      "There should be a print setting browser"
    );

    // Click on the composeAction button to make sure it is ignored.
    await clickComposeActionButton(composeWindow);

    // Check that all general elements are as expected.
    for (const item of composeWindow.document.querySelectorAll(
      "menu, toolbarbutton, [command], [oncommand]"
    )) {
      // The disabled editor still allows to select text. The helpMenu is skipped
      // due to Bug 1883647.
      if (["menu_selectAll", "cmd_selectAll", "helpMenu"].includes(item.id)) {
        continue;
      }
      Assert.ok(
        isDisabled(item),
        `General item ${elementToString(
          item
        )} should be disabled if the composer is locked`
      );
    }
    // Check that all format toolbar elements are as expected.
    for (const item of composeWindow.document.querySelectorAll(
      "#FormatToolbar menulist"
    )) {
      Assert.ok(
        isDisabled(item),
        `Format toolbar item ${elementToString(
          item
        )} should be disabled if the composer is locked`
      );
    }
    // Check input fields.
    for (const item of composeWindow.document.querySelectorAll(
      "#recipientsContainer input"
    )) {
      Assert.ok(
        isDisabled(item),
        `Input field item ${elementToString(
          item
        )} should be disabled if the composer is locked`
      );
    }

    // Close print preview.
    const browser = composeWindow.GetCurrentEditorElement();
    composeWindow.PrintUtils.togglePrintPreview(browser.browsingContext);

    // Wait for print settings browser to close.
    await TestUtils.waitForCondition(
      () =>
        composeWindow.document.getElementsByClassName("printSettingsBrowser")
          .length == 0,
      "All print settings browser should be closed"
    );

    extension.sendMessage();
  });

  extension.onMessage("verifyOriginalState", async () => {
    const composeWindow = Services.wm.getMostRecentWindow("msgcompose");
    const editor = composeWindow.document.getElementById("messageEditor");
    editor.focus();

    // Click on the composeAction button to make sure it is counted.
    await clickComposeActionButton(composeWindow);

    for (const [item, state] of elements) {
      Assert.equal(
        state,
        isDisabled(item),
        `Original disabled state of item ${elementToString(
          item
        )} should have been restored`
      );
    }
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
