/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const NS_ERROR_MODULE_NETWORK = 2152398848;

const NS_ERROR_UNKNOWN_HOST = NS_ERROR_MODULE_NETWORK + 30;
const NS_ERROR_CONNECTION_REFUSED = NS_ERROR_MODULE_NETWORK + 13;
const NS_ERROR_NET_TIMEOUT = NS_ERROR_MODULE_NETWORK + 14;
const NS_ERROR_OFFLINE = NS_ERROR_MODULE_NETWORK + 16;
const NS_ERROR_NET_RESET = NS_ERROR_MODULE_NETWORK + 20;
const NS_ERROR_UNKNOWN_PROXY_HOST = NS_ERROR_MODULE_NETWORK + 42;
const NS_ERROR_PROXY_CONNECTION_REFUSED = NS_ERROR_MODULE_NETWORK + 72;

// Offline error constants:
const NS_ERROR_BINDING_ABORTED = NS_ERROR_MODULE_NETWORK + 2;
const NS_ERROR_ABORT = 0x80004004;

const NS_NET_STATUS_RESOLVING_HOST = NS_ERROR_MODULE_NETWORK + 3;
const NS_NET_STATUS_CONNECTED_TO = NS_ERROR_MODULE_NETWORK + 4;
const NS_NET_STATUS_SENDING_TO = NS_ERROR_MODULE_NETWORK + 5;
const NS_NET_STATUS_RECEIVING_FROM = NS_ERROR_MODULE_NETWORK + 6;
const NS_NET_STATUS_CONNECTING_TO = NS_ERROR_MODULE_NETWORK + 7;

// Security error constants:
// http://mxr.mozilla.org/mozilla/source/security/nss/lib/util/secerr.h
const SEC_ERROR_BASE = 0x805A2000;
// http://mxr.mozilla.org/mozilla/source/security/nss/lib/ssl/sslerr.h
const SSL_ERROR_BASE = 0x805A3000;

// The subset of certificate errors which is allowed to be overridden
// http://bonsai.mozilla.org/cvsblame.cgi?file=mozilla/security/manager/ssl/src/nsNSSIOLayer.cpp&rev=1.165#2921

const SEC_ERROR_EXPIRED_CERTIFICATE = SEC_ERROR_BASE - 11;
const SEC_ERROR_UNKNOWN_ISSUER = SEC_ERROR_BASE - 13;
const SEC_ERROR_UNTRUSTED_ISSUER = SEC_ERROR_BASE - 20;
const SEC_ERROR_UNTRUSTED_CERT = SEC_ERROR_BASE - 21;
const SEC_ERROR_EXPIRED_ISSUER_CERTIFICATE = SEC_ERROR_BASE - 30;
const SEC_ERROR_CA_CERT_INVALID = SEC_ERROR_BASE - 36;
const SEC_ERROR_INADEQUATE_KEY_USAGE = SEC_ERROR_BASE - 90;
const SSL_ERROR_BAD_CERT_DOMAIN = SSL_ERROR_BASE - 12;

// Security Constants.
const STATE_IS_BROKEN = 1;
const STATE_IS_SECURE = 2;
const STATE_IS_INSECURE = 3;

const nsIScriptableInputStream = Components.interfaces.nsIScriptableInputStream;

const nsIBinaryInputStream = Components.interfaces.nsIBinaryInputStream;
const nsIBinaryOutputStream = Components.interfaces.nsIBinaryOutputStream;

function toSInputStream(stream, binary)
{
    var sstream;

    if (binary)
    {
        sstream = Components.classes["@mozilla.org/binaryinputstream;1"];
        sstream = sstream.createInstance(nsIBinaryInputStream);
        sstream.setInputStream(stream);
    }
    else
    {
        sstream = Components.classes["@mozilla.org/scriptableinputstream;1"];
        sstream = sstream.createInstance(nsIScriptableInputStream);
        sstream.init(stream);
    }

    return sstream;
}

function toSOutputStream(stream, binary)
{
    var sstream;

    if (binary)
    {
        sstream = Components.classes["@mozilla.org/binaryoutputstream;1"];
        sstream = sstream.createInstance(Components.interfaces.nsIBinaryOutputStream);
        sstream.setOutputStream(stream);
    }
    else
    {
        sstream = stream;
    }

    return sstream;
}

