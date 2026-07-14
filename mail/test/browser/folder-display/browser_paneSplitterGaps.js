/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Regression tests for bugs 2054189 and 2054237. In Classic layout, the
 * resize-with-window pane locks must never break the pane geometry: the
 * folder pane always spans the full window height, the thread pane, message
 * pane splitter and message pane tile their column without gaps, and the
 * thread pane can always be dragged down to its minimum height.
 *
 * The assertions here deliberately check the resulting geometry instead of
 * implementation details (locked inline styles), so they should catch
 * stale-lock bugs regardless of which code path triggers them. The waits use
 * the splitter's "--messagePaneSplitter-height" variable, which is "0px"
 * while collapsed and returns to "100%" once the splitter has finished
 * asynchronously applying a restored size.
 */

"use strict";

var { be_in_folder, create_folder } = ChromeUtils.importESModule(
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

// Matches the fuzz used by the pane splitter when restoring sizes.
const FUZZ = 2;

var folder;

add_setup(async function () {
  folder = await create_folder("PaneSplitterGaps");
  await make_message_sets_in_folders([folder], [{ count: 3 }]);
  await be_in_folder(folder);

  registerCleanupFunction(() => folder.deleteSelf(null));
});

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

  return win;
}

function getPanes(about3Pane) {
  const doc = about3Pane.document;
  return {
    body: doc.body,
    folderPane: doc.getElementById("folderPane"),
    threadPane: doc.getElementById("threadPane"),
    splitter: doc.getElementById("messagePaneSplitter"),
    messagePane: doc.getElementById("messagePane"),
  };
}

/**
 * Assert that the classic layout panes exactly tile the window: no gaps or
 * overlaps between the thread pane, the message pane splitter and the message
 * pane, and a folder pane spanning the full height.
 *
 * @param {Window} about3Pane - The about:3pane window to check.
 * @param {string} when - Description of the scenario being checked.
 */
function assertPaneGeometry(about3Pane, when) {
  const { body, folderPane, threadPane, splitter, messagePane } =
    getPanes(about3Pane);
  const bodyRect = body.getBoundingClientRect();
  const folderRect = folderPane.getBoundingClientRect();
  const threadRect = threadPane.getBoundingClientRect();
  const splitterRect = splitter.getBoundingClientRect();
  const messageRect = messagePane.getBoundingClientRect();

  Assert.lessOrEqual(
    Math.abs(folderRect.height - bodyRect.height),
    FUZZ,
    `${when}: the folder pane should span the full height ` +
      `(folder pane ${folderRect.height}, body ${bodyRect.height})`
  );
  Assert.lessOrEqual(
    Math.abs(threadRect.top - bodyRect.top),
    FUZZ,
    `${when}: the thread pane should start at the top of the window`
  );
  // The splitter has negative margins to enlarge its hit area, so measure
  // the gap between the panes and compare it with the splitter's margin-box
  // extent, which is the only thing that legitimately separates them.
  const splitterStyle = about3Pane.getComputedStyle(splitter);
  const splitterExtent =
    splitterRect.height +
    parseFloat(splitterStyle.marginTop) +
    parseFloat(splitterStyle.marginBottom);
  const paneGap = messageRect.top - threadRect.bottom;
  Assert.lessOrEqual(
    Math.abs(paneGap - splitterExtent),
    FUZZ,
    `${when}: only the splitter should separate the thread pane and the ` +
      `message pane (gap ${paneGap}, splitter extent ${splitterExtent})`
  );
  Assert.lessOrEqual(
    Math.abs(bodyRect.bottom - messageRect.bottom),
    FUZZ,
    `${when}: the message pane should end at the bottom of the window`
  );
}

/**
 * Exercise the ways stale pane locks used to corrupt the classic layout:
 * restoring a persisted size on startup, resizing the window in both
 * directions, toggling the message pane, and dragging the splitter.
 */
