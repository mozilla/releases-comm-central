/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Namespaces we happen to need:
const XHTML_NS = "http://www.w3.org/1999/xhtml";

var utils = new Object();

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
                         alert(m);
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

function dumpObject (o, pfx, sep)
{
    var p;
    var s = "";

    sep = (typeof sep == "undefined") ? " = " : sep;
    pfx = (typeof pfx == "undefined") ? "" : pfx;

    for (p in o)
    {
        if (typeof (o[p]) != "function")
            s += pfx + p + sep + o[p] + "\n";
        else
            s += pfx + p + sep + "function\n";
    }

    return s;

}

/* Dumps an object in tree format, recurse specifiec the the number of objects
 * to recurse, compress is a boolean that can uncompress (true) the output
 * format, and level is the number of levels to intitialy indent (only useful
 * internally.)  A sample dumpObjectTree (o, 1) is shown below.
 *
 * + parent (object)
 * + users (object)
 * | + jsbot (object)
 * | + mrjs (object)
 * | + nakkezzzz (object)
 * | *
 * + bans (object)
 * | *
 * + topic (string) 'ircclient.js:59: nothing is not defined'
 * + getUsersLength (function) 9 lines
 * *
 */
function dumpObjectTree (o, recurse, compress, level)
{
    var s = "";
    var pfx = "";

    if (typeof recurse == "undefined")
        recurse = 0;
    if (typeof level == "undefined")
        level = 0;
    if (typeof compress == "undefined")
        compress = true;

    for (var i = 0; i < level; i++)
        pfx += (compress) ? "| " : "|  ";

    var tee = (compress) ? "+ " : "+- ";

    for (i in o)
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
                s += pfx + tee + i + " (function) " + sfunc + "\n";
                break;

            case "object":
                s += pfx + tee + i + " (object)";
                if (o[i] == null)
                {
                    s += " null\n";
                    break;
                }

                s += "\n";

                if (!compress)
                    s += pfx + "|\n";
                if ((i != "parent") && (recurse))
                    s += dumpObjectTree (o[i], recurse - 1,
                                         compress, level + 1);
                break;

            case "string":
                if (o[i].length > 200)
                    s += pfx + tee + i + " (" + t + ") " +
                        o[i].length + " chars\n";
                else
                    s += pfx + tee + i + " (" + t + ") '" + o[i] + "'\n";
                break;

            case "ERROR":
                s += pfx + tee + i + " (" + t + ") ?\n";
                break;

            default:
                s += pfx + tee + i + " (" + t + ") " + o[i] + "\n";

        }

        if (!compress)
            s += pfx + "|\n";

    }

    s += pfx + "*\n";

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

