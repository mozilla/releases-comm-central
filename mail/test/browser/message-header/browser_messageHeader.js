/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test functionality in the message header,
 */

"use strict";

var {
  create_address_book,
  create_mailing_list,
  ensure_no_card_exists,
  get_cards_in_all_address_books_for_email,
  get_mailing_list_from_address_book,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/AddressBookHelpers.sys.mjs"
);
var { promise_content_tab_load } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/ContentTabHelpers.sys.mjs"
);
var {
  add_message_to_folder,
  assert_selected_and_displayed,
  be_in_folder,
  close_popup,
  create_folder,
  create_message,
  get_about_3pane,
  get_about_message,
  msgGen,
  select_click_row,
  select_none,
  wait_for_message_display_completion,
  wait_for_popup_to_open,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
);

const about3Pane = get_about_3pane();
const aboutMessage = get_about_message();

const LINES_PREF = "mailnews.headers.show_n_lines_before_more";

// Used to get the accessible object for a DOM node.
var gAccService = Cc["@mozilla.org/accessibilityService;1"].getService(
  Ci.nsIAccessibilityService
);

var folder;
var folderMore;
var gInterestingMessage;

add_setup(async function () {
  folder = await create_folder("MessageWindowA");
  folderMore = await create_folder("MesageHeaderMoreButton");

  // Create a message that has the interesting headers that commonly shows up in
  // the message header pane for testing.
  gInterestingMessage = create_message({
    cc: msgGen.makeNamesAndAddresses(20),
    subject:
      "This is a really, really, really, really, really, really, really, really, long subject.",
    clobberHeaders: {
      Newsgroups: "alt.test",
      "Reply-To": "J. Doe <j.doe@momo.invalid>",
      "Content-Base": "https://example.com/",
      Bcc: "Richard Roe <richard.roe@momo.invalid>",
    },
  });

  await add_message_to_folder([folder], gInterestingMessage);

  // Create a message that has multiple to and cc addresses.
  const msgMore1 = create_message({
    to: msgGen.makeNamesAndAddresses(40),
    cc: msgGen.makeNamesAndAddresses(40),
  });
  await add_message_to_folder([folderMore], msgMore1);

  // Create a message that has multiple to and cc addresses.
  const msgMore2 = create_message({
    to: msgGen.makeNamesAndAddresses(20),
    cc: msgGen.makeNamesAndAddresses(20),
  });
  await add_message_to_folder([folderMore], msgMore2);

  // Create a regular message with one recipient.
  const msg = create_message();
  await add_message_to_folder([folder], msg);

  // Some of these tests critically depends on the window width, collapse
  // everything that might be in the way.
  document.getElementById("tabmail").currentTabInfo.folderPaneVisible = false;

  // Disable animations on the panel, so that we don't have to deal with
  // async openings. The panel is lazy-loaded, so it needs to be referenced
  // this way rather than finding it in the DOM.
  aboutMessage.editContactInlineUI.panel.setAttribute("animate", false);
  await ensure_table_view();

  registerCleanupFunction(async () => {
    await ensure_cards_view();
    // Delete created folder.
    folder.deleteSelf(null);
    folderMore.deleteSelf(null);

    // Restore animation to the contact panel.
    aboutMessage.document
      .getElementById("editContactPanel")
      .removeAttribute("animate");
  });
});

/**
 * Helper function that takes an array of header recipients elements and
 * returns the last one in the list that is not hidden. Returns null if no
 * such element exists.
 *
 * @param {HTMLOListElement} recipientsList - The list element containing all
 *   recipient addresses.
 */
function get_last_visible_address(recipientsList) {
  const last = recipientsList.childNodes[recipientsList.childNodes.length - 1];
  // Avoid returning the "more" button.
  if (last.classList.contains("show-more-recipients")) {
    return recipientsList.childNodes[recipientsList.childNodes.length - 2];
  }
  return last;
}

add_task(async function test_add_tag_with_really_long_label() {
  await be_in_folder(folder);
  await ensure_table_view();

  // Select the first message, which will display it.
  const curMessage = await select_click_row(-1);

  await assert_selected_and_displayed(window, curMessage);

  const topLabel = aboutMessage.document.getElementById("expandedfromLabel");
  const bottomLabel = aboutMessage.document.getElementById(
    "expandedsubjectLabel"
  );
  if (topLabel.clientWidth != bottomLabel.clientWidth) {
    throw new Error(
      `Header columns have different widths! ${topLabel.clientWidth} != ${bottomLabel.clientWidth}`
    );
  }
  const defaultWidth = topLabel.clientWidth;

  // Make the tags label really long.
  const tagsLabel = aboutMessage.document.getElementById("expandedtagsLabel");
  const oldTagsValue = tagsLabel.value;
  tagsLabel.value = "taaaaaaaaaaaaaaaaaags";
  if (topLabel.clientWidth != bottomLabel.clientWidth) {
    tagsLabel.value = oldTagsValue;
    throw new Error(
      `Header columns have different widths! ${topLabel.clientWidth} != ${bottomLabel.clientWidth}`
    );
  }

  if (topLabel.clientWidth != defaultWidth) {
    tagsLabel.value = oldTagsValue;
    throw new Error(
      `Header columns changed width! ${topLabel.clientWidth} != ${defaultWidth}`
    );
  }

  const fromRow = aboutMessage.document.getElementById("expandedfromRow");
  // Add the first tag, and make sure that the label are the same length.
  fromRow.focus();
  EventUtils.synthesizeKey("1", {}, aboutMessage);
  if (topLabel.clientWidth != bottomLabel.clientWidth) {
    tagsLabel.value = oldTagsValue;
    throw new Error(
      `Header columns have different widths! ${topLabel.clientWidth} != ${bottomLabel.clientWidth}`
    );
  }

  if (topLabel.clientWidth == defaultWidth) {
    tagsLabel.value = oldTagsValue;
    throw new Error(
      `Header columns didn't change width! ${topLabel.clientWidth} == ${defaultWidth}`
    );
  }

  // Remove the tag and put it back so that the a11y label gets regenerated
  // with the normal value rather than "taaaaaaaags".
  tagsLabel.value = oldTagsValue;
  fromRow.focus();
  EventUtils.synthesizeKey("1", {}, aboutMessage);
  fromRow.focus();
  EventUtils.synthesizeKey("1", {}, aboutMessage);
}).skip();

