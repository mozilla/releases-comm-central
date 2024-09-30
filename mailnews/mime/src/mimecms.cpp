/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsICMSMessage.h"
#include "nsICMSMessageErrors.h"
#include "nsICMSDecoder.h"
#include "mimecms.h"
#include "mimemcms.h"
#include "mimemsig.h"
#include "nsMailHeaders.h"
#include "nspr.h"
#include "mimemsg.h"
#include "mimemoz2.h"
#include "nsIURI.h"
#include "nsIMsgSMIMESink.h"
#include "nsCOMPtr.h"
#include "nsIX509Cert.h"
#include "nsComponentManagerUtils.h"
#include "nsThreadUtils.h"
#include "nsProxyRelease.h"
#include "mozilla/mailnews/MimeHeaderParser.h"
#include "nsIMailChannel.h"

using namespace mozilla::mailnews;

// The name "mime encrypted" is misleading, because this code is used
// both for CMS messages that are encrypted, and also for messages that
// aren't encrypted, but only contain a signature.

#define MIME_SUPERCLASS mimeEncryptedClass
MimeDefClass(MimeEncryptedCMS, MimeEncryptedCMSClass, mimeEncryptedCMSClass,
             &MIME_SUPERCLASS);

static MimeClosure MimeCMS_init(MimeObject*,
                                int (*output_fn)(const char*, int32_t, int32_t,
                                                 void*),
                                MimeClosure);
static int MimeCMS_write(const char*, int32_t, MimeClosure);
static int MimeCMS_eof(MimeClosure, bool);
static char* MimeCMS_generate(MimeClosure);
static void MimeCMS_free(MimeClosure);

extern int SEC_ERROR_CERT_ADDR_MISMATCH;

static int MimeEncryptedCMSClassInitialize(MimeObjectClass* oclass) {
#ifdef DEBUG
  NS_ASSERTION(!oclass->class_initialized,
               "1.2 <mscott@netscape.com> 01 Nov 2001 17:59");
#endif

  MimeEncryptedClass* eclass = (MimeEncryptedClass*)oclass;
  eclass->crypto_init = MimeCMS_init;
  eclass->crypto_write = MimeCMS_write;
  eclass->crypto_eof = MimeCMS_eof;
  eclass->crypto_generate_html = MimeCMS_generate;
  eclass->crypto_free = MimeCMS_free;

  return 0;
}

typedef struct MimeCMSdata {
  int (*output_fn)(const char* buf, int32_t buf_size,
                   int32_t output_closure_type, void* output_closure);
  MimeClosure output_closure;
  nsCOMPtr<nsICMSDecoder> decoder_context;
  nsCOMPtr<nsICMSMessage> content_info;
  bool ci_is_encrypted;
  char* sender_addr;
  bool decoding_failed;
  bool skip_content;
  uint32_t decoded_bytes;
  char* decoded_buffer;
  size_t decoded_buffer_space;
  MimeObject* self;
  bool any_parent_is_encrypted_p;
  bool any_parent_is_signed_p;
  nsCOMPtr<nsIMsgSMIMESink> smimeSink;
  nsCString url;

  MimeCMSdata()
      : output_fn(nullptr),
        output_closure(MimeClosure::zero()),
        ci_is_encrypted(false),
        sender_addr(nullptr),
        decoding_failed(false),
        skip_content(false),
        decoded_bytes(0),
        decoded_buffer(nullptr),
        decoded_buffer_space(0),
        self(nullptr),
        any_parent_is_encrypted_p(false),
        any_parent_is_signed_p(false) {}

  ~MimeCMSdata() {
    if (sender_addr) PR_Free(sender_addr);
    if (decoded_buffer) PR_Free(decoded_buffer);

    // Do an orderly release of nsICMSDecoder and nsICMSMessage //
    if (decoder_context) {
      nsCOMPtr<nsICMSMessage> cinfo;
      decoder_context->Finish(getter_AddRefs(cinfo));
    }
  }
} MimeCMSdata;

