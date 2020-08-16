/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["Log4Moz"];

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var MODE_WRONLY = 0x02;
var MODE_CREATE = 0x08;
var MODE_APPEND = 0x10;

var PERMS_FILE = parseInt("0644", 8);

var ONE_BYTE = 1;
var ONE_KILOBYTE = 1024 * ONE_BYTE;
var ONE_MEGABYTE = 1024 * ONE_KILOBYTE;

var DEFAULT_NETWORK_TIMEOUT_DELAY = 5;

var CDATA_START = "<![CDATA[";
var CDATA_END = "]]>";
var CDATA_ESCAPED_END = CDATA_END + "]]&gt;" + CDATA_START;

var Log4Moz = {
  Level: {
    Fatal: 70,
    Error: 60,
    Warn: 50,
    Info: 40,
    Config: 30,
    Debug: 20,
    Trace: 10,
    All: 0,
    Desc: {
      70: "FATAL",
      60: "ERROR",
      50: "WARN",
      40: "INFO",
      30: "CONFIG",
      20: "DEBUG",
      10: "TRACE",
      0: "ALL",
    },
  },

  /**
   * Create a logger and configure it with dump and console appenders as
   * specified by prefs based on the logger name.
   *
   * E.g., if the loggername is "foo" (case sensitive), then look for:
   *   foo.logging.console
   *   foo.logging.dump
   *
   * whose values can be empty: no logging of that type; or any of
   * 'Fatal', 'Error', 'Warn', 'Info', 'Config', 'Debug', 'Trace', 'All',
   * in which case the logging level for each appender will be set accordingly
   *
   * Parameters:
   *
   * @param loggername The name of the logger
   * @param level (optional) the level of the logger itself
   * @param consoleLevel (optional) the level of the console appender
   * @param dumpLevel (optional) the level of the dump appender
   *
   * As described above, well-named prefs override the last two parameters
   **/

  getConfiguredLogger(loggername, level, consoleLevel, dumpLevel) {
    let log = Log4Moz.repository.getLogger(loggername);
    if (log._configured) {
      return log;
    }

    let formatter = new Log4Moz.BasicFormatter();

    level = level || Log4Moz.Level.Error;

    consoleLevel = consoleLevel || -1;
    dumpLevel = dumpLevel || -1;
    let branch = Services.prefs.getBranch(loggername + ".logging.");
    if (branch) {
      try {
        // figure out if event-driven indexing should be enabled...
        let consoleLevelString = branch.getCharPref("console");
        if (consoleLevelString) {
          // capitalize to fit with Log4Moz.Level expectations
          consoleLevelString =
            consoleLevelString.charAt(0).toUpperCase() +
            consoleLevelString.substr(1).toLowerCase();
          consoleLevel =
            consoleLevelString == "None"
              ? 100
              : Log4Moz.Level[consoleLevelString];
        }
      } catch (ex) {
        // Ignore if preference is not found
      }
      try {
        let dumpLevelString = branch.getCharPref("dump");
        if (dumpLevelString) {
          // capitalize to fit with Log4Moz.Level expectations
          dumpLevelString =
            dumpLevelString.charAt(0).toUpperCase() +
            dumpLevelString.substr(1).toLowerCase();
          dumpLevel =
            dumpLevelString == "None" ? 100 : Log4Moz.Level[dumpLevelString];
        }
      } catch (ex) {
        // Ignore if preference is not found
      }
    }

    if (consoleLevel != 100) {
      if (consoleLevel == -1) {
        consoleLevel = Log4Moz.Level.Error;
      }
      let capp = new Log4Moz.ConsoleAppender(formatter);
      capp.level = consoleLevel;
      log.addAppender(capp);
    }

    if (dumpLevel != 100) {
      if (dumpLevel == -1) {
        dumpLevel = Log4Moz.Level.Error;
      }
      let dapp = new Log4Moz.DumpAppender(formatter);
      dapp.level = dumpLevel;
      log.addAppender(dapp);
    }

    log.level = Math.min(level, Math.min(consoleLevel, dumpLevel));

    log._configured = true;

    return log;
  },

  get repository() {
    delete Log4Moz.repository;
    Log4Moz.repository = new LoggerRepository();
    return Log4Moz.repository;
  },
  set repository(value) {
    delete Log4Moz.repository;
    Log4Moz.repository = value;
  },

  get LogMessage() {
    return LogMessage;
  },
  get Logger() {
    return Logger;
  },
  get LoggerRepository() {
    return LoggerRepository;
  },

  get Formatter() {
    return Formatter;
  },
  get BasicFormatter() {
    return BasicFormatter;
  },
  get XMLFormatter() {
    return XMLFormatter;
  },
  get JSONFormatter() {
    return JSONFormatter;
  },
  get Appender() {
    return Appender;
  },
  get DumpAppender() {
    return DumpAppender;
  },
  get ConsoleAppender() {
    return ConsoleAppender;
  },
  get TimeAwareMemoryBucketAppender() {
    return TimeAwareMemoryBucketAppender;
  },
  get FileAppender() {
    return FileAppender;
  },
  get SocketAppender() {
    return SocketAppender;
  },
  get RotatingFileAppender() {
    return RotatingFileAppender;
  },
  get ThrowingAppender() {
    return ThrowingAppender;
  },

  // Logging helper:
  // let logger = Log4Moz.repository.getLogger("foo");
  // logger.info(Log4Moz.enumerateInterfaces(someObject).join(","));
  enumerateInterfaces(aObject) {
    let interfaces = [];

    for (let i in Ci) {
      try {
        aObject.QueryInterface(Ci[i]);
        interfaces.push(i);
      } catch (ex) {}
    }

    return interfaces;
  },

  // Logging helper:
  // let logger = Log4Moz.repository.getLogger("foo");
  // logger.info(Log4Moz.enumerateProperties(someObject).join(","));
  enumerateProperties(aObject, aExcludeComplexTypes) {
    let properties = [];

    for (var p in aObject) {
      try {
        if (
          aExcludeComplexTypes &&
          (typeof aObject[p] == "object" || typeof aObject[p] == "function")
        ) {
          continue;
        }
        properties.push(p + " = " + aObject[p]);
      } catch (ex) {
        properties.push(p + " = " + ex);
      }
    }

    return properties;
  },
};

