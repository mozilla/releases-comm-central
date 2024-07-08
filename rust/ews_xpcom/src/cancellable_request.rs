/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use nserror::{nsresult, NS_OK};
use nsstring::nsACString;
use xpcom::{
    interfaces::{nsILoadGroup, nsLoadFlags},
    xpcom_method, RefPtr,
};

/// A stub [`nsIRequest`] that only implementes the `Cancel` method. Currently
/// only used for sending.
///
/// This struct is to be expanded (to actually cancel outgoing requests) once
/// the code architecture for creating and sending request with backoff allows
/// for idiosyncratic semantics.
///
/// [`nsIRequest`]: xpcom::interfaces::nsIRequest
#[xpcom::xpcom(implement(nsIRequest), atomic)]
pub(crate) struct CancellableRequest {}

impl CancellableRequest {
    pub fn new() -> RefPtr<Self> {
        CancellableRequest::allocate(InitCancellableRequest {})
    }

    xpcom_method!(cancel => Cancel(aStatus: nsresult));
    fn cancel(&self, _status: nsresult) -> Result<(), nsresult> {
        log::error!("request cancellation is not currently fully implemented, only stubbed out");

        Ok(())
    }

    ///////////////////////////////////
    /// Rest of the nsIRequest impl ///
    ///////////////////////////////////

    #[allow(non_snake_case)]
    unsafe fn CancelWithReason(&self, _aStatus: nsresult, _aReason: *const nsACString) -> nsresult {
        return nserror::NS_ERROR_NOT_IMPLEMENTED;
    }

    #[allow(non_snake_case)]
    unsafe fn GetCanceledReason(&self, _aCanceledReason: *mut nsACString) -> nsresult {
        return nserror::NS_ERROR_NOT_IMPLEMENTED;
    }

    #[allow(non_snake_case)]
    unsafe fn GetLoadFlags(&self, _aLoadFlags: *mut nsLoadFlags) -> nsresult {
        return nserror::NS_ERROR_NOT_IMPLEMENTED;
    }

    #[allow(non_snake_case)]
    unsafe fn GetLoadGroup(&self, _aLoadGroup: *mut *const nsILoadGroup) -> nsresult {
        return nserror::NS_ERROR_NOT_IMPLEMENTED;
    }

    #[allow(non_snake_case)]
    unsafe fn GetName(&self, _aName: *mut nsACString) -> nsresult {
        return nserror::NS_ERROR_NOT_IMPLEMENTED;
    }

    #[allow(non_snake_case)]
    unsafe fn GetStatus(&self, _aStatus: *mut nsresult) -> nsresult {
        return nserror::NS_ERROR_NOT_IMPLEMENTED;
    }

    #[allow(non_snake_case)]
    unsafe fn GetTRRMode(&self, _retval: *mut u32) -> nsresult {
        return nserror::NS_ERROR_NOT_IMPLEMENTED;
    }

    #[allow(non_snake_case)]
    unsafe fn IsPending(&self, _retval: *mut bool) -> nsresult {
        return nserror::NS_ERROR_NOT_IMPLEMENTED;
    }

    #[allow(non_snake_case)]
    unsafe fn Resume(&self) -> nsresult {
        return nserror::NS_ERROR_NOT_IMPLEMENTED;
    }

    #[allow(non_snake_case)]
    unsafe fn SetCanceledReason(&self, _aCanceledReason: *const nsACString) -> nsresult {
        return nserror::NS_ERROR_NOT_IMPLEMENTED;
    }

    #[allow(non_snake_case)]
    unsafe fn SetLoadFlags(&self, _aLoadFlags: nsLoadFlags) -> nsresult {
        return nserror::NS_ERROR_NOT_IMPLEMENTED;
    }

    #[allow(non_snake_case)]
    unsafe fn SetLoadGroup(&self, _aLoadGroup: *const nsILoadGroup) -> nsresult {
        return nserror::NS_ERROR_NOT_IMPLEMENTED;
    }

    #[allow(non_snake_case)]
    unsafe fn SetTRRMode(&self, _mode: u32) -> nsresult {
        return nserror::NS_ERROR_NOT_IMPLEMENTED;
    }

    #[allow(non_snake_case)]
    unsafe fn Suspend(&self) -> nsresult {
        return nserror::NS_ERROR_NOT_IMPLEMENTED;
    }
}
