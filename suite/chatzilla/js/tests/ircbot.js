/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var LIB_PATH = "../lib/";

bot = new Object();
bot.ownerPatterns = new Array();
bot.personality = new Object();
bot.personality.hooks = new Array();
bot.prefix = "!js ";

function loadDeps()
{
    load(LIB_PATH + "utils.js");
    load(LIB_PATH + "events.js");
    load(LIB_PATH + "connection.js");
    load(LIB_PATH + "http.js");
    load(LIB_PATH + "dcc.js");
    load(LIB_PATH + "irc.js");
    load(LIB_PATH + "irc-debug.js");
    load(LIB_PATH + "message-manager.js");

    bot.messageManager = new MessageManager();

    load(LIB_PATH + "connection-xpcom.js");

    return true;
}

// FIXME: Find somewhere better for these guys. //
function toUnicode(msg, charsetOrView)
{
    if (!msg)
        return msg;

    var charset;
    if (typeof charsetOrView == "string")
        charset = charsetOrView;
    else
        return msg;

    return bot.messageManager.toUnicode(msg, charset);
}

function fromUnicode(msg, charsetOrView)
{
    if (!msg)
        return msg;

    var charset;
    if (typeof charsetOrView == "string")
        charset = charsetOrView;
    else
        return msg;

    return bot.messageManager.fromUnicode(msg, charset);
}
// FIXME: END //


function initStatic()
{
    CIRCNetwork.prototype.INITIAL_NICK = "jsbot";
    CIRCNetwork.prototype.INITIAL_NAME = "XPJSBot";
    CIRCNetwork.prototype.INITIAL_DESC = "XPCOM Javascript bot";
    CIRCNetwork.prototype.INITIAL_CHANNEL = "#jsbot";

    CIRCNetwork.prototype.stayingPower = true; 
    CIRCNetwork.prototype.on433 = my_433;
    CIRCChannel.prototype.onPrivmsg = my_chan_privmsg;
    CIRCUser.prototype.onDCCChat = my_user_dccchat;
    CIRCDCCChat.prototype.onRawData = my_dccchat_rawdata;
}

/*
 * One time initilization stuff
 */
function init(obj)
{ 
    obj.eventPump = new CEventPump(100);

    obj.networks = new Object();
    obj.networks["libera.chat"] =
        new CIRCNetwork("libera.chat", [{name: "libera.chat", port: 6667}],
                        obj.eventPump);

    obj.networks["efnet"] =
        new CIRCNetwork ("efnet", [{name: "irc.mcs.net", port: 6667},
                                   {name: "irc.cs.cmu.edu",   port: 6667}],
                         obj.eventPump);

    obj.primNet = obj.networks["efnet"];
}

/*
 * Kick off the mainloop for the first time
 */
function go()
{
    if (!loadDeps())
        return false;

    // The utils.js formatException relies on localization, we can't. Fix:
    formatException = function formatException(ex)
    {
        if (isinstance(ex, Error) ||
            ((typeof ex == "object") && ("filename" in ex)))
        {
            return [ex.name, ex.message, ex.fileName, ex.lineNumber].join(", ");
        }

        return String(ex);
    };

    initStatic();
    init(bot);
    if (DEBUG)
    {
        /* hook all events EXCEPT server.poll and *.event-end types
         * (the 4th param inverts the match) */
        bot.eventPump.addHook([{type: "poll", set: /^(server|dcc-chat)$/},
                               {type: "event-end"}], event_tracer,
                              "event-tracer", true /* negate */);
    }

    if (typeof initPersonality == "function")
        initPersonality();
 
    bot.primNet.connect();
    rego();
 
    return true;
}

/*
 * If you didn't compile libjs with JS_HAS_ERROR_EXCEPTIONS, any error the
 * bot encounters will exit the mainloop and drop you back to a shell ("js>")
 * prompt.  You can continue the mainloop by executing this function.
 */
function rego()
{
    /* mainloop */
    while (bot.eventPump.queue.length > 0)
    {
        bot.eventPump.stepEvents();
        if (typeof gc == "function")
        {
            if ((typeof bot.lastGc == "undefined") ||
                (Number(new Date()) - bot.lastGc > 60000))
            {
                gc();
                bot.lastGc = Number(new Date());
            }
        }
    }
    dd("No events to process.");

    return true;
}

function addOwner(pattern)
{
    bot.ownerPatterns.push(pattern);
}

function userIsOwner(user)
{
    if (!user.host)
    {
        /* we havn't got any information on this user yet.  They havn't spoken
         * yet, and we havn't /whoi's them yet.  Say no for now, but do the 
         * /whois so we'll know for sure next time.
         */
        if (user.TYPE == "IRCChanUser")
            user.parent.parent.sendData("WHOIS " + user.unicodeName + "\n");
        else
            user.parent.sendData("WHOIS " + user.unicodeName + "\n");
        return false;
    }
 
    var userString = user.unicodeName + "!" + user.name + "@" + user.host;
    dd("userIsOwner: checking userString `" + userString + "' against:");
    
    for (var p in bot.ownerPatterns)
    {
        if (userString.search(bot.ownerPatterns[p]) != -1)
        {
            dd(String(bot.ownerPatterns[p]) + " passed.");
            return true;
        }
        else
        {
            dd(String(bot.ownerPatterns[p]) + " fails.");
        }
    }

    return false;
}

