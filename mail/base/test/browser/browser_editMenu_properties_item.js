/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// Load common setup code shared by all browser_editMenu* tests.
Services.scriptloader.loadSubScript(
  new URL("head_editMenu.js", gTestPath).href,
  this
);

/**
 * Tests the "Properties" item in the menu is enabled/disabled as expected,
 * and has the correct label.
 */
add_task(async function testPropertiesItem() {
  async function testDialog(folder, data, which = "folderProps.xhtml") {
    await Promise.all([
      BrowserTestUtils.promiseAlertDialog(
        undefined,
        `chrome://messenger/content/${which}`,
        {
          callback(win) {
            Assert.ok(true, "folder properties dialog opened");
            Assert.equal(
              win.gMsgFolder.URI,
              folder.URI,
              "dialog has correct folder"
            );
            win.document.querySelector("dialog").getButton("cancel").click();
          },
        }
      ),
      helper.activateItem("menu_properties", data),
    ]);
    await SimpleTest.promiseFocus(window);
  }

  const { displayFolder } = tabmail.currentAbout3Pane;

  displayFolder(rootFolder);
  await helper.testItems({
    menu_properties: { disabled: true, l10nID: "menu-edit-properties" },
  });

  displayFolder(testFolder);
  await testDialog(testFolder, { l10nID: "menu-edit-folder-properties" });

  displayFolder(virtualFolder);
  await testDialog(
    virtualFolder,
    { l10nID: "menu-edit-folder-properties" },
    "virtualFolderProperties.xhtml"
  );

  displayFolder(imapRootFolder);
  await helper.testItems({
    menu_properties: { disabled: true, l10nID: "menu-edit-properties" },
  });

  displayFolder(imapFolder);
  await testDialog(imapFolder, { l10nID: "menu-edit-folder-properties" });

  displayFolder(nntpRootFolder);
  await helper.testItems({
    menu_properties: { disabled: true, l10nID: "menu-edit-properties" },
  });

  displayFolder(nntpFolder);
  await testDialog(nntpFolder, { l10nID: "menu-edit-newsgroup-properties" });
});
