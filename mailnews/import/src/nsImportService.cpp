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
#include "nsMsgCompCID.h"
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
  return nsImportFieldMap::Create(
      m_stringBundle, nullptr, NS_GET_IID(nsIImportFieldMap), (void**)_retval);
}

NS_IMETHODIMP nsImportService::CreateNewMailboxDescriptor(
    nsIImportMailboxDescriptor** _retval) {
  return nsImportMailboxDescriptor::Create(
      nullptr, NS_GET_IID(nsIImportMailboxDescriptor), (void**)_retval);
}

NS_IMETHODIMP nsImportService::CreateNewABDescriptor(
    nsIImportABDescriptor** _retval) {
  return nsImportABDescriptor::Create(
      nullptr, NS_GET_IID(nsIImportABDescriptor), (void**)_retval);
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

NS_IMETHODIMP nsImportService::GetModuleWithCID(const nsCID& cid,
                                                nsIImportModule** ppModule) {
  NS_ASSERTION(ppModule != nullptr, "null ptr");
  if (!ppModule) return NS_ERROR_NULL_POINTER;

  *ppModule = nullptr;
  nsresult rv = DoDiscover();
  if (NS_FAILED(rv)) return rv;
  for (auto& importModule : m_importModules) {
    if (importModule.GetCID().Equals(cid)) {
      importModule.GetModule(ppModule);

      IMPORT_LOG0(
          "* nsImportService::GetSpecificModule - attempted to load module\n");

      if (*ppModule == nullptr) return NS_ERROR_FAILURE;
      return NS_OK;
    }
  }

  IMPORT_LOG0("* nsImportService::GetSpecificModule - module not found\n");

  return NS_ERROR_NOT_AVAILABLE;
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
                                             char16_t** name,
                                             char16_t** moduleDescription) {
  NS_ASSERTION(name != nullptr, "null ptr");
  NS_ASSERTION(moduleDescription != nullptr, "null ptr");
  if (!name || !moduleDescription) return NS_ERROR_NULL_POINTER;

  *name = nullptr;
  *moduleDescription = nullptr;

  ImportModuleDesc* importModule = GetImportModule(filter, index);
  if (!importModule) return NS_ERROR_FAILURE;

  *name = NS_xstrdup(importModule->GetName());
  *moduleDescription = NS_xstrdup(importModule->GetDescription());
  return NS_OK;
}

NS_IMETHODIMP nsImportService::GetModuleName(const char* filter, int32_t index,
                                             char16_t** _retval) {
  NS_ASSERTION(_retval != nullptr, "null ptr");
  if (!_retval) return NS_ERROR_NULL_POINTER;

  *_retval = nullptr;

  ImportModuleDesc* importModule = GetImportModule(filter, index);
  if (!importModule) return NS_ERROR_FAILURE;

  *_retval = NS_xstrdup(importModule->GetName());
  return NS_OK;
}

NS_IMETHODIMP nsImportService::GetModuleDescription(const char* filter,
                                                    int32_t index,
                                                    char16_t** _retval) {
  NS_ASSERTION(_retval != nullptr, "null ptr");
  if (!_retval) return NS_ERROR_NULL_POINTER;

  *_retval = nullptr;

  ImportModuleDesc* importModule = GetImportModule(filter, index);
  if (!importModule) return NS_ERROR_FAILURE;

  *_retval = NS_xstrdup(importModule->GetDescription());
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
  nsCOMPtr<nsIMsgSend> msgSend = do_CreateInstance(NS_MSGSEND_CONTRACTID, &rv);
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

  importModule->GetModule(_retval);
  if (!(*_retval)) return NS_ERROR_FAILURE;

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
  for (auto& contractid : mozilla::SimpleEnumerator<nsISupportsCString>(e)) {
    nsCString contractIdStr;
    contractid->ToString(getter_Copies(contractIdStr));
    nsCString supportsStr;
    rv = catMan->GetCategoryEntry("mailnewsimport", contractIdStr, supportsStr);
    if (NS_SUCCEEDED(rv))
      LoadModuleInfo(contractIdStr.get(), supportsStr.get());
  }

  m_didDiscovery = true;

  return NS_OK;
}

nsresult nsImportService::LoadModuleInfo(const char* pClsId,
                                         const char* pSupports) {
  if (!pClsId || !pSupports) return NS_OK;

  // load the component and get all of the info we need from it....
  nsresult rv;

  nsCID clsId;
  clsId.Clear();

  clsId.Parse(pClsId);
  nsCOMPtr<nsIImportModule> module = do_CreateInstance(clsId, &rv);
  if (NS_FAILED(rv)) return rv;

  nsString theTitle;
  nsString theDescription;
  rv = module->GetName(getter_Copies(theTitle));
  if (NS_FAILED(rv)) theTitle.AssignLiteral("Unknown");

  rv = module->GetDescription(getter_Copies(theDescription));
  if (NS_FAILED(rv)) theDescription.AssignLiteral("Unknown description");

  m_importModules.EmplaceBack(clsId, theTitle, theDescription, pSupports);

#ifdef IMPORT_DEBUG
  IMPORT_LOG3("* nsImportService registered import module: %s, %s, %s\n",
              NS_LossyConvertUTF16toASCII(pName).get(),
              NS_LossyConvertUTF16toASCII(pDesc).get(), pSupports);
#endif
  return NS_OK;
}

// XXX This should return already_AddRefed.
void ImportModuleDesc::GetModule(nsIImportModule** _retval) {
  if (!m_pModule) {
    nsresult rv;
    m_pModule = do_CreateInstance(m_cid, &rv);
    if (NS_FAILED(rv)) m_pModule = nullptr;
  }

  NS_IF_ADDREF(*_retval = m_pModule);
  return;
}

bool ImportModuleDesc::SupportsThings(const nsACString& thing) {
  for (auto& item : m_supports.Split(',')) {
    if (item == thing) return true;
  }
  return false;
}
