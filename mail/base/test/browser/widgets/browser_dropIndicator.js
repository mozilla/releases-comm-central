/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

SimpleTest.requestCompleteLog();

const dragService = Cc["@mozilla.org/widget/dragservice;1"].getService(
  Ci.nsIDragService
);
const waitTime = 0;
const tabmail = document.getElementById("tabmail");
let win, doc, list, listVertical;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/base/test/browser/widgets/files/dropIndicator.xhtml",
  });

  info("Loading tab...");
  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();

  win = tab.browser.contentWindow;
  doc = win.document;
  info("Waiting for custom element...");
  await win.customElements.whenDefined("drop-indicator");

  // Run this tests at full screen to avoid threshold visibility issues.
  if (window.windowState != window.STATE_MAXIMIZED) {
    const resizePromise = BrowserTestUtils.waitForEvent(window, "resize");
    window.maximize();
    info("Maximizing window...");
    await resizePromise;
  } else {
    info("Nothing to maximize");
  }

  list = doc.querySelector(`.boxes`);
  Assert.ok(list, "the list should exist");

  listVertical = doc.querySelector(`.boxes.stacked`);
  Assert.ok(listVertical, "the vertical list should exist");

  Assert.ok(
    doc.querySelector(`[is="drop-indicator"]`),
    "the drop indicator should exist"
  );

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
    window.restore();
  });
});

async function simulateDragAndDrop(element, target, indicator) {
  const targetRect = target.getBoundingClientRect();
  const toY = targetRect.top + target.offsetHeight;

  dragService.startDragSessionForTests(
    window,
    Ci.nsIDragService.DRAGDROP_ACTION_MOVE
  );
  const [result, dataTransfer] = EventUtils.synthesizeDragOver(
    element,
    target,
    null,
    null,
    win,
    win
  );

  EventUtils.sendDragEvent(
    {
      type: "dragover",
      clientY: toY,
      dataTransfer,
      _domDispatchOnly: true,
    },
    target,
    win
  );
  await new Promise(resolve => setTimeout(resolve));

  await BrowserTestUtils.waitForMutationCondition(
    indicator,
    {
      attributes: true,
      attributeFilter: ["hidden"],
    },
    () => BrowserTestUtils.isVisible(indicator)
  );
  const { targetTop, targetInline } = win.calculateElementPosition(target);
  Assert.equal(
    indicator.style.insetInlineStart,
    `${targetInline - indicator.inlineCorrection}px`,
    "The drop indicator should have the correct inline position"
  );
  Assert.equal(
    indicator.style.insetBlockStart,
    `${targetTop - indicator.blockCorrection}px`,
    "The drop indicator should have the correct block position"
  );

  EventUtils.synthesizeDropAfterDragOver(result, dataTransfer, target, win, {
    type: "drop",
    clientY: toY,
    _domDispatchOnly: true,
  });
  dragService.getCurrentSession().endDragSession(true);
  await new Promise(resolve => setTimeout(resolve));

  Assert.ok(
    BrowserTestUtils.isHidden(indicator),
    "The drop indicator should be hidden"
  );
  Assert.ok(
    !indicator.style.insetBlockStart,
    "The inset-block style should have been cleared"
  );
  Assert.ok(
    !indicator.style.insetInlineStart,
    "The inset-inline style should have been cleared"
  );
}

add_task(async function testDropWidget() {
  await simulateDragAndDrop(
    doc.getElementById("box4"),
    doc.getElementById("box2"),
    doc.getElementById("indicator")
  );
});

add_task(async function testDropWidgetVertical() {
  await simulateDragAndDrop(
    doc.getElementById("boxStacked4"),
    doc.getElementById("boxStacked1"),
    doc.getElementById("indicator1")
  );
});
