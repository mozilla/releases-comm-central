/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsCMS.h"

#include "CertVerifier.h"
#include "CryptoTask.h"
#include "ScopedNSSTypes.h"
#include "cms.h"
#include "mozilla/Logging.h"
#include "mozilla/RefPtr.h"
#include "nsDependentSubstring.h"
#include "nsICryptoHash.h"
#include "nsISupports.h"
#include "nsIX509CertDB.h"
#include "nsNSSCertificate.h"
#include "nsNSSComponent.h"
#include "nsNSSHelper.h"
#include "nsServiceManagerUtils.h"
#include "mozpkix/Result.h"
#include "mozpkix/pkixtypes.h"
#include "sechash.h"
#include "smime.h"
#include "mozilla/StaticMutex.h"

using namespace mozilla;
using namespace mozilla::psm;
using namespace mozilla::pkix;

static mozilla::LazyLogModule gCMSLog("CMS");

NS_IMPL_ISUPPORTS(nsCMSMessage, nsICMSMessage)

nsCMSMessage::nsCMSMessage() { m_cmsMsg = nullptr; }
nsCMSMessage::nsCMSMessage(NSSCMSMessage* aCMSMsg) { m_cmsMsg = aCMSMsg; }

nsCMSMessage::~nsCMSMessage() { destructorSafeDestroyNSSReference(); }

nsresult nsCMSMessage::Init() {
  nsresult rv;
  nsCOMPtr<nsISupports> nssInitialized =
      do_GetService("@mozilla.org/psm;1", &rv);
  return rv;
}

void nsCMSMessage::destructorSafeDestroyNSSReference() {
  if (m_cmsMsg) {
    NSS_CMSMessage_Destroy(m_cmsMsg);
  }
}

NS_IMETHODIMP nsCMSMessage::VerifySignature() {
  return CommonVerifySignature({}, 0);
}

NSSCMSSignerInfo* nsCMSMessage::GetTopLevelSignerInfo() {
  if (!m_cmsMsg) return nullptr;

  if (!NSS_CMSMessage_IsSigned(m_cmsMsg)) return nullptr;

  NSSCMSContentInfo* cinfo = NSS_CMSMessage_ContentLevel(m_cmsMsg, 0);
  if (!cinfo) return nullptr;

  NSSCMSSignedData* sigd =
      (NSSCMSSignedData*)NSS_CMSContentInfo_GetContent(cinfo);
  if (!sigd) return nullptr;

  PR_ASSERT(NSS_CMSSignedData_SignerInfoCount(sigd) > 0);
  return NSS_CMSSignedData_GetSignerInfo(sigd, 0);
}

NS_IMETHODIMP nsCMSMessage::GetSignerEmailAddress(char** aEmail) {
  MOZ_LOG(gCMSLog, LogLevel::Debug, ("nsCMSMessage::GetSignerEmailAddress"));
  NS_ENSURE_ARG(aEmail);

  NSSCMSSignerInfo* si = GetTopLevelSignerInfo();
  if (!si) return NS_ERROR_FAILURE;

  *aEmail = NSS_CMSSignerInfo_GetSignerEmailAddress(si);
  return NS_OK;
}

NS_IMETHODIMP nsCMSMessage::GetSignerCommonName(char** aName) {
  MOZ_LOG(gCMSLog, LogLevel::Debug, ("nsCMSMessage::GetSignerCommonName"));
  NS_ENSURE_ARG(aName);

  NSSCMSSignerInfo* si = GetTopLevelSignerInfo();
  if (!si) return NS_ERROR_FAILURE;

  *aName = NSS_CMSSignerInfo_GetSignerCommonName(si);
  return NS_OK;
}

NS_IMETHODIMP nsCMSMessage::ContentIsEncrypted(bool* isEncrypted) {
  MOZ_LOG(gCMSLog, LogLevel::Debug, ("nsCMSMessage::ContentIsEncrypted"));
  NS_ENSURE_ARG(isEncrypted);

  if (!m_cmsMsg) return NS_ERROR_FAILURE;

  *isEncrypted = NSS_CMSMessage_IsEncrypted(m_cmsMsg);

  return NS_OK;
}

NS_IMETHODIMP nsCMSMessage::ContentIsSigned(bool* isSigned) {
  MOZ_LOG(gCMSLog, LogLevel::Debug, ("nsCMSMessage::ContentIsSigned"));
  NS_ENSURE_ARG(isSigned);

  if (!m_cmsMsg) return NS_ERROR_FAILURE;

  *isSigned = NSS_CMSMessage_IsSigned(m_cmsMsg);

  return NS_OK;
}

