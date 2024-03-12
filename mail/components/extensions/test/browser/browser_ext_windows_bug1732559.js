/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async function check_focus() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        // Create a promise which waits until the script in the window is loaded
        // and the email field has focus, so we can send our fake keystrokes.
        const loadPromise = new Promise(resolve => {
          const listener = async (msg, sender) => {
            if (msg == "loaded") {
              browser.runtime.onMessage.removeListener(listener);
              resolve(sender.tab.windowId);
            }
          };
          browser.runtime.onMessage.addListener(listener);
        });

        const openedWin = await browser.windows.create({
          url: "focus.html",
          type: "popup",
          allowScriptsToClose: true,
        });
        const loadedWinId = await loadPromise;

        browser.test.assertEq(
          openedWin.id,
          loadedWinId,
          "The correct window should have been loaded"
        );

        const removePromise = new Promise(resolve => {
          browser.windows.onRemoved.addListener(id => {
            if (id == openedWin.id) {
              resolve();
            }
          });
        });

        window.sendMessage("sendKeyStrokes", openedWin.id);

        await removePromise;
        browser.test.notifyPass("finished");
      },
      "focus.html": `<!DOCTYPE html>
        <html>
          <head>
            <title>Focus Test</title>
            <meta charset="utf-8">
            <script defer="defer" src="utils.js"></script>
            <script defer="defer" src="focus.js"></script>
          </head>
          <body>
            <input id="email" type="text"/>
            <input id="delay" type="number" min="0" max="10" size="2"/>
          </body>
        </html>`,
      "focus.js": () => {
        async function load() {
          const email = document.getElementById("email");
          email.focus();

          await new Promise(r => window.setTimeout(r));
          await browser.runtime.sendMessage("loaded");

          // Fails as expected if focus is not set in
          // https://searchfox.org/comm-central/rev/be2751632bd695d17732ff590a71acb9b1ef920c/mail/components/extensions/extensionPopup.js#126-130
          await window.waitForCondition(
            () => email.value == "happy typing",
            `Input field should have the correct value. Expected: "happy typing",  actual: "${email.value}"`
          );

          window.close();
        }
        document.addEventListener("DOMContentLoaded", load, { once: true });
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
    },
  });

  extension.onMessage("sendKeyStrokes", id => {
    const window = Services.wm.getOuterWindowWithId(id);
    EventUtils.sendString("happy typing", window);
    extension.sendMessage("happy typing");
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
