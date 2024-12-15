/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Namespaces we happen to need:
const XHTML_NS = "http://www.w3.org/1999/xhtml";

var DEBUG = true;
var dd, warn, TEST, ASSERT;

if (DEBUG) {
    var _dd_pfx = "";
    var _dd_singleIndent = "  ";
    var _dd_indentLength = _dd_singleIndent.length;
    var _dd_currentIndent = "";
    var _dd_lastDumpWasOpen = false;
    var _dd_timeStack = new Array();
    var _dd_disableDepth = Number.MAX_VALUE;
    var _dd_currentDepth = 0;
    dd = function _dd(str) {
             if (typeof str != "string") {
                 dump(str + "\n");
             } else if (str == "") {
                 dump("<empty-string>\n");
             } else if (str[str.length - 1] == "{") {
                 ++_dd_currentDepth;
                 if (_dd_currentDepth >= _dd_disableDepth)
                     return;
                 if (str.indexOf("OFF") == 0)
                     _dd_disableDepth = _dd_currentDepth;
                 _dd_timeStack.push (new Date());
                 if (_dd_lastDumpWasOpen)
                     dump("\n");
                 dump (_dd_pfx + _dd_currentIndent + str);
                 _dd_currentIndent += _dd_singleIndent;
                 _dd_lastDumpWasOpen = true;
             } else if (str[0] == "}") {
                 if (--_dd_currentDepth >= _dd_disableDepth)
                     return;
                 _dd_disableDepth = Number.MAX_VALUE;
                 var sufx = (new Date() - _dd_timeStack.pop()) / 1000 + " sec";
                 _dd_currentIndent =
                     _dd_currentIndent.substr(0, _dd_currentIndent.length -
                                              _dd_indentLength);
                 if (_dd_lastDumpWasOpen)
                     dump(str + " " + sufx + "\n");
                 else
                     dump(_dd_pfx + _dd_currentIndent + str + " " +
                          sufx + "\n");
                 _dd_lastDumpWasOpen = false;
             } else {
                 if (_dd_currentDepth >= _dd_disableDepth)
                     return;
                 if (_dd_lastDumpWasOpen)
                     dump("\n");
                 dump(_dd_pfx + _dd_currentIndent + str + "\n");
                 _dd_lastDumpWasOpen = false;
             }
         }
    warn = function (msg) { dd("** WARNING " + msg + " **"); }
    TEST = ASSERT = function _assert(expr, msg) {
                 if (!expr) {
                     var m = "** ASSERTION FAILED: " + msg + " **\n" +
                             getStackTrace();
                     try {
                         Services.prompt.alert(window, MSG_ALERT, m);
                     } catch(ex) {}
                     dd(m);
                     return false;
                 } else {
                     return true;
                 }
             }
} else {
    dd = warn = TEST = ASSERT = function (){};
}

/* Dumps an object in tree format. A sample dumpObjectTree(o) is shown below.
 *
 * + parent (object)
 * + users (object)
 * + bans (object)
 * + topic (string) 'ircclient.js:59: nothing is not defined'
 * + getUsersLength (function) 9 lines
 * *
 */
function dumpObjectTree(o)
{
    let s = "";

    for (let i in o)
    {
        var t, ex;

        try
        {
            t = typeof o[i];
        }
        catch (ex)
        {
            t = "ERROR";
        }

        s += "+ " + i + " (" + t + ") ";

        switch (t)
        {
            case "function":
                var sfunc = String(o[i]).split("\n");
                if (sfunc[2] == "    [native code]")
                    sfunc = "[native code]";
                else
                    if (sfunc.length == 1)
                        sfunc = String(sfunc);
                    else
                        sfunc = sfunc.length + " lines";
                s += sfunc + "\n";
                break;

            case "object":
                if (o[i] == null)
                {
                    s += "null\n";
                    break;
                }

                s += "\n";
                break;

            case "string":
                if (o[i].length > 200)
                    s += o[i].length + " chars\n";
                else
                    s += "'" + o[i] + "'\n";
                break;

            case "ERROR":
                s += "?\n";
                break;

            default:
                s += o[i] + "\n";

        }

    }

    s += "*\n";

    return s;

}

