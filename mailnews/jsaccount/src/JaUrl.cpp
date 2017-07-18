/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "JaUrl.h"
#include "nsComponentManagerUtils.h"
#include "nsIFile.h"
#include "nsIMessenger.h"
#include "nsIMsgHdr.h"
#include "nsISupportsUtils.h"
#include "nsMsgBaseCID.h"
#include "nsMsgUtils.h"

// This file contains an implementation of mailnews URLs in JsAccount.

namespace mozilla {
namespace mailnews {

NS_IMPL_ISUPPORTS_INHERITED(JaBaseCppUrl, nsMsgMailNewsUrl,
                            nsIMsgMessageUrl,
                            nsIInterfaceRequestor,
                            nsISupportsWeakReference)

// nsIMsgMailNewsUrl overrides
NS_IMETHODIMP JaBaseCppUrl::GetFolder(nsIMsgFolder **aFolder)
{
  NS_ENSURE_ARG_POINTER(aFolder);
  NS_IF_ADDREF(*aFolder = mFolder);
  return NS_OK;
}

NS_IMETHODIMP JaBaseCppUrl::SetFolder(nsIMsgFolder *aFolder)
{
  mFolder = aFolder;
  return NS_OK;
}

// nsIMsgMessageUrl implementation
NS_IMETHODIMP JaBaseCppUrl::GetUri(char **aUri)
{
  if (!mUri.IsEmpty())
    *aUri = ToNewCString(mUri);
  else
    return NS_ERROR_NOT_INITIALIZED;
  return NS_OK;
}
NS_IMETHODIMP JaBaseCppUrl::SetUri(const char *aUri)
{
  mUri = aUri;
  return NS_OK;
}

NS_IMETHODIMP JaBaseCppUrl::GetMessageFile(nsIFile **aMessageFile)
{
  NS_ENSURE_ARG_POINTER(aMessageFile);
  NS_IF_ADDREF(*aMessageFile = mMessageFile);
  return NS_OK;
}
NS_IMETHODIMP JaBaseCppUrl::SetMessageFile(nsIFile *aMessageFile)
{
  mMessageFile = aMessageFile;
  return NS_OK;
}

NS_IMETHODIMP JaBaseCppUrl::GetAddDummyEnvelope(bool *aAddDummyEnvelope)
{
    return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP JaBaseCppUrl::SetAddDummyEnvelope(bool aAddDummyEnvelope)
{
    return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP JaBaseCppUrl::GetCanonicalLineEnding(bool *aCanonicalLineEnding)
{
  NS_ENSURE_ARG_POINTER(aCanonicalLineEnding);
  *aCanonicalLineEnding = mCanonicalLineEnding;
  return NS_OK;
}
NS_IMETHODIMP JaBaseCppUrl::SetCanonicalLineEnding(bool aCanonicalLineEnding)
{
  mCanonicalLineEnding = aCanonicalLineEnding;
  return NS_OK;
}

NS_IMETHODIMP JaBaseCppUrl::GetOriginalSpec(char **aOriginalSpec)
{
  if (!aOriginalSpec || mOriginalSpec.IsEmpty())
    return NS_ERROR_NULL_POINTER;
  *aOriginalSpec = ToNewCString(mOriginalSpec);
  return NS_OK;
}
NS_IMETHODIMP JaBaseCppUrl::SetOriginalSpec(const char *aOriginalSpec)
{
  mOriginalSpec = aOriginalSpec;
  return NS_OK;
}

NS_IMETHODIMP JaBaseCppUrl::GetPrincipalSpec(nsACString& aPrincipalSpec)
{
  // URLs contain a lot of query parts. We want need a normalised form:
  // scheme://server/folder?number=123
  nsCOMPtr<nsIMsgMailNewsUrl> mailnewsURL;
  QueryInterface(NS_GET_IID(nsIMsgMailNewsUrl), getter_AddRefs(mailnewsURL));

  nsAutoCString spec;
  mailnewsURL->GetSpecIgnoringRef(spec);

  nsAutoCString queryPart = MsgExtractQueryPart(spec, "number=");

  // Strip any query part beginning with ? or /;
  int32_t ind = spec.Find("/;");
  if (ind != kNotFound)
    spec.SetLength(ind);

  ind = spec.FindChar('?');
  if (ind != kNotFound)
    spec.SetLength(ind);

  if (!queryPart.IsEmpty())
    spec += NS_LITERAL_CSTRING("?") + queryPart;

  aPrincipalSpec.Assign(spec);
  return NS_OK;
}

NS_IMETHODIMP JaBaseCppUrl::GetMessageHeader(nsIMsgDBHdr **aMessageHeader)
{
  // This routine does a lookup using messenger, assumming that the message URI
  // has been set in mUri.
  NS_ENSURE_TRUE(!mUri.IsEmpty(), NS_ERROR_NOT_INITIALIZED);
  nsresult rv;
  nsCOMPtr<nsIMessenger> messenger(do_CreateInstance(NS_MESSENGER_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIMsgDBHdr> msgHdr;
  rv = messenger->MsgHdrFromURI(mUri, getter_AddRefs(msgHdr));
  NS_ENSURE_SUCCESS(rv, rv);
  msgHdr.forget(aMessageHeader);
  return NS_OK;
}

NS_IMETHODIMP JaBaseCppUrl::SetMessageHeader(nsIMsgDBHdr *aMsgHdr)
{
  return NS_ERROR_NOT_IMPLEMENTED;
}

// nsIInterfaceRequestor implementation
NS_IMETHODIMP JaBaseCppUrl::GetInterface(const nsIID & aIID, void **aSink)
{
  return QueryInterface(aIID, aSink);
}

// Delegator
NS_IMPL_ISUPPORTS_INHERITED(JaCppUrlDelegator,
                            JaBaseCppUrl,
                            msgIOverride)

// Delegator object to bypass JS method override.
NS_IMPL_ISUPPORTS(JaCppUrlDelegator::Super,
                  nsIMsgMailNewsUrl,
                  nsIMsgMessageUrl,
                  nsIURI,
                  nsIURL,
                  nsIInterfaceRequestor)

JaCppUrlDelegator::JaCppUrlDelegator() :
  mCppBase(new Super(this)),
  mMethods(nullptr)
{ }

NS_IMETHODIMP JaCppUrlDelegator::SetMethodsToDelegate(msgIDelegateList *aDelegateList)
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
NS_IMETHODIMP JaCppUrlDelegator::GetMethodsToDelegate(msgIDelegateList **aDelegateList)
{
  if (!mDelegateList)
    mDelegateList = new DelegateList("mozilla::mailnews::JaCppUrlDelegator::");
  mMethods = &(mDelegateList->mMethods);
  NS_ADDREF(*aDelegateList = mDelegateList);
  return NS_OK;
}

NS_IMETHODIMP JaCppUrlDelegator::SetJsDelegate(nsISupports *aJsDelegate)
{
  // If these QIs fail, then overrides are not provided for methods in that
  // interface, which is OK.
  mJsISupports = aJsDelegate;
  mJsIMsgMailNewsUrl = do_QueryInterface(aJsDelegate);
  mJsIURI = do_QueryInterface(aJsDelegate);
  mJsIURL = do_QueryInterface(aJsDelegate);
  mJsIMsgMessageUrl = do_QueryInterface(aJsDelegate);
  mJsIInterfaceRequestor = do_QueryInterface(aJsDelegate);
  return NS_OK;
}
NS_IMETHODIMP JaCppUrlDelegator::GetJsDelegate(nsISupports **aJsDelegate)
{
  NS_ENSURE_ARG_POINTER(aJsDelegate);
  if (mJsISupports)
  {
    NS_ADDREF(*aJsDelegate = mJsISupports);
    return NS_OK;
  }
  return NS_ERROR_NOT_INITIALIZED;
}

NS_IMETHODIMP JaCppUrlDelegator::GetCppBase(nsISupports **aCppBase)
{
  nsCOMPtr<nsISupports> cppBaseSupports;
  cppBaseSupports = NS_ISUPPORTS_CAST(nsIMsgMailNewsUrl*, mCppBase);
  NS_ENSURE_STATE(cppBaseSupports);
  cppBaseSupports.forget(aCppBase);

  return NS_OK;
}

} // namespace mailnews
} // namespace mozilla