function LoggerContext() {
  this._started = this._lastStateChange = Date.now();
  this._state = "started";
}
LoggerContext.prototype = {
  _jsonMe: true,
  _id: "unknown",
  setState(aState) {
    this._state = aState;
    this._lastStateChange = Date.now();
    return this;
  },
  finish() {
    this._finished = Date.now();
    this._state = "finished";
    return this;
  },
  toString() {
    return "[Context: " + this._id + " state: " + this._state + "]";
  },
};

/*
 * LogMessage
 * Encapsulates a single log event's data
 */
function LogMessage(loggerName, level, messageObjects) {
  this.loggerName = loggerName;
  this.messageObjects = messageObjects;
  this.level = level;
  this.time = Date.now();
}
LogMessage.prototype = {
  get levelDesc() {
    if (this.level in Log4Moz.Level.Desc) {
      return Log4Moz.Level.Desc[this.level];
    }
    return "UNKNOWN";
  },

  toString() {
    return (
      "LogMessage [" +
      this.time +
      " " +
      this.level +
      " " +
      this.messageObjects +
      "]"
    );
  },
};

/*
 * Logger
 * Hierarchical version.  Logs to all appenders, assigned or inherited
 */

function Logger(name, repository) {
  this._init(name, repository);
}
Logger.prototype = {
  _init(name, repository) {
    if (!repository) {
      repository = Log4Moz.repository;
    }
    this._name = name;
    this.children = [];
    this.ownAppenders = [];
    this.appenders = [];
    this._repository = repository;
  },

  get name() {
    return this._name;
  },

  _level: null,
  get level() {
    if (this._level != null) {
      return this._level;
    }
    if (this.parent) {
      return this.parent.level;
    }
    dump(
      "log4moz warning: root logger configuration error: no level defined\n"
    );
    return Log4Moz.Level.All;
  },
  set level(level) {
    this._level = level;
  },

  _parent: null,
  get parent() {
    return this._parent;
  },
  set parent(parent) {
    if (this._parent == parent) {
      return;
    }
    // Remove ourselves from parent's children
    if (this._parent) {
      let index = this._parent.children.indexOf(this);
      if (index != -1) {
        this._parent.children.splice(index, 1);
      }
    }
    this._parent = parent;
    parent.children.push(this);
    this.updateAppenders();
  },

  updateAppenders() {
    if (this._parent) {
      let notOwnAppenders = this._parent.appenders.filter(function(appender) {
        return !this.ownAppenders.includes(appender);
      }, this);
      this.appenders = notOwnAppenders.concat(this.ownAppenders);
    } else {
      this.appenders = this.ownAppenders.slice();
    }

    // Update children's appenders.
    for (let i = 0; i < this.children.length; i++) {
      this.children[i].updateAppenders();
    }
  },

  addAppender(appender) {
    if (this.ownAppenders.includes(appender)) {
      return;
    }
    this.ownAppenders.push(appender);
    this.updateAppenders();
  },

  _nextContextId: 0,
  newContext(objWithProps) {
    if (!("_id" in objWithProps)) {
      objWithProps._id = this._name + ":" + ++this._nextContextId;
    }

    let c = new LoggerContext();
    c._isContext = true;
    for (let key in objWithProps) {
      c[key] = objWithProps[key];
    }
    return c;
  },

  removeAppender(appender) {
    let index = this.ownAppenders.indexOf(appender);
    if (index == -1) {
      return;
    }
    this.ownAppenders.splice(index, 1);
    this.updateAppenders();
  },

  log(level, args) {
    if (this.level > level) {
      return;
    }

    // Hold off on creating the message object until we actually have
    // an appender that's responsible.
    let message;
    let appenders = this.appenders;
    for (let i = 0; i < appenders.length; i++) {
      let appender = appenders[i];
      if (appender.level > level) {
        continue;
      }

      if (!message) {
        message = new LogMessage(this._name, level, args);
      }

      appender.append(message);
    }
  },

  fatal(...aArgs) {
    this.log(Log4Moz.Level.Fatal, aArgs);
  },
  error(...aArgs) {
    this.log(Log4Moz.Level.Error, aArgs);
  },
  warn(...aArgs) {
    this.log(Log4Moz.Level.Warn, aArgs);
  },
  info(...aArgs) {
    this.log(Log4Moz.Level.Info, aArgs);
  },
  config(...aArgs) {
    this.log(Log4Moz.Level.Config, aArgs);
  },
  debug(...aArgs) {
    this.log(Log4Moz.Level.Debug, aArgs);
  },
  trace(...aArgs) {
    this.log(Log4Moz.Level.Trace, aArgs);
  },
};

