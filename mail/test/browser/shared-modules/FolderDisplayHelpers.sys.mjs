/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";
import * as EventUtils from "resource://testing-common/mail/EventUtils.sys.mjs";
import {
  promise_new_window,
  wait_for_existing_window,
  wait_for_window_focused,
} from "resource://testing-common/mail/WindowHelpers.sys.mjs";

import { Assert } from "resource://testing-common/Assert.sys.mjs";
import { BrowserTestUtils } from "resource://testing-common/BrowserTestUtils.sys.mjs";
import { SmartMailboxUtils } from "resource:///modules/SmartMailboxUtils.sys.mjs";
import { TestUtils } from "resource://testing-common/TestUtils.sys.mjs";

import { MailConsts } from "resource:///modules/MailConsts.sys.mjs";
import { MailUtils } from "resource:///modules/MailUtils.sys.mjs";
import {
  MessageGenerator,
  MessageScenarioFactory,
  SyntheticMessageSet,
} from "resource://testing-common/mailnews/MessageGenerator.sys.mjs";
import { MessageInjection } from "resource://testing-common/mailnews/MessageInjection.sys.mjs";
import { SmimeUtils } from "resource://testing-common/mailnews/SmimeUtils.sys.mjs";
import { dump_view_state } from "resource://testing-common/mail/ViewHelpers.sys.mjs";

var nsMsgViewIndex_None = 0xffffffff;

/**
 * Server hostname as set in runtest.py
 */
export var FAKE_SERVER_HOSTNAME = "tinderbox123";

/**
 * The main 3-pane window.
 *
 * @type {Window}
 */
export var mc = wait_for_existing_window("mail:3pane");

export function set_mc(value) {
  mc = value;
}

/** the index of the current 'other' tab */
var otherTab;

export var msgGen = new MessageGenerator();
var msgGenFactory = new MessageScenarioFactory(msgGen);
var messageInjection = new MessageInjection({ mode: "local" }, msgGen);
export var inboxFolder = messageInjection.getInboxFolder();

// Default size of the main Thunderbird window in which the tests will run.
export var gDefaultWindowWidth = 1024;

export var gDefaultWindowHeight = 768;

export function get_about_3pane(win = mc) {
  const tabmail = win.document.getElementById("tabmail");
  if (tabmail?.currentTabInfo.mode.name == "mail3PaneTab") {
    return tabmail.currentAbout3Pane;
  }
  throw new Error("The current tab is not a mail3PaneTab.");
}

export function get_about_message(win = mc) {
  const doc = win.document;
  const tabmail = doc.getElementById("tabmail");
  if (tabmail?.currentTabInfo.mode.name == "mailMessageTab") {
    return tabmail.currentAboutMessage;
  } else if (tabmail?.currentTabInfo.mode.name == "mail3PaneTab") {
    // Not `currentAboutMessage`, we'll return a value even if it's hidden.
    return get_about_3pane(win).messageBrowser.contentWindow;
  } else if (
    doc.documentElement.getAttribute("windowtype") == "mail:messageWindow"
  ) {
    return doc.getElementById("messageBrowser").contentWindow;
  }
  throw new Error("The current tab is not a mail3PaneTab or mailMessageTab.");
}

function get_about_3pane_or_about_message(win = mc) {
  const doc = win.document;
  const tabmail = doc.getElementById("tabmail");
  if (
    tabmail &&
    ["mail3PaneTab", "mailMessageTab"].includes(
      tabmail.currentTabInfo.mode.name
    )
  ) {
    return tabmail.currentTabInfo.chromeBrowser.contentWindow;
  } else if (
    doc.documentElement.getAttribute("windowtype") == "mail:messageWindow"
  ) {
    return doc.getElementById("messageBrowser").contentWindow;
  }
  throw new Error("The current tab is not a mail3PaneTab or mailMessageTab.");
}

function get_db_view(win = mc) {
  return get_about_3pane_or_about_message(win).gDBView;
}

export function smimeUtils_ensureNSS() {
  SmimeUtils.ensureNSS();
}

export function smimeUtils_loadPEMCertificate(file, certType, loadKey = false) {
  SmimeUtils.loadPEMCertificate(file, certType, loadKey);
}

export function smimeUtils_loadCertificateAndKey(file, pw) {
  SmimeUtils.loadCertificateAndKey(file, pw);
}

/*
 * Although we all agree that the use of generators when dealing with async
 *  operations is awesome, the mozmill idiom is for calls to be synchronous and
 *  just spin event loops when they need to wait for things to happen.  This
 *  does make the test code significantly less confusing, so we do it too.
 * All of our operations are synchronous and just spin until they are happy.
 */

/**
 * Create a folder and rebuild the folder tree view.
 *
 * @param {string} aFolderName - A folder name with no support for hierarchy at this time.
 * @param {nsMsgFolderFlags} [aSpecialFlags] An optional list of nsMsgFolderFlags bits to set.
 * @returns {nsIMsgFolder}
 */
export async function create_folder(aFolderName, aSpecialFlags) {
  await wait_for_message_display_completion();

  const folder = await messageInjection.makeEmptyFolder(
    aFolderName,
    aSpecialFlags
  );
  return folder;
}

/**
 * Create a virtual folder by deferring to |MessageInjection.makeVirtualFolder| and making
 *  sure to rebuild the folder tree afterwards.
 *
 * @see MessageInjection.makeVirtualFolder
 * @returns {nsIMsgFolder}
 */
export function create_virtual_folder(...aArgs) {
  const folder = messageInjection.makeVirtualFolder(...aArgs);
  return folder;
}

/**
 * Get special folder having a folder flag under Local Folders.
 * This function clears the contents of the folder by default.
 *
 * @param {nsMsgFolderFlags} aFolderFlag - Folder flag of the required folder.
 * @param {boolean} aCreate - Create the folder if it does not exist yet.
 * @param {?nsIMsgIncomingServer} aServer - Create the folder if it does not exist yet.
 * @param {boolean} aEmpty - Set to false if messages from the folder must not be emptied.
 */
export async function get_special_folder(
  aFolderFlag,
  aCreate = false,
  aServer,
  aEmpty = true
) {
  const folderNames = new Map([
    [Ci.nsMsgFolderFlags.Drafts, "Drafts"],
    [Ci.nsMsgFolderFlags.Templates, "Templates"],
    [Ci.nsMsgFolderFlags.Queue, "Outbox"],
    [Ci.nsMsgFolderFlags.Inbox, "Inbox"],
  ]);

  let folder = (
    aServer ? aServer : MailServices.accounts.localFoldersServer
  ).rootFolder.getFolderWithFlags(aFolderFlag);

  if (!folder && aCreate) {
    folder = await create_folder(folderNames.get(aFolderFlag), [aFolderFlag]);
  }
  if (!folder) {
    throw new Error("Special folder not found");
  }

  // Ensure the folder is empty so that each test file can puts its new messages in it
  // and they are always at reliable positions (starting from 0).
  if (aEmpty) {
    await empty_folder(folder);
  }

  return folder;
}

/**
 * Create a thread with the specified number of messages in it.
 *
 * @param {number} aCount
 * @returns {SyntheticMessageSet}
 */
export function create_thread(aCount) {
  return new SyntheticMessageSet(msgGenFactory.directReply(aCount));
}

/**
 * Create and return a SyntheticMessage object.
 *
 * @param {MakeMessageOptions} aArgs An arguments object to be passed to
 *                                   MessageGenerator.makeMessage()
 * @returns {SyntheticMessage}
 */
export function create_message(aArgs) {
  return msgGen.makeMessage(aArgs);
}

/**
 * Adds a SyntheticMessage as a SyntheticMessageSet to a folder or folders.
 *
 * @see MessageInjection.addSetsToFolders
 * @param {nsIMsgFolder[]} aFolder
 * @param {SyntheticMessage} aMsg
 */
export async function add_message_to_folder(aFolder, aMsg) {
  await messageInjection.addSetsToFolders(aFolder, [
    new SyntheticMessageSet([aMsg]),
  ]);
}

/**
 * Adds SyntheticMessageSets to a folder or folders.
 *
 * @see MessageInjection.addSetsToFolders
 * @param {nsIMsgLocalMailFolder[]} aFolders
 * @param {SyntheticMessageSet[]} aMsg
 */
export async function add_message_sets_to_folders(aFolders, aMsg) {
  await messageInjection.addSetsToFolders(aFolders, aMsg);
}

/**
 * Makes SyntheticMessageSets in aFolders
 *
 * @param {nsIMsgFolder[]} aFolders
 * @param {MakeMessageOptions[]} aOptions
 * @returns {SyntheticMessageSet[]}
 */
export async function make_message_sets_in_folders(aFolders, aOptions) {
  return messageInjection.makeNewSetsInFolders(aFolders, aOptions);
}

/**
 * @param {SyntheticMessageSet} aSynMessageSet The set of messages
 *     to delete.  The messages do not all
 *     have to be in the same folder, but we have to delete them folder by
 *     folder if they are not.
 */
export async function delete_messages(aSynMessageSet) {
  await MessageInjection.deleteMessages(aSynMessageSet);
}

/**
 * Make sure we are entering the folder from not having been in the folder.  We
 *  will leave the folder and come back if we have to.
 */
export async function enter_folder(aFolder) {
  const win = get_about_3pane();

  // If we're already selected, go back to the root...
  if (win.gFolder == aFolder) {
    await enter_folder(aFolder.rootFolder);
  }

  const displayPromise = BrowserTestUtils.waitForEvent(win, "folderURIChanged");
  win.displayFolder(aFolder.URI);
  await displayPromise;

  // Drain the event queue.
  await TestUtils.waitForTick();
}

/**
 * Make sure we are in the given folder, entering it if we were not.
 *
 * @returns {TabInfo} The tab info of the current tab (a more persistent
 *   identifier for tabs than the index, which will change as tabs open/close).
 */
export async function be_in_folder(aFolder) {
  const win = get_about_3pane();
  if (win.gFolder != aFolder) {
    await enter_folder(aFolder);
  }
  return mc.document.getElementById("tabmail").currentTabInfo;
}

/**
 * Create a new tab displaying a folder, making that tab the current tab. This
 * does not wait for message completion, because it doesn't know whether a
 * message display will be triggered. If you know that a message display will be
 * triggered, you should follow this up with
 * |wait_for_message_display_completion(mc, true)|. If you know that a blank
 * pane should be displayed, you should follow this up with
 * |wait_for_blank_content_pane()| instead.
 *
 * @returns {TabInfo} The tab info of the current tab (a more persistent
 *    identifier for tabs than the index, which will change as tabs open/close).
 */
export async function open_folder_in_new_tab(aFolder) {
  otherTab = mc.document.getElementById("tabmail").currentTabInfo;

  const tab = mc.openTab("mail3PaneTab", { folderURI: aFolder.URI }, "tab");
  if (
    tab.chromeBrowser.docShell.isLoadingDocument ||
    tab.chromeBrowser.currentURI.spec != "about:3pane"
  ) {
    await BrowserTestUtils.browserLoaded(tab.chromeBrowser);
  }
  await TestUtils.waitForCondition(() => tab.folder == aFolder);

  return tab;
}

/**
 * Open a new mail:3pane window displaying a folder.
 *
 * @param {nsIMsgFolder} aFolder - The folder to be displayed in the new window.
 * @returns {Window} The new window.
 */
