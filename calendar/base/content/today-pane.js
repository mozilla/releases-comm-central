/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://calendar/modules/calUtils.jsm");

/**
 * Namespace object to hold functions related to the today pane.
 */
var TodayPane = {
    paneViews: null,
    start: null,
    cwlabel: null,
    previousMode:  null,
    switchCounter: 0,
    minidayTimer: null,
    minidayDrag: {startX: 0,
                  startY: 0,
                  distance: 0,
                  session: false},

    /**
     * Load Handler, sets up the today pane controls.
     */
    onLoad: function onLoad() {
        TodayPane.paneViews = [ cal.calGetString("calendar", "eventsandtasks"),
                                cal.calGetString("calendar", "tasksonly"),
                                cal.calGetString("calendar", "eventsonly") ];
        agendaListbox.setupCalendar();
        TodayPane.initializeMiniday();
        TodayPane.setShortWeekdays();

        document.getElementById("modeBroadcaster").addEventListener("DOMAttrModified", TodayPane.onModeModified, false);
        TodayPane.setTodayHeader();

        document.getElementById("today-splitter").addEventListener("command", onCalendarViewResize, false);
        TodayPane.updateSplitterState();
        TodayPane.previousMode = document.getElementById("modeBroadcaster").getAttribute("mode");
    },

    /**
     * Unload handler, cleans up the today pane on window unload.
     */
    onUnload: function onUnload() {
        document.getElementById("modeBroadcaster").removeEventListener("DOMAttrModified", TodayPane.onModeModified, false);
        document.getElementById("today-splitter").removeEventListener("command", onCalendarViewResize, false);
    },

    /**
     * Sets up the label for the switcher that allows switching between today pane
     * views. (event+task, task only, event only)
     */
    setTodayHeader: function setTodayHeader() {
        let currentMode = document.getElementById("modeBroadcaster").getAttribute("mode");
        let agendaIsVisible = document.getElementById("agenda-panel").isVisible(currentMode);
        let todoIsVisible = document.getElementById("todo-tab-panel").isVisible(currentMode);
        let index = 2;
        if (agendaIsVisible && todoIsVisible) {
            index = 0;
        } else if (!agendaIsVisible && todoIsVisible) {
            index = 1;
        } else if (agendaIsVisible && !todoIsVisible) {
            index = 2;
        } else { // agendaIsVisible == false && todoIsVisible == false:
            // In this case something must have gone wrong
            // - probably in the previous session - and no pane is displayed.
            // We set a default by only displaying agenda-pane.
            agendaIsVisible = true;
            document.getElementById("agenda-panel").setVisible(agendaIsVisible);
            index = 2;
        }
        let todayHeader = document.getElementById("today-pane-header");
        todayHeader.setAttribute("index", index);
        todayHeader.setAttribute("value", this.paneViews[index]);
        let todayPaneSplitter = document.getElementById("today-pane-splitter");
        setBooleanAttribute(todayPaneSplitter, "hidden", (index != 0));
        let todayIsVisible = document.getElementById("today-pane-panel").isVisible();

        // Disable or enable the today pane menuitems that have an attribute
        // name="minidisplay" depending on the visibility of elements.
        let menu = document.getElementById("ltnTodayPaneMenuPopup");
        if (menu) {
            setAttributeToChildren(menu, "disabled", (!todayIsVisible || !agendaIsVisible), "name", "minidisplay");
        }

        onCalendarViewResize();
    },

    /**
     * Sets up the miniday display in the today pane.
     */
    initializeMiniday: function initializeMiniday() {
        // initialize the label denoting the current month, year and calendarweek
        // with numbers that are supposed to consume the largest width
        // in order to guarantee that the text will not be cropped when modified
        // during runtime
        const kYEARINIT= "5555";
        const kCALWEEKINIT= "55";
        let monthdisplaydeck = document.getElementById("monthNameContainer");
        let childNodes = monthdisplaydeck.childNodes;

        for (let i = 0; i < childNodes.length; i++) {
            let monthlabel = childNodes[i];
            this.setMonthDescription(monthlabel, i,  kYEARINIT, kCALWEEKINIT);
        }

        let now = cal.now();
        // Workaround for bug 1070491. Show the correct month and year
        // after startup even if deck's selectedIndex is reset to 0.
        this.setMonthDescription(childNodes[0], now.month, now.year, kCALWEEKINIT);

        agendaListbox.addListener(this);
        this.setDay(now);
    },

    /**
     * Go to month/week/day views when double-clicking a label inside miniday
     */
    onDoubleClick: function md_onDoubleClick(aEvent) {
        if (aEvent.button == 0) {
            if (aEvent.target.id == "datevalue-label") {
                switchCalendarView("day", true);
            } else if (aEvent.target.parentNode.id == "weekdayNameContainer") {
                switchCalendarView("day", true);
            } else if (aEvent.target.id == "currentWeek-label") {
                switchCalendarView("week", true);
            } else if (aEvent.target.parentNode.id == "monthNameContainer") {
                switchCalendarView("month", true);
            } else {
                return;
            }
            let title = document.getElementById('calendar-tab-button')
                            .getAttribute('tooltiptext');
            document.getElementById('tabmail').openTab('calendar', {title: title});
            currentView().goToDay(agendaListbox.today.start);
        }
    },

    /**
     * Set conditions about start dragging on day-label or start switching
     * with time on navigation buttons.
     */
    onMousedown: function md_onMousedown(aEvent, aDir) {
        if (aEvent.button != 0) {
            return;
        }
        let element = aEvent.target;
        if (element.id == "previous-day-button" ||
             element.id == "next-day-button") {
            // Start switching days by pressing, without release, the navigation buttons
            element.addEventListener("mouseout", TodayPane.stopSwitching, false);
            element.addEventListener("mouseup", TodayPane.stopSwitching, false);
            TodayPane.minidayTimer = setTimeout(TodayPane.updateAdvanceTimer.bind(TodayPane, Event, aDir), 500);
        } else if (element.id == "datevalue-label") {
            // Start switching days by dragging the mouse with a starting point on the day label
            window.addEventListener("mousemove", TodayPane.onMousemove, false);
            window.addEventListener("mouseup", TodayPane.stopSwitching, false);
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
    onMousemove: function md_onMousemove(aEvent) {
        const MIN_DRAG_DISTANCE_SQ = 49;
        let x = aEvent.clientX - TodayPane.minidayDrag.startX;
        let y = aEvent.clientY - TodayPane.minidayDrag.startY;
        if (TodayPane.minidayDrag.session) {
            if (x*x + y*y >= MIN_DRAG_DISTANCE_SQ) {
                let distance = Math.floor(Math.sqrt(x*x + y*y) - Math.sqrt(MIN_DRAG_DISTANCE_SQ));
                // Dragging on the left/right side, the day date decrease/increase
                TodayPane.minidayDrag.distance = (x > 0) ? distance : -distance;
            } else {
                TodayPane.minidayDrag.distance = 0;
            }
        } else {
            // move the mouse a bit before starting the drag session
            if (x*x + y*y > 9) {
                window.addEventListener("mouseout", TodayPane.stopSwitching, false);
                TodayPane.minidayDrag.session = true;
                let dragCenterImage = document.getElementById("dragCenter-image");
                dragCenterImage.removeAttribute("hidden");
                // Move the starting point in the center so we have a fixed
                // point where stopping the day switching while still dragging
                let centerObj = dragCenterImage.boxObject;
                TodayPane.minidayDrag.startX = Math.floor(centerObj.x + centerObj.width/2);
                TodayPane.minidayDrag.startY = Math.floor(centerObj.y + centerObj.height/2);

                TodayPane.updateAdvanceTimer();
            }
        }
    },

    /**
     * Figure out the days switching speed according to the position (when
     * dragging) or time elapsed (when pressing buttons).
     */
    updateAdvanceTimer: function md_updateAdvanceTimer(aEvent, aDir) {
        const INITIAL_TIME = 400;
        const REL_DISTANCE = 8;
        const MINIMUM_TIME = 100;
        const ACCELERATE_COUNT_LIMIT = 7;
        const SECOND_STEP_TIME = 200;
        if (TodayPane.minidayDrag.session) {
            // Dragging the day label: days switch with cursor distance and time.
            let dir = (TodayPane.minidayDrag.distance > 0) - (TodayPane.minidayDrag.distance < 0);
            TodayPane.advance(dir);
            let distance = Math.abs(TodayPane.minidayDrag.distance);
            // Linear relation between distance and switching speed
            let timeInterval = Math.max(Math.ceil(INITIAL_TIME - distance * REL_DISTANCE), MINIMUM_TIME);
            TodayPane.minidayTimer = setTimeout(TodayPane.updateAdvanceTimer.bind(TodayPane, null, null), timeInterval);
        } else {
            // Keeping pressed next/previous day buttons causes days switching (with
            // three levels higher speed after some commutations).
            TodayPane.advance(parseInt(aDir));
            TodayPane.switchCounter++;
            let timeInterval = INITIAL_TIME;
            if (TodayPane.switchCounter > 2 * ACCELERATE_COUNT_LIMIT) {
                timeInterval = MINIMUM_TIME;
            } else if (TodayPane.switchCounter > ACCELERATE_COUNT_LIMIT) {
                timeInterval = SECOND_STEP_TIME;
            }
            TodayPane.minidayTimer = setTimeout(TodayPane.updateAdvanceTimer.bind(TodayPane, aEvent, aDir), timeInterval);
        }
    },

    /**
     * Stop automatic days switching when releasing the mouse button or the
     * position is outside the window.
     *
     * NOTE: This function is usually called without the correct this pointer.
     */
    stopSwitching: function stopSwitching(aEvent) {
        let element = aEvent.target;
        if (TodayPane.minidayDrag.session &&
            aEvent.type == "mouseout" &&
             element.id != "messengerWindow") {
            return;
        }
        if (TodayPane.minidayTimer) {
            clearTimeout(TodayPane.minidayTimer);
            delete TodayPane.minidayTimer;
            if (TodayPane.switchCounter == 0 && !TodayPane.minidayDrag.session) {
                let dir = element.getAttribute('dir');
                TodayPane.advance(parseInt(dir));
            }
        }
        if (element.id == "previous-day-button" ||
             element.id == "next-day-button") {
            TodayPane.switchCounter = 0;
            let button = document.getElementById(element.id);
            button.removeEventListener("mouseout", TodayPane.stopSwitching, false);
        }
        if (TodayPane.minidayDrag.session) {
            window.removeEventListener("mouseout", TodayPane.stopSwitching, false);
            TodayPane.minidayDrag.distance = 0;
            document.getElementById("dragCenter-image").setAttribute("hidden", "true");
            TodayPane.minidayDrag.session = false;
        }
        window.removeEventListener("mousemove", TodayPane.onMousemove, false);
        window.removeEventListener("mouseup", TodayPane.stopSwitching, false);
    },

    /**
     * Helper function to set the month description on the today pane header.
     *
     * @param aMonthLabel       The XUL node to set the month label on.
     * @param aIndex            The month number, 0-based.
     * @param aYear             The year this month should be displayed with
     * @param aCalWeek          The calendar week that should be shown.
     * @return                  The value set on aMonthLabel.
     */
    setMonthDescription: function setMonthDescription(aMonthLabel, aIndex, aYear, aCalWeek) {
        if (this.cwlabel == null) {
            this.cwlabel = cal.calGetString("calendar", "shortcalendarweek");
        }
        document.getElementById("currentWeek-label").value = this.cwlabel + " " + aCalWeek;
        return aMonthLabel.value = cal.getDateFormatter().shortMonthName(aIndex) + " " + aYear;
    },

    /**
     * Cycle the view shown in the today pane (event+task, event, task).
     *
     * @param aCycleForward     If true, the views are cycled in the forward
     *                            direction, otherwise in the opposite direction
     */
    cyclePaneView: function cyclePaneView(aCycleForward) {
        if (this.paneViews == null) {
            return;
        }
        let index = parseInt(document.getElementById("today-pane-header").getAttribute("index"));
        index = index + aCycleForward;
        let nViewLen = this.paneViews.length;
        if (index >= nViewLen) {
            index = 0;
        } else if (index == -1) {
            index = nViewLen - 1;
        }
        let agendaPanel = document.getElementById("agenda-panel");
        let todoPanel = document.getElementById("todo-tab-panel");
        let currentMode = document.getElementById("modeBroadcaster").getAttribute("mode");
        let isTodoPanelVisible = (index != 2 && todoPanel.isVisibleInMode(currentMode));
        let isAgendaPanelVisible = (index != 1 && agendaPanel.isVisibleInMode(currentMode));
        todoPanel.setVisible(isTodoPanelVisible);
        agendaPanel.setVisible(isAgendaPanelVisible);
        this.setTodayHeader();
    },

    /**
     * Shows short weekday names in the weekdayNameContainer
     */
    setShortWeekdays: function setShortWeekdays() {
        let weekdisplaydeck = document.getElementById("weekdayNameContainer");
        let childNodes = weekdisplaydeck.childNodes;

        // Workaround for bug 1070491. Show the correct weekday after
        // startup even if deck's selectedIndex is reset to 0.
        let weekday = cal.now().weekday + 1;
        childNodes[0].setAttribute("value", cal.calGetString("dateFormat", "day." + weekday + ".Mmm"));

        for (let i = 1; i < childNodes.length; i++) {
            childNodes[i].setAttribute("value", cal.calGetString("dateFormat", "day." + i + ".Mmm"));
        }
    },

    /**
     * Sets the shown date from a JSDate.
     *
     * @param aNewDate      The date to show.
     */
    setDaywithjsDate: function setDaywithjsDate(aNewDate) {
        let newdatetime = cal.jsDateToDateTime(aNewDate, cal.floating());
        newdatetime = newdatetime.getInTimezone(cal.calendarDefaultTimezone());
        this.setDay(newdatetime, true);
    },

    /**
     * Sets the first day shown in the today pane.
     *
     * @param aNewDate                  The calIDateTime to set.
     * @param aDontUpdateMinimonth      If true, the minimonth will not be
     *                                    updated to show the same date.
     */
    setDay: function setDay(aNewDate, aDontUpdateMinimonth) {
        this.start = aNewDate.clone();

        let daylabel = document.getElementById("datevalue-label");
        daylabel.value = this.start.day;

        let weekdaylabel = document.getElementById("weekdayNameContainer");
        weekdaylabel.selectedIndex = this.start.weekday + 1;

        let monthnamedeck = document.getElementById("monthNameContainer");
        monthnamedeck.selectedIndex = this.start.month;

        let selMonthPanel = monthnamedeck.selectedPanel;
        this.setMonthDescription(selMonthPanel,
                                 this.start.month,
                                 this.start.year,
                                 cal.getWeekInfoService().getWeekTitle(this.start));
        if (!aDontUpdateMinimonth) {
            document.getElementById("today-Minimonth").value = cal.dateTimeToJsDate(this.start);
        }
        this.updatePeriod();
    },

    /**
     * Advance by a given number of days in the today pane.
     *
     * @param aDir      The number of days to advance. Negative numbers advance
     *                    backwards in time.
     */
    advance: function advance(aDir) {
        if (aDir != 0) {
            this.start.day += aDir;
            this.setDay(this.start);
        }
    },

    /**
     * Checks if the today pane is showing today's date.
     */
    showsToday: function showsToday() {
        return (cal.sameDay(cal.now(), this.start));
    },

    /**
     * Update the period headers in the agenda listbox using the today pane's
     * start date.
     */
    updatePeriod: function updatePeriod() {
        agendaListbox.refreshPeriodDates(this.start.clone());
        updateCalendarToDoUnifinder();
    },

    /**
     * Display a certain section in the minday/minimonth part of the todaypane.
     *
     * @param aSection      The section to display
     */
    displayMiniSection: function displayMiniSection(aSection) {
        document.getElementById("today-minimonth-box").setVisible(aSection == "minimonth");
        document.getElementById("mini-day-box").setVisible(aSection == "miniday");
        document.getElementById("today-none-box").setVisible(aSection == "none");
        setBooleanAttribute(document.getElementById("today-Minimonth"), "freebusy", aSection == "minimonth");
    },

    /**
     * Handler function for the DOMAttrModified event used to observe the
     * todaypane-splitter.
     *
     * @param aEvent        The DOM event occurring on attribute modification.
     */
    onModeModified: function onModeModified(aEvent) {
        if (aEvent.attrName == "mode") {
            let todaypane = document.getElementById("today-pane-panel");
            // Store the previous mode panel's width.
            todaypane.setModeAttribute("modewidths", todaypane.width, TodayPane.previousMode);

            TodayPane.setTodayHeader();
            TodayPane.updateSplitterState();
            todaypane.width = todaypane.getModeAttribute("modewidths", "width");
            TodayPane.previousMode = document.getElementById("modeBroadcaster").getAttribute("mode");
        }
    },

    /**
     * Toggle the today-pane and update its visual appearance.
     *
     * @param aEvent        The DOM event occurring on activated command.
     */
    toggleVisibility: function toggleVisbility(aEvent) {
        document.getElementById("today-pane-panel").togglePane(aEvent);
        TodayPane.setTodayHeader();
        TodayPane.updateSplitterState();
    },

    /**
     * Update the today-splitter state and today-pane width with saved
     * mode-dependent values.
     */
    updateSplitterState: function updateSplitterState() {
        let splitter = document.getElementById("today-splitter");
        let todaypaneVisible = document.getElementById("today-pane-panel").isVisible();
        setElementValue(splitter, !todaypaneVisible && "true", "hidden");
        if (todaypaneVisible) {
            splitter.setAttribute("state", "open");
        }
    },

    /**
     * Generates the todaypane toggle command when the today-splitter
     * is being collapsed or uncollapsed.
     */
    onCommandTodaySplitter: function onCommandTodaySplitter() {
        let todaypane = document.getElementById("today-pane-panel");
        let splitterState = document.getElementById('today-splitter').getAttribute("state");
        if (splitterState == "collapsed" && todaypane.isVisible() ||
            splitterState != "collapsed" && !todaypane.isVisible()) {
              document.getElementById('calendar_toggle_todaypane_command').doCommand();
        }
    }
};

window.addEventListener("load", TodayPane.onLoad, false);
window.addEventListener("unload", TodayPane.onUnload, false);
