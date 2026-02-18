/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  CalRecurrenceDate: "resource:///modules/CalRecurrenceDate.sys.mjs",
  CalRecurrenceRule: "resource:///modules/CalRecurrenceRule.sys.mjs",
});
ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["calendar/recurrence.ftl"], true)
);

/**
 * Given a calendar event or task, return a string that describes the item's
 * recurrence pattern. When the recurrence pattern is too complex, return a
 * "too complex" string by getting that string using the arguments provided.
 *
 * @param {calIEvent | calITodo} item   A calendar item.
 * @param {string} l10nId - l10n id
 * @returns {?string} A string describing the recurrence
 *   pattern or null if the item has no info.
 */
export function recurrenceStringFromItem(item, l10nId) {
  // See the `parentItem` property of `calIItemBase`.
  const parent = item.parentItem;

  const recurrenceInfo = parent.recurrenceInfo;
  if (!recurrenceInfo) {
    return null;
  }

  const kDefaultTimezone = cal.dtz.defaultTimezone;

  const rawStartDate = parent.startDate || parent.entryDate;
  const rawEndDate = parent.endDate || parent.dueDate;

  const startDate = rawStartDate ? rawStartDate.getInTimezone(kDefaultTimezone) : null;
  const endDate = rawEndDate ? rawEndDate.getInTimezone(kDefaultTimezone) : null;

  return (
    recurrenceRule2String(recurrenceInfo, startDate, endDate, startDate?.isDate) ||
    lazy.l10n.formatValueSync(l10nId)
  );
}

/**
 * Map the day number (from rules) to a weekday name in the app locale.
 *
 * @param {integer} dayNumber - Day.
 * @returns {string} weekday name in app locael.
 */
function getWeekdayName(dayNumber) {
  const date = new Date(Date.UTC(2023, 0, 1)); // sunday
  date.setUTCDate(dayNumber);
  const formatter = new Intl.DateTimeFormat(Services.locale.appLocaleAsBCP47, {
    weekday: "long",
    timeZone: "UTC",
  });
  return formatter.format(date);
}

/**
 * @type {Map<integer, string>}
 */
const weekdayNames = new Map([1, 2, 3, 4, 5, 6, 7].map(day => [day, getWeekdayName(day)]));

/**
 * This function takes the recurrence info passed as argument and creates a
 * literal string representing the repeat pattern in natural language.
 *
 * @param {calIRecurrenceInfo} recurrenceInfo - An item's recurrence info to parse.
 * @param {calIDateTime} startDate - The start date to base rules on.
 * @param {calIDateTime} endDate - The end date to base rules on.
 * @param {boolean} allDay - If true, the pattern should assume an allday item.
 * @returns {string} A human readable string describing the recurrence.
 */
