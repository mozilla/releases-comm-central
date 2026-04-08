/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//! Helpers for synchronizing operations (e.g. error handling) across futures.
//!
//! This module revolves around the [`Line`] struct, which is an asynchronous
//! flow control structure that behaves a bit like a mutex, with the exception
//! that consumers waiting for the [`Line`] to be released do not subsequently
//! lock it.
//!
//! The design of a [`Line`] is inspired from the one of a [one-track railway
//! line](https://en.wikipedia.org/wiki/Token_(railway_signalling)). To avoid
//! collisions, conductors must acquire a token at the entrance to the line that
//! ensures they're the only one on it. If the token is being held, traffic
//! around this line stops until it's released again.
//!
//! Similarly, in a context with multiple parallel [`Future`]s, it might be
//! necessary to ensure only one takes care of a given operation. For example,
//! if multiple requests are being performed against the same service, and one
//! of them hits an authentication error, it is likely the others will as well.
//! In this case, it is preferrable to only let one future handle the error than
//! let every request re-authenticate independently (in this example,
//! credentials are the same across requests, and multiple simultaneous
//! authentication attempts might cause issues with complex flows).
//!
//! Each future holds a shared on a [`Line`] (e.g. wrapped in an [`Rc`] or an
//! [`Arc`]). Whenever a future needs to perform an operation that should only
//! be performed once at a time, it attempts to acquire the line's token with
//! [`Line::try_acquire_token`]. This function returns an enum
//! ([`AcquireOutcome`]) describing one of two cases:
//!
//! * The line's token is available and has been acquired, and the future can
//!   start performing the operation immediately. It is granted the line's
//!   [`Token`], which it must hold in scope for the duration of the operation,
//!   as dropping it releases the line.
//! * The line's token has already been acquired by another future, in which
//!   case the future must wait for the line to become available again. When the
//!   line becomes available again, the future does not need to acquire another
//!   token, as another future should have taken care of performing the
//!   operation.
//!
//! [`OperationQueue`]: crate::operation_queue::OperationQueue
//! [`Future`]: std::future::Future
//! [`Rc`]: std::rc::Rc
//! [`Arc`]: std::sync::Arc

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
#[derive(Default)]
pub struct Line {
    // TODO: We should look into replacing this `RefCell` with a `Mutex` from
    // `async_lock` to make `Line` thread-safe.
    // https://github.com/thunderbird/operation-queue-rs/issues/2
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
#[must_use = "if the token is unused the line will immediately release again"]
pub enum AcquireOutcome<'ao> {
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
#[must_use = "if unused the line will immediately release again"]
pub struct Token<'t> {
    line: &'t Line,
}

impl Drop for Token<'_> {
    fn drop(&mut self) {
        self.line.release();
    }
}

#[cfg(test)]
mod tests {
    use tokio::time::Duration;

    use super::*;

    fn get_token(line: &Line) -> Token<'_> {
        match line.try_acquire_token() {
            AcquireOutcome::Success(token) => token,
            AcquireOutcome::Failure(_) => panic!("expected a token from try_acquire_token()"),
        }
    }

    #[test]
    fn acquire_token() {
        let line = Line::new();

        let _token = get_token(&line);

        match line.try_acquire_token() {
            AcquireOutcome::Success(_) => {
                panic!("should not be able to acquire the line while the token is in scope")
            }
            AcquireOutcome::Failure(_) => (),
        }
    }

    #[test]
    fn token_out_of_scope() {
        let line = Line::new();

        {
            let _token = get_token(&line);

            match line.try_acquire_token() {
                AcquireOutcome::Success(_) => {
                    panic!("should not be able to acquire the line while the token is in scope")
                }
                AcquireOutcome::Failure(_) => (),
            }
        }

        match line.try_acquire_token() {
            AcquireOutcome::Success(_) => (),
            AcquireOutcome::Failure(_) => {
                panic!("expected a token now that the previous token has been dropped")
            }
        }
    }

    #[test]
    fn or_token() {
        let line = Line::new();

        let token = get_token(&line);

        match line.try_acquire_token().or_token(Some(token)) {
            AcquireOutcome::Success(_) => (),
            AcquireOutcome::Failure(_) => panic!("we should have kept our token"),
        }
    }

    #[tokio::test(flavor = "current_thread")]
    async fn line_release_on_drop() {
        let line = Line::new();

        // A mutable variable that will act as the test's success flag and will
        // only be true if it succeeds.
        let mut success = false;

        // Acquire the line's token, sleep for a bit (10ms) and then drop it.
        // The reason we sleep here is to give some time to `wait_for_line` to
        // try (and fail) to acquire the line's token before we drop it.
        async fn acquire_sleep_and_drop(line: &Line) {
            let _token = get_token(&line);
            tokio::time::sleep(Duration::from_millis(10)).await;
        }

        // Try (and fail) to acquire the token, then wait for the line to become
        // available again. This function sets the success flag.
        async fn wait_for_line(line: &Line, success: &mut bool) {
            let shared = match line.try_acquire_token() {
                AcquireOutcome::Success(_) => {
                    panic!("should not be able to acquire the line while the token is in scope")
                }
                AcquireOutcome::Failure(shared) => shared,
            };

            shared.await.unwrap();
            *success = true;
        }

        // Run both futures in parallel. `biased;` ensures the futures are
        // polled in order (meaning `acquire_sleep_and_drop` is run first).
        tokio::join! {
            biased;
            acquire_sleep_and_drop(&line),
            wait_for_line(&line, &mut success),
        };

        assert!(success)
    }
}
