/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsLDAPURL.h"
#include "netCore.h"
#include "plstr.h"
#include "nsCOMPtr.h"
#include "nsNetCID.h"
#include "nsComponentManagerUtils.h"
#include "nsIStandardURL.h"
#include "nsMsgUtils.h"
#include "nsUnicharUtils.h"
#include "mozilla/Encoding.h"

// The two schemes we support, LDAP and LDAPS
//
constexpr auto LDAP_SCHEME = "ldap"_ns;
constexpr auto LDAP_SSL_SCHEME = "ldaps"_ns;

NS_IMPL_ISUPPORTS(nsLDAPURL, nsILDAPURL, nsIURI)

nsLDAPURL::nsLDAPURL() : mScope(SCOPE_BASE), mOptions(0) {}

nsLDAPURL::~nsLDAPURL() {}

nsresult nsLDAPURL::Init(uint32_t aUrlType, int32_t aDefaultPort,
                         const nsACString& aSpec, const char* aOriginCharset,
                         nsIURI* aBaseURI) {
  nsresult rv;
  nsCOMPtr<nsIURI> base(aBaseURI);
  rv = NS_MutateURI(NS_STANDARDURLMUTATOR_CONTRACTID)
           .Apply(&nsIStandardURLMutator::Init,
                  nsIStandardURL::URLTYPE_STANDARD, aDefaultPort,
                  PromiseFlatCString(aSpec), aOriginCharset, aBaseURI, nullptr)
           .Finalize(mBaseURL);
  NS_ENSURE_SUCCESS(rv, rv);

  // Now get the spec from the mBaseURL in case it was a relative one
  nsCString spec;
  rv = mBaseURL->GetSpec(spec);
  NS_ENSURE_SUCCESS(rv, rv);

  return SetSpecInternal(spec);
}

void nsLDAPURL::GetPathInternal(nsCString& aPath) {
  aPath.Assign('/');

  if (!mDN.IsEmpty()) aPath.Append(mDN);

  if (!mAttributes.IsEmpty()) aPath.Append('?');

  // If mAttributes isn't empty, cut off the internally stored commas at start
  // and end, and append to the path.
  if (!mAttributes.IsEmpty())
    aPath.Append(Substring(mAttributes, 1, mAttributes.Length() - 2));

  if (mScope || !mFilter.IsEmpty()) {
    aPath.Append((mAttributes.IsEmpty() ? "??" : "?"));
    if (mScope) {
      if (mScope == SCOPE_ONELEVEL)
        aPath.Append("one");
      else if (mScope == SCOPE_SUBTREE)
        aPath.Append("sub");
    }
    if (!mFilter.IsEmpty()) {
      aPath.Append('?');
      aPath.Append(mFilter);
    }
  }
}

nsresult nsLDAPURL::SetPathInternal(const nsCString& aPath) {
  nsCOMPtr<nsILDAPURLParser> parser =
      do_CreateInstance("@mozilla.org/network/ldap-url-parser;1");
  nsCOMPtr<nsILDAPURLParserResult> parserResult;
  nsresult rv = parser->Parse(aPath, getter_AddRefs(parserResult));
  NS_ENSURE_SUCCESS(rv, rv);

  parserResult->GetDn(mDN);
  parserResult->GetScope(&mScope);
  parserResult->GetFilter(mFilter);
  parserResult->GetOptions(&mOptions);

  nsCString attributes;
  parserResult->GetAttributes(attributes);
  mAttributes.Truncate();
  if (!attributes.IsEmpty()) {
    // Always start and end with a comma if not empty.
    mAttributes.Append(',');
    mAttributes.Append(attributes);
    mAttributes.Append(',');
  }

  return NS_OK;
}

// A string representation of the URI. Setting the spec
// causes the new spec to be parsed, initializing the URI. Setting
// the spec (or any of the accessors) causes also any currently
// open streams on the URI's channel to be closed.

NS_IMETHODIMP
nsLDAPURL::GetSpec(nsACString& _retval) {
  if (!mBaseURL) return NS_ERROR_NOT_INITIALIZED;

  return mBaseURL->GetSpec(_retval);
}