export async function open_folder_in_new_window(aFolder) {
  const newWindowPromise = promise_new_window("mail:3pane");
  mc.MsgOpenNewWindowForFolder(aFolder.URI);
  return newWindowPromise;
}

/**
 * Open the selected message(s) by pressing Enter. The mail.openMessageBehavior
 * pref is supposed to determine how the messages are opened.
 *
 * Since we don't know where this is going to trigger a message load, you're
 * going to have to wait for message display completion yourself.
 *
 * @param {Window} [win] - The window to do this in, the first window if omitted.
 */
export function open_selected_messages(win = mc) {
  // Focus the thread tree
  focus_thread_tree();
  // Open whatever's selected
  EventUtils.synthesizeKey("VK_RETURN", {}, win);
}

export var open_selected_message = open_selected_messages;

/**
 * Create a new tab displaying the currently selected message, making that tab
 *  the current tab.  We block until the message finishes loading.
 *
 * @param {boolean} [aBackground] - If true, then the tab is opened in the
 *   background. If false or not given, then the tab is opened in the foreground.
 *
 * @returns {TabInfo} The tab info of the new tab (a more persistent identifier
 *   for tabs than the index, which will change as tabs open/close).
 */
export async function open_selected_message_in_new_tab(aBackground) {
  // get the current tab count so we can make sure the tab actually opened.
  const preCount =
    mc.document.getElementById("tabmail").tabContainer.allTabs.length;

  // save the current tab as the 'other' tab
  otherTab = mc.document.getElementById("tabmail").currentTabInfo;

  const win = get_about_3pane();
  const message = win.gDBView.hdrForFirstSelectedMessage;
  const tab = mc.document.getElementById("tabmail").openTab("mailMessageTab", {
    messageURI: message.folder.getUriForMsg(message),
    viewWrapper: win.gViewWrapper,
    background: aBackground,
  });

  await BrowserTestUtils.waitForEvent(tab.chromeBrowser, "MsgLoaded");

  // check that the tab count increased
  if (
    mc.document.getElementById("tabmail").tabContainer.allTabs.length !=
    preCount + 1
  ) {
    throw new Error("The tab never actually got opened!");
  }

  return tab;
}

/**
 * Create a new window displaying the currently selected message.  We do not
 *  return until the message has finished loading.
 *
 * @returns {Window} The new window.
 */
export async function open_selected_message_in_new_window() {
  const win = get_about_3pane();
  const newWindowPromise = promise_new_window("mail:messageWindow");
  mc.MsgOpenNewWindowForMessage(
    win.gDBView.hdrForFirstSelectedMessage,
    win.gViewWrapper
  );
  const msgc = await newWindowPromise;
  await wait_for_message_display_completion(msgc, true);
  return msgc;
}

/**
 * Display the given message in a folder tab. This doesn't make any assumptions
 * about whether a new tab is opened, since that is dependent on a user
 * preference. However, we do check that the tab we're returning is a folder
 * tab.
 *
 * @param {nsIMsgDBHdr} aMsgHdr - The message header to display.
 * @param {boolean} [aExpectNew3Pane=false] - This should be set to true if it
 *   is expected that a new 3-pane window will be opened as a result of
 *   the API call.
 *
 * @returns {TabInfo} The currently selected tab, guaranteed to be a folder tab.
 */
export async function display_message_in_folder_tab(aMsgHdr, aExpectNew3Pane) {
  let newWindowPromise;
  if (aExpectNew3Pane) {
    newWindowPromise = promise_new_window("mail:3pane");
  }
  MailUtils.displayMessageInFolderTab(aMsgHdr);
  if (aExpectNew3Pane) {
    mc = await newWindowPromise;
  }

  // Make sure that the tab we're returning is a folder tab
  const currentTab = mc.document.getElementById("tabmail").currentTabInfo;
  assert_tab_mode_name(currentTab, "mail3PaneTab");

  return currentTab;
}

/**
 * Create a new window displaying a message loaded from a file.  We do not
 * return until the message has finished loading.
 *
 * @param {nsIFile} file - An nsIFile to load the message from.
 * @returns {Window} The new window.
 */
export async function open_message_from_file(file) {
  if (!file.isFile() || !file.isReadable()) {
    throw new Error(
      "The requested message file " +
        file.leafName +
        " was not found or is not accessible."
    );
  }

  let fileURL = Services.io.newFileURI(file).QueryInterface(Ci.nsIFileURL);
  fileURL = fileURL
    .mutate()
    .setQuery("type=application/x-message-display")
    .finalize();

  const newWindowPromise = promise_new_window("mail:messageWindow");
  const win = mc.openDialog(
    "chrome://messenger/content/messageWindow.xhtml",
    "_blank",
    "all,chrome,dialog=no,status,toolbar",
    fileURL
  );
  await BrowserTestUtils.waitForEvent(win, "load");
  const aboutMessage = get_about_message(win);
  await BrowserTestUtils.waitForEvent(aboutMessage, "MsgLoaded");

  const msgc = await newWindowPromise;
  await wait_for_message_display_completion(msgc, true);
  wait_for_window_focused(msgc);
  await TestUtils.waitForTick();

  return msgc;
}

/**
 * Switch to another folder or message tab.  If no tab is specified, we switch
 *  to the 'other' tab.  That is the last tab we used, most likely the tab that
 *  was current when we created this tab.
 *
 * @param {number} aNewTab - Optional, index of the other tab to switch to.
 */
export async function switch_tab(aNewTab) {
  if (typeof aNewTab == "number") {
    aNewTab = mc.document.getElementById("tabmail").tabInfo[aNewTab];
  }

  // If the new tab is the same as the current tab, none of the below applies.
  // Get out now.
  if (aNewTab == mc.document.getElementById("tabmail").currentTabInfo) {
    return;
  }

  const targetTab = aNewTab != null ? aNewTab : otherTab;
  // now the current tab will be the 'other' tab after we switch
  otherTab = mc.document.getElementById("tabmail").currentTabInfo;
  const selectPromise = BrowserTestUtils.waitForEvent(
    mc.document.getElementById("tabmail").tabContainer,
    "select"
  );
  mc.document.getElementById("tabmail").switchToTab(targetTab);
  await selectPromise;
}

/**
 * Assert that the currently selected tab is the given one.
 *
 * @param {TabInfo} aTab - The tab that should currently be selected.
 */
export function assert_selected_tab(aTab) {
  Assert.equal(mc.document.getElementById("tabmail").currentTabInfo, aTab);
}

/**
 * Assert that the currently selected tab is _not_ the given one.
 *
 * @param {TabInfo} aTab - The tab that should currently not be selected.
 */
export function assert_not_selected_tab(aTab) {
  Assert.notEqual(mc.document.getElementById("tabmail").currentTabInfo, aTab);
}

/**
 * Assert that the given tab has the given mode name. Valid mode names include
 * "message" and "folder".
 *
 * @param {?TabInfo} aTab - A Tab. The currently selected tab if null.
 * @param {string} aModeName - A string that should match the mode name of the tab.
 */
export function assert_tab_mode_name(aTab, aModeName) {
  if (!aTab) {
    aTab = mc.document.getElementById("tabmail").currentTabInfo;
  }

  Assert.equal(aTab.mode.name, aModeName, `Tab should be of type ${aModeName}`);
}

/**
 * Assert that the number of tabs open matches the value given.
 *
 * @param {integer} aNumber - The number of tabs that should be open.
 */
export function assert_number_of_tabs_open(aNumber) {
  const actualNumber =
    mc.document.getElementById("tabmail").tabContainer.allTabs.length;
  Assert.equal(actualNumber, aNumber, `There should be ${aNumber} tabs open`);
}

/**
 * Assert that the given tab's title is based on the provided folder or
 *  message.
 *
 * @param {TabInfo} aTab - A Tab.
 * @param {nsIMsgFolder|nsIMsgDBHdr} aWhat - Either an nsIMsgFolder or an nsIMsgDBHdr.
 */
export async function assert_tab_titled_from(aTab, aWhat) {
  let text;
  if (aWhat instanceof Ci.nsIMsgFolder) {
    text = aWhat.prettyName;
  } else if (aWhat instanceof Ci.nsIMsgDBHdr) {
    text = aWhat.mime2DecodedSubject;
  }

  await TestUtils.waitForCondition(
    () => aTab.title.includes(text),
    `Tab title should include '${text}' but does not. (Current title: '${aTab.title}')`
  );
}

/**
 * Assert that the given tab's title is what is given.
 *
 * @param {TabInfo} aTab - The tab to check.
 * @param {string} aTitle - The title to check.
 */
export function assert_tab_has_title(aTab, aTitle) {
  Assert.equal(aTab.title, aTitle);
}

/**
 * Close a tab.  If no tab is specified, it is assumed you want to close the
 *  current tab.
 */
export function close_tab(aTabToClose) {
  if (typeof aTabToClose == "number") {
    aTabToClose = mc.document.getElementById("tabmail").tabInfo[aTabToClose];
  }

  // Get the current tab count so we can make sure the tab actually closed.
  const preCount =
    mc.document.getElementById("tabmail").tabContainer.allTabs.length;

  mc.document.getElementById("tabmail").closeTab(aTabToClose);

  // Check that the tab count decreased.
  if (
    mc.document.getElementById("tabmail").tabContainer.allTabs.length !=
    preCount - 1
  ) {
    throw new Error("The tab never actually got closed!");
  }
}

/**
 * Clear the selection.  I'm not sure how we're pretending we did that, but
 *  we explicitly focus the thread tree as a side-effect.
 *
 * @param {Window} [win] - The window to use.
 */
export async function select_none(win = mc) {
  await wait_for_message_display_completion();
  focus_thread_tree();
  get_db_view(win).selection.clearSelection();
  get_about_3pane().threadTree.dispatchEvent(new CustomEvent("select"));
  // Because the selection event may not be generated immediately, we need to
  //  spin until the message display thinks it is not displaying a message,
  //  which is the sign that the event actually happened.
  const win2 = get_about_message();
  function noMessageChecker() {
    return win2.gMessage == null;
  }
  await TestUtils.waitForCondition(
    noMessageChecker,
    "waiting for displayedMessage to become null."
  );
  await wait_for_blank_content_pane(win);
}

/**
 * Normalize a view index to be an absolute index, handling slice-style negative
 *  references as well as piercing complex things like message headers and
 *  synthetic message sets.
 *
 * @param {integer} aViewIndex - An absolute index (integer >= 0),
 *   slice-style index (< 0),
 *   or a SyntheticMessageSet (we only care about the first message in it).
 * @returns {integer} the index
 */
function _normalize_view_index(aViewIndex) {
  const dbView = get_db_view();

  // SyntheticMessageSet special-case
  if (typeof aViewIndex != "number") {
    const msgHdrIter = aViewIndex.msgHdrs();
    const msgHdr = msgHdrIter.next().value;
    msgHdrIter.return();
    // do not expand
    aViewIndex = dbView.findIndexOfMsgHdr(msgHdr, false);
  }

  if (aViewIndex < 0) {
    return dbView.rowCount + aViewIndex;
  }
  return aViewIndex;
}

/**
 * Generic method to simulate a left click on a row in a <tree> element.
 *
 * @param {XULTreeElement} aTree - The tree element.
 * @param {number} aRowIndex - Index of a row in the tree to click on.
 * @see {mailTestUtils.treeClick()} for another way.
 */
