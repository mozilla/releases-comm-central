/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::{
    cell::{Cell, OnceCell},
    future::Future,
    task::Waker,
};

use nserror::{nsresult, NS_OK};
use nsstring::nsACString;
use xpcom::{xpcom_method, RefPtr};

/// A listener for token requests to an OAuth2 module.
///
/// When `await`ed, returns a valid bearer token or an error if a bearer token
/// could not be acquired.
#[xpcom::xpcom(implement(msgIOAuth2ModuleListener), atomic)]
pub(super) struct OAuthListener {
    result: OnceCell<Result<String, nsresult>>,
    waker: Cell<Option<Waker>>,
}

impl OAuthListener {
    pub fn new() -> RefPtr<Self> {
        Self::allocate(InitOAuthListener {
            result: Default::default(),
            waker: Default::default(),
        })
    }

    xpcom_method!(on_success => OnSuccess(bearer: *const nsACString));
    fn on_success(&self, bearer: &nsACString) -> Result<(), nsresult> {
        let bearer = String::from(bearer.to_utf8());
        self.result
            .set(Ok(bearer))
            .map_err(|_| nserror::NS_ERROR_UNEXPECTED)?;

        if let Some(waker) = self.waker.take() {
            waker.wake();
        }

        Ok(())
    }

    xpcom_method!(on_failure => OnFailure(err: nsresult));
    fn on_failure(&self, err: nsresult) -> Result<(), nsresult> {
        self.result
            .set(Err(err))
            .map_err(|_| nserror::NS_ERROR_UNEXPECTED)?;

        if let Some(waker) = self.waker.take() {
            waker.wake();
        }

        Ok(())
    }
}

impl Future for &OAuthListener {
    type Output = Result<String, nsresult>;

    fn poll(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Self::Output> {
        match self.result.get() {
            Some(result) => {
                // Because `OAuthListener` must be allocated by XPCOM in order
                // to pass it to XPCOM methods, we only have access to it by
                // immutable reference, so we're stuck getting a ref to the
                // `Result` and cloning.
                std::task::Poll::Ready(result.clone())
            }
            None => {
                self.waker.replace(Some(cx.waker().clone()));

                std::task::Poll::Pending
            }
        }
    }
}
