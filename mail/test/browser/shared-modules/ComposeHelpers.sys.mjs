/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  get_about_message,
  mc,
} from "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs";

import { gMockCloudfileManager } from "resource://testing-common/mail/CloudfileHelpers.sys.mjs";

import { promise_new_window } from "resource://testing-common/mail/WindowHelpers.sys.mjs";
import { get_notification } from "resource://testing-common/mail/NotificationBoxHelpers.sys.mjs";
import * as EventUtils from "resource://testing-common/mail/EventUtils.sys.mjs";
import { Assert } from "resource://testing-common/Assert.sys.mjs";
import { BrowserTestUtils } from "resource://testing-common/BrowserTestUtils.sys.mjs";
import { TestUtils } from "resource://testing-common/TestUtils.sys.mjs";

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

var kTextNodeType = 3;

/**
 * Opens the compose window by starting a new message
 *
 * @param {Window} [win] - The window from which to spawn the compose window.
 *   If left blank, defaults to the first window.
 * @returns {Window} The loaded window of type "msgcompose".
 */
export async function open_compose_new_mail(win = mc) {
  const composePromise = promise_new_window("msgcompose");
  EventUtils.synthesizeKey("n", { shiftKey: false, accelKey: true }, win);
  return compose_window_ready(composePromise);
}

/**
 * Opens the compose window by replying to a selected message and waits for it
 * to load.
 *
 * @param {Window} [win] - The window from which to spawn the compose window.
 *   If left blank, defaults to the first window.
 * @returns {Window} The loaded window of type "msgcompose".
 */
export async function open_compose_with_reply(win = mc) {
  const composePromise = promise_new_window("msgcompose");
  EventUtils.synthesizeKey("r", { shiftKey: false, accelKey: true }, win);
  return compose_window_ready(composePromise);
}

/**
 * Opens the compose window by replying to all for a selected message and waits
 * for it to load.
 *
 * @param {Window} [win] - The window from which to spawn the compose window.
 *   If left blank, defaults to the first window.
 * @returns {Window} The loaded window of type "msgcompose".
 */
export async function open_compose_with_reply_to_all(win = mc) {
  const composePromise = promise_new_window("msgcompose");
  EventUtils.synthesizeKey("R", { shiftKey: true, accelKey: true }, win);
  return compose_window_ready(composePromise);
}

/**
 * Opens the compose window by replying to list for a selected message and waits for it
 * to load.
 *
 * @param {Window} [win] - The window from which to spawn the compose window.
 *   If left blank, defaults to the first window.
 * @returns {Window} The loaded window of type "msgcompose".
 */
export async function open_compose_with_reply_to_list(win = mc) {
  const composePromise = promise_new_window("msgcompose");
  EventUtils.synthesizeKey("l", { shiftKey: true, accelKey: true }, win);
  return compose_window_ready(composePromise);
}

/**
 * Opens the compose window by forwarding the selected messages as attachments
 * and waits for it to load.
 *
 * @param {Window} [win] - The window from which to spawn the compose window.
 *   If left blank, defaults to the first window.
 * @returns {Window} The loaded window of type "msgcompose".
 */
export async function open_compose_with_forward_as_attachments(win = mc) {
  const composePromise = promise_new_window("msgcompose");
  win.goDoCommand("cmd_forwardAttachment");
  return compose_window_ready(composePromise);
}

/**
 * Opens the compose window by editing the selected message as new
 * and waits for it to load.
 *
 * @param {Window} [win] - The window from which to spawn the compose window.
 *   If left blank, defaults to the first window.
 * @returns {Window} The loaded window of type "msgcompose".
 */
export async function open_compose_with_edit_as_new(win = mc) {
  const composePromise = promise_new_window("msgcompose");
  win.goDoCommand("cmd_editAsNew");
  return compose_window_ready(composePromise);
}

/**
 * Opens the compose window by forwarding the selected message and waits for it
 * to load.
 *
 * @param {Window} [win] - The window from which to spawn the compose window.
 *   If left blank, defaults to the first window.
 * @returns {Window} The loaded window of type "msgcompose".
 */
export async function open_compose_with_forward(win = mc) {
  const composePromise = promise_new_window("msgcompose");
  EventUtils.synthesizeKey("l", { shiftKey: false, accelKey: true }, win);
  return compose_window_ready(composePromise);
}

/**
 * Open draft editing by clicking the "Edit" on the draft notification bar
 * of the selected message.
 *
 * @param {Window} [win] - The window from which to spawn the compose window.
 *   If left blank, defaults to the first window.
 * @returns {Window} The loaded window of type "msgcompose".
 */
export async function open_compose_from_draft(win = get_about_message()) {
  const composePromise = promise_new_window("msgcompose");
  const box = get_notification(win, "mail-notification-top", "draftMsgContent");
  EventUtils.synthesizeMouseAtCenter(
    box.buttonContainer.firstElementChild,
    {},
    win
  );
  return compose_window_ready(composePromise);
}

/**
 * Saves the message being composed and waits for the save to complete.
 *
 * @param {Window} win - A messengercompose.xhtml window.
 */
export async function save_compose_message(win) {
  const savePromise = BrowserTestUtils.waitForEvent(win, "aftersave");
  win.document.querySelector("#button-save").click();
  await savePromise;
}

/**
 * Closes the requested compose window.
 *
 * @param {Window} aWin - The window to be closed.
 * @param {boolean} [aShouldPrompt] - If true, check that the prompt to save
 *   appears. If false, check there's no prompt to save.
 */
export async function close_compose_window(aWin, aShouldPrompt) {
  if (aShouldPrompt === undefined) {
    // caller doesn't care if we get a prompt
    await BrowserTestUtils.closeWindow(aWin);
    await TestUtils.waitForTick();
    return;
  }

  const closePromise = BrowserTestUtils.domWindowClosed(aWin);
  if (aShouldPrompt) {
    const dialogPromise = BrowserTestUtils.promiseAlertDialog("extra1");
    // Try to close, we should get a prompt to save.
    aWin.goDoCommand("cmd_close");
    await dialogPromise;
  } else {
    aWin.goDoCommand("cmd_close");
  }
  await closePromise;
}

/**
 * Waits for a new compose window to open. This assumes you have already called
 * `promise_new_window("msgcompose");` and the command to open
 * the compose window itself.
 *
 * @param {Promise} composePromise - The returned promise from `promise_new_window`.
 * @returns {Promise<Window>} The loaded window of type "msgcompose".
 */
export async function compose_window_ready(composePromise) {
  const replyWindow = await composePromise;
  return _wait_for_compose_window(replyWindow);
}

async function _wait_for_compose_window(replyWindow) {
  await TestUtils.waitForCondition(
    () => Services.focus.activeWindow == replyWindow,
    "waiting for the compose window to have focus"
  );
  await TestUtils.waitForCondition(
    () => replyWindow.composeEditorReady,
    "waiting for the compose editor to be ready"
  );
  await new Promise(resolve => replyWindow.setTimeout(resolve));

  return replyWindow;
}

/**
 * Fills in the given message recipient/subject/body into the right widgets.
 *
 * @param {Window} aCwc - Compose window.
 * @param {string} aAddr - Recipient to fill in.
 * @param {string} aSubj - Subject to fill in.
 * @param {string} aBody - Message body to fill in.
 * @param {string} inputID - The ID of an input field to fill in.
 */
export async function setup_msg_contents(
  aCwc,
  aAddr,
  aSubj,
  aBody,
  inputID = "toAddrInput"
) {
  const pillcount = function () {
    return aCwc.document.querySelectorAll("mail-address-pill").length;
  };
  let targetCount = pillcount();
  if (aAddr.trim()) {
    targetCount += aAddr.split(",").filter(s => s.trim()).length;
  }

  const input = aCwc.document.getElementById(inputID);
  await new Promise(resolve => aCwc.setTimeout(resolve, 1000));
  input.focus();
  EventUtils.sendString(aAddr, aCwc);
  input.focus();

  EventUtils.synthesizeKey("VK_RETURN", {}, aCwc);
  aCwc.document.getElementById("msgSubject").focus();
  EventUtils.sendString(aSubj, aCwc);
  aCwc.document.getElementById("messageEditor").focus();
  EventUtils.sendString(aBody, aCwc);

  // Wait for the pill(s) to be created.
  await TestUtils.waitForCondition(
    () => pillcount() == targetCount,
    `Creating pill for: ${aAddr}`
  );
}

/**
 * Remove all recipients.
 *
 * @param {Window} win - Compose window.
 */
export function clear_recipients(win) {
  for (const pill of win.document.querySelectorAll("mail-address-pill")) {
    pill.toggleAttribute("selected", true);
  }
  win.document.getElementById("recipientsContainer").removeSelectedPills();
}