export async function click_tree_row(aTree, aRowIndex) {
  if (aRowIndex < 0 || aRowIndex >= aTree.view.rowCount) {
    throw new Error(
      "Row " + aRowIndex + " does not exist in the tree " + aTree.id + "!"
    );
  }

  const selection = aTree.view.selection;
  selection.select(aRowIndex);
  aTree.ensureRowIsVisible(aRowIndex);

  // get cell coordinates
  const column = aTree.columns[0];
  const coords = aTree.getCoordsForCellItem(aRowIndex, column, "text");

  await TestUtils.waitForTick();
  EventUtils.synthesizeMouse(
    aTree.body,
    coords.x + 4,
    coords.y + 4,
    {},
    aTree.ownerGlobal
  );
  await TestUtils.waitForTick();
}

/**
 * @param {integer} aViewIndex
 * @returns {HTMLLIElement}
 */
async function _get_row_at_index(aViewIndex) {
  const win = get_about_3pane();
  const tree = win.document.getElementById("threadTree");
  await TestUtils.waitForCondition(
    () => aViewIndex < tree.view.rowCount,
    `index ${aViewIndex} must exist to be clicked on`
  );
  tree.scrollToIndex(aViewIndex, true);
  await TestUtils.waitForCondition(() => tree.getRowAtIndex(aViewIndex));
  return tree.getRowAtIndex(aViewIndex);
}

/**
 * Pretend we are clicking on a row with our mouse.
 *
 * @param {integer} aViewIndex - If >= 0, the view index provided, if < 0, a
 *   reference to a view index counting from the last row in the tree.
 *   -1 indicates the last message in the tree, -2 the second to last, etc.
 * @returns {msgDBHdr} The message header selected.
 */
export async function select_click_row(aViewIndex) {
  aViewIndex = _normalize_view_index(aViewIndex);

  const row = await _get_row_at_index(aViewIndex);
  EventUtils.synthesizeMouseAtCenter(row, {}, row.ownerGlobal);
  await TestUtils.waitForTick();

  await wait_for_message_display_completion(undefined, true);

  return get_about_3pane().gDBView.getMsgHdrAt(aViewIndex);
}

/**
 * Pretend we are clicking on a row in the select column with our mouse.
 *
 * @param {integer} aViewIndex - If >= 0, the view index provided, if < 0, a
 *   reference to a view index counting from the last row in the tree.
 *   -1 indicates the last message in the tree, -2 the second to last, etc.
 * @param {Window} [aWin] - The window in whose context to do this, defaults to
 *   the first window.
 * @returns {msgDBHdr} The message header selected.
 */
export async function select_column_click_row(aViewIndex, aWin = mc) {
  const dbView = get_db_view(aWin);

  const hasMessageDisplay = "messageDisplay" in aWin;
  if (hasMessageDisplay) {
    await wait_for_message_display_completion(aWin);
  }
  aViewIndex = _normalize_view_index(aViewIndex, aWin);

  // A click in the select column will always change the message display. If
  // clicking on a single selection (deselect), don't wait for a message load.
  var willDisplayMessage =
    hasMessageDisplay &&
    aWin.messageDisplay.visible &&
    !(dbView.selection.count == 1 && dbView.selection.isSelected(aViewIndex)) &&
    dbView.selection.currentIndex !== aViewIndex;

  _row_click_helper(
    aWin,
    aWin.document.getElementById("threadTree"),
    aViewIndex,
    0,
    null,
    "selectCol"
  );
  if (hasMessageDisplay) {
    await wait_for_message_display_completion(aWin, willDisplayMessage);
  }
  return dbView.getMsgHdrAt(aViewIndex);
}

/**
 * Pretend we are toggling the thread specified by a row.
 *
 * @param {integer} aViewIndex - If >= 0, the view index provided, if < 0, a reference to
 *     a view index counting from the last row in the tree.  -1 indicates the
 *     last message in the tree, -2 the second to last, etc.
 */
export async function toggle_thread_row(aViewIndex) {
  aViewIndex = _normalize_view_index(aViewIndex);

  const win = get_about_3pane();
  const row = win.document
    .getElementById("threadTree")
    .getRowAtIndex(aViewIndex);
  EventUtils.synthesizeMouseAtCenter(row.querySelector(".twisty"), {}, win);

  await wait_for_message_display_completion();
}

/**
 * Pretend we are clicking on a row with our mouse with the control key pressed,
 *  resulting in the addition/removal of just that row to/from the selection.
 *
 * @param {integer} aViewIndex - If >= 0, the view index provided, if < 0, a reference to
 *     a view index counting from the last row in the tree.  -1 indicates the
 *     last message in the tree, -2 the second to last, etc.
 * @returns {msgDBHdr} The message header of the affected message.
 */
export async function select_control_click_row(aViewIndex) {
  aViewIndex = _normalize_view_index(aViewIndex);

  const win = get_about_3pane();
  const row = win.document
    .getElementById("threadTree")
    .getRowAtIndex(aViewIndex);
  EventUtils.synthesizeMouseAtCenter(row, { accelKey: true }, win);

  await wait_for_message_display_completion();

  return win.gDBView.getMsgHdrAt(aViewIndex);
}

/**
 * Pretend we are clicking on a row with our mouse with the shift key pressed,
 *  adding all the messages between the shift pivot and the shift selected row.
 *
 * @param {integer} aViewIndex - If >= 0, the view index provided, if < 0, a
 *   reference to a view index counting from the last row in the tree.
 *   -1 indicates the last message in the tree, -2 the second to last, etc.
 * @param {Window} aWin - The window in whose context to do this, defaults to
 *   the first window.
 * @returns {msgDBHdr} The message headers for all messages that are now selected.
 */
export async function select_shift_click_row(aViewIndex, aWin) {
  aViewIndex = _normalize_view_index(aViewIndex, aWin);

  const win = get_about_3pane();
  const row = win.document
    .getElementById("threadTree")
    .getRowAtIndex(aViewIndex);
  EventUtils.synthesizeMouseAtCenter(row, { shiftKey: true }, win);

  await wait_for_message_display_completion();

  return win.gDBView.getSelectedMsgHdrs();
}

/**
 * Helper function to click on a row with a given button.
 */
function _row_click_helper(
  aWin,
  aTree,
  aViewIndex,
  aButton,
  aExtra,
  aColumnId
) {
  // Force-focus the tree
  aTree.focus();
  // coordinates of the upper left of the entire tree widget (headers included)
  const treeRect = aTree.getBoundingClientRect();
  const tx = treeRect.x,
    ty = treeRect.y;
  // coordinates of the row display region of the tree (below the headers)
  const children = aWin.document.getElementById(aTree.id, {
    tagName: "treechildren",
  });
  const childrenRect = children.getBoundingClientRect();
  const x = childrenRect.x,
    y = childrenRect.y;
  // Click in the middle of the row by default
  let rowX = childrenRect.width / 2;
  // For the thread tree, Position our click on the subject column (which cannot
  // be hidden), and far enough in that we are in no danger of clicking the
  // expand toggler unless that is explicitly requested.
  if (aTree.id == "threadTree") {
    const columnId = aColumnId || "subjectCol";
    const col = aWin.document.getElementById(columnId);
    rowX = col.getBoundingClientRect().x - tx + 8;
    // click on the toggle if so requested (for subjectCol)
    if (columnId == "subjectCol" && aExtra !== "toggle") {
      rowX += 32;
    }
  }
  // Very important, gotta be able to see the row.
  aTree.ensureRowIsVisible(aViewIndex);
  const rowY =
    aTree.rowHeight * (aViewIndex - aTree.getFirstVisibleRow()) +
    aTree.rowHeight / 2;
  if (aTree.getRowAt(x + rowX, y + rowY) != aViewIndex) {
    throw new Error(
      "Thought we would find row " +
        aViewIndex +
        " at " +
        rowX +
        "," +
        rowY +
        " but we found " +
        aTree.getRowAt(rowX, rowY)
    );
  }
  // Generate a mouse-down for all click types; the transient selection
  // logic happens on mousedown which our tests assume is happening.  (If you
  // are using a keybinding to trigger the event, that will not happen, but
  // we don't test that.)
  EventUtils.synthesizeMouse(
    aTree,
    x + rowX - tx,
    y + rowY - ty,
    {
      type: "mousedown",
      button: aButton,
      shiftKey: aExtra === "shift",
      accelKey: aExtra === "accel",
    },
    aWin
  );

  // For right-clicks, the platform code generates a "contextmenu" event
  // when it sees the mouse press/down event. We are not synthesizing a platform
  // level event (though it is in our power; we just historically have not),
  // so we need to be the people to create the context menu.
  if (aButton == 2) {
    EventUtils.synthesizeMouse(
      aTree,
      x + rowX - tx,
      y + rowY - ty,
      { type: "contextmenu", button: aButton },
      aWin
    );
  }

  EventUtils.synthesizeMouse(
    aTree,
    x + rowX - tx,
    y + rowY - ty,
    {
      type: "mouseup",
      button: aButton,
      shiftKey: aExtra == "shift",
      accelKey: aExtra === "accel",
    },
    aWin
  );
}

/**
 * Right-click on the tree-view in question.  With any luck, this will have
 *  the side-effect of opening up a pop-up which it is then on _your_ head
 *  to do something with or close.  However, we have helpful popup function
 *  helpers because I'm so nice.
 *
 * @returns {msgDBHdr} The message header that you clicked on.
 */
export async function right_click_on_row(aViewIndex) {
  aViewIndex = _normalize_view_index(aViewIndex);

  const win = get_about_3pane();
  const row = await _get_row_at_index(aViewIndex);
  EventUtils.synthesizeMouseAtCenter(row, { type: "contextmenu" }, win);
  await BrowserTestUtils.waitForPopupEvent(
    win.document.getElementById("mailContext"),
    "shown"
  );

  return get_db_view().getMsgHdrAt(aViewIndex);
}

/**
 * Middle-click on the tree-view in question, presumably opening a new message
 *  tab.
 *
 * @param {integer} aViewIndex - The index of a selected row.
 * @param {boolean} shiftPressed - Whether the shift key has been pressed.
 * @returns {[]} a tuple of [The new tab, the message that you clicked on.]
 */
export async function middle_click_on_row(aViewIndex, shiftPressed) {
  aViewIndex = _normalize_view_index(aViewIndex);

  const win = get_about_3pane();
  const row = await _get_row_at_index(aViewIndex);
  EventUtils.synthesizeMouseAtCenter(
    row,
    { button: 1, shiftKey: shiftPressed },
    win
  );

  return [
    mc.document.getElementById("tabmail").tabInfo[
      mc.document.getElementById("tabmail").tabContainer.allTabs.length - 1
    ],
    win.gDBView.getMsgHdrAt(aViewIndex),
  ];
}

/**
 * Assert that the given folder mode is the current one.
 *
 * @param {string} aMode - The expected folder mode.
 * @param {Window} [aWin] - The window in whose context to do this, defaults to
 *   the first window.
 */
export function assert_folder_mode(aMode, aWin) {
  const about3Pane = get_about_3pane(aWin);
  if (!about3Pane.folderPane.activeModes.includes(aMode)) {
    throw new Error(`The folder mode "${aMode}" is not visible`);
  }
}

