/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that links opening a new window from a content tab always get a new
 * tab, even if an existing content tab is showing about:blank.
 */

const tabmail = document.getElementById("tabmail");

add_task(async function test_sandboxed_link_opens_new_tabs() {
  registerCleanupFunction(() => {
    while (tabmail.tabInfo.length > 1) {
      tabmail.closeTab(1);
    }
  });

  const url = getRootDirectory(gTestPath) + "files/sandboxedLink.html";
  const sourceTab = tabmail.openTab("contentTab", { url, linkHandler: null });
  await BrowserTestUtils.browserLoaded(sourceTab.browser, false, url);
  Assert.ok(
    !sourceTab.browser.isRemoteBrowser,
    "source tab should be in the parent process"
  );

  const blankTab = tabmail.openTab("contentTab", {
    background: true,
    url: "about:blank",
  });

  const iframe = sourceTab.browser.contentDocument.querySelector("iframe");
  await TestUtils.waitForCondition(
    () => iframe.contentDocument?.getElementById("link"),
    "sandboxed link should be ready"
  );

  const openedTabs = [];
  for (let i = 0; i < 2; i++) {
    tabmail.switchToTab(sourceTab);
    const tabCount = tabmail.tabInfo.length;
    EventUtils.synthesizeMouseAtCenter(
      iframe.contentDocument.getElementById("link"),
      {},
      iframe.contentWindow
    );
    await TestUtils.waitForCondition(
      () => tabmail.tabInfo.length == tabCount + 1,
      "clicking the link should open a new tab"
    );

    const newTab = tabmail.tabInfo.at(-1);
    Assert.notEqual(newTab, blankTab, "about:blank tab should not be reused");
    Assert.ok(
      !openedTabs.includes(newTab),
      "previously opened tab should not be reused"
    );
    Assert.equal(
      newTab.browser.browsingContext.opener,
      iframe.browsingContext,
      "new tab should be opened by the sandboxed frame"
    );
    openedTabs.push(newTab);
  }
});
