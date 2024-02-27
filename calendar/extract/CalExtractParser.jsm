/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = [
  "CalExtractToken",
  "CalExtractParseNode",
  "CalExtractParser",
  "extendParseRule",
  "prepareArguments",
];

/**
 * CalExtractOptions holds configuration options used by CalExtractParser.
 *
 * @typedef {object} CalExtractOptions
 * @property {RegExp} sentenceBoundary - A pattern used to split text at the
 *                                       sentence boundary. This should capture
 *                                       the boundary only and not any other
 *                                       part of the sentence. Use lookaheads
 *                                       if needed.
 */

/**
 * @type {CalExtractOptions}
 */
const defaultOptions = {
  sentenceBoundary: /(?<=\w)[.!?]+\s(?=[A-Z0-9])|[.!?]$/,
};

const FLAG_OPTIONAL = 1;
const FLAG_MULTIPLE = 2;
const FLAG_NONEMPTY = 4;

const flagBits = new Map([
  ["?", FLAG_OPTIONAL],
  ["+", FLAG_MULTIPLE | FLAG_NONEMPTY],
  ["*", FLAG_MULTIPLE | FLAG_OPTIONAL],
]);

/**
 * CalExtractToken represents a lexical unit of valid text. These are produced
 * during the tokenisation stage of CalExtractParser by matching regular
 * expressions against a text sequence.
 */
class CalExtractToken {
  /**
   * Identifies the token. Should be in uppercase with no spaces for consistency.
   *
   * @type {string}
   */
  type = "";

  /**
   * The text captured by this token.
   *
   * @type {string[]}
   */
  text = [];

  /**
   * Indicates which sentence in the source text the token was found.
   *
   * @type {number}
   */
  sentence = -1;

  /**
   * Indicates the position with the sentence the token occurs.
   *
   * @type {number}
   */
  position = -1;

  /**
   * @param {string} type
   * @param {string[]} text
   * @param {number} sentence
   * @param {number} position
   */
  constructor(type, text, sentence, position) {
    this.type = type;
    this.text = text;
    this.sentence = sentence;
    this.position = position;
  }
}

/**
 * Function used to produce a value when a CalExtractParseRule is matched.
 *
 * @callback CallExtractParseRuleAction
 * @param {any[]} args - An array containing all the values produced from each
 *                       pattern in the rule when they are matched or the
 *                       CalExtractToken when lexical tokens are used instead.
 */

/**
 * CalExtractParseRule specifies a named pattern that is looked for when parsing
 * the tokenized source text. Patterns are a sequence of one or more CalExtactToken
 * types or CalExtractParseRule names. Each pattern specified can optionally
 * have one (and only one) of the following flags:
 *
 * 1) "?" - Optional flag, indicates a pattern may be skipped if not matched.
 * 2) "*" - Multiple flag, indicates a pattern may match 0 or more times.
 * 3) "+" - Non-empty multiple flag, indicates a pattern may match 1 or more times.
 *
 * Flags must be specified as the last character of the pattern name, example:
 * ["subject", "text?", "MEET", "text*", "time+"]
 *
 * @typedef {object} CalExtractParseRule
 *
 * @property {string} name                      - The name of the rule that can
 *                                                be used in other patterns.
 *                                                Should be lowercase for
 *                                                consistency.
 * @property {string[]} patterns                - The pattern that will be
 *                                                searched for on the tokenized
 *                                                string. Can contain flags.
 *
 * @property {CalExtractParseRuleAction} action - Produces the result of the
 *                                                rule being satisfied.
 */

/**
 * CalExtractExtParseRule is derived from a CalExtractParseRule to include
 * additional information needed during parsing.
 *
 * @typedef {CalExtractParseRule} CalExtractExtParseRule
 *
 * @property {string[]} patterns         - The patterns here are stripped of
 *                                         any flags.
 * @property {number[]} flags            - An array containing the flags
 *                                         specified for each patterns element.
 * @property {CalExtractParseNode} graph - A graph used to determine what parse
 *                                         rule can be applied for an encountered
 *                                         production.
 */