/**
 * Assert that the given folder is the child of the given parent in the folder
 * tree view. aParent == null is equivalent to saying that the given folder
 * should be a top-level folder.
 */
export function assert_folder_child_in_view(aChild, aParent) {
  const about3Pane = get_about_3pane();
  const childRow = about3Pane.folderPane.getRowForFolder(aChild);
  const parentRow = childRow.parentNode.closest("li");

  if (parentRow?.uri != aParent.URI) {
    throw new Error(
      "Folder " +
        aChild.URI +
        " should be the child of " +
        (aParent && aParent.URI) +
        ", but is actually the child of " +
        parentRow?.uri
    );
  }
}

/**
 * Assert that the given folder is in the current folder mode and is visible.
 *
 * @param {nsIMsgFolder} aFolder - The folder to assert as visible.
 * @param {Window} [aWin] - The window in whose context to do this, defaults to
 *   the first window.
 * @returns {integer} The index of the folder, if it is visible.
 */
export function assert_folder_visible(aFolder, aWin) {
  const about3Pane = get_about_3pane(aWin);
  const folderIndex = about3Pane.folderTree.rows.findIndex(
    row => row.uri == aFolder.URI
  );
  if (folderIndex == -1) {
    throw new Error("Folder: " + aFolder.URI + " should be visible, but isn't");
  }

  return folderIndex;
}

/**
 * Assert that the given folder is either not in the current folder mode at all,
 * or is not currently visible.
 */
export function assert_folder_not_visible(aFolder) {
  const about3Pane = get_about_3pane();
  const folderIndex = about3Pane.folderTree.rows.findIndex(
    row => row.uri == aFolder.URI
  );
  if (folderIndex != -1) {
    throw new Error(
      "Folder: " + aFolder.URI + " should not be visible, but is"
    );
  }
}

/**
 * Collapse a folder if it has children. This will throw if the folder itself is
 * not visible in the folder view.
 */
export function collapse_folder(aFolder) {
  const folderIndex = assert_folder_visible(aFolder);
  const about3Pane = get_about_3pane();
  const folderRow = about3Pane.folderTree.getRowAtIndex(folderIndex);
  if (!folderRow.classList.contains("collapsed")) {
    EventUtils.synthesizeMouseAtCenter(
      folderRow.querySelector(".twisty"),
      {},
      about3Pane
    );
  }
}

/**
 * Expand a folder if it has children. This will throw if the folder itself is
 * not visible in the folder view.
 */
export function expand_folder(aFolder) {
  const folderIndex = assert_folder_visible(aFolder);
  const about3Pane = get_about_3pane();
  const folderRow = about3Pane.folderTree.getRowAtIndex(folderIndex);
  if (folderRow.classList.contains("collapsed")) {
    EventUtils.synthesizeMouseAtCenter(
      folderRow.querySelector(".twisty"),
      {},
      about3Pane
    );
  }
}

/**
 * Assert that a folder is currently visible and collapsed. This will throw if
 * either of the two is untrue.
 */
export function assert_folder_collapsed(aFolder) {
  const folderIndex = assert_folder_visible(aFolder);
  const row = get_about_3pane().folderTree.getRowAtIndex(folderIndex);
  Assert.ok(row.classList.contains("collapsed"));
}

/**
 * Assert that a folder is currently visible and expanded. This will throw if
 * either of the two is untrue.
 */
export function assert_folder_expanded(aFolder) {
  const folderIndex = assert_folder_visible(aFolder);
  const row = get_about_3pane().folderTree.getRowAtIndex(folderIndex);
  Assert.ok(!row.classList.contains("collapsed"));
}

/**
 * Pretend we are clicking on a folder with our mouse.
 *
 * @param {nsIMsgFolder} aFolder - The folder to click on. This needs to be present in the
 *     current folder tree view, of course.
 *
 * @returns {integer} The view index that you clicked on.
 */
export function select_click_folder(aFolder) {
  const win = get_about_3pane();
  const folderTree = win.document.getElementById("folderTree");
  const row = folderTree.rows.find(treeRow => treeRow.uri == aFolder.URI);
  row.scrollIntoView({ block: "start", behavior: "instant" });
  EventUtils.synthesizeMouseAtCenter(row.querySelector(".container"), {}, win);
}

/**
 * Pretend we are clicking on a folder with our mouse with the shift key pressed.
 *
 * @param {nsIMsgFolder} aFolder - The folder to shift-click on. This needs to be present in the
 *     current folder tree view, of course.
 * @returns {nsIMsgFolder[]} An array containing all the folders that are now selected.
 */
export async function select_shift_click_folder(aFolder) {
  await wait_for_all_messages_to_load();

  const viewIndex = mc.folderTreeView.getIndexOfFolder(aFolder);
  // Passing -1 as the start range checks the shift-pivot, which should be -1,
  //  so it should fall over to the current index, which is what we want.  It
  //  will then set the shift-pivot to the previously-current-index and update
  //  the current index to be what we shift-clicked on.  All matches user
  //  interaction.
  mc.folderTreeView.selection.rangedSelect(-1, viewIndex, false);
  await wait_for_all_messages_to_load();
  // give the event queue a chance to drain...
  await TestUtils.waitForTick();

  return mc.folderTreeView.getSelectedFolders();
}

/**
 * Right click on the folder tree view. With any luck, this will have the
 * side-effect of opening up a pop-up which it is then on _your_ head to do
 * something with or close.  However, we have helpful popup function helpers
 * helpers because asuth's so nice.
 *
 * NOTE: The argument is a folder here, unlike in the message case, so beware.
 *
 * @returns {integer} The view index that you clicked on.
 */
export async function right_click_on_folder(aFolder) {
  const win = get_about_3pane();
  const folderTree = win.document.getElementById("folderTree");
  const shownPromise = BrowserTestUtils.waitForEvent(
    win.document.getElementById("folderPaneContext"),
    "popupshown"
  );
  const row = folderTree.rows.find(treeRow => treeRow.uri == aFolder.URI);
  EventUtils.synthesizeMouseAtCenter(
    row.querySelector(".container"),
    { type: "contextmenu" },
    win
  );
  await shownPromise;
}

/**
 * Middle-click on the folder tree view, presumably opening a new folder tab.
 *
 * NOTE: The argument is a folder here, unlike in the message case, so beware.
 *
 * @returns {[]} A tuple of [The new tab, the view index that you clicked on.]
 */
export function middle_click_on_folder(aFolder, shiftPressed) {
  const win = get_about_3pane();
  const folderTree = win.document.getElementById("folderTree");
  const row = folderTree.rows.find(treeRow => treeRow.uri == aFolder.URI);
  EventUtils.synthesizeMouseAtCenter(
    row.querySelector(".container"),
    { button: 1, shiftKey: shiftPressed },
    win
  );

  return [
    mc.document.getElementById("tabmail").tabInfo[
      mc.document.getElementById("tabmail").tabContainer.allTabs.length - 1
    ],
  ];
}

/**
 * Get a reference to the smart folder with the given name.
 *
 * @param {string} aFolderName - The name of the smart folder (e.g. "Inbox").
 * @returns {nsIMsgFolder} An nsIMsgFolder representing the smart folder with
 *   the given name.
 */
export function get_smart_folder_named(aFolderName) {
  const smartMailbox = SmartMailboxUtils.getSmartMailbox();
  return smartMailbox.getSmartFolder(aFolderName);
}

/**
 * Assuming the context popup is popped-up (via right_click_on_row), select
 *  the deletion option.  If the popup is not popped up, you are out of luck.
 */
export async function delete_via_popup() {
  plan_to_wait_for_folder_events(
    "DeleteOrMoveMsgCompleted",
    "DeleteOrMoveMsgFailed"
  );
  const win = get_about_3pane();
  const ctxDelete = win.document.getElementById("navContext-delete");
  if (AppConstants.platform == "macosx") {
    // We need to use click() since the synthesizeMouseAtCenter doesn't work for
    // context menu items on macos.
    ctxDelete.click();
  } else {
    EventUtils.synthesizeMouseAtCenter(ctxDelete, {}, ctxDelete.ownerGlobal);
  }

  // for reasons unknown, the pop-up does not close itself?
  await close_popup(mc, win.document.getElementById("mailContext"));
  await wait_for_folder_events();
}

/**
 * Close the open pop-up.
 *
 * @param {DOMWindow} aWin
 * @param {XULPopupElement} elem
 */
export async function close_popup(aWin, elem) {
  // if it was already closing, just leave
  if (elem.state == "closed") {
    return;
  }

  if (elem.state != "hiding") {
    // Actually close the popup because it's not closing/closed.
    elem.hidePopup();
    await BrowserTestUtils.waitForPopupEvent(elem, "hidden");
    await new Promise(resolve => aWin.requestAnimationFrame(resolve));
  }
}

/**
 * Pretend we are pressing the delete key, triggering message deletion of the
 *  selected messages.
 *
 * @param {Window} [aWin] - The window in whose context to do this, defaults to
 *   the first window.
 * @param {object} [aModifiers] - Modifiers to pass to the keypress method.
 */
export async function press_delete(aWin = mc, aModifiers) {
  plan_to_wait_for_folder_events(
    "DeleteOrMoveMsgCompleted",
    "DeleteOrMoveMsgFailed"
  );

  EventUtils.synthesizeKey("VK_DELETE", aModifiers || {}, aWin);
  await wait_for_folder_events();
}

/**
 * Delete all messages in the given folder.
 * (called empty_folder similarly to emptyTrash method on root folder)
 *
 * @param {nsIMsgFolder} aFolder - Folder to empty.
 * @param {Window} [aWin] - The window in whose context to do this, defaults to
 *   the first window.
 */
export async function empty_folder(aFolder, aWin = mc) {
  if (!aFolder) {
    throw new Error("No folder for emptying given");
  }

  await be_in_folder(aFolder);
  let msgCount;
  while ((msgCount = aFolder.getTotalMessages(false)) > 0) {
    await select_click_row(0, aWin);
    await press_delete(aWin);
    await TestUtils.waitForCondition(
      () => aFolder.getTotalMessages(false) < msgCount
    );
  }
}

/**
 * Archive the selected messages, and wait for it to complete.  Archiving
 *  plans and waits for message display if the display is visible because
 *  successful archiving will by definition change the currently displayed
 *  set of messages (unless you are looking at a virtual folder that includes
 *  the archive folder.)
 *
 * @param {Window} [win] - The window in whose context to do this, defaults to
 *   the first window.
 */
export async function archive_selected_messages(win = mc) {
  const dbView = get_db_view(win);

  // How many messages do we expect to remain after the archival?
  const expectedCount = dbView.rowCount - dbView.numSelected;

  EventUtils.synthesizeKey("a", {}, win);

  // Wait for the view rowCount to decrease by the number of selected messages.
  const messagesDeletedFromView = function () {
    return dbView.rowCount == expectedCount;
  };
  await TestUtils.waitForCondition(
    messagesDeletedFromView,
    "Timeout waiting for messages to be archived"
  );
  // await wait_for_message_display_completion(
  //   win,
  //   expectedCount && win.messageDisplay.visible
  // );
  // The above may return immediately, meaning the event queue might not get a
  //  chance.  give it a chance now.
  await TestUtils.waitForTick();
}

