/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Checks various attachments display correctly
 */

"use strict";

var { close_compose_window, open_compose_with_forward } = ChromeUtils.import(
  "resource://testing-common/mozmill/ComposeHelpers.jsm"
);
var {
  add_message_to_folder,
  assert_attachment_list_focused,
  assert_message_pane_focused,
  assert_selected_and_displayed,
  be_in_folder,
  close_popup,
  create_folder,
  create_message,
  mc,
  msgGen,
  plan_to_wait_for_folder_events,
  select_click_row,
  select_none,
  wait_for_folder_events,
  wait_for_message_display_completion,
  wait_for_popup_to_open,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { SyntheticPartLeaf, SyntheticPartMultiMixed } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);

var {
  async_plan_for_new_window,
  close_window,
  plan_for_modal_dialog,
  wait_for_modal_dialog,
} = ChromeUtils.import("resource://testing-common/mozmill/WindowHelpers.jsm");

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var folder;
var messages;

var textAttachment =
  "One of these days... people like me will rise up and overthrow you, and " +
  "the end of tyranny by the homeostatic machine will have arrived. The day " +
  "of human values and compassion and simple warmth will return, and when " +
  "that happens someone like myself who has gone through an ordeal and who " +
  "genuinely needs hot coffee to pick him up and keep him functioning when " +
  "he has to function will get the hot coffee whether he happens to have a " +
  "poscred readily available or not.";

var binaryAttachment = textAttachment;

add_task(function setupModule(module) {
  folder = create_folder("AttachmentA");

  var attachedMessage = msgGen.makeMessage({
    body: { body: "I'm an attached email!" },
    attachments: [
      { body: textAttachment, filename: "inner attachment.txt", format: "" },
    ],
  });

  // create some messages that have various types of attachments
  messages = [
    // no attachment
    {},
    // text attachment
    {
      attachments: [{ body: textAttachment, filename: "ubik.txt", format: "" }],
    },
    // binary attachment; filename has 9 "1"s, which should be just within the
    // limit for showing the original name
    {
      attachments: [
        {
          body: binaryAttachment,
          contentType: "application/octet-stream",
          filename: "ubik-111111111.xxyyzz",
          format: "",
        },
      ],
    },
    // multiple attachments
    {
      attachments: [
        { body: textAttachment, filename: "ubik.txt", format: "" },
        {
          body: binaryAttachment,
          contentType: "application/octet-stream",
          filename: "ubik.xxyyzz",
          format: "",
        },
      ],
    },
    // attachment with a long name; the attachment bar should crop this
    {
      attachments: [
        {
          body: textAttachment,
          filename:
            "this-is-a-file-with-an-extremely-long-name-" +
            "that-seems-to-go-on-forever-seriously-you-" +
            "would-not-believe-how-long-this-name-is-it-" +
            "surely-exceeds-the-maximum-filename-length-" +
            "for-most-filesystems.txt",
          format: "",
        },
      ],
    },
    // a message with a text attachment and an email attachment, which in turn
    // has its own text attachment
    {
      bodyPart: new SyntheticPartMultiMixed([
        new SyntheticPartLeaf("I'm a message!"),
        new SyntheticPartLeaf(textAttachment, {
          filename: "outer attachment.txt",
          contentType: "text/plain",
          format: "",
        }),
        attachedMessage,
      ]),
    },
    // evilly-named attachment; spaces should be collapsed and trimmed on the
    // ends
    {
      attachments: [
        {
          body: textAttachment,
          contentType: "application/octet-stream",
          filename: " ubik  .txt                            .evil ",
          sanitizedFilename: "ubik .txt .evil",
          format: "",
        },
      ],
    },
    // another evilly-named attachment; filename has 10 "_"s, which should be
    // just enough to trigger the sanitizer
    {
      attachments: [
        {
          body: textAttachment,
          contentType: "application/octet-stream",
          filename: "ubik.txt__________.evil",
          sanitizedFilename: "ubik.txt_…_.evil",
          format: "",
        },
      ],
    },
  ];

  // Add another evilly-named attachment for Windows tests, to ensure that
  // trailing periods are stripped.
  if ("@mozilla.org/windows-registry-key;1" in Cc) {
    messages.push({
      attachments: [
        {
          body: textAttachment,
          contentType: "application/octet-stream",
          filename: "ubik.evil. . . . . . . . . ....",
          sanitizedFilename: "ubik.evil",
          format: "",
        },
      ],
    });
  }

  for (let i = 0; i < messages.length; i++) {
    add_message_to_folder(folder, create_message(messages[i]));
  }
});

/**
 * Set the pref to ensure that the attachments pane starts out (un)expanded
 *
 * @param expand true if the attachment pane should start out expanded,
 *        false otherwise
 */
