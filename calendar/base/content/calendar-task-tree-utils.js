/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported addCalendarNames, calendars, changeContextMenuForTask,
 *          contextChangeTaskCalendar, contextChangeTaskPriority,
 *          contextPostponeTask, modifyTaskFromContext, deleteToDoCommand,
 *          tasksToMail, tasksToEvents, toggleCompleted,
 */

/* import-globals-from ../../../../toolkit/content/globalOverlay.js */
/* import-globals-from item-editing/calendar-item-editing.js */
/* import-globals-from item-editing/calendar-item-panel.js */
/* import-globals-from calendar-command-controller.js */
/* import-globals-from calendar-dnd-listener.js */
/* import-globals-from calendar-ui-utils.js */
/* import-globals-from calendar-views-utils.js */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

/**
 * Add registered calendars to the given menupopup. Removes all previous
 * children.
 *
 * @param aEvent    The popupshowing event of the opening menu
 */
function addCalendarNames(aEvent) {
  let calendarMenuPopup = aEvent.target;
  while (calendarMenuPopup.hasChildNodes()) {
    calendarMenuPopup.lastChild.remove();
  }
  let tasks = getSelectedTasks(aEvent);
  let tasksSelected = tasks.length > 0;
  if (tasksSelected) {
    let selIndex = appendCalendarItems(
      tasks[0],
      calendarMenuPopup,
      null,
      "contextChangeTaskCalendar(event);"
    );
    if (tasks.every(task => task.calendar == tasks[0].calendar) && selIndex > -1) {
      calendarMenuPopup.children[selIndex].setAttribute("checked", "true");
    }
  }
}

/**
 * For each child of an element (for example all menuitems in a menu), if it defines a command
 * set an attribute on the command, otherwise set it on the child node itself.
 *
 * @param aAttribute {string}       The attribute to set.
 * @param aValue {boolean|string}   The value to set.
 * @param aElement {Element}        The parent node.
 */
function setAttributeOnChildrenOrTheirCommands(aAttribute, aValue, aElement) {
  for (let child of aElement.children) {
    const commandName = child.getAttribute("command");
    const command = commandName && document.getElementById(commandName);

    const domObject = command || child;
    domObject.setAttribute(aAttribute, aValue);
  }
}

/**
 * Change the opening context menu for the selected tasks.
 *
 * @param aEvent    The popupshowing event of the opening menu.
 */
function changeContextMenuForTask(aEvent) {
  handleTaskContextMenuStateChange(aEvent);

  const treeNodeId = aEvent.target.triggerNode.closest(".calendar-task-tree").id;
  const isTodaypane = treeNodeId == "unifinder-todo-tree";
  const isMainTaskTree = treeNodeId == "calendar-task-tree";

  document.getElementById("task-context-menu-new").hidden = isTodaypane;
  document.getElementById("task-context-menu-modify").hidden = isTodaypane;
  document.getElementById("task-context-menu-new-todaypane").hidden = isMainTaskTree;
  document.getElementById("task-context-menu-modify-todaypane").hidden = isMainTaskTree;
  document.getElementById("task-context-menu-filter-todaypane").hidden = isMainTaskTree;
  document.getElementById("task-context-menu-separator-filter").hidden = isMainTaskTree;

  let items = getSelectedTasks(aEvent);
  let tasksSelected = items.length > 0;

  setAttributeOnChildrenOrTheirCommands("disabled", !tasksSelected, aEvent.target);

  if (
    calendarController.isCommandEnabled("calendar_new_todo_command") &&
    calendarController.isCommandEnabled("calendar_new_todo_todaypane_command")
  ) {
    document.getElementById("calendar_new_todo_command").removeAttribute("disabled");
    document.getElementById("calendar_new_todo_todaypane_command").removeAttribute("disabled");
  } else {
    document.getElementById("calendar_new_todo_command").setAttribute("disabled", "true");
    document.getElementById("calendar_new_todo_todaypane_command").setAttribute("disabled", "true");
  }

  // make sure the "Paste" and "Cut" menu items are enabled
  goUpdateCommand("cmd_paste");
  goUpdateCommand("cmd_cut");

  // make sure the filter menu is enabled
  document.getElementById("task-context-menu-filter-todaypane").removeAttribute("disabled");

  setAttributeOnChildrenOrTheirCommands(
    "disabled",
    false,
    document.getElementById("task-context-menu-filter-todaypane-popup")
  );

  changeMenuForTask(aEvent);

  let menu = document.getElementById("task-context-menu-attendance-menu");
  setupAttendanceMenu(menu, items);
}

