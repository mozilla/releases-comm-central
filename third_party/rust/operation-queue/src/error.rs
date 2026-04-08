/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use async_channel::SendError;
use thiserror::Error;

use crate::ErasedQueuedOperation;

/// An error returned from the queue.
#[derive(Debug, Error)]
pub enum Error {
    #[error("the queue has been stopped and cannot be started again")]
    Stopped,

    #[error("could not send operation to queue: sending into a closed channel")]
    Sender,
}

impl From<SendError<Box<dyn ErasedQueuedOperation>>> for Error {
    // `SendError` is only returned in one case: the channel is closed.
    fn from(_: SendError<Box<dyn ErasedQueuedOperation>>) -> Self {
        Error::Sender
    }
}
