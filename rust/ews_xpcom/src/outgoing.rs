/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::cell::{OnceCell, RefCell};
use std::ffi::CString;
use std::os::raw::c_void;

use ews::{Mailbox, Recipient};
use log::debug;
use thin_vec::ThinVec;

use cstr::cstr;
use nserror::{nsresult, NS_ERROR_UNEXPECTED, NS_OK};
use nsstring::{nsACString, nsCString, nsString};
use url::Url;
use uuid::Uuid;
use xpcom::{
    get_service, getter_addrefs,
    interfaces::{
        msgIAddressObject, msgIPasswordAuthModule, nsIFile, nsILoginInfo, nsILoginManager,
        nsIMsgIdentity, nsIMsgOutgoingListener, nsIMsgOutgoingServer, nsIMsgStatusFeedback,
        nsIMsgWindow, nsIPrefBranch, nsIPrefService, nsIURI, nsIUrlListener, nsMsgAuthMethodValue,
        nsMsgSocketType, nsMsgSocketTypeValue,
    },
    nsIID, xpcom_method, RefPtr,
};

use crate::client::XpComEwsClient;
use crate::safe_xpcom::{SafeMsgOutgoingListener, SafeUri};
use crate::xpcom_io;
use protocol_shared::authentication::credentials::AuthenticationProvider;

/// Whether a field is required to have a value (either in memory or in a pref)
/// upon access.
///
/// A required field is typically a field involved in gathering credentials for
/// authentication, in which case we want to error early rather than knowingly
/// use invalid data.
enum FieldType {
    Required,
    Optional,
}

/// The name of a pref used to store a value that's part of an EWS outgoing
/// server's configuration. It can be turned into a [`CString`] to be used with
/// methods from [`nsIPrefBranch`].
enum PrefName {
    Key,
    Uid,
    Description,
    Username,
    AuthMethod,
    EwsUrl,
}

impl From<PrefName> for CString {
    fn from(value: PrefName) -> Self {
        match value {
            PrefName::Key => cstr!("key"),
            PrefName::Uid => cstr!("uid"),
            PrefName::Description => cstr!("description"),
            PrefName::Username => cstr!("username"),
            PrefName::AuthMethod => cstr!("auth_method"),
            PrefName::EwsUrl => cstr!("ews_url"),
        }
        .into()
    }
}

#[no_mangle]
pub unsafe extern "C" fn nsEwsOutgoingServerConstructor(
    iid: &nsIID,
    result: *mut *mut c_void,
) -> nsresult {
    let instance = EwsOutgoingServer::new();

    match instance {
        Ok(instance) => instance.QueryInterface(iid, result),
        Err(rv) => rv,
    }
}

#[xpcom::xpcom(implement(nsIMsgOutgoingServer, nsIEwsServer), atomic)]
pub struct EwsOutgoingServer {
    key: OnceCell<nsCString>,
    uid: OnceCell<nsCString>,
    description: RefCell<Option<nsCString>>,
    username: RefCell<Option<nsCString>>,
    password_module: RefCell<RefPtr<msgIPasswordAuthModule>>,
    auth_method: RefCell<Option<nsMsgAuthMethodValue>>,
    ews_url: OnceCell<Url>,
    pref_branch: OnceCell<RefPtr<nsIPrefBranch>>,
}

#[allow(clippy::too_many_arguments)]
impl EwsOutgoingServer {
    pub fn new() -> Result<RefPtr<Self>, nsresult> {
        let password_module = xpcom::get_service::<msgIPasswordAuthModule>(
            c"@mozilla.org/mail/password-auth-module;1",
        )
        .ok_or(Err::<(), nsresult>(nserror::NS_ERROR_FAILURE))?;

        Ok(EwsOutgoingServer::allocate(InitEwsOutgoingServer {
            key: Default::default(),
            uid: Default::default(),
            description: Default::default(),
            username: Default::default(),
            password_module: RefCell::new(password_module),
            auth_method: Default::default(),
            ews_url: Default::default(),
            pref_branch: Default::default(),
        }))
    }