NS_IMETHODIMP nsCMSMessage::GetSignerCert(nsIX509Cert** scert) {
  NSSCMSSignerInfo* si = GetTopLevelSignerInfo();
  if (!si) return NS_ERROR_FAILURE;

  nsCOMPtr<nsIX509Cert> cert;
  if (si->cert) {
    MOZ_LOG(gCMSLog, LogLevel::Debug,
            ("nsCMSMessage::GetSignerCert got signer cert"));

    nsCOMPtr<nsIX509CertDB> certdb = do_GetService(NS_X509CERTDB_CONTRACTID);
    nsTArray<uint8_t> certBytes;
    certBytes.AppendElements(si->cert->derCert.data, si->cert->derCert.len);
    nsresult rv = certdb->ConstructX509(certBytes, getter_AddRefs(cert));
    NS_ENSURE_SUCCESS(rv, rv);
  } else {
    MOZ_LOG(gCMSLog, LogLevel::Debug,
            ("nsCMSMessage::GetSignerCert no signer cert, do we have a cert "
             "list? %s",
             (si->certList ? "yes" : "no")));

    *scert = nullptr;
  }

  cert.forget(scert);

  return NS_OK;
}

NS_IMETHODIMP nsCMSMessage::GetEncryptionCert(nsIX509Cert**) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsCMSMessage::VerifyDetachedSignature(const nsTArray<uint8_t>& aDigestData,
                                      int16_t aDigestType) {
  if (aDigestData.IsEmpty()) return NS_ERROR_FAILURE;

  return CommonVerifySignature(aDigestData, aDigestType);
}

