/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

const EXPORTED_SYMBOLS = ["EnigmailKeyRefreshService"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

Cu.importGlobalProperties(["crypto"]);

XPCOMUtils.defineLazyModuleGetters(this, {
  EnigmailKeyRing: "chrome://openpgp/content/modules/keyRing.jsm",
  EnigmailKeyServer: "chrome://openpgp/content/modules/keyserver.jsm",
  EnigmailKeyserverURIs: "chrome://openpgp/content/modules/keyserverUris.jsm",
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  Services: "resource://gre/modules/Services.jsm",
});

const ONE_HOUR_IN_MILLISEC = 60 * 60 * 1000;

let gTimer = null;

function getTimer() {
  if (gTimer === null) {
    gTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
  }
  return gTimer;
}

function calculateMaxTimeForRefreshInMilliseconds(totalPublicKeys) {
  const millisecondsAvailableForRefresh =
    Services.prefs.getIntPref("temp.openpgp.hoursPerWeekEnigmailIsOn") *
    ONE_HOUR_IN_MILLISEC;
  return Math.floor(millisecondsAvailableForRefresh / totalPublicKeys);
}

function calculateWaitTimeInMilliseconds(totalPublicKeys) {
  const randomNumber = crypto.getRandomValues(new Uint32Array(1));
  const maxTimeForRefresh = calculateMaxTimeForRefreshInMilliseconds(
    totalPublicKeys
  );
  const minDelay =
    Services.prefs.getIntPref("temp.openpgp.refreshMinDelaySeconds") * 1000;

  EnigmailLog.DEBUG(
    "keyRefreshService.jsm: Wait time = random number: " +
      randomNumber +
      " % max time for refresh: " +
      maxTimeForRefresh +
      "\n"
  );

  let millisec = randomNumber % maxTimeForRefresh;
  if (millisec < minDelay) {
    millisec += minDelay;
  }

  EnigmailLog.DEBUG(
    "keyRefreshService.jsm: Time until next refresh in milliseconds: " +
      millisec +
      "\n"
  );

  return millisec;
}

function refreshKey() {
  const timer = getTimer();
  refreshWith(EnigmailKeyServer, timer, true);
}

function restartTimerInOneHour(timer) {
  timer.initWithCallback(
    refreshKey,
    ONE_HOUR_IN_MILLISEC,
    Ci.nsITimer.TYPE_ONE_SHOT
  );
}

function setupNextRefresh(timer, waitTime) {
  timer.initWithCallback(refreshKey, waitTime, Ci.nsITimer.TYPE_ONE_SHOT);
}

function logMissingInformation(keyIdsExist, validKeyserversExist) {
  if (!keyIdsExist) {
    EnigmailLog.DEBUG(
      "keyRefreshService.jsm: No keys available to refresh yet. Will recheck in an hour.\n"
    );
  }
  if (!validKeyserversExist) {
    EnigmailLog.DEBUG(
      "keyRefreshService.jsm: Either no keyservers exist or the protocols specified are invalid. Will recheck in an hour.\n"
    );
  }
}

function getRandomKeyId(randomNumber) {
  const keyRingLength = EnigmailKeyRing.getAllKeys().keyList.length;

  if (keyRingLength === 0) {
    return null;
  }

  return EnigmailKeyRing.getAllKeys().keyList[randomNumber % keyRingLength]
    .keyId;
}

function refreshKeyIfReady(keyserver, readyToRefresh, keyId) {
  if (readyToRefresh) {
    EnigmailLog.DEBUG(
      "keyRefreshService.jsm: refreshing key ID " + keyId + "\n"
    );
    return keyserver.download(keyId);
  }

  return Promise.resolve(0);
}

async function refreshWith(keyserver, timer, readyToRefresh) {
  const keyId = getRandomKeyId(crypto.getRandomValues(new Uint32Array(1)));
  const keyIdsExist = keyId !== null;
  const validKeyserversExist = EnigmailKeyserverURIs.validKeyserversExist();
  const ioService = Services.io;

  if (keyIdsExist && validKeyserversExist) {
    if (ioService && !ioService.offline) {
      // don't try to refresh if we are offline
      await refreshKeyIfReady(keyserver, readyToRefresh, keyId);
    } else {
      EnigmailLog.DEBUG(
        "keyRefreshService.jsm: offline - not refreshing any key\n"
      );
    }
    const waitTime = calculateWaitTimeInMilliseconds(
      EnigmailKeyRing.getAllKeys().keyList.length
    );
    setupNextRefresh(timer, waitTime);
  } else {
    logMissingInformation(keyIdsExist, validKeyserversExist);
    restartTimerInOneHour(timer);
  }
}

/**
 * Starts a process to continuously refresh keys on a random time interval and in random order.
 *
 * The default time period for all keys to be refreshed is one week, although the user can specifically set this in their preferences
 * The wait time to refresh the next key is selected at random, from a range of zero milliseconds to the maximum time to refresh a key
 *
 * The maximum time to refresh a single key is calculated by averaging the total refresh time by the total number of public keys to refresh
 * For example, if a user has 12 public keys to refresh, the maximum time to refresh a single key (by default) will be: milliseconds per week divided by 12
 *
 * This service does not keep state, it will restart each time Enigmail is initialized.
 *
 * @param keyserver   | dependency injected for testability
 */
function start(keyserver) {
  if (Services.prefs.getBoolPref("temp.openpgp.keyRefreshOn")) {
    EnigmailLog.DEBUG("keyRefreshService.jsm: Started\n");
    const timer = getTimer();
    refreshWith(keyserver, timer, false);
  }
}

/*
  This module intializes the continuous key refresh functionality. This includes randomly selecting th key to refresh and the timing to wait between each refresh
*/

var EnigmailKeyRefreshService = {
  start,
};
