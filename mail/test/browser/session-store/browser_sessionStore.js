/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Session Storage Tests. Session Restoration Tests are currently implemented in
 * folder-display/browser_messagePaneVisibility.js.
 */

"use strict";

var { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
);

var {
  assert_message_pane_hidden,
  assert_message_pane_visible,
  assert_pane_layout,
  be_in_folder,
  create_folder,
  kClassicMailLayout,
  kVerticalMailLayout,
  make_message_sets_in_folders,
  set_mc,
  set_pane_layout,
  toggle_message_pane,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { promise_new_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var { SessionStoreManager } = ChromeUtils.import(
  "resource:///modules/SessionStoreManager.jsm"
);

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
      console.error(ex);
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
  const data = mailTestUtils.loadFileToString(SessionStoreManager.sessionFile);
  return JSON.parse(data);
}

async function waitForFileRefresh() {
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, kSaveDelayMs));
  TestUtils.waitForCondition(
    () => SessionStoreManager.sessionFile.exists(),
    "session file should exist"
  );
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, asyncFileWriteDelayMS));
}

async function open3PaneWindow() {
  const newWindowPromise = promise_new_window("mail:3pane");
  Services.ww.openWindow(
    null,
    "chrome://messenger/content/messenger.xhtml",
    "",
    "all,chrome,dialog=no,status,toolbar",
    null
  );
  return newWindowPromise;
}

async function openActivityManager() {
  const activityManagerPromise = promise_new_window("Activity:Manager");
  window.openActivityMgr();
  return activityManagerPromise;
}

/* :::::::: The Tests ::::::::::::::: */

add_setup(async function () {
  folderA = await create_folder("SessionStoreA");
  await make_message_sets_in_folders([folderA], [{ count: 3 }]);

  folderB = await create_folder("SessionStoreB");
  await make_message_sets_in_folders([folderB], [{ count: 3 }]);

  SessionStoreManager.stopPeriodicSave();

  // Opt out of calendar promotion so we don't show the "ligthing now
  // integrated" notification bar (which gives us unexpected heights).
  Services.prefs.setBoolPref("calendar.integration.notify", false);
});

registerCleanupFunction(function () {
  folderA.server.rootFolder.propagateDelete(folderA, true);
  folderB.server.rootFolder.propagateDelete(folderB, true);

  // Some tests that open new windows don't return focus to the main window
  // in a way that satisfies mochitest, and the test times out.
  Services.focus.focusedWindow = window;
  // Focus an element in the main window, then blur it again to avoid it
  // hijacking keypresses.
  const mainWindowElement = document.getElementById("button-appmenu");
  mainWindowElement.focus();
  mainWindowElement.blur();
});

add_task(async function test_periodic_session_persistence_simple() {
  // delete the session file if it exists
  const sessionFile = SessionStoreManager.sessionFile;
  if (sessionFile.exists()) {
    sessionFile.remove(false);
  }

  await TestUtils.waitForCondition(
    () => !sessionFile.exists(),
    "session file should not exist"
  );

  // change some state to guarantee the file will be recreated
  // if periodic session persistence works
  await be_in_folder(folderA);

  // if periodic session persistence is working, the file should be
  // re-created
  SessionStoreManager._saveState();
  await waitForFileRefresh();
});

add_task(async function test_periodic_nondirty_session_persistence() {
  // This changes state.
  await be_in_folder(folderB);

  SessionStoreManager._saveState();
  await waitForFileRefresh();

  // delete the session file
  const sessionFile = SessionStoreManager.sessionFile;
  sessionFile.remove(false);

  // Since the state of the session hasn't changed since last _saveState(),
  // the session file should not be re-created.
  SessionStoreManager._saveState();

  await new Promise(resolve =>
    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    setTimeout(resolve, kSaveDelayMs + asyncFileWriteDelayMS)
  );

  await TestUtils.waitForCondition(
    () => !sessionFile.exists(),
    "session file should not exist"
  );
});

add_task(async function test_single_3pane_periodic_session_persistence() {
  await be_in_folder(folderA);

  // get the state object. this assumes there is one and only one
  // 3pane window.
  const mail3PaneWindow = Services.wm.getMostRecentWindow("mail:3pane");
  const state = mail3PaneWindow.getWindowStateForSessionPersistence();

  SessionStoreManager._saveState();
  await waitForFileRefresh();

  // load the saved state from disk
  const loadedState = readFile();
  Assert.ok(loadedState, "previously saved state should be non-null");

  // get the state object for the one and only one 3pane window
  const windowState = loadedState.windows[0];
  Assert.ok(
    JSON.stringify(windowState) == JSON.stringify(state),
    "saved state and loaded state should be equal"
  );
});

