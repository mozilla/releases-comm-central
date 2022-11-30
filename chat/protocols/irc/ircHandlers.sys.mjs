/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { ircBase } from "resource:///modules/ircBase.sys.mjs";
import {
  ircISUPPORT,
  isupportBase,
} from "resource:///modules/ircISUPPORT.sys.mjs";
import { ircCAP, capNotify } from "resource:///modules/ircCAP.sys.mjs";
import { ircCTCP, ctcpBase } from "resource:///modules/ircCTCP.sys.mjs";
import {
  ircServices,
  servicesBase,
} from "resource:///modules/ircServices.sys.mjs";
import { ctcpDCC } from "resource:///modules/ircDCC.sys.mjs";
import { capEchoMessage } from "resource:///modules/ircEchoMessage.sys.mjs";
import {
  isupportNAMESX,
  capMultiPrefix,
} from "resource:///modules/ircMultiPrefix.sys.mjs";
import { ircNonStandard } from "resource:///modules/ircNonStandard.sys.mjs";
import {
  ircWATCH,
  isupportWATCH,
  ircMONITOR,
  isupportMONITOR,
} from "resource:///modules/ircWatchMonitor.sys.mjs";
import { ircSASL, capSASL } from "resource:///modules/ircSASL.sys.mjs";
import {
  capServerTime,
  tagServerTime,
} from "resource:///modules/ircServerTime.sys.mjs";

