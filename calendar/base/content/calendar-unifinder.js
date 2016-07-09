/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported gCalendarEventTreeClicked, unifinderDoubleClick, unifinderKeyPress,
 *          focusSearch, toggleUnifinder
 */

/**
 * U N I F I N D E R
 *
 * This is a hacked in interface to the unifinder. We will need to
 * improve this to make it usable in general.
 *
 * NOTE: Including this file will cause a load handler to be added to the
 * window.
 */

Components.utils.import("resource://calendar/modules/calUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

// Set this to true when the calendar event tree is clicked to allow for
// multiple selection
var gCalendarEventTreeClicked = false;

// Store the start and enddate, because the providers can't be trusted when
// dealing with all-day events. So we need to filter later. See bug 306157

var kDefaultTimezone;
var gUnifinderNeedsRefresh = true;

/**
 * Checks if the unifinder is hidden
 *
 * @return      Returns true if the unifinder is hidden.
 */
function isUnifinderHidden() {
    return document.getElementById("bottom-events-box").hidden;
}

/**
 * Returns the current filter applied to the unifinder.
 *
 * @return      The string name of the applied filter.
 */
function getCurrentUnifinderFilter() {
    return document.getElementById("event-filter-menulist").selectedItem.value;
}

/**
 * Observer for the calendar event data source. This keeps the unifinder
 * display up to date when the calendar event data is changed
 *
 * @see calIObserver
 * @see calICompositeObserver
 */
var unifinderObserver = {
    QueryInterface: XPCOMUtils.generateQI([
        Components.interfaces.calICompositeObserver,
        Components.interfaces.nsIObserver,
        Components.interfaces.calIObserver
    ]),

    // calIObserver:
    onStartBatch: function() {
    },

    onEndBatch: function() {
        refreshEventTree();
    },

    onLoad: function() {
        if (isUnifinderHidden() && !gUnifinderNeedsRefresh) {
            // If the unifinder is hidden, all further item operations might
            // produce invalid entries in the unifinder. From now on, ignore
            // those operations and refresh as soon as the unifinder is shown
            // again.
            gUnifinderNeedsRefresh = true;
            unifinderTreeView.clearItems();
        }
    },

    onAddItem: function(aItem) {
        if (isEvent(aItem) &&
            !gUnifinderNeedsRefresh &&
            unifinderTreeView.mFilter.isItemInFilters(aItem)
            ) {
            this.addItemToTree(aItem);
        }
    },

    onModifyItem: function(aNewItem, aOldItem) {
        this.onDeleteItem(aOldItem);
        this.onAddItem(aNewItem);
    },

    onDeleteItem: function(aDeletedItem) {
        if (isEvent(aDeletedItem) && !gUnifinderNeedsRefresh) {
            this.removeItemFromTree(aDeletedItem);
        }
    },

    onError: function(aCalendar, aErrNo, aMessage) {},

    onPropertyChanged: function(aCalendar, aName, aValue, aOldValue) {
        switch (aName) {
            case "disabled":
                refreshEventTree();
                break;
        }
    },

    onPropertyDeleting: function(aCalendar, aName) {
        this.onPropertyChanged(aCalendar, aName, null, null);
    },

    // calICompositeObserver:
    onCalendarAdded: function(aAddedCalendar) {
        if (!aAddedCalendar.getProperty("disabled")) {
            addItemsFromCalendar(aAddedCalendar,
                                 addItemsFromSingleCalendarInternal);
        }
    },

    onCalendarRemoved: function(aDeletedCalendar) {
        if (!aDeletedCalendar.getProperty("disabled")) {
            deleteItemsFromCalendar(aDeletedCalendar);
        }
    },

    onDefaultCalendarChanged: function(aNewDefaultCalendar) {},

    /**
     * Add an unifinder item to the tree. It is safe to call these for any
     * event. The functions will determine whether or not anything actually
     * needs to be done to the tree.
     *
     * @return aItem        The item to add to the tree.
     */
    addItemToTree: function(aItem) {
        let items;
        let filter = unifinderTreeView.mFilter;

        if (filter.startDate && filter.endDate) {
            items = aItem.getOccurrencesBetween(filter.startDate, filter.endDate, {});
        } else {
            items = [aItem];
        }
        unifinderTreeView.addItems(items.filter(filter.isItemInFilters, filter));
    },

    /**
     * Remove an item from the unifinder tree. It is safe to call these for any
     * event. The functions will determine whether or not anything actually
     * needs to be done to the tree.
     *
     * @return aItem        The item to remove from the tree.
     */
    removeItemFromTree: function(aItem) {
        let items;
        let filter = unifinderTreeView.mFilter;
        if (filter.startDate && filter.endDate && (aItem.parentItem == aItem)) {
            items = aItem.getOccurrencesBetween(filter.startDate, filter.endDate, {});
        } else {
            items = [aItem];
        }
        // XXX: do we really still need this, we are always checking it in the refreshInternal
        unifinderTreeView.removeItems(items.filter(filter.isItemInFilters, filter));
    },

    observe: function(aSubject, aTopic, aPrefName) {
        switch (aPrefName) {
            case "calendar.date.format":
            case "calendar.timezone.local":
                refreshEventTree();
                break;
        }
    }
};

/**
 * Called when the window is loaded to prepare the unifinder. This function is
 * used to add observers, event listeners, etc.
 */
function prepareCalendarUnifinder() {
    // Only load once
    window.removeEventListener("load", prepareCalendarUnifinder, false);
    let unifinderTree = document.getElementById("unifinder-search-results-tree");

    // Add pref observer
    let branch = Services.prefs.getBranch("");
    branch.addObserver("calendar.", unifinderObserver, false);

    // Check if this is not the hidden window, which has no UI elements
    if (unifinderTree) {
        // set up our calendar event observer
        let ccalendar = getCompositeCalendar();
        ccalendar.addObserver(unifinderObserver);

        kDefaultTimezone = calendarDefaultTimezone();

        // Set up the filter
        unifinderTreeView.mFilter = new calFilter();

        // Set up the unifinder views.
        unifinderTreeView.treeElement = unifinderTree;
        unifinderTree.view = unifinderTreeView;

        // Listen for changes in the selected day, so we can update if need be
        let viewDeck = getViewDeck();
        viewDeck.addEventListener("dayselect", unifinderDaySelect, false);
        viewDeck.addEventListener("itemselect", unifinderItemSelect, true);

        // Set up sortDirection and sortActive, in case it persisted
        let sorted = unifinderTree.getAttribute("sort-active");
        let sortDirection = unifinderTree.getAttribute("sort-direction");
        if (!sortDirection || sortDirection == "undefined") {
            sortDirection = "ascending";
        }
        let tree = document.getElementById("unifinder-search-results-tree");
        let treecols = tree.getElementsByTagName("treecol");
        for (let i = 0; i < treecols.length; i++) {
            let col = treecols[i];
            let content = col.getAttribute("itemproperty");
            if (sorted && sorted.length > 0) {
                if (sorted == content) {
                    unifinderTreeView.sortDirection = sortDirection;
                    unifinderTreeView.selectedColumn = col;
                }
            }
        }
        // Display something upon first load. onLoad doesn't work properly for
        // observers
        if (!isUnifinderHidden()) {
            gUnifinderNeedsRefresh = false;
            refreshEventTree();
        }
    }
}

/**
 * Called when the window is unloaded to clean up any observers and listeners
 * added.
 */
function finishCalendarUnifinder() {
    let ccalendar = getCompositeCalendar();
    ccalendar.removeObserver(unifinderObserver);

    // Remove pref observer
    let branch = Services.prefs.getBranch("");
    branch.removeObserver("calendar.", unifinderObserver, false);

    let viewDeck = getViewDeck();
    if (viewDeck) {
        viewDeck.removeEventListener("dayselect", unifinderDaySelect, false);
        viewDeck.removeEventListener("itemselect", unifinderItemSelect, true);
    }

    // Persist the sort
    let unifinderTree = document.getElementById("unifinder-search-results-tree");
    let sorted = unifinderTreeView.selectedColumn;
    if (sorted) {
        unifinderTree.setAttribute("sort-active", sorted.getAttribute("itemproperty"));
        unifinderTree.setAttribute("sort-direction", unifinderTreeView.sortDirection);
    } else {
        unifinderTree.removeAttribute("sort-active");
        unifinderTree.removeAttribute("sort-direction");
    }
}

/**
 * Event listener for the view deck's dayselect event.
 */
function unifinderDaySelect() {
    let filter = getCurrentUnifinderFilter();
    if (filter == "current" || filter == "currentview") {
        refreshEventTree();
    }
}

/**
 * Event listener for the view deck's itemselect event.
 */
function unifinderItemSelect(aEvent) {
    unifinderTreeView.setSelectedItems(aEvent.detail);
}

/**
 * Helper function to display event datetimes in the unifinder.
 *
 * @param aDatetime     A calIDateTime object to format.
 * @return              The passed date's formatted in the default timezone.
 */
function formatUnifinderEventDateTime(aDatetime) {
    return cal.getDateFormatter().formatDateTime(aDatetime.getInTimezone(kDefaultTimezone));
}

/**
 * Handler function for double clicking the unifinder.
 *
 * @param event         The DOM doubleclick event.
 */
function unifinderDoubleClick(event) {
    // We only care about button 0 (left click) events
    if (event.button != 0) {
        return;
    }

    // find event by id
    let calendarEvent = unifinderTreeView.getItemFromEvent(event);

    if (calendarEvent) {
        modifyEventWithDialog(calendarEvent, null, true);
    } else {
        createEventWithDialog();
    }
}

/**
 * Handler function for selection in the unifinder.
 *
 * @param event         The DOM selection event.
 */
function unifinderSelect(event) {
    let tree = unifinderTreeView.treeElement;
    if (!tree.view.selection || tree.view.selection.getRangeCount() == 0) {
        return;
    }

    let selectedItems = [];
    gCalendarEventTreeClicked = true;

    // Get the selected events from the tree
    let start = {};
    let end = {};
    let numRanges = tree.view.selection.getRangeCount();

    for (let range = 0; range < numRanges; range++) {
        tree.view.selection.getRangeAt(range, start, end);

        for (let i = start.value; i <= end.value; i++) {
            try {
                selectedItems.push(unifinderTreeView.getItemAt(i));
            } catch (e) {
                WARN("Error getting Event from row: " + e + "\n");
            }
        }
    }

    if (selectedItems.length == 1) {
        // Go to the day of the selected item in the current view.
        currentView().goToDay(selectedItems[0].startDate);
    }

    // Set up the selected items in the view. Pass in true, so we don't end
    // up in a circular loop
    currentView().setSelectedItems(selectedItems.length, selectedItems, true);
    currentView().centerSelectedItems();
    calendarController.onSelectionChanged({ detail: selectedItems });
    document.getElementById("unifinder-search-results-tree").focus();
}

/**
 * Handler function for keypress in the unifinder.
 *
 * @param aEvent        The DOM Key event.
 */
function unifinderKeyPress(aEvent) {
    const kKE = Components.interfaces.nsIDOMKeyEvent;
    switch (aEvent.keyCode) {
        case 13:
            // Enter, edit the event
            editSelectedEvents();
            aEvent.stopPropagation();
            aEvent.preventDefault();
            break;
        case kKE.DOM_VK_BACK_SPACE:
        case kKE.DOM_VK_DELETE:
            deleteSelectedEvents();
            aEvent.stopPropagation();
            aEvent.preventDefault();
            break;
    }
}

/**
 * Tree controller for unifinder search results
 */
var unifinderTreeView = {
    QueryInterface: XPCOMUtils.generateQI([Components.interfaces.nsITreeView]),

    // Provide a default tree that holds all the functions used here to avoid
    // cludgy if (this.tree) { this.tree.rowCountChanged(...); } constructs.
    tree: {
        rowCountChanged: function() {},
        beginUpdateBatch: function() {},
        endUpdateBatch: function() {},
        invalidate: function() {}
    },

    treeElement: null,
    doingSelection: false,
    mFilter: null,
    mSelectedColumn: null,
    sortDirection: null,

    /**
     * Returns the currently selected column in the unifinder (used for sorting).
     */
    get selectedColumn() {
        return this.mSelectedColumn;
    },

    /**
     * Sets the currently selected column in the unifinder (used for sorting).
     */
    set selectedColumn(aCol) {
        let tree = document.getElementById("unifinder-search-results-tree");
        let treecols = tree.getElementsByTagName("treecol");
        for (let col of treecols) {
            if (col.getAttribute("sortActive")) {
                col.removeAttribute("sortActive");
                col.removeAttribute("sortDirection");
            }
            if (aCol.getAttribute("itemproperty") == col.getAttribute("itemproperty")) {
                col.setAttribute("sortActive", "true");
                col.setAttribute("sortDirection", this.sortDirection);
            }
        }
        return (this.mSelectedColumn = aCol);
    },

    /**
     * Event functions
     */

    eventArray: [],
    eventIndexMap: {},

    /**
     * Add an item to the unifinder tree.
     *
     * @param aItemArray        An array of items to add.
     * @param aDontSort         If true, the items will only be appended.
     */
    addItems: function(aItemArray, aDontSort) {
        this.eventArray = this.eventArray.concat(aItemArray);
        let newCount = (this.eventArray.length - aItemArray.length - 1);
        this.tree.rowCountChanged(newCount, aItemArray.length);

        if (aDontSort) {
            this.calculateIndexMap();
        } else {
            this.sortItems();
        }
    },

    /**
     * Remove items from the unifinder tree.
     *
     * @param aItemArray        An array of items to remove.
     */
    removeItems: function(aItemArray) {
        let indexesToRemove = [];
        // Removing items is a bit tricky. Our getItemRow function takes the
        // index from a cached map, so removing an item from the array will
        // remove the wrong indexes. We don't want to just invalidate the map,
        // since this will cause O(n^2) behavior. Instead, we keep a sorted
        // array of the indexes to remove:
        for (let item of aItemArray) {
            let row = this.getItemRow(item);
            if (row > -1) {
                if (!indexesToRemove.length || row <= indexesToRemove[0]) {
                    indexesToRemove.unshift(row);
                } else {
                    indexesToRemove.push(row);
                }
            }
        }

        // Then we go through the indexes to remove, and remove then from the
        // array. We subtract one delta for each removed index to make sure the
        // correct element is removed from the array and the correct
        // notification is sent.
        this.tree.beginUpdateBatch();
        for (let delta = 0; delta < indexesToRemove.length; delta++) {
            let index = indexesToRemove[delta];
            this.eventArray.splice(index - delta, 1);
            this.tree.rowCountChanged(index - delta, -1);
        }
        this.tree.endUpdateBatch();

        // Finally, we recalculate the index map once. This way we end up with
        // (given that Array.unshift doesn't loop but just prepends or maps
        // memory smartly) O(3n) behavior. Lets hope its worth it.
        this.calculateIndexMap(true);
    },

    /**
     * Clear all items from the unifinder.
     */
    clearItems: function() {
        let oldCount = this.eventArray.length;
        this.eventArray = [];
        this.tree.rowCountChanged(0, -oldCount);
        this.calculateIndexMap();
    },

    /**
     * Sets the items that should be in the unifinder. This removes all items
     * that were previously in the unifinder.
     */
    setItems: function(aItemArray, aDontSort) {
        let oldCount = this.eventArray.length;
        this.eventArray = aItemArray.slice(0);
        this.tree.rowCountChanged(oldCount - 1, this.eventArray.length - oldCount);

        if (aDontSort) {
            this.calculateIndexMap();
        } else {
            this.sortItems();
        }
    },

    /**
     * Recalculate the index map that improves performance when accessing
     * unifinder items. This is usually done automatically when adding/removing
     * items.
     *
     * @param aDontInvalidate       (optional) Don't invalidate the tree, i.e if
     *                                you correctly issued rowCountChanged
     *                                notices.
     */
    calculateIndexMap: function(aDontInvalidate) {
        this.eventIndexMap = {};
        for (let i = 0; i < this.eventArray.length; i++) {
            this.eventIndexMap[this.eventArray[i].hashId] = i;
        }

        if (!aDontInvalidate) {
            this.tree.invalidate();
        }
    },

    /**
     * Sort the items in the unifinder by the currently selected column.
     */
    sortItems: function() {
        if (this.selectedColumn) {
            let modifier = (this.sortDirection == "descending" ? -1 : 1);
            let sortKey = unifinderTreeView.selectedColumn.getAttribute("itemproperty");
            let sortType = cal.getSortTypeForSortKey(sortKey);
            // sort (key,item) entries
            cal.sortEntry.mSortKey = sortKey;
            cal.sortEntry.mSortStartedDate = now();
            let entries = this.eventArray.map(cal.sortEntry, cal.sortEntry);
            entries.sort(cal.sortEntryComparer(sortType, modifier));
            this.eventArray = entries.map(cal.sortEntryItem);
        }
        this.calculateIndexMap();
    },

    /**
     * Get the index of the row associated with the passed item.
     *
     * @param item      The item to search for.
     * @return          The row index of the passed item.
     */
    getItemRow: function(item) {
        if (this.eventIndexMap[item.hashId] === undefined) {
            return -1;
        }
        return this.eventIndexMap[item.hashId];
    },

    /**
     * Get the item at the given row index.
     *
     * @param item      The row index to get the item for.
     * @return          The item at the given row.
     */
    getItemAt: function(aRow) {
        return this.eventArray[aRow];
    },

    /**
     * Get the calendar item from the given DOM event
     *
     * @param event     The DOM mouse event to get the item for.
     * @return          The item under the mouse position.
     */
    getItemFromEvent: function(event) {
        let row = this.tree.getRowAt(event.clientX, event.clientY);

        if (row > -1) {
            return this.getItemAt(row);
        }
        return null;
    },

    /**
     * Change the selection in the unifinder.
     *
     * @param aItemArray        An array of items to select.
     */
    setSelectedItems: function(aItemArray) {
        if (this.doingSelection || !this.tree || !this.tree.view) {
            return;
        }

        this.doingSelection = true;

        // If no items were passed, get the selected items from the view.
        aItemArray = aItemArray || currentView().getSelectedItems({});

        calendarUpdateDeleteCommand(aItemArray);

        /**
         * The following is a brutal hack, caused by
         * http://lxr.mozilla.org/mozilla1.0/source/layout/xul/base/src/tree/src/nsTreeSelection.cpp#555
         * and described in bug 168211
         * http://bugzilla.mozilla.org/show_bug.cgi?id=168211
         * Do NOT remove anything in the next 3 lines, or the selection in the tree will not work.
         */
        this.treeElement.onselect = null;
        this.treeElement.removeEventListener("select", unifinderSelect, true);
        this.tree.view.selection.selectEventsSuppressed = true;
        this.tree.view.selection.clearSelection();

        if (aItemArray && aItemArray.length == 1) {
            // If only one item is selected, scroll to it
            let rowToScrollTo = this.getItemRow(aItemArray[0]);
            if (rowToScrollTo > -1) {
                this.tree.ensureRowIsVisible(rowToScrollTo);
                this.tree.view.selection.select(rowToScrollTo);
            }
        } else if (aItemArray && aItemArray.length > 1) {
            // If there is more than one item, just select them all.
            for (let item of aItemArray) {
                let row = this.getItemRow(item);
                this.tree.view.selection.rangedSelect(row, row, true);
            }
        }

        // This needs to be in a setTimeout
        setTimeout(() => unifinderTreeView.resetAllowSelection(), 1);
    },

    /**
     * Due to a selection issue described in bug 168211 this method is needed to
     * re-add the selection listeners selection listeners.
     */
    resetAllowSelection: function() {
        if (!this.tree) {
            return;
        }
        /**
         * Do not change anything in the following lines, they are needed as
         * described in the selection observer above
         */
        this.doingSelection = false;

        this.tree.view.selection.selectEventsSuppressed = false;
        this.treeElement.addEventListener("select", unifinderSelect, true);
    },

    /**
     * Tree View Implementation
     * @see nsITreeView
     */
    get rowCount() {
        return this.eventArray.length;
    },


    // TODO this code is currently identical to the task tree. We should create
    // an itemTreeView that these tree views can inherit, that contains this
    // code, and possibly other code related to sorting and storing items. See
    // bug 432582 for more details.
    getCellProperties: function(aRow, aCol) {
        let rowProps = this.getRowProperties(aRow);
        let colProps = this.getColumnProperties(aCol);
        return rowProps + (rowProps && colProps ? " " : "") + colProps;
    },
    getRowProperties: function(aRow) {
        let properties = [];
        let item = this.eventArray[aRow];
        if (item.priority > 0 && item.priority < 5) {
            properties.push("highpriority");
        } else if (item.priority > 5 && item.priority < 10) {
            properties.push("lowpriority");
        }

        // Add calendar name atom
        properties.push("calendar-" + formatStringForCSSRule(item.calendar.name));

        // Add item status atom
        if (item.status) {
            properties.push("status-" + item.status.toLowerCase());
        }

        // Alarm status atom
        if (item.getAlarms({}).length) {
            properties.push("alarm");
        }

        // Task categories
        properties = properties.concat(item.getCategories({})
                                           .map(formatStringForCSSRule));

        return properties.join(" ");
    },
    getColumnProperties: function(aCol) { return ""; },

    isContainer: function() {
        return false;
    },

    isContainerOpen: function(aRow) {
        return false;
    },

    isContainerEmpty: function(aRow) {
        return false;
    },

    isSeparator: function(aRow) {
        return false;
    },

    isSorted: function(aRow) {
        return false;
    },

    canDrop: function(aRow, aOrientation) {
        return false;
    },

    drop: function(aRow, aOrientation) {},

    getParentIndex: function(aRow) {
        return -1;
    },

    hasNextSibling: function(aRow, aAfterIndex) {},

    getLevel: function(aRow) {
        return 0;
    },

    getImageSrc: function(aRow, aOrientation) {},

    getProgressMode: function(aRow, aCol) {},

    getCellValue: function(aRow, aCol) {
        return null;
    },

    getCellText: function(row, column) {
        let calendarEvent = this.eventArray[row];

        switch (column.element.getAttribute("itemproperty")) {
            case "title": {
                return (calendarEvent.title ? calendarEvent.title.replace(/\n/g, " ") : "");
            }
            case "startDate": {
                return formatUnifinderEventDateTime(calendarEvent.startDate);
            }
            case "endDate": {
                let eventEndDate = calendarEvent.endDate.clone();
                // XXX reimplement
                // let eventEndDate = getCurrentNextOrPreviousRecurrence(calendarEvent);
                if (calendarEvent.startDate.isDate) {
                    // display enddate is ical enddate - 1
                    eventEndDate.day = eventEndDate.day - 1;
                }
                return formatUnifinderEventDateTime(eventEndDate);
            }
            case "categories": {
                return calendarEvent.getCategories({}).join(", ");
            }
            case "location": {
                return calendarEvent.getProperty("LOCATION");
            }
            case "status": {
                return getEventStatusString(calendarEvent);
            }
            case "calendar": {
                return calendarEvent.calendar.name;
            }
            default: {
                return false;
            }
        }
    },

    setTree: function(tree) {
        this.tree = tree;
    },

    toggleOpenState: function(aRow) {},

    cycleHeader: function(col) {
        if (!this.selectedColumn) {
            this.sortDirection = "ascending";
        } else if (!this.sortDirection || this.sortDirection == "descending") {
            this.sortDirection = "ascending";
        } else {
            this.sortDirection = "descending";
        }
        this.selectedColumn = col.element;
        this.sortItems();
    },

    isEditable: function(aRow, aCol) {
        return false;
    },

    setCellValue: function(aRow, aCol, aValue) {},
    setCellText: function(aRow, aCol, aValue) {},

    performAction: function(aAction) {},

    performActionOnRow: function(aAction, aRow) {},

    performActionOnCell: function(aAction, aRow, aCol) {},

    outParameter: {} // used to obtain dates during sort
};

/**
 * Refresh the unifinder tree by getting items from the composite calendar and
 * applying the current filter.
 */
function refreshEventTree() {
    let field = document.getElementById("unifinder-search-field");
    if (field) {
        unifinderTreeView.mFilter.filterText = field.value;
    }

    addItemsFromCalendar(getCompositeCalendar(),
                         addItemsFromCompositeCalendarInternal);
}

/**
 * EXTENSION_POINTS
 * Filters the passed event array according to the currently applied filter.
 * Afterwards, applies the items to the unifinder view.
 *
 * If you are implementing a new filter, you can overwrite this function and
 * filter the items accordingly and afterwards call this function with the
 * result.
 *
 * @param eventArray        The array of items to be set in the unifinder.
 */
function addItemsFromCompositeCalendarInternal(eventArray) {
    let newItems = eventArray.filter(unifinderTreeView.mFilter.isItemInFilters,
                                     unifinderTreeView.mFilter);
    unifinderTreeView.setItems(newItems);

    // Select selected events in the tree. Not passing the argument gets the
    // items from the view.
    unifinderTreeView.setSelectedItems();
}

function addItemsFromSingleCalendarInternal(eventArray) {
    let newItems = eventArray.filter(unifinderTreeView.mFilter.isItemInFilters,
                                     unifinderTreeView.mFilter);
    unifinderTreeView.setItems(unifinderTreeView.eventArray.concat(newItems));

    // Select selected events in the tree. Not passing the argument gets the
    // items from the view.
    unifinderTreeView.setSelectedItems();
}

function addItemsFromCalendar(aCalendar, aAddItemsInternalFunc) {
    if (isUnifinderHidden()) {
        // If the unifinder is hidden, don't refresh the events to reduce needed
        // getItems calls.
        return;
    }
    let refreshListener = {
        QueryInterface: XPCOMUtils.generateQI([Components.interfaces.calIOperationListener]),
        mEventArray: [],

        onOperationComplete: function(aOpCalendar, aStatus, aOperationType, aId, aDateTime) {
            let refreshTreeInternalFunc = function() {
                aAddItemsInternalFunc(refreshListener.mEventArray);
            };
            setTimeout(refreshTreeInternalFunc, 0);
        },

        onGetResult: function(aOpCalendar, aStatus, aItemType, aDetail, aCount, aItems) {
            refreshListener.mEventArray = refreshListener.mEventArray.concat(aItems);
        }
    };

    let filter = 0;

    filter |= aCalendar.ITEM_FILTER_TYPE_EVENT;

    // Not all xul might be there yet...
    if (!document.getElementById("unifinder-search-field")) {
        return;
    }
    unifinderTreeView.mFilter.applyFilter(getCurrentUnifinderFilter());

    if (unifinderTreeView.mFilter.startDate && unifinderTreeView.mFilter.endDate) {
        filter |= aCalendar.ITEM_FILTER_CLASS_OCCURRENCES;
    }

    aCalendar.getItems(filter,
                       0,
                       unifinderTreeView.mFilter.startDate,
                       unifinderTreeView.mFilter.endDate,
                       refreshListener);
}

function deleteItemsFromCalendar(aCalendar) {
    let filter = unifinderTreeView.mFilter;
    let items = unifinderTreeView.eventArray.filter(item => item.calendar.id == aCalendar.id);

    unifinderTreeView.removeItems(items.filter(filter.isItemInFilters, filter));
}

/**
 * Focuses the unifinder search field
 */
function focusSearch() {
    document.getElementById("unifinder-search-field").focus();
}

/**
 * Toggles the hidden state of the unifinder.
 */
function toggleUnifinder() {
    // Toggle the elements
    goToggleToolbar("bottom-events-box", "calendar_show_unifinder_command");
    goToggleToolbar("calendar-view-splitter");

    unifinderTreeView.treeElement.view = unifinderTreeView;

    // When the unifinder is hidden, refreshEventTree is not called. Make sure
    // the event tree is refreshed now.
    if (!isUnifinderHidden() && gUnifinderNeedsRefresh) {
        gUnifinderNeedsRefresh = false;
        refreshEventTree();
    }

    // Make sure the selection is correct
    if (unifinderTreeView.doingSelection) {
        unifinderTreeView.resetAllowSelection();
    }
    unifinderTreeView.setSelectedItems();
}

window.addEventListener("load", prepareCalendarUnifinder, false);
window.addEventListener("unload", finishCalendarUnifinder, false);
