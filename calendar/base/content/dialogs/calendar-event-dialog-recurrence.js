/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported onLoad */

/* import-globals-from ../calendar-ui-utils.js */

var { splitRecurrenceRules } = ChromeUtils.import(
  "resource:///modules/calendar/calRecurrenceUtils.jsm"
);
var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var gIsReadOnly = false;
var gStartTime = null;
var gEndTime = null;
var gUntilDate = null;

/**
 * Object wrapping the methods and properties of recurrence-preview binding.
 */
const RecurrencePreview = {
  /**
   * Initializes some properties and adds event listener to the #recurrence-preview node.
   */
  init() {
    this.node = document.getElementById("recurrence-preview");
    this.mRecurrenceInfo = null;
    this.mResizeHandler = null;
    this.mDateTime = null;
    this.mResizeHandler = this.onResize.bind(this);
    window.addEventListener("resize", this.mResizeHandler, true);
  },
  /**
   * Removes the event listener added in init method.
   */
  destruct() {
    window.removeEventListener("resize", this.mResizeHandler, true);
  },
  /**
   * Setter for mDateTime property.
   * @param {date} val - The date value that is to be set.
   */
  set dateTime(val) {
    this.mDateTime = val.clone();
    return this.mDateTime;
  },
  /**
   * Getter for mDateTime property.
   */
  get dateTime() {
    if (this.mDateTime == null) {
      this.mDateTime = cal.dtz.now();
    }
    return this.mDateTime;
  },
  /**
   * Updates #recurrence-preview node layout on window resize.
   */
  onResize() {
    let minimonth = this.node.querySelector("calendar-minimonth");

    let hbox = this.node.querySelector("hbox");
    let vbox = hbox.parentNode;

    let minimonthRect = minimonth.getBoundingClientRect();
    let nodeRect = this.node.getBoundingClientRect();
    let contentWidth = minimonthRect.width;
    let containerWidth = nodeRect.width;

    // Now find out how much elements can be displayed.
    // this is a simple division which always yields a positive integer value.
    const cWidth = containerWidth % contentWidth;
    let numHorizontal = (containerWidth - cWidth) / contentWidth;

    let contentHeight = minimonthRect.height;
    let containerHeight = nodeRect.height;

    const cHeight = containerHeight % contentHeight;
    // Now find out how much elements can be displayed.
    // this is a simple division which always yields a positive integer value.
    let numVertical = (containerHeight - cHeight) / contentHeight;

    // Count the number of existing rows
    let numRows = 0;
    let hboxIterator = hbox;
    while (hboxIterator) {
      numRows++;
      hboxIterator = hboxIterator.nextElementSibling;
    }

    // Adjust rows
    while (numRows < numVertical) {
      let newNode = hbox.cloneNode(true);
      vbox.appendChild(newNode);
      numRows++;
    }
    while (numRows > numVertical) {
      vbox.firstElementChild.remove();
      numRows--;
    }

    // Walk all rows and adjust column elements
    hbox = this.node.querySelector("hbox");
    while (hbox) {
      let firstElementChild = hbox.firstElementChild;
      while (hbox.children.length - 1 < numHorizontal) {
        let newNode = firstElementChild.cloneNode(true);
        firstElementChild.parentNode.insertBefore(newNode, firstElementChild);
      }
      while (hbox.children.length - 1 > numHorizontal) {
        hbox.firstElementChild.remove();
      }
      hbox = hbox.nextElementSibling;
    }

    this.updateContent();
    this.updatePreview(this.mRecurrenceInfo);
  },
  /**
   * Updates content of #recurrence-preview node.
   */
  updateContent() {
    let date = cal.dtz.dateTimeToJsDate(this.dateTime);
    let hbox = this.node.querySelector("hbox");
    while (hbox) {
      let numChilds = hbox.children.length - 1;
      for (let i = 0; i < numChilds; i++) {
        let minimonth = hbox.children[i];
        minimonth.showMonth(date);
        date.setMonth(date.getMonth() + 1);
      }
      hbox = hbox.nextElementSibling;
    }
  },
  /**
   * Updates preview of #recurrence-preview node.
   */
  updatePreview(recurrenceInfo) {
    let minimonth = this.node.querySelector("calendar-minimonth");
    this.node.style.minHeight = minimonth.getBoundingClientRect().height + "px";

    this.mRecurrenceInfo = recurrenceInfo;
    let start = this.dateTime.clone();
    start.day = 1;
    start.hour = 0;
    start.minute = 0;
    start.second = 0;
    let end = start.clone();
    end.month++;

    // the 'minimonth' controls are arranged in a
    // grid, sorted by rows first -> iterate the rows that may exist.
    let hbox = this.node.querySelector("hbox");
    while (hbox) {
      // now iterate all the child nodes of this row
      // in order to visit each minimonth in turn.
      let numChilds = hbox.children.length - 1;
      for (let i = 0; i < numChilds; i++) {
        // we now have one of the minimonth controls while 'start'
        // and 'end' are set to the interval this minimonth shows.
        minimonth = hbox.children[i];
        minimonth.showMonth(cal.dtz.dateTimeToJsDate(start));
        if (recurrenceInfo) {
          // retrieve an array of dates that represents all occurrences
          // that fall into this time interval [start,end[.
          // note: the following loop assumes that this array contains
          // dates that are strictly monotonically increasing.
          // should getOccurrenceDates() not enforce this assumption we
          // need to fall back to some different algorithm.
          let dates = recurrenceInfo.getOccurrenceDates(start, end, 0);

          // now run through all days of this month and set the
          // 'busy' attribute with respect to the occurrence array.
          let index = 0;
          let occurrence = null;
          if (index < dates.length) {
            occurrence = dates[index++].getInTimezone(start.timezone);
          }
          let current = start.clone();
          while (current.compare(end) < 0) {
            let box = minimonth.getBoxForDate(current);
            if (box) {
              if (
                occurrence &&
                occurrence.day == current.day &&
                occurrence.month == current.month &&
                occurrence.year == current.year
              ) {
                box.setAttribute("busy", 1);
                if (index < dates.length) {
                  occurrence = dates[index++].getInTimezone(start.timezone);
                  // take into account that the very next occurrence
                  // can happen at the same day as the previous one.
                  if (
                    occurrence.day == current.day &&
                    occurrence.month == current.month &&
                    occurrence.year == current.year
                  ) {
                    continue;
                  }
                } else {
                  occurrence = null;
                }
              } else {
                box.removeAttribute("busy");
              }
            }
            current.day++;
          }
        }
        start.month++;
        end.month++;
      }
      hbox = hbox.nextElementSibling;
    }
  },
};

