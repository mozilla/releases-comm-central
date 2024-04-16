/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global MozElements, MozXULElement, gAccountManager */

// Wrap in a block to prevent leaking to window scope.
{
  const { DownloadUtils } = ChromeUtils.importESModule(
    "resource://gre/modules/DownloadUtils.sys.mjs"
  );
  const { ChatIcons } = ChromeUtils.importESModule(
    "resource:///modules/chatIcons.sys.mjs"
  );

  /**
   * The MozChatAccountRichlistitem widget displays the information about the
   * configured account: i.e. icon, state, name, error, checkbox for
   * auto sign in and buttons for disconnect and properties.
   *
   * @augments {MozElements.MozRichlistitem}
   */
  class MozChatAccountRichlistitem extends MozElements.MozRichlistitem {
    static get inheritedAttributes() {
      return {
        stack: "tooltiptext=protocol",
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
          const localName = event.target.localName;
          if (localName != "button" && localName != "checkbox") {
            this.proceedDefaultAction();
          }
        }
        // Prevent from loading an account wizard
        event.stopPropagation();
      });
      MozXULElement.insertFTLIfNeeded("branding/brand.ftl");
      MozXULElement.insertFTLIfNeeded("chat/accounts.ftl");
      this.appendChild(
        MozXULElement.parseXULToFragment(
          `
          <vbox flex="1">
            <hbox flex="1" align="start">
              <vbox>
                <stack>
                  <html:img class="accountIcon" alt="" />
                  <html:img class="statusTypeIcon" alt="" />
                </stack>
                <spacer flex="1"></spacer>
              </vbox>
              <vbox flex="1" align="start">
                <label crop="end" class="accountName"></label>
                <label class="connecting" crop="end" data-l10n-id="account-connecting"></label>
                <label class="connected" crop="end"></label>
                <label class="disconnecting" crop="end" data-l10n-id="account-disconnecting"></label>
                <label class="disconnected" crop="end" data-l10n-id="account-disconnected"></label>
                <description class="error error-description"></description>
                <description class="error error-reconnect"></description>
                <spacer flex="1"></spacer>
              </vbox>
              <checkbox data-l10n-id="account-auto-sign-on"
                        class="autoSignOn"
                        oncommand="gAccountManager.autologin()"></checkbox>
            </hbox>
            <hbox flex="1" class="account-buttons">
              <button class="disconnectButton" command="cmd_disconnect"></button>
              <button class="connectButton" command="cmd_connect"></button>
              <spacer flex="1"></spacer>
              <button command="cmd_edit"></button>
            </hbox>
          </vbox>
          `
        )
      );
      this._buttons = this.querySelector(".account-buttons");
      this._connectedLabel = this.querySelector(".connected");
      this._stateIcon = this.querySelector(".statusTypeIcon");
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

    get buttons() {
      return this._buttons;
    }

    build(aAccount) {
      this._account = aAccount;
      this.setAttribute("name", aAccount.name);
      this.setAttribute("id", aAccount.id);
      const proto = aAccount.protocol;
      this.setAttribute("protocol", proto.name);
      this.querySelector(".accountIcon").setAttribute(
        "src",
        ChatIcons.getProtocolIconURI(proto, 32)
      );
      this.refreshState();
      this.autoLogin = aAccount.autoLogin;
    }

    /**
     * Refresh the shown connection state.
     *
     * @param {"connected"|"connecting"|"disconnected"|"disconnecting"}
     *   [forceState] - The connection state to show. Otherwise, determined
     *   through the account status.
     */
    refreshState(forceState) {
      const account = this._account;
      let state = "unknown";
      if (forceState) {
        state = forceState;
      } else if (account.connected) {
        state = "connected";
      } else if (account.disconnected) {
        state = "disconnected";
      } else if (this._account.connecting) {
        state = "connecting";
      } else if (this._account.disconnecting) {
        state = "disconnecting";
      }

      switch (state) {
        case "connected":
          this.refreshConnectedLabel();
          break;
        case "connecting":
          this.updateConnectingProgress();
          break;
      }

      /* "state" and "error" attributes are needed for CSS styling of the
       * accountIcon and the connection buttons. */
      this.setAttribute("state", state);

      if (account.connectionErrorReason !== Ci.prplIAccount.NO_ERROR) {
        /* Icon and error attribute set in other method. */
        this.updateConnectionError();
        return;
      }

      this.removeAttribute("error");

      this._stateIcon.setAttribute("src", ChatIcons.getStatusIconURI(state));
    }

    updateConnectingProgress() {
      const bundle = Services.strings.createBundle(
        "chrome://messenger/locale/imAccounts.properties"
      );
      const key = "account.connection.progress";
      let text = this._account.connectionStateMsg;
      text = text
        ? bundle.formatStringFromName(key, [text])
        : bundle.GetStringFromName("account.connecting");

      const progress = this.querySelector(".connecting");
      progress.setAttribute("value", text);
      if (this.reconnectUpdateInterval) {
        this._cancelReconnectTimer();
      }
    }

    updateConnectionError() {
      const bundle = Services.strings.createBundle(
        "chrome://messenger/locale/imAccounts.properties"
      );
      const key = "account.connection.error";
      const account = this._account;
      let text;
      const errorReason = account.connectionErrorReason;
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

      /* "error" attribute is needed for CSS styling of the accountIcon and the
       * connection buttons. */
      this.setAttribute("error", "true");
      this._stateIcon.setAttribute(
        "src",
        "chrome://global/skin/icons/warning.svg"
      );
      const error = this.querySelector(".error-description");
      error.textContent = text;

      const updateReconnect = () => {
        const date = Math.round(
          (account.timeOfNextReconnect - Date.now()) / 1000
        );
        let reconnect = "";
        if (date > 0) {
          const [val1, unit1, val2, unit2] =
            DownloadUtils.convertTimeUnits(date);
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
      const bundle = Services.strings.createBundle(
        "chrome://messenger/locale/imAccounts.properties"
      );
      const date =
        60 * Math.floor((Date.now() - this._account.timeOfLastConnect) / 60000);
      let value;
      if (date > 0) {
        const [val1, unit1, val2, unit2] = DownloadUtils.convertTimeUnits(date);
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
      this._connectedLabel.value = value;
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
      const action = this.account.disconnected
        ? ".connectButton"
        : ".disconnectButton";
      return this.querySelector(action);
    }

    setFocus() {
      let focusTarget = this.activeButton;
      const accountName = this.getAttribute("name");
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
