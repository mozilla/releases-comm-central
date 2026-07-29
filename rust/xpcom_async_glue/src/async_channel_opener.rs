/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::{
    pin::Pin,
    task::{Context, Poll},
};

use nserror::nsresult;
use thin_vec::ThinVec;
use xpcom::{
    RefPtr,
    interfaces::{nsIChannel, nsIStreamListener},
};

mod buffering_listener;
use crate::async_channel_opener::buffering_listener::BufferingStreamListener;

/// The value to which [`AsyncChannelOpener`]'s [`Future`] implementation
/// resolves.
type FutureResult = Result<(RefPtr<nsIChannel>, ThinVec<u8>), nsresult>;

/// A wrapper around an [`nsIChannel`] that "opens" the channel asynchronously
/// (via `nsIChannel::AsyncOpen`).
///
/// This wrapper implements the [`Future`] trait, meaning it can be `await`ed
/// for the channel's final result. More specifically, the future resolves to a
/// tuple that contains the channel itself (in case the consumer wishes to get
/// more information out of it) and the response bytes passed to
/// [`nsIStreamListener`].
///
/// Returning the channel is important, because Necko might have replaced it if
/// e.g. the request gets redirected. Replacement channels are shared via the
/// stream listener, and this future captures them and returns the channel that
/// was last provided.
pub struct AsyncChannelOpener {
    inner: RefPtr<nsIChannel>,
    listener: RefPtr<BufferingStreamListener>,
    running: bool,
}

impl From<RefPtr<nsIChannel>> for AsyncChannelOpener {
    fn from(value: RefPtr<nsIChannel>) -> Self {
        AsyncChannelOpener {
            inner: value,
            listener: BufferingStreamListener::new(),
            running: false,
        }
    }
}

impl Future for AsyncChannelOpener {
    type Output = FutureResult;

    fn poll(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        // Set the waker on the listener so it can use it when the request finishes.
        self.listener.set_waker(cx.waker().clone());

        // Start the request if it hasn't already.
        if !self.running {
            // Turn the listener into the type that AsyncOpen will expect.
            let stream_listener: RefPtr<nsIStreamListener> = self
                .listener
                .query_interface::<nsIStreamListener>()
                .ok_or(nserror::NS_ERROR_FAILURE)?;

            // Start the request.
            // SAFETY: XPCOM guarantees that `RefPtr`s are valid and point to an
            // implementation of the correct interface.
            unsafe { self.inner.AsyncOpen(stream_listener.coerce()) }.to_result()?;

            self.running = true;
        }

        // Check if the listener has been told the request has finished.
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

            let channel = self
                .listener
                .channel()
                // We can't directly move self.inner, since it's not clear to
                // the compiler that we have reached the end of the struct's
                // lifetime at this point (which, to be fair, we might not
                // have), so we need to clone it (which is inexpensive since
                // it's wrapped in a `RefPtr`).
                .unwrap_or_else(|| self.inner.clone());

            return Poll::Ready(Ok((channel, data)));
        }

        Poll::Pending
    }
}