export function recurrenceRule2String(recurrenceInfo, startDate, endDate, allDay) {
  function day_of_week(day) {
    return Math.abs(day) % 8;
  }
  function day_position(day) {
    return ((Math.abs(day) - day_of_week(day)) / 8) * (day < 0 ? -1 : 1);
  }
  function everyWeekDay(aByDay) {
    // Checks if aByDay contains only values from 1 to 7 with any order.
    const mask = aByDay.reduce((value, item) => value | (1 << item), 1);
    return aByDay.length == 7 && mask == Math.pow(2, 8) - 1;
  }

  if (!startDate) {
    // https://datatracker.ietf.org/doc/html/rfc5545#section-3.6.1
    // DTSTART is optional when METHOD is used.
    // For such occasions, we're not able to display anything sensible.
    return lazy.l10n.formatValueSync("recurrence-rule-too-complex");
  }

  // Retrieve a valid recurrence rule from the currently
  // set recurrence info. Bail out if there's more
  // than a single rule or something other than a rule.
  recurrenceInfo = recurrenceInfo.clone();
  if (hasUnsupported(recurrenceInfo)) {
    return null;
  }

  const rrules = splitRecurrenceRules(recurrenceInfo);
  if (rrules[0].length != 1) {
    // Not supported.
    return null;
  }

  const rule = rrules[0][0];
  if (!(rule instanceof lazy.CalRecurrenceRule || rule instanceof Ci.calIRecurrenceRule)) {
    return null;
  }

  // Currently we allow only for BYDAY, BYMONTHDAY, BYMONTH rules.
  const byparts = [
    "BYSECOND",
    "BYMINUTE",
    /* "BYDAY", */
    "BYHOUR",
    /* "BYMONTHDAY", */
    "BYYEARDAY",
    "BYWEEKNO",
    /* "BYMONTH", */
    "BYSETPOS",
  ];

  if (checkRecurrenceRule(rule, byparts)) {
    return null;
  }
  const dateFormatter = cal.dtz.formatter;
  let ruleString;
  if (rule.type == "DAILY") {
    if (checkRecurrenceRule(rule, ["BYDAY"])) {
      const days = rule.getComponent("BYDAY");
      const weekdays = [2, 3, 4, 5, 6];
      if (weekdays.length == days.length) {
        let i;
        for (i = 0; i < weekdays.length; i++) {
          if (weekdays[i] != days[i]) {
            break;
          }
        }
        if (i == weekdays.length) {
          ruleString = lazy.l10n.formatValueSync("recurrence-every-weekday");
        }
      } else {
        return null;
      }
    } else {
      ruleString = lazy.l10n.formatValueSync("recurrence-daily-every-nth", {
        interval: rule.interval,
      });
    }
  } else if (rule.type == "WEEKLY") {
    // weekly recurrence, currently we support a single 'BYDAY'-rule only.
    if (checkRecurrenceRule(rule, ["BYDAY"])) {
      // create a string like 'Monday, Tuesday, and Wednesday'
      const days = rule.getComponent("BYDAY");
      const listFormatter = new Intl.ListFormat(undefined, {
        style: "long",
        type: "conjunction",
      });
      const weekdays = listFormatter.format(days.map(day => weekdayNames.get(day)));
      ruleString = lazy.l10n.formatValueSync("recurrence-weekly-every-nth-on", {
        interval: rule.interval,
        weekdays,
      });
    } else {
      ruleString = lazy.l10n.formatValueSync("recurrence-weekly-every-nth", {
        interval: rule.interval,
      });
    }
  } else if (rule.type == "MONTHLY") {
    if (checkRecurrenceRule(rule, ["BYDAY"])) {
      const byday = rule.getComponent("BYDAY");
      if (everyWeekDay(byday)) {
        // Rule every day of the month.
        ruleString = lazy.l10n.formatValueSync("recurrence-monthly-every-day-of-nth", {
          interval: rule.interval,
        });
      } else {
        // For rules with generic number of weekdays with and
        // without "position" prefix we build two separate
        // strings depending on the position and then join them.
        // NOTE: we build the description string but currently
        // the UI can manage only rules with only one weekday.
        const weekdaysStringEvery = [];
        const weekdaysStringPosition = [];
        for (let i = 0; i < byday.length; i++) {
          if (day_position(byday[i]) == 0) {
            weekdaysStringEvery.push(weekdayNames.get(byday[i]));
          } else {
            if (day_position(byday[i]) < -1 || day_position(byday[i]) > 5) {
              // We support only weekdays with -1 as negative position ('THE LAST ...').
              return null;
            }

            if (
              byday.some(element => {
                return day_position(element) == 0 && day_of_week(byday[i]) == day_of_week(element);
              })
            ) {
              // Prevent to build strings such as for example:
              // "every Monday and the second Monday...".
              continue;
            }
            const ordinal = lazy.l10n.formatValueSync(
              `recurrence-repeat-ordinal-${day_position(byday[i])}`
            );
            const weekday = weekdayNames.get(byday[i]);
            // E.e. 'the first' 'Monday'
            weekdaysStringPosition.push(
              lazy.l10n.formatValueSync("recurrence-ordinal-weekday", { ordinal, weekday })
            );
          }
        }

        const listFormatter = new Intl.ListFormat(undefined, {
          style: "long",
          type: "conjunction",
        });
        const weekdays = listFormatter.format(weekdaysStringEvery.concat(weekdaysStringPosition));

        ruleString = lazy.l10n.formatValueSync(
          weekdaysStringEvery.length
            ? "recurrence-monthly-every-of-every"
            : "recurrence-monthly-nth-of-every",
          { weekdays, interval: rule.interval }
        );
      }
    } else if (checkRecurrenceRule(rule, ["BYMONTHDAY"])) {
      const component = rule.getComponent("BYMONTHDAY");

      // First, find out if the 'BYMONTHDAY' component contains
      // any elements with a negative value lesser than -1 ("the
      // last day"). If so we currently don't support any rule
      if (component.some(element => element < -1)) {
        // we don't support any other combination for now...
        return lazy.l10n.formatValueSync("recurrence-rule-too-complex");
      }
      if (component.length == 1 && component[0] == -1) {
        // i.e. the last day of the month; the last day of every N months
        ruleString = lazy.l10n.formatValueSync("recurrence-monthly-last-day-of-nth", {
          interval: rule.interval,
        });
      } else {
        // i.e. one or more monthdays every N months.

        // Build a string with a list of days separated with commas.
        const monthdays = [];
        let lastDay = false;
        for (let i = 0; i < component.length; i++) {
          if (component[i] == -1) {
            lastDay = true;
            continue;
          }
          monthdays.push(dateFormatter.formatDayWithOrdinal(component[i]));
        }
        if (lastDay) {
          monthdays.push(lazy.l10n.formatValueSync("recurrence-monthly-last-day"));
        }

        const listFormatter = new Intl.ListFormat(undefined, {
          style: "long",
          type: "conjunction",
        });
        const days = listFormatter.format(monthdays); // e.g. 3, 6 and 9

        // e.g. "day 3, 6 and 9"
        const monthlyDays = lazy.l10n.formatValueSync("recurrence-monthly-days-of-nth-day", {
          count: component.length,
          days,
        });

        // e.g. "day 3, 6 and 9" of every 6 months
        ruleString = lazy.l10n.formatValueSync("recurrence-monthly-days-of-nth", {
          monthlyDays,
          interval: rule.interval,
        });
      }
    } else {
      ruleString = lazy.l10n.formatValueSync("recurrence-monthly-days-of-nth", {
        monthlyDays: startDate.day,
        interval: rule.interval,
      });
    }
  } else if (rule.type == "YEARLY") {
    let bymonthday = null;
    let bymonth = null;
    if (checkRecurrenceRule(rule, ["BYMONTHDAY"])) {
      bymonthday = rule.getComponent("BYMONTHDAY");
    }
    if (checkRecurrenceRule(rule, ["BYMONTH"])) {
      bymonth = rule.getComponent("BYMONTH");
    }
    if (
      (bymonth && bymonth.length > 1) ||
      (bymonthday && (bymonthday.length > 1 || bymonthday[0] < -1))
    ) {
      // Don't build a string for a recurrence rule that the UI
      // currently can't show completely (with more than one month
      // or than one monthday, or bymonthdays lesser than -1).
      return lazy.l10n.formatValueSync("recurrence-rule-too-complex");
    }

    if (
      checkRecurrenceRule(rule, ["BYMONTHDAY"]) &&
      (checkRecurrenceRule(rule, ["BYMONTH"]) || !checkRecurrenceRule(rule, ["BYDAY"]))
    ) {
      // RRULE:FREQ=YEARLY;BYMONTH=x;BYMONTHDAY=y.
      // RRULE:FREQ=YEARLY;BYMONTHDAY=x (takes the month from the start date).
      const monthNumber = bymonth ? bymonth[0] - 1 : startDate.month;
      const month = cal.dtz.formatter.monthNames[monthNumber];
      const monthDay =
        bymonthday[0] == -1
          ? lazy.l10n.formatValueSync("recurrence-monthly-last-day")
          : dateFormatter.formatDayWithOrdinal(bymonthday[0]);
      ruleString = lazy.l10n.formatValueSync("recurrence-yearly-nth-on", {
        month,
        monthDay,
        interval: rule.interval,
      });
    } else if (checkRecurrenceRule(rule, ["BYMONTH"]) && checkRecurrenceRule(rule, ["BYDAY"])) {
      // RRULE:FREQ=YEARLY;BYMONTH=x;BYDAY=y1,y2,....
      const byday = rule.getComponent("BYDAY");
      const month = cal.dtz.formatter.monthNames[bymonth[0] - 1];
      if (everyWeekDay(byday)) {
        // e.g. "every day of December", "every 3 years every day of December"
        lazy.l10n.formatValueSync("recurrence-yearly-every-day-of", {
          month,
          interval: rule.interval,
        });
      } else if (byday.length == 1) {
        const weekday = weekdayNames.get(day_of_week(byday[0]));
        if (day_position(byday[0]) == 0) {
          // Every any weekday.
          // e.g. "every Thursday of March", "every 3 years on every Thursday of March"
          ruleString = lazy.l10n.formatValueSync("recurrence-yearly-nth-of-nth", {
            weekday,
            month,
            interval: rule.interval,
          });
        } else if (day_position(byday[0]) >= -1 || day_position(byday[0]) <= 5) {
          // The first|the second|...|the last  Monday, Tuesday, ..., day.
          // e.g. "every Thursday of March", "every 3 years on every Thursday of March"
          const ordinal = lazy.l10n.formatValueSync(
            `recurrence-repeat-ordinal-${day_position(byday[0])}`
          );
          ruleString = lazy.l10n.formatValueSync("recurrence-yearly-nth-on-nth-of", {
            ordinal,
            weekday,
            month,
            interval: rule.interval,
          });
        } else {
          return lazy.l10n.formatValueSync("recurrence-rule-too-complex");
        }
      } else {
        // Currently we don't support yearly rules with
        // more than one BYDAY element or exactly 7 elements
        // with all the weekdays (the "every day" case).
        return lazy.l10n.formatValueSync("recurrence-rule-too-complex");
      }
    } else if (checkRecurrenceRule(rule, ["BYMONTH"])) {
      // RRULE:FREQ=YEARLY;BYMONTH=x (takes the day from the start date).
      const month = cal.dtz.formatter.monthNames[bymonth[0] - 1];
      // e.g. "every 3 years on December 14"
      ruleString = lazy.l10n.formatValueSync("recurrence-yearly-nth-on", {
        month,
        monthDay: startDate.day,
        interval: rule.interval,
      });
    } else {
      const month = cal.dtz.formatter.monthNames[startDate.month];
      ruleString = lazy.l10n.formatValueSync("recurrence-yearly-nth-on", {
        month,
        monthDay: startDate.day,
        interval: rule.interval,
      });
    }
  }

  const kDefaultTimezone = cal.dtz.defaultTimezone;

  let detailsString;
  if (!endDate || allDay) {
    if (rule.isFinite) {
      if (rule.isByCount) {
        detailsString = lazy.l10n.formatValueSync("recurrence-repeat-count-all-day", {
          count: rule.count,
          ruleString,
          startDate: dateFormatter.formatDateShort(startDate),
        });
      } else {
        const untilDate = rule.untilDate.getInTimezone(kDefaultTimezone);
        detailsString = lazy.l10n.formatValueSync("recurrence-details-until-all-day", {
          ruleString,
          startDate: dateFormatter.formatDateShort(startDate),
          untilDate: dateFormatter.formatDateShort(untilDate),
        });
      }
    } else {
      detailsString = lazy.l10n.formatValueSync("recurrence-details-infinite-all-day", {
        ruleString,
        startDate: dateFormatter.formatDateShort(startDate),
      });
    }
  } else if (rule.isFinite) {
    if (rule.isByCount) {
      detailsString = lazy.l10n.formatValueSync("recurrence-repeat-count", {
        count: rule.count,
        ruleString,
        startDate: dateFormatter.formatDateShort(startDate),
        startTime: dateFormatter.formatTime(startDate),
        endTime: dateFormatter.formatTime(endDate),
      });
    } else {
      const untilDate = rule.untilDate.getInTimezone(kDefaultTimezone);
      detailsString = lazy.l10n.formatValueSync("recurrence-repeat-details-until", {
        ruleString,
        startDate: dateFormatter.formatDateShort(startDate),
        untilDate: dateFormatter.formatDateShort(untilDate),
        startTime: dateFormatter.formatTime(startDate),
        endTime: dateFormatter.formatTime(endDate),
      });
    }
  } else {
    detailsString = lazy.l10n.formatValueSync("recurrence-repeat-details-infinite", {
      ruleString,
      startDate: dateFormatter.formatDateShort(startDate),
      startTime: dateFormatter.formatTime(startDate),
      endTime: dateFormatter.formatTime(endDate),
    });
  }
  return detailsString;
}

