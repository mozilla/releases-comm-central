/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { nsMailServer } = ChromeUtils.import(
  "resource://testing-common/mailnews/Maild.jsm"
);
const { NewsArticle, NNTP_RFC977_handler, NntpDaemon } = ChromeUtils.import(
  "resource://testing-common/mailnews/Nntpd.jsm"
);

/**
 * A simple IMAP server for testing purposes.
 */
export class NNTPServer {
  constructor(testScope) {
    this.testScope = testScope;
    this.open();
  }

  open() {
    this.daemon = new NntpDaemon();
    this.server = new nsMailServer(
      daemon => new NNTP_RFC977_handler(daemon),
      this.daemon
    );
    this.server.start();

    this.testScope.registerCleanupFunction(() => this.close());
  }

  close() {
    this.server.stop();
  }

  get port() {
    return this.server.port;
  }

  /**
   * @param {string} group
   */
  addGroup(group) {
    this.daemon.addGroup(group);
  }

  /**
   * @param {string} group
   * @param {SyntheticMessage[]} messages
   */
  addMessages(group, messages) {
    messages.forEach(message => {
      const article = new NewsArticle(message.toMessageString());
      article.groups = [group];
      this.daemon.addArticle(article);
    });
  }
}
