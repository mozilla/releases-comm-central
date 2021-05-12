/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../calendar-management.js */
/* import-globals-from ../calendar-ui-utils.js */
/* import-globals-from calendar-item-editing.js */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

var { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  CalTodo: "resource:///modules/CalTodo.jsm",
});

/**
 * Used by the "quick add" feature for tasks, for example in the task view or
 * the uniinder-todo.
 *
 * NOTE: many of the following methods are called without taskEdit being the
 * |this| object.
 */

var taskEdit = {
  /**
   * Get the currently observed calendar.
   */
  mObservedCalendar: null,
  get observedCalendar() {
    return this.mObservedCalendar;
  },

  /**
   * Set the currently observed calendar, removing listeners to any old
   * calendar set and adding listeners to the new one.
   */
  set observedCalendar(aCalendar) {
    if (this.mObservedCalendar) {
      this.mObservedCalendar.removeObserver(this.calendarObserver);
    }

    this.mObservedCalendar = aCalendar;

    if (this.mObservedCalendar) {
      this.mObservedCalendar.addObserver(this.calendarObserver);
    }
  },

  /**
   * Helper function to set readonly and aria-disabled states and the value
   * for a given target.
   *
   * @param aTarget   The ID or XUL node to set the value
   * @param aDisable  A boolean if the target should be disabled.
   * @param aValue    The value that should be set on the target.
   */
  setupTaskField(aTarget, aDisable, aValue) {
    aTarget.value = aValue;
    aTarget.readonly = aDisable;
    aTarget.ariaDisabled = aDisable;
  },

  /**
   * Handler function to call when the quick-add input gains focus.
   *
   * @param aEvent    The DOM focus event
   */
  onFocus(aEvent) {
    let edit = aEvent.target;
    let calendar = getSelectedCalendar();
    edit.showsInstructions = true;

    if (calendar.getProperty("capabilities.tasks.supported") === false) {
      taskEdit.setupTaskField(edit, true, cal.l10n.getCalString("taskEditInstructionsCapability"));
    } else if (cal.acl.isCalendarWritable(calendar)) {
      edit.showsInstructions = false;
      taskEdit.setupTaskField(edit, false, edit.savedValue || "");
    } else {
      taskEdit.setupTaskField(edit, true, cal.l10n.getCalString("taskEditInstructionsReadonly"));
    }
  },

  /**
   * Handler function to call when the quick-add input loses focus.
   *
   * @param aEvent    The DOM blur event
   */
  onBlur(aEvent) {
    let edit = aEvent.target;
    let calendar = getSelectedCalendar();
    if (!calendar) {
      // this must be a first run, we don't have a calendar yet
      return;
    }

    if (calendar.getProperty("capabilities.tasks.supported") === false) {
      taskEdit.setupTaskField(edit, true, cal.l10n.getCalString("taskEditInstructionsCapability"));
    } else if (cal.acl.isCalendarWritable(calendar)) {
      if (!edit.showsInstructions) {
        edit.savedValue = edit.value || "";
      }
      taskEdit.setupTaskField(edit, false, cal.l10n.getCalString("taskEditInstructions"));
    } else {
      taskEdit.setupTaskField(edit, true, cal.l10n.getCalString("taskEditInstructionsReadonly"));
    }
    edit.showsInstructions = true;
  },

  /**
   * Handler function to call on keypress for the quick-add input.
   *
   * @param aEvent    The DOM keypress event
   */
  onKeyPress(aEvent) {
    if (aEvent.key == "Enter") {
      let edit = aEvent.target;
      if (edit.value && edit.value.length > 0) {
        let item = new CalTodo();
        setDefaultItemValues(item);
        item.title = edit.value;

        edit.value = "";
        doTransaction("add", item, item.calendar, null, null);
      }
    }
  },

  /**
   * Load function to set up all quick-add inputs. The input must
   * have the class "task-edit-field".
   */
  onLoad(aEvent) {
    let taskEditFields = document.getElementsByClassName("task-edit-field");
    for (let i = 0; i < taskEditFields.length; i++) {
      taskEdit.onBlur({ target: taskEditFields[i] });
    }

    cal.view.getCompositeCalendar(window).addObserver(taskEdit.compositeObserver);
    taskEdit.observedCalendar = getSelectedCalendar();
  },

  /**
   * Window load function to clean up all quick-add fields.
   */
  onUnload() {
    cal.view.getCompositeCalendar(window).removeObserver(taskEdit.compositeObserver);
    taskEdit.observedCalendar = null;
  },

  /**
   * Observer to watch for readonly, disabled and capability changes of the
   * observed calendar.
   *
   * @see calIObserver
   */
  calendarObserver: {
    QueryInterface: ChromeUtils.generateQI(["calIObserver"]),

    // calIObserver:
    onStartBatch() {},
    onEndBatch() {},
    onLoad(aCalendar) {},
    onAddItem(aItem) {},
    onModifyItem(aNewItem, aOldItem) {},
    onDeleteItem(aDeletedItem) {},
    onError(aCalendar, aErrNo, aMessage) {},

    onPropertyChanged(aCalendar, aName, aValue, aOldValue) {
      if (aCalendar.id != getSelectedCalendar().id) {
        // Optimization: if the given calendar isn't the default calendar,
        // then we don't need to change any readonly/disabled states.
        return;
      }
      switch (aName) {
        case "readOnly":
        case "disabled": {
          let taskEditFields = document.getElementsByClassName("task-edit-field");
          for (let i = 0; i < taskEditFields.length; i++) {
            taskEdit.onBlur({ target: taskEditFields[i] });
          }
          break;
        }
      }
    },

    onPropertyDeleting(aCalendar, aName) {
      // Since the old value is not used directly in onPropertyChanged,
      // but should not be the same as the value, set it to a different
      // value.
      this.onPropertyChanged(aCalendar, aName, null, null);
    },
  },

  /**
   * Observer to watch for changes to the selected calendar.
   *
   * XXX I think we don't need to implement calIObserver here.
   *
   * @see calICompositeObserver
   */
  compositeObserver: {
    QueryInterface: ChromeUtils.generateQI(["calIObserver", "calICompositeObserver"]),

    // calIObserver:
    onStartBatch() {},
    onEndBatch() {},
    onLoad(aCalendar) {},
    onAddItem(aItem) {},
    onModifyItem(aNewItem, aOldItem) {},
    onDeleteItem(aDeletedItem) {},
    onError(aCalendar, aErrNo, aMessage) {},
    onPropertyChanged(aCalendar, aName, aValue, aOldValue) {},
    onPropertyDeleting(aCalendar, aName) {},

    // calICompositeObserver:
    onCalendarAdded(aCalendar) {},
    onCalendarRemoved(aCalendar) {},
    onDefaultCalendarChanged(aNewDefault) {
      let taskEditFields = document.getElementsByClassName("task-edit-field");
      for (let i = 0; i < taskEditFields.length; i++) {
        taskEdit.onBlur({ target: taskEditFields[i] });
      }
      taskEdit.observedCalendar = aNewDefault;
    },
  },
};