function ensure_starts_expanded(expand) {
  Services.prefs.setBoolPref(
    "mailnews.attachments.display.start_expanded",
    expand
  );
}

add_task(function test_attachment_view_collapsed() {
  be_in_folder(folder);

  select_click_row(0);
  assert_selected_and_displayed(0);

  if (!mc.e("attachmentView").collapsed) {
    throw new Error("Attachment pane expanded when it shouldn't be!");
  }
});

add_task(function test_attachment_view_expanded() {
  be_in_folder(folder);

  for (let i = 1; i < messages.length; i++) {
    select_click_row(i);
    assert_selected_and_displayed(i);

    if (mc.e("attachmentView").collapsed) {
      throw new Error(
        "Attachment pane collapsed (on message #" + i + " when it shouldn't be!"
      );
    }
  }
});

add_task(function test_attachment_name_sanitization() {
  be_in_folder(folder);

  let attachmentList = mc.e("attachmentList");

  for (let i = 0; i < messages.length; i++) {
    if ("attachments" in messages[i]) {
      select_click_row(i);
      assert_selected_and_displayed(i);

      let attachments = messages[i].attachments;
      if (messages[i].attachments.length == 1) {
        Assert.equal(
          mc.e("attachmentName").value,
          attachments[0].sanitizedFilename || attachments[0].filename
        );
      }

      for (let j = 0; j < attachments.length; j++) {
        Assert.equal(
          attachmentList.getItemAtIndex(j).getAttribute("name"),
          attachments[j].sanitizedFilename || attachments[j].filename
        );
      }
    }
  }
});

add_task(function test_long_attachment_name() {
  be_in_folder(folder);

  select_click_row(4);
  assert_selected_and_displayed(4);

  let messagepaneBox = mc.e("messagepanebox");
  let attachmentBar = mc.e("attachmentBar");

  Assert.ok(
    messagepaneBox.getBoundingClientRect().width >=
      attachmentBar.getBoundingClientRect().width,
    "Attachment bar has expanded off the edge of the window!"
  );
});

/**
 * Make sure that, when opening attached messages, we only show the attachments
 * "beneath" the attached message (as opposed to all attachments for the root
 * message).
 */
add_task(async function test_attached_message_attachments() {
  be_in_folder(folder);

  select_click_row(5);
  assert_selected_and_displayed(5);

  // Make sure we have the expected number of attachments in the root message:
  // an outer text attachment, an attached email, and an inner text attachment.
  Assert.equal(mc.e("attachmentList").itemCount, 3);

  // Open the attached email.
  let newWindowPromise = async_plan_for_new_window("mail:messageWindow");
  mc.e("attachmentList")
    .getItemAtIndex(1)
    .attachment.open();
  let msgc = await newWindowPromise;
  wait_for_message_display_completion(msgc, true);

  // Make sure we have the expected number of attachments in the attached
  // message: just an inner text attachment.
  Assert.equal(msgc.e("attachmentList").itemCount, 1);

  close_window(msgc);
});

add_task(function test_attachment_name_click() {
  be_in_folder(folder);

  select_click_row(1);
  assert_selected_and_displayed(1);

  let attachmentList = mc.e("attachmentList");

  Assert.ok(
    attachmentList.collapsed,
    "Attachment list should start out collapsed!"
  );

  // Ensure the open dialog appears when clicking on the attachment name and
  // that the attachment list doesn't expand.
  plan_for_modal_dialog("unknownContentTypeWindow", function() {});
  mc.click(mc.e("attachmentName"));
  wait_for_modal_dialog("unknownContentTypeWindow");
  Assert.ok(
    attachmentList.collapsed,
    "Attachment list should not expand when clicking on attachmentName!"
  );
});

/**
 * Test that right-clicking on a particular element opens the expected context
 * menu.
 *
 * @param elementId the id of the element to right click on
 * @param contextMenuId the id of the context menu that should appear
 */
async function subtest_attachment_right_click(elementId, contextMenuId) {
  let element = document.getElementById(elementId);
  let contextMenu = document.getElementById(contextMenuId);

  let shownPromise = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(element, { type: "contextmenu" }, window);
  await shownPromise;
  let hiddenPromise = BrowserTestUtils.waitForEvent(contextMenu, "popuphidden");
  contextMenu.hidePopup();
  await hiddenPromise;
  await new Promise(resolve => requestAnimationFrame(resolve));
}

add_task(async function test_attachment_right_click_single() {
  be_in_folder(folder);

  select_click_row(1);
  assert_selected_and_displayed(1);

  await subtest_attachment_right_click(
    "attachmentIcon",
    "attachmentItemContext"
  );
  await subtest_attachment_right_click(
    "attachmentCount",
    "attachmentItemContext"
  );
  await subtest_attachment_right_click(
    "attachmentName",
    "attachmentItemContext"
  );
  await subtest_attachment_right_click(
    "attachmentSize",
    "attachmentItemContext"
  );

  await subtest_attachment_right_click(
    "attachmentToggle",
    "attachment-toolbar-context-menu"
  );
  await subtest_attachment_right_click(
    "attachmentSaveAllSingle",
    "attachment-toolbar-context-menu"
  );
  await subtest_attachment_right_click(
    "attachmentBar",
    "attachment-toolbar-context-menu"
  );
});

