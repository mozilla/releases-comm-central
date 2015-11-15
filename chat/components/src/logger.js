/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {classes: Cc, interfaces: Ci, utils: Cu, Constructor: CC} = Components;

Cu.import("resource:///modules/hiddenWindow.jsm");
Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("resource:///modules/jsProtoHelper.jsm");

Cu.import("resource://gre/modules/Task.jsm")
XPCOMUtils.defineLazyModuleGetter(this, "OS", "resource://gre/modules/osfile.jsm");

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://chat/locale/logger.properties")
);

var kLineBreak = "@mozilla.org/windows-registry-key;1" in Cc ? "\r\n" : "\n";

/*
 * Maps file paths to promises returned by ongoing OS.File operations on them.
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
  let promise =
    (gFilePromises.get(aPath) || Promise.resolve()).then(aOperation, aOperation);
  gFilePromises.set(aPath, promise);

  let cleanup = () => {
    // If no further operations have been queued, remove the reference from the map.
    if (gFilePromises.get(aPath) === promise)
      gFilePromises.delete(aPath);
  };
  // Ensure we clear unused promises whether they resolved or rejected.
  promise.then(cleanup, cleanup);

  return promise;
}

/*
 * Convenience method to append to a file using the above queue system. If any of
 * the I/O operations reject, the returned promise will reject with the same reason.
 * We open the file, append, and close it immediately. The alternative is to keep
 * it open and append as required, but we want to make sure we don't open a file
 * for reading while it's already open for writing, so we close it every time
 * (opening a file multiple times concurrently may fail on Windows).
 * Note: This function creates parent directories if required.
 */
function appendToFile(aPath, aEncodedString, aCreate) {
  return queueFileOperation(aPath, Task.async(function* () {
    yield OS.File.makeDir(OS.Path.dirname(aPath),
                          {ignoreExisting: true, from: OS.Constants.Path.profileDir});
    let file = yield OS.File.open(aPath, {write: true, create: aCreate});
    try {
      yield file.write(aEncodedString);
    }
    finally {
      /*
       * If both the write() above and the close() below throw, and we don't
       * handle the close error here, the promise will be rejected with the close
       * error and the write error will be dropped. To avoid this, we log any
       * close error here so that any write error will be propagated.
       */
      yield file.close().catch(Cu.reportError);
    }
  }));
}

OS.File.profileBeforeChange.addBlocker(
  "Chat logger: writing all pending messages",
  Task.async(function* () {
    for (let promise of gFilePromises.values()) {
      try {
        yield promise;
      }
      catch (aError) {
        // Ignore the error, whatever queued the operation will take care of it.
      }
    }
  })
);


