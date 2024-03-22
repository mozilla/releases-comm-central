/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { IMServices } from "resource:///modules/IMServices.sys.mjs";
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";
import { GenericMessagePrototype } from "resource:///modules/jsProtoHelper.sys.mjs";
import { l10nHelper } from "resource:///modules/imXPCOMUtils.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  ToLocaleFormat: "resource:///modules/ToLocaleFormat.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "_", () =>
  l10nHelper("chrome://chat/locale/logger.properties")
);

/*
 * Maps file paths to promises returned by ongoing IOUtils operations on them.
 * This is so that a file can be read after a pending write operation completes
 * and vice versa (opening a file multiple times concurrently may fail on Windows).
 */
export var gFilePromises = new Map();
/**
 * Set containing log file paths that are scheduled to have deleted messages
 * removed.
 *
 * @type {Set<string>}
 */
export var gPendingCleanup = new Set();

const kPendingLogCleanupPref = "chat.logging.cleanup.pending";

XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "SHOULD_CLEANUP_LOGS",
  "chat.logging.cleanup",
  true
);

// Uses above map to queue operations on a file.
export function queueFileOperation(aPath, aOperation) {
  // Ensure the operation is queued regardless of whether the last one succeeded.
  // This is safe since the promise is returned and consumers are expected to
  // handle any errors. If there's no promise existing for the given path already,
  // queue the operation on a dummy pre-resolved promise.
  const promise = (gFilePromises.get(aPath) || Promise.resolve()).then(
    aOperation,
    aOperation
  );
  gFilePromises.set(aPath, promise);

  const cleanup = () => {
    // If no further operations have been queued, remove the reference from the map.
    if (gFilePromises.get(aPath) === promise) {
      gFilePromises.delete(aPath);
    }
  };
  // Ensure we clear unused promises whether they resolved or rejected.
  promise.then(cleanup, cleanup);

  return promise;
}

/**
 * Convenience method to append to a file using the above queue system. If any of
 * the I/O operations reject, the returned promise will reject with the same reason.
 * We open the file, append, and close it immediately. The alternative is to keep
 * it open and append as required, but we want to make sure we don't open a file
 * for reading while it's already open for writing, so we close it every time
 * (opening a file multiple times concurrently may fail on Windows).
 * Note: This function creates parent directories if required.
 */
export function appendToFile(aPath, aString, aCreate) {
  return queueFileOperation(aPath, async function () {
    await IOUtils.makeDirectory(PathUtils.parent(aPath));
    const mode = aCreate ? "create" : "append";
    try {
      await IOUtils.writeUTF8(aPath, aString, {
        mode,
      });
    } catch (error) {
      // Ignore existing file when adding the header.
      if (
        aCreate &&
        error.name == "NoModificationAllowedError" &&
        error.message.startsWith("Could not write to") &&
        error.message.includes("refusing to overwrite file")
      ) {
        return;
      }
      throw error;
    }
  });
}

