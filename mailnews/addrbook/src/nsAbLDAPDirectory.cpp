/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsAbLDAPDirectory.h"
#include "nsIAbCard.h"

#include "nsAbQueryStringToExpression.h"

#include "nsAbBaseCID.h"
#include "nsServiceManagerUtils.h"
#include "nsComponentManagerUtils.h"
#include "nsNetCID.h"
#include "nsIIOService.h"
#include "nsCOMArray.h"
#include "nsEnumeratorUtils.h"
#include "nsIAbLDAPAttributeMap.h"
#include "nsIAbManager.h"
#include "nsILDAPURL.h"
#include "nsILDAPConnection.h"
#include "nsAppDirectoryServiceDefs.h"
#include "nsDirectoryServiceUtils.h"
#include "nsIFile.h"
#include "nsILDAPModification.h"
#include "nsILDAPService.h"
#include "nsAbUtils.h"
#include "nsIPrefService.h"
#include "nsIMsgAccountManager.h"
#include "nsMsgBaseCID.h"
#include "nsMsgUtils.h"
#include "mozilla/Services.h"
#include "nsIWeakReference.h"

#define kDefaultMaxHits 100

using namespace mozilla;

nsAbLDAPDirectory::nsAbLDAPDirectory() : nsAbDirProperty(), mContext(0) {}

nsAbLDAPDirectory::~nsAbLDAPDirectory() {}

NS_IMPL_ISUPPORTS_INHERITED(nsAbLDAPDirectory, nsAbDirProperty,
                            nsISupportsWeakReference, nsIAbLDAPDirectory)

NS_IMETHODIMP nsAbLDAPDirectory::GetPropertiesChromeURI(nsACString& aResult) {
  aResult.AssignLiteral(
      "chrome://messenger/content/addressbook/pref-directory-add.xhtml");
  return NS_OK;
}

NS_IMETHODIMP nsAbLDAPDirectory::Init(const char* aURI) {
  // We need to ensure that the m_DirPrefId is initialized properly
  nsAutoCString uri(aURI);

  // Find the first ? (of the search params) if there is one.
  // We know we can start at the end of the moz-abldapdirectory:// because
  // that's the URI we should have been passed.
  int32_t searchCharLocation = uri.FindChar('?', kLDAPDirectoryRootLen);

  if (searchCharLocation == -1)
    m_DirPrefId = Substring(uri, kLDAPDirectoryRootLen);
  else
    m_DirPrefId = Substring(uri, kLDAPDirectoryRootLen,
                            searchCharLocation - kLDAPDirectoryRootLen);

  return nsAbDirProperty::Init(aURI);
}

/*
 *
 * nsIAbDirectory methods
 *
 */

NS_IMETHODIMP nsAbLDAPDirectory::GetURI(nsACString& aURI) {
  if (mURI.IsEmpty()) return NS_ERROR_NOT_INITIALIZED;

  aURI = mURI;
  return NS_OK;
}

NS_IMETHODIMP nsAbLDAPDirectory::GetChildNodes(
    nsTArray<RefPtr<nsIAbDirectory>>& aResult) {
  aResult.Clear();
  return NS_OK;
}

NS_IMETHODIMP nsAbLDAPDirectory::GetChildCards(
    nsTArray<RefPtr<nsIAbCard>>& result) {
  nsresult rv;
  result.Clear();

  // When offline, get the child cards from the local, replicated directory.
  bool offline;
  nsCOMPtr<nsIIOService> ioService = mozilla::services::GetIOService();
  NS_ENSURE_TRUE(ioService, NS_ERROR_UNEXPECTED);
  rv = ioService->GetOffline(&offline);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!offline) {
    // No results when online. This seems unintuitive, but seems to be
    // because GetChildCards() is used for autocomplete, and the LDAP
    // UseForAutocomplete() returns false when online.
    // (See the comments about useForAutoComplete() in nsIAbDirectory.idl)
    return NS_OK;
  }

  nsCString fileName;
  rv = GetReplicationFileName(fileName);
  NS_ENSURE_SUCCESS(rv, rv);

  // If there is no fileName, bail out now.
  if (fileName.IsEmpty()) {
    return NS_OK;
  }

  // Get the local directory.
  nsAutoCString localDirectoryURI(nsLiteralCString(kJSDirectoryRoot));
  localDirectoryURI.Append(fileName);

  nsCOMPtr<nsIAbDirectory> directory =
      do_CreateInstance(NS_ABJSDIRECTORY_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = directory->Init(localDirectoryURI.get());
  NS_ENSURE_SUCCESS(rv, rv);

  return directory->GetChildCards(result);
}

