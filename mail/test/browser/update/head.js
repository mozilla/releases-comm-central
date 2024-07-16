/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// Copied from toolkit/mozapps/update/tests/browser/head.js, stripped to parts
// used by browser_showWhatsNewPageTest.js

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  AppMenuNotifications: "resource://gre/modules/AppMenuNotifications.sys.mjs",
  UpdateListener: "resource://gre/modules/UpdateListener.sys.mjs",
});

const BIN_SUFFIX = AppConstants.platform == "win" ? ".exe" : "";
const FILE_UPDATER_BIN =
  "updater" + (AppConstants.platform == "macosx" ? ".app" : BIN_SUFFIX);
const FILE_UPDATER_BIN_BAK = FILE_UPDATER_BIN + ".bak";

const LOG_FUNCTION = info;

const MAX_UPDATE_COPY_ATTEMPTS = 10;

const DATA_URI_SPEC =
  "chrome://mochitests/content/browser/comm/mail/test/browser/update/";
/* import-globals-from testConstants.js */
Services.scriptloader.loadSubScript(DATA_URI_SPEC + "testConstants.js", this);

/* import-globals-from data/shared.js */
Services.scriptloader.loadSubScript(DATA_URI_SPEC + "data/shared.js", this);

let gOriginalUpdateAutoValue = null;

// Set to true to log additional information for debugging. To log additional
// information for individual tests set gDebugTest to false here and to true
// globally in the test.
gDebugTest = false;

// This is to accommodate the TV task which runs the tests with --verify.
requestLongerTimeout(10);

/**
 * Common tasks to perform for all tests before each one has started.
 */
add_setup(async function setupTestCommon() {
  await SpecialPowers.pushPrefEnv({
    set: [
      [PREF_APP_UPDATE_BADGEWAITTIME, 1800],
      [PREF_APP_UPDATE_DOWNLOAD_ATTEMPTS, 0],
      [PREF_APP_UPDATE_DOWNLOAD_MAXATTEMPTS, 2],
      [PREF_APP_UPDATE_LOG, gDebugTest],
      [PREF_APP_UPDATE_PROMPTWAITTIME, 3600],
      [PREF_APP_UPDATE_SERVICE_ENABLED, false],
    ],
  });

  // We need to keep the update sync manager from thinking two instances are
  // running because of the mochitest parent instance, which means we need to
  // override the directory service with a fake executable path and then reset
  // the lock. But leaving the directory service overridden causes problems for
  // these tests, so we need to restore the real service immediately after.
  // To form the path, we'll use the real executable path with a token appended
  // (the path needs to be absolute, but not to point to a real file).
  // This block is loosely copied from adjustGeneralPaths() in another update
  // test file, xpcshellUtilsAUS.js, but this is a much more limited version;
  // it's been copied here both because the full function is overkill and also
  // because making it general enough to run in both xpcshell and mochitest
  // would have been unreasonably difficult.
  const exePath = Services.dirsvc.get(XRE_EXECUTABLE_FILE, Ci.nsIFile);
  const dirProvider = {
    getFile: function AGP_DP_getFile(aProp, aPersistent) {
      // Set the value of persistent to false so when this directory provider is
      // unregistered it will revert back to the original provider.
      aPersistent.value = false;
      switch (aProp) {
        case XRE_EXECUTABLE_FILE:
          exePath.append("browser-test");
          return exePath;
      }
      return null;
    },
    QueryInterface: ChromeUtils.generateQI(["nsIDirectoryServiceProvider"]),
  };
  const ds = Services.dirsvc.QueryInterface(Ci.nsIDirectoryService);
  ds.QueryInterface(Ci.nsIProperties).undefine(XRE_EXECUTABLE_FILE);
  ds.registerProvider(dirProvider);

  const syncManager = Cc[
    "@mozilla.org/updates/update-sync-manager;1"
  ].getService(Ci.nsIUpdateSyncManager);
  syncManager.resetLock();

  ds.unregisterProvider(dirProvider);

  setUpdateTimerPrefs();
  reloadUpdateManagerData(true);
  removeUpdateFiles(true);
  UpdateListener.reset();
  AppMenuNotifications.removeNotification(/.*/);
  // Most app update mochitest-browser-chrome tests expect auto update to be
  // enabled. Those that don't will explicitly change this.
  await setAppUpdateAutoEnabledHelper(true);
});