/*   SEC_PKCS7DecoderContentCallback for SEC_PKCS7DecoderStart() */
static void MimeCMS_content_callback(void* arg, const char* buf,
                                     unsigned long length) {
  MimeCMSdata* data = (MimeCMSdata*)arg;
  if (!data) return;

  if (!data->output_fn) return;

  PR_SetError(0, 0);

  if (!data->decoded_buffer) {
    data->decoded_buffer_space = PR_MAX(4096, length * 2);
    data->decoded_buffer = (char*)PR_Malloc(data->decoded_buffer_space);
    memcpy(data->decoded_buffer, buf, length);
  } else {
    size_t needed = data->decoded_bytes + length;
    if (data->decoded_buffer_space < needed) {
      size_t new_space = needed * 2;
      char* new_buffer = (char*)PR_Realloc(data->decoded_buffer, new_space);
      if (!new_buffer) {
        PR_SetError(PR_OUT_OF_MEMORY_ERROR, 0);
        data->output_fn = 0;
        return;
      }
      data->decoded_buffer_space = new_space;
      data->decoded_buffer = new_buffer;
    }
    memcpy(data->decoded_buffer + data->decoded_bytes, buf, length);
  }

  data->decoded_bytes += length;
}

bool MimeEncryptedCMS_encrypted_p(MimeObject* obj) {
  bool encrypted;

  if (!obj) return false;
  if (mime_typep(obj, (MimeObjectClass*)&mimeEncryptedCMSClass)) {
    MimeEncrypted* enc = (MimeEncrypted*)obj;

    if (!enc->crypto_closure) return false;

    PR_ASSERT(enc->crypto_closure.mType == MimeClosure::isMimeCMSData);
    if (enc->crypto_closure.mType != MimeClosure::isMimeCMSData) {
      return false;
    }
    MimeCMSdata* data = (MimeCMSdata*)enc->crypto_closure.mClosure;
    if (!data->content_info) return false;
    data->content_info->GetContentIsEncrypted(&encrypted);
    return encrypted;
  }
  return false;
}

bool MimeEncOrMP_CMS_signed_p(MimeObject* obj) {
  bool is_signed;

  if (!obj) return false;
  if (mime_typep(obj, (MimeObjectClass*)&mimeMultipartSignedCMSClass)) {
    MimeMultipartSigned* sig = (MimeMultipartSigned*)obj;
    if (!MimeMultCMSdata_isIgnored(sig->crypto_closure)) {
      return true;
    }
  }
  if (mime_typep(obj, (MimeObjectClass*)&mimeEncryptedCMSClass)) {
    MimeEncrypted* enc = (MimeEncrypted*)obj;

    if (!enc->crypto_closure) return false;

    PR_ASSERT(enc->crypto_closure.mType == MimeClosure::isMimeCMSData);
    if (enc->crypto_closure.mType != MimeClosure::isMimeCMSData) {
      return false;
    }
    MimeCMSdata* data = (MimeCMSdata*)enc->crypto_closure.mClosure;
    if (!data->content_info) return false;
    data->content_info->GetContentIsSigned(&is_signed);
    return is_signed;
  }
  return false;
}

bool MimeAnyParentCMSEncrypted(MimeObject* obj) {
  MimeObject* o2 = obj;
  while (o2 && o2->parent) {
    if (MimeEncryptedCMS_encrypted_p(o2->parent)) {
      return true;
    }
    o2 = o2->parent;
  }
  return false;
}

bool MimeAnyParentCMSSigned(MimeObject* obj) {
  MimeObject* o2 = obj;
  while (o2 && o2->parent) {
    if (MimeEncOrMP_CMS_signed_p(o2->parent)) {
      return true;
    }
    o2 = o2->parent;
  }
  return false;
}

bool MimeCMSHeadersAndCertsMatch(nsICMSMessage* content_info,
                                 nsIX509Cert* signerCert, const char* from_addr,
                                 const char* from_name, const char* sender_addr,
                                 const char* sender_name,
                                 bool* signing_cert_without_email_address) {
  nsCString cert_addr;
  bool match = true;
  bool foundFrom = false;
  bool foundSender = false;

  /* Find the name and address in the cert.
   */
  if (content_info) {
    // Extract any address contained in the cert.
    // This will be used for testing, whether the cert contains no addresses at
    // all.
    content_info->GetSignerEmailAddress(getter_Copies(cert_addr));
  }

  if (signing_cert_without_email_address)
    *signing_cert_without_email_address = cert_addr.IsEmpty();

  /* Now compare them --
   consider it a match if the address in the cert matches the
   address in the From field (or as a fallback, the Sender field)
   */

  /* If there is no addr in the cert at all, it can not match and we fail. */
  if (cert_addr.IsEmpty()) {
    match = false;
  } else {
    if (signerCert) {
      if (from_addr && *from_addr) {
        NS_ConvertASCIItoUTF16 ucs2From(from_addr);
        if (NS_FAILED(signerCert->ContainsEmailAddress(ucs2From, &foundFrom))) {
          foundFrom = false;
        }
      } else if (sender_addr && *sender_addr) {
        NS_ConvertASCIItoUTF16 ucs2Sender(sender_addr);
        if (NS_FAILED(
                signerCert->ContainsEmailAddress(ucs2Sender, &foundSender))) {
          foundSender = false;
        }
      }
    }

    if (!foundSender && !foundFrom) {
      match = false;
    }
  }

  return match;
}

