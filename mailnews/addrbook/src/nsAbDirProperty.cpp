/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsAbDirProperty.h"
#include "nsAbBaseCID.h"
#include "nsIAbCard.h"
#include "nsIPrefService.h"
#include "nsIPrefLocalizedString.h"
#include "nsServiceManagerUtils.h"
#include "nsComponentManagerUtils.h"
#include "prmem.h"
#include "nsIAbManager.h"
#include "nsArrayUtils.h"
#include "nsIUUIDGenerator.h"
#include "mozilla/Services.h"
#include "nsIObserverService.h"
#include "mozilla/dom/Promise.h"

using mozilla::ErrorResult;
using mozilla::dom::Promise;
using namespace mozilla;

// From nsDirPrefs
#define kDefaultPosition 1

nsAbDirProperty::nsAbDirProperty(void)
    : m_LastModifiedDate(0), mIsValidURI(false) {
  m_IsMailList = false;
  mUID = EmptyCString();
}

nsAbDirProperty::~nsAbDirProperty(void) {
#if 0
  // this code causes a regression #138647
  // don't turn it on until you figure it out
  if (m_AddressList) {
    uint32_t count;
    nsresult rv;
    rv = m_AddressList->GetLength(&count);
    NS_ASSERTION(NS_SUCCEEDED(rv), "Count failed");
    int32_t i;
    for (i = count - 1; i >= 0; i--)
      m_AddressList->RemoveElementAt(i);
  }
#endif
}

NS_IMPL_ISUPPORTS(nsAbDirProperty, nsIAbDirectory, nsISupportsWeakReference)

NS_IMETHODIMP nsAbDirProperty::GetPropertiesChromeURI(nsACString& aResult) {
  aResult.AssignLiteral(
      "chrome://messenger/content/addressbook/abAddressBookNameDialog.xhtml");
  return NS_OK;
}

