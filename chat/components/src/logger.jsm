/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["Logger"];

const { Services } = ChromeUtils.import("resource:///modules/imServices.jsm");
const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  ClassInfo: "resource:///modules/imXPCOMUtils.jsm",
  GenericMessagePrototype: "resource:///modules/jsProtoHelper.jsm",
  l10nHelper: "resource:///modules/imXPCOMUtils.jsm",
  ToLocaleFormat: "resource:///modules/ToLocaleFormat.jsm",
});

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://chat/locale/logger.properties")
);

const kLineBreak = "@mozilla.org/windows-registry-key;1" in Cc ? "\r\n" : "\n";

/*
 * Maps file paths to promises returned by ongoing IOUtils operations on them.
 * This is so that a file can be read after a pending write operation completes
 * and vice versa (opening a file multiple times concurrently may fail on Windows).
 */
var gFilePromises = new Map();

// Uses above map to queue operations on a file.
function queueFileOperation(aPath, aOperation) {
  // Ensure the operation is queued regardless of whether the last one succeeded.
  // This is safe since the promise is returned and consumers are expected to
  // handle any errors. If there's no promise existing for the given path already,
  // queue the operation on a dummy pre-resolved promise.
  let promise = (gFilePromises.get(aPath) || Promise.resolve()).then(
    aOperation,
    aOperation
  );
  gFilePromises.set(aPath, promise);

  let cleanup = () => {
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
function appendToFile(aPath, aString, aCreate) {
  return queueFileOperation(aPath, async function() {
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
        error.name == "UnknownError" &&
        error.message.startsWith("Refusing to overwrite the file")
      ) {
        return;
      }
      throw error;
    }
  });
}