/*
 * LoggerRepository
 * Implements a hierarchy of Loggers
 */

function LoggerRepository() {}
LoggerRepository.prototype = {
  _loggers: {},

  _rootLogger: null,
  get rootLogger() {
    if (!this._rootLogger) {
      this._rootLogger = new Logger("root", this);
      this._rootLogger.level = Log4Moz.Level.All;
    }
    return this._rootLogger;
  },
  set rootLogger(logger) {
    throw new Error("Cannot change the root logger");
  },

  _updateParents(name) {
    let pieces = name.split(".");
    let cur, parent;

    // find the closest parent
    // don't test for the logger name itself, as there's a chance it's already
    // there in this._loggers
    for (let i = 0; i < pieces.length - 1; i++) {
      if (cur) {
        cur += "." + pieces[i];
      } else {
        cur = pieces[i];
      }
      if (cur in this._loggers) {
        parent = cur;
      }
    }

    // if we didn't assign a parent above, there is no parent
    if (!parent) {
      this._loggers[name].parent = this.rootLogger;
    } else {
      this._loggers[name].parent = this._loggers[parent];
    }

    // trigger updates for any possible descendants of this logger
    for (let logger in this._loggers) {
      if (logger != name && logger.indexOf(name) == 0) {
        this._updateParents(logger);
      }
    }
  },

  getLogger(name) {
    if (name in this._loggers) {
      return this._loggers[name];
    }
    this._loggers[name] = new Logger(name, this);
    this._updateParents(name);
    return this._loggers[name];
  },
};

/*
 * Formatters
 * These massage a LogMessage into whatever output is desired
 * Only the BasicFormatter is currently implemented
 */

// Abstract formatter
function Formatter() {}
Formatter.prototype = {
  format(message) {},
};

