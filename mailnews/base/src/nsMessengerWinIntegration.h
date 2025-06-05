/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_BASE_SRC_NSMESSENGERWININTEGRATION_H_
#define COMM_MAILNEWS_BASE_SRC_NSMESSENGERWININTEGRATION_H_

#include "nsCOMPtr.h"
#include "nsString.h"
#include "nsIMessengerWindowsIntegration.h"
#include "nsIPrefBranch.h"

class nsMessengerWinIntegration : public nsIMessengerWindowsIntegration {
 public:
  nsMessengerWinIntegration();

  NS_DECL_ISUPPORTS
  NS_DECL_NSIMESSENGERWINDOWSINTEGRATION
  NS_DECL_NSIMESSENGEROSINTEGRATION

 private:
  static LRESULT CALLBACK IconWindowProc(HWND msgWindow, UINT msg, WPARAM wp,
                                         LPARAM lp);

  virtual ~nsMessengerWinIntegration();

  nsresult CreateIconWindow();
  nsresult SetTooltip();
  nsresult UpdateTrayIcon();

  nsCOMPtr<nsIPrefBranch> mPrefBranch;
  bool mTrayIconShown = false;
  nsString mBrandShortName;
  nsString mUnreadTooltip;
};

#endif  // COMM_MAILNEWS_BASE_SRC_NSMESSENGERWININTEGRATION_H_