nsresult nsLDAPURL::SetSpecInternal(const nsACString& aSpec) {
  if (!mBaseURL) return NS_ERROR_NOT_INITIALIZED;

  // Cache the original spec in case we don't like what we've been passed and
  // need to reset ourselves.
  nsCString originalSpec;
  nsresult rv = mBaseURL->GetSpec(originalSpec);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = NS_MutateURI(mBaseURL).SetSpec(aSpec).Finalize(mBaseURL);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = SetPathInternal(PromiseFlatCString(aSpec));
  if (NS_FAILED(rv)) {
    nsresult rv2 =
        NS_MutateURI(mBaseURL).SetSpec(originalSpec).Finalize(mBaseURL);
    NS_ENSURE_SUCCESS(rv2, rv2);
  }

  return rv;
}

NS_IMETHODIMP nsLDAPURL::GetPrePath(nsACString& _retval) {
  if (!mBaseURL) return NS_ERROR_NOT_INITIALIZED;

  return mBaseURL->GetPrePath(_retval);
}

NS_IMETHODIMP nsLDAPURL::GetScheme(nsACString& _retval) {
  if (!mBaseURL) return NS_ERROR_NOT_INITIALIZED;

  return mBaseURL->GetScheme(_retval);
}

nsresult nsLDAPURL::SetScheme(const nsACString& aScheme) {
  if (!mBaseURL) return NS_ERROR_NOT_INITIALIZED;

  if (aScheme.Equals(LDAP_SCHEME, nsCaseInsensitiveCStringComparator))
    mOptions &= ~OPT_SECURE;
  else if (aScheme.Equals(LDAP_SSL_SCHEME, nsCaseInsensitiveCStringComparator))
    mOptions |= OPT_SECURE;
  else
    return NS_ERROR_MALFORMED_URI;

  return NS_MutateURI(mBaseURL).SetScheme(aScheme).Finalize(mBaseURL);
}

NS_IMETHODIMP
nsLDAPURL::GetUserPass(nsACString& _retval) {
  _retval.Truncate();
  return NS_OK;
}

nsresult nsLDAPURL::SetUserPass(const nsACString& aUserPass) { return NS_OK; }

NS_IMETHODIMP
nsLDAPURL::GetUsername(nsACString& _retval) {
  _retval.Truncate();
  return NS_OK;
}

nsresult nsLDAPURL::SetUsername(const nsACString& aUsername) { return NS_OK; }

NS_IMETHODIMP
nsLDAPURL::GetPassword(nsACString& _retval) {
  _retval.Truncate();
  return NS_OK;
}

nsresult nsLDAPURL::SetPassword(const nsACString& aPassword) { return NS_OK; }

NS_IMETHODIMP
nsLDAPURL::GetHostPort(nsACString& _retval) {
  if (!mBaseURL) return NS_ERROR_NOT_INITIALIZED;

  return mBaseURL->GetHostPort(_retval);
}

nsresult nsLDAPURL::SetHostPort(const nsACString& aHostPort) {
  if (!mBaseURL) return NS_ERROR_NOT_INITIALIZED;

  return NS_MutateURI(mBaseURL).SetHostPort(aHostPort).Finalize(mBaseURL);
}

NS_IMETHODIMP
nsLDAPURL::GetHost(nsACString& _retval) {
  if (!mBaseURL) return NS_ERROR_NOT_INITIALIZED;

  return mBaseURL->GetHost(_retval);
}

nsresult nsLDAPURL::SetHost(const nsACString& aHost) {
  if (!mBaseURL) return NS_ERROR_NOT_INITIALIZED;

  return NS_MutateURI(mBaseURL).SetHost(aHost).Finalize(mBaseURL);
}

NS_IMETHODIMP
nsLDAPURL::GetPort(int32_t* _retval) {
  if (!mBaseURL) return NS_ERROR_NOT_INITIALIZED;

  return mBaseURL->GetPort(_retval);
}

nsresult nsLDAPURL::SetPort(int32_t aPort) {
  if (!mBaseURL) return NS_ERROR_NOT_INITIALIZED;

  return NS_MutateURI(mBaseURL).SetPort(aPort).Finalize(mBaseURL);
}

NS_IMETHODIMP nsLDAPURL::GetPathQueryRef(nsACString& _retval) {
  if (!mBaseURL) return NS_ERROR_NOT_INITIALIZED;

  return mBaseURL->GetPathQueryRef(_retval);
}

nsresult nsLDAPURL::SetPathQueryRef(const nsACString& aPath) {
  if (!mBaseURL) return NS_ERROR_NOT_INITIALIZED;

  nsresult rv = SetPathInternal(PromiseFlatCString(aPath));
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_MutateURI(mBaseURL).SetPathQueryRef(aPath).Finalize(mBaseURL);
}