function ecmaEscape(str)
{
    function replaceNonPrintables(ch)
    {
        var rv = ch.charCodeAt().toString(16);
        if (rv.length == 1)
            rv = "0" + rv;
        else if (rv.length == 3)
            rv = "u0" + rv;
        else if (rv.length == 4)
            rv = "u" + rv;

        return "%" + rv;
    };

    // Replace any character that is not in the 69 character set
    // [ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@*_+-./]
    // with an escape sequence.  Two digit sequences in the form %XX are used
    // for characters whose codepoint is less than 255, %uXXXX for all others.
    // See section B.2.1 of ECMA-262 rev3 for more information.
    return str.replace(/[^A-Za-z0-9@*_+.\-\/]/g, replaceNonPrintables);
}

function ecmaUnescape(str)
{
    function replaceEscapes(seq)
    {
        var ary = seq.match(/([\da-f]{1,2})(.*)|u([\da-f]{1,4})/i);
        if (!ary)
            return "<ERROR>";

        var rv;
        if (ary[1])
        {
            // two digit escape, possibly with cruft after
            rv = String.fromCharCode(parseInt(ary[1], 16)) + ary[2];
        }
        else
        {
            // four digits, no cruft
            rv = String.fromCharCode(parseInt(ary[3], 16));
        }

        return rv;
    };

    // Replace the escape sequences %X, %XX, %uX, %uXX, %uXXX, and %uXXXX with
    // the characters they represent, where X is a hexadecimal digit.
    // See section B.2.2 of ECMA-262 rev3 for more information.
    return str.replace(/%u?([\da-f]{1,4})/ig, replaceEscapes);
}

function formatException(ex)
{
    if (isinstance(ex, Error))
    {
        return getMsg(MSG_FMT_JSEXCEPTION, [ex.name, ex.message, ex.fileName,
                                            ex.lineNumber]);
    }
    if ((typeof ex == "object") && ("filename" in ex))
    {
        return getMsg(MSG_FMT_JSEXCEPTION, [ex.name, ex.message, ex.filename,
                                            ex.lineNumber]);
    }

    return String(ex);
}

function encodeChar(ch)
{
   return "%" + ch.charCodeAt(0).toString(16);
}