// This function checks names against OS naming conventions and alters them
// accordingly so that they can be used as file/folder names.
function encodeName(aName) {
  // Reserved device names by Windows (prefixing "%").
  let reservedNames = /^(CON|PRN|AUX|NUL|COM\d|LPT\d)$/i;
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

function getLogFolderPathForAccount(aAccount) {
  return PathUtils.join(
    Services.dirsvc.get("ProfD", Ci.nsIFile).path,
    "logs",
    aAccount.protocol.normalizedName,
    encodeName(aAccount.normalizedName)
  );
}

function getLogFilePathForConversation(aConv, aFormat, aStartTime) {
  if (!aStartTime) {
    aStartTime = aConv.startDate / 1000;
  }
  let path = getLogFolderPathForAccount(aConv.account);
  let name = aConv.normalizedName;
  if (aConv.isChat) {
    name += ".chat";
  }
  return PathUtils.join(
    path,
    encodeName(name),
    getNewLogFileName(aFormat, aStartTime)
  );
}

function getNewLogFileName(aFormat, aStartTime) {
  let date = aStartTime ? new Date(aStartTime) : new Date();
  let dateTime = ToLocaleFormat("%Y-%m-%d.%H%M%S", date);
  let offset = date.getTimezoneOffset();
  if (offset < 0) {
    dateTime += "+";
    offset *= -1;
  } else {
    dateTime += "-";
  }
  let minutes = offset % 60;
  offset = (offset - minutes) / 60;
  function twoDigits(aNumber) {
    if (aNumber == 0) {
      return "00";
    }
    return aNumber < 10 ? "0" + aNumber : aNumber;
  }
  if (!aFormat) {
    aFormat = "txt";
  }
  return dateTime + twoDigits(offset) + twoDigits(minutes) + "." + aFormat;
}

// One of these is maintained for every conversation being logged. It initializes
// a log file and appends to it as required.
function LogWriter(aConversation) {
  this._conv = aConversation;
  if (Services.prefs.getCharPref("purple.logging.format") == "json") {
    this.format = "json";
  }
  this.paths = [];
  this._parser = new DOMParser();
  this.startNewFile(this._conv.startDate / 1000);
}
LogWriter.prototype = {
  // All log file paths used by this LogWriter.
  paths: [],
  // Path of the log file that is currently being written to.
  get currentPath() {
    return this.paths[this.paths.length - 1];
  },
  // Constructor sets this to a promise that will resolve when the log header
  // has been written.
  _initialized: null,
  _startTime: null,
  _lastMessageTime: null,
  _messageCount: 0,
  format: "txt",
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
    this.paths.push(
      getLogFilePathForConversation(this._conv, this.format, aStartTime)
    );
    let account = this._conv.account;
    let header;
    if (this.format == "json") {
      header = {
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
    } else {
      const dateTimeFormatter = new Services.intl.DateTimeFormat("en-US", {
        dateStyle: "full",
        timeStyle: "long",
      });
      header =
        "Conversation with " +
        this._conv.name +
        " at " +
        dateTimeFormatter.format(new Date(this._conv.startDate / 1000)) +
        " on " +
        account.name +
        " (" +
        account.protocol.normalizedName +
        ")" +
        kLineBreak;
    }
    this._initialized = appendToFile(this.currentPath, header, true);
    // Catch the error separately so that _initialized will stay rejected if
    // writing the header failed.
    this._initialized.catch(aError =>
      Cu.reportError("Failed to initialize log file:\n" + aError)
    );
  },
  /**
   * This parses the message as HTML and converts it to plaintext (in a lossy
   * fashion) with the following adjustments:
   *
   * * Encode newlines as <br/>.
   * * Ensures that links appear in the plaintext output.
   *
   * @param {string} aString The HTML string to convert.
   * @returns {string}
   * @private
   */
  _serialize(aString) {
    let doc = this._parser.parseFromString(
      aString.replace(/\r?\n/g, "<br>"),
      "text/html"
    );
    const type = "text/plain";
    let encoder = Cu.createDocumentEncoder(type);
    encoder.init(doc, type, 0);
    encoder.setNodeFixup({
      fixupNode(aNode, aSerializeKids) {
        if (aNode.localName == "a" && aNode.hasAttribute("href")) {
          let url = aNode.getAttribute("href");
          let content = aNode.textContent;
          if (url != content) {
            aNode.textContent = content + " (" + url + ")";
          }
        }
        return null;
      },
    });
    return encoder.encodeToString();
  },
  // We start a new log file in the following cases:
  // - If it has been 30 minutes since the last message.
  kInactivityLimit: 30 * 60 * 1000,
  // - If at midnight, it's been longer than 3 hours since we started the file.
  kDayOverlapLimit: 3 * 60 * 60 * 1000,
  // - After every 1000 messages.
  kMessageCountLimit: 1000,
  logMessage(aMessage) {
    // aMessage.time is in seconds, we need it in milliseconds.
    let messageTime = aMessage.time * 1000;
    let messageMidnight = new Date(messageTime).setHours(0, 0, 0, 0);

    let inactivityLimitExceeded =
      !aMessage.delayed &&
      messageTime - this._lastMessageTime > this.kInactivityLimit;
    let dayOverlapLimitExceeded =
      !aMessage.delayed &&
      messageMidnight - this._startTime > this.kDayOverlapLimit;

    if (
      inactivityLimitExceeded ||
      dayOverlapLimitExceeded ||
      this._messageCount == this.kMessageCountLimit
    ) {
      // We start a new session if the inactivity limit was exceeded.
      this.startNewFile(messageTime, !inactivityLimitExceeded);
    }
    ++this._messageCount;

    if (!aMessage.delayed) {
      this._lastMessageTime = messageTime;
    }

    let lineToWrite;
    if (this.format == "json") {
      let msg = {
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
        ].filter(f => aMessage[f]),
      };
      let alias = aMessage.alias;
      if (alias && alias != msg.who) {
        msg.alias = alias;
      }
      lineToWrite = JSON.stringify(msg) + "\n";
    } else {
      // Text log.
      let date = new Date(messageTime);
      let line = "(" + date.toLocaleTimeString() + ") ";
      let msg = this._serialize(aMessage.displayMessage);
      if (aMessage.system) {
        line += msg;
      } else {
        let sender = aMessage.alias || aMessage.who;
        if (aMessage.autoResponse) {
          line += sender + " <AUTO-REPLY>: " + msg;
        } else if (msg.startsWith("/me ")) {
          line += "***" + sender + " " + msg.substr(4);
        } else {
          line += sender + ": " + msg;
        }
      }
      lineToWrite = line + kLineBreak;
    }
    this._initialized.then(() => {
      appendToFile(this.currentPath, lineToWrite).catch(aError =>
        Cu.reportError("Failed to log message:\n" + aError)
      );
    });
  },
};

var dummyLogWriter = {
  paths: null,
  currentPath: null,
  logMessage() {},
};

