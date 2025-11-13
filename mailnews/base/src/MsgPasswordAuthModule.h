/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#ifndef COMM_MAILNEWS_BASE_SRC_MSGPASSWORDAUTHMODULE_H_
#define COMM_MAILNEWS_BASE_SRC_MSGPASSWORDAUTHMODULE_H_

#include "msgIPasswordAuthModule.h"

#include "nsString.h"

/**
 * Manages password access in memory and the local password database.
 */
class MsgPasswordAuthModule : public msgIPasswordAuthModule {
 public:
  NS_DECL_ISUPPORTS;
  NS_DECL_MSGIPASSWORDAUTHMODULE;

  MsgPasswordAuthModule() = default;

  /** Return the in-memory cached UTF-16 value for the password. */
  const nsString& cachedPassword() const;

 protected:
  virtual ~MsgPasswordAuthModule() = default;

 private:
  nsString mPassword;
};

#endif  // COMM_MAILNEWS_BASE_SRC_MSGPASSWORDAUTHMODULE_H_