add_task(async function test_classic_layout_has_no_pane_gaps() {
  const restoredHeight = 350;
  const oldPaneConfig = Services.prefs.getIntPref("mail.pane_config.dynamic");
  Services.prefs.setIntPref("mail.pane_config.dynamic", 0);
  XULStoreUtils.setValue("messenger", "folderPaneBox", "width", 250);
  XULStoreUtils.setValue(
    "messenger",
    "messagepaneboxwrapper",
    "collapsed",
    false
  );
  XULStoreUtils.setValue(
    "messenger",
    "messagepaneboxwrapper",
    "height",
    restoredHeight
  );

  const win = await open3PaneWindow(
    folder,
    "chrome,all,dialog=no,width=1000,height=800"
  );
  try {
    const about3Pane = win.document.getElementById("tabmail").currentAbout3Pane;
    const { body, threadPane, splitter, messagePane } = getPanes(about3Pane);

    await TestUtils.waitForCondition(
      () =>
        Math.abs(messagePane.getBoundingClientRect().height - restoredHeight) <=
        FUZZ,
      "the message pane should reach the stored height"
    );
    // Restoring a persisted size completes asynchronously, ending with the
    // splitter handing the message pane row back to the grid as "100%".
    await TestUtils.waitForCondition(
      () =>
        splitter.parentNode.style.getPropertyValue(
          "--messagePaneSplitter-height"
        ) == "100%",
      "the splitter should finish restoring the message pane size"
    );
    assertPaneGeometry(about3Pane, "after startup restore");

    // Growing the window should give the new space to the message pane and
    // leave the thread pane alone.
    const threadHeightBeforeGrow = threadPane.getBoundingClientRect().height;
    win.resizeTo(win.outerWidth, win.outerHeight + 150);
    await TestUtils.waitForCondition(
      () =>
        messagePane.getBoundingClientRect().height > restoredHeight + 150 - 50,
      "the message pane should absorb the window growth"
    );
    assertPaneGeometry(about3Pane, "after growing the window");
    Assert.lessOrEqual(
      Math.abs(
        threadPane.getBoundingClientRect().height - threadHeightBeforeGrow
      ),
      FUZZ,
      "the thread pane should keep its height when the window grows"
    );

    // Shrinking the window must not leave a gap; a stale full-height lock on
    // the folder pane used to inflate the thread pane row here.
    const bodyHeightBeforeShrink = body.getBoundingClientRect().height;
    win.resizeTo(win.outerWidth, win.outerHeight - 350);
    await TestUtils.waitForCondition(
      () => body.getBoundingClientRect().height < bodyHeightBeforeShrink - 300,
      "the window should shrink"
    );
    assertPaneGeometry(about3Pane, "after shrinking the window");

    // Toggling the message pane (F8) must restore a clean layout.
    about3Pane.paneLayout.messagePaneVisible = false;
    await TestUtils.waitForCondition(
      () =>
        splitter.parentNode.style.getPropertyValue(
          "--messagePaneSplitter-height"
        ) == "0px",
      "the message pane should collapse"
    );
    about3Pane.paneLayout.messagePaneVisible = true;
    await TestUtils.waitForCondition(
      () => messagePane.getBoundingClientRect().height > 50,
      "the message pane should become visible again"
    );
    // Re-expanding restores the persisted size asynchronously, ending with
    // the splitter handing the message pane row back to the grid as "100%".
    await TestUtils.waitForCondition(
      () =>
        splitter.parentNode.style.getPropertyValue(
          "--messagePaneSplitter-height"
        ) == "100%",
      "the splitter should finish restoring the message pane size"
    );
    assertPaneGeometry(about3Pane, "after toggling the message pane");

    // The thread pane must be draggable down to (near) its minimum height,
    // not be propped up by other panes' locks.
    const threadRect = threadPane.getBoundingClientRect();
    const splitterRect = splitter.getBoundingClientRect();
    const dragX = splitterRect.left + splitterRect.width / 2;
    const dragStartY = splitterRect.top + splitterRect.height / 2;
    const dragEndY = threadRect.top + 20;

    EventUtils.synthesizeMouseAtPoint(
      dragX,
      dragStartY,
      { type: "mousedown", buttons: 1 },
      about3Pane
    );
    Assert.ok(!!splitter._dragStartInfo, "the splitter drag should start");
    // Move in two steps so the drag reliably starts.
    EventUtils.synthesizeMouseAtPoint(
      dragX,
      dragStartY - 20,
      { type: "mousemove", buttons: 1 },
      about3Pane
    );
    // The splitter processes at most one mousemove per frame, so a frame must
    // pass before the next mousemove or it is ignored.
    await new Promise(resolve => about3Pane.requestAnimationFrame(resolve));
    EventUtils.synthesizeMouseAtPoint(
      dragX,
      dragEndY,
      { type: "mousemove", buttons: 1 },
      about3Pane
    );
    EventUtils.synthesizeMouseAtPoint(
      dragX,
      dragEndY,
      { type: "mouseup" },
      about3Pane
    );
    // On mouseup the splitter re-locks the panes at their new sizes and
    // hands the message pane row back to the grid, asynchronously.
    await TestUtils.waitForCondition(
      () =>
        splitter.parentNode.style.getPropertyValue(
          "--messagePaneSplitter-height"
        ) == "100%",
      "the splitter should re-enable resize-with-window after the drag"
    );

    const minHeight = parseFloat(
      about3Pane.getComputedStyle(threadPane).minBlockSize
    );
    Assert.lessOrEqual(
      threadPane.getBoundingClientRect().height,
      minHeight + FUZZ,
      "the thread pane should shrink to its minimum height when the " +
        "splitter is dragged to the top"
    );
    assertPaneGeometry(about3Pane, "after dragging the splitter up");

    // And the layout must survive a window resize after the drag.
    const bodyHeightBeforeGrow = body.getBoundingClientRect().height;
    win.resizeTo(win.outerWidth, win.outerHeight + 100);
    await TestUtils.waitForCondition(
      () => body.getBoundingClientRect().height > bodyHeightBeforeGrow + 50,
      "the window should grow again"
    );
    assertPaneGeometry(about3Pane, "after resizing following a drag");
  } finally {
    Services.prefs.setIntPref("mail.pane_config.dynamic", oldPaneConfig);
    XULStoreUtils.removeValue("messenger", "folderPaneBox", "width");
    XULStoreUtils.removeValue("messenger", "messagepaneboxwrapper", "height");
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
