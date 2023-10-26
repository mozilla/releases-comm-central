/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["QueryStringToExpression"];

/**
 * A module to parse a query string to a nsIAbBooleanExpression. A valid query
 * string is in this form:
 *
 * (OP1(FIELD1,COND1,VALUE1)..(FIELDn,CONDn,VALUEn)(BOOL2(FIELD1,COND1,VALUE1)..)..)
 *
 * OPn     A boolean operator joining subsequent terms delimited by ().
 *
 *         @see {nsIAbBooleanOperationTypes}.
 * FIELDn  An addressbook card data field.
 * CONDn   A condition to compare FIELDn with VALUEn.
 *         @see {nsIAbBooleanConditionTypes}.
 * VALUEn  The value to be matched in the FIELDn via the CONDn.
 *         The value must be URL encoded by the caller, if it contains any
 *         special characters including '(' and ')'.
 */
var QueryStringToExpression = {
  /**
   * Convert a query string to a nsIAbBooleanExpression.
   *
   * @param {string} qs - The query string to convert.
   * @returns {nsIAbBooleanExpression}
   */
  convert(qs) {
    const tokens = this.parse(qs);

    // An array of nsIAbBooleanExpression, the first element is the root exp,
    // the last element is the current operating exp.
    const stack = [];
    for (const { type, depth, value } of tokens) {
      while (depth < stack.length) {
        // We are done with the current exp, go one level up.
        stack.pop();
      }
      if (type == "op") {
        if (depth == stack.length) {
          // We are done with the current exp, go one level up.
          stack.pop();
        }
        // Found a new exp, go one level down.
        const parent = stack.slice(-1)[0];
        const exp = this.createBooleanExpression(value);
        stack.push(exp);
        if (parent) {
          parent.expressions = [...parent.expressions, exp];
        }
      } else if (type == "field") {
        // Add a new nsIAbBooleanConditionString to the current exp.
        const condition = this.createBooleanConditionString(...value);
        const exp = stack.slice(-1)[0];
        exp.expressions = [...exp.expressions, condition];
      }
    }

    return stack[0];
  },

  /**
   * Parse a query string to an array of tokens.
   *
   * @param {string} qs - The query string to parse.
   * @param {number} depth - The depth of a token.
   * @param {object[]} tokens - The tokens to return.
   * @param {"op"|"field"} tokens[].type - The token type.
   * @param {number} tokens[].depth - The token depth.
   * @param {string|string[]} tokens[].value - The token value.
   */
  parse(qs, depth = 0, tokens = []) {
    if (qs[0] == "?") {
      qs = qs.slice(1);
    }
    while (qs[0] == ")" && depth > 0) {
      depth--;
      qs = qs.slice(1);
    }
    if (qs.length == 0) {
      // End of input.
      return tokens;
    }
    if (qs[0] != "(") {
      throw Components.Exception(
        `Invalid query string: ${qs}`,
        Cr.NS_ERROR_ILLEGAL_VALUE
      );
    }
    qs = qs.slice(1);
    const nextOpen = qs.indexOf("(");
    const nextClose = qs.indexOf(")");

    if (nextOpen != -1 && nextOpen < nextClose) {
      // Case: "OP("
      depth++;
      tokens.push({
        type: "op",
        depth,
        value: qs.slice(0, nextOpen),
      });
      this.parse(qs.slice(nextOpen), depth, tokens);
    } else if (nextClose != -1) {
      // Case: "FIELD, COND, VALUE)"
      tokens.push({
        type: "field",
        depth,
        value: qs.slice(0, nextClose).split(","),
      });
      this.parse(qs.slice(nextClose + 1), depth, tokens);
    }
    return tokens;
  },

  /**
   * Create a nsIAbBooleanExpression from a string.
   *
   * @param {string} operation - The operation string.
   * @returns {nsIAbBooleanExpression}
   */
  createBooleanExpression(operation) {
    const op = {
      and: Ci.nsIAbBooleanOperationTypes.AND,
      or: Ci.nsIAbBooleanOperationTypes.OR,
      not: Ci.nsIAbBooleanOperationTypes.NOT,
    }[operation];
    if (op == undefined) {
      throw Components.Exception(
        `Invalid operation: ${operation}`,
        Cr.NS_ERROR_ILLEGAL_VALUE
      );
    }
    const exp = Cc["@mozilla.org/boolean-expression/n-peer;1"].createInstance(
      Ci.nsIAbBooleanExpression
    );
    exp.operation = op;
    return exp;
  },

  /**
   * Create a nsIAbBooleanConditionString.
   *
   * @param {string} name - The field name.
   * @param {nsIAbBooleanConditionTypes} condition - The condition.
   * @param {string} value - The value string.
   * @returns {nsIAbBooleanConditionString}
   */
  createBooleanConditionString(name, condition, value) {
    value = decodeURIComponent(value);
    const cond = {
      "=": Ci.nsIAbBooleanConditionTypes.Is,
      "!=": Ci.nsIAbBooleanConditionTypes.IsNot,
      lt: Ci.nsIAbBooleanConditionTypes.LessThan,
      gt: Ci.nsIAbBooleanConditionTypes.GreaterThan,
      bw: Ci.nsIAbBooleanConditionTypes.BeginsWith,
      ew: Ci.nsIAbBooleanConditionTypes.EndsWith,
      c: Ci.nsIAbBooleanConditionTypes.Contains,
      "!c": Ci.nsIAbBooleanConditionTypes.DoesNotContain,
      "~=": Ci.nsIAbBooleanConditionTypes.SoundsLike,
      regex: Ci.nsIAbBooleanConditionTypes.RegExp,
      ex: Ci.nsIAbBooleanConditionTypes.Exists,
      "!ex": Ci.nsIAbBooleanConditionTypes.DoesNotExist,
    }[condition];
    if (name == "" || condition == "" || value == "" || cond == undefined) {
      throw Components.Exception(
        `Failed to create condition string from name=${name}, condition=${condition}, value=${value}, cond=${cond}`,
        Cr.NS_ERROR_ILLEGAL_VALUE
      );
    }
    const cs = Cc[
      "@mozilla.org/boolean-expression/condition-string;1"
    ].createInstance(Ci.nsIAbBooleanConditionString);
    cs.condition = cond;

    try {
      cs.name = Services.textToSubURI.unEscapeAndConvert("UTF-8", name);
      cs.value = Services.textToSubURI.unEscapeAndConvert("UTF-8", value);
    } catch (e) {
      cs.name = name;
      cs.value = value;
    }
    return cs;
  },
};
