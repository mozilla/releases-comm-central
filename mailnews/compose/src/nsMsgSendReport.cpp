/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMsgSendReport.h"

#include "nsIMsgCompose.h"
#include "nsMsgPrompts.h"
#include "nsError.h"
#include "nsIStringBundle.h"
#include "mozilla/Components.h"

NS_IMPL_ISUPPORTS(nsMsgSendReport, nsIMsgSendReport)

nsMsgSendReport::nsMsgSendReport() { Reset(); }

nsMsgSendReport::~nsMsgSendReport() {}

/* attribute long currentProcess; */
NS_IMETHODIMP nsMsgSendReport::GetCurrentProcess(int32_t* aCurrentProcess) {
  NS_ENSURE_ARG_POINTER(aCurrentProcess);
  *aCurrentProcess = mCurrentProcess;
  return NS_OK;
}
NS_IMETHODIMP nsMsgSendReport::SetCurrentProcess(int32_t aCurrentProcess) {
  if (aCurrentProcess < 0 || aCurrentProcess > SEND_LAST_PROCESS)
    return NS_ERROR_ILLEGAL_VALUE;

  mCurrentProcess = aCurrentProcess;
  if (aCurrentProcess == process_NNTP) mNNTPProcessed = true;

  return NS_OK;
}

/* attribute long deliveryMode; */
NS_IMETHODIMP nsMsgSendReport::GetDeliveryMode(int32_t* aDeliveryMode) {
  NS_ENSURE_ARG_POINTER(aDeliveryMode);
  *aDeliveryMode = mDeliveryMode;
  return NS_OK;
}
NS_IMETHODIMP nsMsgSendReport::SetDeliveryMode(int32_t aDeliveryMode) {
  mDeliveryMode = aDeliveryMode;
  return NS_OK;
}

/* void Reset (); */
NS_IMETHODIMP nsMsgSendReport::Reset() {
  mCurrentProcess = 0;
  mDeliveryMode = 0;
  mAlreadyDisplayReport = false;
  mNNTPProcessed = false;
  mCurrErrMessage.Truncate();

  return NS_OK;
}

NS_IMETHODIMP nsMsgSendReport::GetErrMessage(nsAString& message) {
  message = mCurrErrMessage;
  return NS_OK;
}

NS_IMETHODIMP nsMsgSendReport::SetErrMessage(const nsAString& message) {
  mCurrErrMessage = message;
  return NS_OK;
}

NS_IMETHODIMP nsMsgSendReport::DisplayReport(mozIDOMWindowProxy* window,
                                             nsresult* _retval) {
  NS_ENSURE_ARG_POINTER(_retval);

  nsresult currError = NS_OK;
  *_retval = currError;

  if (mAlreadyDisplayReport) return NS_OK;

  nsresult rv;  // don't step on currError.
  nsCOMPtr<nsIStringBundleService> bundleService =
      mozilla::components::StringBundle::Service();
  NS_ENSURE_TRUE(bundleService, NS_ERROR_UNEXPECTED);
  nsCOMPtr<nsIStringBundle> bundle;
  rv = bundleService->CreateBundle(
      "chrome://messenger/locale/messengercompose/composeMsgs.properties",
      getter_AddRefs(bundle));
  NS_ENSURE_SUCCESS(rv, rv);

  nsString dialogTitle;
  nsString dialogMessage;

  nsString currMessage = mCurrErrMessage;

  // Do we have an explanation of the error? if no, try to build one...
  if (currMessage.IsEmpty()) {
    nsMsgGetMessageByName("sendFailed", currMessage);
  }

  if (mDeliveryMode == nsIMsgCompDeliverMode::Now ||
      mDeliveryMode == nsIMsgCompDeliverMode::SendUnsent) {
    bundle->GetStringFromName("sendMessageErrorTitle", dialogTitle);

    const char* preStrName = "sendFailed";
    bool askToGoBackToCompose = false;
    switch (mCurrentProcess) {
      case process_BuildMessage:
        preStrName = "sendFailed";
        askToGoBackToCompose = false;
        break;
      case process_NNTP:
        preStrName = "sendFailed";
        askToGoBackToCompose = false;
        break;
      case process_SMTP:
        if (mNNTPProcessed)
          preStrName = "sendFailedButNntpOk";
        else
          preStrName = "sendFailed";
        askToGoBackToCompose = false;
        break;
      case process_Copy:
        preStrName = "failedCopyOperation";
        askToGoBackToCompose = (mDeliveryMode == nsIMsgCompDeliverMode::Now);
        break;
      case process_FCC:
        preStrName = "failedCopyOperation";
        askToGoBackToCompose = (mDeliveryMode == nsIMsgCompDeliverMode::Now);
        break;
    }
    bundle->GetStringFromName(preStrName, dialogMessage);

    // Do we already have an error message?
    if (!askToGoBackToCompose && currMessage.IsEmpty()) {
      // we don't have an error description but we can put a generic explanation
      bundle->GetStringFromName("genericFailureExplanation", currMessage);
    }

    if (!currMessage.IsEmpty()) {
      // Don't need to repeat ourself!
      if (!currMessage.Equals(dialogMessage)) {
        if (!dialogMessage.IsEmpty()) dialogMessage.Append(char16_t('\n'));
        dialogMessage.Append(currMessage);
      }
    }

    if (askToGoBackToCompose) {
      bool oopsGiveMeBackTheComposeWindow = true;
      nsString text1;
      bundle->GetStringFromName("returnToComposeWindowQuestion", text1);
      if (!dialogMessage.IsEmpty()) dialogMessage.AppendLiteral("\n");
      dialogMessage.Append(text1);
      nsMsgAskBooleanQuestionByString(window, dialogMessage.get(),
                                      &oopsGiveMeBackTheComposeWindow,
                                      dialogTitle.get());
      if (!oopsGiveMeBackTheComposeWindow) *_retval = NS_OK;
    } else
      nsMsgDisplayMessageByString(window, dialogMessage.get(),
                                  dialogTitle.get());
  } else {
    const char* title;
    const char* messageName;

    switch (mDeliveryMode) {
      case nsIMsgCompDeliverMode::Later:
        title = "sendLaterErrorTitle";
        messageName = "unableToSendLater";
        break;

      case nsIMsgCompDeliverMode::AutoSaveAsDraft:
      case nsIMsgCompDeliverMode::SaveAsDraft:
        title = "saveDraftErrorTitle";
        messageName = "unableToSaveDraft";
        break;

      case nsIMsgCompDeliverMode::SaveAsTemplate:
        title = "saveTemplateErrorTitle";
        messageName = "unableToSaveTemplate";
        break;

      default:
        /* This should never happen! */
        title = "sendMessageErrorTitle";
        messageName = "sendFailed";
        break;
    }

    bundle->GetStringFromName(title, dialogTitle);
    bundle->GetStringFromName(messageName, dialogMessage);

    // Do we have an error message...
    if (currMessage.IsEmpty()) {
      // we don't have an error description but we can put a generic explanation
      bundle->GetStringFromName("genericFailureExplanation", currMessage);
    }

    if (!currMessage.IsEmpty()) {
      if (!dialogMessage.IsEmpty()) dialogMessage.Append(char16_t('\n'));
      dialogMessage.Append(currMessage);
    }
    nsMsgDisplayMessageByString(window, dialogMessage.get(), dialogTitle.get());
  }

  mAlreadyDisplayReport = true;
  return NS_OK;
}