    /// Retrieves the pref branch for this server, or initializes it if it isn't
    /// already.
    ///
    /// The root to use for looking up the pref branch needs to include the
    /// server's key, so this function will error with
    /// [`NS_ERROR_NOT_INITIALIZED`] if the key isn't set yet.
    ///
    /// [`NS_ERROR_NOT_INITIALIZED`]: nserror::NS_ERROR_NOT_INITIALIZED
    fn pref_branch(&self) -> Result<RefPtr<nsIPrefBranch>, nsresult> {
        // In the future we should be able to do this with `get_or_try_init`,
        // once it has stabilized and we have a suitable MSRV.
        // https://github.com/rust-lang/rust/issues/109737
        let branch = match self.pref_branch.get() {
            Some(branch) => branch.clone(),
            None => {
                // Build the pref root from the key, if set. The root should be
                // in the format `mail.outgoingserver.ewsX.` - note the trailing
                // period.
                let key = self.key.get().ok_or(nserror::NS_ERROR_NOT_INITIALIZED)?;
                let pref_root = format!("mail.outgoingserver.{key}.");
                let pref_root = CString::new(pref_root).or(Err(nserror::NS_ERROR_FAILURE))?;

                // Retrieve the branch for our root from the pref service.
                let pref_svc =
                    get_service::<nsIPrefService>(cstr!("@mozilla.org/preferences-service;1"))
                        .ok_or(nserror::NS_ERROR_FAILURE)?;

                let pref_branch =
                    getter_addrefs(unsafe { |p| pref_svc.GetBranch(pref_root.as_ptr(), p) })?;

                // We don't need to check whether the return value is an error,
                // since this code only runs if the branch wasn't already set.
                _ = self.pref_branch.set(pref_branch.clone());

                pref_branch
            }
        };

        Ok(branch)
    }

    /// Reads a string value from a [`RefCell`]. If this failed, reads the value
    /// from the given pref, and set as the [`RefCell`]'s value, before
    /// returning it.
    ///
    /// If no value could be read for the pref, the [`RefCell`] is left
    /// unchanged. If the field is required to have a value upon access, the
    /// error [`NS_ERROR_NOT_INITIALIZED`] is returned; otherwise an empty
    /// string (i.e. the default value for a string pref) is returned.
    ///
    /// [`NS_ERROR_NOT_INITIALIZED`]: nserror::NS_ERROR_NOT_INITIALIZED
    fn string_pref_getter(
        &self,
        field: &RefCell<Option<nsCString>>,
        pref_name: PrefName,
        field_type: FieldType,
    ) -> Result<nsCString, nsresult> {
        if let Some(value) = field.borrow().as_ref() {
            return Ok(value.clone());
        }

        if let Some(value) = self.read_string_pref(pref_name)? {
            field.replace(Some(value.clone()));
            return Ok(value);
        }

        match field_type {
            FieldType::Required => Err(nserror::NS_ERROR_NOT_INITIALIZED),
            FieldType::Optional => Ok(nsCString::new()),
        }
    }

    /// Reads an integer value from a [`RefCell`]. If this failed, reads the
    /// value from the given pref, and set as the [`RefCell`]'s value, before
    /// returning it.
    ///
    /// If no value could be read for the pref, the [`RefCell`] is left
    /// unchanged. If the field is required to have a value upon access, the
    /// error [`NS_ERROR_NOT_INITIALIZED`] is returned; otherwise `0` (i.e. the
    /// default value for an integer pref) is returned.
    ///
    /// [`NS_ERROR_NOT_INITIALIZED`]: nserror::NS_ERROR_NOT_INITIALIZED
    fn int_pref_getter(
        &self,
        field: &RefCell<Option<i32>>,
        pref_name: PrefName,
        field_type: FieldType,
    ) -> Result<i32, nsresult> {
        if let Some(value) = field.borrow().as_ref() {
            return Ok(*value);
        }

        if let Some(value) = self.read_int_pref(pref_name)? {
            field.replace(Some(value));
            return Ok(value);
        }

        match field_type {
            FieldType::Required => Err(nserror::NS_ERROR_NOT_INITIALIZED),
            FieldType::Optional => Ok(0),
        }
    }