/**
 * Used to test if the recurrence items of a calIRecurrenceInfo instance are
 * supported. We do not currently allow the "SECONDLY" or "MINUTELY" frequency
 * values.
 *
 * @param {calIRecurrenceInfo} recurrenceInfo
 * @returns {boolean}
 */
export function hasUnsupported(recurrenceInfo) {
  return recurrenceInfo
    .getRecurrenceItems()
    .some(item => item.type == "SECONDLY" || item.type == "MINUTELY");
}

/**
 * Split rules into negative and positive rules.
 *
 * @param {calIRecurrenceInfo} recurrenceInfo    An item's recurrence info to parse.
 * @returns {calIRecurrenceItem[][]} An array with two elements: an array of positive
 *  rules and an array of negative rules.
 */
export function splitRecurrenceRules(recurrenceInfo) {
  const ritems = recurrenceInfo.getRecurrenceItems();
  const rules = [];
  const exceptions = [];
  for (const ritem of ritems) {
    if (ritem.isNegative) {
      exceptions.push(ritem);
    } else {
      rules.push(ritem);
    }
  }
  return [rules, exceptions];
}

/**
 * Check if a recurrence rule's component is valid.
 *
 * @see {calIRecurrenceRule}
 * @param {calIRecurrenceRule} aRule - The recurrence rule to check.
 * @param {calIIcalComponent[]} aArray - An array of component names to check.
 * @returns {boolean} true if the rule is valid.
 */