// This function checks names against OS naming conventions and alters them
// accordingly so that they can be used as file/folder names.
function encodeName(aName) {
  // Reserved device names by Windows (prefixing "%").
  let reservedNames = /^(CON|PRN|AUX|NUL|COM\d|LPT\d)$/i;
  if (reservedNames.test(aName))
    return "%" + aName;

  // "." and " " must not be at the end of a file or folder name (appending "_").
  if (/[\. _]/.test(aName.slice(-1)))
    aName += "_";

  // Reserved characters are replaced by %[hex value]. encodeURIComponent() is
  // not sufficient, nevertheless decodeURIComponent() can be used to decode.
  function encodeReservedChars(match) { return "%" + match.charCodeAt(0).toString(16); }
  return aName.replace(/[<>:"\/\\|?*&%]/g, encodeReservedChars);
}

function getLogFolderPathForAccount(aAccount) {
  return OS.Path.join(OS.Constants.Path.profileDir,
                      "logs", aAccount.protocol.normalizedName,
                      encodeName(aAccount.normalizedName));
}

function getLogFilePathForConversation(aConv, aFormat, aStartTime) {
  if (!aStartTime)
    aStartTime = aConv.startDate / 1000;
  let path = getLogFolderPathForAccount(aConv.account);
  let name = aConv.normalizedName;
  if (convIsRealMUC(aConv))
    name += ".chat";
  return OS.Path.join(path, encodeName(name),
                      getNewLogFileName(aFormat, aStartTime));
}

function getNewLogFileName(aFormat, aStartTime) {
  let date = aStartTime ? new Date(aStartTime) : new Date();
  let dateTime = date.toLocaleFormat("%Y-%m-%d.%H%M%S");
  let offset = date.getTimezoneOffset();
  if (offset < 0) {
    dateTime += "+";
    offset *= -1;
  }
  else
    dateTime += "-";
  let minutes = offset % 60;
  offset = (offset - minutes) / 60;
  function twoDigits(aNumber) {
    return aNumber == 0 ? "00" : aNumber < 10 ? "0" + aNumber : aNumber;
  }
  if (!aFormat)
    aFormat = "txt";
  return dateTime + twoDigits(offset) + twoDigits(minutes) + "." + aFormat;
}


// One of these is maintained for every conversation being logged. It initializes
// a log file and appends to it as required.
function LogWriter(aConversation) {
  this._conv = aConversation;
  if (Services.prefs.getCharPref("purple.logging.format") == "json")
    this.format = "json";
  this.paths = [];
  this.startNewFile(this._conv.startDate / 1000);
}
LogWriter.prototype = {
  // All log file paths used by this LogWriter.
  paths: [],
  // Path of the log file that is currently being written to.
  get currentPath() { return this.paths[this.paths.length - 1]; },
  // Constructor sets this to a promise that will resolve when the log header
  // has been written.
  _initialized: null,
  _startTime: null,
  _lastMessageTime: null,
  _messageCount: 0,
  format: "txt",
  encoder: new TextEncoder(),
  startNewFile: function lw_startNewFile(aStartTime, aContinuedSession) {
    // We start a new log file every 1000 messages. The start time of this new
    // log file is the time of the next message. Since message times are in seconds,
    // if we receive 1000 messages within a second after starting the new file,
    // we will create another file, using the same start time - and so the same
    // file name. To avoid this, ensure the new start time is at least one second
    // greater than the current one. This is ugly, but should rarely be needed.
    aStartTime = Math.max(aStartTime, this._startTime + 1000);
    this._startTime = this._lastMessageTime = aStartTime;
    this._messageCount = 0;
    this.paths.push(getLogFilePathForConversation(this._conv, this.format, aStartTime));
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
        normalizedName: this._conv.normalizedName
      };
      if (aContinuedSession)
        header.continuedSession = true;
      header = JSON.stringify(header) + "\n";
    }
    else {
      header = "Conversation with " + this._conv.name +
               " at " + (new Date(this._conv.startDate / 1000)).toLocaleString() +
               " on " + account.name +
               " (" + account.protocol.normalizedName + ")" + kLineBreak;
    }
    this._initialized =
      appendToFile(this.currentPath, this.encoder.encode(header), true);
    // Catch the error separately so that _initialized will stay rejected if
    // writing the header failed.
    this._initialized.catch(aError =>
                            Cu.reportError("Failed to initialize log file:\n" + aError));
  },
  _serialize: function cl_serialize(aString) {
    // TODO cleanup once bug 102699 is fixed
    let doc = getHiddenHTMLWindow().document;
    let div = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    div.innerHTML = aString.replace(/\r?\n/g, "<br/>").replace(/<br>/gi, "<br/>");
    const type = "text/plain";
    let encoder =
      Components.classes["@mozilla.org/layout/documentEncoder;1?type=" + type]
                .createInstance(Components.interfaces.nsIDocumentEncoder);
    encoder.init(doc, type, 0);
    encoder.setContainerNode(div);
    encoder.setNodeFixup({fixupNode: function(aNode, aSerializeKids) {
      if (aNode.localName == "a" && aNode.hasAttribute("href")) {
        let url = aNode.getAttribute("href");
        let content = aNode.textContent;
        if (url != content)
          aNode.textContent = content + " (" + url + ")";
      }
      return null;
    }});
    return encoder.encodeToString();
  },
  // We start a new log file in the following cases:
  // - If it has been 30 minutes since the last message.
  kInactivityLimit: 30 * 60 * 1000,
  // - If at midnight, it's been longer than 3 hours since we started the file.
  kDayOverlapLimit: 3 * 60 * 60 * 1000,
  // - After every 1000 messages.
  kMessageCountLimit: 1000,
  logMessage: function cl_logMessage(aMessage) {
    // aMessage.time is in seconds, we need it in milliseconds.
    let messageTime = aMessage.time * 1000;
    let messageMidnight = new Date(messageTime).setHours(0, 0, 0, 0);

    let inactivityLimitExceeded =
      !aMessage.delayed && messageTime - this._lastMessageTime > this.kInactivityLimit;
    let dayOverlapLimitExceeded =
      !aMessage.delayed && messageMidnight - this._startTime > this.kDayOverlapLimit;

    if (inactivityLimitExceeded || dayOverlapLimitExceeded ||
        this._messageCount == this.kMessageCountLimit) {
      // We start a new session if the inactivity limit was exceeded.
      this.startNewFile(messageTime, !inactivityLimitExceeded);
    }
    ++this._messageCount;

    if (!aMessage.delayed)
      this._lastMessageTime = messageTime;

    let lineToWrite;
    if (this.format == "json") {
      let msg = {
        date: new Date(messageTime),
        who: aMessage.who,
        text: aMessage.displayMessage,
        flags: ["outgoing", "incoming", "system", "autoResponse",
                "containsNick", "error", "delayed",
                "noFormat", "containsImages", "notification",
                "noLinkification"].filter(f => aMessage[f])
      };
      let alias = aMessage.alias;
      if (alias && alias != msg.who)
        msg.alias = alias;
      lineToWrite = JSON.stringify(msg) + "\n";
    }
    else {
      // Text log.
      let date = new Date(messageTime);
      let line = "(" + date.toLocaleTimeString() + ") ";
      let msg = this._serialize(aMessage.displayMessage);
      if (aMessage.system)
        line += msg;
      else {
        let sender = aMessage.alias || aMessage.who;
        if (aMessage.autoResponse)
          line += sender + " <AUTO-REPLY>: " + msg;
        else {
          if (msg.startsWith("/me "))
            line += "***" + sender + " " + msg.substr(4);
          else
            line += sender + ": " + msg;
        }
      }
      lineToWrite = line + kLineBreak;
    }
    lineToWrite = this.encoder.encode(lineToWrite);
    this._initialized.then(() => {
      appendToFile(this.currentPath, lineToWrite)
        .catch(aError => Cu.reportError("Failed to log message:\n" + aError));
    });
  }
};

