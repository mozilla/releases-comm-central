/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);


const RDFS_CONTRACTID =
    "@mozilla.org/rdf/rdf-service;1";
const PPMM_CONTRACTID =
    "@mozilla.org/parentprocessmessagemanager;1";

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
    /* nsISupports */
    QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver,
                                           Ci.nsIMessageListener]),

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
