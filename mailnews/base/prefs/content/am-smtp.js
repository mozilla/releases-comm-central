/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from amUtils.js */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

window.addEventListener("DOMContentLoaded", () => {
  gSmtpServerListWindow.onLoad();
});

var gSmtpServerListWindow = {
  mBundle: null,
  mServerList: null,
  mAddButton: null,
  mEditButton: null,
  mDeleteButton: null,
  mSetDefaultServerButton: null,

  onLoad() {
    parent.onPanelLoaded("am-smtp.xhtml");

    this.mBundle = document.getElementById("bundle_messenger");
    this.mServerList = document.getElementById("smtpList");
    this.mAddButton = document.getElementById("addButton");
    this.mEditButton = document.getElementById("editButton");
    this.mDeleteButton = document.getElementById("deleteButton");
    this.mSetDefaultServerButton = document.getElementById("setDefaultButton");

    this.refreshServerList("", false);

    this.updateButtons();
  },

  onSelectionChanged() {
    var server = this.getSelectedServer();
    if (!server) {
      return;
    }

    this.updateButtons();
    this.updateServerInfoBox(server);
  },

  onDeleteServer() {
    var server = this.getSelectedServer();
    if (!server) {
      return;
    }

    // confirm deletion
    const cancel = Services.prompt.confirmEx(
      window,
      this.mBundle.getString("smtpServers-confirmServerDeletionTitle"),
      this.mBundle.getFormattedString(
        "smtpServers-confirmServerDeletion",
        [server.hostname],
        1
      ),
      Services.prompt.STD_YES_NO_BUTTONS,
      null,
      null,
      null,
      null,
      {}
    );

    if (!cancel) {
      // Remove password information first.
      try {
        server.forgetPassword();
      } catch (e) {
        /* It is OK if this fails. */
      }
      // Remove the server.
      MailServices.smtp.deleteServer(server);
      parent.replaceWithDefaultSmtpServer(server.key);
      this.refreshServerList("", true);
    }
  },

  onAddServer() {
    this.openServerEditor(null);
  },

  onEditServer() {
    const server = this.getSelectedServer();
    if (!server) {
      return;
    }

    this.openServerEditor(server);
  },

  onSetDefaultServer() {
    const server = this.getSelectedServer();
    if (!server) {
      return;
    }

    MailServices.smtp.defaultServer = server;
    this.refreshServerList(MailServices.smtp.defaultServer.key, true);
  },

  updateButtons() {
    const server = this.getSelectedServer();

    // can't delete default server
    if (server && MailServices.smtp.defaultServer == server) {
      this.mSetDefaultServerButton.setAttribute("disabled", "true");
      this.mDeleteButton.setAttribute("disabled", "true");
    } else {
      this.mSetDefaultServerButton.removeAttribute("disabled");
      this.mDeleteButton.removeAttribute("disabled");
    }

    if (!server) {
      this.mEditButton.setAttribute("disabled", "true");
    } else {
      this.mEditButton.removeAttribute("disabled");
    }
  },

  updateServerInfoBox(aServer) {
    var noneSelected = this.mBundle.getString("smtpServerList-NotSpecified");

    document.getElementById("nameValue").textContent = aServer.hostname;
    document.getElementById("descriptionValue").textContent =
      aServer.description || noneSelected;
    document.getElementById("portValue").textContent =
      aServer.port || noneSelected;
    document.getElementById("userNameValue").textContent =
      aServer.username || noneSelected;
    document.getElementById("useSecureConnectionValue").textContent =
      this.mBundle.getString(
        "smtpServer-ConnectionSecurityType-" + aServer.socketType
      );

    const AuthMethod = Ci.nsMsgAuthMethod;
    const SocketType = Ci.nsMsgSocketType;
    var authStr = "";
    switch (aServer.authMethod) {
      case AuthMethod.none:
        authStr = "authNo";
        break;
      case AuthMethod.passwordEncrypted:
        authStr = "authPasswordEncrypted";
        break;
      case AuthMethod.GSSAPI:
        authStr = "authKerberos";
        break;
      case AuthMethod.NTLM:
        authStr = "authNTLM";
        break;
      case AuthMethod.secure:
        authStr = "authAnySecure";
        break;
      case AuthMethod.passwordCleartext:
        authStr =
          aServer.socketType == SocketType.SSL ||
          aServer.socketType == SocketType.alwaysSTARTTLS
            ? "authPasswordCleartextViaSSL"
            : "authPasswordCleartextInsecurely";
        break;
      case AuthMethod.OAuth2:
        authStr = "authOAuth2";
        break;
      default:
        // leave empty
        console.error(
          "Warning: unknown value for smtpserver... authMethod: " +
            aServer.authMethod
        );
    }
    document.getElementById("authMethodValue").textContent = authStr
      ? this.mBundle.getString(authStr)
      : noneSelected;
  },

  refreshServerList(aServerKeyToSelect, aFocusList) {
    while (this.mServerList.hasChildNodes()) {
      this.mServerList.lastChild.remove();
    }
    for (const server of MailServices.smtp.servers) {
      const listitem = this.createSmtpListItem(
        server,
        MailServices.smtp.defaultServer.key == server.key
      );
      this.mServerList.appendChild(listitem);
    }

    if (aServerKeyToSelect) {
      this.setSelectedServer(
        this.mServerList.querySelector('[key="' + aServerKeyToSelect + '"]')
      );
    } else {
      // Select the default server.
      this.setSelectedServer(
        this.mServerList.querySelector('[default="true"]')
      );
    }

    if (aFocusList) {
      this.mServerList.focus();
    }
  },

  createSmtpListItem(aServer, aIsDefault) {
    var listitem = document.createXULElement("richlistitem");
    var serverName = "";

    if (aServer.description) {
      serverName = aServer.description + " - ";
    } else if (aServer.username) {
      serverName = aServer.username + " - ";
    }

    serverName += aServer.hostname;

    if (aIsDefault) {
      serverName += " " + this.mBundle.getString("defaultServerTag");
      listitem.setAttribute("default", "true");
    }

    const label = document.createXULElement("label");
    label.setAttribute("value", serverName);
    listitem.appendChild(label);
    listitem.setAttribute("key", aServer.key);
    listitem.setAttribute("class", "smtpServerListItem");

    // give it some unique id
    listitem.id = "smtpServer." + aServer.key;
    return listitem;
  },

  openServerEditor(aServer) {
    const args = editSMTPServer(aServer);

    // now re-select the server which was just added
    if (args.result) {
      this.refreshServerList(aServer ? aServer.key : args.addSmtpServer, true);
    }

    return args.result;
  },

  setSelectedServer(aServer) {
    if (!aServer) {
      return;
    }

    setTimeout(
      function (aServerList) {
        aServerList.ensureElementIsVisible(aServer);
        aServerList.selectItem(aServer);
      },
      0,
      this.mServerList
    );
  },

  getSelectedServer() {
    // The list of servers is a single selection listbox
    // therefore 1 item is always selected.
    // But if there are no SMTP servers defined yet, nothing will be selected.
    const selection = this.mServerList.selectedItem;
    if (!selection) {
      return null;
    }

    const serverKey = selection.getAttribute("key");
    return MailServices.smtp.getServerByKey(serverKey);
  },
};