var dummyLogWriter = {
  paths: null,
  currentPath: null,
  logMessage: function() {}
};


var gLogWritersById = new Map();
function getLogWriter(aConversation) {
  let id = aConversation.id;
  if (!gLogWritersById.has(id)) {
    let prefName =
      "purple.logging.log_" + (aConversation.isChat ? "chats" : "ims");
    if (Services.prefs.getBoolPref(prefName))
      gLogWritersById.set(id, new LogWriter(aConversation));
    else
      gLogWritersById.set(id, dummyLogWriter);
  }
  return gLogWritersById.get(id);
}

function closeLogWriter(aConversation) {
  gLogWritersById.delete(aConversation.id);
}

// LogWriter for system logs.
function SystemLogWriter(aAccount) {
  this._account = aAccount;
  this.path = OS.Path.join(getLogFolderPathForAccount(aAccount), ".system",
                           getNewLogFileName());
  let header = "System log for account " + aAccount.name +
               " (" + aAccount.protocol.normalizedName +
               ") connected at " +
               (new Date()).toLocaleFormat("%c") + kLineBreak;
  this._initialized = appendToFile(this.path, this.encoder.encode(header), true);
  // Catch the error separately so that _initialized will stay rejected if
  // writing the header failed.
  this._initialized.catch(aError =>
                          Cu.reportError("Error initializing system log:\n" + aError));
}
SystemLogWriter.prototype = {
  encoder: new TextEncoder(),
  // Constructor sets this to a promise that will resolve when the log header
  // has been written.
  _initialized: null,
  path: null,
  logEvent: function sl_logEvent(aString) {
    let date = (new Date()).toLocaleFormat("%x %X");
    let lineToWrite =
      this.encoder.encode("---- " + aString + " @ " + date + " ----" + kLineBreak);
    this._initialized.then(() => {
      appendToFile(this.path, lineToWrite)
        .catch(aError => Cu.reportError("Failed to log event:\n" + aError));
    });
  }
};

