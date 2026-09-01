/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_BASE_SRC_NSENCRYPTEDMSGURISSERVICE_H_
#define COMM_MAILNEWS_BASE_SRC_NSENCRYPTEDMSGURISSERVICE_H_

#include "nsIEncryptedMsgURIsService.h"
#include "nsTArray.h"
#include "nsTHashSet.h"
#include "nsString.h"

class nsEncryptedMsgURIsService : public nsIEncryptedMsgURIsService {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIENCRYPTEDMSGURISSERVICE

  nsEncryptedMsgURIsService();

 protected:
  virtual ~nsEncryptedMsgURIsService();
  // One entry per registration, so the same key may appear several times: two
  // viewers can display one message, and one viewer registers a message under
  // more than one URI form. ForgetEncrypted() drops a single entry, so a key
  // disappears only once every registration of it has been forgotten.
  nsTArray<nsCString> mEncryptedURIs;
  // URIs whose rendered encrypted part was integrity protected.
  nsTHashSet<nsCString> mIntegrityProtectedURIs;
  // URIs for which at least one registration lacked integrity protection. The
  // integrity claim is never restored for such a URI, so that the order in
  // which producers with different guarantees register it does not matter.
  nsTHashSet<nsCString> mIntegrityViolatedURIs;
};

#endif  // COMM_MAILNEWS_BASE_SRC_NSENCRYPTEDMSGURISSERVICE_H_