/**
 * Data and methods for a space.
 *
 * @typedef {object} HeaderInfo
 * @property {string} name - Used for pretty-printing in exceptions.
 * @property {Function} element - A callback returning the DOM
 *   element with the data.
 * @property {Function} expectedName - A callback returning the expected value
 *   of the accessible name of the DOM element.
 */
/**
 * List all header rows that we want to test.
 *
 * @type {HeaderInfo[]}
 */
const headersToTest = [
  {
    name: "Subject",
    element() {
      return aboutMessage.document.getElementById("expandedsubjectBox");
    },
    expectedName(element) {
      return `${
        aboutMessage.document.getElementById("expandedsubjectLabel").value
      }: ${element.value.textContent}`;
    },
  },
  {
    name: "Content-Base",
    element() {
      return aboutMessage.document.getElementById("expandedcontent-baseBox");
    },
    expectedName(element) {
      return `${
        aboutMessage.document.getElementById("expandedcontent-baseLabel").value
      }: ${element.value.textContent}`;
    },
  },
];

/**
 * Use the information from HeaderInfo to verify that screen readers will do the
 * right thing with the given message header.
 *
 * @param {HeaderInfo} header - The HeaderInfo data type object.
 */
async function verify_header_a11y(header) {
  const element = header.element();
  Assert.notEqual(
    element,
    null,
    `element not found for header '${header.name}'`
  );

  let headerAccessible;
  await TestUtils.waitForCondition(
    () => (headerAccessible = gAccService.getAccessibleFor(element)) != null,
    `didn't find accessible element for header '${header.name}'`
  );

  const expectedName = header.expectedName(element);
  Assert.equal(
    headerAccessible.name,
    expectedName,
    `headerAccessible.name for ${header.name} ` +
      `was '${headerAccessible.name}'; expected '${expectedName}'`
  );
}

/**
 * Test the accessibility attributes of the various message headers.
 *
 * INFO: The gInterestingMessage has no tags until after
 * test_add_tag_with_really_long_label, so ensure it runs after that one.
 */
add_task(async function test_a11y_attrs() {
  await be_in_folder(folder);
  // Convert the SyntheticMessage gInterestingMessage into an actual nsIMsgDBHdr
  // XPCOM message.
  const hdr = folder.msgDatabase.getMsgHdrForMessageID(
    gInterestingMessage.messageId
  );
  // Select and open the interesting message.
  const curMessage = await select_click_row(
    about3Pane.gDBView.findIndexOfMsgHdr(hdr, false)
  );
  // Make sure it loads.
  await assert_selected_and_displayed(window, curMessage);
  // Test all the headers with this message.
  headersToTest.forEach(verify_header_a11y);
});

/**
 * Test the keyboard accessibility of the toolbarbuttons on the message header.
 */
