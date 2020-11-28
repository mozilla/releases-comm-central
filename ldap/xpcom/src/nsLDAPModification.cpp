/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsLDAPModification.h"
#include "nsILDAPBERValue.h"
#include "nsISimpleEnumerator.h"
#include "nsServiceManagerUtils.h"
#include "nsComponentManagerUtils.h"

using namespace mozilla;

NS_IMPL_ISUPPORTS(nsLDAPModification, nsILDAPModification)

// constructor
//
nsLDAPModification::nsLDAPModification()
    : mValuesLock("nsLDAPModification.mValuesLock") {}

// destructor
//
nsLDAPModification::~nsLDAPModification() {}

nsresult nsLDAPModification::Init() { return NS_OK; }

NS_IMETHODIMP
nsLDAPModification::GetOperation(int32_t* aOperation) {
  NS_ENSURE_ARG_POINTER(aOperation);

  *aOperation = mOperation;
  return NS_OK;
}

NS_IMETHODIMP nsLDAPModification::SetOperation(int32_t aOperation) {
  mOperation = aOperation;
  return NS_OK;
}

NS_IMETHODIMP
nsLDAPModification::GetType(nsACString& aType) {
  aType.Assign(mType);
  return NS_OK;
}

NS_IMETHODIMP
nsLDAPModification::SetType(const nsACString& aType) {
  mType.Assign(aType);
  return NS_OK;
}

NS_IMETHODIMP
nsLDAPModification::GetValues(nsTArray<RefPtr<nsILDAPBERValue>>& aResult) {
  MutexAutoLock lock(mValuesLock);
  aResult = mValues.Clone();
  return NS_OK;
}

NS_IMETHODIMP
nsLDAPModification::SetValues(
    nsTArray<RefPtr<nsILDAPBERValue>> const& aValues) {
  MutexAutoLock lock(mValuesLock);
  mValues = aValues.Clone();
  return NS_OK;
}

NS_IMETHODIMP
nsLDAPModification::SetUpModification(
    int32_t aOperation, const nsACString& aType,
    nsTArray<RefPtr<nsILDAPBERValue>> const& aValues) {
  MutexAutoLock lock(mValuesLock);
  mValues = aValues.Clone();
  mOperation = aOperation;
  mType.Assign(aType);
  return NS_OK;
}

NS_IMETHODIMP
nsLDAPModification::SetUpModificationOneValue(int32_t aOperation,
                                              const nsACString& aType,
                                              nsILDAPBERValue* aValue) {
  NS_ENSURE_ARG_POINTER(aValue);
  MutexAutoLock lock(mValuesLock);
  mOperation = aOperation;
  mType.Assign(aType);
  mValues.Clear();
  mValues.AppendElement(aValue);
  return NS_OK;
}