    /// Set the pref with the given name to the given string value, and store
    /// that value in the provided [`RefCell`].
    fn string_pref_setter(
        &self,
        field: &RefCell<Option<nsCString>>,
        pref_name: PrefName,
        value: &nsACString,
    ) -> Result<(), nsresult> {
        self.store_string_pref(pref_name, value)?;
        field.replace(Some(value.into()));

        Ok(())
    }

    /// Set the pref with the given name to the given integer value, and store
    /// that value in the provided [`RefCell`].
    fn int_pref_setter(
        &self,
        field: &RefCell<Option<i32>>,
        pref_name: PrefName,
        value: i32,
    ) -> Result<(), nsresult> {
        let branch = self.pref_branch()?;
        let pref_name: CString = pref_name.into();
        unsafe { branch.SetIntPref(pref_name.as_ptr(), value) }.to_result()?;

        field.replace(Some(value));

        Ok(())
    }

    /// Reads the value for a string pref with the given name.
    ///
    /// If no pref is set with this name, `None` is returned.
    fn read_string_pref(&self, pref_name: PrefName) -> Result<Option<nsCString>, nsresult> {
        let branch = self.pref_branch()?;
        let pref_name: CString = pref_name.into();

        // Note: the documentation of `GetCharPref` mentions that it only reads
        // ASCII values. However, this is only relevant for JS, where the
        // method's return type (`ACString`) dictates that each byte is
        // interpreted as latin1 characters. For native code (including Rust),
        // we just get a string made from raw bytes read from the prefs file, so
        // we don't need to worry about the encoding as long as we got it right
        // when storing the value.
        let mut value = nsCString::new();
        match unsafe { branch.GetCharPref(pref_name.as_ptr(), &mut *value) }.to_result() {
            Ok(_) => (),
            Err(rv) => match rv {
                // `GetCharPref` returns `NS_ERROR_UNEXPECTED` if the pref does
                // not have a value.
                nserror::NS_ERROR_UNEXPECTED => return Ok(None),
                _ => return Err(rv),
            },
        };

        Ok(Some(value))
    }

    /// Reads the value for an integer pref with the given name.
    ///
    /// If no pref is set with this name, `None` is returned.
    fn read_int_pref(&self, pref_name: PrefName) -> Result<Option<i32>, nsresult> {
        let branch = self.pref_branch()?;
        let pref_name: CString = pref_name.into();

        let mut value: i32 = 0;
        match unsafe { branch.GetIntPref(pref_name.as_ptr(), &mut value) }.to_result() {
            Ok(_) => (),
            Err(rv) => match rv {
                // `GetIntPref` returns `NS_ERROR_UNEXPECTED` if the pref does
                // not have a value.
                nserror::NS_ERROR_UNEXPECTED => return Ok(None),
                _ => return Err(rv),
            },
        };

        Ok(Some(value))
    }

    /// Set the given pref with the provided string value.
    fn store_string_pref(&self, pref_name: PrefName, value: &nsACString) -> Result<(), nsresult> {
        let branch = self.pref_branch()?;

        let pref_name: CString = pref_name.into();
        unsafe { branch.SetStringPref(pref_name.as_ptr(), value) }.to_result()
    }

    /// Retrieves the parsed EWS URL.
    ///
    /// If no copy of the URL can be read from memory, the URL is read from the
    /// related pref and parsed.
    ///
    /// If no value could be read from prefs, errors with
    /// [`NS_ERROR_NOT_INITIALIZED`].
    ///
    /// [`NS_ERROR_NOT_INITIALIZED`]: nserror::NS_ERROR_NOT_INITIALIZED
    fn ews_url(&self) -> Result<Url, nsresult> {
        let url = match self.ews_url.get() {
            Some(url) => url.clone(),
            None => {
                let url = self
                    .read_string_pref(PrefName::EwsUrl)?
                    .ok_or(nserror::NS_ERROR_NOT_INITIALIZED)?
                    .to_string();

                let url = Url::parse(url.as_str()).or(Err(nserror::NS_ERROR_FAILURE))?;

                // We don't need to check whether the return value is an error,
                // since this code only runs if the URL wasn't already set.
                _ = self.ews_url.set(url.clone());

                url
            }
        };

        Ok(url)
    }