NS_IMETHODIMP nsAbLDAPDirectory::HasCard(nsIAbCard* card, bool* hasCard) {
  *hasCard = false;
  return NS_OK;
}

NS_IMETHODIMP nsAbLDAPDirectory::GetLDAPURL(nsILDAPURL** aResult) {
  NS_ENSURE_ARG_POINTER(aResult);

  // Rather than using GetURI here we call GetStringValue directly so
  // we can handle the case where the URI isn't specified (see comments
  // below)
  nsAutoCString URI;
  nsresult rv = GetStringValue("uri", EmptyCString(), URI);
  if (NS_FAILED(rv) || URI.IsEmpty()) {
    /*
     * A recent change in Mozilla now means that the LDAP Address Book
     * URI is based on the unique preference name value i.e.
     * [moz-abldapdirectory://prefName]
     * Prior to this valid change it was based on the actual uri i.e.
     * [moz-abldapdirectory://host:port/basedn]
     * Basing the resource on the prefName allows these attributes to
     * change.
     *
     * But the uri value was also the means by which third-party
     * products could integrate with Mozilla's LDAP Address Books
     * without necessarily having an entry in the preferences file
     * or more importantly needing to be able to change the
     * preferences entries. Thus to set the URI Spec now, it is
     * only necessary to read the uri pref entry, while in the
     * case where it is not a preference, we need to replace the
     * "moz-abldapdirectory".
     */
    URI = mURI;
    if (StringBeginsWith(URI, nsLiteralCString(kLDAPDirectoryRoot)))
      URI.Replace(0, kLDAPDirectoryRootLen, "ldap://"_ns);
  }

  nsCOMPtr<nsIIOService> ioService = mozilla::services::GetIOService();
  NS_ENSURE_TRUE(ioService, NS_ERROR_UNEXPECTED);

  nsCOMPtr<nsIURI> result;
  rv = ioService->NewURI(URI, nullptr, nullptr, getter_AddRefs(result));
  NS_ENSURE_SUCCESS(rv, rv);

  return CallQueryInterface(result, aResult);
}

