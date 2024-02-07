/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from item-editing/calendar-item-panel.js */

// Importing from calendar-task-tree-utils.js puts ESLint in a fatal loop.
/* globals getSelectedTasks, MozElements, MozXULElement,
           setAttributeOnChildrenOrTheirCommands */

/* eslint-enable valid-jsdoc */

"use strict";

// Wrap in a block and use const to define functions to prevent leaking to window scope.
{
  /**
   * Get a property value for a group of tasks. If all the tasks have the same property value
   * then return that value, otherwise return null.
   *
   * @param {string} propertyKey - The property key.
   * @param {object[]} tasks - The tasks.
   * @returns {string|null} The property value or null.
   */
  const getPropertyValue = (propertyKey, tasks) => {
    let propertyValue = null;
    const tasksSelected = tasks != null && tasks.length > 0;
    if (tasksSelected && tasks.every(task => task[propertyKey] == tasks[0][propertyKey])) {
      propertyValue = tasks[0][propertyKey];
    }
    return propertyValue;
  };

  /**
   * Updates the 'checked' state of menu items so they reflect the state of the relevant task(s),
   * for example, tasks currently selected in the task list, or a task being edited in the
   * current tab. It operates on commands that are named using the following pattern:
   *
   *   'calendar_' +  propertyKey + ' + '-' + propertyValue + '_command'
   *
   * When the propertyValue part of a command's name matches the propertyValue of the tasks,
   * set the command to 'checked=true', as long as the tasks all have the same propertyValue.
   *
   * @param {Element} parent - Parent element that contains the menu items as direct children.
   * @param {string} propertyKey - The property key, for example "priority" or "percentComplete".
   */
  const updateMenuItemsState = (parent, propertyKey) => {
    setAttributeOnChildrenOrTheirCommands("checked", false, parent);

    const inSingleTaskTab =
      gTabmail && gTabmail.currentTabInfo && gTabmail.currentTabInfo.mode.type == "calendarTask";

    const propertyValue = inSingleTaskTab
      ? gConfig[propertyKey]
      : getPropertyValue(propertyKey, getSelectedTasks());

    if (propertyValue || propertyValue === 0) {
      const commandName = "calendar_" + propertyKey + "-" + propertyValue + "_command";
      const command = document.getElementById(commandName);
      if (command) {
        command.setAttribute("checked", "true");
      }
    }
  };

  /**
   * A menupopup for changing the "progress" (percent complete) status for a task or tasks. It
   * indicates the current status by displaying a checkmark next to the menu item for that status.
   *
   * @augments {MozElements.MozMenuPopup}
   */
  class CalendarTaskProgressMenupopup extends MozElements.MozMenuPopup {
    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasConnected) {
        return;
      }
      // this.hasConnected is set to true in super.connectedCallback
      super.connectedCallback();

      this.appendChild(
        MozXULElement.parseXULToFragment(
          `
          <menuitem class="percent-0-menuitem"
                    type="checkbox"
                    label="&progress.level.0;"
                    accesskey="&progress.level.0.accesskey;"
                    command="calendar_percentComplete-0_command"/>
          <menuitem class="percent-25-menuitem"
                    type="checkbox"
                    label="&progress.level.25;"
                    accesskey="&progress.level.25.accesskey;"
                    command="calendar_percentComplete-25_command"/>
          <menuitem class="percent-50-menuitem"
                    type="checkbox"
                    label="&progress.level.50;"
                    accesskey="&progress.level.50.accesskey;"
                    command="calendar_percentComplete-50_command"/>
          <menuitem class="percent-75-menuitem"
                    type="checkbox"
                    label="&progress.level.75;"
                    accesskey="&progress.level.75.accesskey;"
                    command="calendar_percentComplete-75_command"/>
          <menuitem class="percent-100-menuitem"
                    type="checkbox"
                    label="&progress.level.100;"
                    accesskey="&progress.level.100.accesskey;"
                    command="calendar_percentComplete-100_command"/>
          `,
          ["chrome://calendar/locale/calendar.dtd"]
        )
      );

      this.addEventListener(
        "popupshowing",
        updateMenuItemsState.bind(null, this, "percentComplete"),
        true
      );
    }
  }

  customElements.define("calendar-task-progress-menupopup", CalendarTaskProgressMenupopup, {
    extends: "menupopup",
  });

  /**
   * A menupopup for changing the "priority" status for a task or tasks. It indicates the current
   * status by displaying a checkmark next to the menu item for that status.
   *
   * @augments MozElements.MozMenuPopup
   */
  class CalendarTaskPriorityMenupopup extends MozElements.MozMenuPopup {
    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasConnected) {
        return;
      }
      // this.hasConnected is set to true in super.connectedCallback
      super.connectedCallback();

      this.appendChild(
        MozXULElement.parseXULToFragment(
          `
          <menuitem class="priority-0-menuitem"
                    type="checkbox"
                    label="&priority.level.none;"
                    accesskey="&priority.level.none.accesskey;"
                    command="calendar_priority-0_command"/>
          <menuitem class="priority-9-menuitem"
                    type="checkbox"
                    label="&priority.level.low;"
                    accesskey="&priority.level.low.accesskey;"
                    command="calendar_priority-9_command"/>
          <menuitem class="priority-5-menuitem"
                    type="checkbox"
                    label="&priority.level.normal;"
                    accesskey="&priority.level.normal.accesskey;"
                    command="calendar_priority-5_command"/>
          <menuitem class="priority-1-menuitem"
                    type="checkbox"
                    label="&priority.level.high;"
                    accesskey="&priority.level.high.accesskey;"
                    command="calendar_priority-1_command"/>
          `,
          ["chrome://calendar/locale/calendar.dtd"]
        )
      );

      this.addEventListener(
        "popupshowing",
        updateMenuItemsState.bind(null, this, "priority"),
        true
      );
    }
  }

  customElements.define("calendar-task-priority-menupopup", CalendarTaskPriorityMenupopup, {
    extends: "menupopup",
  });
}