// This function checks names against OS naming conventions and alters them
// accordingly so that they can be used as file/folder names.
export function encodeName(aName) {
  // Reserved device names by Windows (prefixing "%").
  const reservedNames = /^(CON|PRN|AUX|NUL|COM\d|LPT\d)$/i;
  if (reservedNames.test(aName)) {
    return "%" + aName;
  }

  // "." and " " must not be at the end of a file or folder name (appending "_").
  if (/[\. _]/.test(aName.slice(-1))) {
    aName += "_";
  }

  // Reserved characters are replaced by %[hex value]. encodeURIComponent() is
  // not sufficient, nevertheless decodeURIComponent() can be used to decode.
  function encodeReservedChars(match) {
    return "%" + match.charCodeAt(0).toString(16);
  }
  return aName.replace(/[<>:"\/\\|?*&%]/g, encodeReservedChars);
}

export function getLogFolderPathForAccount(aAccount) {
  return PathUtils.join(
    Services.dirsvc.get("ProfD", Ci.nsIFile).path,
    "logs",
    aAccount.protocol.normalizedName,
    encodeName(aAccount.normalizedName)
  );
}

export function getLogFilePathForConversation(aConv, aStartTime) {
  if (!aStartTime) {
    aStartTime = aConv.startDate / 1000;
  }
  const path = getLogFolderPathForAccount(aConv.account);
  let name = aConv.normalizedName;
  if (aConv.isChat) {
    name += ".chat";
  }
  return PathUtils.join(path, encodeName(name), getNewLogFileName(aStartTime));
}

export function getNewLogFileName(aStartTime) {
  const date = aStartTime ? new Date(aStartTime) : new Date();
  let dateTime = lazy.ToLocaleFormat("%Y-%m-%d.%H%M%S", date);
  let offset = date.getTimezoneOffset();
  if (offset < 0) {
    dateTime += "+";
    offset *= -1;
  } else {
    dateTime += "-";
  }
  const minutes = offset % 60;
  offset = (offset - minutes) / 60;
  function twoDigits(number) {
    if (number == 0) {
      return "00";
    }
    return number < 10 ? "0" + number : number;
  }
  return dateTime + twoDigits(offset) + twoDigits(minutes) + ".json";
}

/**
 * Schedules a cleanup of the logfiles contents, removing the message texts
 * from messages that were marked as deleted. This can be disabled by a pref.
 *
 * @param {string} path - Path to the logfile to clean.
 */
function queueLogFileCleanup(path) {
  if (gPendingCleanup.has(path) || !lazy.SHOULD_CLEANUP_LOGS) {
    return;
  }
  const idleCallback = () => {
    if (gFilePromises.has(path)) {
      gFilePromises.get(path).finally(() => {
        ChromeUtils.idleDispatch(idleCallback);
      });
      return;
    }
    // Queue a new file operation to ensure nothing gets appended between
    // reading the log and writing it back. This means we might run this when
    // the application isn't idle, but due to the async operations that is
    // very hard to guarantee either way.
    queueFileOperation(path, async () => {
      try {
        const logContents = await IOUtils.readUTF8(path);
        const logLines = logContents.split("\n").map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return line;
          }
        });
        let lastDeletionIndex = 0;
        const deletedMessages = new Set(
          logLines
            .filter((message, index) => {
              if (message.flags?.includes("deleted") && message.remoteId) {
                lastDeletionIndex = index;
                return true;
              }
              return false;
            })
            .map(message => message.remoteId)
        );
        for (const [index, message] of logLines.entries()) {
          // If we are past the last deletion in the logs, there is no more
          // work to be done.
          if (index >= lastDeletionIndex) {
            break;
          }
          if (
            deletedMessages.has(message.remoteId) &&
            !message.flags?.includes("deleted")
          ) {
            // Void the text of deleted messages but keep the message
            // metadata for journaling.
            message.text = "";
          }
        }
        const cleanedLog = logLines
          .map(line => {
            if (typeof line === "string") {
              return line;
            }
            return JSON.stringify(line);
          })
          .join("\n");
        await IOUtils.writeUTF8(path, cleanedLog);
      } catch (error) {
        console.error(
          "Error cleaning up log file contents for " + path + ": " + error
        );
      } finally {
        gPendingCleanup.delete(path);
        Services.prefs.setStringPref(
          kPendingLogCleanupPref,
          JSON.stringify(Array.from(gPendingCleanup.values()))
        );
      }
    });
  };
  ChromeUtils.idleDispatch(idleCallback);
  gPendingCleanup.add(path);
  Services.prefs.setStringPref(
    kPendingLogCleanupPref,
    JSON.stringify(Array.from(gPendingCleanup.values()))
  );
}

/**
 * Schedule pending log cleanups that weren't completed last time the
 * application was running.
 */
