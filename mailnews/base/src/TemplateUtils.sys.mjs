/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const _dateFormatter = new Services.intl.DateTimeFormat(undefined, {
  dateStyle: "short",
});
const _dayMonthFormatter = new Services.intl.DateTimeFormat(undefined, {
  month: "long",
  day: "numeric",
});
const _timeFormatter = new Services.intl.DateTimeFormat(undefined, {
  timeStyle: "short",
});
const _weekdayFormatter = new Services.intl.DateTimeFormat(
  Services.locale.appLocaleAsBCP47,
  {
    weekday: "long",
  }
);
const _relativeTimeFormatter = new Services.intl.RelativeTimeFormat(
  Services.locale.appLocaleAsBCP47,
  {
    numeric: "auto",
  }
);

/**
 * Helper function to generate a localized "friendly" representation of
 * time relative to the present.  If the time input is "today", it returns
 * a string corresponding to just the time.  If it's yesterday, it returns
 * "yesterday" (localized).  If it's in the last week, it returns the day
 * of the week. If it's before that, it returns the date.
 *
 * @param {Date} time - The time (better be in the past!)
 * @returns {string} A "human-friendly" representation of that time
 *   relative to now.
 */
export function makeFriendlyDateAgo(time) {
  // Figure out when today begins
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Figure out if the end time is from today, yesterday,
  // this week, etc.
  let dateTime;
  const kDayInMsecs = 24 * 60 * 60 * 1000;
  const k6DaysInMsecs = 6 * kDayInMsecs;
  if (time >= today) {
    // activity finished after today started, show the time
    dateTime = _timeFormatter.format(time);
  } else if (today - time < kDayInMsecs) {
    // activity finished after yesterday started, show yesterday
    dateTime = _relativeTimeFormatter.format(-1, "day");
  } else if (today - time < k6DaysInMsecs) {
    // activity finished after last week started, show day of week
    dateTime = _weekdayFormatter.format(time);
  } else if (now.getFullYear() == time.getFullYear()) {
    // activity must have been from some time ago.. show month/day
    dateTime = _dayMonthFormatter.format(time);
  } else {
    // not this year, so show full date format
    dateTime = _dateFormatter.format(time);
  }
  return dateTime;
}
