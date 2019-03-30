/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported switchToView, getSelectedDay, scheduleMidnightUpdate,
 *          updateStyleSheetForViews, observeViewDaySelect, toggleOrientation,
 *          toggleWorkdaysOnly, toggleTasksInView, toggleShowCompletedInView,
 *          goToDate, getLastCalendarView, deleteSelectedEvents,
 *          editSelectedEvents, selectAllEvents
 */

/* import-globals-from calendar-chrome-startup.js */
/* import-globals-from calendar-item-editing.js */

var { cal } = ChromeUtils.import("resource://calendar/modules/calUtils.jsm");
var { countOccurrences } = ChromeUtils.import("resource://calendar/modules/calRecurrenceUtils.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

/**
 * Controller for the views
 * @see calIcalendarViewController
 */
var calendarViewController = {
    QueryInterface: ChromeUtils.generateQI([Ci.calICalendarViewController]),

    /**
     * Creates a new event
     * @see calICalendarViewController
     */
    createNewEvent: function(aCalendar, aStartTime, aEndTime, aForceAllday) {
        // if we're given both times, skip the dialog
        if (aStartTime && aEndTime && !aStartTime.isDate && !aEndTime.isDate) {
            let item = cal.createEvent();
            setDefaultItemValues(item, aCalendar, aStartTime, aEndTime);
            item.title = cal.l10n.getCalString("newEvent");
            doTransaction("add", item, item.calendar, null, null);
        } else {
            createEventWithDialog(aCalendar, aStartTime, null, null, null, aForceAllday);
        }
    },

    /**
     * Modifies the given occurrence
     * @see calICalendarViewController
     */
    modifyOccurrence: function(aOccurrence, aNewStartTime, aNewEndTime, aNewTitle) {
        // if modifying this item directly (e.g. just dragged to new time),
        // then do so; otherwise pop up the dialog
        if (aNewStartTime || aNewEndTime || aNewTitle) {
            let instance = aOccurrence.clone();

            if (aNewTitle) {
                instance.title = aNewTitle;
            }

            // When we made the executive decision (in bug 352862) that
            // dragging an occurrence of a recurring event would _only_ act
            // upon _that_ occurrence, we removed a bunch of code from this
            // function. If we ever revert that decision, check CVS history
            // here to get that code back.

            if (aNewStartTime || aNewEndTime) {
                // Yay for variable names that make this next line look silly
                if (cal.item.isEvent(instance)) {
                    if (aNewStartTime && instance.startDate) {
                        instance.startDate = aNewStartTime;
                    }
                    if (aNewEndTime && instance.endDate) {
                        instance.endDate = aNewEndTime;
                    }
                } else {
                    if (aNewStartTime && instance.entryDate) {
                        instance.entryDate = aNewStartTime;
                    }
                    if (aNewEndTime && instance.dueDate) {
                        instance.dueDate = aNewEndTime;
                    }
                }
            }

            doTransaction("modify", instance, instance.calendar, aOccurrence, null);
        } else {
            modifyEventWithDialog(aOccurrence, null, true);
        }
    },

    /**
     * Deletes the given occurrences
     * @see calICalendarViewController
     */
    deleteOccurrences: function(aCount,
                                aOccurrences,
                                aUseParentItems,
                                aDoNotConfirm,
                                aExtResponse=null) {
        startBatchTransaction();
        let recurringItems = {};
        let extResponse = aExtResponse || { responseMode: Ci.calIItipItem.USER };

        let getSavedItem = function(aItemToDelete) {
            // Get the parent item, saving it in our recurringItems object for
            // later use.
            let hashVal = aItemToDelete.parentItem.hashId;
            if (!recurringItems[hashVal]) {
                recurringItems[hashVal] = {
                    oldItem: aItemToDelete.parentItem,
                    newItem: aItemToDelete.parentItem.clone()
                };
            }
            return recurringItems[hashVal];
        };

        // Make sure we are modifying a copy of aOccurrences, otherwise we will
        // run into race conditions when the view's doDeleteItem removes the
        // array elements while we are iterating through them. While we are at
        // it, filter out any items that have readonly calendars, so that
        // checking for one total item below also works out if all but one item
        // are readonly.
        let occurrences = aOccurrences.filter(item => cal.acl.isCalendarWritable(item.calendar));

        // we check how many occurrences the parent item has
        let parents = new Map();
        for (let occ of occurrences) {
            if (!parents.has(occ.id)) {
                parents.set(occ.id, countOccurrences(occ));
            }
        }

        let promptUser = !aDoNotConfirm;
        let previousResponse = 0;
        for (let itemToDelete of occurrences) {
            if (parents.get(itemToDelete.id) == -1) {
                // we have scheduled the master item for deletion in a previous
                // loop already
                continue;
            }
            if (aUseParentItems ||
                parents.get(itemToDelete.id) == 1 ||
                previousResponse == 3) {
                // Usually happens when ctrl-click is used. In that case we
                // don't need to ask the user if he wants to delete an
                // occurrence or not.
                // if an occurrence is the only one of a series or the user
                // decided so before, we delete the series, too.
                itemToDelete = itemToDelete.parentItem;
                parents.set(itemToDelete.id, -1);
            } else if (promptUser) {
                let [targetItem, , response] = promptOccurrenceModification(itemToDelete, false, "delete");
                if (!response) {
                    // The user canceled the dialog, bail out
                    break;
                }
                itemToDelete = targetItem;

                // if we have multiple items and the user decided already for one
                // item whether to delete the occurrence or the entire series,
                // we apply that decision also to subsequent items
                previousResponse = response;
                promptUser = false;
            }

            // Now some dirty work: Make sure more than one occurrence can be
            // deleted by saving the recurring items and removing occurrences as
            // they come in. If this is not an occurrence, we can go ahead and
            // delete the whole item.
            if (itemToDelete.parentItem.hashId == itemToDelete.hashId) {
                doTransaction("delete",
                              itemToDelete,
                              itemToDelete.calendar,
                              null,
                              null,
                              extResponse);
            } else {
                let savedItem = getSavedItem(itemToDelete);
                savedItem.newItem.recurrenceInfo
                         .removeOccurrenceAt(itemToDelete.recurrenceId);
                // Dont start the transaction yet. Do so later, in case the
                // parent item gets modified more than once.
            }
        }

        // Now handle recurring events. This makes sure that all occurrences
        // that have been passed are deleted.
        for (let hashVal in recurringItems) {
            let ritem = recurringItems[hashVal];
            doTransaction("modify",
                          ritem.newItem,
                          ritem.newItem.calendar,
                          ritem.oldItem,
                          null,
                          extResponse);
        }
        endBatchTransaction();
    }
};

/**
 * This function does the common steps to switch between views. Should be called
 * from app-specific view switching functions
 *
 * @param aViewType     The type of view to select.
 */
function switchToView(aViewType) {
    let viewDeck = getViewDeck();
    let selectedDay;
    let currentSelection = [];

    // Set up the view commands
    let views = viewDeck.childNodes;
    for (let i = 0; i < views.length; i++) {
        let view = views[i];
        let commandId = "calendar_" + view.id + "_command";
        let command = document.getElementById(commandId);
        if (view.id == aViewType + "-view") {
            command.setAttribute("checked", "true");
        } else {
            command.removeAttribute("checked");
        }
    }

    /**
     * Sets up a node to use view specific attributes. If there is no view
     * specific attribute, then <attr>-all is used instead.
     *
     * @param id        The id of the node to set up.
     * @param attr      The view specific attribute to modify.
     */
    function setupViewNode(id, attr) {
        let node = document.getElementById(id);
        if (node) {
            if (node.hasAttribute(attr + "-" + aViewType)) {
                node.setAttribute(attr, node.getAttribute(attr + "-" + aViewType));
            } else {
                node.setAttribute(attr, node.getAttribute(attr + "-all"));
            }
        }
    }

    // Set up the labels and accesskeys for the context menu
    let ids = [
        "calendar-view-context-menu-next",
        "calendar-view-context-menu-previous",
        "calendar-go-menu-next",
        "calendar-go-menu-previous",
        "appmenu_calendar-go-menu-next",
        "appmenu_calendar-go-menu-previous"
    ];
    ids.forEach((x) => {
        setupViewNode(x, "label");
        setupViewNode(x, "accesskey");
    });

    // Set up the labels for the view navigation
    ids = [
        "previous-view-button",
        "today-view-button",
        "next-view-button"
    ];
    ids.forEach(x => setupViewNode(x, "tooltiptext"));

    try {
        selectedDay = viewDeck.selectedPanel.selectedDay;
        currentSelection = viewDeck.selectedPanel.getSelectedItems({});
    } catch (ex) {
        // This dies if no view has even been chosen this session, but that's
        // ok because we'll just use cal.dtz.now() below.
    }

    if (!selectedDay) {
        selectedDay = cal.dtz.now();
    }

    // Anyone wanting to plug in a view needs to follow this naming scheme
    let view = document.getElementById(aViewType + "-view");
    viewDeck.selectedPanel = view;

    // Select the corresponding tab
    let viewTabs = document.getElementById("view-tabs");
    viewTabs.selectedIndex = getViewDeck().selectedIndex;

    let compositeCal = cal.view.getCompositeCalendar(window);
    if (view.displayCalendar != compositeCal) {
        view.displayCalendar = compositeCal;
        view.timezone = cal.dtz.defaultTimezone;
        view.controller = calendarViewController;
    }

    view.goToDay(selectedDay);
    view.setSelectedItems(currentSelection.length, currentSelection);

    onCalendarViewResize();
}

/**
 * Returns the calendar view deck XUL element.
 *
 * @return      The view-deck element.
 */
function getViewDeck() {
    return document.getElementById("view-deck");
}

/**
 * Returns the currently selected calendar view.
 *
 * @return      The selected calendar view
 */
function currentView() {
    return getViewDeck().selectedPanel;
}

/**
 * Returns the selected day in the current view.
 *
 * @return      The selected day
 */
function getSelectedDay() {
    return currentView().selectedDay;
}

var gMidnightTimer;

/**
 * Creates a timer that will fire after midnight.  Pass in a function as
 * aRefreshCallback that should be called at that time.
 *
 * XXX This function is not very usable, since there is only one midnight timer.
 * Better would be a function that uses the observer service to notify at
 * midnight.
 *
 * @param aRefreshCallback      A callback to be called at midnight.
 */
function scheduleMidnightUpdate(aRefreshCallback) {
    let jsNow = new Date();
    let tomorrow = new Date(jsNow.getFullYear(), jsNow.getMonth(), jsNow.getDate() + 1);
    let msUntilTomorrow = tomorrow.getTime() - jsNow.getTime();

    // Is an nsITimer/callback extreme overkill here? Yes, but it's necessary to
    // workaround bug 291386.  If we don't, we stand a decent chance of getting
    // stuck in an infinite loop.
    let udCallback = {
        notify: function(timer) {
            aRefreshCallback();
        }
    };

    if (gMidnightTimer) {
        gMidnightTimer.cancel();
    } else {
        // Observer for wake after sleep/hibernate/standby to create new timers and refresh UI
        let wakeObserver = {
            observe: function(aSubject, aTopic, aData) {
                if (aTopic == "wake_notification") {
                    // postpone refresh for another couple of seconds to get netwerk ready:
                    if (this.mTimer) {
                        this.mTimer.cancel();
                    } else {
                        this.mTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
                    }
                    this.mTimer.initWithCallback(udCallback, 10 * 1000,
                                                 Ci.nsITimer.TYPE_ONE_SHOT);
                }
            }
        };

        // Add observer
        Services.obs.addObserver(wakeObserver, "wake_notification");

        // Remove observer on unload
        window.addEventListener("unload", () => {
            Services.obs.removeObserver(wakeObserver, "wake_notification");
        });
        gMidnightTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    }
    gMidnightTimer.initWithCallback(udCallback, msUntilTomorrow, gMidnightTimer.TYPE_ONE_SHOT);
}

/**
 * Returns a cached copy of the view stylesheet.
 *
 * @return      The view stylesheet object.
 */
function getViewStyleSheet() {
    if (!getViewStyleSheet.sheet) {
        const cssUri = "chrome://calendar/content/calendar-view-bindings.css";
        for (let sheet of document.styleSheets) {
            if (sheet.href == cssUri) {
                getViewStyleSheet.sheet = sheet;
                break;
            }
        }
    }
    return getViewStyleSheet.sheet;
}

/**
 * Updates the view stylesheet to contain rules that give all boxes with class
 * .calendar-color-box and an attribute calendar-id="<id of the calendar>" the
 * background color of the specified calendar.
 *
 * @param aCalendar     The calendar to update the stylesheet for.
 */
function updateStyleSheetForViews(aCalendar) {
    if (!updateStyleSheetForViews.ruleCache) {
        updateStyleSheetForViews.ruleCache = {};
    }
    let ruleCache = updateStyleSheetForViews.ruleCache;

    if (!(aCalendar.id in ruleCache)) {
        // We haven't create a rule for this calendar yet, do so now.
        let sheet = getViewStyleSheet();
        let ruleString = '.calendar-color-box[calendar-id="' + aCalendar.id + '"] {} ';

        try {
            let ruleIndex = sheet.insertRule(ruleString, sheet.cssRules.length);
            ruleCache[aCalendar.id] = sheet.cssRules[ruleIndex];
        } catch (ex) {
            sheet.ownerNode.addEventListener("load",
                                             () => updateStyleSheetForViews(aCalendar),
                                             { once: true });
            return;
        }
    }

    let color = aCalendar.getProperty("color") || "#A8C2E1";
    ruleCache[aCalendar.id].style.backgroundColor = color;
    ruleCache[aCalendar.id].style.color = cal.view.getContrastingTextColor(color);
}

/**
 * Category preferences observer. Used to update the stylesheets for category
 * colors.
 *
 * Note we need to keep the categoryPrefBranch variable outside of
 * initCategories since branch observers only live as long as the branch object
 * is alive, and out of categoryManagement to avoid cyclic references.
 */
var categoryPrefBranch;
var categoryManagement = {
    QueryInterface: ChromeUtils.generateQI([Ci.nsIObserver]),

    initCategories: function() {
        categoryPrefBranch = Services.prefs.getBranch("calendar.category.color.");
        let categories = categoryPrefBranch.getChildList("");

        // Fix illegally formatted category prefs.
        for (let i in categories) {
            let category = categories[i];
            if (category.search(/[^_0-9a-z-]/) != -1) {
                let categoryFix = cal.view.formatStringForCSSRule(category);
                if (categoryPrefBranch.prefHasUserValue(categoryFix)) {
                    categories.splice(i, 1); // remove illegal name
                } else {
                    let color = categoryPrefBranch.getCharPref(category);
                    categoryPrefBranch.setCharPref(categoryFix, color);
                    categoryPrefBranch.clearUserPref(category); // not usable
                    categories[i] = categoryFix;  // replace illegal name
                }
            }
        }

        // Add color information to the stylesheets.
        categories.forEach(categoryManagement.updateStyleSheetForCategory,
                           categoryManagement);
        categoryPrefBranch.addObserver("", categoryManagement);
    },

    cleanupCategories: function() {
        categoryPrefBranch = Services.prefs.getBranch("calendar.category.color.");
        categoryPrefBranch.removeObserver("", categoryManagement);
    },

    observe: function(aSubject, aTopic, aPrefName) {
        this.updateStyleSheetForCategory(aPrefName);
        // TODO Currently, the only way to find out if categories are removed is
        // to initially grab the calendar.categories.names preference and then
        // observe changes to it. it would be better if we had hooks for this,
        // so we could delete the rule from our style cache and also remove its
        // color preference.
    },

    categoryStyleCache: {},

    updateStyleSheetForCategory: function(aCatName) {
        if (!(aCatName in this.categoryStyleCache)) {
            // We haven't created a rule for this category yet, do so now.
            let sheet = getViewStyleSheet();
            let ruleString = '.category-color-box[categories~="' + aCatName + '"] {} ';

            try {
                let ruleIndex = sheet.insertRule(ruleString, sheet.cssRules.length);
                this.categoryStyleCache[aCatName] = sheet.cssRules[ruleIndex];
            } catch (ex) {
                sheet.ownerNode.addEventListener("load",
                                                 () => this.updateStyleSheetForCategory(aCatName),
                                                 { once: true });
                return;
            }
        }

        let color = Services.prefs.getStringPref("calendar.category.color." + aCatName, "");
        this.categoryStyleCache[aCatName].style.backgroundColor = color;
    }
};

/**
 * Handler function to set the selected day in the minimonth to the currently
 * selected day in the current view.
 *
 * @param event     The "dayselect" event emitted from the views.
 *
 */
function observeViewDaySelect(event) {
    let date = event.detail;
    let jsDate = new Date(date.year, date.month, date.day);

    // for the month and multiweek view find the main month,
    // which is the month with the most visible days in the view;
    // note, that the main date is the first day of the main month
    let jsMainDate;
    if (!event.originalTarget.supportsDisjointDates) {
        let mainDate = null;
        let maxVisibleDays = 0;
        let startDay = currentView().startDay;
        let endDay = currentView().endDay;
        let firstMonth = startDay.startOfMonth;
        let lastMonth = endDay.startOfMonth;
        for (let month = firstMonth.clone(); month.compare(lastMonth) <= 0; month.month += 1) {
            let visibleDays = 0;
            if (month.compare(firstMonth) == 0) {
                visibleDays = startDay.endOfMonth.day - startDay.day + 1;
            } else if (month.compare(lastMonth) == 0) {
                visibleDays = endDay.day;
            } else {
                visibleDays = month.endOfMonth.day;
            }
            if (visibleDays > maxVisibleDays) {
                mainDate = month.clone();
                maxVisibleDays = visibleDays;
            }
        }
        jsMainDate = new Date(mainDate.year, mainDate.month, mainDate.day);
    }

    getMinimonth().selectDate(jsDate, jsMainDate);
    currentView().focus();
}

/**
 * Provides a neutral way to get the minimonth, regardless of whether we're in
 * Sunbird or Lightning.
 *
 * @return          The XUL minimonth element.
 */
function getMinimonth() {
    return document.getElementById("calMinimonth");
}

/**
 * Update the view orientation based on the checked state of the command
 */
function toggleOrientation() {
    let cmd = document.getElementById("calendar_toggle_orientation_command");
    let newValue = (cmd.getAttribute("checked") == "true" ? "false" : "true");
    cmd.setAttribute("checked", newValue);

    let deck = getViewDeck();
    for (let view of deck.childNodes) {
        view.rotated = (newValue == "true");
    }

    // orientation refreshes automatically
}

/**
 * Toggle the workdays only checkbox and refresh the current view
 *
 * XXX We shouldn't need to refresh the view just to toggle the workdays. This
 * should happen automatically.
 */
function toggleWorkdaysOnly() {
    let cmd = document.getElementById("calendar_toggle_workdays_only_command");
    let newValue = (cmd.getAttribute("checked") == "true" ? "false" : "true");
    cmd.setAttribute("checked", newValue);

    let deck = getViewDeck();
    for (let view of deck.childNodes) {
        view.workdaysOnly = (newValue == "true");
    }

    // Refresh the current view
    currentView().goToDay();
}

/**
 * Toggle the tasks in view checkbox and refresh the current view
 */
function toggleTasksInView() {
    let cmd = document.getElementById("calendar_toggle_tasks_in_view_command");
    let newValue = (cmd.getAttribute("checked") == "true" ? "false" : "true");
    cmd.setAttribute("checked", newValue);

    let deck = getViewDeck();
    for (let view of deck.childNodes) {
        view.tasksInView = (newValue == "true");
    }

    // Refresh the current view
    currentView().goToDay();
}

/**
 * Toggle the show completed in view checkbox and refresh the current view
 */
function toggleShowCompletedInView() {
    let cmd = document.getElementById("calendar_toggle_show_completed_in_view_command");
    let newValue = (cmd.getAttribute("checked") == "true" ? "false" : "true");
    cmd.setAttribute("checked", newValue);

    let deck = getViewDeck();
    for (let view of deck.childNodes) {
        view.showCompleted = (newValue == "true");
    }

    // Refresh the current view
    currentView().goToDay();
}

/**
 * Provides a neutral way to go to the current day in the views and minimonth.
 *
 * @param aDate     The date to go.
 */
function goToDate(aDate) {
    getMinimonth().value = cal.dtz.dateTimeToJsDate(aDate);
    currentView().goToDay(aDate);
}

/**
 * Returns the calendar view that was selected before restart, or the current
 * calendar view if it has already been set in this session
 *
 * @return          The last calendar view.
 */
function getLastCalendarView() {
    let deck = getViewDeck();
    if (deck.hasAttribute("selectedIndex")) {
        let viewNode = deck.childNodes[deck.selectedIndex];
        return viewNode.id.replace(/-view/, "");
    }

    // No deck item was selected beforehand, default to week view.
    return "week";
}

/**
 * Deletes items currently selected in the view and clears selection.
 */
function deleteSelectedEvents() {
    let selectedItems = currentView().getSelectedItems({});
    calendarViewController.deleteOccurrences(selectedItems.length,
                                             selectedItems,
                                             false,
                                             false);
    // clear selection
    currentView().setSelectedItems(0, [], true);
}

/**
 * Edit the items currently selected in the view with the event dialog.
 */
function editSelectedEvents() {
    let selectedItems = currentView().getSelectedItems({});
    if (selectedItems && selectedItems.length >= 1) {
        modifyEventWithDialog(selectedItems[0], null, true);
    }
}

/**
 * Select all events from all calendars. Use with care.
 */
function selectAllEvents() {
    let items = [];
    let listener = {
        QueryInterface: ChromeUtils.generateQI([Ci.calIOperationListener]),
        onOperationComplete: function(aCalendar, aStatus, aOperationType, aId, aDetail) {
            currentView().setSelectedItems(items.length, items, false);
        },
        onGetResult: function(aCalendar, aStatus, aItemType, aDetail, aCount, aItems) {
            for (let item of aItems) {
                items.push(item);
            }
        }
    };

    let composite = cal.view.getCompositeCalendar(window);
    let filter = composite.ITEM_FILTER_CLASS_OCCURRENCES;

    if (currentView().tasksInView) {
        filter |= composite.ITEM_FILTER_TYPE_ALL;
    } else {
        filter |= composite.ITEM_FILTER_TYPE_EVENT;
    }
    if (currentView().showCompleted) {
        filter |= composite.ITEM_FILTER_COMPLETED_ALL;
    } else {
        filter |= composite.ITEM_FILTER_COMPLETED_NO;
    }

    // Need to move one day out to get all events
    let end = currentView().endDay.clone();
    end.day += 1;

    composite.getItems(filter, 0, currentView().startDay, end, listener);
}

cal.navigationBar = {
    setDateRange: function(aStartDate, aEndDate) {
        let docTitle = "";
        if (aStartDate) {
            let intervalLabel = document.getElementById("intervalDescription");
            let firstWeekNo = cal.getWeekInfoService().getWeekTitle(aStartDate);
            let secondWeekNo = firstWeekNo;
            let weekLabel = document.getElementById("calendarWeek");
            if (aStartDate.nativeTime == aEndDate.nativeTime) {
                intervalLabel.value = cal.getDateFormatter().formatDate(aStartDate);
            } else {
                intervalLabel.value = currentView().getRangeDescription();
                secondWeekNo = cal.getWeekInfoService().getWeekTitle(aEndDate);
            }
            if (secondWeekNo == firstWeekNo) {
                weekLabel.value = cal.l10n.getCalString("singleShortCalendarWeek", [firstWeekNo]);
                weekLabel.tooltipText = cal.l10n.getCalString("singleLongCalendarWeek", [firstWeekNo]);
            } else {
                weekLabel.value = cal.l10n.getCalString("severalShortCalendarWeeks", [firstWeekNo, secondWeekNo]);
                weekLabel.tooltipText = cal.l10n.getCalString("severalLongCalendarWeeks", [firstWeekNo, secondWeekNo]);
            }
            docTitle = intervalLabel.value;
        }
        if (document.getElementById("modeBroadcaster").getAttribute("mode") == "calendar") {
            document.title = (docTitle ? docTitle + " - " : "") +
                cal.l10n.getAnyString("branding", "brand", "brandFullName");
        }
        let viewTabs = document.getElementById("view-tabs");
        viewTabs.selectedIndex = getViewDeck().selectedIndex;
    }
};

/*
 * Timer for the time indicator in day and week view.
 */
var timeIndicator = {
    timer: null,
    start: function(aInterval, aThis) {
        timeIndicator.timer = setInterval(() => aThis.updateTimeIndicatorPosition(false), aInterval * 1000);
    },
    cancel: function() {
        if (timeIndicator.timer) {
            clearTimeout(timeIndicator.timer);
            timeIndicator.timer = null;
        }
    },
    lastView: null
};

var timezoneObserver = {
    observe: function() {
        let minimonth = getMinimonth();
        minimonth.update(minimonth.value);
    }
};
Services.obs.addObserver(timezoneObserver, "defaultTimezoneChanged");
window.addEventListener("unload", () => {
    Services.obs.removeObserver(timezoneObserver, "defaultTimezoneChanged");
});
