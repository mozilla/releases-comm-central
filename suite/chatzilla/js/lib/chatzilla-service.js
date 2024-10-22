/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);


const RDFS_CONTRACTID =
    "@mozilla.org/rdf/rdf-service;1";
const CLINE_SERVICE_CID =
    Components.ID("{38a95514-1dd2-11b2-97e7-9da958640f2c}");
const STARTUP_CID =
    Components.ID("{ae6ad015-433b-42ab-9afc-1636af5a7fc4}");

const IRCPROT_HANDLER_CONTRACTID =
    "@mozilla.org/network/protocol;1?name=irc";
const IRCSPROT_HANDLER_CONTRACTID =
    "@mozilla.org/network/protocol;1?name=ircs";
const IRCPROT_HANDLER_CID =
    Components.ID("{f21c35f4-1dd1-11b2-a503-9bf8a539ea39}");
const IRCSPROT_HANDLER_CID =
    Components.ID("{f21c35f4-1dd1-11b2-a503-9bf8a539ea3a}");

function spawnChatZilla(uri, count)
{
    const hiddenWin = Services.appShell.hiddenDOMWindow;

    // Ok, not starting currently, so check if we've got existing windows.
    const w = Services.wm.getMostRecentWindow("irc:chatzilla");

    // Claiming that a ChatZilla window is loading.
    if ("ChatZillaStarting" in hiddenWin)
    {
        dump("cz-service: ChatZilla claiming to be starting.\n");
        if (w && ("client" in w) && ("initialized" in w.client) &&
            w.client.initialized)
        {
            dump("cz-service: It lied. It's finished starting.\n");
            // It's actually loaded ok.
            delete hiddenWin.ChatZillaStarting;
        }
    }

    if ("ChatZillaStarting" in hiddenWin)
    {
        count = count || 0;

        if ((new Date() - hiddenWin.ChatZillaStarting) > 10000)
        {
            dump("cz-service: Continuing to be unable to talk to existing window!\n");
        }
        else
        {
            // We have a ChatZilla window, but we're still loading.
            hiddenWin.setTimeout(function wrapper(count) {
                    spawnChatZilla(uri, count + 1);
                }, 250, count);
            return true;
        }
    }

    // We have a window.
    if (w)
    {
        dump("cz-service: Existing, fully loaded window. Using.\n");
        // Window is working and initialized ok. Use it.
        w.focus();
        if (uri)
            w.gotoIRCURL(uri);
        return true;
    }

    dump("cz-service: No windows, starting new one.\n");
    // Ok, no available window, loading or otherwise, so start ChatZilla.
    const args = new Object();
    if (uri)
        args.url = uri;

    hiddenWin.ChatZillaStarting = new Date();
    hiddenWin.openDialog("chrome://chatzilla/content/chatzilla.xul", "_blank",
                 "chrome,menubar,toolbar,status,resizable,dialog=no",
                 args);

    return true;
}


function CommandLineService()
{
}

CommandLineService.prototype =
{
    classID: CLINE_SERVICE_CID,

    /* nsISupports */
    QueryInterface: XPCOMUtils.generateQI([Ci.nsICommandLineHandler]),

    /* nsICommandLineHandler */
    handle(cmdLine)
    {
        var uri;
        try
        {
            uri = cmdLine.handleFlagWithParam("chat", false);
        }
        catch (e)
        {
        }

        if (uri || cmdLine.handleFlag("chat", false))
        {
            spawnChatZilla(uri || null)
            cmdLine.preventDefault = true;
        }
    },

    helpInfo: "-chat [<ircurl>]  Start with an IRC chat client.\n",
};


/* factory for command line handler service (CommandLineService) */
const CommandLineFactory =
{
    createInstance(outer, iid)
    {
        if (outer != null)
            throw Cr.NS_ERROR_NO_AGGREGATION;

        return new CommandLineService().QueryInterface(iid);
    },
};


function ProcessHandler()
{
}

ProcessHandler.prototype =
{
    classID: STARTUP_CID,

    /* nsISupports */
    QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver]),

    /* nsIObserver */
    observe(subject, topic, data)
    {
        if (topic !== "profile-after-change")
            return;

        const compMgr = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
        compMgr.registerFactory(IRCPROT_HANDLER_CID,
                                "IRC protocol handler",
                                IRCPROT_HANDLER_CONTRACTID,
                                IRCProtocolHandlerFactory);
        compMgr.registerFactory(IRCSPROT_HANDLER_CID,
                                "IRCS protocol handler",
                                IRCSPROT_HANDLER_CONTRACTID,
                                IRCSProtocolHandlerFactory);
    },
};