/**
 * Notify the task tree that the context menu open state has changed.
 *
 * @param aEvent    The popupshowing or popuphiding event of the menu.
 */
function handleTaskContextMenuStateChange(aEvent) {
  let tree = aEvent.target.triggerNode.closest(".calendar-task-tree");

  if (tree) {
    tree.updateFocus();
  }
}

/**
 * Change the opening menu for the selected tasks.
 *
 * @param aEvent    The popupshowing event of the opening menu.
 */
function changeMenuForTask(aEvent) {
  // Make sure to update the status of some commands.
  let commands = [
    "calendar_delete_todo_command",
    "calendar_toggle_completed_command",
    "calendar_general-progress_command",
    "calendar_general-priority_command",
    "calendar_general-postpone_command",
  ];
  commands.forEach(goUpdateCommand);

  let tasks = getSelectedTasks(aEvent);
  let tasksSelected = tasks.length > 0;
  if (tasksSelected) {
    let cmd = document.getElementById("calendar_toggle_completed_command");
    if (tasks.every(task => task.isCompleted == tasks[0].isCompleted)) {
      cmd.checked = tasks[0].isCompleted;
    } else {
      cmd.checked = false;
    }
  }
}

/**
 * Handler function to change the progress of all selected tasks, or of
 * the task loaded in the current tab.
 *
 * @param {XULCommandEvent} aEvent  The DOM event that triggered this command
 * @param {short} aProgress         The new progress percentage
 */
function contextChangeTaskProgress(aEvent, aProgress) {
  if (gTabmail && gTabmail.currentTabInfo.mode.type == "calendarTask") {
    editToDoStatus(aProgress);
  } else {
    startBatchTransaction();
    let tasks = getSelectedTasks(aEvent);
    for (let task of tasks) {
      let newTask = task.clone().QueryInterface(Ci.calITodo);
      newTask.percentComplete = aProgress;
      switch (aProgress) {
        case 0:
          newTask.isCompleted = false;
          break;
        case 100:
          newTask.isCompleted = true;
          break;
        default:
          newTask.status = "IN-PROCESS";
          newTask.completedDate = null;
          break;
      }
      doTransaction("modify", newTask, newTask.calendar, task, null);
    }
    endBatchTransaction();
  }
}

/**
 * Handler function to change the calendar of the selected tasks. The targeted
 * menuitem must have "calendar" property that implements calICalendar.
 *
 * @param aEvent      The DOM event that triggered this command.
 */
function contextChangeTaskCalendar(aEvent) {
  startBatchTransaction();
  let tasks = getSelectedTasks(aEvent);
  for (let task of tasks) {
    let newTask = task.clone();
    newTask.calendar = aEvent.target.calendar;
    doTransaction("modify", newTask, newTask.calendar, task, null);
  }
  endBatchTransaction();
}

/**
 * Handler function to change the priority of the selected tasks, or of
 * the task loaded in the current tab.
 *
 * @param {XULCommandEvent} aEvent  The DOM event that triggered this command
 * @param {short} aPriority         The priority to set on the task(s)
 */