NS_IMETHODIMP nsLDAPURL::GetAsciiSpec(nsACString& _retval) {
  if (!mBaseURL) return NS_ERROR_NOT_INITIALIZED;

  // XXX handle extra items?
  return mBaseURL->GetAsciiSpec(_retval);
}

NS_IMETHODIMP nsLDAPURL::GetAsciiHost(nsACString& _retval) {
  if (!mBaseURL) return NS_ERROR_NOT_INITIALIZED;

  return mBaseURL->GetAsciiHost(_retval);
}

NS_IMETHODIMP
nsLDAPURL::GetAsciiHostPort(nsACString& _retval) {
  if (!mBaseURL) return NS_ERROR_NOT_INITIALIZED;

  return mBaseURL->GetAsciiHostPort(_retval);
}

// boolean equals (in nsIURI other)
// (based on nsSimpleURI::Equals)
NS_IMETHODIMP nsLDAPURL::Equals(nsIURI* other, bool* _retval) {
  *_retval = false;
  if (other) {
    nsresult rv;
    nsCOMPtr<nsILDAPURL> otherURL(do_QueryInterface(other, &rv));
    if (NS_SUCCEEDED(rv)) {
      nsAutoCString thisSpec, otherSpec;
      uint32_t otherOptions;

      rv = GetSpec(thisSpec);
      NS_ENSURE_SUCCESS(rv, rv);

      rv = otherURL->GetSpec(otherSpec);
      NS_ENSURE_SUCCESS(rv, rv);

      rv = otherURL->GetOptions(&otherOptions);
      NS_ENSURE_SUCCESS(rv, rv);

      if (thisSpec == otherSpec && mOptions == otherOptions) *_retval = true;
    }
  }
  return NS_OK;
}

// boolean schemeIs(in const char * scheme);
//
NS_IMETHODIMP nsLDAPURL::SchemeIs(const char* aScheme, bool* aEquals) {
  if (!mBaseURL) return NS_ERROR_NOT_INITIALIZED;

  return mBaseURL->SchemeIs(aScheme, aEquals);
}

// nsIURI clone ();
//
nsresult nsLDAPURL::Clone(nsIURI** aResult) {
  NS_ENSURE_ARG_POINTER(aResult);

  RefPtr<nsLDAPURL> clone = new nsLDAPURL();

  clone->mDN = mDN;
  clone->mScope = mScope;
  clone->mFilter = mFilter;
  clone->mOptions = mOptions;
  clone->mAttributes = mAttributes;

  nsresult rv = NS_MutateURI(mBaseURL).Finalize(clone->mBaseURL);
  NS_ENSURE_SUCCESS(rv, rv);

  clone.forget(aResult);
  return NS_OK;
}

// string resolve (in string relativePath);
//
NS_IMETHODIMP nsLDAPURL::Resolve(const nsACString& relativePath,
                                 nsACString& _retval) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

// The following attributes come from nsILDAPURL

// attribute AUTF8String dn;
//
NS_IMETHODIMP nsLDAPURL::GetDn(nsACString& _retval) {
  _retval.Assign(mDN);
  return NS_OK;
}
NS_IMETHODIMP nsLDAPURL::SetDn(const nsACString& aDn) {
  if (!mBaseURL) return NS_ERROR_NOT_INITIALIZED;

  mDN.Assign(aDn);

  // Now get the current path
  nsCString newPath;
  GetPathInternal(newPath);

  // and update the base url
  return NS_MutateURI(mBaseURL).SetPathQueryRef(newPath).Finalize(mBaseURL);
}

NS_IMETHODIMP nsLDAPURL::GetAttributes(nsACString& aAttributes) {
  if (mAttributes.IsEmpty()) {
    aAttributes.Truncate();
    return NS_OK;
  }

  NS_ASSERTION(
      mAttributes[0] == ',' && mAttributes[mAttributes.Length() - 1] == ',',
      "mAttributes does not begin and end with a comma");

  // We store the string internally with comma before and after, so strip
  // them off here.
  aAttributes = Substring(mAttributes, 1, mAttributes.Length() - 2);
  return NS_OK;
}

