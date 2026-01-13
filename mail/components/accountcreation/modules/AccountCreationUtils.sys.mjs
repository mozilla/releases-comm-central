/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
/**
 * Some common, generic functions
 */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AddonManager: "resource://gre/modules/AddonManager.sys.mjs",
  Sanitizer: "resource:///modules/accountcreation/Sanitizer.sys.mjs",
});

import { setTimeout, clearTimeout } from "resource://gre/modules/Timer.sys.mjs";

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

/**
 * @param {string} bundleURI - chrome URL to properties file
 * @returns {nsIStringBundle}
 */
function getStringBundle(bundleURI) {
  try {
    return Services.strings.createBundle(bundleURI);
  } catch (e) {
    throw new Error(
      "Failed to get stringbundle URI <" + bundleURI + ">. Error: " + e
    );
  }
}

// ---------
// Exception

class NotReached extends Error {
  constructor(msg) {
    super(msg); // call super constructor
    console.error(this);
  }
}

class CancelledException extends Error {}

class UserCancelledException extends CancelledException {
  constructor(msg) {
    // The user knows they cancelled so I don't see a need
    // for a message to that effect.
    if (!msg) {
      msg = "User cancelled";
    }
    super(msg);
  }
}

// -------------------
// High level features

class AddonInstaller {
  /**
   * @type {AbortSignal}
   */
  #signal;

  /**
   * Allows you to install an addon.
   *
   * Example:
   * var installer = new AddonInstaller({ xpiURL : "https://...xpi", id: "...", ...});
   * installer.install();
   *
   * @param {object} args - Contains parameters:
   * @param {string} [args.name] - Name of the addon (not important).
   * @param {string} [args.id] - Addon ID.
   *   If you pass an ID, and the addon is already installed (and the version
   *   matches), then install() will do nothing.
   *   After the XPI is downloaded, the ID will be verified. If it doesn't match,
   *   the install will fail.
   *   If you don't pass an ID, these checks will be skipped and the addon be
   *   installed unconditionally.
   *   It is recommended to pass at least an ID, because it can confuse some
   *   addons to be reloaded at runtime.
   * @param {string} [args.minVersion] - Minimum version of the addon.
   *   If you pass a minVersion (in addition to ID), and the installed addon is
   *   older than this, the install will be done anyway.
   *   If the downloaded addon has a lower version, the install will fail.
   *   If you do not pass a minVersion, there will be no version check.
   * @param {string} args.xpiURL - Where to download the XPI from.
   * @param {AbortSignal} signal - Signal indicating when the installation
   *   should be aborted (if possible).
   */
  constructor(args, signal) {
    this._name = lazy.Sanitizer.label(args.name);
    this._id = lazy.Sanitizer.string(args.id);
    this._minVersion = lazy.Sanitizer.string(args.minVersion);
    this._url = lazy.Sanitizer.url(args.xpiURL);
    this.#signal = signal;
  }

  /**
   * Checks whether the passed-in addon matches the
   * id and minVersion requested by the caller.
   *
   * @param {object} addon
   * @returns {boolean} true if matches
   */
  matches(addon) {
    return (
      !this._id ||
      (this._id == addon.id &&
        (!this._minVersion ||
          Services.vc.compare(addon.version, this._minVersion) >= 0))
    );
  }

  /**
   * Start the installation.
   *
   * @throws {Error} in case of failure
   */
  async install() {
    if (await this.isInstalled()) {
      return;
    }
    await this._installDirect();
  }

  /**
   * Checks whether we already have an addon installed that matches the
   * id and minVersion requested by the caller.
   *
   * @returns {boolean} true if the add-on is already installed and enabled.
   */
  async isInstalled() {
    if (!this._id) {
      return false;
    }
    const addon = await lazy.AddonManager.getAddonByID(this._id);
    return addon && this.matches(addon) && addon.isActive;
  }

  /**
   * Checks whether we already have an addon but it is disabled.
   *
   * @returns {boolean} true if the add-on is already installed but disabled.
   */
  async isDisabled() {
    if (!this._id) {
      return false;
    }
    const addon = await lazy.AddonManager.getAddonByID(this._id);
    return addon && !addon.isActive;
  }

