/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsIAbLDAPAttributeMap.h"
#include "nsAbBoolExprToLDAPFilter.h"
#include "nsString.h"
#include "nsQueryObject.h"

const int nsAbBoolExprToLDAPFilter::TRANSLATE_CARD_PROPERTY = 1 << 0;
const int nsAbBoolExprToLDAPFilter::ALLOW_NON_CONVERTABLE_CARD_PROPERTY = 1
                                                                          << 1;

nsresult nsAbBoolExprToLDAPFilter::Convert(nsIAbLDAPAttributeMap* map,
                                           nsIAbBooleanExpression* expression,
                                           nsCString& filter, int flags) {
  nsCString f;
  nsresult rv = FilterExpression(map, expression, f, flags);
  NS_ENSURE_SUCCESS(rv, rv);

  filter = f;
  return rv;
}

nsresult nsAbBoolExprToLDAPFilter::FilterExpression(
    nsIAbLDAPAttributeMap* map, nsIAbBooleanExpression* expression,
    nsCString& filter, int flags) {
  nsTArray<RefPtr<nsISupports>> childExpressions;
  nsresult rv = expression->GetExpressions(childExpressions);
  NS_ENSURE_SUCCESS(rv, rv);

  uint32_t count = childExpressions.Length();
  NS_ENSURE_SUCCESS(rv, rv);

  if (count == 0) return NS_OK;

  nsAbBooleanOperationType operation;
  rv = expression->GetOperation(&operation);
  NS_ENSURE_SUCCESS(rv, rv);

  /*
   * 3rd party query integration with Mozilla is achieved
   * by calling nsAbLDAPDirectoryQuery::DoQuery(). Thus
   * we can arrive here with a query asking for all the
   * ldap attributes using the card:nsIAbCard interface.
   *
   * So we need to check that we are not creating a condition
   * filter against this expression otherwise we will end up with an invalid
   * filter equal to "(|)".
   */

  if (count == 1) {
    nsCOMPtr<nsIAbBooleanConditionString> childCondition =
        do_QueryInterface(childExpressions[0], &rv);
    if (NS_SUCCEEDED(rv)) {
      nsCString name;
      rv = childCondition->GetName(getter_Copies(name));
      NS_ENSURE_SUCCESS(rv, rv);

      if (name.EqualsLiteral("card:nsIAbCard")) return NS_OK;
    }
  }

  filter.Append('(');
  switch (operation) {
    case nsIAbBooleanOperationTypes::AND:
      filter.Append('&');
      rv = FilterExpressions(map, childExpressions, filter, flags);
      break;
    case nsIAbBooleanOperationTypes::OR:
      filter.Append('|');
      rv = FilterExpressions(map, childExpressions, filter, flags);
      break;
    case nsIAbBooleanOperationTypes::NOT:
      if (count > 1) return NS_ERROR_FAILURE;
      filter.Append('!');
      rv = FilterExpressions(map, childExpressions, filter, flags);
      break;
    default:
      break;
  }
  filter.Append(')');

  return rv;
}

nsresult nsAbBoolExprToLDAPFilter::FilterExpressions(
    nsIAbLDAPAttributeMap* map, nsTArray<RefPtr<nsISupports>>& expressions,
    nsCString& filter, int flags) {
  nsresult rv = NS_OK;

  nsCOMPtr<nsIAbBooleanConditionString> childCondition;
  nsCOMPtr<nsIAbBooleanExpression> childExpression;
  for (auto expression : expressions) {
    childCondition = do_QueryObject(expression, &rv);
    if (NS_SUCCEEDED(rv)) {
      rv = FilterCondition(map, childCondition, filter, flags);
      NS_ENSURE_SUCCESS(rv, rv);
      continue;
    }

    childExpression = do_QueryObject(expression, &rv);
    if (NS_SUCCEEDED(rv)) {
      rv = FilterExpression(map, childExpression, filter, flags);
      NS_ENSURE_SUCCESS(rv, rv);
      continue;
    }
  }

  return rv;
}

nsresult nsAbBoolExprToLDAPFilter::FilterCondition(
    nsIAbLDAPAttributeMap* map, nsIAbBooleanConditionString* condition,
    nsCString& filter, int flags) {
  nsCString name;
  nsresult rv = condition->GetName(getter_Copies(name));
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString ldapAttr(name);
  if (flags & TRANSLATE_CARD_PROPERTY) {
    rv = map->GetFirstAttribute(name, ldapAttr);
    if (!(flags & ALLOW_NON_CONVERTABLE_CARD_PROPERTY) &&
        !ATTRMAP_FOUND_ATTR(rv, ldapAttr))
      return NS_OK;
  }

  nsAbBooleanConditionType conditionType;
  rv = condition->GetCondition(&conditionType);
  NS_ENSURE_SUCCESS(rv, rv);

  nsString value;
  rv = condition->GetValue(getter_Copies(value));
  NS_ENSURE_SUCCESS(rv, rv);
  NS_ConvertUTF16toUTF8 vUTF8(value);

  switch (conditionType) {
    case nsIAbBooleanConditionTypes::DoesNotExist:
      filter.AppendLiteral("(!(");
      filter.Append(ldapAttr);
      filter.AppendLiteral("=*))");
      break;
    case nsIAbBooleanConditionTypes::Exists:
      filter.Append('(');
      filter.Append(ldapAttr);
      filter.AppendLiteral("=*)");
      break;
    case nsIAbBooleanConditionTypes::Contains:
      filter.Append('(');
      filter.Append(ldapAttr);
      filter.AppendLiteral("=*");
      filter.Append(vUTF8);
      filter.AppendLiteral("*)");
      break;
    case nsIAbBooleanConditionTypes::DoesNotContain:
      filter.AppendLiteral("(!(");
      filter.Append(ldapAttr);
      filter.AppendLiteral("=*");
      filter.Append(vUTF8);
      filter.AppendLiteral("*))");
      break;
    case nsIAbBooleanConditionTypes::Is:
      filter.Append('(');
      filter.Append(ldapAttr);
      filter.Append('=');
      filter.Append(vUTF8);
      filter.Append(')');
      break;
    case nsIAbBooleanConditionTypes::IsNot:
      filter.AppendLiteral("(!(");
      filter.Append(ldapAttr);
      filter.Append('=');
      filter.Append(vUTF8);
      filter.AppendLiteral("))");
      break;
    case nsIAbBooleanConditionTypes::BeginsWith:
      filter.Append('(');
      filter.Append(ldapAttr);
      filter.Append('=');
      filter.Append(vUTF8);
      filter.AppendLiteral("*)");
      break;
    case nsIAbBooleanConditionTypes::EndsWith:
      filter.Append('(');
      filter.Append(ldapAttr);
      filter.AppendLiteral("=*");
      filter.Append(vUTF8);
      filter.Append(')');
      break;
    case nsIAbBooleanConditionTypes::LessThan:
      filter.Append('(');
      filter.Append(ldapAttr);
      filter.AppendLiteral("<=");
      filter.Append(vUTF8);
      filter.Append(')');
      break;
    case nsIAbBooleanConditionTypes::GreaterThan:
      filter.Append('(');
      filter.Append(ldapAttr);
      filter.AppendLiteral(">=");
      filter.Append(vUTF8);
      filter.Append(')');
      break;
    case nsIAbBooleanConditionTypes::SoundsLike:
      filter.Append('(');
      filter.Append(ldapAttr);
      filter.AppendLiteral("~=");
      filter.Append(vUTF8);
      filter.Append(')');
      break;
    case nsIAbBooleanConditionTypes::RegExp:
      break;
    default:
      break;
  }

  return rv;
}
