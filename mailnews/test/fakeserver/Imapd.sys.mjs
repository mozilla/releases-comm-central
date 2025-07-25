/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// This file implements test IMAP servers

// IMAP DAEMON ORGANIZATION
// ------------------------
// The large numbers of RFCs all induce some implicit assumptions as to the
// organization of an IMAP server. Ideally, we'd like to be as inclusive as
// possible so that we can guarantee that it works for every type of server.
// Unfortunately, such all-accepting setups make generic algorithms hard to
// use; given their difficulty in a generic framework, it seems unlikely that
// a server would implement such characteristics. It also seems likely that
// if mailnews had a problem with the implementation, then most clients would
// see similar problems, so as to make the server widely unusable. In any
// case, if someone complains about not working on bugzilla, it can be added
// to the test suite.
// So, with that in mind, this is the basic layout of the daemon:
// DAEMON
// + Namespaces: parentless mailboxes whose names are the namespace name. The
//     type of the namespace is specified by the type attribute.
// + Mailboxes: ImapMailbox objects with several properties. If a mailbox
// | |   property begins with a '_', then it should not be serialized because
// | |   it can be discovered from other means; in particular, a '_' does not
// | |   necessarily mean that it is a private property that should not be
// | |   accessed. The parent of a top-level mailbox is null, not "".
// | + I18N names: RFC 3501 specifies a modified UTF-7 form for names.
// | |     However, a draft RFC makes the names UTF-8; it is expected to be
// | |     completed and implemented "soon". Therefore, the correct usage is
// | |     to specify the mailbox names as one normally does in JS and the
// | |     protocol will take care of conversion itself.
// | + Case-sensitivity: RFC 3501 takes no position on this issue, only that
// | |     a case-insensitive server must treat the base-64 parts of mailbox
// | |     names as case-sensitive. The draft UTF8 RFC says nothing on this
// | |     topic, but Crispin recommends using Unicode case-insensitivity. We
// | |     therefore treat names in such manner (if the case-insensitive flag
// | |     is set), in technical violation of RFC 3501.
// | + Flags: Flags are (as confirmed by Crispin) case-insensitive. Internal
// |       flag equality, though, uses case-sensitive checks. Therefore they
// |       should be normalized to a title-case form (e.g., \Noselect).
// + Synchronization: On certain synchronizing commands, the daemon will call
// |   a synchronizing function to allow manipulating code the chance to
// |   perform various (potentially expensive) actions.
// + Messages: A message is represented internally as an annotated URI.

import { MimeParser } from "resource:///modules/mimeParser.sys.mjs";

import {
  AuthPLAIN,
  AuthLOGIN,
  AuthCRAM,
} from "resource://testing-common/mailnews/Auth.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  OAuth2TestUtils: "resource://testing-common/mailnews/OAuth2TestUtils.sys.mjs",
});

export class ImapDaemon {
  constructor(flags, syncFunc) {
    this._flags = flags;

    this.namespaces = [];
    this.idResponse = "NIL";
    this.root = new ImapMailbox("", null, { type: IMAP_NAMESPACE_PERSONAL });
    this.uidvalidity = Math.round(Date.now() / 1000);
    this.inbox = new ImapMailbox("INBOX", null, this.uidvalidity++);
    this.root.addMailbox(this.inbox);
    this.namespaces.push(this.root);
    this.syncFunc = syncFunc;
    // This can be used to cause the artificial failure of any given command.
    this.commandToFail = "";
    // This can be used to simulate timeouts on large copies
    this.copySleep = 0;
  }
  synchronize(mailbox, update) {
    if (this.syncFunc) {
      this.syncFunc.call(null, this);
    }
    if (update) {
      for (var message of mailbox._messages) {
        message.recent = false;
      }
    }
  }
  getNamespace(name) {
    for (var namespace of this.namespaces) {
      if (
        name.indexOf(namespace.name) == 0 &&
        name[namespace.name.length] == namespace.delimiter
      ) {
        return namespace;
      }
    }
    return this.root;
  }
  createNamespace(name, type) {
    var newbox = this.createMailbox(name, { type });
    this.namespaces.push(newbox);
  }
  getMailbox(name) {
    if (name == "") {
      return this.root;
    }
    // INBOX is case-insensitive, no matter what
    if (name.toUpperCase().startsWith("INBOX")) {
      name = "INBOX" + name.substr(5);
    }
    // We want to find a child who has the same name, but we don't quite know
    // what the delimiter is. The convention is that different namespaces use a
    // name starting with '#', so that's how we'll work it out.
    let mailbox;
    if (name.startsWith("#")) {
      for (mailbox of this.root._children) {
        if (
          mailbox.name.indexOf(name) == 0 &&
          name[mailbox.name.length] == mailbox.delimiter
        ) {
          break;
        }
      }
      if (!mailbox) {
        return null;
      }

      // Now we continue like normal
      const names = name.split(mailbox.delimiter);
      names.splice(0, 1);
      for (const part of names) {
        mailbox = mailbox.getChild(part);
        if (!mailbox || mailbox.nonExistent) {
          return null;
        }
      }
    } else {
      // This is easy, just split it up using the inbox's delimiter
      const names = name.split(this.inbox.delimiter);
      mailbox = this.root;

      for (const part of names) {
        mailbox = mailbox.getChild(part);
        if (!mailbox || mailbox.nonExistent) {
          return null;
        }
      }
    }
    return mailbox;
  }
  createMailbox(name, oldBox) {
    var namespace = this.getNamespace(name);
    if (namespace.name != "") {
      name = name.substring(namespace.name.length + 1);
    }
    var prefixes = name.split(namespace.delimiter);
    var subName;
    if (prefixes[prefixes.length - 1] == "") {
      subName = prefixes.splice(prefixes.length - 2, 2)[0];
    } else {
      subName = prefixes.splice(prefixes.length - 1, 1)[0];
    }
    var box = namespace;
    for (var component of prefixes) {
      box = box.getChild(component);
      // Yes, we won't autocreate intermediary boxes
      if (box == null || box.flags.includes("\\NoInferiors")) {
        return false;
      }
    }
    // If this is an ImapMailbox...
    if (oldBox && oldBox._children) {
      // Only delete now so we don't screw ourselves up if creation fails
      this.deleteMailbox(oldBox);
      oldBox._parent = box == this.root ? null : box;
      const newBox = new ImapMailbox(subName, box, this.uidvalidity++);
      newBox._messages = oldBox._messages;
      box.addMailbox(newBox);

      // And if oldBox is an INBOX, we need to recreate that
      if (oldBox.name == "INBOX") {
        this.inbox = new ImapMailbox("INBOX", null, this.uidvalidity++);
        this.root.addMailbox(this.inbox);
      }
      oldBox.name = subName;
    } else if (oldBox) {
      // oldBox is a regular {} object, so it contains mailbox data but is not
      // a mailbox itself. Pass it into the constructor and let that deal with
      // it...
      const childBox = new ImapMailbox(
        subName,
        box == this.root ? null : box,
        oldBox
      );
      box.addMailbox(childBox);
      // And return the new mailbox, since this is being used by people setting
      // up the daemon.
      return childBox;
    } else {
      var creatable = hasFlag(this._flags, IMAP_FLAG_NEEDS_DELIMITER)
        ? name[name.length - 1] == namespace.delimiter
        : true;
      const childBox = new ImapMailbox(subName, box == this.root ? null : box, {
        flags: creatable ? [] : ["\\NoInferiors"],
        uidvalidity: this.uidvalidity++,
      });
      box.addMailbox(childBox);
    }
    return true;
  }
  deleteMailbox(mailbox) {
    if (mailbox._children.length == 0) {
      // We don't preserve the subscribed state for deleted mailboxes
      var parentBox = mailbox._parent == null ? this.root : mailbox._parent;
      parentBox._children.splice(parentBox._children.indexOf(mailbox), 1);
    } else {
      // clear mailbox
      mailbox._messages = [];
      mailbox.flags.push("\\Noselect");
    }
  }
}

