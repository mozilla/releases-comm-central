/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const otrl_version = [4, 1, 1];

const { CLib } = ChromeUtils.import("resource:///modules/CLib.jsm");
const { ctypes } = ChromeUtils.import("resource://gre/modules/ctypes.jsm");
const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var systemOS = Services.appinfo.OS.toLowerCase();

var abi = ctypes.default_abi;

var libotr, libotrPath;

function getLibraryFilename(baseName, suffix) {
  return ctypes.libraryName(baseName) + suffix;
}

function getSystemVersionedFilename() {
  let baseName;
  let suffix;

  switch (systemOS) {
    case "winnt":
      baseName = "libotr-5";
      suffix = "";
      break;
    case "darwin":
      baseName = "otr.5";
      suffix = "";
      break;
    default:
      baseName = "otr";
      suffix = ".5";
      break;
  }

  return getLibraryFilename(baseName, suffix);
}

function getDistributionFilename() {
  let baseName;
  let suffix;

  if (systemOS === "winnt") {
    baseName = "libotr";
    suffix = "";
  } else {
    baseName = "otr";
    suffix = "";
  }

  return getLibraryFilename(baseName, suffix);
}

function getDistributionFullPath() {
  let binPath = Services.dirsvc.get("XpcomLib", Ci.nsIFile).path;
  let binDir = PathUtils.parent(binPath);
  return PathUtils.join(binDir, getDistributionFilename());
}

function tryLoadOTR(filename, info) {
  console.debug(`Trying to load ${filename}${info}`);
  libotrPath = filename;

  try {
    libotr = ctypes.open(filename);
  } catch (e) {}

  if (libotr) {
    console.debug("Successfully loaded OTR library " + filename + info);
  }
}

function loadExternalOTRLib() {
  const systemInfo = " from system's standard library locations";

  // Try to load using an absolute path from our install directory
  if (!libotr) {
    tryLoadOTR(getDistributionFullPath(), "");
  }

  // Try to load using our expected filename from system directories
  if (!libotr) {
    tryLoadOTR(getDistributionFilename(), systemInfo);
  }

  // Try to load using a versioned library name
  if (!libotr) {
    tryLoadOTR(getSystemVersionedFilename(), systemInfo);
  }

  // Try other filenames

  if (!libotr && systemOS == "winnt") {
    tryLoadOTR(getLibraryFilename("otr.5", ""), systemInfo);
  }

  if (!libotr && systemOS == "winnt") {
    tryLoadOTR(getLibraryFilename("otr-5", ""), systemInfo);
  }

  if (!libotr) {
    tryLoadOTR(getLibraryFilename("otr", ""), systemInfo);
  }

  if (!libotr) {
    throw new Error("Cannot load required OTR library");
  }
}

var OTRLibLoader = {
  init() {
    loadExternalOTRLib();
    if (libotr) {
      enableOTRLibJS();
    }
    return OTRLib;
  },
};

// Helper function to open files with the path properly encoded.
var callWithFILEp = function() {
  // Windows filenames are in UTF-16.
  let charType = systemOS === "winnt" ? "jschar" : "char";

  let args = Array.from(arguments);
  let func = args.shift() + "_FILEp";
  let mode = ctypes[charType].array()(args.shift());
  let ind = args.shift();
  let filename = ctypes[charType].array()(args[ind]);

  let file = CLib.fopen(filename, mode);
  if (file.isNull()) {
    return 1;
  }

  // Swap filename with file.
  args[ind] = file;

  let ret = OTRLib[func].apply(OTRLib, args);
  CLib.fclose(file);
  return ret;
};

// type defs

const FILE = CLib.FILE;

const time_t = ctypes.long;
const gcry_error_t = ctypes.unsigned_int;
const gcry_cipher_hd_t = ctypes.StructType("gcry_cipher_handle").ptr;
const gcry_md_hd_t = ctypes.StructType("gcry_md_handle").ptr;
const gcry_mpi_t = ctypes.StructType("gcry_mpi").ptr;

const otrl_instag_t = ctypes.unsigned_int;
const OtrlPolicy = ctypes.unsigned_int;
const OtrlTLV = ctypes.StructType("s_OtrlTLV");
const ConnContext = ctypes.StructType("context");
const ConnContextPriv = ctypes.StructType("context_priv");
const OtrlMessageAppOps = ctypes.StructType("s_OtrlMessageAppOps");
const OtrlAuthInfo = ctypes.StructType("OtrlAuthInfo");
const Fingerprint = ctypes.StructType("s_fingerprint");
const s_OtrlUserState = ctypes.StructType("s_OtrlUserState");
const OtrlUserState = s_OtrlUserState.ptr;
const OtrlSMState = ctypes.StructType("OtrlSMState");
const DH_keypair = ctypes.StructType("DH_keypair");
const OtrlPrivKey = ctypes.StructType("s_OtrlPrivKey");
const OtrlInsTag = ctypes.StructType("s_OtrlInsTag");
const OtrlPendingPrivKey = ctypes.StructType("s_OtrlPendingPrivKey");

