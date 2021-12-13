"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.IllegalMethod = void 0;

var _Base = require("./Base");

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

/**
 * @class crypto/verification/IllegalMethod/IllegalMethod
 * @extends {module:crypto/verification/Base}
 */
class IllegalMethod extends _Base.VerificationBase {
  constructor(...args) {
    super(...args);

    _defineProperty(this, "doVerification", async () => {
      throw new Error("Verification is not possible with this method");
    });
  }

  static factory(channel, baseApis, userId, deviceId, startEvent, request) {
    return new IllegalMethod(channel, baseApis, userId, deviceId, startEvent, request);
  } // eslint-disable-next-line @typescript-eslint/naming-convention


  static get NAME() {
    // Typically the name will be something else, but to complete
    // the contract we offer a default one here.
    return "org.matrix.illegal_method";
  }

}

exports.IllegalMethod = IllegalMethod;