nsresult nsCMSMessage::CommonVerifySignature(
    const nsTArray<uint8_t>& aDigestData, int16_t aDigestType) {
  MOZ_LOG(gCMSLog, LogLevel::Debug,
          ("nsCMSMessage::CommonVerifySignature, content level count %d",
           NSS_CMSMessage_ContentLevelCount(m_cmsMsg)));
  NSSCMSContentInfo* cinfo = nullptr;
  NSSCMSSignedData* sigd = nullptr;
  NSSCMSSignerInfo* si;
  int32_t nsigners;
  RefPtr<SharedCertVerifier> certVerifier;
  nsresult rv = NS_ERROR_FAILURE;

  if (!NSS_CMSMessage_IsSigned(m_cmsMsg)) {
    MOZ_LOG(gCMSLog, LogLevel::Debug,
            ("nsCMSMessage::CommonVerifySignature - not signed"));
    return NS_ERROR_CMS_VERIFY_NOT_SIGNED;
  }

  cinfo = NSS_CMSMessage_ContentLevel(m_cmsMsg, 0);
  if (cinfo) {
    switch (NSS_CMSContentInfo_GetContentTypeTag(cinfo)) {
      case SEC_OID_PKCS7_SIGNED_DATA:
        sigd = reinterpret_cast<NSSCMSSignedData*>(
            NSS_CMSContentInfo_GetContent(cinfo));
        break;

      case SEC_OID_PKCS7_ENVELOPED_DATA:
      case SEC_OID_PKCS7_ENCRYPTED_DATA:
      case SEC_OID_PKCS7_DIGESTED_DATA:
      default: {
        MOZ_LOG(gCMSLog, LogLevel::Debug,
                ("nsCMSMessage::CommonVerifySignature - unexpected "
                 "ContentTypeTag"));
        rv = NS_ERROR_CMS_VERIFY_NO_CONTENT_INFO;
        goto loser;
      }
    }
  }

  if (!sigd) {
    MOZ_LOG(gCMSLog, LogLevel::Debug,
            ("nsCMSMessage::CommonVerifySignature - no content info"));
    rv = NS_ERROR_CMS_VERIFY_NO_CONTENT_INFO;
    goto loser;
  }

  if (!aDigestData.IsEmpty()) {
    SECOidTag oidTag;
    SECItem digest;
    // NSS_CMSSignedData_SetDigestValue() takes a copy and won't mutate our
    // data, so we're OK to cast away the const here.
    digest.data = const_cast<uint8_t*>(aDigestData.Elements());
    digest.len = aDigestData.Length();

    if (NSS_CMSSignedData_HasDigests(sigd)) {
      SECAlgorithmID** existingAlgs = NSS_CMSSignedData_GetDigestAlgs(sigd);
      if (existingAlgs) {
        while (*existingAlgs) {
          SECAlgorithmID* alg = *existingAlgs;
          SECOidTag algOIDTag = SECOID_FindOIDTag(&alg->algorithm);
          NSS_CMSSignedData_SetDigestValue(sigd, algOIDTag, NULL);
          ++existingAlgs;
        }
      }
    }

    oidTag =
        HASH_GetHashOidTagByHashType(static_cast<HASH_HashType>(aDigestType));
    if (oidTag == SEC_OID_UNKNOWN) {
      rv = NS_ERROR_CMS_VERIFY_BAD_DIGEST;
      goto loser;
    }

    if (NSS_CMSSignedData_SetDigestValue(sigd, oidTag, &digest)) {
      MOZ_LOG(gCMSLog, LogLevel::Debug,
              ("nsCMSMessage::CommonVerifySignature - bad digest"));
      rv = NS_ERROR_CMS_VERIFY_BAD_DIGEST;
      goto loser;
    }
  }

  // Import certs. Note that import failure is not a signature verification
  // failure. //
  if (NSS_CMSSignedData_ImportCerts(sigd, CERT_GetDefaultCertDB(),
                                    certUsageEmailRecipient,
                                    true) != SECSuccess) {
    MOZ_LOG(gCMSLog, LogLevel::Debug,
            ("nsCMSMessage::CommonVerifySignature - can not import certs"));
  }

  nsigners = NSS_CMSSignedData_SignerInfoCount(sigd);
  PR_ASSERT(nsigners > 0);
  NS_ENSURE_TRUE(nsigners > 0, NS_ERROR_UNEXPECTED);
  si = NSS_CMSSignedData_GetSignerInfo(sigd, 0);

  // See bug 324474. We want to make sure the signing cert is
  // still valid at the current time.

  certVerifier = GetDefaultCertVerifier();
  NS_ENSURE_TRUE(certVerifier, NS_ERROR_UNEXPECTED);

  {
    UniqueCERTCertList builtChain;
    mozilla::pkix::Result result = certVerifier->VerifyCert(
        si->cert, certificateUsageEmailSigner, Now(), nullptr /*XXX pinarg*/,
        nullptr /*hostname*/, builtChain,
        // Only local checks can run on the main thread.
        CertVerifier::FLAG_LOCAL_ONLY);
    if (result != mozilla::pkix::Success) {
      MOZ_LOG(gCMSLog, LogLevel::Debug,
              ("nsCMSMessage::CommonVerifySignature - signing cert not trusted "
               "now"));
      rv = NS_ERROR_CMS_VERIFY_UNTRUSTED;
      goto loser;
    }
  }

  // We verify the first signer info,  only //
  // XXX: NSS_CMSSignedData_VerifySignerInfo calls CERT_VerifyCert, which
  // requires NSS's certificate verification configuration to be done in
  // order to work well (e.g. honoring OCSP preferences and proxy settings
  // for OCSP requests), but Gecko stopped doing that configuration. Something
  // similar to what was done for Gecko bug 1028643 needs to be done here too.
  if (NSS_CMSSignedData_VerifySignerInfo(sigd, 0, CERT_GetDefaultCertDB(),
                                         certUsageEmailSigner) != SECSuccess) {
    MOZ_LOG(
        gCMSLog, LogLevel::Debug,
        ("nsCMSMessage::CommonVerifySignature - unable to verify signature"));

    if (NSSCMSVS_SigningCertNotFound == si->verificationStatus) {
      MOZ_LOG(gCMSLog, LogLevel::Debug,
              ("nsCMSMessage::CommonVerifySignature - signing cert not found"));
      rv = NS_ERROR_CMS_VERIFY_NOCERT;
    } else if (NSSCMSVS_SigningCertNotTrusted == si->verificationStatus) {
      MOZ_LOG(gCMSLog, LogLevel::Debug,
              ("nsCMSMessage::CommonVerifySignature - signing cert not trusted "
               "at signing time"));
      rv = NS_ERROR_CMS_VERIFY_UNTRUSTED;
    } else if (NSSCMSVS_Unverified == si->verificationStatus) {
      MOZ_LOG(gCMSLog, LogLevel::Debug,
              ("nsCMSMessage::CommonVerifySignature - can not verify"));
      rv = NS_ERROR_CMS_VERIFY_ERROR_UNVERIFIED;
    } else if (NSSCMSVS_ProcessingError == si->verificationStatus) {
      MOZ_LOG(gCMSLog, LogLevel::Debug,
              ("nsCMSMessage::CommonVerifySignature - processing error"));
      rv = NS_ERROR_CMS_VERIFY_ERROR_PROCESSING;
    } else if (NSSCMSVS_BadSignature == si->verificationStatus) {
      MOZ_LOG(gCMSLog, LogLevel::Debug,
              ("nsCMSMessage::CommonVerifySignature - bad signature"));
      rv = NS_ERROR_CMS_VERIFY_BAD_SIGNATURE;
    } else if (NSSCMSVS_DigestMismatch == si->verificationStatus) {
      MOZ_LOG(gCMSLog, LogLevel::Debug,
              ("nsCMSMessage::CommonVerifySignature - digest mismatch"));
      rv = NS_ERROR_CMS_VERIFY_DIGEST_MISMATCH;
    } else if (NSSCMSVS_SignatureAlgorithmUnknown == si->verificationStatus) {
      MOZ_LOG(gCMSLog, LogLevel::Debug,
              ("nsCMSMessage::CommonVerifySignature - algo unknown"));
      rv = NS_ERROR_CMS_VERIFY_UNKNOWN_ALGO;
    } else if (NSSCMSVS_SignatureAlgorithmUnsupported ==
               si->verificationStatus) {
      MOZ_LOG(gCMSLog, LogLevel::Debug,
              ("nsCMSMessage::CommonVerifySignature - algo not supported"));
      rv = NS_ERROR_CMS_VERIFY_UNSUPPORTED_ALGO;
    } else if (NSSCMSVS_MalformedSignature == si->verificationStatus) {
      MOZ_LOG(gCMSLog, LogLevel::Debug,
              ("nsCMSMessage::CommonVerifySignature - malformed signature"));
      rv = NS_ERROR_CMS_VERIFY_MALFORMED_SIGNATURE;
    }

    goto loser;
  }

  // Save the profile. Note that save import failure is not a signature
  // verification failure. //
  if (NSS_SMIMESignerInfo_SaveSMIMEProfile(si) != SECSuccess) {
    MOZ_LOG(gCMSLog, LogLevel::Debug,
            ("nsCMSMessage::CommonVerifySignature - unable to save smime "
             "profile"));
  }

  rv = NS_OK;
loser:
  return rv;
}

