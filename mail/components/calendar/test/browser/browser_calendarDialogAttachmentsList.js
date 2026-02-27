/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { MockExternalProtocolService } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockExternalProtocolService.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
let attachmentsList, browser;

add_setup(async function () {
  MockExternalProtocolService.init();
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarDialogAttachmentsList.xhtml",
  });

  browser = tab.browser;

  await BrowserTestUtils.browserLoaded(browser);
  browser.focus();
  await SimpleTest.promiseFocus(browser.contentWindow);
  attachmentsList = browser.contentWindow.document.querySelector(
    "calendar-dialog-attachments-list"
  );
});

registerCleanupFunction(() => {
  tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  MockExternalProtocolService.cleanup();
});

add_task(function test_setAttachments() {
  attachmentsList.setAttachments([
    {
      uri: "https://example.com/",
      icon: "moz-icon://dummy.html",
    },
    {
      uri: "data:text/plain,hi",
    },
  ]);

  const list = attachmentsList.querySelector(".attachments-list");

  Assert.equal(list.childElementCount, 2, "Should have two children");

  /**
   * Check that an attachment item was passed the expected data.
   *
   * @param {number} index - Index of the attachment.
   * @param {string} uri - The expected URI to be passed to it.
   * @param {string} icon - The URI of the icon for the attachment.
   */
  const checkChild = (index, uri, icon) => {
    const child = list.children[index];
    Assert.equal(
      child.getAttribute("is"),
      "calendar-dialog-attachment",
      `Attachment ${index} should be an instance of the attachment item custom element`
    );
    Assert.equal(
      child.getAttribute("label"),
      uri,
      `Attachment ${index} should have URI as label`
    );
    Assert.equal(
      child.getAttribute("url"),
      uri,
      `Attachment ${index} should have URI as url`
    );
    Assert.equal(
      child.getAttribute("icon"),
      icon,
      `Attachment ${index} should have icon passed along`
    );
  };

  checkChild(0, "https://example.com/", "moz-icon://dummy.html");
  checkChild(1, "data:text/plain,hi", "");

  attachmentsList.setAttachments([]);

  Assert.equal(
    list.childElementCount,
    0,
    "Setting empty attachments array clears the list"
  );
});
