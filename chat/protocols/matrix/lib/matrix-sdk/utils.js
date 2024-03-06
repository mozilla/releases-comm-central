"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MapWithDefault = exports.DEFAULT_ALPHABET = void 0;
exports.alphabetPad = alphabetPad;
exports.averageBetweenStrings = averageBetweenStrings;
exports.baseToString = baseToString;
exports.checkObjectHasKeys = checkObjectHasKeys;
exports.chunkPromises = chunkPromises;
exports.compare = compare;
exports.decodeParams = decodeParams;
exports.deepCompare = deepCompare;
exports.deepCopy = deepCopy;
exports.deepSortedObjectEntries = deepSortedObjectEntries;
exports.defer = defer;
exports.encodeParams = encodeParams;
exports.encodeUri = encodeUri;
exports.ensureNoTrailingSlash = ensureNoTrailingSlash;
exports.escapeRegExp = escapeRegExp;
exports.globToRegexp = globToRegexp;
exports.immediate = immediate;
exports.internaliseString = internaliseString;
exports.isFunction = isFunction;
exports.isNullOrUndefined = isNullOrUndefined;
exports.isNumber = isNumber;
exports.isSupportedReceiptType = isSupportedReceiptType;
exports.lexicographicCompare = lexicographicCompare;
exports.logDuration = logDuration;
exports.mapsEqual = mapsEqual;
exports.nextString = nextString;
exports.noUnsafeEventProps = noUnsafeEventProps;
exports.normalize = normalize;
exports.prevString = prevString;
exports.promiseMapSeries = promiseMapSeries;
exports.promiseTry = promiseTry;
exports.recursiveMapToObject = recursiveMapToObject;
exports.recursivelyAssign = recursivelyAssign;
exports.removeDirectionOverrideChars = removeDirectionOverrideChars;
exports.removeElement = removeElement;
exports.removeHiddenChars = removeHiddenChars;
exports.replaceParam = replaceParam;
exports.safeSet = safeSet;
exports.simpleRetryOperation = simpleRetryOperation;
exports.sleep = sleep;
exports.sortEventsByLatestContentTimestamp = sortEventsByLatestContentTimestamp;
exports.stringToBase = stringToBase;
exports.unsafeProp = unsafeProp;
var _unhomoglyph = _interopRequireDefault(require("unhomoglyph"));
var _pRetry = _interopRequireDefault(require("p-retry"));
var _location = require("./@types/location");
var _read_receipts = require("./@types/read_receipts");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : String(i); }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
Copyright 2015, 2016, 2019, 2023 The Matrix.org Foundation C.I.C.

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
 * This is an internal module.
 */
const interns = new Map();

/**
 * Internalises a string, reusing a known pointer or storing the pointer
 * if needed for future strings.
 * @param str - The string to internalise.
 * @returns The internalised string.
 */
function internaliseString(str) {
  // Unwrap strings before entering the map, if we somehow got a wrapped
  // string as our input. This should only happen from tests.
  if (str instanceof String) {
    str = str.toString();
  }

  // Check the map to see if we can store the value
  if (!interns.has(str)) {
    interns.set(str, str);
  }

  // Return any cached string reference
  return interns.get(str);
}

/**
 * Encode a dictionary of query parameters.
 * Omits any undefined/null values.
 * @param params - A dict of key/values to encode e.g.
 * `{"foo": "bar", "baz": "taz"}`
 * @returns The encoded string e.g. foo=bar&baz=taz
 */
function encodeParams(params, urlSearchParams) {
  const searchParams = urlSearchParams ?? new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null) {
      if (Array.isArray(val)) {
        val.forEach(v => {
          searchParams.append(key, String(v));
        });
      } else {
        searchParams.append(key, String(val));
      }
    }
  }
  return searchParams;
}
/**
 * Replace a stable parameter with the unstable naming for params
 */
function replaceParam(stable, unstable, dict) {
  const result = _objectSpread(_objectSpread({}, dict), {}, {
    [unstable]: dict[stable]
  });
  delete result[stable];
  return result;
}