var dummySystemLogWriter = {
  path: null,
  logEvent: function() {}
};


var gSystemLogWritersById = new Map();
function getSystemLogWriter(aAccount, aCreate) {
  let id = aAccount.id;
  if (aCreate) {
    if (!Services.prefs.getBoolPref("purple.logging.log_system"))
      return dummySystemLogWriter;
    let writer = new SystemLogWriter(aAccount);
    gSystemLogWritersById.set(id, writer);
    return writer;
  }

  return gSystemLogWritersById.has(id) && gSystemLogWritersById.get(id) ||
    dummySystemLogWriter;
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
  if (!r)
    return [];

  // We ignore the timezone offset for now (FIXME)
  return [new Date(r[1], r[2] - 1, r[3], r[4], r[5], r[6]), r[10]];
}

/**
 * Returns true if a Conversation is both a chat conversation, and not
 * a Twitter conversation.
 */
function convIsRealMUC(aConversation) {
  return (aConversation.isChat &&
          aConversation.account.protocol.id != "prpl-twitter");
}


function LogMessage(aData, aConversation) {
  this._init(aData.who, aData.text);
  this._conversation = aConversation;
  this.time = Math.round(new Date(aData.date) / 1000);
  if ("alias" in aData)
    this._alias = aData.alias;
  for (let flag of aData.flags)
    this[flag] = true;
}
LogMessage.prototype = {
  __proto__: GenericMessagePrototype,
  _interfaces: [Ci.imIMessage, Ci.prplIMessage],
  get displayMessage() { return this.originalMessage; }
};


