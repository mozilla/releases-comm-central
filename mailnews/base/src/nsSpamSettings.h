/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_BASE_SRC_NSSPAMSETTINGS_H_
#define COMM_MAILNEWS_BASE_SRC_NSSPAMSETTINGS_H_

#include "nsCOMPtr.h"
#include "nsISpamSettings.h"
#include "nsString.h"
#include "nsIOutputStream.h"
#include "nsIMsgIncomingServer.h"
#include "nsIUrlListener.h"
#include "nsCOMArray.h"
#include "nsIAbDirectory.h"
#include "nsTArray.h"

class nsSpamSettings : public nsISpamSettings, public nsIUrlListener {
 public:
  nsSpamSettings();

  NS_DECL_ISUPPORTS
  NS_DECL_NSISPAMSETTINGS
  NS_DECL_NSIURLLISTENER

 private:
  virtual ~nsSpamSettings();

  nsCOMPtr<nsIOutputStream> mLogStream;
  nsCOMPtr<nsIFile> mLogFile;

  int32_t mLevel;
  int32_t mPurgeInterval;
  int32_t mMoveTargetMode;

  bool mPurge;
  bool mUseWhiteList;
  bool mMoveOnSpam;
  bool mUseServerFilter;

  nsCString mActionTargetAccount;
  nsCString mActionTargetFolder;
  nsCString mWhiteListAbURI;
  // used to detect changes to the spam folder in ::initialize
  nsCString mCurrentJunkFolderURI;

  nsCString mServerFilterName;
  nsCOMPtr<nsIFile> mServerFilterFile;
  int32_t mServerFilterTrustFlags;

  // array of address directories to use in junk whitelisting
  nsCOMArray<nsIAbDirectory> mWhiteListDirArray;
  // mail domains to use in junk whitelisting
  nsCString mTrustedMailDomains;
  // should we inhibit whitelisting address of identity?
  bool mInhibitWhiteListingIdentityUser;
  // should we inhibit whitelisting domain of identity?
  bool mInhibitWhiteListingIdentityDomain;
  // email addresses associated with this server
  nsTArray<nsCString> mEmails;

  // helper routine used by Initialize which unsets the junk flag on the
  // previous junk folder for this account, and sets it on the new junk folder.
  nsresult UpdateJunkFolderState();
};

#endif  // COMM_MAILNEWS_BASE_SRC_NSSPAMSETTINGS_H_
