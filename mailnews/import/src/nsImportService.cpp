/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsString.h"
#include "nsMemory.h"
#include "nsIImportModule.h"
#include "nsIImportService.h"
#include "nsImportMailboxDescriptor.h"
#include "nsImportABDescriptor.h"
#include "nsIImportGeneric.h"
#include "nsImportFieldMap.h"
#include "nsICategoryManager.h"
#include "nsXPCOM.h"
#include "nsISupportsPrimitives.h"
#include "nsThreadUtils.h"
#include "ImportDebug.h"
#include "nsImportService.h"
#include "nsImportStringBundle.h"
#include "nsCRTGlue.h"
#include "nsServiceManagerUtils.h"
#include "nsComponentManagerUtils.h"
#include "nsIMsgSend.h"
#include "nsMsgUtils.h"
#include "mozilla/SimpleEnumerator.h"

mozilla::LazyLogModule IMPORTLOGMODULE("Import");

////////////////////////////////////////////////////////////////////////

nsImportService::nsImportService() {
  IMPORT_LOG0("* nsImport Service Created\n");

  m_didDiscovery = false;

  nsresult rv = nsImportStringBundle::GetStringBundle(
      IMPORT_MSGS_URL, getter_AddRefs(m_stringBundle));
  if (NS_FAILED(rv))
    IMPORT_LOG0("Failed to get string bundle for Importing Mail");
}

nsImportService::~nsImportService() {
  IMPORT_LOG0("* nsImport Service Deleted\n");
}

NS_IMPL_ISUPPORTS(nsImportService, nsIImportService)

NS_IMETHODIMP nsImportService::DiscoverModules(void) {
  m_didDiscovery = false;
  return DoDiscover();
}

NS_IMETHODIMP nsImportService::CreateNewFieldMap(nsIImportFieldMap** _retval) {
  return nsImportFieldMap::Create(m_stringBundle, NS_GET_IID(nsIImportFieldMap),
                                  (void**)_retval);
}

NS_IMETHODIMP nsImportService::CreateNewMailboxDescriptor(
    nsIImportMailboxDescriptor** _retval) {
  return nsImportMailboxDescriptor::Create(
      NS_GET_IID(nsIImportMailboxDescriptor), (void**)_retval);
}

NS_IMETHODIMP nsImportService::CreateNewABDescriptor(
    nsIImportABDescriptor** _retval) {
  return nsImportABDescriptor::Create(NS_GET_IID(nsIImportABDescriptor),
                                      (void**)_retval);
}

extern nsresult NS_NewGenericMail(nsIImportGeneric** aImportGeneric);

NS_IMETHODIMP nsImportService::CreateNewGenericMail(
    nsIImportGeneric** _retval) {
  NS_ASSERTION(_retval != nullptr, "null ptr");
  if (!_retval) return NS_ERROR_NULL_POINTER;

  return NS_NewGenericMail(_retval);
}

extern nsresult NS_NewGenericAddressBooks(nsIImportGeneric** aImportGeneric);

NS_IMETHODIMP nsImportService::CreateNewGenericAddressBooks(
    nsIImportGeneric** _retval) {
  NS_ASSERTION(_retval != nullptr, "null ptr");
  if (!_retval) return NS_ERROR_NULL_POINTER;

  return NS_NewGenericAddressBooks(_retval);
}

NS_IMETHODIMP nsImportService::GetModuleCount(const char* filter,
                                              int32_t* _retval) {
  NS_ASSERTION(_retval != nullptr, "null ptr");
  if (!_retval) return NS_ERROR_NULL_POINTER;

  DoDiscover();

  nsCString filterStr(filter);
  int32_t count = 0;
  for (auto& importModule : m_importModules) {
    if (importModule.SupportsThings(filterStr)) count++;
  }
  *_retval = count;

  return NS_OK;
}

ImportModuleDesc* nsImportService::GetImportModule(const char* filter,
                                                   int32_t index) {
  DoDiscover();

  nsCString filterStr(filter);
  int32_t count = 0;
  for (auto& importModule : m_importModules) {
    if (importModule.SupportsThings(filterStr)) {
      if (count++ == index) {
        return &importModule;
      }
    }
  }

  return nullptr;
}

NS_IMETHODIMP nsImportService::GetModuleInfo(const char* filter, int32_t index,
                                             nsAString& name,
                                             nsAString& moduleDescription) {
  ImportModuleDesc* importModule = GetImportModule(filter, index);
  if (!importModule) return NS_ERROR_FAILURE;

  name = importModule->GetName();
  moduleDescription = importModule->GetDescription();
  return NS_OK;
}

NS_IMETHODIMP nsImportService::GetModuleName(const char* filter, int32_t index,
                                             nsAString& _retval) {
  ImportModuleDesc* importModule = GetImportModule(filter, index);
  if (!importModule) return NS_ERROR_FAILURE;

  _retval = importModule->GetName();
  return NS_OK;
}

NS_IMETHODIMP nsImportService::GetModuleDescription(const char* filter,
                                                    int32_t index,
                                                    nsAString& _retval) {
  ImportModuleDesc* importModule = GetImportModule(filter, index);
  if (!importModule) return NS_ERROR_FAILURE;

  _retval = importModule->GetDescription();
  return NS_OK;
}

