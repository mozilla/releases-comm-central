/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsStreamTransportService2.h"
#include "nsXPCOMCIDInternal.h"
#include "nsNetSegmentUtils.h"
#include "nsTransportUtils.h"
#include "nsStreamUtils.h"
#include "nsError.h"
#include "nsNetCID.h"

#include "nsIAsyncInputStream.h"
#include "nsIAsyncOutputStream.h"
#include "nsISeekableStream.h"
#include "nsIPipe.h"
#include "nsITransport.h"
#include "nsIObserverService.h"
#include "nsIThreadPool.h"
#include "mozilla/Services.h"

namespace mozilla {
namespace net {

//-----------------------------------------------------------------------------
// nsInputStreamTransport2
//
// Implements nsIInputStream as a wrapper around the real input stream.  This
// allows the transport to support seeking, range-limiting, progress reporting,
// and close-when-done semantics while utilizing NS_AsyncCopy.
//-----------------------------------------------------------------------------

class nsInputStreamTransport2 : public nsITransport
                              , public nsIInputStream
{
public:
    NS_DECL_THREADSAFE_ISUPPORTS
    NS_DECL_NSITRANSPORT
    NS_DECL_NSIINPUTSTREAM

    nsInputStreamTransport2(nsIInputStream *source,
                            uint64_t offset,
                            uint64_t limit,
                            bool closeWhenDone)
        : mSource(source)
        , mOffset(offset)
        , mLimit(limit)
        , mCloseWhenDone(closeWhenDone)
        , mFirstTime(true)
        , mInProgress(false)
    {
    }

private:
    virtual ~nsInputStreamTransport2()
    {
    }

    nsCOMPtr<nsIAsyncInputStream>   mPipeIn;

    // while the copy is active, these members may only be accessed from the
    // nsIInputStream implementation.
    nsCOMPtr<nsITransportEventSink> mEventSink;
    nsCOMPtr<nsIInputStream>        mSource;
    int64_t                         mOffset;
    int64_t                         mLimit;
    bool                            mCloseWhenDone;
    bool                            mFirstTime;

    // this variable serves as a lock to prevent the state of the transport
    // from being modified once the copy is in progress.
    bool                            mInProgress;
};

NS_IMPL_ISUPPORTS(nsInputStreamTransport2,
                  nsITransport,
                  nsIInputStream)

/** nsITransport **/

NS_IMETHODIMP
nsInputStreamTransport2::OpenInputStream(uint32_t flags,
                                         uint32_t segsize,
                                         uint32_t segcount,
                                         nsIInputStream **result)
{
    NS_ENSURE_TRUE(!mInProgress, NS_ERROR_IN_PROGRESS);

    nsresult rv;
    nsCOMPtr<nsIEventTarget> target =
            do_GetService(NS_STREAMTRANSPORTSERVICE_CONTRACTID, &rv);
    if (NS_FAILED(rv)) return rv;

    // XXX if the caller requests an unbuffered stream, then perhaps
    //     we'd want to simply return mSource; however, then we would
    //     not be reading mSource on a background thread.  is this ok?

    bool nonblocking = !(flags & OPEN_BLOCKING);

    net_ResolveSegmentParams(segsize, segcount);

    nsCOMPtr<nsIAsyncOutputStream> pipeOut;
    rv = NS_NewPipe2(getter_AddRefs(mPipeIn),
                     getter_AddRefs(pipeOut),
                     nonblocking, true,
                     segsize, segcount);
    if (NS_FAILED(rv)) return rv;

    mInProgress = true;

    // startup async copy process...
    rv = NS_AsyncCopy(this, pipeOut, target,
                      NS_ASYNCCOPY_VIA_WRITESEGMENTS, segsize);
    if (NS_SUCCEEDED(rv))
        NS_ADDREF(*result = mPipeIn);

    return rv;
}

NS_IMETHODIMP
nsInputStreamTransport2::OpenOutputStream(uint32_t flags,
                                          uint32_t segsize,
                                          uint32_t segcount,
                                          nsIOutputStream **result)
{
    // this transport only supports reading!
    NS_NOTREACHED("nsInputStreamTransport2::OpenOutputStream");
    return NS_ERROR_UNEXPECTED;
}

NS_IMETHODIMP
nsInputStreamTransport2::Close(nsresult reason)
{
    if (NS_SUCCEEDED(reason))
        reason = NS_BASE_STREAM_CLOSED;

    return mPipeIn->CloseWithStatus(reason);
}

NS_IMETHODIMP
nsInputStreamTransport2::SetEventSink(nsITransportEventSink *sink,
                                      nsIEventTarget *target)
{
    NS_ENSURE_TRUE(!mInProgress, NS_ERROR_IN_PROGRESS);

    if (target)
        return net_NewTransportEventSinkProxy(getter_AddRefs(mEventSink),
                                              sink, target);

    mEventSink = sink;
    return NS_OK;
}

/** nsIInputStream **/

NS_IMETHODIMP
nsInputStreamTransport2::Close()
{
    if (mCloseWhenDone)
        mSource->Close();

    // make additional reads return early...
    mOffset = mLimit = 0;
    return NS_OK;
}

NS_IMETHODIMP
nsInputStreamTransport2::Available(uint64_t *result)
{
    return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsInputStreamTransport2::Read(char *buf, uint32_t count, uint32_t *result)
{
    if (mFirstTime) {
        mFirstTime = false;
        if (mOffset != 0) {
            // read from current position if offset equal to max
            if (mOffset != -1) {
                nsCOMPtr<nsISeekableStream> seekable = do_QueryInterface(mSource);
                if (seekable)
                    seekable->Seek(nsISeekableStream::NS_SEEK_SET, mOffset);
            }
            // reset offset to zero so we can use it to enforce limit
            mOffset = 0;
        }
    }

    // limit amount read
    uint64_t max = count;
    if (mLimit != -1) {
        max = mLimit - mOffset;
        if (max == 0) {
            *result = 0;
            return NS_OK;
        }
    }

    if (count > max)
        count = static_cast<uint32_t>(max);

    nsresult rv = mSource->Read(buf, count, result);

    if (NS_SUCCEEDED(rv)) {
        mOffset += *result;
        if (mEventSink)
            mEventSink->OnTransportStatus(this, NS_NET_STATUS_READING, mOffset,
                                          mLimit);
    }
    return rv;
}

NS_IMETHODIMP
nsInputStreamTransport2::ReadSegments(nsWriteSegmentFun writer, void *closure,
                                      uint32_t count, uint32_t *result)
{
    return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsInputStreamTransport2::IsNonBlocking(bool *result)
{
    *result = false;
    return NS_OK;
}

//-----------------------------------------------------------------------------
// nsOutputStreamTransport2
//
// Implements nsIOutputStream as a wrapper around the real input stream.  This
// allows the transport to support seeking, range-limiting, progress reporting,
// and close-when-done semantics while utilizing NS_AsyncCopy.
//-----------------------------------------------------------------------------

class nsOutputStreamTransport2 : public nsITransport
                               , public nsIOutputStream
{
public:
    NS_DECL_THREADSAFE_ISUPPORTS
    NS_DECL_NSITRANSPORT
    NS_DECL_NSIOUTPUTSTREAM

    nsOutputStreamTransport2(nsIOutputStream *sink,
                             int64_t offset,
                             int64_t limit,
                             bool closeWhenDone)
        : mSink(sink)
        , mOffset(offset)
        , mLimit(limit)
        , mCloseWhenDone(closeWhenDone)
        , mFirstTime(true)
        , mInProgress(false)
    {
    }

private:
    virtual ~nsOutputStreamTransport2()
    {
    }

    nsCOMPtr<nsIAsyncOutputStream>  mPipeOut;

    // while the copy is active, these members may only be accessed from the
    // nsIOutputStream implementation.
    nsCOMPtr<nsITransportEventSink> mEventSink;
    nsCOMPtr<nsIOutputStream>       mSink;
    int64_t                         mOffset;
    int64_t                         mLimit;
    bool                            mCloseWhenDone;
    bool                            mFirstTime;

    // this variable serves as a lock to prevent the state of the transport
    // from being modified once the copy is in progress.
    bool                            mInProgress;
};

NS_IMPL_ISUPPORTS(nsOutputStreamTransport2,
                  nsITransport,
                  nsIOutputStream)

/** nsITransport **/

NS_IMETHODIMP
nsOutputStreamTransport2::OpenInputStream(uint32_t flags,
                                          uint32_t segsize,
                                          uint32_t segcount,
                                          nsIInputStream **result)
{
    // this transport only supports writing!
    NS_NOTREACHED("nsOutputStreamTransport2::OpenInputStream");
    return NS_ERROR_UNEXPECTED;
}

NS_IMETHODIMP
nsOutputStreamTransport2::OpenOutputStream(uint32_t flags,
                                           uint32_t segsize,
                                           uint32_t segcount,
                                           nsIOutputStream **result)
{
    NS_ENSURE_TRUE(!mInProgress, NS_ERROR_IN_PROGRESS);

    nsresult rv;
    nsCOMPtr<nsIEventTarget> target =
            do_GetService(NS_STREAMTRANSPORTSERVICE_CONTRACTID, &rv);
    if (NS_FAILED(rv)) return rv;

    // XXX if the caller requests an unbuffered stream, then perhaps
    //     we'd want to simply return mSink; however, then we would
    //     not be writing to mSink on a background thread.  is this ok?

    bool nonblocking = !(flags & OPEN_BLOCKING);

    net_ResolveSegmentParams(segsize, segcount);

    nsCOMPtr<nsIAsyncInputStream> pipeIn;
    rv = NS_NewPipe2(getter_AddRefs(pipeIn),
                     getter_AddRefs(mPipeOut),
                     true, nonblocking,
                     segsize, segcount);
    if (NS_FAILED(rv)) return rv;

    mInProgress = true;

    // startup async copy process...
    rv = NS_AsyncCopy(pipeIn, this, target,
                      NS_ASYNCCOPY_VIA_READSEGMENTS, segsize);
    if (NS_SUCCEEDED(rv))
        NS_ADDREF(*result = mPipeOut);

    return rv;
}

NS_IMETHODIMP
nsOutputStreamTransport2::Close(nsresult reason)
{
    if (NS_SUCCEEDED(reason))
        reason = NS_BASE_STREAM_CLOSED;

    return mPipeOut->CloseWithStatus(reason);
}

NS_IMETHODIMP
nsOutputStreamTransport2::SetEventSink(nsITransportEventSink *sink,
                                       nsIEventTarget *target)
{
    NS_ENSURE_TRUE(!mInProgress, NS_ERROR_IN_PROGRESS);

    if (target)
        return net_NewTransportEventSinkProxy(getter_AddRefs(mEventSink),
                                              sink, target);

    mEventSink = sink;
    return NS_OK;
}

/** nsIOutputStream **/

NS_IMETHODIMP
nsOutputStreamTransport2::Close()
{
    if (mCloseWhenDone)
        mSink->Close();

    // make additional writes return early...
    mOffset = mLimit = 0;
    return NS_OK;
}

NS_IMETHODIMP
nsOutputStreamTransport2::Flush()
{
    return NS_OK;
}

NS_IMETHODIMP
nsOutputStreamTransport2::Write(const char *buf, uint32_t count, uint32_t *result)
{
    if (mFirstTime) {
        mFirstTime = false;
        if (mOffset != 0) {
            // write to current position if offset equal to max
            if (mOffset != -1) {
                nsCOMPtr<nsISeekableStream> seekable = do_QueryInterface(mSink);
                if (seekable)
                    seekable->Seek(nsISeekableStream::NS_SEEK_SET, mOffset);
            }
            // reset offset to zero so we can use it to enforce limit
            mOffset = 0;
        }
    }

    // limit amount written
    uint64_t max = count;
    if (mLimit != -1) {
        max = mLimit - mOffset;
        if (max == 0) {
            *result = 0;
            return NS_OK;
        }
    }

    if (count > max)
        count = static_cast<uint32_t>(max);

    nsresult rv = mSink->Write(buf, count, result);

    if (NS_SUCCEEDED(rv)) {
        mOffset += *result;
        if (mEventSink)
            mEventSink->OnTransportStatus(this, NS_NET_STATUS_WRITING, mOffset,
                                          mLimit);
    }
    return rv;
}

NS_IMETHODIMP
nsOutputStreamTransport2::WriteSegments(nsReadSegmentFun reader, void *closure,
                                        uint32_t count, uint32_t *result)
{
    return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsOutputStreamTransport2::WriteFrom(nsIInputStream *in, uint32_t count, uint32_t *result)
{
    return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
nsOutputStreamTransport2::IsNonBlocking(bool *result)
{
    *result = false;
    return NS_OK;
}

//-----------------------------------------------------------------------------
// nsStreamTransportService2
//-----------------------------------------------------------------------------

nsStreamTransportService2::~nsStreamTransportService2()
{
    NS_ASSERTION(!mPool, "thread pool wasn't shutdown");
}

nsresult
nsStreamTransportService2::Init()
{
    mPool = do_CreateInstance(NS_THREADPOOL_CONTRACTID);
    NS_ENSURE_STATE(mPool);

    // Configure the pool
    mPool->SetName(NS_LITERAL_CSTRING("StreamTrans"));
    mPool->SetThreadLimit(25);
    mPool->SetIdleThreadLimit(1);
    mPool->SetIdleThreadTimeout(PR_SecondsToInterval(30));

    nsCOMPtr<nsIObserverService> obsSvc =
        mozilla::services::GetObserverService();
    if (obsSvc)
        obsSvc->AddObserver(this, "xpcom-shutdown-threads", false);
    return NS_OK;
}

NS_IMPL_ISUPPORTS(nsStreamTransportService2,
                  nsIStreamTransportService2,
                  nsIEventTarget,
                  nsIObserver)

NS_IMETHODIMP
nsStreamTransportService2::DispatchFromScript(nsIRunnable *task, uint32_t flags)
{
  nsCOMPtr<nsIRunnable> event(task);
  return Dispatch(event.forget(), flags);
}

NS_IMETHODIMP
nsStreamTransportService2::Dispatch(already_AddRefed<nsIRunnable> task, uint32_t flags)
{
    nsCOMPtr<nsIRunnable> event(task); // so it gets released on failure paths
    nsCOMPtr<nsIThreadPool> pool;
    {
        mozilla::MutexAutoLock lock(mShutdownLock);
        if (mIsShutdown) {
            return NS_ERROR_NOT_INITIALIZED;
        }
        pool = mPool;
    }
    NS_ENSURE_TRUE(pool, NS_ERROR_NOT_INITIALIZED);
    return pool->Dispatch(event.forget(), flags);
}

NS_IMETHODIMP
nsStreamTransportService2::DelayedDispatch(already_AddRefed<nsIRunnable>, uint32_t)
{
    return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP_(bool)
nsStreamTransportService2::IsOnCurrentThreadInfallible()
{
    nsCOMPtr<nsIThreadPool> pool;
    {
        mozilla::MutexAutoLock lock(mShutdownLock);
        pool = mPool;
    }
    if (!pool) {
      return false;
    }
    return pool->IsOnCurrentThread();
}

NS_IMETHODIMP
nsStreamTransportService2::IsOnCurrentThread(bool *result)
{
    nsCOMPtr<nsIThreadPool> pool;
    {
        mozilla::MutexAutoLock lock(mShutdownLock);
        if (mIsShutdown) {
            return NS_ERROR_NOT_INITIALIZED;
        }
        pool = mPool;
    }
    NS_ENSURE_TRUE(pool, NS_ERROR_NOT_INITIALIZED);
    return pool->IsOnCurrentThread(result);
}

NS_IMETHODIMP
nsStreamTransportService2::CreateInputTransport(nsIInputStream *stream,
                                                int64_t offset,
                                                int64_t limit,
                                                bool closeWhenDone,
                                                nsITransport **result)
{
    nsInputStreamTransport2 *trans =
        new nsInputStreamTransport2(stream, offset, limit, closeWhenDone);
    if (!trans)
        return NS_ERROR_OUT_OF_MEMORY;
    NS_ADDREF(*result = trans);
    return NS_OK;
}

NS_IMETHODIMP
nsStreamTransportService2::Observe(nsISupports *subject, const char *topic,
                                   const char16_t *data)
{
  NS_ASSERTION(strcmp(topic, "xpcom-shutdown-threads") == 0, "oops");

  {
    mozilla::MutexAutoLock lock(mShutdownLock);
    mIsShutdown = true;
  }

  if (mPool) {
    mPool->Shutdown();
    mPool = nullptr;
  }
  return NS_OK;
}

} // namespace net
} // namespace mozilla