NS_IMETHODIMP nsCMSMessage::AsyncVerifySignature(
    nsISMimeVerificationListener* aListener) {
  return CommonAsyncVerifySignature(aListener, {}, 0);
}

NS_IMETHODIMP nsCMSMessage::AsyncVerifyDetachedSignature(
    nsISMimeVerificationListener* aListener,
    const nsTArray<uint8_t>& aDigestData, int16_t aDigestType) {
  if (aDigestData.IsEmpty()) return NS_ERROR_FAILURE;

  return CommonAsyncVerifySignature(aListener, aDigestData, aDigestType);
}

class SMimeVerificationTask final : public CryptoTask {
 public:
  SMimeVerificationTask(nsICMSMessage* aMessage,
                        nsISMimeVerificationListener* aListener,
                        const nsTArray<uint8_t>& aDigestData,
                        int16_t aDigestType)
      : mMessage(aMessage),
        mListener(aListener),
        mDigestData(aDigestData.Clone()),
        mDigestType(aDigestType) {
    MOZ_ASSERT(NS_IsMainThread());
  }

 private:
  virtual nsresult CalculateResult() override {
    MOZ_ASSERT(!NS_IsMainThread());

    mozilla::StaticMutexAutoLock lock(sMutex);
    nsresult rv;
    if (mDigestData.IsEmpty()) {
      rv = mMessage->VerifySignature();
    } else {
      rv = mMessage->VerifyDetachedSignature(mDigestData, mDigestType);
    }

    return rv;
  }
  virtual void CallCallback(nsresult rv) override {
    MOZ_ASSERT(NS_IsMainThread());
    mListener->Notify(mMessage, rv);
  }

  nsCOMPtr<nsICMSMessage> mMessage;
  nsCOMPtr<nsISMimeVerificationListener> mListener;
  nsTArray<uint8_t> mDigestData;
  int16_t mDigestType;

  static mozilla::StaticMutex sMutex;
};

mozilla::StaticMutex SMimeVerificationTask::sMutex;

nsresult nsCMSMessage::CommonAsyncVerifySignature(
    nsISMimeVerificationListener* aListener,
    const nsTArray<uint8_t>& aDigestData, int16_t aDigestType) {
  RefPtr<CryptoTask> task =
      new SMimeVerificationTask(this, aListener, aDigestData, aDigestType);
  return task->Dispatch();
}

class nsZeroTerminatedCertArray {
 public:
  nsZeroTerminatedCertArray() : mCerts(nullptr), mPoolp(nullptr), mSize(0) {}