export function checkRecurrenceRule(aRule, aArray) {
  for (const comp of aArray) {
    const ruleComp = aRule.getComponent(comp);
    if (ruleComp && ruleComp.length > 0) {
      return true;
    }
  }
  return false;
}

/**
 * Counts the occurrences of the parent item if any of a provided item
 *
 * @param {alIEvent|calIToDo} aItem - Item to count for.
 * @returns {number|null} number of occurrences, or null if the passed items
 *   parent item isn't a recurring item or its recurrence is infinite.
 */
export function countOccurrences(aItem) {
  let occCounter = null;
  const recInfo = aItem.parentItem.recurrenceInfo;
  if (recInfo && recInfo.isFinite) {
    occCounter = 0;
    let excCounter = 0;
    let byCount = false;
    const ritems = recInfo.getRecurrenceItems();
    for (const ritem of ritems) {
      if (ritem instanceof lazy.CalRecurrenceRule || ritem instanceof Ci.calIRecurrenceRule) {
        if (ritem.isByCount) {
          occCounter = occCounter + ritem.count;
          byCount = true;
        } else {
          // The rule is limited by an until date.
          const parentItem = aItem.parentItem;
          const startDate = parentItem.startDate ?? parentItem.entryDate;
          const endDate = parentItem.endDate ?? parentItem.dueDate ?? startDate;
          let from = startDate.clone();
          let until = endDate.clone();
          if (until.compare(ritem.untilDate) == -1) {
            until = ritem.untilDate.clone();
          }

          const exceptionIds = recInfo.getExceptionIds();
          for (const exceptionId of exceptionIds) {
            const recur = recInfo.getExceptionFor(exceptionId);
            const recurStartDate = recur.startDate ?? recur.entryDate;
            const recurEndDate = recur.endDate ?? recur.dueDate ?? recurStartDate;
            if (from.compare(recurStartDate) == 1) {
              from = recurStartDate.clone();
            }
            if (until.compare(recurEndDate) == -1) {
              until = recurEndDate.clone();
            }
          }

          // we add an extra day at beginning and end, so we don't
          // need to take care of any timezone conversion
          from.addDuration(cal.createDuration("-P1D"));
          until.addDuration(cal.createDuration("P1D"));

          const occurrences = recInfo.getOccurrences(from, until, 0);
          occCounter = occCounter + occurrences.length;
        }
      } else if (
        ritem instanceof lazy.CalRecurrenceDate ||
        ritem instanceof Ci.calIRecurrenceDate
      ) {
        if (ritem.isNegative) {
          // this is an exdate
          excCounter++;
        } else {
          // this is an (additional) rdate
          occCounter++;
        }
      }
    }

    if (byCount) {
      // for a rrule by count, we still need to subtract exceptions if any
      occCounter = occCounter - excCounter;
    }
  }
  return occCounter;
}
