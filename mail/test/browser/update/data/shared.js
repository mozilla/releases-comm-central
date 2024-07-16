/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Copied from toolkit/mozapps/update/tests/data/shared.js, stripped to parts
// used by browser_showWhatsNewPageTest.js.

/* Shared code for xpcshell, mochitests-chrome, and mochitest-browser-chrome. */

// Definitions needed to run eslint on this file.
/* global AppConstants, DATA_URI_SPEC, LOG_FUNCTION */
/* global Services, URL_HOST, TestUtils */

ChromeUtils.defineESModuleGetters(this, {
  UpdateUtils: "resource://gre/modules/UpdateUtils.sys.mjs",
});

const PREF_APP_UPDATE_BADGEWAITTIME = "app.update.badgeWaitTime";
const PREF_APP_UPDATE_DOWNLOAD_MAXATTEMPTS = "app.update.download.maxAttempts";
const PREF_APP_UPDATE_DOWNLOAD_ATTEMPTS = "app.update.download.attempts";
const PREF_APP_UPDATE_INTERVAL = "app.update.interval";
const PREF_APP_UPDATE_LASTUPDATETIME =
  "app.update.lastUpdateTime.background-update-timer";
const PREF_APP_UPDATE_LOG = "app.update.log";
const PREF_APP_UPDATE_PROMPTWAITTIME = "app.update.promptWaitTime";
const PREF_APP_UPDATE_SERVICE_ENABLED = "app.update.service.enabled";
const PREF_APP_UPDATE_STAGING_ENABLED = "app.update.staging.enabled";

const NS_GRE_BIN_DIR = "GreBinD";
const NS_GRE_DIR = "GreD";
const XRE_EXECUTABLE_FILE = "XREExeF";
const XRE_UPDATE_ROOT_DIR = "UpdRootD";

const DIR_PATCH = "0";
const DIR_TOBEDELETED = "tobedeleted";
const DIR_UPDATES = "updates";
const DIR_UPDATED =
  AppConstants.platform == "macosx" ? "Updated.app" : "updated";
const DIR_DOWNLOADING = "downloading";

const FILE_ACTIVE_UPDATE_XML = "active-update.xml";
const FILE_ACTIVE_UPDATE_XML_TMP = "active-update.xml.tmp";
const FILE_APPLICATION_INI = "application.ini";
const FILE_BACKUP_UPDATE_CONFIG_JSON = "backup-update-config.json";
const FILE_BACKUP_UPDATE_ELEVATED_LOG = "backup-update-elevated.log";
const FILE_BACKUP_UPDATE_LOG = "backup-update.log";
const FILE_BT_RESULT = "bt.result";
const FILE_CHANNEL_PREFS =
  AppConstants.platform == "macosx" ? "ChannelPrefs" : "channel-prefs.js";
const FILE_LAST_UPDATE_ELEVATED_LOG = "last-update-elevated.log";
const FILE_LAST_UPDATE_LOG = "last-update.log";
const FILE_PRECOMPLETE = "precomplete";
const FILE_PRECOMPLETE_BAK = "precomplete.bak";
const FILE_UPDATE_CONFIG_JSON = "update-config.json";
const FILE_UPDATE_ELEVATED_LOG = "update-elevated.log";
const FILE_UPDATE_LOG = "update.log";
const FILE_UPDATE_MAR = "update.mar";
const FILE_UPDATE_SETTINGS_FRAMEWORK = "UpdateSettings";
const FILE_UPDATE_SETTINGS_INI = "update-settings.ini";
const FILE_UPDATE_SETTINGS_INI_BAK = "update-settings.ini.bak";
const FILE_UPDATE_STATUS = "update.status";
const FILE_UPDATE_TEST = "update.test";
const FILE_UPDATE_VERSION = "update.version";
const FILE_UPDATER_INI = "updater.ini";
const FILE_UPDATES_XML = "updates.xml";
const FILE_UPDATES_XML_TMP = "updates.xml.tmp";

const UPDATE_SETTINGS_CONTENTS =
  "[Settings]\nACCEPTED_MAR_CHANNEL_IDS=xpcshell-test\n";
const PRECOMPLETE_CONTENTS = 'rmdir "nonexistent_dir/"\n';

var gDebugTest = false;

