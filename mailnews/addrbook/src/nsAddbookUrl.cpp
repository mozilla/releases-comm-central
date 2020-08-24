/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsIURI.h"
#include "nsNetCID.h"
#include "nsAddbookUrl.h"
#include "nsString.h"
#include "nsAbBaseCID.h"
#include "nsComponentManagerUtils.h"
#include "mozilla/Encoding.h"

/////////////////////////////////////////////////////////////////////////////////////
// addbook url definition
/////////////////////////////////////////////////////////////////////////////////////
nsAddbookUrl::nsAddbookUrl() {
  mOperationType = nsIAddbookUrlOperation::InvalidUrl;
}

nsAddbookUrl::~nsAddbookUrl() {}

NS_IMPL_ISUPPORTS(nsAddbookUrl, nsIAddbookUrl, nsIURI)

nsresult nsAddbookUrl::SetSpecInternal(const nsACString& aSpec) {
  nsresult rv = NS_MutateURI(NS_SIMPLEURIMUTATOR_CONTRACTID)
                    .SetSpec(aSpec)
                    .Finalize(m_baseURL);
  NS_ENSURE_SUCCESS(rv, rv);
  return ParseUrl();
}

nsresult nsAddbookUrl::ParseUrl() {
  nsAutoCString pathStr;

  nsresult rv = m_baseURL->GetPathQueryRef(pathStr);
  NS_ENSURE_SUCCESS(rv, rv);

  if (strstr(pathStr.get(), "?action=print"))
    mOperationType = nsIAddbookUrlOperation::PrintAddressBook;
  else
    mOperationType = nsIAddbookUrlOperation::InvalidUrl;
  return NS_OK;
}

////////////////////////////////////////////////////////////////////////////////////
// Begin nsIURI support
////////////////////////////////////////////////////////////////////////////////////

NS_IMETHODIMP nsAddbookUrl::GetSpec(nsACString& aSpec) {
  return m_baseURL->GetSpec(aSpec);
}

NS_IMETHODIMP nsAddbookUrl::GetPrePath(nsACString& aPrePath) {
  return m_baseURL->GetPrePath(aPrePath);
}

NS_IMETHODIMP nsAddbookUrl::GetScheme(nsACString& aScheme) {
  return m_baseURL->GetScheme(aScheme);
}

nsresult nsAddbookUrl::SetScheme(const nsACString& aScheme) {
  return NS_MutateURI(m_baseURL).SetScheme(aScheme).Finalize(m_baseURL);
}

NS_IMETHODIMP nsAddbookUrl::GetUserPass(nsACString& aUserPass) {
  return m_baseURL->GetUserPass(aUserPass);
}

nsresult nsAddbookUrl::SetUserPass(const nsACString& aUserPass) {
  return NS_MutateURI(m_baseURL).SetUserPass(aUserPass).Finalize(m_baseURL);
}

NS_IMETHODIMP nsAddbookUrl::GetUsername(nsACString& aUsername) {
  return m_baseURL->GetUsername(aUsername);
}

nsresult nsAddbookUrl::SetUsername(const nsACString& aUsername) {
  return NS_MutateURI(m_baseURL).SetUsername(aUsername).Finalize(m_baseURL);
}

NS_IMETHODIMP nsAddbookUrl::GetPassword(nsACString& aPassword) {
  return m_baseURL->GetPassword(aPassword);
}

nsresult nsAddbookUrl::SetPassword(const nsACString& aPassword) {
  return NS_MutateURI(m_baseURL).SetPassword(aPassword).Finalize(m_baseURL);
}

NS_IMETHODIMP nsAddbookUrl::GetHostPort(nsACString& aHostPort) {
  return m_baseURL->GetHostPort(aHostPort);
}

nsresult nsAddbookUrl::SetHostPort(const nsACString& aHostPort) {
  return NS_MutateURI(m_baseURL).SetHostPort(aHostPort).Finalize(m_baseURL);
}

NS_IMETHODIMP nsAddbookUrl::GetHost(nsACString& aHost) {
  return m_baseURL->GetHost(aHost);
}

nsresult nsAddbookUrl::SetHost(const nsACString& aHost) {
  return NS_MutateURI(m_baseURL).SetHost(aHost).Finalize(m_baseURL);
}

NS_IMETHODIMP nsAddbookUrl::GetPort(int32_t* aPort) {
  return m_baseURL->GetPort(aPort);
}

nsresult nsAddbookUrl::SetPort(int32_t aPort) {
  return NS_MutateURI(m_baseURL).SetPort(aPort).Finalize(m_baseURL);
}

NS_IMETHODIMP nsAddbookUrl::GetPathQueryRef(nsACString& aPath) {
  return m_baseURL->GetPathQueryRef(aPath);
}

nsresult nsAddbookUrl::SetPathQueryRef(const nsACString& aPath) {
  nsresult rv =
      NS_MutateURI(m_baseURL).SetPathQueryRef(aPath).Finalize(m_baseURL);
  NS_ENSURE_SUCCESS(rv, rv);
  return ParseUrl();
}

NS_IMETHODIMP nsAddbookUrl::GetAsciiHost(nsACString& aHostA) {
  return m_baseURL->GetAsciiHost(aHostA);
}

NS_IMETHODIMP nsAddbookUrl::GetAsciiHostPort(nsACString& aHostPortA) {
  return m_baseURL->GetAsciiHostPort(aHostPortA);
}

