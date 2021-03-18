/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Session Storage Tests. Session Restoration Tests are currently implemented in
 * folder-display/test-message-pane-visibility.js.
 */

"use strict";

var { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
);

var controller = ChromeUtils.import(
  "resource://testing-common/mozmill/controller.jsm"
);
var EventUtils = ChromeUtils.import(
  "resource://testing-common/mozmill/EventUtils.jsm"
);
var utils = ChromeUtils.import("resource://testing-common/mozmill/utils.jsm");

var {
  assert_message_pane_hidden,
  assert_message_pane_visible,
  assert_pane_layout,
  be_in_folder,
  create_folder,
  kClassicMailLayout,
  kVerticalMailLayout,
  make_new_sets_in_folder,
  mc,
  set_mc,
  set_pane_layout,
  toggle_message_pane,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var {
  close_window,
  plan_for_new_window,
  plan_for_window_close,
  wait_for_new_window,
  wait_for_window_close,
} = ChromeUtils.import("resource://testing-common/mozmill/WindowHelpers.jsm");

var { FileUtils } = ChromeUtils.import("resource://gre/modules/FileUtils.jsm");
var { SessionStoreManager } = ChromeUtils.import(
  "resource:///modules/SessionStoreManager.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var folderA, folderB;

// Default JSONFile save delay with saveSoon().
var kSaveDelayMs = 1500;

// With async file writes, use a delay larger than the session autosave timer.
var asyncFileWriteDelayMS = 3000;

/* ........ Helper Functions ................*/

/**
 * Reads the contents of the session file into a JSON object.
 */
async function readFile2() {
  try {
    return await IOUtils.readJSON(SessionStoreManager.sessionFile.path);
  } catch (ex) {
    if (!["NotFoundError"].includes(ex.name)) {
      Cu.reportError(ex);
    }
    // fall through and return null if the session file cannot be read
    // or is bad
    dump(ex + "\n");
  }
  return null;
}

/**
 * Reads the contents of the session file into a JSON object.
 * FIXME: readFile2 should really be used instead. For some weird reason using
 * that, OR making this function async (+ await the results) will
 * not work - seem like the file reading just dies (???)
 * So use the sync file reading for now...
 */
function readFile() {
  let data = mailTestUtils.loadFileToString(SessionStoreManager.sessionFile);
  return JSON.parse(data);
}

function waitForFileRefresh() {
  controller.sleep(kSaveDelayMs);
  utils.waitFor(
    () => SessionStoreManager.sessionFile.exists(),
    "session file should exist"
  );
  controller.sleep(asyncFileWriteDelayMS);
}

function open3PaneWindow() {
  plan_for_new_window("mail:3pane");
  Services.ww.openWindow(
    null,
    "chrome://messenger/content/messenger.xhtml",
    "",
    "all,chrome,dialog=no,status,toolbar",
    null
  );
  return wait_for_new_window("mail:3pane");
}

function openAddressBook() {
  plan_for_new_window("mail:addressbook");
  Services.ww.openWindow(
    null,
    "chrome://messenger/content/addressbook/addressbook.xhtml",
    "",
    "all,chrome,dialog=no,status,toolbar",
    null
  );
  return wait_for_new_window("mail:addressbook");
}

/* :::::::: The Tests ::::::::::::::: */

add_task(function setupModule(module) {
  folderA = create_folder("SessionStoreA");
  make_new_sets_in_folder(folderA, [{ count: 3 }]);

  folderB = create_folder("SessionStoreB");
  make_new_sets_in_folder(folderB, [{ count: 3 }]);

  SessionStoreManager.stopPeriodicSave();

  // Opt out of calendar promotion so we don't show the "ligthing now
  // integrated" notification bar (which gives us unexpected heights).
  Services.prefs.setBoolPref("calendar.integration.notify", false);
});

registerCleanupFunction(function teardownModule(module) {
  folderA.server.rootFolder.propagateDelete(folderA, true, null);
  folderB.server.rootFolder.propagateDelete(folderB, true, null);

  Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit);
});

add_task(function test_periodic_session_persistence_simple() {
  // delete the session file if it exists
  let sessionFile = SessionStoreManager.sessionFile;
  if (sessionFile.exists()) {
    sessionFile.remove(false);
  }

  utils.waitFor(() => !sessionFile.exists(), "session file should not exist");

  // change some state to guarantee the file will be recreated
  // if periodic session persistence works
  be_in_folder(folderA);

  // if periodic session persistence is working, the file should be
  // re-created
  SessionStoreManager._saveState();
  waitForFileRefresh();
});

add_task(function test_periodic_nondirty_session_persistence() {
  // This changes state.
  be_in_folder(folderB);

  SessionStoreManager._saveState();
  waitForFileRefresh();

  // delete the session file
  let sessionFile = SessionStoreManager.sessionFile;
  sessionFile.remove(false);

  // Since the state of the session hasn't changed since last _saveState(),
  // the session file should not be re-created.
  SessionStoreManager._saveState();
  controller.sleep(kSaveDelayMs + asyncFileWriteDelayMS);

  utils.waitFor(() => !sessionFile.exists(), "session file should not exist");
});

add_task(async function test_single_3pane_periodic_session_persistence() {
  be_in_folder(folderA);

  // get the state object. this assumes there is one and only one
  // 3pane window.
  let mail3PaneWindow = Services.wm.getMostRecentWindow("mail:3pane");
  let state = mail3PaneWindow.getWindowStateForSessionPersistence();

  SessionStoreManager._saveState();
  waitForFileRefresh();

  // load the saved state from disk
  let loadedState = readFile();
  Assert.ok(loadedState, "previously saved state should be non-null");

  // get the state object for the one and only one 3pane window
  let windowState = loadedState.windows[0];
  Assert.ok(
    JSON.stringify(windowState) == JSON.stringify(state),
    "saved state and loaded state should be equal"
  );
});

function test_restore_single_3pane_persistence() {
  be_in_folder(folderA);
  toggle_message_pane();
  assert_message_pane_hidden();

  // get the state object. this assumes there is one and only one
  // 3pane window.
  let mail3PaneWindow = Services.wm.getMostRecentWindow("mail:3pane");

  // make sure we have a different window open, so that we don't start shutting
  // down just because the last window was closed
  let abwc = openAddressBook();

  // close the 3pane window
  close_window(new controller.MozMillController(mail3PaneWindow));
  // Wait for window close async session write to finish.
  controller.sleep(asyncFileWriteDelayMS);

  mc = open3PaneWindow();
  set_mc(mc);
  be_in_folder(folderA);
  assert_message_pane_hidden();
  // restore message pane.
  toggle_message_pane();

  // We don't need the address book window any more.
  plan_for_window_close(abwc);
  abwc.window.close();
  wait_for_window_close();
}
add_task(test_restore_single_3pane_persistence);

add_task(function test_restore_single_3pane_persistence_again() {
  // test that repeating the save w/o changing the state restores
  // correctly.
  test_restore_single_3pane_persistence();
});

add_task(function test_message_pane_height_persistence() {
  be_in_folder(folderA);
  assert_message_pane_visible();
  assert_pane_layout(kClassicMailLayout);

  // Get the state object. This assumes there is one and only one
  // 3pane window.
  let mail3PaneWindow = Services.wm.getMostRecentWindow("mail:3pane");

  let oldHeight = mc.e("messagepaneboxwrapper").clientHeight;
  let minHeight = Math.floor(
    mc.e("messagepaneboxwrapper").getAttribute("minheight")
  );
  let newHeight = Math.floor((minHeight + oldHeight) / 2);
  let diffHeight = oldHeight - newHeight;

  Assert.notEqual(
    oldHeight,
    newHeight,
    "To really perform a test the new message pane height should be " +
      "should be different from the old one but they are the same: " +
      newHeight
  );

  _move_splitter(mc.e("threadpane-splitter"), 0, diffHeight);

  // Check that the moving of the threadpane-splitter resulted in the correct height.
  let actualHeight = mc.e("messagepaneboxwrapper").clientHeight;

  Assert.equal(
    newHeight,
    actualHeight,
    "The message pane height should be " +
      newHeight +
      ", but is actually " +
      actualHeight +
      ". The oldHeight was: " +
      oldHeight
  );

  // Make sure we have a different window open, so that we don't start shutting
  // down just because the last window was closed.
  let abwc = openAddressBook();

  // The 3pane window is closed.
  close_window(new controller.MozMillController(mail3PaneWindow));
  // Wait for window close async session write to finish.
  controller.sleep(asyncFileWriteDelayMS);

  mc = open3PaneWindow();
  set_mc(mc);
  be_in_folder(folderA);
  assert_message_pane_visible();

  actualHeight = mc.e("messagepaneboxwrapper").clientHeight;

  Assert.equal(
    newHeight,
    actualHeight,
    "The message pane height should be " +
      newHeight +
      ", but is actually " +
      actualHeight +
      ". The oldHeight was: " +
      oldHeight
  );

  // The old height is restored.
  _move_splitter(mc.e("threadpane-splitter"), 0, -diffHeight);

  // The 3pane window is closed.
  close_window(mc);
  // Wait for window close async session write to finish.
  controller.sleep(asyncFileWriteDelayMS);

  mc = open3PaneWindow();
  set_mc(mc);
  be_in_folder(folderA);
  assert_message_pane_visible();

  actualHeight = mc.e("messagepaneboxwrapper").clientHeight;
  Assert.equal(
    oldHeight,
    actualHeight,
    "The message pane height should be " +
      oldHeight +
      ", but is actually " +
      actualHeight
  );

  // We don't need the address book window any more.
  plan_for_window_close(abwc);
  abwc.window.close();
  wait_for_window_close();
});

add_task(function test_message_pane_width_persistence() {
  be_in_folder(folderA);
  assert_message_pane_visible();

  // At the beginning we are in classic layout.  We will switch to
  // vertical layout to test the width, and then back to classic layout.
  assert_pane_layout(kClassicMailLayout);
  set_pane_layout(kVerticalMailLayout);
  assert_pane_layout(kVerticalMailLayout);

  // Get the state object. This assumes there is one and only one
  // 3pane window.
  let mail3PaneWindow = Services.wm.getMostRecentWindow("mail:3pane");

  let oldWidth = mc.e("messagepaneboxwrapper").clientWidth;
  let minWidth = Math.floor(
    mc.e("messagepaneboxwrapper").getAttribute("minwidth")
  );
  let newWidth = Math.floor((minWidth + oldWidth) / 2);
  let diffWidth = oldWidth - newWidth;

  Assert.notEqual(
    newWidth,
    oldWidth,
    "To really perform a test the new message pane width should be " +
      "should be different from the old one but they are the same: " +
      newWidth
  );

  // We move the threadpane-splitter and not the folderpane_splitter because
  // we are in vertical layout.
  _move_splitter(mc.e("threadpane-splitter"), diffWidth, 0);
  // Check that the moving of the folderpane_splitter resulted in the correct width.
  let actualWidth = mc.e("messagepaneboxwrapper").clientWidth;

  // FIXME: For whatever reasons the new width is off by one pixel on Mac OSX
  // But this test case is not for testing moving around a splitter but for
  // persistency. Therefore it is enough if the actual width is equal to the
  // the requested width plus/minus one pixel.
  assert_equals_fuzzy(
    newWidth,
    actualWidth,
    1,
    "The message pane width should be " +
      newWidth +
      ", but is actually " +
      actualWidth +
      ". The oldWidth was: " +
      oldWidth
  );
  newWidth = actualWidth;

  // Make sure we have a different window open, so that we don't start shutting
  // down just because the last window was closed
  let abwc = openAddressBook();

  // The 3pane window is closed.
  close_window(new controller.MozMillController(mail3PaneWindow));
  // Wait for window close async session write to finish.
  controller.sleep(asyncFileWriteDelayMS);

  mc = open3PaneWindow();
  set_mc(mc);
  be_in_folder(folderA);
  assert_message_pane_visible();
  assert_pane_layout(kVerticalMailLayout);

  actualWidth = mc.e("messagepaneboxwrapper").clientWidth;
  Assert.equal(
    newWidth,
    actualWidth,
    "The message pane width should be " +
      newWidth +
      ", but is actually " +
      actualWidth
  );

  // The old width is restored.
  _move_splitter(mc.e("threadpane-splitter"), -diffWidth, 0);
  actualWidth = mc.e("messagepaneboxwrapper").clientWidth;

  // FIXME: For whatever reasons the new width is off by two pixels on Mac OSX
  // But this test case is not for testing moving around a splitter but for
  // persistency. Therefore it is enough if the actual width is equal to the
  // the requested width plus/minus two pixels.
  assert_equals_fuzzy(
    oldWidth,
    actualWidth,
    2,
    "The message pane width should be " +
      oldWidth +
      ", but is actually " +
      actualWidth
  );
  oldWidth = actualWidth;

  // The 3pane window is closed.
  close_window(mc);
  // Wait for window close async session write to finish.
  controller.sleep(asyncFileWriteDelayMS);

  mc = open3PaneWindow();
  set_mc(mc);
  be_in_folder(folderA);
  assert_message_pane_visible();
  assert_pane_layout(kVerticalMailLayout);

  actualWidth = mc.e("messagepaneboxwrapper").clientWidth;
  Assert.equal(
    oldWidth,
    actualWidth,
    "The message pane width should be " +
      oldWidth +
      ", but is actually " +
      actualWidth
  );

  // The layout is reset to classical mail layout.
  set_pane_layout(kClassicMailLayout);
  assert_pane_layout(kClassicMailLayout);

  // We don't need the address book window any more.
  plan_for_window_close(abwc);
  abwc.window.close();
  wait_for_window_close();
});

add_task(async function test_multiple_3pane_periodic_session_persistence() {
  // open a few more 3pane windows
  for (var i = 0; i < 3; ++i) {
    open3PaneWindow();
  }

  // then get the state objects for each window
  let state = [];
  for (let window of Services.wm.getEnumerator("mail:3pane")) {
    state.push(window.getWindowStateForSessionPersistence());
  }

  SessionStoreManager._saveState();
  waitForFileRefresh();

  // load the saved state from disk
  let loadedState = readFile();

  Assert.ok(loadedState, "previously saved state should be non-null");

  Assert.equal(
    loadedState.windows.length,
    state.length,
    "number of windows in saved state and loaded state should be equal"
  );

  for (let i = 0; i < state.length; ++i) {
    Assert.ok(
      JSON.stringify(loadedState.windows[i]) == JSON.stringify(state[i]),
      "saved state and loaded state should be equal"
    );
  }

  // close all but one 3pane window
  let windows = Services.wm.getEnumerator("mail:3pane");
  for (let win of windows) {
    win.close();
  }
});

async function test_bad_session_file_simple() {
  // forcefully write a bad session file
  let data = "BAD SESSION FILE";
  let fos = FileUtils.openSafeFileOutputStream(SessionStoreManager.sessionFile);
  fos.write(data, data.length);
  FileUtils.closeSafeFileOutputStream(fos);

  // tell the session store manager to try loading the bad session file.
  // NOTE: periodic session persistence is not enabled in this test
  SessionStoreManager._store = null;
  await SessionStoreManager._loadSessionFile();

  // since the session file is bad, the session store manager's state field
  // should be null
  Assert.ok(
    !SessionStoreManager._initialState,
    "saved state is bad so state object should be null"
  );

  // The bad session file should now not exist.
  utils.waitFor(
    () => !SessionStoreManager.sessionFile.exists(),
    "session file should now not exist"
  );
}

add_task(async function test_clean_shutdown_session_persistence_simple() {
  // open a few more 3pane windows
  for (var i = 0; i < 3; ++i) {
    open3PaneWindow();
  }

  // make sure we have a different window open, so that we don't start shutting
  // down just because the last window was closed
  let abwc = openAddressBook();

  // close all the 3pane windows
  let lastWindowState = null;
  let enumerator = Services.wm.getEnumerator("mail:3pane");
  for (let window of enumerator) {
    if (!enumerator.hasMoreElements()) {
      lastWindowState = window.getWindowStateForSessionPersistence();
    }

    close_window(new controller.MozMillController(window));
  }

  // Wait for session file to be created (removed in prior test) after
  // all 3pane windows close and for session write to finish.
  waitForFileRefresh();

  // load the saved state from disk
  let loadedState = readFile();
  Assert.ok(loadedState, "previously saved state should be non-null");

  Assert.equal(
    loadedState.windows.length,
    1,
    "only the state of the last 3pane window should have been saved"
  );

  // get the state object for the one and only one 3pane window
  let windowState = loadedState.windows[0];
  Assert.ok(
    JSON.stringify(windowState) == JSON.stringify(lastWindowState),
    "saved state and loaded state should be equal"
  );

  open3PaneWindow();

  // We don't need the address book window any more.
  plan_for_window_close(abwc);
  abwc.window.close();
  wait_for_window_close();
});

/*
 * A set of private helper functions for drag'n'drop
 * These functions are inspired by tabmail/test-tabmail-dragndrop.js
 */

function _move_splitter(aSplitter, aDiffX, aDiffY) {
  // catch the splitter in the middle
  let rect = aSplitter.getBoundingClientRect();
  let middleX = Math.round(rect.width / 2);
  let middleY = Math.round(rect.height / 2);
  EventUtils.synthesizeMouse(
    aSplitter,
    middleX,
    middleY,
    { type: "mousedown" },
    mc.window
  );
  EventUtils.synthesizeMouse(
    aSplitter,
    aDiffX + middleX,
    aDiffY + middleY,
    { type: "mousemove" },
    mc.window
  );
  // release the splitter
  EventUtils.synthesizeMouse(aSplitter, 0, 0, { type: "mouseup" }, mc.window);
}

/**
 * Helper function that checks the fuzzy equivalence of two numeric
 * values against some given tolerance.
 *
 * @param aLeft one value to check equivalence with
 * @param aRight the other value to check equivalence with
 * @param aTolerance how fuzzy can our equivalence be?
 * @param aMessage the message to give off if we're outside of tolerance.
 */
function assert_equals_fuzzy(aLeft, aRight, aTolerance, aMessage) {
  Assert.ok(Math.abs(aLeft - aRight) <= aTolerance, aMessage);
}

// XXX todo
// - crash test: not sure if this test should be here. restoring a crashed
//               session depends on periodically saved session data (there is
//               already a test for this). session restoration tests do not
//               belong here. see test-message-pane-visibility.
//               when testing restoration in test-message-pane-visibility, also
//               include test of bad session file.
// ..............maybe we should move all session restoration related tests
// ..............here.