/* import-globals-from sharedUpdateXML.js */
Services.scriptloader.loadSubScript(
  DATA_URI_SPEC + "data/sharedUpdateXML.js",
  this
);

const PERMS_FILE = FileUtils.PERMS_FILE;
const PERMS_DIRECTORY = FileUtils.PERMS_DIRECTORY;

const MODE_WRONLY = FileUtils.MODE_WRONLY;
const MODE_CREATE = FileUtils.MODE_CREATE;
const MODE_APPEND = FileUtils.MODE_APPEND;
const MODE_TRUNCATE = FileUtils.MODE_TRUNCATE;

XPCOMUtils.defineLazyServiceGetter(
  this,
  "gUpdateManager",
  "@mozilla.org/updates/update-manager;1",
  "nsIUpdateManager"
);

/**
 * Reloads the update xml files.
 *
 * @param  skipFiles (optional)
 *         If true, the update xml files will not be read and the metadata will
 *         be reset. If false (the default), the update xml files will be read
 *         to populate the update metadata.
 */
function reloadUpdateManagerData(skipFiles = false) {
  gUpdateManager.internal.reload(skipFiles);
}

/**
 * Writes the updates specified to either the active-update.xml or the
 * updates.xml.
 *
 * @param  aContent
 *         The updates represented as a string to write to the XML file.
 * @param  isActiveUpdate
 *         If true this will write to the active-update.xml otherwise it will
 *         write to the updates.xml file.
 */
function writeUpdatesToXMLFile(aContent, aIsActiveUpdate) {
  const file = getUpdateDirFile(
    aIsActiveUpdate ? FILE_ACTIVE_UPDATE_XML : FILE_UPDATES_XML
  );
  writeFile(file, aContent);
}

/**
 * Writes the current update operation/state to a file in the patch
 * directory, indicating to the patching system that operations need
 * to be performed.
 *
 * @param  aStatus
 *         The status value to write.
 */
function writeStatusFile(aStatus) {
  const file = getUpdateDirFile(FILE_UPDATE_STATUS);
  writeFile(file, aStatus + "\n");
}

/**
 * Writes text to a file. This will replace existing text if the file exists
 * and create the file if it doesn't exist.
 *
 * @param  aFile
 *         The file to write to. Will be created if it doesn't exist.
 * @param  aText
 *         The text to write to the file. If there is existing text it will be
 *         replaced.
 */
function writeFile(aFile, aText) {
  const fos = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(
    Ci.nsIFileOutputStream
  );
  if (!aFile.exists()) {
    aFile.create(Ci.nsIFile.NORMAL_FILE_TYPE, PERMS_FILE);
  }
  fos.init(aFile, MODE_WRONLY | MODE_CREATE | MODE_TRUNCATE, PERMS_FILE, 0);
  fos.write(aText, aText.length);
  fos.close();
}

/**
 * Reads text from a file and returns the string.
 *
 * @param  aFile
 *         The file to read from.
 * @return The string of text read from the file.
 */
function readFile(aFile) {
  const fis = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(
    Ci.nsIFileInputStream
  );
  if (!aFile.exists()) {
    return null;
  }
  // Specifying -1 for ioFlags will open the file with the default of PR_RDONLY.
  // Specifying -1 for perm will open the file with the default of 0.
  fis.init(aFile, -1, -1, Ci.nsIFileInputStream.CLOSE_ON_EOF);
  const sis = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
    Ci.nsIScriptableInputStream
  );
  sis.init(fis);
  const text = sis.read(sis.available());
  sis.close();
  return text;
}

/**
 * Gets the specified update file or directory.
 *
 * @param   aLogLeafName
 *          The leafName of the file or directory to get.
 * @param   aWhichDir
 *          Since we started having a separate patch directory and downloading
 *          directory, there are now files with the same name that can be in
 *          either directory. This argument is optional and defaults to the
 *          patch directory for historical reasons. But if it is specified as
 *          DIR_DOWNLOADING, this function will provide the version of the file
 *          in the downloading directory. For files that aren't in the patch
 *          directory or the downloading directory, this value is ignored.
 * @return  nsIFile for the file or directory.
 */