const StartupFactory =
{
    createInstance(outer, iid)
    {
        if (outer)
            throw Cr.NS_ERROR_NO_AGGREGATION;

        if (!iid.equals(Ci.nsISupports))
            throw Cr.NS_ERROR_NO_INTERFACE;

        // startup:
        return new ProcessHandler();
    },
};


const IRC_MIMETYPE = "application/x-irc";
const IRCS_MIMETYPE = "application/x-ircs";

//XXXgijs: Because necko is annoying and doesn't expose this error flag, we
//         define our own constant for it. Throwing something else will show
//         ugly errors instead of seeminly doing nothing.
const NS_ERROR_MODULE_NETWORK_BASE = 0x804b0000;
const NS_ERROR_NO_CONTENT = NS_ERROR_MODULE_NETWORK_BASE + 17;


function GenericIRCProtocolHandler(isSecure)
{
    this.isSecure = isSecure;
    this.scheme = isSecure ? "ircs" : "irc";
    this.classID = isSecure ? IRCSPROT_HANDLER_CID : IRCPROT_HANDLER_CID;
    this.defaultPort = isSecure ? 6697 : 6667;
}

GenericIRCProtocolHandler.prototype =
{
    QueryInterface: XPCOMUtils.generateQI([Ci.nsIProtocolHandler,
                                           Ci.nsISupports]),

    protocolFlags: Ci.nsIProtocolHandler.URI_NORELATIVE |
                   Ci.nsIProtocolHandler.ALLOWS_PROXY |
                   Ci.nsIProtocolHandler.URI_LOADABLE_BY_ANYONE |
                   Ci.nsIProtocolHandler.URI_NON_PERSISTABLE |
                   Ci.nsIProtocolHandler.URI_DOES_NOT_RETURN_DATA,

    allowPort(port, scheme)
    {
        // Allow all ports to connect, so long as they are irc: or ircs:
        return (scheme === 'irc' || scheme === 'ircs');
    },

    newURI(spec, charset, baseURI)
    {
        return Cc["@mozilla.org/network/standard-url-mutator;1"]
                 .createInstance(Ci.nsIStandardURLMutator)
                 .init(Ci.nsIStandardURL.URLTYPE_STANDARD, this.defaultPort,
                       spec, charset, baseURI)
                 .finalize()
                 .QueryInterface(Ci.nsIStandardURL);
    },

    newChannel(URI)
    {
        if (!Services.io.allowPort(URI.port, URI.scheme))
            throw Cr.NS_ERROR_FAILURE;

        return new BogusChannel(URI, this.isSecure);
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
    QueryInterface: XPCOMUtils.generateQI([Ci.nsIChannel, Ci.nsIRequest]),

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


function IRCProtocolHandler()
{
}

IRCProtocolHandler.prototype = new GenericIRCProtocolHandler(false);

function IRCSProtocolHandler()
{
}

IRCSProtocolHandler.prototype = new GenericIRCProtocolHandler(true);

const IRCProtocolHandlerFactory =
{
    createInstance(outer, iid)
    {
        if (outer != null)
            throw Cr.NS_ERROR_NO_AGGREGATION;

        if (!iid.equals(Ci.nsIProtocolHandler) && !iid.equals(Ci.nsISupports))
            throw Cr.NS_ERROR_INVALID_ARG;

        return new IRCProtocolHandler(false);
    },
};


const IRCSProtocolHandlerFactory =
{
    createInstance(outer, iid)
    {
        if (outer != null)
            throw Cr.NS_ERROR_NO_AGGREGATION;

        if (!iid.equals(Ci.nsIProtocolHandler) && !iid.equals(Ci.nsISupports))
            throw Cr.NS_ERROR_INVALID_ARG;

        return new IRCProtocolHandler(true);
    },
};

/* entrypoint */
function NSGetFactory(cid)
{
    // Checking if we're disabled in the Chrome Registry.
    var rv;
    try
    {
        const rdfSvc = Cc[RDFS_CONTRACTID].getService(Ci.nsIRDFService);
        const rdfDS = rdfSvc.GetDataSource("rdf:chrome");
        const resSelf = rdfSvc.GetResource("urn:mozilla:package:chatzilla");
        const resDisabled = rdfSvc.GetResource("http://www.mozilla.org/rdf/chrome#disabled");
        rv = rdfDS.GetTarget(resSelf, resDisabled, true);
    }
    catch (e)
    {
    }
    if (rv)
        throw Cr.NS_ERROR_NO_INTERFACE;

    if (cid.equals(CLINE_SERVICE_CID))
        return CommandLineFactory;

    if (cid.equals(STARTUP_CID))
        return StartupFactory;

    if (cid.equals(IRCPROT_HANDLER_CID))
        return IRCProtocolHandlerFactory;

    if (cid.equals(IRCSPROT_HANDLER_CID))
        return IRCSProtocolHandlerFactory;

    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
}