/* This object implements nsIBadCertListener2
 * The idea is to suppress the default UI's alert box
 * and allow the exception to propagate normally
 */
function BadCertHandler()
{
}

BadCertHandler.prototype.getInterface =
function badcert_getinterface(aIID)
{
    return this.QueryInterface(aIID);
}

BadCertHandler.prototype.QueryInterface =
function badcert_queryinterface(aIID)
{
    if (aIID.equals(Components.interfaces.nsIBadCertListener2) ||
        aIID.equals(Components.interfaces.nsIInterfaceRequestor) ||
        aIID.equals(Components.interfaces.nsISupports))
    {
        return this;
    }

    throw Components.results.NS_ERROR_NO_INTERFACE;
}

/* Returning true in the following two callbacks
 * means suppress default the error UI (modal alert).
 */
BadCertHandler.prototype.notifyCertProblem =
function badcert_notifyCertProblem(socketInfo, sslStatus, targetHost)
{
    return true;
}

/**
 * Wraps up various mechanics of sockets for easy consumption by other code.
 *
 * @param binary Provide |true| or |false| here to override the automatic
 *               selection of binary or text streams. This should only ever be
 *               specified as |true| or omitted, otherwise you will be shooting
 *               yourself in the foot on some versions - let the code handle
 *               the choice unless you know you need binary.
 */
function CBSConnection (binary)
{
    /* Since 2003-01-17 18:14, Mozilla has had this contract ID for the STS.
     * Prior to that it didn't have one, so we also include the CID for the
     * STS back then - DO NOT UPDATE THE ID if it changes in Mozilla.
     */
    const sockClassByName =
        Components.classes["@mozilla.org/network/socket-transport-service;1"];
    const sockClassByID =
        Components.classesByID["{c07e81e0-ef12-11d2-92b6-00105a1b0d64}"];

    var sockServiceClass = (sockClassByName || sockClassByID);

    if (!sockServiceClass)
        throw ("Couldn't get socket service class.");

    var sockService = sockServiceClass.getService();
    if (!sockService)
        throw ("Couldn't get socket service.");

    this._sockService = sockService.QueryInterface
        (Components.interfaces.nsISocketTransportService);

    /* Note: as part of the mess from bug 315288 and bug 316178, ChatZilla now
     *       uses the *binary* stream interfaces for all network
     *       communications.
     *
     *       However, these interfaces do not exist prior to 1999-11-05. To
     *       make matters worse, an incompatible change to the "readBytes"
     *       method of this interface was made on 2003-03-13; luckly, this
     *       change also added a "readByteArray" method, which we will check
     *       for below, to determine if we can use the binary streams.
     */

    // We want to check for working binary streams only the first time.
    if (CBSConnection.prototype.workingBinaryStreams == -1)
    {
        CBSConnection.prototype.workingBinaryStreams = false;

        if (typeof nsIBinaryInputStream != "undefined")
        {
            var isCls = Components.classes["@mozilla.org/binaryinputstream;1"];
            var inputStream = isCls.createInstance(nsIBinaryInputStream);
            if ("readByteArray" in inputStream)
                CBSConnection.prototype.workingBinaryStreams = true;
        }
    }

    /*
     * As part of the changes in Gecko 1.9, invalid SSL certificates now
     * produce a horrible error message. We must look up the toolkit version
     * to see if we need to catch these errors cleanly - see bug 454966.
     */
    if (!("strictSSL" in CBSConnection.prototype))
    {
        CBSConnection.prototype.strictSSL = false;
        var app = getService("@mozilla.org/xre/app-info;1", "nsIXULAppInfo");
        if (app && ("platformVersion" in app) &&
            compareVersions("1.9", app.platformVersion) >= 0)
        {
            CBSConnection.prototype.strictSSL = true;
        }
    }

    this.wrappedJSObject = this;
    if (typeof binary != "undefined")
        this.binaryMode = binary;
    else
        this.binaryMode = this.workingBinaryStreams;

    if (!ASSERT(!this.binaryMode || this.workingBinaryStreams,
                "Unable to use binary streams in this build."))
    {
        throw ("Unable to use binary streams in this build.");
    }
}

CBSConnection.prototype.workingBinaryStreams = -1;

