/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EXPORTED_SYMBOLS = [
  "add_attachments",
  "add_cloud_attachments",
  "assert_previous_text",
  "async_wait_for_compose_window",
  "clear_recipients",
  "close_compose_window",
  "create_msg_attachment",
  "delete_attachment",
  "get_compose_body",
  "get_first_pill",
  "get_msg_source",
  "open_compose_from_draft",
  "open_compose_new_mail",
  "open_compose_with_edit_as_new",
  "open_compose_with_forward",
  "open_compose_with_forward_as_attachments",
  "open_compose_with_reply",
  "open_compose_with_reply_to_all",
  "open_compose_with_reply_to_list",
  "setup_msg_contents",
  "type_in_composer",
  "wait_for_compose_window",
];

var utils = ChromeUtils.import("resource://testing-common/mozmill/utils.jsm");

var folderDisplayHelper = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { gMockCloudfileManager } = ChromeUtils.import(
  "resource://testing-common/mozmill/CloudfileHelpers.jsm"
);
var windowHelper = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var EventUtils = ChromeUtils.import(
  "resource://testing-common/mozmill/EventUtils.jsm"
);

var { Assert } = ChromeUtils.import("resource://testing-common/Assert.jsm");

var kTextNodeType = 3;

var mc = folderDisplayHelper.mc;

/**
 * Opens the compose window by starting a new message
 *
 * @param aController the controller for the mail:3pane from which to spawn
 *                    the compose window.  If left blank, defaults to mc.
 *
 * @return The loaded window of type "msgcompose" wrapped in a MozmillController
 *         that is augmented using augment_controller.
 *
 */
function open_compose_new_mail(aController) {
  if (aController === undefined) {
    aController = mc;
  }

  windowHelper.plan_for_new_window("msgcompose");
  EventUtils.synthesizeKey(
    "n",
    { shiftKey: false, accelKey: true },
    aController.window
  );

  return wait_for_compose_window();
}

/**
 * Opens the compose window by replying to a selected message and waits for it
 * to load.
 *
 * @return The loaded window of type "msgcompose" wrapped in a MozmillController
 *         that is augmented using augment_controller.
 */
function open_compose_with_reply(aController) {
  if (aController === undefined) {
    aController = mc;
  }

  windowHelper.plan_for_new_window("msgcompose");
  EventUtils.synthesizeKey(
    "r",
    { shiftKey: false, accelKey: true },
    aController.window
  );

  return wait_for_compose_window();
}

/**
 * Opens the compose window by replying to all for a selected message and waits
 * for it to load.
 *
 * @return The loaded window of type "msgcompose" wrapped in a MozmillController
 *         that is augmented using augment_controller.
 */
function open_compose_with_reply_to_all(aController) {
  if (aController === undefined) {
    aController = mc;
  }

  windowHelper.plan_for_new_window("msgcompose");
  EventUtils.synthesizeKey(
    "R",
    { shiftKey: true, accelKey: true },
    aController.window
  );

  return wait_for_compose_window();
}

/**
 * Opens the compose window by replying to list for a selected message and waits for it
 * to load.
 *
 * @return The loaded window of type "msgcompose" wrapped in a MozmillController
 *         that is augmented using augment_controller.
 */
function open_compose_with_reply_to_list(aController) {
  if (aController === undefined) {
    aController = mc;
  }

  windowHelper.plan_for_new_window("msgcompose");
  EventUtils.synthesizeKey(
    "l",
    { shiftKey: true, accelKey: true },
    aController.window
  );

  return wait_for_compose_window();
}

/**
 * Opens the compose window by forwarding the selected messages as attachments
 * and waits for it to load.
 *
 * @return The loaded window of type "msgcompose" wrapped in a MozmillController
 *         that is augmented using augment_controller.
 */
function open_compose_with_forward_as_attachments(aController) {
  if (aController === undefined) {
    aController = mc;
  }

  windowHelper.plan_for_new_window("msgcompose");
  aController.click(aController.e("menu_forwardAsAttachment"));

  return wait_for_compose_window();
}

/**
 * Opens the compose window by editing the selected message as new
 * and waits for it to load.
 *
 * @return The loaded window of type "msgcompose" wrapped in a MozmillController
 *         that is augmented using augment_controller.
 */