function initLogCleanup() {
  if (!lazy.SHOULD_CLEANUP_LOGS) {
    return;
  }
  // Capture the value of the pending cleanups before it gets overridden by
  // newly scheduled cleanups.
  const pendingCleanupPathValue = Services.prefs.getStringPref(
    kPendingLogCleanupPref,
    "[]"
  );
  // We are in no hurry to queue these cleanups, worst case we try to schedule
  // a cleanup for a file that is already scheduled.
  ChromeUtils.idleDispatch(() => {
    const pendingCleanupPaths = JSON.parse(pendingCleanupPathValue) ?? [];
    if (!Array.isArray(pendingCleanupPaths)) {
      console.error(
        "Pending chat log cleanup pref is not a valid array. " +
          "Assuming all chat logs are clean."
      );
      return;
    }
    for (const path of pendingCleanupPaths) {
      if (typeof path === "string") {
        queueLogFileCleanup(path);
      }
    }
  });
}

/**
 * One of these is maintained for every conversation being logged. It initializes
 * a log file and appends to it as required.
 */
class LogWriter {
  constructor(aConversation) {
    this._conv = aConversation;
    this.paths = [];
    this.startNewFile(this._conv.startDate / 1000);
  }
  /**
   * All log file paths used by this LogWriter.
   *
   * @type {string[]}
   */
  paths = [];
  /**
   * Path of the log file that is currently being written to.
   *
   * @type {string}
   */
  get currentPath() {
    return this.paths[this.paths.length - 1];
  }
  /**
   * Constructor sets this to a promise that will resolve when the log header
   * has been written.
   *
   * @type {?Promise}
   */
  _initialized = null;
  _startTime = null;
  _lastMessageTime = null;
  _messageCount = 0;
  startNewFile(aStartTime, aContinuedSession) {
    // We start a new log file every 1000 messages. The start time of this new
    // log file is the time of the next message. Since message times are in seconds,
    // if we receive 1000 messages within a second after starting the new file,
    // we will create another file, using the same start time - and so the same
    // file name. To avoid this, ensure the new start time is at least one second
    // greater than the current one. This is ugly, but should rarely be needed.
    aStartTime = Math.max(aStartTime, this._startTime + 1000);
    this._startTime = this._lastMessageTime = aStartTime;
    this._messageCount = 0;
    this.paths.push(getLogFilePathForConversation(this._conv, aStartTime));
    const account = this._conv.account;
    let header = {
      date: new Date(this._startTime),
      name: this._conv.name,
      title: this._conv.title,
      account: account.normalizedName,
      protocol: account.protocol.normalizedName,
      isChat: this._conv.isChat,
      normalizedName: this._conv.normalizedName,
    };
    if (aContinuedSession) {
      header.continuedSession = true;
    }
    header = JSON.stringify(header) + "\n";

    this._initialized = appendToFile(this.currentPath, header, true);
    // Catch the error separately so that _initialized will stay rejected if
    // writing the header failed.
    this._initialized.catch(aError =>
      console.error("Failed to initialize log file:\n" + aError)
    );
  }
  /**
   * The maximum length of time between messages, in milliseconds, before a new
   * log file is started.
   *
   * @type {number}
   */
  static kInactivityLimit = 30 * 60 * 1000;
  /**
   * The minimum time a log file must have been opened for, in milliseconds, in
   * order for a new file to be started at midnight.
   *
   * @type {number}
   */
  static kDayOverlapLimit = 3 * 60 * 60 * 1000;
  /**
   * The maximum amount of messages after which a new log file is always
   * started.
   *
   * @type {number}
   */
  static kMessageCountLimit = 1000;
  async logMessage(aMessage) {
    // aMessage.time is in seconds, we need it in milliseconds.
    const messageTime = aMessage.time * 1000;
    const messageMidnight = new Date(messageTime).setHours(0, 0, 0, 0);

    const inactivityLimitExceeded =
      !aMessage.delayed &&
      messageTime - this._lastMessageTime > LogWriter.kInactivityLimit;
    const dayOverlapLimitExceeded =
      !aMessage.delayed &&
      messageMidnight - this._startTime > LogWriter.kDayOverlapLimit;

    if (
      inactivityLimitExceeded ||
      dayOverlapLimitExceeded ||
      this._messageCount == LogWriter.kMessageCountLimit
    ) {
      // We start a new session if the inactivity limit was exceeded.
      this.startNewFile(messageTime, !inactivityLimitExceeded);
    }
    ++this._messageCount;

    if (!aMessage.delayed) {
      this._lastMessageTime = messageTime;
    }

    const msg = {
      date: new Date(messageTime),
      who: aMessage.who,
      text: aMessage.displayMessage,
      flags: [
        "outgoing",
        "incoming",
        "system",
        "autoResponse",
        "containsNick",
        "error",
        "delayed",
        "noFormat",
        "containsImages",
        "notification",
        "noLinkification",
        "isEncrypted",
        "action",
        "deleted",
      ].filter(f => aMessage[f]),
      remoteId: aMessage.remoteId,
    };
    const alias = aMessage.alias;
    if (alias && alias != msg.who) {
      msg.alias = alias;
    }
    const lineToWrite = JSON.stringify(msg) + "\n";

    await this._initialized;
    try {
      await appendToFile(this.currentPath, lineToWrite);
    } catch (error) {
      console.error("Failed to log message:\n" + error);
    }
    if (aMessage.deleted) {
      queueLogFileCleanup(this.currentPath);
    }
  }
}

