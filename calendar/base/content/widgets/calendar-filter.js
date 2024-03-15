/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../calendar-views-utils.js */

/* exported CalendarFilteredViewMixin */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { CalReadableStreamFactory } = ChromeUtils.import(
  "resource:///modules/CalReadableStreamFactory.jsm"
);

/**
 * Object that contains a set of filter properties that may be used by a calFilter object
 * to filter a set of items.
 * Supported filter properties:
 *   start, end:   Specifies the relative date range to use when calculating the filter date
 *               range. The relative date range may relative to the current date and time, the
 *               currently selected date, or the dates range of the current view. The actual
 *               date range used to filter items will be calculated by the calFilter object
 *               by using the updateFilterDates function, which may be called multiple times
 *               to reflect changes in the current date and time, and changes to the view.
 *
 *
 *                 The properties may be set to one of the following values:
 *               - FILTER_DATE_ALL: An unbound date range.
 *               - FILTER_DATE_XXX: One of the defined relative date ranges.
 *               - A string that may be converted to a calIDuration object that will be used
 *                 as an offset to the current date and time.
 *
 *                 The start and end properties may have values representing different relative
 *               date ranges, in which case the filter start date will be calculated as the start
 *               of the relative range specified by the start property, while the filter end date
 *               will be calculated as the end of the relative range specified by the end
 *               property.
 *
 *   due:          Specifies the filter property for the due date of tasks. This filter has no
 *               effect when filtering events.
 *
 *                 The property has a bit field value, with the FILTER_DUE_XXX bit flags set
 *               to indicate that tasks with the corresponding due property value should match
 *               the filter.
 *
 *                 If the value is set to null the due date will not be considered when filtering.
 *
 *   status:       Specifies the filter property for the status of tasks. This filter has no
 *               effect when filtering events.
 *
 *                 The property has a bit field value, with the FILTER_STATUS_XXX bit flags set
 *               to indicate that tasks with the corresponding status property value should match
 *               the filter.
 *
 *                 If the value is set to null the status will not be considered when filtering.
 *
 *   category:     Specifies the filter property for the item category.
 *
 *                 The property may be set to one of the following values:
 *               - null: The item category will not be considered when filtering.
 *               - A string: The item will match the filter if any of it's categories match the
 *               category specified by the property.
 *               - An array: The item will match the filter if any of it's categories match any
 *               of the categories contained in the Array specified by the property.
 *
 *   occurrences:  Specifies the filter property for returning occurrences of repeating items.
 *
 *                 The property may be set to one of the following values:
 *               - null, FILTER_OCCURRENCES_BOUND: The default occurrence handling. Occurrences
 *               will be returned only for date ranges with a bound end date.
 *               - FILTER_OCCURRENCES_NONE: Only the parent items will be returned.
 *               - FILTER_OCCURRENCES_PAST_AND_NEXT: Returns past occurrences and the next future
 *               matching occurrence if one is found.
 *
 *   onfilter:     A callback function that may be used to apply additional custom filter
 *               constraints. If specified, the callback function will be called after any other
 *               specified filter properties are tested.
 *
 *                 The callback function will be called with the following parameters:
 *               - function(aItem, aResults, aFilterProperties, aFilter)
 *
 *                   param {calIItemBase} aItem - The item being tested.
 *                   param {number} aResults - The results of the test of the
 *                     other specified filter properties.
 *                   param {calFilterProperties} aFilterProperties - The
 *                     current filter properties being tested.
 *                   param {calFilter} aFilter - The calFilter object
 *                     performing the filter test.
 *
 *                 If specified, the callback function is responsible for returning a value that
 *               can be converted to true if the item should match the filter, or a value that
 *               can be converted to false otherwise. The return value will override the results
 *               of the testing of any other specified filter properties.
 */
function calFilterProperties() {
  this.wrappedJSObject = this;
}

calFilterProperties.prototype = {
  FILTER_DATE_ALL: 0,
  FILTER_DATE_VIEW: 1,
  FILTER_DATE_SELECTED: 2,
  FILTER_DATE_SELECTED_OR_NOW: 3,
  FILTER_DATE_NOW: 4,
  FILTER_DATE_TODAY: 5,
  FILTER_DATE_CURRENT_WEEK: 6,
  FILTER_DATE_CURRENT_MONTH: 7,
  FILTER_DATE_CURRENT_YEAR: 8,

  FILTER_STATUS_INCOMPLETE: 1,
  FILTER_STATUS_IN_PROGRESS: 2,
  FILTER_STATUS_COMPLETED_TODAY: 4,
  FILTER_STATUS_COMPLETED_BEFORE: 8,
  FILTER_STATUS_ALL: 15,

  FILTER_DUE_PAST: 1,
  FILTER_DUE_TODAY: 2,
  FILTER_DUE_FUTURE: 4,
  FILTER_DUE_NONE: 8,
  FILTER_DUE_ALL: 15,

  FILTER_OCCURRENCES_BOUND: 0,
  FILTER_OCCURRENCES_NONE: 1,
  FILTER_OCCURRENCES_PAST_AND_NEXT: 2,

  start: null,
  end: null,
  due: null,
  status: null,
  category: null,
  occurrences: null,

  onfilter: null,

  equals(aFilterProps) {
    if (!(aFilterProps instanceof calFilterProperties)) {
      return false;
    }
    const props = ["start", "end", "due", "status", "category", "occurrences", "onfilter"];
    return props.every(function (prop) {
      return this[prop] == aFilterProps[prop];
    }, this);
  },

  clone() {
    const cloned = new calFilterProperties();
    const props = ["start", "end", "due", "status", "category", "occurrences", "onfilter"];
    props.forEach(function (prop) {
      cloned[prop] = this[prop];
    }, this);

    return cloned;
  },

  LOG(aString) {
    cal.LOG(
      "[calFilterProperties] " +
        (aString || "") +
        " start=" +
        this.start +
        " end=" +
        this.end +
        " status=" +
        this.status +
        " due=" +
        this.due +
        " category=" +
        this.category
    );
  },
};

