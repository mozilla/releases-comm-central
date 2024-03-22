/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

import { NntpUtils } from "resource:///modules/NntpUtils.sys.mjs";

/**
 * Download articles in all subscribed newsgroups for offline use.
 */
export class NewsDownloader {
  _logger = NntpUtils.logger;

  /**
   * @param {nsIMsgWindow} msgWindow - The associated msg window.
   * @param {nsIUrlListener} urlListener - Callback for the request.
   */
  constructor(msgWindow, urlListener) {
    this._msgWindow = msgWindow;
    this._urlListener = urlListener;

    this._bundle = Services.strings.createBundle(
      "chrome://messenger/locale/news.properties"
    );
  }

  /**
   * Actually start the download process.
   */
  async start() {
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
            await this._downloadFolder(folder);
          }
        }
      })
    );

    this._urlListener.OnStopRunningUrl(null, Cr.NS_OK);

    this._logger.debug("Finished downloading articles for offline use");
    this._msgWindow.statusFeedback.showStatusString("");
  }

  /**
   * Download articles in a newsgroup one by one.
   *
   * @param {nsIMsgFolder} folder - The newsgroup folder.
   */
  async _downloadFolder(folder) {
    this._logger.debug(`Start downloading ${folder.URI}`);

    folder.QueryInterface(Ci.nsIMsgNewsFolder).saveArticleOffline = true;
    const keysToDownload = await this._getKeysToDownload(folder);

    let i = 0;
    const total = keysToDownload.size;
    for (const key of keysToDownload) {
      await new Promise(resolve => {
        MailServices.nntp.fetchMessage(folder, key, this._msgWindow, null, {
          OnStartRunningUrl() {},
          OnStopRunningUrl() {
            resolve();
          },
        });
      });
      this._msgWindow.statusFeedback.showStatusString(
        this._bundle.formatStringFromName("downloadingArticlesForOffline", [
          ++i,
          total,
          folder.prettyName,
        ])
      );
    }

    folder.saveArticleOffline = false;
  }

  /**
   * Use a search session to find articles that match the download settings
   * and we don't already have.
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

    const keysToDownload = new Set();
    await new Promise(resolve => {
      searchSession.registerListener(
        {
          onSearchHit(hdr) {
            if (!(hdr.flags & Ci.nsMsgMessageFlags.Offline)) {
              // Only need to download articles we don't already have.
              keysToDownload.add(hdr.messageKey);
            }
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