function getUpdateDirFile(aLeafName, aWhichDir = null) {
  const file = Services.dirsvc.get(XRE_UPDATE_ROOT_DIR, Ci.nsIFile);
  switch (aLeafName) {
    case undefined:
      return file;
    case DIR_UPDATES:
    case FILE_ACTIVE_UPDATE_XML:
    case FILE_ACTIVE_UPDATE_XML_TMP:
    case FILE_UPDATE_CONFIG_JSON:
    case FILE_BACKUP_UPDATE_CONFIG_JSON:
    case FILE_UPDATE_TEST:
    case FILE_UPDATES_XML:
    case FILE_UPDATES_XML_TMP:
      file.append(aLeafName);
      return file;
    case DIR_PATCH:
    case DIR_DOWNLOADING:
    case FILE_BACKUP_UPDATE_LOG:
    case FILE_BACKUP_UPDATE_ELEVATED_LOG:
    case FILE_LAST_UPDATE_LOG:
    case FILE_LAST_UPDATE_ELEVATED_LOG:
      file.append(DIR_UPDATES);
      file.append(aLeafName);
      return file;
    case FILE_BT_RESULT:
    case FILE_UPDATE_LOG:
    case FILE_UPDATE_ELEVATED_LOG:
    case FILE_UPDATE_MAR:
    case FILE_UPDATE_STATUS:
    case FILE_UPDATE_VERSION:
    case FILE_UPDATER_INI:
      file.append(DIR_UPDATES);
      if (aWhichDir == DIR_DOWNLOADING) {
        file.append(DIR_DOWNLOADING);
      } else {
        file.append(DIR_PATCH);
      }
      file.append(aLeafName);
      return file;
  }

  throw new Error(
    "The leafName specified is not handled by this function, " +
      "leafName: " +
      aLeafName
  );
}

/**
 * Helper function for getting the nsIFile for a file in the directory where the
 * update will be staged.
 *
 * The files for the update are located two directories below the stage
 * directory since Mac OS X sets the last modified time for the root directory
 * to the current time and if the update changes any files in the root directory
 * then it wouldn't be possible to test (bug 600098).
 *
 * @param   aRelPath (optional)
 *          The relative path to the file or directory to get from the root of
 *          the stage directory. If not specified the stage directory will be
 *          returned.
 * @return  The nsIFile for the file in the directory where the update will be
 *          staged.
 */
function getStageDirFile(aRelPath) {
  let file;
  if (AppConstants.platform == "macosx") {
    file = getUpdateDirFile(DIR_PATCH);
  } else {
    file = getGREBinDir();
  }
  file.append(DIR_UPDATED);
  if (aRelPath) {
    const pathParts = aRelPath.split("/");
    for (let i = 0; i < pathParts.length; i++) {
      if (pathParts[i]) {
        file.append(pathParts[i]);
      }
    }
  }
  return file;
}

/**
 * Removes the update files that typically need to be removed by tests without
 * removing the directories since removing the directories has caused issues
 * when running tests with --verify and recursively removes the stage directory.
 *
 * @param   aRemoveLogFiles
 *          When true the update log files will also be removed. This allows
 *          for the inspection of the log files while troubleshooting tests.
 */
function removeUpdateFiles(aRemoveLogFiles) {
  let files = [
    [FILE_ACTIVE_UPDATE_XML],
    [FILE_UPDATES_XML],
    [FILE_BT_RESULT],
    [FILE_UPDATE_STATUS],
    [FILE_UPDATE_VERSION],
    [FILE_UPDATE_MAR],
    [FILE_UPDATE_MAR, DIR_DOWNLOADING],
    [FILE_UPDATER_INI],
  ];

  if (aRemoveLogFiles) {
    files = files.concat([
      [FILE_BACKUP_UPDATE_LOG],
      [FILE_LAST_UPDATE_LOG],
      [FILE_UPDATE_LOG],
      [FILE_BACKUP_UPDATE_ELEVATED_LOG],
      [FILE_LAST_UPDATE_ELEVATED_LOG],
      [FILE_UPDATE_ELEVATED_LOG],
    ]);
  }

  for (let i = 0; i < files.length; i++) {
    const file = getUpdateDirFile.apply(null, files[i]);
    try {
      if (file.exists()) {
        file.remove(false);
      }
    } catch (e) {
      logTestInfo(
        "Unable to remove file. Path: " + file.path + ", Exception: " + e
      );
    }
  }

  const stageDir = getStageDirFile();
  if (stageDir.exists()) {
    try {
      removeDirRecursive(stageDir);
    } catch (e) {
      logTestInfo(
        "Unable to remove directory. Path: " +
          stageDir.path +
          ", Exception: " +
          e
      );
    }
  }
}