class nsSMimeVerificationListener : public nsISMimeVerificationListener {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSISMIMEVERIFICATIONLISTENER

  nsSMimeVerificationListener(const char* aFromAddr, const char* aFromName,
                              const char* aSenderAddr, const char* aSenderName,
                              const char* aMsgDate,
                              nsIMsgSMIMESink* aHeaderSink,
                              int32_t aMimeNestingLevel,
                              const nsCString& aMsgNeckoURL,
                              const nsCString& aOriginMimePartNumber);

 protected:
  virtual ~nsSMimeVerificationListener() {}

  /**
   * It is safe to declare this implementation as thread safe,
   * despite not using a lock to protect the members.
   * Because of the way the object will be used, we don't expect a race.
   * After construction, the object is passed to another thread,
   * but will no longer be accessed on the original thread.
   * The other thread is unable to access/modify self's data members.
   * When the other thread is finished, it will call into the "Notify"
   * callback. Self's members will be accessed on the other thread,
   * but this is fine, because there is no race with the original thread.
   * Race-protection for XPCOM reference counting is sufficient.
   */
  bool mSinkIsNull;
  nsMainThreadPtrHandle<nsIMsgSMIMESink> mHeaderSink;
  int32_t mMimeNestingLevel;
  nsCString mMsgNeckoURL;
  nsCString mOriginMimePartNumber;

  nsCString mFromAddr;
  nsCString mFromName;
  nsCString mSenderAddr;
  nsCString mSenderName;
  nsCString mMsgDate;
};

class SignedStatusRunnable : public mozilla::Runnable {
 public:
  SignedStatusRunnable(const nsMainThreadPtrHandle<nsIMsgSMIMESink>& aSink,
                       int32_t aNestingLevel, int32_t aSignatureStatus,
                       nsIX509Cert* aSignerCert, const nsCString& aMsgNeckoURL,
                       const nsCString& aOriginMimePartNumber);
  NS_DECL_NSIRUNNABLE
  nsresult mResult;

 protected:
  nsMainThreadPtrHandle<nsIMsgSMIMESink> m_sink;
  int32_t m_nestingLevel;
  int32_t m_signatureStatus;
  nsCOMPtr<nsIX509Cert> m_signerCert;
  nsCString m_msgNeckoURL;
  nsCString m_originMimePartNumber;
};

SignedStatusRunnable::SignedStatusRunnable(
    const nsMainThreadPtrHandle<nsIMsgSMIMESink>& aSink, int32_t aNestingLevel,
    int32_t aSignatureStatus, nsIX509Cert* aSignerCert,
    const nsCString& aMsgNeckoURL, const nsCString& aOriginMimePartNumber)
    : mozilla::Runnable("SignedStatusRunnable"),
      mResult(NS_ERROR_UNEXPECTED),
      m_sink(aSink),
      m_nestingLevel(aNestingLevel),
      m_signatureStatus(aSignatureStatus),
      m_signerCert(aSignerCert),
      m_msgNeckoURL(aMsgNeckoURL),
      m_originMimePartNumber(aOriginMimePartNumber) {}

NS_IMETHODIMP SignedStatusRunnable::Run() {
  mResult =
      m_sink->SignedStatus(m_nestingLevel, m_signatureStatus, m_signerCert,
                           m_msgNeckoURL, m_originMimePartNumber);
  return NS_OK;
}