/**
 * Common tasks to perform for all tests after each one has finished.
 */
registerCleanupFunction(async () => {
  AppMenuNotifications.removeNotification(/.*/);
  Services.env.set("MOZ_TEST_SKIP_UPDATE_STAGE", "");
  Services.env.set("MOZ_TEST_SLOW_SKIP_UPDATE_STAGE", "");
  Services.env.set("MOZ_TEST_STAGING_ERROR", "");
  UpdateListener.reset();
  AppMenuNotifications.removeNotification(/.*/);
  reloadUpdateManagerData(true);
  // Pass false when the log files are needed for troubleshooting the tests.
  removeUpdateFiles(true);
  // Always try to restore the original updater files. If none of the updater
  // backup files are present then this is just a no-op.
  await finishTestRestoreUpdaterBackup();
  // Reset the update lock once again so that we know the lock we're
  // interested in here will be closed properly (normally that happens during
  // XPCOM shutdown, but that isn't consistent during tests).
  const syncManager = Cc[
    "@mozilla.org/updates/update-sync-manager;1"
  ].getService(Ci.nsIUpdateSyncManager);
  syncManager.resetLock();
});

/**
 * Prevent nsIUpdateTimerManager from notifying nsIApplicationUpdateService
 * to check for updates by setting the app update last update time to the
 * current time minus one minute in seconds and the interval time to 12 hours
 * in seconds.
 */
function setUpdateTimerPrefs() {
  const now = Math.round(Date.now() / 1000) - 60;
  Services.prefs.setIntPref(PREF_APP_UPDATE_LASTUPDATETIME, now);
  Services.prefs.setIntPref(PREF_APP_UPDATE_INTERVAL, 43200);
}

/*
 * Sets the value of the App Auto Update setting and sets it back to the
 * original value at the start of the test when the test finishes.
 *
 * @param  enabled
 *         The value to set App Auto Update to.
 */
async function setAppUpdateAutoEnabledHelper(enabled) {
  if (gOriginalUpdateAutoValue == null) {
    gOriginalUpdateAutoValue = await UpdateUtils.getAppUpdateAutoEnabled();
    registerCleanupFunction(async () => {
      await UpdateUtils.setAppUpdateAutoEnabled(gOriginalUpdateAutoValue);
    });
  }
  await UpdateUtils.setAppUpdateAutoEnabled(enabled);
}

/**
 * For staging tests the test updater must be used and this restores the backed
 * up real updater if it exists and tries again on failure since Windows debug
 * builds at times leave the file in use. After success moveRealUpdater is
 * called to continue the setup of the test updater.
 */
function setupTestUpdater() {
  return (async function () {
    if (Services.prefs.getBoolPref(PREF_APP_UPDATE_STAGING_ENABLED)) {
      try {
        restoreUpdaterBackup();
      } catch (e) {
        logTestInfo(
          "Attempt to restore the backed up updater failed... " +
            "will try again, Exception: " +
            e
        );
        await TestUtils.waitForTick();
        await setupTestUpdater();
        return;
      }
      await moveRealUpdater();
    }
  })();
}

/**
 * Backs up the real updater and tries again on failure since Windows debug
 * builds at times leave the file in use. After success it will call
 * copyTestUpdater to continue the setup of the test updater.
 */
function moveRealUpdater() {
  return (async function () {
    try {
      // Move away the real updater
      const greBinDir = getGREBinDir();
      const updater = greBinDir.clone();
      updater.append(FILE_UPDATER_BIN);
      updater.moveTo(greBinDir, FILE_UPDATER_BIN_BAK);

      const greDir = getGREDir();
      const updateSettingsIni = greDir.clone();
      updateSettingsIni.append(FILE_UPDATE_SETTINGS_INI);
      if (updateSettingsIni.exists()) {
        updateSettingsIni.moveTo(greDir, FILE_UPDATE_SETTINGS_INI_BAK);
      }

      const precomplete = greDir.clone();
      precomplete.append(FILE_PRECOMPLETE);
      if (precomplete.exists()) {
        precomplete.moveTo(greDir, FILE_PRECOMPLETE_BAK);
      }
    } catch (e) {
      logTestInfo(
        "Attempt to move the real updater out of the way failed... " +
          "will try again, Exception: " +
          e
      );
      await TestUtils.waitForTick();
      await moveRealUpdater();
      return;
    }

    await copyTestUpdater();
  })();
}