CBSConnection.prototype.connect =
function bc_connect(host, port, config, observer)
{
    this.host = host.toLowerCase();
    this.port = port;

    /* The APIs below want host:port. Later on, we also reformat the host to
     * strip IPv6 literal brackets.
     */
    var hostPort = host + ":" + port;

    if (!config)
        config = {};

    if (!("proxyInfo" in config))
    {
    // Lets get a transportInfo for this
    var pps = getService("@mozilla.org/network/protocol-proxy-service;1",
                         "nsIProtocolProxyService");

        /* Force Necko to supply the HTTP proxy info if desired. For none,
         * force no proxy. Other values will get default treatment.
         */
        var uri = "irc://" + hostPort;
        if ("proxy" in config)
        {
        if (config.proxy == "http")
                uri = "http://" + hostPort;
            else if (config.proxy == "none")
                uri = "";
        }

        var self = this;
        function continueWithProxy(proxyInfo)
        {
            config.proxyInfo = proxyInfo;
            try
            {
                self.connect(host, port, config, observer);
            }
            catch (ex)
            {
                if ("onSocketConnection" in observer)
                    observer.onSocketConnection(host, port, config, ex);
                return;
            }
            if ("onSocketConnection" in observer)
                observer.onSocketConnection(host, port, config);
        }

        if (uri)
        {
            uri = Services.io.newURI(uri);
            if ("asyncResolve" in pps)
            {
                pps.asyncResolve(uri, 0, {
                    onProxyAvailable: function(request, uri, proxyInfo, status) {
                        continueWithProxy(proxyInfo);
                    }
                });
            }
            else if ("resolve" in pps)
            {
                continueWithProxy(pps.resolve(uri, 0));
            }
            else if ("examineForProxy" in pps)
            {
                continueWithProxy(pps.examineForProxy(uri));
            }
            else
            {
                throw "Unable to find method to resolve proxies";
            }
        }
        else
        {
            continueWithProxy(null);
        }
        return true;
    }

    // Strip the IPv6 literal brackets; all the APIs below don't want them.
    if (host[0] == '[' && host[host.length - 1] == ']')
        host = host.substr(1, host.length - 2);

        /* Since the proxy info is opaque, we need to check that we got
         * something for our HTTP proxy - we can't just check proxyInfo.type.
         */
    var proxyInfo = config.proxyInfo || null;
    var usingHTTPCONNECT = ("proxy" in config) && (config.proxy == "http")
                           && proxyInfo;

    if (proxyInfo && ("type" in proxyInfo) && (proxyInfo.type == "unknown"))
        throw JSIRC_ERR_PAC_LOADING;

        /* use new necko interfaces */
        if (("isSecure" in config) && config.isSecure)
        {
            this._transport = this._sockService.
                              createTransport(["ssl"], 1, host, port,
                                              proxyInfo);

            if (this.strictSSL)
                this._transport.securityCallbacks = new BadCertHandler();
        }
        else
        {
            this._transport = this._sockService.
                              createTransport(null, 0, host, port, proxyInfo);
        }
        if (!this._transport)
            throw ("Error creating transport.");

        var openFlags = 0;

        /* no limit on the output stream buffer */
        this._outputStream =
            this._transport.openOutputStream(openFlags, 4096, -1);
        if (!this._outputStream)
            throw "Error getting output stream.";
        this._sOutputStream = toSOutputStream(this._outputStream,
                                              this.binaryMode);

        this._inputStream = this._transport.openInputStream(openFlags, 0, 0);
        if (!this._inputStream)
            throw "Error getting input stream.";
        this._sInputStream = toSInputStream(this._inputStream,
                                            this.binaryMode);

    this.connectDate = new Date();
    this.isConnected = true;

    // Bootstrap the connection if we're proxying via an HTTP proxy.
    if (usingHTTPCONNECT)
        this.sendData("CONNECT " + hostPort + " HTTP/1.1\r\n\r\n");

    return true;

}

CBSConnection.prototype.listen =
function bc_listen(port, observer)
{
    var serverSockClass =
        Components.classes["@mozilla.org/network/server-socket;1"];

    if (!serverSockClass)
        throw ("Couldn't get server socket class.");

    var serverSock = serverSockClass.createInstance();
    if (!serverSock)
        throw ("Couldn't get server socket.");

    this._serverSock = serverSock.QueryInterface
        (Components.interfaces.nsIServerSocket);

    this._serverSock.init(port, false, -1);

    this._serverSockListener = new SocketListener(this, observer);

    this._serverSock.asyncListen(this._serverSockListener);

    this.port = this._serverSock.port;

    return true;
}

