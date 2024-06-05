/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsString.h"
#include "nsIImportService.h"
#include "nsImportMailboxDescriptor.h"
#include "nsImportABDescriptor.h"
#include "nsIImportGeneric.h"
#include "nsThreadUtils.h"
#include "ImportDebug.h"
#include "nsImportService.h"
#include "nsImportStringBundle.h"
#include "nsComponentManagerUtils.h"
#include "nsIMsgSend.h"

mozilla::LazyLogModule IMPORTLOGMODULE("Import");

////////////////////////////////////////////////////////////////////////

nsImportService::nsImportService() {
  IMPORT_LOG0("* nsImport Service Created\n");

  nsresult rv = nsImportStringBundle::GetStringBundle(
      IMPORT_MSGS_URL, getter_AddRefs(m_stringBundle));
  if (NS_FAILED(rv))
    IMPORT_LOG0("Failed to get string bundle for Importing Mail");
}

nsImportService::~nsImportService() {
  IMPORT_LOG0("* nsImport Service Deleted\n");
}

NS_IMPL_ISUPPORTS(nsImportService, nsIImportService)

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