add_task(async function enter_msg_hdr_toolbar() {
  await be_in_folder(folder);
  // Convert the SyntheticMessage gInterestingMessage into an actual nsIMsgDBHdr
  // XPCOM message.
  const hdr = folder.msgDatabase.getMsgHdrForMessageID(
    gInterestingMessage.messageId
  );
  // Select and open the interesting message.
  const curMessage = await select_click_row(
    about3Pane.gDBView.findIndexOfMsgHdr(hdr, false)
  );
  // Make sure it loads.
  await assert_selected_and_displayed(window, curMessage);

  const BUTTONS_SELECTOR = `toolbarbutton:not([hidden="true"],[is="toolbarbutton-menu-button"]), toolbaritem[id="hdrSmartReplyButton"]>toolbarbutton:not([hidden="true"])>dropmarker, button:not([hidden])`;
  const headerToolbar = aboutMessage.document.getElementById(
    "header-view-toolbar"
  );
  const headerButtons = headerToolbar.querySelectorAll(BUTTONS_SELECTOR);

  // Create an array of all the menu popups on message header.
  const msgHdrMenupopups = headerToolbar.querySelectorAll(".no-icon-menupopup");
  let menupopupToOpen, msgHdrActiveElement;

  // Press tab while on the message selected.
  EventUtils.synthesizeKey("KEY_Tab", {}, about3Pane);
  Assert.equal(
    headerButtons[0].id,
    aboutMessage.document.activeElement.id,
    "focused on first msgHdr toolbar button"
  );

  // Simulate the Arrow Right keypress to make sure the correct button gets the
  // focus.
  for (let i = 1; i < headerButtons.length; i++) {
    const previousElement = document.activeElement;
    EventUtils.synthesizeKey("KEY_ArrowRight", {}, about3Pane);
    Assert.equal(
      aboutMessage.document.activeElement.id,
      headerButtons[i].id,
      "The next button is focused"
    );
    Assert.ok(
      aboutMessage.document.activeElement.tabIndex == 0 &&
        previousElement.tabIndex == -1,
      "The roving tab index was updated"
    );
    msgHdrActiveElement = aboutMessage.document.activeElement;

    // Simulate Enter and Space keypress events to ensure the menus in the
    // message header buttons area are keyboard accessible.
    if (
      msgHdrActiveElement.hasAttribute("type") &&
      msgHdrActiveElement.getAttribute("type") == "menu"
    ) {
      const parentID = msgHdrActiveElement.parentElement.id;
      for (const menupopup of msgHdrMenupopups) {
        if (
          menupopup.id.replace("Dropdown", "") ==
            parentID.replace("Button", "") ||
          menupopup.id.replace("Popup", "") ==
            msgHdrActiveElement.id.replace("Button", "")
        ) {
          menupopupToOpen = menupopup;
        }
      }

      const menupopupOpenEnterPromise = BrowserTestUtils.waitForEvent(
        menupopupToOpen,
        "popupshown"
      );
      EventUtils.synthesizeKey("KEY_Enter", {}, about3Pane);
      await menupopupOpenEnterPromise;

      const menupopupClosePromise = BrowserTestUtils.waitForEvent(
        menupopupToOpen,
        "popuphidden"
      );
      EventUtils.synthesizeKey("KEY_Escape", {}, about3Pane);
      await menupopupClosePromise;

      Assert.equal(
        msgHdrActiveElement.id,
        headerButtons[i].id,
        "The correct button is focused"
      );

      const menupopupOpenSpacePromise = BrowserTestUtils.waitForEvent(
        menupopupToOpen,
        "popupshown"
      );
      // Simulate Space keypress.
      EventUtils.synthesizeKey(" ", {}, about3Pane);
      await menupopupOpenSpacePromise;

      EventUtils.synthesizeKey("KEY_Escape", {}, about3Pane);
      await menupopupClosePromise;

      Assert.equal(
        msgHdrActiveElement.id,
        headerButtons[i].id,
        "The correct button is focused after opening and closing the menupopup"
      );
    }
  }

  // Simulate the Arrow Left keypress to make sure the correct button gets the
  // focus.
  for (let i = headerButtons.length - 2; i > -1; i--) {
    const previousElement = document.activeElement;
    EventUtils.synthesizeKey("KEY_ArrowLeft", {}, about3Pane);
    Assert.equal(
      aboutMessage.document.activeElement.id,
      headerButtons[i].id,
      "The previous button is focused"
    );
    Assert.ok(
      aboutMessage.document.activeElement.tabIndex == 0 &&
        previousElement.tabIndex == -1,
      "The roving tab index was updated"
    );
  }
  EventUtils.synthesizeKey("KEY_Tab", {}, about3Pane);
  Assert.equal(
    aboutMessage.document.activeElement.id,
    "fromRecipient0",
    "The sender is now focused"
  );
}).__skipMe = AppConstants.platform == "macosx";

// Full keyboard navigation on OSX only works if Full Keyboard Access setting is
// set to All Control in System Keyboard Preferences. This also works with the
// setting, Keyboard > Keyboard navigation, in addition to
// Accessibility > Keyboard > Full Keyboard Access.

add_task(async function test_more_button_with_many_recipients() {
  // Start on the interesting message.
  let curMessage = await select_click_row(-1);

  // Make sure it loads.
  await wait_for_message_display_completion(window);
  await assert_selected_and_displayed(window, curMessage);

  // Click on the "more" button.
  EventUtils.synthesizeMouseAtCenter(
    aboutMessage.document.getElementById("expandedccBox").moreButton,
    {},
    aboutMessage
  );

  const msgHeader = aboutMessage.document.getElementById("messageHeader");
  // Check that the message header can scroll to fit all recipients.
  Assert.ok(
    msgHeader.classList.contains("scrollable"),
    "The message header is scrollable"
  );

  // Switch to the boring message, to force the more button to collapse.
  curMessage = await select_click_row(-2);

  // Make sure it loads.
  await wait_for_message_display_completion(window);
  await assert_selected_and_displayed(window, curMessage);

  // Check that the message header is not scrollable anymore
  Assert.notEqual(
    msgHeader.classList.contains("scrollable"),
    "The message header is not scrollable"
  );
});

/**
 * Test that clicking the add to address book button updates the UI properly.
 *
 * @param {HTMLOListElement} recipientsList
 */
function subtest_more_widget_ab_button_click(recipientsList) {
  const recipient = get_last_visible_address(recipientsList);
  ensure_no_card_exists(recipient.emailAddress);

  // Scroll to the bottom first so the address is in view.
  const view = aboutMessage.document.getElementById("messageHeader");
  view.scrollTop = view.scrollHeight - view.clientHeight;

  EventUtils.synthesizeMouseAtCenter(recipient.abIndicator, {}, aboutMessage);

  Assert.ok(
    recipient.abIndicator.classList.contains("in-address-book"),
    "The recipient was added to the Address Book"
  );
}

/**
 * Test that we can open up the inline contact editor when we
 * click on the address book button.
 */