NS_IMETHODIMP nsLDAPURL::SetAttributes(const nsACString& aAttributes) {
  if (!mBaseURL) return NS_ERROR_NOT_INITIALIZED;

  if (aAttributes.IsEmpty())
    mAttributes.Truncate();
  else {
    // We need to make sure we start off the string with a comma.
    if (aAttributes[0] != ',') mAttributes = ',';

    mAttributes.Append(aAttributes);

    // Also end with a comma if appropriate.
    if (mAttributes[mAttributes.Length() - 1] != ',') mAttributes.Append(',');
  }

  // Now get the current path
  nsCString newPath;
  GetPathInternal(newPath);

  // and update the base url
  return NS_MutateURI(mBaseURL).SetPathQueryRef(newPath).Finalize(mBaseURL);
}

NS_IMETHODIMP nsLDAPURL::AddAttribute(const nsACString& aAttribute) {
  if (!mBaseURL) return NS_ERROR_NOT_INITIALIZED;

  if (mAttributes.IsEmpty()) {
    mAttributes = ',';
    mAttributes.Append(aAttribute);
    mAttributes.Append(',');
  } else {
    // Wrap the attribute in commas, so that we can do an exact match.
    nsAutoCString findAttribute(",");
    findAttribute.Append(aAttribute);
    findAttribute.Append(',');

    // Check to see if the attribute is already stored. If it is, then also
    // check to see if it is the last attribute in the string, or if the next
    // character is a comma, this means we won't match substrings.
    if (FindInReadable(findAttribute, mAttributes,
                       nsCaseInsensitiveCStringComparator)) {
      return NS_OK;
    }

    mAttributes.Append(Substring(findAttribute, 1));
  }

  // Now get the current path
  nsCString newPath;
  GetPathInternal(newPath);

  // and update the base url
  return NS_MutateURI(mBaseURL).SetPathQueryRef(newPath).Finalize(mBaseURL);
}

NS_IMETHODIMP nsLDAPURL::RemoveAttribute(const nsACString& aAttribute) {
  if (!mBaseURL) return NS_ERROR_NOT_INITIALIZED;

  if (mAttributes.IsEmpty()) return NS_OK;

  // We use comma as delimiter (even first attr has a leading comma).
  nsAutoCString findAttribute(",");
  findAttribute.Append(aAttribute);
  findAttribute.Append(',');

  if (!FindInReadable(findAttribute, mAttributes,
                      nsCaseInsensitiveCStringComparator)) {
    return NS_OK;
  }
  if (mAttributes.Equals(findAttribute, nsCaseInsensitiveCStringComparator)) {
    mAttributes.Truncate();
  } else {
    mAttributes.ReplaceSubstring(findAttribute, ","_ns);
  }

  // Now get the current path
  nsCString newPath;
  GetPathInternal(newPath);

  // and update the base url
  return NS_MutateURI(mBaseURL).SetPathQueryRef(newPath).Finalize(mBaseURL);
}

NS_IMETHODIMP nsLDAPURL::HasAttribute(const nsACString& aAttribute,
                                      bool* _retval) {
  NS_ENSURE_ARG_POINTER(_retval);

  // We use comma as delimiter (even first attr has a leading comma).
  nsAutoCString findAttribute(",");
  findAttribute.Append(aAttribute);
  findAttribute.Append(',');

  *_retval = FindInReadable(findAttribute, mAttributes,
                            nsCaseInsensitiveCStringComparator);
  return NS_OK;
}

NS_IMETHODIMP nsLDAPURL::GetScope(int32_t* _retval) {
  NS_ENSURE_ARG_POINTER(_retval);
  *_retval = mScope;
  return NS_OK;
}

NS_IMETHODIMP nsLDAPURL::SetScope(int32_t aScope) {
  if (!mBaseURL) return NS_ERROR_NOT_INITIALIZED;

  // Only allow scopes supported by the C-SDK
  if ((aScope != SCOPE_BASE) && (aScope != SCOPE_ONELEVEL) &&
      (aScope != SCOPE_SUBTREE))
    return NS_ERROR_MALFORMED_URI;

  mScope = aScope;

  // Now get the current path
  nsCString newPath;
  GetPathInternal(newPath);

  // and update the base url
  return NS_MutateURI(mBaseURL).SetPathQueryRef(newPath).Finalize(mBaseURL);
}

NS_IMETHODIMP nsLDAPURL::GetFilter(nsACString& _retval) {
  _retval.Assign(mFilter);
  return NS_OK;
}
NS_IMETHODIMP nsLDAPURL::SetFilter(const nsACString& aFilter) {
  if (!mBaseURL) return NS_ERROR_NOT_INITIALIZED;

  mFilter.Assign(aFilter);

  if (mFilter.IsEmpty()) mFilter.AssignLiteral("(objectclass=*)");

  // Now get the current path
  nsCString newPath;
  GetPathInternal(newPath);

  // and update the base url
  return NS_MutateURI(mBaseURL).SetPathQueryRef(newPath).Finalize(mBaseURL);
}

