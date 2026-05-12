/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const logger = console.createInstance({
  prefix: "thundermail.setup",
  maxLogLevel: "Warn",
  maxLogLevelPref: "mail.setup.loglevel",
});

/**
 * Services for handling net.thunderbird://thundermail/ URLs.
 */
export class ThundermailURLHandler {
  QueryInterface = ChromeUtils.generateQI(["nsIObserver"]);

  observe(subject, topic, data) {
    if (topic != "net-thunderbird-url") {
      return;
    }

    const url = URL.parse(data);
    if (url?.pathname == "/add") {
      this.#add(url);
    }
  }

  /**
   * @param {URL} url
   */
  async #add(url) {
    const searchParams = url.searchParams;
    const realName = searchParams.get("name");
    const email = searchParams.get("email");
    const token = searchParams.get("token");

    if (!realName || !email || !token) {
      logger.error(`Thundermail URL with invalid arguments: ${url}`);
      return;
    }

    // Open the account hub in the mail window.
    const win = Services.wm.getMostRecentWindow("mail:3pane");
    await win.openAccountHub("MAIL");
    win.focus();

    const hub = win.document.querySelector("account-hub-container");
    const emailView = hub.shadowRoot.querySelector("account-hub-email");
    await emailView.setUpThundermailFromURL(realName, email, token);
  }
}