function psn_isAddressedToMe(e)
{
    if (!e.server)
        return false;

    if ((e.type.search(/privmsg|ctcp-action/)) || (e.set != "channel"))
        return false;

    var msg = e.decodeParam(2);

    if (msg.indexOf(bot.prefix) == 0)
        return false;

    /*
    dd ("-*- checking to see if message '" + msg + "' is addressed to me.");
    */
 
    var regex = new RegExp("^\\s*" + e.server.me.unicodeName + "\\W+(.*)", "i");
    var ary = msg.match(regex);

    //dd ("address match: "  + ary);

    if (ary != null)
    {
        e.statement = ary[1];
        return true;
    }

    //XXXgijs: Shouldn't this be in mingus.js?
    bot.personality.dp.addPhrase(msg);
    return false; 
}

function psn_onAddressedMsg(e)
{

    bot.eventPump.onHook(e, bot.personality.hooks);
    return false; 
}

bot.personality.addHook =
function psn_addhook(pattern, f, name, neg, enabled)
{
    if (pattern instanceof RegExp)
        pattern = {statement: pattern};

    return bot.eventPump.addHook(pattern, f, name, neg, enabled,
                                 bot.personality.hooks);
}

function bot_eval(e, script)
{
    try
    {
        var v = eval(script);
    }
    catch (ex)
    {
        e.replyTo.say(e.user.unicodeName + ": " + String(ex));
        return false;
    }

    if (typeof v != "undefined")
    {
        if (v != null)
            v = String(v);
        else
            v = "null";

        var rsp = e.user.unicodeName + ", your result is,";

        if (v.indexOf("\n") != -1)
            rsp += "\n";
        else
            rsp += " ";

        e.replyTo.say(rsp + v);
    }
}

/*
 * The following my_* are attached to their proper objects in the init()
 * function.  This is because the CIRC* objects are not defined at load time
 * (they get defined when loadDeps() loads the irc library) and so connecting
 * them here would cause an error.
 */

/*
 * What to do when a privmsg is received on a channel
 */
function my_chan_privmsg(e)
{
    var user = e.user;
    var msg = e.decodeParam(2);
    if ((msg.indexOf(bot.prefix) == 0) && userIsOwner(user))
    {
        /* if last char is a continuation character, then... */
        if (msg[msg.length - 1] == "\\")
        {
            user.accumulatedScript = msg.substring(bot.prefix.length,
                                                   msg.length - 1);
            return false; // prevent other hooks from processing this...
        }
        else
        {
            return bot_eval(e, msg.substring(bot.prefix.length,
                                             msg.length));
        }
    }
    else if ((typeof(user.accumulatedScript) != "undefined")  &&
             userIsOwner(user))
            /* if we were accumulating a message, add here,
             * and finish if not ends with '\'. */
    {
        var lastLine = (msg[msg.length - 1] != "\\");
        var line = msg.substring(0, msg.length - (lastLine ?  0 : 1));
        user.accumulatedScript += line;
        if (lastLine)
        {
            var script = user.accumulatedScript;
            delete user.accumulatedScript;
            return bot_eval(e, script);
        }
    }
}

/*
 * What to do when a dcc chat request reaches a user object
 */
function my_user_dccchat(e)
{
    if (!e.user.canDCC)
    {
        e.user.notice("\01DCC REJECT CHAT chat\01");
        return false;
    }

    var c = new CIRCDCCChat(bot.eventPump);

    if (!c.connect(e.user.host, e.port))
    {
        e.user.notice("\01DCC REJECT CHAT chat\01");
        return false;
    }

    return true;
}

/*
 * What to do when our requested nickname is in use
 */
function my_433(e)
{
    if (e.params[2] != CIRCNetwork.prototype.INITIAL_NICK)
    {
        /* server didn't like the last nick we tried, probably too long.
         * not much more we can do, bail out. */
        e.server.disconnect();
    }

    CIRCNetwork.prototype.INITIAL_NICK += "_";
    e.server.sendData("nick " + CIRCNetwork.prototype.INITIAL_NICK + "\n");
}

/*
 * What to do when raw data is received on a dcc chat connection
 */
function my_dccchat_rawdata(e)
{
    try
    {
        var v = eval(e.data);
    }
    catch (ex)
    {
        this.say(String(ex));
        return false;
    }

    if (typeof v != "undefined")
    {
        if (v != null)
            v = String(v);
        else
            v = "null";
        
        this.say(v);
    }
}

/*
 * Wrapper around CHTTPDoc to make is simpler to use
 */
function loadHTTP(host, path, onComplete)
{
    var htdoc = new CHTTPDoc(host, path);

    htdoc.onComplete = onComplete;
    htdoc.get(bot.eventPump);

    return htdoc; 
}



