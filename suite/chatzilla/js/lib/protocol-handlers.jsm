/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = [
    "ChatZillaProtocols",
    "IRCProtocolHandlerFactory",
    "IRCSProtocolHandlerFactory",
    "IRCPROT_HANDLER_CID",
    "IRCSPROT_HANDLER_CID"
];

const { classes: Cc, interfaces: Ci, results: Cr } = Components;

const IOSERVICE_CONTRACTID =
    "@mozilla.org/network/io-service;1";

const IRCPROT_HANDLER_CONTRACTID =
    "@mozilla.org/network/protocol;1?name=irc";
const IRCSPROT_HANDLER_CONTRACTID =
    "@mozilla.org/network/protocol;1?name=ircs";
this.IRCPROT_HANDLER_CID =
    Components.ID("{f21c35f4-1dd1-11b2-a503-9bf8a539ea39}");
this.IRCSPROT_HANDLER_CID =
    Components.ID("{f21c35f4-1dd1-11b2-a503-9bf8a539ea3a}");

const IRC_MIMETYPE = "application/x-irc";
const IRCS_MIMETYPE = "application/x-ircs";

//XXXgijs: Because necko is annoying and doesn't expose this error flag, we
//         define our own constant for it. Throwing something else will show
//         ugly errors instead of seeminly doing nothing.
const NS_ERROR_MODULE_NETWORK_BASE = 0x804b0000;
const NS_ERROR_NO_CONTENT = NS_ERROR_MODULE_NETWORK_BASE + 17;


function spawnChatZilla(uri) {
    var cpmm;
    // Ci.nsISyncMessageSender went in Gecko 61.
    if (Ci.nsISyncMessageSender) {
        cpmm = Cc["@mozilla.org/childprocessmessagemanager;1"]
                 .getService(Ci.nsISyncMessageSender);
    } else {
        cpmm = Cc["@mozilla.org/childprocessmessagemanager;1"].getService();
    }
    cpmm.sendAsyncMessage("ChatZilla:SpawnChatZilla", { uri });
}


function IRCProtocolHandler(isSecure)
{
    this.isSecure = isSecure;
}

var protocolFlags = Ci.nsIProtocolHandler.URI_NORELATIVE |
                    Ci.nsIProtocolHandler.ALLOWS_PROXY;
if ("URI_DANGEROUS_TO_LOAD" in Ci.nsIProtocolHandler) {
    protocolFlags |= Ci.nsIProtocolHandler.URI_LOADABLE_BY_ANYONE;
}
if ("URI_NON_PERSISTABLE" in Ci.nsIProtocolHandler) {
    protocolFlags |= Ci.nsIProtocolHandler.URI_NON_PERSISTABLE;
}
if ("URI_DOES_NOT_RETURN_DATA" in Ci.nsIProtocolHandler) {
    protocolFlags |= Ci.nsIProtocolHandler.URI_DOES_NOT_RETURN_DATA;
}

IRCProtocolHandler.prototype =
{
    protocolFlags: protocolFlags,

    allowPort(port, scheme)
    {
        // Allow all ports to connect, so long as they are irc: or ircs:
        return (scheme === 'irc' || scheme === 'ircs');
    },

    newURI(spec, charset, baseURI)
    {
        const port = this.isSecure ? 6697 : 6667;

        return Cc["@mozilla.org/network/standard-url-mutator;1"]
                 .createInstance(Ci.nsIStandardURLMutator)
                 .init(Ci.nsIStandardURL.URLTYPE_STANDARD, port, spec, charset, baseURI)
                 .finalize()
                 .QueryInterface(Ci.nsIStandardURL);
    },

    newChannel(URI)
    {
        const ios = Cc[IOSERVICE_CONTRACTID].getService(Ci.nsIIOService);
        if (!ios.allowPort(URI.port, URI.scheme))
            throw Cr.NS_ERROR_FAILURE;

        return new BogusChannel(URI, this.isSecure);
    },
};


this.IRCProtocolHandlerFactory =
{
    createInstance(outer, iid)
    {
        if (outer != null)
            throw Cr.NS_ERROR_NO_AGGREGATION;

        if (!iid.equals(Ci.nsIProtocolHandler) && !iid.equals(Ci.nsISupports))
            throw Cr.NS_ERROR_INVALID_ARG;

        const protHandler = new IRCProtocolHandler(false);
        protHandler.scheme = "irc";
        protHandler.defaultPort = 6667;
        return protHandler;
    },
};


this.IRCSProtocolHandlerFactory =
{
    createInstance(outer, iid)
    {
        if (outer != null)
            throw Cr.NS_ERROR_NO_AGGREGATION;

        if (!iid.equals(Ci.nsIProtocolHandler) && !iid.equals(Ci.nsISupports))
            throw Cr.NS_ERROR_INVALID_ARG;

        const protHandler = new IRCProtocolHandler(true);
        protHandler.scheme = "ircs";
        protHandler.defaultPort = 6697;
        return protHandler;
    },
};


/* Bogus IRC channel used by the IRCProtocolHandler */
function BogusChannel(URI, isSecure)
{
    this.URI = URI;
    this.originalURI = URI;
    this.isSecure = isSecure;
    this.contentType = this.isSecure ? IRCS_MIMETYPE : IRC_MIMETYPE;
}

BogusChannel.prototype =
{
    /* nsISupports */
    QueryInterface(iid)
    {
        if (iid.equals(Ci.nsISupports) ||
            iid.equals(Ci.nsIChannel) ||
            iid.equals(Ci.nsIRequest))
        {
            return this;
        }

        throw Cr.NS_ERROR_NO_INTERFACE;
    },

    /* nsIChannel */
    loadAttributes: null,
    contentLength: 0,
    owner: null,
    loadGroup: null,
    notificationCallbacks: null,
    securityInfo: null,

    open(observer, context)
    {
        spawnChatZilla(this.URI.spec);
        // We don't throw this (a number, not a real 'resultcode') because it
        // upsets xpconnect if we do (error in the js console).
        Components.returnCode = NS_ERROR_NO_CONTENT;
    },

    asyncOpen(observer, context)
    {
        spawnChatZilla(this.URI.spec);
        // We don't throw this (a number, not a real 'resultcode') because it
        // upsets xpconnect if we do (error in the js console).
        Components.returnCode = NS_ERROR_NO_CONTENT;
    },

    asyncRead(listener, context)
    {
        throw Cr.NS_ERROR_NOT_IMPLEMENTED;
    },

    /* nsIRequest */
    isPending()
    {
        return true;
    },

    status: Cr.NS_OK,

    cancel(status)
    {
        this.status = status;
    },

    suspend()
    {
        throw Cr.NS_ERROR_NOT_IMPLEMENTED;
    },

    resume()
    {
        throw Cr.NS_ERROR_NOT_IMPLEMENTED;
    },
};


this.ChatZillaProtocols =
{
    init()
    {
        const compMgr = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
        compMgr.registerFactory(IRCPROT_HANDLER_CID,
                                "IRC protocol handler",
                                IRCPROT_HANDLER_CONTRACTID,
                                IRCProtocolHandlerFactory);
        compMgr.registerFactory(IRCSPROT_HANDLER_CID,
                                "IRC protocol handler",
                                IRCSPROT_HANDLER_CONTRACTID,
                                IRCSProtocolHandlerFactory);
    },
};
