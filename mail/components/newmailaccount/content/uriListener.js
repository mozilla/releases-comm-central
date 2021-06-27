/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals openAccountProvisioner */

/**
 * This object takes care of intercepting page loads and creating the
 * corresponding account if the page load turns out to be a text/xml file from
 * one of our account providers.
 */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
var { NetUtil } = ChromeUtils.import("resource://gre/modules/NetUtil.jsm");
var { JXON } = ChromeUtils.import("resource:///modules/JXON.jsm");

/**
 * This is an observer that watches all HTTP requests for one where the
 * response contentType contains text/xml.  Once that observation is
 * made, we ensure that the associated window for that request matches
 * the window belonging to the content tab for the account order form.
 * If so, we attach an nsITraceableListener to read the contents of the
 * request response, and react accordingly if the contents can be turned
 * into an email account.
 *
 * @param aBrowser The XUL <browser> the request lives in.
 * @param aParams An object containing various bits of information.
 * @param aParams.realName The real name of the person
 * @param aParams.email The email address the person picked.
 * @param aParams.searchEngine The search engine associated to that provider.
 */
function httpRequestObserver(aBrowser, aParams) {
  this.browser = aBrowser;
  this.params = aParams;
}

httpRequestObserver.prototype = {
  observe(aSubject, aTopic, aData) {
    if (
      aTopic != "http-on-examine-response" &&
      aTopic != "http-on-examine-cached-response"
    ) {
      return;
    }

    if (!(aSubject instanceof Ci.nsIHttpChannel)) {
      Cu.reportError(
        "Failed to get a nsIHttpChannel when " +
          "observing http-on-examine-response"
      );
      return;
    }
    // Helper function to get header values.
    let getHttpHeader = (httpChannel, header) => {
      // getResponseHeader throws when header is not set.
      try {
        return httpChannel.getResponseHeader(header);
      } catch (e) {
        return null;
      }
    };

    let contentType = getHttpHeader(aSubject, "Content-Type");
    if (!contentType || !contentType.toLowerCase().startsWith("text/xml")) {
      return;
    }

    // It's possible the account information changed during the setup at the
    // provider. Check some headers and set them if needed.
    let name = getHttpHeader(aSubject, "x-thunderbird-account-name");
    if (name) {
      this.params.realName = name;
    }
    let email = getHttpHeader(aSubject, "x-thunderbird-account-email");
    if (email) {
      this.params.email = email;
    }

    let requestWindow = this._getWindowForRequest(aSubject);
    if (!requestWindow || requestWindow !== this.browser.innerWindowID) {
      return;
    }

    // Ok, we've got a request that looks like a decent candidate.
    // Let's attach our TracingListener.
    if (aSubject instanceof Ci.nsITraceableChannel) {
      let newListener = new TracingListener(this.browser, this.params);
      newListener.oldListener = aSubject.setNewListener(newListener);
    }
  },

  /**
   * _getWindowForRequest is an internal function that takes an nsIRequest,
   * and returns the associated window for that request.  If it cannot find
   * an associated window, the function returns null. On exception, the
   * exception message is logged to the Error Console and null is returned.
   *
   * @param aRequest the nsIRequest to analyze
   */
  _getWindowForRequest(aRequest) {
    try {
      if (aRequest && aRequest.notificationCallbacks) {
        return aRequest.notificationCallbacks.getInterface(Ci.nsILoadContext)
          .currentWindowContext.innerWindowId;
      }
      if (
        aRequest &&
        aRequest.loadGroup &&
        aRequest.loadGroup.notificationCallbacks
      ) {
        return aRequest.loadGroup.notificationCallbacks.getInterface(
          Ci.nsILoadContext
        ).currentWindowContext.innerWindowId;
      }
    } catch (e) {
      Cu.reportError(
        "Could not find an associated window " +
          "for an HTTP request. Error: " +
          e
      );
    }
    return null;
  },

  QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),
};