add_task(async function test_clicking_ab_button_opens_inline_contact_editor() {
  // Make sure we're in the right folder.
  await be_in_folder(folder);
  // Add a new message.
  const msg = create_message();
  await add_message_to_folder([folder], msg);
  // Open the latest message.
  await select_click_row(0);
  await wait_for_message_display_completion(window);

  // Ensure that the inline contact editing panel is not open
  const contactPanel = aboutMessage.document.getElementById("editContactPanel");
  Assert.notEqual(contactPanel.state, "open");

  const recipientsList =
    aboutMessage.document.getElementById("expandedtoBox").recipientsList;
  subtest_more_widget_ab_button_click(recipientsList);

  // Ok, if we're here, then the star has been clicked, and
  // the contact has been added to our AB.
  const recipient = get_last_visible_address(recipientsList);

  const panelOpened = TestUtils.waitForCondition(
    () => contactPanel.state == "open",
    "The contactPanel was opened"
  );
  // Click on the star, and ensure that the inline contact editing panel opens.
  EventUtils.synthesizeMouseAtCenter(recipient.abIndicator, {}, aboutMessage);
  await panelOpened;

  EventUtils.synthesizeMouseAtCenter(
    aboutMessage.document.getElementById("editContactPanelEditDetailsButton"),
    {},
    aboutMessage
  );
  await promise_content_tab_load(undefined, "about:addressbook");
  // TODO check the card.
  document.getElementById("tabmail").closeTab();
});

/**
 * Test that clicking references context menu works properly.
 */
add_task(async function test_msg_id_context_menu() {
  Services.prefs.setBoolPref("mailnews.headers.showReferences", true);

  // Add a new message.
  const msg = create_message({
    clobberHeaders: {
      References:
        "<4880C986@example.com> <4880CAB2@example.com> <4880CC76@example.com>",
    },
  });
  await add_message_to_folder([folder], msg);
  await be_in_folder(folder);

  // Open the latest message.
  await select_click_row(0);

  // Right click to show the context menu.
  EventUtils.synthesizeMouseAtCenter(
    aboutMessage.document.querySelector(
      "#expandedreferencesBox .header-message-id"
    ),
    { type: "contextmenu" },
    aboutMessage
  );
  await wait_for_popup_to_open(
    aboutMessage.document.getElementById("messageIdContext")
  );

  // Ensure Open Message For ID is shown and that Open Browser With Message-ID
  // isn't shown.
  Assert.ok(
    !aboutMessage.document.getElementById(
      "messageIdContext-openMessageForMsgId"
    ).hidden,
    "The menu item is hidden"
  );
  Assert.ok(
    aboutMessage.document.getElementById(
      "messageIdContext-openBrowserWithMsgId"
    ).hidden,
    "The menu item is visible"
  );

  await close_popup(
    window,
    aboutMessage.document.getElementById("messageIdContext")
  );

  // Reset the preferences.
  Services.prefs.setBoolPref("mailnews.headers.showReferences", false);
});

/**
 * Test that if a contact belongs to a mailing list within their address book,
 * then the inline contact editor will not allow the user to change what address
 * book the contact belongs to. The editor should also show a message to explain
 * why the contact cannot be moved.
 */
add_task(
  async function test_address_book_switch_disabled_on_contact_in_mailing_list() {
    const MAILING_LIST_DIRNAME = "Some Mailing List";
    const ADDRESS_BOOK_NAME = "Some Address Book";
    // Add a new message.
    const msg = create_message();
    await add_message_to_folder([folder], msg);

    // Make sure we're in the right folder.
    await be_in_folder(folder);

    // Open the latest message.
    await select_click_row(0);

    // Ensure that the inline contact editing panel is not open
    const contactPanel =
      aboutMessage.document.getElementById("editContactPanel");
    Assert.notEqual(contactPanel.state, "open");

    const recipientsList =
      aboutMessage.document.getElementById("expandedtoBox").recipientsList;
    subtest_more_widget_ab_button_click(recipientsList);

    // Ok, if we're here, then the star has been clicked, and
    // the contact has been added to our AB.
    const recipient = get_last_visible_address(recipientsList);

    const panelOpened = TestUtils.waitForCondition(
      () => contactPanel.state == "open",
      "The contactPanel was opened"
    );
    // Click on the address book button, and ensure that the inline contact
    // editing panel opens.
    EventUtils.synthesizeMouseAtCenter(recipient.abIndicator, {}, aboutMessage);
    await panelOpened;

    const abDrop = aboutMessage.document.getElementById(
      "editContactAddressBookList"
    );
    // Ensure that the address book dropdown is not disabled
    Assert.ok(!abDrop.disabled);

    const warningMsg = aboutMessage.document.getElementById(
      "contactMoveDisabledText"
    );
    // We should not be displaying any warning
    Assert.ok(warningMsg.hidden);

    // Now close the popup.
    contactPanel.hidePopup();

    // For the contact that was added, create a mailing list in the address book
    // it resides in, and then add that contact to the mailing list.
    const cards = get_cards_in_all_address_books_for_email(
      recipient.emailAddress
    );

    // There should be only one copy of this email address in the address books.
    Assert.equal(cards.length, 1);

    // Remove the card from any of the address books.s
    ensure_no_card_exists(recipient.emailAddress);

    // Add the card to a new address book, and insert it into a mailing list
    // under that address book.
    const ab = create_address_book(ADDRESS_BOOK_NAME);
    ab.dropCard(cards[0], false);
    let ml = create_mailing_list(MAILING_LIST_DIRNAME);
    ab.addMailList(ml);

    // Now we have to retrieve the mailing list from the address book, in order
    // for us to add and delete cards from it.
    ml = get_mailing_list_from_address_book(ab, MAILING_LIST_DIRNAME);
    ml.addCard(cards[0]);

    // Click on the address book button, and ensure that the inline contact
    // editing panel opens.
    EventUtils.synthesizeMouseAtCenter(recipient.abIndicator, {}, aboutMessage);
    await panelOpened;

    // The dropdown should be disabled now
    Assert.ok(abDrop.disabled);
    // We should be displaying a warning
    Assert.ok(!warningMsg.hidden);

    contactPanel.hidePopup();

    // And if we remove the contact from the mailing list, the warning should be
    // gone and the address book switching menu re-enabled.
    ml.deleteCards([cards[0]]);

    // Click on the address book button, and ensure that the inline contact
    // editing panel opens.
    EventUtils.synthesizeMouseAtCenter(recipient.abIndicator, {}, aboutMessage);
    await panelOpened;

    // Ensure that the address book dropdown is not disabled
    Assert.ok(!abDrop.disabled);
    // We should not be displaying any warning
    Assert.ok(warningMsg.hidden);

    contactPanel.hidePopup();
  }
);

