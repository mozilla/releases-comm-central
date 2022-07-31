/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsString.h"
#include "nsILDAPURL.h"
#include "nsCOMPtr.h"
#include "nsIURIMutator.h"

/**
 * nsLDAPURL
 *
 * nsLDAPURL uses an nsStandardURL stored in mBaseURL as its main url formatter.
 *
 * This is done to ensure that the pre-path sections of the URI are correctly
 * formatted and to re-use the functions for nsIURI as appropriate.
 *
 * Handling of the path sections of the URI are done within nsLDAPURL/parts of
 * the LDAP c-sdk. nsLDAPURL holds the individual sections of the path of the
 * URI locally (to allow convenient get/set), but always updates the mBaseURL
 * when one changes to ensure that mBaseURL.spec and the local data are kept
 * consistent.
 */

class nsLDAPURL : public nsILDAPURL {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIURI
  NS_DECL_NSILDAPURL

  nsLDAPURL();

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
  class Mutator : public nsIURIMutator, public BaseURIMutator<nsLDAPURL> {
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

    friend class nsLDAPURL;
  };
  friend BaseURIMutator<nsLDAPURL>;

 protected:
  virtual ~nsLDAPURL();

  void GetPathInternal(nsCString& aPath);
  nsresult SetPathInternal(const nsCString& aPath);

  nsCString mDN;      // Base Distinguished Name (Base DN)
  int32_t mScope;     // Search scope (base, one or sub)
  nsCString mFilter;  // LDAP search filter
  uint32_t mOptions;  // Options
  nsCString
      mAttributes;  // Either empty ("") or comma-separated list with
                    // leading _and_ trailing commas (i.e ",attr1,attr2,").
  nsCOMPtr<nsIURI> mBaseURL;
};
