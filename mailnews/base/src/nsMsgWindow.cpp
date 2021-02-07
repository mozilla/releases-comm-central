/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMsgWindow.h"
#include "nsIURILoader.h"
#include "nsCURILoader.h"
#include "nsIDocShell.h"
#include "nsIDocShellTreeItem.h"
#include "mozIDOMWindow.h"
#include "nsTransactionManagerCID.h"
#include "nsIComponentManager.h"
#include "nsILoadGroup.h"
#include "nsIMsgMailNewsUrl.h"
#include "nsIInterfaceRequestor.h"
#include "nsIInterfaceRequestorUtils.h"
#include "nsIWebProgress.h"
#include "nsIWebProgressListener.h"
#include "nsPIDOMWindow.h"
#include "nsIPrompt.h"
#include "nsICharsetConverterManager.h"
#include "nsIChannel.h"
#include "nsIRequestObserver.h"
#include "netCore.h"
#include "prmem.h"
#include "plbase64.h"
#include "nsMsgI18N.h"
#include "nsIWebNavigation.h"
#include "nsContentUtils.h"
#include "nsComponentManagerUtils.h"
#include "nsServiceManagerUtils.h"
#include "nsIAuthPrompt.h"
#include "nsMsgUtils.h"
#include "mozilla/dom/Document.h"
#include "mozilla/TransactionManager.h"
#include "mozilla/dom/LoadURIOptionsBinding.h"
#include "mozilla/dom/Element.h"
#include "mozilla/dom/XULFrameElement.h"
#include "mozilla/Components.h"
#include "nsFrameLoader.h"

NS_IMPL_ISUPPORTS(nsMsgWindow, nsIMsgWindow, nsIURIContentListener,
                  nsISupportsWeakReference, nsIMsgWindowTest)

nsMsgWindow::nsMsgWindow() {
  mCharsetOverride = false;
  m_stopped = false;
}

nsMsgWindow::~nsMsgWindow() { CloseWindow(); }

nsresult nsMsgWindow::Init() {
  // create Undo/Redo Transaction Manager
  mTransactionManager = new mozilla::TransactionManager();
  return mTransactionManager->SetMaxTransactionCount(-1);
}

NS_IMETHODIMP nsMsgWindow::GetMessageWindowDocShell(nsIDocShell** aDocShell) {
  *aDocShell = nullptr;

  nsCOMPtr<nsIDocShell> docShell(do_QueryReferent(mMessageWindowDocShellWeak));
  nsCOMPtr<nsIDocShell> rootShell(do_QueryReferent(mRootDocShellWeak));
  if (rootShell) {
    // There seem to be some issues with shutdown (see Bug 1610406).
    // This workaround should prevent the GetElementById() call dying horribly
    // but really, we shouldn't even get here in such cases.
    bool doomed;
    rootShell->IsBeingDestroyed(&doomed);
    if (doomed) {
      return NS_ERROR_ILLEGAL_DURING_SHUTDOWN;
    }

    RefPtr<mozilla::dom::Element> el =
        rootShell->GetDocument()->GetElementById(u"messagepane"_ns);
    RefPtr<mozilla::dom::XULFrameElement> frame =
        mozilla::dom::XULFrameElement::FromNodeOrNull(el);
    NS_ENSURE_TRUE(frame, NS_ERROR_FAILURE);
    RefPtr<mozilla::dom::Document> doc = frame->GetContentDocument();
    NS_ENSURE_TRUE(doc, NS_ERROR_FAILURE);
    docShell = doc->GetDocShell();
    NS_ENSURE_TRUE(docShell, NS_ERROR_FAILURE);

    // we don't own mMessageWindowDocShell so don't try to keep a reference to
    // it!
    mMessageWindowDocShellWeak = do_GetWeakReference(docShell);
  }

  NS_ENSURE_TRUE(docShell, NS_ERROR_FAILURE);
  docShell.forget(aDocShell);
  return NS_OK;
}

