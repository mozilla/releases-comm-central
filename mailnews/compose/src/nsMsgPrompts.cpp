/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#include "nsMsgPrompts.h"

#include "nsMsgCopy.h"
#include "nsIPrompt.h"
#include "nsIWindowWatcher.h"
#include "nsComposeStrings.h"
#include "nsIStringBundle.h"
#include "nsServiceManagerUtils.h"
#include "nsMsgUtils.h"
#include "mozilla/Components.h"
#include "nsIPromptService.h"
#include "nsEmbedCID.h"

nsresult nsMsgGetMessageByName(const char* aName, nsString& aResult) {
  nsresult rv;
  nsCOMPtr<nsIStringBundleService> bundleService =
      mozilla::components::StringBundle::Service();
  NS_ENSURE_TRUE(bundleService, NS_ERROR_UNEXPECTED);

  nsCOMPtr<nsIStringBundle> bundle;
  rv = bundleService->CreateBundle(
      "chrome://messenger/locale/messengercompose/composeMsgs.properties",
      getter_AddRefs(bundle));
  NS_ENSURE_SUCCESS(rv, rv);

  return bundle->GetStringFromName(aName, aResult);
}

static nsresult nsMsgBuildMessageByName(const char* aName, nsIFile* aFile,
                                        nsString& aResult) {
  NS_ENSURE_ARG_POINTER(aFile);
  nsresult rv;
  nsCOMPtr<nsIStringBundleService> bundleService =
      mozilla::components::StringBundle::Service();
  NS_ENSURE_TRUE(bundleService, NS_ERROR_UNEXPECTED);

  nsCOMPtr<nsIStringBundle> bundle;
  rv = bundleService->CreateBundle(
      "chrome://messenger/locale/messengercompose/composeMsgs.properties",
      getter_AddRefs(bundle));
  NS_ENSURE_SUCCESS(rv, rv);

  nsString path;
  aFile->GetPath(path);

  AutoTArray<nsString, 1> params = {path};
  return bundle->FormatStringFromName(aName, params, aResult);
}

nsresult nsMsgBuildMessageWithFile(nsIFile* aFile, nsString& aResult) {
  return nsMsgBuildMessageByName("unableToOpenFile", aFile, aResult);
}

nsresult nsMsgBuildMessageWithTmpFile(nsIFile* aFile, nsString& aResult) {
  return nsMsgBuildMessageByName("unableToOpenTmpFile", aFile, aResult);
}

nsresult nsMsgDisplayMessageByName(mozIDOMWindowProxy* window,
                                   const char* aName,
                                   const char16_t* windowTitle) {
  nsString msg;
  nsMsgGetMessageByName(aName, msg);
  return nsMsgDisplayMessageByString(window, msg.get(), windowTitle);
}

nsresult nsMsgDisplayMessageByString(mozIDOMWindowProxy* window,
                                     const char16_t* msg,
                                     const char16_t* windowTitle) {
  NS_ENSURE_ARG_POINTER(msg);

  nsresult rv;
  nsCOMPtr<nsIPromptService> dlgService(
      do_GetService(NS_PROMPTSERVICE_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  return dlgService->Alert(window, windowTitle, msg);
}

nsresult nsMsgAskBooleanQuestionByString(mozIDOMWindowProxy* window,
                                         const char16_t* msg, bool* answer,
                                         const char16_t* windowTitle) {
  NS_ENSURE_TRUE(msg && *msg, NS_ERROR_INVALID_ARG);

  nsresult rv;
  nsCOMPtr<nsIPromptService> dlgService(
      do_GetService(NS_PROMPTSERVICE_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  return dlgService->Confirm(window, windowTitle, msg, answer);
}