/**
 * Decode a query string in `application/x-www-form-urlencoded` format.
 * @param query - A query string to decode e.g.
 * foo=bar&via=server1&server2
 * @returns The decoded object, if any keys occurred multiple times
 * then the value will be an array of strings, else it will be an array.
 * This behaviour matches Node's qs.parse but is built on URLSearchParams
 * for native web compatibility
 */
function decodeParams(query) {
  const o = {};
  const params = new URLSearchParams(query);
  for (const key of params.keys()) {
    const val = params.getAll(key);
    o[key] = val.length === 1 ? val[0] : val;
  }
  return o;
}

/**
 * Encodes a URI according to a set of template variables. Variables will be
 * passed through encodeURIComponent.
 * @param pathTemplate - The path with template variables e.g. '/foo/$bar'.
 * @param variables - The key/value pairs to replace the template
 * variables with. E.g. `{ "$bar": "baz" }`.
 * @returns The result of replacing all template variables e.g. '/foo/baz'.
 */
function encodeUri(pathTemplate, variables) {
  for (const key in variables) {
    if (!variables.hasOwnProperty(key)) {
      continue;
    }
    const value = variables[key];
    if (value === undefined || value === null) {
      continue;
    }
    pathTemplate = pathTemplate.replace(key, encodeURIComponent(value));
  }
  return pathTemplate;
}

/**
 * The removeElement() method removes the first element in the array that
 * satisfies (returns true) the provided testing function.
 * @param array - The array.
 * @param fn - Function to execute on each value in the array, with the
 * function signature `fn(element, index, array)`. Return true to
 * remove this element and break.
 * @param reverse - True to search in reverse order.
 * @returns True if an element was removed.
 */
function removeElement(array, fn, reverse) {
  let i;
  if (reverse) {
    for (i = array.length - 1; i >= 0; i--) {
      if (fn(array[i], i, array)) {
        array.splice(i, 1);
        return true;
      }
    }
  } else {
    for (i = 0; i < array.length; i++) {
      if (fn(array[i], i, array)) {
        array.splice(i, 1);
        return true;
      }
    }
  }
  return false;
}

/**
 * Checks if the given thing is a function.
 * @param value - The thing to check.
 * @returns True if it is a function.
 */
function isFunction(value) {
  return Object.prototype.toString.call(value) === "[object Function]";
}

/**
 * Checks that the given object has the specified keys.
 * @param obj - The object to check.
 * @param keys - The list of keys that 'obj' must have.
 * @throws If the object is missing keys.
 */
// note using 'keys' here would shadow the 'keys' function defined above
function checkObjectHasKeys(obj, keys) {
  for (const key of keys) {
    if (!obj.hasOwnProperty(key)) {
      throw new Error("Missing required key: " + key);
    }
  }
}

/**
 * Deep copy the given object. The object MUST NOT have circular references and
 * MUST NOT have functions.
 * @param obj - The object to deep copy.
 * @returns A copy of the object without any references to the original.
 */
function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Compare two objects for equality. The objects MUST NOT have circular references.
 *
 * @param x - The first object to compare.
 * @param y - The second object to compare.
 *
 * @returns true if the two objects are equal
 */
function deepCompare(x, y) {
  // Inspired by
  // http://stackoverflow.com/questions/1068834/object-comparison-in-javascript#1144249

  // Compare primitives and functions.
  // Also check if both arguments link to the same object.
  if (x === y) {
    return true;
  }
  if (typeof x !== typeof y) {
    return false;
  }

  // special-case NaN (since NaN !== NaN)
  if (typeof x === "number" && isNaN(x) && isNaN(y)) {
    return true;
  }

  // special-case null (since typeof null == 'object', but null.constructor
  // throws)
  if (x === null || y === null) {
    return x === y;
  }

  // everything else is either an unequal primitive, or an object
  if (!(x instanceof Object)) {
    return false;
  }

  // check they are the same type of object
  if (x.constructor !== y.constructor || x.prototype !== y.prototype) {
    return false;
  }

  // special-casing for some special types of object
  if (x instanceof RegExp || x instanceof Date) {
    return x.toString() === y.toString();
  }

  // the object algorithm works for Array, but it's sub-optimal.
  if (Array.isArray(x)) {
    if (x.length !== y.length) {
      return false;
    }
    for (let i = 0; i < x.length; i++) {
      if (!deepCompare(x[i], y[i])) {
        return false;
      }
    }
  } else {
    // check that all of y's direct keys are in x
    for (const p in y) {
      if (y.hasOwnProperty(p) !== x.hasOwnProperty(p)) {
        return false;
      }
    }

    // finally, compare each of x's keys with y
    for (const p in x) {
      if (y.hasOwnProperty(p) !== x.hasOwnProperty(p) || !deepCompare(x[p], y[p])) {
        return false;
      }
    }
  }
  return true;
}

