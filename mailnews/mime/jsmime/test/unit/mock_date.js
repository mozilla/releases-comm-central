"use strict";

/* globals define */

define(function (require) {
  /**
   * A class which appears to act like the Date class with customizable timezone
   * offsets.
   *
   * @param {string} iso8601String An ISO-8601 date/time string including a
   *                               timezone offset.
   */
  function MockDate(iso8601String) {
    // Find the timezone offset (Z or ±hhmm) from the ISO-8601 date string, and
    // then convert that into a number of minutes.
    const parse = /\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(Z|[+-]\d{4})/.exec(
      iso8601String
    );
    const tzOffsetStr = parse[1];
    if (tzOffsetStr == "Z") {
      this._tzOffset = 0;
    } else {
      this._tzOffset =
        parseInt(tzOffsetStr.substring(1, 3)) * 60 +
        parseInt(tzOffsetStr.substring(3));
      if (tzOffsetStr[0] == "-") {
        this._tzOffset = -this._tzOffset;
      }
    }

    // To store the offset, we store both the real time in _realDate and a time
    // that is offset by the tzOffset in _shiftedDate. Only the getUTC* methods
    // should be used on these properties, to avoid problems caused by daylight
    // savings time or other timezone effects. This shifting is always legal
    // because ES6 is specified to assume that leap seconds do not exist, so there
    // are always 60 seconds in a minute.
    this._realDate = new Date(iso8601String);
    this._shiftedDate = new Date(
      this._realDate.getTime() + this._tzOffset * 60 * 1000
    );
  }
  MockDate.prototype = {
    getTimezoneOffset() {
      // This property is reversed from how it's defined in ISO 8601, i.e.,
      // UTC +0100 needs to return -60.
      return -this._tzOffset;
    },
    getTime() {
      return this._realDate.getTime();
    },
  };

  // Provide an implementation of Date methods that will be need in JSMime. For
  // the time being, we only need .get* methods.
  for (const name of Object.getOwnPropertyNames(Date.prototype)) {
    // Only copy getters, not setters or x.toString.
    if (!name.startsWith("get")) {
      continue;
    }
    // No redefining any other names on MockDate.
    if (MockDate.prototype.hasOwnProperty(name)) {
      continue;
    }

    if (name.includes("UTC")) {
      // 'name' is already supposed to be freshly bound per newest ES6 drafts, but
      // current ES6 implementations reuse the bindings. Until implementations
      // catch up, use a new let to bind it freshly.
      const boundName = name;
      Object.defineProperty(MockDate.prototype, name, {
        value(...aArgs) {
          return Date.prototype[boundName].call(this._realDate, aArgs);
        },
      });
    } else {
      const newName = "getUTC" + name.substr(3);
      Object.defineProperty(MockDate.prototype, name, {
        value(...aArgs) {
          return Date.prototype[newName].call(this._shiftedDate, aArgs);
        },
      });
    }
  }

  return MockDate;
});
