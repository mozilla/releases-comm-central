/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that the message pane collapses properly, stays collapsed amongst tab
 *  changes, and that persistence works (to a first approximation).
 */

"use strict";

var {
  assert_message_pane_hidden,
  assert_message_pane_visible,
  be_in_folder,
  close_tab,
  create_folder,
  open_folder_in_new_tab,
  open_selected_message_in_new_tab,
  select_click_row,
  switch_tab,
  toggle_message_pane,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { make_message_sets_in_folders } = ChromeUtils.importESModule(
  "resource://testing-common/mail/MessageInjectionHelpers.sys.mjs"
);
var { promise_new_window } = ChromeUtils.importESModule(
  "resource://testing-common/mail/WindowHelpers.sys.mjs"
);
var { XULStoreUtils } = ChromeUtils.importESModule(
  "resource:///modules/XULStoreUtils.sys.mjs"
);

var folder;

function assert_message_pane_has_usable_size() {
  const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  const messagePane = about3Pane.document.getElementById("messagePane");
  const messagePaneRect = messagePane.getBoundingClientRect();

  Assert.greater(
    messagePaneRect.width,
    50,
    "The message pane should have a usable width!"
  );
  Assert.greater(
    messagePaneRect.height,
    50,
    "The message pane should have a usable height!"
  );
}

async function open3PaneWindow(
  folderToShow,
  features = "chrome,all,dialog=no"
) {
  const newWindowPromise = promise_new_window("mail:3pane");
  window.openDialog(
    "chrome://messenger/content/messenger.xhtml",
    "_blank",
    features,
    folderToShow.URI,
    -1
  );

  const win = await newWindowPromise;
  await TestUtils.waitForCondition(() => {
    const about3Pane =
      win.document.getElementById("tabmail")?.currentAbout3Pane;
    return (
      about3Pane?.document.readyState == "complete" &&
      about3Pane.location.href != "about:blank"
    );
  }, "the new 3-pane window should load about:3pane");

  const about3Pane = win.document.getElementById("tabmail").currentAbout3Pane;
  await TestUtils.waitForCondition(
    () =>
      about3Pane.gFolder == folderToShow &&
      !about3Pane.document.body.classList.contains("account-central"),
    "the new 3-pane window should display the test folder"
  );

  await new Promise(resolve =>
    about3Pane.requestAnimationFrame(() =>
      about3Pane.requestAnimationFrame(resolve)
    )
  );

  return win;
}

add_setup(async function () {
  folder = await create_folder("MessagePaneVisibility");
  await make_message_sets_in_folders([folder], [{ count: 3 }]);
});

/**
 * By default, the message pane should be visible.  Make sure that this state of
 *  affairs is correct in terms of menu options, splitters, etc.
 */
add_task(async function test_message_pane_visible_state_is_right() {
  await be_in_folder(folder);
  assert_message_pane_visible();
  assert_message_pane_has_usable_size();
  Assert.ok(true, "test_message_pane_visible_state_is_right ran to completion");
});

/**
 * Toggle the message off.
 */
add_task(function test_toggle_message_pane_off() {
  toggle_message_pane();
  assert_message_pane_hidden();
  Assert.ok(true, "test_toggle_message_pane_off ran to completion");
});

/**
 * Toggle the message pane on.
 */
add_task(function test_toggle_message_pane_on() {
  toggle_message_pane();
  assert_message_pane_visible();
  Assert.ok(true, "test_toggle_message_pane_on ran to completion");
});

/**
 * Make sure that the message tab isn't broken by being invoked from a folder tab
 *  with a collapsed message pane.
 */
add_task(
  async function test_collapsed_message_pane_does_not_break_message_tab() {
    await be_in_folder(folder);

    // - toggle message pane off
    toggle_message_pane();
    assert_message_pane_hidden();

    // - open message tab, make sure the message pane is visible
    await select_click_row(0);
    const tabMessage = await open_selected_message_in_new_tab();

    // - close the tab, sanity check the transition was okay
    close_tab(tabMessage);
    assert_message_pane_hidden();

    // - restore the state...
    toggle_message_pane();

    Assert.ok(
      true,
      "test_collapsed_message_pane_does_not_break_message_tab ran to completion"
    );
  }
);

/**
 * Make sure that switching to message tabs or folder pane tabs with a different
 *  message pane state does not break.  This test should cover all transition
 *  states.
 */
add_task(async function test_message_pane_is_sticky() {
  const tabFolderA = await be_in_folder(folder);
  assert_message_pane_visible();

  // [folder+ => (new) message]
  await select_click_row(0);
  const tabMessage = await open_selected_message_in_new_tab();

  // [message => folder+]
  await switch_tab(tabFolderA);
  assert_message_pane_visible();

  // [folder+ => (new) folder+]
  const tabFolderB = await open_folder_in_new_tab(folder);
  assert_message_pane_visible();

  // [folder pane toggle + => -]
  toggle_message_pane();
  assert_message_pane_hidden();

  // [folder- => folder+]
  await switch_tab(tabFolderA);
  assert_message_pane_visible();

  // (redundant) [ folder pane toggle + => -]
  toggle_message_pane();
  assert_message_pane_hidden();

  // [folder- => message]
  await switch_tab(tabMessage);

  // [message => folder-]
  close_tab(tabMessage);
  assert_message_pane_hidden();

  // [folder- => (new) folder-]
  // (we are testing inheritance here)
  const tabFolderC = await open_folder_in_new_tab(folder);
  assert_message_pane_hidden();

  // [folder- => folder-]
  close_tab(tabFolderC);
  // the tab we are on now doesn't matter, so we don't care
  assert_message_pane_hidden();
  await switch_tab(tabFolderB);

  // [ folder pane toggle - => + ]
  toggle_message_pane();
  assert_message_pane_visible();

  // [folder+ => folder-]
  close_tab(tabFolderB);
  assert_message_pane_hidden();

  // (redundant) [ folder pane toggle - => + ]
  toggle_message_pane();
  assert_message_pane_visible();

  Assert.ok(true, "test_message_pane_is_sticky ran to completion");
});

/**
 * Test that if we serialize and restore the tabs that the message pane is in
 *  the expected collapsed/non-collapsed state.  Because of the special "first
 *  tab" situation, we need to do this twice to test each case for the first
 *  tab.  For additional thoroughness we also flip the state we have the other
 *  tabs be in.
 */
add_task(async function test_message_pane_persistence_generally_works() {
  await be_in_folder(folder);

  const tabmail = document.getElementById("tabmail");

  // helper to open tabs with the folder pane in the desired states (1 for
  //  visible, 0 for hidden)
  async function openTabs(aConfig) {
    for (const [iTab, messagePaneVisible] of aConfig.entries()) {
      if (iTab != 0) {
        await open_folder_in_new_tab(folder);
      }
      if (
        tabmail.currentAbout3Pane.paneLayout.messagePaneVisible !=
        messagePaneVisible
      ) {
        toggle_message_pane();
      }
    }
  }

  // close everything but the first tab.
  function closeTabs() {
    while (tabmail.tabInfo.length > 1) {
      close_tab(1);
    }
  }

  async function verifyTabs(aConfig) {
    for (const [iTab, messagePaneVisible] of aConfig.entries()) {
      info("tab " + iTab);

      await switch_tab(iTab);
      if (
        tabmail.currentAbout3Pane.document.readyState != "complete" ||
        tabmail.currentAbout3Pane.location.href == "about:blank"
      ) {
        await BrowserTestUtils.waitForEvent(tabmail.currentAbout3Pane, "load");
        await new Promise(resolve =>
          tabmail.currentAbout3Pane.setTimeout(resolve)
        );
      }

      if (messagePaneVisible) {
        assert_message_pane_visible();
      } else {
        assert_message_pane_hidden();
      }
    }
  }

  const configs = [
    // 1st time: [+ - - + +]
    [1, 0, 0, 1, 1],
    // 2nd time: [- + + - -]
    [0, 1, 1, 0, 0],
  ];
  for (const config of configs) {
    await openTabs(config);
    await verifyTabs(config); // make sure openTabs did its job right
    const state = tabmail.persistTabs();
    closeTabs();

    Assert.equal(state.tabs[0].state.messagePaneVisible, config[0]);
    Assert.equal(state.tabs[1].state.messagePaneVisible, config[1]);
    Assert.equal(state.tabs[2].state.messagePaneVisible, config[2]);
    Assert.equal(state.tabs[3].state.messagePaneVisible, config[3]);
    Assert.equal(state.tabs[4].state.messagePaneVisible, config[4]);

    // toggle the state for the current tab so we can be sure that it knows how
    //  to change things.
    toggle_message_pane();

    tabmail.restoreTabs(state);
    await verifyTabs(config);
    closeTabs();

    // toggle the first tab again.  This sets - properly for the second pass and
    //  restores it to + for when we are done.
    toggle_message_pane();
  }

  Assert.ok(
    true,
    "test_message_pane_persistence_generally_works ran to completion"
  );
});

add_task(async function test_message_pane_restores_stored_size_on_startup() {
  await be_in_folder(folder);

  const restoredWidth = 420;
  const oldPaneConfig = Services.prefs.getIntPref("mail.pane_config.dynamic");
  Services.prefs.setIntPref("mail.pane_config.dynamic", 2);
  XULStoreUtils.setValue("messenger", "folderPaneBox", "width", 280);
  XULStoreUtils.setValue(
    "messenger",
    "messagepaneboxwrapper",
    "collapsed",
    false
  );
  XULStoreUtils.setValue(
    "messenger",
    "messagepaneboxwrapper",
    "width",
    restoredWidth
  );

  const win = await open3PaneWindow(folder);
  try {
    const about3Pane = win.document.getElementById("tabmail").currentAbout3Pane;
    const messagePane = about3Pane.document.getElementById("messagePane");
    const folderPane = about3Pane.document.getElementById("folderPane");
    about3Pane.paneLayout.folderPaneVisible = true;
    await TestUtils.waitForCondition(
      () => folderPane.getBoundingClientRect().width > 50,
      "the folder pane should be visible before dragging the message splitter"
    );
    await TestUtils.waitForCondition(
      () =>
        Math.abs(messagePane.getBoundingClientRect().width - restoredWidth) <=
        1,
      "the message pane should reach the stored width"
    );

    const messagePaneRect = messagePane.getBoundingClientRect();
    Assert.lessOrEqual(
      Math.abs(messagePaneRect.width - restoredWidth),
      1,
      "The message pane should restore the width stored in xulstore"
    );

    const threadPane = about3Pane.document.getElementById("threadPane");
    const folderPaneWidth = folderPane.getBoundingClientRect().width;
    const threadPaneWidth = threadPane.getBoundingClientRect().width;
    const splitter = about3Pane.document.getElementById("messagePaneSplitter");
    const splitterRect = splitter.getBoundingClientRect();
    EventUtils.synthesizeMouseAtPoint(
      splitterRect.left + splitterRect.width / 2,
      splitterRect.top + splitterRect.height / 2,
      { type: "mousedown", buttons: 1 },
      about3Pane
    );
    Assert.ok(
      !!splitter._dragStartInfo,
      "The message splitter drag should start"
    );
    EventUtils.synthesizeMouseAtPoint(
      splitterRect.left + splitterRect.width / 2 - 40,
      splitterRect.top + splitterRect.height / 2,
      { type: "mousemove", buttons: 1 },
      about3Pane
    );
    await new Promise(resolve => about3Pane.requestAnimationFrame(resolve));

    const draggedWidth = restoredWidth + 40;
    Assert.lessOrEqual(
      Math.abs(messagePane.getBoundingClientRect().width - draggedWidth),
      1,
      "The restored message pane should follow splitter drags"
    );
    Assert.lessOrEqual(
      Math.abs(folderPane.getBoundingClientRect().width - folderPaneWidth),
      1,
      "The folder pane width should not change while dragging the message splitter"
    );
    Assert.lessOrEqual(
      Math.abs(
        threadPane.getBoundingClientRect().width - (threadPaneWidth - 40)
      ),
      1,
      "The thread pane should absorb the message splitter drag"
    );

    EventUtils.synthesizeMouseAtPoint(
      splitterRect.left + splitterRect.width / 2 - 40,
      splitterRect.top + splitterRect.height / 2,
      { type: "mouseup" },
      about3Pane
    );
    await new Promise(resolve => about3Pane.requestAnimationFrame(resolve));

    Assert.lessOrEqual(
      Math.abs(folderPane.getBoundingClientRect().width - folderPaneWidth),
      1,
      "The folder pane width should not change after releasing the message splitter"
    );

    win.resizeTo(win.outerWidth + 80, win.outerHeight);
    await new Promise(resolve =>
      about3Pane.requestAnimationFrame(() =>
        about3Pane.requestAnimationFrame(resolve)
      )
    );

    Assert.lessOrEqual(
      Math.abs(folderPane.getBoundingClientRect().width - folderPaneWidth),
      1,
      "The folder pane width should not change after resizing the window"
    );

    await TestUtils.waitForCondition(
      () =>
        Math.abs(
          Number(
            XULStoreUtils.getValue(
              "messenger",
              "messagepaneboxwrapper",
              "width"
            )
          ) - draggedWidth
        ) <= 1,
      "the dragged message pane width should be persisted"
    );

    const restoredWin = await open3PaneWindow(folder);
    try {
      const restoredAbout3Pane =
        restoredWin.document.getElementById("tabmail").currentAbout3Pane;
      const restoredMessagePane =
        restoredAbout3Pane.document.getElementById("messagePane");
      await TestUtils.waitForCondition(
        () =>
          Math.abs(
            restoredMessagePane.getBoundingClientRect().width - draggedWidth
          ) <= 1,
        "the dragged message pane width should restore in another window"
      );

      Assert.lessOrEqual(
        Math.abs(
          restoredMessagePane.getBoundingClientRect().width - draggedWidth
        ),
        1,
        "The dragged message pane width should restore in another window"
      );
    } finally {
      const closeRestoredPromise =
        BrowserTestUtils.domWindowClosed(restoredWin);
      restoredWin.close();
      await closeRestoredPromise;
    }
  } finally {
    Services.prefs.setIntPref("mail.pane_config.dynamic", oldPaneConfig);
    XULStoreUtils.removeValue("messenger", "folderPaneBox", "width");
    XULStoreUtils.removeValue("messenger", "messagepaneboxwrapper", "width");
    XULStoreUtils.removeValue(
      "messenger",
      "messagepaneboxwrapper",
      "collapsed"
    );
    const closePromise = BrowserTestUtils.domWindowClosed(win);
    win.close();
    await closePromise;
  }
});

add_task(
  async function test_message_pane_restores_after_delayed_window_resize() {
    await be_in_folder(folder);

    const restoredFolderWidth = 349;
    const restoredMessageWidth = 640;
    const oldPaneConfig = Services.prefs.getIntPref("mail.pane_config.dynamic");
    Services.prefs.setIntPref("mail.pane_config.dynamic", 2);
    XULStoreUtils.setValue(
      "messenger",
      "folderPaneBox",
      "width",
      restoredFolderWidth
    );
    XULStoreUtils.setValue(
      "messenger",
      "messagepaneboxwrapper",
      "collapsed",
      false
    );
    XULStoreUtils.setValue(
      "messenger",
      "messagepaneboxwrapper",
      "width",
      restoredMessageWidth
    );

    const win = await open3PaneWindow(
      folder,
      "chrome,all,dialog=no,width=760,height=600"
    );
    try {
      const about3Pane =
        win.document.getElementById("tabmail").currentAbout3Pane;
      const messagePane = about3Pane.document.getElementById("messagePane");

      for (let i = 0; i < 80; i++) {
        await new Promise(resolve => about3Pane.requestAnimationFrame(resolve));
      }

      win.resizeTo(1537, 988);
      await TestUtils.waitForCondition(
        () =>
          Math.abs(
            messagePane.getBoundingClientRect().width - restoredMessageWidth
          ) <= 1,
        "the message pane should reach the stored width after the window grows"
      );

      const messagePaneRect = messagePane.getBoundingClientRect();
      Assert.lessOrEqual(
        Math.abs(messagePaneRect.width - restoredMessageWidth),
        1,
        "The message pane should restore the stored width after delayed window resize"
      );
    } finally {
      Services.prefs.setIntPref("mail.pane_config.dynamic", oldPaneConfig);
      XULStoreUtils.removeValue("messenger", "folderPaneBox", "width");
      XULStoreUtils.removeValue("messenger", "messagepaneboxwrapper", "width");
      XULStoreUtils.removeValue(
        "messenger",
        "messagepaneboxwrapper",
        "collapsed"
      );
      const closePromise = BrowserTestUtils.domWindowClosed(win);
      win.close();
      await closePromise;
    }
  }
);