/**
 * Wait for the |folderDisplay| on win (defaults to mc if omitted) to
 *  finish loading.  This generally only matters for folders that have an active
 *  search.
 * This method is generally called automatically most of the time, and you
 *  should not need to call it yourself unless you are operating outside the
 *  helper methods in this file.
 *
 * @param {Window} [win] - The window in whose context to do this, defaults to
 *   the first window.
 */
export async function wait_for_all_messages_to_load(win = mc) {
  if (win.gFolderDisplay) {
    await TestUtils.waitForCondition(
      () => win.gFolderDisplay.allMessagesLoaded,
      "waiting for message list to finish loading"
    );
  } else {
    const about3Pane = get_about_3pane(win);
    await TestUtils.waitForCondition(
      () => about3Pane.dbViewWrapperListener.allMessagesLoaded,
      "waiting for message list to finish loading"
    );
  }
  // the above may return immediately, meaning the event queue might not get a
  //  chance.  give it a chance now.
  await TestUtils.waitForTick();
}

/**
 * If a message or summary is in the process of loading, let it finish;
 * optionally, be sure to wait for a load to happen.
 *
 * This method is used defensively by a lot of other code in this file that is
 * really not sure whether there might be a load in progress or not.  So by
 * default we only do something if there is obviously a message display in
 * progress.  Since some events may end up getting deferred due to script
 * blockers or the like, it is possible the event that triggers the display
 * may not have happened by the time you call this.  In that case, you should
 * pass true for aLoadDemanded.
 *
 * before triggering the event that will induce a message display.  Note that:
 * - You cannot do #2 if you are opening a new message window and can assume
 * that this will be the first message ever displayed in the window. This is
 * fine, because messageLoaded is initially false.
 * - You should not do #2 if you are opening a new folder or message tab. That
 * is because you'll affect the old tab's message display instead of the new
 * tab's display. Again, this is fine, because a new message display will be
 * created for the new tab, and messageLoaded will initially be false for it.
 *
 * If we didn't use this method defensively, we would get horrible assertions
 * like so:
 * ###!!! ASSERTION: Overwriting an existing document channel!
 *
 * @param {Window} [aWin] - The window in whose context to do this, defaults to
 *   the first window.
 * @param {boolean} [aLoadDemanded=false] - Should we require that we wait for
 *   a message to be loaded? If you do not pass true and there is no message
 *   load in process, this method will return immediately.
 */
export async function wait_for_message_display_completion(aWin, aLoadDemanded) {
  let win;
  if (aWin == null || aWin.document.getElementById("tabmail")) {
    win = get_about_message();
  } else {
    win = aWin.document.getElementById("messageBrowser").contentWindow;
  }

  const tabmail = mc.document.getElementById("tabmail");
  if (tabmail.currentTabInfo.mode.name == "mail3PaneTab") {
    const about3Pane = tabmail.currentAbout3Pane;
    if (about3Pane?.gDBView?.getSelectedMsgHdrs().length > 1) {
      // Displaying multiple messages.
      return;
    }
    if (about3Pane?.messagePaneSplitter.isCollapsed) {
      // Message pane hidden.
      return;
    }
  }

  await TestUtils.waitForCondition(() => win.document.readyState == "complete");

  const messagePaneBrowser = win.getMessagePaneBrowser();

  await TestUtils.waitForCondition(
    () =>
      !messagePaneBrowser.docShell?.isLoadingDocument &&
      (!aLoadDemanded || messagePaneBrowser.currentURI?.spec != "about:blank"),
    `Timeout waiting for a message. Current location: ${messagePaneBrowser.currentURI?.spec}`
  );
  await TestUtils.waitForTick();
}

/**
 * Wait for the content pane to be blank because no message is to be displayed.
 *
 * @param {Window} [win] - The window in whose context to do this, defaults to
 *   the first window.
 */
export async function wait_for_blank_content_pane(win = mc) {
  const aboutMessage = get_about_message(win);

  await TestUtils.waitForCondition(
    () => aboutMessage.document.readyState == "complete"
  );

  const messagePaneBrowser = aboutMessage.getMessagePaneBrowser();
  if (BrowserTestUtils.isHidden(messagePaneBrowser)) {
    return;
  }

  await TestUtils.waitForCondition(
    () =>
      !messagePaneBrowser.docShell?.isLoadingDocument &&
      messagePaneBrowser.currentURI?.spec == "about:blank",
    `Timeout waiting for blank content pane. Current location: ${messagePaneBrowser.currentURI?.spec}`
  );

  // the above may return immediately, meaning the event queue might not get a
  //  chance.  give it a chance now.
  await TestUtils.waitForTick();
}

var FolderListener = {
  _inited: false,
  ensureInited() {
    if (this._inited) {
      return;
    }

    MailServices.mailSession.AddFolderListener(
      this,
      Ci.nsIFolderListener.event
    );

    this._inited = true;
  },

  sawEvents: false,
  watchingFor: null,
  planToWaitFor(...aArgs) {
    this.sawEvents = false;
    this.watchingFor = aArgs;
  },

  async waitForEvents() {
    await TestUtils.waitForCondition(
      () => this.sawEvents,
      `Timeout waiting for events: ${this.watchingFor}`
    );
  },

  onFolderEvent(aFolder, aEvent) {
    if (!this.watchingFor) {
      return;
    }
    if (this.watchingFor.includes(aEvent)) {
      this.watchingFor = null;
      this.sawEvents = true;
    }
  },
};

/**
 * Plan to wait for an nsIFolderListener.onFolderEvent matching one of the
 *  provided strings.  Call this before you do the thing that triggers the
 *  event, then call |wait_for_folder_events| after the event.  This ensures
 *  that we see the event, because it might be too late after you initiate
 *  the thing that would generate the event.
 * For example, plan_to_wait_for_folder_events("DeleteOrMoveMsgCompleted",
 *  "DeleteOrMoveMsgFailed") waits for a deletion completion notification
 *  when you call |wait_for_folder_events|.
 * The waiting is currently un-scoped, so the event happening on any folder
 *  triggers us.  It is expected that you won't try and have multiple events
 *  in-flight or will augment us when the time comes to have to deal with that.
 */
export function plan_to_wait_for_folder_events(...aArgs) {
  FolderListener.ensureInited();
  FolderListener.planToWaitFor(...aArgs);
}

export async function wait_for_folder_events() {
  await FolderListener.waitForEvents();
}

/**
 * Assert that the given synthetic message sets are present in the folder
 *  display.
 *
 * Verify that the messages in the provided SyntheticMessageSets are the only
 *  visible messages in the provided DBViewWrapper. If dummy headers are present
 *  in the view for group-by-sort, the code will ensure that the dummy header's
 *  underlying header corresponds to a message in the synthetic sets.  However,
 *  you should generally not rely on this code to test for anything involving
 *  dummy headers.
 *
 * In the event the view does not contain all of the messages from the provided
 *  sets or contains messages not in the provided sets, throw_and_dump_view_state
 *  will be invoked with a human readable explanation of the problem.
 *
 * @param {SyntheticMessageSet|SyntheticMessageSet[]} aSynSets
 * @param {Window} [aWin] - Window which we get the folderDisplay property from.
 *   Defaults to the first window.
 */
export function assert_messages_in_view(aSynSets, aWin = mc) {
  if (!("length" in aSynSets)) {
    aSynSets = [aSynSets];
  }

  // - Iterate over all the message sets, retrieving the message header.  Use
  //  this to construct a URI to populate a dictionary mapping.
  const synMessageURIs = {}; // map URI to message header
  for (const messageSet of aSynSets) {
    for (const msgHdr of messageSet.msgHdrs()) {
      synMessageURIs[msgHdr.folder.getUriForMsg(msgHdr)] = msgHdr;
    }
  }

  // - Iterate over the contents of the view, nulling out values in
  //  synMessageURIs for found messages, and exploding for missing ones.
  const dbView = get_db_view(aWin);
  const treeView = dbView.QueryInterface(Ci.nsITreeView);
  const rowCount = treeView.rowCount;

  for (let iViewIndex = 0; iViewIndex < rowCount; iViewIndex++) {
    const msgHdr = dbView.getMsgHdrAt(iViewIndex);
    const uri = msgHdr.folder.getUriForMsg(msgHdr);
    // expected hit, null it out. (in the dummy case, we will just null out
    //  twice, which is also why we do an 'in' test and not a value test.
    if (uri in synMessageURIs) {
      synMessageURIs[uri] = null;
    } else {
      // the view is showing a message that should not be shown, explode.
      throw_and_dump_view_state(
        "The view should show the message header" + msgHdr.messageKey
      );
    }
  }

  // - Iterate over our URI set and make sure every message got nulled out.
  for (const uri in synMessageURIs) {
    const msgHdr = synMessageURIs[uri];
    if (msgHdr != null) {
      throw_and_dump_view_state(
        "The view should include the message header" + msgHdr.messageKey
      );
    }
  }
}

/**
 * Assert the the given message/messages are not present in the view.
 *
 * @param {nsIMsgDBHdr|nsIMsgDBHdr[]} aMessages - Either a single
 *   nsIMsgDBHdr or a list of them.
 */
export function assert_messages_not_in_view(aMessages) {
  if (aMessages instanceof Ci.nsIMsgDBHdr) {
    aMessages = [aMessages];
  }

  const dbView = get_db_view();
  for (const msgHdr of aMessages) {
    Assert.equal(
      dbView.findIndexOfMsgHdr(msgHdr, true),
      nsMsgViewIndex_None,
      `Message header is present in view but should not be`
    );
  }
}

export var assert_message_not_in_view = assert_messages_not_in_view;

/**
 * When displaying a folder, assert that the message pane is visible and all the
 *  menus, splitters, etc. are set up right.
 */
export function assert_message_pane_visible() {
  const win = get_about_3pane();
  const messagePane = win.document.getElementById("messagePane");

  Assert.equal(
    win.paneLayout.messagePaneVisible,
    true,
    "The tab does not think that the message pane is visible, but it should!"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(messagePane),
    "The message pane should not be collapsed!"
  );
  Assert.equal(
    win.messagePaneSplitter.isCollapsed,
    false,
    "The message pane splitter should not be collapsed!"
  );

  mc.view_init(); // Force the view menu to update.
  const paneMenuItem = mc.document.getElementById("menu_showMessage");
  Assert.equal(
    paneMenuItem.getAttribute("checked"),
    "true",
    "The Message Pane menu item should be checked."
  );
}

/**
 * When displaying a folder, assert that the message pane is hidden and all the
 *  menus, splitters, etc. are set up right.
 */
export function assert_message_pane_hidden() {
  const win = get_about_3pane();
  const messagePane = win.document.getElementById("messagePane");

  Assert.equal(
    win.paneLayout.messagePaneVisible,
    false,
    "The tab thinks that the message pane is visible, but it shouldn't!"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(messagePane),
    "The message pane should be collapsed!"
  );
  Assert.equal(
    win.messagePaneSplitter.isCollapsed,
    true,
    "The message pane splitter should be collapsed!"
  );

  mc.view_init(); // Force the view menu to update.
  const paneMenuItem = mc.document.getElementById("menu_showMessage");
  Assert.notEqual(
    paneMenuItem.getAttribute("checked"),
    "true",
    "The Message Pane menu item should not be checked."
  );
}

/**
 * Toggle the visibility of the message pane.
 */
export function toggle_message_pane() {
  EventUtils.synthesizeKey("VK_F8", {}, get_about_3pane());
}

