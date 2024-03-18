/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// Load subscript shared with all menu tests.
Services.scriptloader.loadSubScript(
  new URL("head_menus.js", gTestPath).href,
  this
);

/**
 * Test to make sure we get the menu entry in the context menu of a scrolled compose
 * editor.
 */
add_task(async function test_compose_body_context_scrolled() {
  const files = {
    "background.js": async () => {
      const getLoremIpsum = max => {
        const output = [];
        for (let count = 0; count < max; count++) {
          output.push(
            `<p id="P${
              count + 1
            }">Lorem ipsum dolor sit amet, consectetur adipisici elit, sed eiusmod tempor incidunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquid ex ea commodi consequat. Quis aute iure reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint obcaecat cupiditat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum</p>`
          );
        }
        return output.join("\n");
      };

      const composeTab = await browser.compose.beginNew({
        body: getLoremIpsum(30),
      });
      browser.test.assertEq(
        composeTab.type,
        "messageCompose",
        "Should have found a compose tab"
      );
      await browser.compose.getComposeDetails(composeTab.id);

      await new Promise(resolve =>
        browser.menus.create(
          {
            id: "extensionMenu",
            title: "ScrollTest",
            contexts: ["compose_body"],
          },
          resolve
        )
      );

      // Scroll to the last element and open the context menu.
      await window.sendMessage("scrollAndContextClick", "P30");
      await browser.tabs.remove(composeTab.id);
      browser.test.notifyPass("finished");
    },
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose", "menus"],
    },
  });

  extension.onMessage("scrollAndContextClick", async elementId => {
    const composeWindow = Services.wm.getMostRecentWindow("msgcompose");
    const editor = composeWindow.GetCurrentEditorElement();
    const element = editor.contentDocument.getElementById(elementId);
    element.scrollIntoView({ behavior: "instant" });

    const menu = composeWindow.document.getElementById("msgComposeContext");
    await rightClick(menu, element);
    Assert.ok(menu.querySelector("[id$=_-menuitem-_extensionMenu]"));
    await closeMenuPopup(menu);
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
