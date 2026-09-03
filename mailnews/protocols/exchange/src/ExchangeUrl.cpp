/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ExchangeUrl.h"

#include "nsMsgUtils.h"

NS_IMPL_ISUPPORTS_INHERITED(ExchangeUrl, nsMsgMailNewsUrl, nsIMsgMessageUrl)

ExchangeUrl::ExchangeUrl() : nsMsgMailNewsUrl() {}

NS_IMETHODIMP ExchangeUrl::GetUri(nsACString& uri) {
  return GetSpec(uri);
}

NS_IMETHODIMP ExchangeUrl::SetUri(const nsACString& uri) {
  return SetSpecInternal(uri);
}

NS_IMETHODIMP ExchangeUrl::GetMessageFile(nsIFile** file) {
  NS_ENSURE_ARG_POINTER(file);

  NS_IF_ADDREF(*file = mMessageFile);

  return NS_OK;
}

NS_IMETHODIMP ExchangeUrl::SetMessageFile(nsIFile* file) {
  mMessageFile = file;
  return NS_OK;
}

NS_IMETHODIMP ExchangeUrl::GetCanonicalLineEnding(bool* canonicalLineEnding) {
  NS_ENSURE_ARG(canonicalLineEnding);
  *canonicalLineEnding = mCanonicalLineEnding;
  return NS_OK;
}

NS_IMETHODIMP ExchangeUrl::SetCanonicalLineEnding(bool canonicalLineEnding) {
  mCanonicalLineEnding = canonicalLineEnding;
  return NS_OK;
}

NS_IMETHODIMP ExchangeUrl::GetOriginalSpec(nsACString& originalSpec) {
  return GetSpec(originalSpec);
}

NS_IMETHODIMP ExchangeUrl::SetOriginalSpec(const nsACString& originalSpec) {
  return SetSpecInternal(originalSpec);
}

NS_IMETHODIMP ExchangeUrl::GetNormalizedSpec(nsACString& normalizedSpec) {
  nsCOMPtr<nsIMsgMailNewsUrl> mailnewsURL;
  QueryInterface(NS_GET_IID(nsIMsgMailNewsUrl), getter_AddRefs(mailnewsURL));

  nsAutoCString spec;
  mailnewsURL->GetSpecIgnoringRef(spec);

  MsgRemoveQueryPart(spec);

  normalizedSpec.Assign(spec);
  return NS_OK;
}

NS_IMETHODIMP ExchangeUrl::GetMessageHeader(nsIMsgDBHdr** messageHeader) {
  nsCString uri;
  nsresult rv = GetUri(uri);
  NS_ENSURE_SUCCESS(rv, rv);
  return GetMsgDBHdrFromURI(uri, messageHeader);
}
