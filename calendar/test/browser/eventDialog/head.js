/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { CalendarTestUtils } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarTestUtils.jsm"
);

// If the "do you want to save the event?" prompt appears, the test failed.
// Listen for all windows opening, and if one is the save prompt, fail.
var savePromptObserver = {
  async observe(win, topic) {
    if (topic == "domwindowopened") {
      await BrowserTestUtils.waitForEvent(win, "load");
      // Make sure this is a prompt window.
      if (win.location.href == "chrome://global/content/commonDialog.xhtml") {
        let doc = win.document;
        // Adding attachments also shows a prompt, but we can tell which one
        // this is by checking whether the textbox is visible.
        if (doc.querySelector("#loginContainer").hasAttribute("hidden")) {
          Assert.report(true, undefined, undefined, "Unexpected save prompt appeared");
          doc
            .querySelector("dialog")
            .getButton("cancel")
            .click();
        }
      }
    }
  },
};
Services.ww.registerNotification(savePromptObserver);

registerCleanupFunction(async () => {
  Services.ww.unregisterNotification(savePromptObserver);
});
