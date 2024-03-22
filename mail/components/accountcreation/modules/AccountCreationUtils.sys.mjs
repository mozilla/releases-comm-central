/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
/**
 * Some common, generic functions
 */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  Sanitizer: "resource:///modules/accountcreation/Sanitizer.sys.mjs",
});

import { AddonManager } from "resource://gre/modules/AddonManager.sys.mjs";
import {
  clearInterval,
  clearTimeout,
  setTimeout,
} from "resource://gre/modules/Timer.sys.mjs";

// Helper constants.
// TODO: Convert to map.

const standardPorts = [143, 993, 110, 995, 587, 25, 465, 443];

// --------------------------
// Low level, basic functions

function assert(test, errorMsg) {
  if (!test) {
    throw new NotReached(
      errorMsg ? errorMsg : "Programming bug. Assertion failed, see log."
    );
  }
}

function makeCallback(obj, func) {
  return func.bind(obj);
}

/**
 * Runs the given function sometime later
 *
 * Currently implemented using setTimeout(), but
 * can later be replaced with an nsITimer impl,
 * when code wants to use it in a module.
 *
 * @see |TimeoutAbortable|
 */
function runAsync(func) {
  return setTimeout(func, 0);
}

/**
 * Reads UTF8 data from a URL.
 *
 * @param uri {nsIURI} - what you want to read
 * @returns {Array of String} the contents of the file, one string per line
 */
function readURLasUTF8(uri) {
  assert(uri instanceof Ci.nsIURI, "uri must be an nsIURI");
  const chan = Services.io.newChannelFromURI(
    uri,
    null,
    Services.scriptSecurityManager.getSystemPrincipal(),
    null,
    Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
    Ci.nsIContentPolicy.TYPE_OTHER
  );
  const is = Cc["@mozilla.org/intl/converter-input-stream;1"].createInstance(
    Ci.nsIConverterInputStream
  );
  is.init(
    chan.open(),
    "UTF-8",
    1024,
    Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER
  );

  let content = "";
  const strOut = {};
  try {
    while (is.readString(1024, strOut) != 0) {
      content += strOut.value;
    }
  } finally {
    is.close();
  }

  return content;
  // TODO this has a numeric error message. We need to ship translations
  // into human language.
}

/**
 * @param bundleURI {String} - chrome URL to properties file
 * @returns nsIStringBundle
 */
function getStringBundle(bundleURI) {
  try {
    return Services.strings.createBundle(bundleURI);
  } catch (e) {
    throw new Exception(
      "Failed to get stringbundle URI <" + bundleURI + ">. Error: " + e
    );
  }
}

// ---------
// Exception

function Exception(msg) {
  this._message = msg;
  this.stack = Components.stack.formattedStack;
}
Exception.prototype = {
  get message() {
    return this._message;
  },
  toString() {
    return this._message;
  },
};

function NotReached(msg) {
  Exception.call(this, msg); // call super constructor
  console.error(this);
}
// Make NotReached extend Exception.
NotReached.prototype = Object.create(Exception.prototype);
NotReached.prototype.constructor = NotReached;

// ---------
// Abortable

/**
 * A handle for an async function which you can cancel.
 * The async function will return an object of this type (a subtype)
 * and you can call cancel() when you feel like killing the function.
 */
function Abortable() {}
Abortable.prototype = {
  cancel() {},
};

function CancelledException(msg) {
  Exception.call(this, msg);
}
CancelledException.prototype = Object.create(Exception.prototype);
CancelledException.prototype.constructor = CancelledException;

function UserCancelledException(msg) {
  // The user knows they cancelled so I don't see a need
  // for a message to that effect.
  if (!msg) {
    msg = "User cancelled";
  }
  CancelledException.call(this, msg);
}
UserCancelledException.prototype = Object.create(CancelledException.prototype);
UserCancelledException.prototype.constructor = UserCancelledException;