export var ircHandlers = {
  /*
   * Object to hold the IRC handlers, each handler is an object that implements:
   *   name        The display name of the handler.
   *   priority    The priority of the handler (0 is default, positive is
   *               higher priority)
   *   isEnabled   A function where 'this' is bound to the account object. This
   *               should reflect whether this handler should be used for this
   *               account.
   *   commands    An object of commands, each command is a function which
   *               accepts a message object and has 'this' bound to the account
   *               object. It should return whether the message was successfully
   *               handler or not.
   */
  _ircHandlers: [
    // High priority
    ircCTCP,
    ircServices,
    // Default priority + 10
    ircCAP,
    ircISUPPORT,
    ircWATCH,
    ircMONITOR,
    // Default priority + 1
    ircNonStandard,
    // Default priority
    ircSASL,
    ircBase,
  ],
  // Object to hold the ISUPPORT handlers, expects the same fields as
  // _ircHandlers.
  _isupportHandlers: [
    // Default priority + 10
    isupportNAMESX,
    isupportWATCH,
    isupportMONITOR,
    // Default priority
    isupportBase,
  ],
  // Object to hold the Client Capabilities handlers, expects the same fields as
  // _ircHandlers.
  _capHandlers: [
    // High priority
    capMultiPrefix,
    // Default priority
    capNotify,
    capEchoMessage,
    capSASL,
    capServerTime,
  ],
  // Object to hold the CTCP handlers, expects the same fields as _ircHandlers.
  _ctcpHandlers: [
    // High priority + 10
    ctcpDCC,
    // Default priority
    ctcpBase,
  ],
  // Object to hold the DCC handlers, expects the same fields as _ircHandlers.
  _dccHandlers: [],
  // Object to hold the Services handlers, expects the same fields as
  // _ircHandlers.
  _servicesHandlers: [servicesBase],
  // Object to hold irc message tag handlers, expects the same fields as
  // _ircHandlers.
  _tagHandlers: [tagServerTime],

  _registerHandler(aArray, aHandler) {
    // Protect ourselves from adding broken handlers.
    if (!("commands" in aHandler)) {
      console.error(
        new Error(
          'IRC handlers must have a "commands" property: ' + aHandler.name
        )
      );
      return false;
    }
    if (!("isEnabled" in aHandler)) {
      console.error(
        new Error(
          'IRC handlers must have a "isEnabled" property: ' + aHandler.name
        )
      );
      return false;
    }

    aArray.push(aHandler);
    aArray.sort((a, b) => b.priority - a.priority);
    return true;
  },

  _unregisterHandler(aArray, aHandler) {
    return aArray.filter(h => h.name != aHandler.name);
  },

  registerHandler(aHandler) {
    return this._registerHandler(this._ircHandlers, aHandler);
  },
  unregisterHandler(aHandler) {
    this._ircHandlers = this._unregisterHandler(this._ircHandlers, aHandler);
  },

  registerISUPPORTHandler(aHandler) {
    return this._registerHandler(this._isupportHandlers, aHandler);
  },
  unregisterISUPPORTHandler(aHandler) {
    this._isupportHandlers = this._unregisterHandler(
      this._isupportHandlers,
      aHandler
    );
  },

  registerCAPHandler(aHandler) {
    return this._registerHandler(this._capHandlers, aHandler);
  },
  unregisterCAPHandler(aHandler) {
    this._capHandlers = this._unregisterHandler(this._capHandlers, aHandler);
  },

  registerCTCPHandler(aHandler) {
    return this._registerHandler(this._ctcpHandlers, aHandler);
  },
  unregisterCTCPHandler(aHandler) {
    this._ctcpHandlers = this._unregisterHandler(this._ctcpHandlers, aHandler);
  },

  registerDCCHandler(aHandler) {
    return this._registerHandler(this._dccHandlers, aHandler);
  },
  unregisterDCCHandler(aHandler) {
    this._dccHandlers = this._unregisterHandler(this._dccHandlers, aHandler);
  },

  registerServicesHandler(aHandler) {
    return this._registerHandler(this._servicesHandlers, aHandler);
  },
  unregisterServicesHandler(aHandler) {
    this._servicesHandlers = this._unregisterHandler(
      this._servicesHandlers,
      aHandler
    );
  },

  registerTagHandler(aHandler) {
    return this._registerHandler(this._tagHandlers, aHandler);
  },
  unregisterTagHandler(aHandler) {
    this._tagHandlers = this._unregisterHandler(this._tagHandlers, aHandler);
  },

  // Handle a message based on a set of handlers.
  _handleMessage(aHandlers, aAccount, aMessage, aCommand) {
    // Loop over each handler and run the command until one handles the message.
    for (let handler of aHandlers) {
      try {
        // Attempt to execute the command, by checking if the handler has the
        // command.
        // Parse the command with the JavaScript account object as "this".
        if (
          handler.isEnabled.call(aAccount) &&
          aCommand in handler.commands &&
          handler.commands[aCommand].call(aAccount, aMessage, ircHandlers)
        ) {
          return true;
        }
      } catch (e) {
        // We want to catch an error here because one of our handlers are
        // broken, if we don't catch the error, the whole IRC plug-in will die.
        aAccount.ERROR(
          "Error running command " +
            aCommand +
            " with handler " +
            handler.name +
            ":\n" +
            JSON.stringify(aMessage),
          e
        );
      }
    }

    return false;
  },

  handleMessage(aAccount, aMessage) {
    return this._handleMessage(
      this._ircHandlers,
      aAccount,
      aMessage,
      aMessage.command.toUpperCase()
    );
  },

  handleISUPPORTMessage(aAccount, aMessage) {
    return this._handleMessage(
      this._isupportHandlers,
      aAccount,
      aMessage,
      aMessage.isupport.parameter
    );
  },

  handleCAPMessage(aAccount, aMessage) {
    return this._handleMessage(
      this._capHandlers,
      aAccount,
      aMessage,
      aMessage.cap.parameter
    );
  },

  // aMessage is a CTCP Message, which inherits from an IRC Message.
  handleCTCPMessage(aAccount, aMessage) {
    return this._handleMessage(
      this._ctcpHandlers,
      aAccount,
      aMessage,
      aMessage.ctcp.command
    );
  },

  // aMessage is a DCC Message, which inherits from a CTCP Message.
  handleDCCMessage(aAccount, aMessage) {
    return this._handleMessage(
      this._dccHandlers,
      aAccount,
      aMessage,
      aMessage.ctcp.dcc.type
    );
  },

  // aMessage is a Services Message.
  handleServicesMessage(aAccount, aMessage) {
    return this._handleMessage(
      this._servicesHandlers,
      aAccount,
      aMessage,
      aMessage.serviceName
    );
  },

  // aMessage is a Tag Message.
  handleTag(aAccount, aMessage) {
    return this._handleMessage(
      this._tagHandlers,
      aAccount,
      aMessage,
      aMessage.tagName
    );
  },

  // Checking if handlers exist.
  get hasHandlers() {
    return this._ircHandlers.length > 0;
  },
  get hasISUPPORTHandlers() {
    return this._isupportHandlers.length > 0;
  },
  get hasCAPHandlers() {
    return this._capHandlers.length > 0;
  },
  get hasCTCPHandlers() {
    return this._ctcpHandlers.length > 0;
  },
  get hasDCCHandlers() {
    return this._dccHandlers.length > 0;
  },
  get hasServicesHandlers() {
    return this._servicesHandlers.length > 0;
  },
  get hasTagHandlers() {
    return this._tagHandlers.length > 0;
  },
};
