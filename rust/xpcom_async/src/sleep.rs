/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::{
    cell::Cell, future::Future, task::{Poll, Waker}
};

use cstr::cstr;
use nserror::{nsresult, NS_ERROR_UNEXPECTED, NS_OK};
use xpcom::{interfaces::nsITimer, xpcom_method, RefPtr};

/// Sleeps for the specified duration.
///
/// # Errors
///
/// This call will fail if creating or initializing the underlying timer fails.
pub async fn sleep(duration_in_ms: u32) -> Result<(), nsresult> {
    SleepTimerFuture(SleepTimer::with_duration(duration_in_ms)?).await;

    Ok(())
}

/// A newtype wrapper around the timer to allow us to implement traits on it.
struct SleepTimerFuture(RefPtr<SleepTimer>);

/// A timer for
#[xpcom::xpcom(implement(nsITimerCallback), atomic)]
struct SleepTimer {
    /// The backing XPCOM timer instance.
    ///
    /// We must hold a reference to it until we are notified that it has
    /// completed.
    timer: RefPtr<nsITimer>,

    /// Whether the timer has notified us of completion.
    has_timer_completed: Cell<bool>,

    /// The task waker to wake when ready, if any.
    waker: Cell<Option<Waker>>,
}

impl SleepTimer {
    /// Creates a new sleep timer with the specified duration.
    fn with_duration(duration_in_ms: u32) -> Result<RefPtr<Self>, nsresult> {
        let timer = xpcom::create_instance::<nsITimer>(cstr!("@mozilla.org/timer;1"))
            .ok_or(NS_ERROR_UNEXPECTED)?;

        let sleeper = Self::allocate(InitSleepTimer {
            timer: timer.clone(),
            has_timer_completed: Default::default(),
            waker: Default::default(),
        });

        unsafe {
            timer.InitWithCallback(sleeper.coerce(), duration_in_ms, nsITimer::TYPE_ONE_SHOT as u32)
        }
        .to_result()?;

        Ok(sleeper)
    }

    xpcom_method!(notify => Notify(timer: *const nsITimer));
    fn notify(&self, _timer: &nsITimer) -> Result<(), nsresult> {
        // If for some reason the timer completes before we have a waker set, we
        // need to ensure that we still indicate we're ready on next poll.
        self.has_timer_completed.set(true);

        if let Some(waker) = self.waker.take() {
            waker.wake();
        }

        Ok(())
    }
}

impl Future for SleepTimerFuture {
    type Output = ();

    fn poll(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Self::Output> {
        if self.0.has_timer_completed.take() {
            Poll::Ready(())
        } else {
            self.0.waker.set(Some(cx.waker().clone()));

            Poll::Pending
        }
    }
}
