/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils"];

var helpersForController, invokeEventDialog, createCalendar, deleteCalendars;
var setData;
var CALENDARNAME;

var TITLE = "Task";
var DESCRIPTION = "1. Do A\n2. Do B";
var percentComplete = "50";

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({
        helpersForController,
        invokeEventDialog,
        createCalendar,
        deleteCalendars,
        setData,
        CALENDARNAME
    } = collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule();
    Object.assign(module, helpersForController(controller));

    createCalendar(controller, CALENDARNAME);
}

// mozmill doesn't support trees yet, therefore completed checkbox and line-through style are not
// checked
function testTaskView() {
    // paths
    let taskView = `
        /id("messengerWindow")/id("tabmail-container")/id("tabmail")/id("tabmail-tabbox")/
        id("tabpanelcontainer")/id("calendarTabPanel")/id("calendarContent")/
        id("calendarDisplayDeck")/id("calendar-task-box")/
    `;
    let treeChildren = `
        ${taskView}/[1]/id("calendar-task-tree")/
        anon({"anonid":"calendar-task-tree"})/{"tooltip":"taskTreeTooltip"}
    `;
    let taskTree = taskView + '[1]/id("calendar-task-tree")';
    let toolTip = '/id("messengerWindow")/id("calendar-popupset")/id("taskTreeTooltip")';
    let toolTipGrid = toolTip + '/{"class":"tooltipBox"}/{"class":"tooltipHeaderGrid"}/';

    // open task view
    controller.click(eid("task-tab-button"));
    sleep();

    // make sure that testing calendar is selected
    let calendarTree = lookup(`
        /id("messengerWindow")/id("tabmail-container")/id("tabmail")/id("tabmail-tabbox")/
        id("tabpanelcontainer")/id("calendarTabPanel")/id("calendarContent")/
        id("ltnSidebar")/id("calendar-panel")/id("calendar-list-pane")/
        id("calendar-listtree-pane")/id("calendar-list-tree-widget")
    `).getNode();

    for (let i = 0; i < calendarTree.mCalendarList.length; i++) {
        if (calendarTree.mCalendarList[i].name == CALENDARNAME) {
            calendarTree.tree.view.selection.select(i);
        }
    }

    let taskTreeNode = lookup(taskTree).getNode();
    let countBefore = taskTreeNode.mTaskArray.length;

    // add task
    controller.type(lookup(`
        ${taskView}/id("task-addition-box")/[0]/id("view-task-edit-field")/
        anon({"anonid":"moz-input-box"})/anon({"anonid":"input"})
    `), TITLE);
    controller.keypress(lookup(`
        ${taskView}/id("task-addition-box")/[0]/id("view-task-edit-field")/
        anon({"anonid":"moz-input-box"})/anon({"anonid":"input"})
    `), "VK_RETURN", {});

    // verify added
    let countAfter;
    controller.waitFor(() => {
        countAfter = taskTreeNode.mTaskArray.length;
        return countBefore + 1 == countAfter;
    });

    // last added task is automatically selected so verify detail window data
    controller.assertJSProperty(eid("calendar-task-details-title"), "textContent", TITLE);

    // open added task
    // doubleclick on completion checkbox is ignored as opening action, so don't click at immediate
    // left where the checkbox is located
    controller.doubleClick(lookup(treeChildren), 50, 0);
    invokeEventDialog(controller, null, (task, iframe) => {
        let { eid: taskid } = helpersForController(task);
        let { eid: iframeId } = helpersForController(iframe);

        // verify calendar
        controller.assertValue(iframeId("item-calendar"), CALENDARNAME);

        setData(task, iframe, { status: "needs-action", percent: percentComplete, description: DESCRIPTION });

        // save
        task.click(taskid("button-saveandclose"));
    });

    // verify description and status in details pane
    controller.assertValue(lookup(`
        ${taskView}/{"flex":"1"}/id("calendar-task-details-container")/
        id("calendar-task-details-description")/
        anon({"anonid":"moz-input-box"})/anon({"anonid":"input"})
    `), DESCRIPTION);
    controller.assertValue(eid("calendar-task-details-status"), "Needs Action");

    // This is a hack.
    taskTreeNode.getTaskAtRow(0).calendar.setProperty("capabilities.priority.supported", true);

    // set high priority and verify it in detail pane
    controller.click(eid("task-actions-priority"));
    sleep();
    controller.click(eid("priority-1-menuitem"));
    sleep();
    let priorityNode = eid("calendar-task-details-priority-high");
    controller.assertNotDOMProperty(priorityNode, "hidden");

    // verify that tooltip shows status, priority and percent complete
    let toolTipNode = lookup(toolTip).getNode();
    toolTipNode.ownerGlobal.showToolTip(toolTipNode, taskTreeNode.getTaskAtRow(0));

    let toolTipName = lookup(toolTipGrid + "[1]/[0]/[1]");
    let toolTipCalendar = lookup(toolTipGrid + "[1]/[1]/[1]");
    let toolTipPriority = lookup(toolTipGrid + "[1]/[2]/[1]");
    let toolTipStatus = lookup(toolTipGrid + "[1]/[3]/[1]");
    let toolTipComplete = lookup(toolTipGrid + "[1]/[4]/[1]");

    controller.assertJSProperty(toolTipName, "textContent", TITLE);
    controller.assertJSProperty(toolTipCalendar, "textContent", CALENDARNAME);
    controller.assertJSProperty(toolTipPriority, "textContent", "High");
    controller.assertJSProperty(toolTipStatus, "textContent", "Needs Action");
    controller.assertJSProperty(toolTipComplete, "textContent", percentComplete + "%");

    // mark completed, verify
    controller.click(eid("task-actions-markcompleted"));
    sleep();

    toolTipNode.ownerGlobal.showToolTip(toolTipNode, taskTreeNode.getTaskAtRow(0));
    controller.assertJSProperty(toolTipStatus, "textContent", "Completed");

    // delete task, verify
    controller.click(eid("task-context-menu-delete"));
    controller.click(eid("calendar-delete-task-button"));
    let countAfterDelete;
    controller.waitFor(() => {
        countAfterDelete = taskTreeNode.mTaskArray.length;
        return countAfter - 1 == countAfterDelete;
    });
}

function teardownTest(module) {
    deleteCalendars(controller, CALENDARNAME);
}