    ///////////////////////////////////////////////////////////
    // Getters / setters for nsIMsgOutgoingServer attributes //
    ///////////////////////////////////////////////////////////

    // Key
    xpcom_method!(key => GetKey() -> nsACString);
    fn key(&self) -> Result<nsCString, nsresult> {
        // Try to get the server's key from memory, or read it from prefs (and
        // set it) if it hasn't been set yet. In the future we should be able to
        // do this with `get_or_try_init`, once it has stabilized and we have a
        // suitable MSRV.
        // https://github.com/rust-lang/rust/issues/109737
        let key = self.key.get();

        let key = match key {
            Some(key) => key.clone(),
            None => {
                let key = self
                    .read_string_pref(PrefName::Key)?
                    .ok_or(nserror::NS_ERROR_NOT_INITIALIZED)?;

                // We don't need to check whether the return value is an error,
                // since this code only runs if the key wasn't already set.
                _ = self.key.set(key.clone());

                key
            }
        };

        Ok(key)
    }

    xpcom_method!(set_key => SetKey(key: *const nsACString));
    fn set_key(&self, key: &nsACString) -> Result<(), nsresult> {
        self.key
            .set(key.into())
            .or(Err(nserror::NS_ERROR_ALREADY_INITIALIZED))?;

        self.store_string_pref(PrefName::Key, key)
    }

    // UID
    xpcom_method!(uid => GetUID() -> nsACString);
    fn uid(&self) -> Result<nsCString, nsresult> {
        // Try to get the UID from memory, or read it from prefs (and set it) if
        // it hasn't been set yet. In the future we should be able to do this
        // with `get_or_try_init`, once it has stabilized and we have a suitable
        // MSRV.
        // https://github.com/rust-lang/rust/issues/109737
        let uid = self.uid.get();

        let uid = match uid {
            Some(uid) => uid.clone(),
            None => {
                let uid = match self.read_string_pref(PrefName::Uid)? {
                    Some(uid) => uid,
                    None => {
                        // If no UID has been generated for this server yet,
                        // generate one and store it to the server's prefs, then
                        // return it.
                        let uid = Uuid::new_v4().hyphenated().to_string();
                        let uid = nsCString::from(uid);
                        self.store_string_pref(PrefName::Uid, &uid)?;
                        uid
                    }
                };

                // We don't need to check whether the return value is an error,
                // since this code only runs if the UID wasn't already set.
                _ = self.uid.set(uid.clone());

                uid
            }
        };

        Ok(uid)
    }

    xpcom_method!(set_uid => SetUID(uid: *const nsACString));
    fn set_uid(&self, uid: &nsACString) -> Result<(), nsresult> {
        self.uid
            .set(uid.into())
            .or(Err(nserror::NS_ERROR_ALREADY_INITIALIZED))?;

        self.store_string_pref(PrefName::Uid, uid)
    }

    // Type
    xpcom_method!(server_type => GetType() -> nsACString);
    fn server_type(&self) -> Result<nsCString, nsresult> {
        Ok(nsCString::from("ews"))
    }

    // Description
    xpcom_method!(description => GetDescription() -> nsACString);
    fn description(&self) -> Result<nsCString, nsresult> {
        self.string_pref_getter(
            &self.description,
            PrefName::Description,
            FieldType::Optional,
        )
    }

    xpcom_method!(set_description => SetDescription(description: *const nsACString));
    fn set_description(&self, description: &nsACString) -> Result<(), nsresult> {
        self.string_pref_setter(&self.description, PrefName::Description, description)
    }