/**
 * An object containing the daypicker-weekday binding functionalities.
 */
const DaypickerWeekday = {
  /**
   * Method intitializing DaypickerWeekday.
   */
  init() {
    this.weekStartOffset = Services.prefs.getIntPref("calendar.week.start", 0);

    let mainbox = document.getElementById("daypicker-weekday");
    let numChilds = mainbox.children.length;
    for (let i = 0; i < numChilds; i++) {
      let child = mainbox.children[i];
      let dow = i + this.weekStartOffset;
      if (dow >= 7) {
        dow -= 7;
      }
      let day = cal.l10n.getString("dateFormat", `day.${dow + 1}.Mmm`);
      child.label = day;
      child.calendar = mainbox;
    }
  },
  /**
   * Getter for days property.
   */
  get days() {
    let mainbox = document.getElementById("daypicker-weekday");
    let numChilds = mainbox.children.length;
    let days = [];
    for (let i = 0; i < numChilds; i++) {
      let child = mainbox.children[i];
      if (child.getAttribute("checked") == "true") {
        let index = i + this.weekStartOffset;
        if (index >= 7) {
          index -= 7;
        }
        days.push(index + 1);
      }
    }
    return days;
  },
  /**
   * The weekday-picker manages an array of selected days of the week and
   * the 'days' property is the interface to this array. the expected argument is
   * an array containing integer elements, where each element represents a selected
   * day of the week, starting with SUNDAY=1.
   */
  set days(val) {
    let mainbox = document.getElementById("daypicker-weekday");
    for (let child of mainbox.children) {
      child.removeAttribute("checked");
    }
    for (let i in val) {
      let index = val[i] - 1 - this.weekStartOffset;
      if (index < 0) {
        index += 7;
      }
      mainbox.children[index].setAttribute("checked", "true");
    }
    return val;
  },
};

/**
 * An object containing the daypicker-monthday binding functionalities.
 */
const DaypickerMonthday = {
  /**
   * Method intitializing DaypickerMonthday.
   */
  init() {
    let mainbox = document.querySelector(".daypicker-monthday-mainbox");
    let child = null;
    for (let row of mainbox.children) {
      for (child of row.children) {
        child.calendar = mainbox;
      }
    }
    let labelLastDay = cal.l10n.getString(
      "calendar-event-dialog",
      "eventRecurrenceMonthlyLastDayLabel"
    );
    child.setAttribute("label", labelLastDay);
  },
  /**
   * Setter for days property.
   */
  set days(val) {
    let mainbox = document.querySelector(".daypicker-monthday-mainbox");
    let days = [];
    for (let row of mainbox.children) {
      for (let child of row.children) {
        child.removeAttribute("checked");
        days.push(child);
      }
    }
    for (let i in val) {
      let lastDayOffset = val[i] == -1 ? 0 : -1;
      let index = val[i] < 0 ? val[i] + days.length + lastDayOffset : val[i] - 1;
      days[index].setAttribute("checked", "true");
    }
    return val;
  },
  /**
   * Getter for days property.
   */
  get days() {
    let mainbox = document.querySelector(".daypicker-monthday-mainbox");
    let days = [];
    for (let row of mainbox.children) {
      for (let child of row.children) {
        if (child.getAttribute("checked") == "true") {
          days.push(Number(child.label) ? Number(child.label) : -1);
        }
      }
    }
    return days;
  },
  /**
   * Disables daypicker elements.
   */
  disable() {
    let mainbox = document.querySelector(".daypicker-monthday-mainbox");
    for (let row of mainbox.children) {
      for (let child of row.children) {
        child.setAttribute("disabled", "true");
      }
    }
  },
  /**
   * Enables daypicker elements.
   */
  enable() {
    let mainbox = document.querySelector(".daypicker-monthday-mainbox");
    for (let row of mainbox.children) {
      for (let child of row.children) {
        child.removeAttribute("disabled");
      }
    }
  },
};