/**
 * Test that clicking the adding an address node adds it to the address book.
 */
add_task(async function test_add_contact_from_context_menu() {
  const popup = aboutMessage.document.getElementById("emailAddressPopup");
  const popupShown = BrowserTestUtils.waitForEvent(popup, "popupshown");
  // Click the contact to show the emailAddressPopup popup menu.
  const recipient = aboutMessage.document.querySelector(
    "#expandedfromBox .header-recipient"
  );
  EventUtils.synthesizeMouseAtCenter(recipient, {}, aboutMessage);
  await popupShown;

  const addToAddressBookItem = aboutMessage.document.getElementById(
    "addToAddressBookItem"
  );
  Assert.ok(!addToAddressBookItem.hidden, "addToAddressBookItem is not hidden");

  const editContactItem =
    aboutMessage.document.getElementById("editContactItem");
  Assert.ok(editContactItem.hidden, "editContactItem is hidden");

  const recipientAdded = TestUtils.waitForCondition(
    () => recipient.abIndicator.classList.contains("in-address-book"),
    "The recipient was added to the address book"
  );

  // Click the Add to Address Book context menu entry.
  // NOTE: Use activateItem because macOS uses native context menus.
  popup.activateItem(addToAddressBookItem);
  // (for reasons unknown, the pop-up does not close itself)
  await close_popup(window, popup);
  await recipientAdded;

  // NOTE: We need to redefine these selectors otherwise the popup will not
  // properly close for some reason.
  const popup2 = aboutMessage.document.getElementById("emailAddressPopup");
  const popupShown2 = BrowserTestUtils.waitForEvent(popup, "popupshown");

  // Now click the contact again, the context menu should now show the Edit
  // Contact menu instead.
  EventUtils.synthesizeMouseAtCenter(recipient, {}, aboutMessage);
  await popupShown2;
  // (for reasons unknown, the pop-up does not close itself)
  await close_popup(window, popup2);

  Assert.ok(addToAddressBookItem.hidden, "addToAddressBookItem is hidden");
  Assert.ok(!editContactItem.hidden, "editContactItem is not hidden");
});

/**
 * Test that clicking the <List-ID> header works as it should.
 */
add_task(async function test_add_contact_from_context_menu() {
  // Add a new message.
  const msg = create_message({
    clobberHeaders: {
      "List-ID": "Cats <gocats.example.test>",
      "List-Help": "<https://example.test/lists/gocats/help>",
      "List-Unsubscribe":
        "<https://example.test/lists/gocats/unssubscribe>, <mailto:gocats+unsubscribe@example.test?subject=x-tx-unsubscribe:2:thunderbird:fb10d204-8f3f-11eb-aa0e-32e0282d11b0:76d38cd0-e766-11e8-8e55-99e8122d11b0:Mc33789033c0aab1c5028308e:1:RAHZjXgrMOtgzIOraQB0jR5Cg58VHiMb2gSuzCZBy_s>",
      "List-Subscribe": "<https://example.test/lists/gocats/subscribe>",
      "List-Post": "<https://example.test/lists/gocats/post>",
      "List-Owner":
        "<mailto:gocats+owner@example.test?subject=gocats-list>, <https://example.test/lists/gocats/owner>",
      "List-Archive": "<https://example.test/lists/gocats/archive>",
      "Archived-At": "<https://example.test/mid/123@example.org>",
    },
  });
  await add_message_to_folder([folder], msg);
  await be_in_folder(folder);

  // Open the latest message.
  await select_click_row(0);

  // Right click to show the context menu.
  EventUtils.synthesizeMouseAtCenter(
    aboutMessage.document.querySelector("#expandedlist-idBox"),
    { type: "contextmenu" },
    aboutMessage
  );
  const listIdPopup = aboutMessage.document.getElementById("listIdPopup");
  await wait_for_popup_to_open(
    aboutMessage.document.getElementById("listIdPopup")
  );

  const listIdPlaceHolder =
    aboutMessage.document.getElementById("listIdPlaceHolder");
  Assert.equal(listIdPlaceHolder.hidden, false, "list-id should show");
  Assert.equal(
    listIdPlaceHolder.label,
    "gocats.example.test",
    "list-id ctx label should be correct"
  );

  const listIdListHelp = aboutMessage.document.getElementById("listIdListHelp");
  Assert.equal(listIdListHelp.hidden, false, "list-help should show");
  Assert.equal(
    listIdListHelp.value,
    "https://example.test/lists/gocats/help",
    "list-help ctx value should be correct"
  );

  const listIdListUnsubscribe = aboutMessage.document.getElementById(
    "listIdListUnsubscribe"
  );
  Assert.equal(
    listIdListUnsubscribe.hidden,
    false,
    "list-unsubscribe should show"
  );
  Assert.equal(
    listIdListUnsubscribe.value,
    "mailto:gocats+unsubscribe@example.test?subject=x-tx-unsubscribe:2:thunderbird:fb10d204-8f3f-11eb-aa0e-32e0282d11b0:76d38cd0-e766-11e8-8e55-99e8122d11b0:Mc33789033c0aab1c5028308e:1:RAHZjXgrMOtgzIOraQB0jR5Cg58VHiMb2gSuzCZBy_s",
    "list-unsubscribe ctx value should be correct"
  );

  const listIdListSubscribe = aboutMessage.document.getElementById(
    "listIdListSubscribe"
  );
  Assert.equal(listIdListSubscribe.hidden, false, "list-subscribe should show");
  Assert.equal(
    listIdListSubscribe.value,
    "https://example.test/lists/gocats/subscribe",
    "list-subscribe ctx value should be correct"
  );

  const listIdListPost = aboutMessage.document.getElementById("listIdListPost");
  Assert.equal(listIdListPost.hidden, false, "list-post should show");
  Assert.equal(
    listIdListPost.value,
    "https://example.test/lists/gocats/post",
    "list-post ctx value should be correct"
  );

  const listIdListOwner =
    aboutMessage.document.getElementById("listIdListOwner");
  Assert.equal(listIdListOwner.hidden, false, "list-owner should show");
  Assert.equal(
    listIdListOwner.value,
    "mailto:gocats+owner@example.test?subject=gocats-list",
    "list-owner ctx value should be correct"
  );

  const listIdListArchive =
    aboutMessage.document.getElementById("listIdListArchive");
  Assert.equal(listIdListArchive.hidden, false, "list-archive should show");
  Assert.equal(
    listIdListArchive.value,
    "https://example.test/lists/gocats/archive",
    "list-archive ctx value should be correct"
  );

  const listIdArchivedAt =
    aboutMessage.document.getElementById("listIdArchivedAt");
  Assert.equal(listIdArchivedAt.hidden, false, "archived-at should show");
  Assert.equal(
    listIdArchivedAt.value,
    "https://example.test/mid/123@example.org",
    "archived-at ctx value should be correct"
  );

  await close_popup(window, listIdPopup);
});

