/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Lookup keys by email addresses using WKD. A an email address is lookep up at most
 * once a day. (see https://tools.ietf.org/html/draft-koch-openpgp-webkey-service)
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  DNS: "resource:///modules/DNS.sys.mjs",
  EnigmailLog: "chrome://openpgp/content/modules/log.sys.mjs",
  EnigmailZBase32: "chrome://openpgp/content/modules/zbase32.sys.mjs",
  MailStringUtils: "resource:///modules/MailStringUtils.sys.mjs",
});

// Those domains are not expected to have WKD:
var EXCLUDE_DOMAINS = [
  /* Default domains included */
  "aol.com",
  "att.net",
  "comcast.net",
  "facebook.com",
  "gmail.com",
  "gmx.com",
  "googlemail.com",
  "google.com",
  "hotmail.com",
  "hotmail.co.uk",
  "mac.com",
  "me.com",
  "mail.com",
  "msn.com",
  "live.com",
  "sbcglobal.net",
  "verizon.net",
  "yahoo.com",
  "yahoo.co.uk",

  /* Other global domains */
  "email.com",
  "games.com" /* AOL */,
  "gmx.net",
  "icloud.com",
  "iname.com",
  "inbox.com",
  "lavabit.com",
  "love.com" /* AOL */,
  "outlook.com",
  "pobox.com",
  "tutanota.de",
  "tutanota.com",
  "tutamail.com",
  "tuta.io",
  "keemail.me",
  "rocketmail.com" /* Yahoo */,
  "safe-mail.net",
  "wow.com" /* AOL */,
  "ygm.com" /* AOL */,
  "ymail.com" /* Yahoo */,
  "zoho.com",
  "yandex.com",

  /* United States ISP domains */
  "bellsouth.net",
  "charter.net",
  "cox.net",
  "earthlink.net",
  "juno.com",

  /* British ISP domains */
  "btinternet.com",
  "virginmedia.com",
  "blueyonder.co.uk",
  "freeserve.co.uk",
  "live.co.uk",
  "ntlworld.com",
  "o2.co.uk",
  "orange.net",
  "sky.com",
  "talktalk.co.uk",
  "tiscali.co.uk",
  "virgin.net",
  "wanadoo.co.uk",
  "bt.com",

  /* Domains used in Asia */
  "sina.com",
  "sina.cn",
  "qq.com",
  "naver.com",
  "hanmail.net",
  "daum.net",
  "nate.com",
  "yahoo.co.jp",
  "yahoo.co.kr",
  "yahoo.co.id",
  "yahoo.co.in",
  "yahoo.com.sg",
  "yahoo.com.ph",
  "163.com",
  "yeah.net",
  "126.com",
  "21cn.com",
  "aliyun.com",
  "foxmail.com",

  /* French ISP domains */
  "hotmail.fr",
  "live.fr",
  "laposte.net",
  "yahoo.fr",
  "wanadoo.fr",
  "orange.fr",
  "gmx.fr",
  "sfr.fr",
  "neuf.fr",
  "free.fr",

  /* German ISP domains */
  "gmx.de",
  "hotmail.de",
  "live.de",
  "online.de",
  "t-online.de" /* T-Mobile */,
  "web.de",
  "yahoo.de",

  /* Italian ISP domains */
  "libero.it",
  "virgilio.it",
  "hotmail.it",
  "aol.it",
  "tiscali.it",
  "alice.it",
  "live.it",
  "yahoo.it",
  "email.it",
  "tin.it",
  "poste.it",
  "teletu.it",

  /* Russian ISP domains */
  "mail.ru",
  "rambler.ru",
  "yandex.ru",
  "ya.ru",
  "list.ru",

  /* Belgian ISP domains */
  "hotmail.be",
  "live.be",
  "skynet.be",
  "voo.be",
  "tvcablenet.be",
  "telenet.be",

  /* Argentinian ISP domains */
  "hotmail.com.ar",
  "live.com.ar",
  "yahoo.com.ar",
  "fibertel.com.ar",
  "speedy.com.ar",
  "arnet.com.ar",

  /* Domains used in Mexico */
  "yahoo.com.mx",
  "live.com.mx",
  "hotmail.es",
  "hotmail.com.mx",
  "prodigy.net.mx",

  /* Domains used in Canada */
  "yahoo.ca",
  "hotmail.ca",
  "bell.net",
  "shaw.ca",
  "sympatico.ca",
  "rogers.com",

  /* Domains used in Brazil */
  "yahoo.com.br",
  "hotmail.com.br",
  "outlook.com.br",
  "uol.com.br",
  "bol.com.br",
  "terra.com.br",
  "ig.com.br",
  "itelefonica.com.br",
  "r7.com",
  "zipmail.com.br",
  "globo.com",
  "globomail.com",
  "oi.com.br",
];

