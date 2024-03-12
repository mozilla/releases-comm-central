/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

/**
 * @implements {nsINntpService}
 */
export class NntpService {
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
    const groups = newsgroupsList.split(",");
    outNewsgroupsHeader.value = newsgroupsList;
    let hosts = groups.map(name => this._findHostFromGroupName(name));
    hosts = [...new Set(hosts)].filter(Boolean);
    const host = hosts[0];
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
        const fstream = Cc[
          "@mozilla.org/network/file-input-stream;1"
        ].createInstance(Ci.nsIFileInputStream);
        // PR_RDONLY
        fstream.init(messageFile, 0x01, 0, 0);
        const lineInputStream = fstream.QueryInterface(Ci.nsILineInputStream);
        let hasMore;
        do {
          const outLine = {};
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
    const matches = /.+:\/\/([^:]+):?(\d+)?\/(.+)?/.exec(uri);
    const groupName = decodeURIComponent(matches[3]);

    const runningUri = Services.io
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
      const pipe = Cc["@mozilla.org/pipe;1"].createInstance(Ci.nsIPipe);
      pipe.init(true, true, 0, 0);
      inputStream = pipe.inputStream;
      outputStream = pipe.outputStream;
    }

    const server = folder.server.QueryInterface(Ci.nsINntpIncomingServer);
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
      const bundle = Services.strings.createBundle(
        "chrome://messenger/locale/news.properties"
      );
      const result = Services.prompt.confirmEx(
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
    const url = new URL(cancelUrl);
    const messageId = "<" + decodeURIComponent(url.pathname.slice(1)) + ">";
    const server = MailServices.accounts
      .findServer("", url.host, "nntp")
      .QueryInterface(Ci.nsINntpIncomingServer);
    const groupName = new URL(messageUri).pathname.slice(1);
    const messageKey = messageUri.split("#")[1];
    const newsFolder = server.findGroup(groupName);
    const from = MailServices.accounts.getFirstIdentityForServer(server).email;
    const bundle = Services.strings.createBundle(
      "chrome://branding/locale/brand.properties"
    );

    server.wrappedJSObject.withClient(client => {
      const runningUrl = client.startRunningUrl(urlListener, msgWindow);
      runningUrl.msgWindow = msgWindow;

      client.onOpen = () => {
        client.cancelArticle(groupName);
      };

      client.onReadyToPost = () => {
        const content = [
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
    const { NewsDownloader } = ChromeUtils.importESModule(
      "resource:///modules/NewsDownloader.sys.mjs"
    );
    const downloader = new NewsDownloader(msgWindow, urlListener);
    downloader.start();
  }

  /**
   * Find the hostname of a NNTP server from a group name.
   *
   * @param {string} groupName - The group name.
   * @returns {string} The corresponding server host.
   */
  _findHostFromGroupName(groupName) {
    for (const server of MailServices.accounts.allServers) {
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
