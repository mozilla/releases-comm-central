/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "JaAbDirectory.h"
#include "nsISupportsUtils.h"
#include "nsIFile.h"
#include "nsIMsgHdr.h"
#include "nsIMessenger.h"
#include "nsMsgBaseCID.h"
#include "nsComponentManagerUtils.h"

namespace mozilla {
namespace mailnews {

NS_IMPL_ISUPPORTS_INHERITED(JaBaseCppAbDirectory, nsAbDirProperty,
                            nsIInterfaceRequestor)

// nsIInterfaceRequestor implementation
NS_IMETHODIMP JaBaseCppAbDirectory::GetInterface(const nsIID & aIID, void **aSink)
{
  return QueryInterface(aIID, aSink);
}

// Delegator
NS_IMPL_ISUPPORTS_INHERITED(JaCppAbDirectoryDelegator,
                           JaBaseCppAbDirectory,
                           msgIOverride)

// Delegator object to bypass JS method override.
NS_IMPL_ISUPPORTS(JaCppAbDirectoryDelegator::Super,
                  nsIAbDirectory,
                  nsIAbCollection,
                  nsIAbItem,
                  nsIInterfaceRequestor)

JaCppAbDirectoryDelegator::JaCppAbDirectoryDelegator() :
  mCppBase(new Super(this)),
  mMethods(nullptr)
{ }

NS_IMETHODIMP JaCppAbDirectoryDelegator::SetMethodsToDelegate(msgIDelegateList* aDelegateList)
{
  if (!aDelegateList)
  {
    NS_WARNING("Null delegate list");
    return NS_ERROR_NULL_POINTER;
  }
  // We static_cast since we want to use the hash object directly.
  mDelegateList = static_cast<DelegateList*> (aDelegateList);
  mMethods = &(mDelegateList->mMethods);
  return NS_OK;
}
NS_IMETHODIMP JaCppAbDirectoryDelegator::GetMethodsToDelegate(msgIDelegateList** aDelegateList)
{
  if (!mDelegateList)
    mDelegateList = new DelegateList("mozilla::mailnews::JaCppAbDirectoryDelegator::");
  mMethods = &(mDelegateList->mMethods);
  NS_ADDREF(*aDelegateList = mDelegateList);
  return NS_OK;
}

NS_IMETHODIMP JaCppAbDirectoryDelegator::SetJsDelegate(nsISupports* aJsDelegate)
{
  // If these QIs fail, then overrides are not provided for methods in that
  // interface, which is OK.
  mJsISupports = aJsDelegate;
  mJsIAbDirectory = do_QueryInterface(aJsDelegate);
  mJsIAbCollection = do_QueryInterface(aJsDelegate);
  mJsIAbItem = do_QueryInterface(aJsDelegate);
  mJsIInterfaceRequestor = do_QueryInterface(aJsDelegate);
  return NS_OK;
}
NS_IMETHODIMP JaCppAbDirectoryDelegator::GetJsDelegate(nsISupports **aJsDelegate)
{
  NS_ENSURE_ARG_POINTER(aJsDelegate);
  if (mJsISupports)
  {
    NS_ADDREF(*aJsDelegate = mJsISupports);
    return NS_OK;
  }
  return NS_ERROR_NOT_INITIALIZED;
}

NS_IMETHODIMP JaCppAbDirectoryDelegator::GetCppBase(nsISupports** aCppBase)
{
  nsCOMPtr<nsISupports> cppBaseSupports;
  cppBaseSupports = NS_ISUPPORTS_CAST(nsIAbDirectory*, mCppBase);
  NS_ENSURE_STATE(cppBaseSupports);
  cppBaseSupports.forget(aCppBase);

  return NS_OK;
}

} // namespace mailnews
} // namespace mozilla