function LogConversation(aMessages, aProperties) {
  this._messages = aMessages;
  for (let property in aProperties)
    this[property] = aProperties[property];
}
LogConversation.prototype = {
  __proto__: ClassInfo("imILogConversation", "Log conversation object"),
  get isChat() { return this._isChat; },
  get buddy() { return null; },
  get account() { return {
    alias: "",
    name: this._accountName,
    normalizedName: this._accountName,
    protocol: {name: this._protocolName},
    statusInfo: Services.core.globalUserStatus
  }; },
  getMessages: function(aMessageCount) {
    if (aMessageCount)
      aMessageCount.value = this._messages.length;
    return this._messages.map(m => new LogMessage(m, this));
  },
  getMessagesEnumerator: function(aMessageCount) {
    if (aMessageCount)
      aMessageCount.value = this._messages.length;
    let enumerator = {
      _index: 0,
      _conv: this,
      _messages: this._messages,
      hasMoreElements: function() { return this._index < this._messages.length; },
      getNext: function() { return new LogMessage(this._messages[this._index++], this._conv); },
      QueryInterface: XPCOMUtils.generateQI([Ci.nsISimpleEnumerator])
    };
    return enumerator;
  }
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
    let [date, format] = getDateFromFilename(OS.Path.basename(path));
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
    throw new Error("Log was passed an invalid argument, " +
                    "expected a non-empty array or a string.");
  }

  // Assume aEntries is an array of objects.
  // Sort our list of entries for this day in increasing order.
  aEntries.sort((aLeft, aRight) => aLeft.time - aRight.time);

  this._entryPaths = [entry.path for (entry of aEntries)];
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
  getConversation: Task.async(function* () {
    /*
     * Read the set of log files asynchronously and return a promise that
     * resolves to a LogConversation instance. Even if a file contains some
     * junk (invalid JSON), messages that are valid will be read. If the first
     * line of metadata is corrupt however, the data isn't useful and the
     * promise will resolve to null.
     */
    if (this.format != "json")
      return null;
    let messages = [];
    let properties = {};
    let firstFile = true;
    let decoder = new TextDecoder();
    for (let path of this._entryPaths) {
      let lines;
      try {
        let contents = yield queueFileOperation(path, () => OS.File.read(path));
        lines = decoder.decode(contents).split("\n");
      } catch (aError) {
        Cu.reportError("Error reading log file \"" + path + "\":\n" + aError);
        continue;
      }
      let nextLine = lines.shift();
      let filename = OS.Path.basename(path);

      let data;
      try {
        // This will fail if either nextLine is undefined, or not valid JSON.
        data = JSON.parse(nextLine);
      } catch (aError) {
        messages.push({
          who: "sessionstart",
          date: getDateFromFilename(filename)[0],
          text: _("badLogfile", filename),
          flags: ["noLog", "notification", "error", "system"]
        });
        continue;
      }

      if (firstFile || !data.continuedSession) {
        messages.push({
          who: "sessionstart",
          date: getDateFromFilename(filename)[0],
          text: "",
          flags: ["noLog", "notification"]
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
        if (!nextLine)
          break;
        try {
          messages.push(JSON.parse(nextLine));
        } catch (e) {
          // If a message line contains junk, just ignore the error and
          // continue reading the conversation.
        }
      }
    }

    if (firstFile) // All selected log files are invalid.
      return null;

    return new LogConversation(messages, properties);
  })
};


/**
 * Log enumerators provide lists of log files ("entries"). aEntries is an array
 * of the OS.File.DirectoryIterator.Entry instances which represent the log
 * files to be parsed.
 *
 * DailyLogEnumerator organizes entries by date, and enumerates them in order.
 * LogEnumerator enumerates logs in the same order as the input array.
 */
function DailyLogEnumerator(aEntries) {
  this._entries = {};

  for (let entry of aEntries) {
    let path = entry.path;

    let [logDate, logFormat] = getDateFromFilename(OS.Path.basename(path));
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

      if (!(dayID in this._entries))
        this._entries[dayID] = [];

      this._entries[dayID].push({
        path: path,
        time: logDate
      });
    }
    else {
      // Add legacy text logs as individual paths.
      dayID = dateForID.toISOString() + "txt";
      this._entries[dayID] = path;
    }
  }

  this._days = Object.keys(this._entries).sort();
  this._index = 0;
}
DailyLogEnumerator.prototype = {
  _entries: {},
  _days: [],
  _index: 0,
  hasMoreElements: function() { return this._index < this._days.length; },
  getNext: function() {
    let dayID = this._days[this._index++];
    return new Log(this._entries[dayID]);
  },
  QueryInterface: XPCOMUtils.generateQI([Ci.nsISimpleEnumerator])
};

function LogEnumerator(aEntries) {
  this._entries = aEntries;
  this._entries.sort((a, b) => a.name > b.name);
}
LogEnumerator.prototype = {
  _entries: [],
  hasMoreElements: function() {
    return this._entries.length > 0;
  },
  getNext: function() {
    // Create and return a log from the first entry.
    return new Log(this._entries.shift().path);
  },
  QueryInterface: XPCOMUtils.generateQI([Ci.nsISimpleEnumerator])
};