add_task(async function test_attachment_right_click_multiple() {
  be_in_folder(folder);

  select_click_row(3);
  assert_selected_and_displayed(3);

  await subtest_attachment_right_click(
    "attachmentIcon",
    "attachmentListContext"
  );
  await subtest_attachment_right_click(
    "attachmentCount",
    "attachmentListContext"
  );
  await subtest_attachment_right_click(
    "attachmentSize",
    "attachmentListContext"
  );

  await subtest_attachment_right_click(
    "attachmentToggle",
    "attachment-toolbar-context-menu"
  );
  await subtest_attachment_right_click(
    "attachmentSaveAllMultiple",
    "attachment-toolbar-context-menu"
  );
  await subtest_attachment_right_click(
    "attachmentBar",
    "attachment-toolbar-context-menu"
  );
});

/**
 * Test that clicking on various elements in the attachment bar toggles the
 * attachment list.
 *
 * @param elementId the id of the element to click
 */
function subtest_attachment_list_toggle(elementId) {
  let attachmentList = mc.e("attachmentList");
  let element = mc.e(elementId);

  mc.click(element);
  Assert.ok(
    !attachmentList.collapsed,
    `Attachment list should be expanded after clicking ${elementId}!`
  );
  assert_attachment_list_focused();

  mc.click(element);
  Assert.ok(
    attachmentList.collapsed,
    `Attachment list should be collapsed after clicking ${elementId} again!`
  );
  assert_message_pane_focused();
}

add_task(function test_attachment_list_expansion() {
  be_in_folder(folder);

  select_click_row(1);
  assert_selected_and_displayed(1);

  Assert.ok(
    mc.e("attachmentList").collapsed,
    "Attachment list should start out collapsed!"
  );

  subtest_attachment_list_toggle("attachmentToggle");
  subtest_attachment_list_toggle("attachmentIcon");
  subtest_attachment_list_toggle("attachmentCount");
  subtest_attachment_list_toggle("attachmentSize");
  subtest_attachment_list_toggle("attachmentBar");

  // Ensure that clicking the "Save All" button doesn't expand the attachment
  // list.
  mc.click(
    mc.window.document.querySelector(
      "#attachmentSaveAllSingle .toolbarbutton-menubutton-dropmarker"
    )
  );
  Assert.ok(
    mc.e("attachmentList").collapsed,
    "Attachment list should be collapsed after clicking save button!"
  );
});

add_task(function test_attachment_list_starts_expanded() {
  ensure_starts_expanded(true);
  be_in_folder(folder);

  select_click_row(2);
  assert_selected_and_displayed(2);

  Assert.ok(
    !mc.e("attachmentList").collapsed,
    "Attachment list should start out expanded!"
  );
});

add_task(function test_selected_attachments_are_cleared() {
  ensure_starts_expanded(false);
  be_in_folder(folder);
  // First, select the message with two attachments.
  select_click_row(3);

  // Expand the attachment list.
  mc.click(mc.e("attachmentToggle"));

  // Select both the attachments.
  let attachmentList = mc.e("attachmentList");
  Assert.equal(
    attachmentList.selectedItems.length,
    1,
    "On first load the first item should be selected"
  );

  // We can just click on the first element, but the second one needs a
  // ctrl-click (or cmd-click for those Mac-heads among us).
  mc.click(attachmentList.children[0], 5, 5);
  EventUtils.synthesizeMouse(
    attachmentList.children[1],
    5,
    5,
    { accelKey: true },
    mc.window
  );

  Assert.equal(
    attachmentList.selectedItems.length,
    2,
    "We had the wrong number of selected items after selecting some!"
  );

  // Switch to the message with one attachment, and make sure there are no
  // selected attachments.
  select_click_row(2);

  // Expand the attachment list again.
  mc.click(mc.e("attachmentToggle"));

  Assert.equal(
    attachmentList.selectedItems.length,
    1,
    "After loading a new message the first item should be selected"
  );
});

add_task(function test_select_all_attachments_key() {
  be_in_folder(folder);

  // First, select the message with two attachments.
  select_none();
  select_click_row(3);

  // Expand the attachment list.
  mc.click(mc.e("attachmentToggle"));

  let attachmentList = mc.e("attachmentList");
  attachmentList.focus();
  EventUtils.synthesizeKey("a", { accelKey: true }, mc.window);
  Assert.equal(
    attachmentList.selectedItems.length,
    2,
    "Should have selected all attachments!"
  );
});

