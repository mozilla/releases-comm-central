/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tools for starting test servers. A number of common configurations are
 * defined for speedy test creation.
 */

import { IMAPServer } from "resource://testing-common/IMAPServer.sys.mjs";
import { NetworkTestUtils } from "resource://testing-common/mailnews/NetworkTestUtils.sys.mjs";
import { NNTPServer } from "resource://testing-common/NNTPServer.sys.mjs";
import { POP3Server } from "resource://testing-common/POP3Server.sys.mjs";
import { SMTPServer } from "resource://testing-common/SMTPServer.sys.mjs";

const serverConstructors = {
  imap: IMAPServer,
  nntp: NNTPServer,
  pop3: POP3Server,
  smtp: SMTPServer,
};

// Change this for more server debugging output. See Maild.sys.mjs for values.
const serverDebugLevel = 0;

/**
 * @typedef ServerDef
 * @property {"imap"|"pop3"|"smtp"} type - What type of server do we want?
 * @property {object} [baseOptions] - In a predefined server, the standard
 *   set of options to pass to the server's constructor.
 * @property {object} [options] - More options, which can override those of a
 *   predefined server.
 * @property {string} hostname - The main hostname for this server.
 * @property {integer} port - The main port for this server.
 * @property {[string[]|integer[]]} aliases - Extra hostnames and ports
 *   for this server. Each entry in this array is an array of [hostname, port].
 */

/**
 * Create and start a single server.
 *
 * @param {ServerDef} def - The server definition.
 * @returns {IMAPServer|POP3Server|SMTPServer}
 */
async function createServer({
  type,
  baseOptions = {},
  options = {},
  hostname,
  port,
  aliases = [],
}) {
  options = { ...baseOptions, ...options };
  if (options.tlsCertFile && !options.tlsCert) {
    options.tlsCert = await getCertificate(options.tlsCertFile);
  }

  const server = new serverConstructors[type](options);
  server.server.setDebugLevel(serverDebugLevel);
  NetworkTestUtils.configureProxy(hostname, port, server.port);
  for (const [aliasHostname, aliasPort] of aliases) {
    NetworkTestUtils.configureProxy(aliasHostname, aliasPort, server.port);
  }

  return server;
}

/**
 * Create and start multiple servers.
 *
 * @param {ServerDef[]} serverDefs - The server definitions.
 * @returns {IMAPServer[]|POP3Server[]|SMTPServer[]} - The created servers,
 *   in the same order as the definitions given.
 */
async function createServers(serverDefs) {
  const servers = [];
  for (const serverDef of serverDefs) {
    servers.push(await createServer(serverDef));
  }
  return servers;
}

const certCache = new Map();

/**
 * Load a certificate and key into the certificate database, and return the
 * certificate.
 *
 * @param {string} name - The name of the files to load. There must be a
 *   corresponding `name.cert` and `name.key` file.
 * @returns {nsIX509Cert}
 */
async function getCertificate(name) {
  // Already seen this certificate? Just return it.
  if (certCache.has(name)) {
    return certCache.get(name);
  }

  const certDB = Cc["@mozilla.org/security/x509certdb;1"].getService(
    Ci.nsIX509CertDB
  );

  if (name != "selfsigned") {
    // Import `name.key`. We have to use the key file as an nsIFile, so get its
    // resource URL and resolve that to a file.
    const keyPath = Services.io
      .getProtocolHandler("resource")
      .QueryInterface(Ci.nsISubstitutingProtocolHandler)
      .resolveURI(
        Services.io.newURI(
          `resource://testing-common/mailnews/certs/${name}.key`
        )
      );
    certDB.importPKCS12File(
      Services.io.newURI(keyPath).QueryInterface(Ci.nsIFileURL).file,
      ""
    );
  }

  // Import `name.cert`. For this we can just fetch the contents.
  const response = await fetch(
    `resource://testing-common/mailnews/certs/${name}.cert`
  );
  let certText = await response.text();
  certText = certText.replace("-----BEGIN CERTIFICATE-----", "");
  certText = certText.replace("-----END CERTIFICATE-----", "");
  certText = certText.replaceAll(/\s/g, "");
  const cert = certDB.addCertFromBase64(
    certText,
    name == "selfsigned" ? ",," : "CT,,"
  );
  certCache.set(name, cert);

  return cert;
}