async function test_restore_single_3pane_persistence() {
  await be_in_folder(folderA);
  toggle_message_pane();
  assert_message_pane_hidden();

  // get the state object. this assumes there is one and only one
  // 3pane window.
  const mail3PaneWindow = Services.wm.getMostRecentWindow("mail:3pane");

  // make sure we have a different window open, so that we don't start shutting
  // down just because the last window was closed
  const amWin = await openActivityManager();

  // close the 3pane window
  mail3PaneWindow.close();
  // Wait for window close async session write to finish.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, asyncFileWriteDelayMS));

  const mc2 = await open3PaneWindow();
  set_mc(mc2);
  await be_in_folder(folderA);
  assert_message_pane_hidden();
  // restore message pane.
  toggle_message_pane();

  // We don't need the address book window any more.
  const closePromise = BrowserTestUtils.domWindowClosed(amWin);
  amWin.close();
  await closePromise;
}
add_task(test_restore_single_3pane_persistence).skip(); // Bug 1753963.

add_task(async function test_restore_single_3pane_persistence_again() {
  // test that repeating the save w/o changing the state restores
  // correctly.
  await test_restore_single_3pane_persistence();
}).skip(); // Bug 1753963.

add_task(async function test_message_pane_height_persistence() {
  await be_in_folder(folderA);
  assert_message_pane_visible();
  assert_pane_layout(kClassicMailLayout);

  // Get the state object. This assumes there is one and only one
  // 3pane window.
  const mail3PaneWindow = Services.wm.getMostRecentWindow("mail:3pane");

  const oldHeight = document.getElementById(
    "messagepaneboxwrapper"
  ).clientHeight;
  const minHeight = Math.floor(
    document.getElementById("messagepaneboxwrapper").getAttribute("minheight")
  );
  const newHeight = Math.floor((minHeight + oldHeight) / 2);
  const diffHeight = oldHeight - newHeight;

  Assert.notEqual(
    oldHeight,
    newHeight,
    "To really perform a test the new message pane height should be " +
      "should be different from the old one but they are the same: " +
      newHeight
  );

  _move_splitter(document.getElementById("threadpane-splitter"), 0, diffHeight);

  // Check that the moving of the threadpane-splitter resulted in the correct height.
  let actualHeight = document.getElementById(
    "messagepaneboxwrapper"
  ).clientHeight;

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
  const amWin = await openActivityManager();

  // The 3pane window is closed.
  mail3PaneWindow.close();
  // Wait for window close async session write to finish.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, asyncFileWriteDelayMS));

  const mc2 = await open3PaneWindow();
  set_mc(mc2);
  await be_in_folder(folderA);
  assert_message_pane_visible();

  actualHeight = document.getElementById("messagepaneboxwrapper").clientHeight;

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
  _move_splitter(
    document.getElementById("threadpane-splitter"),
    0,
    -diffHeight
  );

  // The 3pane window is closed.
  await BrowserTestUtils.closeWindow(window);
  // Wait for window close async session write to finish.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, asyncFileWriteDelayMS));

  const mc3 = await open3PaneWindow();
  set_mc(mc3);
  await be_in_folder(folderA);
  assert_message_pane_visible();

  actualHeight = document.getElementById("messagepaneboxwrapper").clientHeight;
  Assert.equal(
    oldHeight,
    actualHeight,
    "The message pane height should be " +
      oldHeight +
      ", but is actually " +
      actualHeight
  );

  // We don't need the address book window any more.
  const closePromise = BrowserTestUtils.domWindowClosed(amWin);
  amWin.close();
  await closePromise;
}).skip(); // Bug 1753963.

