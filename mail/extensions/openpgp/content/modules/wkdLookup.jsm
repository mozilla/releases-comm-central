/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

/**
 *  Lookup keys by email addresses using WKD. A an email address is lookep up at most
 *  once a day. (see https://tools.ietf.org/html/draft-koch-openpgp-webkey-service)
 */

var EXPORTED_SYMBOLS = ["EnigmailWkdLookup"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  DNS: "resource:///modules/DNS.jsm",
  EnigmailData: "chrome://openpgp/content/modules/data.jsm",
  EnigmailKeyRing: "chrome://openpgp/content/modules/keyRing.jsm",
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  EnigmailSqliteDb: "chrome://openpgp/content/modules/sqliteDb.jsm",
  EnigmailZBase32: "chrome://openpgp/content/modules/zbase32.jsm",
});

Cu.importGlobalProperties(["fetch"]);

// Those domains are not expected to have WKD:
var BLACKLIST_DOMAINS = [
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

var EnigmailWkdLookup = {
  /**
   * Try to import keys using WKD. Found keys are automatically imported
   *
   * @param {Array of String} emailList: email addresses (in lowercase)
   *
   * @return {Promise<Boolean>}: true - new keys found
   */
  findKeys(emails) {
    return new Promise((resolve, reject) => {
      EnigmailLog.DEBUG("wkdLookup.jsm: findKeys(" + emails.join(",") + ")\n");

      if (emails.length === 0) {
        resolve(false);
        return;
      }

      let self = this;

      // do a little sanity test such that we don't do the lookup for nothing too often
      for (let e of emails) {
        if (e.search(/.@.+\...+$/) < 0) {
          resolve(false);
          return;
        }
      }

      Promise.all(
        emails.map(function(mailAddr) {
          return self.determineLastAttempt(mailAddr.trim().toLowerCase());
        })
      )
        .then(function(checks) {
          let toCheck = [];

          EnigmailLog.DEBUG(
            "wkdLookup.jsm: findKeys: checks " + checks.length + "\n"
          );

          for (let i = 0; i < checks.length; i++) {
            if (checks[i]) {
              EnigmailLog.DEBUG(
                "wkdLookup.jsm: findKeys: recheck " + emails[i] + "\n"
              );
              toCheck.push(emails[i]);
            } else {
              EnigmailLog.DEBUG(
                "wkdLookup.jsm: findKeys: skip check " + emails[i] + "\n"
              );
            }
          }

          if (toCheck.length > 0) {
            Promise.all(
              toCheck.map(email => {
                return self.downloadKey(email);
              })
            ).then(dataArr => {
              if (dataArr) {
                let gotKeys = [];
                for (let i = 0; i < dataArr.length; i++) {
                  if (dataArr[i] !== null) {
                    gotKeys.push(dataArr[i]);
                  }
                }

                if (gotKeys.length > 0) {
                  for (let k in gotKeys) {
                    if (gotKeys[k]) {
                      let isBinary =
                        gotKeys[k].keyData.search(
                          /^-----BEGIN PGP PUBLIC KEY BLOCK-----/
                        ) < 0;
                      EnigmailKeyRing.importKey(
                        null,
                        true,
                        gotKeys[k].keyData,
                        isBinary,
                        "",
                        {},
                        {},
                        false
                      );
                    }
                  }
                  resolve(true);
                } else {
                  resolve(false);
                }
              }
            });
          } else {
            resolve(false);
          }
        })
        .catch(() => {
          resolve(false);
        });
    });
  },

  /**
   * Determine for an email address when we last attempted to
   * obtain a key via wkd
   *
   * @param {String} email: email address
   *
   * @return {Promise<Boolean>}: true if new WKD lookup required
   */
  async determineLastAttempt(email) {
    EnigmailLog.DEBUG("wkdLookup.jsm: determineLastAttempt(" + email + ")\n");

    let conn;
    try {
      conn = await EnigmailSqliteDb.openDatabase();
      let val = await timeForRecheck(conn, email);
      conn.close();
      return val;
    } catch (x) {
      EnigmailLog.DEBUG(
        "wkdLookup.jsm: determineLastAttempt: could not open database\n"
      );
      if (conn) {
        EnigmailLog.DEBUG(
          "wkdLookup.jsm: error - closing connection: " + x + "\n"
        );
        conn.close();
      }
    }
    // in case something goes wrong we recheck anyway
    return true;
  },

  /**
   * get the download URL for an email address for WKD or domain-specific locations
   *
   * @param {String} email: email address
   *
   * @return {Promise<String>}: URL (or null if not possible)
   */

  async getDownloadUrlFromEmail(email, advancedMethod) {
    email = email.toLowerCase().trim();

    let url = await getSiteSpecificUrl(email);
    if (url) {
      return url;
    }

    let at = email.indexOf("@");

    let domain = email.substr(at + 1);
    let user = email.substr(0, at);

    var converter = Cc[
      "@mozilla.org/intl/scriptableunicodeconverter"
    ].createInstance(Ci.nsIScriptableUnicodeConverter);
    converter.charset = "UTF-8";
    var data = converter.convertToByteArray(user, {});

    var ch = Cc["@mozilla.org/security/hash;1"].createInstance(
      Ci.nsICryptoHash
    );
    ch.init(ch.SHA1);
    ch.update(data, data.length);
    let gotHash = ch.finish(false);
    let encodedHash = EnigmailZBase32.encode(gotHash);

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
   * @param {String} email: email address
   *
   * @return {Promise<String>}: Key data (or null if not possible)
   */
  async downloadKey(email) {
    EnigmailLog.DEBUG("wkdLookup.jsm: downloadKey(" + email + ")\n");

    if (!this.isWkdAvailable(email)) {
      EnigmailLog.DEBUG("wkdLookup.jsm: downloadKey: no WKD for the domain\n");
      return null;
    }

    let keyData = await this.doWkdKeyDownload(email, true);

    if (!keyData) {
      keyData = await this.doWkdKeyDownload(email, false);
    }

    return keyData;
  },

  async doWkdKeyDownload(email, advancedMethod) {
    EnigmailLog.DEBUG(
      `wkdLookup.jsm: doWkdKeyDownload(${email}, ${advancedMethod})\n`
    );

    let url = await EnigmailWkdLookup.getDownloadUrlFromEmail(
      email,
      advancedMethod
    );

    let padLen = (url.length % 512) + 1;
    let hdrs = new Headers({
      Authorization: "Basic " + btoa("no-user:"),
    });
    hdrs.append("Content-Type", "application/octet-stream");
    hdrs.append("X-Enigmail-Padding", "x".padEnd(padLen, "x"));

    let myRequest = new Request(url, {
      method: "GET",
      headers: hdrs,
      mode: "cors",
      //redirect: 'error',
      redirect: "follow",
      cache: "default",
    });

    let response;
    try {
      EnigmailLog.DEBUG(
        "wkdLookup.jsm: doWkdKeyDownload: requesting " + url + "\n"
      );
      response = await fetch(myRequest);
      if (!response.ok) {
        return null;
      }
    } catch (ex) {
      EnigmailLog.DEBUG(
        "wkdLookup.jsm: doWkdKeyDownload: error " + ex.toString() + "\n"
      );
      return null;
    }

    try {
      if (
        response.headers.has("content-type") &&
        response.headers.get("content-type").search(/^text\/html/i) === 0
      ) {
        // if we get HTML output, we return nothing (for example redirects to error catching pages)
        return null;
      }
      let keyData = EnigmailData.arrayBufferToString(
        Cu.cloneInto(await response.arrayBuffer(), this)
      );
      EnigmailLog.DEBUG(
        `wkdLookup.jsm: doWkdKeyDownload: got data for ${email}\n`
      );
      return {
        email,
        keyData,
      };
    } catch (ex) {
      EnigmailLog.DEBUG(
        "wkdLookup.jsm: doWkdKeyDownload: error " + ex.toString() + "\n"
      );
      return null;
    }
  },

  isWkdAvailable(email) {
    let domain = email.toLowerCase().replace(/^.*@/, "");

    return !BLACKLIST_DOMAINS.includes(domain);
  },
};

/**
 * Check if enough time has passed since we looked-up the key for "email".
 *
 * @param connection: Object - SQLite connection
 * @param email:      String - Email address to search (in lowercase)
 *
 * @return Promise (true if new lookup required)
 */
function timeForRecheck(connection, email) {
  EnigmailLog.DEBUG("wkdLookup.jsm: timeForRecheck\n");

  let obj = {
    email,
    now: Date.now(),
  };

  return connection
    .execute(
      "select count(*) from wkd_lookup_timestamp where email = :email and :now - last_seen < 60*60*24",
      obj
    )
    .then(function(val) {
      return connection
        .execute(
          "insert or replace into wkd_lookup_timestamp values (:email, :now)",
          obj
        )
        .then(function() {
          return Promise.resolve(val);
        });
    })
    .then(
      function(rows) {
        EnigmailLog.DEBUG(
          "wkdLookup.jsm: timeForRecheck: " + rows.length + "\n"
        );

        return rows.length === 1 && rows[0].getResultByIndex(0) === 0;
      },
      function(error) {
        EnigmailLog.DEBUG(
          "wkdLookup.jsm: timeForRecheck - error" + error + "\n"
        );
        Promise.reject(error);
      }
    );
}

/**
 * Get special URLs for specific sites that don't use WKD, but still provide
 * public keys of their users in
 *
 * @param {String}: emailAddr: email address in lowercase
 *
 * @return {Promise<String>}: URL or null of no URL relevant
 */
async function getSiteSpecificUrl(emailAddr) {
  let domain = emailAddr.replace(/^.+@/, "");
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
    let records = await DNS.mx(domain);
    const mxHosts = records.filter(record => record.host);
    console.debug(mxHosts);

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