nsresult ProxySignedStatus(const nsMainThreadPtrHandle<nsIMsgSMIMESink>& aSink,
                           int32_t aNestingLevel, int32_t aSignatureStatus,
                           nsIX509Cert* aSignerCert,
                           const nsCString& aMsgNeckoURL,
                           const nsCString& aOriginMimePartNumber) {
  RefPtr<SignedStatusRunnable> signedStatus = new SignedStatusRunnable(
      aSink, aNestingLevel, aSignatureStatus, aSignerCert, aMsgNeckoURL,
      aOriginMimePartNumber);
  nsresult rv = NS_DispatchAndSpinEventLoopUntilComplete(
      "ProxySignedStatus"_ns, mozilla::GetMainThreadSerialEventTarget(),
      do_AddRef(signedStatus));
  NS_ENSURE_SUCCESS(rv, rv);
  return signedStatus->mResult;
}

NS_IMPL_ISUPPORTS(nsSMimeVerificationListener, nsISMimeVerificationListener)

nsSMimeVerificationListener::nsSMimeVerificationListener(
    const char* aFromAddr, const char* aFromName, const char* aSenderAddr,
    const char* aSenderName, const char* aMsgDate, nsIMsgSMIMESink* aHeaderSink,
    int32_t aMimeNestingLevel, const nsCString& aMsgNeckoURL,
    const nsCString& aOriginMimePartNumber)
    : mMsgNeckoURL(aMsgNeckoURL), mOriginMimePartNumber(aOriginMimePartNumber) {
  mHeaderSink = new nsMainThreadPtrHolder<nsIMsgSMIMESink>(
      "nsSMimeVerificationListener::mHeaderSink", aHeaderSink);
  mSinkIsNull = !aHeaderSink;
  mMimeNestingLevel = aMimeNestingLevel;

  mFromAddr = aFromAddr;
  mFromName = aFromName;
  mSenderAddr = aSenderAddr;
  mSenderName = aSenderName;
  mMsgDate = aMsgDate;
}

NS_IMETHODIMP nsSMimeVerificationListener::Notify(
    nsICMSMessage* aVerifiedMessage, nsresult aVerificationResultCode) {
  // Only continue if we have a valid pointer to the UI
  NS_ENSURE_FALSE(mSinkIsNull, NS_OK);

  NS_ENSURE_TRUE(aVerifiedMessage, NS_ERROR_FAILURE);

  nsCOMPtr<nsIX509Cert> signerCert;
  aVerifiedMessage->GetSignerCert(getter_AddRefs(signerCert));

  int32_t signature_status = nsICMSMessageErrors::GENERAL_ERROR;

  if (NS_FAILED(aVerificationResultCode)) {
    if (NS_ERROR_MODULE_SECURITY ==
        NS_ERROR_GET_MODULE(aVerificationResultCode))
      signature_status = NS_ERROR_GET_CODE(aVerificationResultCode);
    else if (NS_ERROR_NOT_IMPLEMENTED == aVerificationResultCode)
      signature_status = nsICMSMessageErrors::VERIFY_ERROR_PROCESSING;
  } else {
    bool signing_cert_without_email_address;

    bool good_p = MimeCMSHeadersAndCertsMatch(
        aVerifiedMessage, signerCert, mFromAddr.get(), mFromName.get(),
        mSenderAddr.get(), mSenderName.get(),
        &signing_cert_without_email_address);
    if (!good_p) {
      if (signing_cert_without_email_address)
        signature_status = nsICMSMessageErrors::VERIFY_CERT_WITHOUT_ADDRESS;
      else
        signature_status = nsICMSMessageErrors::VERIFY_HEADER_MISMATCH;
    } else {
      PRTime sigTime;
      if (NS_FAILED(aVerifiedMessage->GetSigningTime(&sigTime))) {
        // Signing time attribute is optional in CMS messages.
        signature_status = nsICMSMessageErrors::SUCCESS;
      } else {
        // If it's present, check for a rough match with the message date.
        PRTime msgTime;
        if (PR_ParseTimeString(mMsgDate.get(), false, &msgTime) != PR_SUCCESS) {
          signature_status = nsICMSMessageErrors::VERIFY_TIME_MISMATCH;
        } else {
          PRTime delta;

          if (sigTime > msgTime) {
            delta = sigTime - msgTime;
          } else {
            delta = msgTime - sigTime;
          }

          if (delta / PR_USEC_PER_SEC > 60 * 60 * 1) {
            signature_status = nsICMSMessageErrors::VERIFY_TIME_MISMATCH;
          } else {
            signature_status = nsICMSMessageErrors::SUCCESS;
          }
        }
      }
    }
  }

  if (NS_IsMainThread()) {
    mHeaderSink->SignedStatus(mMimeNestingLevel, signature_status, signerCert,
                              mMsgNeckoURL, mOriginMimePartNumber);
  } else {
    ProxySignedStatus(mHeaderSink, mMimeNestingLevel, signature_status,
                      signerCert, mMsgNeckoURL, mOriginMimePartNumber);
  }

  return NS_OK;
}

