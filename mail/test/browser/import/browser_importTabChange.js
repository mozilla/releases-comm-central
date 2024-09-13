/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

async function waitForHash(targetHash, tabWindow) {
  if (tabWindow.location.hash === targetHash) {
    return TestUtils.waitForTick();
  }
  return new Promise(resolve => {
    tabWindow.addEventListener("hashchange", () => {
      if (tabWindow.location.hash === targetHash) {
        resolve();
      }
    });
  });
}

add_task(async function test_paneChange() {
  const tab = await new Promise(resolve => {
    const newTab = window.openTab("contentTab", {
      url: "about:import",
      onLoad() {
        resolve(newTab);
      },
    });
  });
  const tabWindow = tab.browser.contentWindow;

  window.toExport();
  await waitForHash("#export", tabWindow);
  Assert.ok(
    BrowserTestUtils.isVisible(
      tabWindow.document.getElementById("tabPane-export")
    ),
    "Export pane should be visible"
  );

  window.toImport("addressBook");
  await waitForHash("#addressBook", tabWindow);
  Assert.ok(
    BrowserTestUtils.isVisible(
      tabWindow.document.getElementById("tabPane-addressBook")
    ),
    "Address book flow should be visible"
  );

  window.toImport("calendar");
  await waitForHash("#calendar", tabWindow);
  Assert.ok(
    BrowserTestUtils.isVisible(
      tabWindow.document.getElementById("tabPane-calendar")
    ),
    "Calendar flow should be visible"
  );

  window.toImport();
  await waitForHash("#start", tabWindow);
  Assert.ok(
    BrowserTestUtils.isVisible(
      tabWindow.document.getElementById("tabPane-start")
    ),
    "Import start pane should be visible"
  );

  window.tabmail.closeTab(tab);
});

add_task(async function test_profileImportRestore() {
  const tab = await new Promise(resolve => {
    const newTab = window.openTab("contentTab", {
      url: "about:import#app",
      onLoad() {
        resolve(newTab);
      },
    });
  });
  const tabWindow = tab.browser.contentWindow;

  await waitForHash("#start", tabWindow);
  Assert.ok(
    BrowserTestUtils.isVisible(
      tabWindow.document.getElementById("tabPane-start")
    ),
    "Import start pane should be visible"
  );

  window.tabmail.closeTab(tab);
});
