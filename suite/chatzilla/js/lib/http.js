/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function CHTTPDoc (server, path)
{
    
    this.GET_TIMEOUT = 2 * 60; /* 2 minute timeout on gets */
    this.state = "new";
    this.server = server;
    this.path = path;
    
}

CHTTPDoc.prototype.get =
function http_get (ep)
{

    this.connection = new CBSConnection();
    if (!this.connection.connect (this.server, 80, (void 0), true))
    {
        this.state = "connect-error";
        var e = new CEvent ("httpdoc", "complete", this, "onComplete");
        this.eventPump.addEvent (e);
        return false;
    }

    this.eventPump = ep;
    this.state = "opened";
    this.data = "";
    this.duration = 0;

    var e = new CEvent ("httpdoc", "poll", this, "onPoll");
    this.eventPump.addEvent (e);

    this.connection.sendData ("GET " + this.path + "\n");
    this.startDate = new Date();
    
    return true;
    
}

CHTTPDoc.prototype.onPoll =
function http_poll (e)
{
    var line = "";
    var ex, c;
    var need_more = false;

    if (this.duration < this.GET_TIMEOUT)
        try
        {    
            line = this.connection.readData (50);
            need_more = true;
        }
            catch (ex)
        {
            if (typeof (ex) == "undefined")
            {
                line = "";
                need_more = true;
            }
            else
            {
                dd ("** Caught exception: '" + ex + "' while receiving " +
                    this.server + this.path);
                this.state = "read-error";
            }
        }
    else
        this.state = "receive-timeout";

    switch (this.state)
    {
        case "opened":
        case "receive-header":
            if (this.state == "opened")
                this.headers = "";
            
            c = line.search(/\<html\>/i);
            if (c != -1)
            {
                this.data = line.substr (c, line.length);
                this.state = "receive-data";
                line = line.substr (0, c);

                c = this.data.search(/\<\/html\>/i);
                if (c != -1)
                {
                    this.docType = this.docType.trim();
                    this.state = "complete";
                    need_more = false;
                }
                
            }

            this.headers += line;
            c = this.headers.search (/\<\!doctype/i);
            if (c != -1)
            {
                this.docType = this.headers.substr (c, line.length);
                if (this.state == "opened")
                    this.state = "receive-doctype";
                this.headers = this.headers.substr (0, c);
            }
            
            if (this.state == "opened")
                this.state = "receive-header";
            break;

        case "receive-doctype":
            var c = line.search (/\<html\>/i);
            if (c != -1)
            {
                this.docType = this.docType.trim();
                this.data = line.substr (c, line.length);
                this.state = "receive-data";
                line = line.substr (0, c);
            }

            this.docType += line;
            break;

        case "receive-data":
            this.data += line;
            var c = this.data.search(/\<\/html\>/i);
            if (c != -1)
                this.state = "complete";
            break;

        case "read-error":
        case "receive-timeout":
            break;
            
        default:
            dd ("** INVALID STATE in HTTPDoc object (" + this.state + ") **");
            need_more = false;
            this.state = "error";
            break;

    }
    
    if ((this.state != "complete") && (need_more))
        var e = new CEvent ("httpdoc", "poll", this, "onPoll");
    else
    {
        this.connection.disconnect();
        if (this.data)
        {
            var m = this.data.match(/\<title\>(.*)\<\/title\>/i);
            if (m != null)
                this.title = m[1];
            else
                this.title = "";
        }
        var e = new CEvent ("httpdoc", "complete", this, "onComplete");
    }
    
    this.eventPump.addEvent (e);
    this.duration = (new Date() - this.startDate) / 1000;

    return true;
    
}

CHTTPDoc.prototype.onComplete =
function http_complete(e)
{

    return true;

}



