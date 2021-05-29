/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 *   
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Hook used to trace events.
 */
function event_tracer (e)
{
    var name = "";
    var data = ("debug" in e) ? e.debug : "";
    
    switch (e.set)
    {
        case "server":
            name = e.destObject.connection.host;
            if (e.type == "rawdata")
                data = "'" + e.data + "'";
            if (e.type == "senddata")
            {
                var nextLine =
                    e.destObject.sendQueue[e.destObject.sendQueue.length - 1];
                if ("logged" in nextLine)
                    return true; /* don't print again */
                
                if (nextLine) {
                    data = "'" + nextLine.replace ("\n", "\\n") + "'";
                    nextLine.logged = true;
                }
                else
                    data = "!!! Nothing to send !!!";                
            }
            break;

        case "network":
        case "channel":
        case "user":
            name = e.destObject.unicodeName;
            break;

        case "httpdoc":
            name = e.destObject.server + e.destObject.path;
            if (e.destObject.state != "complete")
                data = "state: '" + e.destObject.state + "', received " +
                    e.destObject.data.length;
            else
                dd ("document done:\n" + dumpObjectTree (this));
            break;

        case "dcc-chat":
        case "dcc-file":
            name = e.destObject.localIP + ":" + e.destObject.port;
            if (e.type == "rawdata")
                data = "'" + e.data + "'";
            break;

        case "client":
            if (e.type == "do-connect")
                data = "attempt: " + e.attempt + "/" +
                    e.destObject.MAX_CONNECT_ATTEMPTS;
            break;

        default:
            break;
    }

    if (name)
        name = "[" + name + "]";

    if (e.type == "info")
        data = "'" + e.msg + "'";
    
    var str = "Level " + e.level + ": '" + e.type + "', " +
        e.set + name + "." + e.destMethod;
	if (data)
	  str += "\ndata   : " + data;

    dd (str);

    return true;

}
