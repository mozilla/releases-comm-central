/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that cycling through the focus of the 3pane's panes works correctly.
 */

"use strict";

var { add_attachments, close_compose_window, open_compose_new_mail } =
  ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");

requestLongerTimeout(3);

/**
 * Test the cycling of focus in the composition window through (Shift+)F6.
 *
 * @param {Window} win - The compose window.
 * @param {object} options - Options to set for the test.
 * @param {boolean} options.useTab - Whether to use Ctrl+Tab instead of F6.
 * @param {boolean} options.attachment - Whether to add an attachment.
 * @param {boolean} options.notifications - Whether to show notifications.
 * @param {boolean} options.languageButton - Whether to show the language
 *   menu button.
 * @param {boolean} options.contacts - Whether to show the contacts side pane.
 * @param {string} otherHeader - The name of the custom header to show.
 */
async function checkFocusCycling(win, options) {
  const doc = win.document;
  let contactDoc;
  let contactsInput;
  const identityElement = doc.getElementById("msgIdentity");
  const bccButton = doc.getElementById("addr_bccShowAddressRowButton");
  const toInput = doc.getElementById("toAddrInput");
  const bccInput = doc.getElementById("bccAddrInput");
  const subjectInput = doc.getElementById("msgSubject");
  const editorElement = doc.getElementById("messageEditor");
  const attachmentElement = doc.getElementById("attachmentBucket");
  const extraMenuButton = doc.getElementById("extraAddressRowsMenuButton");
  const languageButton = doc.getElementById("languageStatusButton");
  let firstNotification;
  let secondNotification;

  if (Services.ww.activeWindow != win) {
    // Wait for the window to be in focus before beginning.
    await BrowserTestUtils.waitForEvent(win, "activate");
  }

  const key = options.useTab ? "VK_TAB" : "VK_F6";
  const goForward = () =>
    EventUtils.synthesizeKey(key, { ctrlKey: options.useTab }, win);
  const goBackward = () =>
    EventUtils.synthesizeKey(
      key,
      { ctrlKey: options.useTab, shiftKey: true },
      win
    );

  if (options.attachment) {
    await add_attachments(win, "https://www.mozilla.org/");
  }

  if (options.contacts) {
    // Open the contacts sidebar.
    EventUtils.synthesizeKey("VK_F9", {}, win);
    contactsInput = await TestUtils.waitForCondition(() => {
      contactDoc = doc.getElementById("contactsBrowser").contentDocument;
      return contactDoc.getElementById("peopleSearchInput");
    }, "Waiting for the contacts pane to load");
  }

  if (options.languageButton) {
    // languageButton only shows if we have more than one dictionary, but we
    // will show it anyway.
    // FIXME: should test under real conditions.
    // updateLanguageInStatusBar() can hide the button during tests.
    languageButton.hidden = false;
  }

  // Show the bcc row by clicking the button.
  EventUtils.synthesizeMouseAtCenter(bccButton, {}, win);

  // Show the custom row.
  const otherRow = doc.querySelector(
    `.address-row[data-recipienttype="${options.otherHeader}"]`
  );
  // Show the input.
  const menu = doc.getElementById("extraAddressRowsMenu");
  let promise = BrowserTestUtils.waitForEvent(menu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(extraMenuButton, {}, win);
  await promise;
  promise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
  menu.activateItem(doc.getElementById(otherRow.dataset.showSelfMenuitem));
  await promise;
  const otherHeaderInput = otherRow.querySelector(".address-row-input");

  // Move the initial focus back to the To input.
  toInput.focus();

  if (options.notifications) {
    // Exceed the recipient threshold.
    Assert.equal(
      win.gComposeNotification.allNotifications.length,
      0,
      "Should be no initial notifications"
    );
    const notificationPromise = TestUtils.waitForCondition(
      () => win.gComposeNotification.allNotifications[0],
      "First notification shown"
    );
    EventUtils.sendString("a@b.org,c@d.org", win);
    EventUtils.synthesizeKey("KEY_Enter", {}, win);
    firstNotification = await notificationPromise;
  }

  // We start on the addressing widget and go from there.

  // From To to Subject.
  goForward();
  Assert.ok(bccInput.matches(":focus"), "forward to bcc row");
  goForward();
  Assert.ok(otherHeaderInput.matches(":focus"), "forward to other row");
  goForward();
  Assert.ok(subjectInput.matches(":focus"), "forward to subject");

  if (options.notifications && !options.attachment) {
    // Include an attachment key word in the subject.
    const notificationPromise = TestUtils.waitForCondition(() => {
      const notifications = win.gComposeNotification.allNotifications;
      if (notifications.length != 2) {
        return null;
      }
      return notifications[1];
    }, "Second notification shown");
    EventUtils.sendString("My attached file", win);
    secondNotification = await notificationPromise;
    Assert.notEqual(
      firstNotification,
      secondNotification,
      "New notification shown second"
    );
  }

  // From Subject to Message Body.
  goForward();
  // The editor's body will not match ":focus", even when it has focus, instead,
  // we use the parent window's activeElement.
  Assert.equal(editorElement, doc.activeElement, "forward to message body");

  // From Message Body to Attachment bucket if visible.
  goForward();
  if (options.attachment) {
    Assert.ok(attachmentElement.matches(":focus"), "forward to attachments");
    goForward();
  }

  if (options.notifications) {
    Assert.equal(
      firstNotification.querySelector("button"),
      doc.activeElement,
      "forward to notification"
    );
    goForward();
  }

  // From Message Body (or Attachment bucket) to Language button.
  if (options.languageButton && !languageButton.hidden) {
    Assert.ok(languageButton.matches(":focus"), "forward to status bar");
    goForward();
  }

  // From Language button to contacts pane.
  if (options.contacts) {
    Assert.ok(
      contactsInput.matches(":focus-within"),
      "forward to contacts pane"
    );
    goForward();
  }

  // From contacts pane to identity.
  Assert.ok(identityElement.matches(":focus"), "forward to 'from' row");

  // Back to the To input.
  goForward();
  Assert.ok(toInput.matches(":focus"), "forward to 'to' row");

  // Reverse the direction.

  goBackward();
  Assert.ok(identityElement.matches(":focus"), "backward to 'from' row");

  goBackward();
  if (options.contacts) {
    Assert.ok(
      contactsInput.matches(":focus-within"),
      "backward to contacts pane"
    );
    goBackward();
  }

  if (options.languageButton && !languageButton.hidden) {
    Assert.ok(languageButton.matches(":focus"), "backward to status bar");
    goBackward();
  }

  if (options.notifications) {
    Assert.equal(
      firstNotification.querySelector("button"),
      doc.activeElement,
      "backward to notification"
    );
    goBackward();
  }

  if (options.attachment) {
    Assert.ok(attachmentElement.matches(":focus"), "backward to attachments");
    goBackward();
  }

  Assert.equal(editorElement, doc.activeElement, "backward to message body");
  goBackward();
  Assert.ok(subjectInput.matches(":focus"), "backward to subject");
  goBackward();
  Assert.ok(otherHeaderInput.matches(":focus"), "backward to other row");
  goBackward();
  Assert.ok(bccInput.matches(":focus"), "backward to bcc row");
  goBackward();

  Assert.ok(toInput.matches(":focus"), "backward to 'to' row");

  // Now test some other elements that aren't the main focus point of their
  // areas. I.e. focusable elements that are within an area, but are not
  // focused when the area is *entered* through F6 or Ctrl+Tab. When these
  // elements have focus, we still want F6 or Ctrl+Tab to move the focus to the
  // neighbouring area.

  // Focus the close button.
  const bccCloseButton = doc.querySelector(
    "#addressRowBcc .remove-field-button"
  );
  bccCloseButton.focus();
  goForward();
  Assert.ok(
    otherHeaderInput.matches(":focus"),
    "from close bcc button to other row"
  );
  goBackward();
  // The input is focused on return.
  Assert.ok(bccInput.matches(":focus"), "back to bcc row");
  // Same the other way.
  bccCloseButton.focus();
  goBackward();
  Assert.ok(toInput.matches(":focus"), "from close bcc button to 'to' row");

  if (options.contacts) {
    const addressBookList = contactDoc.getElementById("addressbookList");
    addressBookList.focus();
    goForward();
    Assert.ok(
      identityElement.matches(":focus"),
      "from addressbook selector to 'from' row"
    );
    goBackward();
    // The input is focused on return.
    Assert.ok(contactsInput.matches(":focus-within"), "back to contacts input");
    // Same the other way.
    addressBookList.focus();
    goBackward();
    if (options.languageButton && !languageButton.hidden) {
      Assert.ok(
        languageButton.matches(":focus"),
        "from addressbook selector to status bar"
      );
    } else if (options.notifications) {
      Assert.equal(
        firstNotification.querySelector("button"),
        doc.activeElement,
        "from addressbook selector to notification"
      );
    } else if (options.attachment) {
      Assert.ok(
        attachmentElement.matches(":focus"),
        "from addressbook selector to attachments"
      );
    } else {
      Assert.equal(
        editorElement,
        doc.activeElement,
        "from addressbook selector to message body"
      );
    }
  }

  // Cc button and extra address rows menu button are in the same area as the
  // message identity.
  const ccButton = doc.getElementById("addr_ccShowAddressRowButton");
  ccButton.focus();
  goBackward();
  if (options.contacts) {
    Assert.ok(
      contactsInput.matches(":focus-within"),
      "from Cc button to contacts"
    );
  } else if (options.languageButton && !languageButton.hidden) {
    Assert.ok(languageButton.matches(":focus"), "from Cc button to status bar");
  } else if (options.notifications) {
    Assert.equal(
      firstNotification.querySelector("button"),
      doc.activeElement,
      "from Cc button to notification"
    );
  } else if (options.attachment) {
    Assert.ok(
      attachmentElement.matches(":focus"),
      "from Cc button to attachments"
    );
  } else {
    Assert.equal(
      editorElement,
      doc.activeElement,
      "from Cc button to message body"
    );
  }
  goForward();
  // Return to the input.
  Assert.ok(identityElement.matches(":focus"), "back to 'from' row");

  // Try in the other direction with the extra menu button.
  extraMenuButton.focus();
  goForward();
  Assert.ok(toInput.matches(":focus"), "from extra menu button to 'to' row");
  goBackward();
  // Return to the input.
  Assert.ok(identityElement.matches(":focus"), "back to 'from' row again");

  if (options.attachment) {
    const attachmentArea = doc.getElementById("attachmentArea");
    const attachmentSummary = attachmentArea.querySelector("summary");
    Assert.ok(attachmentArea.open, "Attachment area should be open");
    for (const open of [true, false]) {
      if (open) {
        Assert.ok(attachmentArea.open, "Attachment area should be open");
      } else {
        // Close the attachment bucket. In this case, the focus will move to the
        // summary element (where the bucket can be shown again).
        EventUtils.synthesizeMouseAtCenter(attachmentSummary, {}, win);
        Assert.ok(!attachmentArea.open, "Attachment area should be closed");
      }

      // Focus the attachmentSummary.
      attachmentSummary.focus();
      goBackward();
      Assert.equal(
        editorElement,
        doc.activeElement,
        `backward from attachment summary (open: ${open}) to message body`
      );
      goForward();
      if (open) {
        // Focus returns to the bucket when it is open.
        Assert.ok(
          attachmentElement.matches(":focus"),
          "forward to attachment bucket"
        );
      } else {
        // Otherwise, it returns to the summary.
        Assert.ok(
          attachmentSummary.matches(":focus"),
          "forward to attachment summary"
        );
      }
      // Try reverse.
      attachmentSummary.focus();
      goForward();
      if (options.notifications) {
        Assert.equal(
          firstNotification.querySelector("button"),
          doc.activeElement,
          `forward from attachment summary (open: ${open}) to notification`
        );
      } else if (options.languageButton && !languageButton.hidden) {
        Assert.ok(
          languageButton.matches(":focus"),
          `forward from attachment summary (open: ${open}) to status bar`
        );
      } else if (options.contacts) {
        Assert.ok(
          contactsInput.matches(":focus-within"),
          `forward from attachment summary (open: ${open}) to contacts pane`
        );
      } else {
        Assert.ok(
          identityElement.matches(":focus"),
          `forward from attachment summary (open: ${open}) to 'from' row`
        );
      }
      goBackward();
      if (open) {
        Assert.ok(
          attachmentElement.matches(":focus"),
          "return to attachment bucket"
        );
      } else {
        Assert.ok(
          attachmentSummary.matches(":focus"),
          "return to attachment summary"
        );
        // Open again.
        EventUtils.synthesizeMouseAtCenter(attachmentSummary, {}, win);
        Assert.ok(attachmentArea.open, "Attachment area should be open again");
      }
    }
  }

  if (options.notifications) {
    // Focus inside the notification.
    const closeButton = (secondNotification || firstNotification).closeButtonEl;
    closeButton.focus();

    goBackward();

    if (options.attachment) {
      Assert.ok(
        attachmentElement.matches(":focus"),
        "backward from notification button to attachments"
      );
    } else {
      Assert.equal(
        editorElement,
        doc.activeElement,
        "backward from notification button to message body"
      );
    }
    goForward();
    // Go to the first notification.
    Assert.equal(
      firstNotification.querySelector("button"),
      doc.activeElement,
      "forward to the first notification"
    );

    // Try reverse.
    closeButton.focus();
    goForward();
    if (options.languageButton && !languageButton.hidden) {
      Assert.ok(
        languageButton.matches(":focus"),
        "forward from notification button to status bar"
      );
    } else if (options.contacts) {
      Assert.ok(
        contactsInput.matches(":focus-within"),
        "forward from notification button to contacts pane"
      );
    } else {
      Assert.ok(
        identityElement.matches(":focus"),
        "forward from notification button to 'from' row"
      );
    }
    goBackward();
    Assert.equal(
      firstNotification.querySelector("button"),
      doc.activeElement,
      "return to the first notification"
    );
  }

  // Contacts pane is persistent, so we close it again.
  if (options.contacts) {
    // Close the contacts sidebar.
    EventUtils.synthesizeKey("VK_F9", {}, win);
  }
}

add_task(async function test_jump_focus() {
  // Make sure the accessibility tabfocus is set to 7 to enable normal Tab
  // focus on non-input field elements. This is necessary only for macOS as
  // the default value is 2 instead of the default 7 used on Windows and Linux.
  Services.prefs.setIntPref("accessibility.tabfocus", 7);
  const prevHeader = Services.prefs.getCharPref("mail.compose.other.header");
  const prevThreshold = Services.prefs.getIntPref(
    "mail.compose.warn_public_recipients.threshold"
  );
  // Set two custom headers, but only one is shown.
  Services.prefs.setCharPref(
    "mail.compose.other.header",
    "X-Header2,X-Header1"
  );
  Services.prefs.setIntPref("mail.compose.warn_public_recipients.threshold", 2);
  for (const useTab of [false, true]) {
    for (const attachment of [false, true]) {
      for (const notifications of [false, true]) {
        for (const languageButton of [false, true]) {
          for (const contacts of [false, true]) {
            const options = {
              useTab,
              attachment,
              notifications,
              languageButton,
              contacts,
              otherHeader: "X-Header1",
            };
            info(`Test run: ${JSON.stringify(options)}`);
            const win = await open_compose_new_mail();
            await checkFocusCycling(win, options);
            await close_compose_window(win);
          }
        }
      }
    }
  }

  // Reset the preferences.
  Services.prefs.clearUserPref("accessibility.tabfocus");
  Services.prefs.setCharPref("mail.compose.other.header", prevHeader);
  Services.prefs.setIntPref(
    "mail.compose.warn_public_recipients.threshold",
    prevThreshold
  );
});