int MIMEGetRelativeCryptoNestLevel(MimeObject* obj) {
  /*
    the part id of any mimeobj is mime_part_address(obj)
    our currently displayed crypto part is obj
    the part shown as the toplevel object in the current window is
        obj->options->part_to_load
        possibly stored in the toplevel object only ???
        but hopefully all nested mimeobject point to the same displayooptions

    we need to find out the nesting level of our currently displayed crypto
    object wrt the shown part in the toplevel window
  */

  // if we are showing the toplevel message, aTopMessageNestLevel == 0
  int aTopMessageNestLevel = 0;
  MimeObject* aTopShownObject = nullptr;
  if (obj && obj->options->part_to_load) {
    bool aAlreadyFoundTop = false;
    for (MimeObject* walker = obj; walker; walker = walker->parent) {
      if (aAlreadyFoundTop) {
        if (!mime_typep(walker, (MimeObjectClass*)&mimeEncryptedClass) &&
            !mime_typep(walker, (MimeObjectClass*)&mimeMultipartSignedClass)) {
          ++aTopMessageNestLevel;
        }
      }
      if (!aAlreadyFoundTop) {
        char* addr = mime_part_address(walker);
        if (!strcmp(addr, walker->options->part_to_load)) {
          aAlreadyFoundTop = true;
          aTopShownObject = walker;
        }
        PR_FREEIF(addr);
      }
      if (!aAlreadyFoundTop && !walker->parent) {
        // The mime part part_to_load is not a parent of the
        // the crypto mime part passed in to this function as parameter obj.
        // That means the crypto part belongs to another branch of the mime
        // tree.
        return -1;
      }
    }
  }

  bool CryptoObjectIsChildOfTopShownObject = false;
  if (!aTopShownObject) {
    // no sub part specified, top message is displayed, and
    // our crypto object is definitively a child of it
    CryptoObjectIsChildOfTopShownObject = true;
  }

  // if we are the child of the topmost message, aCryptoPartNestLevel == 1
  int aCryptoPartNestLevel = 0;
  if (obj) {
    for (MimeObject* walker = obj; walker; walker = walker->parent) {
      // Crypto mime objects are transparent wrt nesting.
      if (!mime_typep(walker, (MimeObjectClass*)&mimeEncryptedClass) &&
          !mime_typep(walker, (MimeObjectClass*)&mimeMultipartSignedClass)) {
        ++aCryptoPartNestLevel;
      }
      if (aTopShownObject && walker->parent == aTopShownObject) {
        CryptoObjectIsChildOfTopShownObject = true;
      }
    }
  }

  if (!CryptoObjectIsChildOfTopShownObject) {
    return -1;
  }

  return aCryptoPartNestLevel - aTopMessageNestLevel;
}