var dummyLogWriter = {
  paths: null,
  currentPath: null,
  logMessage() {},
};

var gLogWritersById = new Map();
export function getLogWriter(aConversation) {
  const id = aConversation.id;
  if (!gLogWritersById.has(id)) {
    const prefName =
      "purple.logging.log_" + (aConversation.isChat ? "chats" : "ims");
    if (Services.prefs.getBoolPref(prefName)) {
      gLogWritersById.set(id, new LogWriter(aConversation));
    } else {
      gLogWritersById.set(id, dummyLogWriter);
    }
  }
  return gLogWritersById.get(id);
}

export function closeLogWriter(aConversation) {
  gLogWritersById.delete(aConversation.id);
}

/**
 * Takes a properly formatted log file name and extracts the date information
 * and filetype, returning the results as an Array.
 *
 * Filenames are expected to be formatted as:
 *
 * YYYY-MM-DD.HHmmSS+ZZzz.format
 *
 * @param aFilename the name of the file
 * @returns an Array, where the first element is a Date object for the date
 *          that the log file represents, and the file type as a string.
 */
function getDateFromFilename(aFilename) {
  const kRegExp =
    /([\d]{4})-([\d]{2})-([\d]{2}).([\d]{2})([\d]{2})([\d]{2})([+-])([\d]{2})([\d]{2}).*\.([A-Za-z]+)$/;

  const r = aFilename.match(kRegExp);
  if (!r) {
    console.error(
      "Found log file with name not matching YYYY-MM-DD.HHmmSS+ZZzz.format: " +
        aFilename
    );
    return [];
  }

  // We ignore the timezone offset for now (FIXME)
  return [new Date(r[1], r[2] - 1, r[3], r[4], r[5], r[6]), r[10]];
}

function LogMessage(aData, aConversation) {
  this._init(aData.who, aData.text, {}, aConversation);
  // Not overriding time using the init options, since init also sets the
  // property.
  this.time = Math.round(new Date(aData.date) / 1000);
  if ("alias" in aData) {
    this._alias = aData.alias;
  }
  this.remoteId = aData.remoteId;
  if (aData.flags) {
    for (const flag of aData.flags) {
      this[flag] = true;
    }
  }
}

LogMessage.prototype = {
  __proto__: GenericMessagePrototype,
  _interfaces: [Ci.imIMessage, Ci.prplIMessage],
  get displayMessage() {
    return this.originalMessage;
  },
};