/**
 * Make the folder pane visible in order to run tests.
 * This is necessary as the FolderPane is collapsed if no account is available.
 */
export function show_folder_pane() {
  mc.document.getElementById("folderPaneBox").collapsed = false;
}

/**
 * Helper function for use by assert_selected / assert_selected_and_displayed /
 *  assert_displayed.
 *
 * @returns {[]} A list of two elements: [Window, [list of view indices]].
 */
function _process_row_message_arguments(...aArgs) {
  let troller = mc;
  // - normalize into desired selected view indices
  const desiredIndices = [];
  for (const arg of aArgs) {
    // An integer identifying a view index
    if (typeof arg == "number") {
      desiredIndices.push(_normalize_view_index(arg));
    } else if (arg instanceof Ci.nsIMsgDBHdr) {
      // A message header
      // do not expand; the thing should already be selected, eg expanded!
      const viewIndex = get_db_view(troller).findIndexOfMsgHdr(arg, false);
      if (viewIndex == nsMsgViewIndex_None) {
        throw_and_dump_view_state(
          "Message not present in view that should be there. " +
            "(" +
            arg.messageKey +
            ": " +
            arg.mime2DecodedSubject +
            ")"
        );
      }
      desiredIndices.push(viewIndex);
    } else if (arg.length == 2 && typeof arg[0] == "number") {
      // A list containing two integers, indicating a range of view indices.
      const lowIndex = _normalize_view_index(arg[0]);
      const highIndex = _normalize_view_index(arg[1]);
      for (let viewIndex = lowIndex; viewIndex <= highIndex; viewIndex++) {
        desiredIndices.push(viewIndex);
      }
    } else if (Array.isArray(arg)) {
      // a List of message headers
      for (let iMsg = 0; iMsg < arg.length; iMsg++) {
        const msgHdr = arg[iMsg].QueryInterface(Ci.nsIMsgDBHdr);
        if (!msgHdr) {
          throw new Error(arg[iMsg] + " is not a message header!");
        }
        // false means do not expand, it should already be selected
        const viewIndex = get_db_view(troller).findIndexOfMsgHdr(msgHdr, false);
        if (viewIndex == nsMsgViewIndex_None) {
          throw_and_dump_view_state(
            "Message not present in view that should be there. " +
              "(" +
              msgHdr.messageKey +
              ": " +
              msgHdr.mime2DecodedSubject +
              ")"
          );
        }
        desiredIndices.push(viewIndex);
      }
    } else if (arg.synMessages) {
      // SyntheticMessageSet
      for (const msgHdr of arg.msgHdrs()) {
        const viewIndex = get_db_view(troller).findIndexOfMsgHdr(msgHdr, false);
        if (viewIndex == nsMsgViewIndex_None) {
          throw_and_dump_view_state(
            "Message not present in view that should be there. " +
              "(" +
              msgHdr.messageKey +
              ": " +
              msgHdr.mime2DecodedSubject +
              ")"
          );
        }
        desiredIndices.push(viewIndex);
      }
    } else if (arg) {
      // It's a Window.
      troller = arg;
    } else {
      throw new Error("Illegal argument: " + arg);
    }
  }
  // sort by integer value
  desiredIndices.sort(function (a, b) {
    return a - b;
  });

  return [troller, desiredIndices];
}

/**
 * Asserts that the given set of messages are selected.  Unless you are dealing
 *  with transient selections resulting from right-clicks, you want to be using
 *  assert_selected_and_displayed because it makes sure that the display is
 *  correct too.
 *
 * The arguments consist of one or more of the following:
 * - A Window, indicating we should use that window instead of
 *   the default, "mc" (corresponding to the 3pane.)  Pass this first!
 * - An integer identifying a view index.
 * - A list containing two integers, indicating a range of view indices.
 * - A message header.
 * - A list of message headers.
 * - A synthetic message set.
 */
export function assert_selected(...aArgs) {
  const [troller, desiredIndices] = _process_row_message_arguments(...aArgs);

  // - get the actual selection (already sorted by integer value)
  const selectedIndices = get_db_view(troller).getIndicesForSelection();

  // - test selection equivalence
  // which is the same as string equivalence in this case. muah hah hah.
  Assert.equal(
    selectedIndices.toString(),
    desiredIndices.toString(),
    "should have the right selected indices"
  );
  return [troller, desiredIndices];
}

/**
 * Assert that the given set of messages is displayed, but not necessarily
 *  selected.  Unless you are dealing with transient selection issues or some
 *  other situation where the FolderDisplay should not be correlated with the
 *  MessageDisplay, you really should be using assert_selected_and_displayed.
 *
 * The arguments consist of one or more of the following:
 * - A Window, indicating we should use that window instead of
 *   the default, "mc" (corresponding to the 3pane.)  Pass this first!
 * - An integer identifying a view index.
 * - A list containing two integers, indicating a range of view indices.
 * - A message header.
 * - A list of message headers.
 */
export async function assert_displayed(...aArgs) {
  const [troller, desiredIndices] = _process_row_message_arguments(...aArgs);
  await _internal_assert_displayed(false, troller, desiredIndices);
}

/**
 * Assert-that-the-display-is-right logic.  We need an internal version so that
 *  we can know whether we can trust/assert that folderDisplay.selectedMessage
 *  agrees with messageDisplay, and also so that we don't have to re-compute
 *  troller and desiredIndices.
 */
async function _internal_assert_displayed(
  trustSelection,
  troller,
  desiredIndices
) {
  // - verify that the right thing is being displayed.
  // no selection means folder summary.
  if (desiredIndices.length == 0) {
    await wait_for_blank_content_pane(troller);

    const messageWindow = get_about_message();

    // folder summary is not landed yet, just verify there is no message.
    if (messageWindow.gMessage) {
      throw new Error(
        "Message display should not think it is displaying a message."
      );
    }
    // make sure the content pane is pointed at about:blank
    const location = messageWindow.getMessagePaneBrowser()?.location;
    if (location && location.href != "about:blank") {
      throw new Error(
        `the content pane should be blank, but is showing: '${location.href}'`
      );
    }
  } else if (desiredIndices.length == 1) {
    /*
    // 1 means the message should be displayed
    // make sure message display thinks we are in single message display mode
    if (!troller.messageDisplay.singleMessageDisplay) {
      throw new Error("Message display is not in single message display mode.");
    }
    // now make sure that we actually are in single message display mode
    let singleMessagePane = troller.document.getElementById("singleMessage");
    let multiMessagePane = troller.document.getElementById("multimessage");
    if (singleMessagePane && singleMessagePane.hidden) {
      throw new Error("Single message pane is hidden but it should not be.");
    }
    if (multiMessagePane && !multiMessagePane.hidden) {
      throw new Error("Multiple message pane is visible but it should not be.");
    }

    if (trustSelection) {
      if (
        troller.gFolderDisplay.selectedMessage !=
        troller.messageDisplay.displayedMessage
      ) {
        throw new Error(
          "folderDisplay.selectedMessage != " +
            "messageDisplay.displayedMessage! (fd: " +
            troller.gFolderDisplay.selectedMessage +
            " vs md: " +
            troller.messageDisplay.displayedMessage +
            ")"
        );
      }
    }

    let msgHdr = troller.messageDisplay.displayedMessage;
    let msgUri = msgHdr.folder.getUriForMsg(msgHdr);
    // wait for the document to load so that we don't try and replace it later
    //  and get that stupid assertion
    await wait_for_message_display_completion();
    utils.sleep(500)
    // make sure the content pane is pointed at the right thing

    let msgService = troller.gFolderDisplay.messenger.messageServiceFromURI(
      msgUri
    );
    let msgUrl = msgService.getUrlForUri(
      msgUri,
      troller.gFolderDisplay.msgWindow
    );
    if (troller.content?.location.href != msgUrl.spec) {
      throw new Error(
        "The content pane is not displaying the right message! " +
          "Should be: " +
          msgUrl.spec +
          " but it's: " +
          troller.content.location.href
      );
    }
    */
  } else {
    /*
    // multiple means some form of multi-message summary
    // XXX deal with the summarization threshold bail case.

    // make sure the message display thinks we are in multi-message mode
    if (troller.messageDisplay.singleMessageDisplay) {
      throw new Error(
        "Message display should not be in single message display" +
          "mode!  Desired indices: " +
          desiredIndices
      );
    }

    // verify that the message pane browser is displaying about:blank
    if (mc.content && mc.content.location.href != "about:blank") {
      throw new Error(
        "the content pane should be blank, but is showing: '" +
          mc.content.location.href +
          "'"
      );
    }

    // now make sure that we actually are in nultiple message display mode
    let singleMessagePane = troller.document.getElementById("singleMessage");
    let multiMessagePane = troller.document.getElementById("multimessage");
    if (singleMessagePane && !singleMessagePane.hidden) {
      throw new Error("Single message pane is visible but it should not be.");
    }
    if (multiMessagePane && multiMessagePane.hidden) {
      throw new Error("Multiple message pane is hidden but it should not be.");
    }

    // and _now_ make sure that we actually summarized what we wanted to
    //  summarize.
    let desiredMessages = desiredIndices.map(vi => mc.gFolderDisplay.view.dbView.getMsgHdrAt(vi));
    await assert_messages_summarized(troller, desiredMessages);
    */
  }
}

/**
 * Assert that the messages corresponding to the one or more message spec
 *  arguments are selected and displayed.  If you specify multiple messages,
 *  we verify that the multi-message selection mode is in effect and that they
 *  are doing the desired thing.  (Verifying the summarization may seem
 *  overkill, but it helps make the tests simpler and allows you to be more
 *  confident if you're just running one test that everything in the test is
 *  performing in a sane fashion.  Refactoring could be in order, of course.)
 *
 * The arguments consist of one or more of the following:
 * - A Window, indicating we should use that window instead of
 *   the default, "mc" (corresponding to the 3pane.)  Pass this first!
 * - An integer identifying a view index.
 * - A list containing two integers, indicating a range of view indices.
 * - A message header.
 * - A list of message headers.
 */
export async function assert_selected_and_displayed(...aArgs) {
  // make sure the selection is right first.
  const [troller, desiredIndices] = assert_selected(...aArgs);
  // now make sure the display is right
  await _internal_assert_displayed(true, troller, desiredIndices);
}

/**
 * Use the internal archiving code for archiving any given set of messages
 *
 * @param {nsIMsgDBHdr[]} aMsgHdrs - A list of message headers.
 */
export async function archive_messages(aMsgHdrs) {
  plan_to_wait_for_folder_events(
    "DeleteOrMoveMsgCompleted",
    "DeleteOrMoveMsgFailed"
  );

  const { MessageArchiver } = ChromeUtils.importESModule(
    "resource:///modules/MessageArchiver.sys.mjs"
  );
  const batchMover = new MessageArchiver();
  batchMover.archiveMessages(aMsgHdrs);
  await wait_for_folder_events();
}

/**
 * Check if the selected messages match the summarized messages.
 *
 * @param {string[]} aSummarizedKeys - An array of keys (messageKey + folder.URI)
 *   for the summarized messages.
 * @param {nsIMsgDBHdr[]} aSelectedMessages - The selected messages.
 * @returns {boolean} true is aSelectedMessages and aSummarizedKeys refer to the same set
 *     of messages.
 */