/**
 * Utility implementation, for waiting for a promise to resolve,
 * but allowing its result to be cancelled.
 */
function PromiseAbortable(promise, successCallback, errorCallback) {
  Abortable.call(this); // call super constructor
  let complete = false;
  this.cancel = function (e) {
    if (!complete) {
      complete = true;
      errorCallback(e || new CancelledException());
    }
  };
  promise
    .then(function (result) {
      if (!complete) {
        successCallback(result);
        complete = true;
      }
    })
    .catch(function (e) {
      if (!complete) {
        complete = true;
        errorCallback(e);
      }
    });
}
PromiseAbortable.prototype = Object.create(Abortable.prototype);
PromiseAbortable.prototype.constructor = PromiseAbortable;

/**
 * Utility implementation, for allowing to abort a setTimeout.
 * Use like: return new TimeoutAbortable(setTimeout(function(){ ... }, 0));
 *
 * @param setTimeoutID {Integer} - Return value of setTimeout()
 */
function TimeoutAbortable(setTimeoutID) {
  Abortable.call(this); // call super constructor
  this._id = setTimeoutID;
}
TimeoutAbortable.prototype = Object.create(Abortable.prototype);
TimeoutAbortable.prototype.constructor = TimeoutAbortable;
TimeoutAbortable.prototype.cancel = function () {
  clearTimeout(this._id);
};

/**
 * Utility implementation, for allowing to abort a setTimeout.
 * Use like: return new TimeoutAbortable(setTimeout(function(){ ... }, 0));
 *
 * @param setIntervalID {Integer} - Return value of setInterval()
 */
function IntervalAbortable(setIntervalID) {
  Abortable.call(this); // call super constructor
  this._id = setIntervalID;
}
IntervalAbortable.prototype = Object.create(Abortable.prototype);
IntervalAbortable.prototype.constructor = IntervalAbortable;
IntervalAbortable.prototype.cancel = function () {
  clearInterval(this._id);
};

/**
 * Allows you to make several network calls,
 * but return only one |Abortable| object.
 */
function SuccessiveAbortable() {
  Abortable.call(this); // call super constructor
  this._current = null;
}
SuccessiveAbortable.prototype = {
  __proto__: Abortable.prototype,
  get current() {
    return this._current;
  },
  set current(abortable) {
    assert(
      abortable instanceof Abortable || abortable == null,
      "need an Abortable object (or null)"
    );
    this._current = abortable;
  },
  cancel(e) {
    if (this._current) {
      this._current.cancel(e);
    }
  },
};

/**
 * Allows you to make several network calls in parallel.
 */
function ParallelAbortable() {
  Abortable.call(this); // call super constructor
  // { Array of ParallelCall }
  this._calls = [];
  // { Array of Function }
  this._finishedObservers = [];
}
ParallelAbortable.prototype = {
  __proto__: Abortable.prototype,
  /**
   * @returns {Array of ParallelCall}
   */
  get results() {
    return this._calls;
  },
  /**
   * @returns {ParallelCall}
   */
  addCall() {
    const call = new ParallelCall(this);
    call.position = this._calls.length;
    this._calls.push(call);
    return call;
  },
  /**
   * Observers will be called once one of the functions
   * finishes, i.e. returns successfully or fails.
   *
   * @param {Function({ParallelCall} call)} func
   */
  addOneFinishedObserver(func) {
    assert(typeof func == "function");
    this._finishedObservers.push(func);
  },
  /**
   * Will be called once *all* of the functions finished,
   * It gives you a list of all functions that succeeded or failed,
   * respectively.
   *
   * @param {Function(
   *    {Array of ParallelCall} succeeded,
   *    {Array of ParallelCall} failed
   *   )} func
   */
  addAllFinishedObserver(func) {
    assert(typeof func == "function");
    this.addOneFinishedObserver(() => {
      if (this._calls.some(call => !call.finished)) {
        return;
      }
      const succeeded = this._calls.filter(call => call.succeeded);
      const failed = this._calls.filter(call => !call.succeeded);
      func(succeeded, failed);
    });
  },
  _notifyFinished(call) {
    for (const observer of this._finishedObservers) {
      try {
        observer(call);
      } catch (e) {
        console.error(e);
      }
    }
  },
  cancel(e) {
    for (const call of this._calls) {
      if (!call.finished && call.callerAbortable) {
        call.callerAbortable.cancel(e);
      }
    }
  },
};

