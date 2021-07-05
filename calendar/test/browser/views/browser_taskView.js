/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {
  MID_SLEEP,
  CALENDARNAME,
  closeAllEventDialogs,
  controller,
  createCalendar,
  deleteCalendars,
  execEventDialogCallback,
} = ChromeUtils.import("resource://testing-common/calendar/CalendarUtils.jsm");
var { CalendarTestUtils } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarTestUtils.jsm"
);
var { saveAndCloseItemDialog, setData } = ChromeUtils.import(
  "resource://testing-common/calendar/ItemEditingHelpers.jsm"
);

const TITLE = "Task";
const DESCRIPTION = "1. Do A\n2. Do B";
const PERCENTCOMPLETE = "50";

// Mozmill doesn't support trees yet, therefore completed checkbox and line-through style are not
// checked.
add_task(async function setupModule(module) {
  const winDoc = controller.window.document;
  let CALENDARID = createCalendar(controller, CALENDARNAME);

  // Open task view.
  controller.click(controller.window.document.getElementById("task-tab-button"));
  controller.sleep(MID_SLEEP);

  // Make sure that testing calendar is selected.
  let calList = winDoc.querySelector(`#calendar-list > [calendar-id="${CALENDARID}"]`);
  Assert.ok(calList);
  controller.click(calList);

  let taskTreeNode = winDoc.getElementById("calendar-task-tree");
  Assert.equal(taskTreeNode.mTaskArray.length, 0);

  // Add task.
  let taskInput = winDoc.getElementById("view-task-edit-field");
  controller.type(taskInput, TITLE);
  taskInput.focus();
  EventUtils.synthesizeKey("VK_RETURN", {}, controller.window);

  // Verify added.
  controller.waitFor(() => taskTreeNode.mTaskArray.length == 1, "Added Task did not appear");

  // Last added task is automatically selected so verify detail window data.
  Assert.equal(winDoc.getElementById("calendar-task-details-title").textContent, TITLE);

  // Open added task
  // Double-click on completion checkbox is ignored as opening action, so don't
  // click at immediate left where the checkbox is located.
  let eventWindowPromise = CalendarTestUtils.waitForEventDialog("edit");
  let treeChildren = winDoc.querySelector("#calendar-task-tree .calendar-task-treechildren");
  Assert.ok(treeChildren);
  controller.doubleClick(treeChildren, 50, 0);

  await eventWindowPromise;
  await execEventDialogCallback(async (taskWindow, iframeWindow) => {
    // Verify calendar.
    Assert.equal(iframeWindow.document.getElementById("item-calendar").value, CALENDARNAME);

    await setData(taskWindow, iframeWindow, {
      status: "needs-action",
      percent: PERCENTCOMPLETE,
      description: DESCRIPTION,
    });

    await saveAndCloseItemDialog(taskWindow);
  });

  Assert.less(taskTreeNode.mTaskArray.length, 2, "Should not have added task");
  Assert.greater(taskTreeNode.mTaskArray.length, 0, "Should not have removed task");

  // Verify description and status in details pane.
  await TestUtils.waitForCondition(() => {
    let desc = winDoc.getElementById("calendar-task-details-description");
    return desc && desc.value == DESCRIPTION;
  }, "Calendar task description");
  Assert.equal(winDoc.getElementById("calendar-task-details-status").textContent, "Needs Action");

  // This is a hack.
  taskTreeNode.getTaskAtRow(0).calendar.setProperty("capabilities.priority.supported", true);

  // Set high priority and verify it in detail pane.
  controller.click(controller.window.document.getElementById("task-actions-priority"));
  controller.sleep(MID_SLEEP);

  let priorityMenu = winDoc.querySelector(
    "#task-actions-priority-menupopup > .priority-1-menuitem"
  );
  Assert.ok(priorityMenu);
  controller.click(priorityMenu);
  controller.sleep(MID_SLEEP);

  Assert.ok(!winDoc.getElementById("calendar-task-details-priority-high").hasAttribute("hidden"));

  // Verify that tooltip shows status, priority and percent complete.
  let toolTipNode = winDoc.getElementById("taskTreeTooltip");
  toolTipNode.ownerGlobal.showToolTip(toolTipNode, taskTreeNode.getTaskAtRow(0));

  function getTooltipDescription(index) {
    return toolTipNode.querySelector(
      `.tooltipHeaderTable > tr:nth-of-type(${index}) > .tooltipHeaderDescription`
    ).textContent;
  }

  // Name
  Assert.equal(getTooltipDescription(1), TITLE);
  // Calendar
  Assert.equal(getTooltipDescription(2), CALENDARNAME);
  // Priority
  Assert.equal(getTooltipDescription(3), "High");
  // Status
  Assert.equal(getTooltipDescription(4), "Needs Action");
  // Complete
  Assert.equal(getTooltipDescription(5), PERCENTCOMPLETE + "%");

  // Mark completed, verify.
  controller.click(controller.window.document.getElementById("task-actions-markcompleted"));
  controller.sleep(MID_SLEEP);

  toolTipNode.ownerGlobal.showToolTip(toolTipNode, taskTreeNode.getTaskAtRow(0));
  Assert.equal(getTooltipDescription(4), "Completed");

  // Delete task and verify.
  controller.click(controller.window.document.getElementById("calendar-delete-task-button"));
  controller.waitFor(() => taskTreeNode.mTaskArray.length == 0, "Task did not delete");

  let tabmail = controller.window.document.getElementById("tabmail");
  tabmail.closeTab(tabmail.currentTabInfo);

  Assert.ok(true, "Test ran to completion");
});

registerCleanupFunction(function teardownModule(module) {
  deleteCalendars(controller, CALENDARNAME);
  closeAllEventDialogs();
});
