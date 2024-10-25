/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MID_SLEEP, execEventDialogCallback } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarUtils.sys.mjs"
);
var { saveAndCloseItemDialog, setData } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/ItemEditingHelpers.sys.mjs"
);

const TITLE = "Task";
const DESCRIPTION = "1. Do A\n2. Do B";
const PERCENTCOMPLETE = "50";

add_task(async function () {
  const calendar = CalendarTestUtils.createCalendar();
  registerCleanupFunction(() => {
    CalendarTestUtils.removeCalendar(calendar);
  });

  // Open task view.
  EventUtils.synthesizeMouseAtCenter(document.getElementById("tasksButton"), {}, window);
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, MID_SLEEP));

  // Make sure that testing calendar is selected.
  const calList = document.querySelector(`#calendar-list > [calendar-id="${calendar.id}"]`);
  Assert.ok(calList);
  EventUtils.synthesizeMouseAtCenter(calList, {}, window);

  const taskTreeNode = document.getElementById("calendar-task-tree");
  Assert.equal(taskTreeNode.mTaskArray.length, 0);

  // Add task.
  const taskInput = document.getElementById("view-task-edit-field");
  taskInput.focus();
  EventUtils.sendString(TITLE, window);
  EventUtils.synthesizeKey("VK_RETURN", {}, window);

  // Verify added.
  await TestUtils.waitForCondition(
    () => taskTreeNode.mTaskArray.length == 1,
    "Added Task did not appear"
  );

  // Last added task is automatically selected so verify detail window data.
  Assert.equal(document.getElementById("calendar-task-details-title").textContent, TITLE);

  // Open added task
  // Double-click on completion checkbox is ignored as opening action, so don't
  // click at immediate left where the checkbox is located.
  const eventWindowPromise = CalendarTestUtils.waitForEventDialog("edit");
  const treeChildren = document.querySelector("#calendar-task-tree .calendar-task-treechildren");
  Assert.ok(treeChildren);
  EventUtils.synthesizeMouse(treeChildren, 50, 0, { clickCount: 2 }, window);

  await eventWindowPromise;
  const l10nDone = BrowserTestUtils.waitForEvent(document, "L10nMutationsFinished");
  await execEventDialogCallback(async (taskWindow, iframeWindow) => {
    // Verify calendar.
    Assert.equal(iframeWindow.document.getElementById("item-calendar").value, "Test");

    await setData(taskWindow, iframeWindow, {
      status: "needs-action",
      percent: PERCENTCOMPLETE,
      description: DESCRIPTION,
    });

    await saveAndCloseItemDialog(taskWindow);
  });
  await l10nDone; // Make sure "calendar-task-details-status" is updated.

  Assert.less(taskTreeNode.mTaskArray.length, 2, "Should not have added task");
  Assert.greater(taskTreeNode.mTaskArray.length, 0, "Should not have removed task");

  // Verify description and status in details pane.
  await TestUtils.waitForCondition(() => {
    const desc = document.getElementById("calendar-task-details-description");
    return desc && desc.contentDocument.body.innerText == DESCRIPTION;
  }, "Calendar task description");
  Assert.equal(document.getElementById("calendar-task-details-status").textContent, "Needs Action");

  // This is a hack.
  taskTreeNode.getTaskAtRow(0).calendar.setProperty("capabilities.priority.supported", true);

  // Set high priority and verify it in detail pane.
  EventUtils.synthesizeMouseAtCenter(document.getElementById("task-actions-priority"), {}, window);
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, MID_SLEEP));

  const priorityMenu = document.querySelector(
    "#task-actions-priority-menupopup > .priority-1-menuitem"
  );
  Assert.ok(priorityMenu);
  EventUtils.synthesizeMouseAtCenter(priorityMenu, {}, window);
  await TestUtils.waitForCondition(
    () => !document.getElementById("calendar-task-details-priority-high").hidden,
    "#calendar-task-details-priority-high did not show"
  );

  // Verify that tooltip shows status, priority and percent complete.
  const toolTipNode = document.getElementById("taskTreeTooltip");
  toolTipNode.ownerGlobal.showToolTip(toolTipNode, taskTreeNode.getTaskAtRow(0));

  function getTooltipDescription(index) {
    return toolTipNode.querySelector(
      `.tooltipHeaderTable > tr:nth-of-type(${index}) > .tooltipHeaderDescription`
    ).textContent;
  }

  // Name
  Assert.equal(getTooltipDescription(1), TITLE);
  // Calendar
  Assert.equal(getTooltipDescription(2), "Test");
  // Priority
  Assert.equal(getTooltipDescription(3), "High");
  // Status
  Assert.equal(getTooltipDescription(4), "Needs Action");
  // Complete
  Assert.equal(getTooltipDescription(5), PERCENTCOMPLETE + "%");

  // Mark completed, verify.
  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("task-actions-markcompleted"),
    {},
    window
  );
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, MID_SLEEP));

  toolTipNode.ownerGlobal.showToolTip(toolTipNode, taskTreeNode.getTaskAtRow(0));
  Assert.equal(getTooltipDescription(4), "Completed");

  // Delete task and verify.
  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("calendar-delete-task-button"),
    {},
    window
  );
  await TestUtils.waitForCondition(
    () => taskTreeNode.mTaskArray.length == 0,
    "Task did not delete"
  );

  const tabmail = document.getElementById("tabmail");
  tabmail.closeTab(tabmail.currentTabInfo);

  Assert.ok(true, "Test ran to completion");
});