/**
 * Returned by ParallelAbortable.addCall().
 * Do not create this object directly
 *
 * @param {ParallelAbortable} parallelAbortable - The controlling ParallelAbortable
 */
function ParallelCall(parallelAbortable) {
  assert(parallelAbortable instanceof ParallelAbortable);
  // {ParallelAbortable} the parent
  this._parallelAbortable = parallelAbortable;
  // {Abortable} Abortable of the caller function that should run in parallel
  this.callerAbortable = null;
  // {Integer} the order in which the function was added, and its priority
  this.position = null;
  // {boolean} false = running, pending, false = success or failure
  this.finished = false;
  // {boolean} if finished: true = returned with success, false = returned with error
  this.succeeded = false;
  // {Exception} if failed: the error or exception that the caller function returned
  this.e = null;
  // {Object} if succeeded: the result of the caller function
  this.result = null;

  this._time = Date.now();
}
ParallelCall.prototype = {
  /**
   * Returns a successCallback(result) function that you pass
   * to your function that runs in parallel.
   *
   * @returns {Function(result)} successCallback
   */
  successCallback() {
    return result => {
      ddump(
        "call " +
          this.position +
          " took " +
          (Date.now() - this._time) +
          "ms and succeeded" +
          (this.callerAbortable && this.callerAbortable._url
            ? " at <" + this.callerAbortable._url + ">"
            : "")
      );
      this.result = result;
      this.finished = true;
      this.succeeded = true;
      this._parallelAbortable._notifyFinished(this);
    };
  },
  /**
   * Returns an errorCallback(e) function that you pass
   * to your function that runs in parallel.
   *
   * @returns {Function(e)} errorCallback
   */
  errorCallback() {
    return e => {
      ddump(
        "call " +
          this.position +
          " took " +
          (Date.now() - this._time) +
          "ms and failed with " +
          (typeof e.code == "number" ? e.code + " " : "") +
          (e.toString()
            ? e.toString()
            : "unknown error, probably no host connection") +
          (this.callerAbortable && this.callerAbortable._url
            ? " at <" + this.callerAbortable._url + ">"
            : "")
      );
      this.e = e;
      this.finished = true;
      this.succeeded = false;
      this._parallelAbortable._notifyFinished(this);
    };
  },
  /**
   * Call your function that needs to run in parallel
   * and pass the resulting |Abortable| of your function here.
   *
   * @param {Abortable} abortable
   */
  setAbortable(abortable) {
    assert(abortable instanceof Abortable);
    this.callerAbortable = abortable;
  },
};

/**
 * Runs several calls in parallel.
 * Returns the result of the "highest" priority call that succeeds.
 * Unlike Promise.race(), does not return the fastest,
 * but the first in the order they were added.
 * So, the order in which the calls were added determines their priority,
 * with the first to be added being the most desirable.
 *
 * E.g. the first failed, the second is pending, the third succeeded, and the forth is pending.
 * It aborts the forth (because the third succeeded), and it waits for the second to return.
 * If the second succeeds, it is the result, otherwise the third is the result.
 *
 * @param {Function(
 *     {Object} result - Result of winner call
 *     {ParallelCall} call - Winner call info
 *   )} successCallback -  A call returned successfully
 * @param {Function(e, allErrors)} errorCallback - All calls failed.
 *     {Exception} e - The first CancelledException, and otherwise
 *       the exception returned by the first call.
 *     This is just to adhere to the standard API of errorCallback(e).
 *     {Array of Exception} allErrors - The exceptions from all calls.
 */