var gLogWritersById = new Map();
function getLogWriter(aConversation) {
  let id = aConversation.id;
  if (!gLogWritersById.has(id)) {
    let prefName =
      "purple.logging.log_" + (aConversation.isChat ? "chats" : "ims");
    if (Services.prefs.getBoolPref(prefName)) {
      gLogWritersById.set(id, new LogWriter(aConversation));
    } else {
      gLogWritersById.set(id, dummyLogWriter);
    }
  }
  return gLogWritersById.get(id);
}

function closeLogWriter(aConversation) {
  gLogWritersById.delete(aConversation.id);
}

// LogWriter for system logs.
function SystemLogWriter(aAccount) {
  this._account = aAccount;
  this.path = PathUtils.join(
    getLogFolderPathForAccount(aAccount),
    ".system",
    getNewLogFileName()
  );
  const dateTimeFormatter = new Services.intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "long",
  });
  let header =
    "System log for account " +
    aAccount.name +
    " (" +
    aAccount.protocol.normalizedName +
    ") connected at " +
    dateTimeFormatter.format(new Date()) +
    kLineBreak;
  this._initialized = appendToFile(this.path, header, true);
  // Catch the error separately so that _initialized will stay rejected if
  // writing the header failed.
  this._initialized.catch(aError =>
    Cu.reportError("Error initializing system log:\n" + aError)
  );
}
SystemLogWriter.prototype = {
  // Constructor sets this to a promise that will resolve when the log header
  // has been written.
  _initialized: null,
  path: null,
  logEvent(aString) {
    let date = ToLocaleFormat("%x %X", new Date());
    let lineToWrite = "---- " + aString + " @ " + date + " ----" + kLineBreak;
    this._initialized.then(() => {
      appendToFile(this.path, lineToWrite).catch(aError =>
        Cu.reportError("Failed to log event:\n" + aError)
      );
    });
  },
};

var dummySystemLogWriter = {
  path: null,
  logEvent() {},
};

var gSystemLogWritersById = new Map();
function getSystemLogWriter(aAccount, aCreate) {
  let id = aAccount.id;
  if (aCreate) {
    if (!Services.prefs.getBoolPref("purple.logging.log_system")) {
      return dummySystemLogWriter;
    }
    let writer = new SystemLogWriter(aAccount);
    gSystemLogWritersById.set(id, writer);
    return writer;
  }

  return (
    (gSystemLogWritersById.has(id) && gSystemLogWritersById.get(id)) ||
    dummySystemLogWriter
  );
}

function closeSystemLogWriter(aAccount) {
  gSystemLogWritersById.delete(aAccount.id);
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
  const kRegExp = /([\d]{4})-([\d]{2})-([\d]{2}).([\d]{2})([\d]{2})([\d]{2})([+-])([\d]{2})([\d]{2}).*\.([A-Za-z]+)$/;

  let r = aFilename.match(kRegExp);
  if (!r) {
    Cu.reportError(
      "Found log file with name not matching YYYY-MM-DD.HHmmSS+ZZzz.format: " +
        aFilename
    );
    return [];
  }

  // We ignore the timezone offset for now (FIXME)
  return [new Date(r[1], r[2] - 1, r[3], r[4], r[5], r[6]), r[10]];
}

