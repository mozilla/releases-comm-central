/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test functionality in the message header, e.g. tagging, contact editing,
 * the more button ...
 */

"use strict";

var {
  create_address_book,
  create_mailing_list,
  ensure_no_card_exists,
  get_cards_in_all_address_books_for_email,
  get_mailing_list_from_address_book,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/AddressBookHelpers.jsm"
);

var {
  add_message_to_folder,
  assert_selected_and_displayed,
  be_in_folder,
  close_popup,
  create_folder,
  create_message,
  gDefaultWindowHeight,
  mc,
  msgGen,
  restore_default_window_size,
  select_click_row,
  wait_for_message_display_completion,
  wait_for_popup_to_open,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { collapse_panes, element_visible_recursive } = ChromeUtils.import(
  "resource://testing-common/mozmill/DOMHelpers.jsm"
);
var { resize_to } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var folder, folderMore;
var gInterestingMessage;

add_task(function setupModule(module) {
  folder = create_folder("MessageWindowA");
  folderMore = create_folder("MesageHeaderMoreButton");

  // create a message that has the interesting headers that commonly
  // show up in the message header pane for testing
  gInterestingMessage = create_message({
    cc: msgGen.makeNamesAndAddresses(20), // YYY
    subject:
      "This is a really, really, really, really, really, really, really, really, long subject.",
    clobberHeaders: {
      Newsgroups: "alt.test",
      "Reply-To": "J. Doe <j.doe@momo.invalid>",
      "Content-Base": "http://example.com/",
      Bcc: "Richard Roe <richard.roe@momo.invalid>",
    },
  });

  add_message_to_folder(folder, gInterestingMessage);

  // create a message that has more to and cc addresses than visible in the
  // tooltip text of the more button
  let msgMore1 = create_message({
    to: msgGen.makeNamesAndAddresses(40),
    cc: msgGen.makeNamesAndAddresses(40),
  });
  add_message_to_folder(folderMore, msgMore1);

  // create a message that has more to and cc addresses than visible in the
  // header
  let msgMore2 = create_message({
    to: msgGen.makeNamesAndAddresses(20),
    cc: msgGen.makeNamesAndAddresses(20),
  });
  add_message_to_folder(folderMore, msgMore2);

  // create a message that has boring headers to be able to switch to and
  // back from, to force the more button to collapse again.
  let msg = create_message();
  add_message_to_folder(folder, msg);

  // Some of these tests critically depends on the window width, collapse
  // everything that might be in the way
  collapse_panes(mc.e("folderpane_splitter"), true);
  collapse_panes(mc.e("tabmail-container"), true);

  // Disable animations on the panel, so that we don't have to deal with
  // async openings.
  let contactPanel = mc.e("editContactPanel");
  contactPanel.setAttribute("animate", false);
});

registerCleanupFunction(function teardownModule(module) {
  let contactPanel = mc.e("editContactPanel");
  contactPanel.removeAttribute("animate");

  // Now restore the panes we hid in setupModule
  collapse_panes(mc.e("folderpane_splitter"), false);
  collapse_panes(mc.e("tabmail-container"), false);
});

/**
 * Helper function that takes an array of mail-emailaddress elements and
 * returns the last one in the list that is not hidden. Returns null if no
 * such element exists.
 *
 * @param aAddrs an array of mail-emailaddress elements.
 */
function get_last_visible_address(aAddrs) {
  for (let i = aAddrs.length - 1; i >= 0; --i) {
    if (!aAddrs[i].hidden) {
      return aAddrs[i];
    }
  }
  return null;
}

add_task(function test_add_tag_with_really_long_label() {
  be_in_folder(folder);

  // select the first message, which will display it
  let curMessage = select_click_row(0);

  assert_selected_and_displayed(mc, curMessage);

  let topColumn = mc.e("expandedfromTableHeader");
  let bottomColumn = mc.e("expandedsubjectTableHeader");

  if (topColumn.clientWidth != bottomColumn.clientWidth) {
    throw new Error(
      "Header columns have different widths!  " +
        topColumn.clientWidth +
        " != " +
        bottomColumn.clientWidth
    );
  }
  let defaultWidth = topColumn.clientWidth;

  // Make the tags label really long.
  let tagsLabel = mc.e("expandedtagsLabel");
  let oldTagsValue = tagsLabel.value;
  tagsLabel.value = "taaaaaaaaaaaaaaaaaags";

  if (topColumn.clientWidth != bottomColumn.clientWidth) {
    tagsLabel.value = oldTagsValue;
    throw new Error(
      "Header columns have different widths!  " +
        topColumn.clientWidth +
        " != " +
        bottomColumn.clientWidth
    );
  }
  if (topColumn.clientWidth != defaultWidth) {
    tagsLabel.value = oldTagsValue;
    throw new Error(
      "Header columns changed width!  " +
        topColumn.clientWidth +
        " != " +
        defaultWidth
    );
  }

  // Add the first tag, and make sure that the label are the same length.
  mc.window.document.getElementById("expandedfromTableHeader").focus();
  EventUtils.synthesizeKey("1", {});
  if (topColumn.clientWidth != bottomColumn.clientWidth) {
    tagsLabel.value = oldTagsValue;
    throw new Error(
      "Header columns have different widths!  " +
        topColumn.clientWidth +
        " != " +
        bottomColumn.clientWidth
    );
  }
  if (topColumn.clientWidth == defaultWidth) {
    tagsLabel.value = oldTagsValue;
    throw new Error(
      "Header columns didn't change width!  " +
        topColumn.clientWidth +
        " == " +
        defaultWidth
    );
  }

  // Remove the tag and put it back so that the a11y label gets regenerated
  // with the normal value rather than "taaaaaaaags"
  tagsLabel.value = oldTagsValue;
  mc.window.document.getElementById("expandedfromTableHeader").focus();
  EventUtils.synthesizeKey("1", {});
  mc.window.document.getElementById("expandedfromTableHeader").focus();
  EventUtils.synthesizeKey("1", {});
});

/**
 * @param headerName used for pretty-printing in exceptions
 * @param headerValueElement  Function returning the DOM element
 *                            with the data.
 * @param expectedName  Function returning the expected value of
 *                      nsIAccessible.name for the DOM element in question
 */
let headersToTest = [
  {
    headerName: "Subject",
    headerValueElement(mc) {
      return mc.e("expandedsubjectBox", { class: "headerValue" });
    },
    expectedName(mc, headerValueElement) {
      return (
        mc.e("expandedsubjectLabel").value +
        ": " +
        headerValueElement.textContent
      );
    },
  },
  {
    headerName: "Content-Base",
    headerValueElement(mc) {
      return mc.window.document.querySelector(
        "#expandedcontent-baseBox.headerValue.text-link.headerValueUrl"
      );
    },
    expectedName(mc, headerValueElement) {
      return (
        mc.e("expandedcontent-baseLabel").value +
        ": " +
        headerValueElement.textContent
      );
    },
  },
  {
    headerName: "From",
    headerValueElement(mc) {
      return mc.window.document.querySelector(
        "#expandedfromBox > .headerValueBox > .headerValue > mail-emailaddress.emailDisplayButton"
      );
    },
    expectedName(mc, headerValueElement) {
      return (
        mc.e("expandedfromLabel").value +
        ": " +
        headerValueElement.getAttribute("fullAddress")
      );
    },
  },
  {
    headerName: "To",
    headerValueElement(mc) {
      return mc.window.document.querySelector(
        "#expandedtoBox > .headerValueBox > .headerValue > mail-emailaddress.emailDisplayButton"
      );
    },
    expectedName(mc, headerValueElement) {
      return (
        mc.e("expandedtoLabel").value +
        ": " +
        headerValueElement.getAttribute("fullAddress")
      );
    },
  },
  {
    headerName: "Cc",
    headerValueElement(mc) {
      return mc.window.document.querySelector(
        "#expandedccBox > .headerValueBox > .headerValue > mail-emailaddress.emailDisplayButton"
      );
    },
    expectedName(mc, headerValueElement) {
      return (
        mc.e("expandedccLabel").value +
        ": " +
        headerValueElement.getAttribute("fullAddress")
      );
    },
  },
  {
    headerName: "Bcc",
    headerValueElement(mc) {
      return mc.window.document.querySelector(
        "#expandedbccBox > .headerValueBox > .headerValue > mail-emailaddress.emailDisplayButton"
      );
    },
    expectedName(mc, headerValueElement) {
      return (
        mc.e("expandedbccLabel").value +
        ": " +
        headerValueElement.getAttribute("fullAddress")
      );
    },
  },
  {
    headerName: "Reply-To",
    headerValueElement(mc) {
      return mc.window.document.querySelector(
        "#expandedreply-toBox > .headerValueBox > .headerValue > mail-emailaddress.emailDisplayButton"
      );
    },
    expectedName(mc, headerValueElement) {
      return (
        mc.e("expandedreply-toLabel").value +
        ": " +
        headerValueElement.getAttribute("fullAddress")
      );
    },
  },
  {
    headerName: "Newsgroups",
    headerValueElement(mc) {
      return mc.window.document.querySelector(
        "#expandednewsgroupsBox > mail-newsgroup.emailDisplayButton"
      );
    },
    expectedName(mc, headerValueElement) {
      return (
        mc.e("expandednewsgroupsLabel").value +
        ": " +
        headerValueElement.getAttribute("newsgroup")
      );
    },
  },
  {
    headerName: "Tags",
    headerValueElement(mc) {
      return mc.window.document.querySelector("#expandedtagsBox > .tagvalue");
    },
    expectedName(mc, headerValueElement) {
      return (
        mc.e("expandedtagsLabel").value +
        ": " +
        headerValueElement.getAttribute("value")
      );
    },
  },
];

// used to get the accessible object for a DOM node
let gAccService = Cc["@mozilla.org/accessibilityService;1"].getService(
  Ci.nsIAccessibilityService
);

/**
 * Use the information from aHeaderInfo to verify that screenreaders will
 * do the right thing with the given message header.
 *
 * @param {Object} aHeaderInfo  Information about how to do the verification;
 *                              See the comments above the headersToTest array
 *                              for details.
 */
function verify_header_a11y(aHeaderInfo) {
  let headerValueElement = aHeaderInfo.headerValueElement(mc);
  Assert.notEqual(
    headerValueElement,
    null,
    `element not found for header '${aHeaderInfo.headerName}'`
  );

  let headerAccessible;
  mc.waitFor(
    () =>
      (headerAccessible = gAccService.getAccessibleFor(headerValueElement)) !=
      null,
    `didn't find accessible element for header '${aHeaderInfo.headerName}'`
  );

  let expectedName = aHeaderInfo.expectedName(mc, headerValueElement);
  Assert.equal(
    headerAccessible.name,
    expectedName,
    `headerAccessible.name for ${aHeaderInfo.headerName} ` +
      `was '${headerAccessible.name}'; expected '${expectedName}'`
  );
}

/**
 * Test the accessibility attributes of the various message headers.
 *
 * XXX This test used to be after test_more_button_with_many_recipients,
 * however, there were some accessibility changes that it didn't seem to play
 * nicely with, and the toggling of the "more" button on the cc field was
 * causing this test to fail on the cc element. Tests with accessibility
 * hardware/software showed that the code was working fine. Therefore the test
 * may be suspect.
 *
 * XXX The gInterestingMessage has no tags until after
 * test_add_tag_with_really_long_label, so ensure it runs after that one.
 */
add_task(function test_a11y_attrs() {
  be_in_folder(folder);

  // Convert the SyntheticMessage gInterestingMessage into an actual
  // nsIMsgDBHdr XPCOM message.
  let hdr = folder.msgDatabase.getMsgHdrForMessageID(
    gInterestingMessage.messageId
  );

  // select and open the interesting message
  let curMessage = select_click_row(mc.dbView.findIndexOfMsgHdr(hdr, false));

  // make sure it loads
  assert_selected_and_displayed(mc, curMessage);

  headersToTest.forEach(verify_header_a11y);
});

add_task(function test_more_button_with_many_recipients() {
  // Start on the interesting message.
  let curMessage = select_click_row(0);

  // make sure it loads
  wait_for_message_display_completion(mc);
  assert_selected_and_displayed(mc, curMessage);

  // Check the mode of the header.
  let headerBox = mc.e("expandedHeaderView");
  let previousHeaderMode = headerBox.getAttribute("show_header_mode");

  // Click the "more" button.
  let moreIndicator = mc.window.document.getElementById("expandedccBox").more;
  moreIndicator.click();

  // Check the new mode of the header.
  if (headerBox.getAttribute("show_header_mode") != "all") {
    throw new Error(
      "Header Mode didn't change to 'all'!  old=" +
        previousHeaderMode +
        ", new=" +
        headerBox.getAttribute("show_header_mode")
    );
  }

  // Switch to the boring message, to force the more button to collapse.
  curMessage = select_click_row(1);

  // make sure it loads
  wait_for_message_display_completion(mc);
  assert_selected_and_displayed(mc, curMessage);

  // Check the even newer mode of the header.
  if (headerBox.getAttribute("show_header_mode") != previousHeaderMode) {
    throw new Error(
      "Header Mode changed from " +
        previousHeaderMode +
        " to " +
        headerBox.getAttribute("show_header_mode") +
        " and didn't change back."
    );
  }
});

/**
 * Test that we can open up the inline contact editor when we
 * click on the star.
 */
add_task(function test_clicking_star_opens_inline_contact_editor() {
  // Make sure we're in the right folder
  be_in_folder(folder);
  // Add a new message
  let msg = create_message();
  add_message_to_folder(folder, msg);
  // Open the latest message
  select_click_row(-1);
  wait_for_message_display_completion(mc);
  // Make sure the star is clicked, and we add the
  // new contact to our address book
  let toDescription = mc.window.document.getElementById("expandedtoBox")
    .emailAddresses;

  // Ensure that the inline contact editing panel is not open
  let contactPanel = mc.e("editContactPanel");
  Assert.notEqual(contactPanel.state, "open");
  subtest_more_widget_star_click(toDescription);

  // Ok, if we're here, then the star has been clicked, and
  // the contact has been added to our AB.
  let addrs = toDescription.getElementsByTagName("mail-emailaddress");
  let lastAddr = get_last_visible_address(addrs);

  // Click on the star, and ensure that the inline contact
  // editing panel opens
  mc.click(lastAddr.querySelector(".emailStar"));
  mc.waitFor(
    () => contactPanel.state == "open",
    () =>
      "Timeout waiting for contactPanel to open; state=" + contactPanel.state
  );
  contactPanel.hidePopup();
});

/**
 * Ensure that the specified element is visible/hidden
 *
 * @param id the id of the element to check
 * @param visible true if the element should be visible, false otherwise
 */
function assert_shown(id, visible) {
  if (mc.e(id).hidden == visible) {
    throw new Error(
      '"' + id + '" should be ' + (visible ? "visible" : "hidden")
    );
  }
}

/**
 * Test that clicking references context menu works properly.
 */
add_task(async function test_msg_id_context_menu() {
  Services.prefs.setBoolPref("mailnews.headers.showReferences", true);

  // Add a new message
  let msg = create_message({
    clobberHeaders: {
      References:
        "<4880C986@example.com> <4880CAB2@example.com> <4880CC76@example.com>",
    },
  });
  add_message_to_folder(folder, msg);
  be_in_folder(folder);

  // Open the latest message.
  select_click_row(-1);

  // Right click to show the context menu.
  EventUtils.synthesizeMouseAtCenter(
    mc.window.document.querySelector("#expandedreferencesBox mail-messageid"),
    { type: "contextmenu" },
    window
  );
  await wait_for_popup_to_open(mc.e("messageIdContext"));

  // Ensure Open Message For ID is shown... and that Open Browser With Message-ID
  // isn't shown.
  assert_shown("messageIdContext-openMessageForMsgId", true);
  assert_shown("messageIdContext-openBrowserWithMsgId", false);

  await close_popup(mc, mc.e("messageIdContext"));

  Services.prefs.setBoolPref("mailnews.headers.showReferences", false);
});

/**
 * Test that if a contact belongs to a mailing list within their
 * address book, then the inline contact editor will not allow
 * the user to change what address book the contact belongs to.
 * The editor should also show a message to explain why the
 * contact cannot be moved.
 */
add_task(
  function test_address_book_switch_disabled_on_contact_in_mailing_list() {
    const MAILING_LIST_DIRNAME = "Some Mailing List";
    const ADDRESS_BOOK_NAME = "Some Address Book";
    // Add a new message
    let msg = create_message();
    add_message_to_folder(folder, msg);

    // Make sure we're in the right folder
    be_in_folder(folder);

    // Open the latest message
    select_click_row(-1);

    // Make sure the star is clicked, and we add the
    // new contact to our address book
    let toDescription = mc.window.document.getElementById("expandedtoBox")
      .emailAddresses;

    // Ensure that the inline contact editing panel is not open
    let contactPanel = mc.e("editContactPanel");
    Assert.notEqual(contactPanel.state, "open");

    subtest_more_widget_star_click(toDescription);

    // Ok, if we're here, then the star has been clicked, and
    // the contact has been added to our AB.
    let addrs = toDescription.getElementsByTagName("mail-emailaddress");
    let lastAddr = get_last_visible_address(addrs);

    // Click on the star, and ensure that the inline contact
    // editing panel opens
    mc.click(lastAddr.querySelector(".emailStar"));
    mc.waitFor(
      () => contactPanel.state == "open",
      () =>
        "Timeout waiting for contactPanel to open; state=" + contactPanel.state
    );

    let abDrop = mc.e("editContactAddressBookList");
    let warningMsg = mc.e("contactMoveDisabledText");

    // Ensure that the address book dropdown is not disabled
    Assert.ok(!abDrop.disabled);
    // We should not be displaying any warning
    Assert.ok(warningMsg.hidden);

    // Now close the popup
    contactPanel.hidePopup();

    // For the contact that was added, create a mailing list in the
    // address book it resides in, and then add that contact to the
    // mailing list
    addrs = toDescription.getElementsByTagName("mail-emailaddress");
    let targetAddr = get_last_visible_address(addrs).getAttribute(
      "emailAddress"
    );

    let cards = get_cards_in_all_address_books_for_email(targetAddr);

    // There should be only one copy of this email address
    // in the address books.
    Assert.equal(cards.length, 1);
    let card = cards[0];

    // Remove the card from any of the address books
    ensure_no_card_exists(targetAddr);

    // Add the card to a new address book, and insert it
    // into a mailing list under that address book
    let ab = create_address_book(ADDRESS_BOOK_NAME);
    ab.dropCard(card, false);
    let ml = create_mailing_list(MAILING_LIST_DIRNAME);
    ab.addMailList(ml);

    // Now we have to retrieve the mailing list from
    // the address book, in order for us to add and
    // delete cards from it.
    ml = get_mailing_list_from_address_book(ab, MAILING_LIST_DIRNAME);
    ml.addCard(card);

    // Re-open the inline contact editing panel
    mc.click(lastAddr.querySelector(".emailStar"));
    mc.waitFor(
      () => contactPanel.state == "open",
      () =>
        "Timeout waiting for contactPanel to open; state=" + contactPanel.state
    );

    // The dropdown should be disabled now
    Assert.ok(abDrop.disabled);
    // We should be displaying a warning
    Assert.ok(!warningMsg.hidden);

    contactPanel.hidePopup();

    // And if we remove the contact from the mailing list, the
    // warning should be gone and the address book switching
    // menu re-enabled.

    ml.deleteCards([card]);

    // Re-open the inline contact editing panel
    mc.click(lastAddr.querySelector(".emailStar"));
    mc.waitFor(
      () => contactPanel.state == "open",
      () =>
        "Timeout waiting for contactPanel to open; state=" + contactPanel.state
    );

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
  // Click the contact to show the emailAddressPopup popup menu.
  mc.click(
    mc.window.document.querySelector("#expandedfromBox mail-emailaddress")
  );

  var addToAddressBookItem = mc.window.document.getElementById(
    "addToAddressBookItem"
  );
  if (addToAddressBookItem.hidden) {
    throw new Error("addToAddressBookItem is hidden for unknown contact");
  }
  var editContactItem = mc.window.document.getElementById("editContactItem");
  if (!editContactItem.hidden) {
    throw new Error("editContactItem is NOT hidden for unknown contact");
  }

  // Click the Add to Address Book context menu entry.
  mc.click(mc.e("addToAddressBookItem"));
  // (for reasons unknown, the pop-up does not close itself)
  await close_popup(mc, mc.e("emailAddressPopup"));

  // Now click the contact again, the context menu should now show the
  // Edit Contact menu instead.
  mc.click(
    mc.window.document.querySelector("#expandedfromBox mail-emailaddress")
  );
  // (for reasons unknown, the pop-up does not close itself)
  await close_popup(mc, mc.e("emailAddressPopup"));

  addToAddressBookItem = mc.window.document.getElementById(
    "addToAddressBookItem"
  );
  if (!addToAddressBookItem.hidden) {
    throw new Error("addToAddressBookItem is NOT hidden for known contact");
  }
  editContactItem = mc.window.document.getElementById("editContactItem");
  if (editContactItem.hidden) {
    throw new Error("editContactItem is hidden for known contact");
  }
});

add_task(function test_that_msg_without_date_clears_previous_headers() {
  be_in_folder(folder);

  // create a message: with descritive subject
  let msg = create_message({ subject: "this is without date" });

  // ensure that this message doesn't have a Date header
  delete msg.headers.Date;

  // this will add the message to the end of the folder
  add_message_to_folder(folder, msg);

  // Not the first anymore. The timestamp is that of "NOW".
  // select and open the LAST message
  let curMessage = select_click_row(-1);

  // make sure it loads
  wait_for_message_display_completion(mc);
  assert_selected_and_displayed(mc, curMessage);

  // Since we didn't give create_message an argument that would create a
  // Newsgroups header, the newsgroups <row> element should be collapsed.
  // However, since the previously displayed message _did_ have such a header,
  // certain bugs in the display of this header could cause the collapse
  // never to have happened.
  if (!mc.e("expandednewsgroupsRow").hasAttribute("hidden")) {
    throw new Error(
      "Expected <row> element for Newsgroups header to be " +
        "collapsed, but it wasn't\n!"
    );
  }
});

/**
 * Test various aspects of the (n more) widgetry.
 */
function test_more_widget() {
  // generate message with 35 recips (effectively guarantees overflow for n=3)
  be_in_folder(folder);
  let msg = create_message({
    toCount: 35,
    subject: "Many To addresses to test_more_widget",
  });

  // add the message to the end of the folder
  add_message_to_folder(folder, msg);

  // Select and open the injected message;
  // It is at the second last message in the display list.
  let curMessage = select_click_row(-2);

  // make sure it loads
  wait_for_message_display_completion(mc);
  assert_selected_and_displayed(mc, curMessage);

  // get the description element containing the addresses
  let toDescription = mc.window.document.getElementById("expandedtoBox")
    .emailAddresses;

  subtest_more_widget_display(toDescription);
  subtest_more_widget_click(toDescription);
  subtest_more_widget_star_click(toDescription);

  let showNLinesPref = Services.prefs.getIntPref(
    "mailnews.headers.show_n_lines_before_more"
  );
  Services.prefs.clearUserPref("mailnews.headers.show_n_lines_before_more");
  change_to_header_normal_mode();
  be_in_folder(folderMore);

  // first test a message with so many addresses that they don't fit in the
  // more widget's tooltip text
  msg = select_click_row(0);
  wait_for_message_display_completion(mc);
  assert_selected_and_displayed(mc, msg);
  subtest_more_button_tooltip(msg);

  // then test a message with so many addresses that they do fit in the
  // more widget's tooltip text
  msg = select_click_row(1);
  wait_for_message_display_completion(mc);
  assert_selected_and_displayed(mc, msg);
  subtest_more_button_tooltip(msg);
  Services.prefs.setIntPref(
    "mailnews.headers.show_n_lines_before_more",
    showNLinesPref
  );
}
add_task(test_more_widget);

/**
 * Test that all addresses are shown in show all header mode
 */
add_task(function test_show_all_header_mode() {
  // generate message with 35 recips (effectively guarantees overflow for n=3)
  be_in_folder(folder);
  let msg = create_message({
    toCount: 35,
    subject: "many To addresses for test_show_all_header_mode",
  });

  // add the message to the end of the folder
  add_message_to_folder(folder, msg);

  // select and open the added message.
  // It is at the second last position in the display list.
  let curMessage = select_click_row(-2);

  // make sure it loads
  wait_for_message_display_completion(mc);
  assert_selected_and_displayed(mc, curMessage);

  // get the description element containing the addresses
  let toDescription = mc.window.document.getElementById("expandedtoBox")
    .emailAddresses;

  change_to_header_normal_mode();
  subtest_more_widget_display(toDescription);
  subtest_change_to_all_header_mode(toDescription);
  change_to_header_normal_mode();
  subtest_more_widget_click(toDescription);
});

function change_to_header_normal_mode() {
  // XXX Clicking on check menu items doesn't work in 1.4.1b1 (bug 474486)...
  //  mc.click(mc.menus.View.viewheadersmenu.viewnormalheaders);
  // ... so call the function instead.
  mc.window.MsgViewNormalHeaders();
  mc.sleep(0);
}

function change_to_all_header_mode() {
  // XXX Clicking on check menu items doesn't work in 1.4.1b1 (bug 474486)...
  //  mc.click(mc.menus.View.viewheadersmenu.viewallheaders);
  // ... so call the function instead.
  mc.window.MsgViewAllHeaders();
  mc.sleep(0);
}

/**
 * Get the number of lines in one of the multi-address fields
 * @param node the description element containing the addresses
 * @return the number of lines
 */
function help_get_num_lines(node) {
  let style = mc.window.getComputedStyle(node);
  return style.height / style.lineHeight;
}

/**
 * Test that the "more" widget displays when it should.
 * @param toDescription the description node for the "to" field
 */
function subtest_more_widget_display(toDescription) {
  // test that the to element doesn't have more than max lines
  let numLines = help_get_num_lines(toDescription);

  // get maxline pref
  let maxLines = Services.prefs.getIntPref(
    "mailnews.headers.show_n_lines_before_more"
  );

  // allow for a 15% tolerance for any padding that may be applied
  if (numLines < 0.85 * maxLines || numLines > 1.15 * maxLines) {
    throw new Error("expected == " + maxLines + "lines; found " + numLines);
  }

  // test that we've got a (more) node and that it's expanded
  let moreNode = mc.window.document.getElementById("expandedtoBox").more;
  if (!moreNode) {
    throw new Error("more node not found before activation");
  }
  if (moreNode.collapsed) {
    throw new Error("more node was collapsed when it should have been visible");
  }
}

/**
 * Test that clicking the "more" widget displays all the addresses.
 * @param toDescription the description node for the "to" field
 */
function subtest_more_widget_click(toDescription) {
  let oldNumLines = help_get_num_lines(toDescription);

  // activate (n more)
  let moreNode = mc.window.document.getElementById("expandedtoBox").more;
  mc.click(moreNode);

  // test that (n more) is gone
  moreNode = mc.window.document.getElementById("expandedtoBox").more;
  if (!moreNode.collapsed) {
    throw new Error("more node should be collapsed after activation");
  }

  // test that we actually have more lines than we did before!
  let newNumLines = help_get_num_lines(toDescription);
  if (newNumLines <= oldNumLines) {
    throw new Error(
      "number of address lines present after more clicked = " +
        newNumLines +
        "<= number of lines present beforehand = " +
        oldNumLines
    );
  }
}

/**
 * Test that changing to all header lines mode displays all the addresses.
 * @param toDescription the description node for the "to" field
 */
function subtest_change_to_all_header_mode(toDescription) {
  let oldNumLines = help_get_num_lines(toDescription);

  change_to_all_header_mode();
  mc.sleep(500);
  // test that (n more) is gone
  let moreNode = mc.window.document.getElementById("expandedtoBox").more;
  if (!moreNode.collapsed) {
    throw new Error("more node should be collapsed in all header lines mode");
  }

  // test that we actually have more lines than we did before!
  let newNumLines = help_get_num_lines(toDescription);
  if (newNumLines <= oldNumLines) {
    throw new Error(
      "number of address lines present in all header lines mode = " +
        newNumLines +
        "<= number of lines present beforehand = " +
        oldNumLines
    );
  }
}

/**
 * Test that clicking the star updates the UI properly (see bug 563612).
 * @param toDescription the description node for the "to" field
 */
function subtest_more_widget_star_click(toDescription) {
  let addrs = toDescription.getElementsByTagName("mail-emailaddress");
  let lastAddr = get_last_visible_address(addrs);
  ensure_no_card_exists(lastAddr.getAttribute("emailAddress"));

  // scroll to the bottom first so the address is in view
  let view = mc.e("expandedHeaderView");
  view.scrollTop = view.scrollHeight - view.clientHeight;
  let star = lastAddr.querySelector(".emailStar");
  let src = star.getAttribute("src");

  mc.click(star);
  if (star.getAttribute("src") === src) {
    throw new Error("address not updated after clicking star");
  }
}

/**
 * Make sure the (more) widget hidden pref actually works with a
 * non-default value.
 */
add_task(function test_more_widget_with_maxlines_of_3() {
  // set maxLines to 3
  Services.prefs.setIntPref("mailnews.headers.show_n_lines_before_more", 3);

  // call test_more_widget again
  // We need to look at the second last article in the display list.
  test_more_widget();
});

/**
 * Make sure the (more) widget hidden pref also works with an
 * "all" (0) non-default value.
 */
add_task(function test_more_widget_with_disabled_more() {
  // set maxLines to 0
  Services.prefs.setIntPref("mailnews.headers.show_n_lines_before_more", 0);

  // generate message with 35 recips (effectively guarantees overflow for n=3)
  be_in_folder(folder);
  let msg = create_message({ toCount: 35 });

  // add the message to the end of the folder
  add_message_to_folder(folder, msg);

  // select and open the last message
  let curMessage = select_click_row(-1);

  // make sure it loads
  wait_for_message_display_completion(mc);
  assert_selected_and_displayed(mc, curMessage);

  // test that (n more) is gone
  let moreNode = mc.window.document.getElementById("expandedtoBox").more;
  if (!moreNode.collapsed) {
    throw new Error("more node should be collapsed in n=0 case");
  }

  // get the description element containing the addresses
  let toDescription = mc.window.document.getElementById("expandedtoBox")
    .emailAddresses;

  // test that we actually have more lines than the 3 we know are filled
  let newNumLines = help_get_num_lines(toDescription);
  if (newNumLines <= 3) {
    throw new Error(
      "number of address lines present in all addresses mode = " +
        newNumLines +
        "<= number of expected minimum of 3 lines filled"
    );
  }
});

/**
 * When the window gets too narrow the toolbar buttons should display only icons
 * and the label should be hidden.
 */
add_task(async function test_toolbar_collapse_and_expand() {
  be_in_folder(folder);
  // Select and open a message, in this case the last, for no particular reason.
  select_click_row(-1);

  let header = mc.window.document.getElementById("msgHeaderView");

  let expandedPromise = BrowserTestUtils.waitForCondition(
    () => !header.hasAttribute("shrink"),
    "The msgHeaderView doesn't have the `shrink` attribute"
  );

  // Set an initial size of 1200px.
  resize_to(mc, 1200, gDefaultWindowHeight);

  // Confirm that the button labels are visible.
  await expandedPromise;

  let shrinkedPromise = BrowserTestUtils.waitForCondition(
    () => header.hasAttribute("shrink"),
    "The msgHeaderView has the `shrink` attribute"
  );

  // Resize to 699px width.
  resize_to(mc, 699, gDefaultWindowHeight);

  // Confirm that the button labels are hidden.
  await shrinkedPromise;

  // Set the width to 700px.
  resize_to(mc, 700, gDefaultWindowHeight);

  // Confirm that the button labels are visible.
  await expandedPromise;

  // Restore window to nominal dimensions.
  restore_default_window_size();
});

/**
 * Test if the tooltip text of the more widget contains the correct addresses
 * not shown in the header and the number of addresses also hidden in the
 * tooltip text.
 * @param aMsg the message for which the subtest should be performed
 */
function subtest_more_button_tooltip(aMsg) {
  // check for more indicator number of the more widget
  let ccAddrs = MailServices.headerParser.parseEncodedHeader(aMsg.ccList);
  let toAddrs = MailServices.headerParser.parseEncodedHeader(aMsg.recipients);

  let shownToAddrNum = get_number_of_addresses_in_header("expandedtoBox");
  let shownCCAddrNum = get_number_of_addresses_in_header("expandedccBox");

  // first check the number of addresses in the more widget
  let hiddenCCAddrsNum = ccAddrs.length - shownCCAddrNum;
  let hiddenToAddrsNum = toAddrs.length - shownToAddrNum;

  let moreNumberTo = get_number_of_more_button("expandedtoBox");
  Assert.notEqual(NaN, moreNumberTo);
  Assert.equal(hiddenToAddrsNum, moreNumberTo);

  let moreNumberCC = get_number_of_more_button("expandedccBox");
  Assert.notEqual(NaN, moreNumberCC);
  Assert.equal(hiddenCCAddrsNum, moreNumberCC);

  subtest_addresses_in_tooltip_text(
    aMsg.recipients,
    "expandedtoBox",
    shownToAddrNum,
    hiddenToAddrsNum
  );
  subtest_addresses_in_tooltip_text(
    aMsg.ccList,
    "expandedccBox",
    shownCCAddrNum,
    hiddenCCAddrsNum
  );
}

/**
 * Return the number of addresses visible in headerBox.
 * @param aHeaderBox the id of the header box element for which to look for
 *                   visible addresses
 * @return           the number of visible addresses in the header box
 */
function get_number_of_addresses_in_header(aHeaderBox) {
  let headerBoxElement = mc.e(aHeaderBox, { class: "headerValue" });
  let addrs = headerBoxElement.getElementsByTagName("mail-emailaddress");
  let addrNum = 0;
  for (let i = 0; i < addrs.length; i++) {
    // check that the address is really visible and not just a cached
    // element
    if (element_visible_recursive(addrs[i])) {
      addrNum += 1;
    }
  }
  return addrNum;
}

/**
 * Return the number shown in the more widget.
 * @param aHeaderBox the id of the header box element for which to look for
 *                   the number in the more widget
 * @return           the number shown in the more widget
 */
function get_number_of_more_button(aHeaderBox) {
  let moreNumber = 0;
  let headerBoxElement = mc.e(aHeaderBox);
  let moreIndicator = headerBoxElement.more;
  if (element_visible_recursive(moreIndicator)) {
    let moreText = moreIndicator.getAttribute("value");
    let moreSplit = moreText.split(" ");
    moreNumber = parseInt(moreSplit[0]);
  }
  return moreNumber;
}

/**
 * Check if hidden addresses are part of more tooltip text.
 * @param aRecipients     an array containing the addresses to look for in the
 *                        header or the tooltip text
 * @param aHeaderBox      the id of the header box element for which to look
 *                        for hidden addresses
 * @param aShownAddrsNum  the number of addresses shown in the header
 * @param aHiddenAddrsNum the number of addresses not shown in the header
 */
function subtest_addresses_in_tooltip_text(
  aRecipients,
  aHeaderBox,
  aShownAddrsNum,
  aHiddenAddrsNum
) {
  // check for more indicator number of the more widget
  let addresses = MailServices.headerParser.parseEncodedHeader(aRecipients);

  let headerBoxElement = mc.e(aHeaderBox);
  let moreIndicator = headerBoxElement.more;
  let tooltipText = moreIndicator.getAttribute("tooltiptext");
  let maxTooltipAddrsNum = headerBoxElement.maxAddressesInMoreTooltipValue;
  let addrsNumInTooltip = 0;

  for (
    let i = aShownAddrsNum;
    i < addresses.length && i < maxTooltipAddrsNum + aShownAddrsNum;
    i++
  ) {
    Assert.ok(
      tooltipText.includes(addresses[i].toString()),
      addresses[i].toString()
    );
    addrsNumInTooltip += 1;
  }

  if (aHiddenAddrsNum < maxTooltipAddrsNum) {
    Assert.equal(aHiddenAddrsNum, addrsNumInTooltip);
  } else {
    Assert.equal(maxTooltipAddrsNum, addrsNumInTooltip);
    // check if ", and X more" shows the correct number
    let moreTooltipSplit = tooltipText.split(", ");
    let words = mc.window.document
      .getElementById("bundle_messenger")
      .getString("headerMoreAddrsTooltip");
    let remainingAddresses =
      addresses.length - aShownAddrsNum - maxTooltipAddrsNum;
    let moreForm = mc.window.PluralForm.get(remainingAddresses, words).replace(
      "#1",
      remainingAddresses
    );
    Assert.equal(
      moreForm,
      ", " + moreTooltipSplit[moreTooltipSplit.length - 1]
    );
  }
}
