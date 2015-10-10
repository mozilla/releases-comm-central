(function (root, fn) {
  if (typeof define === 'function' && define.amd) {
    define(fn);
  } else if (typeof module !== 'undefined' && module.exports) {
    module.exports = fn();
  } else {
    root.jsmime = fn();
  }
}(this, function() {
  var mods = {};
  function req(id) {
    return mods[id.replace(/^\.\//, '')];
  }

  function def(id, fn) {
    mods[id] = fn(req);
  }
def('mimeutils', function() {
"use strict";

/**
 * Decode a quoted-printable buffer into a binary string.
 *
 * @param buffer {BinaryString} The string to decode.
 * @param more   {Boolean}      This argument is ignored.
 * @returns {Array(BinaryString, BinaryString)} The first element of the array
 *          is the decoded string. The second element is always the empty
 *          string.
 */
function decode_qp(buffer, more) {
  // Unlike base64, quoted-printable isn't stateful across multiple lines, so
  // there is no need to buffer input, so we can always ignore more.
  let decoded = buffer.replace(
    // Replace either =<hex><hex> or =<wsp>CRLF
    /=([0-9A-F][0-9A-F]|[ \t]*(\r\n|[\r\n]|$))/gi,
    function replace_chars(match, param) {
      // If trailing text matches [ \t]*CRLF, drop everything, since it's a
      // soft line break.
      if (param.trim().length == 0)
        return '';
      return String.fromCharCode(parseInt(param, 16));
    });
  return [decoded, ''];
}

/**
 * Decode a base64 buffer into a binary string. Unlike window.atob, the buffer
 * may contain non-base64 characters that will be ignored.
 *
 * @param buffer {BinaryString} The string to decode.
 * @param more   {Boolean}      If true, we expect that this function could be
 *                              called again and should retain extra data. If
 *                              false, we should flush all pending output.
 * @returns {Array(BinaryString, BinaryString)} The first element of the array
 *          is the decoded string. The second element contains the data that
 *          could not be decoded and needs to be retained for the next call.
 */
function decode_base64(buffer, more) {
  // Drop all non-base64 characters
  let sanitize = buffer.replace(/[^A-Za-z0-9+\/=]/g,'');
  // We need to encode in groups of 4 chars. If we don't have enough, leave the
  // excess for later. If there aren't any more, drop enough to make it 4.
  let excess = sanitize.length % 4;
  if (excess != 0 && more)
    buffer = sanitize.slice(-excess);
  else
    buffer = '';
  sanitize = sanitize.substring(0, sanitize.length - excess);
  // Use the atob function we (ought to) have in global scope.
  return [atob(sanitize), buffer];
}

/**
 * Converts a binary string into a Uint8Array buffer.
 *
 * @param buffer {BinaryString} The string to convert.
 * @returns {Uint8Array} The converted data.
 */
function stringToTypedArray(buffer) {
  var typedarray = new Uint8Array(buffer.length);
  for (var i = 0; i < buffer.length; i++)
    typedarray[i] = buffer.charCodeAt(i);
  return typedarray;
}

/**
 * Converts a Uint8Array buffer to a binary string.
 *
 * @param buffer {BinaryString} The string to convert.
 * @returns {Uint8Array} The converted data.
 */
function typedArrayToString(buffer) {
  var string = '';
  for (var i = 0; i < buffer.length; i+= 100)
    string += String.fromCharCode.apply(undefined, buffer.subarray(i, i + 100));
  return string;
}

/** A list of month names for Date parsing. */
var kMonthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug",
  "Sep", "Oct", "Nov", "Dec"];

return {
  decode_base64: decode_base64,
  decode_qp: decode_qp,
  kMonthNames: kMonthNames,
  stringToTypedArray: stringToTypedArray,
  typedArrayToString: typedArrayToString,
};
});
/**
 * This file implements knowledge of how to encode or decode structured headers
 * for several key headers. It is not meant to be used externally to jsmime.
 */

def('structuredHeaders', function (require) {
"use strict";

var structuredDecoders = new Map();
var structuredEncoders = new Map();
var preferredSpellings = new Map();

function addHeader(name, decoder, encoder) {
  var lowerName = name.toLowerCase();
  structuredDecoders.set(lowerName, decoder);
  structuredEncoders.set(lowerName, encoder);
  preferredSpellings.set(lowerName, name);
}


// Addressing headers: We assume that they can be specified in 1* form (this is
// false for From, but it's close enough to the truth that it shouldn't matter).
// There is no need to specialize the results for the header, so just pun it
// back to parseAddressingHeader.
function parseAddress(value) {
  let results = [];
  let headerparser = this;
  return value.reduce(function (results, header) {
    return results.concat(headerparser.parseAddressingHeader(header, true));
  }, []);
}
function writeAddress(value) {
  // Make sure the input is an array (accept a single entry)
  if (!Array.isArray(value))
    value = [value];
  this.addAddresses(value);
}

// Addressing headers from RFC 5322:
addHeader("Bcc", parseAddress, writeAddress);
addHeader("Cc", parseAddress, writeAddress);
addHeader("From", parseAddress, writeAddress);
addHeader("Reply-To", parseAddress, writeAddress);
addHeader("Resent-Bcc", parseAddress, writeAddress);
addHeader("Resent-Cc", parseAddress, writeAddress);
addHeader("Resent-From", parseAddress, writeAddress);
addHeader("Resent-Reply-To", parseAddress, writeAddress);
addHeader("Resent-Sender", parseAddress, writeAddress);
addHeader("Resent-To", parseAddress, writeAddress);
addHeader("Sender", parseAddress, writeAddress);
addHeader("To", parseAddress, writeAddress);
// From RFC 5536:
addHeader("Approved", parseAddress, writeAddress);
// From RFC 3798:
addHeader("Disposition-Notification-To", parseAddress, writeAddress);
// Non-standard headers:
addHeader("Delivered-To", parseAddress, writeAddress);
addHeader("Return-Receipt-To", parseAddress, writeAddress);

// http://cr.yp.to/proto/replyto.html
addHeader("Mail-Reply-To", parseAddress, writeAddress);
addHeader("Mail-Followup-To", parseAddress, writeAddress);

// Parameter-based headers. Note that all parameters are slightly different, so
// we use slightly different variants here.
function parseParameterHeader(value, do2231, do2047) {
  // Only use the first header for parameters; ignore subsequent redefinitions.
  return this.parseParameterHeader(value[0], do2231, do2047);
}

// RFC 2045
function parseContentType(value) {
  let params = parseParameterHeader.call(this, value, false, false);
  let origtype = params.preSemi;
  let parts = origtype.split('/');
  if (parts.length != 2) {
    // Malformed. Return to text/plain. Evil, ain't it?
    params = new Map();
    parts = ["text", "plain"];
  }
  let mediatype = parts[0].toLowerCase();
  let subtype = parts[1].toLowerCase();
  let type = mediatype + '/' + subtype;
  let structure = new Map();
  structure.mediatype = mediatype;
  structure.subtype = subtype;
  structure.type = type;
  params.forEach(function (value, name) {
    structure.set(name.toLowerCase(), value);
  });
  return structure;
}
structuredDecoders.set("Content-Type", parseContentType);

// Unstructured headers (just decode RFC 2047 for the first header value)
function parseUnstructured(values) {
  return this.decodeRFC2047Words(values[0]);
}
function writeUnstructured(value) {
  this.addUnstructured(value);
}

// Message-ID headers.
function parseMessageID(values) {
  // TODO: Proper parsing support for these headers is currently unsupported).
  return this.decodeRFC2047Words(values[0]);
}
function writeMessageID(value) {
  // TODO: Proper parsing support for these headers is currently unsupported).
  this.addUnstructured(value);
}

// RFC 5322
addHeader("Comments", parseUnstructured, writeUnstructured);
addHeader("Keywords", parseUnstructured, writeUnstructured);
addHeader("Subject", parseUnstructured, writeUnstructured);

// RFC 2045
addHeader("MIME-Version", parseUnstructured, writeUnstructured);
addHeader("Content-Description", parseUnstructured, writeUnstructured);

// RFC 7231
addHeader("User-Agent", parseUnstructured, writeUnstructured);

// Date headers
function parseDate(values) { return this.parseDateHeader(values[0]); }
function writeDate(value) { this.addDate(value); }

// RFC 5322
addHeader("Date", parseDate, writeDate);
addHeader("Resent-Date", parseDate, writeDate);
// RFC 5536
addHeader("Expires", parseDate, writeDate);
addHeader("Injection-Date", parseDate, writeDate);
addHeader("NNTP-Posting-Date", parseDate, writeDate);

// RFC 5322
addHeader("Message-ID", parseMessageID, writeMessageID);
addHeader("Resent-Message-ID", parseMessageID, writeMessageID);

// Miscellaneous headers (those that don't fall under the above schemes):

// RFC 2047
structuredDecoders.set("Content-Transfer-Encoding", function (values) {
  return values[0].toLowerCase();
});
structuredEncoders.set("Content-Transfer-Encoding", writeUnstructured);

// Some clients like outlook.com send non-compliant References headers that
// separate values using commas. Also, some clients don't separate References
// with spaces, since these are optional accordint to RFC2822. So here we
// preprocess these headers (see bug 1154521 and bug 1197686).
function preprocessMessageIDs(values) {
  let msgId = /<[^>]*>/g;
  let match, ids = [];
  while ((match = msgId.exec(values)) !== null) {
    ids.push(match[0]);
  }
  return ids.join(' ');
}
structuredDecoders.set("References", preprocessMessageIDs);
structuredDecoders.set("In-Reply-To", preprocessMessageIDs);

return Object.freeze({
  decoders: structuredDecoders,
  encoders: structuredEncoders,
  spellings: preferredSpellings,
});

});
def('headerparser', function(require) {
/**
 * This file implements the structured decoding of message header fields. It is
 * part of the same system as found in mimemimeutils.js, and occasionally makes
 * references to globals defined in that file or other dependencies thereof. See
 * documentation in that file for more information about external dependencies.
 */

"use strict";
var mimeutils = require('./mimeutils');

/**
 * This is the API that we ultimately return.
 *
 * We define it as a global here, because we need to pass it as a |this|
 * argument to a few functions.
 */
var headerparser = {};

/**
 * Tokenizes a message header into a stream of tokens as a generator.
 *
 * The low-level tokens are meant to be loosely correspond to the tokens as
 * defined in RFC 5322. For reasons of saner error handling, however, the two
 * definitions are not exactly equivalent. The tokens we emit are the following:
 * 1. Special delimiters: Any char in the delimiters string is emitted as a
 *    string by itself. Parsing parameter headers, for example, would use ";="
 *    for the delimiter string.
 * 2. Quoted-strings (if opt.qstring is true): A string which is surrounded by
 *    double quotes. Escapes in the string are omitted when returning.
 * 3. Domain Literals (if opt.dliteral is true): A string which matches the
 *    dliteral construct in RFC 5322. Escapes here are NOT omitted.
 * 4. Comments (if opt.comments is true): Comments are handled specially. In
 *    practice, decoding the comments in To headers appears to be necessary, so
 *    comments are not stripped in the output value. Instead, they are emitted
 *    as if they are a special delimiter. However, all delimiters found within a
 *    comment are returned as if they were a quoted string, so that consumers
 *    ignore delimiters within comments. If ignoring comment text completely is
 *    desired, upon seeing a "(" token, consumers should ignore all tokens until
 *    a matching ")" is found (note that comments can be nested).
 * 5. RFC 2047 encoded-words (if opts.rfc2047 is true): These are strings which
 *    are the decoded contents of RFC 2047's =?UTF-8?Q?blah?=-style words.
 * 6. Atoms: Atoms are defined not in the RFC 5322 sense, but rather as the
 *    longest sequence of characters that is neither whitespace nor any of the
 *    special characters above.
 *
 * The intended interpretation of the stream of output tokens is that they are
 * the portions of text which can be safely wrapped in whitespace with no ill
 * effect. The output tokens are either strings (which represent individual
 * delimiter tokens) or instances of a class that has a customized .toString()
 * for output (for quoted strings, atoms, domain literals, and encoded-words).
 * Checking for a delimiter MUST use the strictly equals operator (===). For
 * example, the proper way to call this method is as follows:
 *
 *    for (let token of getHeaderTokens(rest, ";=", opts)) {
 *      if (token === ';') {
 *        // This represents a literal ';' in the string
 *      } else if (token === '=') {
 *        // This represents a literal '=' in the string
 *      } else {
 *        // If a ";" qstring was parsed, we fall through to here!
 *        token = token.toString();
 *      }
 *    }
 *
 * This method does not properly tokenize 5322 in all corner cases; however,
 * this is equivalent in those corner cases to an older header parsing
 * algorithm, so the algorithm should be correct for all real-world cases. The
 * corner cases are as follows:
 * 1. Quoted-strings and domain literals are parsed even if they are within a
 *    comment block (we effectively treat ctext as containing qstring).
 * 2. WSP need not be between a qstring and an atom (a"b" produces two tokens,
 *    a and b). This is an error case, though.
 * 3. Legacy comments as display names: We recognize address fields with
 *    comments, and (a) either drop them if inside addr-spec or (b) preserve
 *    them as part of the display-name if not. If the display-name is empty
 *    while the last comment is not, we assume it's the legacy form above and
 *    take the comment content as the display-name.
 *
 * @param {String} value      The header value, post charset conversion but
 *                            before RFC 2047 decoding, to be parsed.
 * @param {String} delimiters A set of delimiters to include as individual
 *                            tokens.
 * @param {Object} opts       A set of options selecting what to parse.
 * @param {Boolean} [opts.qstring]  If true, recognize quoted strings.
 * @param {Boolean} [opts.dliteral] If true, recognize domain literals.
 * @param {Boolean} [opts.comments] If true, recognize comments.
 * @param {Boolean} [opts.rfc2047]  If true, parse and decode RFC 2047
 *                                  encoded-words.
 * @returns {(Token|String)[]} An array of Token objects (which have a toString
 *                             method returning their value) or String objects
 *                             (representing delimiters).
 */
function getHeaderTokens(value, delimiters, opts) {
  // The array of parsed tokens. This method used to be a generator, but it
  // appears that generators are poorly optimized in current engines, so it was
  // converted to not be one.
  let tokenList = [];

  /// Represents a non-delimiter token
  function Token(token) {
    // Unescape all quoted pairs. Any trailing \ is deleted.
    this.token = token.replace(/\\(.?)/g, "$1");
  }
  Token.prototype.toString = function () { return this.token; };

  // The start of the current token (e.g., atoms, strings)
  let tokenStart = undefined;
  // The set of whitespace characters, as defined by RFC 5322
  let wsp = " \t\r\n";
  // If we are a domain literal ([]) or a quoted string ("), this is set to the
  // character to look for at the end.
  let endQuote = undefined;
  // The current depth of comments, since they can be nested. A value 0 means we
  // are not in a comment.
  let commentDepth = 0;

  // Iterate over every character one character at a time.
  let length = value.length;
  for (let i = 0; i < length; i++) {
    let ch = value[i];
    // If we see a \, no matter what context we are in, ignore the next
    // character.
    if (ch == '\\') {
      i++;
      continue;
    }

    // If we are in a qstring or a dliteral, process the character only if it is
    // what we are looking for to end the quote.
    if (endQuote !== undefined) {
      if (ch == endQuote && ch == '"') {
        // Quoted strings don't include their delimiters.
        let text = value.slice(tokenStart + 1, i);

        // If RFC 2047 is enabled, always decode the qstring.
        if (opts.rfc2047)
          text = decodeRFC2047Words(text);

        tokenList.push(new Token(text));
        endQuote = undefined;
        tokenStart = undefined;
      } else if (ch == endQuote && ch == ']') {
        // Domain literals include their delimiters.
        tokenList.push(new Token(value.slice(tokenStart, i + 1)));
        endQuote = undefined;
        tokenStart = undefined;
      }
      // Avoid any further processing.
      continue;
    }

    // If we can match the RFC 2047 encoded-word pattern, we need to decode the
    // entire word or set of words.
    if (opts.rfc2047 && ch == '=' && i + 1 < value.length && value[i + 1] == '?') {
      // RFC 2047 tokens separated only by whitespace are conceptually part of
      // the same output token, so we need to decode them all at once.
      let encodedWordsRE = /([ \t\r\n]*=\?[^?]*\?[BbQq]\?[^?]*\?=)+/;
      let result = encodedWordsRE.exec(value.slice(i));
      if (result !== null) {
        // If we were in the middle of a prior token (i.e., something like
        // foobar=?UTF-8?Q?blah?=), yield the previous segment as a token.
        if (tokenStart !== undefined) {
          tokenList.push(new Token(value.slice(tokenStart, i)));
          tokenStart = undefined;
        }

        // Find out how much we need to decode...
        let encWordsLen = result[0].length;
        let string = decodeRFC2047Words(value.slice(i, i + encWordsLen),
          "UTF-8");
        // Don't make a new Token variable, since we do not want to unescape the
        // decoded string.
        tokenList.push({ toString: function() { return string; }});

        // Skip everything we decoded. The -1 is because we don't want to
        // include the starting character.
        i += encWordsLen - 1;
        continue;
      }

      // If we are here, then we failed to match the simple 2047 encoded-word
      // regular expression, despite the fact that it matched the =? at the
      // beginning. Fall through and treat the text as if we aren't trying to
      // decode RFC 2047.
    }

    // If we reach this point, we're not inside of quoted strings, domain
    // literals, or RFC 2047 encoded-words. This means that the characters we
    // parse are potential delimiters (unless we're in comments, where
    // everything starts to go really wonky). Several things could happen,
    // depending on the kind of character we read and whether or not we were in
    // the middle of a token. The three values here tell us what we could need
    // to do at this point:
    // tokenIsEnding: The current character is not able to be accumulated to an
    // atom, so we need to flush the atom if there is one.
    // tokenIsStarting: The current character could begin an atom (or
    // anything that requires us to mark the starting point), so we need to save
    // the location.
    // isSpecial: The current character is a delimiter that needs to be output.
    let tokenIsEnding = false, tokenIsStarting = false, isSpecial = false;
    if (wsp.includes(ch)) {
      // Whitespace ends current tokens, doesn't emit anything.
      tokenIsEnding = true;
    } else if (commentDepth == 0 && delimiters.includes(ch)) {
      // Delimiters end the current token, and need to be output. They do not
      // apply within comments.
      tokenIsEnding = true;
      isSpecial = true;
    } else if (opts.qstring && ch == '"') {
      // Quoted strings end the last token and start a new one.
      tokenIsEnding = true;
      tokenIsStarting = true;
      endQuote = ch;
    } else if (opts.dliteral && ch == '[') {
      // Domain literals end the last token and start a new one.
      tokenIsEnding = true;
      tokenIsStarting = true;
      endQuote = ']';
    } else if (opts.comments && ch == '(') {
      // Comments are nested (oh joy). We only really care for the outer
      // delimiter, though, which also ends the prior token and needs to be
      // output if the consumer requests it.
      commentDepth++;
      if (commentDepth == 1) {
        tokenIsEnding = true;
        isSpecial = true;
      } else {
        tokenIsStarting = true;
      }
    } else if (opts.comments && ch == ')') {
      // Comments are nested (oh joy). We only really care for the outer
      // delimiter, though, which also ends the prior token and needs to be
      // output if the consumer requests it.
      if (commentDepth > 0)
        commentDepth--;
      if (commentDepth == 0) {
        tokenIsEnding = true;
        isSpecial = true;
      } else {
        tokenIsStarting = true;
      }
    } else {
      // Not a delimiter, whitespace, comment, domain literal, or quoted string.
      // Must be part of an atom then!
      tokenIsStarting = true;
    }

    // If our analysis concluded that we closed an open token, and there is an
    // open token, then yield that token.
    if (tokenIsEnding && tokenStart !== undefined) {
      tokenList.push(new Token(value.slice(tokenStart, i)));
      tokenStart = undefined;
    }
    // If we need to output a delimiter, do so.
    if (isSpecial)
      tokenList.push(ch);
    // If our analysis concluded that we could open a token, and no token is
    // opened yet, then start the token.
    if (tokenIsStarting && tokenStart === undefined) {
      tokenStart = i;
    }
  }

  // That concludes the loop! If there is a currently open token, close that
  // token now.
  if (tokenStart !== undefined) {
    // Error case: a partially-open quoted string is assumed to have a trailing
    // " character.
    if (endQuote == '"')
      tokenList.push(new Token(value.slice(tokenStart + 1)));
    else
      tokenList.push(new Token(value.slice(tokenStart)));
  }

  return tokenList;
}

/**
 * Convert a header value into UTF-16 strings by attempting to decode as UTF-8
 * or another legacy charset. If the header is valid UTF-8, it will be decoded
 * as UTF-8; if it is not, the fallbackCharset will be attempted instead.
 *
 * @param {String} headerValue       The header (as a binary string) to attempt
 *                                   to convert to UTF-16.
 * @param {String} [fallbackCharset] The optional charset to try if UTF-8
 *                                   doesn't work.
 * @returns {String} The UTF-16 representation of the string above.
 */
function convert8BitHeader(headerValue, fallbackCharset) {
  // Only attempt to convert the headerValue if it contains non-ASCII
  // characters.
  if (/[\x80-\xff]/.exec(headerValue)) {
    // First convert the value to a typed-array for TextDecoder.
    let typedarray = mimeutils.stringToTypedArray(headerValue);

    // Don't try UTF-8 as fallback (redundant), and don't try UTF-16 or UTF-32
    // either, since they radically change header interpretation.
    // If we have a fallback charset, we want to know if decoding will fail;
    // otherwise, we want to replace with substitution chars.
    let hasFallback = fallbackCharset &&
                      !fallbackCharset.toLowerCase().startsWith("utf");
    let utf8Decoder = new TextDecoder("utf-8", {fatal: hasFallback});
    try {
      headerValue = utf8Decoder.decode(typedarray);
    } catch (e) {
      // Failed, try the fallback
      let decoder = new TextDecoder(fallbackCharset, {fatal: false});
      headerValue = decoder.decode(typedarray);
    }
  }
  return headerValue;
}

/**
 * Decodes all RFC 2047 encoded-words in the input string. The string does not
 * necessarily have to contain any such words. This is useful, for example, for
 * parsing unstructured headers.
 *
 * @param {String} headerValue The header which may contain RFC 2047 encoded-
 *                             words.
 * @returns {String} A full UTF-16 string with all encoded words expanded.
 */
function decodeRFC2047Words(headerValue) {
  // Unfortunately, many implementations of RFC 2047 encoding are actually wrong
  // in that they split over-long encoded words without regard for whether or
  // not the split point is in the middle of a multibyte character. Therefore,
  // we need to be able to handle these situations gracefully. This is done by
  // using the decoder in streaming mode so long as the next token is another
  // 2047 token with the same charset.
  let lastCharset = '', currentDecoder = undefined;

  /**
   * Decode a single RFC 2047 token. This function is inline so that we can
   * easily close over the lastCharset/currentDecoder variables, needed for
   * handling bad RFC 2047 productions properly.
   */
  function decode2047Token(token) {
    let tokenParts = token.split("?");

    // If it's obviously not a valid token, return false immediately.
    if (tokenParts.length != 5 || tokenParts[4] != '=')
      return false;

    // The charset parameter is defined in RFC 2231 to be charset or
    // charset*language. We only care about the charset here, so ignore any
    // language parameter that gets passed in.
    let charset = tokenParts[1].split('*', 1)[0];
    let encoding = tokenParts[2], text = tokenParts[3];

    let buffer;
    if (encoding == 'B' || encoding == 'b') {
      // Decode base64. If there's any non-base64 data, treat the string as
      // an illegal token.
      if (/[^A-Za-z0-9+\/=]/.exec(text))
        return false;

      // Base64 strings must be a length of multiple 4, but it seems that some
      // mailers accidentally insert one too many `=' chars. Gracefully handle
      // this case; see bug 227290 for more information.
      if (text.length % 4 == 1 && text.charAt(text.length - 1) == '=')
        text = text.slice(0, -1);

      // Decode the string
      buffer = mimeutils.decode_base64(text, false)[0];
    } else if (encoding == 'Q' || encoding == 'q') {
      // Q encoding here looks a lot like quoted-printable text. The differences
      // between quoted-printable and this are that quoted-printable allows you
      // to quote newlines (this doesn't), while this replaces spaces with _.
      // We can reuse the decode_qp code here, since newlines are already
      // stripped from the header. There is one edge case that could trigger a
      // false positive, namely when you have a single = or an = followed by
      // whitespace at the end of the string. Such an input string is already
      // malformed to begin with, so stripping the = and following input in that
      // case should not be an important loss.
      buffer = mimeutils.decode_qp(text.replace(/_/g, ' '), false)[0];
    } else {
      return false;
    }

    // Make the buffer be a typed array for what follows
    buffer = mimeutils.stringToTypedArray(buffer);

    // If we cannot reuse the last decoder, flush out whatever remains.
    var output = '';
    if (charset != lastCharset && currentDecoder) {
      output += currentDecoder.decode();
      currentDecoder = null;
    }

    // Initialize the decoder for this token.
    lastCharset = charset;
    if (!currentDecoder) {
      try {
        currentDecoder = new TextDecoder(charset, {fatal: false});
      } catch (e) {
        // We don't recognize the charset, so give up.
        return false;
      }
    }

    // Convert this token with the buffer. Note the stream parameter--although
    // RFC 2047 tokens aren't supposed to break in the middle of a multibyte
    // character, a lot of software messes up and does so because it's hard not
    // to (see headeremitter.js for exactly how hard!).
    return output + currentDecoder.decode(buffer, {stream: true});
  }

  // The first step of decoding is to split the string into RFC 2047 and
  // non-RFC 2047 tokens. RFC 2047 tokens look like the following:
  // =?charset?c?text?=, where c is one of B, b, Q, and q. The split regex does
  // some amount of semantic checking, so that malformed RFC 2047 tokens will
  // get ignored earlier.
  let components = headerValue.split(/(=\?[^?]*\?[BQbq]\?[^?]*\?=)/);
  for (let i = 0; i < components.length; i++) {
    if (components[i].substring(0, 2) == "=?") {
      let decoded = decode2047Token(components[i]);
      if (decoded !== false) {
        // If 2047 decoding succeeded for this bit, rewrite the original value
        // with the proper decoding.
        components[i] = decoded;

        // We're done processing, so continue to the next link.
        continue;
      }
    } else if (/^[ \t\r\n]*$/.exec(components[i])) {
      // Whitespace-only tokens get squashed into nothing, so 2047 tokens will
      // be concatenated together.
      components[i] = '';
      continue;
    }

    // If there was stuff left over from decoding the last 2047 token, flush it
    // out.
    lastCharset = '';
    if (currentDecoder) {
      components[i] = currentDecoder.decode() + components[i];
      currentDecoder = null;
    }
  }

  // After the for loop, we'll have a set of decoded strings. Concatenate them
  // together to make the return value.
  return components.join('');
}

///////////////////////////////
// Structured field decoders //
///////////////////////////////

/**
 * Extract a list of addresses from a header which matches the RFC 5322
 * address-list production, possibly doing RFC 2047 decoding along the way.
 *
 * The output of this method is an array of elements corresponding to the
 * addresses and the groups in the input header. An address is represented by
 * an object of the form:
 * {
 *   name: The display name of the address
 *   email: The address of the object
 * }
 * while a group is represented by an object of the form:
 * {
 *   name: The display name of the group
 *   group: An array of address object for members in the group.
 * }
 *
 * @param {String} header     The MIME header text to be parsed
 * @param {Boolean} doRFC2047 If true, decode RFC 2047 parameters found in the
 *                            header.
 * @returns {(Address|Group)[]} An array of the addresses found in the header,
 *                              where each element is of the form mentioned
 *                              above.
 */
function parseAddressingHeader(header, doRFC2047) {
  // Default to true
  if (doRFC2047 === undefined)
    doRFC2047 = true;

  // The final (top-level) results list to append to.
  let results = [];
  // Temporary results
  let addrlist = [];

  // Build up all of the values
  let name = '', groupName = '', localPart = '', address = '', comment = '';
  // Indicators of current state
  let inAngle = false, inComment = false, needsSpace = false;
  let preserveSpace = false;
  let commentClosed = false;

  // RFC 5322 §3.4 notes that legacy implementations exist which use a simple
  // recipient form where the addr-spec appears without the angle brackets,
  // but includes the name of the recipient in parentheses as a comment
  // following the addr-spec. While we do not create this format, we still
  // want to recognize it, though.
  // Furthermore, despite allowing comments in addresses, RFC 5322 §3.4 notes
  // that legacy implementations may interpret the comment, and thus it
  // recommends not to use them. (Also, they may be illegal as per RFC 5321.)
  // While we do not create address fields with comments, we recognize such
  // comments during parsing and (a) either drop them if inside addr-spec or
  // (b) preserve them as part of the display-name if not.
  // If the display-name is empty while the last comment is not, we assume it's
  // the legacy form above and take the comment content as the display-name.
  //
  // When parsing the address field, we at first do not know whether any
  // strings belong to the display-name (which may include comments) or to the
  // local-part of an addr-spec (where we ignore comments) until we find an
  // '@' or an '<' token. Thus, we collect both variants until the fog lifts,
  // plus the last comment seen.
  let lastComment = '';

  /**
   * Add the parsed mailbox object to the address list.
   * If it's in the legacy form above, correct the display-name.
   * Also reset any faked flags.
   * @param {String} displayName   display-name as per RFC 5322
   * @param {String} addrSpec      addr-spec as per RFC 5322
   */
  function addToAddrList(displayName, addrSpec) {
    if (displayName === '' && lastComment !== '') {
      // Take last comment content as the display-name.
      let offset = lastComment[0] === ' ' ? 2 : 1;
      displayName = lastComment.substr(offset, lastComment.length - offset - 1);
    }
    if (displayName !== '' || addrSpec !== '')
      addrlist.push({name: displayName, email: addrSpec});
    // Clear pending flags and variables.
    name = localPart = address = lastComment = '';
    inAngle = inComment = needsSpace = false;
  }

  // Main parsing loop
  for (let token of getHeaderTokens(header, ":,;<>@",
        {qstring: true, comments: true, dliteral: true, rfc2047: doRFC2047})) {
    if (token === ':') {
      groupName = name;
      name = '';
      localPart = '';
      // If we had prior email address results, commit them to the top-level.
      if (addrlist.length > 0)
        results = results.concat(addrlist);
      addrlist = [];
    } else if (token === '<') {
      if (inAngle) {
        // Interpret the address we were parsing as a name.
        if (address.length > 0) {
          name = address;
        }
        localPart = address = '';
      } else {
        inAngle = true;
      }
    } else if (token === '>') {
      inAngle = false;
      // Forget addr-spec comments.
      lastComment = '';
    } else if (token === '(') {
      inComment = true;
      // The needsSpace flag may not always be set even if it should be,
      // e.g. for a comment behind an angle-addr.
      // Also, we need to restore the needsSpace flag if we ignore the comment.
      preserveSpace = needsSpace;
      if (!needsSpace)
        needsSpace = name !== '' && name.substr(-1) !== ' ';
      comment = needsSpace ? ' (' : '(';
      commentClosed = false;
    } else if (token === ')') {
      inComment = false;
      comment += ')';
      lastComment = comment;
      // The comment may be part of the name, but not of the local-part.
      // Enforce a space behind the comment only when not ignoring it.
      if (inAngle) {
        needsSpace = preserveSpace;
      } else {
        name += comment;
        needsSpace = true;
      }
      commentClosed = true;
      continue;
    } else if (token === '@') {
      // An @ means we see an email address. If we're not within <> brackets,
      // then we just parsed an email address instead of a display name. Empty
      // out the display name for the current production.
      if (!inAngle) {
        address = localPart;
        name = '';
        localPart = '';
        // The remainder of this mailbox is part of an addr-spec.
        inAngle = true;
      }
      // Keep the local-part quoted if it needs to be.
      if (/[ !()<>\[\]:;@\\,"]/.exec(address) !== null)
        address = '"' + address.replace(/([\\"])/g, "\\$1") + '"';
      address += '@';
    } else if (token === ',') {
      // A comma ends the current name. If we have something that's kind of a
      // name, add it to the result list. If we don't, then our input looks like
      // To: , , -> don't bother adding an empty entry.
      addToAddrList(name, address);
    } else if (token === ';') {
      // Add pending name to the list
      addToAddrList(name, address);

      // If no group name was found, treat the ';' as a ','. In any case, we
      // need to copy the results of addrlist into either a new group object or
      // the main list.
      if (groupName === '') {
        results = results.concat(addrlist);
      } else {
        results.push({
          name: groupName,
          group: addrlist
        });
      }
      // ... and reset every other variable.
      addrlist = [];
      groupName = '';
    } else {
      // This is either comment content, a quoted-string, or some span of
      // dots and atoms.

      // Ignore the needs space if we're a "close" delimiter token.
      let spacedToken = token;
      if (needsSpace && token.toString()[0] != '.')
        spacedToken = ' ' + spacedToken;

      // Which field do we add this data to?
      if (inComment) {
        comment += spacedToken;
      } else if (inAngle) {
        address += spacedToken;
      } else {
        name += spacedToken;
        // Never add a space to the local-part, if we just ignored a comment.
        if (commentClosed) {
          localPart += token;
          commentClosed = false;
        } else {
          localPart += spacedToken;
        }
      }

      // We need space for the next token if we aren't some kind of comment or
      // . delimiter.
      needsSpace = token.toString()[0] != '.';
      // The fall-through case after this resets needsSpace to false, and we
      // don't want that!
      continue;
    }

    // If we just parsed a delimiter, we don't need any space for the next
    // token.
    needsSpace = false;
  }

  // If we're missing the final ';' of a group, assume it was present. Also, add
  // in the details of any email/address that we previously saw.
  addToAddrList(name, address);
  if (groupName !== '') {
    results.push({name: groupName, group: addrlist});
    addrlist = [];
  }

  // Add the current address list build-up to the list of addresses, and return
  // the whole array to the caller.
  return results.concat(addrlist);
}

/**
 * Extract parameters from a header which is a series of ;-separated
 * attribute=value tokens.
 *
 * @param {String} headerValue The MIME header value to parse.
 * @param {Boolean} doRFC2047  If true, decode RFC 2047 encoded-words.
 * @param {Boolean} doRFC2231  If true, decode RFC 2231 encoded parameters.
 * @return {Map(String -> String)} A map of parameter names to parameter values.
 *                                 The property preSemi is set to the token that
 *                                 precedes the first semicolon.
 */
function parseParameterHeader(headerValue, doRFC2047, doRFC2231) {
  // The basic syntax of headerValue is token [; token = token-or-qstring]*
  // Copying more or less liberally from nsMIMEHeaderParamImpl:
  // The first token is the text to the first whitespace or semicolon.
  var semi = headerValue.indexOf(";");
  if (semi < 0) {
    var start = headerValue;
    var rest = '';
  } else {
    var start = headerValue.substring(0, semi);
    var rest = headerValue.substring(semi); // Include the semicolon
  }
  // Strip start to be <WSP><nowsp><WSP>.
  start = start.trim().split(/[ \t\r\n]/)[0];

  // Decode the the parameter tokens.
  let opts = {qstring: true, rfc2047: doRFC2047};
  // Name is the name of the parameter, inName is true iff we don't have a name
  // yet.
  let name = '', inName = true;
  // Matches is a list of [name, value] pairs, where we found something that
  // looks like name=value in the input string.
  let matches = [];
  for (let token of getHeaderTokens(rest, ";=", opts)) {
    if (token === ';') {
      // If we didn't find a name yet (we have ... tokenA; tokenB), push the
      // name with an empty token instead.
      if (name != '' && inName == false)
        matches.push([name, '']);
      name = '';
      inName = true;
    } else if (token === '=') {
      inName = false;
    } else if (inName && name == '') {
      name = token.toString();
    } else if (!inName && name != '') {
      token = token.toString();
      // RFC 2231 doesn't make it clear if %-encoding is supposed to happen
      // within a quoted string, but this is very much required in practice. If
      // it ends with a '*', then the string is an extended-value, which means
      // that its value may be %-encoded.
      if (doRFC2231 && name.endsWith('*')) {
        token = token.replace(/%([0-9A-Fa-f]{2})/g,
          function percent_deencode(match, hexchars) {
            return String.fromCharCode(parseInt(hexchars, 16));
        });
      }
      matches.push([name, token]);
      // Clear the name, so we ignore anything afterwards.
      name = '';
    } else if (inName) {
      // We have ...; tokenA tokenB ... -> ignore both tokens
      name = ''; // Error recovery, ignore this one
    }
  }
  // If we have a leftover ...; tokenA, push the tokenA
  if (name != '' && inName == false)
    matches.push([name, '']);

  // Now matches holds the parameters, so clean up for RFC 2231. There are three
  // cases: param=val, param*=us-ascii'en-US'blah, and param*n= variants. The
  // order of preference is to pick the middle, then the last, then the first.
  // Note that we already unpacked %-encoded values.

  // simpleValues is just a straight parameter -> value map.
  // charsetValues is the parameter -> value map, although values are stored
  // before charset decoding happens.
  // continuationValues maps parameter -> array of values, with extra properties
  // valid (if we decided we couldn't do anything anymore) and hasCharset (which
  // records if we need to decode the charset parameter or not).
  var simpleValues = new Map(), charsetValues = new Map(),
      continuationValues = new Map();
  for (let pair of matches) {
    let name = pair[0];
    let value = pair[1];
    // Get first index, not last index, so we match param*0*= like param*0=.
    let star = name.indexOf('*');
    if (star == -1) {
      // This is the case of param=val. Select the first value here, if there
      // are multiple ones.
      if (!simpleValues.has(name))
        simpleValues.set(name, value);
    } else if (star == name.length - 1) {
      // This is the case of param*=us-ascii'en-US'blah.
      name = name.substring(0, star);
      // Again, select only the first value here.
      if (!charsetValues.has(name))
        charsetValues.set(name, value);
    } else {
      // This is the case of param*0= or param*0*=.
      let param = name.substring(0, star);
      let entry = continuationValues.get(param);
      // Did we previously find this one to be bungled? Then ignore it.
      if (continuationValues.has(param) && !entry.valid)
        continue;

      // If we haven't seen it yet, set up entry already. Note that entries are
      // not straight string values but rather [valid, hasCharset, param0, ... ]
      if (!continuationValues.has(param)) {
        entry = new Array();
        entry.valid = true;
        entry.hasCharset = undefined;
        continuationValues.set(param, entry);
      }

      // When the string ends in *, we need to charset decoding.
      // Note that the star is only meaningful for the *0*= case.
      let lastStar = name[name.length - 1] == '*';
      let number = name.substring(star + 1, name.length - (lastStar ? 1 : 0));
      if (number == '0')
        entry.hasCharset = lastStar;

      // Is the continuation number illegal?
      else if ((number[0] == '0' && number != '0') ||
          !(/^[0-9]+$/.test(number))) {
        entry.valid = false;
        continue;
      }
      // Normalize to an integer
      number = parseInt(number, 10);

      // Is this a repeat? If so, bail.
      if (entry[number] !== undefined) {
        entry.valid = false;
        continue;
      }

      // Set the value for this continuation index. JS's magic array setter will
      // expand the array if necessary.
      entry[number] = value;
    }
  }

  // Build the actual parameter array from the parsed values
  var values = new Map();
  // Simple values have lowest priority, so just add everything into the result
  // now.
  for (let pair of simpleValues) {
    values.set(pair[0], pair[1]);
  }

  if (doRFC2231) {
    // Continuation values come next
    for (let pair of continuationValues) {
      let name = pair[0];
      let entry = pair[1];
      // If we never saw a param*0= or param*0*= value, then we can't do any
      // reasoning about what it looks like, so bail out now.
      if (entry.hasCharset === undefined) continue;

      // Use as many entries in the array as are valid--if we are missing an
      // entry, stop there.
      let valid = true;
      for (var i = 0; valid && i < entry.length; i++)
        if (entry[i] === undefined)
          valid = false;

      // Concatenate as many parameters as are valid. If we need to decode thec
      // charset, do so now.
      var value = entry.slice(0, i).join('');
      if (entry.hasCharset) {
        try {
          value = decode2231Value(value);
        } catch (e) {
          // Bad charset, don't add anything.
          continue;
        }
      }
      // Finally, add this to the output array.
      values.set(name, value);
    }

    // Highest priority is the charset conversion.
    for (let pair of charsetValues) {
      try {
        values.set(pair[0], decode2231Value(pair[1]));
      } catch (e) {
        // Bad charset, don't add anything.
      }
    }
  }

  // Finally, return the values computed above.
  values.preSemi = start;
  return values;
}

/**
 * Convert a RFC 2231-encoded string parameter into a Unicode version of the
 * string. This assumes that percent-decoding has already been applied.
 *
 * @param {String} value The RFC 2231-encoded string to decode.
 * @return The Unicode version of the string.
 */
function decode2231Value(value) {
  let quote1 = value.indexOf("'");
  let quote2 = quote1 >= 0 ? value.indexOf("'", quote1 + 1) : -1;

  let charset = (quote1 >= 0 ? value.substring(0, quote1) : "");
  // It turns out that the language isn't useful anywhere in our codebase for
  // the present time, so we will safely ignore it.
  //var language = (quote2 >= 0 ? value.substring(quote1 + 2, quote2) : "");
  value = value.substring(Math.max(quote1, quote2) + 1);

  // Convert the value into a typed array for decoding
  let typedarray = mimeutils.stringToTypedArray(value);

  // Decode the charset. If the charset isn't found, we throw an error. Try to
  // fallback in that case.
  return new TextDecoder(charset, {fatal: true})
    .decode(typedarray, {stream: false});
}

// This is a map of known timezone abbreviations, for fallback in obsolete Date
// productions.
var kKnownTZs = {
  // The following timezones are explicitly listed in RFC 5322.
  "UT":  "+0000", "GMT": "+0000",
  "EST": "-0500", "EDT": "-0400",
  "CST": "-0600", "CDT": "-0500",
  "MST": "-0700", "MDT": "-0600",
  "PST": "-0800", "PDT": "-0700",
  // The following are time zones copied from NSPR's prtime.c
  "AST": "-0400", // Atlantic Standard Time
  "NST": "-0330", // Newfoundland Standard Time
  "BST": "+0100", // British Summer Time
  "MET": "+0100", // Middle Europe Time
  "EET": "+0200", // Eastern Europe Time
  "JST": "+0900"  // Japan Standard Time
};

/**
 * Parse a header that contains a date-time definition according to RFC 5322.
 * The result is a JS date object with the same timestamp as the header.
 *
 * The dates returned by this parser cannot be reliably converted back into the
 * original header for two reasons. First, JS date objects cannot retain the
 * timezone information they were initialized with, so reserializing a date
 * header would necessarily produce a date in either the current timezone or in
 * UTC. Second, JS dates measure time as seconds elapsed from the POSIX epoch
 * excluding leap seconds. Any timestamp containing a leap second is instead
 * converted into one that represents the next second.
 *
 * Dates that do not match the RFC 5322 production are instead attempted to
 * parse using the Date.parse function. The strings that are accepted by
 * Date.parse are not fully defined by the standard, but most implementations
 * should accept strings that look rather close to RFC 5322 strings. Truly
 * invalid dates produce a formulation that results in an invalid date,
 * detectable by having its .getTime() method return NaN.
 *
 * @param {String} header The MIME header value to parse.
 * @returns {Date}        The date contained within the header, as described
 *                        above.
 */
function parseDateHeader(header) {
  let tokens = [for (x of getHeaderTokens(header, ",:", {})) x.toString()];
  // What does a Date header look like? In practice, most date headers devolve
  // into Date: [dow ,] dom mon year hh:mm:ss tzoff [(abbrev)], with the day of
  // week mostly present and the timezone abbreviation mostly absent.

  // First, ignore the day-of-the-week if present. This would be the first two
  // tokens.
  if (tokens.length > 1 && tokens[1] === ',')
    tokens = tokens.slice(2);

  // If there are too few tokens, the date is obviously invalid.
  if (tokens.length < 8)
    return new Date(NaN);

  // Save off the numeric tokens
  let day = parseInt(tokens[0]);
  // month is tokens[1]
  let year = parseInt(tokens[2]);
  let hours = parseInt(tokens[3]);
  // tokens[4] === ':'
  let minutes = parseInt(tokens[5]);
  // tokens[6] === ':'
  let seconds = parseInt(tokens[7]);

  // Compute the month. Check only the first three digits for equality; this
  // allows us to accept, e.g., "January" in lieu of "Jan."
  let month = mimeutils.kMonthNames.indexOf(tokens[1].slice(0, 3));
  // If the month name is not recognized, make the result illegal.
  if (month < 0)
    month = NaN;

  // Compute the full year if it's only 2 digits. RFC 5322 states that the
  // cutoff is 50 instead of 70.
  if (year < 100) {
    year += year < 50 ? 2000 : 1900;
  }

  // Compute the timezone offset. If it's not in the form ±hhmm, convert it to
  // that form.
  let tzoffset = tokens[8];
  if (tzoffset in kKnownTZs)
    tzoffset = kKnownTZs[tzoffset];
  let decompose = /^([+-])(\d\d)(\d\d)$/.exec(tzoffset);
  // Unknown? Make it +0000
  if (decompose === null)
    decompose = ['+0000', '+', '00', '00'];
  let tzOffsetInMin = parseInt(decompose[2]) * 60 + parseInt(decompose[3]);
  if (decompose[1] == '-')
    tzOffsetInMin = -tzOffsetInMin;

  // How do we make the date at this point? Well, the JS date's constructor
  // builds the time in terms of the local timezone. To account for the offset
  // properly, we need to build in UTC.
  let finalDate = new Date(Date.UTC(year, month, day, hours, minutes, seconds)
    - tzOffsetInMin * 60 * 1000);

  // Suppose our header was mangled and we couldn't read it--some of the fields
  // became undefined. In that case, the date would become invalid, and the
  // indication that it is so is that the underlying number is a NaN. In that
  // scenario, we could build attempt to use JS Date parsing as a last-ditch
  // attempt. But it's not clear that such messages really exist in practice,
  // and the valid formats for Date in ES6 are unspecified.
  return finalDate;
}

////////////////////////////////////////
// Structured header decoding support //
////////////////////////////////////////

// Load the default structured decoders
var structuredDecoders = new Map();
var structuredHeaders = require('./structuredHeaders');
var preferredSpellings = structuredHeaders.spellings;
var forbiddenHeaders = new Set();
for (let pair of structuredHeaders.decoders) {
  addStructuredDecoder(pair[0], pair[1]);
  forbiddenHeaders.add(pair[0].toLowerCase());
}

/**
 * Use an already-registered structured decoder to parse the value of the header
 * into a structured representation.
 *
 * As this method is designed to be used for the internal MIME Parser to convert
 * the raw header values to well-structured values, value is intended to be an
 * array consisting of all occurences of the header in order. However, for ease
 * of use by other callers, it can also be treated as a string.
 *
 * If the decoder for the header is not found, an exception will be thrown.
 *
 * A large set of headers have pre-defined structured decoders; these decoders
 * cannot be overrided with addStructuredDecoder, as doing so could prevent the
 * MIME or message parsers from working properly. The pre-defined structured
 * headers break down into five clases of results, plus some ad-hoc
 * representations. They are:
 *
 * Addressing headers (results are the same as parseAddressingHeader):
 * - Approved
 * - Bcc
 * - Cc
 * - Delivered-To
 * - Disposition-Notification-To
 * - From
 * - Mail-Reply-To
 * - Mail-Followup-To
 * - Reply-To
 * - Resent-Bcc
 * - Resent-Cc
 * - Resent-From
 * - Resent-Reply-To
 * - Resent-Sender
 * - Resent-To
 * - Return-Receipt-To
 * - Sender
 * - To
 *
 * Date headers (results are the same as parseDateHeader):
 * - Date
 * - Expires
 * - Injection-Date
 * - NNTP-Posting-Date
 * - Resent-Date
 *
 * References headers (results are the same as parseReferencesHeader):
 * - (TODO: Parsing support for these headers is currently unsupported)
 *
 * Message-ID headers (results are the first entry of the result of
 * parseReferencesHeader):
 * - (TODO: Parsing support for these headers is currently unsupported)
 *
 * Unstructured headers (results are merely decoded according to RFC 2047):
 * - Comments
 * - Content-Description
 * - Keywords
 * - Subject
 *
 * The ad-hoc headers and their resulting formats are as follows:
 * Content-Type: returns a JS Map of parameter names (in lower case) to their
 * values, along with the following extra properties defined on the map:
 * - mediatype: the type to the left of '/' (e.g., 'text', 'message')
 * - subtype: the type to the right of '/' (e.g., 'plain', 'rfc822')
 * - type: the full typename (e.g., 'text/plain')
 * RFC 2047 and RFC 2231 decoding is applied where appropriate. The values of
 * the type, mediatype, and subtype attributes are all normalized to lower-case,
 * as are the names of all parameters.
 *
 * Content-Transfer-Encoding: the first value is converted to lower-case.
 *
 * @param {String}       header The name of the header of the values.
 * @param {String|Array} value  The value(s) of the headers, after charset
 *                              conversion (if any) has been applied. If it is
 *                              an array, the headers are listed in the order
 *                              they appear in the message.
 * @returns {Object} A structured representation of the header values.
 */
function parseStructuredHeader(header, value) {
  // Enforce that the parameter is an array. If it's a string, make it a
  // 1-element array.
  if (typeof value === "string" || value instanceof String)
    value = [value];
  if (!Array.isArray(value))
    throw new TypeError("Header value is not an array: " + value);

  // Lookup the header in our decoders; if present, use that to decode the
  // header.
  let lowerHeader = header.toLowerCase();
  if (structuredDecoders.has(lowerHeader)) {
    return structuredDecoders.get(lowerHeader).call(headerparser, value);
  }

  // If not present, throw an exception.
  throw new Error("Unknown structured header: " + header);
}

/**
 * Add a custom structured MIME decoder to the set of known decoders. These
 * decoders are used for {@link parseStructuredHeader} and similar functions to
 * encode richer, more structured values instead of relying on string
 * representations everywhere.
 *
 * Structured decoders are functions which take in a single parameter consisting
 * of an array of the string values of the header, in order that they appear in
 * the message. These headers have had the charset conversion (if necessary)
 * applied to them already. The this parameter of the function is set to be the
 * jsmime.headerparser module.
 *
 * There is a large set of structured decoders built-in to the jsmime library
 * already. As these headers are fundamental to the workings of jsmime,
 * attempting to replace them with a custom version will instead produce an
 * exception.
 *
 * @param {String}                       header  The header name (in any case)
 *                                               for which the decoder will be
 *                                               used.
 * @param {Function(String[] -> Object)} decoder The structured decoder
 *                                               function.
 */
function addStructuredDecoder(header, decoder) {
  let lowerHeader = header.toLowerCase();
  if (forbiddenHeaders.has(lowerHeader))
    throw new Error("Cannot override header: " + header);
  structuredDecoders.set(lowerHeader, decoder);
  if (!preferredSpellings.has(lowerHeader))
    preferredSpellings.set(lowerHeader, header);
}

headerparser.addStructuredDecoder = addStructuredDecoder;
headerparser.convert8BitHeader = convert8BitHeader;
headerparser.decodeRFC2047Words = decodeRFC2047Words;
headerparser.getHeaderTokens = getHeaderTokens;
headerparser.parseAddressingHeader = parseAddressingHeader;
headerparser.parseDateHeader = parseDateHeader;
headerparser.parseParameterHeader = parseParameterHeader;
headerparser.parseStructuredHeader = parseStructuredHeader;
return Object.freeze(headerparser);

});

////////////////////////////////////////////////////////////////////////////////
//                        JavaScript Raw MIME Parser                          //
////////////////////////////////////////////////////////////////////////////////

/**
 * The parser implemented in this file produces a MIME part tree for a given
 * input message via a streaming callback interface. It does not, by itself,
 * understand concepts like attachments (hence the term 'Raw'); the consumer
 * must translate output into such a format.
 *
 * Charsets:
 * The MIME specifications permit a single message to contain multiple charsets
 * (or perhaps none) as raw octets. As JavaScript strings are implicitly
 * implemented in UTF-16, it is possible that some engines will attempt to
 * convert these strings using an incorrect charset or simply fail to convert
 * them at all. This parser assumes that its input is in the form of a "binary
 * string", a string that uses only the first 256 characters of Unicode to
 * represent the individual octets. To verify that charsets are not getting
 * mangled elsewhere in the pipeline, the auxiliary test file test/data/charsets
 * can be used.
 *
 * This parser attempts to hide the charset details from clients as much as
 * possible. The resulting values of structured headers are always converted
 * into proper Unicode strings before being exposed to clients; getting at the
 * raw binary string data can only be done via getRawHeader. The .charset
 * parameter on header objects, if changed, changes the fallback charset used
 * for headers. It is initialized to the presumed charset of the corresponding
 * part, taking into account the charset and force-charset options of the
 * parser. Body parts are only converted into Unicode strings if the strformat
 * option is set to Unicode. Even then, only the bodies of parts with a media
 * type of text are converted to Unicode strings using available charset data;
 * other parts are retained as Uint8Array objects.
 *
 * Part numbering:
 * Since the output is a streaming format, individual parts are identified by a
 * numbering scheme. The intent of the numbering scheme for parts is to comply
 * with the part numbers as dictated by RFC 3501 as much possible; however,
 * that scheme does have several edge cases which would, if strictly followed,
 * make it impossible to refer to certain parts of the message. In addition, we
 * wish to make it possible to refer to parts which are not discoverable in the
 * original MIME tree but are still viewable as parts. The part numbering
 * scheme is as follows:
 * - Individual sections of a multipart/* body are numbered in increasing order
 *   sequentially, starting from 1. Note that the prologue and the epilogue of
 *   a multipart/* body are not considered entities and are therefore not
 *   included in the part numbering scheme (there is no way to refer to them).
 * - The numbers of multipart/* parts are separated by `.' characters.
 * - The outermost message is referred to by use of the empty string.
 * --> The following segments are not accounted for by IMAP part numbering. <--
 * - The body of any message/rfc822 or similar part is distinguished from the
 *   message part as a whole by appending a `$' character. This does not apply
 *   to the outermost message/rfc822 envelope.
 */

def('mimeparser', function(require) {
"use strict";

var mimeutils = require('./mimeutils');
var headerparser = require('./headerparser');
var spellings = require('./structuredHeaders').spellings;

/**
 * An object that represents the structured MIME headers for a message.
 *
 * This class is primarily used as the 'headers' parameter in the startPart
 * callback on handlers for MimeParser. As such, it is designed to do the right
 * thing in common cases as much as possible, with some advanced customization
 * possible for clients that need such flexibility.
 *
 * In a nutshell, this class stores the raw headers as an internal Map. The
 * structured headers are not computed until they are actually used, which means
 * that potentially expensive structuring (e.g., doing manual DKIM validation)
 * can be performed as a structured decoder without impeding performance for
 * those who just want a few common headers.
 *
 * The outer API of this class is intended to be similar to a read-only Map
 * object (complete with iterability support), with a few extra properties to
 * represent things that are hard to determine properly from headers. The keys
 * used are "preferred spellings" of the headers, although the get and has
 * methods will accept header parameters of any case. Preferred spellings are
 * derived from the name passed to addStructuredDecoder/addStructuredEncoder; if
 * no structured decoder has been registered, then the name capitalizes the
 * first letter of every word in the header name.
 *
 * Extra properties compared to a Map object are:
 * - charset: This field represents the assumed charset of the associated MIME
 *   body. It is prefilled using a combination of the charset and force-charset
 *   options on the associated MimeParser instance as well as attempting to find
 *   a charset parameter in the Content-Type header.
 *
 *   If the force-charset option is false, the charset is guessed first using
 *   the Content-Type header's charset parameter, falling back to the charset
 *   option if it is present. If the force-charset option is true, the charset
 *   is initially set to the charset option. This initial guessed value can be
 *   overridden at any time by simply setting the field on this object.
 *
 *   The charset is better reflected as a parameter of the body rather than the
 *   headers; this is ultimately the charset parameter that will be used if a
 *   body part is being converted to a Unicode strformat. Headers are converted
 *   using headerparser.convert8BitHeader, and this field is used as the
 *   fallbackCharset parameter, which will always to attempt to decode as UTF-8
 *   first (in accordance with RFC 6532) and will refuse to decode as UTF-16 or
 *   UTF-32, as ASCII is not a subset of those charsets.
 *
 * - rawHeaderText: This read-only field contains the original header text from
 *   which headers were parsed, preserving case and whitespace (including
 *   alternate line endings instead of CRLF) exactly. If the header text begins
 *   with the mbox delimiter (i.e., a line that begins with "From "), then that
 *   is excluded from the rawHeaderText value and is not reflected anywhere in
 *   this object.
 *
 * - contentType: This field contains the structured representation of the
 *   Content-Type header, if it is present. If it is not present, it is set to
 *   the structured representation of the default Content-Type for a part (as
 *   this data is not easily guessed given only MIME tree events).
 *
 * The constructor for these objects is not externally exported, and thus they
 * can only be created via MimeParser.
 *
 * @param rawHeaderText {BinaryString} The contents of the MIME headers to be
 *                                     parsed.
 * @param options    {Object}          Options for the header parser.
 *   @param options.stripcontinuations {Boolean} If true, elide CRLFs from the
 *                                               raw header output.
 */
function StructuredHeaders(rawHeaderText, options) {
  // An individual header is terminated by a CRLF, except if the CRLF is
  // followed by a SP or TAB. Use negative lookahead to capture the latter case,
  // and don't capture the strings or else split results get nasty.
  let values = rawHeaderText.split(/(?:\r\n|\n)(?![ \t])|\r(?![ \t\n])/);

  // Ignore the first "header" if it begins with an mbox delimiter
  if (values.length > 0 && values[0].substring(0, 5) == "From ") {
    values.shift();
    // Elide the mbox delimiter from this._headerData
    if (values.length == 0)
      rawHeaderText = '';
    else
      rawHeaderText = rawHeaderText.substring(rawHeaderText.indexOf(values[0]));
  }

  let headers = new Map();
  for (let i = 0; i < values.length; i++) {
    // Look for a colon. If it's not present, this header line is malformed,
    // perhaps by premature EOF or similar.
    let colon = values[i].indexOf(":");
    if (colon >= 0) {
      var header = values[i].substring(0, colon);
      var val = values[i].substring(colon + 1).trim();
      if (options.stripcontinuations)
        val = val.replace(/[\r\n]/g, '');
    } else {
      var header = values[i];
      var val = '';
    }

    // Canonicalize the header in lower-case form.
    header = header.trim().toLowerCase();
    // Omit "empty" headers
    if (header == '')
      continue;

    // We keep an array of values for each header, since a given header may be
    // repeated multiple times.
    if (headers.has(header)) {
      headers.get(header).push(val);
    } else {
      headers.set(header, [val]);
    }
  }

  /**
   * A map of header names to arrays of raw values found in this header block.
   * @private
   */
  this._rawHeaders = headers;
  /**
   * Cached results of structured header parsing.
   * @private
   */
  this._cachedHeaders = new Map();
  Object.defineProperty(this, "rawHeaderText",
    {get: function () { return rawHeaderText; }});
  Object.defineProperty(this, "size",
    {get: function () { return this._rawHeaders.size; }});
  Object.defineProperty(this, "charset", {
    get: function () { return this._charset; },
    set: function (value) {
      this._charset = value;
      // Clear the cached headers, since this could change their values
      this._cachedHeaders.clear();
    }
  });

  // Default to the charset, until the message parser overrides us.
  if ('charset' in options)
    this._charset = options.charset;
  else
    this._charset = null;

  // If we have a Content-Type header, set contentType to return the structured
  // representation. We don't set the value off the bat, since we want to let
  // someone who changes the charset affect the values of 8-bit parameters.
  Object.defineProperty(this, "contentType", {
    configurable: true,
    get: function () { return this.get('Content-Type'); }
  });
}

/**
 * Get a raw header.
 *
 * Raw headers are an array of the header values, listed in order that they were
 * specified in the header block, and without any attempt to convert charsets or
 * apply RFC 2047 decoding. For example, in the following message (where the
 * <XX> is meant to represent binary-octets):
 *
 * X-Header: Value A
 * X-Header: V<C3><A5>lue B
 * Header2: Q
 *
 * the result of calling getRawHeader('X-Header') or getRawHeader('x-header')
 * would be ['Value A', 'V\xC3\xA5lue B'] and the result of
 * getRawHeader('Header2') would be ['Q'].
 *
 * @param headerName {String} The header name for which to get header values.
 * @returns {BinaryString[]} The raw header values (with no charset conversion
 *                           applied).
 */
StructuredHeaders.prototype.getRawHeader = function (headerName) {
  return this._rawHeaders.get(headerName.toLowerCase());
};

/**
 * Retrieve a structured version of the header.
 *
 * If there is a registered structured decoder (registration happens via
 * headerparser.addStructuredDecoder), then the result of calling that decoder
 * on the charset-corrected version of the header is returned. Otherwise, the
 * values are charset-corrected and RFC 2047 decoding is applied as if the
 * header were an unstructured header.
 *
 * A substantial set of headers have pre-registed structured decoders, which, in
 * some cases, are unable to be overridden due to their importance in the
 * functioning of the parser code itself.
 *
 * @param headerName {String} The header name for which to get the header value.
 * @returns The structured header value of the output.
 */
StructuredHeaders.prototype.get = function (headerName) {
  // Normalize the header name to lower case
  headerName = headerName.toLowerCase();

  // First, check the cache for the header value
  if (this._cachedHeaders.has(headerName))
    return this._cachedHeaders.get(headerName);

  // Not cached? Grab it [propagating lack of header to caller]
  let headerValue = this._rawHeaders.get(headerName);
  if (headerValue === undefined)
    return headerValue;

  // Convert the header to Unicode
  let charset = this.charset;
  headerValue = headerValue.map(function (value) {
    return headerparser.convert8BitHeader(value, charset);
  });

  // If there is a structured decoder, use that; otherwise, assume that the
  // header is unstructured and only do RFC 2047 conversion
  let structured;
  try {
    structured = headerparser.parseStructuredHeader(headerName, headerValue);
  } catch (e) {
    structured = headerValue.map(function (value) {
      return headerparser.decodeRFC2047Words(value);
    });
  }

  // Cache the result and return it
  this._cachedHeaders.set(headerName, structured);
  return structured;
};

/**
 * Check if the message has the given header.
 *
 * @param headerName {String} The header name for which to get the header value.
 * @returns {Boolean} True if the header is present in this header block.
 */
StructuredHeaders.prototype.has = function (headerName) {
  // Check for presence in the raw headers instead of cached headers.
  return this._rawHeaders.has(headerName.toLowerCase());
};

// Make a custom iterator. Presently, support for Symbol isn't yet present in
// SpiderMonkey (or V8 for that matter), so type-pun the name for now.
var JS_HAS_SYMBOLS = typeof Symbol === "function";
var ITERATOR_SYMBOL = JS_HAS_SYMBOLS ? Symbol.iterator : "@@iterator";

/**
 * An equivalent of Map.@@iterator, applied to the structured header
 * representations. This is the function that makes
 * for (let [header, value] of headers) work properly.
 */
StructuredHeaders.prototype[ITERATOR_SYMBOL] = function*() {
  // Iterate over all the raw headers, and use the cached headers to retrieve
  // them.
  for (let headerName of this.keys()) {
    yield [headerName, this.get(headerName)];
  }
};

/**
 * An equivalent of Map.forEach, applied to the structured header
 * representations.
 *
 * @param callback {Function(value, name, headers)} The callback to call for
 *                                                  each header/value combo.
 * @param thisarg  {Object}                         The parameter that will be
 *                                                  the |this| of the callback.
 */
StructuredHeaders.prototype.forEach = function (callback, thisarg) {
  for (let [header, value] of this) {
    callback.call(thisarg, value, header, this);
  }
};

/**
 * An equivalent of Map.entries, applied to the structured header
 * representations.
 */
StructuredHeaders.prototype.entries =
  StructuredHeaders.prototype[Symbol.iterator];

/// This function maps lower case names to a pseudo-preferred spelling.
function capitalize(headerName) {
  return headerName.replace(/\b[a-z]/g, function (match) {
    return match.toUpperCase();
  });
}

/**
 * An equivalent of Map.keys, applied to the structured header representations.
 */
StructuredHeaders.prototype.keys = function*() {
  for (let name of this._rawHeaders.keys()) {
    yield spellings.get(name) || capitalize(name);
  }
};

/**
 * An equivalent of Map.values, applied to the structured header
 * representations.
 */
StructuredHeaders.prototype.values = function* () {
  for (let [, value] of this) {
    yield value;
  }
};


/**
 * A MIME parser.
 *
 * The inputs to the constructor consist of a callback object which receives
 * information about the output data and an optional object containing the
 * settings for the parser.
 *
 * The first parameter, emitter, is an object which contains several callbacks.
 * Note that any and all of these methods are optional; the parser will not
 * crash if one is missing. The callbacks are as follows:
 *   startMessage()
 *      Called when the stream to be parsed has started delivering data. This
 *      will be called exactly once, before any other call.
 *   endMessage()
 *      Called after all data has been delivered and the message parsing has
 *      been completed. This will be called exactly once, after any other call.
 *   startPart(string partNum, object headers)
 *      Called after the headers for a body part (including the top-level
 *      message) have been parsed. The first parameter is the part number (see
 *      the discussion on part numbering). The second parameter is an instance
 *      of StructuredHeaders that represents all of the headers for the part.
 *   endPart(string partNum)
 *      Called after all of the data for a body part (including sub-parts) has
 *      been parsed. The first parameter is the part number.
 *   deliverPartData(string partNum, {string,typedarray} data)
 *      Called when some data for a body part has been delivered. The first
 *      parameter is the part number. The second parameter is the data which is
 *      being delivered; the exact type of this data depends on the options
 *      used. Note that data is only delivered for leaf body parts.
 *
 *  The second parameter, options, is an optional object containing the options
 *  for the parser. The following are the options that the parser may use:
 *    pruneat: <string> [default=""]
 *      Treat the message as starting at the given part number, so that no parts
 *      above <string> are returned.
 *    bodyformat: one of {none, raw, nodecode, decode} [default=nodecode]
 *      How to return the bodies of parts:
 *        none: no part data is returned
 *        raw: the body of the part is passed through raw
 *        nodecode: the body is passed through without decoding QP/Base64
 *        decode: quoted-printable and base64 are fully decoded
 *    strformat: one of {binarystring, unicode, typedarray} [default=binarystring]
 *      How to treat output strings:
 *        binarystring: Data is a JS string with chars in the range [\x00-\xff]
 *        unicode: Data for text parts is converted to UTF-16; data for other
 *          parts is a typed array buffer, akin to typedarray.
 *        typedarray: Data is a JS typed array buffer
 *    charset: <string> [default=""]
 *      What charset to assume if no charset information is explicitly provided.
 *      This only matters if strformat is unicode. See above note on charsets
 *      for more details.
 *    force-charset: <boolean> [default=false]
 *      If true, this coerces all types to use the charset option, even if the
 *      message specifies a different content-type.
 *    stripcontinuations: <boolean> [default=true]
 *      If true, then the newlines in headers are removed in the returned
 *      header objects.
 *    onerror: <function(thrown error)> [default = nop-function]
 *      An error function that is called if an emitter callback throws an error.
 *      By default, such errors are swallowed by the parser. If you want the
 *      parser itself to throw an error, rethrow it via the onerror function.
 */
function MimeParser(emitter, options) {
  /// The actual emitter
  this._emitter = emitter;
  /// Options for the parser (those listed here are defaults)
  this._options = {
    pruneat: "",
    bodyformat: "nodecode",
    strformat: "binarystring",
    stripcontinuations: true,
    charset: "",
    "force-charset": false,
    onerror: function swallow(error) {}
  };
  // Load the options as a copy here (prevents people from changing on the fly).
  if (options)
    for (var opt in options) {
      this._options[opt] = options[opt];
    }

  // Ensure that the error function is in fact a function
  if (typeof this._options.onerror != "function")
    throw new Exception("onerror callback must be a function");

  // Reset the parser
  this.resetParser();
}

/**
 * Resets the parser to read a new message. This method need not be called
 * immediately after construction.
 */
MimeParser.prototype.resetParser = function () {
  /// Current parser state
  this._state = PARSING_HEADERS;
  /// Input data that needs to be held for buffer conditioning
  this._holdData = '';
  /// Complete collection of headers (also used to accumulate _headerData)
  this._headerData = '';
  /// Whether or not emitter.startMessage has been called
  this._triggeredCall = false;

  /// Splitting input
  this._splitRegex = this._handleSplit = undefined;
  /// Subparsing
  this._subparser = this._subPartNum = undefined;
  /// Data that has yet to be consumed by _convertData
  this._savedBuffer = '';
  /// Convert data
  this._convertData = undefined;
  /// String decoder
  this._decoder = undefined;
};

/**
 * Deliver a buffer of data to the parser.
 *
 * @param buffer {BinaryString} The raw data to add to the message.
 */
MimeParser.prototype.deliverData = function (buffer) {
  // In ideal circumstances, we'd like to parse the message all at once. In
  // reality, though, data will be coming to us in packets. To keep the amount
  // of saved state low, we want to make basic guarantees about how packets get
  // delivered. Our basic model is a twist on line-buffering, as the format of
  // MIME and messages make it hard to not do so: we can handle multiple lines
  // at once. To ensure this, we start by conditioning the packet by
  // withholding data to make sure that the internal deliveries have the
  // guarantees. This implies that we need to do the following steps:
  // 1. We don't know if a `\r' comes from `\r\n' or the old mac line ending
  // until we see the next character. So withhold the last `\r'.
  // 2. Ensure that every packet ends on a newline. So scan for the end of the
  // line and withhold until the \r\n comes through.
  // [Note that this means that an input message that uses \r line endings and
  // is being passed to us via a line-buffered input is going to have most of
  // its data being withhold until the next buffer. Since \r is so uncommon of
  // a line ending in modern times, this is acceptable lossage.]
  // 3. Eliminate empty packets.

  // Add in previously saved data
  if (this._holdData) {
    buffer = this._holdData + buffer;
    this._holdData = '';
  }

  // Condition the input, so that we get the multiline-buffering mentioned in
  // the above comment.
  if (buffer.length > 0) {
    [buffer, this._holdData] = conditionToEndOnCRLF(buffer);
  }

  // Ignore 0-length buffers.
  if (buffer.length == 0)
    return;

  // Signal the beginning, if we haven't done so.
  if (!this._triggeredCall) {
    this._callEmitter("startMessage");
    this._triggeredCall = true;
  }

  // Finally, send it the internal parser.
  this._dispatchData("", buffer, true);
}

/**
 * Ensure that a set of data always ends in an end-of-line character.
 *
 * @param buffer {BinaryString} The data with no guarantees about where it ends.
 * @returns {BinaryString[]} An array of 2 binary strings where the first string
 *                           ends in a newline and the last string contains the
 *                           text in buffer following the first string.
 */
function conditionToEndOnCRLF(buffer) {
  // Find the last occurrence of '\r' or '\n' to split the string. However, we
  // don't want to consider '\r' if it is the very last character, as we need
  // the next packet to tell if the '\r' is the beginning of a CRLF or a line
  // ending by itself.
  let lastCR = buffer.lastIndexOf('\r', buffer.length - 2);
  let lastLF = buffer.lastIndexOf('\n');
  let end = lastLF > lastCR ? lastLF : lastCR;
  return [buffer.substring(0, end + 1), buffer.substring(end + 1)];
};

/**
 * Tell the parser that all of the data has been delivered.
 *
 * This will flush all of the internal state of the parser.
 */
MimeParser.prototype.deliverEOF = function () {
  // Start of input buffered too long? Call start message now.
  if (!this._triggeredCall) {
    this._triggeredCall = true;
    this._callEmitter("startMessage");
  }
  // Force a flush of all of the data.
  if (this._holdData)
    this._dispatchData("", this._holdData, true);
  this._dispatchEOF("");
  // Signal to the emitter that we're done.
  this._callEmitter("endMessage");
};

/**
 * Calls a method on the emitter safely.
 *
 * This method ensures that errors in the emitter call won't cause the parser
 * to exit with an error, unless the user wants it to.
 *
 * @param funcname {String} The function name to call on the emitter.
 * @param args...           Extra arguments to pass into the emitter callback.
 */
MimeParser.prototype._callEmitter = function (funcname) {
  if (this._emitter && funcname in this._emitter) {
    let args = Array.prototype.splice.call(arguments, 1);
    if (args.length > 0 && this._willIgnorePart(args[0])) {
      // partNum is always the first argument, so check to make sure that it
      // satisfies our emitter's pruneat requirement.
      return;
    }
    try {
      this._emitter[funcname].apply(this._emitter, args);
    } catch (e) {
      // We ensure that the onerror attribute in options is a function, so this
      // is always safe.
      this._options.onerror(e);
    }
  }
};

/**
 * Helper function to decide if a part's output will never be seen.
 *
 * @param part {String} The number of the part.
 * @returns {Boolean} True if the emitter is not interested in this part.
 */
MimeParser.prototype._willIgnorePart = function (part) {
  if (this._options["pruneat"]) {
    let match = this._options["pruneat"];
    let start = part.substr(0, match.length);
    // It needs to start with and follow with a new part indicator
    // (i.e., don't let 10 match with 1, but let 1.1 or 1$ do so)
    if (start != match || (match.length < part.length &&
          "$.".indexOf(part[match.length]) == -1))
      return true;
  }
  return false;
};

//////////////////////
// MIME parser core //
//////////////////////

// This MIME parser is a stateful parser; handling of the MIME tree is mostly
// done by creating new parsers and feeding data to them manually. In parallel
// to the externally-visible deliverData and deliverEOF, the two methods
// _dispatchData and _dispatchEOF are the internal counterparts that do the
// main work of moving data to where it needs to go; helper functions are used
// to handle translation.
//
// The overall flow of the parser is this. First, it buffers all of the data
// until the dual-CRLF pattern is noticed. Once that is found, it parses the
// entire header chunk at once. As a result of header parsing, the parser enters
// one of three modes for handling data, and uses a special regex to change
// modes and handle state changes. Specific details about the states the parser
// can be in are as follows:
//   PARSING_HEADERS: The input buffer is concatenated to the currently-received
//     text, which is then searched for the CRLFCRLF pattern. If found, the data
//     is split at this boundary; the first chunk is parsed using _parseHeaders,
//     and the second chunk will fall through to buffer processing. After
//     splitting, the headers are deliverd via the emitter, and _startBody is
//     called to set up state for the parser.
//   SEND_TO_BLACK_HOLE: All data in the input is ignored.
//   SEND_TO_EMITTER: All data is passed into the emitter, if it is desired.
//     Data can be optionally converted with this._convertData.
//   SEND_TO_SUBPARSER: All data is passed into the subparser's _dispatchData
//     method, using _subPartNum as the part number and _subparser as the object
//     to call. Data can be optionally converted first with this._convertData.
//
// Additional state modifications can be done using a regex in _splitRegex and
// the callback method this._handleSplit(partNum, regexResult). The _handleSplit
// callback is free to do any modification to the current parser, including
// modifying the _splitRegex value. Packet conditioning guarantees that every
// buffer string passed into _dispatchData will have started immediately after a
// newline character in the fully assembled message.
//
// The this._convertData method, if present, is expected to return an array of
// two values, [{typedarray, string} decoded_buffer, string unused_buffer], and
// has as its arguments (string buffer, bool moreToCome).
//
// The header parsing by itself does very little parsing, only parsing as if all
// headers were unstructured fields. Values are munged so that embedded newlines
// are stripped and the result is also trimmed. Headers themselves are
// canonicalized into lower-case.


// Parser states. See the large comment above.
var PARSING_HEADERS = 1;
var SEND_TO_BLACK_HOLE = 2;
var SEND_TO_EMITTER = 3;
var SEND_TO_SUBPARSER = 4;

/**
 * Main dispatch for incoming packet data.
 *
 * The incoming data needs to have been sanitized so that each packet begins on
 * a newline boundary. The part number for the current parser also needs to be
 * passed in. The checkSplit parameter controls whether or not the data in
 * buffer needs to be checked against _splitRegex; this is used internally for
 * the mechanics of splitting and should otherwise always be true.
 *
 * @param partNum    {String}       The part number being currently parsed.
 * @param buffer     {BinaryString} The text (conditioned as mentioned above) to
 *                                  pass to the parser.
 * @param checkSplit {Boolean}      If true, split the text using _splitRegex.
 *                                  This is set to false internally to handle
 *                                  low-level splitting details.
 */
MimeParser.prototype._dispatchData = function (partNum, buffer, checkSplit) {
  // Are we parsing headers?
  if (this._state == PARSING_HEADERS) {
    this._headerData += buffer;
    // Find the end of the headers--either it's a CRLF at the beginning (in
    // which case we have no headers), or it's a pair of CRLFs.
    let result = /(?:^(?:\r\n|[\r\n]))|(\r\n|[\r\n])\1/.exec(this._headerData);
    if (result != null) {
      // If we found the end of headers, split the data at this point and send
      // the stuff after the double-CRLF into the later body parsing.
      let headers = this._headerData.substr(0, result.index);
      buffer = this._headerData.substring(result.index + result[0].length);
      this._headerData = headers;
      this._headers = this._parseHeaders();
      this._callEmitter("startPart", partNum, this._headers);
      this._startBody(partNum);
    } else {
      return;
    }
  }

  // We're in the middle of the body. Start by testing the split regex, to see
  // if there are many things that need to be done.
  if (checkSplit && this._splitRegex) {
    let splitResult = this._splitRegex.exec(buffer);
    if (splitResult) {
      // Pass the text before the split through the current state.
      let start = splitResult.index, len = splitResult[0].length;
      if (start > 0)
        this._dispatchData(partNum, buffer.substr(0, start), false);

      // Tell the handler that we've seen the split. Note that this can change
      // any method on `this'.
      this._handleSplit(partNum, splitResult);

      // Send the rest of the data to where it needs to go. There could be more
      // splits in the data, so watch out!
      buffer = buffer.substring(start + len);
      if (buffer.length > 0)
        this._dispatchData(partNum, buffer, true);
      return;
    }
  }

  // Where does the data go?
  if (this._state == SEND_TO_BLACK_HOLE) {
    // Don't send any data when going to the black hole.
    return;
  } else if (this._state == SEND_TO_EMITTER) {
    // Don't pass body data if the format is to be none
    let passData = this._options["bodyformat"] != "none";
    if (!passData || this._willIgnorePart(partNum))
      return;
    buffer = this._applyDataConversion(buffer, this._options["strformat"]);
    if (buffer.length > 0)
      this._callEmitter("deliverPartData", partNum, buffer);
  } else if (this._state == SEND_TO_SUBPARSER) {
    buffer = this._applyDataConversion(buffer, "binarystring");
    if (buffer.length > 0)
      this._subparser._dispatchData(this._subPartNum, buffer, true);
  }
};

/**
 * Output data using the desired output format, saving data if data conversion
 * needs extra data to be saved.
 *
 * @param buf  {BinaryString} The data to be sent to the output.
 * @param type {String}       The type of the data to output. Valid values are
 *                            the same as the strformat option.
 * @returns Coerced and converted data that can be sent to the emitter or
 *          subparser.
 */
MimeParser.prototype._applyDataConversion = function (buf, type) {
  // If we need to convert data, do so.
  if (this._convertData) {
    // Prepend leftover data from the last conversion.
    buf = this._savedBuffer + buf;
    [buf, this._savedBuffer] = this._convertData(buf, true);
  }
  return this._coerceData(buf, type, true);
};

/**
 * Coerce the input buffer into the given output type.
 *
 * @param buffer {BinaryString|Uint8Array} The data to be converted.
 * @param type   {String}                  The type to convert the data to.
 * @param more   {boolean}                 If true, this function will never be
 *                                         called again.
 * @returns {BinaryString|String|Uint8Array} The desired output format.
 */
/// Coerces the buffer (a string or typedarray) into a given type
MimeParser.prototype._coerceData = function (buffer, type, more) {
  if (typeof buffer == "string") {
    // string -> binarystring is a nop
    if (type == "binarystring")
      return buffer;
    // Either we're going to array or unicode. Both people need the array
    var typedarray = mimeutils.stringToTypedArray(buffer);
    // If it's unicode, do the coercion from the array
    // If its typedarray, just return the synthesized one
    return type == "unicode" ? this._coerceData(typedarray, "unicode", more)
                             : typedarray;
  } else if (type == "binarystring") {
    // Doing array -> binarystring
    return mimeutils.typedArrayToString(buffer);
  } else if (type == "unicode") {
    // Doing array-> unicode: Use the decoder set up earlier to convert
    if (this._decoder)
      return this._decoder.decode(buffer, {stream: more});
    // If there is no charset, just return the typed array instead.
    return buffer;
  }
  throw new Error("Invalid type: " + type);
};

/**
 * Signal that no more data will be dispatched to this parser.
 *
 * @param partNum {String} The part number being currently parsed.
 */
MimeParser.prototype._dispatchEOF = function (partNum) {
  if (this._state == PARSING_HEADERS) {
    // Unexpected EOF in headers. Parse them now and call startPart/endPart
    this._headers = this._parseHeaders();
    this._callEmitter("startPart", partNum, this._headers);
  } else if (this._state == SEND_TO_SUBPARSER) {
    // Pass in any lingering data
    if (this._convertData && this._savedBuffer)
      this._subparser._dispatchData(this._subPartNum,
        this._convertData(this._savedBuffer, false)[0], true);
    this._subparser._dispatchEOF(this._subPartNum);
    // Clean up after ourselves
    this._subparser = null;
  } else if (this._convertData && this._savedBuffer) {
    // Convert lingering data
    let [buffer, ] = this._convertData(this._savedBuffer, false);
    buffer = this._coerceData(buffer, this._options["strformat"], false);
    if (buffer.length > 0)
      this._callEmitter("deliverPartData", partNum, buffer);
  }

  // We've reached EOF for this part; tell the emitter
  this._callEmitter("endPart", partNum);
};

/**
 * Produce a dictionary of all headers as if they were unstructured fields.
 *
 * @returns {StructuredHeaders} The structured header objects for the header
 *                              block.
 */
MimeParser.prototype._parseHeaders = function () {
  let headers = new StructuredHeaders(this._headerData, this._options);

  // Fill the headers.contentType parameter of headers.
  let contentType = headers.get('Content-Type');
  if (typeof contentType === "undefined") {
    contentType = headerparser.parseStructuredHeader('Content-Type',
      this._defaultContentType || 'text/plain');
    Object.defineProperty(headers, "contentType", {
      get: function () { return contentType; }
    });
  } else {
    Object.defineProperty(headers, "contentType", { configurable: false });
  }

  // Find the charset for the current part. If the user requested a forced
  // conversion, use that first. Otherwise, check the content-type for one and
  // fallback to a default if it is not present.
  let charset = '';
  if (this._options["force-charset"])
    charset = this._options["charset"];
  else if (contentType.has("charset"))
    charset = contentType.get("charset");
  else
    charset = this._options["charset"];
  headers.charset = charset;

  // Retain a copy of the charset so that users don't override our decision for
  // decoding body parts.
  this._charset = charset;
  return headers;
};

/**
 * Initialize the parser state for the body of this message.
 *
 * @param partNum {String} The part number being currently parsed.
 */
MimeParser.prototype._startBody = function Parser_startBody(partNum) {
  let contentType = this._headers.contentType;

  // Should the bodyformat be raw, we just want to pass through all data without
  // trying to interpret it.
  if (this._options["bodyformat"] == "raw" &&
      partNum == this._options["pruneat"]) {
    this._state = SEND_TO_EMITTER;
    return;
  }

  // The output depents on the content-type. Basic rule of thumb:
  // 1. Discrete media types (text, video, audio, image, application) are passed
  //    through with no alterations beyond Content-Transfer-Encoding unpacking.
  // 2. Everything with a media type of multipart is treated the same.
  // 3. Any message/* type that acts like a mail message (rfc822, news, global)
  //    is parsed as a header/body pair again. Most of the other message/* types
  //    have similar structures, but they don't have cascading child subparts,
  //    so it's better to pass their entire contents to the emitter and let the
  //    consumer deal with them.
  // 4. For untyped data, there needs to be no Content-Type header. This helps
  //    avoid false positives.
  if (contentType.mediatype == 'multipart') {
    // If there's no boundary type, everything will be part of the prologue of
    // the multipart message, so just feed everything into a black hole.
    if (!contentType.has('boundary')) {
      this._state = SEND_TO_BLACK_HOLE;
      return;
    }
    // The boundary of a multipart message needs to start with -- and be at the
    // beginning of the line. If -- is after the boundary, it represents the
    // terminator of the multipart. After the line, there may be only whitespace
    // and then the CRLF at the end. Since the CRLFs in here are necessary for
    // distinguishing the parts, they are not included in the subparts, so we
    // need to capture them in the regex as well to prevent them leaking out.
    this._splitRegex = new RegExp('(\r\n|[\r\n]|^)--' +
      contentType.get('boundary').replace(/[\\^$*+?.()|{}[\]]/g, '\\$&') +
      '(--)?[ \t]*(?:\r\n|[\r\n]|$)');
    this._handleSplit = this._whenMultipart;
    this._subparser = new MimeParser(this._emitter, this._options);
    // multipart/digest defaults to message/rfc822 instead of text/plain
    if (contentType.subtype == "digest")
      this._subparser._defaultContentType = "message/rfc822";

    // All text before the first boundary and after the closing boundary are
    // supposed to be ignored ("must be ignored", according to RFC 2046 §5.1.1);
    // in accordance with these wishes, ensure they don't get passed to any
    // deliverPartData.
    this._state = SEND_TO_BLACK_HOLE;

    // Multipart MIME messages stipulate that the final CRLF before the boundary
    // delimiter is not matched. When the packet ends on a CRLF, we don't know
    // if the next text could be the boundary. Therefore, we need to withhold
    // the last line of text to be sure of what's going on. The _convertData is
    // how we do this, even though we're not really converting any data.
    this._convertData = function mpart_no_leak_crlf(buffer, more) {
      let splitPoint = buffer.length;
      if (more) {
        if (buffer.charAt(splitPoint - 1) == '\n')
          splitPoint--;
        if (splitPoint >= 0 && buffer.charAt(splitPoint - 1) == '\r')
          splitPoint--;
      }
      let res = conditionToEndOnCRLF(buffer.substring(0, splitPoint));
      let preLF = res[0];
      let rest = res[1];
      return [preLF, rest + buffer.substring(splitPoint)];
    }
  } else if (contentType.type == 'message/rfc822' ||
      contentType.type == 'message/global' ||
      contentType.type == 'message/news') {
    // The subpart is just another header/body pair that goes to EOF, so just
    // return the parse from that blob
    this._state = SEND_TO_SUBPARSER;
    this._subPartNum = partNum + "$";
    this._subparser = new MimeParser(this._emitter, this._options);

    // So, RFC 6532 happily allows message/global types to have CTE applied.
    // This means that subparts would need to be decoded to determine their
    // contents properly. There seems to be some evidence that message/rfc822
    // that is illegally-encoded exists in the wild, so be lenient and decode
    // for any message/* type that gets here.
    let cte = this._extractHeader('content-transfer-encoding', '');
    if (cte in ContentDecoders)
      this._convertData = ContentDecoders[cte];
  } else {
    // Okay, we just have to feed the data into the output
    this._state = SEND_TO_EMITTER;
    if (this._options["bodyformat"] == "decode") {
      // If we wish to decode, look it up in one of our decoders.
      let cte = this._extractHeader('content-transfer-encoding', '');
      if (cte in ContentDecoders)
        this._convertData = ContentDecoders[cte];
    }
  }

  // Set up the encoder for charset conversions; only do this for text parts.
  // Other parts are almost certainly binary, so no translation should be
  // applied to them.
  if (this._options["strformat"] == "unicode" &&
      contentType.mediatype == "text") {
    // If the charset is nonempty, initialize the decoder
    if (this._charset !== "") {
      this._decoder = new TextDecoder(this._charset);
    } else {
      // There's no charset we can use for decoding, so pass through as an
      // identity encoder or otherwise this._coerceData will complain.
      this._decoder = {
        decode: function identity_decoder(buffer) {
          return MimeParser.prototype._coerceData(buffer, "binarystring", true);
        }
      };
    }
  } else {
    this._decoder = null;
  }
};

// Internal split handling for multipart messages.
/**
 * When a multipary boundary is found, handle the process of managing the
 * subparser state. This is meant to be used as a value for this._handleSplit.
 *
 * @param partNum    {String} The part number being currently parsed.
 * @param lastResult {Array}  The result of the regular expression match.
 */
MimeParser.prototype._whenMultipart = function (partNum, lastResult) {
  // Fix up the part number (don't do '' -> '.4' and don't do '1' -> '14')
  if (partNum != "") partNum += ".";
  if (!this._subPartNum) {
    // No count? This means that this is the first time we've seen the boundary,
    // so do some initialization for later here.
    this._count = 1;
  } else {
    // If we did not match a CRLF at the beginning of the line, strip CRLF from
    // the saved buffer. We do this in the else block because it is not
    // necessary for the prologue, since that gets ignored anyways.
    if (this._savedBuffer != '' && lastResult[1] === '') {
      let useEnd = this._savedBuffer.length - 1;
      if (this._savedBuffer[useEnd] == '\n')
        useEnd--;
      if (useEnd >= 0 && this._savedBuffer[useEnd] == '\r')
        useEnd--;
      this._savedBuffer = this._savedBuffer.substring(0, useEnd + 1);
    }
    // If we have saved data and we matched a CRLF, pass the saved data in.
    if (this._savedBuffer != '')
      this._subparser._dispatchData(this._subPartNum, this._savedBuffer, true);
    // We've seen the boundary at least once before, so this must end a subpart.
    // Tell that subpart that it has reached EOF.
    this._subparser._dispatchEOF(this._subPartNum);
  }
  this._savedBuffer = '';

  // The regex feeder has a capture on the (--)?, so if its result is present,
  // then we have seen the terminator. Alternatively, the message may have been
  // mangled to exclude the terminator, so also check if EOF has occurred.
  if (lastResult[2] == undefined) {
    this._subparser.resetParser();
    this._state = SEND_TO_SUBPARSER;
    this._subPartNum = partNum + this._count;
    this._count += 1;
  } else {
    // Ignore the epilogue
    this._splitRegex = null;
    this._state = SEND_TO_BLACK_HOLE;
  }
};

/**
 * Return the structured header from the current header block, or a default if
 * it is not present.
 *
 * @param name {String} The header name to get.
 * @param dflt {String} The default MIME value of the header.
 * @returns The structured representation of the header.
 */
MimeParser.prototype._extractHeader = function (name, dflt) {
  name = name.toLowerCase(); // Normalize name
  return this._headers.has(name) ? this._headers.get(name) :
    headerparser.parseStructuredHeader(name, [dflt]);
};

var ContentDecoders = {};
ContentDecoders['quoted-printable'] = mimeutils.decode_qp;
ContentDecoders['base64'] = mimeutils.decode_base64;

return MimeParser;
});
def('headeremitter', function(require) {
/**
 * This module implements the code for emitting structured representations of
 * MIME headers into their encoded forms. The code here is a companion to,
 * but completely independent of, jsmime.headerparser: the structured
 * representations that are used as input to the functions in this file are the
 * same forms that would be parsed.
 */

"use strict";

var mimeutils = require('./mimeutils');

// Get the default structured encoders and add them to the map
var structuredHeaders = require('./structuredHeaders');
var encoders = new Map();
var preferredSpellings = structuredHeaders.spellings;
for (let [header, encoder] of structuredHeaders.encoders) {
  addStructuredEncoder(header, encoder);
}

/// Clamp a value in the range [min, max], defaulting to def if it is undefined.
function clamp(value, min, max, def) {
  if (value === undefined)
    return def;
  if (value < min)
    return min;
  if (value > max)
    return max;
  return value;
}

/**
 * An object that can assemble structured header representations into their MIME
 * representation.
 *
 * The character-counting portion of this class operates using individual JS
 * characters as its representation of logical character, which is not the same
 * as the number of octets used as UTF-8. If non-ASCII characters are to be
 * included in headers without some form of encoding, then care should be taken
 * to set the maximum line length to account for the mismatch between character
 * counts and octet counts: the maximum line is 998 octets, which could be as
 * few as 332 JS characters (non-BMP characters, although they take up 4 octets
 * in UTF-8, count as 2 in JS strings).
 *
 * This code takes care to only insert line breaks at the higher-level breaking
 * points in a header (as recommended by RFC 5322), but it may need to resort to
 * including them more aggressively if this is not possible. If even aggressive
 * line-breaking cannot allow a header to be emitted without violating line
 * length restrictions, the methods will throw an exception to indicate this
 * situation.
 *
 * In general, this code does not attempt to modify its input; for example, it
 * does not attempt to change the case of any input characters, apply any
 * Unicode normalization algorithms, or convert email addresses to ACE where
 * applicable. The biggest exception to this rule is that most whitespace is
 * collapsed to a single space, even in unstructured headers, while most leading
 * and trailing whitespace is trimmed from inputs.
 *
 * @param {StreamHandler} handler The handler to which all output is sent.
 *   @param {Function(String)} handler.deliverData Receives encoded data.
 *   @param {Function()} handler.deliverEOF Sent when all text is sent.
 * @param {Object} options Options for the emitter.
 *   @param [options.softMargin=78] {30 <= Integer <= 900}
 *     The ideal maximum number of logical characters to include in a line, not
 *     including the final CRLF pair. Lines may exceed this margin if parameters
 *     are excessively long.
 *   @param [options.hardMargin=332] {softMargin <= Integer <= 998}
 *     The maximum number of logical characters that can be included in a line,
 *     not including the final CRLF pair. If this count would be exceeded, then
 *     an error will be thrown and encoding will not be possible.
 *   @param [options.useASCII=true] {Boolean}
 *     If true, then RFC 2047 and RFC 2231 encoding of headers will be performed
 *     as needed to retain headers as ASCII.
 */
function HeaderEmitter(handler, options) {
  /// The inferred value of options.useASCII
  this._useASCII = options.useASCII === undefined ? true : options.useASCII;
  /// The handler to use.
  this._handler = handler;
  /**
   * The current line being built; note that we may insert a line break in the
   * middle to keep under the maximum line length.
   *
   * @type String
   * @private
   */
  this._currentLine = "";

  // Our bounds for soft and margins are not completely arbitrary. The minimum
  // amount we need to encode is 20 characters, which can encode a single
  // non-BMP character with RFC 2047. The value of 30 is chosen to give some
  // breathing room for delimiters or other unbreakable characters. The maximum
  // length is 998 octets, per RFC 5322; soft margins are slightly lower to
  // allow for breathing room as well. The default of 78 for the soft margin is
  // recommended by RFC 5322; the default of 332 for the hard margin ensures
  // that UTF-8 encoding the output never violates the 998 octet limit.
  this._softMargin = clamp(options.softMargin, 30, 900, 78);
  this._hardMargin = clamp(options.hardMargin, this._softMargin, 998, 332);

  /**
   * The index of the last preferred breakable position in the current line.
   *
   * @type Integer
   * @private
   */
  this._preferredBreakpoint = 0;
}


///////////////////////
// Low-level methods //
///////////////////////

// Explanation of the emitter internals:
// RFC 5322 requires that we wrap our lines, ideally at 78 characters and at
// least by 998 octets. We can't wrap in arbitrary places, but wherever CFWS is
// valid... and ideally wherever clients are likely to expect it. In theory, we
// can break between every token (this is how RFC 822 operates), but, in RFC
// 5322, many of those breaks are relegated to obsolete productions, mostly
// because it is common to not properly handle breaks in those locations.
//
// So how do we do line breaking? The algorithm we implement is greedy, to
// simplify implementation. There are two margins: the soft margin, which we
// want to keep within, and the hard margin, which we absolutely have to keep
// within. There are also two kinds of break points: preferred and emergency.
// As long as we keep the line within the hard margin, we will only break at
// preferred breakpoints; emergency breakpoints are only used if we would
// otherwise exceed the hard margin.
//
// For illustration, here is an example header and where these break points are
// located:
//
//            To: John "The Rock" Smith <jsmith@a.long.domain.invalid>
// Preferred:         ^          ^     ^
// Emergency:         ^    ^     ^     ^^      ^ ^    ^      ^       ^
//
// Preferred breakpoints are indicated by setting the mayBreakAfter parameter of
// addText to true, while emergency breakpoints are set after every token passed
// into addText. This is handled implicitly by only adding text to _currentLine
// if it ends in an emergency breakpoint.
//
// Internally, the code keeps track of margins by use of two variables. The
// _softMargin and _hardMargin variables encode the positions at which code must
// absolutely break, and are set up from the initial options parameter. Breaking
// happens when _currentLine.length approaches these values, as mentioned above.

/**
 * Send a header line consisting of the first N characters to the handler.
 *
 * If the count parameter is missing, then we presume that the current header
 * value being emitted is done and therefore we should not send a continuation
 * space. Otherwise, we presume that we're still working, so we will send the
 * continuation space.
 *
 * @private
 * @param [count] {Integer} The number of characters in the current line to
 *   include before wrapping.
 */
HeaderEmitter.prototype._commitLine = function (count) {
  let isContinuing = typeof count !== "undefined";

  // Split at the point, and lop off whitespace immediately before and after.
  if (isContinuing) {
    var firstN = this._currentLine.slice(0, count).trimRight();
    var lastN = this._currentLine.slice(count).trimLeft();
  } else {
    var firstN = this._currentLine.trimRight();
    var lastN = "";
  }

  // How many characters do we need to shift preferred/emergency breakpoints?
  let shift = this._currentLine.length - lastN.length;

  // Send the line plus the final CRLF.
  this._handler.deliverData(firstN + '\r\n');

  // Fill the start of the line with the new data.
  this._currentLine = lastN;

  // If this is a continuation, add an extra space at the beginning of the line.
  // Adjust the breakpoint shift amount as well.
  if (isContinuing) {
    this._currentLine = ' ' + this._currentLine;
    shift++;
  }

  // We will always break at a point at or after the _preferredBreakpoint, if it
  // exists, so this always gets reset to 0.
  this._preferredBreakpoint = 0;
};

/**
 * Reserve at least length characters in the current line. If there aren't
 * enough characters, insert a line break.
 *
 * @private
 * @param length {Integer} The number of characters to reserve space for.
 * @return {Boolean} Whether or not there is enough space for length characters.
 */
HeaderEmitter.prototype._reserveTokenSpace = function (length) {
  // We are not going to do a sanity check that length is within the wrap
  // margins. The rationale is that this lets code simply call this function to
  // force a higher-level line break than normal preferred line breaks (see
  // addAddress for an example use). The text that would be added may need to be
  // itself broken up, so it might not need all the length anyways, but it
  // starts the break already.

  // If we have enough space, we don't need to do anything.
  if (this._currentLine.length + length <= this._softMargin)
    return true;

  // If we have a preferred breakpoint, commit the line at that point, and see
  // if that is sufficient line-breaking.
  if (this._preferredBreakpoint > 0) {
    this._commitLine(this._preferredBreakpoint);
    if (this._currentLine.length + length <= this._softMargin)
      return true;
  }

  // At this point, we can no longer keep within the soft margin. Let us see if
  // we can fit within the hard margin.
  if (this._currentLine.length + length <= this._hardMargin) {
    return true;
  }

  // Adding the text to length would violate the hard margin as well. Break at
  // the last emergency breakpoint.
  if (this._currentLine.length > 0) {
    this._commitLine(this._currentLine.length);
  }

  // At this point, if there is still insufficient room in the hard margin, we
  // can no longer do anything to encode this word. Bail.
  return this._currentLine.length + length <= this._hardMargin;
};

/**
 * Adds a block of text to the current header, inserting a break if necessary.
 * If mayBreakAfter is true and text does not end in whitespace, a single space
 * character may be added to the output. If the text could not be added without
 * violating line length restrictions, an error is thrown instead.
 *
 * @protected
 * @param {String}  text          The text to add to the output.
 * @param {Boolean} mayBreakAfter If true, the end of this text is a preferred
 *                                breakpoint.
 */
HeaderEmitter.prototype.addText = function (text, mayBreakAfter) {
  // Try to reserve space for the tokens. If we can't, give up.
  if (!this._reserveTokenSpace(text.length))
    throw new Error("Cannot encode " + text + " due to length.");

  this._currentLine += text;
  if (mayBreakAfter) {
    // Make sure that there is an extra space if text could break afterwards.
    this._preferredBreakpoint = this._currentLine.length;
    if (text[text.length - 1] != ' ') {
      this._currentLine += ' ';
    }
  }
};

/**
 * Adds a block of text that may need quoting if it contains some character in
 * qchars. If it is already quoted, no quoting will be applied. If the text
 * cannot be added without violating maximum line length, an error is thrown
 * instead.
 *
 * @protected
 * @param {String}  text          The text to add to the output.
 * @param {String}  qchars        The set of characters that cannot appear
 *                                outside of a quoted string.
 * @param {Boolean} mayBreakAfter If true, the end of this text is a preferred
 *                                breakpoint.
 */
HeaderEmitter.prototype.addQuotable = function (text, qchars, mayBreakAfter) {
  // No text -> no need to be quoted (prevents strict warning errors).
  if (text.length == 0)
    return;

  // Figure out if we need to quote the string. Don't quote a string which
  // already appears to be quoted.
  let needsQuote = false;

  if (!(text[0] == '"' && text[text.length - 1] == '"') && qchars != '') {
    for (let i = 0; i < text.length; i++) {
      if (qchars.includes(text[i])) {
        needsQuote = true;
        break;
      }
    }
  }

  if (needsQuote)
    text = '"' + text.replace(/["\\]/g, "\\$&") + '"';
  this.addText(text, mayBreakAfter);
};

/**
 * Adds a block of text that corresponds to the phrase production in RFC 5322.
 * Such text is a sequence of atoms, quoted-strings, or RFC-2047 encoded-words.
 * This method will preprocess input to normalize all space sequences to a
 * single space. If the text cannot be added without violating maximum line
 * length, an error is thrown instead.
 *
 * @protected
 * @param {String}  text          The text to add to the output.
 * @param {String}  qchars        The set of characters that cannot appear
 *                                outside of a quoted string.
 * @param {Boolean} mayBreakAfter If true, the end of this text is a preferred
 *                                breakpoint.
 */
HeaderEmitter.prototype.addPhrase = function (text, qchars, mayBreakAfter) {
  // Collapse all whitespace spans into a single whitespace node.
  text = text.replace(/[ \t\r\n]+/g, " ");

  // If we have non-ASCII text, encode it using RFC 2047.
  if (this._useASCII && nonAsciiRe.test(text)) {
    this.encodeRFC2047Phrase(text, mayBreakAfter);
    return;
  }

  // If quoting the entire string at once could fit in the line length, then do
  // so. The check here is very loose, but this will inform is if we are going
  // to definitely overrun the soft margin.
  if ((this._currentLine.length + text.length) < this._softMargin) {
    try {
      this.addQuotable(text, qchars, mayBreakAfter);
      // If we don't have a breakpoint, and the text is encoded as a sequence of
      // atoms (and not a quoted-string), then make the last space we added a
      // breakpoint, regardless of the mayBreakAfter setting.
      if (this._preferredBreakpoint == 0 && text.includes(" ")) {
        if (this._currentLine[this._currentLine.length - 1] != '"')
          this._preferredBreakpoint = this._currentLine.lastIndexOf(" ");
      }
      return;
    } catch (e) {
      // If we get an error at this point, we failed to add the quoted string
      // because the string was too long. Fall through to the case where we know
      // that the input was too long to begin with.
    }
  }

  // If the text is too long, split the quotable string at space boundaries and
  // add each word invidually. If we still can't add all those words, there is
  // nothing that we can do.
  let words = text.split(' ');
  for (let i = 0; i < words.length; i++) {
    this.addQuotable(words[i], qchars,
      i == words.length - 1 ? mayBreakAfter : true);
  }
};

/// A regular expression for characters that need to be encoded.
var nonAsciiRe = /[^\x20-\x7e]/;

/// The beginnings of RFC 2047 encoded-word
var b64Prelude = "=?UTF-8?B?", qpPrelude = "=?UTF-8?Q?";

/// A list of ASCII characters forbidden in RFC 2047 encoded-words
var qpForbidden = "=?_()\",";

var hexString = "0123456789abcdef";

/**
 * Add a block of text as a single RFC 2047 encoded word. This does not try to
 * split words if they are too long.
 *
 * @private
 * @param {Uint8Array} encodedText   The octets to encode.
 * @param {Boolean}    useQP         If true, use quoted-printable; if false,
 *                                   use base64.
 * @param {Boolean}    mayBreakAfter If true, the end of this text is a
 *                                   preferred breakpoint.
 */
HeaderEmitter.prototype._addRFC2047Word = function (encodedText, useQP,
    mayBreakAfter) {
  let binaryString = mimeutils.typedArrayToString(encodedText);
  if (useQP) {
    var token = qpPrelude;
    for (let i = 0; i < encodedText.length; i++) {
      if (encodedText[i] < 0x20 || encodedText[i] >= 0x7F ||
          qpForbidden.includes(binaryString[i])) {
        let ch = encodedText[i];
        token += "=" + hexString[(ch & 0xf0) >> 4] + hexString[ch & 0x0f];
      } else if (binaryString[i] == " ") {
        token += "_";
      } else {
        token += binaryString[i];
      }
    }
    token += "?=";
  } else {
    var token = b64Prelude + btoa(binaryString) + "?=";
  }
  this.addText(token, mayBreakAfter);
};

/**
 * Add a block of text as potentially several RFC 2047 encoded-word tokens.
 *
 * @protected
 * @param {String}  text          The text to add to the output.
 * @param {Boolean} mayBreakAfter If true, the end of this text is a preferred
 *                                breakpoint.
 */
HeaderEmitter.prototype.encodeRFC2047Phrase = function (text, mayBreakAfter) {
  // Start by encoding the text into UTF-8 directly.
  let encodedText = new TextEncoder("UTF-8").encode(text);

  // Make sure there's enough room for a single token.
  let minLineLen = b64Prelude.length + 10; // Eight base64 characters plus ?=
  if (!this._reserveTokenSpace(minLineLen)) {
    this._commitLine(this._currentLine.length);
  }

  // Try to encode as much UTF-8 text as possible in each go.
  let b64Len = 0, qpLen = 0, start = 0;
  let maxChars = (this._softMargin - this._currentLine.length) -
    (b64Prelude.length + 2);
  for (let i = 0; i < encodedText.length; i++) {
    let b64Inc = 0, qpInc = 0;
    // The length we need for base64 is ceil(length / 3) * 4...
    if ((i - start) % 3 == 0)
      b64Inc += 4;

    // The length for quoted-printable is 3 chars only if encoded
    if (encodedText[i] < 0x20 || encodedText[i] >= 0x7f ||
        qpForbidden.includes(String.fromCharCode(encodedText[i]))) {
      qpInc = 3;
    } else {
      qpInc = 1;
    }

    if (b64Len + b64Inc > maxChars && qpLen + qpInc > maxChars) {
      // Oops, we have too many characters! We need to encode everything through
      // the current character. However, we can't split in the middle of a
      // multibyte character. In UTF-8, characters that start with 10xx xxxx are
      // the middle of multibyte characters, so backtrack until the start
      // character is legal.
      while ((encodedText[i] & 0xC0) == 0x80)
        --i;

      // Add this part of the word and then make a continuation.
      this._addRFC2047Word(encodedText.subarray(start, i), b64Len >= qpLen,
        true);

      // Reset the array for parsing.
      start = i;
      --i; // Reparse this character as well
      b64Len = qpLen = 0;
      maxChars = this._softMargin - b64Prelude.length - 3;
    } else {
      // Add the counts for the current variable to the count to encode.
      b64Len += b64Inc;
      qpLen += qpInc;
    }
  }

  // Add the entire array at this point.
  this._addRFC2047Word(encodedText.subarray(start), b64Len >= qpLen,
    mayBreakAfter);
};

////////////////////////
// High-level methods //
////////////////////////

/**
 * Add the header name, with the colon and trailing space, to the output.
 *
 * @public
 * @param {String} name The name of the header.
 */
HeaderEmitter.prototype.addHeaderName = function (name) {
  this._currentLine = this._currentLine.trimRight();
  if (this._currentLine.length > 0) {
    this._commitLine();
  }
  this.addText(name + ": ", false);
};

/**
 * Add a header and its structured value to the output.
 *
 * The name can be any case-insensitive variant of a known structured header;
 * the output will include the preferred name of the structure instead of the
 * case put into the name. If no structured encoder can be found, and the input
 * value is a string, then the header is assumed to be unstructured and the
 * value is added as if {@link addUnstructured} were called.
 *
 * @public
 * @param {String} name  The name of the header.
 * @param          value The structured value of the header.
 */
HeaderEmitter.prototype.addStructuredHeader = function (name, value) {
  let lowerName = name.toLowerCase();
  if (encoders.has(lowerName)) {
    this.addHeaderName(preferredSpellings.get(lowerName));
    encoders.get(lowerName).call(this, value);
  } else if (typeof value === "string") {
    // Assume it's an unstructured header.
    // All-lower-case-names are ugly, so capitalize first letters.
    name = name.replace(/(^|-)[a-z]/g, function(match) {
      return match.toUpperCase();
    });
    this.addHeaderName(name);
    this.addUnstructured(value);
  } else {
    throw new Error("Unknown header " + name);
  }
};

/**
 * Add a single address to the header. The address is an object consisting of a
 * possibly-empty display name and an email address.
 *
 * @public
 * @param Address addr The address to be added.
 * @param {String} addr.name  The (possibly-empty) name of the address to add.
 * @param {String} addr.email The email of the address to add.
 * @see headerparser.parseAddressingHeader
 */
HeaderEmitter.prototype.addAddress = function (addr) {
  // If we have a display name, add that first.
  if (addr.name) {
    // This is a simple estimate that keeps names on one line if possible.
    this._reserveTokenSpace(addr.name.length + addr.email.length + 3);
    this.addPhrase(addr.name, ",()<>:;.\"", true);

    // If we don't have an email address, don't write out the angle brackets for
    // the address. It's already an abnormal situation should this appear, and
    // this has better round-tripping properties.
    if (!addr.email)
      return;

    this.addText("<", false);
  }

  // Find the local-part and domain of the address, since the local-part may
  // need to be quoted separately. Note that the @ goes to the domain, so that
  // the local-part may be quoted if it needs to be.
  let at = addr.email.lastIndexOf("@");
  let localpart = "", domain = ""
  if (at == -1)
    localpart = addr.email;
  else {
    localpart = addr.email.slice(0, at);
    domain = addr.email.slice(at);
  }

  this.addQuotable(localpart, "()<>[]:;@\\,\" !", false);
  this.addText(domain + (addr.name ? ">" : ""), false);
};

/**
 * Add an array of addresses and groups to the output. Such an array may be
 * found as the output of {@link headerparser.parseAddressingHeader}. Each
 * element is either an address (an object with properties name and email), or a
 * group (an object with properties name and group).
 *
 * @public
 * @param {(Address|Group)[]} addrs A collection of addresses to add.
 * @param {String}    addrs[i].name    The (possibly-empty) name of the
 *                                     address or the group to add.
 * @param {String}    [addrs[i].email] The email of the address to add.
 * @param {Address[]} [addrs[i].group] A list of email addresses in the group.
 * @see HeaderEmitter.addAddress
 * @see headerparser.parseAddressingHeader
 */
HeaderEmitter.prototype.addAddresses = function (addresses) {
  let needsComma = false;
  for (let addr of addresses) {
    // Add a comma if this is not the first element.
    if (needsComma)
      this.addText(", ", true);
    needsComma = true;

    if ("email" in addr) {
      this.addAddress(addr);
    } else {
      // A group has format name: member, member;
      // Note that we still add a comma after the group is completed.
      this.addPhrase(addr.name, ",()<>:;.\"", false);
      this.addText(":", true);

      this.addAddresses(addr.group);
      this.addText(";", true);
    }
  }
};

/**
 * Add an unstructured header value to the output. This effectively means only
 * inserting line breaks were necessary, and using RFC 2047 encoding where
 * necessary.
 *
 * @public
 * @param {String} text The text to add to the output.
 */
HeaderEmitter.prototype.addUnstructured = function (text) {
  if (text.length == 0)
    return;

  // Unstructured text is basically a phrase that can't be quoted. So, if we
  // have nothing in qchars, nothing should be quoted.
  this.addPhrase(text, "", false);
};

/** RFC 822 labels for days of the week. */
var kDaysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Formatting helper to output numbers between 0-9 as 00-09 instead.
 */
function padTo2Digits(num) {
  return num < 10 ? "0" + num : num.toString();
}

/**
 * Add a date/time field to the output, using the JS date object as the time
 * representation. The value will be output using the timezone offset of the
 * date object, which is usually the timezone of the user (modulo timezone and
 * DST changes).
 *
 * Note that if the date is an invalid date (its internal date parameter is a
 * NaN value), this method throws an error instead of generating an invalid
 * string.
 *
 * @public
 * @param {Date} date The date to be added to the output string.
 */
HeaderEmitter.prototype.addDate = function (date) {
  // Rather than make a header plastered with NaN values, throw an error on
  // specific invalid dates.
  if (isNaN(date.getTime()))
    throw new Error("Cannot encode an invalid date");

  // RFC 5322 says years can't be before 1900. The after 9999 is a bit that
  // derives from the specification saying that years have 4 digits.
  if (date.getFullYear() < 1900 || date.getFullYear() > 9999)
    throw new Error("Date year is out of encodable range");

  // Start by computing the timezone offset for a day. We lack a good format, so
  // the the 0-padding is done by hand. Note that the tzoffset we output is in
  // the form ±hhmm, so we need to separate the offset (in minutes) into an hour
  // and minute pair.
  let tzOffset = date.getTimezoneOffset();
  let tzOffHours = Math.abs(Math.trunc(tzOffset / 60));
  let tzOffMinutes = Math.abs(tzOffset) % 60;
  let tzOffsetStr = (tzOffset > 0 ? "-" : "+") +
    padTo2Digits(tzOffHours) + padTo2Digits(tzOffMinutes);

  // Convert the day-time figure into a single value to avoid unwanted line
  // breaks in the middle.
  let dayTime = [
    kDaysOfWeek[date.getDay()] + ",",
    date.getDate(),
    mimeutils.kMonthNames[date.getMonth()],
    date.getFullYear(),
    padTo2Digits(date.getHours()) + ":" +
      padTo2Digits(date.getMinutes()) + ":" +
      padTo2Digits(date.getSeconds()),
    tzOffsetStr
  ].join(" ");
  this.addText(dayTime, false);
};

/**
 * Signal that the current header has been finished encoding.
 *
 * @public
 * @param {Boolean} deliverEOF If true, signal to the handler that no more text
 *                             will be arriving.
 */
HeaderEmitter.prototype.finish = function (deliverEOF) {
  this._commitLine();
  if (deliverEOF)
    this._handler.deliverEOF();
};

/**
 * Make a streaming header emitter that outputs on the given handler.
 *
 * @param {StreamHandler} handler The handler to consume output
 * @param                 options Options to pass into the HeaderEmitter
 *                                constructor.
 * @returns {HeaderEmitter} A header emitter constructed with the given options.
 */
function makeStreamingEmitter(handler, options) {
  return new HeaderEmitter(handler, options);
}

function StringHandler() {
  this.value = "";
  this.deliverData = function (str) { this.value += str; };
  this.deliverEOF = function () { };
}

/**
 * Given a header name and its structured value, output a string containing its
 * MIME-encoded value. The trailing CRLF for the header is included.
 *
 * @param {String} name    The name of the structured header.
 * @param          value   The value of the structured header.
 * @param          options Options for the HeaderEmitter constructor.
 * @returns {String} A MIME-encoded representation of the structured header.
 * @see HeaderEmitter.addStructuredHeader
 */
function emitStructuredHeader(name, value, options) {
  let handler = new StringHandler();
  let emitter = new HeaderEmitter(handler, options);
  emitter.addStructuredHeader(name, value);
  emitter.finish(true);
  return handler.value;
}

/**
 * Given a map of header names and their structured values, output a string
 * containing all of their headers and their MIME-encoded values.
 *
 * This method is designed to be able to emit header values given the headerData
 * values produced by MIME parsing. Thus, the values of the map are arrays
 * corresponding to header multiplicity.
 *
 * @param {Map(String->Object[])} headerValues A map of header names to arrays
 *                                             of their structured values.
 * @param                         options      Options for the HeaderEmitter
 *                                             constructor.
 * @returns {String} A MIME-encoded representation of the structured header.
 * @see HeaderEmitter.addStructuredHeader
 */
function emitStructuredHeaders(headerValues, options) {
  let handler = new StringHandler();
  let emitter = new HeaderEmitter(handler, options);
  for (let instance of headerValues) {
    instance[1].forEach(function (e) {
      emitter.addStructuredHeader(instance[0], e)
    });
  }
  emitter.finish(true);
  return handler.value;
}

/**
 * Add a custom structured MIME encoder to the set of known encoders. These
 * encoders are used for {@link emitStructuredHeader} and similar functions to
 * encode richer, more structured values instead of relying on string
 * representations everywhere.
 *
 * Structured encoders are functions which take in a single parameter
 * representing their structured value. The this parameter is set to be an
 * instance of {@link HeaderEmitter}, and it is intended that the several public
 * or protected methods on that class are useful for encoding values.
 *
 * There is a large set of structured encoders built-in to the jsmime library
 * already.
 *
 * @param {String}          header  The header name (in its preferred case) for
 *                                  which the encoder will be used.
 * @param {Function(Value)} encoder The structured encoder function.
 */
function addStructuredEncoder(header, encoder) {
  let lowerName = header.toLowerCase();
  encoders.set(lowerName, encoder);
  if (!preferredSpellings.has(lowerName))
    preferredSpellings.set(lowerName, header);
}

return Object.freeze({
  addStructuredEncoder: addStructuredEncoder,
  emitStructuredHeader: emitStructuredHeader,
  emitStructuredHeaders: emitStructuredHeaders,
  makeStreamingEmitter: makeStreamingEmitter
});

});

def('jsmime', function(require) {
  return {
    MimeParser: require('./mimeparser'),
    headerparser: require('./headerparser'),
    headeremitter: require('./headeremitter')
  }
});
  return mods['jsmime'];
}));