const OTRL_PRIVKEY_FPRINT_HUMAN_LEN = 45;
const fingerprint_t = ctypes.char.array(OTRL_PRIVKEY_FPRINT_HUMAN_LEN);
const hash_t = ctypes.unsigned_char.array(20);

const app_data_free_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr,
]).ptr;

// enums

const OtrlErrorCode = ctypes.int;
const OtrlSMPEvent = ctypes.int;
const OtrlMessageEvent = ctypes.int;
const OtrlFragmentPolicy = ctypes.int;
const OtrlConvertType = ctypes.int;
const OtrlMessageState = ctypes.int;
const OtrlAuthState = ctypes.int;
const OtrlSessionIdHalf = ctypes.int;
const OtrlSMProgState = ctypes.int;
const NextExpectedSMP = ctypes.int;

// callback signatures

const policy_cb_t = ctypes.FunctionType(abi, OtrlPolicy, [
  ctypes.void_t.ptr,
  ConnContext.ptr,
]).ptr;

const create_privkey_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr,
  ctypes.char.ptr,
  ctypes.char.ptr,
]).ptr;

const is_logged_in_cb_t = ctypes.FunctionType(abi, ctypes.int, [
  ctypes.void_t.ptr,
  ctypes.char.ptr,
  ctypes.char.ptr,
  ctypes.char.ptr,
]).ptr;

const inject_message_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr,
  ctypes.char.ptr,
  ctypes.char.ptr,
  ctypes.char.ptr,
  ctypes.char.ptr,
]).ptr;

const update_context_list_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr,
]).ptr;

const new_fingerprint_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr,
  OtrlUserState,
  ctypes.char.ptr,
  ctypes.char.ptr,
  ctypes.char.ptr,
  ctypes.unsigned_char.array(20),
]).ptr;

const write_fingerprint_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr,
]).ptr;

const gone_secure_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr,
  ConnContext.ptr,
]).ptr;

const gone_insecure_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr,
  ConnContext.ptr,
]).ptr;

const still_secure_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr,
  ConnContext.ptr,
  ctypes.int,
]).ptr;

const max_message_size_cb_t = ctypes.FunctionType(abi, ctypes.int, [
  ctypes.void_t.ptr,
  ConnContext.ptr,
]).ptr;

const account_name_cb_t = ctypes.FunctionType(abi, ctypes.char.ptr, [
  ctypes.void_t.ptr,
  ctypes.char.ptr,
  ctypes.char.ptr,
]).ptr;

const account_name_free_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr,
  ctypes.char.ptr,
]).ptr;

const received_symkey_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr,
  ConnContext.ptr,
  ctypes.unsigned_int,
  ctypes.unsigned_char.ptr,
  ctypes.size_t,
  ctypes.unsigned_char.ptr,
]).ptr;

const otr_error_message_cb_t = ctypes.FunctionType(abi, ctypes.char.ptr, [
  ctypes.void_t.ptr,
  ConnContext.ptr,
  OtrlErrorCode,
]).ptr;

const otr_error_message_free_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr,
  ctypes.char.ptr,
]).ptr;

const resent_msg_prefix_cb_t = ctypes.FunctionType(abi, ctypes.char.ptr, [
  ctypes.void_t.ptr,
  ConnContext.ptr,
]).ptr;

const resent_msg_prefix_free_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr,
  ctypes.char.ptr,
]).ptr;

const handle_smp_event_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr,
  OtrlSMPEvent,
  ConnContext.ptr,
  ctypes.unsigned_short,
  ctypes.char.ptr,
]).ptr;

const handle_msg_event_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr,
  OtrlMessageEvent,
  ConnContext.ptr,
  ctypes.char.ptr,
  gcry_error_t,
]).ptr;

const create_instag_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr,
  ctypes.char.ptr,
  ctypes.char.ptr,
]).ptr;

const convert_msg_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr,
  ConnContext.ptr,
  OtrlConvertType,
  ctypes.char.ptr.ptr,
  ctypes.char.ptr,
]).ptr;

const convert_free_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr,
  ConnContext.ptr,
  ctypes.char.ptr,
]).ptr;

const timer_control_cb_t = ctypes.FunctionType(abi, ctypes.void_t, [
  ctypes.void_t.ptr,
  ctypes.unsigned_int,
]).ptr;

// defines

s_OtrlUserState.define([
  { context_root: ConnContext.ptr },
  { privkey_root: OtrlPrivKey.ptr },
  { instag_root: OtrlInsTag.ptr },
  { pending_root: OtrlPendingPrivKey.ptr },
  { timer_running: ctypes.int },
]);