class LogConversation {
  /**
   * @property title
   * @type {string}
   */
  /**
   * @property name
   * @type {string}
   */
  /**
   * Value in microseconds.
   *
   * @property startDate
   * @type {number}
   */
  /**
   *
   * @param {imIMessage[]} aMessages
   * @param {object} aProperties - Object containing any properties to copy onto
   *   this instance. To set isChat, provide _isChat in this object. Meanwhile
   *   the buddy and account properties can not be directly influenced.
   */
  constructor(aMessages, aProperties) {
    this._messages = aMessages;
    for (const property in aProperties) {
      this[property] = aProperties[property];
    }
  }
  /**
   * @type {boolean}
   */
  get isChat() {
    return this._isChat;
  }
  /**
   * Always null (compatibility with prplIConversation).
   *
   * @type {prplIAccountBuddy}
   */
  get buddy() {
    return null;
  }
  /**
   * Simplified account implementation:
   *  - alias will always be empty
   *  - name (always the normalizedName)
   *  - statusInfo will return IMServices.core.globalUserStatus
   *  - protocol will only contain a "name" attribute, with the prpl's
   *    normalized name.
   * Other methods/attributes aren't implemented.
   *
   * @type {imIAccount}
   */
  get account() {
    return {
      alias: "",
      name: this._accountName,
      normalizedName: this._accountName,
      protocol: { name: this._protocolName },
      statusInfo: IMServices.core.globalUserStatus,
    };
  }
  /**
   * @returns {imIMessage[]}
   */
  getMessages() {
    // Start with the newest message to filter out older versions of the same
    // message. Also filter out deleted messages.
    return this._messages.map(m => new LogMessage(m, this));
  }
}

/**
 * A Log object represents one or more log files. The constructor expects one
 * argument, which is either a single path to a json log file or an array of
 * objects each having two properties:
 *   path: The full path of the (json only) log file it represents.
 *   time: The Date object extracted from the filename of the logfile.
 *
 * The returned Log object's time property will be:
 *   For a single file - exact time extracted from the name of the log file.
 *   For a set of files - the time extracted, reduced to the day.
 */
class Log {
  /**
   *
   * @param {{path: string, time: Date}[]|string} aEntries
   */
  constructor(aEntries) {
    if (typeof aEntries == "string") {
      // Assume that aEntries is a single path.
      const path = aEntries;
      this.path = path;
      const [date, format] = getDateFromFilename(PathUtils.filename(path));
      if (!date || !format) {
        this.time = 0;
        return;
      }
      this.time = date.valueOf() / 1000;
      // Wrap the path in an array
      this._entryPaths = [path];
      return;
    }

    if (!aEntries.length) {
      throw new Error(
        "Log was passed an invalid argument, " +
          "expected a non-empty array or a string."
      );
    }

    // Assume aEntries is an array of objects.
    // Sort our list of entries for this day in increasing order.
    aEntries.sort((aLeft, aRight) => aLeft.time - aRight.time);

    this._entryPaths = aEntries.map(entry => entry.path);
    // Calculate the timestamp for the first entry down to the day.
    const timestamp = new Date(aEntries[0].time);
    timestamp.setHours(0);
    timestamp.setMinutes(0);
    timestamp.setSeconds(0);

    /**
     * Timestamp for the first entry down to the day. Value in seconds.
     *
     * @property
     * @type {number}
     */
    this.time = timestamp.valueOf() / 1000;
    /**
     * Path is used to uniquely identify a Log, and sometimes used to
     * quickly determine which directory a log file is from.
     *
     * @property
     * @type {string}
     */
    // We'll use the first file's path.
    this.path = aEntries[0].path;
  }

  /**
   * @type {?string[]}
   */
  _entryPaths = null;

