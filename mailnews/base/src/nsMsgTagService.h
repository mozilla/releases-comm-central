/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_BASE_SRC_NSMSGTAGSERVICE_H_
#define COMM_MAILNEWS_BASE_SRC_NSMSGTAGSERVICE_H_

#include "nsIMsgTagService.h"
#include "nsIPrefBranch.h"
#include "nsCOMPtr.h"
#include "nsString.h"
#include "nsTArray.h"

class nsMsgTag final : public nsIMsgTag {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGTAG

  nsMsgTag(const nsACString& aKey, const nsAString& aTag,
           const nsACString& aColor, const nsACString& aOrdinal);

 protected:
  ~nsMsgTag();

  nsString mTag;
  nsCString mKey, mColor, mOrdinal;
};

class nsMsgTagService final : public nsIMsgTagService {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGTAGSERVICE

  nsMsgTagService();

 private:
  ~nsMsgTagService();

 protected:
  nsresult SetUnicharPref(const char* prefName, const nsAString& prefValue);
  nsresult GetUnicharPref(const char* prefName, nsAString& prefValue);
  nsresult SetupLabelTags();
  nsresult RefreshKeyCache();

  nsCOMPtr<nsIPrefBranch> m_tagPrefBranch;
  nsTArray<nsCString> m_keys;
};

#endif  // COMM_MAILNEWS_BASE_SRC_NSMSGTAGSERVICE_H_
