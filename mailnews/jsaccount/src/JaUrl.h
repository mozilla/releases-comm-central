/* -*- Mode: C++; tab-width: 8; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set ts=8 sts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _JaUrl_H_
#define _JaUrl_H_

#include "DelegateList.h"
#include "msgCore.h"
#include "msgIOverride.h"
#include "nsAutoPtr.h"
#include "nsCycleCollectionParticipant.h"
#include "nsDataHashtable.h"
#include "nsIFile.h"
#include "nsIInterfaceRequestor.h"
#include "nsIMsgFolder.h"
#include "nsISupports.h"
#include "nsMsgMailNewsUrl.h"
#include "nsWeakReference.h"

namespace mozilla {
namespace mailnews {

/* Header file */

// This class is an XPCOM component, usable in JS, that calls the methods
// in the C++ base class (bypassing any JS override).
class JaBaseCppUrl : public nsMsgMailNewsUrl,
                     public nsIMsgMessageUrl,
                     public nsIInterfaceRequestor,
                     public nsSupportsWeakReference

{
public:
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_NSIMSGMESSAGEURL
  NS_DECL_NSIINTERFACEREQUESTOR
  JaBaseCppUrl() { }

  // nsIMsgMailNewsUrl overrides
  NS_IMETHOD GetFolder(nsIMsgFolder **aFolder) override;
  NS_IMETHOD SetFolder(nsIMsgFolder *aFolder) override;

protected:
  virtual ~JaBaseCppUrl() { }

  // nsIMsgMailUrl variables.

  nsCOMPtr<nsIMsgFolder> mFolder;

  // nsIMsgMessageUrl variables.

  // the uri for the original message, like ews-message://server/folder#123
  nsCString mUri;
  nsCOMPtr<nsIFile> mMessageFile;
  bool mCanonicalLineEnding;
  nsCString mOriginalSpec;
};

class JaCppUrlDelegator : public JaBaseCppUrl,
                          public msgIOverride
{
public:
  NS_DECL_ISUPPORTS_INHERITED
  NS_DECL_MSGIOVERRIDE

  NS_FORWARD_NSIMSGMAILNEWSURL(DELEGATE_JS(nsIMsgMailNewsUrl, mJsIMsgMailNewsUrl)->)
  NS_FORWARD_NSIURI(DELEGATE_JS(nsIURI, mJsIURI)->)
  NS_FORWARD_NSIURL(DELEGATE_JS(nsIURL, mJsIURL)->)
  NS_FORWARD_NSIMSGMESSAGEURL(DELEGATE_JS(nsIMsgMessageUrl, mJsIMsgMessageUrl)->)
  NS_FORWARD_NSIINTERFACEREQUESTOR(DELEGATE_JS(nsIInterfaceRequestor, mJsIInterfaceRequestor)->)

  JaCppUrlDelegator();

  class Super : public nsIMsgMailNewsUrl,
                public nsIMsgMessageUrl,
                public nsIInterfaceRequestor
  {
    public:
      Super(JaCppUrlDelegator *aFakeThis) {mFakeThis = aFakeThis;}
      NS_DECL_ISUPPORTS
      NS_FORWARD_NSIMSGMAILNEWSURL(mFakeThis->JaBaseCppUrl::)
      NS_FORWARD_NSIURI(mFakeThis->JaBaseCppUrl::)
      NS_FORWARD_NSIURL(mFakeThis->JaBaseCppUrl::)
      NS_FORWARD_NSIMSGMESSAGEURL(mFakeThis->JaBaseCppUrl::)
      NS_FORWARD_NSIINTERFACEREQUESTOR(mFakeThis->JaBaseCppUrl::)
    private:
      virtual ~Super() {}
      JaCppUrlDelegator *mFakeThis;
  };

private:
  virtual ~JaCppUrlDelegator() {
  }

  // Interfaces that may be overridden by JS.
  nsCOMPtr<nsIMsgMailNewsUrl> mJsIMsgMailNewsUrl;
  nsCOMPtr<nsIURI> mJsIURI;
  nsCOMPtr<nsIURL> mJsIURL;
  nsCOMPtr<nsIMsgMessageUrl> mJsIMsgMessageUrl;
  nsCOMPtr<nsIInterfaceRequestor> mJsIInterfaceRequestor;

  // Owning reference to the JS override.
  nsCOMPtr<nsISupports> mJsISupports;

  // Class to bypass JS delegates. nsCOMPtr for when we do cycle collection.
  nsCOMPtr<nsIMsgMailNewsUrl> mCppBase;

  RefPtr<DelegateList> mDelegateList;
  nsDataHashtable<nsCStringHashKey, bool> *mMethods;
};

} // namespace mailnews
} // namespace mozilla

#endif