  /**
   * Read the set of log files asynchronously and return a promise that
   * resolves to a LogConversation instance. Even if a file contains some
   * junk (invalid JSON), messages that are valid will be read. If the first
   * line of metadata is corrupt however, the data isn't useful and the
   * promise will resolve to null.
   *
   * @returns {Promise<?LogConversation>}
   */
  async getConversation() {
    /*
     */
    let messages = [];
    const properties = {};
    let firstFile = true;
    const decoder = new TextDecoder();
    const lastRemoteIdIndex = {};
    for (const path of this._entryPaths) {
      let lines;
      try {
        const contents = await queueFileOperation(path, () =>
          IOUtils.read(path)
        );
        lines = decoder.decode(contents).split("\n");
      } catch (aError) {
        console.error('Error reading log file "' + path + '":\n' + aError);
        continue;
      }
      let nextLine = lines.shift();
      const filename = PathUtils.filename(path);

      let data;
      try {
        // This will fail if either nextLine is undefined, or not valid JSON.
        data = JSON.parse(nextLine);
      } catch (aError) {
        messages.push({
          who: "sessionstart",
          date: getDateFromFilename(filename)[0],
          text: lazy._("badLogfile", filename),
          flags: ["noLog", "notification", "error", "system"],
        });
        continue;
      }

      if (firstFile || !data.continuedSession) {
        messages.push({
          who: "sessionstart",
          date: getDateFromFilename(filename)[0],
          text: "",
          flags: ["noLog", "notification"],
        });
      }

      if (firstFile) {
        properties.startDate = new Date(data.date) * 1000;
        properties.name = data.name;
        properties.title = data.title;
        properties._accountName = data.account;
        properties._protocolName = data.protocol;
        properties._isChat = data.isChat;
        properties.normalizedName = data.normalizedName;
        firstFile = false;
      }

      while (lines.length) {
        nextLine = lines.shift();
        if (!nextLine) {
          break;
        }
        try {
          const message = JSON.parse(nextLine);

          // Backwards compatibility for old action messages.
          if (
            !message.flags.includes("action") &&
            message.text?.startsWith("/me ")
          ) {
            message.flags.push("action");
            message.text = message.text.slice(4);
          }

          if (message.remoteId) {
            lastRemoteIdIndex[message.remoteId] = messages.length;
          }
          messages.push(message);
        } catch (e) {
          // If a message line contains junk, just ignore the error and
          // continue reading the conversation.
        }
      }
    }

    if (firstFile) {
      // All selected log files are invalid.
      return null;
    }

    // Ignore older versions of edited messages and deleted messages.
    messages = messages.filter((message, index) => {
      if (
        message.remoteId &&
        lastRemoteIdIndex.hasOwnProperty(message.remoteId) &&
        index < lastRemoteIdIndex[message.remoteId]
      ) {
        return false;
      }
      return !message.flags.includes("deleted");
    });

    return new LogConversation(messages, properties);
  }
}

/**
 * logsGroupedByDay() organizes log entries by date.
 *
 * @param {string[]} aEntries - paths of log files to be parsed.
 * @returns {Log[]} Logs, ordered by day.
 */
function logsGroupedByDay(aEntries) {
  if (!Array.isArray(aEntries)) {
    return [];
  }

  const entries = {};
  for (const path of aEntries) {
    const [logDate, logFormat] = getDateFromFilename(PathUtils.filename(path));
    if (!logDate) {
      // We'll skip this one, since it's got a busted filename.
      continue;
    }

    const dateForID = new Date(logDate);
    // If the file isn't a JSON file, ignore it.
    if (logFormat != "json") {
      continue;
    }
    // We want to cluster all of the logs that occur on the same day
    // into the same Arrays. We clone the date for the log, reset it to
    // the 0th hour/minute/second, and use that to construct an ID for the
    // Array we'll put the log in.
    dateForID.setHours(0);
    dateForID.setMinutes(0);
    dateForID.setSeconds(0);
    const dayID = dateForID.toISOString();

    if (!(dayID in entries)) {
      entries[dayID] = [];
    }

    entries[dayID].push({
      path,
      time: logDate,
    });
  }

  const days = Object.keys(entries);
  days.sort();
  return days.map(dayID => new Log(entries[dayID]));
}

/**
 * @implements {nsIObserver}
 */
export class Logger {
  QueryInterface = ChromeUtils.generateQI(["nsIObserver"]);

  constructor() {
    IOUtils.profileBeforeChange.addBlocker(
      "Chat logger: writing all pending messages",
      async function () {
        for (const promise of gFilePromises.values()) {
          try {
            await promise;
          } catch (aError) {
            // Ignore the error, whatever queued the operation will take care of it.
          }
        }
      }
    );

    Services.obs.addObserver(this, "new-text");
    Services.obs.addObserver(this, "conversation-closed");
    Services.obs.addObserver(this, "conversation-left-chat");
    initLogCleanup();
  }