Fingerprint.define([
  { next: Fingerprint.ptr },
  { tous: Fingerprint.ptr.ptr },
  { fingerprint: ctypes.unsigned_char.ptr },
  { context: ConnContext.ptr },
  { trust: ctypes.char.ptr },
]);

DH_keypair.define([
  { groupid: ctypes.unsigned_int },
  { priv: gcry_mpi_t },
  { pub: gcry_mpi_t },
]);

OtrlSMState.define([
  { secret: gcry_mpi_t },
  { x2: gcry_mpi_t },
  { x3: gcry_mpi_t },
  { g1: gcry_mpi_t },
  { g2: gcry_mpi_t },
  { g3: gcry_mpi_t },
  { g3o: gcry_mpi_t },
  { p: gcry_mpi_t },
  { q: gcry_mpi_t },
  { pab: gcry_mpi_t },
  { qab: gcry_mpi_t },
  { nextExpected: NextExpectedSMP },
  { received_question: ctypes.int },
  { sm_prog_state: OtrlSMProgState },
]);

OtrlAuthInfo.define([
  { authstate: OtrlAuthState },
  { context: ConnContext.ptr },
  { our_dh: DH_keypair },
  { our_keyid: ctypes.unsigned_int },
  { encgx: ctypes.unsigned_char.ptr },
  { encgx_len: ctypes.size_t },
  { r: ctypes.unsigned_char.array(16) },
  { hashgx: ctypes.unsigned_char.array(32) },
  { their_pub: gcry_mpi_t },
  { their_keyid: ctypes.unsigned_int },
  { enc_c: gcry_cipher_hd_t },
  { enc_cp: gcry_cipher_hd_t },
  { mac_m1: gcry_md_hd_t },
  { mac_m1p: gcry_md_hd_t },
  { mac_m2: gcry_md_hd_t },
  { mac_m2p: gcry_md_hd_t },
  { their_fingerprint: ctypes.unsigned_char.array(20) },
  { initiated: ctypes.int },
  { protocol_version: ctypes.unsigned_int },
  { secure_session_id: ctypes.unsigned_char.array(20) },
  { secure_session_id_len: ctypes.size_t },
  { session_id_half: OtrlSessionIdHalf },
  { lastauthmsg: ctypes.char.ptr },
  { commit_sent_time: time_t },
]);

ConnContext.define([
  { next: ConnContext.ptr },
  { tous: ConnContext.ptr.ptr },
  { context_priv: ConnContextPriv.ptr },
  { username: ctypes.char.ptr },
  { accountname: ctypes.char.ptr },
  { protocol: ctypes.char.ptr },
  { m_context: ConnContext.ptr },
  { recent_rcvd_child: ConnContext.ptr },
  { recent_sent_child: ConnContext.ptr },
  { recent_child: ConnContext.ptr },
  { our_instance: otrl_instag_t },
  { their_instance: otrl_instag_t },
  { msgstate: OtrlMessageState },
  { auth: OtrlAuthInfo },
  { fingerprint_root: Fingerprint },
  { active_fingerprint: Fingerprint.ptr },
  { sessionid: ctypes.unsigned_char.array(20) },
  { sessionid_len: ctypes.size_t },
  { sessionid_half: OtrlSessionIdHalf },
  { protocol_version: ctypes.unsigned_int },
  { otr_offer: ctypes.int },
  { app_data: ctypes.void_t.ptr },
  { app_data_free: app_data_free_t },
  { smstate: OtrlSMState.ptr },
]);

OtrlMessageAppOps.define([
  { policy: policy_cb_t },
  { create_privkey: create_privkey_cb_t },
  { is_logged_in: is_logged_in_cb_t },
  { inject_message: inject_message_cb_t },
  { update_context_list: update_context_list_cb_t },
  { new_fingerprint: new_fingerprint_cb_t },
  { write_fingerprint: write_fingerprint_cb_t },
  { gone_secure: gone_secure_cb_t },
  { gone_insecure: gone_insecure_cb_t },
  { still_secure: still_secure_cb_t },
  { max_message_size: max_message_size_cb_t },
  { account_name: account_name_cb_t },
  { account_name_free: account_name_free_cb_t },
  { received_symkey: received_symkey_cb_t },
  { otr_error_message: otr_error_message_cb_t },
  { otr_error_message_free: otr_error_message_free_cb_t },
  { resent_msg_prefix: resent_msg_prefix_cb_t },
  { resent_msg_prefix_free: resent_msg_prefix_free_cb_t },
  { handle_smp_event: handle_smp_event_cb_t },
  { handle_msg_event: handle_msg_event_cb_t },
  { create_instag: create_instag_cb_t },
  { convert_msg: convert_msg_cb_t },
  { convert_free: convert_free_cb_t },
  { timer_control: timer_control_cb_t },
]);

