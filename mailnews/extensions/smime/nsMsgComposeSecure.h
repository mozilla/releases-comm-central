/* -*- Mode: idl; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_EXTENSIONS_SMIME_NSMSGCOMPOSESECURE_H_
#define COMM_MAILNEWS_EXTENSIONS_SMIME_NSMSGCOMPOSESECURE_H_

#include "nsIMsgComposeSecure.h"
#include "nsCOMPtr.h"
#include "nsICMSEncoder.h"
#include "nsIX509Cert.h"
#include "nsIStringBundle.h"
#include "nsICryptoHash.h"
#include "nsICMSMessage.h"
#include "nsString.h"
#include "nsTHashMap.h"
#include "nsIOutputStream.h"
#include "mozilla/UniquePtr.h"
#include "mozilla/StaticMutex.h"

class nsIMsgCompFields;
namespace mozilla {
namespace mailnews {
class MimeEncoder;
}
}  // namespace mozilla

typedef enum {
  mime_crypto_none,            /* normal unencapsulated MIME message */
  mime_crypto_clear_signed,    /* multipart/signed encapsulation */
  mime_crypto_opaque_signed,   /* application/x-pkcs7-mime (signedData) */
  mime_crypto_encrypted,       /* application/x-pkcs7-mime */
  mime_crypto_signed_encrypted /* application/x-pkcs7-mime */
} mimeDeliveryCryptoState;

class nsMsgComposeSecure : public nsIMsgComposeSecure {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGCOMPOSESECURE

  nsMsgComposeSecure();

  void GetOutputStream(nsIOutputStream** stream) {
    NS_IF_ADDREF(*stream = mStream);
  }
  nsresult GetSMIMEBundleString(const char16_t* name, nsString& outString);

 private:
  virtual ~nsMsgComposeSecure();
  typedef mozilla::mailnews::MimeEncoder MimeEncoder;
  nsresult MimeInitMultipartSigned(bool aOuter, nsIMsgSendReport* sendReport);
  nsresult MimeInitEncryption(bool aSign, nsIMsgSendReport* sendReport);
  nsresult MimeFinishMultipartSigned(bool aOuter, nsIMsgSendReport* sendReport);
  nsresult MimeFinishEncryption(bool aSign, nsIMsgSendReport* sendReport);
  nsresult MimeCryptoHackCerts(const char* aRecipients,
                               nsIMsgSendReport* sendReport, bool aEncrypt,
                               bool aSign, nsIMsgIdentity* aIdentity);
  bool InitializeSMIMEBundle();
  nsresult SMIMEBundleFormatStringFromName(const char* name,
                                           nsTArray<nsString>& params,
                                           nsAString& outString);
  nsresult ExtractEncryptionState(nsIMsgIdentity* aIdentity,
                                  nsIMsgCompFields* aComposeFields,
                                  bool* aSignMessage, bool* aEncrypt);

  bool mSignMessage;
  bool mAlwaysEncryptMessage;
  mimeDeliveryCryptoState mCryptoState;
  nsCOMPtr<nsIOutputStream> mStream;
  int16_t mHashType;
  nsCOMPtr<nsICryptoHash> mDataHash;
  mozilla::UniquePtr<MimeEncoder> mSigEncoder;
  char* mMultipartSignedBoundary;
  nsString mSigningCertName;
  nsAutoCString mSigningCertDBKey;
  nsCOMPtr<nsIX509Cert> mSelfSigningCert;
  nsString mEncryptionCertName;
  nsAutoCString mEncryptionCertDBKey;
  nsCOMPtr<nsIX509Cert> mSelfEncryptionCert;
  nsTArray<RefPtr<nsIX509Cert>> mCerts;
  nsCOMPtr<nsICMSMessage> mEncryptionCinfo;
  nsCOMPtr<nsICMSEncoder> mEncryptionContext;
  nsCOMPtr<nsIStringBundle> mSMIMEBundle;

  // Maps email address to nsIX509Cert.dbKey of a verified certificate.
  nsTHashMap<nsCStringHashKey, nsCString> mValidCertForEmailAddr;
  static mozilla::StaticMutex sMutex;

  mozilla::UniquePtr<MimeEncoder> mCryptoEncoder;
  bool mIsDraft;

  enum { eBufferSize = 8192 };
  char* mBuffer;
  uint32_t mBufferedBytes;

  bool mErrorAlreadyReported;
  void SetError(nsIMsgSendReport* sendReport, const char16_t* bundle_string);
  void SetErrorWithParam(nsIMsgSendReport* sendReport,
                         const char* bundle_string, const char* param);
};

#endif  // COMM_MAILNEWS_EXTENSIONS_SMIME_NSMSGCOMPOSESECURE_H_