  /**
   * Returned Promise resolves to an array of entries for the
   * log folder if it exists, otherwise null.
   *
   * @returns {Promise<string[]>}
   */
  async _getLogEntries(aAccount, aNormalizedName) {
    let path;
    try {
      path = PathUtils.join(
        getLogFolderPathForAccount(aAccount),
        encodeName(aNormalizedName)
      );
      if (await queueFileOperation(path, () => IOUtils.exists(path))) {
        return await IOUtils.getChildren(path);
      }
    } catch (aError) {
      console.error(
        'Error getting directory entries for "' + path + '":\n' + aError
      );
    }
    return [];
  }
  /**
   * @param {string} aFilePath
   * @param {boolean} [aGroupByDay]
   * @returns {Promise<Log>}
   */
  async getLogFromFile(aFilePath, aGroupByDay) {
    if (!aGroupByDay) {
      return new Log(aFilePath);
    }
    let [targetDate] = getDateFromFilename(PathUtils.filename(aFilePath));
    if (!targetDate) {
      return null;
    }

    targetDate = targetDate.toDateString();

    // We'll assume that the files relevant to our interests are
    // in the same folder as the one provided.
    const relevantEntries = [];
    for (const path of await IOUtils.getChildren(PathUtils.parent(aFilePath))) {
      const stat = await IOUtils.stat(path);
      if (stat.type === "directory") {
        continue;
      }
      const [logTime] = getDateFromFilename(PathUtils.filename(path));
      // If someone placed a 'foreign' file into the logs directory,
      // pattern matching fails and getDateFromFilename() returns [].
      if (logTime && targetDate == logTime.toDateString()) {
        relevantEntries.push({
          path,
          time: logTime,
        });
      }
    }
    return new Log(relevantEntries);
  }

  /**
   * Returns a promise that resolves to the log file paths if a log writer
   * exists for the conversation, or null otherwise. The promise resolves
   * after any pending I/O operations on the files complete.
   *
   * @param {prplIConversation} aConversation
   * @returns {Promise<string[]>}
   */
  async getLogPathsForConversation(aConversation) {
    const writer = gLogWritersById.get(aConversation.id);
    // Resolve to null if we haven't created a LogWriter yet for this conv, or
    // if logging is disabled (paths will be null).
    if (!writer || !writer.paths) {
      return null;
    }
    const paths = writer.paths;
    // Wait for any pending file operations to finish, then resolve to the paths
    // regardless of whether these operations succeeded.
    for (const path of paths) {
      await gFilePromises.get(path);
    }
    return paths;
  }
  /**
   * Get logs for a contact.
   *
   * @param {imIContact} aContact
   * @returns {Promise<Log[]}
   */
  async getLogsForContact(aContact) {
    let entries = [];
    for (const buddy of aContact.getBuddies()) {
      for (const accountBuddy of buddy.getAccountBuddies()) {
        entries = entries.concat(
          await this._getLogEntries(
            accountBuddy.account,
            accountBuddy.normalizedName
          )
        );
      }
    }
    return logsGroupedByDay(entries);
  }
  /**
   * Get logs for a conversation.
   *
   * @param {prplIConversation} aConversation
   * @returns {Promise<Log[]>}
   */
  getLogsForConversation(aConversation) {
    let name = aConversation.normalizedName;
    if (aConversation.isChat) {
      name += ".chat";
    }

    return this._getLogEntries(aConversation.account, name).then(entries =>
      logsGroupedByDay(entries)
    );
  }
  /**
   * GetLogs that are from the same conversation.
   *
   * @param {Log} log
   * @returns {Promise<Log[]>}
   */
  async getSimilarLogs(log) {
    let entries;
    try {
      entries = await IOUtils.getChildren(PathUtils.parent(log.path));
    } catch (aError) {
      console.error(
        'Error getting similar logs for "' + log.path + '":\n' + aError
      );
    }
    // If there was an error, this will return an empty array.
    return logsGroupedByDay(entries);
  }

  /**
   * Returns the folder storing all logs for aAccount.
   *
   * @param {imIAccount} aAccount
   * @returns {string}
   */
  getLogFolderPathForAccount(aAccount) {
    return getLogFolderPathForAccount(aAccount);
  }

