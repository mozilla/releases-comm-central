/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

import { NntpUtils } from "resource:///modules/NntpUtils.sys.mjs";

/**
 * Download articles in subscribed newsgroups for offline use.
 */
export class NewsDownloader {
  _logger = NntpUtils.logger;

  /**
   * @param {nsIMsgWindow} msgWindow - The associated msg window.
   * @param {nsIUrlListener} [urlListener=null] - Optional allback for the
   *   request.
   */
  constructor(msgWindow, urlListener) {
    this._msgWindow = msgWindow;
    this._urlListener = urlListener;

    this._bundle = Services.strings.createBundle(
      "chrome://messenger/locale/news.properties"
    );
    this._messengerBundle = Services.strings.createBundle(
      "chrome://messenger/locale/messenger.properties"
    );
  }

  /**
   * Download matching articles in all newsgroups that are set for offline use.
   */
  async downloadAllOfflineNewsgroups() {
    this._logger.debug("Start downloading articles for offline use");
    const servers = MailServices.accounts.allServers.filter(
      x => x.type == "nntp"
    );
    // Download all servers concurrently.
    await Promise.all(
      servers.map(async server => {
        const folders = server.rootFolder.descendants;
        for (const folder of folders) {
          if (folder.flags & Ci.nsMsgFolderFlags.Offline) {
            // Download newsgroups set for offline use in a server one by one.
            await this._downloadArticles(folder);
          }
        }
      })
    );

    this._urlListener?.OnStopRunningUrl(null, Cr.NS_OK);

    this._logger.debug("Finished downloading articles for offline use");
    this._msgWindow.statusFeedback.showStatusString("");
  }

  /**
   * Download all matching articles in a single newsgroup.
   *
   * @param {nsIMsgFolder} folder - The newsgroup folder.
   */
  async downloadFolder(folder) {
    this._logger.debug(
      "Start downloading articles for offline use in single folder."
    );

    await this._downloadArticles(folder);

    this._logger.debug(
      "Finished downloading articles for offline use in single folder."
    );
    this._msgWindow.statusFeedback.showStatusString("");
  }

  /**
   * Download specific articles in a single newsgroup.
   *
   * @param {nsIMsgFolder} folder - The newsgroup folder.
   * @param {nsMsgKey[]} keys - The keys of the messages to download.
   */
  async downloadMessages(folder, keys) {
    this._logger.debug("Start downloading specific articles for offline use");

    await this._downloadArticles(folder, keys);

    this._logger.debug(
      "Finished downloading specific articles for offline use"
    );
    this._msgWindow.statusFeedback.showStatusString("");
  }

  /**
   * Download articles in a newsgroup one by one.
   *
   * @param {nsIMsgFolder} folder - The newsgroup folder.
   * @param {nsMsgKey[]} [keys=null] - If set, the keys of the messages to
   *   download, otherwise all messages matching the download settings for
   *   the folder are retrieved.
   */
  async _downloadArticles(folder, keys = null) {
    this._logger.debug(`Start downloading ${folder.URI}`);

    folder.QueryInterface(Ci.nsIMsgNewsFolder).saveArticleOffline = true;

    keys ??= [...(await this._getKeysToDownload(folder))];
    let i = 0;
    for (const key of keys) {
      await new Promise(resolve => {
        MailServices.nntp.fetchMessage(folder, key, this._msgWindow, null, {
          OnStartRunningUrl() {},
          OnStopRunningUrl() {
            resolve();
          },
        });
      });
      this._msgWindow.statusFeedback.showStatusString(
        this._messengerBundle.formatStringFromName("statusMessage", [
          folder.server.prettyName,
          this._bundle.formatStringFromName("downloadingArticlesForOffline", [
            ++i,
            keys.length,
            folder.prettyName,
          ]),
        ])
      );
    }

    folder.saveArticleOffline = false;
    folder.refreshSizeOnDisk();

    this._logger.debug(`Finished downloading ${folder.URI}`);
  }

  /**
   * Use a search session to find messages that match the download settings,
   * excluding those already available offline or belonging to ignored
   * (sub-)threads.
   *
   * @param {nsIMsgFolder} folder - The newsgroup folder.
   * @returns {Set<number>}
   */
  async _getKeysToDownload(folder) {
    const searchSession = Cc[
      "@mozilla.org/messenger/searchSession;1"
    ].createInstance(Ci.nsIMsgSearchSession);
    const termValue = searchSession.createTerm().value;

    const downloadSettings = folder.downloadSettings;
    if (downloadSettings.downloadUnreadOnly) {
      termValue.attrib = Ci.nsMsgSearchAttrib.MsgStatus;
      termValue.status = Ci.nsMsgMessageFlags.Read;
      searchSession.addSearchTerm(
        Ci.nsMsgSearchAttrib.MsgStatus,
        Ci.nsMsgSearchOp.Isnt,
        termValue,
        true,
        null
      );
    }
    if (downloadSettings.downloadByDate) {
      termValue.attrib = Ci.nsMsgSearchAttrib.AgeInDays;
      termValue.age = downloadSettings.ageLimitOfMsgsToDownload;
      searchSession.addSearchTerm(
        Ci.nsMsgSearchAttrib.AgeInDays,
        Ci.nsMsgSearchOp.IsLessThan,
        termValue,
        true,
        null
      );
    }
    termValue.attrib = Ci.nsMsgSearchAttrib.MsgStatus;
    termValue.status = Ci.nsMsgMessageFlags.Offline;
    searchSession.addSearchTerm(
      Ci.nsMsgSearchAttrib.MsgStatus,
      Ci.nsMsgSearchOp.Isnt,
      termValue,
      true,
      null
    );

    if (folder.server.limitOfflineMessageSize && folder.server.maxMessageSize) {
      termValue.attrib = Ci.nsMsgSearchAttrib.Size;
      termValue.size = folder.server.maxMessageSize;
      searchSession.addSearchTerm(
        Ci.nsMsgSearchAttrib.Size,
        Ci.nsMsgSearchOp.IsLessThan,
        termValue,
        true,
        null
      );
    }

    const keysToDownload = new Set();
    const msgDatabase = folder.msgDatabase;
    await new Promise(resolve => {
      searchSession.registerListener(
        {
          onSearchHit(hdr) {
            if (
              hdr.flags & Ci.nsMsgMessageFlags.Offline ||
              hdr.isKilled ||
              msgDatabase.isIgnored(hdr.messageKey)
            ) {
              return;
            }
            keysToDownload.add(hdr.messageKey);
          },
          onSearchDone: () => {
            resolve();
          },
        },
        Ci.nsIMsgSearchSession.allNotifications
      );
      searchSession.addScopeTerm(Ci.nsMsgSearchScope.localNews, folder);
      searchSession.search(this._msgWindow);
    });

    return keysToDownload;
  }
}