/**
 * Object that allows filtering of a set of items using a set of filter properties. A set
 * of property filters may be defined by a filter name, which may then be used to apply
 * the defined filter properties. A set of commonly used property filters are predefined.
 */
function calFilter() {
  this.wrappedJSObject = this;
  this.mFilterProperties = new calFilterProperties();
  this.initDefinedFilters();
  this.mMaxIterations = Services.prefs.getIntPref("calendar.filter.maxiterations", 50);
}

calFilter.prototype = {
  mStartDate: null,
  mEndDate: null,
  mItemType: Ci.calICalendar.ITEM_FILTER_TYPE_ALL,
  mSelectedDate: null,
  mFilterText: "",
  mDefinedFilters: {},
  mFilterProperties: null,
  mToday: null,
  mTomorrow: null,
  mMaxIterations: 50,

  /**
   * Initializes the predefined filters.
   */
  initDefinedFilters() {
    const filters = [
      "all",
      "notstarted",
      "overdue",
      "open",
      "completed",
      "throughcurrent",
      "throughtoday",
      "throughsevendays",
      "today",
      "thisCalendarMonth",
      "future",
      "current",
      "currentview",
    ];
    filters.forEach(function (filter) {
      if (!(filter in this.mDefinedFilters)) {
        this.defineFilter(filter, this.getPreDefinedFilterProperties(filter));
      }
    }, this);
  },

  /**
   * Gets the filter properties for a predefined filter.
   *
   * @param {calFilter} aFilter - The name of the filter to retrieve the filter
   *   properties for.
   * @returns {calFilterProperties} The filter properties for the specified
   *   filter, or null if the filter not predefined.
   */
  getPreDefinedFilterProperties(aFilter) {
    const props = new calFilterProperties();

    if (!aFilter) {
      return props;
    }

    switch (aFilter) {
      // Predefined Task filters
      case "notstarted":
        props.status = props.FILTER_STATUS_INCOMPLETE;
        props.due = props.FILTER_DUE_ALL;
        props.start = props.FILTER_DATE_ALL;
        props.end = props.FILTER_DATE_SELECTED_OR_NOW;
        break;
      case "overdue":
        props.status = props.FILTER_STATUS_INCOMPLETE | props.FILTER_STATUS_IN_PROGRESS;
        props.due = props.FILTER_DUE_PAST;
        props.start = props.FILTER_DATE_ALL;
        props.end = props.FILTER_DATE_SELECTED_OR_NOW;
        break;
      case "open":
        props.status = props.FILTER_STATUS_INCOMPLETE | props.FILTER_STATUS_IN_PROGRESS;
        props.due = props.FILTER_DUE_ALL;
        props.start = props.FILTER_DATE_ALL;
        props.end = props.FILTER_DATE_ALL;
        props.occurrences = props.FILTER_OCCURRENCES_PAST_AND_NEXT;
        break;
      case "completed":
        props.status = props.FILTER_STATUS_COMPLETED_TODAY | props.FILTER_STATUS_COMPLETED_BEFORE;
        props.due = props.FILTER_DUE_ALL;
        props.start = props.FILTER_DATE_ALL;
        props.end = props.FILTER_DATE_SELECTED_OR_NOW;
        break;
      case "throughcurrent":
        props.status =
          props.FILTER_STATUS_INCOMPLETE |
          props.FILTER_STATUS_IN_PROGRESS |
          props.FILTER_STATUS_COMPLETED_TODAY;
        props.due = props.FILTER_DUE_ALL;
        props.start = props.FILTER_DATE_ALL;
        props.end = props.FILTER_DATE_SELECTED_OR_NOW;
        break;
      case "throughtoday":
        props.status =
          props.FILTER_STATUS_INCOMPLETE |
          props.FILTER_STATUS_IN_PROGRESS |
          props.FILTER_STATUS_COMPLETED_TODAY;
        props.due = props.FILTER_DUE_ALL;
        props.start = props.FILTER_DATE_ALL;
        props.end = props.FILTER_DATE_TODAY;
        break;
      case "throughsevendays":
        props.status =
          props.FILTER_STATUS_INCOMPLETE |
          props.FILTER_STATUS_IN_PROGRESS |
          props.FILTER_STATUS_COMPLETED_TODAY;
        props.due = props.FILTER_DUE_ALL;
        props.start = props.FILTER_DATE_ALL;
        props.end = "P7D";
        break;

      // Predefined Event filters
      case "today":
        props.start = props.FILTER_DATE_TODAY;
        props.end = props.FILTER_DATE_TODAY;
        break;
      case "thisCalendarMonth":
        props.start = props.FILTER_DATE_CURRENT_MONTH;
        props.end = props.FILTER_DATE_CURRENT_MONTH;
        break;
      case "future":
        props.start = props.FILTER_DATE_NOW;
        props.end = props.FILTER_DATE_ALL;
        break;
      case "current":
        props.start = props.FILTER_DATE_SELECTED;
        props.end = props.FILTER_DATE_SELECTED;
        break;
      case "currentview":
        props.start = props.FILTER_DATE_VIEW;
        props.end = props.FILTER_DATE_VIEW;
        break;

      case "all":
      default:
        props.status = props.FILTER_STATUS_ALL;
        props.due = props.FILTER_DUE_ALL;
        props.start = props.FILTER_DATE_ALL;
        props.end = props.FILTER_DATE_ALL;
    }

    return props;
  },

  /**
   * Defines a set of filter properties so that they may be applied by the
   * filter name. If the specified filter name is already defined, it's
   * associated filter properties will be replaced.
   *
   * @param {string} aFilterName - The name to define the filter properties as.
   * @param {calFilterProperties} aFilterProperties - The filter properties to
   *   define.
   */
  defineFilter(aFilterName, aFilterProperties) {
    if (!(aFilterProperties instanceof calFilterProperties)) {
      return;
    }

    this.mDefinedFilters[aFilterName] = aFilterProperties;
  },

  /**
   * Returns the set of filter properties that were previously defined by a
   * filter name.
   *
   * @param {calFilter} aFilter - The filter name of the defined filter
   *   properties.
   * @returns {calFilterProperties} The properties defined by the filter name,
   *   or null if the filter name was not previously defined.
   */
  getDefinedFilterProperties(aFilter) {
    if (aFilter in this.mDefinedFilters) {
      return this.mDefinedFilters[aFilter].clone();
    }
    return null;
  },

  /**
   * Returns the filter name that a set of filter properties were previously
   * defined as.
   *
   * @param {calFilterProperties} aFilterProperties - The filter properties
   *   previously defined.
   * @returns {string} The name of the first filter name that the properties
   *   were defined as, or null if the filter properties were not previously
   *   defined.
   */
  getDefinedFilterName(aFilterProperties) {
    for (const filter in this.mDefinedFilters) {
      if (this.mDefinedFilters[filter].equals(aFilterProperties)) {
        return filter;
      }
    }
    return null;
  },

  /**
   * Checks if the item matches the current filter text.
   *
   * @param {calIItemBase} aItem - The item to check.
   * @returns {boolean} Returns true if the item matches the filter text or no
   *   filter text has been set, false otherwise.
   */
  textFilter(aItem) {
    if (!this.mFilterText) {
      return true;
    }

    const searchText = this.mFilterText.toLowerCase();

    if (!searchText.length || searchText.match(/^\s*$/)) {
      return true;
    }

    // TODO: Support specifying which fields to search on
    for (const field of ["SUMMARY", "DESCRIPTION", "LOCATION", "URL"]) {
      const val = aItem.getProperty(field);
      if (val && val.toLowerCase().includes(searchText)) {
        return true;
      }
    }

    return aItem.getCategories().some(cat => cat.toLowerCase().includes(searchText));
  },

  /**
   * Checks if the item matches the current filter date range.
   *
   * @param {calIItemBase} aItem - The item to check.
   * @returns {boolean} Returns true if the item falls within the date range
   *   specified by mStartDate and mEndDate, false otherwise.
   */
  dateRangeFilter(aItem) {
    return !!cal.item.checkIfInRange(aItem, this.mStartDate, this.mEndDate);
  },

  /**
   * Checks if the item matches the currently applied filter properties. Filter
   * properties with a value of null or that are not applicable to the item's
   * type are not tested.
   *
   * @param {calIItemBase} aItem - The item to check.
   * @returns {boolean} Returns true if the item matches the filter properties
   *   currently applied, false otherwise.
   */
  propertyFilter(aItem) {
    let result;
    const props = this.mFilterProperties;
    if (!props) {
      return false;
    }

    // the today and tomorrow properties are precalculated in the updateFilterDates function
    // for better performance when filtering batches of items.
    let today = this.mToday;
    if (!today) {
      today = cal.dtz.now();
      today.isDate = true;
    }

    let tomorrow = this.mTomorrow;
    if (!tomorrow) {
      tomorrow = today.clone();
      tomorrow.day++;
    }

    // test the date range of the applied filter.
    result = this.dateRangeFilter(aItem);

    // test the category property. If the property value is an array, only one category must
    // match.
    if (result && props.category) {
      let cats = [];

      if (typeof props.category == "string") {
        cats.push(props.category);
      } else if (Array.isArray(props.category)) {
        cats = props.category;
      }
      result = cats.some(cat => aItem.getCategories().includes(cat));
    }

    // test the status property. Only applies to tasks.
    if (result && props.status != null && aItem.isTodo()) {
      const completed = aItem.isCompleted;
      const current = !aItem.completedDate || today.compare(aItem.completedDate) <= 0;
      const percent = aItem.percentComplete || 0;

      result =
        (props.status & props.FILTER_STATUS_INCOMPLETE || !(!completed && percent == 0)) &&
        (props.status & props.FILTER_STATUS_IN_PROGRESS || !(!completed && percent > 0)) &&
        (props.status & props.FILTER_STATUS_COMPLETED_TODAY || !(completed && current)) &&
        (props.status & props.FILTER_STATUS_COMPLETED_BEFORE || !(completed && !current));
    }

    // test the due property. Only applies to tasks.
    if (result && props.due != null && aItem.isTodo()) {
      const due = aItem.dueDate;
      const now = cal.dtz.now();

      result =
        (props.due & props.FILTER_DUE_PAST || !(due && due.compare(now) < 0)) &&
        (props.due & props.FILTER_DUE_TODAY ||
          !(due && due.compare(now) >= 0 && due.compare(tomorrow) < 0)) &&
        (props.due & props.FILTER_DUE_FUTURE || !(due && due.compare(tomorrow) >= 0)) &&
        (props.due & props.FILTER_DUE_NONE || !(due == null));
    }

    // Call the filter properties onfilter callback if set. The return value of the
    // callback function will override the result of this function.
    if (props.onfilter && typeof props.onfilter == "function") {
      return props.onfilter(aItem, result, props, this);
    }

    return result;
  },

  /**
   * Checks if the item matches the expected item type.
   *
   * @param {calIItemBase} aItem - The item to check.
   * @returns {boolean} - True if the item matches the item type, false
   *   otherwise.
   */
  itemTypeFilter(aItem) {
    if (aItem.isTodo() && this.mItemType & Ci.calICalendar.ITEM_FILTER_TYPE_TODO) {
      // If `mItemType` doesn't specify a completion status, the item passes.
      if ((this.mItemType & Ci.calICalendar.ITEM_FILTER_COMPLETED_ALL) == 0) {
        return true;
      }

      // Otherwise, check it matches the completion status(es).
      if (aItem.isCompleted) {
        return (this.mItemType & Ci.calICalendar.ITEM_FILTER_COMPLETED_YES) != 0;
      }
      return (this.mItemType & Ci.calICalendar.ITEM_FILTER_COMPLETED_NO) != 0;
    }
    if (aItem.isEvent() && this.mItemType & Ci.calICalendar.ITEM_FILTER_TYPE_EVENT) {
      return true;
    }
    return false;
  },

  /**
   * Calculates the date from a date filter property.
   *
   * @param {(calFilterProperties|string)} prop - The value of the date filter
   *   property to calculate for. May be a constant specifying a relative date
   *   range, or a string representing a duration offset from the current date
   *   time.
   * @param {boolean} start - If true, the function will return the date value
   *   for the start of the relative date range, otherwise it will return the
   *   date value for the end of the date range.
   * @returns {calIDateTime} The calculated date for the property.
   */
  getDateForProperty(prop, start) {
    const props = this.mFilterProperties || new calFilterProperties();
    let result = null;
    const selectedDate = this.mSelectedDate || currentView().selectedDay || cal.dtz.now();
    const nowDate = cal.dtz.now();

    if (typeof prop == "string") {
      const duration = cal.createDuration(prop);
      if (duration) {
        result = nowDate;
        result.addDuration(duration);
      }
    } else {
      switch (prop) {
        case props.FILTER_DATE_ALL:
          result = null;
          break;
        case props.FILTER_DATE_VIEW:
          result = start ? currentView().startDay.clone() : currentView().endDay.clone();
          break;
        case props.FILTER_DATE_SELECTED:
          result = selectedDate.clone();
          result.isDate = true;
          break;
        case props.FILTER_DATE_SELECTED_OR_NOW: {
          result = selectedDate.clone();
          const resultJSDate = cal.dtz.dateTimeToJsDate(result);
          const nowJSDate = cal.dtz.dateTimeToJsDate(nowDate);
          if ((start && resultJSDate > nowJSDate) || (!start && resultJSDate < nowJSDate)) {
            result = nowDate;
          }
          result.isDate = true;
          break;
        }
        case props.FILTER_DATE_NOW:
          result = nowDate;
          break;
        case props.FILTER_DATE_TODAY:
          result = nowDate;
          result.isDate = true;
          break;
        case props.FILTER_DATE_CURRENT_WEEK:
          result = start ? nowDate.startOfWeek : nowDate.endOfWeek;
          break;
        case props.FILTER_DATE_CURRENT_MONTH:
          result = start ? nowDate.startOfMonth : nowDate.endOfMonth;
          break;
        case props.FILTER_DATE_CURRENT_YEAR:
          result = start ? nowDate.startOfYear : nowDate.endOfYear;
          break;
      }

      // date ranges are inclusive, so we need to include the day for the end date
      if (!start && result && prop != props.FILTER_DATE_NOW) {
        result.day++;
      }
    }

    return result;
  },

  /**
   * Calculates the current start and end dates for the currently applied
   * filter.
   *
   * @returns {calIDateTime[]} The current [startDate, endDate] for the applied
   *   filter.
   */
  getDatesForFilter() {
    let startDate = null;
    let endDate = null;

    if (this.mFilterProperties) {
      startDate = this.getDateForProperty(this.mFilterProperties.start, true);
      endDate = this.getDateForProperty(this.mFilterProperties.end, false);

      // swap the start and end dates if necessary
      if (startDate && endDate && startDate.compare(endDate) > 0) {
        const swap = startDate;
        endDate = startDate;
        startDate = swap;
      }
    }

    return [startDate, endDate];
  },

  /**
   * Gets the start date for the current filter date range.
   *
   * @returns {calIDateTime} The start date of the current filter date range, or
   *   null if the date range has an unbound start date.
   */
  get startDate() {
    return this.mStartDate;
  },

  /**
   * Sets the start date for the current filter date range. This will override the date range
   * calculated from the filter properties by the getDatesForFilter function.
   */
  set startDate(aStartDate) {
    this.mStartDate = aStartDate;
  },

  /**
   * Gets the end date for the current filter date range.
   *
   * @returns {?calIDateTime} The end date of the current filter date range, or
   *   null if the date range has an unbound end date.
   */
  get endDate() {
    return this.mEndDate;
  },

  /**
   * Sets the end date for the current filter date range. This will override the date range
   * calculated from the filter properties by the getDatesForFilter function.
   */
  set endDate(aEndDate) {
    this.mEndDate = aEndDate;
  },

  /**
   * Gets the current item type filter.
   */
  get itemType() {
    return this.mItemType;
  },

  /**
   * Sets the item type.
   *
   * @param {number} aItemType - One of the calICalendar.ITEM_FILTER_TYPE
   *   constants, optionally bitwise-OR-ed with a
   *   calICalendar.ITEM_FILTER_COMPLETED value. Only items of this type will
   *   pass the filter.
   *
   * If an ITEM_FILTER_COMPLETED bit is set it will will take priority over
   * applyFilter.
   */
  set itemType(aItemType) {
    this.mItemType = aItemType;
  },

  /**
   * Gets the value used to perform the text filter.
   */
  get filterText() {
    return this.mFilterText;
  },

  /**
   * Sets the value used to perform the text filter.
   *
   * @param {string} aValue - The string value to use for the text filter.
   */
  set filterText(aValue) {
    this.mFilterText = aValue;
  },

  /**
   * Gets the selected date used by the getDatesForFilter function to calculate date ranges
   * that are relative to the selected date.
   */
  get selectedDate() {
    return this.mSelectedDate;
  },

  /**
   * Sets the selected date used by the getDatesForFilter function to calculate date ranges
   * that are relative to the selected date.
   */
  set selectedDate(aSelectedDate) {
    this.mSelectedDate = aSelectedDate;
  },

  /**
   * Gets the currently applied filter properties.
   *
   * @returns {?calFilterProperties} The currently applied filter properties.
   */
  get filterProperties() {
    return this.mFilterProperties ? this.mFilterProperties.clone() : null;
  },

  /**
   * Gets the name of the currently applied filter.
   *
   * @returns {?string} The current defined name of the currently applied filter
   *   properties, or null if the current properties were not previously
   *   defined.
   */
  get filterName() {
    if (!this.mFilterProperties) {
      return null;
    }

    return this.getDefinedFilterName(this.mFilterProperties);
  },

  /**
   * Applies the specified filter.
   *
   * @param {(calFilterProperties|string|Function)} aFilter - The filter to
   *   apply. May be one of the following types:
   *     ~ A calFilterProperties object specifying the filter properties
   *     ~ A string representing a previously defined filter name
   *     ~ A string representing a duration offset from now
   *     ~ A Function to use for the onfilter callback for a custom filter
   */
  applyFilter(aFilter) {
    this.mFilterProperties = null;

    if (typeof aFilter == "string") {
      if (aFilter in this.mDefinedFilters) {
        this.mFilterProperties = this.getDefinedFilterProperties(aFilter);
      } else {
        const dur = cal.createDuration(aFilter);
        if (dur.inSeconds > 0) {
          this.mFilterProperties = new calFilterProperties();
          this.mFilterProperties.start = this.mFilterProperties.FILTER_DATE_NOW;
          this.mFilterProperties.end = aFilter;
        }
      }
    } else if (typeof aFilter == "object" && aFilter instanceof calFilterProperties) {
      this.mFilterProperties = aFilter;
    } else if (typeof aFilter == "function") {
      this.mFilterProperties = new calFilterProperties();
      this.mFilterProperties.onfilter = aFilter;
    } else {
      this.mFilterProperties = new calFilterProperties();
    }

    if (this.mFilterProperties) {
      this.updateFilterDates();
      // this.mFilterProperties.LOG("Applying filter:");
    } else {
      cal.WARN("[calFilter] Unable to apply filter " + aFilter);
    }
  },

  /**
   * Calculates the current start and end dates for the currently applied
   * filter, and updates the current filter start and end dates. This function
   * can be used to update the date range for date range filters that are
   * relative to the selected date or current date and time.
   *
   * @returns {calIDateTime[]} The current [startDate, endDate] for the applied
   *   filter.
   */
  updateFilterDates() {
    const [startDate, endDate] = this.getDatesForFilter();
    this.mStartDate = startDate;
    this.mEndDate = endDate;

    // the today and tomorrow properties are precalculated here
    // for better performance when filtering batches of items.
    this.mToday = cal.dtz.now();
    this.mToday.isDate = true;

    this.mTomorrow = this.mToday.clone();
    this.mTomorrow.day++;

    return [startDate, endDate];
  },

  /**
   * Filters an array of items, returning a new array containing the items that
   * match the currently applied filter properties and text filter.
   *
   * @param {calIItemBase[]} aItems - The array of items to check.
   * @param {Function} [aCallback] - An optional callback function to be called
   *   with each item and the result of it's filter test.
   * @returns {?calIItemBase[]} A new array containing the items that match the
   *   filters, or null if no filter has been applied.
   */
  filterItems(aItems, aCallback) {
    if (!this.mFilterProperties) {
      return null;
    }

    return aItems.filter(function (aItem) {
      const result = this.isItemInFilters(aItem);

      if (aCallback && typeof aCallback == "function") {
        aCallback(aItem, result, this.mFilterProperties, this);
      }

      return result;
    }, this);
  },

  /**
   * Checks if the item matches the currently applied filter properties and text
   * filter.
   *
   * @param {calIItemBase} aItem - The item to check.
   * @returns {boolean} Returns true if the item matches the filters, false
   *   otherwise.
   */
  isItemInFilters(aItem) {
    return this.itemTypeFilter(aItem) && this.propertyFilter(aItem) && this.textFilter(aItem);
  },

  /**
   * Finds the next occurrence of a repeating item that matches the currently
   * applied filter properties.
   *
   * @param {calIItemBase} aItem - The parent item to find the next occurrence
   *   of that matches applied filters.
   * @returns {?calIItemBase} Returns the next occurrence that matches the
   *   filters, or null if no match is found.
   */
  getNextOccurrence(aItem) {
    if (!aItem.recurrenceInfo) {
      return this.isItemInFilters(aItem) ? aItem : null;
    }

    let count = 0;
    let start = cal.dtz.now();

    // If the base item matches the filter, we need to check each future occurrence.
    // Otherwise, we only need to check the exceptions.
    if (this.isItemInFilters(aItem)) {
      while (count++ < this.mMaxIterations) {
        const next = aItem.recurrenceInfo.getNextOccurrence(start);
        if (!next) {
          // there are no more occurrences
          return null;
        }

        if (this.isItemInFilters(next)) {
          return next;
        }
        start = next.startDate || next.entryDate;
      }

      // we've hit the maximum number of iterations without finding a match
      cal.WARN("[calFilter] getNextOccurrence: reached maximum iterations for " + aItem.title);
      return null;
    }
    // the parent item doesn't match the filter, we can return the first future exception
    // that matches the filter
    let exMatch = null;
    aItem.recurrenceInfo.getExceptionIds().forEach(function (rID) {
      const ex = aItem.recurrenceInfo.getExceptionFor(rID);
      if (
        ex &&
        cal.dtz.now().compare(ex.startDate || ex.entryDate) < 0 &&
        this.isItemInFilters(ex)
      ) {
        exMatch = ex;
      }
    }, this);
    return exMatch;
  },

  /**
   * Gets the occurrences of a repeating item that match the currently applied
   * filter properties and date range.
   *
   * @param {calIItemBase} aItem - The parent item to find occurrence of.
   * @returns {?calIItemBase[]} Returns an array containing the occurrences that
   *   match the filters, an empty array if there are no matches, or null if the
   *   filter is not initialized.
   */
  getOccurrences(aItem) {
    if (!this.mFilterProperties) {
      return null;
    }
    const props = this.mFilterProperties;
    let occs;

    if (
      !aItem.recurrenceInfo ||
      (!props.occurrences && !this.mEndDate) ||
      props.occurrences == props.FILTER_OCCURRENCES_NONE
    ) {
      // either this isn't a repeating item, the occurrence filter specifies that
      // we don't want occurrences, or we have a default occurrence filter with an
      // unbound date range, so we return just the unexpanded item.
      occs = [aItem];
    } else {
      occs = aItem.getOccurrencesBetween(
        this.mStartDate || cal.createDateTime(),
        this.mEndDate || cal.dtz.now()
      );
      if (props.occurrences == props.FILTER_OCCURRENCES_PAST_AND_NEXT && !this.mEndDate) {
        // we have an unbound date range and the occurrence filter specifies
        // that we also want the next matching occurrence if available.
        const next = this.getNextOccurrence(aItem);
        if (next) {
          occs.push(next);
        }
      }
    }

    return this.filterItems(occs);
  },

  /**
   * Gets the items matching the currently applied filter properties from a calendar.
   *
   * @param {calICalendar} aCalendar - The calendar to get items from.
   * @returns {ReadableStream<calIItemBase>} A stream of returned values.
   */
  getItems(aCalendar) {
    if (!this.mFilterProperties) {
      return CalReadableStreamFactory.createEmptyReadableStream();
    }
    const props = this.mFilterProperties;

    // Build the filter argument for calICalendar.getItems() from the filter properties.
    let filter = this.mItemType;

    // For tasks, if `mItemType` doesn't specify a completion status, add one.
    if (
      filter & Ci.calICalendar.ITEM_FILTER_TYPE_TODO &&
      (filter & Ci.calICalendar.ITEM_FILTER_COMPLETED_ALL) == 0
    ) {
      if (
        !props.status ||
        props.status & (props.FILTER_STATUS_COMPLETED_TODAY | props.FILTER_STATUS_COMPLETED_BEFORE)
      ) {
        filter |= Ci.calICalendar.ITEM_FILTER_COMPLETED_YES;
      }
      if (
        !props.status ||
        props.status & (props.FILTER_STATUS_INCOMPLETE | props.FILTER_STATUS_IN_PROGRESS)
      ) {
        filter |= Ci.calICalendar.ITEM_FILTER_COMPLETED_NO;
      }
    }

    if (!filter) {
      return CalReadableStreamFactory.createEmptyReadableStream();
    }

    let startDate = this.startDate;
    let endDate = this.endDate;

    // We only want occurrences returned from calICalendar.getItems() with a default
    // occurrence filter property and a bound date range, otherwise the local listener
    // will handle occurrence expansion.
    if (!props.occurrences && this.endDate) {
      filter |= Ci.calICalendar.ITEM_FILTER_CLASS_OCCURRENCES;
      startDate = startDate || cal.createDateTime();
      endDate = endDate || cal.dtz.now();
    }

    // We use a local ReadableStream for the calICalendar.getItems() call, and use it
    // to handle occurrence expansion and filter the results before forwarding them
    // upstream.
    return CalReadableStreamFactory.createMappedReadableStream(
      aCalendar.getItems(filter, 0, startDate, endDate),
      chunk => {
        let items;
        if (props.occurrences == props.FILTER_OCCURRENCES_PAST_AND_NEXT) {
          // with the FILTER_OCCURRENCES_PAST_AND_NEXT occurrence filter we will
          // get parent items returned here, so we need to let the getOccurrences
          // function handle occurrence expansion.
          items = [];
          for (const item of chunk) {
            items = items.concat(this.getOccurrences(item));
          }
        } else {
          // with other occurrence filters the calICalendar.getItems() function will
          // return expanded occurrences appropriately, we only need to filter them.
          items = this.filterItems(chunk);
        }
        return items;
      }
    );
  },
};