  ~nsZeroTerminatedCertArray() { destructorSafeDestroyNSSReference(); }

  void destructorSafeDestroyNSSReference() {
    if (mCerts) {
      for (uint32_t i = 0; i < mSize; i++) {
        if (mCerts[i]) {
          CERT_DestroyCertificate(mCerts[i]);
        }
      }
    }

    if (mPoolp) PORT_FreeArena(mPoolp, false);
  }

  bool allocate(uint32_t count) {
    // only allow allocation once
    if (mPoolp) return false;

    mSize = count;

    if (!mSize) return false;

    mPoolp = PORT_NewArena(1024);
    if (!mPoolp) return false;

    mCerts = (CERTCertificate**)PORT_ArenaZAlloc(
        mPoolp, (count + 1) * sizeof(CERTCertificate*));

    if (!mCerts) return false;

    // null array, including zero termination
    for (uint32_t i = 0; i < count + 1; i++) {
      mCerts[i] = nullptr;
    }

    return true;
  }

  void set(uint32_t i, CERTCertificate* c) {
    if (i >= mSize) return;

    if (mCerts[i]) {
      CERT_DestroyCertificate(mCerts[i]);
    }

    mCerts[i] = CERT_DupCertificate(c);
  }

  CERTCertificate* get(uint32_t i) {
    if (i >= mSize) return nullptr;

    return CERT_DupCertificate(mCerts[i]);
  }

  CERTCertificate** getRawArray() { return mCerts; }

 private:
  CERTCertificate** mCerts;
  PLArenaPool* mPoolp;
  uint32_t mSize;
};

NS_IMETHODIMP nsCMSMessage::CreateEncrypted(
    const nsTArray<RefPtr<nsIX509Cert>>& aRecipientCerts) {
  MOZ_LOG(gCMSLog, LogLevel::Debug, ("nsCMSMessage::CreateEncrypted"));
  NSSCMSContentInfo* cinfo;
  NSSCMSEnvelopedData* envd;
  NSSCMSRecipientInfo* recipientInfo;
  nsZeroTerminatedCertArray recipientCerts;
  SECOidTag bulkAlgTag;
  int keySize;
  uint32_t i;
  nsresult rv = NS_ERROR_FAILURE;

  // Check the recipient certificates //
  uint32_t recipientCertCount = aRecipientCerts.Length();
  PR_ASSERT(recipientCertCount > 0);

  if (!recipientCerts.allocate(recipientCertCount)) {
    goto loser;
  }

  for (i = 0; i < recipientCertCount; i++) {
    nsIX509Cert* x509cert = aRecipientCerts[i];

    if (!x509cert) return NS_ERROR_FAILURE;

    UniqueCERTCertificate c(x509cert->GetCert());
    recipientCerts.set(i, c.get());
  }

  // Find a bulk key algorithm //
  if (NSS_SMIMEUtil_FindBulkAlgForRecipients(
          recipientCerts.getRawArray(), &bulkAlgTag, &keySize) != SECSuccess) {
    MOZ_LOG(gCMSLog, LogLevel::Debug,
            ("nsCMSMessage::CreateEncrypted - can't find bulk alg for "
             "recipients"));
    rv = NS_ERROR_CMS_ENCRYPT_NO_BULK_ALG;
    goto loser;
  }

  m_cmsMsg = NSS_CMSMessage_Create(nullptr);
  if (!m_cmsMsg) {
    MOZ_LOG(gCMSLog, LogLevel::Debug,
            ("nsCMSMessage::CreateEncrypted - can't create new cms message"));
    rv = NS_ERROR_OUT_OF_MEMORY;
    goto loser;
  }

  if ((envd = NSS_CMSEnvelopedData_Create(m_cmsMsg, bulkAlgTag, keySize)) ==
      nullptr) {
    MOZ_LOG(gCMSLog, LogLevel::Debug,
            ("nsCMSMessage::CreateEncrypted - can't create enveloped data"));
    goto loser;
  }

  cinfo = NSS_CMSMessage_GetContentInfo(m_cmsMsg);
  if (NSS_CMSContentInfo_SetContent_EnvelopedData(m_cmsMsg, cinfo, envd) !=
      SECSuccess) {
    MOZ_LOG(gCMSLog, LogLevel::Debug,
            ("nsCMSMessage::CreateEncrypted - can't create content enveloped "
             "data"));
    goto loser;
  }

  cinfo = NSS_CMSEnvelopedData_GetContentInfo(envd);
  if (NSS_CMSContentInfo_SetContent_Data(m_cmsMsg, cinfo, nullptr, false) !=
      SECSuccess) {
    MOZ_LOG(gCMSLog, LogLevel::Debug,
            ("nsCMSMessage::CreateEncrypted - can't set content data"));
    goto loser;
  }

  // Create and attach recipient information //
  for (i = 0; i < recipientCertCount; i++) {
    UniqueCERTCertificate rc(recipientCerts.get(i));
    if ((recipientInfo = NSS_CMSRecipientInfo_Create(m_cmsMsg, rc.get())) ==
        nullptr) {
      MOZ_LOG(gCMSLog, LogLevel::Debug,
              ("nsCMSMessage::CreateEncrypted - can't create recipient info"));
      goto loser;
    }
    if (NSS_CMSEnvelopedData_AddRecipient(envd, recipientInfo) != SECSuccess) {
      MOZ_LOG(gCMSLog, LogLevel::Debug,
              ("nsCMSMessage::CreateEncrypted - can't add recipient info"));
      goto loser;
    }
  }

  return NS_OK;
loser:
  if (m_cmsMsg) {
    NSS_CMSMessage_Destroy(m_cmsMsg);
    m_cmsMsg = nullptr;
  }

  return rv;
}

