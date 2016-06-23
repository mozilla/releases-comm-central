/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "JaSend.h"
#include "nsISupportsUtils.h"
#include "nsComponentManagerUtils.h"

// This file specifies the implementation of nsIMsgSend.idl objects
// in the JsAccount system.

namespace mozilla {
namespace mailnews {

NS_IMPL_ISUPPORTS_INHERITED(JaBaseCppSend,
                            nsMsgComposeAndSend,
                            nsIInterfaceRequestor)

// nsIInterfaceRequestor implementation
NS_IMETHODIMP
JaBaseCppSend::GetInterface(const nsIID & aIID, void **aSink)
{
  return QueryInterface(aIID, aSink);
}

// Delegator object to bypass JS method override.

JaCppSendDelegator::JaCppSendDelegator() {
  mCppBase = do_QueryInterface(
      NS_ISUPPORTS_CAST(nsIMsgSend*, new Super(this)));
  mMethods = nullptr;
}

NS_IMPL_ISUPPORTS_INHERITED(JaCppSendDelegator,
                            JaBaseCppSend,
                            msgIOverride)

NS_IMPL_ISUPPORTS(JaCppSendDelegator::Super,
                  nsIMsgSend,
                  nsIMsgOperationListener,
                  nsIInterfaceRequestor)

NS_IMETHODIMP
JaCppSendDelegator::SetMethodsToDelegate(msgIDelegateList* aDelegateList)
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
NS_IMETHODIMP
JaCppSendDelegator::GetMethodsToDelegate(msgIDelegateList** aDelegateList)
{
  if (!mDelegateList)
    mDelegateList = new DelegateList("mozilla::mailnews::JaCppSendDelegator::");
  mMethods = &(mDelegateList->mMethods);
  NS_ADDREF(*aDelegateList = mDelegateList);
  return NS_OK;
}

NS_IMETHODIMP
JaCppSendDelegator::SetJsDelegate(nsISupports* aJsDelegate)
{
  // If these QIs fail, then overrides are not provided for methods in that
  // interface, which is OK.
  mJsISupports = aJsDelegate;
  mJsIMsgSend = do_QueryInterface(aJsDelegate);
  mJsIInterfaceRequestor = do_QueryInterface(aJsDelegate);
  return NS_OK;
}
NS_IMETHODIMP
JaCppSendDelegator::GetJsDelegate(nsISupports **aJsDelegate)
{
  NS_ENSURE_ARG_POINTER(aJsDelegate);
  if (mJsISupports)
  {
    NS_ADDREF(*aJsDelegate = mJsISupports);
    return NS_OK;
  }
  return NS_ERROR_NOT_INITIALIZED;
}

NS_IMETHODIMP
JaCppSendDelegator::GetCppBase(nsISupports** aCppBase)
{
  nsCOMPtr<nsISupports> cppBaseSupports;
  cppBaseSupports = NS_ISUPPORTS_CAST(nsIMsgSend*, mCppBase);
  NS_ENSURE_STATE(cppBaseSupports);
  cppBaseSupports.forget(aCppBase);

  return NS_OK;
}

} // namespace mailnews
} // namespace mozilla