function encodeForXMLAttribute(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
                .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
                .replace(/'/g, "&apos;");
}

function replaceVars(str, vars)
{
    // replace "string $with a $variable", with
    // "string " + vars["with"] + " with a " + vars["variable"]

    function doReplace(symbol)
    {
        var name = symbol.substr(1);
        if (name in vars)
            return vars[name];

        return "$" + name;
    };

    return str.replace(/(\$\w[\w\d\-]+)/g, doReplace);
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

/*
 * Clones an existing object (Only the enumerable properties
 * of course.) use as a function..
 * var c = Clone (obj);
 * or a constructor...
 * var c = new Clone (obj);
 */
function Clone (obj)
{
    var robj = new Object();

    if ("__proto__" in obj)
    {
        // Special clone for Spidermonkey.
        for (var p in obj)
        {
            if (obj.hasOwnProperty(p))
                robj[p] = obj[p];
        }
        robj.__proto__ = obj.__proto__;
    }
    else
    {
        for (var p in obj)
            robj[p] = obj[p];
    }

    return robj;

}

/*
 * matches a real object against one or more pattern objects.
 * if you pass an array of pattern objects, |negate| controls whether to check
 * if the object matches ANY of the patterns, or NONE of the patterns.
 */
function matchObject (o, pattern, negate)
{
    negate = Boolean(negate);

    function _match (o, pattern)
    {
        if (isinstance(pattern, Function))
            return pattern(o);

        for (var p in pattern)
        {
            var val;
                /* nice to have, but slow as molases, allows you to match
                 * properties of objects with obj$prop: "foo" syntax      */
                /*
                  if (p[0] == "$")
                  val = eval ("o." +
                  p.substr(1,p.length).replace (/\$/g, "."));
                  else
                */
            val = o[p];

            if (isinstance(pattern[p], Function))
            {
                if (!pattern[p](val))
                    return false;
            }
            else
            {
                var ary = (new String(val)).match(pattern[p]);
                if (ary == null)
                    return false;
                else
                    o.matchresult = ary;
            }
        }

        return true;

    }

    if (!isinstance(pattern, Array))
        return Boolean (negate ^ _match(o, pattern));

    for (var i in pattern)
        if (_match (o, pattern[i]))
            return !negate;

    return negate;

}

function equalsObject(o1, o2)
{
    for (var p in o1)
    {
        if (!(p in o2) || (o1[p] != o2[p]))
            return false;
    }
    for (p in o2)
    {
        // If the property did exist in o1, the previous loop tested it:
        if (!(p in o1))
            return false;
    }
    return true;
}

function utils_lcfn(text)
{
    return text.toLowerCase();
}

function matchEntry (partialName, list, lcFn)
{

    if ((typeof partialName == "undefined") ||
        (String(partialName) == ""))
    {
        var ary = new Array();
        for (var i in list)
            ary.push(i);
        return ary;
    }

    if (typeof lcFn != "function")
        lcFn = utils_lcfn;

    ary = new Array();

    for (i in list)
    {
        if (lcFn(list[i]).indexOf(lcFn(partialName)) == 0)
            ary.push(i);
    }

    return ary;

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

function getCommonPfx (list, lcFn)
{
    var pfx = list[0];
    var l = list.length;

    if (typeof lcFn != "function")
        lcFn = utils_lcfn;

    for (var i = 0; i < l; i++)
    {
        for (var c = 0; c < pfx.length; ++c)
        {
            if (c >= list[i].length)
            {
                pfx = pfx.substr(0, c);
                break;
            }
            else
            {
                if (lcFn(pfx[c]) != lcFn(list[i][c]))
                    pfx = pfx.substr(0, c);
            }
        }
    }

    return pfx;

}

function getWindowByType (windowType)
{
    const MEDIATOR_CONTRACTID =
        "@mozilla.org/appshell/window-mediator;1";
    const nsIWindowMediator  = Components.interfaces.nsIWindowMediator;

    var windowManager =
        Components.classes[MEDIATOR_CONTRACTID].getService(nsIWindowMediator);

    return windowManager.getMostRecentWindow(windowType);
}

function toOpenWindowByType(inType, url, features)
{
    var topWindow = getWindowByType(inType);

    if (typeof features == "undefined")
        features = "chrome,extrachrome,menubar,resizable," +
                   "scrollbars,status,toolbar";

    if (topWindow)
        topWindow.focus();
    else
        window.open(url, "_blank", features);
}

function renameProperty (obj, oldname, newname)
{

    if (oldname == newname)
        return;

    obj[newname] = obj[oldname];
    delete obj[oldname];

}

function newObject(contractID, iface)
{
    var rv;
    var cls = Components.classes[contractID];

    if (!cls)
        return null;

    switch (typeof iface)
    {
        case "undefined":
            rv = cls.createInstance();
            break;

        case "string":
            rv = cls.createInstance(Components.interfaces[iface]);
            break;

        case "object":
            rv = cls.createInstance(iface);
            break;

        default:
            rv = null;
            break;
    }

    return rv;

}

function getService(contractID, iface)
{
    var rv;
    var cls = Components.classes[contractID];

    if (!cls)
        return null;

    switch (typeof iface)
    {
        case "undefined":
            rv = cls.getService();
            break;

        case "string":
            rv = cls.getService(Components.interfaces[iface]);
            break;

        case "object":
            rv = cls.getService(iface);
            break;

        default:
            rv = null;
            break;
    }

    return rv;

}

function getNSSErrorClass(errorCode)
{
    var nssErrSvc = getService("@mozilla.org/nss_errors_service;1", "nsINSSErrorsService");

    try
    {
        return nssErrSvc.getErrorClass(errorCode);
    }
    catch
    {
        return 0;
    }
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

function keys (o)
{
    var rv = new Array();

    for (var p in o)
        rv.push(p);

    return rv;

}

function stringTrim (s)
{
    if (!s)
        return "";
    s = s.replace (/^\s+/, "");
    return s.replace (/\s+$/, "");

}

/* the offset should be in seconds, it will be rounded to 2 decimal places */
function formatDateOffset (offset, format)
{
    var seconds = offset % 60;
    seconds = Math.round((seconds + Number.EPSILON) * 100) / 100;
    var minutes = Math.floor(offset / 60);
    var hours = Math.floor(minutes / 60);
    minutes = minutes % 60;
    var days = Math.floor(hours / 24);
    hours = hours % 24;

    if (!format)
    {
        var ary = new Array();

        if (days == 1)
            ary.push(MSG_DAY);
        else if (days > 0)
            ary.push(getMsg(MSG_DAYS, days));

        if (hours == 1)
            ary.push(MSG_HOUR);
        else if (hours > 0)
            ary.push(getMsg(MSG_HOURS, hours));

        if (minutes == 1)
            ary.push(MSG_MINUTE);
        else if (minutes > 0)
            ary.push(getMsg(MSG_MINUTES, minutes));

        if (seconds == 1)
            ary.push(MSG_SECOND);
        else if (seconds > 0 || offset == 0)
            ary.push(getMsg(MSG_SECONDS, seconds));

        format = ary.join(", ");
    }
    else
    {
        format = format.replace ("%d", days);
        format = format.replace ("%h", hours);
        format = format.replace ("%m", minutes);
        format = format.replace ("%s", seconds);
    }

    return format;
}

function arrayHasElementAt(ary, i)
{
    return typeof ary[i] != "undefined";
}

function objectContains(o, p)
{
    return Object.hasOwnProperty.call(o, p);
}

/*
 * If there are any wordbreaking characters in |str| within -/+5 characters of
 * of a |pos| then the word is broken up there. Individual chunks of the word
 * are returned as elements of an array.
 */
function splitLongWord (str, pos)
{
    if (str.length <= pos)
        return [str];

    var ary = new Array();
    var right = str;

    while (right.length > pos)
    {
        /* search for a nice place to break the word, fuzzfactor of +/-5,
         * centered around |pos| */
        var splitPos =
            right.substring(pos - 5, pos + 5).search(/[^A-Za-z0-9]/);

        splitPos = (splitPos != -1) ? pos - 4 + splitPos : pos;
        ary.push(right.substr (0, splitPos));
        right = right.substr (splitPos);
    }

    ary.push (right);

    return ary;
}

// Creates a random string of |len| characters from a-z, A-Z, 0-9.
function randomString(len) {
    var chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    var rv = "";

    for (var i = 0; i < len; i++)
        rv += chars.substr(Math.floor(Math.random() * chars.length), 1);

    return rv;
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

function getSpecialDirectory(name)
{
    if (!("directoryService" in utils))
    {
        const DS_CTR = "@mozilla.org/file/directory_service;1";
        const nsIProperties = Components.interfaces.nsIProperties;

        utils.directoryService =
            Components.classes[DS_CTR].getService(nsIProperties);
    }

    return utils.directoryService.get(name, Components.interfaces.nsIFile);
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

function alert(msg, parent, title)
{
    var PROMPT_CTRID = "@mozilla.org/embedcomp/prompt-service;1";
    var nsIPromptService = Components.interfaces.nsIPromptService;
    var ps = Components.classes[PROMPT_CTRID].getService(nsIPromptService);
    if (!parent)
        parent = window;
    if (!title)
        title = MSG_ALERT;
    ps.alert (parent, title, msg);
}

function confirm(msg, parent, title)
{
    var PROMPT_CTRID = "@mozilla.org/embedcomp/prompt-service;1";
    var nsIPromptService = Components.interfaces.nsIPromptService;
    var ps = Components.classes[PROMPT_CTRID].getService(nsIPromptService);
    if (!parent)
        parent = window;
    if (!title)
        title = MSG_CONFIRM;
    return ps.confirm (parent, title, msg);
}

function confirmEx(msg, buttons, defaultButton, checkText,
                   checkVal, parent, title)
{
    /* Note that on versions before Mozilla 0.9, using 3 buttons,
     * the revert or dontsave button, or custom button titles will NOT work.
     *
     * The buttons should be listed in the 'accept', 'cancel' and 'extra' order,
     * and the exact button order is host app- and platform-dependant.
     * For example, on Windows this is usually [button 1] [button 3] [button 2],
     * and on Linux [button 3] [button 2] [button 1].
     */
    var PROMPT_CTRID = "@mozilla.org/embedcomp/prompt-service;1";
    var nsIPromptService = Components.interfaces.nsIPromptService;
    var ps = Components.classes[PROMPT_CTRID].getService(nsIPromptService);

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

    if (!parent)
        parent = window;
    if (!title)
        title = MSG_CONFIRM;
    if (!checkVal)
        checkVal = new Object();

    var rv = ps.confirmEx(parent, title, msg, buttonFlags, buttonText[0],
                          buttonText[1], buttonText[2], checkText, checkVal);
    return rv;
}

function prompt(msg, initial, parent, title)
{
    var PROMPT_CTRID = "@mozilla.org/embedcomp/prompt-service;1";
    var nsIPromptService = Components.interfaces.nsIPromptService;
    var ps = Components.classes[PROMPT_CTRID].getService(nsIPromptService);
    if (!parent)
        parent = window;
    if (!title)
        title = MSG_PROMPT;
    var rv = { value: initial };

    if (!ps.prompt (parent, title, msg, rv, null, {value: null}))
        return null;

    return rv.value;
}

function promptPassword(msg, initial, parent, title)
{
    var PROMPT_CTRID = "@mozilla.org/embedcomp/prompt-service;1";
    var nsIPromptService = Components.interfaces.nsIPromptService;
    var ps = Components.classes[PROMPT_CTRID].getService(nsIPromptService);
    if (!parent)
        parent = window;
    if (!title)
        title = MSG_PROMPT;
    var rv = { value: initial };

    if (!ps.promptPassword (parent, title, msg, rv, null, {value: null}))
        return null;

    return rv.value;
}

function viewCert(cert, parent)
{
    var cd = getService("@mozilla.org/nsCertificateDialogs;1",
                        "nsICertificateDialogs");
    if (!parent)
        parent = window;
    cd.viewCert(parent, cert);
}

function addOrUpdateLogin(url, type, username, password)
{
    username = username.toLowerCase();
    var newinfo = newObject("@mozilla.org/login-manager/loginInfo;1",
                            "nsILoginInfo");
    newinfo.init(url, null, type, username, password, "", "");
    var oldinfo = getLogin(url, type, username);

    if (oldinfo) {
        Services.logins.modifyLogin(oldinfo, newinfo);
        return true; //updated
    }

    Services.logins.addLogin(newinfo);
    return false; //added
}

function getLogin(url, realm, username)
{
    username = username.toLowerCase();

    let logins = Services.logins.findLogins({}, url, null, realm);
    for (let login of logins) {
        if (login.username == username) {
            return login;
        }
    }

    return null;
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

function scaleNumberBy1024(number)
{
    var scale = 0;
    while ((number >= 1000) && (scale < 6))
    {
        scale++;
        number /= 1024;
    }

    return [scale, number];
}

function getSISize(size)
{
    var data = scaleNumberBy1024(size);

    if (data[1] < 10)
        data[1] = data[1].toFixed(2);
    else if (data[1] < 100)
        data[1] = data[1].toFixed(1);
    else
        data[1] = data[1].toFixed(0);

    return getMsg(MSG_SI_SIZE, [data[1], getMsg("msg.si.size." + data[0])]);
}

function getSISpeed(speed)
{
    var data = scaleNumberBy1024(speed);

    if (data[1] < 10)
        data[1] = data[1].toFixed(2);
    else if (data[1] < 100)
        data[1] = data[1].toFixed(1);
    else
        data[1] = data[1].toFixed(0);

    return getMsg(MSG_SI_SPEED, [data[1], getMsg("msg.si.speed." + data[0])]);
}

// Zero-pad Numbers (or pad with something else if you wish)
function padNumber(num, digits, pad)
{
    pad = pad || "0";
    var rv = num.toString();
    while (rv.length < digits)
        rv = pad + rv;
    return rv;
}

const timestr = {
    A: { method: "getDay" },
    a: { method: "getDay" },
    B: { method: "getMonth" },
    b: { method: "getMonth" },
    c: { replace: null },
    D: { replace: "%m/%d/%y" },
    d: { method: "getDate", pad: 2 },
    e: { method: "getDate", pad: 2, padwith: " " },
    F: { replace: "%Y-%m-%d" },
    h: { replace: "%b" },
    H: { method: "getHours", pad: 2 },
    k: { method: "getHours", pad: 2, padwith: " " },
    M: { method: "getMinutes", pad: 2 },
    p: { AM: null, PM: null },
    P: { AM: null, PM: null },
    r: { replace: null },
    R: { replace: "%H:%M" },
    S: { method: "getSeconds", pad: 2 },
    T: { replace: "%H:%M:%S" },
    w: { method: "getDay" },
    x: { replace: null },
    X: { replace: null },
    Y: { method: "getFullYear" },
    initialized: false
}

function strftime(format, time)
{
    /* Javascript implementation of standard C strftime */

    if (!timestr.initialized)
    {
        timestr.A.values = getMsg("datetime.day.long").split("^");
        timestr.a.values = getMsg("datetime.day.short").split("^");
        timestr.B.values = getMsg("datetime.month.long").split("^");
        timestr.b.values = getMsg("datetime.month.short").split("^");
        // Just make sure the locale isn't playing silly with us.
        ASSERT(timestr.A.values.length == 7, "datetime.day.long bad!");
        ASSERT(timestr.a.values.length == 7, "datetime.day.short bad!");
        ASSERT(timestr.B.values.length == 12, "datetime.month.long bad!");
        ASSERT(timestr.b.values.length == 12, "datetime.month.short bad!");

        timestr.p.AM = getMsg("datetime.uam");
        timestr.p.PM = getMsg("datetime.upm");
        timestr.P.AM = getMsg("datetime.lam");
        timestr.P.PM = getMsg("datetime.lpm");

        timestr.c.replace = getMsg("datetime.presets.lc");
        timestr.r.replace = getMsg("datetime.presets.lr");
        timestr.x.replace = getMsg("datetime.presets.lx");
        timestr.X.replace = getMsg("datetime.presets.ux");

        timestr.initialized = true;
    }


    function getDayOfYear(dateobj)
    {
       var yearobj = new Date(dateobj.getFullYear(), 0, 1, 0, 0, 0, 0);
       return Math.floor((dateobj - yearobj) / 86400000) + 1;
    };

    time = time || new Date();
    if (!isinstance(time, Date))
        throw "Expected date object";

    var ary;
    while ((ary = format.match(/(^|[^%])%(\w)/)))
    {
        var start = ary[1] ? (ary.index + 1) : ary.index;
        var rpl = "";
        if (ary[2] in timestr)
        {
            var tbranch = timestr[ary[2]];
            if (("method" in tbranch) && ("values" in tbranch))
               rpl = tbranch.values[time[tbranch.method]()];
            else if ("method" in tbranch)
                rpl = time[tbranch.method]().toString();
            else if ("replace" in tbranch)
                rpl = tbranch.replace;

            if ("pad" in tbranch)
            {
                var padwith = ("padwith" in tbranch) ? tbranch.padwith : "0";
                rpl = padNumber(rpl, tbranch.pad, padwith);
            }
        }
        if (!rpl)
        {
            switch (ary[2])
            {
                case "C":
                    var century = Math.floor(time.getFullYear() / 100);
                    rpl = padNumber(century, 2);
                    break;
                case "I":
                case "l":
                    var hour = (time.getHours() + 11) % 12 + 1;
                    var padwith = (ary[2] == "I") ? "0" : " ";
                    rpl = padNumber(hour, 2, padwith);
                    break;
                case "j":
                    rpl = padNumber(getDayOfYear(time), 3);
                    break;
                case "m":
                    rpl = padNumber(time.getMonth() + 1, 2);
                    break;
                case "p":
                case "P":
                    var bit = (time.getHours() < 12) ? "AM" : "PM";
                    rpl = timestr[ary[2]][bit];
                    break;
                case "s":
                    rpl = Math.round(time.getTime() / 1000);
                    break;
                case "u":
                    rpl = (time.getDay() + 6) % 7 + 1;
                    break;
                case "y":
                    rpl = time.getFullYear().toString().substr(2);
                    break;
                case "z":
                    var mins = time.getTimezoneOffset();
                    rpl = (mins > 0) ? "-" : "+";
                    mins = Math.abs(mins);
                    var hours = Math.floor(mins / 60);
                    rpl += padNumber(hours, 2) + padNumber(mins - (hours * 60), 2);
                    break;
            }
        }
        if (!rpl)
            rpl = "%%" + ary[2];
        format = format.substr(0, start) + rpl + format.substr(start + 2);
    }
    return format.replace(/%%/, "%");
}

// This used to be strres.js, copied here to help remove that...
var strBundleService = null;
function srGetStrBundle(path)
{
    const STRBSCID = "@mozilla.org/intl/stringbundle;1";
    const STRBSIF = "nsIStringBundleService";
    var strBundle = null;
    if (!strBundleService)
    {
        try
        {
            strBundleService = getService(STRBSCID, STRBSIF);
        }
        catch (ex)
        {
            dump("\n--** strBundleService failed: " + ex + "\n");
            return null;
        }
    }

    strBundle = strBundleService.createBundle(path);
    if (!strBundle)
        dump("\n--** strBundle createInstance failed **--\n");

    return strBundle;
}

// No-op window.getAttention if it's not found, this is for in-a-tab mode.
if (typeof getAttention == "undefined")
    getAttention = function() {};
