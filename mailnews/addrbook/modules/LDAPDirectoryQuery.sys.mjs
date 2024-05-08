/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { LDAPListenerBase } from "resource:///modules/LDAPListenerBase.sys.mjs";

/**
 * Convert a nsIAbBooleanExpression to a filter string.
 *
 * @param {nsIAbLDAPAttributeMap} attrMap - A mapping between address book
 *   properties and ldap attributes.
 * @param {nsIAbBooleanExpression} exp - The expression to convert.
 * @returns {string}
 */
function boolExpressionToFilter(attrMap, exp) {
  let filter = "(";
  filter +=
    {
      [Ci.nsIAbBooleanOperationTypes.AND]: "&",
      [Ci.nsIAbBooleanOperationTypes.OR]: "|",
      [Ci.nsIAbBooleanOperationTypes.NOT]: "!",
    }[exp.operation] || "";

  if (exp.expressions) {
    for (const childExp of exp.expressions) {
      if (childExp instanceof Ci.nsIAbBooleanExpression) {
        filter += boolExpressionToFilter(attrMap, childExp);
      } else if (childExp instanceof Ci.nsIAbBooleanConditionString) {
        filter += boolConditionToFilter(attrMap, childExp);
      }
    }
  }

  filter += ")";
  return filter;
}

/**
 * Convert a nsIAbBooleanConditionString to a filter string.
 *
 * @param {nsIAbLDAPAttributeMap} attrMap - A mapping between addressbook
 *   properties and ldap attributes.
 * @param {nsIAbBooleanConditionString} exp - The expression to convert.
 * @returns {string}
 */
function boolConditionToFilter(attrMap, exp) {
  const attr = attrMap.getFirstAttribute(exp.name);
  if (!attr) {
    return "";
  }
  switch (exp.condition) {
    case Ci.nsIAbBooleanConditionTypes.DoesNotExist:
      return `(!(${attr}=*))`;
    case Ci.nsIAbBooleanConditionTypes.Exists:
      return `(${attr}=*)`;
    case Ci.nsIAbBooleanConditionTypes.Contains:
      return `(${attr}=*${exp.value}*)`;
    case Ci.nsIAbBooleanConditionTypes.DoesNotContain:
      return `(!(${attr}=*${exp.value}*))`;
    case Ci.nsIAbBooleanConditionTypes.Is:
      return `(${attr}=${exp.value})`;
    case Ci.nsIAbBooleanConditionTypes.IsNot:
      return `(!(${attr}=${exp.value}))`;
    case Ci.nsIAbBooleanConditionTypes.BeginsWith:
      return `(${attr}=${exp.value}*)`;
    case Ci.nsIAbBooleanConditionTypes.EndsWith:
      return `(${attr}=*${exp.value})`;
    case Ci.nsIAbBooleanConditionTypes.LessThan:
      return `(${attr}<=${exp.value})`;
    case Ci.nsIAbBooleanConditionTypes.GreaterThan:
      return `(${attr}>=${exp.value})`;
    case Ci.nsIAbBooleanConditionTypes.SoundsLike:
      return `(${attr}~=${exp.value})`;
    default:
      return "";
  }
}

/**
 * @implements {nsIAbDirectoryQuery}
 * @implements {nsILDAPMessageListener}
 */
export class LDAPDirectoryQuery extends LDAPListenerBase {
  QueryInterface = ChromeUtils.generateQI([
    "nsIAbDirectoryQuery",
    "nsILDAPMessageListener",
  ]);

  i = 0;

  doQuery(directory, args, listener, limit, timeout) {
    this._directory = directory.QueryInterface(Ci.nsIAbLDAPDirectory);
    this._listener = listener;
    this._attrMap = args.typeSpecificArg;
    this._filter =
      args.filter || boolExpressionToFilter(this._attrMap, args.expression);
    this._limit = limit;
    this._timeout = timeout;

    let urlFilter = this._directory.lDAPURL.filter;
    // If urlFilter is empty or the default "(objectclass=*)", do nothing.
    if (urlFilter && urlFilter != "(objectclass=*)") {
      if (!urlFilter.startsWith("(")) {
        urlFilter = `(${urlFilter})`;
      }
      this._filter = `(&${urlFilter}${this._filter})`;
    }

    this._connection = Cc[
      "@mozilla.org/network/ldap-connection;1"
    ].createInstance(Ci.nsILDAPConnection);
    this._operation = Cc[
      "@mozilla.org/network/ldap-operation;1"
    ].createInstance(Ci.nsILDAPOperation);

    this._connection.init(directory.lDAPURL, directory.authDn, this);
    return this.i++;
  }

  stopQuery() {
    this._operation?.abandonExt();
  }

  /**
   * @see nsILDAPMessageListener
   */
  onLDAPMessage(msg) {
    switch (msg.type) {
      case Ci.nsILDAPMessage.RES_BIND:
        this._onLDAPBind(msg);
        break;
      case Ci.nsILDAPMessage.RES_SEARCH_ENTRY:
        this._onLDAPSearchEntry(msg);
        break;
      case Ci.nsILDAPMessage.RES_SEARCH_RESULT:
        this._onLDAPSearchResult(msg);
        break;
      default:
        break;
    }
  }

  /**
   * @see nsILDAPMessageListener
   */
  onLDAPError(status, secInfo, location) {
    this._onSearchFinished(status, secInfo, location);
  }

  /**
   * @see LDAPListenerBase
   */
  _actionOnBindSuccess() {
    const ldapUrl = this._directory.lDAPURL;
    this._operation.searchExt(
      ldapUrl.dn,
      ldapUrl.scope,
      this._filter,
      ldapUrl.attributes,
      this._timeout,
      this._limit
    );
  }

  /**
   * @see LDAPListenerBase
   */
  _actionOnBindFailure() {
    this._onSearchFinished(Cr.NS_ERROR_FAILURE);
  }

  /**
   * Handler of nsILDAPMessage.RES_SEARCH_ENTRY message.
   *
   * @param {nsILDAPMessage} msg - The received LDAP message.
   */
  _onLDAPSearchEntry(msg) {
    const newCard = Cc[
      "@mozilla.org/addressbook/cardproperty;1"
    ].createInstance(Ci.nsIAbCard);
    this._attrMap.setCardPropertiesFromLDAPMessage(msg, newCard);
    newCard.directoryUID = this._directory.UID;
    this._listener.onSearchFoundCard(newCard);
  }

  /**
   * Handler of nsILDAPMessage.RES_SEARCH_RESULT message.
   *
   * @param {nsILDAPMessage} msg - The received LDAP message.
   */
  _onLDAPSearchResult(msg) {
    this._onSearchFinished(
      [Ci.nsILDAPErrors.SUCCESS, Ci.nsILDAPErrors.SIZELIMIT_EXCEEDED].includes(
        msg.errorCode
      )
        ? Cr.NS_OK
        : Cr.NS_ERROR_FAILURE
    );
  }

  _onSearchFinished(status, secInfo, location) {
    this._listener.onSearchFinished(status, false, secInfo, location);
  }
}

LDAPDirectoryQuery.prototype.classID = Components.ID(
  "{5ad5d311-1a50-43db-a03c-63d45f443903}"
);