bool nsCMSMessage::IsAllowedHash(const int16_t aCryptoHashInt) {
  switch (aCryptoHashInt) {
    case nsICryptoHash::SHA1:
    case nsICryptoHash::SHA256:
    case nsICryptoHash::SHA384:
    case nsICryptoHash::SHA512:
      return true;
    default:
      return false;
  }
}

NS_IMETHODIMP
nsCMSMessage::CreateSigned(nsIX509Cert* aSigningCert, nsIX509Cert* aEncryptCert,
                           const nsTArray<uint8_t>& aDigestData,
                           int16_t aDigestType) {
  NS_ENSURE_ARG(aSigningCert);
  MOZ_LOG(gCMSLog, LogLevel::Debug, ("nsCMSMessage::CreateSigned"));
  NSSCMSContentInfo* cinfo;
  NSSCMSSignedData* sigd;
  NSSCMSSignerInfo* signerinfo;
  UniqueCERTCertificate scert(aSigningCert->GetCert());
  UniqueCERTCertificate ecert;
  nsresult rv = NS_ERROR_FAILURE;

  if (!scert) {
    return NS_ERROR_FAILURE;
  }

  if (aEncryptCert) {
    ecert = UniqueCERTCertificate(aEncryptCert->GetCert());
  }

  if (!IsAllowedHash(aDigestType)) {
    return NS_ERROR_INVALID_ARG;
  }

  SECOidTag digestType =
      HASH_GetHashOidTagByHashType(static_cast<HASH_HashType>(aDigestType));
  if (digestType == SEC_OID_UNKNOWN) {
    return NS_ERROR_INVALID_ARG;
  }

  /*
   * create the message object
   */
  m_cmsMsg =
      NSS_CMSMessage_Create(nullptr); /* create a message on its own pool */
  if (!m_cmsMsg) {
    MOZ_LOG(gCMSLog, LogLevel::Debug,
            ("nsCMSMessage::CreateSigned - can't create new message"));
    rv = NS_ERROR_OUT_OF_MEMORY;
    goto loser;
  }

  /*
   * build chain of objects: message->signedData->data
   */
  if ((sigd = NSS_CMSSignedData_Create(m_cmsMsg)) == nullptr) {
    MOZ_LOG(gCMSLog, LogLevel::Debug,
            ("nsCMSMessage::CreateSigned - can't create signed data"));
    goto loser;
  }
  cinfo = NSS_CMSMessage_GetContentInfo(m_cmsMsg);
  if (NSS_CMSContentInfo_SetContent_SignedData(m_cmsMsg, cinfo, sigd) !=
      SECSuccess) {
    MOZ_LOG(gCMSLog, LogLevel::Debug,
            ("nsCMSMessage::CreateSigned - can't set content signed data"));
    goto loser;
  }

  cinfo = NSS_CMSSignedData_GetContentInfo(sigd);

  /* we're always passing data in and detaching optionally */
  if (NSS_CMSContentInfo_SetContent_Data(m_cmsMsg, cinfo, nullptr, true) !=
      SECSuccess) {
    MOZ_LOG(gCMSLog, LogLevel::Debug,
            ("nsCMSMessage::CreateSigned - can't set content data"));
    goto loser;
  }

  /*
   * create & attach signer information
   */
  signerinfo = NSS_CMSSignerInfo_Create(m_cmsMsg, scert.get(), digestType);
  if (!signerinfo) {
    MOZ_LOG(gCMSLog, LogLevel::Debug,
            ("nsCMSMessage::CreateSigned - can't create signer info"));
    goto loser;
  }

  /* we want the cert chain included for this one */
  if (NSS_CMSSignerInfo_IncludeCerts(signerinfo, NSSCMSCM_CertChain,
                                     certUsageEmailSigner) != SECSuccess) {
    MOZ_LOG(gCMSLog, LogLevel::Debug,
            ("nsCMSMessage::CreateSigned - can't include signer cert chain"));
    goto loser;
  }

  if (NSS_CMSSignerInfo_AddSigningTime(signerinfo, PR_Now()) != SECSuccess) {
    MOZ_LOG(gCMSLog, LogLevel::Debug,
            ("nsCMSMessage::CreateSigned - can't add signing time"));
    goto loser;
  }

  if (NSS_CMSSignerInfo_AddSMIMECaps(signerinfo) != SECSuccess) {
    MOZ_LOG(gCMSLog, LogLevel::Debug,
            ("nsCMSMessage::CreateSigned - can't add smime caps"));
    goto loser;
  }

  if (ecert) {
    if (NSS_CMSSignerInfo_AddSMIMEEncKeyPrefs(
            signerinfo, ecert.get(), CERT_GetDefaultCertDB()) != SECSuccess) {
      MOZ_LOG(gCMSLog, LogLevel::Debug,
              ("nsCMSMessage::CreateSigned - can't add smime enc key prefs"));
      goto loser;
    }

    if (NSS_CMSSignerInfo_AddMSSMIMEEncKeyPrefs(
            signerinfo, ecert.get(), CERT_GetDefaultCertDB()) != SECSuccess) {
      MOZ_LOG(
          gCMSLog, LogLevel::Debug,
          ("nsCMSMessage::CreateSigned - can't add MS smime enc key prefs"));
      goto loser;
    }

    // If signing and encryption cert are identical, don't add it twice.
    bool addEncryptionCert =
        (ecert && (!scert || !CERT_CompareCerts(ecert.get(), scert.get())));

    if (addEncryptionCert &&
        NSS_CMSSignedData_AddCertificate(sigd, ecert.get()) != SECSuccess) {
      MOZ_LOG(gCMSLog, LogLevel::Debug,
              ("nsCMSMessage::CreateSigned - can't add own encryption "
               "certificate"));
      goto loser;
    }
  }

  if (NSS_CMSSignedData_AddSignerInfo(sigd, signerinfo) != SECSuccess) {
    MOZ_LOG(gCMSLog, LogLevel::Debug,
            ("nsCMSMessage::CreateSigned - can't add signer info"));
    goto loser;
  }

  // Finally, add the pre-computed digest if passed in
  if (!aDigestData.IsEmpty()) {
    SECItem digest;

    // NSS_CMSSignedData_SetDigestValue() takes a copy and won't mutate our
    // data, so we're OK to cast away the const here.
    digest.data = const_cast<uint8_t*>(aDigestData.Elements());
    digest.len = aDigestData.Length();
    if (NSS_CMSSignedData_SetDigestValue(sigd, digestType, &digest) !=
        SECSuccess) {
      MOZ_LOG(gCMSLog, LogLevel::Debug,
              ("nsCMSMessage::CreateSigned - can't set digest value"));
      goto loser;
    }
  }

  return NS_OK;
loser:
  if (m_cmsMsg) {
    NSS_CMSMessage_Destroy(m_cmsMsg);
    m_cmsMsg = nullptr;
  }
  return rv;
}

