/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "JaCompose.h"
#include "nsISupportsUtils.h"
#include "nsComponentManagerUtils.h"

// This file specifies the implementation of nsIMsgCompose.idl objects
// in the JsAccount system.

namespace mozilla {
namespace mailnews {

NS_IMPL_ISUPPORTS_INHERITED(JaBaseCppCompose,
                            nsMsgCompose,
                            nsIInterfaceRequestor)

// nsIInterfaceRequestor implementation
NS_IMETHODIMP
JaBaseCppCompose::GetInterface(const nsIID & aIID, void **aSink)
{
  return QueryInterface(aIID, aSink);
}

// Delegator object to bypass JS method override.

JaCppComposeDelegator::JaCppComposeDelegator() {
  mCppBase = do_QueryInterface(
      NS_ISUPPORTS_CAST(nsIMsgCompose*, new Super(this)));
  mMethods = nullptr;
}

NS_IMPL_ISUPPORTS_INHERITED(JaCppComposeDelegator,
                            JaBaseCppCompose,
                            msgIOverride)

NS_IMPL_ISUPPORTS(JaCppComposeDelegator::Super,
                  nsIMsgCompose,
                  nsIMsgSendListener,
                  nsIInterfaceRequestor)

NS_IMETHODIMP
JaCppComposeDelegator::SetMethodsToDelegate(msgIDelegateList* aDelegateList)
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
JaCppComposeDelegator::GetMethodsToDelegate(msgIDelegateList** aDelegateList)
{
  if (!mDelegateList)
    mDelegateList = new DelegateList("mozilla::mailnews::JaCppComposeDelegator::");
  mMethods = &(mDelegateList->mMethods);
  NS_ADDREF(*aDelegateList = mDelegateList);
  return NS_OK;
}

NS_IMETHODIMP
JaCppComposeDelegator::SetJsDelegate(nsISupports* aJsDelegate)
{
  // If these QIs fail, then overrides are not provided for methods in that
  // interface, which is OK.
  mJsISupports = aJsDelegate;
  mJsIMsgCompose = do_QueryInterface(aJsDelegate);
  mJsIMsgSendListener = do_QueryInterface(aJsDelegate);
  mJsIInterfaceRequestor = do_QueryInterface(aJsDelegate);
  return NS_OK;
}
NS_IMETHODIMP
JaCppComposeDelegator::GetJsDelegate(nsISupports **aJsDelegate)
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
JaCppComposeDelegator::GetCppBase(nsISupports** aCppBase)
{
  nsCOMPtr<nsISupports> cppBaseSupports;
  cppBaseSupports = NS_ISUPPORTS_CAST(nsIMsgCompose*, mCppBase);
  NS_ENSURE_STATE(cppBaseSupports);
  cppBaseSupports.forget(aCppBase);

  return NS_OK;
}

} // namespace mailnews
} // namespace mozilla
