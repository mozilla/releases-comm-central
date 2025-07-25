/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMsgProgress.h"

#include "nsIStringBundle.h"
#include "nsXPCOM.h"
#include "nsIMutableArray.h"
#include "nsISupportsPrimitives.h"
#include "nsError.h"
#include "nsIWindowWatcher.h"
#include "nsPIDOMWindow.h"
#include "mozIDOMWindow.h"
#include "nsComponentManagerUtils.h"
#include "nsMsgUtils.h"
#include "mozilla/Components.h"
#include "mozilla/dom/BrowsingContext.h"

NS_IMPL_ISUPPORTS(nsMsgProgress, nsIMsgStatusFeedback, nsIMsgProgress,
                  nsIWebProgressListener, nsIProgressEventSink,
                  nsISupportsWeakReference)

nsMsgProgress::nsMsgProgress() {
  m_closeProgress = false;
  m_processCanceled = false;
  m_pendingStateFlags = -1;
  m_pendingStateValue = NS_OK;
}

nsMsgProgress::~nsMsgProgress() { (void)ReleaseListeners(); }

NS_IMETHODIMP nsMsgProgress::OpenProgressDialog(
    mozIDOMWindowProxy* parentDOMWindow, nsIMsgWindow* aMsgWindow,
    const char* dialogURL, bool inDisplayModal, nsISupports* parameters) {
  nsresult rv;

  if (aMsgWindow) {
    SetMsgWindow(aMsgWindow);
    aMsgWindow->SetStatusFeedback(this);
  }

  NS_ENSURE_ARG_POINTER(dialogURL);

  // Set up window.arguments[0]...
  nsCOMPtr<nsIMutableArray> array(do_CreateInstance(NS_ARRAY_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsISupportsInterfacePointer> ifptr =
      do_CreateInstance(NS_SUPPORTS_INTERFACE_POINTER_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  ifptr->SetData(static_cast<nsIMsgProgress*>(this));
  ifptr->SetDataIID(&NS_GET_IID(nsIMsgProgress));

  array->AppendElement(ifptr);
  array->AppendElement(parameters);

  // Open the dialog.
  nsCOMPtr<nsIWindowWatcher> wwatch =
      mozilla::components::WindowWatcher::Service();

  nsCString chromeOptions("chrome,dependent,centerscreen"_ns);
  if (inDisplayModal) chromeOptions.AppendLiteral(",modal");

  nsCOMPtr<mozIDOMWindowProxy> newWindow;
  return wwatch->OpenWindow(parentDOMWindow, nsDependentCString(dialogURL),
                            "_blank"_ns, chromeOptions, array,
                            getter_AddRefs(newWindow));
}

NS_IMETHODIMP nsMsgProgress::CloseProgressDialog(bool forceClose) {
  m_closeProgress = true;
  return OnStateChange(nullptr, nullptr, nsIWebProgressListener::STATE_STOP,
                       forceClose ? NS_ERROR_FAILURE : NS_OK);
}

NS_IMETHODIMP nsMsgProgress::GetProcessCanceledByUser(
    bool* aProcessCanceledByUser) {
  NS_ENSURE_ARG_POINTER(aProcessCanceledByUser);
  *aProcessCanceledByUser = m_processCanceled;
  return NS_OK;
}
NS_IMETHODIMP nsMsgProgress::SetProcessCanceledByUser(
    bool aProcessCanceledByUser) {
  m_processCanceled = aProcessCanceledByUser;
  OnStateChange(nullptr, nullptr, nsIWebProgressListener::STATE_STOP,
                NS_BINDING_ABORTED);
  return NS_OK;
}

NS_IMETHODIMP nsMsgProgress::RegisterListener(
    nsIWebProgressListener* listener) {
  if (!listener)  // Nothing to do with a null listener!
    return NS_OK;

  NS_ENSURE_ARG(this != listener);  // Check for self-reference (see bug 271700)

  m_listenerList.AppendObject(listener);
  if (m_closeProgress || m_processCanceled)
    listener->OnStateChange(nullptr, nullptr,
                            nsIWebProgressListener::STATE_STOP, NS_OK);
  else {
    listener->OnStatusChange(nullptr, nullptr, NS_OK, m_pendingStatus.get());
    if (m_pendingStateFlags != -1)
      listener->OnStateChange(nullptr, nullptr, m_pendingStateFlags,
                              m_pendingStateValue);
  }

  return NS_OK;
}

NS_IMETHODIMP nsMsgProgress::UnregisterListener(
    nsIWebProgressListener* listener) {
  if (listener) m_listenerList.RemoveObject(listener);
  return NS_OK;
}

NS_IMETHODIMP nsMsgProgress::OnStateChange(nsIWebProgress* aWebProgress,
                                           nsIRequest* aRequest,
                                           uint32_t aStateFlags,
                                           nsresult aStatus) {
  m_pendingStateFlags = aStateFlags;
  m_pendingStateValue = aStatus;

  nsCOMPtr<nsIMsgWindow> msgWindow(do_QueryReferent(m_msgWindow));
  if (aStateFlags == nsIWebProgressListener::STATE_STOP && msgWindow &&
      NS_FAILED(aStatus)) {
    msgWindow->SetStatusFeedback(nullptr);
  }

  for (int32_t i = m_listenerList.Count() - 1; i >= 0; i--)
    m_listenerList[i]->OnStateChange(aWebProgress, aRequest, aStateFlags,
                                     aStatus);

  return NS_OK;
}

NS_IMETHODIMP nsMsgProgress::OnProgressChange(nsIWebProgress* aWebProgress,
                                              nsIRequest* aRequest,
                                              int32_t aCurSelfProgress,
                                              int32_t aMaxSelfProgress,
                                              int32_t aCurTotalProgress,
                                              int32_t aMaxTotalProgress) {
  for (int32_t i = m_listenerList.Count() - 1; i >= 0; i--)
    m_listenerList[i]->OnProgressChange(aWebProgress, aRequest,
                                        aCurSelfProgress, aMaxSelfProgress,
                                        aCurTotalProgress, aMaxTotalProgress);
  return NS_OK;
}

NS_IMETHODIMP nsMsgProgress::OnLocationChange(nsIWebProgress* aWebProgress,
                                              nsIRequest* aRequest,
                                              nsIURI* location,
                                              uint32_t aFlags) {
  return NS_OK;
}

NS_IMETHODIMP nsMsgProgress::OnStatusChange(nsIWebProgress* aWebProgress,
                                            nsIRequest* aRequest,
                                            nsresult aStatus,
                                            const char16_t* aMessage) {
  if (aMessage && *aMessage) m_pendingStatus = aMessage;
  for (int32_t i = m_listenerList.Count() - 1; i >= 0; i--)
    m_listenerList[i]->OnStatusChange(aWebProgress, aRequest, aStatus,
                                      aMessage);
  return NS_OK;
}

NS_IMETHODIMP nsMsgProgress::OnSecurityChange(nsIWebProgress* aWebProgress,
                                              nsIRequest* aRequest,
                                              uint32_t state) {
  return NS_OK;
}

NS_IMETHODIMP
nsMsgProgress::OnContentBlockingEvent(nsIWebProgress* aWebProgress,
                                      nsIRequest* aRequest, uint32_t aEvent) {
  return NS_OK;
}

nsresult nsMsgProgress::ReleaseListeners() {
  m_listenerList.Clear();
  return NS_OK;
}

NS_IMETHODIMP nsMsgProgress::ShowStatusString(const nsAString& aStatus) {
  return OnStatusChange(nullptr, nullptr, NS_OK,
                        PromiseFlatString(aStatus).get());
}

NS_IMETHODIMP nsMsgProgress::StartMeteors() { return NS_ERROR_NOT_IMPLEMENTED; }

NS_IMETHODIMP nsMsgProgress::StopMeteors() { return NS_ERROR_NOT_IMPLEMENTED; }

NS_IMETHODIMP nsMsgProgress::ShowProgress(int32_t percent) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsMsgProgress::SetWrappedStatusFeedback(
    nsIMsgStatusFeedback* aJSStatusFeedback) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsMsgProgress::SetMsgWindow(nsIMsgWindow* aMsgWindow) {
  m_msgWindow = do_GetWeakReference(aMsgWindow);
  return NS_OK;
}

NS_IMETHODIMP nsMsgProgress::GetMsgWindow(nsIMsgWindow** aMsgWindow) {
  NS_ENSURE_ARG_POINTER(aMsgWindow);

  if (m_msgWindow)
    CallQueryReferent(m_msgWindow.get(), aMsgWindow);
  else
    *aMsgWindow = nullptr;

  return NS_OK;
}

NS_IMETHODIMP nsMsgProgress::OnProgress(nsIRequest* request, int64_t aProgress,
                                        int64_t aProgressMax) {
  // XXX: What should the nsIWebProgress be?
  // XXX: This truncates 64-bit to 32-bit
  return OnProgressChange(nullptr, request, int32_t(aProgress),
                          int32_t(aProgressMax),
                          int32_t(aProgress) /* current total progress */,
                          int32_t(aProgressMax) /* max total progress */);
}

NS_IMETHODIMP nsMsgProgress::OnStatus(nsIRequest* request, nsresult aStatus,
                                      const char16_t* aStatusArg) {
  nsString msg;
  nsAutoString host;
  host.Append(aStatusArg);
  nsresult rv = FormatStatusMessage(aStatus, host, msg);
  NS_ENSURE_SUCCESS(rv, rv);

  return ShowStatusString(msg);
}