/**
 * Deletes a directory and its children. First it tries nsIFile::Remove(true).
 * If that fails it will fall back to recursing, setting the appropriate
 * permissions, and deleting the current entry.
 *
 * @param  aDir
 *         nsIFile for the directory to be deleted.
 */
function removeDirRecursive(aDir) {
  if (!aDir.exists()) {
    return;
  }

  if (!aDir.isDirectory()) {
    throw new Error("Only a directory can be passed to this funtion!");
  }

  try {
    debugDump("attempting to remove directory. Path: " + aDir.path);
    aDir.remove(true);
    return;
  } catch (e) {
    logTestInfo("non-fatal error removing directory. Exception: " + e);
  }

  const dirEntries = aDir.directoryEntries;
  while (dirEntries.hasMoreElements()) {
    const entry = dirEntries.nextFile;

    if (entry.isDirectory()) {
      removeDirRecursive(entry);
    } else {
      entry.permissions = PERMS_FILE;
      try {
        debugDump("attempting to remove file. Path: " + entry.path);
        entry.remove(false);
      } catch (e) {
        logTestInfo("error removing file. Exception: " + e);
        throw e;
      }
    }
  }

  aDir.permissions = PERMS_DIRECTORY;
  try {
    debugDump("attempting to remove directory. Path: " + aDir.path);
    aDir.remove(true);
  } catch (e) {
    logTestInfo("error removing directory. Exception: " + e);
    throw e;
  }
}

/**
 * Returns the Gecko Runtime Engine directory where files other than executable
 * binaries are located. On Mac OS X this will be <bundle>/Contents/Resources/
 * and the installation directory on all other platforms.
 *
 * @return nsIFile for the Gecko Runtime Engine directory.
 */
function getGREDir() {
  return Services.dirsvc.get(NS_GRE_DIR, Ci.nsIFile);
}

/**
 * Returns the Gecko Runtime Engine Binary directory where the executable
 * binaries are located such as the updater binary (Windows and Linux) or
 * updater package (Mac OS X). On Mac OS X this will be
 * <bundle>/Contents/MacOS/ and the installation directory on all other
 * platforms.
 *
 * @return nsIFile for the Gecko Runtime Engine Binary directory.
 */
function getGREBinDir() {
  return Services.dirsvc.get(NS_GRE_BIN_DIR, Ci.nsIFile);
}

/**
 * Logs TEST-INFO messages.
 *
 * @param  aText
 *         The text to log.
 * @param  aCaller (optional)
 *         An optional Components.stack.caller. If not specified
 *         Components.stack.caller will be used.
 */
function logTestInfo(aText, aCaller) {
  const caller = aCaller ? aCaller : Components.stack.caller;
  const now = new Date();
  const hh = now.getHours();
  const mm = now.getMinutes();
  const ss = now.getSeconds();
  const ms = now.getMilliseconds();
  let time =
    (hh < 10 ? "0" + hh : hh) +
    ":" +
    (mm < 10 ? "0" + mm : mm) +
    ":" +
    (ss < 10 ? "0" + ss : ss) +
    ":";
  if (ms < 10) {
    time += "00";
  } else if (ms < 100) {
    time += "0";
  }
  time += ms;
  const msg =
    time +
    " | TEST-INFO | " +
    caller.filename +
    " | [" +
    caller.name +
    " : " +
    caller.lineNumber +
    "] " +
    aText;
  LOG_FUNCTION(msg);
}

/**
 * Logs TEST-INFO messages when gDebugTest evaluates to true.
 *
 * @param  aText
 *         The text to log.
 * @param  aCaller (optional)
 *         An optional Components.stack.caller. If not specified
 *         Components.stack.caller will be used.
 */
function debugDump(aText, aCaller) {
  if (gDebugTest) {
    const caller = aCaller ? aCaller : Components.stack.caller;
    logTestInfo(aText, caller);
  }
}