/**
 * Sets up the recurrence dialog from the window arguments. Takes care of filling
 * the dialog controls with the recurrence information for this window.
 */
function onLoad() {
  RecurrencePreview.init();
  DaypickerWeekday.init();
  DaypickerMonthday.init();
  changeWidgetsOrder();

  let args = window.arguments[0];
  let item = args.calendarEvent;
  let calendar = item.calendar;
  let recinfo = args.recurrenceInfo;

  gStartTime = args.startTime;
  gEndTime = args.endTime;
  RecurrencePreview.dateTime = gStartTime.getInTimezone(cal.dtz.defaultTimezone);

  onChangeCalendar(calendar);

  // Set starting value for 'repeat until' rule and highlight the start date.
  let repeatDate = cal.dtz.dateTimeToJsDate(gStartTime.getInTimezone(cal.dtz.floating));
  setElementValue("repeat-until-date", repeatDate);
  document.getElementById("repeat-until-date").extraDate = repeatDate;

  if (item.parentItem != item) {
    item = item.parentItem;
  }
  let rule = null;
  if (recinfo) {
    // Split out rules and exceptions
    try {
      let rrules = splitRecurrenceRules(recinfo);
      let rules = rrules[0];
      // Deal with the rules
      if (rules.length > 0) {
        // We only handle 1 rule currently
        rule = cal.wrapInstance(rules[0], Ci.calIRecurrenceRule);
      }
    } catch (ex) {
      Cu.reportError(ex);
    }
  }
  if (!rule) {
    rule = cal.createRecurrenceRule();
    rule.type = "DAILY";
    rule.interval = 1;
    rule.count = -1;
  }
  initializeControls(rule);

  // Update controls
  updateRecurrenceDeck();

  opener.setCursor("auto");
  self.focus();
}

/**
 * Initialize the dialog controls according to the passed rule
 *
 * @param rule    The recurrence rule to parse.
 */
