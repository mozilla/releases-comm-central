/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Downloads messages through a fake POP3 server into the local folders:
 *
 *   const pump = new POP3Pump();
 *   pump.files = ["../../../data/bugmail1"];
 *   await pump.run();
 */

import { Assert } from "resource://testing-common/Assert.sys.mjs";
import { MailServices } from "resource:///modules/MailServices.sys.mjs";
import { localAccountUtils } from "resource://testing-common/mailnews/LocalAccountUtils.sys.mjs";
import { nsMailServer } from "resource://testing-common/mailnews/Maild.sys.mjs";
import {
  Pop3Daemon,
  POP3_RFC1939_handler,
} from "resource://testing-common/mailnews/Pop3d.sys.mjs";
import { setTimeout } from "resource://gre/modules/Timer.sys.mjs";

/**
 * The port the incoming server is created with. It is replaced by the fake
 * server's real port when the pump runs.
 */
const INITIAL_PORT = 1024 + 110;

export class POP3Pump {
  /**
   * The POP3 incoming server messages are downloaded from.
   *
   * @type {nsIMsgIncomingServer}
   */
  fakeServer = null;

  /**
   * The message files to download, relative to the test file.
   *
   * @type {string[]}
   */
  files = [];

  #storeContractID = Services.prefs.getCharPref(
    "mail.serverDefaultStoreContractID"
  );

  /**
   * Create the POP3 incoming server, and the local folders if needed.
   */
  constructor() {
    this.fakeServer = this.#createIncomingServer();
  }

  #createIncomingServer() {
    if (!localAccountUtils.inboxFolder) {
      localAccountUtils.loadLocalMailAccount();
    }
    return localAccountUtils.create_incoming_server(
      "pop3",
      INITIAL_PORT,
      "fred",
      "wilma"
    );
  }

  /**
   * Recreate the incoming server, and by default the local folders, using a
   * different message store.
   *
   * If the provided contract ID is the one for the message store that's
   * currently being used, this does nothing and the existing account and
   * local folders are left unchanged.
   *
   * @param {string} storeContractID - The message store contract ID.
   * @param {object} [options]
   * @param {boolean} [options.keepLocalFolders=false] - Whether to keep the
   *   existing local folders, so only the POP3 server uses the new store.
   */
  resetPluggableStore(storeContractID, { keepLocalFolders = false } = {}) {
    if (storeContractID == this.#storeContractID) {
      return;
    }

    Services.prefs.setCharPref(
      "mail.serverDefaultStoreContractID",
      storeContractID
    );

    if (this.fakeServer?.valid) {
      this.fakeServer.closeCachedConnections();
      MailServices.accounts.removeIncomingServer(this.fakeServer, false);
    }
    if (!keepLocalFolders) {
      localAccountUtils.clearAll();
    }

    this.fakeServer = this.#createIncomingServer();
    this.#storeContractID = storeContractID;
  }

  /**
   * Download `files` into the inbox of the incoming server.
   *
   * @param {nsresult} [expectedResult=Cr.NS_OK] - The result the download
   *   should finish with.
   * @returns {Promise<nsresult>} The result the download finished with,
   *   resolved once the fake server has shut down.
   */
  async run(expectedResult = Cr.NS_OK) {
    // Disable new mail notifications
    Services.prefs.setBoolPref("mail.biff.play_sound", false);
    Services.prefs.setBoolPref("mail.biff.show_alert", false);
    Services.prefs.setBoolPref("mail.biff.show_tray_icon", false);
    Services.prefs.setBoolPref("mail.biff.animate_dock_icon", false);

    const daemon = new Pop3Daemon();
    const server = new nsMailServer(d => new POP3_RFC1939_handler(d), daemon);

    const { promise, resolve } = Promise.withResolvers();
    const urlListener = {
      OnStartRunningUrl() {},
      OnStopRunningUrl(url, result) {
        resolve(result);
      },
    };

    try {
      server.start();
      this.fakeServer.port = server.port;
      daemon.setMessages(this.files);

      // Get the inbox here, in case the server got undeferred.
      const inbox = this.fakeServer.rootMsgFolder.getFolderWithFlags(
        Ci.nsMsgFolderFlags.Inbox
      );
      MailServices.pop3.GetNewMail(false, urlListener, inbox, this.fakeServer);
      server.performTest();

      const result = await promise;
      Assert.equal(
        result,
        expectedResult,
        "Downloading the POP3 messages should finish with the expected result"
      );
      return result;
    } finally {
      this.fakeServer.closeCachedConnections();
      await server.stop();
      while (Services.tm.currentThread.hasPendingEvents()) {
        await new Promise(r => setTimeout(r, 20));
      }
    }
  }
}
