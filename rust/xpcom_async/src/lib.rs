/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! This module provides helpers to use Rust's asynchronous language features
//! when manipulating XPCOM asynchronous operations, such as network calls.

use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};

use thin_vec::ThinVec;

use nserror::nsresult;
use xpcom::interfaces::{nsIChannel, nsIStreamListener};
use xpcom::{RefPtr, XpCom};

mod buffering_listener;
use crate::buffering_listener::BufferingStreamListener;

/// A wrapper providing a native Rust [`Future`] for asynchronous operations on
/// XPCOM interfaces.
///
/// When the future is `.await`ed, the asynchronous operation is called on
/// the underlying XPCOM object (e.g., `nsIChannel::AsyncOpen`) with an
/// [`nsIStreamListener`] implementation which buffers the data it receives.
///
/// If the request completes successfully, it will be returned the next time the
/// future is polled as a tuple consisting of:
///
///   * the original XPCOM object on which the operation was executed (e.g., the
///     [`nsIChannel`]); and
///   * the data read by the [`nsIStreamListener`].
///
/// If the request fails, the status provided to [`OnStopRequest`] is returned
/// instead.
///
/// [`OnStopRequest`]: xpcom::interfaces::nsIRequestObserver::OnStopRequest
pub struct XpComFuture<T: XpCom + 'static> {
    async_interface: RefPtr<T>,
    listener: RefPtr<BufferingStreamListener>,
    running: bool,
}

impl<T: XpCom> XpComFuture<T> {
    /// Reads data from the listener if any is available.
    ///
    /// Returns [`Poll::Ready`] if the request has completed, and
    /// [`Poll::Pending`] otherwise.
    fn poll_listener(&self) -> Poll<Result<(RefPtr<T>, ThinVec<u8>), nsresult>> {
        if let Some(status) = self.listener.status() {
            // The listener has a final status, which means the request has
            // finished.
            if status.failed() {
                return Poll::Ready(Err(status));
            }

            // The container with the data received to pass to the caller.
            let mut data = ThinVec::new();

            // Read the data stored in the listener in chunks.
            let mut buf: [u8; 4096] = [0; 4096];
            loop {
                // BufferingStreamListener implements a slight variant of the
                // Read trait, which returns an nsresult if an error occurred.
                let read = self.listener.read(&mut buf)?;

                if read == 0 {
                    break;
                }

                data.extend_from_slice(&buf[..read]);
            }

            // We can't directly move self.async_interface, since it's not clear
            // to the compiler that we have reached the end of the struct's
            // lifetime at this point (which, to be fair, we might not have).
            // Cloning the RefPtr isn't expensive at all, since all it does is
            // to create a new `RefPtr` that points to the same data and
            // increments the refcount. When the `RefPtr` in
            // self.async_interface drops out of scope, that refcount is
            // decremented, so we end up neutral.
            return Poll::Ready(Ok((self.async_interface.clone(), data)));
        }

        Poll::Pending
    }
}

impl<T: XpCom> From<RefPtr<T>> for XpComFuture<T> {
    /// Wraps a [`RefPtr<T>`] into a new [`XpComFuture<T>`]. When `.await`ed on,
    /// this new instance calls the matching asynchronous method on `T`. The
    /// currently supported XPCOM interfaces and methods are:
    ///
    /// * [`XpComFuture<nsIChannel>`] → [`nsIChannel::AsyncOpen`]
    ///
    /// Any [`XpComFuture<T>`] where `T` isn't listed above does not implement the
    /// [`Future`] trait and therefore cannot be `.await`ed on.
    fn from(xpcom_interface: RefPtr<T>) -> Self {
        XpComFuture {
            async_interface: xpcom_interface,
            listener: BufferingStreamListener::new(),
            running: false,
        }
    }
}

impl XpComFuture<nsIChannel> {
    /// Starts the request through the channel that was originally provided, if
    /// it's not already running.
    fn ensure_started(&mut self) -> Result<(), nsresult> {
        if !self.running {
            // Turn the listener into the type that AsyncOpen will expect.
            let stream_listener: RefPtr<nsIStreamListener> = self
                .listener
                .query_interface::<nsIStreamListener>()
                .ok_or(nserror::NS_ERROR_FAILURE)?;

            // SAFETY: XPCOM guarantees that `RefPtr`s are valid and point to an
            // implementation of the correct interface.
            unsafe {
                // Start the request.
                self.async_interface
                    .AsyncOpen(stream_listener.coerce())
                    .to_result()?;
            }

            self.running = true;
        }

        Ok(())
    }
}

// Note: In future iterations, we'll probably want to implement the
// `futures::stream::Stream` trait here as well, to allow processing data as it
// arrives (rather than buffering it all).
// See https://bugzilla.mozilla.org/show_bug.cgi?id=1869277
impl Future for XpComFuture<nsIChannel> {
    type Output = Result<(RefPtr<nsIChannel>, ThinVec<u8>), nsresult>;

    fn poll(mut self: Pin<&mut XpComFuture<nsIChannel>>, cx: &mut Context) -> Poll<Self::Output> {
        // Set the waker on the listener so it can use it when the request finishes.
        self.listener.set_waker(cx.waker().clone());
        // Start the request if it hasn't already.
        self.ensure_started()?;
        // Attempt to read from the listener.
        self.poll_listener()
    }
}
