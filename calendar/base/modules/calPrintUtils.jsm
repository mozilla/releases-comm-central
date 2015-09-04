/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://calendar/modules/calUtils.jsm");
Components.utils.import("resource://gre/modules/Preferences.jsm");
Components.utils.import("resource://calendar/modules/calViewUtils.jsm");

this.EXPORTED_SYMBOLS = ["cal"]; // even though it's defined in calUtils.jsm, import needs this
cal.print = {
    /**
     * Returns a simple key in the format YYYY-MM-DD for use in the table of
     * dates to day boxes
     *
     * @param dt    The date to translate
     * @return      YYYY-MM-DD
     */
    getDateKey: function getDateKey(dt) {
        return dt.year + "-" + dt.month + "-" + dt.day;
    },

    /**
     * Add category styles to the document's "sheet" element. This is needed
     * since the HTML created is serialized, so we can't dynamically set the
     * styles and can be changed if the print formatter decides to return a
     * DOM document instead.
     *
     * @param document      The document that contains <style id="sheet"/>.
     * @param categories    Array of categories to insert rules for.
     */
    insertCategoryRules: function insertCategoryRules(document, categories) {
        let sheet = document.getElementById("sheet");
        sheet.insertedCategoryRules = sheet.insertedCategoryRules || {};

        for each (let category in categories) {
            let prefName = cal.formatStringForCSSRule(category);
            let color = Preferences.get("calendar.category.color." + prefName) || "transparent";
            if (!(prefName in sheet.insertedCategoryRules)) {
                sheet.insertedCategoryRules[prefName] = true;
                let ruleAdd = ' .category-color-box[categories~="' + prefName + '"] { ' +
                              ' border: 2px solid ' + color + '; }' + "\n";
                sheet.textContent += ruleAdd;
            }
        }
    },

    /**
     * Add calendar styles to the document's "sheet" element. This is needed
     * since the HTML created is serialized, so we can't dynamically set the
     * styles and can be changed if the print formatter decides to return a
     * DOM document instead.
     *
     * @param document      The document that contains <style id="sheet"/>.
     * @param categories    The calendar to insert a rule for.
     */
    insertCalendarRules: function insertCalendarRules(document, calendar) {
        let sheet = document.getElementById("sheet");
        let color = calendar.getProperty("color") || "#A8C2E1";
        sheet.insertedCalendarRules = sheet.insertedCalendarRules || {};

        if (!(calendar.id in sheet.insertedCalendarRules)) {
            sheet.insertedCalendarRules[calendar.id] = true;
            let formattedId = cal.formatStringForCSSRule(calendar.id);
            let ruleAdd = ' .calendar-color-box[calendar-id="' + formattedId + '"] { ' +
                          ' background-color: ' + color + '; ' +
                          ' color: ' + cal.getContrastingTextColor(color) + '; }' + "\n";
            sheet.textContent += ruleAdd;
        }
    },

    /**
     * Serializes the given item by setting marked nodes to the item's content.
     * Has some expectations about the DOM document (in CSS-selector-speak), all
     * following nodes MUST exist.
     *
     * - #item-template will be cloned and filled, and modified:
     *   - .item-interval gets the time interval of the item.
     *   - .item-title gets the item title
     *   - .category-color-box gets a 2px solid border in category color
     *   - .calendar-color-box gets background color of the calendar
     *
     * @param document          The DOM Document to set things on
     * @param item              The item to serialize
     * @param dayContainer      The DOM Node to insert the container in
     */
    addItemToDaybox: function addItemToDaybox(document, item, boxDate, dayContainer) {
        // Clone our template
        let itemNode = document.getElementById("item-template").cloneNode(true);
        itemNode.removeAttribute("id");
        itemNode.item = item;

        // Fill in details of the item
        let itemInterval = cal.print.getItemIntervalString(item, boxDate);
        itemNode.querySelector(".item-interval").textContent = itemInterval;
        itemNode.querySelector(".item-title").textContent = item.title;

        // Fill in category details
        let categoriesArray = item.getCategories({});
        if (categoriesArray.length > 0) {
            let cssClassesArray = categoriesArray.map(cal.formatStringForCSSRule);
            itemNode.querySelector(".category-color-box")
                    .setAttribute("categories", cssClassesArray.join(" "));

            cal.print.insertCategoryRules(document, categoriesArray);
        }

        // Fill in calendar color
        itemNode.querySelector(".calendar-color-box")
                .setAttribute("calendar-id", cal.formatStringForCSSRule(item.calendar.id));
        cal.print.insertCalendarRules(document, item.calendar);

        // Add it to the day container in the right order
        cal.binaryInsertNode(dayContainer, itemNode, item, cal.view.compareItems);
    },

    /**
     * Serializes the given item by setting marked nodes to the item's
     * content. Should be used for tasks with no start and due date. Has
     * some expectations about the DOM document (in CSS-selector-speak),
     * all following nodes MUST exist.
     *
     * - Nodes will be added to #task-container.
     * - #task-list-box will have the "hidden" attribute removed.
     * - #task-template will be cloned and filled, and modified:
     *   - .task-checkbox gets the "checked" attribute set, if completed
     *   - .task-title gets the item title.
     *
     * @param document          The DOM Document to set things on
     * @param item              The item to serialize
     */
    addItemToDayboxNodate: function addItemToDayboxNodate(document, item) {
        let taskContainer = document.getElementById("task-container");
        let taskNode = document.getElementById("task-template").cloneNode(true);
        taskNode.removeAttribute("id");
        taskNode.item = item;

        let taskListBox = document.getElementById("tasks-list-box");
        if (taskListBox.hasAttribute("hidden")) {
            let tasksTitle = document.getElementById("tasks-title");
            taskListBox.removeAttribute("hidden");
            tasksTitle.textContent = cal.calGetString("calendar","tasksWithNoDueDate");
        }

        // Fill in details of the task
        if (item.isCompleted) {
            taskNode.querySelector(".task-checkbox").setAttribute("checked", "checked");
        }

        taskNode.querySelector(".task-title").textContent = item.title;

        let collator = cal.createLocaleCollator();
        cal.binaryInsertNode(taskContainer, taskNode, item, (a, b) => collator.compareString(0, a, b), node => node.item.title);
    },

    /**
     * Get time interval string for the given item. Returns an empty string for all-day items.
     *
     * @param aItem     The item providing the interval
     * @return          The string describing the interval
     */
    getItemIntervalString: function getItemIntervalString(aItem, aBoxDate) {
        // omit time label for all-day items
        let startDate = aItem[cal.calGetStartDateProp(aItem)];
        let endDate = aItem[cal.calGetEndDateProp(aItem)];
        if ((startDate && startDate.isDate) || (endDate && endDate.isDate)) {
            return "";
        }

        // check for tasks without start and/or due date
        if (!startDate || !endDate) {
            return cal.getDateFormatter().formatItemTimeInterval(aItem);
        }

        let dateFormatter = cal.getDateFormatter();
        let defaultTimezone = cal.calendarDefaultTimezone();
        let start = startDate.getInTimezone(defaultTimezone).clone();
        let end = endDate.getInTimezone(defaultTimezone).clone();
        start.isDate = true;
        end.isDate = true;
        if (start.compare(end) == 0) {
            // Events that start and end in the same day.
            return dateFormatter.formatTimeInterval(startDate, endDate);
        } else {
            // Events that span two or more days.
            let compareStart = aBoxDate.compare(start);
            let compareEnd = aBoxDate.compare(end);
            if (compareStart == 0)
                return "\u21e4 " + dateFormatter.formatTime(startDate); // unicode '⇤'
            else if (compareStart > 0 && compareEnd < 0)
                return "\u21ff";                                        // unicode '↔'
            else if (compareEnd == 0)
                return "\u21e5 " + dateFormatter.formatTime(endDate);   // unicode '⇥'
            else
                return "";
        }
    }
}
