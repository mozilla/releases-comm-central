/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function CBSConnection ()
{
    this._socket = null;
}

CBSConnection.prototype.connect = function(host, port, bind, tcp_flag)
{
    if (typeof tcp_flag == "undefined")
        tcp_flag = false;
    
    this.host = host;
    this.port = port;
    this.bind = bind;
    this.tcp_flag = tcp_flag;
    
    this._socket = new java.net.Socket(host, port);
    this._inputStream = this._socket.getInputStream();
    this._outputStream = new java.io.PrintStream(this._socket.getOutputStream());
    
    // create a 512 byte buffer for reading into.
    this._buffer = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, 512);
    dd("connected to " + host);
    
    this.isConnected = true;

    return this.isConnected;
}

CBSConnection.prototype.disconnect = function()
{
    if (this.isConnected) {
        this.isConnected = false;
        this._socket.close();
        delete this._socket;
        delete this._inputStream;
        delete this._outputStream;
    }
}

CBSConnection.prototype.sendData = function(str)
{
    // dd ("sendData: str=" + str);

    if (!this.isConnected)
        throw "Not Connected.";

    var rv = false;

        
    try
    {
        /* var s = new java.lang.String (str);
        b = s.getBytes();
        
        this._outputStream.write(b, 0, b.length); */
        this._outputStream.print(str);
        rv = true;
    }
    catch (ex)
    {
        dd ("write caught exception " + ex + ".");
        
        if (typeof ex != "undefined")
        {
            this.isConnected = false;
            throw (ex);
        }
        else
            rv = false;
    }
    
    return rv;        
}

CBSConnection.prototype.readData = function(timeout)
{
    if (!this.isConnected)
        throw "Not Connected.";

    var rv;

    // dd ("readData: timeout " + timeout);
    
    try {
        this._socket.setSoTimeout(Number(timeout));
        var len = this._inputStream.read(this._buffer);
        // dd ("read done, len = " + len + ", buffer = " + this._buffer);

        rv = String(new java.lang.String(this._buffer, 0, 0, len));
    } catch (ex) {
        // dd ("read caught exception " + ex + ".");
        
        if ((typeof ex != "undefined") &&
            (!(ex instanceof java.io.InterruptedIOException)))
        {
            dd ("@@@ throwing " + ex);
            
            this.isConnected = false;
            throw (ex);
        } else {
            // dd ("int");
            rv = "";
        }
    }

    // dd ("readData: rv = '" + rv + "'");
    
    return rv;
}