// Dev note: This returns an array of tuples, but jsdoc doesn't like that. https://github.com/jsdoc/jsdoc/issues/1703
/**
 * Creates an array of object properties/values (entries) then
 * sorts the result by key, recursively. The input object must
 * ensure it does not have loops. If the input is not an object
 * then it will be returned as-is.
 * @param obj - The object to get entries of
 * @returns The entries, sorted by key.
 */
function deepSortedObjectEntries(obj) {
  if (typeof obj !== "object") return obj;

  // Apparently these are object types...
  if (obj === null || obj === undefined || Array.isArray(obj)) return obj;
  const pairs = [];
  for (const [k, v] of Object.entries(obj)) {
    pairs.push([k, deepSortedObjectEntries(v)]);
  }

  // lexicographicCompare is faster than localeCompare, so let's use that.
  pairs.sort((a, b) => lexicographicCompare(a[0], b[0]));
  return pairs;
}

/**
 * Returns whether the given value is a finite number without type-coercion
 *
 * @param value - the value to test
 * @returns whether or not value is a finite number without type-coercion
 */
function isNumber(value) {
  return typeof value === "number" && isFinite(value);
}

/**
 * Removes zero width chars, diacritics and whitespace from the string
 * Also applies an unhomoglyph on the string, to prevent similar looking chars
 * @param str - the string to remove hidden characters from
 * @returns a string with the hidden characters removed
 */
function removeHiddenChars(str) {
  if (typeof str === "string") {
    return (0, _unhomoglyph.default)(str.normalize("NFD").replace(removeHiddenCharsRegex, ""));
  }
  return "";
}

/**
 * Removes the direction override characters from a string
 * @returns string with chars removed
 */
