/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// Load common setup code shared by all browser_editMenu* tests.
Services.scriptloader.loadSubScript(
  new URL("head_editMenu.js", gTestPath).href,
  this
);

/**
 * Tests the "Favorite Folder" item in the menu is checked/unchecked as expected.
 */
add_task(async function testFavoriteFolderItem() {
  const { displayFolder } = tabmail.currentAbout3Pane;

  testFolder.clearFlag(Ci.nsMsgFolderFlags.Favorite);
  displayFolder(testFolder);
  await helper.testItems({ menu_favoriteFolder: {} });

  testFolder.setFlag(Ci.nsMsgFolderFlags.Favorite);
  await helper.activateItem("menu_favoriteFolder", { checked: true });
  Assert.ok(
    !testFolder.getFlag(Ci.nsMsgFolderFlags.Favorite),
    "favorite flag should be cleared"
  );

  await helper.activateItem("menu_favoriteFolder", {});
  Assert.ok(
    testFolder.getFlag(Ci.nsMsgFolderFlags.Favorite),
    "favorite flag should be set"
  );

  testFolder.clearFlag(Ci.nsMsgFolderFlags.Favorite);
});