function contextChangeTaskPriority(aEvent, aPriority) {
  let tabType = gTabmail && gTabmail.currentTabInfo.mode.type;
  if (tabType == "calendarTask" || tabType == "calendarEvent") {
    editConfigState({ priority: aPriority });
  } else {
    startBatchTransaction();
    let tasks = getSelectedTasks(aEvent);
    for (let task of tasks) {
      let newTask = task.clone().QueryInterface(Ci.calITodo);
      newTask.priority = aPriority;
      doTransaction("modify", newTask, newTask.calendar, task, null);
    }
    endBatchTransaction();
  }
}

/**
 * Handler function to postpone the start and due dates of the selected
 * tasks, or of the task loaded in the current tab. ISO 8601 format:
 * "PT1H", "P1D", and "P1W" are 1 hour, 1 day, and 1 week. (We use this
 * format intentionally instead of a calIDuration object because those
 * objects cannot be serialized for message passing with iframes.)
 *
 * @param {XULCommandEvent} aEvent  The DOM event that triggered this command
 * @param {string} aDuration        The duration to postpone in ISO 8601 format
 */
function contextPostponeTask(aEvent, aDuration) {
  let duration = cal.createDuration(aDuration);
  if (!duration) {
    cal.LOG("[calendar-task-tree] Postpone Task - Invalid duration " + aDuration);
    return;
  }

  if (gTabmail && gTabmail.currentTabInfo.mode.type == "calendarTask") {
    postponeTask(aDuration);
  } else {
    startBatchTransaction();
    let tasks = getSelectedTasks(aEvent);

    tasks.forEach(task => {
      if (task.entryDate || task.dueDate) {
        let newTask = task.clone();
        cal.item.shiftOffset(newTask, duration);
        doTransaction("modify", newTask, newTask.calendar, task, null);
      }
    });

    endBatchTransaction();
  }
}

/**
 * Modifies the selected tasks with the event dialog
 *
 * @param aEvent        The DOM event that triggered this command.
 * @param initialDate   (optional) The initial date for new task datepickers
 */
function modifyTaskFromContext(aEvent, initialDate) {
  let tasks = getSelectedTasks(aEvent);
  for (let task of tasks) {
    modifyEventWithDialog(task, true, initialDate);
  }
}

/**
 *  Delete the current selected item with focus from the task tree
 *
 * @param aEvent          The DOM event that triggered this command.
 * @param aDoNotConfirm   If true, the user will not be asked to delete.
 */
function deleteToDoCommand(aEvent, aDoNotConfirm) {
  let tasks = getSelectedTasks(aEvent);
  calendarViewController.deleteOccurrences(tasks, false, aDoNotConfirm);
}

/**
 * Gets the currently visible task tree
 *
 * @return    The XUL task tree element.
 */
function getTaskTree() {
  if (gCurrentMode == "task") {
    return document.getElementById("calendar-task-tree");
  }
  return document.getElementById("unifinder-todo-tree");
}

/**
 * Gets the tasks selected in the currently visible task tree.
 *
 * XXX Parameter aEvent is unused, needs to be removed here and in calling
 * functions.
 *
 * @param aEvent      Unused
 */
function getSelectedTasks(aEvent) {
  let taskTree = getTaskTree();
  return taskTree ? taskTree.selectedTasks : [];
}

/**
 * Convert selected tasks to emails.
 */
function tasksToMail(aEvent) {
  let tasks = getSelectedTasks(aEvent);
  calendarMailButtonDNDObserver.onDropItems(tasks);
}

/**
 * Convert selected tasks to events.
 */
function tasksToEvents(aEvent) {
  let tasks = getSelectedTasks(aEvent);
  calendarCalendarButtonDNDObserver.onDropItems(tasks);
}

/**
 * Toggle the completed state on selected tasks.
 *
 * @param aEvent    The originating event, can be null.
 */
function toggleCompleted(aEvent) {
  if (aEvent.target.getAttribute("checked") == "true") {
    contextChangeTaskProgress(aEvent, 0);
  } else {
    contextChangeTaskProgress(aEvent, 100);
  }
}
