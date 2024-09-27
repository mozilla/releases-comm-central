/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsPgpMimeProxy.h"
#include "mimecth.h"
#include "nsMailHeaders.h"
#include "nspr.h"
#include "plstr.h"
#include "nsCOMPtr.h"
#include "nsString.h"
#include "mozilla/Components.h"
#include "nsIRequest.h"
#include "nsIStringBundle.h"
#include "nsIPrefService.h"
#include "nsIPrefBranch.h"
#include "nsIURI.h"
#include "nsMsgUtils.h"
#include "nsNetUtil.h"

#include "mimemoz2.h"
#include "nspr.h"
#include "plstr.h"
#include "nsIPgpMimeProxy.h"
#include "nsComponentManagerUtils.h"

/**
 * Overall description
 * ===================
 *
 * There are three components involved here: MIME, a proxy object
 * (nsPgpMimeProxy) and Enigmail (or any other add-on that registered a
 * decryption object with
 * "@mozilla.org/mime/pgp-mime-js-decrypt;1").
 *
 * MIME creates and initialises the proxy object in nsPgpMimeProxy::Init(). This
 * creates a decryption object, for example EnigmailMimeDecrypt. When MIME wants
 * to decode something, it calls the Write() method of the proxy, which in turn
 * calls OnDataAvailable() on the decryptor. The decryptor optains the encrypted
 * data form the proxy via the proxy's Read() method. The decryptor decrypts the
 * data and passes the result back to the proxy, using the OutputDecryptedData()
 * method or by passing a stream to the proxy's OnDataAvailable() method, in
 * which the proxy will read from that stream. The proxy knows how to interface
 * with MIME and passes the data on using some function pointers it got given
 * via nsPgpMimeProxy::SetMimeCallback().
 */

#define MIME_SUPERCLASS mimeEncryptedClass
MimeDefClass(MimeEncryptedPgp, MimeEncryptedPgpClass, mimeEncryptedPgpClass,
             &MIME_SUPERCLASS);

#define kCharMax 1024

extern "C" MimeObjectClass* MIME_PgpMimeCreateContentTypeHandlerClass(
    const char* content_type, contentTypeHandlerInitStruct* initStruct) {
  MimeObjectClass* objClass = (MimeObjectClass*)&mimeEncryptedPgpClass;

  initStruct->force_inline_display = false;

  return objClass;
}

static void* MimePgpe_init(MimeObject*,
                           int (*output_fn)(const char*, int32_t, void*),
                           void*);
static int MimePgpe_write(const char*, int32_t, void*);
static int MimePgpe_eof(void*, bool);
static char* MimePgpe_generate(void*);
static void MimePgpe_free(void*);

/* Returns a string describing the location of the part (like "2.5.3").
   This is not a full URL, just a part-number.
 */
static nsCString determineMimePart(MimeObject* obj);

#define PGPMIME_PROPERTIES_URL "chrome://messenger/locale/pgpmime.properties"
#define PGPMIME_STR_NOT_SUPPORTED_ID "pgpNotAvailable"