static MimeClosure MimeCMS_init(MimeObject* obj,
                                int (*output_fn)(const char* buf,
                                                 int32_t buf_size,
                                                 int32_t output_closure_type,
                                                 void* output_closure),
                                MimeClosure output_closure) {
  MimeCMSdata* data;
  nsresult rv;

  if (!(obj && obj->options && output_fn))
    return MimeClosure(MimeClosure::isUndefined, 0);

  data = new MimeCMSdata;
  if (!data) return MimeClosure(MimeClosure::isUndefined, 0);

  data->self = obj;
  data->output_fn = output_fn;
  data->output_closure = output_closure;
  PR_SetError(0, 0);

  data->any_parent_is_signed_p = MimeAnyParentCMSSigned(obj);

  if (data->any_parent_is_signed_p) {
    // Parent is signed.
    // We don't know yet if this child is signed or encrypted.
    // (We'll know after decoding has completed and EOF is called.)
    // We don't support "inner encrypt" with outer sign, because the
    // inner encrypted part could have been produced by an attacker who
    // stripped away a part containing the signature (S/MIME doesn't
    // have integrity protection).
    // A sign-then-sign encoding is confusing, too, because it could be
    // an attempt to influence which signature is shown.
    data->skip_content = true;
  }

  if (!data->skip_content) {
    data->decoder_context = do_CreateInstance(NS_CMSDECODER_CONTRACTID, &rv);
    if (NS_FAILED(rv)) {
      delete data;
      return MimeClosure(MimeClosure::isUndefined, 0);
    }

    rv = data->decoder_context->Start(MimeCMS_content_callback, data);
    if (NS_FAILED(rv)) {
      delete data;
      return MimeClosure(MimeClosure::isUndefined, 0);
    }
  }

  data->any_parent_is_encrypted_p = MimeAnyParentCMSEncrypted(obj);

  if (data->self->options->stream_closure) {
    PR_ASSERT(data->self->options->stream_closure.mType ==
                  MimeClosure::isMimeStreamData ||
              data->self->options->stream_closure.mType ==
                  MimeClosure::isMimeDraftData);
    if (data->self->options->stream_closure.mType ==
        MimeClosure::isMimeStreamData) {
      mime_stream_data* msd =
          (mime_stream_data*)(data->self->options->stream_closure.mClosure);
      nsIChannel* channel = msd->channel;  // note the lack of ref counting...
      if (channel) {
        nsCOMPtr<nsIURI> uri;
        channel->GetURI(getter_AddRefs(uri));
        if (uri) {
          rv = uri->GetSpec(data->url);

          // We only want to update the UI if the current mime transaction
          // is intended for display.
          // If the current transaction is intended for background processing,
          // we can learn that by looking at the additional header=filter
          // string contained in the URI.
          //
          // If we find something, we do not set smimeSink,
          // which will prevent us from giving UI feedback.
          //
          // If we do not find header=filter, we assume the result of the
          // processing will be shown in the UI.

          if (!strstr(data->url.get(), "?header=filter") &&
              !strstr(data->url.get(), "&header=filter") &&
              !strstr(data->url.get(), "?header=attach") &&
              !strstr(data->url.get(), "&header=attach")) {
            nsCOMPtr<nsIMailChannel> mailChannel = do_QueryInterface(channel);
            if (mailChannel) {
              mailChannel->GetSmimeSink(getter_AddRefs(data->smimeSink));
            }
          }
        }
      }  // if channel
    }  // if isMimeStreamData
  }  // if msd

  return MimeClosure(MimeClosure::isMimeCMSData, data);
}

static int MimeCMS_write(const char* buf, int32_t buf_size,
                         MimeClosure closure) {
  if (!closure) return -1;

  PR_ASSERT(closure.mType == MimeClosure::isMimeCMSData);
  if (closure.mType != MimeClosure::isMimeCMSData) {
    return -1;
  }
  MimeCMSdata* data = (MimeCMSdata*)closure.mClosure;
  nsresult rv;

  if (!data || !data->output_fn || !data->decoder_context) return -1;

  if (!data->decoding_failed && !data->skip_content) {
    PR_SetError(0, 0);
    rv = data->decoder_context->Update(buf, buf_size);
    data->decoding_failed = NS_FAILED(rv);
  }

  return 0;
}

void MimeCMSGetFromSender(MimeObject* obj, nsCString& from_addr,
                          nsCString& from_name, nsCString& sender_addr,
                          nsCString& sender_name, nsCString& msg_date) {
  MimeHeaders* msg_headers = 0;

  /* Find the headers of the MimeMessage which is the parent (or grandparent)
   of this object (remember, crypto objects nest.) */
  MimeObject* o2 = obj;
  msg_headers = o2->headers;
  while (o2->parent &&
         !mime_typep(o2->parent, (MimeObjectClass*)&mimeMessageClass)) {
    o2 = o2->parent;
    msg_headers = o2->headers;
  }

  if (!msg_headers) return;

  /* Find the names and addresses in the From and/or Sender fields.
   */
  nsCString s;

  /* Extract the name and address of the "From:" field. */
  s.Adopt(MimeHeaders_get(msg_headers, HEADER_FROM, false, false));
  if (!s.IsEmpty()) ExtractFirstAddress(EncodedHeader(s), from_name, from_addr);

  /* Extract the name and address of the "Sender:" field. */
  s.Adopt(MimeHeaders_get(msg_headers, HEADER_SENDER, false, false));
  if (!s.IsEmpty())
    ExtractFirstAddress(EncodedHeader(s), sender_name, sender_addr);

  msg_date.Adopt(MimeHeaders_get(msg_headers, HEADER_DATE, false, true));
}

