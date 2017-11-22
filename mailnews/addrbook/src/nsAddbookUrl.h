/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsAddbookUrl_h__
#define nsAddbookUrl_h__

#include "nsIURI.h"
#include "nsCOMPtr.h"
#include "nsIAddbookUrl.h"
#include "nsIURIMutator.h"

class nsAddbookUrl : public nsIAddbookUrl
{
public:
    NS_DECL_ISUPPORTS
    NS_DECL_NSIURI
    NS_DECL_NSIADDBOOKURL

    nsAddbookUrl();

public:
    class Mutator
        : public nsIURIMutator
        , public BaseURIMutator<nsAddbookUrl>
    {
        NS_DECL_ISUPPORTS
        NS_FORWARD_SAFE_NSIURISETTERS(mURI)

    NS_IMETHOD Deserialize(const mozilla::ipc::URIParams& aParams) override
    {
      return NS_ERROR_NOT_IMPLEMENTED;
    }

    NS_IMETHOD Read(nsIObjectInputStream* aStream) override
    {
      return NS_ERROR_NOT_IMPLEMENTED;
    }

    NS_IMETHOD Finalize(nsIURI** aURI) override
    {
      mURI.forget(aURI);
      return NS_OK;
    }

    NS_IMETHOD SetSpec(const nsACString & aSpec) override
    {
      return InitFromSpec(aSpec);
    }

        explicit Mutator() { }
    private:
        virtual ~Mutator() { }

        friend class nsAddbookUrl;
    };

protected:
  enum RefHandlingEnum {
    eIgnoreRef,
    eHonorRef,
    eReplaceRef
  };
  virtual ~nsAddbookUrl();
  nsresult
  CloneInternal(RefHandlingEnum aRefHandlingMode,
                const nsACString& newRef, nsIURI** _retval);

  nsresult                      ParseUrl();
  int32_t                       mOperationType;     // the internal ID for the operation

  nsCOMPtr<nsIURI>              m_baseURL;          // the base URL for the object
};

#endif // nsAddbookUrl_h__