function open_compose_with_edit_as_new(aController) {
  if (aController === undefined) {
    aController = mc;
  }

  windowHelper.plan_for_new_window("msgcompose");
  aController.click(aController.e("menu_editMsgAsNew"));

  return wait_for_compose_window();
}

/**
 * Opens the compose window by forwarding the selected message and waits for it
 * to load.
 *
 * @return The loaded window of type "msgcompose" wrapped in a MozmillController
 *         that is augmented using augment_controller.
 */
function open_compose_with_forward(aController) {
  if (aController === undefined) {
    aController = mc;
  }

  windowHelper.plan_for_new_window("msgcompose");
  EventUtils.synthesizeKey(
    "l",
    { shiftKey: false, accelKey: true },
    aController.window
  );

  return wait_for_compose_window();
}

/**
 * Open draft editing by clicking the "Edit" on the draft notification bar
 * of the selected message.
 *
 * @return The loaded window of type "msgcompose" wrapped in a MozmillController
 *         that is augmented using augment_controller.
 */
function open_compose_from_draft(aController) {
  if (aController === undefined) {
    aController = mc;
  }

  windowHelper.plan_for_new_window("msgcompose");
  aController.click(
    aController.window.document.querySelector(
      "#mail-notification-top button[label='Edit']"
    )
  );
  return wait_for_compose_window();
}

/**
 * Closes the requested compose window.
 *
 * @param aController the controller whose window is to be closed.
 * @param aShouldPrompt (optional) true: check that the prompt to save appears
 *                                 false: check there's no prompt to save
 */
function close_compose_window(aController, aShouldPrompt) {
  if (aShouldPrompt === undefined) {
    // caller doesn't care if we get a prompt
    windowHelper.close_window(aController);
    return;
  }

  windowHelper.plan_for_window_close(aController);
  if (aShouldPrompt) {
    windowHelper.plan_for_modal_dialog(
      "commonDialogWindow",
      function clickDontSave(controller) {
        controller.window.document
          .querySelector("dialog")
          .getButton("extra1")
          .doCommand();
      }
    );
    // Try to close, we should get a prompt to save.
    aController.window.goDoCommand("cmd_close");
    windowHelper.wait_for_modal_dialog();
  } else {
    aController.window.goDoCommand("cmd_close");
  }
  windowHelper.wait_for_window_close();
}

/**
 * Waits for a new compose window to open. This assumes you have already called
 * "windowHelper.plan_for_new_window("msgcompose");" and the command to open
 * the compose window itself.
 *
 * @return The loaded window of type "msgcompose" wrapped in a MozmillController
 *         that is augmented using augment_controller.
 */
async function async_wait_for_compose_window(aController, aPromise) {
  let replyWindow = await aPromise;
  return _wait_for_compose_window(aController, replyWindow);
}

function wait_for_compose_window(aController) {
  let replyWindow = windowHelper.wait_for_new_window("msgcompose");
  return _wait_for_compose_window(aController, replyWindow);
}

function _wait_for_compose_window(aController, replyWindow) {
  if (aController === undefined) {
    aController = mc;
  }

  let editor = replyWindow.window.document.querySelector("editor");

  if (editor.docShell.busyFlags != Ci.nsIDocShell.BUSY_FLAGS_NONE) {
    let editorObserver = {
      editorLoaded: false,

      observe: function eO_observe(aSubject, aTopic, aData) {
        if (aTopic == "obs_documentCreated") {
          this.editorLoaded = true;
        }
      },
    };

    editor.commandManager.addCommandObserver(
      editorObserver,
      "obs_documentCreated"
    );

    utils.waitFor(
      () => editorObserver.editorLoaded,
      "Timeout waiting for compose window editor to load",
      10000,
      100
    );

    // Let the event queue clear.
    aController.sleep(0);

    editor.commandManager.removeCommandObserver(
      editorObserver,
      "obs_documentCreated"
    );
  }

  // Although the above is reasonable, testing has shown that the some elements
  // need to have a little longer to try and load the initial data.
  // As I can't see a simpler way at the moment, we'll just have to make it a
  // sleep :-(

  aController.sleep(1000);

  return replyWindow;
}

/**
 * Fills in the given message recipient/subject/body into the right widgets.
 *
 * @param aCwc   Compose window controller.
 * @param aAddr  Recipient to fill in.
 * @param aSubj  Subject to fill in.
 * @param aBody  Message body to fill in.
 * @param inputID  The input field to fill in.
 */