add_task(async function test_delete_attachment_key() {
  be_in_folder(folder);

  // First, select the message with two attachments.
  select_none();
  select_click_row(3);

  // Expand the attachment list.
  assert_selected_and_displayed(3);
  if (mc.e("attachmentList").collapsed) {
    mc.click(mc.e("attachmentToggle"));
  }
  let firstAttachment = mc.e("attachmentList").firstElementChild;
  mc.click(firstAttachment, 5, 5);

  // Try deleting with the delete key
  let dialogPromise = BrowserTestUtils.promiseAlertDialog("cancel");
  firstAttachment.focus();
  EventUtils.synthesizeKey("VK_DELETE", {}, mc.window);
  await dialogPromise;

  // Try deleting with the shift-delete key combo.
  dialogPromise = BrowserTestUtils.promiseAlertDialog("cancel");
  firstAttachment.focus();
  EventUtils.synthesizeKey("VK_DELETE", { shiftKey: true }, mc.window);
  await dialogPromise;
});

add_task(function test_attachments_compose_menu() {
  be_in_folder(folder);

  // First, select the message with two attachments.
  select_none();
  select_click_row(3);

  let cwc = open_compose_with_forward();
  let attachment = cwc.e("attachmentBucket");

  // On Linux and OSX, focus events don't seem to be sent to child elements properly if
  // the parent window is not focused.  This causes some random oranges for us.
  // We use the force_focus function to "cheat" a bit, and trigger the function
  // that focusing normally would fire.  We do normal focusing for Windows.
  function force_focus(aId) {
    let element = cwc.e(aId);
    element.focus();

    if (["linux", "macosx"].includes(AppConstants.platform)) {
      // First, call the window's default controller's function.
      cwc.window.defaultController.isCommandEnabled("cmd_delete");

      // Walk up the DOM tree and call isCommandEnabled on the first controller
      // that supports "cmd_delete".
      while (element != cwc.window.document) {
        // NOTE: html elements (like body) don't have controllers.
        let numControllers = element.controllers?.getControllerCount() || 0;
        for (let i = 0; numControllers; i++) {
          let currController = element.controllers.getControllerAt(i);
          if (currController.supportsCommand("cmd_delete")) {
            currController.isCommandEnabled("cmd_delete");
            return;
          }
        }
        element = element.parentNode;
      }
    }
  }

  // Click on a portion of the attachmentBucket to focus on it. The last
  // attachment should be selected since we don't handle any action on an empty
  // bucket, and we always ensure that the last attached file is visible.
  force_focus("attachmentBucket");

  Assert.equal(
    "Remove Attachment",
    cwc.e("cmd_delete").getAttribute("label"),
    "attachmentBucket with last attachment is focused!"
  );

  // We opened a message with 2 attachments, so index 1 should be focused.
  Assert.equal(attachment.selectedIndex, 1, "Last attachment is focused!");

  // Select 1 attachment, and
  // focus the subject to see the label change and to execute isCommandEnabled
  attachment.selectedIndex = 0;
  force_focus("msgSubject");
  Assert.equal(
    "Delete",
    cwc.e("cmd_delete").getAttribute("label"),
    "attachmentBucket is not focused!"
  );

  // Focus back to the attachmentBucket
  force_focus("attachmentBucket");
  Assert.equal(
    "Remove Attachment",
    cwc.e("cmd_delete").getAttribute("label"),
    "Only 1 attachment is selected!"
  );

  // Select multiple attachments, and focus the identity for the same purpose
  attachment.selectAll();
  force_focus("msgIdentity");
  Assert.equal(
    "Delete",
    cwc.e("cmd_delete").getAttribute("label"),
    "attachmentBucket is not focused!"
  );

  // Focus back to the attachmentBucket
  force_focus("attachmentBucket");
  Assert.equal(
    "Remove Attachments",
    cwc.e("cmd_delete").getAttribute("label"),
    "Multiple attachments are selected!"
  );

  close_compose_window(cwc);
});

add_task(function test_delete_from_toolbar() {
  be_in_folder(folder);

  // First, select the message with two attachments.
  select_none();
  select_click_row(3);

  // Expand the attachment list.
  assert_selected_and_displayed(3);
  if (mc.e("attachmentList").collapsed) {
    mc.click(mc.e("attachmentToggle"));
  }

  let firstAttachment = mc.e("attachmentList").firstElementChild;
  mc.click(firstAttachment, 5, 5);

  // Make sure clicking the "Delete" toolbar button with an attachment focused
  // deletes the *message*.
  plan_to_wait_for_folder_events("DeleteOrMoveMsgCompleted");
  mc.click(mc.e("hdrTrashButton"));
  wait_for_folder_events();
});