function initializeControls(rule) {
  function getOrdinalAndWeekdayOfRule(aByDayRuleComponent) {
    return {
      ordinal: (aByDayRuleComponent - (aByDayRuleComponent % 8)) / 8,
      weekday: Math.abs(aByDayRuleComponent % 8),
    };
  }

  function setControlsForByMonthDay_YearlyRule(aDate, aByMonthDay) {
    if (aByMonthDay == -1) {
      // The last day of the month.
      document.getElementById("yearly-group").selectedIndex = 1;
      setElementValue("yearly-ordinal", -1);
      setElementValue("yearly-weekday", -1);
    } else {
      if (aByMonthDay < -1) {
        // The UI doesn't manage negative days apart from -1 but we can
        // display in the controls the day from the start of the month.
        aByMonthDay += aDate.endOfMonth.day + 1;
      }
      document.getElementById("yearly-group").selectedIndex = 0;
      setElementValue("yearly-days", aByMonthDay);
    }
  }

  function everyWeekDay(aByDay) {
    // Checks if aByDay contains only values from 1 to 7 with any order.
    let mask = aByDay.reduce((value, item) => value | (1 << item), 1);
    return aByDay.length == 7 && mask == Math.pow(2, 8) - 1;
  }

  switch (rule.type) {
    case "DAILY":
      document.getElementById("period-list").selectedIndex = 0;
      setElementValue("daily-days", rule.interval);
      break;
    case "WEEKLY":
      setElementValue("weekly-weeks", rule.interval);
      document.getElementById("period-list").selectedIndex = 1;
      break;
    case "MONTHLY":
      setElementValue("monthly-interval", rule.interval);
      document.getElementById("period-list").selectedIndex = 2;
      break;
    case "YEARLY":
      setElementValue("yearly-interval", rule.interval);
      document.getElementById("period-list").selectedIndex = 3;
      break;
    default:
      document.getElementById("period-list").selectedIndex = 0;
      dump("unable to handle your rule type!\n");
      break;
  }

  let byDayRuleComponent = rule.getComponent("BYDAY");
  let byMonthDayRuleComponent = rule.getComponent("BYMONTHDAY");
  let byMonthRuleComponent = rule.getComponent("BYMONTH");
  let kDefaultTimezone = cal.dtz.defaultTimezone;
  let startDate = gStartTime.getInTimezone(kDefaultTimezone);

  // "DAILY" ruletype
  // byDayRuleComponents may have been set priorily by "MONTHLY"- ruletypes
  // where they have a different context-
  // that's why we also query the current rule-type
  if (byDayRuleComponent.length == 0 || rule.type != "DAILY") {
    document.getElementById("daily-group").selectedIndex = 0;
  } else {
    document.getElementById("daily-group").selectedIndex = 1;
  }

  // "WEEKLY" ruletype
  if (byDayRuleComponent.length == 0 || rule.type != "WEEKLY") {
    DaypickerWeekday.days = [startDate.weekday + 1];
  } else {
    DaypickerWeekday.days = byDayRuleComponent;
  }

  // "MONTHLY" ruletype
  let ruleComponentsEmpty = byDayRuleComponent.length == 0 && byMonthDayRuleComponent.length == 0;
  if (ruleComponentsEmpty || rule.type != "MONTHLY") {
    document.getElementById("monthly-group").selectedIndex = 1;
    DaypickerMonthday.days = [startDate.day];
    let day = Math.floor((startDate.day - 1) / 7) + 1;
    setElementValue("monthly-ordinal", day);
    setElementValue("monthly-weekday", startDate.weekday + 1);
  } else if (everyWeekDay(byDayRuleComponent)) {
    // Every day of the month.
    document.getElementById("monthly-group").selectedIndex = 0;
    setElementValue("monthly-ordinal", 0);
    setElementValue("monthly-weekday", -1);
  } else if (byDayRuleComponent.length > 0) {
    // One of the first five days or weekdays of the month.
    document.getElementById("monthly-group").selectedIndex = 0;
    let ruleInfo = getOrdinalAndWeekdayOfRule(byDayRuleComponent[0]);
    setElementValue("monthly-ordinal", ruleInfo.ordinal);
    setElementValue("monthly-weekday", ruleInfo.weekday);
  } else if (byMonthDayRuleComponent.length == 1 && byMonthDayRuleComponent[0] == -1) {
    // The last day of the month.
    document.getElementById("monthly-group").selectedIndex = 0;
    setElementValue("monthly-ordinal", byMonthDayRuleComponent[0]);
    setElementValue("monthly-weekday", byMonthDayRuleComponent[0]);
  } else if (byMonthDayRuleComponent.length > 0) {
    document.getElementById("monthly-group").selectedIndex = 1;
    DaypickerMonthday.days = byMonthDayRuleComponent;
  }

  // "YEARLY" ruletype
  if (byMonthRuleComponent.length == 0 || rule.type != "YEARLY") {
    setElementValue("yearly-month-rule", startDate.month + 1);
    setElementValue("yearly-month-ordinal", startDate.month + 1);
    if (byMonthDayRuleComponent.length > 0) {
      setControlsForByMonthDay_YearlyRule(startDate, byMonthDayRuleComponent[0]);
    } else {
      setElementValue("yearly-days", startDate.day);
      let ordinalDay = Math.floor((startDate.day - 1) / 7) + 1;
      setElementValue("yearly-ordinal", ordinalDay);
      setElementValue("yearly-weekday", startDate.weekday + 1);
    }
  } else {
    setElementValue("yearly-month-rule", byMonthRuleComponent[0]);
    setElementValue("yearly-month-ordinal", byMonthRuleComponent[0]);
    if (byMonthDayRuleComponent.length > 0) {
      let date = startDate.clone();
      date.month = byMonthRuleComponent[0] - 1;
      setControlsForByMonthDay_YearlyRule(date, byMonthDayRuleComponent[0]);
    } else if (byDayRuleComponent.length > 0) {
      document.getElementById("yearly-group").selectedIndex = 1;
      if (everyWeekDay(byDayRuleComponent)) {
        // Every day of the month.
        setElementValue("yearly-ordinal", 0);
        setElementValue("yearly-weekday", -1);
      } else {
        let yearlyRuleInfo = getOrdinalAndWeekdayOfRule(byDayRuleComponent[0]);
        setElementValue("yearly-ordinal", yearlyRuleInfo.ordinal);
        setElementValue("yearly-weekday", yearlyRuleInfo.weekday);
      }
    } else if (byMonthRuleComponent.length > 0) {
      document.getElementById("yearly-group").selectedIndex = 0;
      setElementValue("yearly-days", startDate.day);
    }
  }

  /* load up the duration of the event radiogroup */
  if (rule.isByCount) {
    if (rule.count == -1) {
      setElementValue("recurrence-duration", "forever");
    } else {
      setElementValue("recurrence-duration", "ntimes");
      setElementValue("repeat-ntimes-count", rule.count);
    }
  } else {
    let untilDate = rule.untilDate;
    if (untilDate) {
      gUntilDate = untilDate.getInTimezone(gStartTime.timezone); // calIRecurrenceRule::untilDate is always UTC or floating
      // Change the until date to start date if the rule has a forbidden
      // value (earlier than the start date).
      if (gUntilDate.compare(gStartTime) < 0) {
        gUntilDate = gStartTime.clone();
      }
      let repeatDate = cal.dtz.dateTimeToJsDate(gUntilDate.getInTimezone(cal.dtz.floating));
      setElementValue("recurrence-duration", "until");
      setElementValue("repeat-until-date", repeatDate);
    } else {
      setElementValue("recurrence-duration", "forever");
    }
  }
}

