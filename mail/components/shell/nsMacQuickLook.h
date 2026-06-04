/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAIL_COMPONENTS_SHELL_NSMACQUICKLOOK_H_
#define COMM_MAIL_COMPONENTS_SHELL_NSMACQUICKLOOK_H_

#include "nsIMacQuickLook.h"
#include "nsTArray.h"
#include "nsString.h"

class nsMacQuickLook : public nsIMacQuickLook {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIMACQUICKLOOK

  nsMacQuickLook() = default;

 private:
  virtual ~nsMacQuickLook();

  nsTArray<nsString> mFilePaths;
  nsTArray<nsString> mTitles;
};

#endif  // COMM_MAIL_COMPONENTS_SHELL_NSMACQUICKLOOK_H_