add_task(async function test_message_pane_width_persistence() {
  await be_in_folder(folderA);
  assert_message_pane_visible();

  // At the beginning we are in classic layout.  We will switch to
  // vertical layout to test the width, and then back to classic layout.
  assert_pane_layout(kClassicMailLayout);
  set_pane_layout(kVerticalMailLayout);
  assert_pane_layout(kVerticalMailLayout);

  // Get the state object. This assumes there is one and only one
  // 3pane window.
  const mail3PaneWindow = Services.wm.getMostRecentWindow("mail:3pane");

  let oldWidth = document.getElementById("messagepaneboxwrapper").clientWidth;
  const minWidth = Math.floor(
    document.getElementById("messagepaneboxwrapper").getAttribute("minwidth")
  );
  let newWidth = Math.floor((minWidth + oldWidth) / 2);
  const diffWidth = oldWidth - newWidth;

  Assert.notEqual(
    newWidth,
    oldWidth,
    "To really perform a test the new message pane width should be " +
      "should be different from the old one but they are the same: " +
      newWidth
  );

  // We move the threadpane-splitter and not the folderpane_splitter because
  // we are in vertical layout.
  _move_splitter(document.getElementById("threadpane-splitter"), diffWidth, 0);
  // Check that the moving of the folderpane_splitter resulted in the correct width.
  let actualWidth = document.getElementById(
    "messagepaneboxwrapper"
  ).clientWidth;

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
  const amWin = await openActivityManager();

  // The 3pane window is closed.
  mail3PaneWindow.close();
  // Wait for window close async session write to finish.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, asyncFileWriteDelayMS));

  const mc2 = await open3PaneWindow();
  set_mc(mc2);
  await be_in_folder(folderA);
  assert_message_pane_visible();
  assert_pane_layout(kVerticalMailLayout);

  actualWidth = document.getElementById("messagepaneboxwrapper").clientWidth;
  Assert.equal(
    newWidth,
    actualWidth,
    "The message pane width should be " +
      newWidth +
      ", but is actually " +
      actualWidth
  );

  // The old width is restored.
  _move_splitter(document.getElementById("threadpane-splitter"), -diffWidth, 0);
  actualWidth = document.getElementById("messagepaneboxwrapper").clientWidth;

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
  await BrowserTestUtils.closeWindow(mc2);
  // Wait for window close async session write to finish.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, asyncFileWriteDelayMS));

  const mc3 = await open3PaneWindow();
  set_mc(mc3);
  await be_in_folder(folderA);
  assert_message_pane_visible();
  assert_pane_layout(kVerticalMailLayout);

  actualWidth = document.getElementById("messagepaneboxwrapper").clientWidth;
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
  const closePromise = BrowserTestUtils.domWindowClosed(amWin);
  amWin.close();
  await closePromise;
}).skip(); // Bug 1753963.

add_task(async function test_multiple_3pane_periodic_session_persistence() {
  // open a few more 3pane windows
  for (var i = 0; i < 3; ++i) {
    await open3PaneWindow();
  }

  // then get the state objects for each window
  const state = [];
  for (const window of Services.wm.getEnumerator("mail:3pane")) {
    state.push(window.getWindowStateForSessionPersistence());
  }

  SessionStoreManager._saveState();
  await waitForFileRefresh();

  // load the saved state from disk
  const loadedState = readFile();

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
  const windows = Services.wm.getEnumerator("mail:3pane");
  for (const win of windows) {
    win.close();
  }
}).skip(); // Bug 1753963.

add_task(async function test_bad_session_file_simple() {
  // forcefully write a bad session file
  const data = "BAD SESSION FILE";
  const fos = FileUtils.openSafeFileOutputStream(
    SessionStoreManager.sessionFile
  );
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
  await TestUtils.waitForCondition(
    () => !SessionStoreManager.sessionFile.exists(),
    "session file should now not exist"
  );
}).skip(); // Bug 1753963.

add_task(async function test_clean_shutdown_session_persistence_simple() {
  // open a few more 3pane windows
  for (var i = 0; i < 3; ++i) {
    await open3PaneWindow();
  }

  // make sure we have a different window open, so that we don't start shutting
  // down just because the last window was closed
  const amWin = await openActivityManager();

  // close all the 3pane windows
  let lastWindowState = null;
  const enumerator = Services.wm.getEnumerator("mail:3pane");
  for (const window of enumerator) {
    if (!enumerator.hasMoreElements()) {
      lastWindowState = window.getWindowStateForSessionPersistence();
    }
    window.close();
  }

  // Wait for session file to be created (removed in prior test) after
  // all 3pane windows close and for session write to finish.
  await waitForFileRefresh();

  // load the saved state from disk
  const loadedState = readFile();
  Assert.ok(loadedState, "previously saved state should be non-null");

  Assert.equal(
    loadedState.windows.length,
    1,
    "only the state of the last 3pane window should have been saved"
  );

  // get the state object for the one and only one 3pane window
  const windowState = loadedState.windows[0];
  Assert.ok(
    JSON.stringify(windowState) == JSON.stringify(lastWindowState),
    "saved state and loaded state should be equal"
  );

  await open3PaneWindow();

  // We don't need the address book window any more.
  const closePromise = BrowserTestUtils.domWindowClosed(amWin);
  amWin.close();
  await closePromise;
}).skip(); // Bug 1753963.

/*
 * A set of private helper functions for drag'n'drop
 * These functions are inspired by tabmail/test-tabmail-dragndrop.js
 */

function _move_splitter(aSplitter, aDiffX, aDiffY) {
  // catch the splitter in the middle
  const rect = aSplitter.getBoundingClientRect();
  const middleX = Math.round(rect.width / 2);
  const middleY = Math.round(rect.height / 2);
  EventUtils.synthesizeMouse(
    aSplitter,
    middleX,
    middleY,
    { type: "mousedown" },
    window
  );
  EventUtils.synthesizeMouse(
    aSplitter,
    aDiffX + middleX,
    aDiffY + middleY,
    { type: "mousemove" },
    window
  );
  // release the splitter
  EventUtils.synthesizeMouse(aSplitter, 0, 0, { type: "mouseup" }, window);
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
