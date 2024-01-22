/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function run_test() {
  // Bug 769938 - dates before 1970 are not handled correctly
  // due to signed vs. unsigned mismatch in PRTime in xpconnect

  const dateTime1950 = cal.createDateTime();
  dateTime1950.year = 1950;
  equal(dateTime1950.year, 1950);

  const dateTime1955 = cal.dtz.jsDateToDateTime(new Date(Date.UTC(1955, 6, 15)));
  equal(dateTime1955.year, 1955);

  const dateTime1965 = cal.createDateTime();
  dateTime1965.nativeTime = -150000000000000;
  equal(dateTime1965.year, 1965);
  equal(dateTime1965.nativeTime, -150000000000000);

  const dateTime1990 = cal.createDateTime();
  dateTime1990.year = 1990;

  const dateTime2050 = cal.createDateTime();
  dateTime2050.year = 2050;

  Assert.less(dateTime1950.nativeTime, dateTime1955.nativeTime);
  Assert.less(dateTime1955.nativeTime, dateTime1965.nativeTime);
  Assert.less(dateTime1965.nativeTime, dateTime1990.nativeTime);
  Assert.less(dateTime1990.nativeTime, dateTime2050.nativeTime);
}