OtrlTLV.define([
  { type: ctypes.unsigned_short },
  { len: ctypes.unsigned_short },
  { data: ctypes.unsigned_char.ptr },
  { next: OtrlTLV.ptr },
]);

// policies

// const OTRL_POLICY_ALLOW_V1 = 0x01;
const OTRL_POLICY_ALLOW_V2 = 0x02;

// const OTRL_POLICY_ALLOW_V3 = 0x04;
// See https://bugzilla.mozilla.org/show_bug.cgi?id=1550474 re v3.

const OTRL_POLICY_REQUIRE_ENCRYPTION = 0x08;
const OTRL_POLICY_SEND_WHITESPACE_TAG = 0x10;
const OTRL_POLICY_WHITESPACE_START_AKE = 0x20;

// const OTRL_POLICY_ERROR_START_AKE = 0x40;
// Disabled to avoid automatic resend and MITM, as explained in
// https://github.com/arlolra/ctypes-otr/issues/55

var OTRLib;

function enableOTRLibJS() {
  // this must be delayed until after "libotr" is initialized

  OTRLib = {
    path: libotrPath,

    // libotr API version
    otrl_version,

    init() {
      // apply version array as arguments to the init function
      if (this.otrl_init.apply(this, this.otrl_version)) {
        throw new Error("Couldn't initialize libotr.");
      }
      return true;
    },

    // proto.h

    // If we ever see this sequence in a plaintext message, we'll assume the
    // other side speaks OTR, and try to establish a connection.
    OTRL_MESSAGE_TAG_BASE: " \t  \t\t\t\t \t \t \t  ",

    OTRL_POLICY_OPPORTUNISTIC: new ctypes.unsigned_int(
      OTRL_POLICY_ALLOW_V2 |
        // OTRL_POLICY_ALLOW_V3 |
        OTRL_POLICY_SEND_WHITESPACE_TAG |
        OTRL_POLICY_WHITESPACE_START_AKE |
        // OTRL_POLICY_ERROR_START_AKE |
        0
    ),

    OTRL_POLICY_ALWAYS: new ctypes.unsigned_int(
      OTRL_POLICY_ALLOW_V2 |
        // OTRL_POLICY_ALLOW_V3 |
        OTRL_POLICY_REQUIRE_ENCRYPTION |
        OTRL_POLICY_WHITESPACE_START_AKE |
        // OTRL_POLICY_ERROR_START_AKE |
        0
    ),

    fragPolicy: {
      OTRL_FRAGMENT_SEND_SKIP: 0,
      OTRL_FRAGMENT_SEND_ALL: 1,
      OTRL_FRAGMENT_SEND_ALL_BUT_FIRST: 2,
      OTRL_FRAGMENT_SEND_ALL_BUT_LAST: 3,
    },

    // Return a pointer to a newly-allocated OTR query message, customized
    // with our name.  The caller should free() the result when he's done
    // with it.
    otrl_proto_default_query_msg: libotr.declare(
      "otrl_proto_default_query_msg",
      abi,
      ctypes.char.ptr,
      ctypes.char.ptr,
      OtrlPolicy
    ),

    // Initialize the OTR library. Pass the version of the API you are using.
    otrl_init: libotr.declare(
      "otrl_init",
      abi,
      gcry_error_t,
      ctypes.unsigned_int,
      ctypes.unsigned_int,
      ctypes.unsigned_int
    ),

    // instag.h

    instag: {
      OTRL_INSTAG_MASTER: new ctypes.unsigned_int(0),
      OTRL_INSTAG_BEST: new ctypes.unsigned_int(1),
      OTRL_INSTAG_RECENT: new ctypes.unsigned_int(2),
      OTRL_INSTAG_RECENT_RECEIVED: new ctypes.unsigned_int(3),
      OTRL_INSTAG_RECENT_SENT: new ctypes.unsigned_int(4),
      OTRL_MIN_VALID_INSTAG: new ctypes.unsigned_int(0x100),
    },

    // Get a new instance tag for the given account and write to file.  The FILE*
    // must be open for writing.
    otrl_instag_generate: callWithFILEp.bind(
      null,
      "otrl_instag_generate",
      "wb",
      1
    ),
    otrl_instag_generate_FILEp: libotr.declare(
      "otrl_instag_generate_FILEp",
      abi,
      gcry_error_t,
      OtrlUserState,
      FILE.ptr,
      ctypes.char.ptr,
      ctypes.char.ptr
    ),

    // Read our instance tag from a file on disk into the given OtrlUserState.
    // The FILE* must be open for reading.
    otrl_instag_read: callWithFILEp.bind(null, "otrl_instag_read", "rb", 1),
    otrl_instag_read_FILEp: libotr.declare(
      "otrl_instag_read_FILEp",
      abi,
      gcry_error_t,
      OtrlUserState,
      FILE.ptr
    ),

    // Write our instance tags to a file on disk.  The FILE* must be open for
    // writing.
    otrl_instag_write: callWithFILEp.bind(null, "otrl_instag_write", "wb", 1),
    otrl_instag_write_FILEp: libotr.declare(
      "otrl_instag_write_FILEp",
      abi,
      gcry_error_t,
      OtrlUserState,
      FILE.ptr
    ),

    // auth.h

    authState: {
      OTRL_AUTHSTATE_NONE: 0,
      OTRL_AUTHSTATE_AWAITING_DHKEY: 1,
      OTRL_AUTHSTATE_AWAITING_REVEALSIG: 2,
      OTRL_AUTHSTATE_AWAITING_SIG: 3,
      OTRL_AUTHSTATE_V1_SETUP: 4,
    },

    // b64.h

    // base64 encode data.  Insert no linebreaks or whitespace.
    // The buffer base64data must contain at least ((datalen+2)/3)*4 bytes of
    // space. This function will return the number of bytes actually used.
    otrl_base64_encode: libotr.declare(
      "otrl_base64_encode",
      abi,
      ctypes.size_t,
      ctypes.char.ptr,
      ctypes.unsigned_char.ptr,
      ctypes.size_t
    ),

    // base64 decode data.  Skip non-base64 chars, and terminate at the
    // first '=', or the end of the buffer.
    // The buffer data must contain at least ((base64len+3) / 4) * 3 bytes
    // of space. This function will return the number of bytes actually
    // used.
    otrl_base64_decode: libotr.declare(
      "otrl_base64_decode",
      abi,
      ctypes.size_t,
      ctypes.unsigned_char.ptr,
      ctypes.char.ptr,
      ctypes.size_t
    ),

    // context.h

    otr_offer: {
      OFFER_NOT: 0,
      OFFER_SENT: 1,
      OFFER_REJECTED: 2,
      OFFER_ACCEPTED: 3,
    },

    messageState: {
      OTRL_MSGSTATE_PLAINTEXT: 0,
      OTRL_MSGSTATE_ENCRYPTED: 1,
      OTRL_MSGSTATE_FINISHED: 2,
    },

    // Look up a connection context by name/account/protocol/instance from the
    // given OtrlUserState.
    otrl_context_find: libotr.declare(
      "otrl_context_find",
      abi,
      ConnContext.ptr,
      OtrlUserState,
      ctypes.char.ptr,
      ctypes.char.ptr,
      ctypes.char.ptr,
      otrl_instag_t,
      ctypes.int,
      ctypes.int.ptr,
      ctypes.void_t.ptr,
      ctypes.void_t.ptr
    ),

    // Set the trust level for a given fingerprint.
    otrl_context_set_trust: libotr.declare(
      "otrl_context_set_trust",
      abi,
      ctypes.void_t,
      Fingerprint.ptr,
      ctypes.char.ptr
    ),

    // Find a fingerprint in a given context, perhaps adding it if not present.
    otrl_context_find_fingerprint: libotr.declare(
      "otrl_context_find_fingerprint",
      abi,
      Fingerprint.ptr,
      ConnContext.ptr,
      hash_t,
      ctypes.int,
      ctypes.int.ptr
    ),

    // Forget a fingerprint (and maybe the whole context).
    otrl_context_forget_fingerprint: libotr.declare(
      "otrl_context_forget_fingerprint",
      abi,
      ctypes.void_t,
      Fingerprint.ptr,
      ctypes.int
    ),

    // Return true iff the given fingerprint is marked as trusted.
    otrl_context_is_fingerprint_trusted: libotr.declare(
      "otrl_context_is_fingerprint_trusted",
      abi,
      ctypes.int,
      Fingerprint.ptr
    ),

    // dh.h

    sessionIdHalf: {
      OTRL_SESSIONID_FIRST_HALF_BOLD: 0,
      OTRL_SESSIONID_SECOND_HALF_BOLD: 1,
    },

    // sm.h

    nextExpectedSMP: {
      OTRL_SMP_EXPECT1: 0,
      OTRL_SMP_EXPECT2: 1,
      OTRL_SMP_EXPECT3: 2,
      OTRL_SMP_EXPECT4: 3,
      OTRL_SMP_EXPECT5: 4,
    },

    smProgState: {
      OTRL_SMP_PROG_OK: 0,
      OTRL_SMP_PROG_CHEATED: -2,
      OTRL_SMP_PROG_FAILED: -1,
      OTRL_SMP_PROG_SUCCEEDED: 1,
    },

    // userstate.h

    // Create a new OtrlUserState.
    otrl_userstate_create: libotr.declare(
      "otrl_userstate_create",
      abi,
      OtrlUserState
    ),

    // privkey.h

    // Generate a private DSA key for a given account, storing it into a file on
    // disk, and loading it into the given OtrlUserState. Overwrite any
    // previously generated keys for that account in that OtrlUserState.
    otrl_privkey_generate: callWithFILEp.bind(
      null,
      "otrl_privkey_generate",
      "w+b",
      1
    ),
    otrl_privkey_generate_FILEp: libotr.declare(
      "otrl_privkey_generate_FILEp",
      abi,
      gcry_error_t,
      OtrlUserState,
      FILE.ptr,
      ctypes.char.ptr,
      ctypes.char.ptr
    ),

    // Begin a private key generation that will potentially take place in
    // a background thread. This routine must be called from the main
    // thread. It will set *newkeyp, which you can pass to
    // otrl_privkey_generate_calculate in a background thread.  If it
    // returns gcry_error(GPG_ERR_EEXIST), then a privkey creation for
    // this accountname/protocol is already in progress, and *newkeyp will
    // be set to NULL.
    otrl_privkey_generate_start: libotr.declare(
      "otrl_privkey_generate_start",
      abi,
      gcry_error_t,
      OtrlUserState,
      ctypes.char.ptr,
      ctypes.char.ptr,
      ctypes.void_t.ptr.ptr
    ),

    // Do the private key generation calculation. You may call this from a
    // background thread.  When it completes, call
    // otrl_privkey_generate_finish from the _main_ thread.
    otrl_privkey_generate_calculate: libotr.declare(
      "otrl_privkey_generate_calculate",
      abi,
      gcry_error_t,
      ctypes.void_t.ptr
    ),

    // Call this from the main thread only. It will write the newly created
    // private key into the given file and store it in the OtrlUserState.
    otrl_privkey_generate_finish: callWithFILEp.bind(
      null,
      "otrl_privkey_generate_finish",
      "w+b",
      2
    ),
    otrl_privkey_generate_finish_FILEp: libotr.declare(
      "otrl_privkey_generate_finish_FILEp",
      abi,
      gcry_error_t,
      OtrlUserState,
      ctypes.void_t.ptr,
      FILE.ptr
    ),

    // Call this from the main thread only, in the event that the background
    // thread generating the key is cancelled. The newkey is deallocated,
    // and must not be used further.
    otrl_privkey_generate_cancelled: libotr.declare(
      "otrl_privkey_generate_cancelled",
      abi,
      gcry_error_t,
      OtrlUserState,
      ctypes.void_t.ptr
    ),

    // Read a sets of private DSA keys from a file on disk into the given
    // OtrlUserState.
    otrl_privkey_read: callWithFILEp.bind(null, "otrl_privkey_read", "rb", 1),
    otrl_privkey_read_FILEp: libotr.declare(
      "otrl_privkey_read_FILEp",
      abi,
      gcry_error_t,
      OtrlUserState,
      FILE.ptr
    ),

    // Read the fingerprint store from a file on disk into the given
    // OtrlUserState.
    otrl_privkey_read_fingerprints: callWithFILEp.bind(
      null,
      "otrl_privkey_read_fingerprints",
      "rb",
      1
    ),
    otrl_privkey_read_fingerprints_FILEp: libotr.declare(
      "otrl_privkey_read_fingerprints_FILEp",
      abi,
      gcry_error_t,
      OtrlUserState,
      FILE.ptr,
      ctypes.void_t.ptr,
      ctypes.void_t.ptr
    ),

    // Write the fingerprint store from a given OtrlUserState to a file on disk.
    otrl_privkey_write_fingerprints: callWithFILEp.bind(
      null,
      "otrl_privkey_write_fingerprints",
      "wb",
      1
    ),
    otrl_privkey_write_fingerprints_FILEp: libotr.declare(
      "otrl_privkey_write_fingerprints_FILEp",
      abi,
      gcry_error_t,
      OtrlUserState,
      FILE.ptr
    ),

    // The length of a string representing a human-readable version of a
    // fingerprint (including the trailing NUL).
    OTRL_PRIVKEY_FPRINT_HUMAN_LEN,

    // Human readable fingerprint type
    fingerprint_t,

    // fingerprint value
    hash_t,

    // Calculate a human-readable hash of our DSA public key. Return it in the
    // passed fingerprint buffer. Return NULL on error, or a pointer to the given
    // buffer on success.
    otrl_privkey_fingerprint: libotr.declare(
      "otrl_privkey_fingerprint",
      abi,
      ctypes.char.ptr,
      OtrlUserState,
      fingerprint_t,
      ctypes.char.ptr,
      ctypes.char.ptr
    ),

    // Convert a 20-byte hash value to a 45-byte human-readable value.
    otrl_privkey_hash_to_human: libotr.declare(
      "otrl_privkey_hash_to_human",
      abi,
      ctypes.void_t,
      fingerprint_t,
      hash_t
    ),

    // Calculate a raw hash of our DSA public key.  Return it in the passed
    // fingerprint buffer.  Return NULL on error, or a pointer to the given
    // buffer on success.
    otrl_privkey_fingerprint_raw: libotr.declare(
      "otrl_privkey_fingerprint_raw",
      abi,
      ctypes.unsigned_char.ptr,
      OtrlUserState,
      hash_t,
      ctypes.char.ptr,
      ctypes.char.ptr
    ),

    // uiOps callbacks
    policy_cb_t,
    create_privkey_cb_t,
    is_logged_in_cb_t,
    inject_message_cb_t,
    update_context_list_cb_t,
    new_fingerprint_cb_t,
    write_fingerprint_cb_t,
    gone_secure_cb_t,
    gone_insecure_cb_t,
    still_secure_cb_t,
    max_message_size_cb_t,
    account_name_cb_t,
    account_name_free_cb_t,
    received_symkey_cb_t,
    otr_error_message_cb_t,
    otr_error_message_free_cb_t,
    resent_msg_prefix_cb_t,
    resent_msg_prefix_free_cb_t,
    handle_smp_event_cb_t,
    handle_msg_event_cb_t,
    create_instag_cb_t,
    convert_msg_cb_t,
    convert_free_cb_t,
    timer_control_cb_t,

    // message.h

    OtrlMessageAppOps,

    errorCode: {
      OTRL_ERRCODE_NONE: 0,
      OTRL_ERRCODE_ENCRYPTION_ERROR: 1,
      OTRL_ERRCODE_MSG_NOT_IN_PRIVATE: 2,
      OTRL_ERRCODE_MSG_UNREADABLE: 3,
      OTRL_ERRCODE_MSG_MALFORMED: 4,
    },

    smpEvent: {
      OTRL_SMPEVENT_NONE: 0,
      OTRL_SMPEVENT_ERROR: 1,
      OTRL_SMPEVENT_ABORT: 2,
      OTRL_SMPEVENT_CHEATED: 3,
      OTRL_SMPEVENT_ASK_FOR_ANSWER: 4,
      OTRL_SMPEVENT_ASK_FOR_SECRET: 5,
      OTRL_SMPEVENT_IN_PROGRESS: 6,
      OTRL_SMPEVENT_SUCCESS: 7,
      OTRL_SMPEVENT_FAILURE: 8,
    },

    messageEvent: {
      OTRL_MSGEVENT_NONE: 0,
      OTRL_MSGEVENT_ENCRYPTION_REQUIRED: 1,
      OTRL_MSGEVENT_ENCRYPTION_ERROR: 2,
      OTRL_MSGEVENT_CONNECTION_ENDED: 3,
      OTRL_MSGEVENT_SETUP_ERROR: 4,
      OTRL_MSGEVENT_MSG_REFLECTED: 5,
      OTRL_MSGEVENT_MSG_RESENT: 6,
      OTRL_MSGEVENT_RCVDMSG_NOT_IN_PRIVATE: 7,
      OTRL_MSGEVENT_RCVDMSG_UNREADABLE: 8,
      OTRL_MSGEVENT_RCVDMSG_MALFORMED: 9,
      OTRL_MSGEVENT_LOG_HEARTBEAT_RCVD: 10,
      OTRL_MSGEVENT_LOG_HEARTBEAT_SENT: 11,
      OTRL_MSGEVENT_RCVDMSG_GENERAL_ERR: 12,
      OTRL_MSGEVENT_RCVDMSG_UNENCRYPTED: 13,
      OTRL_MSGEVENT_RCVDMSG_UNRECOGNIZED: 14,
      OTRL_MSGEVENT_RCVDMSG_FOR_OTHER_INSTANCE: 15,
    },

    convertType: {
      OTRL_CONVERT_SENDING: 0,
      OTRL_CONVERT_RECEIVING: 1,
    },

    // Deallocate a message allocated by other otrl_message_* routines.
    otrl_message_free: libotr.declare(
      "otrl_message_free",
      abi,
      ctypes.void_t,
      ctypes.char.ptr
    ),

    // Handle a message about to be sent to the network.
    otrl_message_sending: libotr.declare(
      "otrl_message_sending",
      abi,
      gcry_error_t,
      OtrlUserState,
      OtrlMessageAppOps.ptr,
      ctypes.void_t.ptr,
      ctypes.char.ptr,
      ctypes.char.ptr,
      ctypes.char.ptr,
      otrl_instag_t,
      ctypes.char.ptr,
      OtrlTLV.ptr,
      ctypes.char.ptr.ptr,
      OtrlFragmentPolicy,
      ConnContext.ptr.ptr,
      ctypes.void_t.ptr,
      ctypes.void_t.ptr
    ),

    // Handle a message just received from the network.
    otrl_message_receiving: libotr.declare(
      "otrl_message_receiving",
      abi,
      ctypes.int,
      OtrlUserState,
      OtrlMessageAppOps.ptr,
      ctypes.void_t.ptr,
      ctypes.char.ptr,
      ctypes.char.ptr,
      ctypes.char.ptr,
      ctypes.char.ptr,
      ctypes.char.ptr.ptr,
      OtrlTLV.ptr.ptr,
      ConnContext.ptr.ptr,
      ctypes.void_t.ptr,
      ctypes.void_t.ptr
    ),

    // Put a connection into the PLAINTEXT state, first sending the
    // other side a notice that we're doing so if we're currently ENCRYPTED,
    // and we think he's logged in. Affects only the specified instance.
    otrl_message_disconnect: libotr.declare(
      "otrl_message_disconnect",
      abi,
      ctypes.void_t,
      OtrlUserState,
      OtrlMessageAppOps.ptr,
      ctypes.void_t.ptr,
      ctypes.char.ptr,
      ctypes.char.ptr,
      ctypes.char.ptr,
      otrl_instag_t
    ),

    // Call this function every so often, to clean up stale private state that
    // may otherwise stick around in memory.
    otrl_message_poll: libotr.declare(
      "otrl_message_poll",
      abi,
      ctypes.void_t,
      OtrlUserState,
      OtrlMessageAppOps.ptr,
      ctypes.void_t.ptr
    ),

    // Initiate the Socialist Millionaires' Protocol.
    otrl_message_initiate_smp: libotr.declare(
      "otrl_message_initiate_smp",
      abi,
      ctypes.void_t,
      OtrlUserState,
      OtrlMessageAppOps.ptr,
      ctypes.void_t.ptr,
      ConnContext.ptr,
      ctypes.char.ptr,
      ctypes.size_t
    ),

    // Initiate the Socialist Millionaires' Protocol and send a prompt
    // question to the buddy.
    otrl_message_initiate_smp_q: libotr.declare(
      "otrl_message_initiate_smp_q",
      abi,
      ctypes.void_t,
      OtrlUserState,
      OtrlMessageAppOps.ptr,
      ctypes.void_t.ptr,
      ConnContext.ptr,
      ctypes.char.ptr,
      ctypes.char.ptr,
      ctypes.size_t
    ),

    // Respond to a buddy initiating the Socialist Millionaires' Protocol.
    otrl_message_respond_smp: libotr.declare(
      "otrl_message_respond_smp",
      abi,
      ctypes.void_t,
      OtrlUserState,
      OtrlMessageAppOps.ptr,
      ctypes.void_t.ptr,
      ConnContext.ptr,
      ctypes.char.ptr,
      ctypes.size_t
    ),

    // Abort the SMP. Called when an unexpected SMP message breaks the
    // normal flow.
    otrl_message_abort_smp: libotr.declare(
      "otrl_message_abort_smp",
      abi,
      ctypes.void_t,
      OtrlUserState,
      OtrlMessageAppOps.ptr,
      ctypes.void_t.ptr,
      ConnContext.ptr
    ),

    // tlv.h

    tlvs: {
      OTRL_TLV_PADDING: new ctypes.unsigned_short(0x0000),
      OTRL_TLV_DISCONNECTED: new ctypes.unsigned_short(0x0001),
      OTRL_TLV_SMP1: new ctypes.unsigned_short(0x0002),
      OTRL_TLV_SMP2: new ctypes.unsigned_short(0x0003),
      OTRL_TLV_SMP3: new ctypes.unsigned_short(0x0004),
      OTRL_TLV_SMP4: new ctypes.unsigned_short(0x0005),
      OTRL_TLV_SMP_ABORT: new ctypes.unsigned_short(0x0006),
      OTRL_TLV_SMP1Q: new ctypes.unsigned_short(0x0007),
      OTRL_TLV_SYMKEY: new ctypes.unsigned_short(0x0008),
    },

    OtrlTLV,

    // Return the first TLV with the given type in the chain, or NULL if one
    // isn't found.
    otrl_tlv_find: libotr.declare(
      "otrl_tlv_find",
      abi,
      OtrlTLV.ptr,
      OtrlTLV.ptr,
      ctypes.unsigned_short
    ),

    // Deallocate a chain of TLVs.
    otrl_tlv_free: libotr.declare(
      "otrl_tlv_free",
      abi,
      ctypes.void_t,
      OtrlTLV.ptr
    ),
  };
}

// exports

const EXPORTED_SYMBOLS = ["OTRLibLoader"];
