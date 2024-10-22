/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsMsgMailNewsUrl_h___
#define nsMsgMailNewsUrl_h___

#include "msgCore.h"
#include "nscore.h"
#include "nsISupports.h"
#include "nsIUrlListener.h"
#include "nsTObserverArray.h"
#include "nsCOMPtr.h"
#include "nsIMimeHeaders.h"
#include "nsIMsgMailNewsUrl.h"
#include "nsIURL.h"
#include "nsIURIWithSpecialOrigin.h"
#include "nsIMsgSearchSession.h"
#include "nsICacheEntry.h"
#include "nsIWeakReferenceUtils.h"
#include "nsString.h"
#include "nsIURIMutator.h"
#include "nsISerializable.h"
#include "nsIClassInfo.h"
#include "nsITransportSecurityInfo.h"

///////////////////////////////////////////////////////////////////////////////////
// Okay, I found that all of the mail and news url interfaces needed to support
// several common interfaces (in addition to those provided through nsIURI).
// So I decided to group them all in this implementation so we don't have to
// duplicate the code.
//
//////////////////////////////////////////////////////////////////////////////////

class nsMsgMailNewsUrl : public nsIMsgMailNewsUrl,
                         public nsIURIWithSpecialOrigin,
                         public nsISerializable,
                         public nsIClassInfo {
 public:
  nsMsgMailNewsUrl();

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIMSGMAILNEWSURL
  NS_DECL_NSIURI
  NS_DECL_NSIURL
  NS_DECL_NSIURIWITHSPECIALORIGIN
  NS_DECL_NSISERIALIZABLE
  NS_DECL_NSICLASSINFO

 protected:
  virtual nsresult Clone(nsIURI** _retval);
  virtual nsresult SetScheme(const nsACString& aScheme);
  virtual nsresult SetUserPass(const nsACString& aUserPass);
  virtual nsresult SetUsername(const nsACString& aUsername);
  virtual nsresult SetPassword(const nsACString& aPassword);
  virtual nsresult SetHostPort(const nsACString& aHostPort);
  virtual nsresult SetHost(const nsACString& aHost);
  virtual nsresult SetPort(int32_t aPort);
  virtual nsresult SetPathQueryRef(const nsACString& aPath);
  virtual nsresult SetRef(const nsACString& aRef);
  virtual nsresult SetFilePath(const nsACString& aFilePath);
  virtual nsresult SetQuery(const nsACString& aQuery);
  virtual nsresult SetQueryWithEncoding(const nsACString& aQuery,
                                        const mozilla::Encoding* aEncoding);
  virtual nsresult CreateURL(const nsACString& aSpec,
                             nsIURL** aURL);  // nsMailboxUrl overrides this.

 public:
  class Mutator : public nsIURIMutator,
                  public BaseURIMutator<nsMsgMailNewsUrl> {
    NS_DECL_ISUPPORTS
    NS_FORWARD_SAFE_NSIURISETTERS_RET(mURI)

    NS_IMETHOD Deserialize(const mozilla::ipc::URIParams& aParams) override {
      return NS_ERROR_NOT_IMPLEMENTED;
    }

    NS_IMETHOD Finalize(nsIURI** aURI) override {
      mURI.forget(aURI);
      return NS_OK;
    }

    NS_IMETHOD SetSpec(const nsACString& aSpec,
                       nsIURIMutator** aMutator) override {
      if (aMutator) NS_ADDREF(*aMutator = this);
      return InitFromSpec(aSpec);
    }

    explicit Mutator() {}

   private:
    virtual ~Mutator() {}

    friend class nsMsgMailNewsUrl;
  };
  friend BaseURIMutator<nsMsgMailNewsUrl>;

 protected:
  virtual ~nsMsgMailNewsUrl();

  nsCOMPtr<nsIURL> m_baseURL;
  nsCOMPtr<nsIURI> m_normalizedOrigin;
  nsWeakPtr m_statusFeedbackWeak;
  nsWeakPtr m_msgWindowWeak;
  nsWeakPtr m_loadGroupWeak;
  nsCOMPtr<nsIMimeHeaders> mMimeHeaders;
  nsCOMPtr<nsIMsgSearchSession> m_searchSession;
  nsCOMPtr<nsICacheEntry> m_memCacheEntry;
  nsCString m_errorCode;
  nsCString m_seeOtherURI;
  nsString m_errorMessage;
  nsString m_errorParameters;
  int64_t mMaxProgress;
  bool m_runningUrl;
  bool m_updatingFolder;
  bool m_msgIsInLocalCache;
  bool m_suppressErrorMsgs;
  bool m_hasNormalizedOrigin;

  // the following field is really a bit of a hack to make
  // open attachments work. The external applications code sometimes tries to
  // figure out the right handler to use by looking at the file extension of the
  // url we are trying to load. Unfortunately, the attachment file name really
  // isn't part of the url string....so we'll store it here...and if the url we
  // are running is an attachment url, we'll set it here. Then when the helper
  // apps code asks us for it, we'll return the right value.
  nsCString mAttachmentFileName;

  nsTObserverArray<nsCOMPtr<nsIUrlListener> > mUrlListeners;

  // Security info from the socket transport (if any), after a failed operation.
  // Here so that urlListeners can access and handle bad certificates in
  // their OnStopRunningUrl() callback.
  nsCOMPtr<nsITransportSecurityInfo> mFailedSecInfo;
};

#endif /* nsMsgMailNewsUrl_h___ */
