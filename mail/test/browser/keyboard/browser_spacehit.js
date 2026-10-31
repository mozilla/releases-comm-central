/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that the space bar only advances to the next unread message
 * when mail.advance_on_spacebar is true (default).
 */

"use strict";

var {
  be_in_folder,
  create_folder,
  get_about_3pane,
  get_about_message,
  select_click_row,
  wait_for_message_display_completion,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { make_message_sets_in_folders } = ChromeUtils.importESModule(
  "resource://testing-common/mail/MessageInjectionHelpers.sys.mjs"
);

// Get original preference value.
var prefName = "mail.advance_on_spacebar";

add_setup(async function () {
  // Create six unread messages in a sample folder.
  const folder = await create_folder("Sample");
  await make_message_sets_in_folders(
    [folder],
    [{ count: 2, body: { body: "Hello\fHello again\fBye\n" } }]
  );
  await make_message_sets_in_folders([folder], [{ count: 4 }]);
  await be_in_folder(folder);
});

/**
 * Checks message navigation with the message list focused.
 *
 * @param {boolean} shouldAdvance - Whether the selection should advance.
 * @param {boolean} isShiftPressed - Whether to press Shift key.
 */
async function subtest_advance_on_spacebar(shouldAdvance, isShiftPressed) {
  // Set preference.
  await SpecialPowers.pushPrefEnv({
    set: [[prefName, shouldAdvance]],
  });
  const about3Pane = get_about_3pane();
  about3Pane.gFolder.markMessagesRead([...about3Pane.gFolder.messages], false);
  // Select the second message.
  const oldMessage = await select_click_row(1);
  await wait_for_message_display_completion(window);
  const expectedMessage = shouldAdvance
    ? about3Pane.gDBView.getMsgHdrAt(isShiftPressed ? 0 : 2)
    : oldMessage;
  about3Pane.threadTree.focus();
  // Press [Shift-]Space.
  EventUtils.synthesizeKey(" ", { shiftKey: isShiftPressed }, about3Pane);
  await wait_for_message_display_completion(window);
  Assert.equal(
    get_about_message().gMessage.messageId,
    expectedMessage.messageId,
    "[Shift-]Space should select the expected message"
  );
  await SpecialPowers.popPrefEnv();
}

/**
 * Test that focus remains on current message when preference is false
 * and spacebar is pressed.
 */
add_task(async function test_noAdvanceOnSpace() {
  await subtest_advance_on_spacebar(false, false);
});

/**
 * Test that focus remains on current message when preference is false
 * and shift-spacebar is pressed.
 */
add_task(async function test_noAdvanceOnShiftSpace() {
  await subtest_advance_on_spacebar(false, true);
});

/**
 * Test that focus advances to next message when preference is true
 * and spacebar is pressed.
 */
add_task(async function test_advanceOnSpace() {
  await subtest_advance_on_spacebar(true, false);
});

/**
 * Test that focus advances to previous message when preference is true
 * and shift-spacebar is pressed.
 */
add_task(async function test_advanceOnShiftSpace() {
  await subtest_advance_on_spacebar(true, true);
});

/**
 * The fifth of six simple messages is selected, the <body> element of the
 * message pane browser is focused and [Shift-]Space is
 * pressed to determine if focus changes to a new message.
 *
 * @param {boolean} shouldAdvance - Whether the selection should advance.
 * @param {boolean} isShiftPressed - Whether to press Shift key.
 */
async function subtest_advance_on_spacebar_browser(
  shouldAdvance,
  isShiftPressed
) {
  // Set preference.
  await SpecialPowers.pushPrefEnv({
    set: [[prefName, shouldAdvance]],
  });
  // Select the fifth message.
  const oldMessage = await select_click_row(4);
  await wait_for_message_display_completion(window);
  // Set focus to message pane browser..
  const aboutMessage = get_about_message();
  const browser = aboutMessage.getMessagePaneBrowser();
  browser.focus();
  await SimpleTest.promiseFocus(browser);
  await SpecialPowers.spawn(browser, [isShiftPressed], async shiftPressed => {
    // Set focus to the the <body> element of the content window
    content.document.body.focus();
    Assert.equal(
      content.document.activeElement,
      content.document.body,
      "<body> is active element."
    );
    // Scroll directly to the end of the message before pressing Shift-Space.
    if (shiftPressed) {
      EventUtils.synthesizeKey("KEY_End", {}, content);
    }
    // Press [Shift-]Space three times to scroll through the whole message.
    for (let i = 0; i < 3; i++) {
      await new Promise(resolve => content.setTimeout(resolve, 250));
      EventUtils.synthesizeKey(" ", { shiftKey: shiftPressed }, content);
    }
  });
  // Check that message focus changes if `shouldAdvance` is true.
  const newMessage = get_about_message().gMessage;
  shouldAdvance
    ? Assert.notEqual(oldMessage, newMessage)
    : Assert.equal(oldMessage, newMessage);
}

/**
 * Test that focus remains on current message when preference is false
 * and spacebar is pressed while the content window has focus.
 */
add_task(async function test_noadvance_on_space_browser() {
  await subtest_advance_on_spacebar_browser(false, false);
});

/**
 * Test that focus remains on current message when preference is false
 * and shift-spacebar is pressed while the content window has focus.
 */
add_task(async function test_noadvance_on_shiftspace_browser() {
  await subtest_advance_on_spacebar_browser(false, true);
});

/**
 * Test that focus advances to next message when preference is true
 * and spacebar is pressed while the content window has focus.
 */
add_task(async function test_advance_on_space_browser() {
  await subtest_advance_on_spacebar_browser(true, false);
});

/**
 * Test that focus advances to previous message when preference is true
 * and shift-spacebar is pressed while the content window has focus.
 */
add_task(async function test_advance_on_shiftspace_browser() {
  await subtest_advance_on_spacebar_browser(true, true);
});

add_task(async function test_scrollWithMessageListFocused() {
  const about3Pane = get_about_3pane();
  const originalFolder = about3Pane.gFolder;
  const folder = await create_folder("SpaceScrolling");
  registerCleanupFunction(async () => {
    await be_in_folder(originalFolder);
    folder.deleteSelf(false);
  });
  await make_message_sets_in_folders(
    [folder],
    [{ count: 1, body: { body: "A line of message text.\n".repeat(200) } }]
  );
  await be_in_folder(folder);
  const message = await select_click_row(0);
  const browser = get_about_message().getMessagePaneBrowser();
  const messageWindow = browser.contentWindow;
  about3Pane.threadTree.focus();
  Assert.equal(
    about3Pane.document.activeElement,
    about3Pane.threadTree,
    "The message list should have focus"
  );
  Assert.greater(
    messageWindow.scrollMaxY,
    2 * messageWindow.innerHeight,
    "The message should have enough content to scroll in both directions"
  );
  await SpecialPowers.pushPrefEnv({
    set: [["general.smoothScroll", false]],
  });
  let scrolled = BrowserTestUtils.waitForContentEvent(browser, "scrollend");
  messageWindow.scrollTo({
    top: Math.floor(messageWindow.scrollMaxY / 2),
    behavior: "instant",
  });
  await scrolled;

  for (const shouldAdvance of [false, true]) {
    await SpecialPowers.pushPrefEnv({
      set: [[prefName, shouldAdvance]],
    });
    info(`Scrolling with ${prefName}=${shouldAdvance}`);
    let previousScrollY = messageWindow.scrollY;
    scrolled = BrowserTestUtils.waitForContentEvent(browser, "scrollend");
    EventUtils.synthesizeKey(" ", {}, about3Pane);
    await scrolled;
    Assert.greater(
      messageWindow.scrollY,
      previousScrollY,
      "Space should scroll the message down"
    );

    previousScrollY = messageWindow.scrollY;
    scrolled = BrowserTestUtils.waitForContentEvent(browser, "scrollend");
    EventUtils.synthesizeKey(" ", { shiftKey: true }, about3Pane);
    await scrolled;
    Assert.less(
      messageWindow.scrollY,
      previousScrollY,
      "Shift+Space should scroll the message up"
    );
    Assert.equal(
      get_about_message().gMessage,
      message,
      "Scrolling within the message should keep the same message selected"
    );
    await SpecialPowers.popPrefEnv();
  }
  await SpecialPowers.popPrefEnv();
});
