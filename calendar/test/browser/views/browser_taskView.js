/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var mozmill = ChromeUtils.import("resource://testing-common/mozmill/mozmill.jsm");

var {
  CALENDARLIST,
  CALENDARNAME,
  TASK_VIEW,
  closeAllEventDialogs,
  createCalendar,
  deleteCalendars,
  helpersForController,
  invokeEventDialog,
} = ChromeUtils.import("resource://testing-common/mozmill/CalendarUtils.jsm");
var { setData } = ChromeUtils.import("resource://testing-common/mozmill/ItemEditingHelpers.jsm");

var controller = mozmill.getMail3PaneController();
var { eid, lookup, sleep } = helpersForController(controller);

const TITLE = "Task";
const DESCRIPTION = "1. Do A\n2. Do B";
const PERCENTCOMPLETE = "50";

// Mozmill doesn't support trees yet, therefore completed checkbox and line-through style are not
// checked.
add_task(async function setupModule(module) {
  let CALENDARID = createCalendar(controller, CALENDARNAME);

  // paths
  let treeChildren = `${TASK_VIEW}/[1]/id("calendar-task-tree")/{"class":"calendar-task-treechildren"}`;
  let taskTree = TASK_VIEW + '[1]/id("calendar-task-tree")';
  let toolTip = '/id("messengerWindow")/id("calendar-popupset")/id("taskTreeTooltip")';
  let toolTipTable = toolTip + '/{"class":"tooltipBox"}/{"class":"tooltipHeaderTable"}/';

  // Open task view.
  controller.click(eid("task-tab-button"));
  sleep();

  // Make sure that testing calendar is selected.
  controller.click(lookup(`${CALENDARLIST}/{"calendar-id":"${CALENDARID}"}`));

  let taskTreeNode = lookup(taskTree).getNode();
  controller.assert(() => taskTreeNode.mTaskArray.length == 0);

  // Add task.
  let taskInput = lookup(`
        ${TASK_VIEW}/id("task-addition-box")/[0]/[1]/id("view-task-edit-field")
    `);
  controller.type(taskInput, TITLE);
  controller.keypress(taskInput, "VK_RETURN", {});

  // Verify added.
  controller.waitFor(() => taskTreeNode.mTaskArray.length == 1, "Added Task did not appear");

  // Last added task is automatically selected so verify detail window data.
  controller.assertJSProperty(eid("calendar-task-details-title"), "textContent", TITLE);

  // Open added task
  // Double-click on completion checkbox is ignored as opening action, so don't
  // click at immediate left where the checkbox is located.
  controller.doubleClick(lookup(treeChildren), 50, 0);
  await invokeEventDialog(controller, null, async (task, iframe) => {
    let { eid: taskid } = helpersForController(task);
    let { eid: iframeId } = helpersForController(iframe);

    // Verify calendar.
    controller.assertValue(iframeId("item-calendar"), CALENDARNAME);

    await setData(task, iframe, {
      status: "needs-action",
      percent: PERCENTCOMPLETE,
      description: DESCRIPTION,
    });

    // save
    task.click(taskid("button-saveandclose"));
  });

  controller.assert(
    () => taskTreeNode.mTaskArray.length < 2,
    "Task added but should not have been"
  );
  controller.assert(
    () => taskTreeNode.mTaskArray.length > 0,
    "Task removed but should not have been"
  );

  // Verify description and status in details pane.
  controller.waitFor(
    () =>
      lookup(`
    ${TASK_VIEW}/{"flex":"1"}/id("calendar-task-details-container")/{"flex":"1"}/
    id("calendar-task-details-description")
  `).getNode().value == DESCRIPTION
  );
  controller.assertJSProperty(eid("calendar-task-details-status"), "textContent", "Needs Action");

  // This is a hack.
  taskTreeNode.getTaskAtRow(0).calendar.setProperty("capabilities.priority.supported", true);

  // Set high priority and verify it in detail pane.
  controller.click(eid("task-actions-priority"));
  sleep();
  controller.click(
    lookup(
      `${TASK_VIEW}/{"flex":"1"}/id("calendar-task-details-container")/
        id("calendar-task-details")/id("other-actions-box")/
        id("task-actions-toolbox")/id("task-actions-toolbar")/
        id("task-actions-priority")/id("task-actions-priority-menupopup")/
        {"class":"priority-1-menuitem"}`
    )
  );
  sleep();
  let priorityNode = eid("calendar-task-details-priority-high");
  controller.assertNotDOMProperty(priorityNode, "hidden");

  // Verify that tooltip shows status, priority and percent complete.
  let toolTipNode = lookup(toolTip).getNode();
  toolTipNode.ownerGlobal.showToolTip(toolTipNode, taskTreeNode.getTaskAtRow(0));

  let toolTipName = lookup(toolTipTable + "[0]/[1]");
  let toolTipCalendar = lookup(toolTipTable + "[1]/[1]");
  let toolTipPriority = lookup(toolTipTable + "[2]/[1]");
  let toolTipStatus = lookup(toolTipTable + "[3]/[1]");
  let toolTipComplete = lookup(toolTipTable + "[4]/[1]");

  controller.assertJSProperty(toolTipName, "textContent", TITLE);
  controller.assertJSProperty(toolTipCalendar, "textContent", CALENDARNAME);
  controller.assertJSProperty(toolTipPriority, "textContent", "High");
  controller.assertJSProperty(toolTipStatus, "textContent", "Needs Action");
  controller.assertJSProperty(toolTipComplete, "textContent", PERCENTCOMPLETE + "%");

  // Mark completed, verify.
  controller.click(eid("task-actions-markcompleted"));
  sleep();

  toolTipNode.ownerGlobal.showToolTip(toolTipNode, taskTreeNode.getTaskAtRow(0));
  controller.assertJSProperty(toolTipStatus, "textContent", "Completed");

  // Delete task and verify.
  controller.click(eid("calendar-delete-task-button"));
  controller.waitFor(() => taskTreeNode.mTaskArray.length == 0, "Task did not delete");

  let tabmail = controller.window.document.getElementById("tabmail");
  tabmail.closeTab(tabmail.currentTabInfo);

  Assert.ok(true, "Test ran to completion");
});

registerCleanupFunction(function teardownModule(module) {
  deleteCalendars(controller, CALENDARNAME);
  closeAllEventDialogs();
});
