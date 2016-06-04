/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This module exports XMPPAuthMechanisms, an object containing all
// the supported SASL authentication mechanisms.
// By default we currently support the PLAIN and the DIGEST-MD5 mechanisms.
// As this is only used by XMPPSession, it may seem like an internal
// detail of the XMPP implementation, but exporting it is valuable so that
// add-ons can add support for more auth mechanisms easily by adding them
// in XMPPAuthMechanisms without having to modify XMPPSession.

this.EXPORTED_SYMBOLS = ["XMPPAuthMechanisms"];

var {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource://services-crypto/utils.js");
Cu.import("resource:///modules/xmpp-xml.jsm");

// Handle PLAIN authorization mechanism.
function* PlainAuth(aUsername, aPassword, aDomain) {
  let data = "\0"+ aUsername + "\0" + aPassword;

  // btoa for Unicode, see https://developer.mozilla.org/en-US/docs/DOM/window.btoa
  let base64Data = btoa(unescape(encodeURIComponent(data)));

  let stanza = yield {
    send: Stanza.node("auth", Stanza.NS.sasl, {mechanism: "PLAIN"},
                      base64Data),
    log: '<auth mechanism:="PLAIN"/> (base64 encoded username and password not logged)'
  };

  if (stanza.localName != "success")
    throw "Didn't receive the expected auth success stanza.";
}

// Handle SCRAM-SHA-1 authorization mechanism.
const RFC3454 = {
  A1: "\u0221|[\u0234-\u024f]|[\u02ae-\u02af]|[\u02ef-\u02ff]|\
[\u0350-\u035f]|[\u0370-\u0373]|[\u0376-\u0379]|[\u037b-\u037d]|\
[\u037f-\u0383]|\u038b|\u038d|\u03a2|\u03cf|[\u03f7-\u03ff]|\u0487|\
\u04cf|[\u04f6-\u04f7]|[\u04fa-\u04ff]|[\u0510-\u0530]|\
[\u0557-\u0558]|\u0560|\u0588|[\u058b-\u0590]|\u05a2|\u05ba|\
[\u05c5-\u05cf]|[\u05eb-\u05ef]|[\u05f5-\u060b]|[\u060d-\u061a]|\
[\u061c-\u061e]|\u0620|[\u063b-\u063f]|[\u0656-\u065f]|\
[\u06ee-\u06ef]|\u06ff|\u070e|[\u072d-\u072f]|[\u074b-\u077f]|\
[\u07b2-\u0900]|\u0904|[\u093a-\u093b]|[\u094e-\u094f]|\
[\u0955-\u0957]|[\u0971-\u0980]|\u0984|[\u098d-\u098e]|\
[\u0991-\u0992]|\u09a9|\u09b1|[\u09b3-\u09b5]|[\u09ba-\u09bb]|\u09bd|\
[\u09c5-\u09c6]|[\u09c9-\u09ca]|[\u09ce-\u09d6]|[\u09d8-\u09db]|\
\u09de|[\u09e4-\u09e5]|[\u09fb-\u0a01]|[\u0a03-\u0a04]|\
[\u0a0b-\u0a0e]|[\u0a11-\u0a12]|\u0a29|\u0a31|\u0a34|\u0a37|\
[\u0a3a-\u0a3b]|\u0a3d|[\u0a43-\u0a46]|[\u0a49-\u0a4a]|\
[\u0a4e-\u0a58]|\u0a5d|[\u0a5f-\u0a65]|[\u0a75-\u0a80]|\u0a84|\u0a8c|\
\u0a8e|\u0a92|\u0aa9|\u0ab1|\u0ab4|[\u0aba-\u0abb]|\u0ac6|\u0aca|\
[\u0ace-\u0acf]|[\u0ad1-\u0adf]|[\u0ae1-\u0ae5]|[\u0af0-\u0b00]|\
\u0b04|[\u0b0d-\u0b0e]|[\u0b11-\u0b12]|\u0b29|\u0b31|[\u0b34-\u0b35]|\
[\u0b3a-\u0b3b]|[\u0b44-\u0b46]|[\u0b49-\u0b4a]|[\u0b4e-\u0b55]|\
[\u0b58-\u0b5b]|\u0b5e|[\u0b62-\u0b65]|[\u0b71-\u0b81]|\u0b84|\
[\u0b8b-\u0b8d]|\u0b91|[\u0b96-\u0b98]|\u0b9b|\u0b9d|[\u0ba0-\u0ba2]|\
[\u0ba5-\u0ba7]|[\u0bab-\u0bad]|\u0bb6|[\u0bba-\u0bbd]|\
[\u0bc3-\u0bc5]|\u0bc9|[\u0bce-\u0bd6]|[\u0bd8-\u0be6]|\
[\u0bf3-\u0c00]|\u0c04|\u0c0d|\u0c11|\u0c29|\u0c34|[\u0c3a-\u0c3d]|\
\u0c45|\u0c49|[\u0c4e-\u0c54]|[\u0c57-\u0c5f]|[\u0c62-\u0c65]|\
[\u0c70-\u0c81]|\u0c84|\u0c8d|\u0c91|\u0ca9|\u0cb4|[\u0cba-\u0cbd]|\
\u0cc5|\u0cc9|[\u0cce-\u0cd4]|[\u0cd7-\u0cdd]|\u0cdf|[\u0ce2-\u0ce5]|\
[\u0cf0-\u0d01]|\u0d04|\u0d0d|\u0d11|\u0d29|[\u0d3a-\u0d3d]|\
[\u0d44-\u0d45]|\u0d49|[\u0d4e-\u0d56]|[\u0d58-\u0d5f]|\
[\u0d62-\u0d65]|[\u0d70-\u0d81]|\u0d84|[\u0d97-\u0d99]|\u0db2|\u0dbc|\
[\u0dbe-\u0dbf]|[\u0dc7-\u0dc9]|[\u0dcb-\u0dce]|\u0dd5|\u0dd7|\
[\u0de0-\u0df1]|[\u0df5-\u0e00]|[\u0e3b-\u0e3e]|[\u0e5c-\u0e80]|\
\u0e83|[\u0e85-\u0e86]|\u0e89|[\u0e8b-\u0e8c]|[\u0e8e-\u0e93]|\u0e98|\
\u0ea0|\u0ea4|\u0ea6|[\u0ea8-\u0ea9]|\u0eac|\u0eba|[\u0ebe-\u0ebf]|\
\u0ec5|\u0ec7|[\u0ece-\u0ecf]|[\u0eda-\u0edb]|[\u0ede-\u0eff]|\u0f48|\
[\u0f6b-\u0f70]|[\u0f8c-\u0f8f]|\u0f98|\u0fbd|[\u0fcd-\u0fce]|\
[\u0fd0-\u0fff]|\u1022|\u1028|\u102b|[\u1033-\u1035]|[\u103a-\u103f]|\
[\u105a-\u109f]|[\u10c6-\u10cf]|[\u10f9-\u10fa]|[\u10fc-\u10ff]|\
[\u115a-\u115e]|[\u11a3-\u11a7]|[\u11fa-\u11ff]|\u1207|\u1247|\u1249|\
[\u124e-\u124f]|\u1257|\u1259|[\u125e-\u125f]|\u1287|\u1289|\
[\u128e-\u128f]|\u12af|\u12b1|[\u12b6-\u12b7]|\u12bf|\u12c1|\
[\u12c6-\u12c7]|\u12cf|\u12d7|\u12ef|\u130f|\u1311|[\u1316-\u1317]|\
\u131f|\u1347|[\u135b-\u1360]|[\u137d-\u139f]|[\u13f5-\u1400]|\
[\u1677-\u167f]|[\u169d-\u169f]|[\u16f1-\u16ff]|\u170d|\
[\u1715-\u171f]|[\u1737-\u173f]|[\u1754-\u175f]|\u176d|\u1771|\
[\u1774-\u177f]|[\u17dd-\u17df]|[\u17ea-\u17ff]|\u180f|\
[\u181a-\u181f]|[\u1878-\u187f]|[\u18aa-\u1dff]|[\u1e9c-\u1e9f]|\
[\u1efa-\u1eff]|[\u1f16-\u1f17]|[\u1f1e-\u1f1f]|[\u1f46-\u1f47]|\
[\u1f4e-\u1f4f]|\u1f58|\u1f5a|\u1f5c|\u1f5e|[\u1f7e-\u1f7f]|\u1fb5|\
\u1fc5|[\u1fd4-\u1fd5]|\u1fdc|[\u1ff0-\u1ff1]|\u1ff5|\u1fff|\
[\u2053-\u2056]|[\u2058-\u205e]|[\u2064-\u2069]|[\u2072-\u2073]|\
[\u208f-\u209f]|[\u20b2-\u20cf]|[\u20eb-\u20ff]|[\u213b-\u213c]|\
[\u214c-\u2152]|[\u2184-\u218f]|[\u23cf-\u23ff]|[\u2427-\u243f]|\
[\u244b-\u245f]|\u24ff|[\u2614-\u2615]|\u2618|[\u267e-\u267f]|\
[\u268a-\u2700]|\u2705|[\u270a-\u270b]|\u2728|\u274c|\u274e|\
[\u2753-\u2755]|\u2757|[\u275f-\u2760]|[\u2795-\u2797]|\u27b0|\
[\u27bf-\u27cf]|[\u27ec-\u27ef]|[\u2b00-\u2e7f]|\u2e9a|\
[\u2ef4-\u2eff]|[\u2fd6-\u2fef]|[\u2ffc-\u2fff]|\u3040|\
[\u3097-\u3098]|[\u3100-\u3104]|[\u312d-\u3130]|\u318f|\
[\u31b8-\u31ef]|[\u321d-\u321f]|[\u3244-\u3250]|[\u327c-\u327e]|\
[\u32cc-\u32cf]|\u32ff|[\u3377-\u337a]|[\u33de-\u33df]|\u33ff|\
[\u4db6-\u4dff]|[\u9fa6-\u9fff]|[\ua48d-\ua48f]|[\ua4c7-\uabff]|\
[\ud7a4-\ud7ff]|[\ufa2e-\ufa2f]|[\ufa6b-\ufaff]|[\ufb07-\ufb12]|\
[\ufb18-\ufb1c]|\ufb37|\ufb3d|\ufb3f|\ufb42|\ufb45|[\ufbb2-\ufbd2]|\
[\ufd40-\ufd4f]|[\ufd90-\ufd91]|[\ufdc8-\ufdcf]|[\ufdfd-\ufdff]|\
[\ufe10-\ufe1f]|[\ufe24-\ufe2f]|[\ufe47-\ufe48]|\ufe53|\ufe67|\
[\ufe6c-\ufe6f]|\ufe75|[\ufefd-\ufefe]|\uff00|[\uffbf-\uffc1]|\
[\uffc8-\uffc9]|[\uffd0-\uffd1]|[\uffd8-\uffd9]|[\uffdd-\uffdf]|\
\uffe7|[\uffef-\ufff8]|[\u{10000}-\u{102ff}]|\u{1031f}|\
[\u{10324}-\u{1032f}]|[\u{1034b}-\u{103ff}]|[\u{10426}-\u{10427}]|\
[\u{1044e}-\u{1cfff}]|[\u{1d0f6}-\u{1d0ff}]|[\u{1d127}-\u{1d129}]|\
[\u{1d1de}-\u{1d3ff}]|\u{1d455}|\u{1d49d}|[\u{1d4a0}-\u{1d4a1}]|\
[\u{1d4a3}-\u{1d4a4}]|[\u{1d4a7}-\u{1d4a8}]|\u{1d4ad}|\u{1d4ba}|\
\u{1d4bc}|\u{1d4c1}|\u{1d4c4}|\u{1d506}|[\u{1d50b}-\u{1d50c}]|\
\u{1d515}|\u{1d51d}|\u{1d53a}|\u{1d53f}|\u{1d545}|\
[\u{1d547}-\u{1d549}]|\u{1d551}|[\u{1d6a4}-\u{1d6a7}]|\
[\u{1d7ca}-\u{1d7cd}]|[\u{1d800}-\u{1fffd}]|[\u{2a6d7}-\u{2f7ff}]|\
[\u{2fa1e}-\u{2fffd}]|[\u{30000}-\u{3fffd}]|[\u{40000}-\u{4fffd}]|\
[\u{50000}-\u{5fffd}]|[\u{60000}-\u{6fffd}]|[\u{70000}-\u{7fffd}]|\
[\u{80000}-\u{8fffd}]|[\u{90000}-\u{9fffd}]|[\u{a0000}-\u{afffd}]|\
[\u{b0000}-\u{bfffd}]|[\u{c0000}-\u{cfffd}]|[\u{d0000}-\u{dfffd}]|\
\u{e0000}|[\u{e0002}-\u{e001f}]|[\u{e0080}-\u{efffd}]",
  B1: "\u00ad|\u034f|\u1806|[\u180b-\u180d]|[\u200b-\u200d]|\u2060|\
[\ufe00-\ufe0f]|\ufeff",
  C12: "\u00a0|\u1680|[\u2000-\u200b]|\u202f|\u205f|\u3000",
  C21: "[\u0000-\u001f]|\u007f",
  C22: "[\u0080-\u009f]|\u06dd|\u070f|\u180e|\u200c|\u200d|\u2028|\u2029|\
[\u2060-\u2063]|[\u206a-\u206f]|\ufeff|[\ufff9-\ufffc]",
  C3: "[\ue000-\uf8ff]|[\u{f0000}-\u{ffffd}]|[\u{100000}-\u{10fffd}]",
  C4: "[\ufdd0-\ufdef]|[\ufffe-\uffff]|[\u{1fffe}-\u{1ffff}]|\
[\u{2fffe}-\u{2ffff}]|[\u{3fffe}-\u{3ffff}]|[\u{4fffe}-\u{4ffff}]|\
[\u{5fffe}-\u{5ffff}]|[\u{6fffe}-\u{6ffff}]|[\u{7fffe}-\u{7ffff}]|\
[\u{8fffe}-\u{8ffff}]|[\u{9fffe}-\u{9ffff}]|[\u{afffe}-\u{affff}]|\
[\u{bfffe}-\u{bffff}]|[\u{cfffe}-\u{cffff}]|[\u{dfffe}-\u{dffff}]|\
[\u{efffe}-\u{effff}]|[\u{ffffe}-\u{fffff}]|[\u{10fffe}-\u{10ffff}]",
  C5: "[\ud800-\udfff]",
  C6: "\ufff9|[\ufffa-\ufffd]",
  C7: "[\u2ff0-\u2ffb]",
  C8: "\u0340|\u0341|\u200e|\u200f|[\u202a-\u202e]|[\u206a-\u206f]",
  C9: "\u{e0001}|[\u{e0020}-\u{e007f}]",
  D1: "\u05be|\u05c0|\u05c3|[\u05d0-\u05ea]|[\u05f0-\u05f4]|\u061b|\u061f|\
[\u0621-\u063a]|[\u0640-\u064a]|[\u066d-\u066f]|[\u0671-\u06d5]|\
\u06dd|[\u06e5-\u06e6]|[\u06fa-\u06fe]|[\u0700-\u070d]|\u0710|\
[\u0712-\u072c]|[\u0780-\u07a5]|\u07b1|\u200f|\ufb1d|[\ufb1f-\ufb28]|\
[\ufb2a-\ufb36]|[\ufb38-\ufb3c]|\ufb3e|[\ufb40-\ufb41]|\
[\ufb43-\ufb44]|[\ufb46-\ufbb1]|[\ufbd3-\ufd3d]|[\ufd50-\ufd8f]|\
[\ufd92-\ufdc7]|[\ufdf0-\ufdfc]|[\ufe70-\ufe74]|[\ufe76-\ufefc]",
  D2: "[\u0041-\u005a]|[\u0061-\u007a]|\u00aa|\u00b5|\u00ba|[\u00c0-\u00d6]|\
[\u00d8-\u00f6]|[\u00f8-\u0220]|[\u0222-\u0233]|[\u0250-\u02ad]|\
[\u02b0-\u02b8]|[\u02bb-\u02c1]|[\u02d0-\u02d1]|[\u02e0-\u02e4]|\
\u02ee|\u037a|\u0386|[\u0388-\u038a]|\u038c|[\u038e-\u03a1]|\
[\u03a3-\u03ce]|[\u03d0-\u03f5]|[\u0400-\u0482]|[\u048a-\u04ce]|\
[\u04d0-\u04f5]|[\u04f8-\u04f9]|[\u0500-\u050f]|[\u0531-\u0556]|\
[\u0559-\u055f]|[\u0561-\u0587]|\u0589|\u0903|[\u0905-\u0939]|\
[\u093d-\u0940]|[\u0949-\u094c]|\u0950|[\u0958-\u0961]|\
[\u0964-\u0970]|[\u0982-\u0983]|[\u0985-\u098c]|[\u098f-\u0990]|\
[\u0993-\u09a8]|[\u09aa-\u09b0]|\u09b2|[\u09b6-\u09b9]|\
[\u09be-\u09c0]|[\u09c7-\u09c8]|[\u09cb-\u09cc]|\u09d7|\
[\u09dc-\u09dd]|[\u09df-\u09e1]|[\u09e6-\u09f1]|[\u09f4-\u09fa]|\
[\u0a05-\u0a0a]|[\u0a0f-\u0a10]|[\u0a13-\u0a28]|[\u0a2a-\u0a30]|\
[\u0a32-\u0a33]|[\u0a35-\u0a36]|[\u0a38-\u0a39]|[\u0a3e-\u0a40]|\
[\u0a59-\u0a5c]|\u0a5e|[\u0a66-\u0a6f]|[\u0a72-\u0a74]|\u0a83|\
[\u0a85-\u0a8b]|\u0a8d|[\u0a8f-\u0a91]|[\u0a93-\u0aa8]|\
[\u0aaa-\u0ab0]|[\u0ab2-\u0ab3]|[\u0ab5-\u0ab9]|[\u0abd-\u0ac0]|\
\u0ac9|[\u0acb-\u0acc]|\u0ad0|\u0ae0|[\u0ae6-\u0aef]|[\u0b02-\u0b03]|\
[\u0b05-\u0b0c]|[\u0b0f-\u0b10]|[\u0b13-\u0b28]|[\u0b2a-\u0b30]|\
[\u0b32-\u0b33]|[\u0b36-\u0b39]|[\u0b3d-\u0b3e]|\u0b40|\
[\u0b47-\u0b48]|[\u0b4b-\u0b4c]|\u0b57|[\u0b5c-\u0b5d]|\
[\u0b5f-\u0b61]|[\u0b66-\u0b70]|\u0b83|[\u0b85-\u0b8a]|\
[\u0b8e-\u0b90]|[\u0b92-\u0b95]|[\u0b99-\u0b9a]|\u0b9c|\
[\u0b9e-\u0b9f]|[\u0ba3-\u0ba4]|[\u0ba8-\u0baa]|[\u0bae-\u0bb5]|\
[\u0bb7-\u0bb9]|[\u0bbe-\u0bbf]|[\u0bc1-\u0bc2]|[\u0bc6-\u0bc8]|\
[\u0bca-\u0bcc]|\u0bd7|[\u0be7-\u0bf2]|[\u0c01-\u0c03]|\
[\u0c05-\u0c0c]|[\u0c0e-\u0c10]|[\u0c12-\u0c28]|[\u0c2a-\u0c33]|\
[\u0c35-\u0c39]|[\u0c41-\u0c44]|[\u0c60-\u0c61]|[\u0c66-\u0c6f]|\
[\u0c82-\u0c83]|[\u0c85-\u0c8c]|[\u0c8e-\u0c90]|[\u0c92-\u0ca8]|\
[\u0caa-\u0cb3]|[\u0cb5-\u0cb9]|\u0cbe|[\u0cc0-\u0cc4]|\
[\u0cc7-\u0cc8]|[\u0cca-\u0ccb]|[\u0cd5-\u0cd6]|\u0cde|\
[\u0ce0-\u0ce1]|[\u0ce6-\u0cef]|[\u0d02-\u0d03]|[\u0d05-\u0d0c]|\
[\u0d0e-\u0d10]|[\u0d12-\u0d28]|[\u0d2a-\u0d39]|[\u0d3e-\u0d40]|\
[\u0d46-\u0d48]|[\u0d4a-\u0d4c]|\u0d57|[\u0d60-\u0d61]|\
[\u0d66-\u0d6f]|[\u0d82-\u0d83]|[\u0d85-\u0d96]|[\u0d9a-\u0db1]|\
[\u0db3-\u0dbb]|\u0dbd|[\u0dc0-\u0dc6]|[\u0dcf-\u0dd1]|\
[\u0dd8-\u0ddf]|[\u0df2-\u0df4]|[\u0e01-\u0e30]|[\u0e32-\u0e33]|\
[\u0e40-\u0e46]|[\u0e4f-\u0e5b]|[\u0e81-\u0e82]|\u0e84|\
[\u0e87-\u0e88]|\u0e8a|\u0e8d|[\u0e94-\u0e97]|[\u0e99-\u0e9f]|\
[\u0ea1-\u0ea3]|\u0ea5|\u0ea7|[\u0eaa-\u0eab]|[\u0ead-\u0eb0]|\
[\u0eb2-\u0eb3]|\u0ebd|[\u0ec0-\u0ec4]|\u0ec6|[\u0ed0-\u0ed9]|\
[\u0edc-\u0edd]|[\u0f00-\u0f17]|[\u0f1a-\u0f34]|\u0f36|\u0f38|\
[\u0f3e-\u0f47]|[\u0f49-\u0f6a]|\u0f7f|\u0f85|[\u0f88-\u0f8b]|\
[\u0fbe-\u0fc5]|[\u0fc7-\u0fcc]|\u0fcf|[\u1000-\u1021]|\
[\u1023-\u1027]|[\u1029-\u102a]|\u102c|\u1031|\u1038|[\u1040-\u1057]|\
[\u10a0-\u10c5]|[\u10d0-\u10f8]|\u10fb|[\u1100-\u1159]|\
[\u115f-\u11a2]|[\u11a8-\u11f9]|[\u1200-\u1206]|[\u1208-\u1246]|\
\u1248|[\u124a-\u124d]|[\u1250-\u1256]|\u1258|[\u125a-\u125d]|\
[\u1260-\u1286]|\u1288|[\u128a-\u128d]|[\u1290-\u12ae]|\u12b0|\
[\u12b2-\u12b5]|[\u12b8-\u12be]|\u12c0|[\u12c2-\u12c5]|\
[\u12c8-\u12ce]|[\u12d0-\u12d6]|[\u12d8-\u12ee]|[\u12f0-\u130e]|\
\u1310|[\u1312-\u1315]|[\u1318-\u131e]|[\u1320-\u1346]|\
[\u1348-\u135a]|[\u1361-\u137c]|[\u13a0-\u13f4]|[\u1401-\u1676]|\
[\u1681-\u169a]|[\u16a0-\u16f0]|[\u1700-\u170c]|[\u170e-\u1711]|\
[\u1720-\u1731]|[\u1735-\u1736]|[\u1740-\u1751]|[\u1760-\u176c]|\
[\u176e-\u1770]|[\u1780-\u17b6]|[\u17be-\u17c5]|[\u17c7-\u17c8]|\
[\u17d4-\u17da]|\u17dc|[\u17e0-\u17e9]|[\u1810-\u1819]|\
[\u1820-\u1877]|[\u1880-\u18a8]|[\u1e00-\u1e9b]|[\u1ea0-\u1ef9]|\
[\u1f00-\u1f15]|[\u1f18-\u1f1d]|[\u1f20-\u1f45]|[\u1f48-\u1f4d]|\
[\u1f50-\u1f57]|\u1f59|\u1f5b|\u1f5d|[\u1f5f-\u1f7d]|[\u1f80-\u1fb4]|\
[\u1fb6-\u1fbc]|\u1fbe|[\u1fc2-\u1fc4]|[\u1fc6-\u1fcc]|\
[\u1fd0-\u1fd3]|[\u1fd6-\u1fdb]|[\u1fe0-\u1fec]|[\u1ff2-\u1ff4]|\
[\u1ff6-\u1ffc]|\u200e|\u2071|\u207f|\u2102|\u2107|[\u210a-\u2113]|\
\u2115|[\u2119-\u211d]|\u2124|\u2126|\u2128|[\u212a-\u212d]|\
[\u212f-\u2131]|[\u2133-\u2139]|[\u213d-\u213f]|[\u2145-\u2149]|\
[\u2160-\u2183]|[\u2336-\u237a]|\u2395|[\u249c-\u24e9]|\
[\u3005-\u3007]|[\u3021-\u3029]|[\u3031-\u3035]|[\u3038-\u303c]|\
[\u3041-\u3096]|[\u309d-\u309f]|[\u30a1-\u30fa]|[\u30fc-\u30ff]|\
[\u3105-\u312c]|[\u3131-\u318e]|[\u3190-\u31b7]|[\u31f0-\u321c]|\
[\u3220-\u3243]|[\u3260-\u327b]|[\u327f-\u32b0]|[\u32c0-\u32cb]|\
[\u32d0-\u32fe]|[\u3300-\u3376]|[\u337b-\u33dd]|[\u33e0-\u33fe]|\
[\u3400-\u4db5]|[\u4e00-\u9fa5]|[\ua000-\ua48c]|[\uac00-\ud7a3]|\
[\ud800-\ufa2d]|[\ufa30-\ufa6a]|[\ufb00-\ufb06]|[\ufb13-\ufb17]|\
[\uff21-\uff3a]|[\uff41-\uff5a]|[\uff66-\uffbe]|[\uffc2-\uffc7]|\
[\uffca-\uffcf]|[\uffd2-\uffd7]|[\uffda-\uffdc]|[\u{10300}-\u{1031e}]|\
[\u{10320}-\u{10323}]|[\u{10330}-\u{1034a}]|[\u{10400}-\u{10425}]|\
[\u{10428}-\u{1044d}]|[\u{1d000}-\u{1d0f5}]|[\u{1d100}-\u{1d126}]|\
[\u{1d12a}-\u{1d166}]|[\u{1d16a}-\u{1d172}]|[\u{1d183}-\u{1d184}]|\
[\u{1d18c}-\u{1d1a9}]|[\u{1d1ae}-\u{1d1dd}]|[\u{1d400}-\u{1d454}]|\
[\u{1d456}-\u{1d49c}]|[\u{1d49e}-\u{1d49f}]|\u{1d4a2}|\
[\u{1d4a5}-\u{1d4a6}]|[\u{1d4a9}-\u{1d4ac}]|[\u{1d4ae}-\u{1d4b9}]|\
\u{1d4bb}|[\u{1d4bd}-\u{1d4c0}]|[\u{1d4c2}-\u{1d4c3}]|\
[\u{1d4c5}-\u{1d505}]|[\u{1d507}-\u{1d50a}]|[\u{1d50d}-\u{1d514}]|\
[\u{1d516}-\u{1d51c}]|[\u{1d51e}-\u{1d539}]|[\u{1d53b}-\u{1d53e}]|\
[\u{1d540}-\u{1d544}]|\u{1d546}|[\u{1d54a}-\u{1d550}]|\
[\u{1d552}-\u{1d6a3}]|[\u{1d6a8}-\u{1d7c9}]|[\u{20000}-\u{2a6d6}]|\
[\u{2f800}-\u{2fa1d}]|[\u{f0000}-\u{ffffd}]|[\u{100000}-\u{10fffd}]"
};

// Generates a random nonce and returns a base64 encoded string.
// aLength in bytes.
function createNonce(aLength) {
  // RFC 5802 (5.1): Printable ASCII except ",".
  // We guarantee a vaild nonce value using base64 encoding.
  return btoa(CryptoUtils.generateRandomBytes(aLength));
}

// Parses the string of server's response (aChallenge) into an object.
function parseChallenge(aChallenge) {
  let attributes = {};
  aChallenge.split(",").forEach(value => {
    let match =  /^(\w)=([\s\S]*)$/.exec(value);
    if (match)
      attributes[match[1]] = match[2];
  });
  return attributes;
}

// RFC 4013 and RFC 3454: Stringprep Profile for User Names and Passwords.
function saslPrep(aString) {
  // RFC 4013 2.1: non-ASCII space characters (RFC 3454 C.1.2) mapped to space.
  let retVal = aString.replace(new RegExp(RFC3454.C12, "u"), " ");

  // RFC 4013 2.1: RFC 3454 3.1, B.1: Map certain codepoints to nothing.
  retVal = retVal.replace(new RegExp(RFC3454.B1, "u"), "");

  // RFC 4013 2.2 asks for Unicode normalization form KC, which corresponds to
  // RFC 3454 B.2.
  retVal = retVal.normalize("NFKC");

  // RFC 4013 2.3: Prohibited Output and 2.5: Unassigned Code Points.
  let matchStr =
    RFC3454.C12 + "|" + RFC3454.C21 + "|" + RFC3454.C22 + "|" + RFC3454.C3 +
    "|" + RFC3454.C4 + "|" + RFC3454.C5 + "|" + RFC3454.C6 + "|" + RFC3454.C7 +
    "|" + RFC3454.C8 + "|" + RFC3454.C9 + "|" + RFC3454.A1;
  let match = new RegExp(matchStr, "u").test(retVal);
  if (match)
    throw "String contains prohibited characters";

  // RFC 4013 2.4: Bidirectional Characters.
  let r = new RegExp(RFC3454.D1, "u").test(retVal);
  let l = new RegExp(RFC3454.D2, "u").test(retVal);
  if (l && r)
    throw "String must not contain LCat and RandALCat characters together";
  else if (r) {
    let matchFirst = new RegExp("^(" + RFC3454.D1 + ")", "u").test(retVal);
    let matchLast = new RegExp("(" + RFC3454.D1 + ")$", "u").test(retVal);
    if (!matchFirst || !matchLast)
      throw "A RandALCat character must be the first and the last character";
  }

  return retVal;
}

// Converts aName to saslname.
function saslName(aName) {
  // RFC 5802 (5.1): the client SHOULD prepare the username using the "SASLprep".
  // The characters ’,’ or ’=’ in usernames are sent as ’=2C’ and
  // ’=3D’ respectively.
  let saslName = saslPrep(aName).replace(/=/g,"=3D").replace(/,/g, "=2C");
  if (!saslName)
    throw "Name is not valid";

  return saslName;
}

// Converts aMessage to array of bytes then apply SHA-1 hashing.
function bytesAndSHA1(aMessage) {
  let hasher =
    Cc["@mozilla.org/security/hash;1"].createInstance(Ci.nsICryptoHash);
  hasher.init(hasher.SHA1);

  return CryptoUtils.digestBytes(aMessage, hasher);
}

function* scramSHA1Auth(aUsername, aPassword, aDomain) {
  // RFC 5802 (5): SCRAM Authentication Exchange.
  const gs2Header = "n,,";
  let cNonce = createNonce(32);

  let clientFirstMessageBare =
    "n=" + saslName(aUsername) + ",r=" + cNonce;
  let clientFirstMessage = gs2Header + clientFirstMessageBare;

  let receivedStanza = yield {
    send: Stanza.node("auth", Stanza.NS.sasl, {mechanism: "SCRAM-SHA-1"},
                      btoa(clientFirstMessage))
  };

  if (receivedStanza.localName != "challenge")
    throw "Not authorized";

  // RFC 5802 (3): SCRAM Algorithm Overview.
  let decodedChallenge = atob(receivedStanza.innerText);

  // Expected to contain the user’s iteration count (i) and the user’s
  // salt (s), and the server appends its own nonce to the client-specified
  // one (r).
  let attributes = parseChallenge(decodedChallenge);
  if (attributes.hasOwnProperty("e"))
    throw "Authentication failed: " + attributes.e;
  else if (!attributes.hasOwnProperty("i") ||
           !attributes.hasOwnProperty("s") ||
           !attributes.hasOwnProperty("r")) {
    throw "Unexpected response: " + decodedChallenge;
  }
  if (!attributes.r.startsWith(cNonce))
    throw "Nonce is not correct";

  let clientFinalMessageWithoutProof =
    "c=" + btoa(gs2Header) + ",r=" + attributes.r;

  // Calculate ClientProof.

  // SaltedPassword := Hi(Normalize(password), salt, i)
  // Normalize using saslPrep.
  // dkLen MUST be equal to the SHA-1 digest size.
  let saltedPassword =
    CryptoUtils.pbkdf2Generate(saslPrep(aPassword), atob(attributes.s),
                               parseInt(attributes.i), 20);

  // ClientKey := HMAC(SaltedPassword, "Client Key")
  let saltedPasswordHasher =
    CryptoUtils.makeHMACHasher(Ci.nsICryptoHMAC.SHA1,
                               CryptoUtils.makeHMACKey(saltedPassword));
  let clientKey = CryptoUtils.digestBytes("Client Key", saltedPasswordHasher);

  // StoredKey := H(ClientKey)
  let storedKey = bytesAndSHA1(clientKey);

  let authMessage =
    clientFirstMessageBare + "," + decodedChallenge + "," +
    clientFinalMessageWithoutProof;

  // ClientSignature := HMAC(StoredKey, AuthMessage)
  let storedKeyHasher =
    CryptoUtils.makeHMACHasher(Ci.nsICryptoHMAC.SHA1,
                               CryptoUtils.makeHMACKey(storedKey));
  let clientSignature = CryptoUtils.digestBytes(authMessage, storedKeyHasher);

  // ClientProof := ClientKey XOR ClientSignature
  let clientProof = CryptoUtils.xor(clientKey, clientSignature);

  // Calculate ServerSignature.

  // ServerKey := HMAC(SaltedPassword, "Server Key")
  let serverKey = CryptoUtils.digestBytes("Server Key", saltedPasswordHasher);

  // ServerSignature := HMAC(ServerKey, AuthMessage)
  let serverKeyHasher =
    CryptoUtils.makeHMACHasher(Ci.nsICryptoHMAC.SHA1,
                               CryptoUtils.makeHMACKey(serverKey));
  let serverSignature = CryptoUtils.digestBytes(authMessage, serverKeyHasher);

  let clientFinalMessage =
    clientFinalMessageWithoutProof + ",p=" + btoa(clientProof);

  receivedStanza = yield {
    send: Stanza.node("response", Stanza.NS.sasl, null, btoa(clientFinalMessage)),
    log: '<response/> (base64 encoded SCRAM response containing password not logged)'
  };

  // Only check server signature if we succeed to authenticate.
  if (receivedStanza.localName != "success")
    throw "Didn't receive the expected auth success stanza.";

  let decodedResponse = atob(receivedStanza.innerText);

  // Expected to contain a base64-encoded ServerSignature (v).
  attributes = parseChallenge(decodedResponse);
  if (!attributes.hasOwnProperty("v"))
    throw "Unexpected response: " + decodedResponse;

  // Compare ServerSignature with our ServerSignature which we calculated in
  // _generateResponse.
  let serverSignatureResponse = atob(attributes.v);
  if (serverSignature != serverSignatureResponse)
    throw "Server signature does not match";
}

var XMPPAuthMechanisms = {"PLAIN": PlainAuth, "SCRAM-SHA-1": scramSHA1Auth};
