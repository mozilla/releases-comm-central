/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const certOverrideService = Cc[
  "@mozilla.org/security/certoverride;1"
].getService(Ci.nsICertOverrideService);
const nssErrorsService = Cc["@mozilla.org/nss_errors_service;1"].getService(
  Ci.nsINSSErrorsService
);
const proxyService = Cc[
  "@mozilla.org/network/protocol-proxy-service;1"
].getService(Ci.nsIProtocolProxyService);
const transportService = Cc[
  "@mozilla.org/network/socket-transport-service;1"
].getService(Ci.nsISocketTransportService);

const ScriptableInputStream = Components.Constructor(
  "@mozilla.org/scriptableinputstream;1",
  Ci.nsIScriptableInputStream,
  "init"
);
const InputStreamPump = Components.Constructor(
  "@mozilla.org/network/input-stream-pump;1",
  Ci.nsIInputStreamPump,
  "init"
);

const log = console.createInstance({
  prefix: "certificate check",
  maxLogLevel: "Warn",
  maxLogLevelPref: "mail.certificate-check.loglevel",
});

/**
 * Commands to send to an IMAP server when connecting to it.
 */
const imapCommands = ["1 CAPABILITY\r\n", "2 LOGOUT\r\n"];
const imapStartTLSCommands = ["1 CAPABILITY\r\n", "2 STARTTLS\r\n"];

/**
 * Commands to send to a POP3 server when connecting to it.
 */
const pop3Commands = ["CAPA\r\n", "QUIT\r\n"];
const pop3StartTLSCommands = ["CAPA\r\n", "STLS\r\n"];

/**
 * Commands to send to a SMTP server when connecting to it.
 */
const smtpCommands = ["EHLO we-guess.mozilla.org\r\n", "QUIT\r\n"];
const smtpStartTLSCommands = ["EHLO we-guess.mozilla.org\r\n", "STARTTLS\r\n"];

class CertificateCheck extends HTMLElement {
  /** @type {HTMLSpanElement} */
  statusLabel;
  /** @type {HTMLButtonElement} */
  fetchButton;
  /** @type {HTMLButtonElement} */
  viewButton;
  /** @type {HTMLButtonElement} */
  addExceptionButton;
  /** @type {HTMLButtonElement} */
  removeExceptionButton;

  /** @type {string} */
  hostname;
  /** @type {number} */
  port;
  /** @type {"imap"|"pop3"|"smtp"} */
  type;
  /** @type {boolean} */
  isStartTLS;

  /** @type {boolean} */
  #hasException;
  /** @type {nsITransportSecurityInfo} */
  #securityInfo;
  /** @type {nsIX509Certificate} */
  #certificate;

  connectedCallback() {
    const image = this.appendChild(document.createElement("img"));
    image.role = "none";
    this.statusLabel = this.appendChild(document.createElement("span"));

    const bottomRow = this.appendChild(document.createElement("div"));
    this.fetchButton = bottomRow.appendChild(document.createElement("button"));
    this.fetchButton.classList.add("text-link");
    document.l10n.setAttributes(
      this.fetchButton,
      "certificate-check-fetch-button"
    );
    this.fetchButton.onclick = () => this.#fetchCertificate();

    this.viewButton = bottomRow.appendChild(document.createElement("button"));
    this.viewButton.classList.add("text-link");
    document.l10n.setAttributes(
      this.viewButton,
      "certificate-check-view-button"
    );
    this.viewButton.onclick = () => this.#viewCertificate();

    this.addExceptionButton = bottomRow.appendChild(
      document.createElement("button")
    );
    this.addExceptionButton.classList.add("text-link");
    document.l10n.setAttributes(
      this.addExceptionButton,
      "certificate-check-add-exception-button"
    );
    this.addExceptionButton.onclick = () => this.#addException();

    this.removeExceptionButton = bottomRow.appendChild(
      document.createElement("button")
    );
    this.removeExceptionButton.classList.add("text-link");
    document.l10n.setAttributes(
      this.removeExceptionButton,
      "certificate-check-remove-exception-button"
    );
    this.removeExceptionButton.onclick = () => this.#removeException();
  }