/**
 * CalExtractParseNode is used to represent the patterns of a CalExtractParseRule
 * as a graph. This graph is traversed during stack reduction until one of the
 * following end conditions are met:
 *
 * 1) There are no more descendant nodes.
 * 2) The only descendant node is the node itself (cyclic).
 * 3) All of the descendant nodes are optional, there are no more tokens to
 *    shift and we have traversed the entire stack.
 */
class CalExtractParseNode {
  /**
   * @type {string}
   */
  symbol = null;

  /**
   * @type {number}
   */
  flags = null;

  /**
   * Contains each possible descendant node of this node.
   *
   * @type {CalExtractParseNode[]}
   */
  descendants = null;

  static FLAG_OPTIONAL = FLAG_OPTIONAL;
  static FLAG_MULTIPLE = FLAG_MULTIPLE;
  static FLAG_NONEMPTY = FLAG_NONEMPTY;

  /**
   * @param {string} symbol - The pattern this node represents.
   * @param {number} flags - The computed flags assigned to the pattern.
   * @param {CalExtractParseNode[]} descendants - Descendant nodes of this node.
   */
  constructor(symbol, flags, descendants = []) {
    this.symbol = symbol;
    this.flags = flags;
    this.descendants = descendants;
  }

  /**
   * Indicates this is the last node in its graph. This will always be false
   * for cyclic nodes.
   */
  get isEnd() {
    return !this.descendants.length;
  }

  /**
   * Appends a new descendant to this node.
   *
   * @param {CalExtractParseNode} node - The node to append.
   *
   * @returns {CalExtractParseNode} The appended node.
   */
  append(node) {
    this.descendants.push(node);
    return node;
  }

  /**
   * Provides the descendant CalExtractParseNode of this one given its symbol
   * name. The result depends on the following rules:
   * 1) If this node has a descendant that matches the name, return that node.
   * 2) If the node does not have a matching descendant but has descendants
   *    with the optional flag set, delegate to those nodes. This implements
   *    the "?" and optional aspect of "*".
   * 3) If none of the above produce a node, null is returned which means this
   *    graph cannot be traversed any further.
   *
   * @returns {CalExtractParseNode|null}
   */
  getDescendant(name) {
    // It is important the direct descendants are checked first.
    const node = this.descendants.find(node => node.symbol == name);
    if (node) {
      return node;
    }

    // Now try any optional descendants.
    for (const node of this.descendants) {
      const hit = node.isOptional() && node != this && node.getDescendant(name);
      if (hit) {
        return hit;
      }
    }
    return null;
  }

  /**
   * Indicates this node can terminate the graph if so desired. This is acceptable
   * if all of the descendants of this node are optional and there is nothing
   * more to match on the stack.
   *
   * @returns {boolean}
   */
  canEnd() {
    return this.descendants.filter(desc => desc != this).every(desc => desc.isOptional());
  }

  /**
   * Indicates whether this node has the optional flag set.
   *
   * @returns {boolean}
   */
  isOptional() {
    return Boolean(this.flags & FLAG_OPTIONAL);
  }

  /**
   * Indicates whether this node is cyclic. A cyclic node is one whose only
   * descendants is itself thus creating a loop. This occurs one a multiple
   * flagged node is in the tail position of the graph.
   */
  isCyclic() {
    return !this.isEnd && this.descendants.every(desc => desc == this);
  }
}

/**
 * CalExtractParser provides an API for detecting interesting information within
 * a text sequence that can be used for event detection and creation. It is a
 * naive implementation of a shift-reduce parser, naive in the sense that not
 * too much attention has been paid to optimisation or semantics.
 *
 * This parser works by first splitting the source string into sentences, then
 * tokenizing each using the token rules specified. The boundary for splitting
 * into sentences can be specified in the options object.
 *
 * After tokenisation, the parser uses the parse rules to shift/reduce each
 * sentence into a final result. The first parse rule is treated as the intended
 * rule to reduce the tokens of each sentence to. If all of the tokens have been
 * processed and the result is not the first rule, parsing is considered to have
 * failed and null is returned for that sentence. For this reason, it is a good
 * idea to specify parse rules that are robust but not too specific in their
 * patterns.
 */