/**
 * Save the recurrence information selected in the dialog back to the given
 * item.
 *
 * @param item    The item to save back to.
 * @return        The saved recurrence info.
 */
function onSave(item) {
  // Always return 'null' if this item is an occurrence.
  if (!item || item.parentItem != item) {
    return null;
  }

  // This works, but if we ever support more complex recurrence,
  // e.g. recurrence for Martians, then we're going to want to
  // not clone and just recreate the recurrenceInfo each time.
  // The reason is that the order of items (rules/dates/datesets)
  // matters, so we can't always just append at the end.  This
  // code here always inserts a rule first, because all our
  // exceptions should come afterward.
  let deckNumber = Number(getElementValue("period-list"));

  let args = window.arguments[0];
  let recurrenceInfo = args.recurrenceInfo;
  if (recurrenceInfo) {
    recurrenceInfo = recurrenceInfo.clone();
    let rrules = splitRecurrenceRules(recurrenceInfo);
    if (rrules[0].length > 0) {
      recurrenceInfo.deleteRecurrenceItem(rrules[0][0]);
    }
    recurrenceInfo.item = item;
  } else {
    recurrenceInfo = cal.createRecurrenceInfo(item);
  }

  let recRule = cal.createRecurrenceRule();
  const ALL_WEEKDAYS = [2, 3, 4, 5, 6, 7, 1]; // The sequence MO,TU,WE,TH,FR,SA,SU.
  switch (deckNumber) {
    case 0: {
      recRule.type = "DAILY";
      let dailyGroup = document.getElementById("daily-group");
      if (dailyGroup.selectedIndex == 0) {
        let ndays = Math.max(1, Number(getElementValue("daily-days")));
        recRule.interval = ndays;
      } else {
        recRule.interval = 1;
        let onDays = [2, 3, 4, 5, 6];
        recRule.setComponent("BYDAY", onDays);
      }
      break;
    }
    case 1: {
      recRule.type = "WEEKLY";
      let ndays = Number(getElementValue("weekly-weeks"));
      recRule.interval = ndays;
      let onDays = DaypickerWeekday.days;
      if (onDays.length > 0) {
        recRule.setComponent("BYDAY", onDays);
      }
      break;
    }
    case 2: {
      recRule.type = "MONTHLY";
      let monthInterval = Number(getElementValue("monthly-interval"));
      recRule.interval = monthInterval;
      let monthlyGroup = document.getElementById("monthly-group");
      if (monthlyGroup.selectedIndex == 0) {
        let monthlyOrdinal = Number(getElementValue("monthly-ordinal"));
        let monthlyDOW = Number(getElementValue("monthly-weekday"));
        if (monthlyDOW < 0) {
          if (monthlyOrdinal == 0) {
            // Monthly rule "Every day of the month".
            recRule.setComponent("BYDAY", ALL_WEEKDAYS);
          } else {
            // One of the first five days or the last day of the month.
            recRule.setComponent("BYMONTHDAY", [monthlyOrdinal]);
          }
        } else {
          let sign = monthlyOrdinal < 0 ? -1 : 1;
          let onDays = [(Math.abs(monthlyOrdinal) * 8 + monthlyDOW) * sign];
          recRule.setComponent("BYDAY", onDays);
        }
      } else {
        let monthlyDays = DaypickerMonthday.days;
        if (monthlyDays.length > 0) {
          recRule.setComponent("BYMONTHDAY", monthlyDays);
        }
      }
      break;
    }
    case 3: {
      recRule.type = "YEARLY";
      let yearInterval = Number(getElementValue("yearly-interval"));
      recRule.interval = yearInterval;
      let yearlyGroup = document.getElementById("yearly-group");
      if (yearlyGroup.selectedIndex == 0) {
        let yearlyByMonth = [Number(getElementValue("yearly-month-ordinal"))];
        recRule.setComponent("BYMONTH", yearlyByMonth);
        let yearlyByDay = [Number(getElementValue("yearly-days"))];
        recRule.setComponent("BYMONTHDAY", yearlyByDay);
      } else {
        let yearlyByMonth = [Number(getElementValue("yearly-month-rule"))];
        recRule.setComponent("BYMONTH", yearlyByMonth);
        let yearlyOrdinal = Number(getElementValue("yearly-ordinal"));
        let yearlyDOW = Number(getElementValue("yearly-weekday"));
        if (yearlyDOW < 0) {
          if (yearlyOrdinal == 0) {
            // Yearly rule "Every day of a month".
            recRule.setComponent("BYDAY", ALL_WEEKDAYS);
          } else {
            // One of the first five days or the last of a month.
            recRule.setComponent("BYMONTHDAY", [yearlyOrdinal]);
          }
        } else {
          let sign = yearlyOrdinal < 0 ? -1 : 1;
          let onDays = [(Math.abs(yearlyOrdinal) * 8 + yearlyDOW) * sign];
          recRule.setComponent("BYDAY", onDays);
        }
      }
      break;
    }
  }

  // Figure out how long this event is supposed to last
  switch (document.getElementById("recurrence-duration").selectedItem.value) {
    case "forever": {
      recRule.count = -1;
      break;
    }
    case "ntimes": {
      recRule.count = Math.max(1, getElementValue("repeat-ntimes-count"));
      break;
    }
    case "until": {
      let untilDate = cal.dtz.jsDateToDateTime(
        getElementValue("repeat-until-date"),
        gStartTime.timezone
      );
      untilDate.isDate = gStartTime.isDate; // enforce same value type as DTSTART
      if (!gStartTime.isDate) {
        // correct UNTIL to exactly match start date's hour, minute, second:
        untilDate.hour = gStartTime.hour;
        untilDate.minute = gStartTime.minute;
        untilDate.second = gStartTime.second;
      }
      recRule.untilDate = untilDate;
      break;
    }
  }

  if (recRule.interval < 1) {
    return null;
  }

  recurrenceInfo.insertRecurrenceItemAt(recRule, 0);
  return recurrenceInfo;
}