function LogMessage(aData, aConversation) {
  this._init(aData.who, aData.text);
  this._conversation = aConversation;
  this.time = Math.round(new Date(aData.date) / 1000);
  if ("alias" in aData) {
    this._alias = aData.alias;
  }
  if (aData.flags) {
    for (let flag of aData.flags) {
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

function LogConversation(aMessages, aProperties) {
  this._messages = aMessages;
  for (let property in aProperties) {
    this[property] = aProperties[property];
  }
}
LogConversation.prototype = {
  __proto__: ClassInfo("imILogConversation", "Log conversation object"),
  get isChat() {
    return this._isChat;
  },
  get buddy() {
    return null;
  },
  get account() {
    return {
      alias: "",
      name: this._accountName,
      normalizedName: this._accountName,
      protocol: { name: this._protocolName },
      statusInfo: Services.core.globalUserStatus,
    };
  },
  getMessages() {
    return this._messages.map(m => new LogMessage(m, this));
  },
};

/**
 * A Log object represents one or more log files. The constructor expects one
 * argument, which is either a single path to a (json or txt) log file or an
 * array of objects each having two properties:
 *   path: The full path of the (json only) log file it represents.
 *   time: The Date object extracted from the filename of the logfile.
 *
 * The returned Log object's time property will be:
 *   For a single file - exact time extracted from the name of the log file.
 *   For a set of files - the time extracted, reduced to the day.
 */
function Log(aEntries) {
  if (typeof aEntries == "string") {
    // Assume that aEntries is a single path.
    let path = aEntries;
    this.path = path;
    let [date, format] = getDateFromFilename(PathUtils.filename(path));
    if (!date || !format) {
      this.format = "invalid";
      this.time = 0;
      return;
    }
    this.time = date.valueOf() / 1000;
    this.format = format;
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
  let timestamp = new Date(aEntries[0].time);
  timestamp.setHours(0);
  timestamp.setMinutes(0);
  timestamp.setSeconds(0);
  this.time = timestamp.valueOf() / 1000;
  // Path is used to uniquely identify a Log, and sometimes used to
  // quickly determine which directory a log file is from.  We'll use
  // the first file's path.
  this.path = aEntries[0].path;
}
Log.prototype = {
  __proto__: ClassInfo("imILog", "Log object"),
  _entryPaths: null,
  format: "json",
  async getConversation() {
    /*
     * Read the set of log files asynchronously and return a promise that
     * resolves to a LogConversation instance. Even if a file contains some
     * junk (invalid JSON), messages that are valid will be read. If the first
     * line of metadata is corrupt however, the data isn't useful and the
     * promise will resolve to null.
     */
    if (this.format != "json") {
      return null;
    }
    let messages = [];
    let properties = {};
    let firstFile = true;
    let decoder = new TextDecoder();
    for (let path of this._entryPaths) {
      let lines;
      try {
        let contents = await queueFileOperation(path, () => IOUtils.read(path));
        lines = decoder.decode(contents).split("\n");
      } catch (aError) {
        Cu.reportError('Error reading log file "' + path + '":\n' + aError);
        continue;
      }
      let nextLine = lines.shift();
      let filename = PathUtils.filename(path);

      let data;
      try {
        // This will fail if either nextLine is undefined, or not valid JSON.
        data = JSON.parse(nextLine);
      } catch (aError) {
        messages.push({
          who: "sessionstart",
          date: getDateFromFilename(filename)[0],
          text: _("badLogfile", filename),
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
          messages.push(JSON.parse(nextLine));
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

    return new LogConversation(messages, properties);
  },
};

/**
 * logsGroupedByDay() organizes log entries by date.
 *
 * @param {string[]} aEntries - paths of log files to be parsed.
 * @returns {imILog[]} Logs, ordered by day.
 */
function logsGroupedByDay(aEntries) {
  let entries = {};
  for (let path of aEntries) {
    let [logDate, logFormat] = getDateFromFilename(PathUtils.filename(path));
    if (!logDate) {
      // We'll skip this one, since it's got a busted filename.
      continue;
    }

    let dateForID = new Date(logDate);
    let dayID;
    if (logFormat == "json") {
      // We want to cluster all of the logs that occur on the same day
      // into the same Arrays. We clone the date for the log, reset it to
      // the 0th hour/minute/second, and use that to construct an ID for the
      // Array we'll put the log in.
      dateForID.setHours(0);
      dateForID.setMinutes(0);
      dateForID.setSeconds(0);
      dayID = dateForID.toISOString();

      if (!(dayID in entries)) {
        entries[dayID] = [];
      }

      entries[dayID].push({
        path,
        time: logDate,
      });
    } else {
      // Add legacy text logs as individual paths.
      dayID = dateForID.toISOString() + "txt";
      entries[dayID] = path;
    }
  }

  let days = Object.keys(entries);
  days.sort();
  return days.map(dayID => new Log(entries[dayID]));
}

function Logger() {}
Logger.prototype = {
  // Returned Promise resolves to an array of entries for the
  // log folder if it exists, otherwise null.
  async _getLogEntries(aAccount, aNormalizedName) {
    let path;
    try {
      path = PathUtils.join(
        getLogFolderPathForAccount(aAccount),
        encodeName(aNormalizedName)
      );
      if (await queueFileOperation(path, () => IOUtils.exists(path))) {
        let entries = await IOUtils.getChildren(path);
        return entries;
      }
    } catch (aError) {
      Cu.reportError(
        'Error getting directory entries for "' + path + '":\n' + aError
      );
    }
    return [];
  },
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
    let relevantEntries = [];
    for (const path of await IOUtils.getChildren(PathUtils.parent(aFilePath))) {
      const stat = await IOUtils.stat(path);
      if (stat.type === "directory") {
        continue;
      }
      let [logTime] = getDateFromFilename(PathUtils.filename(path));
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
  },

  /**
   * Helper to produce array of imILog objects from directory entries.
   *
   * @param {string[]} entries - Array of paths of log files to be parsed.
   * @param {boolean} groupByDay - If true, order by day (rather than by filename).
   * @returns {imILog[]} Logs, ordered by day.
   */
  _toLogArray(entries, groupByDay) {
    if (!Array.isArray(entries)) {
      return [];
    }
    if (groupByDay) {
      return logsGroupedByDay(entries);
    }
    // Default - sort by filename.
    entries.sort((a, b) => PathUtils.filename(a) > PathUtils.filename(b));
    return entries.map(path => new Log(path));
  },

  async getLogPathsForConversation(aConversation) {
    let writer = gLogWritersById.get(aConversation.id);
    // Resolve to null if we haven't created a LogWriter yet for this conv, or
    // if logging is disabled (paths will be null).
    if (!writer || !writer.paths) {
      return null;
    }
    let paths = writer.paths;
    // Wait for any pending file operations to finish, then resolve to the paths
    // regardless of whether these operations succeeded.
    for (let path of paths) {
      await gFilePromises.get(path);
    }
    return paths;
  },
  getLogsForAccountAndName(aAccount, aNormalizedName, aGroupByDay) {
    return this._getLogEntries(aAccount, aNormalizedName).then(aEntries =>
      this._toLogArray(aEntries, aGroupByDay)
    );
  },
  getLogsForAccountBuddy(aAccountBuddy, aGroupByDay) {
    return this.getLogsForAccountAndName(
      aAccountBuddy.account,
      aAccountBuddy.normalizedName,
      aGroupByDay
    );
  },
  async getLogsForBuddy(aBuddy, aGroupByDay) {
    let entries = [];
    for (let accountBuddy of aBuddy.getAccountBuddies()) {
      entries = entries.concat(
        await this._getLogEntries(
          accountBuddy.account,
          accountBuddy.normalizedName
        )
      );
    }
    return this._toLogArray(entries, aGroupByDay);
  },
  async getLogsForContact(aContact, aGroupByDay) {
    let entries = [];
    for (let buddy of aContact.getBuddies()) {
      for (let accountBuddy of buddy.getAccountBuddies()) {
        entries = entries.concat(
          await this._getLogEntries(
            accountBuddy.account,
            accountBuddy.normalizedName
          )
        );
      }
    }
    return this._toLogArray(entries, aGroupByDay);
  },
  getLogsForConversation(aConversation, aGroupByDay) {
    let name = aConversation.normalizedName;
    if (aConversation.isChat) {
      name += ".chat";
    }
    return this.getLogsForAccountAndName(
      aConversation.account,
      name,
      aGroupByDay
    );
  },
  getSystemLogsForAccount(aAccount) {
    return this.getLogsForAccountAndName(aAccount, ".system");
  },
  async getSimilarLogs(aLog, aGroupByDay) {
    let entries;
    try {
      entries = await IOUtils.getChildren(PathUtils.parent(aLog.path));
    } catch (aError) {
      Cu.reportError(
        'Error getting similar logs for "' + aLog.path + '":\n' + aError
      );
    }
    // If there was an error, this will return an empty array.
    return this._toLogArray(entries, aGroupByDay);
  },

  getLogFolderPathForAccount(aAccount) {
    return getLogFolderPathForAccount(aAccount);
  },

  deleteLogFolderForAccount(aAccount) {
    if (!aAccount.disconnecting && !aAccount.disconnected) {
      throw new Error(
        "Account must be disconnected first before deleting logs."
      );
    }

    if (aAccount.disconnecting) {
      Cu.reportError(
        "Account is still disconnecting while we attempt to remove logs."
      );
    }

    let logPath = this.getLogFolderPathForAccount(aAccount);
    // Find all operations on files inside the log folder.
    let pendingPromises = [];
    function checkLogFiles(promiseOperation, filePath) {
      if (filePath.startsWith(logPath)) {
        pendingPromises.push(promiseOperation);
      }
    }
    gFilePromises.forEach(checkLogFiles);
    // After all operations finish, remove the whole log folder.
    return Promise.all(pendingPromises)
      .then(values => {
        IOUtils.remove(logPath, { recursive: true });
      })
      .catch(aError =>
        Cu.reportError("Failed to remove log folders:\n" + aError)
      );
  },

  async forEach(aCallback) {
    let getAllSubdirs = async function(aPaths, aErrorMsg) {
      let entries = [];
      for (let path of aPaths) {
        try {
          entries = entries.concat(await IOUtils.getChildren(path));
        } catch (aError) {
          if (aErrorMsg) {
            Cu.reportError(aErrorMsg + "\n" + aError);
          }
        }
      }
      let filteredPaths = [];
      for (let path of entries) {
        const stat = await IOUtils.stat(path);
        if (stat.type === "directory") {
          filteredPaths.push(path);
        }
      }
      return filteredPaths;
    };

    let logsPath = PathUtils.join(
      Services.dirsvc.get("ProfD", Ci.nsIFile).path,
      "logs"
    );
    let prpls = await getAllSubdirs([logsPath]);
    let accounts = await getAllSubdirs(
      prpls,
      "Error while sweeping prpl folder:"
    );
    let logFolders = await getAllSubdirs(
      accounts,
      "Error while sweeping account folder:"
    );
    for (let folder of logFolders) {
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
        if (!(aError instanceof DOMException)) {
          throw aError;
        }
        Cu.reportError("Error sweeping log folder:\n" + aError);
      }
    }
  },

  observe(aSubject, aTopic, aData) {
    switch (aTopic) {
      case "profile-after-change":
        Services.obs.addObserver(this, "final-ui-startup");
        break;
      case "final-ui-startup":
        IOUtils.profileBeforeChange.addBlocker(
          "Chat logger: writing all pending messages",
          async function() {
            for (let promise of gFilePromises.values()) {
              try {
                await promise;
              } catch (aError) {
                // Ignore the error, whatever queued the operation will take care of it.
              }
            }
          }
        );

        Services.obs.removeObserver(this, "final-ui-startup");
        [
          "new-text",
          "conversation-closed",
          "conversation-left-chat",
          "account-connected",
          "account-disconnected",
          "account-buddy-status-changed",
        ].forEach(function(aEvent) {
          Services.obs.addObserver(this, aEvent);
        }, this);
        break;
      case "new-text":
        let excludeBecauseEncrypted = false;
        if (aSubject.encrypted) {
          excludeBecauseEncrypted = !Services.prefs.getBoolPref(
            "messenger.account." +
              aSubject.conversation.account.id +
              ".options.otrAllowMsgLog",
            Services.prefs.getBoolPref("chat.otr.default.allowMsgLog")
          );
        }
        if (!aSubject.noLog && !excludeBecauseEncrypted) {
          let log = getLogWriter(aSubject.conversation);
          log.logMessage(aSubject);
        }
        break;
      case "conversation-closed":
      case "conversation-left-chat":
        closeLogWriter(aSubject);
        break;
      case "account-connected":
        getSystemLogWriter(aSubject, true).logEvent(
          "+++ " + aSubject.name + " signed on"
        );
        break;
      case "account-disconnected":
        getSystemLogWriter(aSubject).logEvent(
          "+++ " + aSubject.name + " signed off"
        );
        closeSystemLogWriter(aSubject);
        break;
      case "account-buddy-status-changed":
        let status;
        if (!aSubject.online) {
          status = "Offline";
        } else if (aSubject.mobile) {
          status = "Mobile";
        } else if (aSubject.idle) {
          status = "Idle";
        } else if (aSubject.available) {
          status = "Available";
        } else {
          status = "Unavailable";
        }

        let statusText = aSubject.statusText;
        if (statusText) {
          status += ' ("' + statusText + '")';
        }

        let nameText = aSubject.displayName + " (" + aSubject.userName + ")";
        getSystemLogWriter(aSubject.account).logEvent(
          nameText + " is now " + status
        );
        break;
      default:
        throw new Error("Unexpected notification " + aTopic);
    }
  },

  QueryInterface: ChromeUtils.generateQI(["nsIObserver", "imILogger"]),
  classDescription: "Logger",
};