function removeDirectionOverrideChars(str) {
  if (typeof str === "string") {
    return str.replace(/[\u202d-\u202e]/g, "");
  }
  return "";
}
function normalize(str) {
  // Note: we have to match the filter with the removeHiddenChars() because the
  // function strips spaces and other characters (M becomes RN for example, in lowercase).
  return removeHiddenChars(str.toLowerCase())
  // Strip all punctuation
  .replace(/[\\'!"#$%&()*+,\-./:;<=>?@[\]^_`{|}~\u2000-\u206f\u2e00-\u2e7f]/g, "")
  // We also doubly convert to lowercase to work around oddities of the library.
  .toLowerCase();
}

// Regex matching bunch of unicode control characters and otherwise misleading/invisible characters.
// Includes:
// various width spaces U+2000 - U+200D
// LTR and RTL marks U+200E and U+200F
// LTR/RTL and other directional formatting marks U+202A - U+202F
// Arabic Letter RTL mark U+061C
// Combining characters U+0300 - U+036F
// Zero width no-break space (BOM) U+FEFF
// Blank/invisible characters (U2800, U2062-U2063)
// eslint-disable-next-line no-misleading-character-class
const removeHiddenCharsRegex = /[\u2000-\u200F\u202A-\u202F\u0300-\u036F\uFEFF\u061C\u2800\u2062-\u2063\s]/g;
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Converts Matrix glob-style string to a regular expression
 * https://spec.matrix.org/v1.7/appendices/#glob-style-matching
 * @param glob - Matrix glob-style string
 * @returns regular expression
 */
function globToRegexp(glob) {
  return escapeRegExp(glob).replace(/\\\*/g, ".*").replace(/\?/g, ".");
}
function ensureNoTrailingSlash(url) {
  if (url?.endsWith("/")) {
    return url.slice(0, -1);
  } else {
    return url;
  }
}

/**
 * Returns a promise which resolves with a given value after the given number of ms
 */
function sleep(ms, value) {
  return new Promise(resolve => {
    setTimeout(resolve, ms, value);
  });
}

/**
 * Utility to log the duration of a promise.
 *
 * @param logger - The logger to log to.
 * @param name - The name of the operation.
 * @param block - The block to execute.
 */
async function logDuration(logger, name, block) {
  const start = Date.now();
  try {
    return await block();
  } finally {
    const end = Date.now();
    logger.debug(`[Perf]: ${name} took ${end - start}ms`);
  }
}

/**
 * Promise/async version of {@link setImmediate}.
 */
function immediate() {
  return new Promise(setImmediate);
}
function isNullOrUndefined(val) {
  return val === null || val === undefined;
}
// Returns a Deferred
function defer() {
  let resolve;
  let reject;
  const promise = new Promise((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  return {
    resolve,
    reject,
    promise
  };
}
async function promiseMapSeries(promises, fn // if async we don't care about the type as we only await resolution
) {
  for (const o of promises) {
    await fn(await o);
  }
}
function promiseTry(fn) {
  return Promise.resolve(fn());
}

// Creates and awaits all promises, running no more than `chunkSize` at the same time
async function chunkPromises(fns, chunkSize) {
  const results = [];
  for (let i = 0; i < fns.length; i += chunkSize) {
    results.push(...(await Promise.all(fns.slice(i, i + chunkSize).map(fn => fn()))));
  }
  return results;
}

/**
 * Retries the function until it succeeds or is interrupted. The given function must return
 * a promise which throws/rejects on error, otherwise the retry will assume the request
 * succeeded. The promise chain returned will contain the successful promise. The given function
 * should always return a new promise.
 * @param promiseFn - The function to call to get a fresh promise instance. Takes an
 * attempt count as an argument, for logging/debugging purposes.
 * @returns The promise for the retried operation.
 */
function simpleRetryOperation(promiseFn) {
  return (0, _pRetry.default)(attempt => {
    return promiseFn(attempt);
  }, {
    forever: true,
    factor: 2,
    minTimeout: 3000,
    // ms
    maxTimeout: 15000 // ms
  });
}

// String averaging inspired by https://stackoverflow.com/a/2510816
// Dev note: We make the alphabet a string because it's easier to write syntactically
// than arrays. Thankfully, strings implement the useful parts of the Array interface
// anyhow.

/**
 * The default alphabet used by string averaging in this SDK. This matches
 * all usefully printable ASCII characters (0x20-0x7E, inclusive).
 */
const DEFAULT_ALPHABET = exports.DEFAULT_ALPHABET = (() => {
  let str = "";
  for (let c = 0x20; c <= 0x7e; c++) {
    str += String.fromCharCode(c);
  }
  return str;
})();

/**
 * Pads a string using the given alphabet as a base. The returned string will be
 * padded at the end with the first character in the alphabet.
 *
 * This is intended for use with string averaging.
 * @param s - The string to pad.
 * @param n - The length to pad to.
 * @param alphabet - The alphabet to use as a single string.
 * @returns The padded string.
 */
function alphabetPad(s, n, alphabet = DEFAULT_ALPHABET) {
  return s.padEnd(n, alphabet[0]);
}

/**
 * Converts a baseN number to a string, where N is the alphabet's length.
 *
 * This is intended for use with string averaging.
 * @param n - The baseN number.
 * @param alphabet - The alphabet to use as a single string.
 * @returns The baseN number encoded as a string from the alphabet.
 */
function baseToString(n, alphabet = DEFAULT_ALPHABET) {
  // Developer note: the stringToBase() function offsets the character set by 1 so that repeated
  // characters (ie: "aaaaaa" in a..z) don't come out as zero. We have to reverse this here as
  // otherwise we'll be wrong in our conversion. Undoing a +1 before an exponent isn't very fun
  // though, so we rely on a lengthy amount of `x - 1` and integer division rules to reach a
  // sane state. This also means we have to do rollover detection: see below.

  const len = BigInt(alphabet.length);
  if (n <= len) {
    return alphabet[Number(n) - 1] ?? "";
  }
  let d = n / len;
  let r = Number(n % len) - 1;

  // Rollover detection: if the remainder is negative, it means that the string needs
  // to roll over by 1 character downwards (ie: in a..z, the previous to "aaa" would be
  // "zz").
  if (r < 0) {
    d -= BigInt(Math.abs(r)); // abs() is just to be clear what we're doing. Could also `+= r`.
    r = Number(len) - 1;
  }
  return baseToString(d, alphabet) + alphabet[r];
}

/**
 * Converts a string to a baseN number, where N is the alphabet's length.
 *
 * This is intended for use with string averaging.
 * @param s - The string to convert to a number.
 * @param alphabet - The alphabet to use as a single string.
 * @returns The baseN number.
 */
function stringToBase(s, alphabet = DEFAULT_ALPHABET) {
  const len = BigInt(alphabet.length);

  // In our conversion to baseN we do a couple performance optimizations to avoid using
  // excess CPU and such. To create baseN numbers, the input string needs to be reversed
  // so the exponents stack up appropriately, as the last character in the unreversed
  // string has less impact than the first character (in "abc" the A is a lot more important
  // for lexicographic sorts). We also do a trick with the character codes to optimize the
  // alphabet lookup, avoiding an index scan of `alphabet.indexOf(reversedStr[i])` - we know
  // that the alphabet and (theoretically) the input string are constrained on character sets
  // and thus can do simple subtraction to end up with the same result.

  // Developer caution: we carefully cast to BigInt here to avoid losing precision. We cannot
  // rely on Math.pow() (for example) to be capable of handling our insane numbers.

  let result = BigInt(0);
  for (let i = s.length - 1, j = BigInt(0); i >= 0; i--, j++) {
    const charIndex = s.charCodeAt(i) - alphabet.charCodeAt(0);

    // We add 1 to the char index to offset the whole numbering scheme. We unpack this in
    // the baseToString() function.
    result += BigInt(1 + charIndex) * len ** j;
  }
  return result;
}

/**
 * Averages two strings, returning the midpoint between them. This is accomplished by
 * converting both to baseN numbers (where N is the alphabet's length) then averaging
 * those before re-encoding as a string.
 * @param a - The first string.
 * @param b - The second string.
 * @param alphabet - The alphabet to use as a single string.
 * @returns The midpoint between the strings, as a string.
 */
function averageBetweenStrings(a, b, alphabet = DEFAULT_ALPHABET) {
  const padN = Math.max(a.length, b.length);
  const baseA = stringToBase(alphabetPad(a, padN, alphabet), alphabet);
  const baseB = stringToBase(alphabetPad(b, padN, alphabet), alphabet);
  const avg = (baseA + baseB) / BigInt(2);

  // Detect integer division conflicts. This happens when two numbers are divided too close so
  // we lose a .5 precision. We need to add a padding character in these cases.
  if (avg === baseA || avg == baseB) {
    return baseToString(avg, alphabet) + alphabet[0];
  }
  return baseToString(avg, alphabet);
}

/**
 * Finds the next string using the alphabet provided. This is done by converting the
 * string to a baseN number, where N is the alphabet's length, then adding 1 before
 * converting back to a string.
 * @param s - The string to start at.
 * @param alphabet - The alphabet to use as a single string.
 * @returns The string which follows the input string.
 */
function nextString(s, alphabet = DEFAULT_ALPHABET) {
  return baseToString(stringToBase(s, alphabet) + BigInt(1), alphabet);
}

/**
 * Finds the previous string using the alphabet provided. This is done by converting the
 * string to a baseN number, where N is the alphabet's length, then subtracting 1 before
 * converting back to a string.
 * @param s - The string to start at.
 * @param alphabet - The alphabet to use as a single string.
 * @returns The string which precedes the input string.
 */
function prevString(s, alphabet = DEFAULT_ALPHABET) {
  return baseToString(stringToBase(s, alphabet) - BigInt(1), alphabet);
}

/**
 * Compares strings lexicographically as a sort-safe function.
 * @param a - The first (reference) string.
 * @param b - The second (compare) string.
 * @returns Negative if the reference string is before the compare string;
 * positive if the reference string is after; and zero if equal.
 */
function lexicographicCompare(a, b) {
  // Dev note: this exists because I'm sad that you can use math operators on strings, so I've
  // hidden the operation in this function.
  if (a < b) {
    return -1;
  } else if (a > b) {
    return 1;
  } else {
    return 0;
  }
}
const collator = new Intl.Collator();
/**
 * Performant language-sensitive string comparison
 * @param a - the first string to compare
 * @param b - the second string to compare
 */
function compare(a, b) {
  return collator.compare(a, b);
}

/**
 * This function is similar to Object.assign() but it assigns recursively and
 * allows you to ignore nullish values from the source
 *
 * @returns the target object
 */
function recursivelyAssign(target, source, ignoreNullish = false) {
  for (const [sourceKey, sourceValue] of Object.entries(source)) {
    if (target[sourceKey] instanceof Object && sourceValue) {
      recursivelyAssign(target[sourceKey], sourceValue);
      continue;
    }
    if (sourceValue !== null && sourceValue !== undefined || !ignoreNullish) {
      safeSet(target, sourceKey, sourceValue);
      continue;
    }
  }
  return target;
}
function getContentTimestampWithFallback(event) {
  return _location.M_TIMESTAMP.findIn(event.getContent()) ?? -1;
}

/**
 * Sort events by their content m.ts property
 * Latest timestamp first
 */
function sortEventsByLatestContentTimestamp(left, right) {
  return getContentTimestampWithFallback(right) - getContentTimestampWithFallback(left);
}
function isSupportedReceiptType(receiptType) {
  return [_read_receipts.ReceiptType.Read, _read_receipts.ReceiptType.ReadPrivate].includes(receiptType);
}

/**
 * Determines whether two maps are equal.
 * @param eq - The equivalence relation to compare values by. Defaults to strict equality.
 */
function mapsEqual(x, y, eq = (v1, v2) => v1 === v2) {
  if (x.size !== y.size) return false;
  for (const [k, v1] of x) {
    const v2 = y.get(k);
    if (v2 === undefined || !eq(v1, v2)) return false;
  }
  return true;
}
function processMapToObjectValue(value) {
  if (value instanceof Map) {
    // Value is a Map. Recursively map it to an object.
    return recursiveMapToObject(value);
  } else if (Array.isArray(value)) {
    // Value is an Array. Recursively map the value (e.g. to cover Array of Arrays).
    return value.map(v => processMapToObjectValue(v));
  } else {
    return value;
  }
}

/**
 * Recursively converts Maps to plain objects.
 * Also supports sub-lists of Maps.
 */
function recursiveMapToObject(map) {
  const targetMap = new Map();
  for (const [key, value] of map) {
    targetMap.set(key, processMapToObjectValue(value));
  }
  return Object.fromEntries(targetMap.entries());
}
function unsafeProp(prop) {
  return prop === "__proto__" || prop === "prototype" || prop === "constructor";
}
function safeSet(obj, prop, value) {
  if (unsafeProp(prop)) {
    throw new Error("Trying to modify prototype or constructor");
  }
  obj[prop] = value;
}
function noUnsafeEventProps(event) {
  return !(unsafeProp(event.room_id) || unsafeProp(event.sender) || unsafeProp(event.user_id) || unsafeProp(event.event_id));
}
class MapWithDefault extends Map {
  constructor(createDefault) {
    super();
    this.createDefault = createDefault;
  }

  /**
   * Returns the value if the key already exists.
   * If not, it creates a new value under that key using the ctor callback and returns it.
   */
  getOrCreate(key) {
    if (!this.has(key)) {
      this.set(key, this.createDefault());
    }
    return this.get(key);
  }
}
exports.MapWithDefault = MapWithDefault;