function setup_msg_contents(
  aCwc,
  aAddr,
  aSubj,
  aBody,
  inputID = "toAddrInput"
) {
  let input = aCwc.e(inputID);
  aCwc.type(input, aAddr);
  input.focus();
  EventUtils.synthesizeKey("VK_RETURN", {}, aCwc.window);
  aCwc.type(aCwc.e("msgSubject"), aSubj);
  aCwc.type(aCwc.e("content-frame"), aBody);

  // Wait 1 second for the pill to be created.
  aCwc.sleep(1000);
}

/**
 * Remove all recipients.
 *
 * @param aController    Compose window controller.
 */
function clear_recipients(aController) {
  for (let pill of aController.window.document.querySelectorAll(
    "mail-address-pill"
  )) {
    pill.toggleAttribute("selected", true);
    aController.e("recipientsContainer").removeSelectedPills(pill);
  }
}

/**
 * Return the first available recipient pill.
 *
 * @param aController - Compose window controller.
 */
function get_first_pill(aController) {
  return aController.window.document.querySelector("mail-address-pill");
}

/**
 * Create and return an nsIMsgAttachment for the passed URL.
 * @param aUrl the URL for this attachment (either a file URL or a web URL)
 * @param aSize (optional) the file size of this attachment, in bytes
 */
function create_msg_attachment(aUrl, aSize) {
  let attachment = Cc[
    "@mozilla.org/messengercompose/attachment;1"
  ].createInstance(Ci.nsIMsgAttachment);

  attachment.url = aUrl;
  if (aSize) {
    attachment.size = aSize;
  }

  return attachment;
}

/**
 * Add an attachment to the compose window.
 *
 * @param aController  the controller of the composition window in question
 * @param aUrl         the URL for this attachment (either a file URL or a web URL)
 * @param aSize (optional)  the file size of this attachment, in bytes
 * @param aWaitAdded (optional)  True to wait for the attachments to be fully added, false otherwise.
 */
function add_attachments(aController, aUrls, aSizes, aWaitAdded = true) {
  if (!Array.isArray(aUrls)) {
    aUrls = [aUrls];
  }

  if (!Array.isArray(aSizes)) {
    aSizes = [aSizes];
  }

  let attachments = [];

  for (let [i, url] of aUrls.entries()) {
    attachments.push(create_msg_attachment(url, aSizes[i]));
  }

  let attachmentsDone = false;
  function collectAddedAttachments(event) {
    Assert.equal(event.detail.length, attachments.length);
    attachmentsDone = true;
  }

  let bucket = aController.e("attachmentBucket");
  if (aWaitAdded) {
    bucket.addEventListener("attachments-added", collectAddedAttachments, {
      once: true,
    });
  }
  aController.window.AddAttachments(attachments);
  if (aWaitAdded) {
    aController.waitFor(
      () => attachmentsDone,
      "Attachments adding didn't finish"
    );
  }
  aController.sleep(0);
}

/**
 * Add a cloud (filelink) attachment to the compose window.
 *
 * @param aController    The controller of the composition window in question.
 * @param aProvider      The provider account to upload to, with files to be uploaded.
 * @param aWaitUploaded (optional)  True to wait for the attachments to be uploaded, false otherwise.
 */
function add_cloud_attachments(aController, aProvider, aWaitUploaded = true) {
  let bucket = aController.e("attachmentBucket");

  let attachmentsSubmitted = false;
  function uploadAttachments(event) {
    attachmentsSubmitted = true;
    if (aWaitUploaded) {
      // event.detail contains an array of nsIMsgAttachment objects that were uploaded.
      attachmentCount = event.detail.length;
      for (let attachment of event.detail) {
        let item = bucket.findItemForAttachment(attachment);
        item.addEventListener(
          "attachment-uploaded",
          collectUploadedAttachments,
          { once: true }
        );
      }
    }
  }

  let attachmentCount = 0;
  function collectUploadedAttachments(event) {
    attachmentCount--;
  }

  bucket.addEventListener("attachments-uploading", uploadAttachments, {
    once: true,
  });
  aController.window.attachToCloudNew(aProvider);
  aController.waitFor(
    () => attachmentsSubmitted,
    "Couldn't attach attachments for upload"
  );
  if (aWaitUploaded) {
    gMockCloudfileManager.resolveUploads();
    aController.waitFor(
      () => attachmentCount == 0,
      "Attachments uploading didn't finish"
    );
  }
  aController.sleep(0);
}

