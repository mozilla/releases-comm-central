/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const nsIWebBrowserChrome = Ci.nsIWebBrowserChrome;

function nsBrowserContentListener(toplevelWindow, contentWindow)
{
    // this one is not as easy as you would hope.
    // need to convert toplevelWindow to an XPConnected object, instead
    // of a DOM-based object, to be able to QI() it to nsIXULWindow

    this.init(toplevelWindow, contentWindow);
}

/* implements nsIURIContentListener */

nsBrowserContentListener.prototype =
{
    init: function(toplevelWindow, contentWindow)
    {
        this.toplevelWindow = toplevelWindow;
        this.contentWindow = contentWindow;

        // hook up the whole parent chain thing
        var windowDocShell = this.convertWindowToDocShell(toplevelWindow);
        if (windowDocShell) {
            windowDocshell
              .QueryInterface(Ci.nsIInterfaceRequestor)
              .getInterface(Ci.nsIURIContentListener)
              .parentContentListener = this;
        }

        var registerWindow = false;
        try {
          var treeItem = contentWindow.docShell.QueryInterface(Ci.nsIDocShellTreeItem);
          var treeOwner = treeItem.treeOwner;
          var interfaceRequestor = treeOwner.QueryInterface(Ci.nsIInterfaceRequestor);
          var webBrowserChrome = interfaceRequestor.getInterface(nsIWebBrowserChrome);
          if (webBrowserChrome)
          {
            var chromeFlags = webBrowserChrome.chromeFlags;
            var res = chromeFlags & nsIWebBrowserChrome.CHROME_ALL;
            var res2 = chromeFlags & nsIWebBrowserChrome.CHROME_DEFAULT;
            if ( res == nsIWebBrowserChrome.CHROME_ALL || res2 == nsIWebBrowserChrome.CHROME_DEFAULT)
            {
              registerWindow = true;
            }
         }
       } catch (ex) {}

        // register ourselves
       if (registerWindow)
       {
        var uriLoader = Cc["@mozilla.org/uriloader;1"].getService(Ci.nsIURILoader);
        uriLoader.registerContentListener(this);
       }
    },
    close: function()
    {
        this.contentWindow = null;
        var uriLoader = Cc["@mozilla.org/uriloader;1"].getService(Ci.nsIURILoader);

        uriLoader.unRegisterContentListener(this);
    },
    QueryInterface: function(iid)
    {
        if (iid.equals(Ci.nsIURIContentListener) ||
            iid.equals(Ci.nsISupportsWeakReference) ||
            iid.equals(Ci.nsISupports))
            return this;

        throw Cr.NS_ERROR_NO_INTERFACE;
    },

    doContent: function(contentType, isContentPreferred, request, contentHandler)
    {
        // forward the doContent to our content area webshell
        var docShell = this.contentWindow.docShell;
        if (Services.prefs.getIntPref("browser.link.open_external") == nsIBrowserDOMWindow.OPEN_NEWTAB) {
            var newTab = gBrowser.loadOneTab("about:blank", {
                                         inBackground: Services.prefs.getBoolPref("browser.tabs.loadDivertedInBackground")});
            docShell = gBrowser.getBrowserForTab(newTab).docShell;
        }

        var contentListener;
        try {
            contentListener =
                docShell.QueryInterface(Ci.nsIInterfaceRequestor)
                .getInterface(Ci.nsIURIContentListener);
        } catch (ex) {
            dump(ex);
        }

        if (!contentListener) return false;

        return contentListener.doContent(contentType, isContentPreferred, request, contentHandler);

    },

    isPreferred: function(contentType, desiredContentType)
    {
        if (Services.prefs.getIntPref("browser.link.open_external") == nsIBrowserDOMWindow.OPEN_NEWWINDOW)
            return false;

        try {
            var webNavInfo =
              Cc["@mozilla.org/webnavigation-info;1"]
                .getService(Ci.nsIWebNavigationInfo);
            return webNavInfo.isTypeSupported(contentType, null);
        } catch (e) {
            // XXX propagate failures other than "NS_ERROR_NOT_AVAILABLE"?
            // This seems to never get called, so not like it matters....
            return false;
        }
    },
    canHandleContent: function(contentType, isContentPreferred, desiredContentType)
    {
        var docShell = this.contentWindow.docShell;
        var contentListener;
        try {
            contentListener =
                docShell.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIURIContentListener);
        } catch (ex) {
            dump(ex);
        }
        if (!contentListener) return false;

        return contentListener.canHandleContent(contentType, isContentPreferred, desiredContentType);
    },
    convertWindowToDocShell: function(win) {
        // don't know how to do this
        return null;
    },
    loadCookie: null,
    parentContentListener: null
}