function _verify_summarized_message_set(aSummarizedKeys, aSelectedMessages) {
  const summarizedKeys = aSummarizedKeys.slice();
  summarizedKeys.sort();
  // We use the same key-generation as in multimessageview.js.
  const selectedKeys = aSelectedMessages.map(
    msgHdr => msgHdr.messageKey + msgHdr.folder.URI
  );
  selectedKeys.sort();

  // Stringified versions should now be equal...
  return selectedKeys.toString() == summarizedKeys.toString();
}

/**
 * Asserts that the messages the window's folder display widget thinks are
 *  summarized are in fact summarized.  This is automatically called by
 *  assert_selected_and_displayed, so you do not need to call this directly
 *  unless you are testing the summarization logic.
 *
 * @param {Window} aWin - The window who has the summarized display going on.
 * @param {nsIMsgDBHdr[]|SyntheticMessageSet} [aSelectedMessages] - Optional set of
 *   messages to verify. If not provided, this is extracted via the
 *   folderDisplay. If a SyntheticMessageSet is provided we will automatically
 *   retrieve what we need from it.
 */
export async function assert_messages_summarized(aWin, aSelectedMessages) {
  // - Compensate for selection stabilization code.
  // Although WindowHelpers sets the stabilization interval to 0, we
  //  still need to make sure we have drained the event queue so that it has
  //  actually gotten a chance to run.
  await TestUtils.waitForTick();

  // - Verify summary object knows about right messages
  if (aSelectedMessages == null) {
    aSelectedMessages = aWin.gFolderDisplay.selectedMessages;
  }
  // if it's a synthetic message set, we want the headers...
  if (aSelectedMessages.synMessages) {
    aSelectedMessages = Array.from(aSelectedMessages.msgHdrs());
  }

  const summaryFrame = aWin.gSummaryFrameManager.iframe;
  const summary = summaryFrame.contentWindow.gMessageSummary;
  const summarizedKeys = Object.keys(summary._msgNodes);
  if (aSelectedMessages.length != summarizedKeys.length) {
    const elaboration =
      "Summary contains " +
      summarizedKeys.length +
      " messages, expected " +
      aSelectedMessages.length +
      ".";
    throw new Error(
      "Summary does not contain the right set of messages. " + elaboration
    );
  }
  if (!_verify_summarized_message_set(summarizedKeys, aSelectedMessages)) {
    const elaboration =
      "Summary: " + summarizedKeys + "  Selected: " + aSelectedMessages + ".";
    throw new Error(
      "Summary does not contain the right set of messages. " + elaboration
    );
  }
}

/**
 * Assert that there is nothing selected and, assuming we are in a folder, that
 *  the folder summary is displayed.
 */
export var assert_nothing_selected = assert_selected_and_displayed;

/**
 * Assert that the given view index or message is visible in the thread pane.
 */
export function assert_visible(aViewIndexOrMessage) {
  const win = get_about_3pane();
  let viewIndex;
  if (typeof aViewIndexOrMessage == "number") {
    viewIndex = _normalize_view_index(aViewIndexOrMessage);
  } else {
    viewIndex = win.gDBView.findIndexOfMsgHdr(aViewIndexOrMessage, false);
  }
  const tree = win.threadTree;
  const firstVisibleIndex = tree.getFirstVisibleIndex();
  const lastVisibleIndex = tree.getLastVisibleIndex();

  if (viewIndex < firstVisibleIndex || viewIndex > lastVisibleIndex) {
    throw new Error(
      "View index " +
        viewIndex +
        " is not visible! (" +
        firstVisibleIndex +
        "-" +
        lastVisibleIndex +
        " are visible)"
    );
  }
}

/**
 * Assert that the given message is now shown in the current view.
 */
export function assert_not_shown(aMessages) {
  const win = get_about_3pane();
  aMessages.forEach(function (msg) {
    const viewIndex = win.gDBView.findIndexOfMsgHdr(msg, false);
    if (viewIndex !== nsMsgViewIndex_None) {
      throw new Error(
        "Message shows; " + msg.messageKey + ": " + msg.mime2DecodedSubject
      );
    }
  });
}

/**
 * @param {boolean} aShouldBeElided - Should the messages at the view indices be elided?
 * @param {...*} aArgs - Arguments of the form processed by
 *     |_process_row_message_arguments|.
 */
function _assert_elided_helper(aShouldBeElided, ...aArgs) {
  const [troller, viewIndices] = _process_row_message_arguments(...aArgs);

  const dbView = get_db_view(troller);
  for (const viewIndex of viewIndices) {
    const flags = dbView.getFlagsAt(viewIndex);
    if (Boolean(flags & Ci.nsMsgMessageFlags.Elided) != aShouldBeElided) {
      throw new Error(
        "Message at view index " +
          viewIndex +
          (aShouldBeElided
            ? " should be elided but is not!"
            : " should not be elided but is!")
      );
    }
  }
}

/**
 * Assert that all of the messages at the given view indices are collapsed.
 * Arguments should be of the type accepted by |assert_selected_and_displayed|.
 */
export function assert_collapsed(...aArgs) {
  _assert_elided_helper(true, ...aArgs);
}

/**
 * Assert that all of the messages at the given view indices are expanded.
 * Arguments should be of the type accepted by |assert_selected_and_displayed|.
 */
export function assert_expanded(...aArgs) {
  _assert_elided_helper(false, ...aArgs);
}

/**
 * Add the widget with the given id to the toolbar if it is not already present.
 *  It gets added to the front if we add it.  Use |remove_from_toolbar| to
 *  remove the widget from the toolbar when you are done.
 *
 * @param {Element} aToolbarElement - The DOM element that is the toolbar,
 *   like you would get from getElementById.
 * @param {string} aElementId  -The id attribute of the toolbaritem item you want added to
 *     the toolbar (not the id of the thing inside the toolbaritem tag!).
 *     We take the id name rather than element itself because if not already
 *     present the element is off floating in DOM limbo.  (The toolbar widget
 *     calls removeChild on the palette.)
 */
export function add_to_toolbar(aToolbarElement, aElementId) {
  const currentSet = aToolbarElement.currentSet.split(",");
  if (!currentSet.includes(aElementId)) {
    currentSet.unshift(aElementId);
    aToolbarElement.currentSet = currentSet.join(",");
  }
}

/**
 * Remove the widget with the given id from the toolbar if it is present.  Use
 *  |add_to_toolbar| to add the item in the first place.
 *
 * @param {Element} aToolbarElement - The DOM element that is the toolbar,
 *   like you would get from getElementById.
 * @param {string} aElementId - The id attribute of the item you want removed
 *   to the toolbar.
 */
export function remove_from_toolbar(aToolbarElement, aElementId) {
  const currentSet = aToolbarElement.currentSet.split(",");
  if (currentSet.includes(aElementId)) {
    currentSet.splice(currentSet.indexOf(aElementId), 1);
    aToolbarElement.currentSet = currentSet.join(",");
  }
}

var RECOGNIZED_WINDOWS = ["messagepane", "multimessage"];
var RECOGNIZED_ELEMENTS = ["folderTree", "threadTree", "attachmentList"];

/**
 * Focus the folder tree.
 */
export function focus_folder_tree() {
  const folderTree = get_about_3pane().document.getElementById("folderTree");
  Assert.ok(BrowserTestUtils.isVisible(folderTree), "folder tree is visible");
  folderTree.focus();
}

/**
 * Focus the thread tree.
 */
export function focus_thread_tree() {
  const threadTree = get_about_3pane().document.getElementById("threadTree");
  threadTree.table.body.focus();
}

/**
 * Focus the (single) message pane.
 */
export function focus_message_pane() {
  const messageBrowser =
    get_about_3pane().document.getElementById("messageBrowser");
  Assert.ok(
    BrowserTestUtils.isVisible(messageBrowser),
    "message browser is visible"
  );
  messageBrowser.focus();
}

/**
 * Focus the multimessage pane.
 */
export function focus_multimessage_pane() {
  const multiMessageBrowser = get_about_3pane().document.getElementById(
    "multiMessageBrowser"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(multiMessageBrowser),
    "multi message browser is visible"
  );
  multiMessageBrowser.focus();
}

/**
 * Returns a string indicating whatever's currently focused. This will return
 * either one of the strings in RECOGNIZED_WINDOWS/RECOGNIZED_ELEMENTS or null.
 */
function _get_currently_focused_thing() {
  // If the message pane or multimessage is focused, return that
  const focusedWindow = mc.document.commandDispatcher.focusedWindow;
  if (focusedWindow) {
    for (const windowId of RECOGNIZED_WINDOWS) {
      const elem = mc.document.getElementById(windowId);
      if (elem && focusedWindow == elem.contentWindow) {
        return windowId;
      }
    }
  }

  // Focused window not recognized, let's try the focused element.
  // If an element is focused, it is necessary for the main window to be
  // focused.
  if (focusedWindow != mc) {
    return null;
  }

  let focusedElement = mc.document.commandDispatcher.focusedElement;
  const elementsToMatch = RECOGNIZED_ELEMENTS.map(elem =>
    mc.document.getElementById(elem)
  );
  while (focusedElement && !elementsToMatch.includes(focusedElement)) {
    focusedElement = focusedElement.parentNode;
  }

  return focusedElement ? focusedElement.id : null;
}

function _assert_thing_focused(aThing) {
  const focusedThing = _get_currently_focused_thing();
  if (focusedThing != aThing) {
    throw new Error(
      "The currently focused thing should be " +
        aThing +
        ", but is actually " +
        focusedThing
    );
  }
}

/**
 * Assert that the folder tree is focused.
 */
export function assert_folder_tree_focused() {
  Assert.equal(get_about_3pane().document.activeElement.id, "folderTree");
}

/**
 * Assert that the thread tree is focused.
 */
export function assert_thread_tree_focused() {
  const about3Pane = get_about_3pane();
  Assert.equal(
    about3Pane.document.activeElement,
    about3Pane.threadTree.table.body
  );
}

/**
 * Assert that the (single) message pane is focused.
 */
export function assert_message_pane_focused() {
  // TODO: this doesn't work.
  // let aboutMessageWin =  get_about_3pane_or_about_message();
  // ready_about_win(aboutMessageWin);
  // Assert.equal(
  //   aboutMessageWin.document.activeElement.id,
  //   "messageBrowser"
  // );
}

/**
 * Assert that the multimessage pane is focused.
 */
export function assert_multimessage_pane_focused() {
  _assert_thing_focused("multimessage");
}

/**
 * Assert that the attachment list is focused.
 */
export function assert_attachment_list_focused() {
  _assert_thing_focused("attachmentList");
}

function _normalize_folder_view_index(aViewIndex, aWin = mc) {
  if (aViewIndex < 0) {
    return (
      aWin.folderTreeView.QueryInterface(Ci.nsITreeView).rowCount + aViewIndex
    );
  }
  return aViewIndex;
}

/**
 * Helper function for use by assert_folders_selected /
 * assert_folders_selected_and_displayed / assert_folder_displayed.
 */