// services' log4moz lost the date formatting default...
function BasicFormatter() {}
BasicFormatter.prototype = {
  __proto__: Formatter.prototype,

  format(message) {
    let date = new Date(message.time);
    // Format timestamp as: "%Y-%m-%d %H:%M:%S"
    let year = date.getFullYear().toString();
    let month = (date.getMonth() + 1).toString().padStart(2, "0");
    let day = date
      .getDate()
      .toString()
      .padStart(2, "0");
    let hours = date
      .getHours()
      .toString()
      .padStart(2, "0");
    let minutes = date
      .getMinutes()
      .toString()
      .padStart(2, "0");
    let seconds = date
      .getSeconds()
      .toString()
      .padStart(2, "0");

    let timeStamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    // The trick below prevents errors further down because mo is null or
    //  undefined.
    let messageString = message.messageObjects.map(mo => "" + mo).join(" ");
    return (
      timeStamp +
      "\t" +
      message.loggerName +
      "\t" +
      message.levelDesc +
      "\t" +
      messageString +
      "\n"
    );
  },
};

/*
 * XMLFormatter
 * Format like log4j's XMLLayout.  The intent is that you can hook this up to
 * a SocketAppender and point them at a Chainsaw GUI running with an
 * XMLSocketReceiver running.  Then your output comes out in Chainsaw.
 * (Chainsaw is log4j's GUI that displays log output with niceties such as
 * filtering and conditional coloring.)
 */

function XMLFormatter() {}
XMLFormatter.prototype = {
  __proto__: Formatter.prototype,

  format(message) {
    let cdataEscapedMessage = message.messageObjects
      .map(mo => (typeof mo == "object" ? mo.toString() : mo))
      .join(" ")
      .split(CDATA_END)
      .join(CDATA_ESCAPED_END);
    return (
      "<log4j:event logger='" +
      message.loggerName +
      "' " +
      "level='" +
      message.levelDesc +
      "' thread='unknown' " +
      "timestamp='" +
      message.time +
      "'>" +
      "<log4j:message><![CDATA[" +
      cdataEscapedMessage +
      "]]></log4j:message>" +
      "</log4j:event>"
    );
  },
};

function JSONFormatter() {}
JSONFormatter.prototype = {
  __proto__: Formatter.prototype,

  format(message) {
    // XXX I did all kinds of questionable things in here; they should be
    //  resolved...
    // 1) JSON does not walk the __proto__ chain; there is no need to clobber
    //   it.
    // 2) Our net mutation is sorta redundant messageObjects alongside
    //   msgObjects, although we only serialize one.
    let origMessageObjects = message.messageObjects;
    message.messageObjects = [];
    for (let messageObject of origMessageObjects) {
      if (messageObject) {
        if (messageObject._jsonMe) {
          message.messageObjects.push(messageObject);
          // FIXME: the commented out code should be fixed in a better way.
          // See bug 984539: find a good way to avoid JSONing the impl in log4moz
          // // temporarily strip the prototype to avoid JSONing the impl.
          // reProto.push([messageObject, messageObject.__proto__]);
          // messageObject.__proto__ = undefined;
        } else {
          message.messageObjects.push(messageObject.toString());
        }
      } else {
        message.messageObjects.push(messageObject);
      }
    }
    let encoded = JSON.stringify(message) + "\r\n";
    message.msgObjects = origMessageObjects;
    // for (let objectAndProtoPair of reProto) {
    //   objectAndProtoPair[0].__proto__ = objectAndProtoPair[1];
    // }
    return encoded;
  },
};

/*
 * Appenders
 * These can be attached to Loggers to log to different places
 * Simply subclass and override doAppend to implement a new one
 */

function Appender(formatter) {
  this._name = "Appender";
  this._formatter = formatter ? formatter : new BasicFormatter();
}
Appender.prototype = {
  _level: Log4Moz.Level.All,

  append(message) {
    this.doAppend(this._formatter.format(message));
  },
  toString() {
    return (
      this._name +
      " [level=" +
      this._level +
      ", formatter=" +
      this._formatter +
      "]"
    );
  },
  doAppend(message) {},
};

/*
 * DumpAppender
 * Logs to standard out
 */

function DumpAppender(formatter) {
  this._name = "DumpAppender";
  this._formatter = formatter ? formatter : new BasicFormatter();
}
DumpAppender.prototype = {
  __proto__: Appender.prototype,

  doAppend(message) {
    dump(message);
  },
};

/**
 * An in-memory appender that always logs to its in-memory bucket and associates
 * each message with a timestamp.  Whoever creates us is responsible for causing
 * us to switch to a new bucket using whatever criteria is appropriate.
 *
 * This is intended to be used roughly like an in-memory circular buffer.  The
 * expectation is that we are being used for unit tests and that each unit test
 * function will get its own bucket.  In the event that a test fails we would
 * be asked for the contents of the current bucket and some portion of the
 * previous bucket using up to some duration.
 */
