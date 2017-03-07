/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ["ToLocaleFormat"];

// JS implementation of the deprecated Date.toLocaleFormat.
// aFormat follows strftime syntax,
// http://pubs.opengroup.org/onlinepubs/007908799/xsh/strftime.html
function ToLocaleFormat(aFormat, aDate) {
  function Day(t) {
    return Math.floor(t.valueOf() / 86400000);
  }
  function DayFromYear(y) {
    return 365 * (y - 1970) +
           Math.floor((y - 1969) / 4) -
           Math.floor((y - 1901) / 100) +
           Math.floor((y - 1601) / 400);
  }
  function DayWithinYear(t) {
    return Day(t) - DayFromYear(t.getFullYear());
  }
  function weekday(option) {
    return aDate.toLocaleString(locale, {weekday: option});
  }
  function month(option) {
    return aDate.toLocaleString(locale, {month: option});
  }
  function hourMinSecTwoDigits() {
    return aDate.toLocaleString(locale, {
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
  }
  function dayPeriod() {
    let dtf = Intl.Dateformat(locale, {hour: "2-digit"});
    let dayPeriodPart =
      dtf.resolvedOptions().hour12 &&
      dtf.formatToParts(aDate).find(part => part.type === "dayPeriod");
    return dayPeriodPart ? dayPeriodPart.value : "";
  }
  function weekNumber(weekStart, t = aDate) {
    let day = t.getDay();
    if (weekStart) {
      day = (day || 7) - weekStart;
    }
    return Math.max(Math.floor((DayWithinYear(t) + 7 - day) / 7), 0);
  }
  function weekNumberISO(t = aDate) {
    let thisWeek = weekNumber(1, t);
    let firstDayOfYear =
      (new Date(t.getFullYear(), 0, 1).getDay() || 7) - 1;
    if (thisWeek === 0 && firstDayOfYear >= 4)
      return weekNumberISO(new Date(t.getFullYear() - 1, 11, 31));
    if (t.getMonth() === 11 &&
        (t.getDate() - ((t.getDay() || 7) - 1)) >= 29)
      return 1;
    return thisWeek + (firstDayOfYear > 0 && firstDayOfYear < 4);
  }
  function weekYearISO() {
    let thisWeek = weekNumber(1, aDate);
    let firstDayOfYear =
      (new Date(aDate.getFullYear(), 0, 1).getDay() || 7) - 1;
    if (thisWeek === 0 && firstDayOfYear >= 4)
      return aDate.getFullYear() - 1;
    if (aDate.getMonth() === 11 &&
        (aDate.getDate() - ((aDate.getDay() || 7) - 1)) >= 29)
      return aDate.getFullYear() + 1;
    return aDate.getFullYear();
  }
  function timeZoneOffset() {
    let offset = aDate.getTimezoneOffset();
    let tzoff =
      Math.floor(Math.abs(offset) / 60) * 100 + Math.abs(offset) % 60;
    return (offset < 0 ? "+" : "-") + String(tzoff).padStart(4, "0");
  }
  function timeZone() {
    let dtf = Intl.DateTimeFormat("en-US", {timeZoneName: "short"});
    let timeZoneNamePart = dtf.formatToParts(aDate)
                              .find(part => part.type === "timeZoneName");
    return timeZoneNamePart ? timeZoneNamePart.value : "";
  }

  let locale =
    Intl.DateTimeFormat().resolvedOptions().locale + "-u-ca-gregory-nu-latn";
  let localeStringOptions = {
    year: "numeric", month: "short", day: "2-digit", weekday: "short",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZoneName: "short",
  };

  let formatFunctions = {
    a: () => weekday("short"),
    A: () => weekday("long"),
    b: () => month("short"),
    B: () => month("long"),
    c: () => aDate.toLocaleString(locale, localeStringOptions),
    C: () => String(Math.trunc(aDate.getFullYear() / 100)),
    d: () => String(aDate.getDate()),
    D: () => ToLocaleFormat("%m/%d/%y", aDate),
    e: () => String(aDate.getDate()),
    F: () => ToLocaleFormat("%Y-%m-%d", aDate),
    g: () => String(weekYearISO() % 100),
    G: () => String(weekYearISO()),
    h: () => month("short"),
    H: () => String(aDate.getHours()),
    I: () => String(aDate.getHours() % 12 || 12),
    j: () => String(DayWithinYear(aDate) + 1),
    k: () => String(aDate.getHours()),
    l: () => String(aDate.getHours() % 12 || 12),
    m: () => String(aDate.getMonth() + 1),
    M: () => String(aDate.getMinutes()),
    n: () => "\n",
    p: () => dayPeriod().toLocaleUpperCase(),
    P: () => dayPeriod().toLocaleLowerCase(),
    r: () => hourMinSecTwoDigits(),
    R: () => ToLocaleFormat("%H:%M", aDate),
    s: () => String(Math.trunc(aDate.getTime() / 1000)),
    S: () => String(aDate.getSeconds()),
    t: () => "\t",
    T: () => ToLocaleFormat("%H:%M:%S", aDate),
    u: () => String(aDate.getDay() || 7),
    U: () => String(weekNumber(0)),
    V: () => String(weekNumberISO()),
    w: () => String(aDate.getDay()),
    W: () => String(weekNumber(1)),
    x: () => aDate.toLocaleDateString(locale),
    X: () => aDate.toLocaleTimeString(locale),
    y: () => String(aDate.getFullYear() % 100),
    Y: () => String(aDate.getFullYear()),
    z: () => timeZoneOffset(),
    Z: () => timeZone(),
    "%": () => "%",
  };
  let padding = {
    C: {fill: "0", width: 2},
    d: {fill: "0", width: 2},
    e: {fill: " ", width: 2},
    g: {fill: "0", width: 2},
    H: {fill: "0", width: 2},
    I: {fill: "0", width: 2},
    j: {fill: "0", width: 3},
    k: {fill: " ", width: 2},
    l: {fill: " ", width: 2},
    m: {fill: "0", width: 2},
    M: {fill: "0", width: 2},
    S: {fill: "0", width: 2},
    U: {fill: "0", width: 2},
    V: {fill: "0", width: 2},
    W: {fill: "0", width: 2},
    y: {fill: "0", width: 2},
  };

  // Modified conversion specifiers E and O are ignored.
  let specifiers = Object.keys(formatFunctions).join("");
  let pattern =
    RegExp(`%#?(\\^)?([0_-]\\d*)?(?:[EO])?([${specifiers}])`, "g");

  return aFormat.replace(pattern,
    (matched, upperCaseFlag, fillWidthFlags, specifier) => {
      let result = formatFunctions[specifier]();
      if (upperCaseFlag)
        result = result.toLocaleUpperCase();
      let {fill = "", width = 0} = padding[specifier] || {};
      if (fillWidthFlags) {
        let newFill = fillWidthFlags[0];
        let newWidth = fillWidthFlags.match(/\d+/);
        if (newFill === "-" && newWidth === null)
          fill = "";
        else {
          fill = newFill === "0" ? "0" : " ";
          width = newWidth !== null ? Number(newWidth) : width;
        }
      }
      return result.padStart(width, fill);
    });
}