/**
 * A mixin to use as a base class for calendar widgets.
 *
 * With startDate, endDate, and itemType set this mixin will inform the widget
 * of any calendar item within the range that needs to be added to, or removed
 * from, the UI. Widgets should implement clearItems, addItems, removeItems,
 * and removeItemsFromCalendar to receive this information.
 *
 * To update the display (e.g. if the user wants to display a different month),
 * just set the new date values and call refreshItems().
 *
 * This mixin handles disabled and/or hidden calendars, so you don't have to.
 *
 * Note: Instances must have an `id` for logging purposes.
 */
let CalendarFilteredViewMixin = Base =>
  class extends Base {
    /**
     * The filter responsible for collecting items when this view is refreshed,
     * and checking new items as they appear.
     *
     * @type {calFilter}
     */
    #filter = null;

    /**
     * An object representing the most recent refresh job.
     * This is used to check if a job that completes is still the most recent.
     *
     * @type {?object}
     */
    #currentRefresh = null;

    /**
     * The current  Promise.withResolvers() `Deferred` object (containing a Promise
     * and methods to resolve/reject it).
     *
     * @type {object}
     */
    #deferred = Promise.withResolvers();

    /**
     * Any async iterator currently reading from a calendar.
     *
     * @type {Set<CalReadableStreamIterator>}
     */
    #iterators = new Set();

    constructor(...args) {
      super(...args);

      this.#filter = new calFilter();
      this.#filter.itemType = 0;
    }

    /**
     * A Promise that resolves when the next refreshing of items is complete,
     * or instantly if refreshing is already complete and still valid.
     *
     * Changes to the startDate, endDate, or itemType properties, or a call to
     * refreshItems with the force argument, will delay this Promise until the
     * refresh settles for the new values.
     *
     * @type {Promise}
     */
    get ready() {
      return this.#deferred.promise;
    }

    /**
     * The start of the filter range. Can be either a date or a datetime.
     *
     * @type {calIDateTime}
     */
    get startDate() {
      return this.#filter.startDate;
    }

    set startDate(value) {
      if (
        this.startDate?.compare(value) == 0 &&
        this.startDate.timezone.tzid == value.timezone.tzid
      ) {
        return;
      }

      this.#filter.startDate = value.clone();
      this.#filter.startDate.makeImmutable();
      this.#invalidate();
    }

    /**
     * The end of the filter range. Can be either a date or a datetime.
     * If it is a date, the filter won't include items on that date, so use the
     * day after the last day to be displayed.
     *
     * @type {calIDateTime}
     */
    get endDate() {
      return this.#filter.endDate;
    }

    set endDate(value) {
      if (this.endDate?.compare(value) == 0 && this.endDate.timezone.tzid == value.timezone.tzid) {
        return;
      }

      this.#filter.endDate = value.clone();
      this.#filter.endDate.makeImmutable();
      this.#invalidate();
    }

    /**
     * One of the calICalendar.ITEM_FILTER_TYPE constants.
     * This must be set to a non-zero value in order to display any items.
     *
     * @type {number}
     */
    get itemType() {
      return this.#filter.itemType;
    }

    set itemType(value) {
      if (this.itemType == value) {
        return;
      }

      this.#filter.itemType = value;
      this.#invalidate();
    }

    #isActive = false;

    /**
     * Whether the view is active.
     *
     * Whilst the view is active, it will listen for item changes. Otherwise,
     * if the view is set to be inactive, it will stop listening for changes.
     *
     * @type {boolean}
     */
    get isActive() {
      return this.#isActive;
    }

    /**
     * Activate the view, refreshing items and listening for changes.
     *
     * @returns {Promise} a promise which resolves when refresh is complete
     */
    activate() {
      if (this.#isActive) {
        return Promise.resolve();
      }

      this.#isActive = true;
      this.#calendarObserver.self = this;

      cal.manager.addCalendarObserver(this.#calendarObserver);
      return this.refreshItems();
    }

    /**
     * Deactivate the view, cancelling any in-progress refresh and causing it to
     * no longer listen for changes.
     */
    deactivate() {
      if (!this.#isActive) {
        return;
      }

      this.#isActive = false;
      this.#calendarObserver.self = this;

      cal.manager.removeCalendarObserver(this.#calendarObserver);
      this.#invalidate();
    }

    /**
     * We refuse to update the widget if it's inactive, or is missing an item type,
     * start date or end date.
     *
     * @type {boolean}
     */
    get #canRefreshItems() {
      return Boolean(this.#isActive && this.itemType && this.startDate && this.endDate);
    }

    /**
     * Clears the display and adds items that match the filter from all enabled
     * and visible calendars.
     *
     * @param {boolean} force - Start refreshing again, even if a refresh is already in progress.
     * @returns {Promise} A Promise resolved when all calendars have refreshed. This is the same
     *   Promise as returned from the `ready` getter.
     */
    refreshItems(force = false) {
      if (!this.#canRefreshItems) {
        // If we're inactive, calling #refreshCalendar() will do nothing, but we
        // will have created a refresh job with no effect and subsequent refresh
        // attempts will fail.
        return Promise.resolve();
      } else if (force) {
        // Refresh, even if already refreshing or refreshed.
        this.#invalidate();
      } else if (this.#currentRefresh) {
        // We already have an ongoing refresh job, or one that has already completed.
        return this.#deferred.promise;
      }

      // Create a new refresh job.
      const refresh = (this.#currentRefresh = { completed: false });

      // Collect items from all of the calendars.
      this.clearItems();
      const promises = [];
      for (const calendar of cal.manager.getCalendars()) {
        promises.push(this.#refreshCalendar(calendar));
      }

      Promise.all(promises).then(() => {
        refresh.completed = true;
        // Resolve the Promise if the current job is still the most recent one.
        // In other words, if nothing has called `#invalidate` since `currentRefresh` was created.
        if (this.#currentRefresh == refresh) {
          this.#deferred.resolve();
        }
      });

      return this.#deferred.promise;
    }

    /**
     * Cancels any refresh in progress.
     */
    #invalidate() {
      for (const iterator of this.#iterators) {
        iterator.cancel();
      }
      this.#iterators.clear();
      if (this.#currentRefresh?.completed) {
        // If a previous refresh completed, start a new Promise that resolves when the next refresh
        // completes. Otherwise, continue with the current Promise.
        // If #currentRefresh is completed, #deferred is already resolved, so we can safely discard it.
        this.#deferred = Promise.withResolvers();
      }
      this.#currentRefresh = null;
    }

    /**
     * Checks if the given calendar is both enabled and visible.
     *
     * @param {calICalendar} calendar
     * @returns {boolean} True if both enabled and visible.
     */
    #isCalendarVisible(calendar) {
      if (!calendar) {
        // If this happens then something's wrong, but it's not our problem so just ignore it.
        return false;
      }

      return (
        !calendar.getProperty("disabled") && calendar.getProperty("calendar-main-in-composite")
      );
    }

    /**
     * Adds items that match the filter from a specific calendar. Does NOT
     * remove existing items first, use removeItemsFromCalendar for that.
     *
     * @param {calICalendar} calendar
     * @returns {Promise} A promise resolved when this calendar has refreshed.
     */
    async #refreshCalendar(calendar) {
      if (!this.#canRefreshItems || !this.#isCalendarVisible(calendar)) {
        return;
      }
      const iterator = cal.iterate.streamValues(this.#filter.getItems(calendar));
      this.#iterators.add(iterator);
      for await (const chunk of iterator) {
        this.addItems(chunk);
      }
      this.#iterators.delete(iterator);
    }

    /**
     * Implement this method to remove all items from the UI.
     */
    clearItems() {}

    /**
     * Implement this method to add items to the UI.
     *
     * @param {calIItemBase[]} items
     */
    addItems(items) {}

    /**
     * Implement this method to remove items from the UI.
     *
     * @param {calIItemBase[]} items
     */
    removeItems(items) {}

    /**
     * Implement this method to remove all items from a specific calendar from
     * the UI.
     *
     * @param {string} calendarId
     */
    removeItemsFromCalendar(calendarId) {}

    /**
     * @implements {calIObserver}
     */
    #calendarObserver = {
      QueryInterface: ChromeUtils.generateQI(["calIObserver"]),

      onStartBatch(calendar) {},
      onEndBatch(calendar) {},
      onLoad(calendar) {
        if (calendar.type == "ics") {
          // ICS doesn't bother telling us about events that disappeared when
          // sync'ing, so just throw them all out and reload. This should get
          // fixed somehow, and this hack removed.
          this.self.removeItemsFromCalendar(calendar.id);
          this.self.#refreshCalendar(calendar);
        }
      },
      onAddItem(item) {
        if (!this.self.#isCalendarVisible(item.calendar)) {
          return;
        }

        const occurrences = this.self.#filter.getOccurrences(item);
        if (occurrences.length) {
          this.self.addItems(occurrences);
        }
      },
      onModifyItem(newItem, oldItem) {
        if (!this.self.#isCalendarVisible(newItem.calendar)) {
          return;
        }

        // Ideally we'd calculate the intersection between oldOccurrences and
        // newOccurrences, then call a modifyItems function, but it proved
        // unreliable in some situations, so instead we remove and replace
        // the occurrences.

        const oldOccurrences = this.self.#filter.getOccurrences(oldItem);
        if (oldOccurrences.length) {
          this.self.removeItems(oldOccurrences);
        }

        const newOccurrences = this.self.#filter.getOccurrences(newItem);
        if (newOccurrences.length) {
          this.self.addItems(newOccurrences);
        }
      },
      onDeleteItem(deletedItem) {
        if (!this.self.#isCalendarVisible(deletedItem.calendar)) {
          return;
        }

        this.self.removeItems(this.self.#filter.getOccurrences(deletedItem));
      },
      onError(calendar, errNo, message) {},
      onPropertyChanged(calendar, name, newValue, oldValue) {
        if (!["calendar-main-in-composite", "disabled"].includes(name)) {
          return;
        }

        if (
          (name == "disabled" && newValue) ||
          (name == "calendar-main-in-composite" && !newValue)
        ) {
          this.self.removeItemsFromCalendar(calendar.id);
          return;
        }

        this.self.#refreshCalendar(calendar);
      },
      onPropertyDeleting(calendar, name) {},
    };
  };