  /**
   * Removes the folder storing all logs for aAccount.
   * Be sure the account is disconnected before using this.
   *
   * @param {imIAccount} aAccount - Account to remove the logs of.
   */
  deleteLogFolderForAccount(aAccount) {
    if (!aAccount.disconnecting && !aAccount.disconnected) {
      throw new Error(
        "Account must be disconnected first before deleting logs."
      );
    }

    if (aAccount.disconnecting) {
      console.error(
        "Account is still disconnecting while we attempt to remove logs."
      );
    }

    const logPath = this.getLogFolderPathForAccount(aAccount);
    // Find all operations on files inside the log folder.
    const pendingPromises = [];
    function checkLogFiles(promiseOperation, filePath) {
      if (filePath.startsWith(logPath)) {
        pendingPromises.push(promiseOperation);
      }
    }
    gFilePromises.forEach(checkLogFiles);
    // After all operations finish, remove the whole log folder.
    return Promise.all(pendingPromises)
      .then(() => {
        IOUtils.remove(logPath, { recursive: true });
      })
      .catch(aError =>
        console.error("Failed to remove log folders:\n" + aError)
      );
  }

  /**
   * Asynchronously iterates through log folders for all prpls and accounts and
   * invokes the callback on every log file. Returns a promise that resolves when
   * iteration is complete. If the callback returns a promise, iteration pauses
   * until the promise resolves. If the callback throws (or rejects), iteration
   * will stop and the returned promise will reject with the same error.
   *
   * @param {{processLog(string): Promise}} aCallback - The callback can return
   *   a promise. If it does, then it will not be called on the next log until
   *   this promise resolves. If it throws (or rejects), iteration will stop.
   */
  async forEach(aCallback) {
    const getAllSubdirs = async function (aPaths, aErrorMsg) {
      let entries = [];
      for (const path of aPaths) {
        try {
          entries = entries.concat(await IOUtils.getChildren(path));
        } catch (aError) {
          if (aErrorMsg) {
            console.error(aErrorMsg + "\n" + aError);
          }
        }
      }
      const filteredPaths = [];
      for (const path of entries) {
        const stat = await IOUtils.stat(path);
        if (stat.type === "directory") {
          filteredPaths.push(path);
        }
      }
      return filteredPaths;
    };

    const logsPath = PathUtils.join(
      Services.dirsvc.get("ProfD", Ci.nsIFile).path,
      "logs"
    );
    const prpls = await getAllSubdirs([logsPath]);
    const accounts = await getAllSubdirs(
      prpls,
      "Error while sweeping prpl folder:"
    );
    const logFolders = await getAllSubdirs(
      accounts,
      "Error while sweeping account folder:"
    );
    for (const folder of logFolders) {
      try {
        for (const path of await IOUtils.getChildren(folder)) {
          const stat = await IOUtils.stat(path);
          if (stat.type === "directory" || !path.endsWith(".json")) {
            continue;
          }
          await aCallback.processLog(path);
        }
      } catch (aError) {
        // If the callback threw, reject the promise and let the caller handle it.
        if (!DOMException.isInstance(aError)) {
          throw aError;
        }
        console.error("Error sweeping log folder:\n" + aError);
      }
    }
  }

  observe(aSubject, aTopic) {
    switch (aTopic) {
      case "new-text": {
        let excludeBecauseEncrypted = false;
        if (aSubject.isEncrypted) {
          excludeBecauseEncrypted = !Services.prefs.getBoolPref(
            "messenger.account." +
              aSubject.conversation.account.id +
              ".options.otrAllowMsgLog",
            Services.prefs.getBoolPref("chat.otr.default.allowMsgLog")
          );
        }
        if (!aSubject.noLog && !excludeBecauseEncrypted) {
          const log = getLogWriter(aSubject.conversation);
          log.logMessage(aSubject);
        }
        break;
      }
      case "conversation-closed":
      case "conversation-left-chat":
        closeLogWriter(aSubject);
        break;
      default:
        throw new Error("Unexpected notification " + aTopic);
    }
  }
}

export const logs = new Logger();
