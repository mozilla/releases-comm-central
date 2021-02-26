/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async function() {
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
    let tabElements = getTabElements();
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
    let tabElement = getTabElements()[index];
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
    let tabElement = getTabElements()[index];
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

  let tabmail = document.getElementById("tabmail");
  let calendarTabButton = document.getElementById("calendar-tab-button");

  let mailTabPanel = document.getElementById("mailContent");
  let calendarTabPanel = document.getElementById("calendarTabPanel");
  let contentTab;
  let contentTabPanel;

  let folderTree = document.getElementById("folderTree");
  let calendarList = document.getElementById("calendar-list");

  let eventPromise;
  let event;

  // Check we're in a good state to start with.

  Assert.equal(tabmail.tabInfo.length, 1, "only one tab is open");
  checkTabElements(1, 0);
  assertSelected(mailTabPanel, "mail tab's panel");

  // Set the focus on the folder tree.

  if (
    document.getElementById("folderpane_splitter").getAttribute("state") ==
    "collapsed"
  ) {
    window.MsgToggleFolderPane();
  }

  EventUtils.synthesizeMouseAtCenter(folderTree, {});
  Assert.equal(document.activeElement, folderTree, "folder tree has focus");

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
    "folder tree does NOT have focus"
  );

  // Set the focus on the calendar list.

  EventUtils.synthesizeMouseAtCenter(calendarList, {});
  Assert.equal(document.activeElement, calendarList, "calendar list has focus");

  // Switch to the mail tab.

  await switchTab(0);

  checkTabElements(2, 0);
  assertSelected(mailTabPanel, "mail tab's panel");
  assertNotSelected(calendarTabPanel, "calendar tab's panel");
  Assert.equal(document.activeElement, folderTree, "folder tree has focus");

  // Switch to the calendar tab.

  await switchTab(1);

  checkTabElements(2, 1);
  assertNotSelected(mailTabPanel, "mail tab's panel");
  assertSelected(calendarTabPanel, "calendar tab's panel");
  Assert.equal(document.activeElement, calendarList, "calendar list has focus");

  // Open a content tab.

  eventPromise = BrowserTestUtils.waitForEvent(tabmail.tabContainer, "TabOpen");
  contentTab = window.openContentTab("http://example.org/");
  contentTabPanel = contentTab.browser.closest(".contentTabInstance")
    .parentNode;
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

  // Switch to the mail tab.

  await switchTab(0);

  checkTabElements(3, 0);
  assertSelected(mailTabPanel, "mail tab's panel");
  assertNotSelected(calendarTabPanel, "calendar tab's panel");
  Assert.equal(document.activeElement, folderTree, "folder tree has focus");

  // Switch to the calendar tab.

  await switchTab(1);

  checkTabElements(3, 1);
  assertNotSelected(mailTabPanel, "mail tab's panel");
  assertSelected(calendarTabPanel, "calendar tab's panel");
  Assert.equal(document.activeElement, calendarList, "calendar list has focus");

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

  // Close the content tab.

  await closeTab(2);

  checkTabElements(2, 1);
  assertNotSelected(mailTabPanel, "mail tab's panel");
  assertSelected(calendarTabPanel, "calendar tab's panel");
  // At this point contentTabPanel is still part of the DOM, it is removed
  // after the TabClose event.
  assertNotSelected(contentTabPanel, "content tab's panel");
  Assert.equal(document.activeElement, calendarList, "calendar list has focus");

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
  Assert.equal(document.activeElement, folderTree, "folder tree has focus");
});
