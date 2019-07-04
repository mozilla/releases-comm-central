/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals currentView MozElements MozXULElement */

/* import-globals-from calendar-ui-utils.js */

"use strict";

// Wrap in a block to prevent leaking to window scope.
{
    const { cal } = ChromeUtils.import("resource://calendar/modules/calUtils.jsm");

    /**
     * Implements the Drag and Drop class for the Calendar Header Container.
     *
     * @extends {MozElements.CalendarDnDContainer}
     */
    class CalendarHeaderContainer extends MozElements.CalendarDnDContainer {
        static get inheritedAttributes() {
            return { ".calendar-event-column-header": "selected" };
        }

        constructor() {
            super();
            this.addEventListener("dblclick", this.onDblClick);
            this.addEventListener("mousedown", this.onMouseDown);
            this.addEventListener("click", this.onClick);
            this.addEventListener("wheel", this.onWheel);
        }

        connectedCallback() {
            if (this.delayConnectedCallback() || this.hasConnected) {
                return;
            }
            // this.hasConnected is set to true in super.connectedCallback.
            super.connectedCallback();

            this.mItemBoxes = [];

            this.setAttribute("flex", "1");
            this.classList.add("calendar-event-column-header");
            this.initializeAttributeInheritance();
        }

        get date() {
            return this.mDate;
        }

        set date(val) {
            this.mDate = val;
            return val;
        }

        findBoxForItem(aItem) {
            for (let item of this.mItemBoxes) {
                if (aItem && item.occurrence.hasSameIds(aItem)) {
                    // We can return directly, since there will only be one box per
                    // item in the header.
                    return item;
                }
            }
            return null;
        }

        addEvent(aItem) {
            // Prevent same items being added.
            if (this.mItemBoxes.some(itemBox => itemBox.occurrence.hashId == aItem.hashId)) {
                return;
            }

            let itemBox = document.createXULElement("calendar-editable-item");
            this.appendChild(itemBox);
            itemBox.calendarView = this.calendarView;
            itemBox.occurrence = aItem;
            let ctxt = this.calendarView.getAttribute("item-context") ||
                this.calendarView.getAttribute("context");
            itemBox.setAttribute("context", ctxt);

            if (aItem.hashId in this.calendarView.mFlashingEvents) {
                itemBox.setAttribute("flashing", "true");
            }

            this.mItemBoxes.push(itemBox);
            itemBox.parentBox = this;
        }

        deleteEvent(aItem) {
            for (let i in this.mItemBoxes) {
                if (this.mItemBoxes[i].occurrence.hashId == aItem.hashId) {
                    this.mItemBoxes[i].remove();
                    this.mItemBoxes.splice(i, 1);
                    break;
                }
            }
        }

        onDropItem(aItem) {
            let newItem = cal.item.moveToDate(aItem, this.mDate);
            newItem = cal.item.setToAllDay(newItem, true);
            return newItem;
        }

        selectOccurrence(aItem) {
            for (let itemBox of this.mItemBoxes) {
                if (aItem && (itemBox.occurrence.hashId == aItem.hashId)) {
                    itemBox.selected = true;
                }
            }
        }

        unselectOccurrence(aItem) {
            for (let itemBox of this.mItemBoxes) {
                if (aItem && (itemBox.occurrence.hashId == aItem.hashId)) {
                    itemBox.selected = false;
                }
            }
        }

        onDblClick(event) {
            if (event.button == 0) {
                this.calendarView.controller.createNewEvent(null, this.mDate, null, true);
            }
        }

        onMouseDown(event) {
            this.calendarView.selectedDay = this.mDate;
        }

        onClick(event) {
            if (event.button == 0) {
                if (!(event.ctrlKey || event.metaKey)) {
                    this.calendarView.setSelectedItems(0, []);
                }
            }
            if (event.button == 2) {
                let newStart = this.calendarView.selectedDay.clone();
                newStart.isDate = true;
                this.calendarView.selectedDateTime = newStart;
                event.stopPropagation();
            }
        }

        onWheel(event) {
            if (this.getAttribute("orient") == "vertical") {
                // In vertical view (normal), don't let the parent multiday view
                // handle the scrolling in its bubbling phase. The default action
                // will make the box scroll here.
                event.stopPropagation();
            }
        }
    }
    customElements.define("calendar-header-container", CalendarHeaderContainer);
}