export var EnigmailWkdLookup = {
  /**
   * Get the download URL for an email address for WKD or domain-specific
   * locations.
   *
   * @param {string} email - The mail address to check.
   * @param {boolean} advancedMethod - When
   *   - true, use https://openpgpkey.<domain>...
   *   - false use https://<domain>/.well-known/...
   * @returns {Promise<string>} a URL (or null if not possible)
   */
  async getDownloadUrlFromEmail(email, advancedMethod) {
    email = email.toLowerCase().trim();

    let url = await getSiteSpecificUrl(email);
    if (url) {
      return url;
    }

    const at = email.indexOf("@");

    const domain = email.substr(at + 1);
    const user = email.substr(0, at);

    const data = [...new TextEncoder().encode(user)];
    const ch = Cc["@mozilla.org/security/hash;1"].createInstance(
      Ci.nsICryptoHash
    );
    ch.init(ch.SHA1);
    ch.update(data, data.length);
    const gotHash = ch.finish(false);
    const encodedHash = lazy.EnigmailZBase32.encode(gotHash);

    if (advancedMethod) {
      url =
        "https://openpgpkey." +
        domain +
        "/.well-known/openpgpkey/" +
        domain +
        "/hu/" +
        encodedHash +
        "?l=" +
        escape(user);
    } else {
      url =
        "https://" +
        domain +
        "/.well-known/openpgpkey/hu/" +
        encodedHash +
        "?l=" +
        escape(user);
    }

    return url;
  },

  /**
   * Download a key for an email address
   *
   * @param {string} url - URL from getDownloadUrlFromEmail()
   * @returns {Promise<string>} key data (or null if not possible)
   */
  async downloadKey(url) {
    let response;
    try {
      lazy.EnigmailLog.DEBUG(
        "wkdLookup.jsm: downloadKey: requesting " + url + "\n"
      );
      response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/octet-stream",
          Authorization: "Basic " + btoa("no-user:"),
          // Add padding as packet size allows adversaries to guess which key
          // is requested by the client, despite using TLS.
          "X-OpenPGP-Padding": "x".padEnd((url.length % 512) + 1, "x"),
        },
        mode: "cors",
        redirect: "follow",
        cache: "default",
      });
      if (
        !response.ok ||
        /^text\/html/i.test(response.headers.get("content-type"))
      ) {
        return null;
      }
    } catch (ex) {
      lazy.EnigmailLog.DEBUG(
        "wkdLookup.jsm: downloadKey: error " + ex.toString() + "\n"
      );
      return null;
    }
    const uint8Array = new Uint8Array(await response.arrayBuffer());
    return lazy.MailStringUtils.uint8ArrayToByteString(uint8Array);
  },

  isWkdAvailable(email) {
    const domain = email.toLowerCase().replace(/^.*@/, "");

    return !EXCLUDE_DOMAINS.includes(domain);
  },
};

/**
 * Get special URLs for specific sites that don't use WKD, but still provide
 * public keys of their users in
 *
 * @param {string} emailAddr - Email address in lowercase.
 * @returns {Promise<string>} - URL or null of no URL relevant.
 */
async function getSiteSpecificUrl(emailAddr) {
  const domain = emailAddr.replace(/^.+@/, "");
  let url = null;

  switch (domain) {
    case "protonmail.ch":
    case "protonmail.com":
    case "pm.me":
      url =
        "https://api.protonmail.ch/pks/lookup?op=get&options=mr&search=" +
        escape(emailAddr);
      break;
  }
  if (!url) {
    const records = await lazy.DNS.mx(domain);
    const mxHosts = records.filter(record => record.host);

    if (
      mxHosts &&
      (mxHosts.includes("mail.protonmail.ch") ||
        mxHosts.includes("mailsec.protonmail.ch"))
    ) {
      url =
        "https://api.protonmail.ch/pks/lookup?op=get&options=mr&search=" +
        escape(emailAddr);
    }
  }
  return url;
}