    // Username
    xpcom_method!(username => GetUsername() -> nsACString);
    fn username(&self) -> Result<nsCString, nsresult> {
        self.string_pref_getter(&self.username, PrefName::Username, FieldType::Required)
    }

    xpcom_method!(set_username => SetUsername(username: *const nsACString));
    fn set_username(&self, username: &nsACString) -> Result<(), nsresult> {
        self.string_pref_setter(&self.username, PrefName::Username, username)
    }

    // Password
    xpcom_method!(password => GetPassword() -> nsACString);
    fn password(&self) -> Result<nsCString, nsresult> {
        // Check to see if the password auth module has cached the password.
        let mut cached_password = nsCString::new();
        unsafe {
            self.password_module
                .borrow()
                .GetCachedPassword(&mut *cached_password)
                .to_result()?;
        }
        if !cached_password.is_empty() {
            return Ok(cached_password);
        }

        // Otherwise, look it up in the login manager.
        let ews_url = self.ews_url()?;

        // The URI we use to store logins into the login manager uses the format
        // "protocol://hostname", so start by building one that matches.
        let login_uri = match ews_url.host() {
            Some(host) => nsString::from(format!("ews://{host}").as_str()),
            None => {
                log::error!("cannot get host from invalid EWS URI: {}", ews_url.as_str());
                return Err(nserror::NS_ERROR_FAILURE);
            }
        };

        // Get the login manager so we can look up the password for the account.
        let login_mgr = get_service::<nsILoginManager>(c"@mozilla.org/login-manager;1")
            .ok_or(nserror::NS_ERROR_FAILURE)?;

        // Get every logins for the current server. An array of references is
        // represented over XPCOM as a `ThinVec<Option<RefPtr<_>>>`, with `None`
        // representing a null pointer.
        let mut logins: ThinVec<Option<RefPtr<nsILoginInfo>>> = ThinVec::new();
        unsafe { login_mgr.FindLogins(&*login_uri, &*nsString::new(), &*login_uri, &mut logins) }
            .to_result()?;

        // Try to identify logins that match the account's username.
        let server_username = self.username()?;
        let logins = logins
            .into_iter()
            // Filter out empty options.
            .flatten()
            // Filter out logins that don't match the correct username.
            .filter(|login| {
                let mut username = nsString::new();
                let status = unsafe { login.GetUsername(&mut *username) };
                status.succeeded() && username.to_string() == server_username.to_string()
            })
            .collect::<Vec<_>>();

        // If we got at least one match, use the first one.
        let password = if let Some(login) = logins.first() {
            let mut password = nsString::new();
            unsafe { login.GetPassword(&mut *password) }.to_result()?;
            password
        } else {
            // It looks like `nsMsgIncomingServer`'s implementation is to return
            // an empty string if it cannot find a matching login, so let's
            // match this behaviour for consistency.
            nsString::new()
        };

        let password = nsCString::from(password.to_string());
        Ok(password)
    }

    xpcom_method!(set_password => SetPassword(password: *const nsACString));
    fn set_password(&self, password: &nsACString) -> Result<(), nsresult> {
        unsafe { self.password_module.borrow().SetCachedPassword(&*password) };
        Ok(())
    }

    // Display name
    xpcom_method!(display_name => GetDisplayname() -> nsACString);
    fn display_name(&self) -> Result<nsCString, nsresult> {
        let ews_url = self.ews_url()?;
        let hostname = ews_url
            .host_str()
            .ok_or(nserror::NS_ERROR_NOT_INITIALIZED)?;
        Ok(nsCString::from(hostname))
    }

    // Auth method
    xpcom_method!(auth_method => GetAuthMethod() -> nsMsgAuthMethodValue);
    fn auth_method(&self) -> Result<nsMsgAuthMethodValue, nsresult> {
        self.int_pref_getter(&self.auth_method, PrefName::AuthMethod, FieldType::Required)
    }