class CalExtractParser {
  /**
   * @type {[RegExp,string?][]}
   */
  tokenRules = [];

  /**
   * @type {CalExtractParseRule[]}
   */
  parseRules = [];

  /**
   * @type {CalExtractOptions}
   */
  options = null;

  /**
   * Use the static createInstance() method instead of this constructor directly.
   *
   * @param {[RegExp, string?][]} tokenRules
   * @param {CalExtractExtParseRule[]} parseRules
   * @param {CalExtractOptions} [options] - Configuration object.
   *
   * @private
   */
  constructor(tokenRules, parseRules, options = defaultOptions) {
    this.tokenRules = tokenRules;
    this.parseRules = parseRules;
    this.options = options;
  }

  /**
   * This method creates a new CalExtractParser instance using the simpler
   * CalExtractParseRule interface instead of the extended one. It takes care
   * of creating a graph for each rule and normalizing pattern names that may
   * be using flags.
   *
   * @param {[RegExp, string?][]} tokenRules - A list of rules to apply during
   *  tokenisation. The first element of each rule is a regular expression used
   *  to detect lexical tokens and the second element is the type to assign to
   *  the token. Order matters slightly here, in general, more complex but specific
   *  rules should appear before simpler, more general ones.
   *
   *  When specifying token rules, they should be anchored to the start of the
   *  string via "^" or tokenize() will produce unexpected results. Some regular
   *  expressions should also include a word boundary to prevent matching within
   *  a large string, example: "at" in "attachment". If a string is to be matched,
   *  but no token is desired you can omit the token type from the rule and it
   *  will be omitted completely.
   *
   * @param {CalExtractParseRule[]} parseRules - A list of CalExtractParseRules
   *  that will be extended then used during parsing. Multiple parse rules can
   *  share the same name and will all be considered the same when matching patterns.
   *  Use this to specify variations of the same rule.
   *
   * @param {CalExtractOptions} [options] - Configuration object.
   */
  static createInstance(tokenRules, parseRules, options = defaultOptions) {
    return new CalExtractParser(tokenRules, parseRules.map(extendParseRule), options);
  }

  /**
   * Tokenizes a string to make it easier to match against the parse rule
   * patterns. If text is encountered that cannot be tokenized, the result for
   * that sentence is null.
   *
   * @param {string} str - The string to tokenize.
   *
   * @returns {CalExtractToken[][]} For each sentence encountered, a list of
   *                                CalExtractTokens.
   */
  tokenize(str) {
    const allTokens = [];
    const sentences = str.split(this.options.sentenceBoundary).filter(Boolean);

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      let pos = 0;
      let tokens = [];
      let buffer = "";

      let matched;
      while (pos < sentence.length) {
        buffer = sentence.substr(pos);
        for (const [pattern, type] of this.tokenRules) {
          matched = pattern.exec(buffer);
          if (matched) {
            if (type) {
              tokens.push(new CalExtractToken(type, matched[0], i, pos));
            }
            pos += matched[0].length;
            break;
          }
        }

        if (!matched) {
          // No rules for the encountered text, bail out.
          tokens = null;
          break;
        }
      }
      allTokens.push(tokens);
    }
    return allTokens;
  }

  /**
   * Parses a string into an array of values representing the final result of
   * parsing each sentence encountered. The elements of the resulting array
   * are either the result of applying the action of the first (top) parse rule
   * or null if we could not successfully parse the sentence.
   *
   * @param {string} str
   *
   * @returns {any[]}
   */
  parse(str) {
    return this.tokenize(str).map(tokens => {
      if (!this.parseRules.length || !tokens) {
        return null;
      }

      let lookahead = null;
      const stack = [];
      // @see https://github.com/eslint/eslint/issues/17807
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (tokens.length) {
          const next = tokens.shift();
          stack.push([next.type, next]);
          lookahead = tokens[0] ? tokens[0].type : null;
          while (this.reduceStack(stack, lookahead)) {
            continue;
          }
        } else {
          // Attempt to reduce anything still on the stack now that the
          // tokens have all been pushed.
          while (this.reduceStack(stack, lookahead)) {
            continue;
          }
          break;
        }
      }
      return stack.length == 1 && stack[0][0] == this.parseRules[0].name ? stack[0][1] : null;
    });
  }

  /**
   * Attempts to reduce the given stack exactly once using the internal parsing
   * rules. If successful, the stack will be modified to contain the matched
   * rule at the location it was found. This methods modifies the stack given.
   *
   * @returns {boolean} - True if the stack was reduced false if otherwise.
   */
  reduceStack(stack, lookahead) {
    for (let i = 0; i < stack.length; i++) {
      for (const rule of this.parseRules) {
        let node = rule.graph;
        let n = i;
        let matchCount = 0;
        while (n < stack.length && (node = node.getDescendant(stack[n][0]))) {
          matchCount++;
          if (
            node.isEnd ||
            (n == stack.length - 1 && !lookahead && (node.isCyclic() || node.canEnd()))
          ) {
            const result = [rule.name, null];
            const matched = stack.splice(i, matchCount, result);
            result[1] = rule.action(prepareArguments(rule, matched));
            return true;
          }
          n++;
        }
      }
    }
    return false;
  }
}

