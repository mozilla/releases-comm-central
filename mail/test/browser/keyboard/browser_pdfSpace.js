/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that pressing the space bar while a PDF is open in a content tab
 * scrolls down.
 */

"use strict";

var {
  be_in_folder,
  create_folder,
  select_click_row,
  wait_for_message_display_completion,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { make_message_sets_in_folders } = ChromeUtils.importESModule(
  "resource://testing-common/mail/MessageInjectionHelpers.sys.mjs"
);

const PDF_URL =
  "http://mochi.test:8888/browser/comm/mail/test/browser/keyboard/support-files/test.pdf";

add_task(
  async function test_space_in_pdf_content_tab_does_not_call_cmd_space() {
    const tabmail = document.getElementById("tabmail");
    tabmail.openTab("contentTab", { url: PDF_URL, background: false });
    const contentTab = tabmail.currentTabInfo;
    const browser = contentTab.browser;

    // Wait for first page to be ready
    await BrowserTestUtils.waitForContentEvent(
      browser,
      "textlayerrendered",
      false,
      null,
      true
    );

    try {
      await SpecialPowers.spawn(browser, [], async () => {
        const { ContentTaskUtils } = ChromeUtils.importESModule(
          "resource://testing-common/ContentTaskUtils.sys.mjs"
        );
        const EventUtils = ContentTaskUtils.getEventUtils(content);
        const viewerContent =
          content.document.getElementById("viewerContainer");
        viewerContent.focus();
        Assert.equal(viewerContent.scrollTop, 10, "initial scrollTop ok");
        const { promise, resolve } = Promise.withResolvers();
        viewerContent.addEventListener("scrollend", () => resolve(), {
          once: true,
        });
        EventUtils.synthesizeKey(" ", {}, content);
        await promise;
        Assert.greater(viewerContent.scrollTop, 10, "did scroll down");
      });
    } finally {
      tabmail.closeTab(contentTab);
    }
  }
);
