/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function initMessages()
{
    var path = "chrome://chatzilla/locale/chatzilla.properties";
    
    client.messageManager = new MessageManager(client.entities);
    client.messageManager.loadBrands();
    client.defaultBundle = client.messageManager.addBundle(path);

    client.viewName = client.unicodeName = MSG_CLIENT_NAME;
    client.responseCodeMap =
        {
            "HELLO": MSG_RSP_HELLO,
            "HELP" : MSG_RSP_HELP,
            "USAGE": MSG_RSP_USAGE,
            "ERROR": MSG_RSP_ERROR,
            "WARNING": MSG_RSP_WARN,
            "INFO": MSG_RSP_INFO,
            "EVAL-IN": MSG_RSP_EVIN,
            "EVAL-OUT": MSG_RSP_EVOUT,
            "DISCONNECT": MSG_RSP_DISCONNECT,
            "JOIN": "-->|",
            "PART": "<--|",
            "QUIT": "|<--",
            "NICK": "=-=",
            "TOPIC": "=-=",
            "KICK": "=-=",
            "MODE": "=-=",
            "END_STATUS": "---",
            "DCC-CHAT": "[DCC]",
            "DCC-FILE": "[DCC]",
            "315": "---", /* end of WHO */
            "318": "---", /* end of WHOIS */
            "366": "---", /* end of NAMES */
            "376": "---"  /* end of MOTD */
        };
}

function checkCharset(charset)
{
    return client.messageManager.checkCharset(charset);
}

function toUnicode (msg, charsetOrView)
{
    if (!msg)
        return msg;

    var charset;
    if (typeof charsetOrView == "object")
        charset = charsetOrView.prefs["charset"];
    else if (typeof charsetOrView == "string")
        charset = charsetOrView;
    else
        charset = client.currentObject.prefs["charset"];

    return client.messageManager.toUnicode(msg, charset);
}

function fromUnicode (msg, charsetOrView)
{
    if (!msg)
        return msg;

    var charset;
    if (typeof charsetOrView == "object")
        charset = charsetOrView.prefs["charset"];
    else if (typeof charsetOrView == "string")
        charset = charsetOrView;
    else
        charset = client.currentObject.prefs["charset"];

    return client.messageManager.fromUnicode(msg, charset);
}

function getMsg(msgName, params, deflt)
{
    return client.messageManager.getMsg(msgName, params, deflt);
}

function getMsgFrom(bundle, msgName, params, deflt)
{
    return client.messageManager.getMsgFrom(bundle, msgName, params, deflt);
}

/* message types, don't localize */
const MT_ATTENTION = "ATTENTION";
const MT_ERROR     = "ERROR";
const MT_HELLO     = "HELLO";
const MT_HELP      = "HELP";
const MT_MODE      = "MODE";
const MT_WARN      = "WARNING";
const MT_INFO      = "INFO";
const MT_USAGE     = "USAGE";
const MT_STATUS    = "STATUS";
const MT_EVALIN    = "EVAL-IN";
const MT_EVALOUT   = "EVAL-OUT";