function TimeAwareMemoryBucketAppender() {
  this._name = "TimeAwareMemoryBucketAppender";
  this._level = Log4Moz.Level.All;

  this._lastBucket = null;
  // to minimize object construction, even indices are timestamps, odd indices
  //  are the message objects.
  this._curBucket = [];
  this._curBucketStartedAt = Date.now();
}
TimeAwareMemoryBucketAppender.prototype = {
  get level() {
    return this._level;
  },
  set level(level) {
    this._level = level;
  },

  append(message) {
    if (this._level <= message.level) {
      this._curBucket.push(message);
    }
  },

  newBucket() {
    this._lastBucket = this._curBucket;
    this._curBucketStartedAt = Date.now();
    this._curBucket = [];
  },

  getPreviousBucketEvents(aNumMS) {
    let lastBucket = this._lastBucket;
    if (lastBucket == null || !lastBucket.length) {
      return [];
    }
    let timeBound = this._curBucketStartedAt - aNumMS;
    // seek backwards through the list...
    let i;
    for (i = lastBucket.length - 1; i >= 0; i--) {
      if (lastBucket[i].time < timeBound) {
        break;
      }
    }
    return lastBucket.slice(i + 1);
  },

  getBucketEvents() {
    return this._curBucket.concat();
  },

  toString() {
    return "[TimeAwareMemoryBucketAppender]";
  },
};

/*
 * ConsoleAppender
 * Logs to the javascript console
 */

function ConsoleAppender(formatter) {
  this._name = "ConsoleAppender";
  this._formatter = formatter;
}
ConsoleAppender.prototype = {
  __proto__: Appender.prototype,

  // override to send Error and higher level messages to Cu.reportError()
  append(message) {
    let stringMessage = this._formatter.format(message);
    if (message.level > Log4Moz.Level.Warn) {
      Cu.reportError(stringMessage);
    }
    this.doAppend(stringMessage);
  },

  doAppend(message) {
    Services.console.logStringMessage(message);
  },
};

/*
 * FileAppender
 * Logs to a file
 */

function FileAppender(file, formatter) {
  this._name = "FileAppender";
  this._file = file; // nsIFile
  this._formatter = formatter ? formatter : new BasicFormatter();
}
FileAppender.prototype = {
  __proto__: Appender.prototype,

  __fos: null,
  get _fos() {
    if (!this.__fos) {
      this.openStream();
    }
    return this.__fos;
  },

  openStream() {
    this.__fos = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(
      Ci.nsIFileOutputStream
    );
    let flags = MODE_WRONLY | MODE_CREATE | MODE_APPEND;
    this.__fos.init(this._file, flags, PERMS_FILE, 0);
  },

  closeStream() {
    if (!this.__fos) {
      return;
    }
    try {
      this.__fos.close();
      this.__fos = null;
    } catch (e) {
      dump("Failed to close file output stream\n" + e);
    }
  },

  doAppend(message) {
    if (message === null || message.length <= 0) {
      return;
    }
    try {
      this._fos.write(message, message.length);
    } catch (e) {
      dump("Error writing file:\n" + e);
    }
  },

  clear() {
    this.closeStream();
    this._file.remove(false);
  },
};

/*
 * RotatingFileAppender
 * Similar to FileAppender, but rotates logs when they become too large
 */

function RotatingFileAppender(file, formatter, maxSize, maxBackups) {
  if (maxSize === undefined) {
    maxSize = ONE_MEGABYTE * 2;
  }

  if (maxBackups === undefined) {
    maxBackups = 0;
  }

  this._name = "RotatingFileAppender";
  this._file = file; // nsIFile
  this._formatter = formatter ? formatter : new BasicFormatter();
  this._maxSize = maxSize;
  this._maxBackups = maxBackups;
}
RotatingFileAppender.prototype = {
  __proto__: FileAppender.prototype,

  doAppend(message) {
    if (message === null || message.length <= 0) {
      return;
    }
    try {
      this.rotateLogs();
      this._fos.write(message, message.length);
    } catch (e) {
      dump("Error writing file:\n" + e);
    }
  },
  rotateLogs() {
    if (this._file.exists() && this._file.fileSize < this._maxSize) {
      return;
    }

    this.closeStream();

    for (let i = this.maxBackups - 1; i > 0; i--) {
      let backup = this._file.parent.clone();
      backup.append(this._file.leafName + "." + i);
      if (backup.exists()) {
        backup.moveTo(this._file.parent, this._file.leafName + "." + (i + 1));
      }
    }

    let cur = this._file.clone();
    if (cur.exists()) {
      cur.moveTo(cur.parent, cur.leafName + ".1");
    }

    // Note: this._file still points to the same file
  },
};