function _process_row_folder_arguments(...aArgs) {
  let troller = mc;
  // - normalize into desired selected view indices
  const desiredFolders = [];
  for (const arg of aArgs) {
    // An integer identifying a view index
    if (typeof arg == "number") {
      const folder = troller.folderTreeView.getFolderForIndex(
        _normalize_folder_view_index(arg)
      );
      if (!folder) {
        throw new Error("Folder index not present in folder view: " + arg);
      }
      desiredFolders.push(folder);
    } else if (arg instanceof Ci.nsIMsgFolder) {
      // A folder
      desiredFolders.push(arg);
    } else if (arg.length == 2 && typeof arg[0] == "number") {
      // A list containing two integers, indicating a range of view indices.
      const lowIndex = _normalize_folder_view_index(arg[0]);
      const highIndex = _normalize_folder_view_index(arg[1]);
      for (let viewIndex = lowIndex; viewIndex <= highIndex; viewIndex++) {
        desiredFolders.push(
          troller.folderTreeView.getFolderForIndex(viewIndex)
        );
      }
    } else if (arg.length !== undefined) {
      // a List of folders
      for (let iFolder = 0; iFolder < arg.length; iFolder++) {
        const folder = arg[iFolder].QueryInterface(Ci.nsIMsgFolder);
        if (!folder) {
          throw new Error(arg[iFolder] + " is not a folder!");
        }
        desiredFolders.push(folder);
      }
    } else if (arg) {
      // It's a Window.
      troller = arg;
    } else {
      throw new Error("Illegal argument: " + arg);
    }
  }
  // we can't really sort, so you'll have to grin and bear it
  return [troller, desiredFolders];
}

/**
 * Asserts that the given set of folders is selected.  Unless you are dealing
 *  with transient selections resulting from right-clicks, you want to be using
 *  assert_folders_selected_and_displayed because it makes sure that the
 *  display is correct too.
 *
 * The arguments consist of one or more of the following:
 * - A Window, indicating we should use that window instead of
 *   the default, "mc" (corresponding to the 3pane.)  Pass this first!
 * - An integer identifying a view index.
 * - A list containing two integers, indicating a range of view indices.
 * - An nsIMsgFolder.
 * - A list of nsIMsgFolders.
 */
export function assert_folders_selected(...aArgs) {
  const [troller, desiredFolders] = _process_row_folder_arguments(...aArgs);

  const win = get_about_3pane();
  const folderTree = win.document.getElementById("folderTree");
  // - get the actual selection (already sorted by integer value)
  const uri = folderTree.rows[folderTree.selectedIndex]?.uri;
  const selectedFolders = [MailServices.folderLookup.getFolderForURL(uri)];

  // - test selection equivalence
  // no shortcuts here. check if each folder in either array is present in the
  // other array
  if (
    desiredFolders.some(
      folder => _non_strict_index_of(selectedFolders, folder) == -1
    ) ||
    selectedFolders.some(
      folder => _non_strict_index_of(desiredFolders, folder) == -1
    )
  ) {
    throw new Error(
      "Desired selection is: " +
        _prettify_folder_array(desiredFolders) +
        " but actual " +
        "selection is: " +
        _prettify_folder_array(selectedFolders)
    );
  }

  return [troller, desiredFolders];
}

export var assert_folder_selected = assert_folders_selected;

/**
 * Assert that the given folder is displayed, but not necessarily selected.
 * Unless you are dealing with transient selection issues, you really should
 * be using assert_folders_selected_and_displayed.
 *
 * The arguments consist of one or more of the following:
 * - A Window, indicating we should use that window instead of
 *   the default, "mc" (corresponding to the 3pane.)  Pass this first!
 * - An integer identifying a view index.
 * - A list containing two integers, indicating a range of view indices.
 * - An nsIMsgFolder.
 * - A list of nsIMsgFolders.
 *
 * In each case, since we can only have one folder displayed, we only look at
 * the first folder you pass in.
 */
export function assert_folder_displayed(...aArgs) {
  const [troller, desiredFolders] = _process_row_folder_arguments(...aArgs);
  Assert.equal(troller.gFolderDisplay.displayedFolder, desiredFolders[0]);
}

/**
 * Asserts that the folders corresponding to the one or more folder spec
 * arguments are selected and displayed. If you specify multiple folders,
 * we verify that all of them are selected and that the first folder you pass
 * in is the one displayed. (If you don't pass in any folders, we can't assume
 * anything, so we don't test that case.)
 *
 * The arguments consist of one or more of the following:
 * - A Window, indicating we should use that window instead of
 *   the default, "mc" (corresponding to the 3pane.)  Pass this first!
 * - An integer identifying a view index.
 * - A list containing two integers, indicating a range of view indices.
 * - An nsIMsgFolder.
 * - A list of nsIMsgFolders.
 */
export function assert_folders_selected_and_displayed(...aArgs) {
  const [, desiredFolders] = assert_folders_selected(...aArgs);
  if (desiredFolders.length > 0) {
    const win = get_about_3pane();
    Assert.equal(win.gFolder, desiredFolders[0]);
  }
}

export var assert_folder_selected_and_displayed =
  assert_folders_selected_and_displayed;

/**
 * Assert that there are the given number of rows (not including children of
 * collapsed parents) in the folder tree view.
 */
export function assert_folder_tree_view_row_count(aCount) {
  const about3Pane = get_about_3pane();
  if (about3Pane.folderTree.rowCount != aCount) {
    throw new Error(
      "The folder tree view's row count should be " +
        aCount +
        ", but is actually " +
        about3Pane.folderTree.rowCount
    );
  }
}

/**
 * Assert that the displayed text of the folder at index n equals to str.
 */
export function assert_folder_at_index_as(n, str) {
  const folderN = mc.gFolderTreeView.getFTVItemForIndex(n);
  Assert.equal(folderN.text, str);
}

/**
 * Since indexOf does strict equality checking, we need this.
 */
function _non_strict_index_of(aArray, aSearchElement) {
  for (const [i, item] of aArray.entries()) {
    if (item == aSearchElement) {
      return i;
    }
  }
  return -1;
}

function _prettify_folder_array(aArray) {
  return aArray.map(folder => folder.prettyName).join(", ");
}

/**
 * Put the view in unthreaded mode.
 */
export async function make_display_unthreaded() {
  await wait_for_message_display_completion();
  get_about_3pane().gViewWrapper.showUnthreaded = true;
  // drain event queue
  await TestUtils.waitForTick();
  await wait_for_message_display_completion();
}

/**
 * Put the view in threaded mode.
 */
export async function make_display_threaded() {
  await wait_for_message_display_completion();
  get_about_3pane().gViewWrapper.showThreaded = true;
  // drain event queue
  await TestUtils.waitForTick();
}

/**
 * Put the view in group-by-sort mode.
 */
export async function make_display_grouped() {
  await wait_for_message_display_completion();
  get_about_3pane().gViewWrapper.showGroupedBySort = true;
  // drain event queue
  await TestUtils.waitForTick();
}

/**
 * Collapse all threads in the current view.
 */
export async function collapse_all_threads() {
  await wait_for_message_display_completion();
  get_about_3pane().commandController.doCommand("cmd_collapseAllThreads");
  // drain event queue
  await TestUtils.waitForTick();
}

/**
 * Set the mail view filter for the current view. The aData parameter is for
 * tags (e.g. you can specify "$label1" for the first tag).
 */
export async function set_mail_view(aMailViewIndex, aData) {
  await wait_for_message_display_completion();
  get_about_3pane().gViewWrapper.setMailView(aMailViewIndex, aData);
  await wait_for_all_messages_to_load();
  await wait_for_message_display_completion();
  // drain event queue
  await TestUtils.waitForTick();
}

/**
 * Expand all threads in the current view.
 */
export async function expand_all_threads() {
  await wait_for_message_display_completion();
  get_about_3pane().commandController.doCommand("cmd_expandAllThreads");
  // drain event queue
  await TestUtils.waitForTick();
}

/**
 * Set the mail.openMessageBehavior pref.
 *
 * @param {string} aPref - One of "NEW_WINDOW", "EXISTING_WINDOW" or "NEW_TAB".
 */
export function set_open_message_behavior(aPref) {
  Services.prefs.setIntPref(
    "mail.openMessageBehavior",
    MailConsts.OpenMessageBehavior[aPref]
  );
}

/**
 * Reset the mail.openMessageBehavior pref.
 */
export function reset_open_message_behavior() {
  if (Services.prefs.prefHasUserValue("mail.openMessageBehavior")) {
    Services.prefs.clearUserPref("mail.openMessageBehavior");
  }
}

/**
 * Set the mail.tabs.loadInBackground pref.
 *
 * @param {boolean} aPref - true/false.
 */
export function set_context_menu_background_tabs(aPref) {
  Services.prefs.setBoolPref("mail.tabs.loadInBackground", aPref);
}

/**
 * Reset the mail.tabs.loadInBackground pref.
 */
export function reset_context_menu_background_tabs() {
  if (Services.prefs.prefHasUserValue("mail.tabs.loadInBackground")) {
    Services.prefs.clearUserPref("mail.tabs.loadInBackground");
  }
}

/**
 * Set the mail.close_message_window.on_delete pref.
 *
 * @param {boolean} aPref - true/false.
 */
export function set_close_message_on_delete(aPref) {
  Services.prefs.setBoolPref("mail.close_message_window.on_delete", aPref);
}

/**
 * Reset the mail.close_message_window.on_delete pref.
 */
export function reset_close_message_on_delete() {
  if (Services.prefs.prefHasUserValue("mail.close_message_window.on_delete")) {
    Services.prefs.clearUserPref("mail.close_message_window.on_delete");
  }
}

/**
 * assert that the multimessage/thread summary view contains
 * the specified number of elements of the specified selector.
 *
 * @param {string} aSelector - The CSS selector to use to select
 * @param {integer} aNumElts - The number of expected elements that have that class
 */

export function assert_summary_contains_N_elts(aSelector, aNumElts) {
  const htmlframe = mc.document.getElementById("multimessage");
  const matches = htmlframe.contentDocument.querySelectorAll(aSelector);
  if (matches.length != aNumElts) {
    throw new Error(
      "Expected to find " +
        aNumElts +
        " elements with selector '" +
        aSelector +
        "', found: " +
        matches.length
    );
  }
}

export function throw_and_dump_view_state(aMessage, aWin) {
  dump("******** " + aMessage + "\n");
  dump_view_state(get_db_view(aWin));
  throw new Error(aMessage);
}

/**
 * Copy constants from mailWindowOverlay.js
 */

export var kClassicMailLayout = 0;

export var kWideMailLayout = 1;
export var kVerticalMailLayout = 2;

/**
 * Assert that the expected mail pane layout is shown.
 *
 * @param {integer} aLayout - Layout code.
 */
export function assert_pane_layout(aLayout) {
  const actualPaneLayout = Services.prefs.getIntPref(
    "mail.pane_config.dynamic"
  );
  if (actualPaneLayout != aLayout) {
    throw new Error(
      "The mail pane layout should be " +
        aLayout +
        ", but is actually " +
        actualPaneLayout
    );
  }
}

/**
 * Change the current mail pane layout.
 *
 * @param {integer} aLayout - Layout code.
 */
export function set_pane_layout(aLayout) {
  Services.prefs.setIntPref("mail.pane_config.dynamic", aLayout);
}

/**
 * Toggle visibility of the Main menu bar.
 *
 * @param {boolean} aEnabled - Whether the menu should be shown or not.
 */
export async function toggle_main_menu(aEnabled = true) {
  const menubar = mc.document.getElementById("toolbar-menubar");
  const state = menubar.getAttribute("autohide") != "true";
  menubar.setAttribute("autohide", !aEnabled);
  await TestUtils.waitForTick();
  return state;
}