function Logger() { }
Logger.prototype = {
  // Returned Promise resolves to an array of entries for the
  // log folder if it exists, otherwise null.
  _getLogArray: Task.async(function* (aAccount, aNormalizedName) {
    let iterator, path;
    try {
      path = OS.Path.join(getLogFolderPathForAccount(aAccount),
                          encodeName(aNormalizedName));
      if (yield queueFileOperation(path, () => OS.File.exists(path))) {
        iterator = new OS.File.DirectoryIterator(path);
        let entries = yield iterator.nextBatch();
        iterator.close();
        return entries;
      }
    } catch (aError) {
      if (iterator)
        iterator.close();
      Cu.reportError("Error getting directory entries for \"" +
                     path + "\":\n" + aError);
    }
    return [];
  }),
  getLogFromFile: function logger_getLogFromFile(aFilePath, aGroupByDay) {
    if (!aGroupByDay)
      return Promise.resolve(new Log(aFilePath));
    let [targetDate] = getDateFromFilename(OS.Path.basename(aFilePath));
    if (!targetDate)
      return null;

    targetDate = targetDate.toDateString();

    // We'll assume that the files relevant to our interests are
    // in the same folder as the one provided.
    let iterator = new OS.File.DirectoryIterator(OS.Path.dirname(aFilePath));
    let relevantEntries = [];
    return iterator.forEach(function(aEntry) {
      if (aEntry.isDir)
        return;
      let path = aEntry.path;
      let [logTime] = getDateFromFilename(OS.Path.basename(path));

      if (targetDate == logTime.toDateString()) {
        relevantEntries.push({
          path: path,
          time: logTime
        });
      }
    }).then(() => {
      iterator.close();
      return new Log(relevantEntries);
    }, aError => {
      iterator.close();
      throw aError;
    });
  },
  // Creates and returns the appropriate LogEnumerator for the given log array
  // depending on aGroupByDay, or an EmptyEnumerator if the input array is empty.
  _getEnumerator: function logger__getEnumerator(aLogArray, aGroupByDay) {
    let enumerator = aGroupByDay ? DailyLogEnumerator : LogEnumerator;
    return aLogArray.length ? new enumerator(aLogArray) : EmptyEnumerator;
  },
  getLogPathsForConversation: Task.async(function* (aConversation) {
    let writer = gLogWritersById.get(aConversation.id);
    // Resolve to null if we haven't created a LogWriter yet for this conv, or
    // if logging is disabled (paths will be null).
    if (!writer || !writer.paths)
      return null;
    let paths = writer.paths;
    // Wait for any pending file operations to finish, then resolve to the paths
    // regardless of whether these operations succeeded.
    for (let path of paths)
      yield gFilePromises.get(path);
    return paths;
  }),
  getLogsForAccountAndName: function logger_getLogsForAccountAndName(aAccount,
                                       aNormalizedName, aGroupByDay) {
    return this._getLogArray(aAccount, aNormalizedName)
               .then(aEntries => this._getEnumerator(aEntries, aGroupByDay));
  },
  getLogsForAccountBuddy: function logger_getLogsForAccountBuddy(aAccountBuddy,
                                                                 aGroupByDay) {
    return this.getLogsForAccountAndName(aAccountBuddy.account,
                                         aAccountBuddy.normalizedName, aGroupByDay);
  },
  getLogsForBuddy: Task.async(function* (aBuddy, aGroupByDay) {
    let entries = [];
    for (let accountBuddy of aBuddy.getAccountBuddies()) {
      entries = entries.concat(yield this._getLogArray(accountBuddy.account,
                                                       accountBuddy.normalizedName));
    }
    return this._getEnumerator(entries, aGroupByDay);
  }),
  getLogsForContact: Task.async(function* (aContact, aGroupByDay) {
    let entries = [];
    for (let buddy of aContact.getBuddies()) {
      for (let accountBuddy of buddy.getAccountBuddies()) {
        entries = entries.concat(yield this._getLogArray(accountBuddy.account,
                                                         accountBuddy.normalizedName));
      }
    }
    return this._getEnumerator(entries, aGroupByDay);
  }),
  getLogsForConversation: function logger_getLogsForConversation(aConversation,
                                                                 aGroupByDay) {
    let name = aConversation.normalizedName;
    if (convIsRealMUC(aConversation))
      name += ".chat";
    return this.getLogsForAccountAndName(aConversation.account, name, aGroupByDay);
  },
  getSystemLogsForAccount: function logger_getSystemLogsForAccount(aAccount) {
    return this.getLogsForAccountAndName(aAccount, ".system");
  },
  getSimilarLogs: Task.async(function* (aLog, aGroupByDay) {
    let iterator = new OS.File.DirectoryIterator(OS.Path.dirname(aLog.path));
    let entries;
    try {
      entries = yield iterator.nextBatch();
    } catch (aError) {
      Cu.reportError("Error getting similar logs for \"" +
                     aLog.path + "\":\n" + aError);
    }
    // If there was an error, this will return an EmptyEnumerator.
    return this._getEnumerator(entries, aGroupByDay);
  }),

  forEach: Task.async(function* (aCallback) {
    let getAllSubdirs = Task.async(function* (aPaths, aErrorMsg) {
      let entries = [];
      for (let path of aPaths) {
        let iterator = new OS.File.DirectoryIterator(path);
        try {
          entries = entries.concat(yield iterator.nextBatch());
        } catch (aError) {
          if (aErrorMsg)
            Cu.reportError(aErrorMsg + "\n" + aError);
        } finally {
          iterator.close();
        }
      }
      entries = entries.filter(aEntry => aEntry.isDir)
                       .map(aEntry => aEntry.path);
      return entries;
    });

    let logsPath = OS.Path.join(OS.Constants.Path.profileDir, "logs");
    let prpls = yield getAllSubdirs([logsPath]);
    let accounts =
      yield getAllSubdirs(prpls, "Error while sweeping prpl folder:");
    let logFolders =
      yield getAllSubdirs(accounts, "Error while sweeping account folder:");
    for (let folder of logFolders) {
      let iterator = new OS.File.DirectoryIterator(folder);
      try {
        yield iterator.forEach(aEntry => {
          if (aEntry.isDir || !aEntry.name.endsWith(".json"))
            return null;
          return aCallback.processLog(aEntry.path);
        });
      } catch (aError) {
        // If the callback threw, reject the promise and let the caller handle it.
        if (!(aError instanceof OS.File.Error))
          throw aError;
        Cu.reportError("Error sweeping log folder:\n" + aError);
      } finally {
        iterator.close();
      }
    }
  }),

  observe: function logger_observe(aSubject, aTopic, aData) {
    switch (aTopic) {
    case "profile-after-change":
      Services.obs.addObserver(this, "final-ui-startup", false);
      break;
    case "final-ui-startup":
      Services.obs.removeObserver(this, "final-ui-startup");
      ["new-text", "conversation-closed", "conversation-left-chat",
       "account-connected", "account-disconnected",
       "account-buddy-status-changed"].forEach(function(aEvent) {
        Services.obs.addObserver(this, aEvent, false);
      }, this);
      break;
    case "new-text":
      if (!aSubject.noLog) {
        let log = getLogWriter(aSubject.conversation);
        log.logMessage(aSubject);
      }
      break;
    case "conversation-closed":
    case "conversation-left-chat":
      closeLogWriter(aSubject);
      break;
    case "account-connected":
      getSystemLogWriter(aSubject, true).logEvent("+++ " + aSubject.name +
                                                " signed on");
      break;
    case "account-disconnected":
      getSystemLogWriter(aSubject).logEvent("+++ " + aSubject.name +
                                          " signed off");
      closeSystemLogWriter(aSubject);
      break;
    case "account-buddy-status-changed":
      let status;
      if (!aSubject.online)
        status = "Offline";
      else if (aSubject.mobile)
        status = "Mobile";
      else if (aSubject.idle)
        status = "Idle";
      else if (aSubject.available)
        status = "Available";
      else
        status = "Unavailable";

      let statusText = aSubject.statusText;
      if (statusText)
        status += " (\"" + statusText + "\")";

      let nameText = aSubject.displayName + " (" + aSubject.userName + ")";
      getSystemLogWriter(aSubject.account).logEvent(nameText + " is now " + status);
      break;
    default:
      throw "Unexpected notification " + aTopic;
    }
  },

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.imILogger]),
  classDescription: "Logger",
  classID: Components.ID("{fb0dc220-2c7a-4216-9f19-6b8f3480eae9}"),
  contractID: "@mozilla.org/chat/logger;1"
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([Logger]);