NS_IMETHODIMP nsLDAPURL::GetOptions(uint32_t* _retval) {
  NS_ENSURE_ARG_POINTER(_retval);
  *_retval = mOptions;
  return NS_OK;
}

NS_IMETHODIMP nsLDAPURL::SetOptions(uint32_t aOptions) {
  // Secure is the only option supported at the moment
  if ((mOptions & OPT_SECURE) == (aOptions & OPT_SECURE)) return NS_OK;

  mOptions = aOptions;

  if ((aOptions & OPT_SECURE) == OPT_SECURE) return SetScheme(LDAP_SSL_SCHEME);

  return SetScheme(LDAP_SCHEME);
}

nsresult nsLDAPURL::SetRef(const nsACString& aRef) {
  return NS_MutateURI(mBaseURL).SetRef(aRef).Finalize(mBaseURL);
}

NS_IMETHODIMP
nsLDAPURL::GetRef(nsACString& result) { return mBaseURL->GetRef(result); }

NS_IMETHODIMP nsLDAPURL::EqualsExceptRef(nsIURI* other, bool* result) {
  return mBaseURL->EqualsExceptRef(other, result);
}

NS_IMETHODIMP
nsLDAPURL::GetSpecIgnoringRef(nsACString& result) {
  return mBaseURL->GetSpecIgnoringRef(result);
}

NS_IMETHODIMP
nsLDAPURL::GetDisplaySpec(nsACString& aUnicodeSpec) {
  return mBaseURL->GetDisplaySpec(aUnicodeSpec);
}

NS_IMETHODIMP
nsLDAPURL::GetDisplayHostPort(nsACString& aUnicodeHostPort) {
  return mBaseURL->GetDisplayHostPort(aUnicodeHostPort);
}

NS_IMETHODIMP
nsLDAPURL::GetDisplayHost(nsACString& aUnicodeHost) {
  return mBaseURL->GetDisplayHost(aUnicodeHost);
}

NS_IMETHODIMP
nsLDAPURL::GetDisplayPrePath(nsACString& aPrePath) {
  return mBaseURL->GetDisplayPrePath(aPrePath);
}

NS_IMETHODIMP
nsLDAPURL::GetHasRef(bool* result) { return mBaseURL->GetHasRef(result); }

NS_IMETHODIMP nsLDAPURL::GetHasUserPass(bool* aHasUserPass) {
  *aHasUserPass = false;
  return NS_OK;
}

NS_IMETHODIMP
nsLDAPURL::GetFilePath(nsACString& aFilePath) {
  return mBaseURL->GetFilePath(aFilePath);
}

nsresult nsLDAPURL::SetFilePath(const nsACString& aFilePath) {
  return NS_MutateURI(mBaseURL).SetFilePath(aFilePath).Finalize(mBaseURL);
}

NS_IMETHODIMP
nsLDAPURL::GetQuery(nsACString& aQuery) { return mBaseURL->GetQuery(aQuery); }

nsresult nsLDAPURL::SetQuery(const nsACString& aQuery) {
  return NS_MutateURI(mBaseURL).SetQuery(aQuery).Finalize(mBaseURL);
}

NS_IMETHODIMP nsLDAPURL::GetHasQuery(bool* aHasQuery) {
  return mBaseURL->GetHasQuery(aHasQuery);
}

nsresult nsLDAPURL::SetQueryWithEncoding(const nsACString& aQuery,
                                         const mozilla::Encoding* aEncoding) {
  return NS_MutateURI(mBaseURL)
      .SetQueryWithEncoding(aQuery, aEncoding)
      .Finalize(mBaseURL);
}

NS_IMETHODIMP_(void)
nsLDAPURL::Serialize(mozilla::ipc::URIParams& aParams) {
  mBaseURL->Serialize(aParams);
}

NS_IMPL_ISUPPORTS(nsLDAPURL::Mutator, nsIURISetters, nsIURIMutator)

NS_IMETHODIMP
nsLDAPURL::Mutate(nsIURIMutator** aMutator) {
  RefPtr<nsLDAPURL::Mutator> mutator = new nsLDAPURL::Mutator();
  nsresult rv = mutator->InitFromURI(this);
  if (NS_FAILED(rv)) {
    return rv;
  }
  mutator.forget(aMutator);
  return NS_OK;
}
