/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["NntpService"];

const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

/**
 * @implements {nsINntpService}
 */
class NntpService {
  QueryInterface = ChromeUtils.generateQI(["nsINntpService"]);

  get cacheStorage() {
    if (!this._cacheStorage) {
      this._cacheStorage = Services.cache2.memoryCacheStorage(
        Services.loadContextInfo.custom(false, {})
      );
    }
    return this._cacheStorage;
  }

  generateNewsHeaderValsForPosting(
    newsgroupsList,
    outNewsgroupsHeader,
    outNewsHostHeader
  ) {
    let groups = newsgroupsList.split(",");
    outNewsgroupsHeader.value = newsgroupsList;
    let hosts = groups.map(name => this._findHostFromGroupName(name));
    hosts = [...new Set(hosts)].filter(Boolean);
    let host = hosts[0];
    if (!host) {
      outNewsHostHeader.value = "";
      return;
    }
    if (hosts.length > 1) {
      throw Components.Exception(
        `Cross posting not allowed, hosts=${hosts.join(",")}`,
        Cr.NS_ERROR_ILLEGAL_VALUE
      );
    }
    outNewsHostHeader.value = host;
  }

  postMessage(messageFile, groupNames, accountKey, urlListener, msgWindow) {
    let server = MailServices.accounts.getAccount(accountKey)?.incomingServer;
    if (!server) {
      // If no matching server, find the first news server and use it.
      server = MailServices.accounts.findServer("", "", "nntp");
    }
    server = server.QueryInterface(Ci.nsINntpIncomingServer);

    server.wrappedJSObject.withClient(client => {
      client.startRunningUrl(urlListener, msgWindow);

      client.onOpen = () => {
        client.post();
      };

      client.onReadyToPost = () => {
        let fstream = Cc[
          "@mozilla.org/network/file-input-stream;1"
        ].createInstance(Ci.nsIFileInputStream);
        // PR_RDONLY
        fstream.init(messageFile, 0x01, 0, 0);
        let lineInputStream = fstream.QueryInterface(Ci.nsILineInputStream);
        let hasMore;
        do {
          let outLine = {};
          hasMore = lineInputStream.readLine(outLine);
          let line = outLine.value;
          if (line.startsWith(".")) {
            // Dot stuffing, see rfc3977#section-3.1.1.
            line = "." + line;
          }
          client.send(line + "\r\n");
        } while (hasMore);
        fstream.close();
        client.send(".\r\n");
      };
    });
  }

  getNewNews(server, uri, getOld, urlListener, msgWindow) {
    if (Services.io.offline) {
      const NS_MSG_ERROR_OFFLINE = 0x80550014;
      // @see nsMsgNewsFolder::UpdateFolder
      throw Components.Exception(
        "Cannot get news while offline",
        NS_MSG_ERROR_OFFLINE
      );
    }
    // The uri is in the form of news://news.mozilla.org/mozilla.accessibility
    let matches = /.+:\/\/([^:]+):?(\d+)?\/(.+)?/.exec(uri);
    let groupName = decodeURIComponent(matches[3]);

    let runningUri = Services.io
      .newURI(uri)
      .QueryInterface(Ci.nsIMsgMailNewsUrl);
    server.wrappedJSObject.withClient(client => {
      client.startRunningUrl(urlListener, msgWindow, runningUri);
      client.onOpen = () => {
        client.getNewNews(groupName, getOld);
      };
    });

    return runningUri;
  }

  getListOfGroupsOnServer(server, msgWindow, getOnlyNew) {
    server.wrappedJSObject.withClient(client => {
      client.startRunningUrl(null, msgWindow);
      client.onOpen = () => {
        client.getListOfGroups(getOnlyNew);
      };

      client.onData = data => {
        server.addNewsgroupToList(data.split(" ")[0]);
      };
    });
  }