/**
 * Delete an attachment from the compose window
 * @param aComposeWindow the composition window in question
 * @param aIndex the index of the attachment in the attachment pane
 */
function delete_attachment(aComposeWindow, aIndex) {
  let bucket = aComposeWindow.e("attachmentBucket");
  let node = bucket.querySelectorAll("richlistitem.attachmentItem")[aIndex];

  aComposeWindow.click(node);
  aComposeWindow.window.RemoveSelectedAttachment();
}

/**
 * Helper function returns the message body element of a composer window.
 *
 * @param aController the controller for a compose window.
 */
function get_compose_body(aController) {
  let mailBody = aController
    .e("content-frame")
    .contentDocument.querySelector("body");
  if (!mailBody) {
    throw new Error("Compose body not found!");
  }
  return mailBody;
}

/**
 * Given some compose window controller, type some text into that composer,
 * pressing enter after each line except for the last.
 *
 * @param aController a compose window controller.
 * @param aText an array of strings to type.
 */
function type_in_composer(aController, aText) {
  // If we have any typing to do, let's do it.
  let frame = aController.e("content-frame");
  for (let [i, aLine] of aText.entries()) {
    aController.type(frame, aLine);
    if (i < aText.length - 1) {
      frame.focus();
      EventUtils.synthesizeKey("VK_RETURN", {}, aController.window);
    }
  }
}

/**
 * Given some starting node aStart, ensure that aStart is a text node which
 * has a value matching the last value of the aText string array, and has
 * a br node immediately preceding it. Repeated for each subsequent string
 * of the aText array (working from end to start).
 *
 * @param aStart the first node to check
 * @param aText an array of strings that should be checked for in reverse
 *              order (so the last element of the array should be the first
 *              text node encountered, the second last element of the array
 *              should be the next text node encountered, etc).
 */
function assert_previous_text(aStart, aText) {
  let textNode = aStart;
  for (let i = aText.length - 1; i >= 0; --i) {
    if (textNode.nodeType != kTextNodeType) {
      throw new Error(
        "Expected a text node! Node type was: " + textNode.nodeType
      );
    }

    if (textNode.nodeValue != aText[i]) {
      throw new Error(
        "Unexpected inequality - " + textNode.nodeValue + " != " + aText[i]
      );
    }

    // We expect a BR preceding each text node automatically, except
    // for the last one that we reach.
    if (i > 0) {
      let br = textNode.previousSibling;

      if (br.localName != "br") {
        throw new Error(
          "Expected a BR node - got a " + br.localName + "instead."
        );
      }

      textNode = br.previousSibling;
    }
  }
  return textNode;
}

/**
 * Helper to get the raw contents of a message. It only reads the first 64KiB.
 *
 * @param aMsgHdr  nsIMsgDBHdr addressing a message which will be returned as text.
 * @param aCharset Charset to use to decode the message.
 *
 * @return         String with the message source.
 */
function get_msg_source(aMsgHdr, aCharset = "") {
  let msgUri = aMsgHdr.folder.getUriForMsg(aMsgHdr);

  let messenger = Cc["@mozilla.org/messenger;1"].createInstance(
    Ci.nsIMessenger
  );
  let streamListener = Cc[
    "@mozilla.org/network/sync-stream-listener;1"
  ].createInstance(Ci.nsISyncStreamListener);
  messenger
    .messageServiceFromURI(msgUri)
    .streamMessage(msgUri, streamListener, null, null, false, "", false);

  let sis = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
    Ci.nsIScriptableInputStream
  );
  sis.init(streamListener.inputStream);
  const MAX_MESSAGE_LENGTH = 65536;
  let content = sis.read(MAX_MESSAGE_LENGTH);
  sis.close();

  if (!aCharset) {
    return content;
  }

  let converter = Cc[
    "@mozilla.org/intl/scriptableunicodeconverter"
  ].createInstance(Ci.nsIScriptableUnicodeConverter);
  converter.charset = aCharset;
  return converter.ConvertToUnicode(content);
}
