/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let tabmail,
  about3Pane,
  folderPane,
  folderPaneModeContextMenu,
  folderPaneModeNames,
  folderPaneModeMoveUpMenuItem,
  folderPaneModeMoveDownMenuItem;

add_setup(async function () {
  tabmail = document.getElementById("tabmail");
  about3Pane = tabmail.currentAbout3Pane;
  folderPane = about3Pane.folderPane;
  folderPaneModeContextMenu = about3Pane.document.getElementById(
    "folderPaneModeContext"
  );
  folderPaneModeNames = about3Pane.document.getElementsByClassName("mode-name");
  folderPaneModeMoveUpMenuItem = about3Pane.document.getElementById(
    "folderPaneModeMoveUp"
  );
  folderPaneModeMoveDownMenuItem = about3Pane.document.getElementById(
    "folderPaneModeMoveDown"
  );

  folderPane.activeModes = ["all", "smart", "unread", "favorite", "recent"];

  registerCleanupFunction(() => {
    Services.xulStore.removeDocument(
      "chrome://messenger/content/messenger.xhtml"
    );
  });
});

/**
 * Tests that ability to swap a folder mode for the one above it, and
 * ensures that if it's the last element, the option to swap is disabled.
 */
add_task(async function testMoveFolderModeUp() {
  // Find the "Recent" folder pane mode text element as that is the
  // last folder pane mode.
  const recentFolderModeName = Array.prototype.find.call(
    folderPaneModeNames,
    element => element.parentElement.parentElement.dataset.mode === "recent"
  );

  // Grab the options element which is next to the text element to open
  // the context menu.
  const recentFolderModeOptions = recentFolderModeName.nextElementSibling;

  // Make sure the context menu is visible before continuing/
  const shownPromise = BrowserTestUtils.waitForEvent(
    folderPaneModeContextMenu,
    "popupshown"
  );

  EventUtils.synthesizeMouseAtCenter(recentFolderModeOptions, {}, about3Pane);

  await shownPromise;

  // Assert initial folder mode positions
  Assert.equal(
    folderPane.activeModes.at(-1),
    "recent",
    "Recent Folders mode is in the incorrect position."
  );
  Assert.equal(
    folderPane.activeModes.at(-2),
    "favorite",
    "Favourite mode is in the incorrect position."
  );

  // Ensure that the move down element is disabled asit is the last element.

  Assert.equal(
    folderPaneModeMoveDownMenuItem.getAttribute("disabled"),
    "true",
    "Move down element is enabled."
  );

  const hiddenPromise = BrowserTestUtils.waitForEvent(
    folderPaneModeContextMenu,
    "popuphidden"
  );

  folderPaneModeContextMenu.activateItem(folderPaneModeMoveUpMenuItem);

  await hiddenPromise;

  // Folder mode that was moved up should be swapped with the folder mode
  // above it in the activeModes array.
  Assert.equal(
    folderPane.activeModes.at(-1),
    "favorite",
    "Folder pane mode was not moved up."
  );
  Assert.equal(
    folderPane.activeModes.at(-2),
    "recent",
    "Folder pane mode was not moved down."
  );
});

/**
 * Tests that ability to swap a folder mode for the one below it.
 */
add_task(async function testMoveFolderModeDown() {
  // Find the "Recent" folder pane mode text element as that is the
  // second last folder pane mode.
  const recentFolderModeName = Array.prototype.find.call(
    folderPaneModeNames,
    element => element.parentElement.parentElement.dataset.mode === "recent"
  );

  // Grab the options element which is next to the text element to open
  // the context menu.
  const recentFolderModeOptions = recentFolderModeName.nextElementSibling;

  // Make sure the context menu is visible before continuing/
  const shownPromise = BrowserTestUtils.waitForEvent(
    folderPaneModeContextMenu,
    "popupshown"
  );

  EventUtils.synthesizeMouseAtCenter(recentFolderModeOptions, {}, about3Pane);

  await shownPromise;

  // Assert initial folder mode positions
  Assert.equal(
    folderPane.activeModes.at(-1),
    "favorite",
    "Favourite folder mode is in the incorrect position."
  );
  Assert.equal(
    folderPane.activeModes.at(-2),
    "recent",
    "Recent Folders mode is in the incorrect position."
  );

  const hiddenPromise = BrowserTestUtils.waitForEvent(
    folderPaneModeContextMenu,
    "popuphidden"
  );

  folderPaneModeContextMenu.activateItem(folderPaneModeMoveDownMenuItem);

  await hiddenPromise;

  // Folder mode that was moved down should be swapped with the folder mode
  // below it in the activeModes array.
  Assert.equal(
    folderPane.activeModes.at(-1),
    "recent",
    "Folder pane mode was not moved up."
  );
  Assert.equal(
    folderPane.activeModes.at(-2),
    "favorite",
    "Folder pane mode was not moved down."
  );
});

/**
 * Tests that the Move Up menu item on a folder pane mode is disabled when
 * it is the topmost folder pane mode
 */

add_task(async function testCantMoveFolderPaneModeUp() {
  // Find the "All" folder pane mode text element as that is the
  // first folder pane mode.
  const allFolderModeName = Array.prototype.find.call(
    folderPaneModeNames,
    element => element.parentElement.parentElement.dataset.mode === "all"
  );

  // Grab the options element which is next to the text element to open
  // the context menu.
  const allFolderModeOptions = allFolderModeName.nextElementSibling;

  // Make sure the context menu is visible before continuing/
  const shownPromise = BrowserTestUtils.waitForEvent(
    folderPaneModeContextMenu,
    "popupshown"
  );

  EventUtils.synthesizeMouseAtCenter(allFolderModeOptions, {}, about3Pane);

  await shownPromise;

  Assert.equal(
    folderPaneModeMoveUpMenuItem.getAttribute("disabled"),
    "true",
    "Move down element is enabled."
  );

  // Make sure the context menu is hidden before continuing
  const hiddenPromise = BrowserTestUtils.waitForEvent(
    folderPaneModeContextMenu,
    "popuphidden"
  );

  folderPaneModeContextMenu.hidePopup();

  await hiddenPromise;
});