/**
 * Return the first available recipient pill.
 *
 * @param {Window} win - Compose window.
 */
export function get_first_pill(win) {
  return win.document.querySelector("mail-address-pill");
}

/**
 * Create and return an nsIMsgAttachment for the passed URL.
 *
 * @param {string} aUrl - The URL for this attachment (either a file URL or a web URL)
 * @param {integer} [aSize] - The file size of this attachment, in bytes.
 */
export function create_msg_attachment(aUrl, aSize) {
  const attachment = Cc[
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
 * @param {Window} aWin - The composition window in question.
 * @param {string|string[]} aUrls - The URL for an attachment (either a file URL
 *   or a web URL), or an array of URLs for attachments.
 * @param {integer|integer[]} [aSizes] - The file size of this attachment, in
 *   bytes, or an array of sizes.
 * @param {boolean} [aWaitAdded=true] - True to wait for the attachments to be
 *   fully added, false otherwise.
 */
export async function add_attachments(
  aWin,
  aUrls,
  aSizes = [],
  aWaitAdded = true
) {
  if (!Array.isArray(aUrls)) {
    aUrls = [aUrls];
  }

  if (!Array.isArray(aSizes)) {
    aSizes = [aSizes];
  }

  const attachments = [];

  for (const [i, url] of aUrls.entries()) {
    attachments.push(create_msg_attachment(url, aSizes[i]));
  }

  let attachmentsDone = false;
  function collectAddedAttachments(event) {
    Assert.equal(event.detail.length, attachments.length);
    attachmentsDone = true;
  }

  const bucket = aWin.document.getElementById("attachmentBucket");
  if (aWaitAdded) {
    bucket.addEventListener("attachments-added", collectAddedAttachments, {
      once: true,
    });
  }
  aWin.AddAttachments(attachments);
  if (aWaitAdded) {
    await TestUtils.waitForCondition(
      () => attachmentsDone,
      "Attachments adding didn't finish"
    );
  }
  await TestUtils.waitForTick();
}

/**
 * Rename the selected cloud (filelink) attachment
 *
 * @param {Window} aWin - The composition window in question.
 * @param {string} aName - The requested new name for the attachment.
 */
export async function rename_selected_cloud_attachment(aWin, aName) {
  const bucket = aWin.document.getElementById("attachmentBucket");
  let attachmentRenamed = false;
  let upload = null;
  let seenAlert = null;

  function getRenamedUpload(event) {
    upload = event.target.cloudFileUpload;
    attachmentRenamed = true;
  }

  /** @implements {nsIPromptService} */
  const mockPromptService = {
    value: "",
    prompt(window, title, message, rv) {
      rv.value = this.value;
      return true;
    },
    alert(window, title, message) {
      seenAlert = { title, message };
    },
    QueryInterface: ChromeUtils.generateQI(["nsIPromptService"]),
  };

  bucket.addEventListener("attachment-renamed", getRenamedUpload, {
    once: true,
  });

  const originalPromptService = Services.prompt;
  Services.prompt = mockPromptService;
  Services.prompt.value = aName;
  aWin.RenameSelectedAttachment();

  await TestUtils.waitForCondition(
    () => attachmentRenamed || seenAlert,
    "Couldn't rename attachment"
  );
  Services.prompt = originalPromptService;

  await TestUtils.waitForTick();
  if (seenAlert) {
    return seenAlert;
  }

  return upload;
}

/**
 * Convert the selected attachment to a cloud (filelink) attachment
 *
 * @param {Window} aWin - The composition window in question.
 * @param {object} aProvider - The provider account to upload the selected
 *   attachment to.
 * @param {boolean} [aWaitUploaded=true] - True to wait for the attachments to
 *   be uploaded, false otherwise.
 */
export async function convert_selected_to_cloud_attachment(
  aWin,
  aProvider,
  aWaitUploaded = true
) {
  const bucket = aWin.document.getElementById("attachmentBucket");
  let uploads = [];
  const attachmentsSelected = aWin.gAttachmentBucket.selectedItems.length;
  let attachmentsSubmitted = 0;
  let attachmentsConverted = 0;

  Assert.equal(
    attachmentsSelected,
    1,
    "Exactly one attachment should be scheduled for conversion."
  );

  function collectConvertingAttachments(event) {
    const item = event.target;
    const img = item.querySelector("img.attachmentcell-icon");
    Assert.equal(
      img.src,
      "chrome://messenger/skin/icons/spinning.svg",
      "Icon should be the spinner during conversion."
    );

    attachmentsSubmitted++;
    if (attachmentsSubmitted == attachmentsSelected) {
      bucket.removeEventListener(
        "attachment-uploading",
        collectConvertingAttachments
      );
      bucket.removeEventListener(
        "attachment-moving",
        collectConvertingAttachments
      );
    }
  }

  function collectConvertedAttachment(event) {
    const item = event.target;
    const img = item.querySelector("img.attachmentcell-icon");
    Assert.equal(
      img.src,
      item.cloudIcon,
      "Cloud icon should be used after conversion has finished."
    );

    attachmentsConverted++;
    if (attachmentsConverted == attachmentsSelected) {
      item.removeEventListener(
        "attachment-uploaded",
        collectConvertedAttachment
      );
      item.removeEventListener("attachment-moved", collectConvertedAttachment);
    }
  }

  bucket.addEventListener("attachment-uploading", collectConvertingAttachments);
  bucket.addEventListener("attachment-moving", collectConvertingAttachments);
  aWin.convertSelectedToCloudAttachment(aProvider);
  await TestUtils.waitForCondition(
    () => attachmentsSubmitted == attachmentsSelected,
    "Couldn't start converting all attachments"
  );

  if (aWaitUploaded) {
    bucket.addEventListener("attachment-uploaded", collectConvertedAttachment);
    bucket.addEventListener("attachment-moved", collectConvertedAttachment);

    uploads = gMockCloudfileManager.resolveUploads();
    await TestUtils.waitForCondition(
      () => attachmentsConverted == attachmentsSelected,
      "Attachments uploading didn't finish"
    );
  }

  await TestUtils.waitForTick();
  return uploads;
}

/**
 * Add a cloud (filelink) attachment to the compose window.
 *
 * @param {Window} aWin - The composition window in question.
 * @param {object} aProvider - The provider account to upload to, with files to
 *   be uploaded.
 * @param {boolean} [aWaitUploaded=true] - True to wait for the attachments to
 *   be uploaded, false otherwise.
 * @param {integer} [aExpectedAlerts=0] - The number of expected alert prompts.
 */
export async function add_cloud_attachments(
  aWin,
  aProvider,
  aWaitUploaded = true,
  aExpectedAlerts = 0
) {
  const bucket = aWin.document.getElementById("attachmentBucket");
  let uploads = [];
  const seenAlerts = [];

  let attachmentsAdded = 0;
  let attachmentsSubmitted = 0;
  let attachmentsUploaded = 0;

  function collectAddedAttachments(event) {
    attachmentsAdded = event.detail.length;
    if (!aExpectedAlerts) {
      bucket.addEventListener(
        "attachment-uploading",
        collectUploadingAttachments
      );
    }
  }

  function collectUploadingAttachments(event) {
    const item = event.target;
    const img = item.querySelector("img.attachmentcell-icon");
    Assert.equal(
      img.src,
      "chrome://messenger/skin/icons/spinning.svg",
      "Icon should be the spinner during upload."
    );

    attachmentsSubmitted++;
    if (attachmentsSubmitted == attachmentsAdded) {
      bucket.removeEventListener(
        "attachment-uploading",
        collectUploadingAttachments
      );
    }
  }

  function collectUploadedAttachments(event) {
    const item = event.target;
    const img = item.querySelector("img.attachmentcell-icon");
    Assert.equal(
      img.src,
      item.cloudIcon,
      "Cloud icon should be used after upload has finished."
    );

    attachmentsUploaded++;
    if (attachmentsUploaded == attachmentsAdded) {
      bucket.removeEventListener(
        "attachment-uploaded",
        collectUploadedAttachments
      );
    }
  }

  /** @implements {nsIPromptService} */
  const mockPromptService = {
    alert(window, title, message) {
      seenAlerts.push({ title, message });
    },
    QueryInterface: ChromeUtils.generateQI(["nsIPromptService"]),
  };

  bucket.addEventListener("attachments-added", collectAddedAttachments, {
    once: true,
  });

  const originalPromptService = Services.prompt;
  Services.prompt = mockPromptService;
  aWin.attachToCloudNew(aProvider);
  await TestUtils.waitForCondition(
    () =>
      (!aExpectedAlerts &&
        attachmentsAdded > 0 &&
        attachmentsAdded == attachmentsSubmitted) ||
      (aExpectedAlerts && seenAlerts.length == aExpectedAlerts),
    "Couldn't attach attachments for upload"
  );

  Services.prompt = originalPromptService;
  if (seenAlerts.length > 0) {
    return seenAlerts;
  }

  if (aWaitUploaded) {
    bucket.addEventListener("attachment-uploaded", collectUploadedAttachments);
    uploads = gMockCloudfileManager.resolveUploads();
    await TestUtils.waitForCondition(
      () => attachmentsAdded == attachmentsUploaded,
      "Attachments uploading didn't finish"
    );
  }
  await TestUtils.waitForTick();
  return uploads;
}

/**
 * Delete an attachment from the compose window
 *
 * @param {Window} aComposeWindow - The composition window in question
 * @param {integer} aIndex - The index of the attachment in the attachment pane
 */
export function delete_attachment(aComposeWindow, aIndex) {
  const bucket = aComposeWindow.document.getElementById("attachmentBucket");
  const node = bucket.querySelectorAll("richlistitem.attachmentItem")[aIndex];

  EventUtils.synthesizeMouseAtCenter(node, {}, node.ownerGlobal);
  aComposeWindow.RemoveSelectedAttachment();
}

/**
 * Helper function returns the message body element of a composer window.
 *
 * @param {Window} win - A compose window.
 */
export function get_compose_body(win) {
  const mailBody = win.document
    .getElementById("messageEditor")
    .contentDocument.querySelector("body");
  if (!mailBody) {
    throw new Error("Compose body not found!");
  }
  return mailBody;
}

/**
 * Given some compose window, type some text into that composer,
 * pressing enter after each line except for the last.
 *
 * @param {Window} aWin - A compose window.
 * @param {string[]} aText - An array of strings to type.
 */
export function type_in_composer(aWin, aText) {
  // If we have any typing to do, let's do it.
  const frame = aWin.document.getElementById("messageEditor");
  for (const [i, aLine] of aText.entries()) {
    frame.focus();
    EventUtils.sendString(aLine, aWin);
    if (i < aText.length - 1) {
      frame.focus();
      EventUtils.synthesizeKey("VK_RETURN", {}, aWin);
    }
  }
}

/**
 * Given some starting node aStart, ensure that aStart is a text node which
 * has a value matching the last value of the aText string array, and has
 * a br node immediately preceding it. Repeated for each subsequent string
 * of the aText array (working from end to start).
 *
 * @param {Node} aStart - The first node to check.
 * @param {string[]} aText - An array of strings that should be checked for in
 *   reverse order (so the last element of the array should be the first
 *   text node encountered, the second last element of the array
 *   should be the next text node encountered, etc).
 */
export function assert_previous_text(aStart, aText) {
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
      const br = textNode.previousSibling;

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
 * @param {nsIMsgDBHdr} aMsgHdr - nsIMsgDBHdr addressing a message which will be
 *   returned as text.
 * @param {string} aCharset - Charset to use to decode the message.
 *
 * @returns {string} the message source.
 */
export async function get_msg_source(aMsgHdr, aCharset = "") {
  const msgUri = aMsgHdr.folder.getUriForMsg(aMsgHdr);

  const content = await new Promise((resolve, reject) => {
    const streamListener = {
      QueryInterface: ChromeUtils.generateQI(["nsIStreamListener"]),
      sis: Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
        Ci.nsIScriptableInputStream
      ),
      content: "",
      onDataAvailable(request, inputStream, offset, count) {
        this.sis.init(inputStream);
        this.content += this.sis.read(count);
      },
      onStartRequest() {},
      onStopRequest(request, statusCode) {
        this.sis.close();
        if (Components.isSuccessCode(statusCode)) {
          resolve(this.content);
        } else {
          reject(new Error(statusCode));
        }
      },
    };
    MailServices.messageServiceFromURI(msgUri).streamMessage(
      msgUri,
      streamListener,
      null,
      null,
      false,
      "",
      false
    );
  });

  if (!aCharset) {
    return content;
  }

  const buffer = Uint8Array.from(content, c => c.charCodeAt(0));
  return new TextDecoder(aCharset).decode(buffer);
}

/**
 * Helper class for performing formatted editing on the composition message.
 */
export class FormatHelper {
  /**
   * Create the helper for the given composition window.
   *
   * @param {Window} win - The composition window.
   */
  constructor(win) {
    this.window = win;
    /** The Format menu. */
    this.formatMenu = this._getById("formatMenuPopup");

    /** The Font sub menu of {@link FormatHelper#formatMenu}. */
    this.fontMenu = this._getById("fontFaceMenuPopup");
    /** The menu items below the Font menu. */
    this.fontMenuItems = Array.from(this.fontMenu.querySelectorAll("menuitem"));
    /** The (font) Size sub menu of {@link FormatHelper#formatMenu}. */
    this.sizeMenu = this._getById("fontSizeMenuPopup");
    /** The menu items below the Size menu. */
    this.sizeMenuItems = Array.from(
      // Items without a value are the increase/decrease items.
      this.sizeMenu.querySelectorAll("menuitem[value]")
    );
    /** The Text Style sub menu of {@link FormatHelper#formatMenu}. */
    this.styleMenu = this._getById("fontStyleMenuPopup");
    /** The menu items below the Text Style menu. */
    this.styleMenuItems = Array.from(
      this.styleMenu.querySelectorAll("menuitem")
    );
    /** The Paragraph (state) sub menu of {@link FormatHelper#formatMenu}. */
    this.paragraphStateMenu = this._getById("paragraphMenuPopup");
    /** The menu items below the Paragraph menu. */
    this.paragraphStateMenuItems = Array.from(
      this.paragraphStateMenu.querySelectorAll("menuitem")
    );

    /** The toolbar paragraph state selector button. */
    this.paragraphStateSelector = this._getById("ParagraphSelect");
    /** The toolbar paragraph state selector menu. */
    this.paragraphStateSelectorMenu = this._getById("ParagraphPopup");
    /** The toolbar font face selector button. */
    this.fontSelector = this._getById("FontFaceSelect");
    /** The toolbar font face selector menu. */
    this.fontSelectorMenu = this._getById("FontFacePopup");
    /** The toolbar font size selector button. */
    this.sizeSelector = this._getById("AbsoluteFontSizeButton");
    /** The toolbar font size selector menu. */
    this.sizeSelectorMenu = this._getById("AbsoluteFontSizeButtonPopup");
    /** The menu items below the toolbar font size selector. */
    this.sizeSelectorMenuItems = Array.from(
      this.sizeSelectorMenu.querySelectorAll("menuitem")
    );

    /** The toolbar foreground color selector. */
    this.colorSelector = this._getById("TextColorButton");
    /** The Format foreground color item. */
    this.colorMenuItem = this._getById("fontColor");

    /** The toolbar increase font size button. */
    this.increaseSizeButton = this._getById("IncreaseFontSizeButton");
    /** The toolbar decrease font size button. */
    this.decreaseSizeButton = this._getById("DecreaseFontSizeButton");
    /** The increase font size menu item. */
    this.increaseSizeMenuItem = this._getById("menu_increaseFontSize");
    /** The decrease font size menu item. */
    this.decreaseSizeMenuItem = this._getById("menu_decreaseFontSize");

    /** The toolbar bold button. */
    this.boldButton = this._getById("boldButton");
    /** The toolbar italic button. */
    this.italicButton = this._getById("italicButton");
    /** The toolbar underline button. */
    this.underlineButton = this._getById("underlineButton");

    /** The toolbar remove text styling button. */
    this.removeStylingButton = this._getById("removeStylingButton");
    /** The remove text styling menu item. */
    this.removeStylingMenuItem = this._getById("removeStylesMenuitem");

    this.messageEditor = this._getById("messageEditor");
    /** The Window of the message content. */
    this.messageWindow = this.messageEditor.contentWindow;
    /** The Document of the message content. */
    this.messageDocument = this.messageEditor.contentDocument;
    /** The Body of the message content. */
    this.messageBody = this.messageDocument.body;

    const styleDataMap = new Map([
      ["bold", { tag: "B" }],
      ["italic", { tag: "I" }],
      ["underline", { tag: "U" }],
      ["strikethrough", { tag: "STRIKE" }],
      ["superscript", { tag: "SUP" }],
      ["subscript", { tag: "SUB" }],
      ["tt", { tag: "TT" }],
      // ["nobreak", { tag: "NOBR" }], // Broken after bug 1806330. Why?
      ["em", { tag: "EM", linked: "italic" }],
      ["strong", { tag: "STRONG", linked: "bold" }],
      ["cite", { tag: "CITE", implies: "italic" }],
      ["abbr", { tag: "ABBR" }],
      ["acronym", { tag: "ACRONYM" }],
      ["code", { tag: "CODE", implies: "tt" }],
      ["samp", { tag: "SAMP", implies: "tt" }],
      ["var", { tag: "VAR", implies: "italic" }],
    ]);
    styleDataMap.forEach((data, name) => {
      data.item = this.getStyleMenuItem(name);
      data.name = name;
    });
    styleDataMap.forEach((data, name, map) => {
      // Reference the object rather than the name.
      if (data.linked) {
        data.linked = map.get(data.linked);
        Assert.ok(data.linked, `Found linked for ${name}`);
      }
      if (data.implies) {
        data.implies = map.get(data.implies);
        Assert.ok(data.implies, `Found implies for ${name}`);
      }
    });

    /**
     * @typedef {object} StyleData
     * @property {string} name - The style name.
     * @property {string} tag - The tagName for the corresponding HTML element.
     * @property {MozMenuItem} item - The corresponding menu item in the
     *   styleMenu.
     * @property {StyleData} [linked] - The style that is linked to this style.
     *   If this style is set, the linked style is shown as also set. If the
     *   linked style is unset, so is this style.
     * @property {StyleData} [implies] - The style that is implied by this
     *   style. If this style is set, the implied style is shown as also set.
     */

    /**
     * Data for the various text styles. Maps from the style name to its data.
     *
     * @type {Map<string, StyleData>}
     */
    this.styleDataMap = styleDataMap;

    /**
     * A list of common font families available in Thunderbird. Excludes the
     * Variable Width ("") and Fixed Width ("monospace") fonts.
     *
     * @type {[string]}
     */
    this.commonFonts = [
      "Helvetica, Arial, sans-serif",
      "Times New Roman, Times, serif",
      "Courier New, Courier, monospace",
    ];

    /** The default font size that corresponds to no <font> being applied. */
    this.NO_SIZE = 3;
    /** The maximum font size. */
    this.MAX_SIZE = 6;
    /** The minimum font size. */
    this.MIN_SIZE = 1;
  }

  _getById(id) {
    return this.window.document.getElementById(id);
  }

  /**
   * Move focus to the message area. The message needs to be focused for most
   * of the interactive methods to work.
   */
  focusMessage() {
    EventUtils.synthesizeMouseAtCenter(this.messageEditor, {}, this.window);
  }

  /**
   * Type some text into the message area.
   *
   * @param {string} text - A string of printable characters to type.
   */
  async typeInMessage(text) {
    EventUtils.sendString(text, this.messageWindow);
    // Wait one loop to be similar to a user.
    await TestUtils.waitForTick();
  }

  /**
   * Simulate pressing enter/return in the message area.
   *
   * @param {boolean} [shift = false] - Whether to hold shift at the same time.
   */
  async typeEnterInMessage(shift = false) {
    EventUtils.synthesizeKey(
      "VK_RETURN",
      { shiftKey: shift },
      this.messageWindow
    );
    await TestUtils.waitForTick();
  }

  /**
   * Delete the current selection in the message window (using backspace).
   */
  async deleteSelection() {
    EventUtils.synthesizeKey("VK_BACK_SPACE", {}, this.messageWindow);
    await TestUtils.waitForTick();
  }

  /**
   * Select the entire message.
   */
  async selectAll() {
    const selection = this.messageWindow.getSelection();
    selection.removeAllRanges();

    const changePromise = BrowserTestUtils.waitForEvent(
      this.messageDocument,
      "selectionchange"
    );

    selection.selectAllChildren(this.messageDocument.body);

    await changePromise;
  }

  /**
   * Select the first paragraph in the message.
   */
  async selectFirstParagraph() {
    const selection = this.messageWindow.getSelection();
    selection.removeAllRanges();

    const changePromise = BrowserTestUtils.waitForEvent(
      this.messageDocument,
      "selectionchange"
    );

    const paragraph = this.messageDocument.body.querySelector("p");
    Assert.ok(paragraph, "Have at least one paragraph");
    selection.selectAllChildren(paragraph);

    await changePromise;
  }

  /**
   * Delete the entire message.
   *
   * Note, this currently deletes the paragraph state (see Bug 1715076).
   */
  async deleteAll() {
    await this.selectAll();
    await this.deleteSelection();
  }

  /**
   * Empty the message paragraph.
   */
  async emptyParagraph() {
    await this.selectFirstParagraph();
    await this.deleteSelection();
    const p = this.messageDocument.body.querySelector("p");
    Assert.equal(p.textContent, "", "should have emptied p");
  }

  /**
   * Tags that correspond to inline styling (in upper case).
   *
   * @type {[string]}
   */
  static inlineStyleTags = [
    "B",
    "I",
    "U",
    "STRIKE",
    "SUP",
    "SUB",
    "TT",
    "NOBR",
    "EM",
    "STRONG",
    "CITE",
    "ABBR",
    "ACRONYM",
    "CODE",
    "SAMP",
    "VAR",
  ];
  /**
   * Tags that correspond to block scopes (in upper case).
   *
   * @type {[string]}
   */
  static blockTags = [
    "P",
    "PRE",
    "ADDRESS",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
  ];

  /**
   * @param {Node} node - The node to test.
   *
   * @returns {boolean} Whether the node is considered a block.
   */
  static isBlock(node) {
    return this.blockTags.includes(node.tagName);
  }

  /**
   * @param {Node} node - The node to test.
   *
   * @returns {boolean} Whether the node is considered inline styling.
   */
  static isInlineStyle(node) {
    return this.inlineStyleTags.includes(node.tagName);
  }

  /**
   * @param {Node} node - The node to test.
   *
   * @returns {boolean} Whether the node is considered a font node.
   */
  static isFont(node) {
    return node.tagName === "FONT";
  }

  /**
   * @param {Node} node - The node to test.
   *
   * @returns {boolean} Whether the node is considered a break.
   */
  static isBreak(node) {
    return node.tagName === "BR";
  }

  /**
   * A leaf of the message body. Actual leaves of the HTMLBodyElement will have
   * a corresponding Leaf (corresponding to the "break", "text" and "empty"
   * types), with the exception of empty block elements. These leaves are
   * ordered with respect to the corresponding childNode ordering. In addition,
   * every block element will have two corresponding leaves: one for the start
   * of the block ("block-start") that is ordered just before its children; and
   * one for the end of the block ("block-end") that is ordered just after its
   * children. Essentially, you can think of the opening and closing tags of the
   * block as leaves of the message body.
   *
   * @typedef Leaf
   * @property {"break"|"block-start"|"block-end"|"text"|"empty"} type -
   *   The leaf type.
   * @property {Node} node - The associated node in the document.
   */

  /**
   * Get the first leaf below the given node with respect to Leaf ordering.
   *
   * @param {Node} node - The node to fetch the first leaf of.
   *
   * @returns {Leaf} - The first leaf below the node.
   */
  static firstLeaf(node) {
    // @see https://github.com/eslint/eslint/issues/17807
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Starting the block scope.
      if (this.isBlock(node)) {
        return { type: "block-start", node };
      }
      const child = node.firstChild;
      if (child) {
        node = child;
      } else {
        break;
      }
    }
    if (Text.isInstance(node)) {
      return { type: "text", node };
    } else if (this.isBreak(node)) {
      return { type: "break", node };
    }
    return { type: "empty", node };
  }

  /**
   * Get the next Leaf that follows the given Leaf in the ordering.
   *
   * @param {Node} root - The root of the tree to find leaves from.
   * @param {Leaf} leaf - The leaf to search from.
   *
   * @returns {Leaf|null} - The next Leaf under the root that follows the given
   *   Leaf, or null if the given leaf was the last one.
   */
  static nextLeaf(root, leaf) {
    if (leaf.type === "block-start") {
      // Enter within the block scope.
      const child = leaf.node.firstChild;
      if (!child) {
        return { type: "block-end", node };
      }
      return this.firstLeaf(child);
    }
    // Find the next branch of the tree.
    let node = leaf.node;
    let sibling;
    // @see https://github.com/eslint/eslint/issues/17807
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (node === root) {
        return null;
      }
      // Move to the next branch, if there is one.
      sibling = node.nextSibling;
      if (sibling) {
        break;
      }
      // Otherwise, move back up the current branch.
      node = node.parentNode;
      // Leaving the block scope.
      if (this.isBlock(node)) {
        return { type: "block-end", node };
      }
    }
    // Travel to the first leaf of the branch.
    return this.firstLeaf(sibling);
  }

  /**
   * Select some text in the message body.
   *
   * Note, the start and end values refer to offsets from the start of the
   * message, and they count the spaces *between* string characters in the
   * message.
   *
   * A single newline will also count 1 towards the offset. This can refer to
   * either the start or end of a block (such as a <p>), or an explicit line
   * break (<br>). Note, as an exception, line breaks that do not produce a new
   * line visually (breaks at the end of a block, or breaks in the body scope
   * between a text node and the start of a block) do not count.
   *
   * You can either choose to select in a forward direction or a backward
   * direction. When no end parameter is given, this corresponds to if a user
   * approaches a position in the message by moving the text cursor forward or
   * backward (using the arrow keys). Otherwise, this refers to the direction in
   * which the selection was formed (using shift + arrow keys or dragging).
   *
   * @param {number} start - The position to start selecting from.
   * @param {number|null} [end = null] - The position to end selecting from,
   *   after start, or null to select the same position as the start.
   * @param {boolean} [forward = true] - Whether to select in the forward or
   *   backward direction.
   */
  async selectTextRange(start, end = null, forward = true) {
    const selectionTargets = [{ position: start }];
    if (end !== null) {
      Assert.ok(
        end >= start,
        `End of selection (${end}) should be after the start (${start})`
      );
      selectionTargets.push({ position: end });
    }

    const cls = this.constructor;
    const root = this.messageBody;
    let prevLeaf = null;
    let leaf = cls.firstLeaf(root);
    let total = 0;
    // NOTE: Only the leaves of the root will contribute to the total, which is
    // why we only need to traverse them.
    // Search the tree until we find the target nodes, or run out of leaves.
    while (leaf && selectionTargets.some(target => !target.node)) {
      // Look ahead at the next leaf.
      const nextLeaf = cls.nextLeaf(root, leaf);
      switch (leaf.type) {
        case "text": {
          // Each character in the text content counts towards the total.
          const textLength = leaf.node.textContent.length;
          total += textLength;

          for (const target of selectionTargets) {
            if (target.node) {
              continue;
            }
            if (total === target.position) {
              // If the next leaf is a text node, then the start of the
              //   selection is between the end of this node and the start of
              //   the next node. If selecting forward, we prefer the end of the
              //   first node. Otherwise, we prefer the start of the next node.
              // If the next node is not a text node (such as a break or the end
              // of a block), we end at the current node.
              if (forward || nextLeaf?.type !== "text") {
                target.node = leaf.node;
                target.offset = textLength;
              }
              // Else, let the next (text) leaf set the node and offset.
            } else if (total > target.position) {
              target.node = leaf.node;
              // Difference between the selection start and the start of the
              // node.
              target.offset = target.position - total + textLength;
            }
          }
          break;
        }
        case "block-start": {
          // Block start is a newline if the previous leaf was a text node in
          // the body scope.
          // Note that it is sufficient to test if the previous leaf was a text
          // node, because if such a text node was not in the body scope we
          // would have visited "block-end" in-between.
          // If the body scope ended in a break we would have already have a
          // newline, so there is no need to double count it.
          if (prevLeaf?.type === "text") {
            // If the total was already equal to a target.position, then the
            // previous text node would have handled it in the
            //   (total === target.position)
            // case above.
            // So we can safely increase the total and let the next leaf handle
            // it.
            total += 1;
          }
          break;
        }
        case "block-end": {
          // Only create a newline if non-empty.
          if (prevLeaf?.type !== "block-start") {
            for (const target of selectionTargets) {
              if (!target.node && total === target.position) {
                // This should only happen for blocks that contain no text, such
                // as a block that only contains a break.
                target.node = leaf.node;
                target.offset = leaf.node.childNodes.length - 1;
              }
            }
            // Let the next leaf handle it.
            total += 1;
          }
          break;
        }
        case "break": {
          // Only counts as a newline if it is not trailing in the body or block
          // scope.
          if (nextLeaf && nextLeaf.type !== "block-end") {
            for (const target of selectionTargets) {
              if (!target.node && total === target.position) {
                // This should only happen for breaks that are at the start of a
                // block.
                // The break has no content, so the parent is used as the
                // target.
                const parentNode = leaf.node.parentNode;
                target.node = parentNode;
                let index = 0;
                while (parentNode[index] !== leaf.node) {
                  index += 1;
                }
                target.offset = index;
              }
            }
            total += 1;
          }
          break;
        }
        // Ignore type === "empty"
      }
      prevLeaf = leaf;
      leaf = nextLeaf;
    }

    Assert.ok(
      selectionTargets.every(target => target.node),
      `Found selection from ${start} to ${end === null ? start : end}`
    );

    // Clear the current selection.
    const selection = this.messageWindow.getSelection();
    selection.removeAllRanges();

    // Create the new one.
    const range = this.messageDocument.createRange();
    range.setStart(selectionTargets[0].node, selectionTargets[0].offset);
    if (end !== null) {
      range.setEnd(selectionTargets[1].node, selectionTargets[1].offset);
    } else {
      range.setEnd(selectionTargets[0].node, selectionTargets[0].offset);
    }

    const changePromise = BrowserTestUtils.waitForEvent(
      this.messageDocument,
      "selectionchange"
    );
    selection.addRange(range);

    await changePromise;
  }

  /**
   * Select the given text and delete it. See selectTextRange to know how to set
   * the parameters.
   *
   * @param {number} start - The position to start selecting from.
   * @param {number} end - The position to end selecting from, after start.
   */
  async deleteTextRange(start, end) {
    await this.selectTextRange(start, end);
    await this.deleteSelection();
  }

  /**
   * @typedef BlockSummary
   * @property {string} block - The tag name of the node.
   * @property {(StyledTextSummary|string)[]} content - The regions of styled
   *   text content, ordered the same as in the document structure. String
   *   entries are equivalent to StyledTextSummary object with no set styling
   *   properties.
   */

  /**
   * @typedef StyledTextSummary
   * @property {string} text - The text for this region.
   * @property {Set<string>} [tags] - The tags applied to this region, if any.
   *   When passing in an object, you can use an Array of strings instead, which
   *   will be converted into a Set when needed.
   * @property {string} [font] - The font family applied to this region, if any.
   * @property {number} [size] - The font size applied to this region, if any.
   * @property {string} [color] - The font color applied to this region, if any.
   */

  /**
   * Test if the two sets of tags are equal. undefined tags count as an empty
   * set.
   *
   * @param {Set<string>|undefined} tags - A set of tags.
   * @param {Set<string>|undefined} cmp - A set to compare against.
   *
   * @returns {boolean} - Whether the two sets are equal.
   */
  static equalTags(tags, cmp) {
    if (!tags || tags.size === 0) {
      return !cmp || cmp.size === 0;
    }
    if (!cmp) {
      return false;
    }
    if (tags.size !== cmp.size) {
      return false;
    }
    for (const t of tags) {
      if (!cmp.has(t)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get a summary of the message body content.
   *
   * Note that the summary will exclude break nodes that do not produce a
   * newline. That is break nodes between a text node and either:
   * + the end of the body,
   * + the start of a block, or
   * + the end of a block.
   *
   * @returns {(BlockSummary|StyledTextSummary)[]} - A summary of the body
   *   content.
   */
  getMessageBodyContent() {
    const cls = this.constructor;
    const bodyNode = this.messageBody;
    const bodyContent = [];
    let blockNode = null;
    let blockContent = null;
    let prevLeaf = null;
    let leaf = cls.firstLeaf(bodyNode);
    // NOTE: Only the leaves of the body will contribute to the content, which
    // is why we only need to traverse them.
    while (leaf) {
      // Look ahead at the next leaf.
      const nextLeaf = cls.nextLeaf(bodyNode, leaf);
      const isText = leaf.type === "text";
      const isBreak = leaf.type === "break";
      const isEmpty = leaf.type === "empty";
      // Ignore a break node between a text node and either:
      // + the end of the body,
      // + the start of a block, or
      // + the end of a block.
      const ignoreBreak =
        prevLeaf?.type === "text" &&
        (!nextLeaf ||
          nextLeaf.type === "block-start" ||
          nextLeaf.type === "block-end");
      if (leaf.type === "block-start") {
        if (blockNode) {
          throw new Error(
            `Unexpected ${leaf.node.tagName} within a ${blockNode.tagName}`
          );
        }
        // Set the block to add content to.
        const block = { block: leaf.node.tagName, content: [] };
        blockNode = leaf.node;
        blockContent = block.content;
        // Add to the content of the body.
        bodyContent.push(block);
      } else if (leaf.type === "block-end") {
        if (!blockNode) {
          throw new Error(`Unexpected block end for ${leaf.node.tagName}`);
        }
        // Remove the block to add content to.
        blockNode = null;
        blockContent = null;
      } else if (isText || isEmpty || (isBreak && !ignoreBreak)) {
        let tags;
        let font;
        let size;
        let color;
        const ancestorBlock = blockNode || bodyNode;
        for (
          // If empty, then we include the styling of the empty element.
          let ancestor = isEmpty ? leaf.node : leaf.node.parentNode;
          ancestor !== ancestorBlock;
          ancestor = ancestor.parentNode
        ) {
          if (cls.isInlineStyle(ancestor)) {
            if (!tags) {
              tags = new Set();
            }
            tags.add(ancestor.tagName);
          } else if (cls.isFont(ancestor)) {
            // Prefer attributes from closest <font> ancestor.
            if (font === undefined && ancestor.hasAttribute("face")) {
              font = ancestor.getAttribute("face");
            }
            if (size === undefined && ancestor.hasAttribute("size")) {
              size = Number(ancestor.getAttribute("size"));
            }
            if (color === undefined && ancestor.hasAttribute("color")) {
              color = ancestor.getAttribute("color");
            }
          } else {
            throw new Error(`Unknown format element ${ancestor.tagName}`);
          }
        }
        let text;
        if (isBreak) {
          text = "<BR>";
        } else if (isText) {
          text = leaf.node.textContent;
        } else {
          // Empty styling elements.
          text = "";
        }

        const content = blockContent || bodyContent;
        let merged = false;
        if (content.length) {
          const prevSummary = content[content.length - 1];
          // NOTE: prevSummary may be a block if this leaf lives in the body
          // scope. We don't merge in that case.
          if (
            !prevSummary.block &&
            cls.equalTags(prevSummary.tags, tags) &&
            prevSummary.font === font &&
            prevSummary.size === size &&
            prevSummary.color === color
          ) {
            // Merge into the previous text if this region has the same text
            // tags applied to it.
            prevSummary.text += text;
            merged = true;
          }
        }
        if (!merged) {
          const summary = { text };
          summary.tags = tags;
          summary.font = font;
          summary.size = size;
          summary.color = color;
          content.push(summary);
        }
      }
      prevLeaf = leaf;
      leaf = nextLeaf;
    }

    if (blockNode) {
      throw new Error(`Unexpected end of body within a ${blockNode.tagName}`);
    }

    return bodyContent;
  }

  /**
   * Test that the current message body matches the given content.
   *
   * Note that the test is performed against a simplified version of the message
   * body, where adjacent equivalent styling tags are merged together, and <BR>
   * elements that do not produce a newline are ignored (see
   * {@link FormatHelper#getMessageBodyContent}). This is to capture what the
   * message would appear as to a user, rather than the exact details of the
   * document structure.
   *
   * To represent breaks between text regions, simply include a "<BR>" in the
   * expected text string. As such, the test cannot distinguish between a "<BR>"
   * textContent and a break element, so do not use "<BR>" within the typed text
   * of the message.
   *
   * @param {(BlockSummary|StyledTextSummary|string)[]} content - The expected
   *   content, ordered the same as in the document structure. BlockSummary
   *   objects represent blocks, and will have their own content.
   *   StyledTextSummary objects represent styled text directly in the body
   *   scope, and string objects represent un-styled text directly in the body
   *   scope.
   * @param {string} assertMessage - A description of the test.
   */
  assertMessageBodyContent(content, assertMessage) {
    const cls = this.constructor;

    function message(messageText, below, index) {
      return `${messageText} (at index ${index} below ${below})`;
    }

    function getDifference(node, expect, below, index) {
      if (typeof expect === "string") {
        expect = { text: expect };
      }
      if (expect.text !== undefined) {
        // StyledTextSummary
        if (node.text === undefined) {
          return message("Is not a (styled) text region", below, index);
        }
        if (node.text !== expect.text) {
          return message(
            `Different text "${node.text}" vs "${expect.text}"`,
            below,
            index
          );
        }
        if (Array.isArray(expect.tags)) {
          expect.tags = new Set(expect.tags);
        }
        if (!cls.equalTags(node.tags, expect.tags)) {
          function tagsToString(tags) {
            if (!tags) {
              return "NONE";
            }
            return Array.from(tags).join(",");
          }
          const have = tagsToString(node.tags);
          const wanted = tagsToString(expect.tags);
          return message(`Different tags ${have} vs ${wanted}`, below, index);
        }
        if (node.font !== expect.font) {
          return message(
            `Different font "${node.font}" vs "${expect.font}"`,
            below,
            index
          );
        }
        if (node.size !== expect.size) {
          return message(
            `Different size ${node.size} vs ${expect.size}`,
            below,
            index
          );
        }
        if (node.color !== expect.color) {
          return message(
            `Different color ${node.color} vs ${expect.color}`,
            below,
            index
          );
        }
        return null;
      } else if (expect.block !== undefined) {
        if (node.block === undefined) {
          return message("Is not a block", below, index);
        }
        if (node.block !== expect.block) {
          return message(
            `Different block names ${node.block} vs ${expect.block}`,
            below,
            index
          );
        }
        let i;
        for (i = 0; i < expect.content.length; i++) {
          if (i >= node.content.length) {
            return message("Missing child", node.block, i);
          }
          const childDiff = getDifference(
            node.content[i],
            expect.content[i],
            node.block,
            i
          );
          if (childDiff !== null) {
            return childDiff;
          }
        }
        if (i !== node.content.length) {
          let extra = "";
          for (; i < node.content.length; i++) {
            const child = node.content[i];
            if (child.text !== undefined) {
              extra += child.text;
            } else {
              extra += `<${child.block}/>`;
            }
          }
          return message(`Has extra children: ${extra}`, node.block, i);
        }
        return null;
      }
      throw new Error(message("Unrecognised object", below, index));
    }

    const expectBlock = { block: "BODY", content };
    const bodyBlock = { block: "BODY", content: this.getMessageBodyContent() };

    // We use a single Assert so that we can bail early if there is a
    // difference. Only show the first difference found.
    Assert.equal(
      getDifference(bodyBlock, expectBlock, "HTML", 0),
      null,
      `${assertMessage}: Should be no difference in body content: bodyblock=${JSON.stringify(
        bodyBlock,
        null,
        2
      )}`
    );
  }

  /**
   * For debugging, print the message body content, as produced by
   * {@link FormatHelper#getMessageBodyContent}.
   */
  dumpMessageBodyContent() {
    function printTextSummary(textSummary, indent = "") {
      let str = `${indent}<text`;
      for (const prop in textSummary) {
        let value = textSummary[prop];
        switch (prop) {
          case "text":
            continue;
          case "tags":
            value = value ? Array.from(value).join(",") : undefined;
            break;
        }
        if (value !== undefined) {
          str += ` ${prop}="${value}"`;
        }
      }
      str += `>${textSummary.text}</text>`;
      console.log(str);
    }

    function printBlockSummary(blockSummary) {
      console.log(`<${blockSummary.block}>`);
      for (const textSummary of blockSummary.content) {
        printTextSummary(textSummary, "  ");
      }
      console.log(`</${blockSummary.block}>`);
    }

    for (const summary of this.getMessageBodyContent()) {
      if (summary.block !== undefined) {
        printBlockSummary(summary);
      } else {
        printTextSummary(summary);
      }
    }
  }

  /**
   * Test that the message body contains a single paragraph block with the
   * given content. See {@link FormatHelper#assertMessageBodyContent}.
   *
   * @param {(StyledTextSummary|string)[]} content - The expected content of the
   *   paragraph.
   * @param {string} assertMessage - A description of the test.
   */
  assertMessageParagraph(content, assertMessage) {
    this.assertMessageBodyContent([{ block: "P", content }], assertMessage);
  }

  /**
   * Attempt to show a menu. The menu must be closed when calling.
   *
   * NOTE: this fails to open a native application menu on mac/osx because it is
   * handled and restricted by the OS.
   *
   * @param {MozMenuPopup} menu - The menu to show.
   *
   * @returns {boolean} Whether the menu was opened. Otherwise, the menu is still
   *   closed.
   */
  async _openMenuOnce(menu) {
    menu = menu.parentNode;
    // NOTE: Calling openMenu(true) on a closed menu will put the menu in the
    // "showing" state. But this can be cancelled (for some unknown reason) and
    // the menu will be put back in the "hidden" state. Therefore we listen to
    // both popupshown and popuphidden. See bug 1720174.
    // NOTE: This only seems to happen for some platforms, specifically this
    // sometimes occurs for the linux64 build on the try server.
    // FIXME: Use only BrowserEventUtils.waitForEvent(menu, "popupshown")
    const eventPromise = new Promise(resolve => {
      const listener = event => {
        menu.removeEventListener("popupshown", listener);
        menu.removeEventListener("popuphidden", listener);
        resolve(event.type);
      };
      menu.addEventListener("popupshown", listener);
      menu.addEventListener("popuphidden", listener);
    });
    menu.openMenu(true);
    const eventType = await eventPromise;
    return eventType == "popupshown";
  }

  /**
   * Show a menu. The menu must be closed when calling.
   *
   * @param {MozMenuPopup} menu - The menu to show.
   */
  async _openMenu(menu) {
    if (!(await this._openMenuOnce(menu))) {
      // If opening failed, try one more time. See bug 1720174.
      Assert.ok(
        await this._openMenuOnce(menu),
        `Opening ${menu.id} should succeed on a second attempt`
      );
    }
  }

  /**
   * Hide a menu. The menu must be open when calling.
   *
   * @param {MozMenuPopup} menu - The menu to hide.
   */
  async _closeMenu(menu) {
    menu = menu.parentNode;
    const hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
    menu.openMenu(false);
    await hiddenPromise;
  }

  /**
   * Select a menu item from an open menu. This will also close the menu.
   *
   * @param {MozMenuItem} item - The item to select.
   * @param {MozMenuPopup} menu - The open menu that the item belongs to.
   */
  async _selectFromOpenMenu(item, menu) {
    menu = menu.parentNode;
    const hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
    menu.menupopup.activateItem(item);
    await hiddenPromise;
  }

  /**
   * Open a menu, select one of its items and close the menu.
   *
   * @param {MozMenuItem} item - The item to select.
   * @param {MozMenuPopup} menu - The menu to open, that item belongs to.
   */
  async _selectFromClosedMenu(item, menu) {
    if (item.disabled) {
      await TestUtils.waitForCondition(
        () => !item.disabled,
        `Waiting for "${item.label}" to be enabled`
      );
    }
    await this._openMenu(menu);
    await this._selectFromOpenMenu(item, menu);
  }

  /**
   * Close the [Format menu]{@link FormatHelper#formatMenu}, without selecting
   * anything.
   *
   * Note, any open sub menus are also closed.
   *
   * Note, this method does not currently work on mac/osx because the Format
   * menu is part of the native application menu, which cannot be activated
   * through mochitests.
   */
  async closeFormatMenu() {
    // Closing format menu closes the sub menu.
    await this._closeMenu(this.formatMenu);
  }

  /**
   * Select an item directly below the
   * [Format menu]{@link FormatHelper#formatMenu}.
   *
   * Note, the Format menu must be closed before calling.
   *
   * Note, this method does not currently work on mac/osx because the Format
   * menu is part of the native application menu, which cannot be activated
   * through mochitests.
   *
   * @param {MozMenuItem} item - The item to select.
   */
  async selectFromFormatMenu(item) {
    await this._openMenu(this.formatMenu);
    await this._selectFromOpenMenu(item, this.formatMenu);
  }

  /**
   * Open the [Format menu]{@link FormatHelper#formatMenu} and open one of its
   * sub-menus, without selecting anything.
   *
   * Note, the Format menu must be closed before calling.
   *
   * Note, this method does not currently work on mac/osx because the Format
   * menu is part of the native application menu, which cannot be activated
   * through mochitests.
   *
   * @param {MozMenuPopup} menu - A closed menu below the Format menu to open.
   */
  async openFormatSubMenu(menu) {
    if (
      !(await this._openMenuOnce(this.formatMenu)) ||
      !(await this._openMenuOnce(menu))
    ) {
      // If opening failed, try one more time. See bug 1720174.
      // NOTE: failing to open the sub-menu can cause the format menu to also
      // close. But we still make sure the format menu is closed before trying
      // again.
      if (this.formatMenu.state == "open") {
        await this._closeMenu(this.formatMenu);
      }
      Assert.ok(
        await this._openMenuOnce(this.formatMenu),
        "Opening format menu should succeed on a second attempt"
      );
      Assert.ok(
        await this._openMenuOnce(menu),
        `Opening format sub-menu ${menu.id} should succeed on a second attempt`
      );
    }
  }

  /**
   * Select an item from a sub-menu of the
   * [Format menu]{@link FormatHelper#formatMenu}. The menu is opened before
   * selecting.
   *
   * Note, the Format menu must be closed before calling.
   *
   * Note, this method does not currently work on mac/osx because the Format
   * menu is part of the native application menu, which cannot be activated
   * through mochitests.
   *
   * @param {MozMenuItem} item - The item to select.
   * @param {MozMenuPopup} menu - The Format sub-menu that the item belongs to.
   */
  async selectFromFormatSubMenu(item, menu) {
    if (item.disabled) {
      await TestUtils.waitForCondition(
        () => !item.disabled,
        `Waiting for "${item.label}" to be enabled`
      );
    }
    await this.openFormatSubMenu(menu);
    const hiddenPromise = BrowserTestUtils.waitForEvent(
      this.formatMenu,
      "popuphidden"
    );
    // Selecting from the submenu also closes the parent menu.
    await this._selectFromOpenMenu(item, menu);
    await hiddenPromise;
  }

  /**
   * Run a test with the format sub menu open. Before each test attempt, the
   * [Format menu]{@link FormatHelper#formatMenu} is opened and so is the given
   * sub-menu. After each attempt, the menu is closed.
   *
   * Note, the Format menu must be closed before calling.
   *
   * Note, this method does not currently work on mac/osx.
   *
   * @param {MozMenuPopup} menu - A closed menu below the Format menu to open.
   * @param {Function} test - A test to run, without arguments, when the menu is
   *   open. Should return a truthy value on success.
   * @param {string} message - The message to use when asserting the success of
   *   the test.
   * @param {boolean} [wait] - Whether to retry until the test passes.
   */
  async assertWithFormatSubMenu(menu, test, message, wait = false) {
    const performTest = async () => {
      await this.openFormatSubMenu(menu);
      const pass = test();
      await this.closeFormatMenu();
      return pass;
    };
    if (wait) {
      await TestUtils.waitForCondition(performTest, message);
    } else {
      Assert.ok(await performTest(), message);
    }
  }

  /**
   * Select a paragraph state for the editor, using toolbar selector.
   *
   * @param {string} state - The state to select.
   */
  async selectParagraphState(state) {
    await this._selectFromClosedMenu(
      this.paragraphStateSelectorMenu.querySelector(
        `menuitem[value="${state}"]`
      ),
      this.paragraphStateSelectorMenu
    );
  }

  /**
   * Get the menu item corresponding to the given state, that lives in the
   * [Paragraph sub-menu]{@link FormatHelper#paragraphStateMenu} below the
   * Format menu.
   *
   * @param {string} state - A state.
   *
   * @returns {MozMenuItem} - The menu item used for selecting the given state.
   */
  getParagraphStateMenuItem(state) {
    return this.paragraphStateMenu.querySelector(`menuitem[value="${state}"]`);
  }

  /**
   * Assert that the editor UI (eventually) shows the given paragraph state.
   *
   * Note, this method does not currently work on mac/osx.
   *
   * @param {string|null} state - The expected paragraph state, or null if the
   *   state should be shown as mixed.
   * @param {string} message - A message to use in assertions.
   */
  async assertShownParagraphState(state, message) {
    if (state === null) {
      // In mixed state.
      // getAttribute("value") currently returns "", rather than null, so test
      // for hasAttribute instead.
      await TestUtils.waitForCondition(
        () => !this.paragraphStateSelector.hasAttribute("value"),
        `${message}: Selector has no value`
      );
    } else {
      await TestUtils.waitForCondition(
        () => this.paragraphStateSelector.value === state,
        `${message}: Selector has the value "${state}"`
      );
    }

    await this.assertWithFormatSubMenu(
      this.paragraphStateMenu,
      () =>
        this.paragraphStateMenuItems.every(
          item =>
            (item.getAttribute("checked") === "true") === (item.value === state)
        ),
      `${message}: Only state="${state}" menu item should be checked`
    );
  }

  /**
   * Select a font family for the editor, using the toolbar selector.
   *
   * @param {string} font - The font family to select.
   */
  async selectFont(font) {
    await this._selectFromClosedMenu(
      this.fontSelectorMenu.querySelector(`menuitem[value="${font}"]`),
      this.fontSelectorMenu
    );
  }

  /**
   * Get the menu item corresponding to the given font family, that lives in
   * the [Font sub-menu]{@link FormatHelper#fontMenu} below the Format menu.
   *
   * @param {string} font - A font family.
   *
   * @returns {MozMenuItem} - The menu item used for selecting the given font
   *   family.
   */
  getFontMenuItem(font) {
    return this.fontMenu.querySelector(`menuitem[value="${font}"]`);
  }

  /**
   * Assert that the editor UI (eventually) shows the given font family.
   *
   * Note, this method does not currently work on mac/osx.
   *
   * @param {string|null} font - The expected font family, or null if the state
   *   should be shown as mixed.
   * @param {string} message - A message to use in assertions.
   */
  async assertShownFont(font, message) {
    if (font === null) {
      // In mixed state.
      // getAttribute("value") currently returns "", rather than null, so test
      // for hasAttribute instead.
      await TestUtils.waitForCondition(
        () => !this.fontSelector.hasAttribute("value"),
        `${message}: Selector has no value`
      );
    } else {
      await TestUtils.waitForCondition(
        () => this.fontSelector.value === font,
        `${message}: Selector value is "${font}"`
      );
    }

    await this.assertWithFormatSubMenu(
      this.fontMenu,
      () =>
        this.fontMenuItems.every(
          item =>
            (item.getAttribute("checked") === "true") === (item.value === font)
        ),
      `${message}: Only font="${font}" menu item should be checked`
    );
  }

  /**
   * Select a font size for the editor, using the toolbar selector.
   *
   * @param {number} size - The font size to select.
   */
  async selectSize(size) {
    await this._selectFromClosedMenu(
      this.sizeSelectorMenu.querySelector(`menuitem[value="${size}"]`),
      this.sizeSelectorMenu
    );
  }

  /**
   * Assert that the editor UI (eventually) shows the given font size.
   *
   * Note, this method does not currently work on mac/osx.
   *
   * @param {number|null} size - The expected font size, or null if the state
   *   should be shown as mixed.
   * @param {string} message - A message to use in assertions.
   */
  async assertShownSize(size, message) {
    size = size?.toString();
    // Test in Format Menu.
    await this.assertWithFormatSubMenu(
      this.sizeMenu,
      () =>
        this.sizeMenuItems.every(
          item =>
            (item.getAttribute("checked") === "true") === (item.value === size)
        ),
      `${message}: Only size=${size} Format menu item should be checked`
      // Don't have to wait for size menu.
    );
    // Test the same in the Toolbar selector.
    await this._openMenu(this.sizeSelectorMenu);
    Assert.ok(
      this.sizeSelectorMenuItems.every(
        item =>
          (item.getAttribute("checked") === "true") === (item.value === size)
      ),
      `${message}: Only size=${size} Toolbar menu item should be checked`
    );
    await this._closeMenu(this.sizeSelectorMenu);
  }

  /**
   * Get the menu item corresponding to the given font size, that lives in
   * the [Size sub-menu]{@link FormatHelper#sizeMenu} below the Format menu.
   *
   * @param {number} size - A font size.
   *
   * @returns {MozMenuItem} - The menu item used for selecting the given font
   *   size.
   */
  getSizeMenuItem(size) {
    return this.sizeMenu.querySelector(`menuitem[value="${size}"]`);
  }

  /**
   * Select the given color when the color picker dialog is opened.
   *
   * Note, the dialog will have to be opened separately to this method. Normally
   * after this method, but before awaiting on the promise.
   *
   * @param {string|null} color - The color to choose, or null to choose the default.
   *
   * @returns {Promise} - The promise to await on once the dialog is triggered.
   */
  async selectColorInDialog(color) {
    return BrowserTestUtils.promiseAlertDialog(
      null,
      "chrome://messenger/content/messengercompose/EdColorPicker.xhtml",
      {
        callback: async win => {
          if (color === null) {
            win.document.getElementById("DefaultColorButton").click();
          } else {
            win.document.getElementById("ColorInput").value = color;
          }
          win.document.querySelector("dialog").getButton("accept").click();
        },
      }
    );
  }

  /**
   * Select a font color for the editor, using the toolbar selector.
   *
   * @param {string} color - The font color to select.
   */
  async selectColor(color) {
    const selector = this.selectColorInDialog(color);
    this.colorSelector.click();
    await selector;
  }

  /**
   * Assert that the editor UI (eventually) shows the given font color.
   *
   * @param {{value: string, rgb: [number]}|""|null} color - The expected font
   *   color. You should supply both the value, as set in the test, and its
   *   corresponding RGB numbers. Alternatively, give "" to assert the default
   *   color, or null to assert that the font color is shown as mixed.
   * @param {string} message - A message to use in assertions.
   */
  async assertShownColor(color, message) {
    if (color === "") {
      color = { value: "", rgb: [0, 0, 0] };
    }

    const rgbRegex = /^rgb\(([0-9]+), ([0-9]+), ([0-9]+)\)$/;
    const testOnce = foundColor => {
      if (color === null) {
        return foundColor === "mixed";
      }
      // color can either be the value or an rgb.
      let foundRgb = rgbRegex.exec(foundColor);
      if (foundRgb) {
        foundRgb = foundRgb.slice(1).map(s => Number(s));
        return (
          foundRgb[0] === color.rgb[0] &&
          foundRgb[1] === color.rgb[1] &&
          foundRgb[2] === color.rgb[2]
        );
      }
      return foundColor === color.value;
    };

    const name = color === null ? '"mixed"' : `"${color.value}"`;
    let foundColor = this.colorSelector.getAttribute("color");
    if (testOnce(foundColor)) {
      Assert.ok(
        true,
        `${message}: Found color "${foundColor}" should match ${name}`
      );
      return;
    }
    await TestUtils.waitForCondition(() => {
      const colorNow = this.colorSelector.getAttribute("color");
      if (colorNow !== foundColor) {
        foundColor = colorNow;
        return true;
      }
      return false;
    }, `${message}: Waiting for the color to change from ${foundColor}`);
    Assert.ok(
      testOnce(foundColor),
      `${message}: Changed color "${foundColor}" should match ${name}`
    );
  }

  /**
   * Get the menu item corresponding to the given style, that lives in the
   * [Text Style sub-menu]{@link FormatHelper#styleMenu} below the Format menu.
   *
   * @param {string} style - A style.
   *
   * @returns {MozMenuItem} - The menu item used for selecting the given style.
   */
  getStyleMenuItem(style) {
    return this.styleMenu.querySelector(`menuitem[observes="cmd_${style}"]`);
  }

  /**
   * Select the given style from the [Style menu]{@link FormatHelper#styleMenu}.
   *
   * Note, this method does not currently work on mac/osx.
   *
   * @param {StyleData} styleData - The style data for the style to select.
   */
  async selectStyle(styleData) {
    await this.selectFromFormatSubMenu(styleData.item, this.styleMenu);
  }

  /**
   * Assert that the editor UI (eventually) shows the given text styles.
   *
   * Note, this method does not currently work on mac/osx.
   *
   * Implied styles (see {@link StyleData#linked} and {@linj StyleData#implies})
   * will be automatically checked for from the given styles.
   *
   * @param {[(StyleData|string)]|StyleData|string|null} styleSet - The styles
   *   to assert as shown. If none should be shown, given null. Otherwise,
   *   styles can either be specified by their style name (as used in
   *   {@link FormatHelper#styleDataMap}) or by the style data directly. Either
   *   an array of styles can be passed, or a single style.
   * @param {string} message - A message to use in assertions.
   */
  async assertShownStyles(styleSet, message) {
    const expectItems = [];
    let expectString;
    let isBold = false;
    let isItalic = false;
    let isUnderline = false;
    if (styleSet) {
      expectString = "Only ";
      let first = true;
      const addSingleStyle = data => {
        if (!data) {
          return;
        }
        isBold = isBold || data.name === "bold";
        isItalic = isItalic || data.name === "italic";
        isUnderline = isUnderline || data.name === "underline";
        expectItems.push(data.item);
        if (first) {
          first = false;
        } else {
          expectString += ", ";
        }
        expectString += data.name;
      };
      const addStyle = style => {
        if (typeof style === "string") {
          style = this.styleDataMap.get(style);
        }
        addSingleStyle(style);
        addSingleStyle(style.linked);
        addSingleStyle(style.implies);
      };

      if (Array.isArray(styleSet)) {
        styleSet.forEach(style => addStyle(style));
      } else {
        addStyle(styleSet);
      }
    } else {
      expectString = "None";
    }
    await this.assertWithFormatSubMenu(
      this.styleMenu,
      () => {
        const checkedIds = this.styleMenuItems
          .filter(i => i.getAttribute("checked") === "true")
          .map(m => m.id);
        if (expectItems.length != checkedIds.length) {
          dump(
            `Expected: ${expectItems.map(i => i.id)}, Actual: ${checkedIds}\n`
          );
        }
        return this.styleMenuItems.every(
          item =>
            (item.getAttribute("checked") === "true") ===
            expectItems.includes(item)
        );
      },
      `${message}: ${expectString} should be checked`,
      true
    );

    // Check the toolbar buttons.
    Assert.equal(
      this.boldButton.checked,
      isBold,
      `${message}: Bold button should be ${isBold ? "" : "un"}checked`
    );
    Assert.equal(
      this.italicButton.checked,
      isItalic,
      `${message}: Italic button should be ${isItalic ? "" : "un"}checked`
    );
    Assert.equal(
      this.underlineButton.checked,
      isUnderline,
      `${message}: Underline button should be ${isUnderline ? "" : "un"}checked`
    );
  }
}