void MimeCMSRequestAsyncSignatureVerification(
    nsICMSMessage* aCMSMsg, const char* aFromAddr, const char* aFromName,
    const char* aSenderAddr, const char* aSenderName, const char* aMsgDate,
    nsIMsgSMIMESink* aHeaderSink, int32_t aMimeNestingLevel,
    const nsCString& aMsgNeckoURL, const nsCString& aOriginMimePartNumber,
    const nsTArray<uint8_t>& aDigestData, int16_t aDigestType) {
  RefPtr<nsSMimeVerificationListener> listener =
      new nsSMimeVerificationListener(
          aFromAddr, aFromName, aSenderAddr, aSenderName, aMsgDate, aHeaderSink,
          aMimeNestingLevel, aMsgNeckoURL, aOriginMimePartNumber);

  long verifyFlags = 0;
  if (mozilla::Preferences::GetBool(
          "mail.smime.accept_insecure_sha1_message_signatures", false)) {
    verifyFlags |= nsICMSVerifyFlags::VERIFY_ALLOW_WEAK_SHA1;
  }

  if (aDigestData.IsEmpty())
    aCMSMsg->AsyncVerifySignature(verifyFlags, listener);
  else
    aCMSMsg->AsyncVerifyDetachedSignature(verifyFlags, listener, aDigestData,
                                          aDigestType);
}

static const char* bufferContains2Newlines(const char* buf, size_t len) {
  const char* pos = buf;
  const char* end = buf + len;
  while (pos < end) {
    if (*pos == '\n') {
      if (pos + 1 < end) {
        if (*(pos + 1) == '\n') {
          return pos + 2;
        }
      }
    } else if (*pos == '\r') {
      if (pos + 3 < end) {
        if (*(pos + 1) == '\n' && *(pos + 2) == '\r' && *(pos + 3) == '\n') {
          return pos + 4;
        }
      }
    }
    ++pos;
  }
  return nullptr;
}

