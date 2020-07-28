/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global MozElements, MozXULElement, gAccountManager */

// Wrap in a block to prevent leaking to window scope.
{
  const { Services } = ChromeUtils.import(
    "resource://gre/modules/Services.jsm"
  );
  const { DownloadUtils } = ChromeUtils.import(
    "resource://gre/modules/DownloadUtils.jsm"
  );

  /**
   * The MozChatAccountRichlistitem widget displays the information about the
   * configured account: i.e. icon, state, name, error, checkbox for
   * auto sign in and buttons for disconnect and properties.
   *
   * @extends {MozElements.MozRichlistitem}
   */
  class MozChatAccountRichlistitem extends MozElements.MozRichlistitem {
    static get inheritedAttributes() {
      return {
        stack: "tooltiptext=protocol",
        ".accountIcon": "src=prplicon",
        ".accountName": "value=name",
        ".autoSignOn": "checked=autologin",
        ".account-buttons": "autologin,name",
      };
    }

    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }

      this.setAttribute("is", "chat-account-richlistitem");
      this.addEventListener("dblclick", event => {
        if (event.button == 0) {
          // If we double clicked on a widget that has already done
          // something with the first click, we should ignore the event
          let localName = event.originalTarget.localName;
          if (localName != "button" && localName != "checkbox") {
            this.proceedDefaultAction();
          }
        }
        // Prevent from loading an account wizard
        event.stopPropagation();
      });

      this.appendChild(
        MozXULElement.parseXULToFragment(
          `
          <vbox flex="1">
            <hbox flex="1" align="start">
              <vbox>
                <stack>
                  <image class="accountIcon"></image>
                  <image class="accountStateIcon"></image>
                </stack>
                <spacer flex="1"></spacer>
              </vbox>
              <vbox flex="1" align="start">
                <label crop="end" class="accountName"></label>
                <label class="connecting" crop="end" value="&account.connecting;"></label>
                <label class="connected" crop="end"></label>
                <label class="disconnecting" crop="end" value="&account.disconnecting;"></label>
                <label class="disconnected" crop="end" value="&account.disconnected;"></label>
                <description class="error error-description"></description>
                <description class="error error-reconnect"></description>
                <label class="addException text-link" onclick="gAccountManager.addException()"
                       data-l10n-id="certmgr-add-exception"></label>
                <spacer flex="1"></spacer>
              </vbox>
              <checkbox label="&account.autoSignOn.label;"
                        class="autoSignOn"
                        accesskey="&account.autoSignOn.accesskey;"
                        oncommand="gAccountManager.autologin()"></checkbox>
            </hbox>
            <hbox flex="1" class="account-buttons">
              <button class="disconnectButton" command="cmd_disconnect"></button>
              <button class="connectButton" command="cmd_connect"></button>
              <spacer flex="1"></spacer>
              <button command="cmd_edit"></button>
            </hbox>
          </vbox>
          `,
          ["chrome://chat/locale/accounts.dtd"]
        )
      );
      this.initializeAttributeInheritance();
    }

    set autoLogin(val) {
      if (val) {
        this.setAttribute("autologin", "true");
      } else {
        this.removeAttribute("autologin");
      }
      if (this._account.autoLogin != val) {
        this._account.autoLogin = val;
      }
    }

    get autoLogin() {
      return this.hasAttribute("autologin");
    }

    /**
     * override the default accessible name
     */
    get label() {
      return this.getAttribute("name");
    }

    get account() {
      return this._account;
    }

    get connectedLabel() {
      if (!this._connectedLabel) {
        this._connectedLabel = this.querySelector(".connected");
      }
      return this._connectedLabel;
    }

    get buttons() {
      if (!this._buttons) {
        this._buttons = this.querySelector(".account-buttons");
      }
      return this._buttons;
    }

    build(aAccount) {
      this._account = aAccount;
      this.setAttribute("name", aAccount.name);
      this.setAttribute("id", aAccount.id);
      let proto = aAccount.protocol;
      this.setAttribute("protocol", proto.name);
      this.setAttribute("prplicon", proto.iconBaseURI + "icon32.png");
      let state = "Unknown";
      if (this._account.connected) {
        state = "connected";
        this.refreshConnectedLabel();
      } else if (this._account.disconnected) {
        state = "disconnected";
        if (this._account.connectionErrorReason != Ci.prplIAccount.NO_ERROR) {
          this.updateConnectionError();
        } else {
          this.removeAttribute("error");
          this.removeAttribute("certError");
        }
      } else if (this._account.connecting) {
        state = "connecting";
        this.updateConnectionState();
      } else if (this._account.disconnecting) {
        state = "connected";
      }
      this.setAttribute("state", state);
      this.autoLogin = aAccount.autoLogin;
    }

    updateConnectionState() {
      let bundle = Services.strings.createBundle(
        "chrome://messenger/locale/imAccounts.properties"
      );
      const key = "account.connection.progress";
      let text = this._account.connectionStateMsg;
      text = text
        ? bundle.formatStringFromName(key, [text])
        : bundle.GetStringFromName("account.connecting");

      let progress = this.querySelector(".connecting");
      progress.setAttribute("value", text);
      if (this.reconnectUpdateInterval) {
        this._cancelReconnectTimer();
      }

      this.removeAttribute("certError");
    }

    updateConnectionError() {
      let bundle = Services.strings.createBundle(
        "chrome://messenger/locale/imAccounts.properties"
      );
      const key = "account.connection.error";
      let account = this._account;
      let text;
      let errorReason = account.connectionErrorReason;
      if (errorReason == Ci.imIAccount.ERROR_UNKNOWN_PRPL) {
        text = bundle.formatStringFromName(key + "UnknownPrpl", [
          account.protocol.id,
        ]);
      } else if (errorReason == Ci.imIAccount.ERROR_MISSING_PASSWORD) {
        text = bundle.GetStringFromName(key + "EnteringPasswordRequired");
      } else if (errorReason == Ci.imIAccount.ERROR_CRASHED) {
        text = bundle.GetStringFromName(key + "CrashedAccount");
      } else {
        text = account.connectionErrorMessage;
      }

      if (errorReason != Ci.imIAccount.ERROR_MISSING_PASSWORD) {
        text = bundle.formatStringFromName(key, [text]);
      }

      this.setAttribute("error", "true");
      if (
        Ci.imIAccount.ERROR_CERT_NOT_PROVIDED <= errorReason &&
        errorReason <= Ci.imIAccount.ERROR_CERT_OTHER_ERROR &&
        account.prplAccount.connectionTarget
      ) {
        this.setAttribute("certError", "true");
      }
      let error = this.querySelector(".error-description");
      error.textContent = text;

      let updateReconnect = () => {
        let date = Math.round(
          (account.timeOfNextReconnect - Date.now()) / 1000
        );
        let reconnect = "";
        if (date > 0) {
          let [val1, unit1, val2, unit2] = DownloadUtils.convertTimeUnits(date);
          if (!val2) {
            reconnect = bundle.formatStringFromName(
              "account.reconnectInSingle",
              [val1, unit1]
            );
          } else {
            reconnect = bundle.formatStringFromName(
              "account.reconnectInDouble",
              [val1, unit1, val2, unit2]
            );
          }
        }
        this.querySelector(".error-reconnect").textContent = reconnect;
        return reconnect;
      };
      if (updateReconnect() && !this.reconnectUpdateInterval) {
        this.setAttribute("reconnectPending", "true");
        this.reconnectUpdateInterval = setInterval(updateReconnect, 1000);
        gAccountManager.disableCommandItems();
      }
    }

    refreshConnectedLabel() {
      let bundle = Services.strings.createBundle(
        "chrome://messenger/locale/imAccounts.properties"
      );
      let date =
        60 * Math.floor((Date.now() - this._account.timeOfLastConnect) / 60000);
      let value;
      if (date > 0) {
        let [val1, unit1, val2, unit2] = DownloadUtils.convertTimeUnits(date);
        if (!val2) {
          value = bundle.formatStringFromName("account.connectedForSingle", [
            val1,
            unit1,
          ]);
        } else {
          value = bundle.formatStringFromName("account.connectedForDouble", [
            val1,
            unit1,
            val2,
            unit2,
          ]);
        }
      } else {
        value = bundle.GetStringFromName("account.connectedForSeconds");
      }
      this.connectedLabel.value = value;
    }

    _cancelReconnectTimer() {
      this.removeAttribute("reconnectPending");
      clearInterval(this.reconnectUpdateInterval);
      delete this.reconnectUpdateInterval;
      gAccountManager.disableCommandItems();
    }

    cancelReconnection() {
      if (this.reconnectUpdateInterval) {
        this._cancelReconnectTimer();
        this._account.cancelReconnection();
      }
    }

    restoreItems() {
      // Called after a removal and reinsertion of the binding
      this._buttons = null;
      this._connectedLabel = null;
      if (this._account.connected) {
        this.refreshConnectedLabel();
      } else if (this._account.connecting) {
        this.updateConnectionState();
      } else if (
        this._account.connectionErrorReason != Ci.prplIAccount.NO_ERROR
      ) {
        this.updateConnectionError();
      }
    }

    destroy() {
      // If we have a reconnect timer, stop it:
      // it will throw errors otherwise (see bug 480).
      if (!this.reconnectUpdateInterval) {
        return;
      }
      clearInterval(this.reconnectUpdateInterval);
      delete this.reconnectUpdateInterval;
    }

    get activeButton() {
      let action = this.account.disconnected
        ? ".connectButton"
        : ".disconnectButton";
      return this.querySelector(action);
    }

    setFocus() {
      let focusTarget = this.activeButton;
      let accountName = this.getAttribute("name");
      focusTarget.setAttribute(
        "aria-label",
        focusTarget.label + " " + accountName
      );
      if (focusTarget.disabled) {
        focusTarget = document.getElementById("accountlist");
      }
      focusTarget.focus();
    }

    proceedDefaultAction() {
      this.activeButton.click();
    }
  }

  MozXULElement.implementCustomInterface(MozChatAccountRichlistitem, [
    Ci.nsIDOMXULSelectControlItemElement,
  ]);

  customElements.define(
    "chat-account-richlistitem",
    MozChatAccountRichlistitem,
    { extends: "richlistitem" }
  );
}