function PriorityOrderAbortable(successCallback, errorCallback) {
  assert(typeof successCallback == "function");
  assert(typeof errorCallback == "function");
  ParallelAbortable.call(this); // call super constructor
  this._successfulCall = null;

  this.addOneFinishedObserver(() => {
    for (const call of this._calls) {
      if (!call.finished) {
        if (this._successfulCall) {
          // abort
          if (call.callerAbortable) {
            call.callerAbortable.cancel(
              new NoLongerNeededException("Another higher call succeeded")
            );
          }
          continue;
        }
        // It's pending. do nothing and wait for it.
        return;
      }
      if (!call.succeeded) {
        // it failed. ignore it.
        continue;
      }
      if (this._successfulCall) {
        // we already have a winner. ignore it.
        continue;
      }
      try {
        successCallback(call.result, call);
        // This is the winner.
        this._successfulCall = call;
      } catch (e) {
        console.error(e);
        // If the handler failed with this data, treat this call as failed.
        call.e = e;
        call.succeeded = false;
      }
    }
    if (!this._successfulCall) {
      // all failed
      const allErrors = this._calls.map(call => call.e);
      const e =
        allErrors.find(e => e instanceof CancelledException) || allErrors[0];
      errorCallback(e, allErrors); // see docs above
    }
  });
}
PriorityOrderAbortable.prototype = Object.create(ParallelAbortable.prototype);
PriorityOrderAbortable.prototype.constructor = PriorityOrderAbortable;

function NoLongerNeededException(msg) {
  CancelledException.call(this, msg);
}
NoLongerNeededException.prototype = Object.create(CancelledException.prototype);
NoLongerNeededException.prototype.constructor = NoLongerNeededException;

// -------------------
// High level features

/**
 * Allows you to install an addon.
 *
 * Example:
 * var installer = new AddonInstaller({ xpiURL : "https://...xpi", id: "...", ...});
 * installer.install();
 *
 * @param {object} args - Contains parameters:
 * @param {string} name (Optional) - Name of the addon (not important)
 * @param {string} id (Optional) - Addon ID
 * If you pass an ID, and the addon is already installed (and the version matches),
 * then install() will do nothing.
 * After the XPI is downloaded, the ID will be verified. If it doesn't match, the
 * install will fail.
 * If you don't pass an ID, these checks will be skipped and the addon be installed
 * unconditionally.
 * It is recommended to pass at least an ID, because it can confuse some addons
 * to be reloaded at runtime.
 * @param {string} minVersion (Optional) - Minimum version of the addon
 * If you pass a minVersion (in addition to ID), and the installed addon is older than this,
 * the install will be done anyway. If the downloaded addon has a lower version,
 * the install will fail.
 * If you do not pass a minVersion, there will be no version check.
 * @param {URL} xpiURL - Where to download the XPI from
 */
function AddonInstaller(args) {
  Abortable.call(this);
  this._name = lazy.Sanitizer.label(args.name);
  this._id = lazy.Sanitizer.string(args.id);
  this._minVersion = lazy.Sanitizer.string(args.minVersion);
  this._url = lazy.Sanitizer.url(args.xpiURL);
}
AddonInstaller.prototype = Object.create(Abortable.prototype);
AddonInstaller.prototype.constructor = AddonInstaller;

/**
 * Checks whether the passed-in addon matches the
 * id and minVersion requested by the caller.
 *
 * @param {nsIAddon} addon
 * @returns {boolean} is OK
 */
AddonInstaller.prototype.matches = function (addon) {
  return (
    !this._id ||
    (this._id == addon.id &&
      (!this._minVersion ||
        Services.vc.compare(addon.version, this._minVersion) >= 0))
  );
};

