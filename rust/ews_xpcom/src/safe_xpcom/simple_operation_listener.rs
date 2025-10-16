/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use nserror::nsresult;
use nsstring::nsCString;
use thin_vec::ThinVec;
use xpcom::interfaces::IEwsSimpleOperationListener;

use crate::client::copy_move_operations::move_generic::CopyMoveSuccess;

use super::{SafeListener, SafeListenerWrapper};

/// See [`SafeListenerWrapper`].
pub(crate) type SafeEwsSimpleOperationListener = SafeListenerWrapper<IEwsSimpleOperationListener>;

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

/// Whether the operation requires some further "legacy" action because the server is too old to
/// support the "normal" way. What a legacy action/fallback does concretely depends on the specific
/// operation.
///
/// This is just a typed version of the `use_legacy_fallback` boolean argument in
/// [`IEwsSimpleOperationListener::OnOperationSuccess`] to make return types, etc., more legible.
pub enum UseLegacyFallback {
    No,
    Yes,
}

impl From<UseLegacyFallback> for bool {
    fn from(use_legacy_fallback: UseLegacyFallback) -> Self {
        match use_legacy_fallback {
            UseLegacyFallback::No => false,
            UseLegacyFallback::Yes => true,
        }
    }
}

impl From<bool> for UseLegacyFallback {
    fn from(use_legacy_fallback: bool) -> Self {
        match use_legacy_fallback {
            false => UseLegacyFallback::No,
            true => UseLegacyFallback::Yes,
        }
    }
}

pub struct SimpleOperationSuccessArgs {
    new_ids: ThinVec<nsCString>,
    use_legacy_fallback: UseLegacyFallback,
}

impl<I, S> From<(I, UseLegacyFallback)> for SimpleOperationSuccessArgs
where
    I: IntoIterator<Item = S>,
    S: Into<nsCString>,
{
    fn from((ids, use_legacy_fallback): (I, UseLegacyFallback)) -> Self {
        Self {
            new_ids: ids.into_iter().map(Into::into).collect(),
            use_legacy_fallback,
        }
    }
}

impl From<CopyMoveSuccess> for SimpleOperationSuccessArgs {
    fn from(
        CopyMoveSuccess {
            new_ids,
            requires_resync,
        }: CopyMoveSuccess,
    ) -> Self {
        (new_ids, requires_resync.into()).into()
    }
}

impl SafeListener for SafeEwsSimpleOperationListener {
    type OnSuccessArg = SimpleOperationSuccessArgs;
    type OnFailureArg = ();

    fn on_success(&self, args: SimpleOperationSuccessArgs) -> Result<(), nsresult> {
        self.on_operation_success(args.new_ids, args.use_legacy_fallback.into())
            .to_result()
    }
}
