/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { classes: Cc, interfaces: Ci, utils: Cu, results: Cr } = Components;

const MEDIATOR_CONTRACTID =
    "@mozilla.org/appshell/window-mediator;1";
const ASS_CONTRACTID =
    "@mozilla.org/appshell/appShellService;1";
const RDFS_CONTRACTID =
    "@mozilla.org/rdf/rdf-service;1";
const CATMAN_CONTRACTID =
    "@mozilla.org/categorymanager;1";
const PPMM_CONTRACTID =
    "@mozilla.org/parentprocessmessagemanager;1";

const CLINE_SERVICE_CONTRACTID =
    "@mozilla.org/commandlinehandler/general-startup;1?type=chat";
const CLINE_SERVICE_CID =
    Components.ID("{38a95514-1dd2-11b2-97e7-9da958640f2c}");
const STARTUP_CID =
    Components.ID("{ae6ad015-433b-42ab-9afc-1636af5a7fc4}");


var {
  ChatZillaProtocols,
  IRCProtocolHandlerFactory,
  IRCSProtocolHandlerFactory,
  IRCPROT_HANDLER_CID,
  IRCSPROT_HANDLER_CID,
} = ChromeUtils.import(
  "chrome://chatzilla/content/lib/js/protocol-handlers.jsm"
);

function spawnChatZilla(uri, count)
{
    const wm = Cc[MEDIATOR_CONTRACTID].getService(Ci.nsIWindowMediator);
    const ass = Cc[ASS_CONTRACTID].getService(Ci.nsIAppShellService);
    const hiddenWin = ass.hiddenDOMWindow;

    // Ok, not starting currently, so check if we've got existing windows.
    const w = wm.getMostRecentWindow("irc:chatzilla");

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
    /* nsISupports */
    QueryInterface(iid)
    {
        if (iid.equals(Ci.nsISupports))
            return this;

        if (Ci.nsICommandLineHandler && iid.equals(Ci.nsICommandLineHandler))
            return this;

        throw Cr.NS_ERROR_NO_INTERFACE;
    },

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
    /* nsISupports */
    QueryInterface(iid)
    {
        if (iid.equals(Ci.nsISupports) ||
            iid.equals(Ci.nsIObserver) ||
            iid.equals(Ci.nsIMessageListener))
        {
            return this;
        }

        throw Cr.NS_ERROR_NO_INTERFACE;
    },

    /* nsIObserver */
    observe(subject, topic, data)
    {
        if (topic !== "profile-after-change")
            return;

        var ppmm;
        // Ci.nsIMessageBroadcaster went in Gecko 61.
        if (Ci.nsIMessageBroadcaster)
        {
            ppmm = Cc[PPMM_CONTRACTID].getService(Ci.nsIMessageBroadcaster);
        }
        else
        {
            ppmm = Cc[PPMM_CONTRACTID].getService();
        }
        ppmm.loadProcessScript("chrome://chatzilla/content/lib/js/chatzilla-protocol-script.js", true);
        ppmm.addMessageListener("ChatZilla:SpawnChatZilla", this);
    },

    /* nsIMessageListener */
    receiveMessage(msg)
    {
        if (msg.name !== "ChatZilla:SpawnChatZilla")
            return;

        spawnChatZilla(msg.data.uri);
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


const ChatZillaModule =
{
    registerSelf(compMgr, fileSpec, location, type)
    {
        compMgr = compMgr.QueryInterface(Ci.nsIComponentRegistrar);
        const catman = Cc[CATMAN_CONTRACTID].getService(Ci.nsICategoryManager);

        debug("*** Registering -chat handler.\n");
        catman.addCategoryEntry("command-line-argument-handlers",
                                "chatzilla command line handler",
                                CLINE_SERVICE_CONTRACTID, true, true);
        catman.addCategoryEntry("command-line-handler",
                                "m-irc",
                                CLINE_SERVICE_CONTRACTID, true, true);
        debug("*** Registering done.\n");
    },

    unregisterSelf(compMgr, fileSpec, location)
    {
        compMgr = compMgr.QueryInterface(Ci.nsIComponentRegistrar);
        const catman = Cc[CATMAN_CONTRACTID].getService(Ci.nsICategoryManager);
        catman.deleteCategoryEntry("command-line-argument-handlers",
                                   "chatzilla command line handler", true);
        catman.deleteCategoryEntry("command-line-handler",
                                   "m-irc", true);
    },

    getClassObject(compMgr, cid, iid)
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

        if (cid.equals(IRCPROT_HANDLER_CID))
            return IRCProtocolHandlerFactory;

        if (cid.equals(IRCSPROT_HANDLER_CID))
            return IRCSProtocolHandlerFactory;

        if (cid.equals(STARTUP_CID))
            return StartupFactory;

        if (!iid.equals(Ci.nsIFactory))
            throw Cr.NS_ERROR_NOT_IMPLEMENTED;

        throw Cr.NS_ERROR_NO_INTERFACE;
    },

    canUnload(compMgr)
    {
        return true;
    },
};


/* entrypoint */
function NSGetModule(compMgr, fileSpec)
{
    return ChatZillaModule;
}

function NSGetFactory(cid)
{
    return ChatZillaModule.getClassObject(null, cid, null);
}
