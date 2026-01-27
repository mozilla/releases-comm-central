/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use nserror::nsresult;

use crate::safe_xpcom::{SafeListener, handle_error};

/// Abstract representation of an Exchange client implementation of performing an operation.
#[allow(async_fn_in_trait)]
pub trait DoOperation<Client, Err>
where
    for<'a> &'a Err: Into<nsresult> + TryInto<&'a moz_http::Error>,
    Err: std::fmt::Debug,
{
    /// A name or description of the operation for logging purposes.
    const NAME: &str;

    /// The success case return type of [`Self::do_operation`].
    type Okay;

    /// The listener this operation uses to report success/failure.
    type Listener: SafeListener;

    /// Do the operation represented. Includes most of the logic, returning any errors encountered.
    async fn do_operation(&mut self, client: &Client) -> Result<Self::Okay, Err>;

    /// Turn the succesesfully completed operation into the argument for [`SafeListener::on_success`].
    fn into_success_arg(self, ok: Self::Okay) -> <Self::Listener as SafeListener>::OnSuccessArg;

    /// Turn the failed operation into the argument for [`SafeListener::on_failure`].
    fn into_failure_arg(self) -> <Self::Listener as SafeListener>::OnFailureArg;

    /// Handle the operation done in [`Self::do_operation`]. I.e., calls `do_operation`, and handles
    /// any errors returned as appropriate.
    async fn handle_operation(mut self, client: &Client, listener: &Self::Listener)
    where
        Self: Sized,
    {
        match self.do_operation(client).await {
            Ok(okay) => {
                if let Err(err) = listener.on_success(self.into_success_arg(okay)) {
                    log::warn!(
                        "listener for {} success callback returned an error: {err}",
                        Self::NAME
                    );
                }
            }
            Err(err) => {
                handle_error(listener, Self::NAME, &err, self.into_failure_arg());
            }
        }
    }
}
