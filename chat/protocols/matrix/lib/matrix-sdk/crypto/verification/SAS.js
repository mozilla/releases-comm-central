"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SasEvent = exports.SAS = void 0;
var _anotherJson = _interopRequireDefault(require("another-json"));
var _Base = require("./Base.js");
var _Error = require("./Error.js");
var _logger = require("../../logger.js");
var _SASDecimal = require("./SASDecimal.js");
var _event = require("../../@types/event.js");
var _verification = require("../../crypto-api/verification.js");
var _types = require("../../types.js");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
Copyright 2018 - 2021 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/ /**
 * Short Authentication String (SAS) verification.
 */
// backwards-compatibility exports

const START_TYPE = _event.EventType.KeyVerificationStart;
const EVENTS = [_event.EventType.KeyVerificationAccept, _event.EventType.KeyVerificationKey, _event.EventType.KeyVerificationMac];
let olmutil;
const newMismatchedSASError = (0, _Error.errorFactory)("m.mismatched_sas", "Mismatched short authentication string");
const newMismatchedCommitmentError = (0, _Error.errorFactory)("m.mismatched_commitment", "Mismatched commitment");

// This list was generated from the data in the Matrix specification [1] with the following command:
//
//    jq  -r '.[] |  "    [\"" + .emoji + "\", \"" + (.description|ascii_downcase) + "\"], // " + (.number|tostring)' sas-emoji.json
//
// [1]: https://github.com/matrix-org/matrix-spec/blob/main/data-definitions/sas-emoji.json
const emojiMapping = [["🐶", "dog"],
// 0
["🐱", "cat"],
// 1
["🦁", "lion"],
// 2
["🐎", "horse"],
// 3
["🦄", "unicorn"],
// 4
["🐷", "pig"],
// 5
["🐘", "elephant"],
// 6
["🐰", "rabbit"],
// 7
["🐼", "panda"],
// 8
["🐓", "rooster"],
// 9
["🐧", "penguin"],
// 10
["🐢", "turtle"],
// 11
["🐟", "fish"],
// 12
["🐙", "octopus"],
// 13
["🦋", "butterfly"],
// 14
["🌷", "flower"],
// 15
["🌳", "tree"],
// 16
["🌵", "cactus"],
// 17
["🍄", "mushroom"],
// 18
["🌏", "globe"],
// 19
["🌙", "moon"],
// 20
["☁️", "cloud"],
// 21
["🔥", "fire"],
// 22
["🍌", "banana"],
// 23
["🍎", "apple"],
// 24
["🍓", "strawberry"],
// 25
["🌽", "corn"],
// 26
["🍕", "pizza"],
// 27
["🎂", "cake"],
// 28
["❤️", "heart"],
// 29
["😀", "smiley"],
// 30
["🤖", "robot"],
// 31
["🎩", "hat"],
// 32
["👓", "glasses"],
// 33
["🔧", "spanner"],
// 34
["🎅", "santa"],
// 35
["👍", "thumbs up"],
// 36
["☂️", "umbrella"],
// 37
["⌛", "hourglass"],
// 38
["⏰", "clock"],
// 39
["🎁", "gift"],
// 40
["💡", "light bulb"],
// 41
["📕", "book"],
// 42
["✏️", "pencil"],
// 43
["📎", "paperclip"],
// 44
["✂️", "scissors"],
// 45
["🔒", "lock"],
// 46
["🔑", "key"],
// 47
["🔨", "hammer"],
// 48
["☎️", "telephone"],
// 49
["🏁", "flag"],
// 50
["🚂", "train"],
// 51
["🚲", "bicycle"],
// 52
["✈️", "aeroplane"],
// 53
["🚀", "rocket"],
// 54
["🏆", "trophy"],
// 55
["⚽", "ball"],
// 56
["🎸", "guitar"],
// 57
["🎺", "trumpet"],
// 58
["🔔", "bell"],
// 59
["⚓", "anchor"],
// 60
["🎧", "headphones"],
// 61
["📁", "folder"],
// 62
["📌", "pin"] // 63
];
function generateEmojiSas(sasBytes) {
  const emojis = [
  // just like base64 encoding
  sasBytes[0] >> 2, (sasBytes[0] & 0x3) << 4 | sasBytes[1] >> 4, (sasBytes[1] & 0xf) << 2 | sasBytes[2] >> 6, sasBytes[2] & 0x3f, sasBytes[3] >> 2, (sasBytes[3] & 0x3) << 4 | sasBytes[4] >> 4, (sasBytes[4] & 0xf) << 2 | sasBytes[5] >> 6];
  return emojis.map(num => emojiMapping[num]);
}
const sasGenerators = {
  decimal: _SASDecimal.generateDecimalSas,
  emoji: generateEmojiSas
};
function generateSas(sasBytes, methods) {
  const sas = {};
  for (const method of methods) {
    if (method in sasGenerators) {
      // @ts-ignore - ts doesn't like us mixing types like this
      sas[method] = sasGenerators[method](Array.from(sasBytes));
    }
  }
  return sas;
}
const macMethods = {
  "hkdf-hmac-sha256": "calculate_mac",
  "org.matrix.msc3783.hkdf-hmac-sha256": "calculate_mac_fixed_base64",
  "hkdf-hmac-sha256.v2": "calculate_mac_fixed_base64",
  "hmac-sha256": "calculate_mac_long_kdf"
};
function calculateMAC(olmSAS, method) {
  return function (input, info) {
    const mac = olmSAS[macMethods[method]](input, info);
    _logger.logger.log("SAS calculateMAC:", method, [input, info], mac);
    return mac;
  };
}
const calculateKeyAgreement = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  "curve25519-hkdf-sha256": function (sas, olmSAS, bytes) {
    const ourInfo = `${sas.baseApis.getUserId()}|${sas.baseApis.deviceId}|` + `${sas.ourSASPubKey}|`;
    const theirInfo = `${sas.userId}|${sas.deviceId}|${sas.theirSASPubKey}|`;
    const sasInfo = "MATRIX_KEY_VERIFICATION_SAS|" + (sas.initiatedByMe ? ourInfo + theirInfo : theirInfo + ourInfo) + sas.channel.transactionId;
    return olmSAS.generate_bytes(sasInfo, bytes);
  },
  "curve25519": function (sas, olmSAS, bytes) {
    const ourInfo = `${sas.baseApis.getUserId()}${sas.baseApis.deviceId}`;
    const theirInfo = `${sas.userId}${sas.deviceId}`;
    const sasInfo = "MATRIX_KEY_VERIFICATION_SAS" + (sas.initiatedByMe ? ourInfo + theirInfo : theirInfo + ourInfo) + sas.channel.transactionId;
    return olmSAS.generate_bytes(sasInfo, bytes);
  }
};
/* lists of algorithms/methods that are supported.  The key agreement, hashes,
 * and MAC lists should be sorted in order of preference (most preferred
 * first).
 */
