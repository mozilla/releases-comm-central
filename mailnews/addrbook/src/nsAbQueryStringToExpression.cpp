/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsAbQueryStringToExpression.h"

#include "nsComponentManagerUtils.h"
#include "nsServiceManagerUtils.h"
#include "nsCOMPtr.h"
#include "nsString.h"
#include "nsITextToSubURI.h"
#include "nsAbBooleanExpression.h"
#include "plstr.h"

/**
 * This code parses the query expression passed in as an addressbook URI.
 * The expression takes the form:
 * (BOOL1(FIELD1,OP1,VALUE1)..(FIELDn,OPn,VALUEn)(BOOL2(FIELD1,OP1,VALUE1)...)...)
 *
 * BOOLn   A boolean operator joining subsequent terms delimited by ().
 *         For possible values see CreateBooleanExpression().
 * FIELDn  An addressbook card data field.
 * OPn     An operator for the search term.
 *         For possible values see CreateBooleanConditionString().
 * VALUEn  The value to be matched in the FIELDn via the OPn operator.
 *         The value must be URL encoded by the caller, if it contains any
 * special characters including '(' and ')'.
 */
nsresult nsAbQueryStringToExpression::Convert(
    const nsACString& aQueryString, nsIAbBooleanExpression** expression) {
  nsresult rv;

  nsAutoCString q(aQueryString);
  q.StripWhitespace();
  const char* queryChars = q.get();

  nsCOMPtr<nsISupports> s;
  rv = ParseExpression(&queryChars, getter_AddRefs(s));
  NS_ENSURE_SUCCESS(rv, rv);

  // Case: Not end of string
  if (*queryChars != 0) return NS_ERROR_FAILURE;

  nsCOMPtr<nsIAbBooleanExpression> e(do_QueryInterface(s, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  e.forget(expression);
  return rv;
}

nsresult nsAbQueryStringToExpression::ParseExpression(
    const char** index, nsISupports** expression) {
  nsresult rv;

  if (**index == '?') {
    (*index)++;
  }

  if (**index != '(') return NS_ERROR_FAILURE;

  const char* indexBracket = *index + 1;
  while (*indexBracket && *indexBracket != '(' && *indexBracket != ')')
    indexBracket++;

  // Case: End of string
  if (*indexBracket == 0) return NS_ERROR_FAILURE;

  // Case: "((" or "()"
  if (indexBracket == *index + 1) {
    return NS_ERROR_FAILURE;
  }
  // Case: "(*("
  else if (*indexBracket == '(') {
    // printf ("Case: (*(: %s\n", *index);

    nsCString operation;
    rv = ParseOperationEntry(*index, indexBracket, getter_Copies(operation));
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIAbBooleanExpression> e;
    rv = CreateBooleanExpression(operation.get(), getter_AddRefs(e));
    NS_ENSURE_SUCCESS(rv, rv);

    // Case: "(*)(*)....(*))"
    *index = indexBracket;
    rv = ParseExpressions(index, e);
    NS_ENSURE_SUCCESS(rv, rv);

    e.forget(expression);
  }
  // Case" "(*)"
  else if (*indexBracket == ')') {
    // printf ("Case: (*): %s\n", *index);

    nsCOMPtr<nsIAbBooleanConditionString> conditionString;
    rv = ParseCondition(index, indexBracket, getter_AddRefs(conditionString));
    NS_ENSURE_SUCCESS(rv, rv);

    conditionString.forget(expression);
  }

  if (**index != ')') return NS_ERROR_FAILURE;

  (*index)++;

  return NS_OK;
}

nsresult nsAbQueryStringToExpression::ParseExpressions(
    const char** index, nsIAbBooleanExpression* expression) {
  nsresult rv;
  nsTArray<RefPtr<nsISupports>> expressions;

  // Case: ")(*)(*)....(*))"
  // printf ("Case: )(*)(*)....(*)): %s\n", *index);
  while (**index == '(') {
    nsCOMPtr<nsISupports> childExpression;
    rv = ParseExpression(index, getter_AddRefs(childExpression));
    NS_ENSURE_SUCCESS(rv, rv);

    expressions.AppendElement(childExpression);
  }

  if (**index == 0) return NS_ERROR_FAILURE;

  // Case: "))"
  // printf ("Case: )): %s\n", *index);

  if (**index != ')') return NS_ERROR_FAILURE;

  expression->SetExpressions(expressions);

  return NS_OK;
}

nsresult nsAbQueryStringToExpression::ParseCondition(
    const char** index, const char* indexBracketClose,
    nsIAbBooleanConditionString** conditionString) {
  nsresult rv;

  (*index)++;

  nsCString entries[3];
  for (int i = 0; i < 3; i++) {
    rv = ParseConditionEntry(index, indexBracketClose,
                             getter_Copies(entries[i]));
    NS_ENSURE_SUCCESS(rv, rv);

    if (*index == indexBracketClose) break;
  }

  if (*index != indexBracketClose) return NS_ERROR_FAILURE;

  nsCOMPtr<nsIAbBooleanConditionString> c;
  rv = CreateBooleanConditionString(entries[0].get(), entries[1].get(),
                                    entries[2].get(), getter_AddRefs(c));
  NS_ENSURE_SUCCESS(rv, rv);

  c.forget(conditionString);
  return NS_OK;
}

nsresult nsAbQueryStringToExpression::ParseConditionEntry(
    const char** index, const char* indexBracketClose, char** entry) {
  const char* indexDeliminator = *index;
  while (indexDeliminator != indexBracketClose && *indexDeliminator != ',')
    indexDeliminator++;

  int entryLength = indexDeliminator - *index;
  if (entryLength)
    *entry = PL_strndup(*index, entryLength);
  else
    *entry = 0;

  if (indexDeliminator != indexBracketClose)
    *index = indexDeliminator + 1;
  else
    *index = indexDeliminator;

  return NS_OK;
}

nsresult nsAbQueryStringToExpression::ParseOperationEntry(
    const char* indexBracketOpen1, const char* indexBracketOpen2,
    char** operation) {
  int operationLength = indexBracketOpen2 - indexBracketOpen1 - 1;
  if (operationLength)
    *operation = PL_strndup(indexBracketOpen1 + 1, operationLength);
  else
    *operation = 0;

  return NS_OK;
}

nsresult nsAbQueryStringToExpression::CreateBooleanExpression(
    const char* operation, nsIAbBooleanExpression** expression) {
  nsAbBooleanOperationType op;
  if (PL_strcasecmp(operation, "and") == 0)
    op = nsIAbBooleanOperationTypes::AND;
  else if (PL_strcasecmp(operation, "or") == 0)
    op = nsIAbBooleanOperationTypes::OR;
  else if (PL_strcasecmp(operation, "not") == 0)
    op = nsIAbBooleanOperationTypes::NOT;
  else
    return NS_ERROR_FAILURE;

  nsresult rv;

  nsCOMPtr<nsIAbBooleanExpression> expr =
      do_CreateInstance("@mozilla.org/boolean-expression/n-peer;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = expr->SetOperation(op);
  expr.forget(expression);
  return rv;
}

nsresult nsAbQueryStringToExpression::CreateBooleanConditionString(
    const char* attribute, const char* condition, const char* value,
    nsIAbBooleanConditionString** conditionString) {
  if (attribute == 0 || condition == 0 || value == 0) return NS_ERROR_FAILURE;

  nsAbBooleanConditionType c;

  if (PL_strcasecmp(condition, "=") == 0)
    c = nsIAbBooleanConditionTypes::Is;
  else if (PL_strcasecmp(condition, "!=") == 0)
    c = nsIAbBooleanConditionTypes::IsNot;
  else if (PL_strcasecmp(condition, "lt") == 0)
    c = nsIAbBooleanConditionTypes::LessThan;
  else if (PL_strcasecmp(condition, "gt") == 0)
    c = nsIAbBooleanConditionTypes::GreaterThan;
  else if (PL_strcasecmp(condition, "bw") == 0)
    c = nsIAbBooleanConditionTypes::BeginsWith;
  else if (PL_strcasecmp(condition, "ew") == 0)
    c = nsIAbBooleanConditionTypes::EndsWith;
  else if (PL_strcasecmp(condition, "c") == 0)
    c = nsIAbBooleanConditionTypes::Contains;
  else if (PL_strcasecmp(condition, "!c") == 0)
    c = nsIAbBooleanConditionTypes::DoesNotContain;
  else if (PL_strcasecmp(condition, "~=") == 0)
    c = nsIAbBooleanConditionTypes::SoundsLike;
  else if (PL_strcasecmp(condition, "regex") == 0)
    c = nsIAbBooleanConditionTypes::RegExp;
  else if (PL_strcasecmp(condition, "ex") == 0)
    c = nsIAbBooleanConditionTypes::Exists;
  else if (PL_strcasecmp(condition, "!ex") == 0)
    c = nsIAbBooleanConditionTypes::DoesNotExist;
  else
    return NS_ERROR_FAILURE;

  nsresult rv;

  nsCOMPtr<nsIAbBooleanConditionString> cs = do_CreateInstance(
      "@mozilla.org/boolean-expression/condition-string;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = cs->SetCondition(c);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsITextToSubURI> textToSubURI =
      do_GetService(NS_ITEXTTOSUBURI_CONTRACTID, &rv);
  if (NS_SUCCEEDED(rv)) {
    nsString attributeUCS2;
    nsString valueUCS2;

    rv = textToSubURI->UnEscapeAndConvert(
        "UTF-8"_ns, nsDependentCString(attribute), attributeUCS2);
    NS_ENSURE_SUCCESS(rv, rv);

    rv = textToSubURI->UnEscapeAndConvert("UTF-8"_ns, nsDependentCString(value),
                                          valueUCS2);
    NS_ENSURE_SUCCESS(rv, rv);

    NS_ConvertUTF16toUTF8 attributeUTF8(attributeUCS2);

    rv = cs->SetName(attributeUTF8.get());
    NS_ENSURE_SUCCESS(rv, rv);
    rv = cs->SetValue(valueUCS2.get());
    NS_ENSURE_SUCCESS(rv, rv);
  } else {
    NS_ConvertUTF8toUTF16 valueUCS2(value);

    rv = cs->SetName(attribute);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = cs->SetValue(valueUCS2.get());
    NS_ENSURE_SUCCESS(rv, rv);
  }

  cs.forget(conditionString);
  return NS_OK;
}
