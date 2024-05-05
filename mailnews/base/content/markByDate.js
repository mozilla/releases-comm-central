/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from dateFormat.js */

var MILLISECONDS_PER_HOUR = 60 * 60 * 1000;
var MICROSECONDS_PER_DAY = 1000 * MILLISECONDS_PER_HOUR * 24;

window.addEventListener("load", onLoad);

document.addEventListener("dialogaccept", onAccept);

function onLoad() {
  var upperDateBox = document.getElementById("upperDate");
  // focus the upper bound control - this is where we expect most users to enter
  // a date
  upperDateBox.focus();

  // and give it an initial date - "yesterday"
  var initialDate = new Date();
  initialDate.setHours(0);
  initialDate.setTime(initialDate.getTime() - MILLISECONDS_PER_HOUR);
  // note that this is sufficient - though it is at the end of the previous day,
  // we convert it to a date string, and then the time part is truncated
  upperDateBox.value = convertDateToString(initialDate);
  upperDateBox.select(); // allows to start overwriting immediately
}

function onAccept() {
  // get the times as entered by the user
  var lowerDateString = document.getElementById("lowerDate").value;
  // the fallback for the lower bound, if not entered, is the "beginning of
  // time" (1970-01-01), which actually is simply 0 :)
  var prLower = lowerDateString ? convertStringToPRTime(lowerDateString) : 0;

  var upperDateString = document.getElementById("upperDate").value;
  var prUpper;
  if (upperDateString == "") {
    // for the upper bound, the fallback is "today".
    var dateThisMorning = new Date();
    dateThisMorning.setMilliseconds(0);
    dateThisMorning.setSeconds(0);
    dateThisMorning.setMinutes(0);
    dateThisMorning.setHours(0);
    // Javascript time is in milliseconds, PRTime is in microseconds
    prUpper = dateThisMorning.getTime() * 1000;
  } else {
    prUpper = convertStringToPRTime(upperDateString);
  }

  // for the upper date, we have to do a correction:
  // if the user enters a date, then she means (hopefully) that all messages sent
  // at this day should be marked, too, but the PRTime calculated from this would
  // point to the beginning of the day. So we need to increment it by
  // [number of micro seconds per day]. This will denote the first microsecond of
  // the next day then, which is later used as exclusive boundary
  prUpper += MICROSECONDS_PER_DAY;

  markInDatabase(prLower, prUpper);
}

/**
 * M arks all headers in the database, whose time is between the two given
 * times, as read.
 *
 * @param {integer} lower - PRTime for the lower bound (inclusive).
 * @param {integer} upper - PRTime for the upper bound (exclusive).
 */
function markInDatabase(lower, upper) {
  let messageFolder;
  let messageDatabase;
  // extract the database
  if (window.arguments && window.arguments[0]) {
    messageFolder = window.arguments[0];
    messageDatabase = messageFolder.msgDatabase;
  }

  if (!messageDatabase) {
    dump("markByDate::markInDatabase: there /is/ no database to operate on!\n");
    return;
  }

  const searchSession = Cc[
    "@mozilla.org/messenger/searchSession;1"
  ].createInstance(Ci.nsIMsgSearchSession);
  const searchTerms = [];
  searchSession.addScopeTerm(Ci.nsMsgSearchScope.offlineMail, messageFolder);

  let searchTerm = searchSession.createTerm();
  searchTerm.attrib = Ci.nsMsgSearchAttrib.Date;
  searchTerm.op = Ci.nsMsgSearchOp.IsBefore;
  let value = searchTerm.value;
  value.attrib = Ci.nsMsgSearchAttrib.Date;
  value.date = upper;
  searchTerm.value = value;
  searchTerms.push(searchTerm);

  if (lower) {
    searchTerm = searchSession.createTerm();
    searchTerm.booleanAnd = true;
    searchTerm.attrib = Ci.nsMsgSearchAttrib.Date;
    searchTerm.op = Ci.nsMsgSearchOp.IsAfter;
    value = searchTerm.value;
    value.attrib = Ci.nsMsgSearchAttrib.Date;
    value.date = lower;
    searchTerm.value = value;
    searchTerms.push(searchTerm);
  }

  const msgEnumerator = messageDatabase.getFilterEnumerator(searchTerms);
  const headers = [...msgEnumerator];

  if (headers.length) {
    messageFolder.markMessagesRead(headers, true);
  }
}