export class ImapMailbox {
  constructor(name, parent, state) {
    this.name = name;
    this._parent = parent;
    this._children = [];
    this._messages = [];
    this._updates = [];

    // Shorthand for uidvalidity
    if (typeof state == "number") {
      this.uidvalidity = state;
      state = {};
    }

    if (!state) {
      state = {};
    }

    for (var prop in state) {
      this[prop] = state[prop];
    }

    this.setDefault("subscribed", false);
    this.setDefault("nonExistent", false);
    this.setDefault("delimiter", "/");
    this.setDefault("flags", []);
    this.setDefault("specialUseFlag", "");
    this.setDefault("uidnext", 1);
    this.setDefault("msgflags", [
      "\\Seen",
      "\\Answered",
      "\\Flagged",
      "\\Deleted",
      "\\Draft",
    ]);
    this.setDefault("permflags", [
      "\\Seen",
      "\\Answered",
      "\\Flagged",
      "\\Deleted",
      "\\Draft",
      "\\*",
    ]);
  }
  setDefault(prop, def) {
    this[prop] = prop in this ? this[prop] : def;
  }
  addMailbox(mailbox) {
    this._children.push(mailbox);
  }
  getChild(name) {
    for (var mailbox of this._children) {
      if (name == mailbox.name) {
        return mailbox;
      }
    }
    return null;
  }
  matchKids(pattern) {
    if (pattern == "") {
      return this._parent ? this._parent.matchKids("") : [this];
    }

    var portions = pattern.split(this.delimiter);
    var matching = [this];
    for (var folder of portions) {
      if (folder.length == 0) {
        continue;
      }

      const generator = folder.includes("*") ? "allChildren" : "_children";
      const possible = matching.reduce(function (arr, elem) {
        return arr.concat(elem[generator]);
      }, []);

      if (folder == "*" || folder == "%") {
        matching = possible;
        continue;
      }

      const parts = folder.split(/[*%]/).filter(function (str) {
        return str.length > 0;
      });
      matching = possible.filter(function (mailbox) {
        let index = 0;
        const name = mailbox.fullName;
        for (var part of parts) {
          index = name.indexOf(part, index);
          if (index == -1) {
            return false;
          }
        }
        return true;
      });
    }
    return matching;
  }
  get fullName() {
    return (
      (this._parent ? this._parent.fullName + this.delimiter : "") + this.name
    );
  }
  get displayName() {
    const manager = Cc["@mozilla.org/charset-converter-manager;1"].getService(
      Ci.nsICharsetConverterManager
    );
    // Escape backslash and double-quote with another backslash before encoding.
    return manager.unicodeToMutf7(this.fullName.replace(/([\\"])/g, "\\$1"));
  }
  get allChildren() {
    return this._children.reduce(function (arr, elem) {
      return arr.concat(elem._allChildrenInternal);
    }, []);
  }
  get _allChildrenInternal() {
    return this._children.reduce(
      function (arr, elem) {
        return arr.concat(elem._allChildrenInternal);
      },
      [this]
    );
  }
  addMessage(message) {
    this._messages.push(message);
    if (message.uid >= this.uidnext) {
      this.uidnext = message.uid + 1;
    }
    if (!this._updates.includes("EXISTS")) {
      this._updates.push("EXISTS");
    }
    if ("__highestuid" in this && message.uid > this.__highestuid) {
      this.__highestuid = message.uid;
    }
  }
  get _highestuid() {
    if ("__highestuid" in this) {
      return this.__highestuid;
    }
    var highest = 0;
    for (var message of this._messages) {
      if (message.uid > highest) {
        highest = message.uid;
      }
    }
    this.__highestuid = highest;
    return highest;
  }
  expunge() {
    var response = "";
    for (var i = 0; i < this._messages.length; i++) {
      if (this._messages[i].flags.includes("\\Deleted")) {
        response += "* " + (i + 1) + " EXPUNGE\0";
        this._messages.splice(i--, 1);
      }
    }
    if (response.length > 0) {
      delete this.__highestuid;
    }
    return response;
  }
}

export class ImapMessage {
  constructor(URI, uid, flags) {
    this._URI = URI;
    this.uid = uid;
    this.size = 0;
    this.flags = [];
    for (const flag in flags) {
      this.flags.push(flag);
    }
    this.recent = false;
  }
  get channel() {
    return Services.io.newChannel(
      this._URI,
      null,
      null,
      null,
      Services.scriptSecurityManager.getSystemPrincipal(),
      null,
      Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
      Ci.nsIContentPolicy.TYPE_OTHER
    );
  }
  setFlag(flag) {
    if (!this.flags.includes(flag)) {
      this.flags.push(flag);
    }
  }
  // This allows us to simulate servers that approximate the rfc822 size.
  setSize(size) {
    this.size = size;
  }
  clearFlag(flag) {
    const index = this.flags.indexOf(flag);
    if (index != -1) {
      this.flags.splice(index, 1);
    }
  }
  getText(start, length) {
    if (!start) {
      start = 0;
    }
    if (!length) {
      length = -1;
    }
    var channel = this.channel;
    var istream = channel.open();
    var bstream = Cc["@mozilla.org/binaryinputstream;1"].createInstance(
      Ci.nsIBinaryInputStream
    );
    bstream.setInputStream(istream);
    var str = bstream.readBytes(start);
    if (str.length != start) {
      throw new Error("Erm, we didn't just pass through 8-bit");
    }
    length = length == -1 ? istream.available() : length;
    if (length > istream.available()) {
      length = istream.available();
    }
    str = bstream.readBytes(length);
    return str;
  }

  get _partMap() {
    if (this.__partMap) {
      return this.__partMap;
    }
    var partMap = {};
    var emitter = {
      startPart(partNum, headers) {
        var imapPartNum = partNum.replace("$", "");
        // If there are multiple imap parts that this represents, we'll
        // overwrite with the latest. This is what we want (most deeply nested).
        partMap[imapPartNum] = [partNum, headers];
      },
    };
    MimeParser.parseSync(this.getText(), emitter, {
      bodyformat: "none",
      stripcontinuations: false,
    });
    return (this.__partMap = partMap);
  }
  getPartHeaders(partNum) {
    return this._partMap[partNum][1];
  }
  getPartBody(partNum) {
    var body = "";
    var emitter = {
      deliverPartData(partNumber, data) {
        body += data;
      },
    };
    var mimePartNum = this._partMap[partNum][0];
    MimeParser.parseSync(this.getText(), emitter, {
      pruneat: mimePartNum,
      bodyformat: "raw",
    });
    return body;
  }
}

// IMAP FLAGS
// If you don't specify any flag, no flags are set.

/**
 * This flag represents whether or not CREATE hierarchies need a delimiter.
 *
 * If this flag is off, <tt>CREATE a<br />CREATE a/b</tt> fails where
 * <tt>CREATE a/<br />CREATE a/b</tt> would succeed (assuming the delimiter is
 * '/').
 */
var IMAP_FLAG_NEEDS_DELIMITER = 2;

function hasFlag(flags, flag) {
  return (flags & flag) == flag;
}

// IMAP Namespaces
var IMAP_NAMESPACE_PERSONAL = 0;
// var IMAP_NAMESPACE_OTHER_USERS = 1;
// var IMAP_NAMESPACE_SHARED = 2;

// IMAP server helpers
var IMAP_STATE_NOT_AUTHED = 0;
var IMAP_STATE_AUTHED = 1;
var IMAP_STATE_SELECTED = 2;

function parseCommand(text, partial) {
  var args = [];
  var current = args;
  var stack = [];
  if (partial) {
    args = partial.args;
    current = partial.current;
    stack = partial.stack;
    current.push(partial.text);
  }
  var atom = "";
  while (text.length > 0) {
    const c = text[0];

    if (c == '"') {
      let index = 1;
      let s = "";
      while (index < text.length && text[index] != '"') {
        if (text[index] == "\\") {
          index++;
          if (text[index] != '"' && text[index] != "\\") {
            throw new Error("Expected quoted character");
          }
        }
        s += text[index++];
      }
      if (index == text.length) {
        throw new Error("Expected DQUOTE");
      }
      current.push(s);
      text = text.substring(index + 1);
      continue;
    } else if (c == "{") {
      const end = text.indexOf("}");
      if (end == -1) {
        throw new Error("Expected CLOSE_BRACKET");
      }
      if (end + 1 != text.length) {
        throw new Error("Expected CRLF");
      }
      const length = parseInt(text.substring(1, end));
      // Usable state
      // eslint-disable-next-line no-throw-literal
      throw { length, current, args, stack, text: "" };
    } else if (c == "(") {
      stack.push(current);
      current = [];
    } else if (c == ")") {
      if (atom.length > 0) {
        current.push(atom);
        atom = "";
      }
      const hold = current;
      current = stack.pop();
      if (current == undefined) {
        throw new Error("Unexpected CLOSE_PAREN");
      }
      current.push(hold);
    } else if (c == " ") {
      if (atom.length > 0) {
        current.push(atom);
        atom = "";
      }
    } else if (
      text.toUpperCase().startsWith("NIL") &&
      (text.length == 3 || text[3] == " ")
    ) {
      current.push(null);
      text = text.substring(4);
      continue;
    } else {
      atom += c;
    }
    text = text.substring(1);
  }
  if (stack.length != 0) {
    throw new Error("Expected CLOSE_PAREN!");
  }
  if (atom.length > 0) {
    args.push(atom);
  }
  return args;
}

function formatArg(argument, spec) {
  // Get NILs out of the way quickly
  var nilAccepted = false;
  if (spec.startsWith("n") && spec[1] != "u") {
    spec = spec.substring(1);
    nilAccepted = true;
  }
  if (argument == null) {
    if (!nilAccepted) {
      throw new Error("Unexpected NIL!");
    }

    return null;
  }

  // array!
  if (spec.startsWith("(")) {
    // typeof array is object. Don't ask me why.
    if (!Array.isArray(argument)) {
      throw new Error("Expected list!");
    }
    // Strip the '(' and ')'...
    spec = spec.substring(1, spec.length - 1);
    // ... and apply to the rest
    return argument.map(function (item) {
      return formatArg(item, spec);
    });
  }

  // or!
  var pipe = spec.indexOf("|");
  if (pipe > 0) {
    var first = spec.substring(0, pipe);
    try {
      return formatArg(argument, first);
    } catch (e) {
      return formatArg(argument, spec.substring(pipe + 1));
    }
  }

  // By now, we know that the input should be generated from an atom or string.
  if (typeof argument != "string") {
    throw new Error("Expected argument of type " + spec + "!");
  }

  if (spec == "atom") {
    argument = argument.toUpperCase();
  } else if (spec == "mailbox") {
    const manager = Cc["@mozilla.org/charset-converter-manager;1"].getService(
      Ci.nsICharsetConverterManager
    );
    argument = manager.mutf7ToUnicode(argument);
  } else if (spec == "string") {
    // Do nothing
  } else if (spec == "flag") {
    argument = argument.toLowerCase();
    if (
      !("a" <= argument[0] && argument[0] <= "z") &&
      !("A" <= argument[0] && argument[0] <= "Z")
    ) {
      argument = argument[0] + argument[1].toUpperCase() + argument.substr(2);
    } else {
      argument = argument[0].toUpperCase() + argument.substr(1);
    }
  } else if (spec == "number") {
    if (argument == parseInt(argument)) {
      argument = parseInt(argument);
    }
  } else if (spec == "date") {
    if (
      !/^\d{1,2}-[A-Z][a-z]{2}-\d{4}( \d{2}(:\d{2}){2} [+-]\d{4})?$/.test(
        argument
      )
    ) {
      throw new Error("Expected date!");
    }
    argument = new Date(Date.parse(argument.replace(/-(?!\d{4}$)/g, " ")));
  } else {
    throw new Error("Unknown spec " + spec);
  }

  return argument;
}

// IMAP TEST SERVERS
// -----------------
// Because of IMAP and the LEMONADE RFCs, we have a myriad of different
// server configurations that we should ideally be supporting. We handle them
// by defining a core RFC 3501 implementation and then have different server
// extensions subclass the server through functions below. However, we also
// provide standard configurations for best handling.
// Configurations:
// * Barebones RFC 3501
// * Cyrus
// * UW IMAP
// * Courier
// * Exchange
// * Dovecot
// * Zimbra
// * GMail
// KNOWN DEVIATIONS FROM RFC 3501:
// + The autologout timer is 3 minutes, not 30 minutes. A test with a logout
//   of 30 minutes would take a very long time if it failed.
// + SEARCH (except for UNDELETED) and STARTTLS are not supported,
//   nor is all of FETCH.
// + Concurrent mailbox access is probably compliant with a rather liberal
//   implementation of RFC 3501, although probably not what one would expect,
//   and certainly not what the Dovecot IMAP server tests expect.

/* IMAP Fakeserver operates in a different manner than the rest of fakeserver
 * because of some differences in the protocol. Commands are dispatched through
 * onError, which parses the message into components. Like other fakeserver
 * implementations, the command property will be called, but this time with an
 * argument that is an array of data items instead of a string representing the
 * rest of the line.
 */
export class IMAP_RFC3501_handler {
  constructor(
    daemon,
    { username = "user", password = "password", authSchemes = [] } = {}
  ) {
    this.kUsername = username;
    this.kPassword = password;
    this.kAuthSchemes = authSchemes; // Added by RFC2195 extension.
    this.kCapabilities = [
      /* "LOGINDISABLED", "STARTTLS", */
      "CLIENTID",
    ]; // Test may modify as needed.
    this.kUidCommands = ["FETCH", "STORE", "SEARCH", "COPY"];

    this._daemon = daemon;
    this.closing = false;
    this.dropOnStartTLS = false;
    // map: property = auth scheme {String}, value = start function on this obj
    this._kAuthSchemeStartFunction = {};

    this._enabledCommands = {
      // IMAP_STATE_NOT_AUTHED
      0: [
        "CAPABILITY",
        "NOOP",
        "LOGOUT",
        "STARTTLS",
        "CLIENTID",
        "AUTHENTICATE",
        "LOGIN",
      ],
      // IMAP_STATE_AUTHED
      1: [
        "CAPABILITY",
        "NOOP",
        "LOGOUT",
        "SELECT",
        "EXAMINE",
        "CREATE",
        "DELETE",
        "RENAME",
        "SUBSCRIBE",
        "UNSUBSCRIBE",
        "LIST",
        "LSUB",
        "STATUS",
        "APPEND",
      ],
      // IMAP_STATE_SELECTED
      2: [
        "CAPABILITY",
        "NOOP",
        "LOGOUT",
        "SELECT",
        "EXAMINE",
        "CREATE",
        "DELETE",
        "RENAME",
        "SUBSCRIBE",
        "UNSUBSCRIBE",
        "LIST",
        "LSUB",
        "STATUS",
        "APPEND",
        "CHECK",
        "CLOSE",
        "EXPUNGE",
        "SEARCH",
        "FETCH",
        "STORE",
        "COPY",
        "UID",
      ],
    };
    // Format explanation:
    // atom -> UPPERCASE
    // string -> don't touch!
    // mailbox -> Apply ->UTF16 transformation with case-insensitivity stuff
    // flag -> Titlecase (or \Titlecase, $Titlecase, etc.)
    // date -> Make it a JSDate object
    // number -> Make it a number, if possible
    // ( ) -> list, apply flags as specified
    // [ ] -> optional argument.
    // x|y -> either x or y format.
    // ... -> variable args, don't parse
    this._argFormat = {
      CAPABILITY: [],
      NOOP: [],
      LOGOUT: [],
      STARTTLS: [],
      CLIENTID: ["string", "string"],
      AUTHENTICATE: ["atom", "..."],
      LOGIN: ["string", "string"],
      SELECT: ["mailbox"],
      EXAMINE: ["mailbox"],
      CREATE: ["mailbox"],
      DELETE: ["mailbox"],
      RENAME: ["mailbox", "mailbox"],
      SUBSCRIBE: ["mailbox"],
      UNSUBSCRIBE: ["mailbox"],
      LIST: ["mailbox", "mailbox"],
      LSUB: ["mailbox", "mailbox"],
      STATUS: ["mailbox", "(atom)"],
      APPEND: ["mailbox", "[(flag)]", "[date]", "string"],
      CHECK: [],
      CLOSE: [],
      EXPUNGE: [],
      SEARCH: ["atom", "..."],
      FETCH: ["number", "atom|(atom|(atom))"],
      STORE: ["number", "atom", "flag|(flag)"],
      COPY: ["number", "mailbox"],
      UID: ["atom", "..."],
    };

    this.resetTest();
  }
  resetTest() {
    this._state = IMAP_STATE_NOT_AUTHED;
    this._multiline = false;
    this._nextAuthFunction = undefined; // should be in RFC2195_ext, but too lazy
  }
  onStartup() {
    this._state = IMAP_STATE_NOT_AUTHED;
    return "* OK IMAP4rev1 Fakeserver started up";
  }

  // CENTRALIZED DISPATCH FUNCTIONS

  // IMAP sends commands in the form of "tag command args", but fakeserver
  // parsing tries to call the tag, which doesn't exist. Instead, we use this
  // error method to do the actual command dispatch. Mailnews uses numbers for
  // tags, which won't impede on actual commands.
  onError(tag, realLine) {
    this._tag = tag;
    var space = realLine.indexOf(" ");
    var command = space == -1 ? realLine : realLine.substring(0, space);
    realLine = space == -1 ? "" : realLine.substring(space + 1);

    // Now parse realLine into an array of atoms, etc.
    try {
      var args = parseCommand(realLine);
    } catch (state) {
      if (typeof state == "object") {
        this._partial = state;
        this._partial.command = command;
        this._multiline = true;
        return "+ More!";
      }

      return this._tag + " BAD " + state;
    }

    // If we're here, we have a command with arguments. Dispatch!
    return this._dispatchCommand(command, args);
  }
  onMultiline(line) {
    // A multiline arising form a literal being passed
    if (this._partial) {
      // There are two cases to be concerned with:
      // 1. The CRLF is internal or end (we want more)
      // 1a. The next line is the actual command stuff!
      // 2. The CRLF is in the middle (rest of the line is args)
      if (this._partial.length >= line.length + 2) {
        // Case 1
        this._partial.text += line + "\r\n";
        this._partial.length -= line.length + 2;
        return undefined;
      } else if (this._partial.length != 0) {
        this._partial.text += line.substring(0, this._partial.length);
        line = line.substring(this._partial.length);
      }
      var command = this._partial.command;
      var args;
      try {
        args = parseCommand(line, this._partial);
      } catch (state) {
        if (typeof state == "object") {
          // Yet another literal coming around...
          this._partial = state;
          this._partial.command = command;
          return "+ I'll be needing more text";
        }

        this._multiline = false;
        return this.tag + " BAD parse error: " + state;
      }

      this._partial = undefined;
      this._multiline = false;
      return this._dispatchCommand(command, args);
    }

    if (this._nextAuthFunction) {
      var func = this._nextAuthFunction;
      this._multiline = false;
      this._nextAuthFunction = undefined;
      if (line == "*") {
        return this._tag + " BAD Okay, as you wish. Chicken";
      }
      if (!func || typeof func != "function") {
        return this._tag + " BAD I'm lost. Internal server error during auth";
      }
      try {
        return this._tag + " " + func.call(this, line);
      } catch (e) {
        return this._tag + " BAD " + e;
      }
    }
    return undefined;
  }
  _dispatchCommand(command, args) {
    this.sendingLiteral = false;
    command = command.toUpperCase();
    if (command == this._daemon.commandToFail.toUpperCase()) {
      return this._tag + " NO " + command + " failed";
    }
    var response;
    if (command in this) {
      this._lastCommand = command;
      // Are we allowed to execute this command?
      if (!this._enabledCommands[this._state].includes(command)) {
        return (
          this._tag + " BAD illegal command for current state " + this._state
        );
      }

      try {
        // Format the arguments nicely
        args = this._treatArgs(args, command);

        // UID command by itself is not useful for PerformTest
        if (command == "UID") {
          this._lastCommand += " " + args[0];
        }

        // Finally, run the thing
        response = this[command](args);
      } catch (e) {
        if (typeof e == "string") {
          response = e;
        } else {
          throw e;
        }
      }
    } else {
      response = "BAD " + command + " not implemented";
    }

    // Add status updates
    if (this._selectedMailbox) {
      for (var update of this._selectedMailbox._updates) {
        let line;
        switch (update) {
          case "EXISTS":
            line = "* " + this._selectedMailbox._messages.length + " EXISTS";
            break;
        }
        response = line + "\0" + response;
      }
    }

    var lines = response.split("\0");
    response = "";
    for (const line of lines) {
      if (!line.startsWith("+") && !line.startsWith("*")) {
        response += this._tag + " ";
      }
      response += line + "\r\n";
    }
    return response;
  }
  _treatArgs(args, command) {
    var format = this._argFormat[command];
    var treatedArgs = [];
    for (var i = 0; i < format.length; i++) {
      var spec = format[i];

      if (spec == "...") {
        treatedArgs = treatedArgs.concat(args);
        args = [];
        break;
      }

      if (args.length == 0) {
        if (spec.startsWith("[")) {
          // == optional arg
          continue;
        } else {
          throw new Error("BAD not enough arguments");
        }
      }

      if (spec.startsWith("[")) {
        // We have an optional argument. See if the format matches and move on
        // if it doesn't. Ideally, we'd rethink our decision if a later
        // application turns out to be wrong, but that's ugly to do
        // iteratively. Should any IMAP extension require it, we'll have to
        // come back and change this assumption, though.
        spec = spec.substr(1, spec.length - 2);
        try {
          var out = formatArg(args[0], spec);
        } catch (e) {
          continue;
        }
        treatedArgs.push(out);
        args.shift();
        continue;
      }
      try {
        treatedArgs.push(formatArg(args.shift(), spec));
      } catch (e) {
        throw new Error("BAD " + e);
      }
    }
    if (args.length != 0) {
      throw new Error("BAD Too many arguments");
    }
    return treatedArgs;
  }

  // PROTOCOL COMMANDS (ordered as in spec)

  CAPABILITY() {
    var capa = "* CAPABILITY IMAP4rev1 " + this.kCapabilities.join(" ");
    if (this.kAuthSchemes.length > 0) {
      capa += " AUTH=" + this.kAuthSchemes.join(" AUTH=");
    }
    capa += "\0OK CAPABILITY completed";
    return capa;
  }
  CLIENTID() {
    return "OK Recognized a valid CLIENTID command, used for authentication methods";
  }
  LOGOUT() {
    this.closing = true;
    if (this._selectedMailbox) {
      this._daemon.synchronize(this._selectedMailbox, !this._readOnly);
    }
    this._state = IMAP_STATE_NOT_AUTHED;
    return "* BYE IMAP4rev1 Logging out\0OK LOGOUT completed";
  }
  NOOP() {
    return "OK NOOP completed";
  }
  STARTTLS() {
    // simulate annoying server that drops connection on STARTTLS
    if (this.dropOnStartTLS) {
      this.closing = true;
      return "";
    }
    return "BAD maild doesn't support TLS ATM";
  }
  _nextAuthFunction = undefined;
  AUTHENTICATE(args) {
    var scheme = args[0]; // already uppercased by type "atom"
    // |scheme| contained in |kAuthSchemes|?
    if (
      !this.kAuthSchemes.some(function (s) {
        return s == scheme;
      })
    ) {
      return "-ERR AUTH " + scheme + " not supported";
    }

    var func = this._kAuthSchemeStartFunction[scheme];
    if (!func || typeof func != "function") {
      return (
        "BAD I just pretended to implement AUTH " + scheme + ", but I don't"
      );
    }
    return func.apply(this, args.slice(1));
  }
  LOGIN(args) {
    if (
      this.kCapabilities.some(function (c) {
        return c == "LOGINDISABLED";
      })
    ) {
      return "BAD old-style LOGIN is disabled, use AUTHENTICATE";
    }
    if (args[0] == this.kUsername && args[1] == this.kPassword) {
      this._state = IMAP_STATE_AUTHED;
      return "OK authenticated";
    }
    return "BAD invalid password, I won't authenticate you";
  }
  SELECT(args) {
    var box = this._daemon.getMailbox(args[0]);
    if (!box) {
      return "NO no such mailbox";
    }

    if (this._selectedMailbox) {
      this._daemon.synchronize(this._selectedMailbox, !this._readOnly);
    }
    this._state = IMAP_STATE_SELECTED;
    this._selectedMailbox = box;
    this._readOnly = false;

    var response = "* FLAGS (" + box.msgflags.join(" ") + ")\0";
    response += "* " + box._messages.length + " EXISTS\0* ";
    response += box._messages.reduce(function (count, message) {
      return count + (message.recent ? 1 : 0);
    }, 0);
    response += " RECENT\0";
    for (var i = 0; i < box._messages.length; i++) {
      if (!box._messages[i].flags.includes("\\Seen")) {
        response += "* OK [UNSEEN " + (i + 1) + "]\0";
        break;
      }
    }
    response += "* OK [PERMANENTFLAGS (" + box.permflags.join(" ") + ")]\0";
    response += "* OK [UIDNEXT " + box.uidnext + "]\0";
    if ("uidvalidity" in box) {
      response += "* OK [UIDVALIDITY " + box.uidvalidity + "]\0";
    }
    return response + "OK [READ-WRITE] SELECT completed";
  }
  EXAMINE(args) {
    var box = this._daemon.getMailbox(args[0]);
    if (!box) {
      return "NO no such mailbox";
    }

    if (this._selectedMailbox) {
      this._daemon.synchronize(this._selectedMailbox, !this._readOnly);
    }
    this._state = IMAP_STATE_SELECTED;
    this._selectedMailbox = box;
    this._readOnly = true;

    var response = "* FLAGS (" + box.msgflags.join(" ") + ")\0";
    response += "* " + box._messages.length + " EXISTS\0* ";
    response += box._messages.reduce(function (count, message) {
      return count + (message.recent ? 1 : 0);
    }, 0);
    response += " RECENT\0";
    for (var i = 0; i < box._messages.length; i++) {
      if (!box._messages[i].flags.includes("\\Seen")) {
        response += "* OK [UNSEEN " + (i + 1) + "]\0";
        break;
      }
    }
    response += "* OK [PERMANENTFLAGS (" + box.permflags.join(" ") + ")]\0";
    response += "* OK [UIDNEXT " + box.uidnext + "]\0";
    response += "* OK [UIDVALIDITY " + box.uidvalidity + "]\0";
    return response + "OK [READ-ONLY] EXAMINE completed";
  }
  CREATE(args) {
    if (this._daemon.getMailbox(args[0])) {
      return "NO mailbox already exists";
    }
    if (!this._daemon.createMailbox(args[0])) {
      return "NO cannot create mailbox";
    }
    return "OK CREATE completed";
  }
  DELETE(args) {
    var mbox = this._daemon.getMailbox(args[0]);
    if (!mbox || mbox.name == "") {
      return "NO no such mailbox";
    }
    if (mbox._children.length > 0) {
      for (let i = 0; i < mbox.flags.length; i++) {
        if (mbox.flags[i] == "\\Noselect") {
          return "NO cannot delete mailbox";
        }
      }
    }
    this._daemon.deleteMailbox(mbox);
    return "OK DELETE completed";
  }
  RENAME(args) {
    var mbox = this._daemon.getMailbox(args[0]);
    if (!mbox || mbox.name == "") {
      return "NO no such mailbox";
    }
    if (!this._daemon.createMailbox(args[1], mbox)) {
      return "NO cannot rename mailbox";
    }
    return "OK RENAME completed";
  }
  SUBSCRIBE(args) {
    var mailbox = this._daemon.getMailbox(args[0]);
    if (!mailbox) {
      return "NO error in subscribing";
    }
    mailbox.subscribed = true;
    return "OK SUBSCRIBE completed";
  }
  UNSUBSCRIBE(args) {
    var mailbox = this._daemon.getMailbox(args[0]);
    if (mailbox) {
      mailbox.subscribed = false;
    }
    return "OK UNSUBSCRIBE completed";
  }
  LIST(args) {
    // even though this is the LIST function for RFC 3501, code for
    // LIST-EXTENDED (RFC 5258) is included here to keep things simple and
    // avoid duplication. We can get away with this because the _treatArgs
    // function filters out invalid args for servers that don't support
    // LIST-EXTENDED before they even get here.

    let listFunctionName = "_LIST";
    // check for optional list selection options argument used by LIST-EXTENDED
    // and other related RFCs
    if (args.length == 3 || (args.length > 3 && args[3] == "RETURN")) {
      let selectionOptions = args.shift();
      selectionOptions = selectionOptions.toString().split(" ");
      selectionOptions.sort();
      for (const option of selectionOptions) {
        listFunctionName += "_" + option.replace(/-/g, "_");
      }
    }
    // check for optional list return options argument used by LIST-EXTENDED
    // and other related RFCs
    if (
      (args.length > 2 && args[2] == "RETURN") ||
      this.kCapabilities.includes("CHILDREN")
    ) {
      listFunctionName += "_RETURN";
      const returnOptions = args[3] ? args[3].toString().split(" ") : [];
      if (
        this.kCapabilities.includes("CHILDREN") &&
        !returnOptions.includes("CHILDREN")
      ) {
        returnOptions.push("CHILDREN");
      }
      returnOptions.sort();
      for (const option of returnOptions) {
        listFunctionName += "_" + option.replace(/-/g, "_");
      }
    }
    if (!this[listFunctionName]) {
      return "BAD unknown LIST request options";
    }

    const base = this._daemon.getMailbox(args[0]);
    if (!base) {
      return "NO no such mailbox";
    }
    let requestedBoxes;
    // check for multiple mailbox patterns used by LIST-EXTENDED
    // and other related RFCs
    if (args[1].startsWith("(")) {
      requestedBoxes = parseCommand(args[1])[0];
    } else {
      requestedBoxes = [args[1]];
    }
    let response = "";
    for (const requestedBox of requestedBoxes) {
      const people = base.matchKids(requestedBox);
      for (const box of people) {
        response += this[listFunctionName](box);
      }
    }
    return response + "OK LIST completed";
  }
  // _LIST is the standard LIST command response
  _LIST(aBox) {
    if (aBox.nonExistent) {
      return "";
    }
    return (
      "* LIST (" +
      aBox.flags.join(" ") +
      ') "' +
      aBox.delimiter +
      '" "' +
      aBox.displayName +
      '"\0'
    );
  }
  LSUB(args) {
    var base = this._daemon.getMailbox(args[0]);
    if (!base) {
      return "NO no such mailbox";
    }
    var people = base.matchKids(args[1]);
    var response = "";
    for (var box of people) {
      if (box.subscribed) {
        response +=
          '* LSUB () "' + box.delimiter + '" "' + box.displayName + '"\0';
      }
    }
    return response + "OK LSUB completed";
  }
  STATUS(args) {
    var box = this._daemon.getMailbox(args[0]);
    if (!box) {
      return "NO no such mailbox exists";
    }
    for (let i = 0; i < box.flags.length; i++) {
      if (box.flags[i] == "\\Noselect") {
        return "NO STATUS not allowed on Noselect folder";
      }
    }
    var parts = [];
    for (var status of args[1]) {
      var line = status + " ";
      switch (status) {
        case "MESSAGES":
          line += box._messages.length;
          break;
        case "RECENT":
          line += box._messages.reduce(function (count, message) {
            return count + (message.recent ? 1 : 0);
          }, 0);
          break;
        case "UIDNEXT":
          line += box.uidnext;
          break;
        case "UIDVALIDITY":
          line += box.uidvalidity;
          break;
        case "UNSEEN":
          line += box._messages.reduce(function (count, message) {
            return count + (message.flags.includes("\\Seen") ? 0 : 1);
          }, 0);
          break;
        default:
          return "BAD unknown status flag: " + status;
      }
      parts.push(line);
    }
    return (
      '* STATUS "' +
      args[0] +
      '" (' +
      parts.join(" ") +
      ")\0OK STATUS completed"
    );
  }
  APPEND(args) {
    var mailbox = this._daemon.getMailbox(args[0]);
    if (!mailbox) {
      return "NO [TRYCREATE] no such mailbox";
    }
    var flags, date, text;
    if (args.length == 3) {
      if (args[1] instanceof Date) {
        flags = [];
        date = args[1];
      } else {
        flags = args[1];
        date = Date.now();
      }
      text = args[2];
    } else if (args.length == 4) {
      flags = args[1];
      date = args[2];
      text = args[3];
    } else {
      flags = [];
      date = Date.now();
      text = args[1];
    }
    var msg = new ImapMessage(
      "data:text/plain," + encodeURI(text),
      mailbox.uidnext++,
      flags
    );
    msg.recent = true;
    msg.date = date;
    mailbox.addMessage(msg);
    return "OK APPEND complete";
  }
  CHECK() {
    this._daemon.synchronize(this._selectedMailbox, false);
    return "OK CHECK completed";
  }
  CLOSE() {
    this._selectedMailbox.expunge();
    this._daemon.synchronize(this._selectedMailbox, !this._readOnly);
    this._selectedMailbox = null;
    this._state = IMAP_STATE_AUTHED;
    return "OK CLOSE completed";
  }
  EXPUNGE() {
    // Will be either empty or LF-terminated already
    var response = this._selectedMailbox.expunge();
    this._daemon.synchronize(this._selectedMailbox);
    return response + "OK EXPUNGE completed";
  }
  SEARCH(args) {
    if (args[0] == "UNDELETED") {
      let response = "* SEARCH";
      const messages = this._selectedMailbox._messages;
      for (let i = 0; i < messages.length; i++) {
        if (!messages[i].flags.includes("\\Deleted")) {
          response += " " + messages[i].uid;
        }
      }
      response += "\0";
      return response + "OK SEARCH COMPLETED";
    }
    return "BAD not here yet";
  }
  FETCH(args, uid) {
    // Step 1: Get the messages to fetch
    var ids = [];
    var messages = this._parseSequenceSet(args[0], uid, ids);

    // Step 2: Ensure that the fetching items are in a neat format
    if (typeof args[1] == "string") {
      if (args[1] in this.fetchMacroExpansions) {
        args[1] = this.fetchMacroExpansions[args[1]];
      } else {
        args[1] = [args[1]];
      }
    }
    if (uid && !args[1].includes("UID")) {
      args[1].push("UID");
    }

    // Step 2.1: Preprocess the item fetch stack
    var items = [],
      prefix = undefined;
    for (let item of args[1]) {
      if (item.indexOf("[") > 0 && !item.includes("]")) {
        // We want to append everything into an item until we find a ']'
        prefix = item + " ";
        continue;
      }
      if (prefix !== undefined) {
        if (typeof item != "string" || !item.includes("]")) {
          prefix +=
            (typeof item == "string" ? item : "(" + item.join(" ") + ")") + " ";
          continue;
        }
        // Replace superfluous space with a ']'.
        prefix = prefix.substr(0, prefix.length - 1) + "]";
        item = prefix;
        prefix = undefined;
      }
      item = item.toUpperCase();
      if (!items.includes(item)) {
        items.push(item);
      }
    }

    // Step 3: Fetch time!
    var response = "";
    for (var i = 0; i < messages.length; i++) {
      response += "* " + ids[i] + " FETCH (";
      var parts = [];
      const flagsBefore = messages[i].flags.slice();
      for (const item of items) {
        // Brief explanation: an item like BODY[]<> can't be hardcoded easily,
        // so we go for the initial alphanumeric substring, passing in the
        // actual string as an optional second part.
        var front = item.split(/[^A-Z0-9-]/, 1)[0];
        var functionName = "_FETCH_" + front.replace(/-/g, "_");

        if (!(functionName in this)) {
          return "BAD can't fetch " + front;
        }
        try {
          parts.push(this[functionName](messages[i], item));
        } catch (ex) {
          return "BAD error in fetching: " + ex;
        }
      }
      const flagsAfter = messages[i].flags;
      if (
        !items.includes("FLAGS") &&
        (flagsAfter.length != flagsBefore.length ||
          flagsAfter.some((f, index) => f != flagsBefore[index]))
      ) {
        // Flags changed, send them too, even though they weren't requested.
        parts.push(this._FETCH_FLAGS(messages[i], "FLAGS"));
      }
      response += parts.join(" ") + ")\0";
    }
    return response + "OK FETCH completed";
  }
  STORE(args, uid) {
    var ids = [];
    var messages = this._parseSequenceSet(args[0], uid, ids);

    args[1] = args[1].toUpperCase();
    var silent = args[1].includes(".SILENT", 1);
    if (silent) {
      args[1] = args[1].substring(0, args[1].indexOf("."));
    }

    if (typeof args[2] != "object") {
      args[2] = [args[2]];
    }

    var response = "";
    for (var i = 0; i < messages.length; i++) {
      var message = messages[i];
      switch (args[1]) {
        case "FLAGS":
          message.flags = args[2];
          break;
        case "+FLAGS":
          for (const flag of args[2]) {
            message.setFlag(flag);
          }
          break;
        case "-FLAGS":
          for (const flag of args[2]) {
            var index;
            if ((index = message.flags.indexOf(flag)) != -1) {
              message.flags.splice(index, 1);
            }
          }
          break;
        default:
          return "BAD change what now?";
      }
      response += "* " + ids[i] + " FETCH (FLAGS (";
      response += message.flags.join(" ");
      response += "))\0";
    }
    if (silent) {
      response = "";
    }
    return response + "OK STORE completed";
  }
  COPY(args, uid) {
    var messages = this._parseSequenceSet(args[0], uid);

    var dest = this._daemon.getMailbox(args[1]);
    if (!dest) {
      return "NO [TRYCREATE] what mailbox?";
    }

    for (var message of messages) {
      const newMessage = new ImapMessage(
        message._URI,
        dest.uidnext++,
        message.flags
      );
      newMessage.recent = false;
      dest.addMessage(newMessage);
    }
    if (this._daemon.copySleep > 0) {
      // spin rudely for copyTimeout milliseconds.
      const now = new Date();
      let alarm;
      const startingMSeconds = now.getTime();

      while (true) {
        alarm = new Date();
        if (alarm.getTime() - startingMSeconds > this._daemon.copySleep) {
          break;
        }
      }
    }
    return "OK COPY completed";
  }
  UID(args) {
    var name = args.shift();
    if (!this.kUidCommands.includes(name)) {
      return "BAD illegal command " + name;
    }

    args = this._treatArgs(args, name);
    return this[name](args, true);
  }

  postCommand(reader) {
    if (this.closing) {
      this.closing = false;
      reader.closeSocket();
    }
    if (this.sendingLiteral) {
      reader.preventLFMunge();
    }
    reader.setMultiline(this._multiline);
    if (this._lastCommand == reader.watchWord) {
      reader.stopTest();
    }
  }
  onServerFault(e) {
    return (
      ("_tag" in this ? this._tag : "*") + " BAD Internal server error: " + e
    );
  }

  // FETCH sub commands and helpers

  fetchMacroExpansions = {
    ALL: ["FLAGS", "INTERNALDATE", "RFC822.SIZE" /* , "ENVELOPE" */],
    FAST: ["FLAGS", "INTERNALDATE", "RFC822.SIZE"],
    FULL: ["FLAGS", "INTERNALDATE", "RFC822.SIZE" /* , "ENVELOPE", "BODY" */],
  };
  _parseSequenceSet(set, uid, ids /* optional */) {
    if (typeof set == "number") {
      if (uid) {
        for (let i = 0; i < this._selectedMailbox._messages.length; i++) {
          var message = this._selectedMailbox._messages[i];
          if (message.uid == set) {
            if (ids) {
              ids.push(i + 1);
            }
            return [message];
          }
        }
        return [];
      }
      if (!(set - 1 in this._selectedMailbox._messages)) {
        return [];
      }
      if (ids) {
        ids.push(set);
      }
      return [this._selectedMailbox._messages[set - 1]];
    }

    var daemon = this;
    function part2num(part) {
      if (part == "*") {
        if (uid) {
          return daemon._selectedMailbox._highestuid;
        }
        return daemon._selectedMailbox._messages.length;
      }
      const re = /[0-9]/g;
      const num = part.match(re);
      if (!num || num.length != part.length) {
        throw new Error("BAD invalid UID " + part);
      }
      return parseInt(part);
    }

    var elements = set.split(/,/);
    set = [];
    for (var part of elements) {
      if (!part.includes(":")) {
        set.push(part2num(part));
      } else {
        var range = part.split(/:/);
        range[0] = part2num(range[0]);
        range[1] = part2num(range[1]);
        if (range[0] > range[1]) {
          const temp = range[1];
          range[1] = range[0];
          range[0] = temp;
        }
        for (let i = range[0]; i <= range[1]; i++) {
          set.push(i);
        }
      }
    }
    set.sort();
    for (let i = set.length - 1; i > 0; i--) {
      if (set[i] == set[i - 1]) {
        set.splice(i, 0);
      }
    }

    if (!ids) {
      ids = [];
    }
    var messages;
    if (uid) {
      messages = this._selectedMailbox._messages.filter(function (msg, i) {
        if (!set.includes(msg.uid)) {
          return false;
        }
        ids.push(i + 1);
        return true;
      });
    } else {
      messages = [];
      for (var id of set) {
        if (id - 1 in this._selectedMailbox._messages) {
          ids.push(id);
          messages.push(this._selectedMailbox._messages[id - 1]);
        }
      }
    }
    return messages;
  }
  _FETCH_BODY(message, query) {
    if (query == "BODY") {
      return "BODYSTRUCTURE " + bodystructure(message.getText(), false);
    }
    // parts = [ name, section, empty, {, partial, empty } ]
    var parts = query.split(/[[\]<>]/);

    if (parts[0] != "BODY.PEEK" && !this._readOnly) {
      message.setFlag("\\Seen");
    }

    if (parts[3]) {
      parts[3] = parts[3].split(/\./).map(function (e) {
        return parseInt(e);
      });
    }

    if (parts[1].length == 0) {
      // Easy case: we have BODY[], just send the message...
      let response = "BODY[]";
      var text;
      if (parts[3]) {
        response += "<" + parts[3][0] + ">";
        text = message.getText(parts[3][0], parts[3][1]);
      } else {
        text = message.getText();
      }
      response += " {" + text.length + "}\r\n";
      response += text;
      return response;
    }

    // What's inside the command?
    var data = /((?:\d+\.)*\d+)(?:\.([^ ]+))?/.exec(parts[1]);
    var partNum;
    if (data) {
      partNum = data[1];
      query = data[2];
    } else {
      partNum = "";
      if (parts[1].includes(" ", 1)) {
        query = parts[1].substring(0, parts[1].indexOf(" "));
      } else {
        query = parts[1];
      }
    }
    var queryArgs;
    if (parts[1].includes(" ", 1)) {
      queryArgs = parseCommand(parts[1].substr(parts[1].indexOf(" ")))[0];
    } else {
      queryArgs = [];
    }

    // Now we have three parameters representing the part number (empty for top-
    // level), the subportion representing what we want to find (empty for the
    // body), and an array of arguments if we have a subquery. If we made an
    // error here, it will pop until it gets to FETCH, which will just pop at a
    // BAD response, which is what should happen if the query is malformed.
    // Now we dump it all off onto ImapMessage to mess with.

    // Start off the response
    let response = "BODY[" + parts[1] + "]";
    if (parts[3]) {
      response += "<" + parts[3][0] + ">";
    }
    response += " ";

    data = "";
    switch (query) {
      case "":
      case "TEXT":
        data += message.getPartBody(partNum);
        break;
      case "HEADER": // I believe this specifies mime for an RFC822 message only
        data += message.getPartHeaders(partNum).rawHeaderText + "\r\n";
        break;
      case "MIME":
        data += message.getPartHeaders(partNum).rawHeaderText + "\r\n\r\n";
        break;
      case "HEADER.FIELDS": {
        const joinList = [];
        const headers = message.getPartHeaders(partNum);
        for (let header of queryArgs) {
          header = header.toLowerCase();
          if (headers.has(header)) {
            joinList.push(
              headers
                .getRawHeader(header)
                .map(value => `${header}: ${value}`)
                .join("\r\n")
            );
          }
        }
        data += joinList.join("\r\n") + "\r\n";
        break;
      }
      case "HEADER.FIELDS.NOT": {
        const joinList = [];
        const headers = message.getPartHeaders(partNum);
        for (const header of headers) {
          if (!(header in queryArgs)) {
            joinList.push(
              headers
                .getRawHeader(header)
                .map(value => `${header}: ${value}`)
                .join("\r\n")
            );
          }
        }
        data += joinList.join("\r\n") + "\r\n";
        break;
      }
      default:
        data += message.getPartBody(partNum);
    }

    this.sendingLiteral = true;
    response += "{" + data.length + "}\r\n";
    response += data;
    return response;
  }
  _FETCH_BODYSTRUCTURE(message) {
    return "BODYSTRUCTURE " + bodystructure(message.getText(), true);
  }
  // _FETCH_ENVELOPE,
  _FETCH_FLAGS(message) {
    var response = "FLAGS (";
    response += message.flags.join(" ");
    if (message.recent) {
      response += " \\Recent";
    }
    response += ")";
    return response;
  }
  _FETCH_INTERNALDATE(message) {
    const date = message.date;
    // Format timestamp as: "%d-%b-%Y %H:%M:%S %z" (%b in English).
    const year = date.getFullYear().toString();
    const month = date.toLocaleDateString("en-US", { month: "short" });
    const day = date.getDate().toString();
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const seconds = date.getSeconds().toString().padStart(2, "0");
    const offset = date.getTimezoneOffset();
    const tzoff =
      Math.floor(Math.abs(offset) / 60) * 100 + (Math.abs(offset) % 60);
    const timeZone =
      (offset < 0 ? "+" : "-") + tzoff.toString().padStart(4, "0");

    let response = 'INTERNALDATE "';
    response += `${day}-${month}-${year} ${hours}:${minutes}:${seconds} ${timeZone}`;
    response += '"';
    return response;
  }
  _FETCH_RFC822(message, query) {
    if (query == "RFC822") {
      return this._FETCH_BODY(message, "BODY[]").replace("BODY[]", "RFC822");
    }
    if (query == "RFC822.HEADER") {
      return this._FETCH_BODY(message, "BODY.PEEK[HEADER]").replace(
        "BODY[HEADER]",
        "RFC822.HEADER"
      );
    }
    if (query == "RFC822.TEXT") {
      return this._FETCH_BODY(message, "BODY[TEXT]").replace(
        "BODY[TEXT]",
        "RFC822.TEXT"
      );
    }

    if (query == "RFC822.SIZE") {
      var channel = message.channel;
      var length = message.size ? message.size : channel.contentLength;
      if (length == -1) {
        var inputStream = channel.open();
        length = inputStream.available();
        inputStream.close();
      }
      return "RFC822.SIZE " + length;
    }
    throw new Error("Unknown item " + query);
  }
  _FETCH_UID(message) {
    return "UID " + message.uid;
  }
}

// IMAP4 RFC extensions
// --------------------
// Since there are so many extensions to IMAP, and since these extensions are
// not strictly hierarchical (e.g., an RFC 2342-compliant server can also be
// RFC 3516-compliant, but a server might only implement one of them), they
// must be handled differently from other fakeserver implementations.
// An extension is defined as follows: it is an object (not a function and
// prototype pair!). This object is "mixed" into the handler via the helper
// function mixinExtension, which applies appropriate magic to make the
// handler compliant to the extension. Functions are added untransformed, but
// both arrays and objects are handled by appending the values onto the
// original state of the handler. Semantics apply as for the base itself.

// Note that UIDPLUS (RFC4315) should be mixed in last (or at least after the
// MOVE extension) because it changes behavior of that extension.
export var configurations = {
  Cyrus: ["RFC2342", "RFC2195", "RFC5258"],
  UW: ["RFC2342", "RFC2195"],
  Dovecot: ["RFC2195", "RFC5258"],
  Zimbra: ["RFC2197", "RFC2342", "RFC2195", "RFC5258"],
  Exchange: ["RFC2342", "RFC2195"],
  LEMONADE: ["RFC2342", "RFC2195"],
  CUSTOM1: ["MOVE", "RFC4315", "CUSTOM"],
  GMail: ["GMAIL", "RFC2197", "RFC2342", "RFC3348", "RFC4315"],
};

export function mixinExtension(handler, extension) {
  if (extension.preload) {
    extension.preload(handler);
  }

  for (var property in extension) {
    if (property == "preload") {
      continue;
    }
    if (typeof extension[property] == "function") {
      // This is a function, so we add it to the handler
      handler[property] = extension[property];
    } else if (extension[property] instanceof Array) {
      // This is an array, so we append the values
      if (!(property in handler)) {
        handler[property] = [];
      }
      handler[property] = handler[property].concat(extension[property]);
    } else if (property in handler) {
      // This is an object, so we add in the values
      // Hack to make arrays et al. work recursively
      mixinExtension(handler[property], extension[property]);
    } else {
      handler[property] = extension[property];
    }
  }
}

// Support for Gmail extensions: XLIST and X-GM-EXT-1
export var IMAP_GMAIL_extension = {
  preload(toBeThis) {
    toBeThis._preGMAIL_STORE = toBeThis.STORE;
    toBeThis._preGMAIL_STORE_argFormat = toBeThis._argFormat.STORE;
    toBeThis._argFormat.STORE = ["number", "atom", "..."];
    toBeThis._DEFAULT_LIST = toBeThis.LIST;
  },
  XLIST(args) {
    // XLIST is really just SPECIAL-USE that does not conform to RFC 6154
    return this.LIST(args);
  },
  LIST(args) {
    // XLIST was deprecated, LIST implies SPECIAL-USE for Gmail.
    args.push("RETURN");
    args.push("SPECIAL-USE");
    return this._DEFAULT_LIST(args);
  },
  _LIST_RETURN_CHILDREN(aBox) {
    return IMAP_RFC5258_extension._LIST_RETURN_CHILDREN(aBox);
  },
  _LIST_RETURN_CHILDREN_SPECIAL_USE(aBox) {
    if (aBox.nonExistent) {
      return "";
    }

    let result = "* LIST (" + aBox.flags.join(" ");
    if (aBox._children.length > 0) {
      if (aBox.flags.length > 0) {
        result += " ";
      }
      result += "\\HasChildren";
    } else if (!aBox.flags.includes("\\NoInferiors")) {
      if (aBox.flags.length > 0) {
        result += " ";
      }
      result += "\\HasNoChildren";
    }
    if (aBox.specialUseFlag && aBox.specialUseFlag.length > 0) {
      result += " " + aBox.specialUseFlag;
    }
    result += ') "' + aBox.delimiter + '" "' + aBox.displayName + '"\0';
    return result;
  },
  STORE(args, uid) {
    const regex = /[+-]?FLAGS.*/;
    if (regex.test(args[1])) {
      // if we are storing flags, use the method that was overridden
      this._argFormat = this._preGMAIL_STORE_argFormat;
      args = this._treatArgs(args, "STORE");
      return this._preGMAIL_STORE(args, uid);
    }
    // otherwise, handle gmail specific cases
    const ids = [];
    const messages = this._parseSequenceSet(args[0], uid, ids);
    args[2] = formatArg(args[2], "string|(string)");
    for (let i = 0; i < args[2].length; i++) {
      if (args[2][i].includes(" ")) {
        args[2][i] = '"' + args[2][i] + '"';
      }
    }
    let response = "";
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      switch (args[1]) {
        case "X-GM-LABELS":
          if (message.xGmLabels) {
            message.xGmLabels = args[2];
          } else {
            return "BAD can't store X-GM-LABELS";
          }
          break;
        case "+X-GM-LABELS":
          if (message.xGmLabels) {
            message.xGmLabels = message.xGmLabels.concat(args[2]);
          } else {
            return "BAD can't store X-GM-LABELS";
          }
          break;
        case "-X-GM-LABELS":
          if (message.xGmLabels) {
            for (let j = 0; j < args[2].length; j++) {
              const idx = message.xGmLabels.indexOf(args[2][j]);
              if (idx != -1) {
                message.xGmLabels.splice(idx, 1);
              }
            }
          } else {
            return "BAD can't store X-GM-LABELS";
          }
          break;
        default:
          return "BAD change what now?";
      }
      response += "* " + ids[i] + " FETCH (X-GM-LABELS (";
      response += message.xGmLabels.join(" ");
      response += "))\0";
    }
    return response + "OK STORE completed";
  },
  _FETCH_X_GM_MSGID(message) {
    if (message.xGmMsgid) {
      return "X-GM-MSGID " + message.xGmMsgid;
    }
    return "BAD can't fetch X-GM-MSGID";
  },
  _FETCH_X_GM_THRID(message) {
    if (message.xGmThrid) {
      return "X-GM-THRID " + message.xGmThrid;
    }
    return "BAD can't fetch X-GM-THRID";
  },
  _FETCH_X_GM_LABELS(message) {
    if (message.xGmLabels) {
      return "X-GM-LABELS " + message.xGmLabels;
    }
    return "BAD can't fetch X-GM-LABELS";
  },
  kCapabilities: ["XLIST", "X-GM-EXT-1"],
  _argFormat: { XLIST: ["mailbox", "mailbox"] },
  // Enabled in AUTHED and SELECTED states
  _enabledCommands: { 1: ["XLIST"], 2: ["XLIST"] },
};

export var IMAP_MOVE_extension = {
  MOVE(args, uid) {
    const messages = this._parseSequenceSet(args[0], uid);

    const dest = this._daemon.getMailbox(args[1]);
    if (!dest) {
      return "NO [TRYCREATE] what mailbox?";
    }

    for (var message of messages) {
      const newMessage = new ImapMessage(
        message._URI,
        dest.uidnext++,
        message.flags
      );
      newMessage.recent = false;
      dest.addMessage(newMessage);
    }
    const mailbox = this._selectedMailbox;
    let response = "";
    for (let i = messages.length - 1; i >= 0; i--) {
      const msgIndex = mailbox._messages.indexOf(messages[i]);
      if (msgIndex != -1) {
        response += "* " + (msgIndex + 1) + " EXPUNGE\0";
        mailbox._messages.splice(msgIndex, 1);
      }
    }
    if (response.length > 0) {
      delete mailbox.__highestuid;
    }

    return response + "OK MOVE completed";
  },
  kCapabilities: ["MOVE"],
  kUidCommands: ["MOVE"],
  _argFormat: { MOVE: ["number", "mailbox"] },
  // Enabled in SELECTED state
  _enabledCommands: { 2: ["MOVE"] },
};

// Provides methods for testing fetchCustomAttribute and issueCustomCommand
export var IMAP_CUSTOM_extension = {
  preload(toBeThis) {
    toBeThis._preCUSTOM_STORE = toBeThis.STORE;
    toBeThis._preCUSTOM_STORE_argFormat = toBeThis._argFormat.STORE;
    toBeThis._argFormat.STORE = ["number", "atom", "..."];
  },
  STORE(args, uid) {
    const regex = /[+-]?FLAGS.*/;
    if (regex.test(args[1])) {
      // if we are storing flags, use the method that was overridden
      this._argFormat = this._preCUSTOM_STORE_argFormat;
      args = this._treatArgs(args, "STORE");
      return this._preCUSTOM_STORE(args, uid);
    }
    // otherwise, handle custom attribute
    const ids = [];
    const messages = this._parseSequenceSet(args[0], uid, ids);
    args[2] = formatArg(args[2], "string|(string)");
    for (let i = 0; i < args[2].length; i++) {
      if (args[2][i].includes(" ")) {
        args[2][i] = '"' + args[2][i] + '"';
      }
    }
    let response = "";
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      switch (args[1]) {
        case "X-CUSTOM-VALUE":
          if (message.xCustomValue && args[2].length == 1) {
            message.xCustomValue = args[2][0];
          } else {
            return "BAD can't store X-CUSTOM-VALUE";
          }
          break;
        case "X-CUSTOM-LIST":
          if (message.xCustomList) {
            message.xCustomList = args[2];
          } else {
            return "BAD can't store X-CUSTOM-LIST";
          }
          break;
        case "+X-CUSTOM-LIST":
          if (message.xCustomList) {
            message.xCustomList = message.xCustomList.concat(args[2]);
          } else {
            return "BAD can't store X-CUSTOM-LIST";
          }
          break;
        case "-X-CUSTOM-LIST":
          if (message.xCustomList) {
            for (let j = 0; j < args[2].length; j++) {
              const idx = message.xCustomList.indexOf(args[2][j]);
              if (idx != -1) {
                message.xCustomList.splice(idx, 1);
              }
            }
          } else {
            return "BAD can't store X-CUSTOM-LIST";
          }
          break;
        default:
          return "BAD change what now?";
      }
      response += "* " + ids[i] + " FETCH (X-CUSTOM-LIST (";
      response += message.xCustomList.join(" ");
      response += "))\0";
    }
    return response + "OK STORE completed";
  },
  _FETCH_X_CUSTOM_VALUE(message) {
    if (message.xCustomValue) {
      return "X-CUSTOM-VALUE " + message.xCustomValue;
    }
    return "BAD can't fetch X-CUSTOM-VALUE";
  },
  _FETCH_X_CUSTOM_LIST(message) {
    if (message.xCustomList) {
      return "X-CUSTOM-LIST (" + message.xCustomList.join(" ") + ")";
    }
    return "BAD can't fetch X-CUSTOM-LIST";
  },
  kCapabilities: ["X-CUSTOM1"],
};

// RFC 2087: Quota (incomplete implementation)
export var IMAP_RFC2087_extension = {
  GETQUOTAROOT(args) {
    const mailbox = this._daemon.getMailbox(args[0]);
    const quota = mailbox.quota ?? {};
    const response = [`* QUOTAROOT INBOX ""`];
    for (const [name, { usage, limit }] of Object.entries(quota)) {
      response.push(`* QUOTA "" (${name} ${usage} ${limit})`);
    }
    response.push("OK Getquota completed");
    return response.join("\0");
  },
  kCapabilities: ["QUOTA"],
  _argFormat: { GETQUOTAROOT: ["mailbox"] },
  _enabledCommands: { 1: ["GETQUOTAROOT"], 2: ["GETQUOTAROOT"] },
};

// RFC 2197: ID
export var IMAP_RFC2197_extension = {
  ID(args) {
    let clientID = "(";
    for (const i of args) {
      clientID += '"' + i + '"';
    }

    clientID += ")";
    const clientStrings = clientID.split(",");
    clientID = "";
    for (const i of clientStrings) {
      clientID += '"' + i + '" ';
    }
    clientID = clientID.slice(1, clientID.length - 3);
    clientID += ")";
    this._daemon.clientID = clientID;
    return "* ID " + this._daemon.idResponse + "\0OK Success";
  },
  kCapabilities: ["ID"],
  _argFormat: { ID: ["(string)"] },
  _enabledCommands: { 1: ["ID"], 2: ["ID"] },
};

// RFC 2342: IMAP4 Namespace (NAMESPACE)
export var IMAP_RFC2342_extension = {
  NAMESPACE() {
    var namespaces = [[], [], []];
    for (const namespace of this._daemon.namespaces) {
      namespaces[namespace.type].push(namespace);
    }

    var response = "* NAMESPACE";
    for (var type of namespaces) {
      if (type.length == 0) {
        response += " NIL";
        continue;
      }
      response += " (";
      for (const namespace of type) {
        response += '("';
        response += namespace.displayName;
        response += '" "';
        response += namespace.delimiter;
        response += '")';
      }
      response += ")";
    }
    response += "\0OK NAMESPACE command completed";
    return response;
  },
  kCapabilities: ["NAMESPACE"],
  _argFormat: { NAMESPACE: [] },
  // Enabled in AUTHED and SELECTED states
  _enabledCommands: { 1: ["NAMESPACE"], 2: ["NAMESPACE"] },
};

// RFC 3348 Child Mailbox (CHILDREN)
export var IMAP_RFC3348_extension = {
  kCapabilities: ["CHILDREN"],
};

// RFC 4315: UIDPLUS
export var IMAP_RFC4315_extension = {
  preload(toBeThis) {
    toBeThis._preRFC4315UID = toBeThis.UID;
    toBeThis._preRFC4315APPEND = toBeThis.APPEND;
    toBeThis._preRFC4315COPY = toBeThis.COPY;
    toBeThis._preRFC4315MOVE = toBeThis.MOVE;
  },
  UID(args) {
    // XXX: UID EXPUNGE is not supported.
    return this._preRFC4315UID(args);
  },
  APPEND(args) {
    let response = this._preRFC4315APPEND(args);
    if (response.indexOf("OK") == 0) {
      const mailbox = this._daemon.getMailbox(args[0]);
      const uid = mailbox.uidnext - 1;
      response =
        "OK [APPENDUID " +
        mailbox.uidvalidity +
        " " +
        uid +
        "]" +
        response.substring(2);
    }
    return response;
  },
  COPY(args) {
    const mailbox = this._daemon.getMailbox(args[0]);
    if (mailbox) {
      var first = mailbox.uidnext;
    }
    let response = this._preRFC4315COPY(args);
    if (response.indexOf("OK") == 0) {
      const last = mailbox.uidnext - 1;
      response =
        "OK [COPYUID " +
        this._selectedMailbox.uidvalidity +
        " " +
        args[0] +
        " " +
        first +
        ":" +
        last +
        "]" +
        response.substring(2);
    }
    return response;
  },
  MOVE(args) {
    const mailbox = this._daemon.getMailbox(args[1]);
    if (mailbox) {
      var first = mailbox.uidnext;
    }
    let response = this._preRFC4315MOVE(args);
    if (response.includes("OK MOVE")) {
      const last = mailbox.uidnext - 1;
      response = response.replace(
        "OK MOVE",
        "OK [COPYUID " +
          this._selectedMailbox.uidvalidity +
          " " +
          args[0] +
          " " +
          first +
          ":" +
          last +
          "]"
      );
    }
    return response;
  },
  kCapabilities: ["UIDPLUS"],
};

// RFC 5258: LIST-EXTENDED
export var IMAP_RFC5258_extension = {
  preload(toBeThis) {
    toBeThis._argFormat.LIST = [
      "[(atom)]",
      "mailbox",
      "mailbox|(mailbox)",
      "[atom]",
      "[(atom)]",
    ];
  },
  _LIST_SUBSCRIBED(aBox) {
    if (!aBox.subscribed) {
      return "";
    }

    let result = "* LIST (" + aBox.flags.join(" ");
    if (aBox.flags.length > 0) {
      result += " ";
    }
    result += "\\Subscribed";
    if (aBox.nonExistent) {
      result += " \\NonExistent";
    }
    result += ') "' + aBox.delimiter + '" "' + aBox.displayName + '"\0';
    return result;
  },
  _LIST_RETURN_CHILDREN(aBox) {
    if (aBox.nonExistent) {
      return "";
    }

    let result = "* LIST (" + aBox.flags.join(" ");
    if (aBox._children.length > 0) {
      if (aBox.flags.length > 0) {
        result += " ";
      }
      result += "\\HasChildren";
    } else if (!aBox.flags.includes("\\NoInferiors")) {
      if (aBox.flags.length > 0) {
        result += " ";
      }
      result += "\\HasNoChildren";
    }
    result += ') "' + aBox.delimiter + '" "' + aBox.displayName + '"\0';
    return result;
  },
  _LIST_RETURN_SUBSCRIBED(aBox) {
    if (aBox.nonExistent) {
      return "";
    }

    let result = "* LIST (" + aBox.flags.join(" ");
    if (aBox.subscribed) {
      if (aBox.flags.length > 0) {
        result += " ";
      }
      result += "\\Subscribed";
    }
    result += ') "' + aBox.delimiter + '" "' + aBox.displayName + '"\0';
    return result;
  },
  // TODO implement _LIST_REMOTE, _LIST_RECURSIVEMATCH, _LIST_RETURN_SUBSCRIBED
  // and all valid combinations thereof. Currently, nsImapServerResponseParser
  // does not support any of these responses anyway.

  kCapabilities: ["LIST-EXTENDED"],
};

/**
 * This implements AUTH schemes. Could be moved into RFC3501 actually.
 * The test can en-/disable auth schemes by modifying kAuthSchemes.
 */
export var IMAP_RFC2195_extension = {
  kAuthSchemes: ["CRAM-MD5", "PLAIN", "LOGIN"],

  preload(handler) {
    handler._kAuthSchemeStartFunction["CRAM-MD5"] = this.authCRAMStart;
    handler._kAuthSchemeStartFunction.PLAIN = this.authPLAINStart;
    handler._kAuthSchemeStartFunction.LOGIN = this.authLOGINStart;
  },

  authPLAINStart() {
    this._nextAuthFunction = this.authPLAINCred;
    this._multiline = true;

    return "+";
  },
  authPLAINCred(line) {
    var req = AuthPLAIN.decodeLine(line);
    if (req.username == this.kUsername && req.password == this.kPassword) {
      this._state = IMAP_STATE_AUTHED;
      return "OK Hello friend! Friends give friends good advice: Next time, use CRAM-MD5";
    }
    return "BAD Wrong username or password, crook!";
  },

  authCRAMStart() {
    this._nextAuthFunction = this.authCRAMDigest;
    this._multiline = true;

    this._usedCRAMMD5Challenge = AuthCRAM.createChallenge("localhost");
    return "+ " + this._usedCRAMMD5Challenge;
  },
  authCRAMDigest(line) {
    var req = AuthCRAM.decodeLine(line);
    var expectedDigest = AuthCRAM.encodeCRAMMD5(
      this._usedCRAMMD5Challenge,
      this.kPassword
    );
    if (req.username == this.kUsername && req.digest == expectedDigest) {
      this._state = IMAP_STATE_AUTHED;
      return "OK Hello friend!";
    }
    return "BAD Wrong username or password, crook!";
  },

  authLOGINStart() {
    this._nextAuthFunction = this.authLOGINUsername;
    this._multiline = true;

    return "+ " + btoa("Username:");
  },
  authLOGINUsername(line) {
    var req = AuthLOGIN.decodeLine(line);
    if (req == this.kUsername) {
      this._nextAuthFunction = this.authLOGINPassword;
    } else {
      // Don't return error yet, to not reveal valid usernames
      this._nextAuthFunction = this.authLOGINBadUsername;
    }
    this._multiline = true;
    return "+ " + btoa("Password:");
  },
  authLOGINBadUsername() {
    return "BAD Wrong username or password, crook!";
  },
  authLOGINPassword(line) {
    var req = AuthLOGIN.decodeLine(line);
    if (req == this.kPassword) {
      this._state = IMAP_STATE_AUTHED;
      return "OK Hello friend! Where did you pull out this old auth scheme?";
    }
    return "BAD Wrong username or password, crook!";
  },
};

/**
 * Implements XOAUTH2 authentication.
 */
export var IMAP_OAUTH2_extension = {
  kAuthSchemes: ["XOAUTH2"],

  preload(handler) {
    handler._kAuthSchemeStartFunction.XOAUTH2 = this.authXOAUTH2Start;
  },

  authXOAUTH2Start(lineRest) {
    const [user, auth] = atob(lineRest).split("\u0001");
    if (
      user == `user=${this.kUsername}` &&
      auth == `auth=Bearer ${this.kPassword}` &&
      lazy.OAuth2TestUtils.validateToken(this.kPassword, "test_mail")
    ) {
      this._state = IMAP_STATE_AUTHED;
      return "OK Yeah, that's the right access token.";
    }
    return "BAD Yeah, nah, that's the wrong access token.";
  },
};

// FETCH BODYSTRUCTURE
function bodystructure(msg, extension) {
  if (!msg || msg == "") {
    return "";
  }

  // Use the mime parser emitter to generate body structure data. Most of the
  // string will be built as we exit a part. Currently not working:
  // 1. Some of the fields return NIL instead of trying to calculate them.
  // 2. MESSAGE is missing the ENVELOPE and the lines at the end.
  var bodystruct = "";
  function paramToString(params) {
    const paramList = [];
    for (const [param, value] of params) {
      paramList.push('"' + param.toUpperCase() + '" "' + value + '"');
    }
    return paramList.length == 0 ? "NIL" : "(" + paramList.join(" ") + ")";
  }
  var headerStack = [];
  var BodyStructureEmitter = {
    startPart(partNum, headers) {
      bodystruct += "(";
      headerStack.push(headers);
      this.numLines = 0;
      this.length = 0;
    },
    deliverPartData(partNum, data) {
      this.length += data.length;
      this.numLines += Array.from(data).filter(x => x == "\n").length;
    },
    endPart() {
      // Grab the headers from before
      const headers = headerStack.pop();
      const contentType = headers.contentType;
      if (contentType.mediatype == "multipart") {
        bodystruct += ' "' + contentType.subtype.toUpperCase() + '"';
        if (extension) {
          bodystruct += " " + paramToString(contentType);
          // XXX: implement the rest
          bodystruct += " NIL NIL NIL";
        }
      } else {
        bodystruct +=
          '"' +
          contentType.mediatype.toUpperCase() +
          '" "' +
          contentType.subtype.toUpperCase() +
          '"';
        bodystruct += " " + paramToString(contentType);

        // XXX: Content ID, Content description
        bodystruct += " NIL NIL";

        const cte = headers.has("content-transfer-encoding")
          ? headers.get("content-transfer-encoding")
          : "7BIT";
        bodystruct += ' "' + cte + '"';

        bodystruct += " " + this.length;
        if (contentType.mediatype == "text") {
          bodystruct += " " + this.numLines;
        }

        // XXX: I don't want to implement these yet
        if (extension) {
          bodystruct += " NIL NIL NIL NIL";
        }
      }
      bodystruct += ")";
    },
  };
  MimeParser.parseSync(msg, BodyStructureEmitter, {});
  return bodystruct;
}