NS_IMETHODIMP nsAbDirProperty::GetDirName(nsAString& aDirName) {
  if (m_DirPrefId.IsEmpty()) {
    aDirName = m_ListDirName;
    return NS_OK;
  }

  nsCString dirName;
  nsresult rv = GetLocalizedStringValue("description", EmptyCString(), dirName);
  NS_ENSURE_SUCCESS(rv, rv);

  // In TB 2 only some prefs had chrome:// URIs. We had code in place that would
  // only get the localized string pref for the particular address books that
  // were built-in.
  // Additionally, nsIPrefBranch::getComplexValue will only get a non-user-set,
  // non-locked pref value if it is a chrome:// URI and will get the string
  // value at that chrome URI. This breaks extensions/autoconfig that want to
  // set default pref values and allow users to change directory names.
  //
  // Now we have to support this, and so if for whatever reason we fail to get
  // the localized version, then we try and get the non-localized version
  // instead. If the string value is empty, then we'll just get the empty value
  // back here.
  if (dirName.IsEmpty()) {
    rv = GetStringValue("description", EmptyCString(), dirName);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  CopyUTF8toUTF16(dirName, aDirName);
  return NS_OK;
}

NS_IMETHODIMP nsAbDirProperty::SetDirName(const nsAString& aDirName) {
  if (m_DirPrefId.IsEmpty()) {
    m_ListDirName = aDirName;
    return NS_OK;
  }

  // Store the old value.
  nsString oldDirName;
  nsresult rv = GetDirName(oldDirName);
  NS_ENSURE_SUCCESS(rv, rv);

  // Save the new value
  rv = SetLocalizedStringValue("description", NS_ConvertUTF16toUTF8(aDirName));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIAbManager> abManager =
      do_GetService(NS_ABMANAGER_CONTRACTID, &rv);

  if (NS_SUCCEEDED(rv)) {
    nsCOMPtr<nsIObserverService> observerService =
        mozilla::services::GetObserverService();
    // We inherit from nsIAbDirectory, so this static cast should be safe.
    observerService->NotifyObservers(static_cast<nsIAbDirectory*>(this),
                                     "addrbook-directory-updated", u"DirName");
  }

  return NS_OK;
}

NS_IMETHODIMP nsAbDirProperty::GetDirType(int32_t* aDirType) {
  return GetIntValue("dirType", nsIAbManager::LDAP_DIRECTORY_TYPE, aDirType);
}

NS_IMETHODIMP nsAbDirProperty::GetFileName(nsACString& aFileName) {
  return GetStringValue("filename", EmptyCString(), aFileName);
}

NS_IMETHODIMP nsAbDirProperty::GetUID(nsACString& aUID) {
  nsresult rv = NS_OK;
  if (!mUID.IsEmpty()) {
    aUID = mUID;
    return rv;
  }
  if (!m_IsMailList) {
    rv = GetStringValue("uid", EmptyCString(), aUID);
    if (!aUID.IsEmpty()) {
      return rv;
    }
  }

  nsCOMPtr<nsIUUIDGenerator> uuidgen = mozilla::services::GetUUIDGenerator();
  NS_ENSURE_TRUE(uuidgen, NS_ERROR_FAILURE);

  nsID id;
  rv = uuidgen->GenerateUUIDInPlace(&id);
  NS_ENSURE_SUCCESS(rv, rv);

  char idString[NSID_LENGTH];
  id.ToProvidedString(idString);

  aUID.AppendASCII(idString + 1, NSID_LENGTH - 3);
  return SetUID(aUID);
}

NS_IMETHODIMP nsAbDirProperty::SetUID(const nsACString& aUID) {
  mUID = aUID;
  if (m_IsMailList) {
    return NS_OK;
  }
  return SetStringValue("uid", aUID);
}

NS_IMETHODIMP nsAbDirProperty::GetURI(nsACString& aURI) {
  // XXX Should we complete this for Mailing Lists?
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsAbDirProperty::GetPosition(int32_t* aPosition) {
  return GetIntValue("position", kDefaultPosition, aPosition);
}

NS_IMETHODIMP nsAbDirProperty::GetLastModifiedDate(
    uint32_t* aLastModifiedDate) {
  NS_ENSURE_ARG_POINTER(aLastModifiedDate);
  *aLastModifiedDate = m_LastModifiedDate;
  return NS_OK;
}

NS_IMETHODIMP nsAbDirProperty::SetLastModifiedDate(uint32_t aLastModifiedDate) {
  if (aLastModifiedDate) {
    m_LastModifiedDate = aLastModifiedDate;
  }
  return NS_OK;
}

NS_IMETHODIMP nsAbDirProperty::GetListNickName(nsAString& aListNickName) {
  aListNickName = m_ListNickName;
  return NS_OK;
}

NS_IMETHODIMP nsAbDirProperty::SetListNickName(const nsAString& aListNickName) {
  m_ListNickName = aListNickName;
  return NS_OK;
}

NS_IMETHODIMP nsAbDirProperty::GetDescription(nsAString& aDescription) {
  aDescription = m_Description;
  return NS_OK;
}

NS_IMETHODIMP nsAbDirProperty::SetDescription(const nsAString& aDescription) {
  m_Description = aDescription;
  return NS_OK;
}

NS_IMETHODIMP nsAbDirProperty::GetIsMailList(bool* aIsMailList) {
  *aIsMailList = m_IsMailList;
  return NS_OK;
}

NS_IMETHODIMP nsAbDirProperty::SetIsMailList(bool aIsMailList) {
  m_IsMailList = aIsMailList;
  return NS_OK;
}

NS_IMETHODIMP nsAbDirProperty::CopyMailList(nsIAbDirectory* srcList) {
  SetIsMailList(true);

  nsString str;
  srcList->GetDirName(str);
  SetDirName(str);
  srcList->GetListNickName(str);
  SetListNickName(str);
  srcList->GetDescription(str);
  SetDescription(str);

  nsAutoCString uid;
  srcList->GetUID(uid);
  SetUID(uid);

  return NS_OK;
}

NS_IMETHODIMP
nsAbDirProperty::Init(const char* aURI) {
  mURI = aURI;
  mIsValidURI = true;
  return NS_OK;
}

NS_IMETHODIMP
nsAbDirProperty::CleanUp(JSContext* cx, Promise** retval) {
  nsIGlobalObject* globalObject =
      xpc::NativeGlobal(JS::CurrentGlobalOrNull(cx));
  if (NS_WARN_IF(!globalObject)) {
    return NS_ERROR_FAILURE;
  }

  ErrorResult result;
  RefPtr<Promise> promise = Promise::Create(globalObject, result);
  promise->MaybeResolveWithUndefined();
  promise.forget(retval);

  return NS_OK;
}

// nsIAbDirectory NOT IMPLEMENTED methods
NS_IMETHODIMP
nsAbDirProperty::GetChildNodes(nsTArray<RefPtr<nsIAbDirectory>>& childList) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsAbDirProperty::GetChildCards(nsTArray<RefPtr<nsIAbCard>>& childCards) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsAbDirProperty::DeleteDirectory(nsIAbDirectory* directory) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsAbDirProperty::HasCard(nsIAbCard* cards, bool* hasCard) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsAbDirProperty::HasDirectory(nsIAbDirectory* dir, bool* hasDir) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsAbDirProperty::HasMailListWithName(const nsAString& aName, bool* aHasList) {
  NS_ENSURE_ARG_POINTER(aHasList);

  *aHasList = false;
  nsCOMPtr<nsIAbDirectory> aDir;
  nsresult rv = GetMailListFromName(aName, getter_AddRefs(aDir));

  NS_ENSURE_SUCCESS(rv, rv);

  if (aDir) {
    *aHasList = true;
  }
  return NS_OK;
}

NS_IMETHODIMP nsAbDirProperty::AddMailList(nsIAbDirectory* list,
                                           nsIAbDirectory** addedList) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsAbDirProperty::EditMailListToDatabase(nsIAbCard* listCard) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsAbDirProperty::AddCard(nsIAbCard* childCard,
                                       nsIAbCard** addedCard) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsAbDirProperty::ModifyCard(nsIAbCard* aModifiedCard) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsAbDirProperty::DeleteCards(
    const nsTArray<RefPtr<nsIAbCard>>& aCards) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsAbDirProperty::DropCard(nsIAbCard* childCard,
                                        bool needToCopyCard) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsAbDirProperty::CardForEmailAddress(
    const nsACString& aEmailAddress, nsIAbCard** aAbCard) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsAbDirProperty::GetCardFromProperty(const char* aProperty,
                                                   const nsACString& aValue,
                                                   bool caseSensitive,
                                                   nsIAbCard** result) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsAbDirProperty::GetCardsFromProperty(
    const char* aProperty, const nsACString& aValue, bool caseSensitive,
    nsTArray<RefPtr<nsIAbCard>>& result) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsAbDirProperty::GetMailListFromName(const nsAString& aName,
                                     nsIAbDirectory** aResult) {
  NS_ENSURE_ARG_POINTER(aResult);

  *aResult = nullptr;
  bool supportsLists = false;
  nsresult rv = GetSupportsMailingLists(&supportsLists);
  if (NS_FAILED(rv) || !supportsLists) return NS_OK;

  if (m_IsMailList) return NS_OK;

  if (!m_AddressList) {
    nsresult rv;
    m_AddressList = do_CreateInstance(NS_ARRAY_CONTRACTID, &rv);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  uint32_t listCount = 0;
  rv = m_AddressList->GetLength(&listCount);
  NS_ENSURE_SUCCESS(rv, rv);

  for (uint32_t i = 0; i < listCount; i++) {
    nsCOMPtr<nsIAbDirectory> listDir(do_QueryElementAt(m_AddressList, i, &rv));
    if (NS_SUCCEEDED(rv) && listDir) {
      nsAutoString listName;
      rv = listDir->GetDirName(listName);
      if (NS_SUCCEEDED(rv) && listName.Equals(aName)) {
        listDir.forget(aResult);
        return NS_OK;
      }
    }
  }
  return NS_OK;
}

NS_IMETHODIMP nsAbDirProperty::GetSupportsMailingLists(
    bool* aSupportsMailingsLists) {
  NS_ENSURE_ARG_POINTER(aSupportsMailingsLists);
  // We don't currently support nested mailing lists, so only return true if
  // we're not a mailing list.
  *aSupportsMailingsLists = !m_IsMailList;
  return NS_OK;
}

NS_IMETHODIMP nsAbDirProperty::GetReadOnly(bool* aReadOnly) {
  NS_ENSURE_ARG_POINTER(aReadOnly);
  // Default is that we are writable. Any implementation that is read-only must
  // override this method.
  *aReadOnly = false;
  return NS_OK;
}

NS_IMETHODIMP nsAbDirProperty::GetIsRemote(bool* aIsRemote) {
  NS_ENSURE_ARG_POINTER(aIsRemote);
  *aIsRemote = false;
  return NS_OK;
}

NS_IMETHODIMP nsAbDirProperty::GetIsSecure(bool* aIsSecure) {
  NS_ENSURE_ARG_POINTER(aIsSecure);
  *aIsSecure = false;
  return NS_OK;
}

NS_IMETHODIMP nsAbDirProperty::UseForAutocomplete(
    const nsACString& aIdentityKey, bool* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);

  // Is local autocomplete enabled?
  nsresult rv;
  nsCOMPtr<nsIPrefBranch> prefBranch(
      do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = prefBranch->GetBoolPref("mail.enable_autocomplete", aResult);
  NS_ENSURE_SUCCESS(rv, rv);

  // If autocomplete is generally enabled, check if it has been disabled
  // explicitly for this directory.
  if (*aResult) {
    (void)GetBoolValue("enable_autocomplete", true, aResult);
  }

  return rv;
}

NS_IMETHODIMP nsAbDirProperty::GetDirPrefId(nsACString& aDirPrefId) {
  aDirPrefId = m_DirPrefId;
  return NS_OK;
}

nsresult nsAbDirProperty::InitDirectoryPrefs() {
  if (m_DirPrefId.IsEmpty()) return NS_ERROR_NOT_INITIALIZED;

  nsresult rv;
  nsCOMPtr<nsIPrefService> prefService(
      do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCString realPrefId(m_DirPrefId);
  realPrefId.Append('.');

  return prefService->GetBranch(realPrefId.get(),
                                getter_AddRefs(m_DirectoryPrefs));
}

NS_IMETHODIMP nsAbDirProperty::GetIntValue(const char* aName,
                                           int32_t aDefaultValue,
                                           int32_t* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);

  if (!m_DirectoryPrefs && NS_FAILED(InitDirectoryPrefs()))
    return NS_ERROR_NOT_INITIALIZED;

  if (NS_FAILED(m_DirectoryPrefs->GetIntPref(aName, aResult)))
    *aResult = aDefaultValue;

  return NS_OK;
}

NS_IMETHODIMP nsAbDirProperty::GetBoolValue(const char* aName,
                                            bool aDefaultValue, bool* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);

  if (!m_DirectoryPrefs && NS_FAILED(InitDirectoryPrefs()))
    return NS_ERROR_NOT_INITIALIZED;

  if (NS_FAILED(m_DirectoryPrefs->GetBoolPref(aName, aResult)))
    *aResult = aDefaultValue;

  return NS_OK;
}

NS_IMETHODIMP nsAbDirProperty::GetStringValue(const char* aName,
                                              const nsACString& aDefaultValue,
                                              nsACString& aResult) {
  if (!m_DirectoryPrefs && NS_FAILED(InitDirectoryPrefs()))
    return NS_ERROR_NOT_INITIALIZED;

  nsCString value;

  /* unfortunately, there may be some prefs out there which look like (null) */
  if (NS_SUCCEEDED(m_DirectoryPrefs->GetCharPref(aName, value)) &&
      !value.EqualsLiteral("(null"))
    aResult = value;
  else
    aResult = aDefaultValue;

  return NS_OK;
}
/*
 * Get localized unicode string pref from properties file, convert into an
 * UTF8 string since address book prefs store as UTF8 strings. So far there
 * are 2 default prefs stored in addressbook.properties.
 * "ldap_2.servers.pab.description"
 * "ldap_2.servers.history.description"
 */
NS_IMETHODIMP nsAbDirProperty::GetLocalizedStringValue(
    const char* aName, const nsACString& aDefaultValue, nsACString& aResult) {
  if (!m_DirectoryPrefs && NS_FAILED(InitDirectoryPrefs()))
    return NS_ERROR_NOT_INITIALIZED;

  nsString wvalue;
  nsCOMPtr<nsIPrefLocalizedString> locStr;

  nsresult rv = m_DirectoryPrefs->GetComplexValue(
      aName, NS_GET_IID(nsIPrefLocalizedString), getter_AddRefs(locStr));
  if (NS_SUCCEEDED(rv)) {
    rv = locStr->ToString(getter_Copies(wvalue));
    NS_ENSURE_SUCCESS(rv, rv);
  }

  if (wvalue.IsEmpty())
    aResult = aDefaultValue;
  else
    CopyUTF16toUTF8(wvalue, aResult);

  return NS_OK;
}

NS_IMETHODIMP nsAbDirProperty::SetIntValue(const char* aName, int32_t aValue) {
  if (!m_DirectoryPrefs && NS_FAILED(InitDirectoryPrefs()))
    return NS_ERROR_NOT_INITIALIZED;

  return m_DirectoryPrefs->SetIntPref(aName, aValue);
}

NS_IMETHODIMP nsAbDirProperty::SetBoolValue(const char* aName, bool aValue) {
  if (!m_DirectoryPrefs && NS_FAILED(InitDirectoryPrefs()))
    return NS_ERROR_NOT_INITIALIZED;

  return m_DirectoryPrefs->SetBoolPref(aName, aValue);
}

NS_IMETHODIMP nsAbDirProperty::SetStringValue(const char* aName,
                                              const nsACString& aValue) {
  if (!m_DirectoryPrefs && NS_FAILED(InitDirectoryPrefs()))
    return NS_ERROR_NOT_INITIALIZED;

  return m_DirectoryPrefs->SetCharPref(aName, aValue);
}

NS_IMETHODIMP nsAbDirProperty::SetLocalizedStringValue(
    const char* aName, const nsACString& aValue) {
  if (!m_DirectoryPrefs && NS_FAILED(InitDirectoryPrefs()))
    return NS_ERROR_NOT_INITIALIZED;

  nsresult rv;
  nsCOMPtr<nsIPrefLocalizedString> locStr(
      do_CreateInstance(NS_PREFLOCALIZEDSTRING_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = locStr->SetData(NS_ConvertUTF8toUTF16(aValue));
  NS_ENSURE_SUCCESS(rv, rv);

  return m_DirectoryPrefs->SetComplexValue(
      aName, NS_GET_IID(nsIPrefLocalizedString), locStr);
}

NS_IMETHODIMP nsAbDirProperty::Search(const nsAString& query,
                                      const nsAString& searchString,
                                      nsIAbDirSearchListener* listener) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
