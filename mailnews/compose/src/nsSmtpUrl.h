/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsSmtpUrl_h__
#define nsSmtpUrl_h__

#include "nsISmtpUrl.h"
#include "nsIURI.h"
#include "nsMsgMailNewsUrl.h"
#include "nsIMsgIdentity.h"
#include "nsCOMPtr.h"
#include "nsIPrompt.h"
#include "nsIAuthPrompt.h"
#include "nsIMsgOutgoingServer.h"
#include "nsIInterfaceRequestor.h"
#include "nsIInterfaceRequestorUtils.h"
#include "nsIURIMutator.h"

class nsMailtoUrl : public nsIMailtoUrl, public nsIURI {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIURI
  NS_DECL_NSIMAILTOURL

  nsMailtoUrl();
  static nsresult NewMailtoURI(const nsACString& aSpec, nsIURI* aBaseURI,
                               nsIURI** _retval);

 protected:
  virtual nsresult Clone(nsIURI** _retval);
  virtual nsresult SetSpecInternal(const nsACString& aSpec);
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

 public:
  class Mutator : public nsIURIMutator, public BaseURIMutator<nsMailtoUrl> {
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

    friend class nsMailtoUrl;
  };
  friend BaseURIMutator<nsMailtoUrl>;

 protected:
  virtual ~nsMailtoUrl();
  nsresult ParseUrl();
  nsresult CleanupMailtoState();
  nsresult ParseMailtoUrl(char* searchPart);

  nsCOMPtr<nsIURI> m_baseURL;

  // data retrieved from parsing the url: (Note the url could be a post from
  // file or it could be in the url)
  nsCString m_toPart;
  nsCString m_ccPart;
  nsCString m_subjectPart;
  nsCString m_newsgroupPart;
  nsCString m_newsHostPart;
  nsCString m_referencePart;
  nsCString m_bodyPart;
  nsCString m_bccPart;
  nsCString m_followUpToPart;
  nsCString m_fromPart;
  nsCString m_htmlPart;
  nsCString m_organizationPart;
  nsCString m_replyToPart;
  nsCString m_priorityPart;

  MSG_ComposeFormat mFormat;
};

class nsSmtpUrl : public nsISmtpUrl, public nsMsgMailNewsUrl {
 public:
  NS_DECL_ISUPPORTS_INHERITED

  // From nsISmtpUrl
  NS_DECL_NSISMTPURL

  // nsSmtpUrl
  nsSmtpUrl();
  static nsresult NewSmtpURI(const nsACString& aSpec, nsIURI* aBaseURI,
                             nsIURI** _retval);

 protected:
  virtual ~nsSmtpUrl();

  // data retrieved from parsing the url: (Note the url could be a post from
  // file or it could be in the url)
  nsCString m_toPart;
  nsCString m_fromPart;

  bool m_isPostMessage;
  bool m_requestDSN;
  nsCString m_dsnEnvid;
  bool m_verifyLogon;

  // Smtp specific event sinks
  nsCOMPtr<nsIFile> m_fileName;
  nsCOMPtr<nsIMsgIdentity> m_senderIdentity;
  nsCOMPtr<nsIPrompt> m_netPrompt;
  nsCOMPtr<nsIAuthPrompt> m_netAuthPrompt;
  nsCOMPtr<nsIInterfaceRequestor> m_callbacks;
  nsCOMPtr<nsIMsgOutgoingServer> m_smtpServer;

  // it is possible to encode the message to parse in the form of a url.
  // This function is used to decompose the search and path part into the bare
  // message components (to, fcc, bcc, etc.)
  nsresult ParseMessageToPost(char* searchPart);
};

#endif  // nsSmtpUrl_h__
