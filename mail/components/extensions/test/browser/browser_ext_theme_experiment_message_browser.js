/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var gAccount;
var gMessages;
var gFolder;

add_setup(() => {
  gAccount = createAccount();
  const rootFolder = gAccount.incomingServer.rootFolder;
  rootFolder.createSubfolder("test0", null);

  const subFolders = {};
  for (const folder of rootFolder.subFolders) {
    subFolders[folder.name] = folder;
  }
  createMessages(subFolders.test0, 5);

  gFolder = subFolders.test0;
  gMessages = [...subFolders.test0.messages];

  // Reduce animations to prevent intermittent fails due to late theme changes.
  Services.prefs.setIntPref("ui.prefersReducedMotion", 1);
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("ui.prefersReducedMotion");
  });
});

add_task(async function testGetDisplayedMessage() {
  const files = {
    "background.js": async () => {
      await window.sendMessage("ready");
      await browser.theme.update({
        colors: {
          exp_forced_border_color: "red",
        },
      });
      await window.sendMessage("testTheme");
      browser.test.notifyPass("finished");
    },
    "style.css":
      "#dateLabel { border: 1px solid var(--forced-border-color) !important; }",
    "utils.js": await getUtilsJS(),
  };
  const extension = ExtensionTestUtils.loadExtension({
    files,
    manifest: {
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["theme"],
      theme_experiment: {
        stylesheet: "style.css",
        colors: {
          exp_forced_border_color: "--forced-border-color",
        },
      },
    },
  });

  const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  about3Pane.displayFolder(gFolder);
  about3Pane.threadTree.selectedIndex = 1;

  const getDateLabelColor = () => {
    const aboutMessage = document.getElementById("tabmail").currentAboutMessage;
    const dateLabel = aboutMessage.document.getElementById("dateLabel");
    return window.getComputedStyle(dateLabel).getPropertyValue("border-color");
  };

  Assert.ok(
    getDateLabelColor() != "rgb(255, 0, 0)",
    "Color should no have been modified yet"
  );

  let themeUpdatePromise;
  extension.onMessage("ready", async () => {
    themeUpdatePromise = BrowserTestUtils.waitForEvent(
      window,
      "windowlwthemeupdate"
    );
    extension.sendMessage();
  });

  extension.onMessage("testTheme", async () => {
    await themeUpdatePromise;
    await promiseAnimationFrame();
    await TestUtils.waitForCondition(
      () => getDateLabelColor() == "rgb(255, 0, 0)",
      "Color should have been modified"
    );
    extension.sendMessage();
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();
});