  /**
   * Downloads and installs the addon.
   * The downloaded XPI will be checked using prompt().
   */
  async _installDirect() {
    this.#signal.addEventListener("abort", this.cancel, { once: true });
    try {
      this._installer = await lazy.AddonManager.getInstallForURL(this._url, {
        name: this._name,
      });
      this._installer.promptHandler = this.prompt;
      await this._installer.install(); // throws, if failed
    } finally {
      this.#signal.removeEventListener("abort", this.cancel, { once: true });
      delete this._installer;
    }

    const addon = await lazy.AddonManager.getAddonByID(this._id);
    await addon.enable();

    // Wait for addon startup code to finish
    // Fixes: verify password fails with NOT_AVAILABLE in createIncomingServer()
    if ("startupPromise" in addon) {
      await addon.startupPromise;
    }
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    await wait(1000);
  }

  /**
   * Install confirmation. You may override this, if needed.
   *
   * @throws {Error} If you want to cancel install, then throw an exception.
   */
  prompt = async info => {
    if (!this.matches(info.addon)) {
      // happens only when we got the wrong XPI
      throw new Error(
        "The downloaded addon XPI does not match the minimum requirements"
      );
    }
  };

  cancel = () => {
    if (this._installer) {
      try {
        this._installer.cancel();
      } catch (e) {
        // if install failed
        gAccountSetupLogger.warn(e);
      }
    }
  };
}

/**
 * Deep copy method that supports functions (as opposed to JSON based cloning
 * and structuredClone). Only arrays and objects are actually copied, everything
 * else is kept the same.
 *
 * @param {any} org
 * @returns {any}
 */
function deepCopy(org) {
  if (typeof org == "undefined") {
    return undefined;
  }
  if (org == null) {
    return null;
  }
  if (["string", "number", "boolean", "function"].includes(typeof org)) {
    return org;
  }
  if (typeof org != "object") {
    throw new Error("can't copy objects of type " + typeof org + " yet");
  }
  if (Array.isArray(org)) {
    return org.map(value => deepCopy(value));
  }

  // TODO still instanceof org != instanceof copy
  var result = {};
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

/**
 * Resolves with the value of the first promise in the order that they are
 * passed that resolves successfully. This is slightly different from
 * Promise.any, which waits for the quickest successful promise. If an
 * AbortController is passed as second parameter, abort is called once the first
 * resolution happens. If all promises fail, abort is never used.
 *
 * @param {Promise[]} priorityQueue - The promises to wait for.
 * @param {AbortController} abortController - Abort controller to call abort on
 *   if a promise succeeds.
 * @returns {{value: any, index: number}} - The value the first successful promise
 *   resolved with and its position in the arguments.
 * @throws {AggregateError} If all calls failed an AggregateError of the rejection
 *   resons is thrown.
 */
async function promiseFirstSuccessful(priorityQueue, abortController) {
  for (const [index, promise] of priorityQueue.entries()) {
    try {
      const result = await promise;
      abortController.abort(new Error("Higher priority promise succeeded"));
      // Consume all rejections.
      Promise.allSettled(priorityQueue).catch(error =>
        gAccountSetupLogger.debug(error)
      );
      return {
        value: result,
        index,
      };
    } catch (error) {
      continue;
    }
  }
  return Promise.any(priorityQueue);
}

/**
 * This is a implementation equivalent to AbortSignal.timeout which we can't use
 * at this time, since it looks for a window global to run its timers in.
 *
 * @param {number} time - Time to wait before aborting in miliseconds.
 * @returns {AbortSignal} Abort signal that will abort the given amount of time
 *  in the future.
 */
function abortSignalTimeout(time) {
  const abortController = new AbortController();
  setTimeout(() => abortController.abort(new Error(`${time}ms timeout`)), time);
  return abortController.signal;
}

/**
 * A timeout that can be aborted with an abort signal.
 *
 * @param {number} time - Time in miliseconds to wait for.
 * @param {AbortSignal} signal - The signal to listen to if the timeout should
 *   be aborted.
 * @returns {Promsie} A promise that resolves if the time has expired or rejects
 *   if the signal indicated an abort.
 */
async function abortableTimeout(time, signal) {
  const promiseWithResolvers = Promise.withResolvers();
  const timeout = setTimeout(promiseWithResolvers.resolve, time);
  const abortListener = () => {
    clearTimeout(timeout);
    promiseWithResolvers.reject(signal.reason);
  };
  signal.addEventListener("abort", abortListener, { once: true });
  await promiseWithResolvers.promise;
  signal.removeEventListener("abort", abortListener, { once: true });
}

export const AccountCreationUtils = {
  abortableTimeout,
  abortSignalTimeout,
  AddonInstaller,
  assert,
  CancelledException,
  deepCopy,
  gAccountSetupLogger,
  getStringBundle,
  NotReached,
  promiseFirstSuccessful,
  standardPorts,
  UserCancelledException,
};
