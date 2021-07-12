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
  "FormatHelper",
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
var { get_notification } = ChromeUtils.import(
  "resource://testing-common/mozmill/NotificationBoxHelpers.jsm"
);
var EventUtils = ChromeUtils.import(
  "resource://testing-common/mozmill/EventUtils.jsm"
);
var { TestUtils } = ChromeUtils.import(
  "resource://testing-common/TestUtils.jsm"
);
var { BrowserTestUtils } = ChromeUtils.import(
  "resource://testing-common/BrowserTestUtils.jsm"
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
  let box = get_notification(
    aController,
    "mail-notification-top",
    "draftMsgContent"
  );
  EventUtils.synthesizeMouseAtCenter(
    box.buttonContainer.firstElementChild,
    {},
    aController.window
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
  }
  aController.e("recipientsContainer").removeSelectedPills();
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

/**
 * Helper class for performing formatted editing on the composition message.
 */
class FormatHelper {
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

    this.messageEditor = this._getById("content-frame");
    /** The Window of the message content. */
    this.messageWindow = this.messageEditor.contentWindow;
    /** The Document of the message content. */
    this.messageDocument = this.messageEditor.contentDocument;
    /** The Body of the message content. */
    this.messageBody = this.messageDocument.body;

    let styleDataMap = new Map([
      ["bold", { tag: "B" }],
      ["italic", { tag: "I" }],
      ["underline", { tag: "U" }],
      ["strikethrough", { tag: "STRIKE" }],
      ["superscript", { tag: "SUP" }],
      ["subscript", { tag: "SUB" }],
      ["tt", { tag: "TT" }],
      ["nobreak", { tag: "NOBR" }],
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
     * @typedef StyleData
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
     * @type {Map<string, StyleData>}
     */
    this.styleDataMap = styleDataMap;

    /**
     * A list of common font families available in Thunderbird. Excludes the
     * Variable Width ("") and Fixed Width ("monospace") fonts.
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
    let selection = this.messageWindow.getSelection();
    selection.removeAllRanges();

    let changePromise = BrowserTestUtils.waitForEvent(
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
    let selection = this.messageWindow.getSelection();
    selection.removeAllRanges();

    let changePromise = BrowserTestUtils.waitForEvent(
      this.messageDocument,
      "selectionchange"
    );

    let paragraph = this.messageDocument.body.querySelector("p");
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
  }

  /**
   * Tags that correspond to inline styling (in upper case).
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
   * @return {boolean} Whether the node is considered a block.
   */
  static isBlock(node) {
    return this.blockTags.includes(node.tagName);
  }

  /**
   * @param {Node} node - The node to test.
   *
   * @return {boolean} Whether the node is considered inline styling.
   */
  static isInlineStyle(node) {
    return this.inlineStyleTags.includes(node.tagName);
  }

  /**
   * @param {Node} node - The node to test.
   *
   * @return {boolean} Whether the node is considered a font node.
   */
  static isFont(node) {
    return node.tagName === "FONT";
  }

  /**
   * @param {Node} node - The node to test.
   *
   * @return {boolean} Whether the node is considered a break.
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
   * @return {Leaf} - The first leaf below the node.
   */
  static firstLeaf(node) {
    while (true) {
      // Starting the block scope.
      if (this.isBlock(node)) {
        return { type: "block-start", node };
      }
      let child = node.firstChild;
      if (child) {
        node = child;
      } else {
        break;
      }
    }
    if (node instanceof Text) {
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
   * @return {Leaf|null} - The next Leaf under the root that follows the given
   *   Leaf, or null if the given leaf was the last one.
   */
  static nextLeaf(root, leaf) {
    if (leaf.type === "block-start") {
      // Enter within the block scope.
      let child = leaf.node.firstChild;
      if (!child) {
        return { type: "block-end", node };
      }
      return this.firstLeaf(child);
    }
    // Find the next branch of the tree.
    let node = leaf.node;
    let sibling;
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
    let selectionTargets = [{ position: start }];
    if (end !== null) {
      Assert.ok(
        end >= start,
        `End of selection (${end}) should be after the start (${start})`
      );
      selectionTargets.push({ position: end });
    }

    let cls = this.constructor;
    let root = this.messageBody;
    let prevLeaf = null;
    let leaf = cls.firstLeaf(root);
    let total = 0;
    // NOTE: Only the leaves of the root will contribute to the total, which is
    // why we only need to traverse them.
    // Search the tree until we find the target nodes, or run out of leaves.
    while (leaf && selectionTargets.some(target => !target.node)) {
      // Look ahead at the next leaf.
      let nextLeaf = cls.nextLeaf(root, leaf);
      switch (leaf.type) {
        case "text":
          // Each character in the text content counts towards the total.
          let textLength = leaf.node.textContent.length;
          total += textLength;

          for (let target of selectionTargets) {
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
        case "block-start":
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
        case "block-end":
          // Only create a newline if non-empty.
          if (prevLeaf?.type !== "block-start") {
            for (let target of selectionTargets) {
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
        case "break":
          // Only counts as a newline if it is not trailing in the body or block
          // scope.
          if (nextLeaf && nextLeaf.type !== "block-end") {
            for (let target of selectionTargets) {
              if (!target.node && total === target.position) {
                // This should only happen for breaks that are at the start of a
                // block.
                // The break has no content, so the parent is used as the
                // target.
                let parentNode = leaf.node.parentNode;
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
    let selection = this.messageWindow.getSelection();
    selection.removeAllRanges();

    // Create the new one.
    let range = this.messageDocument.createRange();
    range.setStart(selectionTargets[0].node, selectionTargets[0].offset);
    if (end !== null) {
      range.setEnd(selectionTargets[1].node, selectionTargets[1].offset);
    } else {
      range.setEnd(selectionTargets[0].node, selectionTargets[0].offset);
    }

    let changePromise = BrowserTestUtils.waitForEvent(
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
   * @return {boolean} - Whether the two sets are equal.
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
    for (let t of tags) {
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
   * @return {(BlockSummary|StyledTextSummary)[]} - A summary of the body
   *   content.
   */
  getMessageBodyContent() {
    let cls = this.constructor;
    let bodyNode = this.messageBody;
    let bodyContent = [];
    let blockNode = null;
    let blockContent = null;
    let prevLeaf = null;
    let leaf = cls.firstLeaf(bodyNode);
    // NOTE: Only the leaves of the body will contribute to the content, which
    // is why we only need to traverse them.
    while (leaf) {
      // Look ahead at the next leaf.
      let nextLeaf = cls.nextLeaf(bodyNode, leaf);
      let isText = leaf.type === "text";
      let isBreak = leaf.type === "break";
      let isEmpty = leaf.type === "empty";
      // Ignore a break node between a text node and either:
      // + the end of the body,
      // + the start of a block, or
      // + the end of a block.
      let ignoreBreak =
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
        let block = { block: leaf.node.tagName, content: [] };
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
        let ancestorBlock = blockNode || bodyNode;
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

        let content = blockContent || bodyContent;
        let merged = false;
        if (content.length) {
          let prevSummary = content[content.length - 1];
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
          let summary = { text };
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
    let cls = this.constructor;

    function message(message, below, index) {
      return `${message} (at index ${index} below ${below})`;
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
          let have = tagsToString(node.tags);
          let wanted = tagsToString(expect.tags);
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
          let childDiff = getDifference(
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
            let child = node.content[i];
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

    let expectBlock = { block: "BODY", content };
    let bodyBlock = { block: "BODY", content: this.getMessageBodyContent() };

    // We use a single Assert so that we can bail early if there is a
    // difference. Only show the first difference found.
    Assert.equal(
      getDifference(bodyBlock, expectBlock, "HTML", 0),
      null,
      `${assertMessage}: Should be no difference in body content`
    );
  }

  /**
   * For debugging, print the message body content, as produced by
   * {@link FormatHelper#getMessageBodyContent}.
   */
  dumpMessageBodyContent() {
    function printTextSummary(textSummary, indent = "") {
      let str = `${indent}<text`;
      for (let prop in textSummary) {
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
      for (let textSummary of blockSummary.content) {
        printTextSummary(textSummary, "  ");
      }
      console.log(`</${blockSummary.block}>`);
    }

    for (let summary of this.getMessageBodyContent()) {
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

  // NOTE: fails to open a native application menu on mac/osx because it is
  // handled and restricted by the OS.
  async _openMenu(menu) {
    menu = menu.parentNode;
    let shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
    menu.openMenu(true);
    await shownPromise;
  }

  async _closeMenu(menu) {
    menu = menu.parentNode;
    let hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
    menu.openMenu(false);
    await hiddenPromise;
  }

  async _selectFromOpenMenu(item, menu) {
    menu = menu.parentNode;
    let hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
    menu.menupopup.activateItem(item);
    await hiddenPromise;
  }

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
    await this._openMenu(this.formatMenu);
    await this._openMenu(menu);
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
    let hiddenPromise = BrowserTestUtils.waitForEvent(
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
    let performTest = async () => {
      await this.openFormatSubMenu(menu);
      let pass = test();
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
   * @return {MozMenuItem} - The menu item used for selecting the given state.
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
   * @return {MozMenuItem} - The menu item used for selecting the given font
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
   * @return {MozMenuItem} - The menu item used for selecting the given font
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
   * @prop {string|null} - The color to choose, or null to choose the default.
   *
   * @return {Promise} - The promise to await on once the dialog is triggered.
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
          win.document
            .querySelector("dialog")
            .getButton("accept")
            .click();
        },
      }
    );
  }

  /**
   * Select a font color for the editor, using the toolbar selector.
   *
   * @param {string} font - The font color to select.
   */
  async selectColor(color) {
    let selector = this.selectColorInDialog(color);
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

    let rgbRegex = /^rgb\(([0-9]+), ([0-9]+), ([0-9]+)\)$/;
    let testOnce = foundColor => {
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

    let name = color === null ? '"mixed"' : `"${color.value}"`;
    let foundColor = this.colorSelector.getAttribute("color");
    if (testOnce(foundColor)) {
      Assert.ok(
        true,
        `${message}: Found color "${foundColor}" should match ${name}`
      );
      return;
    }
    await TestUtils.waitForCondition(() => {
      let colorNow = this.colorSelector.getAttribute("color");
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
   * @return {MozMenuItem} - The menu item used for selecting the given style.
   */
  getStyleMenuItem(style) {
    return this.styleMenu.querySelector(`menuitem[observes="cmd_${style}"]`);
  }

  /**
   * Select the given style from the [Style menu]{@link FormatHelper#styleMenu}.
   *
   * Note, this method does not currently work on mac/osx.
   *
   * @param {StyleData} style - The style data for the style to select.
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
    let expectItems = [];
    let expectString;
    let isBold = false;
    let isItalic = false;
    let isUnderline = false;
    if (styleSet) {
      expectString = "Only ";
      let first = true;
      let addSingleStyle = data => {
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
      let addStyle = style => {
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
      () =>
        this.styleMenuItems.every(
          item =>
            (item.getAttribute("checked") === "true") ===
            expectItems.includes(item)
        ),
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
