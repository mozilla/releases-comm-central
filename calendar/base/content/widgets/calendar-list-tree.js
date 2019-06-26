/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from ../calendar-common-sets.js */

/* globals MozXULElement */

// Wrap in a block to prevent leaking to window scope.
{
    /**
     * A basic calendar list tree, for displaying a list of calendars. For example, this custom
     * element is typically used in the dialog that is shown when uninstalling a calendar provider
     * such as the Google calendar provider. Other uses are implemented via subclasses.
     *
     * @extends MozTree
     * @implements nsiTreeView
     */
    class CalendarListTree extends customElements.get("tree") {
        // The mechanisms for inheriting attributes do not currently work in this case
        // (see bug 1545824 and the manual inheritance code below). Keeping this here,
        // commented out, for when those mechanisms work.
        // static get inheritedAttributes() {
        //     return {
        //         // Include inherited attributes from MozTree super class,
        //         // otherwise scrollbars are not hidden properly.
        //         ...super.inheritedAttributes,
        //         ".treecols": "hideheader",
        //         ".checkbox-treecol": "cycler,hideheader",
        //         ".color-treecol": "cycler,hideheader",
        //         ".calendarname-treecol": "cycler,hideheader",
        //         ".status-treecol": "cycler,hideheader",
        //         ".scrollbar-spacer": "cycler,hideheader",
        //         ".treechildren": "tooltip=childtooltip,context=childcontext",
        //     };
        // }

        connectedCallback() {
            if (this.delayConnectedCallback() || this.hasConnected) {
                return;
            }
            this.hasConnected = true;

            super.connectedCallback();

            // We set a `type` attribute on each treecol element so we can identify which is which,
            // since we are not using ids (to avoid duplicate id problems).
            this.appendChild(MozXULElement.parseXULToFragment(`
                <treecols class="treecols"
                          hideheader="true">
                  <treecol class="checkbox-treecol"
                           type="checkbox-treecol"
                           hideheader="true"
                           cycler="true"
                           width="17"/>
                  <treecol class="color-treecol"
                           type="color-treecol"
                           hideheader="true"
                           width="16"/>
                  <treecol class="calendarname-treecol"
                           type="calendarname-treecol"
                           hideheader="true"
                           label="&calendar.unifinder.tree.calendarname.label;"
                           flex="1"/>
                  <treecol class="status-treecol"
                           type="status-treecol"
                           hideheader="true"
                           width="18"/>
                  <treecol class="scrollbar-spacer"
                           type="scrollbar-spacer"
                           hideheader="true"
                           fixed="true">
                    <!-- This treecol is a very elegant workaround to make sure the last column
                         is not covered by the scrollbar in case of an overflow. This
                         treecol needs to be here in the last position. -->
                    <slider class="scrollbar-slider"
                            orient="vertical"/>
                  </treecol>
                </treecols>
                <treechildren class="treechildren"/>
            `,
                ["chrome://calendar/locale/calendar.dtd"]
            ));

            // Set default attributes.

            this.classList.add("calendar-list-tree");

            if (!this.hasAttribute("inherits")) {
                this.setAttribute("inherits", "hidecolumnpicker");
            }
            if (!this.hasAttribute("hidecolumnpicker")) {
                this.setAttribute("hidecolumnpicker", "true");
            }
            if (!this.hasAttribute("seltype")) {
                this.setAttribute("seltype", "single");
            }
            if (!this.hasAttribute("flex")) {
                this.setAttribute("flex", "1");
            }

            const treechildren = this.querySelector(".treechildren");

            // Manual attribute inheritance, instead of calling this.initializeAttributeInheritance.
            // (Note that initializeAttributeInheritance is also called by super.connectedCallback.)
            // Because the MozTree super class has a shadowDOM, the attribute inheritance
            // mechanisms don't work, because the code tries to inherit from the shadowDOM
            // (because it exists) and does not find the elements there. So we handle it manually.
            if (this.hasAttribute("childtooltip")) {
                treechildren.setAttribute("tooltip", this.getAttribute("childtooltip"));
            }
            if (this.hasAttribute("childcontext")) {
                treechildren.setAttribute("context", this.getAttribute("childcontext"));
            }

            // Event Listeners

            treechildren.addEventListener("dragstart", this.onDragStart.bind(this));
            treechildren.addEventListener("overflow", this.displayScrollbarSpacer.bind(this, true));
            treechildren.addEventListener("underflow", this.displayScrollbarSpacer.bind(this, false));

            this.addEventListener("select", (event) => {
                this.compositeCalendar.defaultCalendar = this.getCalendar(this.tree.currentIndex);
            });

            this.addEventListener("keypress", (event) => {
                switch (event.key) {
                    case "Delete": {
                        if (this.writable) {
                            promptDeleteCalendar(this.compositeCalendar.defaultCalendar);
                            event.preventDefault();
                        }
                        break;
                    }
                    case " ": {
                        if (this.tree.currentIndex > -1) {
                            const col = this.tree.columns.getColumnFor(
                                this.querySelector(".checkbox-treecol"));

                            this.cycleCell(this.tree.currentIndex, col);
                            this.tree.invalidateRow(this.tree.currentIndex);
                            event.preventDefault();
                        }
                        break;
                    }
                    case "ArrowUp":
                    case "ArrowDown": {
                        // This is for re-ordering the items when allowDrag="true". Changing the
                        // currently selected item with up/down arrow keys is done by listeners in
                        // the MozTree super class.
                        if (!this.allowDrag) {
                            return;
                        }
                        const index = this.tree.currentIndex;

                        if ((event.key == "ArrowUp" && index < this.mCalendarList.length - 1) ||
                            (event.key == "ArrowDown" && index > 0)) {
                            // Note: this is counter-intuitive: up is -1, down is 1.
                            const newIndex = index + (event.key == "ArrowUp" ? -1 : 1);

                            this.mCalendarList.splice(newIndex, 0, this.mCalendarList.splice(index, 1)[0]);

                            const [from, to] = event.key == "ArrowUp" ? [index, newIndex] : [newIndex, index];
                            this.tree.invalidateRange(from, to);

                            if (this.tree.view.selection.isSelected(index)) {
                                this.tree.view.selection.toggleSelect(index);
                                this.tree.view.selection.toggleSelect(newIndex);
                            }
                            if (this.tree.view.selection.currentIndex == index) {
                                this.tree.view.selection.currentIndex = newIndex;
                            }

                            // Fire event.
                            this.sortOrderChanged();
                        }
                        event.preventDefault();
                        break;
                    }
                }
            });

            this.mCalendarList = [];
            this.mCompositeCalendar = null;
            this.tree = null;
            this.ruleCache = {};
            this.mCachedSheet = null;
            this.mCycleCalendarFlag = {};
            this.mCycleTimer = null;
            this.cycleDebounce = 200;

            // Set up the tree view (nsITreeView).
            this.tree = this.closest(".calendar-list-tree");
            this.tree.view = this.getCustomInterfaceCallback(Ci.nsITreeView);

            /**
             * Observer of changes to calendars. Each registered calendar uses this observer.
             *
             * @implements calIObserver
             */
            this.calObserver = {
                listTree: this,
                QueryInterface: ChromeUtils.generateQI([Ci.calIObserver]),

                // calIObserver Methods

                onStartBatch() {},
                onEndBatch() {},
                onLoad() {},
                onAddItem(item) {},
                onModifyItem(newItem, oldItem) {},
                onDeleteItem(deletedItem) {},
                onError(calendar, errNo, message) {},

                onPropertyChanged(calendar, name, value, oldValue) {
                    switch (name) {
                        case "color":
                            this.listTree.updateCalendarColor(calendar);
                            // Fall through, update item in any case
                        case "name":
                        case "currentStatus":
                        case "readOnly":
                        case "disabled":
                            this.listTree.updateCalendar(calendar);
                            // Fall through, update commands in any cases.
                    }
                },

                onPropertyDeleting(calendar, name) {
                    // Since the old value is not used directly in onPropertyChanged, but
                    // should not be the same as the value, set it to a different value.
                    this.onPropertyChanged(calendar, name, null, null);
                }
            };

            /**
             * Composite calendar observer.
             *
             * @implements calICompositeObserver
             */
            this.compositeObserver = {
                listTree: this,
                QueryInterface: ChromeUtils.generateQI([Ci.calICompositeObserver]),

                // calICompositeObserver Methods

                onCalendarAdded(calendar) {
                    // Make sure the checkbox state is updated.
                    this.listTree.updateCalendar(calendar);
                },

                onCalendarRemoved(calendar) {
                    // Make sure the checkbox state is updated.
                    this.listTree.updateCalendar(calendar);
                },

                onDefaultCalendarChanged(calendar) {},
            };
        }

        get sheet() {
            if (!this.mCachedSheet) {
                for (const sheet of document.styleSheets) {
                    if (sheet.href == "chrome://calendar/skin/calendar-management.css") {
                        this.mCachedSheet = sheet;
                        break;
                    }
                }
                if (!this.mCachedSheet) {
                    cal.ERROR("Could not find calendar-management.css, needs to be added to " +
                        window.document.title + "'s stylesheets");
                }
            }
            return this.mCachedSheet;
        }

        set calendars(cals) {
            this.tree.beginUpdateBatch();
            try {
                this.clear();
                this.mCalendarList = [];
                cals.forEach(calendar => this.addCalendar(calendar));
                return this.mCalendarList;
            } finally {
                this.tree.endUpdateBatch();
            }
        }

        get calendars() {
            return this.mCalendarList;
        }

        set compositeCalendar(compositeCal) {
            if (this.mCompositeCalendar) {
                throw Components.Exception("A composite calendar has already been set",
                    Cr.NS_ERROR_ALREADY_INITIALIZED);
            }
            this.mCompositeCalendar = compositeCal;
            this.mCompositeCalendar.addObserver(this.compositeObserver);

            if (this.tree && !this.calendarsAreLoaded) {
                this.loadCalendars();
            }
            return compositeCal;
        }

        get compositeCalendar() {
            if (!this.mCompositeCalendar) {
                this.mCompositeCalendar = Cc["@mozilla.org/calendar/calendar;1?type=composite"]
                    .createInstance(Ci.calICompositeCalendar);
            }
            return this.mCompositeCalendar;
        }

        get sortOrder() {
            return this.mCalendarList.map(calendar => calendar.id);
        }

        get selectedCalendars() {
            return this.compositeCalendar.getCalendars({});
        }

        set allowDrag(val) {
            return setBooleanAttribute(this, "allowdrag", val);
        }

        get allowDrag() {
            return (this.getAttribute("allowdrag") == "true");
        }

        set writable(val) {
            return setBooleanAttribute(this, "writable", val);
        }

        get writable() {
            return (this.getAttribute("writable") == "true");
        }

        set disabledState(val) {
            return this.setAttribute("disabledstate", val);
        }

        get disabledState() {
            return this.getAttribute("disabledstate") || "disabled";
        }

        // rowCount is an nsITreeView property.
        get rowCount() {
            return this.mCalendarList.length;
        }

        /**
         * Do the initial population of the list of calendars. Should be called only once.
         * This is called from either setTree or from "set compositeCalendar" depending on the order
         * in which they happen, because this.mCompositeCalendar has to be initialized and this.tree
         * cannot be null. Presumably, the order is non-deterministic because
         * "set compositeCalendar" is triggered by an event that is fired in connectedCallback,
         * via calendar management code.
         */
        loadCalendars() {
            this.mAddingFromComposite = true;

            const calendars = sortCalendarArray(cal.getCalendarManager().getCalendars({}));
            calendars.forEach(this.addCalendar, this);

            this.calendarsAreLoaded = true;
            this.mAddingFromComposite = false;
        }

        /**
         * Event handler for a dragstart event, called when starting to drag a calendar row.
         *
         * @param {Event} event    A dragstart event.
         */
        onDragStart(event) {
            const calendar = this.getCalendarFromEvent(event);
            if (this.allowDrag && event.dataTransfer) {
                // Setting data starts a drag session, do this only if dragging
                // is enabled for this custom element.
                event.dataTransfer.setData("application/x-moz-calendarID", calendar.id);
                event.dataTransfer.effectAllowed = "move";
            }
        }

        /**
         * Fire a SortOrderChanged event containing the new sort order.
         */
        sortOrderChanged() {
            if (this.mAddingFromComposite) {
                return;
            }
            const event = new Event("SortOrderChanged", { bubbles: true, cancelable: false });

            event.sortOrder = this.sortOrder;
            this.dispatchEvent(event);
        }

        /**
         * Display or do not display the scrollbar spacer.
         *
         * @param {boolean} shouldDisplay
         */
        displayScrollbarSpacer(shouldDisplay) {
            const spacer = this.querySelector(".scrollbar-spacer");
            spacer.collapsed = !shouldDisplay;
        }

        /**
         * Add the passed calendar to the composite calendar to ensure that it is visible.
         *
         * @param {calICalendar} calendar    A calendar object.
         */
        ensureCalendarVisible(calendar) {
            this.compositeCalendar.addCalendar(calendar);
        }

        /**
         * Return the index of the calendar, with the given id, in the internal calendar list.
         *
         * @param {string} id    The id of a calendar.
         * @return {number}      The index or -1 if not found.
         */
        findIndexById(id) {
            return this.mCalendarList.findIndex(calendar => calendar.id == id);
        }

        /**
         * Select a calendar by its id.
         *
         * @param {string} id    The id of the calendar to select.
         */
        selectCalendarById(id) {
            const index = this.findIndexById(id);
            this.tree.view.selection.select(index);
        }

        /**
         * Add a calendar to the tree.
         *
         * @param {calICalendar} calendar    The calendar object to add.
         */
        addCalendar(calendar) {
            if (!this.tree) {
                return;
            }

            const composite = this.compositeCalendar;

            const initialSortOrderPos = calendar.getProperty("initialSortOrderPos");
            if (initialSortOrderPos != null && initialSortOrderPos < this.mCalendarList.length) {
                // Insert the calendar at the requested sort order position
                // and then discard the property.
                this.mCalendarList.splice(initialSortOrderPos, 0, calendar);
                calendar.deleteProperty("initialSortOrderPos");
            } else {
                this.mCalendarList.push(calendar);
            }

            this.tree.rowCountChanged(this.mCalendarList.length - 1, 1);

            if (!composite.defaultCalendar ||
                calendar.id == composite.defaultCalendar.id) {
                this.tree.view.selection.select(this.mCalendarList.length - 1);
            }

            this.updateCalendarColor(calendar);

            // Watch the calendar for changes, i.e color.
            calendar.addObserver(this.calObserver);

            // Adding a calendar causes the sort order to be changed.
            this.sortOrderChanged();

            // Re-assign defaultCalendar, sometimes it is not the right one after
            // removing and adding a calendar.
            if (composite.defaultCalendar && this.tree.currentIndex > -1) {
                const currentCal = this.getCalendar(this.tree.currentIndex);
                if (composite.defaultCalendar.id != currentCal.id) {
                    composite.defaultCalendar = currentCal;
                }
            }
        }

        /**
         * Remove a calendar from the tree.
         *
         * @param {calICalendar} calendar    The calendar object to remove.
         */
        removeCalendar(calendar) {
            let index = this.findIndexById(calendar.id);
            if (index < 0) {
                return;
            }

            this.mCalendarList.splice(index, 1);
            this.tree.rowCountChanged(index, -1);

            if (index == this.rowCount) {
                index--;
            }

            this.tree.view.selection.select(index + 1);

            calendar.removeObserver(this.calObserver);

            // Make sure the calendar is removed from the composite calendar.
            this.compositeCalendar.removeCalendar(calendar);

            // Remove the css style rule from the sheet.
            let sheet = this.sheet;
            for (let i = 0; i < sheet.cssRules.length; i++) {
                if (sheet.cssRules[i] == this.ruleCache[calendar.id][0] ||
                    sheet.cssRules[i] == this.ruleCache[calendar.id][1]) {
                    this.sheet.deleteRule(i);
                }
            }
            delete this.ruleCache[calendar.id];

            this.sortOrderChanged();
        }

        /**
         * Remove all calendars from the tree.
         */
        clear() {
            this.tree.beginUpdateBatch();
            try {
                this.mCalendarList.forEach(this.removeCalendar, this);
            } finally {
                this.tree.endUpdateBatch();
            }
        }

        /**
         * Update a calendar's tree row (to refresh the color and such).
         *
         * @param {calICalendar} calendar    The calendar object to update.
         */
        updateCalendar(calendar) {
            if (this.tree) {
                this.tree.invalidateRow(this.findIndexById(calendar.id));
            }
        }

        /**
         * Update the color of a calendar in the tree (when its color has changed).
         *
         * @param {calICalendar} calendar    The calendar object to receive a color update.
         */
        updateCalendarColor(calendar) {
            const color = calendar.getProperty("color") || "#a8c2e1";
            const sheet = this.sheet;
            if (!(calendar.id in this.ruleCache)) {
                const ruleString = ".calendar-list-tree > treechildren" +
                    "::-moz-tree-cell(color-treecol, id-" +
                    calendar.id + ") {}";

                const disabledRuleString = ".calendar-list-tree > treechildren" +
                    "::-moz-tree-cell(color-treecol, id-" +
                    calendar.id + ", disabled) {}";

                try {
                    const ruleIndex = sheet.insertRule(ruleString, sheet.cssRules.length);
                    const disabledIndex = sheet.insertRule(disabledRuleString, sheet.cssRules.length);
                    this.ruleCache[calendar.id] = [sheet.cssRules[ruleIndex], sheet.cssRules[disabledIndex]];
                } catch (ex) {
                    sheet.ownerNode.addEventListener("load",
                        () => this.updateCalendarColor(calendar), { once: true });
                    return;
                }
            }

            const [enabledRule, disabledRule] = this.ruleCache[calendar.id];
            enabledRule.style.backgroundColor = color;

            const colorMatch = color.match(/#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})?/);
            if (colorMatch && this.disabledState == "disabled") {
                const gray = (
                    0.2126 * parseInt(colorMatch[1], 16) +
                    0.7152 * parseInt(colorMatch[2], 16) +
                    0.0722 * parseInt(colorMatch[3], 16)
                );
                const alpha = colorMatch[4] ? parseInt(colorMatch[4], 16) : 255;
                disabledRule.style.backgroundColor = `rgba(${gray}, ${gray}, ${gray}, ${alpha})`;
            } else {
                disabledRule.style.backgroundColor = color;
            }
        }

        /**
         * Get a calendar asoociated with an event. If a row or column is passed as an argument,
         * then it may be updated to the row and column derived from the event.
         *
         * @param {Event} event     An event.
         * @param {Object} [col]    A column.
         * @param {Object} [row]    A row.
         * @return                  A calendar.
         */
        getCalendarFromEvent(event, col = {}, row = {}) {
            if (event.clientX && event.clientY) {
                // If we have a client point, get the row directly from the client point.

                const { col: cellCol, row: cellRow } = this.tree
                    .getCellAt(event.clientX, event.clientY);

                col.value = cellCol;
                row.value = cellRow;
            } else if (document.popupNode && document.popupNode.contextCalendar) {
                // Otherwise, we can try to get the context calendar from the popupNode.
                return document.popupNode.contextCalendar;
            }
            return row && row.value > -1 && this.mCalendarList[row.value];
        }

        /**
         * Return a calendar for the given index.
         *
         * @param {number} index    An index.
         * @return                  A calendar.
         */
        getCalendar(index) {
            const validIndex = Math.max(0, Math.min(this.mCalendarList.length - 1, index));
            return this.mCalendarList[validIndex];
        }

        // nsITreeView Methods and Related Methods

        getCellProperties(row, col) {
            try {
                const rowProps = this.getRowProperties(row);
                const colProps = this.getColumnProperties(col);
                return rowProps + (rowProps && colProps ? " " : "") + colProps;
            } catch (e) {
                // It seems errors in these functions are not shown, do this explicitly.
                cal.ERROR("Error getting cell props: " + e);
                return "";
            }
        }

        getRowProperties(row) {
            const properties = [];
            const calendar = this.getCalendar(row);
            const composite = this.compositeCalendar;

            // Set up the calendar id.
            properties.push("id-" + calendar.id);

            // Get the calendar color.
            const color = (calendar.getProperty("color") || "").substr(1);

            // Set up the calendar color (background).
            properties.push("color-" + (color || "default"));

            // Set a property to get the contrasting text color (foreground).
            properties.push(cal.view.getContrastingTextColor(color || "a8c2e1"));

            const currentStatus = calendar.getProperty("currentStatus");
            if (!Components.isSuccessCode(currentStatus)) {
                // 'readfailed' is supposed to "win" over 'readonly', meaning that
                // if reading from a calendar fails there is no further need to also display
                // information about 'readonly' status.
                properties.push("readfailed");
            } else if (calendar.readOnly) {
                properties.push("readonly");
            }

            // Set up the composite calendar status and disabled state.
            const isDisabled = calendar.getProperty("disabled");

            const disabledState = !isDisabled || (isDisabled && this.disabledState == "ignore")
                ? "enabled"
                : "disabled";

            let checkedState = composite.getCalendarById(calendar.id) ? "checked" : "unchecked";

            if (isDisabled && this.disabledState == "checked") {
                checkedState = "checked";
            } else if (isDisabled) {
                checkedState = "unchecked";
            }

            properties.push(disabledState, checkedState);

            return properties.join(" ");
        }

        getColumnProperties(col) {
            return col.element.getAttribute("type");
        }

        isContainer(row) {
            return false;
        }

        isContainerOpen(row) {
            return false;
        }

        isContainerEmpty(row) {
            return false;
        }

        isSeparator(row) {
            return false;
        }

        isSorted(row) {
            return false;
        }

        canDrop(row, orientation) {
            const dragSession = cal.getDragService().getCurrentSession();
            const dataTransfer = dragSession && dragSession.dataTransfer;
            if (!this.allowDrag || !dataTransfer) {
                // If dragging is not allowed or there is no data transfer then
                // we can't drop (i.e dropping a file on the calendar list).
                return false;
            }

            const dragCalId = dataTransfer.getData("application/x-moz-calendarID");

            return (orientation != Ci.nsITreeView.DROP_ON && dragCalId != null);
        }

        drop(row, orientation) {
            const dragSession = cal.getDragService().getCurrentSession();
            const dataTransfer = dragSession.dataTransfer;
            const dragCalId = dataTransfer && dataTransfer.getData("application/x-moz-calendarID");
            if (!this.allowDrag || !dataTransfer || !dragCalId) {
                return false;
            }

            const oldIndex = this.mCalendarList.findIndex(calendar => calendar.id == dragCalId);

            if (oldIndex < 0) {
                return false;
            }

            // If no row is specified (-1), then assume append.
            const validRow = (row < 0 ? this.mCalendarList.length - 1 : row);
            const targetIndex = validRow + Math.max(0, orientation);

            // We don't need to move if the target row has the same index as the old
            // row. The same goes for dropping after the row before the old row or
            // before the row after the old row. Think about it :-)
            if (row != oldIndex && validRow + orientation != oldIndex) {
                // Add the new one, remove the old one.
                this.mCalendarList.splice(targetIndex, 0, this.mCalendarList[oldIndex]);
                this.mCalendarList.splice(oldIndex + (oldIndex > targetIndex ? 1 : 0), 1);

                // Invalidate the tree rows between the old item and the new one.
                if (oldIndex < targetIndex) {
                    this.tree.invalidateRange(oldIndex, targetIndex);
                } else {
                    this.tree.invalidateRange(targetIndex, oldIndex);
                }

                // Fire event.
                this.sortOrderChanged();
            }
            return true;
        }

        foreignDrop(event) {
            const hasDropped = event.clientY < this.tree.getBoundingClientRect().y
                ? this.drop(this.tree.getFirstVisibleRow(), -1)
                : this.drop(this.tree.getLastVisibleRow(), 1);

            if (hasDropped) {
                event.preventDefault();
            }
            return hasDropped;
        }

        foreignCanDrop(event) {
            // The dragenter/dragover events expect false to be returned when
            // dropping is allowed, therefore we return !canDrop.
            if (event.clientY < this.tree.getBoundingClientRect().y) {
                return !this.canDrop(this.tree.getFirstVisibleRow(), -1);
            } else {
                return !this.canDrop(this.tree.getLastVisibleRow(), 1);
            }
        }

        getParentIndex(row) {
            return -1;
        }

        hasNextSibling(row, afterIndex) {}

        getLevel(row) {
            return 0;
        }

        getImageSrc(row) {}

        getCellValue(row, col) {
            const calendar = this.getCalendar(row);
            const composite = this.compositeCalendar;

            switch (col.element.getAttribute("type")) {
                case "checkbox-treecol":
                    return composite.getCalendarById(calendar.id) ? "true" : "false";
                case "status-treecol":
                    // The value of this cell shows the calendar readonly state.
                    return (calendar.readOnly ? "true" : "false");
            }
            return null;
        }

        getCellText(row, col) {
            switch (col.element.getAttribute("type")) {
                case "calendarname-treecol":
                    return this.getCalendar(row).name;
            }
            return "";
        }

        /**
         * Called to link the tree to the tree view. A null argument un-sets/un-links the tree.
         * Performs initial load of calendars if needed and if possible.
         *
         * @param {?CalendarListTree} tree    A tree or null.
         */
        setTree(tree) {
            this.tree = tree;

            if (tree && this.mCompositeCalendar && !this.calendarsAreLoaded) {
                this.loadCalendars();
            }
        }

        toggleOpenState(row) {}

        cycleHeader(col) {}

        cycleCell(row, col) {
            const calendar = this.getCalendar(row);
            if (this.disabledState != "ignore" && calendar.getProperty("disabled")) {
                return;
            }

            if (this.mCycleCalendarFlag[calendar.id]) {
                delete this.mCycleCalendarFlag[calendar.id];
            } else {
                this.mCycleCalendarFlag[calendar.id] = [calendar, row];
            }

            if (this.cycleDebounce) {
                if (this.mCycleTimer) {
                    clearTimeout(this.mCycleTimer);
                }
                this.mCycleTimer = setTimeout(this.cycleCellCommit.bind(this), 200);
            } else {
                this.cycleCellCommit();
            }
        }

        cycleCellCommit() {
            const composite = this.compositeCalendar;
            this.tree.beginUpdateBatch();
            composite.startBatch();
            try {
                Object.entries(this.mCycleCalendarFlag).forEach(([id, [calendar, row]]) => {
                    if (composite.getCalendarById(id)) {
                        composite.removeCalendar(calendar);
                    } else {
                        composite.addCalendar(calendar);
                    }
                    this.tree.invalidateRow(row);
                });
                this.mCycleCalendarFlag = {};
            } finally {
                composite.endBatch();
                this.tree.endUpdateBatch();
            }
        }

        isEditable(row, col) {
            return false;
        }

        setCellValue(row, col, value) {
            const calendar = this.getCalendar(row);
            const composite = this.compositeCalendar;

            switch (col.element.getAttribute("type")) {
                case "checkbox-treecol":
                    if (value == "true") {
                        composite.addCalendar(calendar);
                    } else {
                        composite.removeCalendar(calendar);
                    }
                    break;
                default:
                    return null;
            }
            return value;
        }

        setCellText(row, col, value) {}

        performAction(action) {}

        performActionOnRow(action, row) {}

        performActionOnCell(action, row, col) {}

        // End nsITreeView Methods

        disconnectedCallback() {
            // Clean up the calendar manager observers. Do not use removeCalendar
            // here since that will remove the calendar from the composite calendar.
            for (const calendar of this.mCalendarList) {
                calendar.removeObserver(this.calObserver);
            }

            this.tree.view = null;
            this.calObserver.listTree = null;

            if (this.mCompositeCalendar) {
                this.mCompositeCalendar.removeObserver(this.compositeObserver);
            }
        }
    }

    MozXULElement.implementCustomInterface(CalendarListTree, [Ci.nsITreeView]);

    customElements.define("calendar-list-tree", CalendarListTree, { "extends": "tree" });


    /**
     * Implements a fully functional calendar list. For example, one that automatically adds and
     * removes calendars when a calendar is registered or unregistered. Typically used for the
     * main list of calendars in the sidebar on the left in the calendar and tasks views.
     *
     * @extends CalendarListTree
     * @implements nsITreeView
     */
    class CalendarListTreeFull extends CalendarListTree {
        connectedCallback() {
            if (this.delayConnectedCallback() || this.hasConnected) {
                return;
            }
            // this.hasConnected is set to true in super.connectedCallback.
            super.connectedCallback();

            this.mAddingFromComposite = false;

            /**
             * Calendar manager observer.
             *
             * @implements calICalendarManagerObserver
             */
            this.calMgrObserver = {
                listTree: this,
                QueryInterface: ChromeUtils.generateQI([Ci.calICalendarManagerObserver]),

                // calICalendarManagerObserver Methods

                onCalendarRegistered(calendar) {
                    this.listTree.addCalendar(calendar);
                    const composite = this.listTree.compositeCalendar;
                    const inComposite = calendar.getProperty(composite.prefPrefix +
                        "-in-composite");

                    if ((inComposite === null) || inComposite) {
                        composite.addCalendar(calendar);
                    }
                },

                onCalendarUnregistering(calendar) {
                    this.listTree.removeCalendar(calendar);
                },

                onCalendarDeleting(calendar) {
                    // Now that the calendar is unregistered, update the commands to make sure that
                    // New Event/Task commands are correctly enabled/disabled.
                    document.commandDispatcher.updateCommands("calendar_commands");
                }
            };

            /**
             * Composite calendar observer.
             *
             * @implements nsICompositeObserver
             * @implements calIObserver
             */
            this.compositeObserver = {
                listTree: this,
                QueryInterface: cal.generateQI([Ci.calICompositeObserver, Ci.calIObserver]),

                // calICompositeObserver Methods

                onCalendarAdded(calendar) {
                    // Make sure the checkbox state is updated.
                    this.listTree.updateCalendar(calendar);
                },

                onCalendarRemoved(calendar) {
                    // Make sure the checkbox state is updated.
                    this.listTree.updateCalendar(calendar);
                },

                onDefaultCalendarChanged(calendar) {},

                // calIObserver Methods

                onStartBatch() {},
                onEndBatch() {},
                onLoad() {},

                onAddItem(item) {
                    if (item.calendar.type != "caldav") {
                        this.listTree.ensureCalendarVisible(item.calendar);
                    }
                },
                onModifyItem(newItem, oldItem) {
                    if (newItem.calendar.type != "caldav") {
                        this.listTree.ensureCalendarVisible(newItem.calendar);
                    }
                },
                onDeleteItem(deletedItem) {},
                onError(calendar, errNo, message) {},

                onPropertyChanged(calendar, name, value, oldValue) {
                    switch (name) {
                        case "disabled":
                        case "readOnly":
                            calendarUpdateNewItemsCommand();
                            document.commandDispatcher.updateCommands("calendar_commands");
                            break;
                    }
                },

                onPropertyDeleting(calendar, name) {}
            };

            const calMgr = cal.getCalendarManager();
            calMgr.addObserver(this.calMgrObserver);

            /**
             * A double click on a calendar row opens a dialog to edit the calendar. (Unless it is
             * on the checkbox column.) A double click elsewhere opens a dialog to create a new
             * calendar.
             */
            this.addEventListener("dblclick", (event) => {
                const col = {};
                const calendar = this.getCalendarFromEvent(event, col);

                // Return early if it is not a left click or a click on the checkbox column.
                if (event.button != 0 ||
                    (col.value && col.value.element &&
                    col.value.element.getAttribute("type") == "checkbox-treecol")) {
                    return;
                }

                if (calendar) {
                    cal.window.openCalendarProperties(window, calendar);
                } else {
                    cal.window.openCalendarWizard(window);
                }
            });

            this.dispatchEvent(new CustomEvent("bindingattached", { bubbles: false }));
        }

        set compositeCalendar(val) {
            this.mCompositeCalendar = val;
            this.mCompositeCalendar.addObserver(this.compositeObserver);

            // Now that we have a composite calendar, we can get all calendars
            // from the calendar manager.

            if (this.tree && !this.calendarsAreLoaded) {
                this.loadCalendars();
            }
            return val;
        }

        get compositeCalendar() {
            if (!this.mCompositeCalendar) {
                throw Components.Exception("Calendar list has no composite calendar yet",
                    Cr.NS_ERROR_NOT_INITIALIZED);
            }
            return this.mCompositeCalendar;
        }

        set calendars(val) {
            // Setting calendars externally is not wanted. This is done internally
            // in the compositeCalendar setter.
            throw Components.Exception(
                "Setting calendars on calendar-list-tree-full is not supported",
                Cr.NS_ERROR_NOT_IMPLEMENTED);
        }

        get calendars() {
            return this.mCalendarList;
        }

        disconnectedCallback() {
            super.disconnectedCallback();

            const calMgr = cal.getCalendarManager();
            calMgr.removeObserver(this.calMgrObserver);
            this.calMgrObserver.listTree = null;
        }
    }

    customElements.define("calendar-list-tree-full", CalendarListTreeFull, { "extends": "tree" });
}
