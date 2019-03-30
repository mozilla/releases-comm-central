/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global MozElements, Services */

/**
 * MozCalendarEventFreebusyTimebar is a widget showing the time slot labels - dates and a number of
 * times instances of each date. It is typically used in combination with a grid showing free and
 * busy times for attendees going to an event, as used in the Invite Attendees dialog.
 *
 * @extends {MozElements.RichListBox}
 */
class MozCalendarEventFreebusyTimebar extends MozElements.RichListBox {
    constructor() {
        super();

        this.mNumDays = 0;
        this.mRange = 0;
        this.mStartDate = null;
        this.mEndDate = null;
        this.mDayOffset = 0;
        this.mScrollOffset = 0;
        this.mStartHour = 0;
        this.mEndHour = 24;
        this.mForce24Hours = false;
        this.mZoomFactor = 100;
    }

    /**
     * Sets mZoomFactor to a new value, clears freebusy-day's children, and updates zoomFactor and
     * force24Hours properties of freebusy-day element.
     *
     * @param {Number} val       new mZoomFactor value
     * @returns {Number}         new mZoomFactor value
     */
    set zoomFactor(val) {
        this.mZoomFactor = val;

        let template = this.getElementsByTagName("freebusy-day")[0];
        let parent = template.parentNode;
        while (parent.childNodes.length > 1) {
            parent.lastChild.remove();
        }

        template.force24Hours = this.mForce24Hours;
        template.zoomFactor = this.mZoomFactor;

        return val;
    }

    /**
     * @returns {Number}       mZoomFactor value
     */
    get zoomFactor() {
        return this.mZoomFactor;
    }

    /**
     * Sets mForce24Hours to a new value, updates startHour and endHour properties, clears
     * freebusy-day's children, and updates zoomFactor and force24Hours properties of freebusy-day
     * element.
     *
     * @param {Boolean} val       new mForce24Hours value
     * @returns {Boolean}         new mForce24Hours value
     */
    set force24Hours(val) {
        this.mForce24Hours = val;
        this.initTimeRange();

        let template = this.getElementsByTagName("freebusy-day")[0];

        let parent = template.parentNode;
        while (parent.childNodes.length > 1) {
            parent.lastChild.remove();
        }

        template.force24Hours = this.mForce24Hours;
        template.zoomFactor = this.mZoomFactor;

        return val;
    }

    /**
     * @returns {Boolean}       mForce24Hours value
     */
    get force24Hours() {
        return this.mForce24Hours;
    }

    /**
     * @returns {Number}       The difference between the first two day-elements
     */
    get contentWidth() {
        let template = this.getElementsByTagName("freebusy-day")[0];
        return template.nextSibling.boxObject.x - template.boxObject.x;
    }

    /**
     * @returns {Number}       Parent node's width
     */
    get containerWidth() {
        return this.parentNode.boxObject.width;
    }

    /**
     * Sets mStartDate to a new value and make it immutable.
     *
     * @param {calDateTime} val       new mStartDate value
     * @returns {calDateTime}         new mStartDate value
     */
    set startDate(val) {
        this.mStartDate = val.clone();
        this.mStartDate.makeImmutable();
        return val;
    }

    /**
     * @returns {calDateTime}       mStartDate value
     */
    get startDate() {
        return this.mStartDate;
    }

    /**
     * Sets mEndDate to a new value and make it immutable.
     *
     * @param {calDateTime} val       new mEndDate value
     * @returns {calDateTime}         new mEndDate value
     */
    set endDate(val) {
        this.mEndDate = val.clone();
        this.mEndDate.makeImmutable();
        return val;
    }

    /**
     * @returns {calDateTime}       mEndDate value
     */
    get endDate() {
        return this.mEndDate;
    }

    /**
     * Sets mDayOffset to a new value and adjust scroll-container children according to it.
     *
     * @param {Number} val       new mDayOffset value
     * @returns {Number}         new mDayOffset value
     */
    set dayOffset(val) {
        this.mDayOffset = val;
        let container = this.getElementsByTagName("scroll-container")[0];
        let date = this.mStartDate.clone();
        date.day += val;
        let numChilds = container.childNodes.length;
        for (let i = 0; i < numChilds; i++) {
            let child = container.childNodes[i];
            child.date = date;
            date.day++;
        }
        return val;
    }

    /**
     * @returns {Number}       The scale of the total shift needed to step one block further
     */
    get step() {
        // How much pixels spans a single day
        let oneday = this.contentWidth;

        // The difference in pixels between the content and the container.
        let shift = (oneday * this.mRange) - (this.containerWidth);

        // What we want to know is the scale of the total shift needed to step one block further.
        // Since the content is divided into 'numHours' equal parts, we can simply state:
        let numHours = this.mEndHour - this.mStartHour;
        return (this.contentWidth) / (numHours * shift);
    }

    /**
     * Sets mScrollOffset value.
     *
     * @param {Number} val       new mScrollOffset value
     * @returns {Number}         new mScrollOffset value
     */
    set scroll(val) {
        this.mScrollOffset = val;

        // How much pixels spans a single day
        let oneday = this.contentWidth;

        // The difference in pixels between the content and the container.
        let shift = (oneday * this.mRange) - (this.containerWidth);

        // Now calculate the (positive) offset in pixels which the content needs to be shifted.
        // This is a simple scaling in one dimension.
        let offset = Math.floor(val * shift);

        // Now find out how much days this offset effectively skips. This is a simple division which
        // always yields a positive integer value.
        this.dayOffset = (offset - (offset % oneday)) / oneday;

        // Set the pixel offset for the content which will always need to be in the range
        // [0 <= offset <= oneday].
        offset %= oneday;

        // Set the offset at the content node.
        let container = this.getElementsByTagName("scroll-container")[0];
        container.x = offset;
        return val;
    }

    /**
     * @returns {Number}       mScrollOffset value.
     */
    get scroll() {
        return this.mScrollOffset;
    }

    /**
     * Refreshes scroll-container's children. scroll-container contains date and time labels with
     * regular interval gap.
     */
    refresh() {
        let date = this.mStartDate.clone();
        let template = this.getElementsByTagName("freebusy-day")[0];
        let parent = template.parentNode;
        for (let child of parent.childNodes) {
            child.startDate = this.mStartDate;
            child.endDate = this.mEndDate;
            child.date = date;
            date.day++;
        }
        let offset = this.mDayOffset;
        this.dayOffset = offset;
    }

    /**
     * Dispatches timebar event which has details and height property, used for initializing
     * selection-bar.
     */
    dispatchTimebarEvent() {
        let template = this.getElementsByTagName("freebusy-day")[0];
        let event = document.createEvent("Events");
        event.initEvent("timebar", true, false);
        event.details = this.contentWidth;
        event.height = template.dayHeight;
        this.dispatchEvent(event);
    }

    /**
     * Updates mEndHour and mStartHour values.
     */
    initTimeRange() {
        if (this.force24Hours) {
            this.mStartHour = 0;
            this.mEndHour = 24;
        } else {
            this.mStartHour = Services.prefs.getIntPref("calendar.view.daystarthour", 8);
            this.mEndHour = Services.prefs.getIntPref("calendar.view.dayendhour", 19);
        }
    }
}

customElements.define("calendar-event-freebusy-timebar", MozCalendarEventFreebusyTimebar);