const KEY_AGREEMENT_LIST = ["curve25519-hkdf-sha256", "curve25519"];
const HASHES_LIST = ["sha256"];
const MAC_LIST = ["hkdf-hmac-sha256.v2", "org.matrix.msc3783.hkdf-hmac-sha256", "hkdf-hmac-sha256", "hmac-sha256"];
const SAS_LIST = Object.keys(sasGenerators);
const KEY_AGREEMENT_SET = new Set(KEY_AGREEMENT_LIST);
const HASHES_SET = new Set(HASHES_LIST);
const MAC_SET = new Set(MAC_LIST);
const SAS_SET = new Set(SAS_LIST);
function intersection(anArray, aSet) {
  return Array.isArray(anArray) ? anArray.filter(x => aSet.has(x)) : [];
}

/** @deprecated use VerifierEvent */

/** @deprecated use VerifierEvent */
const SasEvent = exports.SasEvent = _verification.VerifierEvent;

/** @deprecated Avoid referencing this class directly; instead use {@link Crypto.Verifier}. */
class SAS extends _Base.VerificationBase {
  constructor(...args) {
    super(...args);
    _defineProperty(this, "waitingForAccept", void 0);
    _defineProperty(this, "ourSASPubKey", void 0);
    _defineProperty(this, "theirSASPubKey", void 0);
    _defineProperty(this, "sasEvent", void 0);
    _defineProperty(this, "doVerification", async () => {
      await global.Olm.init();
      olmutil = olmutil || new global.Olm.Utility();

      // make sure user's keys are downloaded
      await this.baseApis.downloadKeys([this.userId]);
      let retry = false;
      do {
        try {
          if (this.initiatedByMe) {
            return await this.doSendVerification();
          } else {
            return await this.doRespondVerification();
          }
        } catch (err) {
          if (err instanceof _Base.SwitchStartEventError) {
            // this changes what initiatedByMe returns
            this.startEvent = err.startEvent;
            retry = true;
          } else {
            throw err;
          }
        }
      } while (retry);
    });
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention
  static get NAME() {
    return _types.VerificationMethod.Sas;
  }
  get events() {
    return EVENTS;
  }
  canSwitchStartEvent(event) {
    if (event.getType() !== START_TYPE) {
      return false;
    }
    const content = event.getContent();
    return content?.method === SAS.NAME && !!this.waitingForAccept;
  }
  async sendStart() {
    const startContent = this.channel.completeContent(START_TYPE, {
      method: SAS.NAME,
      from_device: this.baseApis.deviceId,
      key_agreement_protocols: KEY_AGREEMENT_LIST,
      hashes: HASHES_LIST,
      message_authentication_codes: MAC_LIST,
      // FIXME: allow app to specify what SAS methods can be used
      short_authentication_string: SAS_LIST
    });
    await this.channel.sendCompleted(START_TYPE, startContent);
    return startContent;
  }
  async verifyAndCheckMAC(keyAgreement, sasMethods, olmSAS, macMethod) {
    const sasBytes = calculateKeyAgreement[keyAgreement](this, olmSAS, 6);
    const verifySAS = new Promise((resolve, reject) => {
      this.sasEvent = {
        sas: generateSas(sasBytes, sasMethods),
        confirm: async () => {
          try {
            await this.sendMAC(olmSAS, macMethod);
            resolve();
          } catch (err) {
            reject(err);
          }
        },
        cancel: () => reject((0, _Error.newUserCancelledError)()),
        mismatch: () => reject(newMismatchedSASError())
      };
      this.emit(SasEvent.ShowSas, this.sasEvent);
    });
    const [e] = await Promise.all([this.waitForEvent(_event.EventType.KeyVerificationMac).then(e => {
      // we don't expect any more messages from the other
      // party, and they may send a m.key.verification.done
      // when they're done on their end
      this.expectedEvent = _event.EventType.KeyVerificationDone;
      return e;
    }), verifySAS]);
    const content = e.getContent();
    await this.checkMAC(olmSAS, content, macMethod);
  }
  async doSendVerification() {
    this.waitingForAccept = true;
    let startContent;
    if (this.startEvent) {
      startContent = this.channel.completedContentFromEvent(this.startEvent);
    } else {
      startContent = await this.sendStart();
    }

    // we might have switched to a different start event,
    // but was we didn't call _waitForEvent there was no
    // call that could throw yet. So check manually that
    // we're still on the initiator side
    if (!this.initiatedByMe) {
      throw new _Base.SwitchStartEventError(this.startEvent);
    }
    let e;
    try {
      e = await this.waitForEvent(_event.EventType.KeyVerificationAccept);
    } finally {
      this.waitingForAccept = false;
    }
    let content = e.getContent();
    const sasMethods = intersection(content.short_authentication_string, SAS_SET);
    if (!(KEY_AGREEMENT_SET.has(content.key_agreement_protocol) && HASHES_SET.has(content.hash) && MAC_SET.has(content.message_authentication_code) && sasMethods.length)) {
      throw (0, _Error.newUnknownMethodError)();
    }
    if (typeof content.commitment !== "string") {
      throw (0, _Error.newInvalidMessageError)();
    }
    const keyAgreement = content.key_agreement_protocol;
    const macMethod = content.message_authentication_code;
    const hashCommitment = content.commitment;
    const olmSAS = new global.Olm.SAS();
    try {
      this.ourSASPubKey = olmSAS.get_pubkey();
      await this.send(_event.EventType.KeyVerificationKey, {
        key: this.ourSASPubKey
      });
      e = await this.waitForEvent(_event.EventType.KeyVerificationKey);
      // FIXME: make sure event is properly formed
      content = e.getContent();
      const commitmentStr = content.key + _anotherJson.default.stringify(startContent);
      // TODO: use selected hash function (when we support multiple)
      if (olmutil.sha256(commitmentStr) !== hashCommitment) {
        throw newMismatchedCommitmentError();
      }
      this.theirSASPubKey = content.key;
      olmSAS.set_their_key(content.key);
      await this.verifyAndCheckMAC(keyAgreement, sasMethods, olmSAS, macMethod);
    } finally {
      olmSAS.free();
    }
  }
  async doRespondVerification() {
    // as m.related_to is not included in the encrypted content in e2e rooms,
    // we need to make sure it is added
    let content = this.channel.completedContentFromEvent(this.startEvent);

    // Note: we intersect using our pre-made lists, rather than the sets,
    // so that the result will be in our order of preference.  Then
    // fetching the first element from the array will give our preferred
    // method out of the ones offered by the other party.
    const keyAgreement = intersection(KEY_AGREEMENT_LIST, new Set(content.key_agreement_protocols))[0];
    const hashMethod = intersection(HASHES_LIST, new Set(content.hashes))[0];
    const macMethod = intersection(MAC_LIST, new Set(content.message_authentication_codes))[0];
    // FIXME: allow app to specify what SAS methods can be used
    const sasMethods = intersection(content.short_authentication_string, SAS_SET);
    if (!(keyAgreement !== undefined && hashMethod !== undefined && macMethod !== undefined && sasMethods.length)) {
      throw (0, _Error.newUnknownMethodError)();
    }
    const olmSAS = new global.Olm.SAS();
    try {
      const commitmentStr = olmSAS.get_pubkey() + _anotherJson.default.stringify(content);
      await this.send(_event.EventType.KeyVerificationAccept, {
        key_agreement_protocol: keyAgreement,
        hash: hashMethod,
        message_authentication_code: macMethod,
        short_authentication_string: sasMethods,
        // TODO: use selected hash function (when we support multiple)
        commitment: olmutil.sha256(commitmentStr)
      });
      const e = await this.waitForEvent(_event.EventType.KeyVerificationKey);
      // FIXME: make sure event is properly formed
      content = e.getContent();
      this.theirSASPubKey = content.key;
      olmSAS.set_their_key(content.key);
      this.ourSASPubKey = olmSAS.get_pubkey();
      await this.send(_event.EventType.KeyVerificationKey, {
        key: this.ourSASPubKey
      });
      await this.verifyAndCheckMAC(keyAgreement, sasMethods, olmSAS, macMethod);
    } finally {
      olmSAS.free();
    }
  }
  sendMAC(olmSAS, method) {
    const mac = {};
    const keyList = [];
    const baseInfo = "MATRIX_KEY_VERIFICATION_MAC" + this.baseApis.getUserId() + this.baseApis.deviceId + this.userId + this.deviceId + this.channel.transactionId;
    const deviceKeyId = `ed25519:${this.baseApis.deviceId}`;
    mac[deviceKeyId] = calculateMAC(olmSAS, method)(this.baseApis.getDeviceEd25519Key(), baseInfo + deviceKeyId);
    keyList.push(deviceKeyId);
    const crossSigningId = this.baseApis.getCrossSigningId();
    if (crossSigningId) {
      const crossSigningKeyId = `ed25519:${crossSigningId}`;
      mac[crossSigningKeyId] = calculateMAC(olmSAS, method)(crossSigningId, baseInfo + crossSigningKeyId);
      keyList.push(crossSigningKeyId);
    }
    const keys = calculateMAC(olmSAS, method)(keyList.sort().join(","), baseInfo + "KEY_IDS");
    return this.send(_event.EventType.KeyVerificationMac, {
      mac,
      keys
    });
  }
  async checkMAC(olmSAS, content, method) {
    const baseInfo = "MATRIX_KEY_VERIFICATION_MAC" + this.userId + this.deviceId + this.baseApis.getUserId() + this.baseApis.deviceId + this.channel.transactionId;
    if (content.keys !== calculateMAC(olmSAS, method)(Object.keys(content.mac).sort().join(","), baseInfo + "KEY_IDS")) {
      throw (0, _Error.newKeyMismatchError)();
    }
    await this.verifyKeys(this.userId, content.mac, (keyId, device, keyInfo) => {
      if (keyInfo !== calculateMAC(olmSAS, method)(device.keys[keyId], baseInfo + keyId)) {
        throw (0, _Error.newKeyMismatchError)();
      }
    });
  }
  getShowSasCallbacks() {
    return this.sasEvent ?? null;
  }
}
exports.SAS = SAS;