CBSConnection.prototype.accept =
function bc_accept(transport, observer)
{
    this._transport = transport;
    this.host = this._transport.host.toLowerCase();
    this.port = this._transport.port;

        var openFlags = 0;

        /* no limit on the output stream buffer */
        this._outputStream =
            this._transport.openOutputStream(openFlags, 4096, -1);
        if (!this._outputStream)
            throw "Error getting output stream.";
        this._sOutputStream = toSOutputStream(this._outputStream,
                                              this.binaryMode);

        this._inputStream = this._transport.openInputStream(openFlags, 0, 0);
        if (!this._inputStream)
            throw "Error getting input stream.";
        this._sInputStream = toSInputStream(this._inputStream,
                                            this.binaryMode);

    this.connectDate = new Date();
    this.isConnected = true;

    // Clean up listening socket.
    this.close();

    return this.isConnected;
}

CBSConnection.prototype.close =
function bc_close()
{
    if ("_serverSock" in this && this._serverSock)
        this._serverSock.close();
}

CBSConnection.prototype.disconnect =
function bc_disconnect()
{
    if ("_inputStream" in this && this._inputStream)
        this._inputStream.close();
    if ("_outputStream" in this && this._outputStream)
        this._outputStream.close();
    this.isConnected = false;
    /*
    this._streamProvider.close();
    if (this._streamProvider.isBlocked)
      this._write_req.resume();
    */
}

CBSConnection.prototype.sendData =
function bc_senddata(str)
{
    if (!this.isConnected)
        throw "Not Connected.";

    this.sendDataNow(str);
}

CBSConnection.prototype.readData =
function bc_readdata(timeout, count)
{
    if (!this.isConnected)
        throw "Not Connected.";

    var rv;

    if (!("_sInputStream" in this)) {
        this._sInputStream = toSInputStream(this._inputStream);
        dump("OMG, setting up _sInputStream!\n");
    }

    try
    {
        // XPCshell h4x
        if (typeof count == "undefined")
            count = this._sInputStream.available();
        if (this.binaryMode)
            rv = this._sInputStream.readBytes(count);
        else
            rv = this._sInputStream.read(count);
    }
    catch (ex)
    {
        dd ("*** Caught " + ex + " while reading.");
        this.disconnect();
        throw (ex);
    }

    return rv;
}

CBSConnection.prototype.startAsyncRead =
function bc_saread (observer)
{
        var cls = Components.classes["@mozilla.org/network/input-stream-pump;1"];
        var pump = cls.createInstance(Components.interfaces.nsIInputStreamPump);
        // Account for Bug 1402888 which removed the startOffset and readLimit
        // parameters from init.
        if (pump.init.length > 5)
        {
            pump.init(this._inputStream, -1, -1, 0, 0, false);
        } else
        {
            pump.init(this._inputStream, 0, 0, false);
        }
        pump.asyncRead(new StreamListener(observer), this);
}

CBSConnection.prototype.asyncWrite =
function bc_awrite (str)
{
    this._streamProvider.pendingData += str;
    if (this._streamProvider.isBlocked)
    {
        this._write_req.resume();
        this._streamProvider.isBlocked = false;
    }
}

CBSConnection.prototype.hasPendingWrite =
function bc_haspwrite ()
{
        return false; /* data already pushed to necko */
}

CBSConnection.prototype.sendDataNow =
function bc_senddatanow(str)
{
    var rv = false;

    try
    {
        if (this.binaryMode)
            this._sOutputStream.writeBytes(str, str.length);
        else
            this._sOutputStream.write(str, str.length);
        rv = true;
    }
    catch (ex)
    {
        dd ("*** Caught " + ex + " while sending.");
        this.disconnect();
        throw (ex);
    }

    return rv;
}

/**
 * Gets information about the security of the connection.
 *
 * |STATE_IS_BROKEN| is returned if any errors occur and |STATE_IS_INSECURE| is
 * returned for disconnected sockets.
 *
 * @returns A value from the |STATE_IS_*| enumeration at the top of this file.
 */