add_task(async function test_that_msg_without_date_clears_previous_headers() {
  await be_in_folder(folder);

  // Create a message with a descriptive subject.
  const msg = create_message({ subject: "this is without date" });

  // Ensure that this message doesn't have a Date header.
  delete msg.headers.Date;

  // Sdd the message to the end of the folder.
  await add_message_to_folder([folder], msg);

  // Not the first anymore. The timestamp is that of "NOW".
  // Select and open the LAST message.
  const curMessage = await select_click_row(0);

  // Make sure it loads.
  await wait_for_message_display_completion(window);
  await assert_selected_and_displayed(window, curMessage);

  // Since we didn't give create_message an argument that would create a
  // Newsgroups header, the newsgroups <row> element should be collapsed.
  // However, since the previously displayed message _did_ have such a header,
  // certain bugs in the display of this header could cause the collapse
  // never to have happened.
  Assert.ok(
    aboutMessage.document.getElementById("expandednewsgroupsRow").hidden,
    "The Newsgroups header row is hidden."
  );
});

/**
 * Get the number of lines in one of the multi-recipient-row fields.
 *
 * @param {HTMLOListElement} node - The recipients container of a header row.
 * @returns {int} - The number of rows.
 */
function help_get_num_lines(node) {
  const style = getComputedStyle(node.firstElementChild);
  return Math.round(
    parseFloat(getComputedStyle(node).height) /
      parseFloat(style.height + style.paddingTop + style.paddingBottom)
  );
}

/**
 * Test that the "more" button displays when it should.
 *
 * @param {HTMLOListElement} node - The recipients container of a header row.
 * @param {boolean} [showAll=false] - If we're currently showing all the
 *   recipients.
 */
async function subtest_more_widget_display(node, showAll = false) {
  // Test that the `To` element doesn't have more than max lines.
  const numLines = help_get_num_lines(node);
  // Get the max line pref.
  const maxLines = Services.prefs.getIntPref(LINES_PREF);

  if (showAll) {
    await BrowserTestUtils.waitForCondition(
      () => numLines > maxLines,
      `Currently visible lines are more than the number of max lines. ${numLines} > ${maxLines}`
    );
    await BrowserTestUtils.waitForCondition(
      () =>
        !aboutMessage.document
          .getElementById("expandedtoBox")
          .querySelector(".show-more-recipients"),
      "The `more` button doesn't exist."
    );
  } else {
    await BrowserTestUtils.waitForCondition(
      () => numLines <= maxLines,
      `Currently visible lines are fewer than the number of max lines. ${numLines} <= ${maxLines}`
    );
    // Test that we've got a "more" button and that it's visible.
    await BrowserTestUtils.waitForCondition(
      () =>
        !aboutMessage.document.getElementById("expandedtoBox").moreButton
          .hidden,
      "The `more` button is visible."
    );
  }
}

/**
 * Test that activating the "more" button displays all the addresses.
 *
 * @param {HTMLOListElement} node - The recipients container of a header row.
 */
function subtest_more_widget_activate(node) {
  const oldNumLines = help_get_num_lines(node);

  const moreButton = node.querySelector(".show-more-recipients");
  Assert.ok(moreButton, "The more button should exist");
  moreButton.focus();
  // Activate the "more" button.
  EventUtils.synthesizeKey("KEY_Enter", {}, aboutMessage);

  // Make sure that the "more" button was removed when showing all addresses.
  Assert.ok(
    !node.querySelector(".show-more-recipients"),
    "The more button should not exist anymore."
  );

  // Test that we actually have more lines than we did before!
  const newNumLines = help_get_num_lines(node);
  Assert.greater(
    newNumLines,
    oldNumLines,
    "Number of address lines present increases after more click"
  );
}