  /**
   * Reset any existing state and set up for a new server.
   *
   * @param {string} hostname
   * @param {number} port
   * @param {"imap"|"pop3"|"smtp"} type
   */
  init(hostname, port, type, isStartTLS) {
    this.hostname = hostname;
    this.port = port;
    this.type = type;
    this.isStartTLS = isStartTLS;

    this.fetchButton.hidden = false;
    this.viewButton.hidden = true;
    this.addExceptionButton.hidden = true;
    this.removeExceptionButton.hidden = true;

    this.#certificate = null;
    this.#hasException = false;
    for (const override of certOverrideService.getOverrides()) {
      if (override.hostPort == `${hostname}:${port}`) {
        document.l10n.setAttributes(
          this.statusLabel,
          "certificate-check-exception-exists",
          { hostname: `${this.hostname}:${this.port}` }
        );
        this.removeExceptionButton.hidden = false;
        this.setAttribute("status", "cert-error");
        this.#hasException = true;
        return;
      }
    }

    this.removeAttribute("status");
  }

  /**
   * Attempt to connect to the server, collecting the transport security info
   * and passing it to `#handleSecurityInfo`.
   */
  async #fetchCertificate() {
    document.l10n.setAttributes(
      this.statusLabel,
      "certificate-check-fetching",
      {
        hostname: `${this.hostname}:${this.port}`,
      }
    );
    this.setAttribute("status", "fetching");
    this.fetchButton.hidden = true;