static int MimeCMS_eof(MimeClosure crypto_closure, bool abort_p) {
  if (!crypto_closure) {
    return -1;
  }

  PR_ASSERT(crypto_closure.mType == MimeClosure::isMimeCMSData);
  if (crypto_closure.mType != MimeClosure::isMimeCMSData) {
    return -1;
  }
  MimeCMSdata* data = (MimeCMSdata*)crypto_closure.mClosure;
  nsresult rv;
  int32_t status = nsICMSMessageErrors::SUCCESS;

  if (!data->output_fn) {
    return -1;
  }

  // The decrypted data is expected to contain MIME data.
  // This means, it's expected there is a header section, followed by
  // two newlines (one empty line after the header), then followed
  // by the MIME message body.
  // If there is no header section, the initial section of the message,
  // until the first empty line, might be hidden.
  // To avoid that, we'll ensure there's always a header section.

  // Find double newline, with optional carriage return in between.

  if (!data->skip_content && !data->decoder_context) {
    // If we don't skip, we should have a context.
    return -1;
  }

  int aRelativeNestLevel = MIMEGetRelativeCryptoNestLevel(data->self);

  /* Hand an EOF to the crypto library.  It may call data->output_fn.
   (Today, the crypto library has no flushing to do, but maybe there
   will be someday.)

   We save away the value returned and will use it later to emit a
   blurb about whether the signature validation was cool.
   */

  PR_SetError(0, 0);
  if (!data->skip_content) {
    rv = data->decoder_context->Finish(getter_AddRefs(data->content_info));
    if (NS_FAILED(rv)) status = nsICMSMessageErrors::GENERAL_ERROR;

    data->decoder_context = nullptr;
  }

  if (data->decoded_buffer && data->decoded_bytes) {
    if (bufferContains2Newlines(data->decoded_buffer, data->decoded_bytes) ==
        nullptr) {
      const char* header = "Content-Type: text/plain; charset=utf-8\r\n\r\n";
      status =
          data->output_fn(header, strlen(header), data->output_closure.mType,
                          data->output_closure.mClosure);
    }
  }

  if (status == nsICMSMessageErrors::SUCCESS) {
    status = data->output_fn(data->decoded_buffer, data->decoded_bytes,
                             data->output_closure.mType,
                             data->output_closure.mClosure);
  }
  if (status < 0) {
    PR_SetError(status, 0);
    data->output_fn = 0;
    return -1;
  }

  nsCOMPtr<nsIX509Cert> certOfInterest;

  if (!data->smimeSink) return 0;

  if (aRelativeNestLevel < 0) return 0;

  // maxWantedNesting 1: only want outermost nesting level
  if (aRelativeNestLevel > 1) return 0;

  if (data->decoding_failed) status = nsICMSMessageErrors::GENERAL_ERROR;

  nsAutoCString partnum;
  partnum.Adopt(mime_part_address(data->self));

  if (data->skip_content) {
    // Skipping content means, we detected a forbidden combination
    // of CMS objects, so let's make sure we replace the parent status
    // with a bad status.
    if (data->any_parent_is_signed_p) {
      data->smimeSink->SignedStatus(aRelativeNestLevel,
                                    nsICMSMessageErrors::GENERAL_ERROR, nullptr,
                                    data->url, partnum);
    }
    if (data->any_parent_is_encrypted_p) {
      data->smimeSink->EncryptionStatus(aRelativeNestLevel,
                                        nsICMSMessageErrors::GENERAL_ERROR,
                                        nullptr, data->url, partnum);
    }
    return 0;
  }

  if (!data->content_info) {
    if (!data->decoded_bytes) {
      // We were unable to decode any data.
      status = nsICMSMessageErrors::GENERAL_ERROR;
    } else {
      // Some content got decoded, but we failed to decode
      // the final summary, probably we got truncated data.
      status = nsICMSMessageErrors::ENCRYPT_INCOMPLETE;
    }

    // Although a CMS message could be either encrypted or opaquely signed,
    // what we see is most likely encrypted, because if it were
    // signed only, we probably would have been able to decode it.

    data->ci_is_encrypted = true;
  } else {
    rv = data->content_info->GetContentIsEncrypted(&data->ci_is_encrypted);

    if (NS_SUCCEEDED(rv) && data->ci_is_encrypted) {
      data->content_info->GetEncryptionCert(getter_AddRefs(certOfInterest));
    } else {
      // Existing logic in mimei assumes, if !ci_is_encrypted, then it is
      // signed. Make sure it indeed is signed.

      bool testIsSigned;
      rv = data->content_info->GetContentIsSigned(&testIsSigned);

      if (NS_FAILED(rv) || !testIsSigned) {
        // Neither signed nor encrypted?
        // We are unable to understand what we got, do not try to indicate
        // S/Mime status.
        return 0;
      }

      nsCString from_addr;
      nsCString from_name;
      nsCString sender_addr;
      nsCString sender_name;
      nsCString msg_date;

      MimeCMSGetFromSender(data->self, from_addr, from_name, sender_addr,
                           sender_name, msg_date);

      MimeCMSRequestAsyncSignatureVerification(
          data->content_info, from_addr.get(), from_name.get(),
          sender_addr.get(), sender_name.get(), msg_date.get(), data->smimeSink,
          aRelativeNestLevel, data->url, partnum, {}, 0);
    }
  }

  if (data->ci_is_encrypted) {
    data->smimeSink->EncryptionStatus(aRelativeNestLevel, status,
                                      certOfInterest, data->url, partnum);
  }

  return 0;
}

static void MimeCMS_free(MimeClosure crypto_closure) {
  if (!crypto_closure) return;

  PR_ASSERT(crypto_closure.mType == MimeClosure::isMimeCMSData);
  if (crypto_closure.mType != MimeClosure::isMimeCMSData) {
    return;
  }
  MimeCMSdata* data = (MimeCMSdata*)crypto_closure.mClosure;

  if (data->decoded_buffer) {
    PR_Free(data->decoded_buffer);
    data->decoded_buffer = nullptr;
  }

  delete data;
}

static char* MimeCMS_generate(MimeClosure crypto_closure) { return nullptr; }
