/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["NntpService"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  Services: "resource://gre/modules/Services.jsm",
  MailServices: "resource:///modules/MailServices.jsm",
  NntpClient: "resource:///modules/NntpClient.jsm",
});

/**
 * Set the mailnews.nntp.jsmodule pref to true to use this module.
 *
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
    hosts = [...new Set(hosts)];
    let host = hosts[0];
    if (!host) {
      throw Components.Exception("Host not found", Cr.NS_ERROR_ILLEGAL_VALUE);
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
      server = MailServices.accounts.FindServer("", "", "nntp");
    }
    server = server.QueryInterface(Ci.nsINntpIncomingServer);
    let uri = `news://${server.hostName}/`;
    let client = new NntpClient(server);
    client.connect();

    let runningUrl = Services.io.newURI(uri);

    client.onOpen = () => {
      client.post();
      urlListener?.OnStartRunningUrl(runningUrl, Cr.NS_OK);
    };

    client.onReadyToPost = () => {
      let fstream = Cc[
        "@mozilla.org/network/file-input-stream;1"
      ].createInstance(Ci.nsIFileInputStream);
      // PR_RDONLY
      fstream.init(messageFile, 0x01, 0, 0);
      let sstream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
        Ci.nsIScriptableInputStream
      );
      sstream.init(fstream);

      while (sstream.available()) {
        let chunk = sstream.read(65536);
        client.send(chunk);
      }
      sstream.close();
      fstream.close();
      client.sendEnd();
    };

    client.onDone = () => {
      urlListener?.OnStopRunningUrl(runningUrl, Cr.NS_OK);
    };
  }

  getNewNews(server, uri, getOld, urlListener, msgWindow) {
    let client = new NntpClient(server, uri);
    client.connect();

    client.onOpen = () => {
      client.getNewNews(getOld, urlListener, msgWindow);
    };
    return client.runningUri;
  }

  getListOfGroupsOnServer(server, msgWindow, getOnlyNew) {
    let client = new NntpClient(server);
    client.connect();

    client.onOpen = () => {
      client.getListOfGroups();
    };

    let leftoverData;
    client.onData = data => {
      if (leftoverData) {
        data = leftoverData + data;
        leftoverData = null;
      }
      while (data) {
        let index = data.indexOf("\r\n");
        if (index == -1) {
          // Not enough data, save it for the next round.
          leftoverData = data;
          break;
        }
        server.addNewsgroupToList(data.slice(0, index).split(" ")[0]);
        data = data.slice(index + 2);
      }
    };
  }

  /**
   * Find the hostname of a NNTP server from a group name.
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
