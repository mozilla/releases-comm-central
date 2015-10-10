/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["PluralStringFormatter", "makeFriendlyDateAgo"];

var Cc = Components.classes;
var Ci = Components.interfaces;
var Cr = Components.results;
var Cu = Components.utils;

Cu.import("resource://gre/modules/PluralForm.jsm");
Cu.import("resource:///modules/StringBundle.js");

function PluralStringFormatter(aBundleURI) {
  this._bundle = new StringBundle(aBundleURI);
}

PluralStringFormatter.prototype = {
  get: function(aStringName, aReplacements, aPluralCount) {
    let str = this._bundle.get(aStringName);
    if (aPluralCount !== undefined)
      str = PluralForm.get(aPluralCount, str);
    if (aReplacements !== undefined) {
      for (let i = 0; i < aReplacements.length; i++)
        str = str.replace("#" + (i+1), aReplacements[i]);
    }
    return str;
  },
};


var gTemplateUtilsStrings = new PluralStringFormatter(
  "chrome://messenger/locale/templateUtils.properties"
);

/**
 * Helper function to generate a localized "friendly" representation of
 * time relative to the present.  If the time input is "today", it returns
 * a string corresponding to just the time.  If it's yesterday, it returns
 * "yesterday" (localized).  If it's in the last week, it returns the day
 * of the week. If it's before that, it returns the date.
 *
 * @param time
 *        the time (better be in the past!)
 * @return The string with a "human-friendly" representation of that time
 *        relative to now.
 */
function makeFriendlyDateAgo(time)
{
  let dts = Cc["@mozilla.org/intl/scriptabledateformat;1"]
              .getService(Ci.nsIScriptableDateFormat);

  // Figure out when today begins
  let now = new Date();
  let today = new Date(now.getFullYear(), now.getMonth(),
                       now.getDate());

  // Get the end time to display
  let end = time;

  // Figure out if the end time is from today, yesterday,
  // this week, etc.
  let dateTime;
  let kDayInMsecs = 24 * 60 * 60 * 1000;
  let k6DaysInMsecs = 6 * kDayInMsecs;
  if (end >= today) {
    // activity finished after today started, show the time
    dateTime = dts.FormatTime("", dts.timeFormatNoSeconds,
                                  end.getHours(), end.getMinutes(),0);
  } else if (today - end < kDayInMsecs) {
    // activity finished after yesterday started, show yesterday
    dateTime = gTemplateUtilsStrings.get("yesterday");
  } else if (today - end < k6DaysInMsecs) {
    // activity finished after last week started, show day of week
    dateTime = end.toLocaleFormat("%A");
  } else if (now.getFullYear() == end.getFullYear()) {
    // activity must have been from some time ago.. show month/day
    let month = end.toLocaleFormat("%B");
    // Remove leading 0 by converting the date string to a number
    let date = Number(end.toLocaleFormat("%d"));
    dateTime = gTemplateUtilsStrings.get("monthDate", [month, date]);
  } else {
    // not this year, so show full date format
    dateTime = dts.FormatDate("", dts.dateFormatShort,
                              end.getFullYear(), end.getMonth() + 1,
                              end.getDate());
  }
  return dateTime;
}
