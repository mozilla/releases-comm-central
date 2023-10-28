/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async function () {
  // Helper functions.

  function assertSelected(element, name) {
    Assert.ok(
      element.hasAttribute("selected"),
      `${name} has selected attribute`
    );
  }
  function assertNotSelected(element, name) {
    Assert.ok(
      !element.hasAttribute("selected"),
      `${name} does NOT have selected attribute`
    );
  }
  function getTabElements() {
    return [...tabmail.tabContainer.querySelectorAll("tab")];
  }
  function checkTabElements(expectedCount, expectedSelection) {
    const tabElements = getTabElements();
    Assert.equal(
      tabElements.length,
      expectedCount,
      `${expectedCount} tab elements exist`
    );

    for (let i = 0; i < expectedCount; i++) {
      if (i == expectedSelection) {
        assertSelected(tabElements[i], `tab element ${i}`);
      } else {
        assertNotSelected(tabElements[i], `tab element ${i}`);
      }
    }
  }
  async function switchTab(index) {
    const tabElement = getTabElements()[index];
    eventPromise = BrowserTestUtils.waitForEvent(
      tabmail.tabContainer,
      "TabSelect"
    );
    EventUtils.synthesizeMouseAtCenter(tabElement, {});
    event = await eventPromise;
    Assert.equal(
      event.target,
      tabElement,
      `TabSelect event fired from tab ${index}`
    );
  }
  async function closeTab(index) {
    const tabElement = getTabElements()[index];
    eventPromise = BrowserTestUtils.waitForEvent(
      tabmail.tabContainer,
      "TabClose"
    );
    EventUtils.synthesizeMouseAtCenter(
      tabElement.querySelector(".tab-close-button"),
      {}
    );
    event = await eventPromise;
    Assert.equal(
      event.target,
      tabElement,
      `TabClose event fired from tab ${index}`
    );
  }

  // Collect some elements.

  const tabmail = document.getElementById("tabmail");
  const calendarTabButton = document.getElementById("calendarButton");

  const mailTabPanel = document.getElementById("mail3PaneTab1");
  const mailTabBrowser = document.getElementById("mail3PaneTabBrowser1");
  const folderTree =
    mailTabBrowser.contentDocument.getElementById("folderTree");
  const calendarTabPanel = document.getElementById("calendarTabPanel");
  const calendarList = document.getElementById("calendar-list");

  let eventPromise;
  let event;

  // Check we're in a good state to start with.

  Assert.equal(tabmail.tabInfo.length, 1, "only one tab is open");
  checkTabElements(1, 0);
  assertSelected(mailTabPanel, "mail tab's panel");

  // Set the focus on the mail tab.

  folderTree.focus();
  Assert.equal(
    document.activeElement,
    mailTabBrowser,
    "mail tab's browser has focus"
  );
  Assert.equal(
    mailTabBrowser.contentDocument.activeElement,
    folderTree,
    "folder tree has focus"
  );

  // Switch to the calendar tab.

  eventPromise = BrowserTestUtils.waitForEvent(tabmail.tabContainer, "TabOpen");
  EventUtils.synthesizeMouseAtCenter(calendarTabButton, {});
  event = await eventPromise;
  Assert.equal(
    event.target,
    getTabElements()[1],
    "TabOpen event fired from tab 1"
  );

  checkTabElements(2, 1);
  assertNotSelected(mailTabPanel, "mail tab's panel");
  assertSelected(calendarTabPanel, "calendar tab's panel");
  Assert.equal(
    document.activeElement,
    document.body,
    "mail tab's browser does NOT have focus"
  );
  Assert.equal(
    tabmail.tabInfo[0].lastActiveElement,
    folderTree,
    "mail tab's last active element should be stored"
  );
  Assert.ok(
    !tabmail.tabInfo[1].lastActiveElement,
    "calendar tab's last active element should not be stored yet"
  );

  // Set the focus on the calendar list.

  EventUtils.synthesizeMouseAtCenter(calendarList, {});
  Assert.equal(document.activeElement, calendarList, "calendar list has focus");

  // Switch to the mail tab.

  await switchTab(0);

  checkTabElements(2, 0);
  assertSelected(mailTabPanel, "mail tab's panel");
  assertNotSelected(calendarTabPanel, "calendar tab's panel");
  Assert.equal(
    document.activeElement,
    mailTabBrowser,
    "mail tab's browser has focus"
  );
  Assert.equal(
    mailTabBrowser.contentDocument.activeElement,
    folderTree,
    "folder tree has focus"
  );
  Assert.ok(
    !tabmail.tabInfo[0].lastActiveElement,
    "mail tab's last active element should have been cleaned up"
  );
  Assert.equal(
    tabmail.tabInfo[1].lastActiveElement,
    calendarList,
    "calendar tab's last active element should be stored"
  );

  // Switch to the calendar tab.

  await switchTab(1);

  checkTabElements(2, 1);
  assertNotSelected(mailTabPanel, "mail tab's panel");
  assertSelected(calendarTabPanel, "calendar tab's panel");
  Assert.equal(document.activeElement, calendarList, "calendar list has focus");
  Assert.equal(
    tabmail.tabInfo[0].lastActiveElement,
    folderTree,
    "mail tab's last active element should be stored"
  );
  Assert.ok(
    !tabmail.tabInfo[1].lastActiveElement,
    "calendar tab's last active element should have been cleaned up"
  );

  // Open a content tab.

  eventPromise = BrowserTestUtils.waitForEvent(tabmail.tabContainer, "TabOpen");
  const contentTab = window.openContentTab("https://example.org/");
  const contentTabPanel = contentTab.browser.closest(
    ".contentTabInstance"
  ).parentNode;
  event = await eventPromise;
  Assert.equal(
    event.target,
    getTabElements()[2],
    "TabOpen event fired from tab 2"
  );

  checkTabElements(3, 2);
  assertNotSelected(mailTabPanel, "mail tab's panel");
  assertNotSelected(calendarTabPanel, "calendar tab's panel");
  assertSelected(contentTabPanel, "content tab's panel");
  Assert.equal(
    document.activeElement,
    document.body,
    "folder tree and calendar list do NOT have focus"
  );
  Assert.equal(
    tabmail.tabInfo[0].lastActiveElement,
    folderTree,
    "mail tab's last active element should be stored"
  );
  Assert.equal(
    tabmail.tabInfo[1].lastActiveElement,
    calendarList,
    "calendar tab's last active element should be stored"
  );
  Assert.ok(
    !tabmail.tabInfo[2].lastActiveElement,
    "content tab should have no last active element"
  );

  // Switch to the mail tab.

  await switchTab(0);

  checkTabElements(3, 0);
  assertSelected(mailTabPanel, "mail tab's panel");
  assertNotSelected(calendarTabPanel, "calendar tab's panel");
  Assert.equal(
    document.activeElement,
    mailTabBrowser,
    "mail tab's browser has focus"
  );
  Assert.ok(
    !tabmail.tabInfo[0].lastActiveElement,
    "mail tab's last active element should be cleaned up"
  );
  Assert.equal(
    tabmail.tabInfo[1].lastActiveElement,
    calendarList,
    "calendar tab's last active element should be stored"
  );
  Assert.ok(
    !tabmail.tabInfo[2].lastActiveElement,
    "content tab should have no last active element"
  );

  // Switch to the calendar tab.

  await switchTab(1);

  checkTabElements(3, 1);
  assertNotSelected(mailTabPanel, "mail tab's panel");
  assertSelected(calendarTabPanel, "calendar tab's panel");
  Assert.equal(document.activeElement, calendarList, "calendar list has focus");
  Assert.equal(
    tabmail.tabInfo[0].lastActiveElement,
    folderTree,
    "mail tab's last active element should be stored"
  );
  Assert.ok(
    !tabmail.tabInfo[1].lastActiveElement,
    "calendar tab's last active element should be cleaned up"
  );
  Assert.ok(
    !tabmail.tabInfo[2].lastActiveElement,
    "content tab should have no last active element"
  );

  // Switch to the content tab.

  await switchTab(2);

  checkTabElements(3, 2);
  assertNotSelected(mailTabPanel, "mail tab's panel");
  assertNotSelected(calendarTabPanel, "calendar tab's panel");
  assertSelected(contentTabPanel, "content tab's panel");
  Assert.equal(
    document.activeElement,
    document.body,
    "folder tree and calendar list do NOT have focus"
  );
  Assert.equal(
    tabmail.tabInfo[0].lastActiveElement,
    folderTree,
    "mail tab's last active element should be stored"
  );
  Assert.equal(
    tabmail.tabInfo[1].lastActiveElement,
    calendarList,
    "calendar tab's last active element should be stored"
  );
  Assert.ok(
    !tabmail.tabInfo[2].lastActiveElement,
    "content tab should have no last active element"
  );

  // Close the content tab.

  await closeTab(2);

  checkTabElements(2, 1);
  assertNotSelected(mailTabPanel, "mail tab's panel");
  assertSelected(calendarTabPanel, "calendar tab's panel");
  // At this point contentTabPanel is still part of the DOM, it is removed
  // after the TabClose event.
  assertNotSelected(contentTabPanel, "content tab's panel");
  Assert.equal(document.activeElement, calendarList, "calendar list has focus");
  Assert.equal(
    tabmail.tabInfo[0].lastActiveElement,
    folderTree,
    "mail tab's last active element should be stored"
  );
  Assert.ok(
    !tabmail.tabInfo[1].lastActiveElement,
    "calendar tab's last active element should have been cleaned up"
  );

  await new Promise(resolve => setTimeout(resolve));
  Assert.ok(
    !contentTabPanel.parentNode,
    "content tab's panel is removed from the DOM"
  );

  // Close the calendar tab.

  await closeTab(1);

  checkTabElements(1, 0);
  assertSelected(mailTabPanel, "mail tab's panel");
  assertNotSelected(calendarTabPanel, "calendar tab's panel");
  Assert.equal(
    document.activeElement,
    mailTabBrowser,
    "mail tab's browser has focus"
  );
  Assert.ok(
    !tabmail.tabInfo[0].lastActiveElement,
    "mail tab's last active element should have been cleaned up"
  );
});