/**
 * Test the behavior of the "more" button.
 */
add_task(async function test_view_more_button() {
  // Generate message with 35 recipients to guarantee overflow.
  await be_in_folder(folder);
  const msg = create_message({
    toCount: 35,
    subject: "Many To addresses to test_more_widget",
  });

  // Add the message to the end of the folder.
  await add_message_to_folder([folder], msg);

  // Select and open the injected message.
  // It is at the second last message in the display list.
  let curMessage = await select_click_row(1);
  // FIXME: Switch between a couple of messages to allow the UI to properly
  // refresh and fetch the proper recipients row width in order to avoid an
  // unexpected recipients wrapping. This happens because the width calculation
  // happens before the message header layout is fully generated.
  const prevMessage = await select_click_row(2);
  await wait_for_message_display_completion(window);
  await assert_selected_and_displayed(window, prevMessage);

  curMessage = await select_click_row(1);

  // Make sure it loads.
  await wait_for_message_display_completion(window);
  await assert_selected_and_displayed(window, curMessage);

  // Get the sender address.
  const node =
    aboutMessage.document.getElementById("expandedtoBox").recipientsList;
  await subtest_more_widget_display(node);
  subtest_more_widget_activate(node);
});

/**
 * Test the focus behavior when activating the more button.
 */
add_task(async function test_view_more_button_focus() {
  // Generate message with 35 recipients to guarantee overflow.
  await be_in_folder(folder);
  const msg = create_message({
    toCount: 35,
    subject: "Test more button focus",
  });

  // Add the message to the end of the folder.
  await add_message_to_folder([folder], msg);

  for (const { focusMore, useKeyboard } of [
    { focusMore: true, useKeyboard: false },
    { focusMore: true, useKeyboard: true },
    { focusMore: false, useKeyboard: false },
  ]) {
    // Reload the message.
    const prevMessage = await select_click_row(0);
    await wait_for_message_display_completion(window);
    await assert_selected_and_displayed(window, prevMessage);

    const curMessage = await select_click_row(1);
    await wait_for_message_display_completion(window);
    await assert_selected_and_displayed(window, curMessage);

    let items = [
      ...aboutMessage.document.querySelectorAll(
        "#expandedtoBox .recipients-list li"
      ),
    ];
    Assert.greater(items.length, 2, "Should have enough items for the test");
    const moreButton = aboutMessage.document.querySelector(
      "#expandedtoBox .show-more-recipients"
    );
    Assert.ok(moreButton, "The more button should exist");
    Assert.ok(
      items[items.length - 1].contains(moreButton),
      "More button should be the final button in the list"
    );
    let index;
    if (focusMore) {
      index = items.length - 1;
      moreButton.focus();
      Assert.ok(
        moreButton.matches(":focus"),
        "The more button can receive focus"
      );
    } else {
      index = 1;
      items[1].focus();
      Assert.ok(
        items[1].matches(":focus"),
        "The second item can receive focus"
      );
    }
    if (useKeyboard) {
      EventUtils.synthesizeKey("KEY_Enter", {}, aboutMessage);
    } else {
      EventUtils.synthesizeMouseAtCenter(moreButton, {}, aboutMessage);
    }

    Assert.ok(
      !aboutMessage.document.querySelector(
        "#expandedtoBox .show-more-recipients"
      ),
      "The more button should be removed"
    );
    items = [
      ...aboutMessage.document.querySelectorAll(
        "#expandedtoBox .recipients-list li"
      ),
    ];
    Assert.ok(
      items[index].matches(":focus"),
      `The focus should be on item ${index}`
    );
  }
});

/**
 * Test that all addresses are shown in show all header mode.
 */
add_task(async function test_show_all_header_mode() {
  async function toggle_header_mode(show) {
    const popup = document.getElementById("otherActionsPopup");
    const popupShown = BrowserTestUtils.waitForEvent(popup, "popupshown");
    EventUtils.synthesizeMouseAtCenter(
      document.getElementById("otherActionsButton"),
      {},
      window
    );
    await popupShown;

    const panel = document.getElementById("messageHeaderCustomizationPanel");
    const customizeBtn = document.getElementById(
      "messageHeaderMoreMenuCustomize"
    );
    const panelShown = BrowserTestUtils.waitForEvent(panel, "popupshown");
    EventUtils.synthesizeMouseAtCenter(customizeBtn, {}, window);
    await panelShown;

    const viewAllHeaders = document.getElementById("headerViewAllHeaders");

    const modeChanged = await TestUtils.waitForCondition(
      () =>
        document
          .getElementById("messageHeader")
          .getAttribute("show_header_mode") == show
          ? "all"
          : "normal",
      "Message header updated correctly"
    );
    EventUtils.synthesizeMouseAtCenter(viewAllHeaders, {}, window);
    await modeChanged;

    Assert.ok(
      viewAllHeaders.checked == show,
      "The view all headers checkbox was updated to the correct state"
    );

    await BrowserTestUtils.waitForCondition(
      () =>
        aboutMessage.document.getElementById("expandedsubjectBox").value
          .textContent,
      "The message was loaded"
    );

    const panelHidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
    EventUtils.synthesizeKey("VK_ESCAPE", {});
    await panelHidden;
  }

  // Generate message with 35 recipients.
  await be_in_folder(folder);
  const msg = create_message({
    toCount: 35,
    subject: "many To addresses for test_show_all_header_mode",
  });

  // Add the message to the end of the folder.
  await add_message_to_folder([folder], msg);

  // Select and open the added message.
  // It is at the second last position in the display list.
  const curMessage = await select_click_row(1);

  // Make sure it loads.
  await wait_for_message_display_completion(window);
  await assert_selected_and_displayed(window, curMessage);

  await toggle_header_mode(true);
  await wait_for_message_display_completion(window);
  await assert_selected_and_displayed(window, curMessage);
  const node =
    aboutMessage.document.getElementById("expandedtoBox").recipientsList;
  await subtest_more_widget_display(node, true);

  await toggle_header_mode(false);
  await wait_for_message_display_completion(window);
  await assert_selected_and_displayed(window, curMessage);
  await subtest_more_widget_display(node);
  subtest_more_widget_activate(node);
  await subtest_more_widget_display(node, true);
}).skip();