const serverDefs = {
  imap: {
    plain: {
      type: "imap",
      baseOptions: { extensions: ["RFC2195"] },
      hostname: "test.test",
      port: 143,
    },
    startTLS: {
      type: "imap",
      baseOptions: { extensions: ["RFC2195"], offerStartTLS: true },
      hostname: "starttls.test.test",
      port: 143,
    },
    tls: {
      type: "imap",
      baseOptions: { extensions: ["RFC2195"], tlsCertFile: "valid" },
      hostname: "test.test",
      port: 993,
      aliases: [["mitm.test.test", 993]],
    },
    expiredTLS: {
      type: "imap",
      baseOptions: { extensions: ["RFC2195"], tlsCertFile: "expired" },
      hostname: "expired.test.test",
      port: 993,
    },
    notYetValidTLS: {
      type: "imap",
      baseOptions: { extensions: ["RFC2195"], tlsCertFile: "notyetvalid" },
      hostname: "notyetvalid.test.test",
      port: 993,
    },
    selfSignedTLS: {
      type: "imap",
      baseOptions: { extensions: ["RFC2195"], tlsCertFile: "selfsigned" },
      hostname: "selfsigned.test.test",
      port: 993,
    },
    oAuth: {
      type: "imap",
      baseOptions: { extensions: ["OAUTH2"], password: "access_token" },
      hostname: "test.test",
      port: 143,
    },
  },
  pop3: {
    plain: {
      type: "pop3",
      baseOptions: { username: "user", password: "password" },
      hostname: "test.test",
      port: 110,
    },
    startTLS: {
      type: "pop3",
      baseOptions: {
        username: "user",
        password: "password",
        offerStartTLS: true,
      },
      hostname: "starttls.test.test",
      port: 110,
    },
    tls: {
      type: "pop3",
      baseOptions: {
        username: "user",
        password: "password",
        tlsCertFile: "valid",
      },
      hostname: "test.test",
      port: 995,
      aliases: [["mitm.test.test", 995]],
    },
    expiredTLS: {
      type: "pop3",
      baseOptions: {
        username: "user",
        password: "password",
        tlsCertFile: "expired",
      },
      hostname: "expired.test.test",
      port: 995,
    },
    notYetValidTLS: {
      type: "pop3",
      baseOptions: {
        username: "user",
        password: "password",
        tlsCertFile: "notyetvalid",
      },
      hostname: "notyetvalid.test.test",
      port: 995,
    },
    selfSignedTLS: {
      type: "pop3",
      baseOptions: {
        username: "user",
        password: "password",
        tlsCertFile: "selfsigned",
      },
      hostname: "selfsigned.test.test",
      port: 995,
    },
    oAuth: {
      type: "pop3",
      baseOptions: {
        handler: ["OAUTH2"],
        username: "user",
        password: "access_token",
      },
      hostname: "test.test",
      port: 110,
    },
  },
  smtp: {
    plain: {
      type: "smtp",
      baseOptions: { username: "user", password: "password" },
      hostname: "test.test",
      port: 587,
    },
    startTLS: {
      type: "smtp",
      baseOptions: { offerStartTLS: true },
      hostname: "starttls.test.test",
      port: 587,
    },
    tls: {
      type: "smtp",
      baseOptions: {
        username: "user",
        password: "password",
        tlsCertFile: "valid",
      },
      hostname: "test.test",
      port: 465,
      aliases: [["mitm.test.test", 465]],
    },
    expiredTLS: {
      type: "smtp",
      baseOptions: {
        username: "user",
        password: "password",
        tlsCertFile: "expired",
      },
      hostname: "expired.test.test",
      port: 465,
    },
    notYetValidTLS: {
      type: "smtp",
      baseOptions: {
        username: "user",
        password: "password",
        tlsCertFile: "notyetvalid",
      },
      hostname: "notyetvalid.test.test",
      port: 465,
    },
    selfSignedTLS: {
      type: "smtp",
      baseOptions: {
        username: "user",
        password: "password",
        tlsCertFile: "selfsigned",
      },
      hostname: "selfsigned.test.test",
      port: 465,
    },
    oAuth: {
      type: "smtp",
      baseOptions: {
        handler: ["OAUTH2"],
        username: "user",
        password: "access_token",
      },
      hostname: "test.test",
      port: 587,
    },
  },
  nntp: {
    plain: {
      type: "nntp",
      hostname: "test.test",
      port: 119,
    },
    expiredTLS: {
      type: "nntp",
      baseOptions: { tlsCertFile: "expired" },
      hostname: "expired.test.test",
      port: 563,
    },
  },
};

export const ServerTestUtils = {
  createServer,
  createServers,
  getCertificate,
  serverDefs,
};