/**
 * Handler function to be called when the accept button is pressed.
 */
document.addEventListener("dialogaccept", event => {
  let args = window.arguments[0];
  let item = args.calendarEvent;
  args.onOk(onSave(item));
  // Don't close the dialog if a warning must be showed.
  if (checkUntilDate.warning) {
    event.preventDefault();
  }
});

/**
 * Handler function to be called when the Cancel button is pressed.
 */
document.addEventListener("dialogcancel", () => {
  // Don't show any warning if the dialog must be closed.
  checkUntilDate.warning = false;
});

/**
 * Handler function called when the calendar is changed (also for initial
 * setup).
 *
 * XXX we don't change the calendar in this dialog, this function should be
 * consolidated or renamed.
 *
 * @param calendar    The calendar to use for setup.
 */
function onChangeCalendar(calendar) {
  let args = window.arguments[0];
  let item = args.calendarEvent;

  // Set 'gIsReadOnly' if the calendar is read-only
  gIsReadOnly = false;
  if (calendar && calendar.readOnly) {
    gIsReadOnly = true;
  }

  // Disable or enable controls based on a set or rules
  // - whether this item is a stand-alone item or an occurrence
  // - whether or not this item is read-only
  // - whether or not the state of the item allows recurrence rules
  //     - tasks without an entrydate are invalid
  disableOrEnable(item);

  updateRecurrenceControls();
}

/**
 * Disable or enable certain controls based on the given item:
 * Uses the following attribute:
 *
 * - disable-on-occurrence
 * - disable-on-readonly
 *
 * A task without a start time is also considered readonly.
 *
 * @param item        The item to check.
 */
function disableOrEnable(item) {
  if (item.parentItem != item) {
    disableRecurrenceFields("disable-on-occurrence");
  } else if (gIsReadOnly) {
    disableRecurrenceFields("disable-on-readonly");
  } else if (cal.item.isToDo(item) && !gStartTime) {
    disableRecurrenceFields("disable-on-readonly");
  } else {
    enableRecurrenceFields("disable-on-readonly");
  }
}

/**
 * Disables all fields that have an attribute that matches the argument and is
 * set to "true".
 *
 * @param aAttributeName    The attribute to search for.
 */
function disableRecurrenceFields(aAttributeName) {
  let disableElements = document.getElementsByAttribute(aAttributeName, "true");
  for (let i = 0; i < disableElements.length; i++) {
    disableElements[i].setAttribute("disabled", "true");
  }
}

/**
 * Enables all fields that have an attribute that matches the argument and is
 * set to "true".
 *
 * @param aAttributeName    The attribute to search for.
 */
function enableRecurrenceFields(aAttributeName) {
  let enableElements = document.getElementsByAttribute(aAttributeName, "true");
  for (let i = 0; i < enableElements.length; i++) {
    enableElements[i].removeAttribute("disabled");
  }
}