/**
 * Start the installation
 *
 * @throws Exception in case of failure
 */
AddonInstaller.prototype.install = async function () {
  if (await this.isInstalled()) {
    return;
  }
  await this._installDirect();
};

/**
 * Checks whether we already have an addon installed that matches the
 * id and minVersion requested by the caller.
 *
 * @returns {boolean} is already installed and enabled
 */
AddonInstaller.prototype.isInstalled = async function () {
  if (!this._id) {
    return false;
  }
  var addon = await AddonManager.getAddonByID(this._id);
  return addon && this.matches(addon) && addon.isActive;
};

/**
 * Checks whether we already have an addon but it is disabled.
 *
 * @returns {boolean} is already installed but disabled
 */
AddonInstaller.prototype.isDisabled = async function () {
  if (!this._id) {
    return false;
  }
  const addon = await AddonManager.getAddonByID(this._id);
  return addon && !addon.isActive;
};

/**
 * Downloads and installs the addon.
 * The downloaded XPI will be checked using prompt().
 */
AddonInstaller.prototype._installDirect = async function () {
  var installer = (this._installer = await AddonManager.getInstallForURL(
    this._url,
    { name: this._name }
  ));
  installer.promptHandler = makeCallback(this, this.prompt);
  await installer.install(); // throws, if failed

  var addon = await AddonManager.getAddonByID(this._id);
  await addon.enable();

  // Wait for addon startup code to finish
  // Fixes: verify password fails with NOT_AVAILABLE in createIncomingServer()
  if ("startupPromise" in addon) {
    await addon.startupPromise;
  }
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  await wait(1000);
};

/**
 * Install confirmation. You may override this, if needed.
 *
 * @throws Exception If you want to cancel install, then throw an exception.
 */
AddonInstaller.prototype.prompt = async function (info) {
  if (!this.matches(info.addon)) {
    // happens only when we got the wrong XPI
    throw new Exception(
      "The downloaded addon XPI does not match the minimum requirements"
    );
  }
};

AddonInstaller.prototype.cancel = function () {
  if (this._installer) {
    try {
      this._installer.cancel();
    } catch (e) {
      // if install failed
      ddump(e);
    }
  }
};

// ------------
// Debug output

function deepCopy(org) {
  if (typeof org == "undefined") {
    return undefined;
  }
  if (org == null) {
    return null;
  }
  if (typeof org == "string") {
    return org;
  }
  if (typeof org == "number") {
    return org;
  }
  if (typeof org == "boolean") {
    return org;
  }
  if (typeof org == "function") {
    return org;
  }
  if (typeof org != "object") {
    throw new Error("can't copy objects of type " + typeof org + " yet");
  }

  // TODO still instanceof org != instanceof copy
  // var result = new org.constructor();
  var result = {};
  if (typeof org.length != "undefined") {
    result = [];
  }
  for (var prop in org) {
    result[prop] = deepCopy(org[prop]);
  }
  return result;
}

var gAccountSetupLogger = console.createInstance({
  prefix: "mail.setup",
  maxLogLevel: "Warn",
  maxLogLevelPref: "mail.setup.loglevel",
});

function ddump(text) {
  gAccountSetupLogger.info(text);
}

function alertPrompt(alertTitle, alertMsg) {
  Services.prompt.alert(
    Services.wm.getMostRecentWindow(""),
    alertTitle,
    alertMsg
  );
}

export const AccountCreationUtils = {
  Abortable,
  AddonInstaller,
  alertPrompt,
  assert,
  CancelledException,
  ddump,
  deepCopy,
  Exception,
  gAccountSetupLogger,
  getStringBundle,
  NotReached,
  PriorityOrderAbortable,
  PromiseAbortable,
  readURLasUTF8,
  runAsync,
  standardPorts,
  SuccessiveAbortable,
  TimeoutAbortable,
  UserCancelledException,
};