    xpcom_method!(set_auth_method => SetAuthMethod(auth_method: nsMsgAuthMethodValue));
    fn set_auth_method(&self, auth_method: nsMsgAuthMethodValue) -> Result<(), nsresult> {
        self.int_pref_setter(&self.auth_method, PrefName::AuthMethod, auth_method)
    }

    // Socket Type
    xpcom_method!(socket_type => GetSocketType() -> nsMsgSocketTypeValue);
    fn socket_type(&self) -> Result<nsMsgSocketTypeValue, nsresult> {
        let ews_url = self.ews_url()?;
        let scheme = ews_url.scheme();

        match scheme {
            "https" => Ok(nsMsgSocketType::SSL),
            "http" => Ok(nsMsgSocketType::plain),
            _ => Err(nserror::NS_ERROR_UNKNOWN_PROTOCOL),
        }
    }

    xpcom_method!(set_socket_type => SetSocketType(socket_type: nsMsgSocketTypeValue));
    fn set_socket_type(&self, _socket_type: nsMsgSocketTypeValue) -> Result<(), nsresult> {
        log::error!("EwsOutgoingServer: tried calling SetSocketType, but the socket type can only be changed by changing the EWS URL");
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    // Server URI
    xpcom_method!(server_uri => GetServerURI() -> *const nsIURI);
    fn server_uri(&self) -> Result<RefPtr<nsIURI>, nsresult> {
        self.safe_server_uri().map(|uri| uri.into())
    }

    fn safe_server_uri(&self) -> Result<SafeUri, nsresult> {
        let url = self.ews_url()?;
        SafeUri::new(url.as_str())
    }

    // Maximum number of connections
    xpcom_method!(max_connections_number => GetMaximumConnectionsNumber() -> i32);
    fn max_connections_number(&self) -> Result<i32, nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(set_max_connections_number => SetMaximumConnectionsNumber(max_connections_number: i32));
    fn set_max_connections_number(&self, _max_connections_number: i32) -> Result<(), nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    //////////////////////////////////////
    // Methods for nsIMsgOutgoingServer //
    //////////////////////////////////////

    xpcom_method!(forget_password => ForgetPassword());
    fn forget_password(&self) -> Result<(), nsresult> {
        let username = self.username()?;
        let server_type = self.server_type()?;
        let ews_url = self.ews_url()?;
        let host = ews_url.host().map(|x| x);
        if let Some(host) = host {
            unsafe {
                self.password_module.borrow().ForgetPassword(
                    &*username,
                    &*nsCString::from(host.to_string()),
                    &*server_type,
                )
            };
            Ok(())
        } else {
            Err(NS_ERROR_UNEXPECTED)
        }
    }

    xpcom_method!(send_mail => SendMailMessage(
        aFilePath: *const nsIFile,
        aRecipients: *const ThinVec<Option<RefPtr<msgIAddressObject>>>,
        aBccRecipients: *const ThinVec<Option<RefPtr<msgIAddressObject>>>,
        aSenderIdentity: *const nsIMsgIdentity,
        aSender: *const nsACString,
        aPassword: *const nsACString,
        aStatusListener: *const nsIMsgStatusFeedback,
        aRequestDSN: bool,
        aMessageId: *const nsACString,
        aListener: *const nsIMsgOutgoingListener
    ));
    fn send_mail(
        &self,
        file_path: &nsIFile,
        _recipients: &ThinVec<Option<RefPtr<msgIAddressObject>>>,
        bcc_recipients: &ThinVec<Option<RefPtr<msgIAddressObject>>>,
        _sender_identity: &nsIMsgIdentity,
        _sender: &nsACString,
        _password: &nsACString,
        _status_listener: Option<&nsIMsgStatusFeedback>,
        should_request_dsn: bool,
        message_id: &nsACString,
        listener: &nsIMsgOutgoingListener,
    ) -> Result<(), nsresult> {
        let message_content = xpcom_io::read_file(file_path)?;
        let message_content =
            String::from_utf8(message_content).or(Err(nserror::NS_ERROR_FAILURE))?;

        // Turn each msgIAddressObject into an ews-rs `Recipient`.
        let bcc_recipients = bcc_recipients
            .iter()
            .map(|item| {
                // Filter out potential null pointers in the array.
                let addr_obj = item.as_ref().ok_or(nserror::NS_ERROR_NULL_POINTER)?;

                let mut address = nsString::new();
                let mut name = nsString::new();

                unsafe { addr_obj.GetEmail(&mut *address) }.to_result()?;
                unsafe { addr_obj.GetName(&mut *name) }.to_result()?;

                // The name is an optional part of the recipient, in which case,
                // the string we get across the XPCOM boundary will be empty.
                // However, ews-rs expects this optionality to be represented by
                // an `Option`.
                let name = if !name.is_empty() {
                    Some(name.to_string())
                } else {
                    None
                };

                let mailbox = Mailbox {
                    name,
                    email_address: Some(address.to_string()),
                    ..Default::default()
                };

                Ok(Recipient { mailbox })
            })
            .collect::<Result<Vec<Recipient>, nsresult>>()?;

        let url = self.ews_url()?;

        let outgoing_server = self
            .query_interface::<nsIMsgOutgoingServer>()
            .ok_or(nserror::NS_ERROR_UNEXPECTED)?;

        let credentials = outgoing_server.get_credentials()?;

        // Set up the client to build and send the request.
        let client = XpComEwsClient::new(url, outgoing_server, credentials)?;

        // Send the request asynchronously.
        moz_task::spawn_local(
            "send_mail",
            client.send_message(
                message_content,
                message_id.to_utf8().into(),
                should_request_dsn,
                bcc_recipients,
                SafeMsgOutgoingListener::new(listener),
                self.safe_server_uri()?,
            ),
        )
        .detach();

        Ok(())
    }

    xpcom_method!(close_cached_connections => CloseCachedConnections());
    fn close_cached_connections(&self) -> Result<(), nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(clear_all => ClearAllValues());
    fn clear_all(&self) -> Result<(), nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(get_password_with_ui => GetPasswordWithUI(
        promptString: *const nsACString,
        promptTitle: *const nsACString
    ) -> nsACString);
    fn get_password_with_ui(
        &self,
        prompt_string: *const nsACString,
        prompt_title: *const nsACString,
    ) -> Result<nsCString, nsresult> {
        let username = self.username()?;
        let server_type = self.server_type()?;
        let ews_url = self.ews_url()?;
        let host = ews_url.host().map(|x| x);
        if let Some(host) = host {
            let mut password = nsCString::new();
            unsafe {
                self.password_module.borrow().QueryPasswordFromUserAndCache(
                    &*username,
                    &*nsCString::from(host.to_string()),
                    &*server_type,
                    &*prompt_string,
                    &*prompt_title,
                    &mut *password,
                )
            };
            Ok(password)
        } else {
            Err(NS_ERROR_UNEXPECTED)
        }
    }

    xpcom_method!(verify_logon => VerifyLogon(
        aUrlListener: *const nsIUrlListener,
        aMsgWindow: *const nsIMsgWindow
    ) -> *const nsIURI);
    fn verify_logon(
        &self,
        _url_listener: &nsIUrlListener,
        _window: &nsIMsgWindow,
    ) -> Result<RefPtr<nsIURI>, nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    /////////////////////////////////
    // nsIEwsServer implementation //
    /////////////////////////////////

    xpcom_method!(initialize => Initialize(ews_url: *const nsACString));
    fn initialize(&self, ews_url: &nsACString) -> Result<(), nsresult> {
        debug!("Creating new outgoing server for {}", ews_url.to_string());
        let url = ews_url.to_string();
        let url = Url::parse(url.as_str()).or(Err(nserror::NS_ERROR_FAILURE))?;

        self.ews_url
            .set(url)
            .or(Err(nserror::NS_ERROR_ALREADY_INITIALIZED))?;

        self.store_string_pref(PrefName::EwsUrl, ews_url)
    }
}
