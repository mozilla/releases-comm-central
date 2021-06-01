/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["BindRequest", "LDAPResponse"];

var {
  asn1js: { asn1js },
} = ChromeUtils.import("chrome://global/content/certviewer/asn1js_bundle.js");

/**
 * A base class for all LDAP request and response messages, see
 * rfc4511#section-4.1.1.
 *
 * @property {number} messageId - The message id.
 * @property {LocalBaseBlock} protocolOp - The message content, in a data
 *   structure provided by asn1js.
 */
class LDAPMessage {
  /**
   * Encode the current message by Basic Encoding Rules (BER).
   * @param {number} messageId - The id of the current message.
   * @returns {ArrayBuffer} BER encoded message.
   */
  toBER(messageId = this.messageId) {
    let msg = new asn1js.Sequence({
      value: [new asn1js.Integer({ value: messageId }), this.protocolOp],
    });
    return msg.toBER();
  }
}

class BindRequest extends LDAPMessage {
  /**
   * @param {string} dn - The name to bind.
   * @param {string} password - The password.
   */
  constructor(dn, password) {
    super();
    this.protocolOp = new asn1js.Constructed({
      // [APPLICATION 0]
      idBlock: {
        tagClass: 2,
        tagNumber: 0,
      },
      value: [
        // version
        new asn1js.Integer({ value: 3 }),
        // name
        new asn1js.OctetString({
          valueHex: new TextEncoder().encode(dn),
        }),
        // authentication
        new asn1js.Primitive({
          // Context-specific [0]
          idBlock: {
            tagClass: 3,
            tagNumber: 0,
          },
          valueHex: new TextEncoder().encode(password),
        }),
      ],
    });
  }
}

class LDAPResult {
  /**
   * @param {number} resultCode - The result code.
   * @param {string} matchedDN - For certain result codes, matchedDN is the last entry used.
   * @param {string} diagnosticMessage - A diagnostic message returned by the server.
   */
  constructor(resultCode, matchedDN, diagnosticMessage) {
    this.resultCode = resultCode;
    this.matchedDN = matchedDN;
    this.diagnosticMessage = diagnosticMessage;
  }
}

/**
 * A base class for all LDAP response messages.
 *
 * @property {LDAPResult} result - The result of a response.
 */
class LDAPResponse extends LDAPMessage {
  /**
   * @param {number} messageId - The message id.
   * @param {LocalBaseBlock} protocolOp - The message content.
   */
  constructor(messageId, protocolOp) {
    super();
    this.messageId = messageId;
    this.protocolOp = protocolOp;
  }

  /**
   * Find the corresponding response class name from a tag number.
   * @param {number} tagNumber - The tag number of a block.
   * @returns {LDAPResponse}
   */
  static _getResponseClassFromTagNumber(tagNumber) {
    return {
      1: BindResponse,
      4: SearchResultEntry,
      5: SearchResultDone,
      19: SearchResultReference,
      24: ExtendedResponse,
    }[tagNumber];
  }

  /**
   * Decode a raw server response to LDAPResponse instance.
   * @param {ArrayBuffer} buffer - The raw message received from the server.
   * @returns {LDAPResponse} A concrete instance of LDAPResponse subclass.
   */
  static fromBER(buffer) {
    let decoded = asn1js.fromBER(buffer);
    let value = decoded.result.valueBlock.value;
    let protocolOp = value[1];
    if (protocolOp.idBlock.tagClass != 2) {
      throw Components.Exception(
        `Unexpected tagClass ${protocolOp.idBlock.tagClass}`,
        Cr.NS_ERROR_ILLEGAL_VALUE
      );
    }
    let ProtocolOp = this._getResponseClassFromTagNumber(
      protocolOp.idBlock.tagNumber
    );
    if (!ProtocolOp) {
      throw Components.Exception(
        `Unexpected tagNumber ${protocolOp.idBlock.tagNumber}`,
        Cr.NS_ERROR_ILLEGAL_VALUE
      );
    }
    let op = new ProtocolOp(value[0].valueBlock.valueDec, protocolOp);
    op.parse();
    return op;
  }

  /**
   * Parse the protocolOp part of a LDAPMessage to LDAPResult. For LDAP
   * responses that are simply LDAPResult, reuse this function. Other responses
   * need to implement this function.
   */
  parse() {
    let value = this.protocolOp.valueBlock.value;
    let resultCode = value[0].valueBlock.valueDec;
    let matchedDN = new TextDecoder().decode(value[1].valueBlock.valueHex);
    let diagnosticMessage = new TextDecoder().decode(
      value[2].valueBlock.valueHex
    );
    this.result = new LDAPResult(resultCode, matchedDN, diagnosticMessage);
  }
}

class BindResponse extends LDAPResponse {}

class SearchResultEntry extends LDAPResponse {}

class SearchResultDone extends LDAPResponse {}

class SearchResultReference extends LDAPResponse {}

class ExtendedResponse extends LDAPResponse {}