NS_IMPL_ISUPPORTS(nsCMSDecoder, nsICMSDecoder)

nsCMSDecoder::nsCMSDecoder() : m_dcx(nullptr) {}

nsCMSDecoder::~nsCMSDecoder() { destructorSafeDestroyNSSReference(); }

nsresult nsCMSDecoder::Init() {
  nsresult rv;
  nsCOMPtr<nsISupports> nssInitialized =
      do_GetService("@mozilla.org/psm;1", &rv);
  return rv;
}

void nsCMSDecoder::destructorSafeDestroyNSSReference() {
  if (m_dcx) {
    NSS_CMSDecoder_Cancel(m_dcx);
    m_dcx = nullptr;
  }
}

/* void start (in NSSCMSContentCallback cb, in voidPtr arg); */
NS_IMETHODIMP nsCMSDecoder::Start(NSSCMSContentCallback cb, void* arg) {
  MOZ_LOG(gCMSLog, LogLevel::Debug, ("nsCMSDecoder::Start"));
  m_ctx = new PipUIContext();

  m_dcx = NSS_CMSDecoder_Start(0, cb, arg, 0, m_ctx, 0, 0);
  if (!m_dcx) {
    MOZ_LOG(gCMSLog, LogLevel::Debug,
            ("nsCMSDecoder::Start - can't start decoder"));
    return NS_ERROR_FAILURE;
  }
  return NS_OK;
}