NS_IMETHODIMP nsAddbookUrl::GetAsciiSpec(nsACString& aSpecA) {
  return m_baseURL->GetAsciiSpec(aSpecA);
}

NS_IMETHODIMP nsAddbookUrl::SchemeIs(const char* aScheme, bool* _retval) {
  return m_baseURL->SchemeIs(aScheme, _retval);
}

NS_IMETHODIMP nsAddbookUrl::Equals(nsIURI* other, bool* _retval) {
  // The passed-in URI might be an nsMailtoUrl. Pass our inner URL to its
  // Equals method. The other nsMailtoUrl will then pass its inner URL to
  // to the Equals method of our inner URL. Other URIs will return false.
  if (other) return other->Equals(m_baseURL, _retval);

  return m_baseURL->Equals(other, _retval);
}

nsresult nsAddbookUrl::Clone(nsIURI** _retval) {
  NS_ENSURE_ARG_POINTER(_retval);

  RefPtr<nsAddbookUrl> clone = new nsAddbookUrl();

  if (!clone) return NS_ERROR_OUT_OF_MEMORY;

  nsresult rv = NS_MutateURI(m_baseURL).Finalize(clone->m_baseURL);
  NS_ENSURE_SUCCESS(rv, rv);
  clone->ParseUrl();
  clone.forget(_retval);
  return NS_OK;
}

NS_IMETHODIMP nsAddbookUrl::Resolve(const nsACString& relativePath,
                                    nsACString& result) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsAddbookUrl::GetRef(nsACString& result) { return m_baseURL->GetRef(result); }

nsresult nsAddbookUrl::SetRef(const nsACString& aRef) {
  nsresult rv = NS_MutateURI(m_baseURL).SetRef(aRef).Finalize(m_baseURL);
  NS_ENSURE_SUCCESS(rv, rv);
  return ParseUrl();
}

NS_IMETHODIMP
nsAddbookUrl::GetFilePath(nsACString& aFilePath) {
  return m_baseURL->GetFilePath(aFilePath);
}

nsresult nsAddbookUrl::SetFilePath(const nsACString& aFilePath) {
  return NS_MutateURI(m_baseURL).SetFilePath(aFilePath).Finalize(m_baseURL);
}

NS_IMETHODIMP
nsAddbookUrl::GetQuery(nsACString& aQuery) {
  return m_baseURL->GetQuery(aQuery);
}

nsresult nsAddbookUrl::SetQuery(const nsACString& aQuery) {
  return NS_MutateURI(m_baseURL).SetQuery(aQuery).Finalize(m_baseURL);
}

nsresult nsAddbookUrl::SetQueryWithEncoding(
    const nsACString& aQuery, const mozilla::Encoding* aEncoding) {
  return NS_MutateURI(m_baseURL)
      .SetQueryWithEncoding(aQuery, aEncoding)
      .Finalize(m_baseURL);
}

NS_IMETHODIMP_(void)
nsAddbookUrl::Serialize(mozilla::ipc::URIParams& aParams) {
  m_baseURL->Serialize(aParams);
}

NS_IMETHODIMP nsAddbookUrl::EqualsExceptRef(nsIURI* other, bool* _retval) {
  // The passed-in URI might be an nsMailtoUrl. Pass our inner URL to its
  // Equals method. The other nsMailtoUrl will then pass its inner URL to
  // to the Equals method of our inner URL. Other URIs will return false.
  if (other) return other->EqualsExceptRef(m_baseURL, _retval);

  return m_baseURL->EqualsExceptRef(other, _retval);
}

NS_IMETHODIMP
nsAddbookUrl::GetSpecIgnoringRef(nsACString& result) {
  return m_baseURL->GetSpecIgnoringRef(result);
}

NS_IMETHODIMP
nsAddbookUrl::GetDisplaySpec(nsACString& aUnicodeSpec) {
  return GetSpec(aUnicodeSpec);
}

NS_IMETHODIMP
nsAddbookUrl::GetDisplayHostPort(nsACString& aUnicodeHostPort) {
  return GetHostPort(aUnicodeHostPort);
}

NS_IMETHODIMP
nsAddbookUrl::GetDisplayHost(nsACString& aUnicodeHost) {
  return GetHost(aUnicodeHost);
}

NS_IMETHODIMP
nsAddbookUrl::GetDisplayPrePath(nsACString& aPrePath) {
  return GetPrePath(aPrePath);
}

NS_IMETHODIMP
nsAddbookUrl::GetHasRef(bool* result) { return m_baseURL->GetHasRef(result); }

//
// Specific nsAddbookUrl operations
//
NS_IMETHODIMP
nsAddbookUrl::GetAddbookOperation(int32_t* _retval) {
  *_retval = mOperationType;
  return NS_OK;
}

NS_IMPL_ISUPPORTS(nsAddbookUrl::Mutator, nsIURISetters, nsIURIMutator)

NS_IMETHODIMP
nsAddbookUrl::Mutate(nsIURIMutator** aMutator) {
  RefPtr<nsAddbookUrl::Mutator> mutator = new nsAddbookUrl::Mutator();
  nsresult rv = mutator->InitFromURI(this);
  if (NS_FAILED(rv)) {
    return rv;
  }
  mutator.forget(aMutator);
  return NS_OK;
}