async function help_test_starred_messages() {
  await be_in_folder(folder);

  // Select the last message, which will display it.
  let curMessage = await select_click_row(0);
  await wait_for_message_display_completion(window);
  await assert_selected_and_displayed(window, curMessage);

  const starButton = aboutMessage.document.getElementById("starMessageButton");
  // The message shouldn't be starred.
  Assert.ok(
    !starButton.classList.contains("flagged"),
    "The message is not starred"
  );

  // Press s to mark the message as starred.
  EventUtils.synthesizeKey("s", {}, aboutMessage);
  // The message should be starred.
  Assert.ok(starButton.classList.contains("flagged"), "The message is starred");

  // Click on the star button.
  EventUtils.synthesizeMouseAtCenter(starButton, {}, aboutMessage);
  // The message shouldn't be starred.
  Assert.ok(
    !starButton.classList.contains("flagged"),
    "The message is not starred"
  );

  // Click again on the star button.
  EventUtils.synthesizeMouseAtCenter(starButton, {}, aboutMessage);
  // The message should be starred.
  Assert.ok(starButton.classList.contains("flagged"), "The message is starred");

  // Select the first message.
  curMessage = await select_click_row(-1);
  await wait_for_message_display_completion(window);
  await assert_selected_and_displayed(window, curMessage);

  // The newly selected message shouldn't be starred.
  Assert.ok(
    !starButton.classList.contains("flagged"),
    "The message is not starred"
  );

  // Select again the last message.
  curMessage = await select_click_row(0);
  await wait_for_message_display_completion(window);
  await assert_selected_and_displayed(window, curMessage);

  // The message should still be starred.
  Assert.ok(starButton.classList.contains("flagged"), "The message is starred");

  const hdr = folder.msgDatabase.getMsgHdrForMessageID(curMessage.messageId);
  // Update the starred state not through a click on the star button, to make
  // sure the method works.
  hdr.markFlagged(false);
  // The message should be starred.
  Assert.ok(
    !starButton.classList.contains("flagged"),
    "The message is not starred"
  );
}

/**
 * Test the marking of a message as starred, be sure the header is properly
 * updated and changing selected message doesn't affect the state of others.
 */
add_task(async function test_starred_message() {
  await help_test_starred_messages();
});

add_task(async function test_starred_message_unified_mode() {
  document.getElementById("tabmail").currentTabInfo.folderPaneVisible = true;
  await select_none();
  // Show the "Unified" folders view.
  window.folderTreeView.activeModes = "smart";
  // Hide the all folders view. The activeModes setter takes care of removing
  // the mode is is already visible.
  window.folderTreeView.activeModes = "all";

  await help_test_starred_messages();

  document.getElementById("tabmail").currentTabInfo.folderPaneVisible = false;
  await select_none();
  // Show the "All" folders view.
  window.folderTreeView.activeModes = "all";
  // Hide the "Unified" folders view. The activeModes setter takes care of
  // removing the mode is is already visible.
  window.folderTreeView.activeModes = "smart";
}).skip();
/**
 * Test the DBListener to be sure is initialized and cleared when needed, and it
 * doesn't change when not needed.
 */
add_task(async function test_folder_db_listener() {
  await be_in_folder(folderMore);
  // Select the last message, which will display it.
  let curMessage = await select_click_row(0);
  await wait_for_message_display_completion(window);
  await assert_selected_and_displayed(window, curMessage);

  Assert.ok(
    aboutMessage.gFolderDBListener.isRegistered,
    "The folder DB listener was initialized"
  );
  Assert.equal(
    folderMore,
    aboutMessage.gFolderDBListener.selectedFolder,
    "The current folder was stored correctly"
  );

  // Keep a reference before it gets cleared.
  const gFolderDBRef = aboutMessage.gFolderDBListener;

  // Collapse the message pane.
  aboutMessage.HideMessageHeaderPane();

  Assert.ok(!gFolderDBRef.isRegistered, "The folder DB listener was cleared");
  Assert.equal(
    folderMore,
    gFolderDBRef.selectedFolder,
    "The current folder wasn't cleared and is still the same"
  );

  // Change folder
  await be_in_folder(folder);

  // Select the last message, which will display it.
  curMessage = await select_click_row(0);
  await wait_for_message_display_completion(window);
  await assert_selected_and_displayed(window, curMessage);

  Assert.ok(
    aboutMessage.gFolderDBListener?.isRegistered,
    "The folder DB listener was initialized"
  );
  Assert.equal(
    folder,
    aboutMessage.gFolderDBListener.selectedFolder,
    "The current folder was stored correctly"
  );
});

/**
 * Remove the reference to the accessibility service so that it stops observing
 * vsync notifications at the end of the test.
 */
add_task(function cleanup() {
  gAccService = null;
  // The actual reference to the XPCOM object will be dropped at the next GC,
  // so force one to happen immediately.
  Cu.forceGC();
});