class nsProxySendRunnable : public mozilla::Runnable {
 public:
  nsProxySendRunnable(
      nsIMsgIdentity* aIdentity, nsIMsgCompFields* aMsgFields,
      const char* attachment1_type, const nsACString& attachment1_body,
      bool aIsDraft,
      nsTArray<RefPtr<nsIMsgAttachedFile>> const& aLoadedAttachments,
      nsTArray<RefPtr<nsIMsgEmbeddedImageData>> const& aEmbeddedAttachments,
      nsIMsgSendListener* aListener);
  NS_DECL_NSIRUNNABLE
 private:
  nsCOMPtr<nsIMsgIdentity> m_identity;
  nsCOMPtr<nsIMsgCompFields> m_compFields;
  bool m_isDraft;
  nsCString m_bodyType;
  nsCString m_body;
  nsTArray<RefPtr<nsIMsgAttachedFile>> m_loadedAttachments;
  nsTArray<RefPtr<nsIMsgEmbeddedImageData>> m_embeddedAttachments;
  nsCOMPtr<nsIMsgSendListener> m_listener;
};

nsProxySendRunnable::nsProxySendRunnable(
    nsIMsgIdentity* aIdentity, nsIMsgCompFields* aMsgFields,
    const char* aBodyType, const nsACString& aBody, bool aIsDraft,
    nsTArray<RefPtr<nsIMsgAttachedFile>> const& aLoadedAttachments,
    nsTArray<RefPtr<nsIMsgEmbeddedImageData>> const& aEmbeddedAttachments,
    nsIMsgSendListener* aListener)
    : mozilla::Runnable("nsProxySendRunnable"),
      m_identity(aIdentity),
      m_compFields(aMsgFields),
      m_isDraft(aIsDraft),
      m_bodyType(aBodyType),
      m_body(aBody),
      m_loadedAttachments(aLoadedAttachments.Clone()),
      m_embeddedAttachments(aEmbeddedAttachments.Clone()),
      m_listener(aListener) {}

NS_IMETHODIMP nsProxySendRunnable::Run() {
  nsresult rv;
  nsCOMPtr<nsIMsgSend> msgSend =
      do_CreateInstance("@mozilla.org/messengercompose/send;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  return msgSend->CreateRFC822Message(
      m_identity, m_compFields, m_bodyType.get(), m_body, m_isDraft,
      m_loadedAttachments, m_embeddedAttachments, m_listener);
}

NS_IMETHODIMP
nsImportService::CreateRFC822Message(
    nsIMsgIdentity* aIdentity, nsIMsgCompFields* aMsgFields,
    const char* aBodyType, const nsACString& aBody, bool aIsDraft,
    nsTArray<RefPtr<nsIMsgAttachedFile>> const& aLoadedAttachments,
    nsTArray<RefPtr<nsIMsgEmbeddedImageData>> const& aEmbeddedAttachments,
    nsIMsgSendListener* aListener) {
  RefPtr<nsProxySendRunnable> runnable = new nsProxySendRunnable(
      aIdentity, aMsgFields, aBodyType, aBody, aIsDraft, aLoadedAttachments,
      aEmbeddedAttachments, aListener);
  // invoke the callback
  return NS_DispatchToMainThread(runnable);
}

NS_IMETHODIMP nsImportService::GetModule(const char* filter, int32_t index,
                                         nsIImportModule** _retval) {
  NS_ASSERTION(_retval != nullptr, "null ptr");
  if (!_retval) return NS_ERROR_NULL_POINTER;
  *_retval = nullptr;

  ImportModuleDesc* importModule = GetImportModule(filter, index);
  if (!importModule) return NS_ERROR_FAILURE;

  nsCOMPtr<nsIImportModule> modulePtr = importModule->GetModule();
  modulePtr.forget(_retval);
  return NS_OK;
}

nsresult nsImportService::DoDiscover(void) {
  if (m_didDiscovery) return NS_OK;

  m_importModules.Clear();

  nsresult rv;

  nsCOMPtr<nsICategoryManager> catMan =
      do_GetService(NS_CATEGORYMANAGER_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsISimpleEnumerator> e;
  rv = catMan->EnumerateCategory("mailnewsimport", getter_AddRefs(e));
  NS_ENSURE_SUCCESS(rv, rv);
  for (auto& key : mozilla::SimpleEnumerator<nsISupportsCString>(e)) {
    nsCString keyStr;
    key->ToString(getter_Copies(keyStr));
    nsCString contractIdStr;
    rv = catMan->GetCategoryEntry("mailnewsimport", keyStr, contractIdStr);
    if (NS_SUCCEEDED(rv)) LoadModuleInfo(contractIdStr);
  }

  m_didDiscovery = true;

  return NS_OK;
}

nsresult nsImportService::LoadModuleInfo(const nsCString& contractId) {
  // load the component and get all of the info we need from it....
  nsresult rv;
  nsCOMPtr<nsIImportModule> module = do_CreateInstance(contractId.get(), &rv);
  if (NS_FAILED(rv)) return rv;

  m_importModules.EmplaceBack(module);

  return NS_OK;
}

ImportModuleDesc::ImportModuleDesc(nsIImportModule* importModule)
    : m_pModule(importModule) {
  nsresult rv;
  rv = importModule->GetName(getter_Copies(m_name));
  if (NS_FAILED(rv)) m_name.AssignLiteral("Unknown");

  rv = importModule->GetDescription(getter_Copies(m_description));
  if (NS_FAILED(rv)) m_description.AssignLiteral("Unknown description");

  importModule->GetSupports(getter_Copies(m_supports));

#ifdef IMPORT_DEBUG
  IMPORT_LOG3("* nsImportService registered import module: %s, %s, %s\n",
              NS_LossyConvertUTF16toASCII(m_name).get(),
              NS_LossyConvertUTF16toASCII(m_description).get(),
              m_supports.get());
#endif
}

bool ImportModuleDesc::SupportsThings(const nsACString& thing) {
  for (auto& item : m_supports.Split(',')) {
    if (item == thing) return true;
  }
  return false;
}