    let commands;
    let postUpgradeCommands;
    switch (this.type) {
      case "imap":
        if (this.isStartTLS) {
          commands = imapStartTLSCommands.slice();
          postUpgradeCommands = imapCommands.slice();
        } else {
          commands = imapCommands.slice();
        }
        break;
      case "pop3":
        if (this.isStartTLS) {
          commands = pop3StartTLSCommands.slice();
          postUpgradeCommands = pop3Commands.slice();
        } else {
          commands = pop3Commands.slice();
        }
        break;
      case "smtp":
        if (this.isStartTLS) {
          commands = smtpStartTLSCommands.slice();
          postUpgradeCommands = smtpCommands.slice();
        } else {
          commands = smtpCommands.slice();
        }
        break;
      case "ews": {
        const request = new XMLHttpRequest();
        request.open("GET", `https://${this.hostname}:${this.port}/`);
        request.onerror = () =>
          this.#handleSecurityInfo(
            request.channel.status,
            request.channel.securityInfo
          );
        request.onload = () =>
          this.#handleSecurityInfo(
            request.channel.status,
            request.channel.securityInfo
          );
        request.send(null);
        return;
      }
      default:
        console.error(`unknown type "${this.type}", how did we get here?`);
        return;
    }

    const uri = Services.io.newURI("http://" + this.hostname);
    let proxyFlags =
      Ci.nsIProtocolProxyService.RESOLVE_IGNORE_URI_SCHEME |
      Ci.nsIProtocolProxyService.RESOLVE_PREFER_SOCKS_PROXY;
    if (Services.prefs.getBoolPref("network.proxy.socks_remote_dns")) {
      proxyFlags |= Ci.nsIProtocolProxyService.RESOLVE_ALWAYS_TUNNEL;
    }

    const proxyDeferred = Promise.withResolvers();
    proxyService.asyncResolve(uri, proxyFlags, {
      onProxyAvailable(_req, _uri, proxy) {
        // Anything but a SOCKS proxy will be unusable for email.
        if (["socks", "socks4"].includes(proxy?.type)) {
          proxyDeferred.resolve(proxy);
        } else {
          proxyDeferred.resolve(null);
        }
      },
    });

    const transport = transportService.createTransport(
      [this.isStartTLS ? "starttls" : "ssl"],
      this.hostname,
      this.port,
      await proxyDeferred.promise,
      null
    );
    transport.setTimeout(Ci.nsISocketTransport.TIMEOUT_CONNECT, 10);
    transport.setTimeout(Ci.nsISocketTransport.TIMEOUT_READ_WRITE, 10);
    const outStream = transport.openOutputStream(0, 0, 0);
    const stream = transport.openInputStream(0, 0, 0);
    const inStream = new ScriptableInputStream(stream);
    const pump = new InputStreamPump(stream, 0, 0, false);
    pump.asyncRead({
      QueryInterface: ChromeUtils.generateQI(["nsIStreamListener"]),

      onStartRequest: () => {},

      onStopRequest: (_request, reqStatus) => {
        const socketTransport = transport.QueryInterface(Ci.nsISocketTransport);
        socketTransport.tlsSocketControl
          ?.asyncGetSecurityInfo()
          .then(secInfo => this.#handleSecurityInfo(reqStatus, secInfo));
        inStream.close();
        outStream.close();
      },

      onDataAvailable: async (request, inputStream, offset, count) => {
        const inputData = inStream.read(count);
        log.debug(`S: ${inputData}`);

        if (commands.length == 0 && postUpgradeCommands) {
          commands = postUpgradeCommands;
          postUpgradeCommands = null;

          await transport.tlsSocketControl.asyncStartTLS();
        }

        if (commands.length == 0) {
          // If the server doesn't hang up, do it ourselves, or we won't get
          // to onStopRequest until the connection times out.
          setTimeout(() => transport.close(Cr.NS_OK), 500);
          return;
        }

        const outputData = commands.shift();
        log.debug(`C: ${outputData}`);
        outStream.write(outputData, outputData.length);
      },
    });
  }

  /**
   * Receive the transport security info from `#fetchCertificate` and update
   * the UI to describe it.
   *
   * @param {number} reqStatus
   * @param {nsITransportSecurityInfo} securityInfo
   */
  #handleSecurityInfo(reqStatus, securityInfo) {
    this.#securityInfo = securityInfo;
    this.#certificate = securityInfo.serverCert;
    this.viewButton.hidden = false;
    const l10nArgs = {
      hostname: `${this.hostname}:${this.port}`,
    };

    if (Components.isSuccessCode(reqStatus)) {
      if (this.#hasException) {
        document.l10n.setAttributes(
          this.statusLabel,
          "certificate-check-exception-exists",
          l10nArgs
        );
        this.setAttribute("status", "cert-error");
      } else {
        document.l10n.setAttributes(
          this.statusLabel,
          "certificate-check-success",
          l10nArgs
        );
        this.setAttribute("status", "success");
      }
      return;
    }

    let isCertError = false;
    try {
      if (
        nssErrorsService.getErrorClass(reqStatus) ==
        Ci.nsINSSErrorsService.ERROR_CLASS_BAD_CERT
      ) {
        isCertError = true;
      }
    } catch (ex) {
      // nsINSSErrorsService.getErrorClass throws if given a non-TLS,
      // non-cert error, so ignore this.
    }
    if (!isCertError) {
      document.l10n.setAttributes(
        this.statusLabel,
        "certificate-check-failure",
        l10nArgs
      );
      this.setAttribute("status", "failure");
      this.viewButton.hidden = true;
      return;
    }

    let errorString;
    switch (securityInfo.overridableErrorCategory) {
      case Ci.nsITransportSecurityInfo.ERROR_DOMAIN:
        errorString = "cert-error-domain-mismatch";
        break;
      case Ci.nsITransportSecurityInfo.ERROR_TIME: {
        const cert = securityInfo.serverCert;
        const notBefore = cert.validity.notBefore / 1000;
        const notAfter = cert.validity.notAfter / 1000;
        const formatter = new Intl.DateTimeFormat();

        if (notBefore && Date.now() < notAfter) {
          errorString = "cert-error-not-yet-valid";
          l10nArgs["not-before"] = formatter.format(new Date(notBefore));
        } else {
          errorString = "cert-error-expired";
          l10nArgs["not-after"] = formatter.format(new Date(notAfter));
        }
        break;
      }
      default:
        errorString = "cert-error-untrusted-default";
        break;
    }
    document.l10n.setAttributes(this.statusLabel, errorString, l10nArgs);
    this.addExceptionButton.hidden = false;
    this.setAttribute("status", "cert-error");
  }

  /**
   * Open a new tab displaying the certificate.
   */
  #viewCertificate() {
    const { viewCertHelper } = ChromeUtils.importESModule(
      "resource://gre/modules/psm/pippki.sys.mjs"
    );
    viewCertHelper(top, this.#certificate);
  }

  /**
   * Add an exception for the certificate.
   */
  #addException() {
    certOverrideService.rememberValidityOverride(
      this.hostname,
      this.port,
      {},
      this.#certificate,
      !Services.prefs.getBoolPref("security.certerrors.permanentOverride", true)
    );
    Glean.mail.certificateExceptionAdded.record({
      error_category: this.#securityInfo.errorCodeString,
      protocol: this.type,
      port: this.port,
      ui: "certificate-check",
    });

    document.l10n.setAttributes(
      this.statusLabel,
      "certificate-check-exception-added"
    );
    this.addExceptionButton.hidden = true;
    this.removeExceptionButton.hidden = false;
    this.#hasException = true;
  }

  /**
   * Remove an existing exception.
   */
  #removeException() {
    certOverrideService.clearValidityOverride(this.hostname, this.port, {});

    document.l10n.setAttributes(
      this.statusLabel,
      "certificate-check-exception-removed"
    );
    this.addExceptionButton.hidden = false;
    this.removeExceptionButton.hidden = true;
    this.#hasException = false;
  }
}
window.customElements.define("certificate-check", CertificateCheck);