NS_IMETHODIMP nsAbLDAPDirectory::SetLDAPURL(nsILDAPURL* aUrl) {
  NS_ENSURE_ARG_POINTER(aUrl);

  nsAutoCString oldUrl;
  // Note, it doesn't matter if GetStringValue fails - we'll just send an
  // update if its blank (i.e. old value not set).
  GetStringValue("uri", EmptyCString(), oldUrl);

  // Actually set the new value.
  nsCString tempLDAPURL;
  nsresult rv = aUrl->GetSpec(tempLDAPURL);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = SetStringValue("uri", tempLDAPURL);
  NS_ENSURE_SUCCESS(rv, rv);

  // Now we need to send an update which will ensure our indicators and
  // listeners get updated correctly.

  // See if they both start with ldaps: or ldap:
  bool newIsNotSecure = StringBeginsWith(tempLDAPURL, "ldap:"_ns);

  if (oldUrl.IsEmpty() ||
      StringBeginsWith(oldUrl, "ldap:"_ns) != newIsNotSecure) {
    // They don't so its time to send round an update.
    nsCOMPtr<nsIAbManager> abManager =
        do_GetService(NS_ABMANAGER_CONTRACTID, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  return NS_OK;
}

NS_IMETHODIMP nsAbLDAPDirectory::Search(const nsAString& query,
                                        const nsAString& searchString,
                                        nsIAbDirSearchListener* listener) {
  // When offline, get the child cards from the local, replicated directory.
  bool offline;
  nsCOMPtr<nsIIOService> ioService = mozilla::services::GetIOService();
  NS_ENSURE_TRUE(ioService, NS_ERROR_UNEXPECTED);
  nsresult rv = ioService->GetOffline(&offline);
  NS_ENSURE_SUCCESS(rv, rv);

  if (offline) {
    nsCString fileName;
    rv = GetReplicationFileName(fileName);
    NS_ENSURE_SUCCESS(rv, rv);

    // If there is no fileName, bail out now.
    if (fileName.IsEmpty()) {
      listener->OnSearchFinished(NS_OK, true, nullptr, ""_ns);
      return NS_OK;
    }

    // Get the local directory.
    nsAutoCString localDirectoryURI(nsLiteralCString(kJSDirectoryRoot));
    localDirectoryURI.Append(fileName);

    nsCOMPtr<nsIAbDirectory> directory =
        do_CreateInstance(NS_ABJSDIRECTORY_CONTRACTID, &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    rv = directory->Init(localDirectoryURI.get());
    NS_ENSURE_SUCCESS(rv, rv);

    // Perform the query.
    return directory->Search(query, searchString, listener);
  }

  nsCOMPtr<nsIAbDirectoryQueryArguments> arguments =
      do_CreateInstance(NS_ABDIRECTORYQUERYARGUMENTS_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIAbBooleanExpression> expression;
  rv = nsAbQueryStringToExpression::Convert(NS_ConvertUTF16toUTF8(query),
                                            getter_AddRefs(expression));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = arguments->SetExpression(expression);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = arguments->SetQuerySubDirectories(true);
  NS_ENSURE_SUCCESS(rv, rv);

  // Get the max hits to return.
  int32_t maxHits;
  rv = GetMaxHits(&maxHits);
  if (NS_FAILED(rv)) maxHits = kDefaultMaxHits;

  // Get the appropriate ldap attribute map, and pass it in via the
  // TypeSpecificArgument.
  nsCOMPtr<nsIAbLDAPAttributeMap> attrMap;
  rv = GetAttributeMap(getter_AddRefs(attrMap));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = arguments->SetTypeSpecificArg(attrMap);
  NS_ENSURE_SUCCESS(rv, rv);

  mDirectoryQuery = do_CreateInstance(NS_ABLDAPDIRECTORYQUERY_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  // Perform the query.
  return mDirectoryQuery->DoQuery(this, arguments, listener, maxHits, 0,
                                  &mContext);
}

NS_IMETHODIMP nsAbLDAPDirectory::GetSupportsMailingLists(
    bool* aSupportsMailingsLists) {
  NS_ENSURE_ARG_POINTER(aSupportsMailingsLists);
  *aSupportsMailingsLists = false;
  return NS_OK;
}

NS_IMETHODIMP nsAbLDAPDirectory::GetReadOnly(bool* aReadOnly) {
  NS_ENSURE_ARG_POINTER(aReadOnly);
  *aReadOnly = true;
  return NS_OK;
}

NS_IMETHODIMP nsAbLDAPDirectory::GetIsRemote(bool* aIsRemote) {
  NS_ENSURE_ARG_POINTER(aIsRemote);
  *aIsRemote = true;
  return NS_OK;
}

NS_IMETHODIMP nsAbLDAPDirectory::GetIsSecure(bool* aIsSecure) {
  NS_ENSURE_ARG_POINTER(aIsSecure);

  nsAutoCString URI;
  nsresult rv = GetStringValue("uri", EmptyCString(), URI);
  NS_ENSURE_SUCCESS(rv, rv);

  // to determine if this is a secure directory, check if the uri is ldaps:// or
  // not
  *aIsSecure = (strncmp(URI.get(), "ldaps:", 6) == 0);
  return NS_OK;
}

NS_IMETHODIMP nsAbLDAPDirectory::UseForAutocomplete(
    const nsACString& aIdentityKey, bool* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);

  // Set this to false by default to make the code easier below.
  *aResult = false;

  nsresult rv;
  bool offline = false;
  nsCOMPtr<nsIIOService> ioService = mozilla::services::GetIOService();
  NS_ENSURE_TRUE(ioService, NS_ERROR_UNEXPECTED);

  rv = ioService->GetOffline(&offline);
  NS_ENSURE_SUCCESS(rv, rv);

  // If we're online, then don't allow search during local autocomplete - must
  // use the separate LDAP autocomplete session due to the current interfaces
  if (!offline) return NS_OK;

  // Is the use directory pref set for autocompletion?
  nsCOMPtr<nsIPrefBranch> prefs(do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  bool useDirectory = false;
  rv = prefs->GetBoolPref("ldap_2.autoComplete.useDirectory", &useDirectory);
  NS_ENSURE_SUCCESS(rv, rv);

  // No need to search if not set up globally for LDAP autocompletion and we've
  // not been given an identity.
  if (!useDirectory && aIdentityKey.IsEmpty()) return NS_OK;

  nsCString prefName;
  if (!aIdentityKey.IsEmpty()) {
    // If we have an identity string, try and find out the required directory
    // server.
    nsCOMPtr<nsIMsgAccountManager> accountManager =
        do_GetService(NS_MSGACCOUNTMANAGER_CONTRACTID, &rv);

    // If we failed, just return, we can't do much about this.
    if (NS_SUCCEEDED(rv)) {
      nsCOMPtr<nsIMsgIdentity> identity;
      rv = accountManager->GetIdentity(aIdentityKey, getter_AddRefs(identity));
      if (NS_SUCCEEDED(rv)) {
        bool overrideGlobalPref = false;
        identity->GetOverrideGlobalPref(&overrideGlobalPref);
        if (overrideGlobalPref) identity->GetDirectoryServer(prefName);
      }
    }

    // If the preference name is still empty but useDirectory is false, then
    // the global one is not available, nor is the overridden one.
    if (prefName.IsEmpty() && !useDirectory) return NS_OK;
  }

  // If we failed to get the identity preference, or the pref name is empty
  // try the global preference.
  if (prefName.IsEmpty()) {
    nsresult rv =
        prefs->GetCharPref("ldap_2.autoComplete.directoryServer", prefName);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // Now see if the pref name matches our pref id.
  if (prefName.Equals(m_DirPrefId)) {
    // Yes it does, one last check - does the replication file exist?
    nsresult rv;
    nsCOMPtr<nsIFile> databaseFile;
    // If we can't get the file, then there is no database to use
    if (NS_FAILED(GetReplicationFile(getter_AddRefs(databaseFile))))
      return NS_OK;

    bool exists;
    rv = databaseFile->Exists(&exists);
    NS_ENSURE_SUCCESS(rv, rv);

    *aResult = exists;
  }
  return NS_OK;
}

NS_IMETHODIMP nsAbLDAPDirectory::GetProtocolVersion(
    uint32_t* aProtocolVersion) {
  nsAutoCString versionString;

  nsresult rv = GetStringValue("protocolVersion", "3"_ns, versionString);
  NS_ENSURE_SUCCESS(rv, rv);

  *aProtocolVersion = versionString.EqualsLiteral("3")
                          ? (uint32_t)nsILDAPConnection::VERSION3
                          : (uint32_t)nsILDAPConnection::VERSION2;

  return NS_OK;
}

NS_IMETHODIMP nsAbLDAPDirectory::SetProtocolVersion(uint32_t aProtocolVersion) {
  // XXX We should cancel any existing LDAP connections here and
  // be ready to re-initialise them with the new auth details.
  return SetStringValue(
      "protocolVersion",
      aProtocolVersion == nsILDAPConnection::VERSION3 ? "3"_ns : "2"_ns);
}

NS_IMETHODIMP nsAbLDAPDirectory::GetMaxHits(int32_t* aMaxHits) {
  return GetIntValue("maxHits", kDefaultMaxHits, aMaxHits);
}

NS_IMETHODIMP nsAbLDAPDirectory::SetMaxHits(int32_t aMaxHits) {
  return SetIntValue("maxHits", aMaxHits);
}

NS_IMETHODIMP nsAbLDAPDirectory::GetReplicationFileName(
    nsACString& aReplicationFileName) {
  return GetStringValue("filename", EmptyCString(), aReplicationFileName);
}

NS_IMETHODIMP nsAbLDAPDirectory::SetReplicationFileName(
    const nsACString& aReplicationFileName) {
  return SetStringValue("filename", aReplicationFileName);
}

NS_IMETHODIMP nsAbLDAPDirectory::GetAuthDn(nsACString& aAuthDn) {
  return GetStringValue("auth.dn", EmptyCString(), aAuthDn);
}

NS_IMETHODIMP nsAbLDAPDirectory::SetAuthDn(const nsACString& aAuthDn) {
  // XXX We should cancel any existing LDAP connections here and
  // be ready to re-initialise them with the new auth details.
  return SetStringValue("auth.dn", aAuthDn);
}

NS_IMETHODIMP nsAbLDAPDirectory::GetSaslMechanism(nsACString& aSaslMechanism) {
  return GetStringValue("auth.saslmech", EmptyCString(), aSaslMechanism);
}

NS_IMETHODIMP nsAbLDAPDirectory::SetSaslMechanism(
    const nsACString& aSaslMechanism) {
  return SetStringValue("auth.saslmech", aSaslMechanism);
}

NS_IMETHODIMP nsAbLDAPDirectory::GetLastChangeNumber(
    int32_t* aLastChangeNumber) {
  return GetIntValue("lastChangeNumber", -1, aLastChangeNumber);
}

NS_IMETHODIMP nsAbLDAPDirectory::SetLastChangeNumber(
    int32_t aLastChangeNumber) {
  return SetIntValue("lastChangeNumber", aLastChangeNumber);
}

NS_IMETHODIMP nsAbLDAPDirectory::GetDataVersion(nsACString& aDataVersion) {
  return GetStringValue("dataVersion", EmptyCString(), aDataVersion);
}

NS_IMETHODIMP nsAbLDAPDirectory::SetDataVersion(
    const nsACString& aDataVersion) {
  return SetStringValue("dataVersion", aDataVersion);
}

NS_IMETHODIMP nsAbLDAPDirectory::GetAttributeMap(
    nsIAbLDAPAttributeMap** aAttributeMap) {
  NS_ENSURE_ARG_POINTER(aAttributeMap);

  nsresult rv;
  nsCOMPtr<nsIAbLDAPAttributeMapService> mapSvc = do_GetService(
      "@mozilla.org/addressbook/ldap-attribute-map-service;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  return mapSvc->GetMapForPrefBranch(m_DirPrefId, aAttributeMap);
}

NS_IMETHODIMP nsAbLDAPDirectory::GetReplicationFile(nsIFile** aResult) {
  NS_ENSURE_ARG_POINTER(aResult);

  nsCString fileName;
  nsresult rv = GetStringValue("filename", EmptyCString(), fileName);
  NS_ENSURE_SUCCESS(rv, rv);

  if (fileName.IsEmpty()) return NS_ERROR_NOT_INITIALIZED;

  nsCOMPtr<nsIFile> profileDir;
  rv = NS_GetSpecialDirectory(NS_APP_USER_PROFILE_50_DIR,
                              getter_AddRefs(profileDir));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = profileDir->AppendNative(fileName);
  NS_ENSURE_SUCCESS(rv, rv);

  profileDir.forget(aResult);

  return NS_OK;
}

NS_IMETHODIMP nsAbLDAPDirectory::AddCard(nsIAbCard* aUpdatedCard,
                                         nsIAbCard** aAddedCard) {
  return NS_ERROR_UNEXPECTED;
}

NS_IMETHODIMP nsAbLDAPDirectory::DeleteCards(
    const nsTArray<RefPtr<nsIAbCard>>& aCards) {
  return NS_ERROR_UNEXPECTED;
}

NS_IMETHODIMP nsAbLDAPDirectory::ModifyCard(nsIAbCard* aUpdatedCard) {
  return NS_ERROR_UNEXPECTED;
}

NS_IMETHODIMP nsAbLDAPDirectory::GetRdnAttributes(nsACString& aRdnAttributes) {
  return GetStringValue("rdnAttributes", "cn"_ns, aRdnAttributes);
}

NS_IMETHODIMP nsAbLDAPDirectory::SetRdnAttributes(
    const nsACString& aRdnAttributes) {
  return SetStringValue("rdnAttributes", aRdnAttributes);
}

NS_IMETHODIMP nsAbLDAPDirectory::GetObjectClasses(nsACString& aObjectClasses) {
  return GetStringValue(
      "objectClasses",
      "top,person,organizationalPerson,inetOrgPerson,mozillaAbPersonAlpha"_ns,
      aObjectClasses);
}

NS_IMETHODIMP nsAbLDAPDirectory::SetObjectClasses(
    const nsACString& aObjectClasses) {
  return SetStringValue("objectClasses", aObjectClasses);
}