/**
 * Copies the test updater and tries again on failure since Windows debug builds
 * at times leave the file in use.
 */
function copyTestUpdater(attempt = 0) {
  return (async function () {
    try {
      // Copy the test updater
      const greBinDir = getGREBinDir();
      const testUpdaterDir = Services.dirsvc.get("CurWorkD", Ci.nsIFile);
      const relPath = REL_PATH_DATA;
      const pathParts = relPath.split("/");
      for (let i = 0; i < pathParts.length; ++i) {
        testUpdaterDir.append(pathParts[i]);
      }

      const testUpdater = testUpdaterDir.clone();
      testUpdater.append(FILE_UPDATER_BIN);
      testUpdater.copyToFollowingLinks(greBinDir, FILE_UPDATER_BIN);

      const greDir = getGREDir();

      // On macOS, update settings is a Framework, not an INI. This was already
      // built into updater-xpcshell using the `UpdateSettings-xpcshell`
      // Framework, so we don't need to do any additional work here.
      if (AppConstants.platform != "macosx") {
        const updateSettingsIni = greDir.clone();
        updateSettingsIni.append(FILE_UPDATE_SETTINGS_INI);
        writeFile(updateSettingsIni, UPDATE_SETTINGS_CONTENTS);
      }

      const precomplete = greDir.clone();
      precomplete.append(FILE_PRECOMPLETE);
      writeFile(precomplete, PRECOMPLETE_CONTENTS);
    } catch (e) {
      if (attempt < MAX_UPDATE_COPY_ATTEMPTS) {
        logTestInfo(
          "Attempt to copy the test updater failed... " +
            "will try again, Exception: " +
            e
        );
        await TestUtils.waitForTick();
        await copyTestUpdater(attempt++);
      }
    }
  })();
}

/**
 * Restores the updater and updater related file that if there a backup exists.
 * This is called in setupTestUpdater before the backup of the real updater is
 * done in case the previous test failed to restore the file when a test has
 * finished. This is also called in finishTestRestoreUpdaterBackup to restore
 * the files when a test finishes.
 */
function restoreUpdaterBackup() {
  const greBinDir = getGREBinDir();
  const updater = greBinDir.clone();
  const updaterBackup = greBinDir.clone();
  updater.append(FILE_UPDATER_BIN);
  updaterBackup.append(FILE_UPDATER_BIN_BAK);
  if (updaterBackup.exists()) {
    if (updater.exists()) {
      updater.remove(true);
    }
    updaterBackup.moveTo(greBinDir, FILE_UPDATER_BIN);
  }

  const greDir = getGREDir();
  const updateSettingsIniBackup = greDir.clone();
  updateSettingsIniBackup.append(FILE_UPDATE_SETTINGS_INI_BAK);
  if (updateSettingsIniBackup.exists()) {
    const updateSettingsIni = greDir.clone();
    updateSettingsIni.append(FILE_UPDATE_SETTINGS_INI);
    if (updateSettingsIni.exists()) {
      updateSettingsIni.remove(false);
    }
    updateSettingsIniBackup.moveTo(greDir, FILE_UPDATE_SETTINGS_INI);
  }

  const precomplete = greDir.clone();
  const precompleteBackup = greDir.clone();
  precomplete.append(FILE_PRECOMPLETE);
  precompleteBackup.append(FILE_PRECOMPLETE_BAK);
  if (precompleteBackup.exists()) {
    if (precomplete.exists()) {
      precomplete.remove(false);
    }
    precompleteBackup.moveTo(greDir, FILE_PRECOMPLETE);
  } else if (precomplete.exists()) {
    if (readFile(precomplete) == PRECOMPLETE_CONTENTS) {
      precomplete.remove(false);
    }
  }
}

/**
 * When a test finishes this will repeatedly attempt to restore the real updater
 * and the other files for the updater if a backup of the file exists.
 */
function finishTestRestoreUpdaterBackup() {
  return (async function () {
    try {
      // Windows debug builds keep the updater file in use for a short period of
      // time after the updater process exits.
      restoreUpdaterBackup();
    } catch (e) {
      logTestInfo(
        "Attempt to restore the backed up updater failed... " +
          "will try again, Exception: " +
          e
      );

      await TestUtils.waitForTick();
      await finishTestRestoreUpdaterBackup();
    }
  })();
}
