/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { PlacesUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/PlacesUtils.sys.mjs"
);
var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

function Sanitizer() {}
Sanitizer.prototype = {
  // warning to the caller: this one may raise an exception (e.g. bug #265028)
  clearItem(aItemName) {
    if (this.items[aItemName].canClear) {
      this.items[aItemName].clear();
    }
  },

  canClearItem(aItemName) {
    return this.items[aItemName].canClear;
  },

  prefDomain: "",

  getNameFromPreference(aPreferenceName) {
    return aPreferenceName.substr(this.prefDomain.length);
  },

  /**
   * Deletes privacy sensitive data in a batch, according to user preferences
   *
   * @returns null if everything's fine;  an object in the form
   *           { itemName: error, ... } on (partial) failure
   */
  sanitize() {
    var branch = Services.prefs.getBranch(this.prefDomain);
    var errors = null;

    // Cache the range of times to clear
    if (this.ignoreTimespan) {
      // If we ignore timespan, clear everything.
      var range = null;
    } else {
      range = this.range || Sanitizer.getClearRange();
    }

    for (var itemName in this.items) {
      var item = this.items[itemName];
      item.range = range;
      if ("clear" in item && item.canClear && branch.getBoolPref(itemName)) {
        // Some of these clear() may raise exceptions (see bug #265028)
        // to sanitize as much as possible, we catch and store them,
        // rather than fail fast.
        // Callers should check returned errors and give user feedback
        // about items that could not be sanitized
        try {
          item.clear();
        } catch (er) {
          if (!errors) {
            errors = {};
          }
          errors[itemName] = er;
          dump("Error sanitizing " + itemName + ": " + er + "\n");
        }
      }
    }
    return errors;
  },

  // Time span only makes sense in certain cases.  Consumers who want
  // to only clear some private data can opt in by setting this to false,
  // and can optionally specify a specific range.  If timespan is not ignored,
  // and range is not set, sanitize() will use the value of the timespan
  // pref to determine a range
  ignoreTimespan: true,
  range: null,

  items: {
    cache: {
      clear() {
        try {
          // Cache doesn't consult timespan, nor does it have the
          // facility for timespan-based eviction.  Wipe it.
          Services.cache2.clear();
        } catch (ex) {}
      },

      get canClear() {
        return true;
      },
    },

    cookies: {
      clear() {
        if (this.range) {
          // Iterate through the cookies and delete any created after our cutoff.
          for (const cookie of Services.cookies.cookies) {
            if (cookie.creationTime > this.range[0]) {
              // This cookie was created after our cutoff, clear it
              Services.cookies.remove(
                cookie.host,
                cookie.name,
                cookie.path,
                cookie.originAttributes
              );
            }
          }
        } else {
          // Remove everything
          Services.cookies.removeAll();
        }
      },

      get canClear() {
        return true;
      },
    },

    history: {
      clear() {
        if (this.range) {
          PlacesUtils.history.removeVisitsByFilter({
            beginDate: new Date(this.range[0]),
            endDate: new Date(this.range[1]),
          });
        } else {
          PlacesUtils.history.clear();
        }

        try {
          Services.obs.notifyObservers(null, "browser:purge-session-history");
        } catch (e) {}

        try {
          var predictor = Cc["@mozilla.org/network/predictor;1"].getService(
            Ci.nsINetworkPredictor
          );
          predictor.reset();
        } catch (e) {}
      },

      get canClear() {
        // bug 347231: Always allow clearing history due to dependencies on
        // the browser:purge-session-history notification. (like error console)
        return true;
      },
    },
  },
};

// "Static" members
Sanitizer.prefDomain = "privacy.sanitize.";
Sanitizer.prefShutdown = "sanitizeOnShutdown";
Sanitizer.prefDidShutdown = "didShutdownSanitize";

// Time span constants corresponding to values of the privacy.sanitize.timeSpan
// pref.  Used to determine how much history to clear, for various items
Sanitizer.TIMESPAN_EVERYTHING = 0;
Sanitizer.TIMESPAN_HOUR = 1;
Sanitizer.TIMESPAN_2HOURS = 2;
Sanitizer.TIMESPAN_4HOURS = 3;
Sanitizer.TIMESPAN_TODAY = 4;

// Return a 2 element array representing the start and end times,
// in the uSec-since-epoch format that PRTime likes.  If we should
// clear everything, return null.  Use ts if it is defined; otherwise
// use the timeSpan pref.
Sanitizer.getClearRange = function (ts) {
  if (ts === undefined) {
    ts = Sanitizer.prefs.getIntPref("timeSpan");
  }
  if (ts === Sanitizer.TIMESPAN_EVERYTHING) {
    return null;
  }

  // PRTime is microseconds while JS time is milliseconds
  var endDate = Date.now() * 1000;
  switch (ts) {
    case Sanitizer.TIMESPAN_HOUR:
      var startDate = endDate - 3600000000; // 1*60*60*1000000
      break;
    case Sanitizer.TIMESPAN_2HOURS:
      startDate = endDate - 7200000000; // 2*60*60*1000000
      break;
    case Sanitizer.TIMESPAN_4HOURS:
      startDate = endDate - 14400000000; // 4*60*60*1000000
      break;
    case Sanitizer.TIMESPAN_TODAY:
      var d = new Date(); // Start with today
      d.setHours(0); // zero us back to midnight...
      d.setMinutes(0);
      d.setSeconds(0);
      startDate = d.valueOf() * 1000; // convert to epoch usec
      break;
    default:
      throw new Error("Invalid time span for clear private data: " + ts);
  }
  return [startDate, endDate];
};

Sanitizer._prefs = null;
Sanitizer.__defineGetter__("prefs", function () {
  return Sanitizer._prefs
    ? Sanitizer._prefs
    : (Sanitizer._prefs = Services.prefs.getBranch(Sanitizer.prefDomain));
});

// Shows sanitization UI
Sanitizer.showUI = function (aParentWindow) {
  Services.ww.openWindow(
    AppConstants.platform == "macosx" ? null : aParentWindow,
    "chrome://messenger/content/sanitize.xhtml",
    "Sanitize",
    "chrome,titlebar,dialog,centerscreen,modal",
    null
  );
};

/**
 * Deletes privacy sensitive data in a batch, optionally showing the
 * sanitize UI, according to user preferences
 */
Sanitizer.sanitize = function (aParentWindow) {
  Sanitizer.showUI(aParentWindow);
};

// this is called on startup and shutdown, to perform pending sanitizations
Sanitizer._checkAndSanitize = function () {
  const prefs = Sanitizer.prefs;
  if (
    prefs.getBoolPref(Sanitizer.prefShutdown) &&
    !prefs.prefHasUserValue(Sanitizer.prefDidShutdown)
  ) {
    // this is a shutdown or a startup after an unclean exit
    var s = new Sanitizer();
    s.prefDomain = "privacy.clearOnShutdown.";
    s.sanitize() || prefs.setBoolPref(Sanitizer.prefDidShutdown, true); // sanitize() returns null on full success
  }
};