/*
 * SocketAppender
 * Logs via TCP to a given host and port.  Attempts to automatically reconnect
 * when the connection drops or cannot be initially re-established.  Connection
 * attempts will happen at most every timeoutDelay seconds (has a sane default
 * if left blank).  Messages are dropped when there is no connection.
 */

function SocketAppender(host, port, formatter, timeoutDelay) {
  this._name = "SocketAppender";
  this._host = host;
  this._port = port;
  this._formatter = formatter ? formatter : new BasicFormatter();
  this._timeout_delay = timeoutDelay || DEFAULT_NETWORK_TIMEOUT_DELAY;

  this._socketService = Cc[
    "@mozilla.org/network/socket-transport-service;1"
  ].getService(Ci.nsISocketTransportService);
  this._mainThread = Services.tm.mainThread;
}
SocketAppender.prototype = {
  __proto__: Appender.prototype,

  __nos: null,
  get _nos() {
    if (!this.__nos) {
      this.openStream();
    }
    return this.__nos;
  },
  _nextCheck: 0,
  openStream() {
    let now = Date.now();
    if (now <= this._nextCheck) {
      return;
    }
    this._nextCheck = now + this._timeout_delay * 1000;
    try {
      this._transport = this._socketService.createTransport(
        [], // default socket type
        this._host,
        this._port,
        null
      ); // no proxy
      this._transport.setTimeout(
        Ci.nsISocketTransport.TIMEOUT_CONNECT,
        this._timeout_delay
      );
      // do not set a timeout for TIMEOUT_READ_WRITE. The timeout is not
      //  entirely intuitive; your socket will time out if no one reads or
      //  writes to the socket within the timeout.  That, as you can imagine,
      //  is not what we want.
      this._transport.setEventSink(this, this._mainThread);

      let outputStream = this._transport.openOutputStream(
        0, // neither blocking nor unbuffered operation is desired
        0, // default buffer size is fine
        0 // default buffer count is fine
      );

      let uniOutputStream = Cc[
        "@mozilla.org/intl/converter-output-stream;1"
      ].createInstance(Ci.nsIConverterOutputStream);
      uniOutputStream.init(outputStream, "utf-8");

      this.__nos = uniOutputStream;
    } catch (ex) {
      dump(
        "Unexpected SocketAppender connection problem: " +
          ex.fileName +
          ":" +
          ex.lineNumber +
          ": " +
          ex +
          "\n"
      );
    }
  },

  closeStream() {
    if (!this._transport) {
      return;
    }
    try {
      this._connected = false;
      this._transport = null;
      let nos = this.__nos;
      this.__nos = null;
      nos.close();
    } catch (e) {
      // this shouldn't happen, but no one cares
    }
  },

  doAppend(message) {
    if (message === null || message.length <= 0) {
      return;
    }
    try {
      let nos = this._nos;
      if (nos) {
        nos.writeString(message);
      }
    } catch (e) {
      if (this._transport && !this._transport.isAlive()) {
        this.closeStream();
      }
    }
  },

  clear() {
    this.closeStream();
  },

  /* nsITransportEventSink */
  onTransportStatus(aTransport, aStatus, aProgress, aProgressMax) {
    if (aStatus == Ci.nsISocketTransport.STATUS_CONNECTED_TO) {
      this._connected = true;
    }
  },
};

/**
 * Throws an exception whenever it gets a message.  Intended to be used in
 * automated testing situations where the code would normally log an error but
 * not die in a fatal manner.
 */
function ThrowingAppender(thrower, formatter) {
  this._name = "ThrowingAppender";
  this._formatter = formatter ? formatter : new BasicFormatter();
  this._thrower = thrower;
}
ThrowingAppender.prototype = {
  __proto__: Appender.prototype,

  doAppend(message) {
    if (this._thrower) {
      this._thrower(message);
    } else {
      throw message;
    }
  },
};
