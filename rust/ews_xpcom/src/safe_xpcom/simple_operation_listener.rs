/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use nserror::nsresult;
use nsstring::nsCString;
use thin_vec::ThinVec;
use xpcom::interfaces::IEwsSimpleOperationListener;

use super::{SafeListener, SafeListenerWrapper};

pub type SafeEwsSimpleOperationListener = SafeListenerWrapper<IEwsSimpleOperationListener>;

impl SafeEwsSimpleOperationListener {
    /// Convert types and forward to [`IEwsSimpleOperationListener::OnOperationSuccess`].
    fn on_operation_success(
        &self,
        new_ids: ThinVec<nsCString>,
        use_legacy_fallback: bool,
    ) -> nsresult {
        // SAFETY: all types here are safe across the Rust/C++ boundary
        unsafe { self.0.OnOperationSuccess(&new_ids, use_legacy_fallback) }
    }
}

pub struct SimpleOperationSuccessArgs {
    new_ids: ThinVec<nsCString>,
    use_legacy_fallback: bool,
}

impl<I, S> From<(I, bool)> for SimpleOperationSuccessArgs
where
    I: IntoIterator<Item = S>,
    S: Into<nsCString>,
{
    fn from((ids, use_legacy_fallback): (I, bool)) -> Self {
        Self {
            new_ids: ids.into_iter().map(Into::into).collect(),
            use_legacy_fallback,
        }
    }
}

impl SafeListener for SafeEwsSimpleOperationListener {
    type OnSuccessArg = SimpleOperationSuccessArgs;
    type OnFailureArg = ();

    fn on_success(&self, args: SimpleOperationSuccessArgs) -> Result<(), nsresult> {
        self.on_operation_success(args.new_ids, args.use_legacy_fallback)
            .to_result()
    }
}
