/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint-enable valid-jsdoc */

/* exported addCalendarNames, calendars, changeContextMenuForTask,
 *          contextChangeTaskCalendar, contextChangeTaskPriority,
 *          contextPostponeTask, modifyTaskFromContext, deleteToDoCommand,
 *          tasksToMail, tasksToEvents, toggleCompleted,
 */

/* import-globals-from ../../../mail/base/content/globalOverlay.js */
/* import-globals-from item-editing/calendar-item-editing.js */
/* import-globals-from item-editing/calendar-item-panel.js */
/* import-globals-from calendar-command-controller.js */
/* import-globals-from calendar-dnd-listener.js */
/* import-globals-from calendar-ui-utils.js */
/* import-globals-from calendar-views-utils.js */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

/**
 * Add registered calendars to the given menupopup. Removes all previous
 * children.
 *
 * @param {Event} aEvent - The popupshowing event of the opening menu.
 */
function addCalendarNames(aEvent) {
  const calendarMenuPopup = aEvent.target;
  while (calendarMenuPopup.hasChildNodes()) {
    calendarMenuPopup.lastChild.remove();
  }
  const tasks = getSelectedTasks();
  const tasksSelected = tasks.length > 0;
  if (tasksSelected) {
    const selIndex = appendCalendarItems(
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
 * For each child of an element (for example all menuitems in a menu),
 * if it defines a command set an attribute on the command, otherwise set it
 * on the child node itself.
 *
 * @param {string} aAttribute - The attribute to set.
 * @param {boolean|string} aValue - The value to set.
 * @param {Element} aElement - The parent node.
 */
function setAttributeOnChildrenOrTheirCommands(aAttribute, aValue, aElement) {
  for (const child of aElement.children) {
    const commandName = child.getAttribute("command");
    const command = commandName && document.getElementById(commandName);

    const domObject = command || child;
    domObject.setAttribute(aAttribute, aValue);
  }
}

/**
 * Change the opening context menu for the selected tasks.
 *
 * @param {Event} aEvent - The popupshowing event of the opening menu.
 */
function changeContextMenuForTask(aEvent) {
  if (aEvent.target.id !== "taskitem-context-menu") {
    return;
  }

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

  const items = getSelectedTasks();
  const tasksSelected = items.length > 0;

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

  changeMenuForTask();

  const menu = document.getElementById("task-context-menu-attendance-menu");
  setupAttendanceMenu(menu, items);
}

/**
 * Notify the task tree that the context menu open state has changed.
 *
 * @param {Event} aEvent - The popupshowing or popuphiding event of the menu.
 */
function handleTaskContextMenuStateChange(aEvent) {
  if (aEvent.target.id !== "taskitem-context-menu") {
    return;
  }

  const tree = aEvent.target.triggerNode.closest(".calendar-task-tree");

  if (tree) {
    tree.updateFocus();
  }
}

/**
 * Change the opening menu for the selected tasks.
 */
function changeMenuForTask() {
  // Make sure to update the status of some commands.
  const commands = [
    "calendar_delete_todo_command",
    "calendar_toggle_completed_command",
    "calendar_general-progress_command",
    "calendar_general-priority_command",
    "calendar_general-postpone_command",
  ];
  commands.forEach(goUpdateCommand);

  const tasks = getSelectedTasks();
  const tasksSelected = tasks.length > 0;
  if (tasksSelected) {
    const cmd = document.getElementById("calendar_toggle_completed_command");
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
 * @param {short} aProgress - The new progress percentage
 */
function contextChangeTaskProgress(aProgress) {
  if (gTabmail && gTabmail.currentTabInfo.mode.type == "calendarTask") {
    editToDoStatus(aProgress);
  } else {
    startBatchTransaction();
    const tasks = getSelectedTasks();
    for (const task of tasks) {
      const newTask = task.clone().QueryInterface(Ci.calITodo);
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
 * @param {Event} aEvent - The DOM event that triggered this command.
 */
function contextChangeTaskCalendar(aEvent) {
  startBatchTransaction();
  const tasks = getSelectedTasks();
  for (const task of tasks) {
    const newTask = task.clone();
    newTask.calendar = aEvent.target.calendar;
    doTransaction("modify", newTask, newTask.calendar, task, null);
  }
  endBatchTransaction();
}

/**
 * Handler function to change the priority of the selected tasks, or of
 * the task loaded in the current tab.
 *
 * @param {short} aPriority - The priority to set on the task(s)
 */
function contextChangeTaskPriority(aPriority) {
  const tabType = gTabmail && gTabmail.currentTabInfo.mode.type;
  if (tabType == "calendarTask" || tabType == "calendarEvent") {
    editConfigState({ priority: aPriority });
  } else {
    startBatchTransaction();
    const tasks = getSelectedTasks();
    for (const task of tasks) {
      const newTask = task.clone().QueryInterface(Ci.calITodo);
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
 * @param {string} aDuration - The duration to postpone in ISO 8601 format
 */
function contextPostponeTask(aDuration) {
  const duration = cal.createDuration(aDuration);
  if (!duration) {
    cal.LOG("[calendar-task-tree] Postpone Task - Invalid duration " + aDuration);
    return;
  }

  if (gTabmail && gTabmail.currentTabInfo.mode.type == "calendarTask") {
    postponeTask(aDuration);
  } else {
    startBatchTransaction();
    const tasks = getSelectedTasks();

    tasks.forEach(task => {
      if (task.entryDate || task.dueDate) {
        const newTask = task.clone();
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
 * @param {calIDateTime} [initialDate] - The initial date for new task datepickers.
 */
function modifyTaskFromContext(initialDate) {
  const tasks = getSelectedTasks();
  for (const task of tasks) {
    modifyEventWithDialog(task, true, initialDate);
  }
}

/**
 * Delete the current selected item with focus from the task tree
 *
 * @param {boolean} aDoNotConfirm - If true, the user will not be asked to delete.
 */
function deleteToDoCommand(aDoNotConfirm) {
  const tasks = getSelectedTasks();
  calendarViewController.deleteOccurrences(tasks, false, aDoNotConfirm);
}

/**
 * Gets the currently visible task tree.
 *
 * @returns {Element} The XUL task tree element.
 */
function getTaskTree() {
  if (gCurrentMode == "task") {
    return document.getElementById("calendar-task-tree");
  }
  return document.getElementById("unifinder-todo-tree");
}

/**
 * Gets the tasks selected in the currently visible task tree.
 */
function getSelectedTasks() {
  const taskTree = getTaskTree();
  return taskTree ? taskTree.selectedTasks : [];
}

/**
 * Convert selected tasks to emails.
 */
function tasksToMail() {
  const tasks = getSelectedTasks();
  calendarMailButtonDNDObserver.onDropItems(tasks);
}

/**
 * Convert selected tasks to events.
 */
function tasksToEvents() {
  const tasks = getSelectedTasks();
  calendarCalendarButtonDNDObserver.onDropItems(tasks);
}

/**
 * Toggle the completed state on selected tasks.
 *
 * @param {?Event} aEvent - The originating event, can be null.
 */
function toggleCompleted(aEvent) {
  if (aEvent.target.getAttribute("checked") == "true") {
    contextChangeTaskProgress(0);
  } else {
    contextChangeTaskProgress(100);
  }
}
