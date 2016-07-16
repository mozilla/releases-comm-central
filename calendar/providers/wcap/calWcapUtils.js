/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported getCalendarSearchService, getDomParser, isParent, filterXmlNodes,
 *          getIcalUTC, getDatetimeFromIcalProp
 */

Components.utils.import("resource://calendar/modules/calIteratorUtils.jsm");
Components.utils.import("resource://calendar/modules/calUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/Preferences.jsm");

var g_bShutdown = false;

function initLogging() {
    initLogging.mLogTimezone = calendarDefaultTimezone();
    if (initLogging.mLogFilestream) {
        try {
            initLogging.mLogFilestream.close();
        } catch (exc) {
            ASSERT(false, exc);
        }
        initLogging.mLogFilestream = null;
    }

    LOG_LEVEL = getPref("calendar.wcap.log_level", 0);
    if (LOG_LEVEL < 1 && getPref("calendar.debug.log", false)) {
        LOG_LEVEL = 1; // at least basic logging when calendar.debug.log is set
    }

    if (LOG_LEVEL > 0) {
        let logFileName = getPref("calendar.wcap.log_file", null);
        if (logFileName) {
            try {
                // set up file:
                let logFile = Components.classes["@mozilla.org/file/local;1"]
                                        .createInstance(Components.interfaces.nsILocalFile);
                logFile.initWithPath(logFileName);
                // create output stream:
                let logFileStream = Components.classes["@mozilla.org/network/file-output-stream;1"]
                                              .createInstance(Components.interfaces.nsIFileOutputStream);
                logFileStream.init(logFile,
                                   0x02 /* PR_WRONLY */ |
                                   0x08 /* PR_CREATE_FILE */ |
                                   (getPref("calendar.wcap.log_file_append", false)
                                    ? 0x10 /* PR_APPEND */ : 0x20 /* PR_TRUNCATE */),
                                   parseInt("0700", 8) /* read, write, execute/search by owner */,
                                   0 /* unused */);
                initLogging.mLogFilestream = logFileStream;
            } catch (exc) {
                logError(exc, "init logging");
            }
        }
        log("################################# NEW WCAP LOG #################################", "init logging");
        logWarning("WCAP logging enabled! level=" + LOG_LEVEL +
                   (initLogging.mLogFilestream ? (", file=" + logFileName) : ""));
    }
    if (!initLogging.mLogPrefObserver) {
        initLogging.mLogPrefObserver = { // nsIObserver:
            observe: function(subject, topic, data) {
                if (topic == "nsPref:changed") {
                    switch (data) {
                        case "calendar.wcap.log_level":
                        case "calendar.wcap.log_file":
                        case "calendar.debug.log":
                            initLogging();
                            break;
                    }
                }
            }
        };
        Services.prefs.addObserver("calendar.wcap.log_level", initLogging.mLogPrefObserver, false);
        Services.prefs.addObserver("calendar.wcap.log_file", initLogging.mLogPrefObserver, false);
        Services.prefs.addObserver("calendar.debug.log", initLogging.mLogPrefObserver, false);

        let appObserver = { // nsIObserver:
            observe: function(subject, topic, data) {
                if (topic == "quit-application") {
                    Services.prefs.removeObserver("calendar.", initLogging.mLogPrefObserver);
                }
            }
        };
        Services.obs.addObserver(appObserver, "quit-application", false);
    }
}

function log(msg, context, bForce) {
    if (bForce || LOG_LEVEL > 0) {
        let ret = "";
        if (context) {
            ret += "[" + context + "]";
        }
        if (ret.length > 0) {
            ret += "\n";
        }
        ret += msg;
        let now = getTime();
        if (now && initLogging.mLogTimezone) {
            now = now.getInTimezone(initLogging.mLogTimezone);
        }
        let str = "### WCAP log entry: " + now + "\n" + ret;
        Services.console.logStringMessage(str);
        str = "\n" + str + "\n";
        dump(str);
        if (initLogging.mLogFilestream) {
            try {
                // xxx todo?
                // assuming ANSI chars here, for logging sufficient:
                initLogging.mLogFilestream.write(str, str.length);
            } catch (exc) { // catching any io errors here:
                let err = "error writing log file: " + errorToString(exc);
                Components.utils.reportError(exc);
                Services.console.logStringMessage(err);
                dump(err + "\n\n");
            }
        }
        return ret;
    } else {
        return msg;
    }
}

function logWarning(err, context) {
    let msg = errorToString(err);
    let scriptError = Components.classes["@mozilla.org/scripterror;1"]
                                .createInstance(Components.interfaces.nsIScriptError);
    scriptError.init(log("warning: " + msg, context, true),
                     null, null, 0, 0,
                     Components.interfaces.nsIScriptError.warningFlag,
                     "component javascript");
    Services.console.logMessage(scriptError);
    return msg;
}

function logError(err, context) {
    let msg = errorToString(err);
    Components.utils.reportError(log("error: " + msg + "\nstack:\n" + STACK(10), context, true));
    return msg;
}

// late-inited service accessors:

function getCalendarSearchService() {
    if (!getCalendarSearchService.m_obj) {
        getCalendarSearchService.m_obj = Components.classes["@mozilla.org/calendar/calendarsearch-service;1"]
                                                   .getService(Components.interfaces.calICalendarSearchService);
    }
    return getCalendarSearchService.m_obj;
}

function getDomParser() {
    if (!getDomParser.m_obj) {
        getDomParser.m_obj = Components.classes["@mozilla.org/xmlextras/domparser;1"]
                                       .getService(Components.interfaces.nsIDOMParser);
    }
    return getDomParser.m_obj;
}

function isParent(item) {
    if (item.id != item.parentItem.id) {
        throw new Components.Exception("proxy has different id than its parent!");
    }
    return !item.recurrenceId;
}

function filterXmlNodes(name, rootNode) {
    let ret = [];
    if (rootNode) {
        let nodeList = rootNode.getElementsByTagName(name);
        for (let i = 0; i < nodeList.length; ++i) {
            let node = nodeList.item(i);
            ret.push(node.textContent.trim());
        }
    }
    return ret;
}

function getTime() {
    if (g_bShutdown) {
        return null;
    }
    return cal.jsDateToDateTime(new Date());
}

function getIcalUTC(date) {
    if (!date || !date.isValid) {
        return "0";
    } else {
        let dtz = date.timezone;
        if (dtz.isUTC || dtz.isFloating) {
            return date.icalString;
        } else {
            return date.getInTimezone(UTC()).icalString;
        }
    }
}

function getDatetimeFromIcalString(val) {
    if (!val || val.length == 0 || val == "0") {
        return null;
    }
    // assuming timezone is known:
    let date = createDateTime();
    date.icalString = val;
    return date;
}

function getDatetimeFromIcalProp(prop) {
    if (!prop) {
        return null;
    }
    return getDatetimeFromIcalString(prop.valueAsIcalString);
}

function getPref(prefName, defaultValue) {
    let ret = Preferences.get(prefName, defaultValue);
    log(ret, "getPref(): prefName=" + prefName);
    return ret;
}