/**
 * TracingListener is an nsITracableChannel implementation that copies
 * an incoming stream of data from a request.  The data flows through this
 * nsITracableChannel transparently to the original listener. Once the
 * response data is fully downloaded, an attempt is made to parse it
 * as XML, and derive email account data from it.
 *
 * @param aBrowser The XUL <browser> the request lives in.
 * @param aParams An object containing various bits of information.
 * @param aParams.realName The real name of the person
 * @param aParams.email The email address the person picked.
 * @param aParams.searchEngine The search engine associated to that provider.
 */
function TracingListener(aBrowser, aParams) {
  this.chunks = [];
  this.browser = aBrowser;
  this.params = aParams;
  this.oldListener = null;
}

TracingListener.prototype = {
  onStartRequest(/* nsIRequest */ aRequest) {
    this.oldListener.onStartRequest(aRequest);
  },

  onStopRequest(/* nsIRequest */ aRequest, /* int */ aStatusCode) {
    const { CreateInBackend } = ChromeUtils.import(
      "resource:///modules/accountcreation/CreateInBackend.jsm"
    );
    const { readFromXML } = ChromeUtils.import(
      "resource:///modules/accountcreation/readFromXML.jsm"
    );
    const { AccountConfig } = ChromeUtils.import(
      "resource:///modules/accountcreation/AccountConfig.jsm"
    );

    let tabmail = document.getElementById("tabmail");
    let success = false;
    let account;

    try {
      // Construct the downloaded data (we'll assume UTF-8 bytes) into XML.
      let xml = this.chunks.join("");
      let bytes = new Uint8Array(xml.length);
      for (let i = 0; i < xml.length; i++) {
        bytes[i] = xml.charCodeAt(i);
      }
      xml = new TextDecoder().decode(bytes);

      // Attempt to derive email account information
      let domParser = new DOMParser();
      let accountConfig = readFromXML(
        JXON.build(domParser.parseFromString(xml, "text/xml"))
      );
      AccountConfig.replaceVariables(
        accountConfig,
        this.params.realName,
        this.params.email
      );
      account = CreateInBackend.createAccountInBackend(accountConfig);
      success = true;
    } catch (e) {
      // Something went wrong with account set up. Dump the error out to the
      // error console. The tab will be closed, and the Account Provisioner
      // tab will be reopened.
      Cu.reportError("Problem interpreting provider XML:" + e);
    }

    tabmail.switchToTab(0);

    // Find the tab associated with this browser, and close it.
    let myTabInfo = tabmail.tabInfo.filter(
      function(x) {
        return "browser" in x && x.browser == this.browser;
      }.bind(this)
    )[0];
    tabmail.closeTab(myTabInfo);

    // Respawn the account provisioner to announce our success.
    openAccountProvisioner({
      success,
      search_engine: this.params.searchEngine,
      account,
    });

    this.oldListener.onStopRequest(aRequest, aStatusCode);
  },

  onDataAvailable(
    /* nsIRequest */ aRequest,
    /* nsIInputStream */ aStream,
    /* int */ aOffset,
    /* int */ aCount
  ) {
    // We want to read the stream of incoming data, but we also want
    // to make sure it gets passed to the original listener. We do this
    // by passing the input stream through an nsIStorageStream, writing
    // the data to that stream, and passing it along to the next listener.
    let binaryInputStream = Cc[
      "@mozilla.org/binaryinputstream;1"
    ].createInstance(Ci.nsIBinaryInputStream);
    let storageStream = Cc["@mozilla.org/storagestream;1"].createInstance(
      Ci.nsIStorageStream
    );
    let outStream = Cc["@mozilla.org/binaryoutputstream;1"].createInstance(
      Ci.nsIBinaryOutputStream
    );

    binaryInputStream.setInputStream(aStream);

    // The segment size of 8192 is a little magical - more or less
    // copied from nsITraceableChannel example code strewn about the
    // web.
    storageStream.init(8192, aCount, null);
    outStream.setOutputStream(storageStream.getOutputStream(0));

    let data = binaryInputStream.readBytes(aCount);
    this.chunks.push(data);

    outStream.writeBytes(data, aCount);
    this.oldListener.onDataAvailable(
      aRequest,
      storageStream.newInputStream(0),
      aOffset,
      aCount
    );
  },

  QueryInterface: ChromeUtils.generateQI([
    "nsIStreamListener",
    "nsIRequestObserver",
  ]),
};