/**
 * Handler function to update the period-deck when an item from the period-list
 * is selected. Also updates the controls on that deck.
 */
function updateRecurrenceDeck() {
  document.getElementById("period-deck").selectedIndex = Number(getElementValue("period-list"));
  updateRecurrenceControls();
}

/**
 * Updates the controls regarding ranged controls (i.e repeat forever, repeat
 * until, repeat n times...)
 */
function updateRecurrenceRange() {
  let args = window.arguments[0];
  let item = args.calendarEvent;
  if (item.parentItem != item || gIsReadOnly) {
    return;
  }

  let radioRangeForever = document.getElementById("recurrence-range-forever");
  let radioRangeFor = document.getElementById("recurrence-range-for");
  let radioRangeUntil = document.getElementById("recurrence-range-until");
  let rangeTimesCount = document.getElementById("repeat-ntimes-count");
  let rangeUntilDate = document.getElementById("repeat-until-date");
  let rangeAppointmentsLabel = document.getElementById("repeat-appointments-label");

  radioRangeForever.removeAttribute("disabled");
  radioRangeFor.removeAttribute("disabled");
  radioRangeUntil.removeAttribute("disabled");
  rangeAppointmentsLabel.removeAttribute("disabled");

  let durationSelection = document.getElementById("recurrence-duration").selectedItem.value;

  if (durationSelection == "ntimes") {
    rangeTimesCount.removeAttribute("disabled");
  } else {
    rangeTimesCount.setAttribute("disabled", "true");
  }

  if (durationSelection == "until") {
    rangeUntilDate.removeAttribute("disabled");
  } else {
    rangeUntilDate.setAttribute("disabled", "true");
  }
}

/**
 * Updates the recurrence preview calendars using the window's item.
 */
function updatePreview() {
  let args = window.arguments[0];
  let item = args.calendarEvent;
  if (item.parentItem != item) {
    item = item.parentItem;
  }

  // TODO: We should better start the whole dialog with a newly cloned item
  // and always pump changes immediately into it. This would eliminate the
  // need to break the encapsulation, as we do it here. But we need the item
  // to contain the startdate in order to calculate the recurrence preview.
  item = item.clone();
  let kDefaultTimezone = cal.dtz.defaultTimezone;
  if (cal.item.isEvent(item)) {
    let startDate = gStartTime.getInTimezone(kDefaultTimezone);
    let endDate = gEndTime.getInTimezone(kDefaultTimezone);
    if (startDate.isDate) {
      endDate.day--;
    }

    item.startDate = startDate;
    item.endDate = endDate;
  }
  if (cal.item.isToDo(item)) {
    let entryDate = gStartTime;
    if (entryDate) {
      entryDate = entryDate.getInTimezone(kDefaultTimezone);
    } else {
      item.recurrenceInfo = null;
    }
    item.entryDate = entryDate;
    let dueDate = gEndTime;
    if (dueDate) {
      dueDate = dueDate.getInTimezone(kDefaultTimezone);
    }
    item.dueDate = dueDate;
  }

  let recInfo = onSave(item);
  RecurrencePreview.updatePreview(recInfo);
}

/**
 * Checks the until date just entered in the datepicker in order to avoid
 * setting a date earlier than the start date.
 * Restores the previous correct date, shows a warning and prevents to close the
 * dialog when the user enters a wrong until date.
 */
function checkUntilDate() {
  if (!gStartTime) {
    // This function shouldn't run before onLoad.
    return;
  }

  let untilDate = cal.dtz.jsDateToDateTime(
    getElementValue("repeat-until-date"),
    gStartTime.timezone
  );
  let startDate = gStartTime.clone();
  startDate.isDate = true;
  if (untilDate.compare(startDate) < 0) {
    let repeatDate = cal.dtz.dateTimeToJsDate(
      (gUntilDate || gStartTime).getInTimezone(cal.dtz.floating)
    );
    setElementValue("repeat-until-date", repeatDate);
    checkUntilDate.warning = true;
    let callback = function() {
      // No warning when the dialog is being closed with the Cancel button.
      if (!checkUntilDate.warning) {
        return;
      }
      Services.prompt.alert(
        null,
        document.title,
        cal.l10n.getCalString("warningUntilDateBeforeStart")
      );
      checkUntilDate.warning = false;
    };
    setTimeout(callback, 1);
  } else {
    gUntilDate = untilDate;
    updateRecurrenceControls();
  }
}

/**
 * Update all recurrence controls on the dialog.
 */
function updateRecurrenceControls() {
  updateRecurrencePattern();
  updateRecurrenceRange();
  updatePreview();
}

/**
 * Disables/enables controls related to the recurrence pattern.
 * the status of the controls depends on which period entry is selected
 * and which form of pattern rule is selected.
 */