/**
 * Converts a CalExtractParseRule to a CalExtractExtParseRule.
 *
 * @param {CalExtractParseRule} rule
 *
 * @returns {CalExtractExtParseRule}
 */
function extendParseRule(rule) {
  const { name, action } = rule;
  const flags = [];
  const patterns = [];
  const start = new CalExtractParseNode(null, null);
  let graph = start;

  for (let pattern of rule.patterns) {
    const patternFlag = pattern[pattern.length - 1];
    let bits = 0;

    // Compute the flag value.
    for (const [flag, value] of flagBits) {
      if (patternFlag == flag) {
        bits = bits | value;
      }
    }

    // Removes the flag from patterns that have them.
    pattern = bits ? pattern.substring(0, pattern.length - 1) : pattern;
    patterns.push(pattern);
    graph = graph.append(new CalExtractParseNode(pattern, bits));

    // Create a loop node if this flag is set.
    if (bits & FLAG_MULTIPLE) {
      graph.append(graph);
    }

    flags.push(bits);
  }

  return {
    name,
    action,
    patterns,
    flags,
    graph: start,
  };
}

/**
 * Normalizes the matched arguments to be passed to an CalExtractParseRuleAction
 * by ensuring the number is the same as the patterns for the action. This takes
 * care of converting multi matches into an array and providing "null" when
 * an optional pattern is unmatched.
 *
 * @param {CalExtractExtRule} rule - The rule the action belongs to.
 * @param {string[]} matched - An sub-array of the stack containing what
 *                                   was actually matched. This array will be
 *                                   modified to match the full rule (inclusive
 *                                   of optional patterns).
 *
 *
 * @returns {Array} Arguments for a CalExtractParseRuleAction.
 */
function prepareArguments(rule, matched) {
  return rule.patterns.map((pattern, index) => {
    if (rule.flags[index] & FLAG_MULTIPLE) {
      let c = index;
      const arrayArg = [];

      while (c < matched.length && matched[c][0] == pattern) {
        arrayArg.push(matched[c][1]);
        c++;
      }
      if (!arrayArg.length) {
        // This rule was not matched, make a blank space for it.
        matched.splice(index, 0, null);
      } else {
        // Move all the matches into a single element so we match the pattern.
        matched.splice(index, arrayArg.length, arrayArg);
      }
      return arrayArg;
    } else if (matched[index] && matched[index][0] == pattern) {
      return matched[index][1];
    }

    // The pattern was unmatched, it should be optional.
    matched.splice(index, 0, null);
    return null;
  });
}