static void PgpMimeGetNeedsAddonString(nsCString& aResult) {
  aResult.AssignLiteral("???");

  nsCOMPtr<nsIStringBundleService> stringBundleService =
      mozilla::components::StringBundle::Service();

  nsCOMPtr<nsIStringBundle> stringBundle;
  nsresult rv = stringBundleService->CreateBundle(PGPMIME_PROPERTIES_URL,
                                                  getter_AddRefs(stringBundle));
  if (NS_FAILED(rv)) return;

  nsCOMPtr<nsIPrefBranch> prefs(do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
  if (NS_FAILED(rv)) return;

  nsString result;
  rv = stringBundle->GetStringFromName(PGPMIME_STR_NOT_SUPPORTED_ID, result);
  if (NS_FAILED(rv)) return;
  aResult = NS_ConvertUTF16toUTF8(result);
}

static int MimeEncryptedPgpClassInitialize(MimeObjectClass* oclass) {
  NS_ASSERTION(!oclass->class_initialized, "oclass is not initialized");

  MimeEncryptedClass* eclass = (MimeEncryptedClass*)oclass;

  eclass->crypto_init = MimePgpe_init;
  eclass->crypto_write = MimePgpe_write;
  eclass->crypto_eof = MimePgpe_eof;
  eclass->crypto_generate_html = MimePgpe_generate;
  eclass->crypto_free = MimePgpe_free;

  return 0;
}

class MimePgpeData : public nsISupports {
 public:
  NS_DECL_ISUPPORTS

  int (*output_fn)(const char* buf, int32_t buf_size, void* output_closure);
  void* output_closure;
  MimeObject* self;

  nsCOMPtr<nsIPgpMimeProxy> mimeDecrypt;

  MimePgpeData() : output_fn(nullptr), output_closure(nullptr), self(nullptr) {}

 private:
  virtual ~MimePgpeData() {}
};

NS_IMPL_ISUPPORTS0(MimePgpeData)

static void* MimePgpe_init(MimeObject* obj,
                           int (*output_fn)(const char* buf, int32_t buf_size,
                                            void* output_closure),
                           void* output_closure) {
  if (!(obj && obj->options && output_fn)) return nullptr;

  MimePgpeData* data = new MimePgpeData();
  NS_ENSURE_TRUE(data, nullptr);

  data->self = obj;
  data->output_fn = output_fn;
  data->output_closure = output_closure;
  data->mimeDecrypt = nullptr;

  // Create proxy object.
  nsresult rv;
  data->mimeDecrypt = do_CreateInstance(NS_PGPMIMEPROXY_CONTRACTID, &rv);
  if (NS_FAILED(rv)) return data;

  char* ct = MimeHeaders_get(obj->headers, HEADER_CONTENT_TYPE, false, false);

  rv = (ct ? data->mimeDecrypt->SetContentType(nsDependentCString(ct))
           : data->mimeDecrypt->SetContentType(EmptyCString()));

  PR_Free(ct);

  if (NS_FAILED(rv)) return nullptr;

  nsCString mimePart = determineMimePart(obj);

  rv = data->mimeDecrypt->SetMimePart(mimePart);
  if (NS_FAILED(rv)) return nullptr;

  if (mimePart.EqualsLiteral("1.1") && obj->parent &&
      obj->parent->content_type &&
      !strcmp(obj->parent->content_type, "multipart/signed") &&
      ((MimeContainer*)obj->parent)->nchildren == 1) {
    // Don't show status for the outer signature, it could be misleading,
    // the signature could have been created by someone not knowing
    // the contents of the inner encryption layer.
    // Another reason is, we usually skip decrypting nested encrypted
    // parts. However, we make an exception: If the outermost layer
    // is a signature, and the signature wraps only a single encrypted
    // message (no sibling MIME parts next to the encrypted part),
    // then we allow decryption. (bug 1594253)
    data->mimeDecrypt->SetAllowNestedDecrypt(true);
  }

  mime_stream_data* msd =
      (mime_stream_data*)(data->self->options->stream_closure);
  nsIChannel* channel = msd->channel;
  nsCOMPtr<nsIURI> uri;
  nsCOMPtr<nsIMailChannel> mailChannel;
  if (channel) {
    channel->GetURI(getter_AddRefs(uri));
    mailChannel = do_QueryInterface(channel);
  }

  if (!uri && obj && obj->options && obj->options->url) {
    // Allow the PGP mime decrypt code to know what message we're
    // working with, necessary for storing into the message DB
    // (e.g. decrypted subject). Bug 1666005.
    NS_NewURI(getter_AddRefs(uri), obj->options->url);
  }

  // Initialise proxy object with MIME's output function, object and URI.
  if (NS_FAILED(data->mimeDecrypt->SetMimeCallback(output_fn, output_closure,
                                                   uri, mailChannel)))
    return nullptr;

  return data;
}

static int MimePgpe_write(const char* buf, int32_t buf_size,
                          void* output_closure) {
  MimePgpeData* data = (MimePgpeData*)output_closure;

  if (!data || !data->output_fn) return -1;

  if (!data->mimeDecrypt) return 0;

  return (NS_SUCCEEDED(data->mimeDecrypt->Write(buf, buf_size)) ? 0 : -1);
}

static int MimePgpe_eof(void* output_closure, bool abort_p) {
  MimePgpeData* data = (MimePgpeData*)output_closure;

  if (!data || !data->output_fn) return -1;

  if (NS_FAILED(data->mimeDecrypt->Finish())) return -1;

  data->mimeDecrypt->RemoveMimeCallback();
  data->mimeDecrypt = nullptr;
  return 0;
}

static char* MimePgpe_generate(void* output_closure) {
  const char htmlMsg[] = "<html><body><b>GEN MSG<b></body></html>";
  char* msg = (char*)PR_MALLOC(strlen(htmlMsg) + 1);
  if (msg) PL_strcpy(msg, htmlMsg);

  return msg;
}

static void MimePgpe_free(void* output_closure) {
  MimePgpeData* data = (MimePgpeData*)output_closure;
  if (data->mimeDecrypt) {
    data->mimeDecrypt->RemoveMimeCallback();
    data->mimeDecrypt = nullptr;
  }
}

/* Returns a string describing the location of the part (like "2.5.3").
   This is not a full URL, just a part-number.
 */
static nsCString determineMimePart(MimeObject* obj) {
  char mimePartNum[20];
  MimeObject* kid;
  MimeContainer* cont;
  int32_t i;

  nsCString mimePart;

  while (obj->parent) {
    cont = (MimeContainer*)obj->parent;
    for (i = 0; i < cont->nchildren; i++) {
      kid = cont->children[i];
      if (kid == obj) {
        sprintf(mimePartNum, ".%d", i + 1);
        mimePart.Insert(mimePartNum, 0);
      }
    }
    obj = obj->parent;
  }

  // remove leading "."
  if (mimePart.Length() > 0) mimePart.Cut(0, 1);

  return mimePart;
}

////////////////////////////////////////////////////////////////////////////
NS_IMPL_ISUPPORTS(nsPgpMimeProxy, nsIPgpMimeProxy, nsIRequestObserver,
                  nsIStreamListener, nsIRequest, nsIInputStream)

// nsPgpMimeProxy implementation
nsPgpMimeProxy::nsPgpMimeProxy()
    : mInitialized(false),
#ifdef DEBUG
      mOutputWasRemoved(false),
#endif
      mOutputFun(nullptr),
      mOutputClosure(nullptr),
      mLoadFlags(LOAD_NORMAL),
      mCancelStatus(NS_OK),
      mAllowNestedDecrypt(false) {
}

nsPgpMimeProxy::~nsPgpMimeProxy() { Finalize(); }

nsresult nsPgpMimeProxy::Finalize() { return NS_OK; }

NS_IMETHODIMP
nsPgpMimeProxy::SetMimeCallback(MimeDecodeCallbackFun outputFun,
                                void* outputClosure, nsIURI* myUri,
                                nsIMailChannel* mailChannel) {
  if (!outputFun || !outputClosure) return NS_ERROR_NULL_POINTER;

  mOutputFun = outputFun;
  mOutputClosure = outputClosure;
  mInitialized = true;
  mMessageURI = myUri;
  mMailChannel = mailChannel;

  mStreamOffset = 0;
  mByteBuf.Truncate();

  if (mDecryptor) return mDecryptor->OnStartRequest((nsIRequest*)this);

  return NS_OK;
}

NS_IMETHODIMP
nsPgpMimeProxy::RemoveMimeCallback() {
  mOutputFun = nullptr;
  mOutputClosure = nullptr;
#ifdef DEBUG
  mOutputWasRemoved = true;
#endif
  return NS_OK;
}

NS_IMETHODIMP
nsPgpMimeProxy::Init() {
  mByteBuf.Truncate();

  // Create add-on supplied decryption object.
  nsresult rv;
  mDecryptor = do_CreateInstance(PGPMIME_JS_DECRYPTOR_CONTRACTID, &rv);
  if (NS_FAILED(rv)) mDecryptor = nullptr;

  return NS_OK;
}

NS_IMETHODIMP
nsPgpMimeProxy::Write(const char* buf, uint32_t buf_size) {
  NS_ENSURE_TRUE(mInitialized, NS_ERROR_NOT_INITIALIZED);

  mByteBuf.Assign(buf, buf_size);
  mStreamOffset = 0;

  // Pass data to the decryption object for decryption.
  // The result is returned via OutputDecryptedData().
  if (mDecryptor)
    return mDecryptor->OnDataAvailable((nsIRequest*)this, (nsIInputStream*)this,
                                       0, buf_size);

  return NS_OK;
}

NS_IMETHODIMP
nsPgpMimeProxy::Finish() {
  NS_ENSURE_TRUE(mInitialized, NS_ERROR_NOT_INITIALIZED);

  if (mDecryptor) {
    return mDecryptor->OnStopRequest((nsIRequest*)this, NS_OK);
  } else {
    if (!mOutputFun) return NS_ERROR_FAILURE;

    nsCString temp;
    temp.AppendLiteral(
        "Content-Type: text/html; Charset=utf-8\r\n\r\n<html><body>");
    temp.AppendLiteral(
        "<BR><text=\"#000000\" bgcolor=\"#FFFFFF\" link=\"#FF0000\" "
        "vlink=\"#800080\" alink=\"#0000FF\">");
    temp.AppendLiteral("<center><table BORDER=1 ><tr><td><CENTER>");

    nsCString tString;
    PgpMimeGetNeedsAddonString(tString);
    temp.Append(tString);
    temp.AppendLiteral(
        "</CENTER></td></tr></table></center><BR></body></html>\r\n");

    PR_SetError(0, 0);
    int status = mOutputFun(temp.get(), temp.Length(), mOutputClosure);
    if (status < 0) {
      PR_SetError(status, 0);
      mOutputFun = nullptr;
      return NS_ERROR_FAILURE;
    }
  }

  return NS_OK;
}

NS_IMETHODIMP
nsPgpMimeProxy::GetDecryptor(nsIStreamListener** aDecryptor) {
  NS_IF_ADDREF(*aDecryptor = mDecryptor);
  return NS_OK;
}

NS_IMETHODIMP
nsPgpMimeProxy::SetDecryptor(nsIStreamListener* aDecryptor) {
  mDecryptor = aDecryptor;

  return NS_OK;
}

NS_IMETHODIMP
nsPgpMimeProxy::GetContentType(nsACString& aContentType) {
  aContentType = mContentType;
  return NS_OK;
}

NS_IMETHODIMP
nsPgpMimeProxy::SetContentType(const nsACString& aContentType) {
  mContentType = aContentType;

  return NS_OK;
}

NS_IMETHODIMP
nsPgpMimeProxy::GetMessageURI(nsIURI** aMessageURI) {
  NS_IF_ADDREF(*aMessageURI = mMessageURI);
  return NS_OK;
}

NS_IMETHODIMP
nsPgpMimeProxy::GetMimePart(nsACString& aMimePart) {
  aMimePart = mMimePart;
  return NS_OK;
}

NS_IMETHODIMP
nsPgpMimeProxy::SetMimePart(const nsACString& aMimePart) {
  mMimePart = aMimePart;
  return NS_OK;
}

NS_IMETHODIMP
nsPgpMimeProxy::SetAllowNestedDecrypt(bool aAllowNestedDecrypt) {
  mAllowNestedDecrypt = aAllowNestedDecrypt;
  return NS_OK;
}

NS_IMETHODIMP
nsPgpMimeProxy::GetAllowNestedDecrypt(bool* aAllowNestedDecrypt) {
  *aAllowNestedDecrypt = mAllowNestedDecrypt;
  return NS_OK;
}

/**
 * This method is called by the add-on-supplied decryption object.
 * It passes the decrypted data back to the proxy which calls the
 * output function is was initialised with.
 */
NS_IMETHODIMP
nsPgpMimeProxy::OutputDecryptedData(const char* buf, uint32_t buf_size) {
  NS_ENSURE_TRUE(mInitialized, NS_ERROR_NOT_INITIALIZED);

  NS_ENSURE_ARG(buf);

#ifdef DEBUG
  // If this assertion is hit, there might be a bug related to object
  // lifetime, e.g. a JS MIME handler might live longer than the
  // corresponding MIME data, e.g. bug 1665475.
  NS_ASSERTION(!mOutputWasRemoved, "MIME data already destroyed");
#endif

  if (!mOutputFun) return NS_ERROR_FAILURE;

  int status = mOutputFun(buf, buf_size, mOutputClosure);
  if (status < 0) {
    PR_SetError(status, 0);
    mOutputFun = nullptr;
    return NS_ERROR_FAILURE;
  }

  return NS_OK;
}

NS_IMETHODIMP
nsPgpMimeProxy::GetMailChannel(nsIMailChannel** aMailChannel) {
  NS_IF_ADDREF(*aMailChannel = mMailChannel);
  return NS_OK;
}

///////////////////////////////////////////////////////////////////////////////
// nsIRequest methods
///////////////////////////////////////////////////////////////////////////////

NS_IMETHODIMP
nsPgpMimeProxy::GetName(nsACString& result) {
  result = "pgpmimeproxy";
  return NS_OK;
}

NS_IMETHODIMP
nsPgpMimeProxy::IsPending(bool* result) {
  NS_ENSURE_TRUE(mInitialized, NS_ERROR_NOT_INITIALIZED);

  *result = NS_SUCCEEDED(mCancelStatus);
  return NS_OK;
}

NS_IMETHODIMP
nsPgpMimeProxy::GetStatus(nsresult* status) {
  NS_ENSURE_TRUE(mInitialized, NS_ERROR_NOT_INITIALIZED);

  *status = mCancelStatus;
  return NS_OK;
}

NS_IMETHODIMP nsPgpMimeProxy::SetCanceledReason(const nsACString& aReason) {
  return SetCanceledReasonImpl(aReason);
}

NS_IMETHODIMP nsPgpMimeProxy::GetCanceledReason(nsACString& aReason) {
  return GetCanceledReasonImpl(aReason);
}

NS_IMETHODIMP nsPgpMimeProxy::CancelWithReason(nsresult aStatus,
                                               const nsACString& aReason) {
  return CancelWithReasonImpl(aStatus, aReason);
}

// NOTE: We assume that OnStopRequest should not be called if
// request is canceled. This may be wrong!
NS_IMETHODIMP
nsPgpMimeProxy::Cancel(nsresult status) {
  NS_ENSURE_TRUE(mInitialized, NS_ERROR_NOT_INITIALIZED);

  // Need a non-zero status code to cancel
  if (NS_SUCCEEDED(status)) return NS_ERROR_FAILURE;

  if (NS_SUCCEEDED(mCancelStatus)) mCancelStatus = status;

  return NS_OK;
}

NS_IMETHODIMP
nsPgpMimeProxy::Suspend(void) { return NS_ERROR_NOT_IMPLEMENTED; }

NS_IMETHODIMP
nsPgpMimeProxy::Resume(void) { return NS_ERROR_NOT_IMPLEMENTED; }

NS_IMETHODIMP
nsPgpMimeProxy::GetLoadGroup(nsILoadGroup** aLoadGroup) {
  NS_IF_ADDREF(*aLoadGroup = mLoadGroup);
  return NS_OK;
}

NS_IMETHODIMP
nsPgpMimeProxy::SetLoadGroup(nsILoadGroup* aLoadGroup) {
  mLoadGroup = aLoadGroup;
  return NS_OK;
}

NS_IMETHODIMP
nsPgpMimeProxy::GetTRRMode(nsIRequest::TRRMode* aTRRMode) {
  return GetTRRModeImpl(aTRRMode);
}

NS_IMETHODIMP
nsPgpMimeProxy::SetTRRMode(nsIRequest::TRRMode aTRRMode) {
  return SetTRRModeImpl(aTRRMode);
}

NS_IMETHODIMP
nsPgpMimeProxy::GetLoadFlags(nsLoadFlags* aLoadFlags) {
  *aLoadFlags = mLoadFlags;
  return NS_OK;
}

NS_IMETHODIMP
nsPgpMimeProxy::SetLoadFlags(nsLoadFlags aLoadFlags) {
  mLoadFlags = aLoadFlags;
  return NS_OK;
}

///////////////////////////////////////////////////////////////////////////////
// nsIInputStream methods
///////////////////////////////////////////////////////////////////////////////

NS_IMETHODIMP
nsPgpMimeProxy::Available(uint64_t* _retval) {
  NS_ENSURE_ARG(_retval);

  NS_ENSURE_TRUE(mInitialized, NS_ERROR_NOT_INITIALIZED);

  *_retval = (mByteBuf.Length() > mStreamOffset)
                 ? mByteBuf.Length() - mStreamOffset
                 : 0;

  return NS_OK;
}

NS_IMETHODIMP
nsPgpMimeProxy::Read(char* buf, uint32_t count, uint32_t* readCount) {
  NS_ENSURE_TRUE(mInitialized, NS_ERROR_NOT_INITIALIZED);

  if (!buf || !readCount) return NS_ERROR_NULL_POINTER;

  int32_t avail = (mByteBuf.Length() > mStreamOffset)
                      ? mByteBuf.Length() - mStreamOffset
                      : 0;

  uint32_t readyCount = ((uint32_t)avail > count) ? count : avail;

  if (readyCount) {
    memcpy(buf, mByteBuf.get() + mStreamOffset, readyCount);
    *readCount = readyCount;
  }

  mStreamOffset += *readCount;

  return NS_OK;
}

NS_IMETHODIMP
nsPgpMimeProxy::ReadSegments(nsWriteSegmentFun writer, void* aClosure,
                             uint32_t count, uint32_t* readCount) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsPgpMimeProxy::IsNonBlocking(bool* aNonBlocking) {
  NS_ENSURE_TRUE(mInitialized, NS_ERROR_NOT_INITIALIZED);

  *aNonBlocking = true;
  return NS_OK;
}

NS_IMETHODIMP
nsPgpMimeProxy::Close() {
  NS_ENSURE_TRUE(mInitialized, NS_ERROR_NOT_INITIALIZED);

  mStreamOffset = 0;
  mByteBuf.Truncate();

  return NS_OK;
}

NS_IMETHODIMP nsPgpMimeProxy::StreamStatus() { return NS_OK; }

///////////////////////////////////////////////////////////////////////////////
// nsIStreamListener methods
///////////////////////////////////////////////////////////////////////////////

NS_IMETHODIMP
nsPgpMimeProxy::OnStartRequest(nsIRequest* aRequest) { return NS_OK; }

NS_IMETHODIMP
nsPgpMimeProxy::OnStopRequest(nsIRequest* aRequest, nsresult aStatus) {
  return NS_OK;
}

///////////////////////////////////////////////////////////////////////////////
// nsIStreamListener method
///////////////////////////////////////////////////////////////////////////////

NS_IMETHODIMP
nsPgpMimeProxy::OnDataAvailable(nsIRequest* aRequest,
                                nsIInputStream* aInputStream,
                                uint64_t aSourceOffset, uint32_t aLength) {
  NS_ENSURE_TRUE(mInitialized, NS_ERROR_NOT_INITIALIZED);
  NS_ENSURE_ARG(aInputStream);

  if (!mOutputFun) return NS_ERROR_FAILURE;

  char buf[kCharMax];
  uint32_t readCount, readMax;

  while (aLength > 0) {
    readMax = (aLength < kCharMax) ? aLength : kCharMax;

    nsresult rv;
    rv = aInputStream->Read((char*)buf, readMax, &readCount);
    NS_ENSURE_SUCCESS(rv, rv);

    int status = mOutputFun(buf, readCount, mOutputClosure);
    if (status < 0) {
      PR_SetError(status, 0);
      mOutputFun = nullptr;
      return NS_ERROR_FAILURE;
    }

    aLength -= readCount;
  }

  return NS_OK;
}