/* void update (in string bug, in long len); */
NS_IMETHODIMP nsCMSDecoder::Update(const char* buf, int32_t len) {
  NSS_CMSDecoder_Update(m_dcx, (char*)buf, len);
  return NS_OK;
}

/* void finish (); */
NS_IMETHODIMP nsCMSDecoder::Finish(nsICMSMessage** aCMSMsg) {
  MOZ_LOG(gCMSLog, LogLevel::Debug, ("nsCMSDecoder::Finish"));
  NSSCMSMessage* cmsMsg;
  cmsMsg = NSS_CMSDecoder_Finish(m_dcx);
  m_dcx = nullptr;
  if (cmsMsg) {
    nsCMSMessage* obj = new nsCMSMessage(cmsMsg);
    // The NSS object cmsMsg still carries a reference to the context
    // we gave it on construction.
    // Make sure the context will live long enough.
    obj->referenceContext(m_ctx);
    NS_ADDREF(*aCMSMsg = obj);
  }
  return NS_OK;
}

NS_IMPL_ISUPPORTS(nsCMSEncoder, nsICMSEncoder)

nsCMSEncoder::nsCMSEncoder() : m_ecx(nullptr) {}

nsCMSEncoder::~nsCMSEncoder() { destructorSafeDestroyNSSReference(); }

nsresult nsCMSEncoder::Init() {
  nsresult rv;
  nsCOMPtr<nsISupports> nssInitialized =
      do_GetService("@mozilla.org/psm;1", &rv);
  return rv;
}

void nsCMSEncoder::destructorSafeDestroyNSSReference() {
  if (m_ecx) NSS_CMSEncoder_Cancel(m_ecx);
}

/* void start (); */
NS_IMETHODIMP nsCMSEncoder::Start(nsICMSMessage* aMsg, NSSCMSContentCallback cb,
                                  void* arg) {
  MOZ_LOG(gCMSLog, LogLevel::Debug, ("nsCMSEncoder::Start"));
  nsCMSMessage* cmsMsg = static_cast<nsCMSMessage*>(aMsg);
  m_ctx = new PipUIContext();

  m_ecx = NSS_CMSEncoder_Start(cmsMsg->getCMS(), cb, arg, 0, 0, 0, m_ctx, 0, 0,
                               0, 0);
  if (!m_ecx) {
    MOZ_LOG(gCMSLog, LogLevel::Debug,
            ("nsCMSEncoder::Start - can't start encoder"));
    return NS_ERROR_FAILURE;
  }
  return NS_OK;
}

/* void update (in string aBuf, in long aLen); */
NS_IMETHODIMP nsCMSEncoder::Update(const char* aBuf, int32_t aLen) {
  MOZ_LOG(gCMSLog, LogLevel::Debug, ("nsCMSEncoder::Update"));
  if (!m_ecx || NSS_CMSEncoder_Update(m_ecx, aBuf, aLen) != SECSuccess) {
    MOZ_LOG(gCMSLog, LogLevel::Debug,
            ("nsCMSEncoder::Update - can't update encoder"));
    return NS_ERROR_FAILURE;
  }
  return NS_OK;
}

/* void finish (); */
NS_IMETHODIMP nsCMSEncoder::Finish() {
  nsresult rv = NS_OK;
  MOZ_LOG(gCMSLog, LogLevel::Debug, ("nsCMSEncoder::Finish"));
  if (!m_ecx || NSS_CMSEncoder_Finish(m_ecx) != SECSuccess) {
    MOZ_LOG(gCMSLog, LogLevel::Debug,
            ("nsCMSEncoder::Finish - can't finish encoder"));
    rv = NS_ERROR_FAILURE;
  }
  m_ecx = nullptr;
  return rv;
}

/* void encode (in nsICMSMessage aMsg); */
NS_IMETHODIMP nsCMSEncoder::Encode(nsICMSMessage* aMsg) {
  MOZ_LOG(gCMSLog, LogLevel::Debug, ("nsCMSEncoder::Encode"));
  return NS_ERROR_NOT_IMPLEMENTED;
}