NS_IMETHODIMP nsMsgWindow::CloseWindow() {
  mMsgWindowCommands = nullptr;
  mStatusFeedback = nullptr;

  StopUrls();

  nsCOMPtr<nsIDocShell> messagePaneDocShell(
      do_QueryReferent(mMessageWindowDocShellWeak));
  if (messagePaneDocShell) {
    nsCOMPtr<nsIURIContentListener> listener(
        do_GetInterface(messagePaneDocShell));
    if (listener) listener->SetParentContentListener(nullptr);
    SetRootDocShell(nullptr);
    mMessageWindowDocShellWeak = nullptr;
  }

  // in case nsMsgWindow leaks, make sure other stuff doesn't leak.
  mTransactionManager = nullptr;
  return NS_OK;
}

NS_IMETHODIMP nsMsgWindow::GetStatusFeedback(
    nsIMsgStatusFeedback** aStatusFeedback) {
  NS_ENSURE_ARG_POINTER(aStatusFeedback);
  NS_IF_ADDREF(*aStatusFeedback = mStatusFeedback);
  return NS_OK;
}

NS_IMETHODIMP nsMsgWindow::SetStatusFeedback(
    nsIMsgStatusFeedback* aStatusFeedback) {
  mStatusFeedback = aStatusFeedback;
  nsCOMPtr<nsIDocShell> messageWindowDocShell;
  GetMessageWindowDocShell(getter_AddRefs(messageWindowDocShell));

  // register our status feedback object as a web progress listener
  nsCOMPtr<nsIWebProgress> webProgress(do_GetInterface(messageWindowDocShell));
  if (webProgress && mStatusFeedback && messageWindowDocShell) {
    nsCOMPtr<nsIWebProgressListener> webProgressListener =
        do_QueryInterface(mStatusFeedback);
    webProgress->AddProgressListener(webProgressListener,
                                     nsIWebProgress::NOTIFY_ALL);
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgWindow::SetWindowCommands(
    nsIMsgWindowCommands* aMsgWindowCommands) {
  mMsgWindowCommands = aMsgWindowCommands;
  return NS_OK;
}

NS_IMETHODIMP nsMsgWindow::GetWindowCommands(
    nsIMsgWindowCommands** aMsgWindowCommands) {
  NS_ENSURE_ARG_POINTER(aMsgWindowCommands);
  NS_IF_ADDREF(*aMsgWindowCommands = mMsgWindowCommands);
  return NS_OK;
}

NS_IMETHODIMP nsMsgWindow::GetMsgHeaderSink(nsIMsgHeaderSink** aMsgHdrSink) {
  NS_ENSURE_ARG_POINTER(aMsgHdrSink);
  NS_IF_ADDREF(*aMsgHdrSink = mMsgHeaderSink);
  return NS_OK;
}

NS_IMETHODIMP nsMsgWindow::SetMsgHeaderSink(nsIMsgHeaderSink* aMsgHdrSink) {
  mMsgHeaderSink = aMsgHdrSink;
  return NS_OK;
}

NS_IMETHODIMP nsMsgWindow::GetTransactionManager(
    nsITransactionManager** aTransactionManager) {
  NS_ENSURE_ARG_POINTER(aTransactionManager);
  NS_IF_ADDREF(*aTransactionManager = mTransactionManager);
  return NS_OK;
}

NS_IMETHODIMP nsMsgWindow::SetTransactionManager(
    nsITransactionManager* aTransactionManager) {
  mTransactionManager = aTransactionManager;
  return NS_OK;
}

NS_IMETHODIMP nsMsgWindow::GetOpenFolder(nsIMsgFolder** aOpenFolder) {
  NS_ENSURE_ARG_POINTER(aOpenFolder);
  NS_IF_ADDREF(*aOpenFolder = mOpenFolder);
  return NS_OK;
}

NS_IMETHODIMP nsMsgWindow::SetOpenFolder(nsIMsgFolder* aOpenFolder) {
  mOpenFolder = aOpenFolder;
  return NS_OK;
}

NS_IMETHODIMP nsMsgWindow::GetRootDocShell(nsIDocShell** aDocShell) {
  if (mRootDocShellWeak)
    CallQueryReferent(mRootDocShellWeak.get(), aDocShell);
  else
    *aDocShell = nullptr;
  return NS_OK;
}

NS_IMETHODIMP nsMsgWindow::GetAuthPrompt(nsIAuthPrompt** aAuthPrompt) {
  NS_ENSURE_ARG_POINTER(aAuthPrompt);

  // testing only
  if (mAuthPrompt) {
    NS_ADDREF(*aAuthPrompt = mAuthPrompt);
    return NS_OK;
  }

  if (!mRootDocShellWeak) return NS_ERROR_FAILURE;

  nsresult rv;
  nsCOMPtr<nsIDocShell> docShell(
      do_QueryReferent(mRootDocShellWeak.get(), &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIAuthPrompt> prompt = do_GetInterface(docShell, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  prompt.forget(aAuthPrompt);

  return rv;
}

NS_IMETHODIMP nsMsgWindow::SetAuthPrompt(nsIAuthPrompt* aAuthPrompt) {
  mAuthPrompt = aAuthPrompt;
  return NS_OK;
}

NS_IMETHODIMP nsMsgWindow::SetRootDocShell(nsIDocShell* aDocShell) {
  // Query for the doc shell and release it
  mRootDocShellWeak = nullptr;
  if (aDocShell) {
    mRootDocShellWeak = do_GetWeakReference(aDocShell);

    nsCOMPtr<nsIDocShell> messagePaneDocShell;
    GetMessageWindowDocShell(getter_AddRefs(messagePaneDocShell));
    nsCOMPtr<nsIURIContentListener> listener(
        do_GetInterface(messagePaneDocShell));
    if (listener) listener->SetParentContentListener(this);
  }
  return NS_OK;
}

NS_IMETHODIMP nsMsgWindow::GetMailCharacterSet(nsACString& aMailCharacterSet) {
  aMailCharacterSet = mMailCharacterSet;
  return NS_OK;
}

NS_IMETHODIMP nsMsgWindow::SetMailCharacterSet(
    const nsACString& aMailCharacterSet) {
  mMailCharacterSet.Assign(aMailCharacterSet);

  // Convert to a canonical charset name instead of using the charset name from
  // the message header as is. This is needed for charset menu item to have a
  // check mark correctly.
  nsresult rv;
  nsCOMPtr<nsICharsetConverterManager> ccm =
      do_GetService(NS_CHARSETCONVERTERMANAGER_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  return ccm->GetCharsetAlias(PromiseFlatCString(aMailCharacterSet).get(),
                              mMailCharacterSet);
}

NS_IMETHODIMP nsMsgWindow::GetCharsetOverride(bool* aCharsetOverride) {
  NS_ENSURE_ARG_POINTER(aCharsetOverride);
  *aCharsetOverride = mCharsetOverride;
  return NS_OK;
}

NS_IMETHODIMP nsMsgWindow::SetCharsetOverride(bool aCharsetOverride) {
  mCharsetOverride = aCharsetOverride;
  return NS_OK;
}

NS_IMETHODIMP nsMsgWindow::GetDomWindow(mozIDOMWindowProxy** aWindow) {
  NS_ENSURE_ARG_POINTER(aWindow);
  if (mDomWindow)
    CallQueryReferent(mDomWindow.get(), aWindow);
  else
    *aWindow = nullptr;
  return NS_OK;
}

NS_IMETHODIMP nsMsgWindow::SetDomWindow(mozIDOMWindowProxy* aWindow) {
  NS_ENSURE_ARG_POINTER(aWindow);
  mDomWindow = do_GetWeakReference(aWindow);

  nsCOMPtr<nsPIDOMWindowOuter> win = nsPIDOMWindowOuter::From(aWindow);
  nsIDocShell* docShell = nullptr;
  if (win) docShell = win->GetDocShell();

  nsCOMPtr<nsIDocShellTreeItem> docShellAsItem(docShell);

  if (docShellAsItem) {
    nsCOMPtr<nsIDocShellTreeItem> rootAsItem;
    docShellAsItem->GetInProcessSameTypeRootTreeItem(
        getter_AddRefs(rootAsItem));

    nsCOMPtr<nsIDocShell> rootAsShell(do_QueryInterface(rootAsItem));
    SetRootDocShell(rootAsShell);

    // force ourselves to figure out the message pane
    nsCOMPtr<nsIDocShell> messageWindowDocShell;
    GetMessageWindowDocShell(getter_AddRefs(messageWindowDocShell));
  }

  return NS_OK;
}

NS_IMETHODIMP nsMsgWindow::SetNotificationCallbacks(
    nsIInterfaceRequestor* aNotificationCallbacks) {
  mNotificationCallbacks = aNotificationCallbacks;
  return NS_OK;
}

NS_IMETHODIMP nsMsgWindow::GetNotificationCallbacks(
    nsIInterfaceRequestor** aNotificationCallbacks) {
  NS_ENSURE_ARG_POINTER(aNotificationCallbacks);
  NS_IF_ADDREF(*aNotificationCallbacks = mNotificationCallbacks);
  return NS_OK;
}

NS_IMETHODIMP nsMsgWindow::StopUrls() {
  m_stopped = true;
  nsCOMPtr<nsIWebNavigation> webnav(do_QueryReferent(mRootDocShellWeak));
  return webnav ? webnav->Stop(nsIWebNavigation::STOP_NETWORK)
                : NS_ERROR_FAILURE;
}

// nsIURIContentListener support

NS_IMETHODIMP nsMsgWindow::DoContent(const nsACString& aContentType,
                                     bool aIsContentPreferred,
                                     nsIRequest* request,
                                     nsIStreamListener** aContentHandler,
                                     bool* aAbortProcess) {
  if (!aContentType.IsEmpty()) {
    // forward the DoContent call to our docshell
    nsCOMPtr<nsIDocShell> messageWindowDocShell;
    GetMessageWindowDocShell(getter_AddRefs(messageWindowDocShell));
    nsCOMPtr<nsIURIContentListener> ctnListener =
        do_QueryInterface(messageWindowDocShell);
    if (ctnListener) {
      nsCOMPtr<nsIChannel> aChannel = do_QueryInterface(request);
      if (!aChannel) return NS_ERROR_FAILURE;

      // get the url for the channel...let's hope it is a mailnews url so we can
      // set our msg hdr sink on it.. right now, this is the only way I can
      // think of to force the msg hdr sink into the mime converter so it can
      // get too it later...
      nsCOMPtr<nsIURI> uri;
      aChannel->GetURI(getter_AddRefs(uri));
      if (uri) {
        nsCOMPtr<nsIMsgMailNewsUrl> mailnewsUrl(do_QueryInterface(uri));
        if (mailnewsUrl) mailnewsUrl->SetMsgWindow(this);
      }
      return ctnListener->DoContent(aContentType, aIsContentPreferred, request,
                                    aContentHandler, aAbortProcess);
    }
  }
  return NS_OK;
}

NS_IMETHODIMP
nsMsgWindow::IsPreferred(const char* aContentType, char** aDesiredContentType,
                         bool* aCanHandleContent) {
  // We don't want to handle opening any attachments inside the
  // message pane, but want to let nsIExternalHelperAppService take care.
  *aCanHandleContent = false;
  return NS_OK;
}

NS_IMETHODIMP nsMsgWindow::CanHandleContent(const char* aContentType,
                                            bool aIsContentPreferred,
                                            char** aDesiredContentType,
                                            bool* aCanHandleContent)

{
  // the mail window knows nothing about the default content types
  // its docshell can handle...ask the content area if it can handle
  // the content type...

  nsCOMPtr<nsIDocShell> messageWindowDocShell;
  GetMessageWindowDocShell(getter_AddRefs(messageWindowDocShell));
  nsCOMPtr<nsIURIContentListener> ctnListener(
      do_GetInterface(messageWindowDocShell));
  if (ctnListener)
    return ctnListener->CanHandleContent(aContentType, aIsContentPreferred,
                                         aDesiredContentType,
                                         aCanHandleContent);
  else
    *aCanHandleContent = false;
  return NS_OK;
}

NS_IMETHODIMP nsMsgWindow::GetParentContentListener(
    nsIURIContentListener** aParent) {
  NS_ENSURE_ARG_POINTER(aParent);
  *aParent = nullptr;
  return NS_OK;
}

NS_IMETHODIMP nsMsgWindow::SetParentContentListener(
    nsIURIContentListener* aParent) {
  return NS_OK;
}

NS_IMETHODIMP nsMsgWindow::GetLoadCookie(nsISupports** aLoadCookie) {
  NS_ENSURE_ARG_POINTER(aLoadCookie);
  *aLoadCookie = nullptr;
  return NS_OK;
}

NS_IMETHODIMP nsMsgWindow::SetLoadCookie(nsISupports* aLoadCookie) {
  return NS_OK;
}

NS_IMETHODIMP nsMsgWindow::GetPromptDialog(nsIPrompt** aPrompt) {
  NS_ENSURE_ARG_POINTER(aPrompt);

  // testing only
  if (mPromptDialog) {
    NS_ADDREF(*aPrompt = mPromptDialog);
    return NS_OK;
  }

  nsresult rv;
  nsCOMPtr<nsIDocShell> rootShell(do_QueryReferent(mRootDocShellWeak, &rv));
  if (rootShell) {
    nsCOMPtr<nsIPrompt> dialog;
    dialog = do_GetInterface(rootShell, &rv);
    dialog.forget(aPrompt);
  }
  return rv;
}

NS_IMETHODIMP nsMsgWindow::SetPromptDialog(nsIPrompt* aPromptDialog) {
  mPromptDialog = aPromptDialog;
  return NS_OK;
}

NS_IMETHODIMP
nsMsgWindow::DisplayURIInMessagePane(const nsAString& uri, bool clearMsgHdr,
                                     nsIPrincipal* principal) {
  if (clearMsgHdr && mMsgWindowCommands) mMsgWindowCommands->ClearMsgPane();

  nsCOMPtr<nsIDocShell> docShell;
  GetMessageWindowDocShell(getter_AddRefs(docShell));
  NS_ENSURE_TRUE(docShell, NS_ERROR_FAILURE);

  nsCOMPtr<nsIWebNavigation> webNav(do_QueryInterface(docShell));
  NS_ENSURE_TRUE(webNav, NS_ERROR_FAILURE);

  mozilla::dom::LoadURIOptions loadURIOptions;
  loadURIOptions.mTriggeringPrincipal = principal;
  return webNav->LoadURI(uri, loadURIOptions);
}

NS_IMETHODIMP
nsMsgWindow::DisplayHTMLInMessagePane(const nsAString& title,
                                      const nsAString& body, bool clearMsgHdr) {
  nsString htmlStr;
  htmlStr.AppendLiteral(
      u"<html><head><meta http-equiv=\"Content-Type\" content=\"text/html; "
      u"charset=UTF-8\"></head><body>");
  htmlStr.Append(body);
  htmlStr.AppendLiteral(u"</body></html>");

  char* encodedHtml =
      PL_Base64Encode(NS_ConvertUTF16toUTF8(htmlStr).get(), 0, nullptr);
  if (!encodedHtml) return NS_ERROR_OUT_OF_MEMORY;

  nsCString dataSpec;
  dataSpec = "data:text/html;base64,";
  dataSpec += encodedHtml;

  PR_FREEIF(encodedHtml);

  return DisplayURIInMessagePane(NS_ConvertASCIItoUTF16(dataSpec), clearMsgHdr,
                                 nsContentUtils::GetSystemPrincipal());
}

NS_IMPL_GETSET(nsMsgWindow, Stopped, bool, m_stopped)
