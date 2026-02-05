/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! This module implements structures that help synchronize error handling
//! across [`OperationQueue`] runners. It revolves around the [`Line`]
//! struct, which is an asynchronous flow control structure that behaves a bit
//! like a mutex, with the exception that consumers waiting for the [`Line`] to
//! be released do not subsequently lock it.
//!
//! The design of a [`Line`] is inspired from the one of a [one-track railway
//! line](https://en.wikipedia.org/wiki/Token_(railway_signalling)). To avoid
//! collisions, conductors must acquire a token at the entrance to the line that
//! ensures they're the only one on it. If the token is being held, traffic
//! around this line stops until it's released again.
//!
//! Here we're not using this concept to drive trains, but to ensure that
//! whenever multiple [`OperationQueue`] runners encounter an authentication or
//! throttling error (or other types of errors that might cause requests to be
//! retried), only one runner handles it while the others wait for the error to
//! be resolved before retrying.
//!
//! [`OperationQueue`]: crate::operation_queue::OperationQueue

use std::cell::RefCell;

use futures::{FutureExt, future::Shared};
use oneshot::{Receiver, Sender};

/// A oneshot channel used internally by a [`Line`] that's been acquired to
/// communicate that the token has been dropped and the line was released.
///
/// The channel's [`Receiver`] is wrapped in a [`Shared`] that can be cloned
/// when a new consumer tries and fails to acquire a token for the line.
struct ReleaseChannel {
    sender: Sender<()>,
    receiver: Shared<Receiver<()>>,
}

/// A [`Line`] from which a [`Token`] can be acquired.
pub(crate) struct Line {
    channel: RefCell<Option<ReleaseChannel>>,
}

impl Line {
    /// Instantiates a new [`Line`].
    pub fn new() -> Line {
        Line {
            channel: Default::default(),
        }
    }

    /// Attempts to acquire a [`Token`] for this line.
    ///
    /// The [`Token`] automatically releases the line upon leaving the current
    /// scope and getting dropped.
    ///
    /// If a [`Token`] has already been acquired for this line, a future to
    /// `await` is returned instead. It resolves when the current token holder
    /// has finished handling the current error and releases the line.
    pub fn try_acquire_token<'l>(&'l self) -> AcquireOutcome<'l> {
        if let Some(channel) = self.channel.borrow().as_ref() {
            // Since the oneshot `Receiver` is wrapped in a `Shared`, cloning it
            // will return a new handle on the `Shared` which will resolve at
            // the same time as the others.
            return AcquireOutcome::Failure(channel.receiver.clone());
        }

        // The line is currently available, create a new channel and give the
        // consumer their token.
        let (sender, receiver) = oneshot::channel();
        self.channel.replace(Some(ReleaseChannel {
            sender,
            receiver: receiver.shared(),
        }));

        AcquireOutcome::Success(Token { line: self })
    }

    /// Releases the line, and resolves the [`Shared`] future other consumers
    /// might be awaiting.
    pub(self) fn release(&self) {
        // "Take" the channel out of the `RefCell`; on top of letting us access
        // its content, we're also making sure that even if something bad
        // happens then the line can be acquired again.
        match self.channel.take() {
            Some(channel) => match channel.sender.send(()) {
                Ok(_) => (),
                Err(_) => log::error!("trying to release using a closed channel"),
            },
            None => log::error!("trying to release before acquiring"),
        };
    }
}

/// The outcome from trying to acquire a [`Token`] for a [`Line`].
pub(crate) enum AcquireOutcome<'ao> {
    /// The line could be acquired and returned a token to hold on to.
    ///
    /// The token must remain in scope, as it will release the line when
    /// dropped.
    Success(Token<'ao>),

    /// The line could not be acquired as another consumer is holding a token
    /// for it.
    ///
    /// This variant includes a [`Shared`] future that resolves when the current
    /// token holder drops it and releases the line.
    Failure(Shared<Receiver<()>>),
}

impl<'ao> AcquireOutcome<'ao> {
    /// Returns the [`AcquireOutcome`] if it's a success, otherwise returns a
    /// success with the provided token if it's not [`None`].
    ///
    /// If the current [`AcquireOutcome`] is a failure, and the provided token
    /// is [`None`], the failure is returned.
    ///
    /// # Design considerations
    ///
    /// One way to make this method more straightforward could have been to make
    /// `token` be a [`Token`], not an [`Option`], but the current signature was
    /// picked to simplify the consumers (which store the token, if any, in an
    /// [`Option`]).
    pub fn or_token(self, token: Option<Token<'ao>>) -> Self {
        match self {
            AcquireOutcome::Success(_) => self,
            AcquireOutcome::Failure(_) => match token {
                Some(token) => AcquireOutcome::Success(token),
                None => self,
            },
        }
    }
}

/// A token that symbolizes the current consumer holds exclusive access to the
/// corresponding [`Line`].
///
/// The [`Line`] is automatically released when this token goes out of scope and
/// is dropped.
pub(crate) struct Token<'t> {
    line: &'t Line,
}

impl Drop for Token<'_> {
    fn drop(&mut self) {
        self.line.release();
    }
}
