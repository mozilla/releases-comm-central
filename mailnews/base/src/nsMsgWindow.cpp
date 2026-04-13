/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMsgWindow.h"
#include "nsIURILoader.h"
#include "nsIDocShell.h"
#include "nsIDocShellTreeItem.h"
#include "mozIDOMWindow.h"
#include "nsTransactionManagerCID.h"
#include "nsIMsgMailNewsUrl.h"
#include "nsIInterfaceRequestorUtils.h"
#include "nsIWebProgress.h"
#include "nsIWebProgressListener.h"
#include "nsPIDOMWindow.h"
#include "nsIChannel.h"
#include "nsIRequestObserver.h"
#include "netCore.h"
#include "prmem.h"
#include "plbase64.h"
#include "nsIWebNavigation.h"
#include "nsContentUtils.h"
#include "nsMsgUtils.h"
#include "mozilla/dom/Document.h"
#include "mozilla/TransactionManager.h"
#include "mozilla/dom/LoadURIOptionsBinding.h"
#include "mozilla/dom/Element.h"
#include "mozilla/dom/XULFrameElement.h"
#include "nsFrameLoader.h"

NS_IMPL_ISUPPORTS(nsMsgWindow, nsIMsgWindow, nsISupportsWeakReference)

nsMsgWindow::nsMsgWindow() {}

nsMsgWindow::~nsMsgWindow() {}

nsresult nsMsgWindow::Init() {
  // create Undo/Redo Transaction Manager
  mTransactionManager = new mozilla::TransactionManager();
  return mTransactionManager->SetMaxTransactionCount(-1);
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
