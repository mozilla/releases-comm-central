/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! `Send`-safe variant of the queue's operation traits, used when the `send`
//! feature is enabled.

use std::{fmt::Debug, future::Future, pin::Pin};

/// An operation that can be added to an [`OperationQueue`](crate::OperationQueue).
/// `Send`-safe counterpart to the non-`send`-feature `QueuedOperation`, for
/// use with e.g. `tokio::spawn` on a multi-threaded runtime.
pub trait QueuedOperation: Debug + Send {
    fn perform(&self) -> impl Future<Output = ()> + Send;
}

/// A dyn-compatible version of [`QueuedOperation`], implemented for all types
/// that implement it. See `local_thread::ErasedQueuedOperation` for why this
/// is necessary.
pub trait ErasedQueuedOperation: Debug + Send {
    fn perform<'op>(&'op self) -> Pin<Box<dyn Future<Output = ()> + Send + 'op>>;
}

impl<T> ErasedQueuedOperation for T
where
    T: QueuedOperation,
{
    fn perform<'op>(&'op self) -> Pin<Box<dyn Future<Output = ()> + Send + 'op>> {
        Box::pin(QueuedOperation::perform(self))
    }
}

/// The type used to spawn a runner's loop, e.g. `tokio::spawn`. Must not be
/// blocking.
pub(crate) type SpawnTaskFn = fn(Pin<Box<dyn Future<Output = ()> + Send>>);

#[cfg(test)]
mod tests {
    fn assert_send<T: Send>() {}

    #[test]
    fn operation_queue_is_send() {
        assert_send::<crate::OperationQueue>();
    }
}
