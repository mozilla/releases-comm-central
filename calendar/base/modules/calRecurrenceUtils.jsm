/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/PluralForm.jsm");
Components.utils.import("resource://calendar/modules/calUtils.jsm");
this.EXPORTED_SYMBOLS = ["recurrenceRule2String", "splitRecurrenceRules", "checkRecurrenceRule"];

/**
 * This function takes the recurrence info passed as argument and creates a
 * literal string representing the repeat pattern in natural language.
 *
 * @param recurrenceInfo    An item's recurrence info to parse.
 * @param startDate         The start date to base rules on.
 * @param endDate           The end date to base rules on.
 * @param allDay            If true, the pattern should assume an allday item.
 * @return                  A human readable string describing the recurrence.
 */
function recurrenceRule2String(recurrenceInfo, startDate, endDate, allDay) {
    function getRString(name, args) {
        return cal.calGetString("calendar-event-dialog", name, args);
    }
    function day_of_week(day) {
        return Math.abs(day) % 8;
    }
    function day_position(day) {
        return (Math.abs(day) - day_of_week(day)) / 8 * (day < 0 ? -1 : 1);
    }
    function nounClass(aDayString, aRuleString) {
        // Select noun class (grammatical gender) for rule string
        let nounClass = getRString(aDayString + "Nounclass");
        return aRuleString + nounClass.substr(0, 1).toUpperCase() +
               nounClass.substr(1);
    }
    function pluralWeekday(aDayString) {
        let plural = getRString("pluralForWeekdays") == "true";
        return (plural ? aDayString + "Plural" : aDayString);
    }
    function everyWeekDay(aByDay) {
        // Checks if aByDay contains only values from 1 to 7 with any order.
        let mask = aByDay.reduce((v, c) => v | (1 << c), 1);
        return aByDay.length == 7 && mask == Math.pow(2, 8) - 1;
    }


    // Retrieve a valid recurrence rule from the currently
    // set recurrence info. Bail out if there's more
    // than a single rule or something other than a rule.
    recurrenceInfo = recurrenceInfo.clone();
    let rrules = splitRecurrenceRules(recurrenceInfo);
    if (rrules[0].length == 1) {
        let rule = cal.wrapInstance(rrules[0][0], Components.interfaces.calIRecurrenceRule);
        // Currently we allow only for BYDAY, BYMONTHDAY, BYMONTH rules.
        if (rule &&
            !checkRecurrenceRule(rule, ['BYSECOND',
                                        'BYMINUTE',
                                        //'BYDAY',
                                        'BYHOUR',
                                        //'BYMONTHDAY',
                                        'BYYEARDAY',
                                        'BYWEEKNO',
                                        //'BYMONTH',
                                        'BYSETPOS'])) {
            let dateFormatter = cal.getDateFormatter();
            let ruleString;
            if (rule.type == 'DAILY') {
                if (checkRecurrenceRule(rule, ['BYDAY'])) {
                    let days = rule.getComponent("BYDAY", {});
                    let weekdays = [2, 3, 4, 5, 6];
                    if (weekdays.length == days.length) {
                        let i;
                        for (i = 0; i < weekdays.length; i++) {
                            if (weekdays[i] != days[i]) {
                                break;
                            }
                        }
                        if (i == weekdays.length) {
                            ruleString = getRString("repeatDetailsRuleDaily4");
                        }
                    } else {
                        return null;
                    }
                } else {
                    let dailyString = getRString("dailyEveryNth");
                    ruleString = PluralForm.get(rule.interval, dailyString)
                                           .replace("#1", rule.interval);
                }
            } else if (rule.type == 'WEEKLY') {
                // weekly recurrence, currently we
                // support a single 'BYDAY'-rule only.
                if (checkRecurrenceRule(rule, ['BYDAY'])) {
                    // create a string like 'Monday, Tuesday and Wednesday'
                    let days = rule.getComponent("BYDAY", {});
                    let weekdays = "";
                    // select noun class (grammatical gender) according to the
                    // first day of the list
                    let weeklyString = nounClass("repeatDetailsDay" + days[0], "weeklyNthOn");
                    for (let i = 0; i < days.length; i++) {
                        if (rule.interval == 1) {
                            weekdays += getRString(pluralWeekday("repeatDetailsDay" + days[i]));
                        } else {
                            weekdays += getRString("repeatDetailsDay" + days[i]);
                        }
                        if (days.length > 1 && i == (days.length - 2)) {
                            weekdays += ' ' + getRString("repeatDetailsAnd") + ' ';
                        } else if (i < days.length - 1) {
                            weekdays += ', ';
                        }
                    }

                    weeklyString = getRString(weeklyString, [weekdays]);
                    ruleString= PluralForm.get(rule.interval, weeklyString)
                                          .replace("#2", rule.interval);

                } else {
                    let weeklyString = getRString("weeklyEveryNth");
                    ruleString = PluralForm.get(rule.interval, weeklyString)
                                           .replace("#1", rule.interval);
                }
            } else if (rule.type == 'MONTHLY') {
                if (checkRecurrenceRule(rule, ['BYDAY'])) {
                    let byday = rule.getComponent("BYDAY", {});
                    if (everyWeekDay(byday)) {
                        // Rule every day of the month.
                        ruleString = getRString("monthlyEveryDayOfNth");
                        ruleString = PluralForm.get(rule.interval, ruleString)
                                               .replace("#2", rule.interval);
                    } else {
                        // For rules with generic number of weekdays with and
                        // without "position" prefix we build two separate
                        // strings depending on the position and then join them.
                        // Notice: we build the description string but currently
                        // the UI can manage only rules with only one weekday.
                        let weekdaysString_every = "";
                        let weekdaysString_position = "";
                        let firstDay = byday[0];
                        for (let i = 0; i < byday.length; i++) {
                            if (day_position(byday[i]) == 0) {
                                if (!weekdaysString_every) {
                                    firstDay = byday[i];
                                }
                                weekdaysString_every += getRString(pluralWeekday("repeatDetailsDay" + byday[i])) + ", ";
                            } else {
                                if (day_position(byday[i]) < -1 || day_position(byday[i]) > 5) {
                                    // We support only weekdays with -1 as negative
                                    // position ('THE LAST ...').
                                    return null;
                                }
                                if (byday.some(function(element) {
                                                   return (day_position(element) == 0 &&
                                                           day_of_week(byday[i]) == day_of_week(element));
                                               })) {
                                    // Prevent to build strings such as for example:
                                    // "every Monday and the second Monday...".
                                    continue;
                                }
                                let ordinalString = "repeatOrdinal" + day_position(byday[i]);
                                let dayString = "repeatDetailsDay" + day_of_week(byday[i]);
                                ordinalString = nounClass(dayString, ordinalString);
                                ordinalString = getRString(ordinalString);
                                dayString = getRString(dayString);
                                let stringOrdinalWeekday = getRString("ordinalWeekdayOrder",
                                                                      [ordinalString, dayString]);
                                weekdaysString_position += stringOrdinalWeekday + ", ";
                            }
                        }
                        let weekdaysString = weekdaysString_every + weekdaysString_position;
                        weekdaysString = weekdaysString.slice(0,-2)
                                                       .replace(/,(?= [^,]*$)/,
                                                                ' ' + getRString("repeatDetailsAnd"));

                        let monthlyString = weekdaysString_every ? "monthlyEveryOfEvery" : "monthlyRuleNthOfEvery";
                        monthlyString = nounClass("repeatDetailsDay" + day_of_week(firstDay), monthlyString);
                        monthlyString = getRString(monthlyString, [weekdaysString]);
                        ruleString = PluralForm.get(rule.interval, monthlyString)
                                               .replace("#2", rule.interval);
                    }
                } else if (checkRecurrenceRule(rule, ['BYMONTHDAY'])) {
                    let component = rule.getComponent("BYMONTHDAY", {});

                    // First, find out if the 'BYMONTHDAY' component contains
                    // any elements with a negative value lesser than -1 ("the
                    // last day"). If so we currently don't support any rule
                    if (component.some(function(element, index, array) {
                                           return element < -1;
                                       })) {
                        // we don't support any other combination for now...
                        return getRString("ruleTooComplex");
                    } else {
                        if (component.length == 1 && component[0] == -1) {
                            // i.e. one day, the last day of the month
                            let monthlyString = getRString("monthlyLastDayOfNth");
                            ruleString = PluralForm.get(rule.interval, monthlyString)
                                                   .replace("#1", rule.interval);
                        } else {
                            // i.e. one or more monthdays every N months.

                            // Build a string with a list of days separated with commas.
                            let day_string = "";
                            let lastDay = false;
                            for (let i = 0; i < component.length; i++) {
                                if (component[i] == -1) {
                                    lastDay = true;
                                    continue;
                                }
                                day_string += dateFormatter.formatDayWithOrdinal(component[i]) + ", ";
                            }
                            if (lastDay) {
                                day_string += getRString("monthlyLastDay") + ", ";
                            }
                            day_string = day_string.slice(0,-2)
                                                   .replace(/,(?= [^,]*$)/,
                                                            ' ' + getRString("repeatDetailsAnd"));

                            // Add the word "day" in plural form to the list of days then
                            // compose the final string with the interval of months
                            let monthlyDayString = getRString("monthlyDaysOfNth_day", [day_string]);
                            monthlyDayString = PluralForm.get(component.length, monthlyDayString);
                            let monthlyString = getRString("monthlyDaysOfNth", [monthlyDayString]);
                            ruleString = PluralForm.get(rule.interval, monthlyString)
                                                   .replace("#2", rule.interval);
                        }
                    }
                } else {
                    let monthlyString = getRString("monthlyDaysOfNth", [startDate.day]);
                    ruleString = PluralForm.get(rule.interval, monthlyString)
                                           .replace("#2", rule.interval);
                }
            } else if (rule.type == 'YEARLY') {
                let bymonthday = null;
                let bymonth = null;
                if (checkRecurrenceRule(rule, ['BYMONTHDAY'])) {
                    bymonthday = rule.getComponent("BYMONTHDAY", {});
                }
                if (checkRecurrenceRule(rule, ['BYMONTH'])) {
                    bymonth = rule.getComponent("BYMONTH", {});
                }
                if (bymonth && bymonth.length > 1 ||
                    bymonthday && (bymonthday.length > 1 || bymonthday[0] < -1)) {
                    // Don't build a string for a recurrence rule that the UI
                    // currently can't show completely (with more than one month
                    // or than one monthday, or bymonthdays lesser than -1).
                    return getRString("ruleTooComplex");
                }

                if (checkRecurrenceRule(rule, ['BYMONTHDAY']) &&
                    (checkRecurrenceRule(rule, ['BYMONTH']) || !checkRecurrenceRule(rule, ['BYDAY']))) {
                    // RRULE:FREQ=YEARLY;BYMONTH=x;BYMONTHDAY=y.
                    // RRULE:FREQ=YEARLY;BYMONTHDAY=x (takes the month from the start date).
                    let monthNumber = bymonth ? bymonth[0] : (startDate.month + 1);
                    let month = getRString("repeatDetailsMonth" + monthNumber);
                    let monthDay = bymonthday[0] == -1 ? getRString("monthlyLastDay")
                                                       : dateFormatter.formatDayWithOrdinal(bymonthday[0]);
                    let yearlyString = getRString("yearlyNthOn", [month, monthDay]);
                    ruleString = PluralForm.get(rule.interval, yearlyString)
                                           .replace("#3", rule.interval);
                } else if (checkRecurrenceRule(rule, ['BYMONTH']) &&
                           checkRecurrenceRule(rule, ['BYDAY'])) {
                    // RRULE:FREQ=YEARLY;BYMONTH=x;BYDAY=y1,y2,....
                    let byday = rule.getComponent("BYDAY", {});
                    let month = getRString("repeatDetailsMonth" + bymonth[0]);
                    if (everyWeekDay(byday)) {
                        // Every day of the month.
                        let yearlyString = "yearlyEveryDayOf";
                        yearlyString = getRString(yearlyString, [month]);
                        ruleString = PluralForm.get(rule.interval, yearlyString)
                                               .replace("#2", rule.interval);
                    } else if (byday.length == 1) {
                        let dayString = "repeatDetailsDay" + day_of_week(byday[0]);
                        if (day_position(byday[0]) == 0) {
                            // Every any weekday.
                            let yearlyString = "yearlyOnEveryNthOfNth";
                            yearlyString = nounClass(dayString, yearlyString);
                            let day = getRString(pluralWeekday(dayString));
                            yearlyString = getRString(yearlyString, [day, month]);
                            ruleString = PluralForm.get(rule.interval, yearlyString)
                                                   .replace("#3", rule.interval);
                        } else if (day_position(byday[0]) >= -1 ||
                                   day_position(byday[0]) <= 5) {
                            // The first|the second|...|the last  Monday, Tuesday, ..., day.
                            let yearlyString = "yearlyNthOnNthOf";
                            yearlyString = nounClass(dayString, yearlyString);
                            let ordinalString = "repeatOrdinal" + day_position(byday[0])
                            ordinalString = nounClass(dayString, ordinalString);
                            let ordinal = getRString(ordinalString);
                            let day = getRString(dayString);
                            yearlyString = getRString(yearlyString, [ordinal, day, month]);
                            ruleString = PluralForm.get(rule.interval, yearlyString)
                                                   .replace("#4", rule.interval);
                        } else {
                            return getRString("ruleTooComplex");
                        }
                    } else {
                        // Currently we don't support yearly rules with
                        // more than one BYDAY element or exactly 7 elements
                        // with all the weekdays (the "every day" case).
                        return getRString("ruleTooComplex");
                    }
                } else if (checkRecurrenceRule(rule, ['BYMONTH'])) {
                    // RRULE:FREQ=YEARLY;BYMONTH=x (takes the day from the start date).
                    let month = getRString("repeatDetailsMonth" + bymonth[0]);
                    let yearlyString = getRString("yearlyNthOn", [month, startDate.day]);
                    ruleString = PluralForm.get(rule.interval, yearlyString)
                                           .replace("#3", rule.interval);
                } else {
                    let month = getRString("repeatDetailsMonth" + (startDate.month + 1));
                    let yearlyString = getRString("yearlyNthOn", [month, startDate.day]);
                    ruleString = PluralForm.get(rule.interval, yearlyString)
                                           .replace("#3", rule.interval);
                }
            }

            let kDefaultTimezone = cal.calendarDefaultTimezone();

            let detailsString;
            if (!endDate || allDay) {
                if (rule.isFinite) {
                    if (rule.isByCount) {
                        let countString = getRString("repeatCountAllDay",
                            [ruleString,
                             dateFormatter.formatDateShort(startDate)]);
                        detailsString = PluralForm.get(rule.count, countString)
                                                  .replace("#3", rule.count);
                    } else {
                        let untilDate = rule.untilDate.getInTimezone(kDefaultTimezone);
                        detailsString = getRString("repeatDetailsUntilAllDay",
                            [ruleString,
                             dateFormatter.formatDateShort(startDate),
                             dateFormatter.formatDateShort(untilDate)]);
                    }
                } else {
                    detailsString = getRString("repeatDetailsInfiniteAllDay",
                                               [ruleString,
                                                dateFormatter.formatDateShort(startDate)]);
                }
            } else {
                if (rule.isFinite) {
                    if (rule.isByCount) {
                        let countString = getRString("repeatCount",
                            [ruleString,
                             dateFormatter.formatDateShort(startDate),
                             dateFormatter.formatTime(startDate),
                             dateFormatter.formatTime(endDate) ]);
                        detailsString = PluralForm.get(rule.count, countString)
                                                  .replace("#5", rule.count);
                    } else {
                        let untilDate = rule.untilDate.getInTimezone(kDefaultTimezone);
                        detailsString = getRString("repeatDetailsUntil",
                            [ruleString,
                             dateFormatter.formatDateShort(startDate),
                             dateFormatter.formatDateShort(untilDate),
                             dateFormatter.formatTime(startDate),
                             dateFormatter.formatTime(endDate)]);
                    }
                } else {
                    detailsString = getRString("repeatDetailsInfinite",
                        [ruleString,
                         dateFormatter.formatDateShort(startDate),
                         dateFormatter.formatTime(startDate),
                         dateFormatter.formatTime(endDate) ]);
                }
            }
            return detailsString;
        }
    }
    return null;
}

/**
 * Split rules into negative and positive rules.
 *
 * @param recurrenceInfo    An item's recurrence info to parse.
 * @return                  An array with two elements: an array of positive
 *                            rules and an array of negative rules.
 */
function splitRecurrenceRules(recurrenceInfo) {
    var ritems = recurrenceInfo.getRecurrenceItems({});
    var rules = [];
    var exceptions = [];
    for each (var r in ritems) {
        if (r.isNegative) {
            exceptions.push(r);
        } else {
            rules.push(r);
        }
    }
    return [rules, exceptions];
}

/**
 * Check if a recurrence rule's component is valid.
 *
 * @see                     calIRecurrenceRule
 * @param aRule             The recurrence rule to check.
 * @param aArray            An array of component names to check.
 * @return                  Returns true if the rule is valid.
 */
function checkRecurrenceRule(aRule, aArray) {
    for each (var comp in aArray) {
        var ruleComp = aRule.getComponent(comp, {});
        if (ruleComp && ruleComp.length > 0) {
            return true;
        }
    }
    return false;
}