CBSConnection.prototype.getSecurityState =
function bc_getsecuritystate()
{
    if (!this.isConnected || !this._transport.securityInfo)
        return STATE_IS_INSECURE;

    try
    {
        // Get the actual SSL Status
        let sslSp = this._transport.securityInfo
                                   .QueryInterface(Ci.nsISSLStatusProvider);
        let sslStatus = sslSp.SSLStatus.QueryInterface(Ci.nsISSLStatus);
        // Store appropriate status
        if (!("keyLength" in sslStatus) || !sslStatus.keyLength)
            return STATE_IS_BROKEN;

        return STATE_IS_SECURE;
    }
    catch (ex)
    {
        // Something goes wrong -> broken security icon
        dd("Exception getting certificate for connection: " + ex.message);
        return STATE_IS_BROKEN;
    }
}

CBSConnection.prototype.getCertificate =
function bc_getcertificate()
{
    if (!this.isConnected || !this._transport.securityInfo)
        return null;

    // Get the actual SSL Status
    let sslSp = this._transport.securityInfo
                               .QueryInterface(Ci.nsISSLStatusProvider);
    let sslStatus = sslSp.SSLStatus.QueryInterface(Ci.nsISSLStatus);

    // return the certificate
    return sslStatus.serverCert;
}

CBSConnection.prototype.asyncWrite =
function bc_asyncwrite()
{
    throw "Not Implemented.";
}

function StreamProvider(observer)
{
    this._observer = observer;
}

StreamProvider.prototype.pendingData = "";
StreamProvider.prototype.isBlocked = true;

StreamProvider.prototype.close =
function sp_close ()
{
    this.isClosed = true;
}

StreamProvider.prototype.onDataWritable =
function sp_datawrite (request, ctxt, ostream, offset, count)
{
    //dd ("StreamProvider.prototype.onDataWritable");

    if ("isClosed" in this && this.isClosed)
        throw Components.results.NS_BASE_STREAM_CLOSED;

    if (!this.pendingData)
    {
        this.isBlocked = true;

        /* this is here to support pre-XPCDOM builds (0.9.0 era), which
         * don't have this result code mapped. */
        if (!Components.results.NS_BASE_STREAM_WOULD_BLOCK)
            throw 2152136711;

        throw Components.results.NS_BASE_STREAM_WOULD_BLOCK;
    }

    var len = ostream.write (this.pendingData, this.pendingData.length);
    this.pendingData = this.pendingData.substr (len);
}

StreamProvider.prototype.onStartRequest =
function sp_startreq (request, ctxt)
{
    //dd ("StreamProvider::onStartRequest: " + request + ", " + ctxt);
}


StreamProvider.prototype.onStopRequest =
function sp_stopreq (request, ctxt, status)
{
    //dd ("StreamProvider::onStopRequest: " + request + ", " + ctxt + ", " +
    //    status);
    if (this._observer)
        this._observer.onStreamClose(status);
}

function StreamListener(observer)
{
    this._observer = observer;
}

StreamListener.prototype.onStartRequest =
function sl_startreq (request, ctxt)
{
    //dd ("StreamListener::onStartRequest: " + request + ", " + ctxt);
}

StreamListener.prototype.onStopRequest =
function sl_stopreq (request, ctxt, status)
{
    //dd ("StreamListener::onStopRequest: " + request + ", " + ctxt + ", " +
    //status);
    if (this._observer)
        this._observer.onStreamClose(status);
}

StreamListener.prototype.onDataAvailable =
function sl_dataavail (request, ctxt, inStr, sourceOffset, count)
{
    ctxt = ctxt.wrappedJSObject;
    if (!ctxt)
    {
        dd ("*** Can't get wrappedJSObject from ctxt in " +
            "StreamListener.onDataAvailable ***");
        return;
    }

    if (!("_sInputStream" in ctxt))
        ctxt._sInputStream = toSInputStream(inStr, false);

    if (this._observer)
        this._observer.onStreamDataAvailable(request, inStr, sourceOffset,
                                             count);
}

function SocketListener(connection, observer)
{
    this._connection = connection;
    this._observer = observer;
}

SocketListener.prototype.onSocketAccepted =
function sl_onSocketAccepted(socket, transport)
{
    this._observer.onSocketAccepted(socket, transport);
}
SocketListener.prototype.onStopListening =
function sl_onStopListening(socket, status)
{
    delete this._connection._serverSockListener;
    delete this._connection._serverSock;
}