function escapeFileName(fileName)
{
    // Escape / \ : * ? " < > | so they don't cause trouble.
    return fileName.replace(/[\/\\\:\*\?"<>\|]/g, encodeChar);
}

function toOpenWindowByType(inType, url, features)
{
    var topWindow = Services.wm.getMostRecentWindow(inType);

    if (typeof features == "undefined")
        features = "chrome,extrachrome,menubar,resizable," +
                   "scrollbars,status,toolbar";

    if (topWindow)
        topWindow.focus();
    else
        window.open(url, "_blank", features);
}

function getContentWindow(frame)
{
    try
    {
        if (!frame || !("contentWindow" in frame))
            return false;

        // The "in" operator does not detect wrappedJSObject, so don't bother.
        if (frame.contentWindow.wrappedJSObject)
            return frame.contentWindow.wrappedJSObject;
        return frame.contentWindow;
    }
    catch (ex)
    {
        // throws exception is contentWindow is gone
        return null;
    }
}

function getContentDocument(frame)
{
    try
    {
        if (!frame || !("contentDocument" in frame))
            return false;

        // The "in" operator does not detect wrappedJSObject, so don't bother.
        if (frame.contentDocument.wrappedJSObject)
            return frame.contentDocument.wrappedJSObject;
        return frame.contentDocument;
    }
    catch (ex)
    {
        // throws exception is contentDocument is gone
        return null;
    }
}

function arrayHasElementAt(ary, i)
{
    return typeof ary[i] != "undefined";
}

function getStackTrace ()
{
    var frame = Components.stack.caller;
    var str = "<top>";

    while (frame)
    {
        var name = frame.name ? frame.name : "[anonymous]";
        str += "\n" + name + "@" + frame.lineNumber;
        frame = frame.caller;
    }

    return str;

}

function getFileFromURLSpec(url)
{
    var handler = Services.io.getProtocolHandler("file")
                             .QueryInterface(Ci.nsIFileProtocolHandler);
    return handler.getFileFromURLSpec(url);
}

function getURLSpecFromFile(file)
{
    if (!file)
        return null;

    if (typeof file == "string")
    {
        let fileObj = Cc["@mozilla.org/file/local;1"]
                        .createInstance(Ci.nsIFile);
        fileObj.initWithPath(file);
        file = fileObj;
    }

    var fileHandler = Services.io.getProtocolHandler("file")
                                 .QueryInterface(Ci.nsIFileProtocolHandler);
    return fileHandler.getURLSpecFromFile(file);
}

function confirmEx(msg, buttons, defaultButton, checkText, checkVal)
{
    /* Note that on versions before Mozilla 0.9, using 3 buttons,
     * the revert or dontsave button, or custom button titles will NOT work.
     *
     * The buttons should be listed in the 'accept', 'cancel' and 'extra' order,
     * and the exact button order is host app- and platform-dependant.
     * For example, on Windows this is usually [button 1] [button 3] [button 2],
     * and on Linux [button 3] [button 2] [button 1].
     */
    var ps = Services.prompt;

    var buttonConstants = {
        ok: ps.BUTTON_TITLE_OK,
        cancel: ps.BUTTON_TITLE_CANCEL,
        yes: ps.BUTTON_TITLE_YES,
        no: ps.BUTTON_TITLE_NO,
        save: ps.BUTTON_TITLE_SAVE,
        revert: ps.BUTTON_TITLE_REVERT,
        dontsave: ps.BUTTON_TITLE_DONT_SAVE
    };
    var buttonFlags = 0;
    var buttonText = [null, null, null];

    if (!isinstance(buttons, Array))
        throw "buttons parameter must be an Array";
    if ((buttons.length < 1) || (buttons.length > 3))
        throw "the buttons array must have 1, 2 or 3 elements";

    for (var i = 0; i < buttons.length; i++)
    {
        var buttonFlag = ps.BUTTON_TITLE_IS_STRING;
        if ((buttons[i][0] == "!") && (buttons[i].substr(1) in buttonConstants))
            buttonFlag = buttonConstants[buttons[i].substr(1)];
        else
            buttonText[i] = buttons[i];

        buttonFlags += ps["BUTTON_POS_" + i] * buttonFlag;
    }

    // ignore anything but a proper number
    var defaultIsNumber = (typeof defaultButton == "number");
    if (defaultIsNumber && arrayHasElementAt(buttons, defaultButton))
        buttonFlags += ps["BUTTON_POS_" + defaultButton + "_DEFAULT"];

    if (!checkVal)
        checkVal = new Object();

    return ps.confirmEx(window, MSG_CONFIRM, msg, buttonFlags, buttonText[0],
                        buttonText[1], buttonText[2], checkText, checkVal);
}

function prompt(msg, initial)
{
    var rv = { value: initial };

    if (!Services.prompt.prompt(window, MSG_PROMPT, msg, rv, null,
                                {value: null}))
        return null;

    return rv.value;
}

function promptPassword(msg, initial)
{
    var rv = { value: initial };

    if (!Services.prompt.promptPassword(window, MSG_PROMPT, msg, rv, null,
                                        {value: null}))
        return null;

    return rv.value;
}

function getHostmaskParts(hostmask)
{
    var rv;
    // A bit cheeky this, we try the matches here, and then branch
    // according to the ones we like.
    var ary1 = hostmask.match(/([^ ]*)!([^ ]*)@(.*)/);
    var ary2 = hostmask.match(/([^ ]*)@(.*)/);
    var ary3 = hostmask.match(/([^ ]*)!(.*)/);
    if (ary1)
        rv = { nick: ary1[1],  user: ary1[2], host: ary1[3] };
    else if (ary2)
        rv = { nick: "*",      user: ary2[1], host: ary2[2] };
    else if (ary3)
        rv = { nick: ary3[1],  user: ary3[2], host: "*"     };
    else
        rv = { nick: hostmask, user: "*",     host: "*"     };
    // Make sure we got something for all fields.
    if (!rv.nick)
        rv.nick = "*";
    if (!rv.user)
        rv.user = "*";
    if (!rv.host)
        rv.host = "*";
    // And re-construct the 'parsed' hostmask.
    rv.mask = rv.nick + "!" + rv.user + "@" + rv.host;
    return rv;
}

function makeMaskRegExp(text)
{
    function escapeChars(c)
    {
        if (c == "*")
            return ".*";
        if (c == "?")
            return ".";
        return "\\" + c;
    }
    // Anything that's not alpha-numeric gets escaped.
    // "*" and "?" are 'escaped' to ".*" and ".".
    // Optimisation; * translates as 'match all'.
    return new RegExp("^" + text.replace(/[^\w\d]/g, escapeChars) + "$", "i");
}

function hostmaskMatches(user, mask)
{
    // Need to match .nick, .user, and .host.
    if (!("nickRE" in mask))
    {
        // We cache all the regexp objects, but use null if the term is
        // just "*", so we can skip having the object *and* the .match
        // later on.
        if (mask.nick == "*")
            mask.nickRE = null;
        else
            mask.nickRE = makeMaskRegExp(mask.nick);

        if (mask.user == "*")
            mask.userRE = null;
        else
            mask.userRE = makeMaskRegExp(mask.user);

        if (mask.host == "*")
            mask.hostRE = null;
        else
            mask.hostRE = makeMaskRegExp(mask.host);
    }

    var lowerNick;
    if (user.TYPE == "IRCChanUser")
        lowerNick = user.parent.parent.toLowerCase(user.unicodeName);
    else
        lowerNick = user.parent.toLowerCase(user.unicodeName);

    if ((!mask.nickRE || lowerNick.match(mask.nickRE)) &&
        (!mask.userRE || user.name.match(mask.userRE)) &&
        (!mask.hostRE || user.host.match(mask.hostRE)))
        return true;
    return false;
}

function isinstance(inst, base)
{
    /* Returns |true| if |inst| was constructed by |base|. Not 100% accurate,
     * but plenty good enough for us. This is to work around the fix for bug
     * 254067 which makes instanceof fail if the two sides are 'from'
     * different windows (something we don't care about).
     */
    return (inst && base &&
            ((inst instanceof base) ||
             (inst.constructor && (inst.constructor.name == base.name))));
}

function scaleNumberBy1024(number, msg, prefix)
{
    let scale = 0;
    if (number > 0)
    {
        scale = parseInt(Math.floor(Math.log(number) / Math.log(1024)));
        if (scale > 6)
            scale = 6;
        number /= Math.pow(1024, scale);
    }

    let fix = 0;
    if (number < 10)
        fix = 2;
    else if (number < 100)
        fix = 1;

    return getMsg(msg, [number.toFixed(fix), getMsg(prefix + scale)]);
}

function getSISize(size)
{
    return scaleNumberBy1024(size, MSG_SI_SIZE, "msg.si.size.");
}

function getSISpeed(speed)
{
    return scaleNumberBy1024(speed, MSG_SI_SPEED, "msg.si.speed.");
}

// Zero-pad Numbers (or pad with something else if you wish)
function padNumber(num, digits, pad)
{
    return num.toString().padStart(digits, pad || "0");
}

const timestr = {
    c: { replace: null },
    D: { replace: "%m/%d/%y" },
    F: { replace: "%Y-%m-%d" },
    H: { method: "getHours", pad: 2 },
    k: { method: "getHours", pad: 2, padwith: " " },
    M: { method: "getMinutes", pad: 2 },
    R: { replace: "%H:%M" },
    S: { method: "getSeconds", pad: 2 },
    T: { replace: "%H:%M:%S" },
    w: { method: "getDay" },
    x: { replace: null },
    X: { replace: null },
    initialized: false
}

function strftime(format, time)
{
    /* Javascript implementation of standard C strftime */

    if (!timestr.initialized)
    {
        timestr.c.replace = getMsg("datetime.patterns.lc");
        timestr.x.replace = getMsg("datetime.patterns.lx");
        timestr.X.replace = getMsg("datetime.patterns.ux");

        timestr.initialized = true;
    }

    function getDayOfYear(date)
    {
       var utc_date = new Date.UTC(date.getFullYear(), date.getMonth(),
                                   date.getDate());
       var utc_year = new Date.UTC(date.getFullYear(), 0, 0);
       return (utc_date - utc_year) / (24 * 60 * 60 * 1000);
    };

    time = time || new Date();
    if (!isinstance(time, Date))
        throw "Expected date object";

    var ary;
    while ((ary = format.match(/(^|[^%])%(-?\w)/)))
    {
        var start = ary[1] ? (ary.index + 1) : ary.index;
        var rpl = "";
        if (ary[2] in timestr)
        {
            var tbranch = timestr[ary[2]];
            if ("method" in tbranch)
                rpl = time[tbranch.method]().toString();
            else if ("replace" in tbranch)
                rpl = tbranch.replace;

            if ("pad" in tbranch)
            {
                let padwith = ("padwith" in tbranch) ? tbranch.padwith : "0";
                rpl = padNumber(rpl, tbranch.pad, padwith);
            }
        }
        if (!rpl)
        {
            let option;
            let padwith;
            switch (ary[2])
            {
                case "A":
                    option = { weekday: "long" };
                    break;
                case "a":
                    option = { weekday: "short" };
                    break;
                case "B":
                    option = { month: "long" };
                    break;
                case "b":
                case "h":
                    option = { month: "short" };
                    break;
                case "C":
                    rpl = Math.floor(time.getFullYear() / 100);
                    padwith = "0";
                    break;
                case "d":
                    option = { day: "2-digit" };
                    break;
                case "e":
                    padwith = " ";
                case "-d":
                case "-e":
                    option = { day: "numeric" };
                    break;
                case "I":
                case "l":
                    rpl = (time.getHours() + 11) % 12 + 1;
                    padwith = (ary[2] == "I") ? "0" : " ";
                    break;
                case "j":
                    rpl = padNumber(getDayOfYear(time), 3);
                    break;
                case "m":
                    option = { month: "2-digit" };
                    break;
                case "-m":
                    option = { month: "numeric" };
                    break;
                case "p":
                case "P":
                    rpl = new Intl.DateTimeFormat(undefined,
                                                  { hour: "numeric",
                                                    hour12: true })
                                  .formatToParts(time)
                                  .find(part => part.type == "dayPeriod")
                                  .value;
                    if (ary[2] == "P")
                    {
                        rpl = rpl.toLowerCase();
                    }
                    break;
                case "r":
                    option = { hour: "2-digit", minute: "2-digit",
                               second: "2-digit", hour12: true };
                    break;
                case "s":
                    rpl = Math.round(time.getTime() / 1000);
                    break;
                case "u":
                    rpl = (time.getDay() + 6) % 7 + 1;
                    break;
                case "Y":
                    option = { year: "numeric" };
                    break;
                case "y":
                    option = { year: "2-digit" };
                    break;
                case "Z":
                    rpl = new Intl.DateTimeFormat(undefined,
                                                  { timeZoneName: "short" })
                                  .formatToParts(time)
                                  .find(part => part.type == "timeZoneName")
                                  .value;
                    break;
                case "z":
                    var mins = time.getTimezoneOffset();
                    rpl = (mins > 0) ? "-" : "+";
                    mins = Math.abs(mins);
                    var hours = Math.floor(mins / 60);
                    rpl += padNumber(hours, 2) + padNumber(mins - (hours * 60), 2);
                    break;
            }
            if (option)
            {
                rpl = new Intl.DateTimeFormat(undefined, option).format(time);
            }
            if (padwith)
            {
                rpl = padNumber(rpl, 2, padwith);
            }
        }
        if (!rpl)
            rpl = "%%" + ary[2];
        format = format.substr(0, start) + rpl + format.substr(start + 2);
    }
    return format.replace(/%%/, "%");
}

// No-op window.getAttention if it's not found, this is for in-a-tab mode.
if (typeof getAttention == "undefined")
    getAttention = function() {};
