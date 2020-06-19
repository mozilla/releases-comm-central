/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsAbBooleanExpression.h"
#include "nsComponentManagerUtils.h"

NS_IMPL_ISUPPORTS(nsAbBooleanConditionString, nsIAbBooleanConditionString)

nsAbBooleanConditionString::nsAbBooleanConditionString()
    : mCondition(nsIAbBooleanConditionTypes::Exists) {}

nsAbBooleanConditionString::~nsAbBooleanConditionString() {}

/* attribute nsAbBooleanConditionType condition; */
NS_IMETHODIMP nsAbBooleanConditionString::GetCondition(
    nsAbBooleanConditionType* aCondition) {
  if (!aCondition) return NS_ERROR_NULL_POINTER;

  *aCondition = mCondition;

  return NS_OK;
}
NS_IMETHODIMP nsAbBooleanConditionString::SetCondition(
    nsAbBooleanConditionType aCondition) {
  mCondition = aCondition;

  return NS_OK;
}

/* attribute string name; */
NS_IMETHODIMP nsAbBooleanConditionString::GetName(char** aName) {
  if (!aName) return NS_ERROR_NULL_POINTER;

  *aName = mName.IsEmpty() ? 0 : ToNewCString(mName);

  return NS_OK;
}
NS_IMETHODIMP nsAbBooleanConditionString::SetName(const char* aName) {
  if (!aName) return NS_ERROR_NULL_POINTER;

  mName = aName;

  return NS_OK;
}

/* attribute wstring value; */
NS_IMETHODIMP nsAbBooleanConditionString::GetValue(char16_t** aValue) {
  if (!aValue) return NS_ERROR_NULL_POINTER;

  *aValue = ToNewUnicode(mValue);

  return NS_OK;
}
NS_IMETHODIMP nsAbBooleanConditionString::SetValue(const char16_t* aValue) {
  if (!aValue) return NS_ERROR_NULL_POINTER;

  mValue = aValue;

  return NS_OK;
}

NS_IMPL_ISUPPORTS(nsAbBooleanExpression, nsIAbBooleanExpression)

nsAbBooleanExpression::nsAbBooleanExpression()
    : mOperation(nsIAbBooleanOperationTypes::AND) {}

nsAbBooleanExpression::~nsAbBooleanExpression() {}

/* attribute nsAbBooleanOperationType operation; */
NS_IMETHODIMP nsAbBooleanExpression::GetOperation(
    nsAbBooleanOperationType* aOperation) {
  if (!aOperation) return NS_ERROR_NULL_POINTER;

  *aOperation = mOperation;

  return NS_OK;
}
NS_IMETHODIMP nsAbBooleanExpression::SetOperation(
    nsAbBooleanOperationType aOperation) {
  mOperation = aOperation;

  return NS_OK;
}

/* attribute Array<nsISupports> expressions; */
NS_IMETHODIMP nsAbBooleanExpression::GetExpressions(
    nsTArray<RefPtr<nsISupports>>& aExpressions) {
  aExpressions = mExpressions.Clone();
  return NS_OK;
}

NS_IMETHODIMP nsAbBooleanExpression::SetExpressions(
    const nsTArray<RefPtr<nsISupports>>& aExpressions) {
  mExpressions = aExpressions.Clone();
  return NS_OK;
}
