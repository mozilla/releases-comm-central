/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from calendar-modes.js */
/* import-globals-from calendar-tabs.js */
/* import-globals-from calendar-views-utils.js */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

/**
 * Namespace object to hold functions related to the today pane.
 */
var TodayPane = {
  isLoaded: false,
  paneViews: null,
  start: null,
  cwlabel: null,
  previousMode: null,
  switchCounter: 0,
  minidayTimer: null,
  minidayDrag: {
    startX: 0,
    startY: 0,
    distance: 0,
    session: false,
  },

  /**
   * Load Handler, sets up the today pane controls.
   */
  async onLoad() {
    this.isLoaded = true;

    TodayPane.paneViews = [
      cal.l10n.getCalString("eventsandtasks"),
      cal.l10n.getCalString("tasksonly"),
      cal.l10n.getCalString("eventsonly"),
    ];

    this.agenda = document.getElementById("agenda");

    TodayPane.updateDisplay();
    TodayPane.updateSplitterState();
    TodayPane.previousMode = gCurrentMode;
    TodayPane.showTodayPaneStatusLabel();

    document.getElementById("today-splitter").addEventListener("command", () => {
      window.dispatchEvent(new CustomEvent("viewresize"));
    });

    Services.obs.addObserver(TodayPane, "defaultTimezoneChanged");
  },

  /**
   * Unload handler, cleans up the today pane on window unload.
   */
  onUnload() {
    Services.obs.removeObserver(TodayPane, "defaultTimezoneChanged");
  },

  /**
   * React if the default timezone changes.
   */
  observe() {
    if (this.start !== null) {
      this.setDay(this.start.getInTimezone(cal.dtz.defaultTimezone));
    }
  },

  /**
   * Sets up the label for the switcher that allows switching between today pane
   * views. (event+task, task only, event only)
   */
  updateDisplay() {
    if (!this.isLoaded) {
      return;
    }
    let agendaIsVisible = document.getElementById("agenda-panel").isVisible(gCurrentMode);
    const todoIsVisible = document.getElementById("todo-tab-panel").isVisible(gCurrentMode);
    let index = 2;
    if (agendaIsVisible && todoIsVisible) {
      index = 0;
    } else if (!agendaIsVisible && todoIsVisible) {
      index = 1;
    } else if (agendaIsVisible && !todoIsVisible) {
      index = 2;
    } else {
      // agendaIsVisible == false && todoIsVisible == false:
      // In this case something must have gone wrong
      // - probably in the previous session - and no pane is displayed.
      // We set a default by only displaying agenda-pane.
      agendaIsVisible = true;
      document.getElementById("agenda-panel").setVisible(agendaIsVisible);
      index = 2;
    }
    const todayHeader = document.getElementById("today-pane-header");
    todayHeader.setAttribute("index", index);
    todayHeader.setAttribute("value", this.paneViews[index]);
    const todayPaneSplitter = document.getElementById("today-pane-splitter");
    todayPaneSplitter.hidden = index != 0;
    const todayIsVisible = document.getElementById("today-pane-panel").isVisible();

    // Disable or enable the today pane menuitems that have an attribute
    // name="minidisplay" depending on the visibility of elements.
    const menupopup = document.getElementById("calTodayPaneMenuPopup");
    if (menupopup) {
      for (const child of menupopup.children) {
        if (child.getAttribute("name") == "minidisplay") {
          child.disabled = !todayIsVisible || !agendaIsVisible;
        }
      }
    }

    if (todayIsVisible) {
      if (agendaIsVisible) {
        if (this.start === null) {
          this.setDay(cal.dtz.now());
        }
        if (document.getElementById("today-minimonth-box").isVisible()) {
          document.getElementById("today-minimonth").setAttribute("freebusy", "true");
        }
      }
      if (todoIsVisible) {
        // Add listener to update the date filters.
        getViewBox().addEventListener("dayselect", () => {
          this.updateCalendarToDoUnifinder();
        });
        this.updateCalendarToDoUnifinder();
      }
    }

    window.dispatchEvent(new CustomEvent("viewresize"));
  },

  /**
   * Updates the applied filter and show completed view of the unifinder todo.
   *
   * @param {string} [filter] - The filter name to set.
   */
  updateCalendarToDoUnifinder(filter) {
    const tree = document.getElementById("unifinder-todo-tree");
    if (!tree.hasBeenVisible) {
      tree.hasBeenVisible = true;
      tree.refresh();
    }

    // Set up hiding completed tasks for the unifinder-todo tree
    filter = filter || tree.getAttribute("filterValue") || "throughcurrent";
    tree.setAttribute("filterValue", filter);

    document
      .querySelectorAll("#task-context-menu-filter-todaypane-popup > menuitem")
      .forEach(item => {
        if (item.getAttribute("value") == filter) {
          item.setAttribute("checked", "true");
        } else {
          item.removeAttribute("checked");
        }
      });

    const showCompleted = document.getElementById("show-completed-checkbox").checked;
    if (!showCompleted) {
      const filterProps = tree.mFilter.getDefinedFilterProperties(filter);
      if (filterProps) {
        filterProps.status =
          (filterProps.status || filterProps.FILTER_STATUS_ALL) &
          (filterProps.FILTER_STATUS_INCOMPLETE | filterProps.FILTER_STATUS_IN_PROGRESS);
        filter = filterProps;
      }
    }

    // update the filter
    tree.showCompleted = showCompleted;
    tree.updateFilter(filter);
  },

  /**
   * Go to month/week/day views when double-clicking a label inside miniday
   */
  onDoubleClick(aEvent) {
    if (aEvent.button == 0) {
      if (aEvent.target.id == "datevalue-label") {
        switchCalendarView("day", true);
      } else if (aEvent.target.id == "weekdayNameLabel") {
        switchCalendarView("day", true);
      } else if (aEvent.target.id == "currentWeek-label") {
        switchCalendarView("week", true);
      } else if (aEvent.target.parentNode.id == "monthNameContainer") {
        switchCalendarView("month", true);
      } else {
        return;
      }
      document.getElementById("tabmail").openTab("calendar");
    }
  },

  /**
   * Set conditions about start dragging on day-label or start switching
   * with time on navigation buttons.
   */
  onMousedown(aEvent, aDir) {
    if (aEvent.button != 0) {
      return;
    }
    const element = aEvent.target;
    if (element.id == "previous-day-button" || element.id == "next-day-button") {
      // Start switching days by pressing, without release, the navigation buttons
      element.addEventListener("mouseout", TodayPane.stopSwitching);
      element.addEventListener("mouseup", TodayPane.stopSwitching);
      TodayPane.minidayTimer = setTimeout(
        TodayPane.updateAdvanceTimer.bind(TodayPane, Event, aDir),
        500
      );
    } else if (element.id == "datevalue-label") {
      // Start switching days by dragging the mouse with a starting point on the day label
      window.addEventListener("mousemove", TodayPane.onMousemove);
      window.addEventListener("mouseup", TodayPane.stopSwitching);
      TodayPane.minidayDrag.startX = aEvent.clientX;
      TodayPane.minidayDrag.startY = aEvent.clientY;
    }
  },

  /**
   * Figure out the mouse distance from the center of the day's label
   * to the current position.
   *
   * NOTE: This function is usually called without the correct this pointer.
   */
  onMousemove(aEvent) {
    const MIN_DRAG_DISTANCE_SQ = 49;
    const x = aEvent.clientX - TodayPane.minidayDrag.startX;
    const y = aEvent.clientY - TodayPane.minidayDrag.startY;
    if (TodayPane.minidayDrag.session) {
      if (x * x + y * y >= MIN_DRAG_DISTANCE_SQ) {
        const distance = Math.floor(Math.sqrt(x * x + y * y) - Math.sqrt(MIN_DRAG_DISTANCE_SQ));
        // Dragging on the left/right side, the day date decrease/increase
        TodayPane.minidayDrag.distance = x > 0 ? distance : -distance;
      } else {
        TodayPane.minidayDrag.distance = 0;
      }
    } else if (x * x + y * y > 9) {
      // move the mouse a bit before starting the drag session
      window.addEventListener("mouseout", TodayPane.stopSwitching);
      TodayPane.minidayDrag.session = true;
      const dragCenterImage = document.getElementById("dragCenter-image");
      dragCenterImage.removeAttribute("hidden");
      // Move the starting point in the center so we have a fixed
      // point where stopping the day switching while still dragging
      const centerObj = dragCenterImage.getBoundingClientRect();
      TodayPane.minidayDrag.startX = Math.floor(centerObj.x + centerObj.width / 2);
      TodayPane.minidayDrag.startY = Math.floor(centerObj.y + centerObj.height / 2);

      TodayPane.updateAdvanceTimer();
    }
  },

  /**
   * Figure out the days switching speed according to the position (when
   * dragging) or time elapsed (when pressing buttons).
   */
  updateAdvanceTimer(aEvent, aDir) {
    const INITIAL_TIME = 400;
    const REL_DISTANCE = 8;
    const MINIMUM_TIME = 100;
    const ACCELERATE_COUNT_LIMIT = 7;
    const SECOND_STEP_TIME = 200;
    if (TodayPane.minidayDrag.session) {
      // Dragging the day label: days switch with cursor distance and time.
      const dir = (TodayPane.minidayDrag.distance > 0) - (TodayPane.minidayDrag.distance < 0);
      TodayPane.advance(dir);
      const distance = Math.abs(TodayPane.minidayDrag.distance);
      // Linear relation between distance and switching speed
      const timeInterval = Math.max(
        Math.ceil(INITIAL_TIME - distance * REL_DISTANCE),
        MINIMUM_TIME
      );
      TodayPane.minidayTimer = setTimeout(
        TodayPane.updateAdvanceTimer.bind(TodayPane, null, null),
        timeInterval
      );
    } else {
      // Keeping pressed next/previous day buttons causes days switching (with
      // three levels higher speed after some commutations).
      TodayPane.advance(parseInt(aDir, 10));
      TodayPane.switchCounter++;
      let timeInterval = INITIAL_TIME;
      if (TodayPane.switchCounter > 2 * ACCELERATE_COUNT_LIMIT) {
        timeInterval = MINIMUM_TIME;
      } else if (TodayPane.switchCounter > ACCELERATE_COUNT_LIMIT) {
        timeInterval = SECOND_STEP_TIME;
      }
      TodayPane.minidayTimer = setTimeout(
        TodayPane.updateAdvanceTimer.bind(TodayPane, aEvent, aDir),
        timeInterval
      );
    }
  },

  /**
   * Stop automatic days switching when releasing the mouse button or the
   * position is outside the window.
   *
   * NOTE: This function is usually called without the correct this pointer.
   */
  stopSwitching(aEvent) {
    const element = aEvent.target;
    if (
      TodayPane.minidayDrag.session &&
      aEvent.type == "mouseout" &&
      element.id != "messengerWindow"
    ) {
      return;
    }
    if (TodayPane.minidayTimer) {
      clearTimeout(TodayPane.minidayTimer);
      delete TodayPane.minidayTimer;
      if (TodayPane.switchCounter == 0 && !TodayPane.minidayDrag.session) {
        const dir = element.getAttribute("dir");
        TodayPane.advance(parseInt(dir, 10));
      }
    }
    if (element.id == "previous-day-button" || element.id == "next-day-button") {
      TodayPane.switchCounter = 0;
      const button = document.getElementById(element.id);
      button.removeEventListener("mouseout", TodayPane.stopSwitching);
    }
    if (TodayPane.minidayDrag.session) {
      window.removeEventListener("mouseout", TodayPane.stopSwitching);
      TodayPane.minidayDrag.distance = 0;
      document.getElementById("dragCenter-image").setAttribute("hidden", "true");
      TodayPane.minidayDrag.session = false;
    }
    window.removeEventListener("mousemove", TodayPane.onMousemove);
    window.removeEventListener("mouseup", TodayPane.stopSwitching);
  },

  /**
   * Cycle the view shown in the today pane (event+task, event, task).
   *
   * @param aCycleForward     If true, the views are cycled in the forward
   *                            direction, otherwise in the opposite direction
   */
  cyclePaneView(aCycleForward) {
    if (this.paneViews == null) {
      return;
    }
    let index = parseInt(document.getElementById("today-pane-header").getAttribute("index"), 10);
    index = index + aCycleForward;
    const nViewLen = this.paneViews.length;
    if (index >= nViewLen) {
      index = 0;
    } else if (index == -1) {
      index = nViewLen - 1;
    }
    const agendaPanel = document.getElementById("agenda-panel");
    const todoPanel = document.getElementById("todo-tab-panel");
    const isTodoPanelVisible = index != 2 && todoPanel.isVisibleInMode(gCurrentMode);
    const isAgendaPanelVisible = index != 1 && agendaPanel.isVisibleInMode(gCurrentMode);
    todoPanel.setVisible(isTodoPanelVisible);
    agendaPanel.setVisible(isAgendaPanelVisible);
    this.updateDisplay();
  },

  /**
   * Sets the shown date from a JSDate.
   *
   * @param aNewDate      The date to show.
   */
  setDaywithjsDate(aNewDate) {
    let newdatetime = cal.dtz.jsDateToDateTime(aNewDate, cal.dtz.floating);
    newdatetime = newdatetime.getInTimezone(cal.dtz.defaultTimezone);
    newdatetime.hour = newdatetime.minute = newdatetime.second = 0;
    this.setDay(newdatetime, true);
  },

  /**
   * Sets the first day shown in the today pane.
   *
   * @param aNewDate                  The calIDateTime to set.
   * @param aDontUpdateMinimonth      If true, the minimonth will not be
   *                                    updated to show the same date.
   */
  setDay(aNewDate, aDontUpdateMinimonth) {
    if (this.setDay.alreadySettingDay) {
      // If we update the mini-month, this function gets called again.
      return;
    }
    if (!document.getElementById("agenda-panel").isVisible()) {
      // If the agenda panel isn't visible, there's no need to set the day.
      return;
    }
    this.setDay.alreadySettingDay = true;
    this.start = aNewDate.clone();

    const daylabel = document.getElementById("datevalue-label");
    daylabel.value = this.start.day;

    document
      .getElementById("weekdayNameLabel")
      .setAttribute("value", cal.l10n.getDateFmtString(`day.${this.start.weekday + 1}.Mmm`));

    const monthnamelabel = document.getElementById("monthNameContainer");
    monthnamelabel.value =
      cal.dtz.formatter.shortMonthName(this.start.month) + " " + this.start.year;

    const currentweeklabel = document.getElementById("currentWeek-label");
    currentweeklabel.value =
      cal.l10n.getCalString("shortcalendarweek") +
      " " +
      cal.weekInfoService.getWeekTitle(this.start);

    if (!aDontUpdateMinimonth) {
      try {
        // The minimonth code sometimes throws an exception as a result of this call. Bug 1560547.
        // As there's no known plausible explanation, just catch the exception and carry on.
        document.getElementById("today-minimonth").value = cal.dtz.dateTimeToJsDate(this.start);
      } catch (ex) {
        console.error(ex);
      }
    }
    this.updatePeriod();
    this.setDay.alreadySettingDay = false;
  },

  /**
   * Advance by a given number of days in the today pane.
   *
   * @param aDir      The number of days to advance. Negative numbers advance
   *                    backwards in time.
   */
  advance(aDir) {
    if (aDir != 0) {
      this.start.day += aDir;
      this.setDay(this.start);
    }
  },

  /**
   * Checks if the today pane is showing today's date.
   */
  showsToday() {
    return cal.dtz.sameDay(cal.dtz.now(), this.start);
  },

  /**
   * Update the period headers in the agenda listbox using the today pane's
   * start date.
   */
  updatePeriod() {
    this.agenda.update(this.start);
    if (document.getElementById("todo-tab-panel").isVisible()) {
      this.updateCalendarToDoUnifinder();
    }
  },

  /**
   * Display a certain section in the minday/minimonth part of the todaypane.
   *
   * @param aSection      The section to display
   */
  displayMiniSection(aSection) {
    document.getElementById("today-minimonth-box").setVisible(aSection == "minimonth");
    document.getElementById("mini-day-box").setVisible(aSection == "miniday");
    document.getElementById("today-none-box").setVisible(aSection == "none");
    document.getElementById("today-minimonth").setAttribute("freebusy", aSection == "minimonth");
  },

  /**
   * Handler function to update the today-pane when the current mode changes.
   */
  onModeModified() {
    TodayPane.updateDisplay();
    TodayPane.updateSplitterState();
    const todayPanePanel = document.getElementById("today-pane-panel");
    const currentWidth = todayPanePanel.getModeAttribute("modewidths");
    if (currentWidth != 0) {
      todayPanePanel.style.width = `${currentWidth}px`;
    }
    TodayPane.previousMode = gCurrentMode;
  },

  get isVisible() {
    return document.getElementById("today-pane-panel").isVisible();
  },

  /**
   * Toggle the today-pane and update its visual appearance.
   *
   * @param aEvent        The DOM event occurring on activated command.
   */
  toggleVisibility(aEvent) {
    document.getElementById("today-pane-panel").togglePane(aEvent);
    TodayPane.updateDisplay();
    TodayPane.updateSplitterState();
  },

  /**
   * Update the today-splitter state.
   */
  updateSplitterState() {
    const splitter = document.getElementById("today-splitter");
    if (this.isVisible) {
      splitter.removeAttribute("hidden");
      splitter.setAttribute("state", "open");
    } else {
      splitter.setAttribute("hidden", "true");
    }
  },

  /**
   * Generates the todaypane toggle command when the today-splitter
   * is being collapsed or uncollapsed.
   */
  onCommandTodaySplitter() {
    const todaypane = document.getElementById("today-pane-panel");
    const splitter = document.getElementById("today-splitter");
    const splitterCollapsed = splitter.getAttribute("state") == "collapsed";

    todaypane.setModeAttribute("modewidths", todaypane.getAttribute("width"));

    if (splitterCollapsed == todaypane.isVisible()) {
      document.getElementById("calendar_toggle_todaypane_command").doCommand();
    }
  },

  /**
   * Checks if the todayPaneStatusLabel should be hidden.
   */
  showTodayPaneStatusLabel() {
    const hideLabel = !Services.prefs.getBoolPref("calendar.view.showTodayPaneStatusLabel", true);
    document
      .getElementById("calendar-status-todaypane-button")
      .toggleAttribute("hideLabel", hideLabel);
  },
};

window.addEventListener("unload", TodayPane.onUnload, { capture: false, once: true });