function updateRecurrencePattern() {
  let args = window.arguments[0];
  let item = args.calendarEvent;
  if (item.parentItem != item || gIsReadOnly) {
    return;
  }

  switch (Number(getElementValue("period-list"))) {
    // daily
    case 0: {
      let dailyGroup = document.getElementById("daily-group");
      let dailyDays = document.getElementById("daily-days");
      dailyDays.removeAttribute("disabled");
      if (dailyGroup.selectedIndex == 1) {
        dailyDays.setAttribute("disabled", "true");
      }
      break;
    }
    // weekly
    case 1: {
      break;
    }
    // monthly
    case 2: {
      let monthlyGroup = document.getElementById("monthly-group");
      let monthlyOrdinal = document.getElementById("monthly-ordinal");
      let monthlyWeekday = document.getElementById("monthly-weekday");
      let monthlyDays = DaypickerMonthday;
      monthlyOrdinal.removeAttribute("disabled");
      monthlyWeekday.removeAttribute("disabled");
      monthlyDays.enable();
      if (monthlyGroup.selectedIndex == 0) {
        monthlyDays.disable();
      } else {
        monthlyOrdinal.setAttribute("disabled", "true");
        monthlyWeekday.setAttribute("disabled", "true");
      }
      break;
    }
    // yearly
    case 3: {
      let yearlyGroup = document.getElementById("yearly-group");
      let yearlyDays = document.getElementById("yearly-days");
      let yearlyMonthOrdinal = document.getElementById("yearly-month-ordinal");
      let yearlyPeriodOfMonthLabel = document.getElementById("yearly-period-of-month-label");
      let yearlyOrdinal = document.getElementById("yearly-ordinal");
      let yearlyWeekday = document.getElementById("yearly-weekday");
      let yearlyMonthRule = document.getElementById("yearly-month-rule");
      let yearlyPeriodOfLabel = document.getElementById("yearly-period-of-label");
      yearlyDays.removeAttribute("disabled");
      yearlyMonthOrdinal.removeAttribute("disabled");
      yearlyOrdinal.removeAttribute("disabled");
      yearlyWeekday.removeAttribute("disabled");
      yearlyMonthRule.removeAttribute("disabled");
      yearlyPeriodOfLabel.removeAttribute("disabled");
      yearlyPeriodOfMonthLabel.removeAttribute("disabled");
      if (yearlyGroup.selectedIndex == 0) {
        yearlyOrdinal.setAttribute("disabled", "true");
        yearlyWeekday.setAttribute("disabled", "true");
        yearlyMonthRule.setAttribute("disabled", "true");
        yearlyPeriodOfLabel.setAttribute("disabled", "true");
      } else {
        yearlyDays.setAttribute("disabled", "true");
        yearlyMonthOrdinal.setAttribute("disabled", "true");
        yearlyPeriodOfMonthLabel.setAttribute("disabled", "true");
      }
      break;
    }
  }
}

/**
 * This function changes the order for certain elements using a locale string.
 * This is needed for some locales that expect a different wording order.
 *
 * @param aPropKey      The locale property key to get the order from
 * @param aPropParams   An array of ids to be passed to the locale property.
 *                        These should be the ids of the elements to change
 *                        the order for.
 */
function changeOrderForElements(aPropKey, aPropParams) {
  let localeOrder;
  let parents = {};

  for (let key in aPropParams) {
    // Save original parents so that the nodes to reorder get appended to
    // the correct parent nodes.
    parents[key] = document.getElementById(aPropParams[key]).parentNode;
  }

  try {
    localeOrder = cal.l10n.getString("calendar-event-dialog", aPropKey, aPropParams).split(" ");
  } catch (ex) {
    let msg =
      "The key " +
      aPropKey +
      " in calendar-event-dialog.prop" +
      "erties has incorrect number of params. Expected " +
      aPropParams.length +
      " params.";
    Cu.reportError(msg + " " + ex);
    return;
  }

  // Add elements in the right order, removing them from their old parent
  for (let i = 0; i < aPropParams.length; i++) {
    let newEl = document.getElementById(localeOrder[i]);
    if (newEl) {
      parents[i].appendChild(newEl);
    } else {
      cal.ERROR(
        "Localization error, could not find node '" +
          localeOrder[i] +
          "'. Please have your localizer check the string '" +
          aPropKey +
          "'"
      );
    }
  }
}

/**
 * Change locale-specific widget order for Edit Recurrence window
 */
function changeWidgetsOrder() {
  changeOrderForElements("monthlyOrder", ["monthly-ordinal", "monthly-weekday"]);
  changeOrderForElements("yearlyOrder", [
    "yearly-days",
    "yearly-period-of-month-label",
    "yearly-month-ordinal",
  ]);
  changeOrderForElements("yearlyOrder2", [
    "yearly-ordinal",
    "yearly-weekday",
    "yearly-period-of-label",
    "yearly-month-rule",
  ]);
}