  fetchMessage(folder, key, msgWindow, consumer, urlListener) {
    let streamListener, inputStream, outputStream;
    if (consumer instanceof Ci.nsIStreamListener) {
      streamListener = consumer;
      let pipe = Cc["@mozilla.org/pipe;1"].createInstance(Ci.nsIPipe);
      pipe.init(true, true, 0, 0);
      inputStream = pipe.inputStream;
      outputStream = pipe.outputStream;
    }

    let server = folder.server.QueryInterface(Ci.nsINntpIncomingServer);
    server.wrappedJSObject.withClient(client => {
      client.startRunningUrl(urlListener, msgWindow);

      client.onOpen = () => {
        client.getArticleByArticleNumber(folder.name, key);
        streamListener?.onStartRequest(null);
      };
      client.onData = data => {
        outputStream?.write(data, data.length);
        streamListener?.onDataAvailable(null, inputStream, 0, data.length);
      };
      client.onDone = () => {
        streamListener?.onStopRequest(null, Cr.NS_OK);
      };
    });
  }

  cancelMessage(cancelUrl, messageUri, consumer, urlListener, msgWindow) {
    if (Services.prefs.getBoolPref("news.cancel.confirm")) {
      let bundle = Services.strings.createBundle(
        "chrome://messenger/locale/news.properties"
      );
      let result = Services.prompt.confirmEx(
        msgWindow?.domWindow,
        null,
        bundle.GetStringFromName("cancelConfirm"),
        Ci.nsIPrompt.STD_YES_NO_BUTTONS,
        null,
        null,
        null,
        null,
        { value: false }
      );
      if (result != 0) {
        // Cancelled.
        return;
      }
    }
    // The cancelUrl is in the form of "news://host/message-id?cancel"
    let url = new URL(cancelUrl);
    let messageId = "<" + decodeURIComponent(url.pathname.slice(1)) + ">";
    let server = MailServices.accounts
      .findServer("", url.host, "nntp")
      .QueryInterface(Ci.nsINntpIncomingServer);
    let groupName = new URL(messageUri).pathname.slice(1);
    let messageKey = messageUri.split("#")[1];
    let newsFolder = server.findGroup(groupName);
    let from = MailServices.accounts.getFirstIdentityForServer(server).email;
    let bundle = Services.strings.createBundle(
      "chrome://branding/locale/brand.properties"
    );

    server.wrappedJSObject.withClient(client => {
      let runningUrl = client.startRunningUrl(urlListener, msgWindow);
      runningUrl.msgWindow = msgWindow;

      client.onOpen = () => {
        client.cancelArticle(groupName);
      };

      client.onReadyToPost = () => {
        let content = [
          `From: ${from}`,
          `Newsgroups: ${groupName}`,
          `Subject: cancel ${messageId}`,
          `References: ${messageId}`,
          `Control: cancel ${messageId}`,
          "MIME-Version: 1.0",
          "Content-Type: text/plain",
          "", // body separator
          `This message was cancelled from within ${bundle.GetStringFromName(
            "brandFullName"
          )}`,
        ];
        client.send(content.join("\r\n"));
        client.send("\r\n.\r\n");

        newsFolder.removeMessage(messageKey);
        newsFolder.cancelComplete();
      };
    });
  }

  downloadNewsgroupsForOffline(msgWindow, urlListener) {
    let { NewsDownloader } = ChromeUtils.importESModule(
      "resource:///modules/NewsDownloader.sys.mjs"
    );
    let downloader = new NewsDownloader(msgWindow, urlListener);
    downloader.start();
  }

  /**
   * Find the hostname of a NNTP server from a group name.
   *
   * @param {string} groupName - The group name.
   * @returns {string} The corresponding server host.
   */
  _findHostFromGroupName(groupName) {
    for (let server of MailServices.accounts.allServers) {
      if (
        server instanceof Ci.nsINntpIncomingServer &&
        server.containsNewsgroup(groupName)
      ) {
        return server.hostName;
      }
    }
    return "";
  }
}

NntpService.prototype.classID = Components.ID(
  "{b13db263-a219-4168-aeaf-8266f001087e}"
);
