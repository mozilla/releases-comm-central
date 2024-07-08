/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::cell::{OnceCell, RefCell};
use std::ffi::CString;
use std::os::raw::{c_char, c_void};
use std::ptr;

use ews::{Mailbox, Recipient};
use thin_vec::ThinVec;

use cstr::cstr;
use nserror::nsresult;
use nserror::NS_OK;
use nsstring::{nsACString, nsCString, nsString};
use url::Url;
use xpcom::{create_instance, get_service, getter_addrefs, nsIID};
use xpcom::{
    interfaces::{
        msgIAddressObject, msgIOAuth2Module, nsIFile, nsIFileInputStream, nsIIOService,
        nsIMsgIdentity, nsIMsgStatusFeedback, nsIMsgWindow, nsIPrefBranch, nsIPrefService,
        nsIRequestObserver, nsIURI, nsIUrlListener, nsMsgAuthMethodValue, nsMsgSocketType,
        nsMsgSocketTypeValue,
    },
    xpcom_method, RefPtr,
};

use crate::authentication::credentials::AuthenticationProvider;
use crate::client::XpComEwsClient;

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
        let value = match value {
            PrefName::Key => "key",
            PrefName::Uid => "uid",
            PrefName::Description => "description",
            PrefName::Username => "username",
            PrefName::AuthMethod => "auth_method",
            PrefName::EwsUrl => "ews_url",
        };

        cstr!(value).into()
    }
}

#[no_mangle]
pub unsafe extern "C" fn nsEwsOutgoingServerConstructor(
    iid: &nsIID,
    result: *mut *mut c_void,
) -> nsresult {
    let instance = EwsOutgoingServer::new();
    instance.QueryInterface(iid, result)
}

#[xpcom::xpcom(implement(nsIMsgOutgoingServer, nsIEwsServer), atomic)]
pub struct EwsOutgoingServer {
    key: OnceCell<nsCString>,
    uid: OnceCell<nsCString>,
    description: RefCell<Option<nsCString>>,
    username: RefCell<Option<nsCString>>,
    password: RefCell<Option<nsCString>>,
    auth_method: RefCell<Option<nsMsgAuthMethodValue>>,
    ews_url: OnceCell<Url>,
    pref_branch: OnceCell<RefPtr<nsIPrefBranch>>,
}

impl EwsOutgoingServer {
    pub fn new() -> RefPtr<Self> {
        EwsOutgoingServer::allocate(InitEwsOutgoingServer {
            key: Default::default(),
            uid: Default::default(),
            description: Default::default(),
            username: Default::default(),
            password: Default::default(),
            auth_method: Default::default(),
            ews_url: Default::default(),
            pref_branch: Default::default(),
        })
    }

    /// Retrieves the pref branch for this server, or initializes it if it isn't
    /// already.
    ///
    /// The root to use for looking up the pref branch needs to include the
    /// server's key, so this function will error with
    /// [`NS_ERROR_NOT_INITIALIZED`] if the key isn't set yet.
    ///
    /// [`nserror::NS_ERROR_NOT_INITIALIZED`]: nserror::NS_ERROR_NOT_INITIALIZED
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
            return Ok(value.clone());
        }

        if let Some(value) = self.read_int_pref(pref_name)? {
            field.replace(Some(value.clone()));
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
                let uid = self
                    .read_string_pref(PrefName::Uid)?
                    .ok_or(nserror::NS_ERROR_NOT_INITIALIZED)?;

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
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    xpcom_method!(set_password => SetPassword(password: *const nsACString));
    fn set_password(&self, password: &nsACString) -> Result<(), nsresult> {
        self.password.replace(Some(password.into()));
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
        let url = self.ews_url()?;
        let url = nsCString::from(url.as_str());

        let io_service =
            xpcom::get_service::<nsIIOService>(cstr!("@mozilla.org/network/io-service;1"))
                .ok_or(nserror::NS_ERROR_FAILURE)?;

        getter_addrefs(|p| unsafe { io_service.NewURI(&*url, ptr::null(), ptr::null(), p) })
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
        self.password.replace(None);
        Ok(())
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
        aObserver: *const nsIRequestObserver
    ));
    fn send_mail(
        &self,
        file_path: &nsIFile,
        _recipients: &ThinVec<Option<RefPtr<msgIAddressObject>>>,
        bcc_recipients: &ThinVec<Option<RefPtr<msgIAddressObject>>>,
        _sender_identity: &nsIMsgIdentity,
        _sender: &nsACString,
        _password: &nsACString,
        _status_listener: &nsIMsgStatusFeedback,
        should_request_dsn: bool,
        message_id: &nsACString,
        observer: &nsIRequestObserver,
    ) -> Result<(), nsresult> {
        let message_content = read_file(file_path)?;
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
                    email_address: address.to_string(),
                    ..Default::default()
                };

                Ok(Recipient { mailbox })
            })
            .collect::<Result<Vec<Recipient>, nsresult>>()?;

        let url = self.ews_url()?;
        let credentials = self.get_credentials()?;

        // Set up the client to build and send the request.
        let client = XpComEwsClient {
            endpoint: url,
            credentials,
            client: moz_http::Client::new(),
        };

        // Send the request asynchronously.
        moz_task::spawn_local(
            "send_mail",
            client.send_message(
                message_content,
                message_id.to_utf8().into(),
                should_request_dsn,
                bcc_recipients,
                RefPtr::new(observer),
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
        _prompt_string: *const nsACString,
        _prompt_title: *const nsACString,
    ) -> Result<nsACString, nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
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
        let url = ews_url.to_string();
        let url = Url::parse(&url.as_str()).or(Err(nserror::NS_ERROR_FAILURE))?;

        self.ews_url
            .set(url)
            .or(Err(nserror::NS_ERROR_ALREADY_INITIALIZED))?;

        self.store_string_pref(PrefName::EwsUrl, ews_url)
    }
}

// Make it possible to create an Auth from this server's attributes.
impl AuthenticationProvider for &EwsOutgoingServer {
    fn username(&self) -> Result<nsCString, nsresult> {
        self.string_pref_getter(&self.username, PrefName::Username, FieldType::Required)
    }

    fn password(&self) -> Result<nsCString, nsresult> {
        Err(nserror::NS_ERROR_NOT_IMPLEMENTED)
    }

    fn auth_method(&self) -> Result<nsMsgAuthMethodValue, nsresult> {
        self.int_pref_getter(&self.auth_method, PrefName::AuthMethod, FieldType::Required)
    }

    fn oauth2_module(&self) -> Result<Option<RefPtr<msgIOAuth2Module>>, nsresult> {
        let oauth2_module =
            create_instance::<msgIOAuth2Module>(c"@mozilla.org/mail/oauth2-module;1").ok_or(
                Err::<RefPtr<msgIOAuth2Module>, _>(nserror::NS_ERROR_FAILURE),
            )?;

        let mut oauth2_supported = false;
        unsafe { oauth2_module.InitFromOutgoing(self.coerce(), &mut oauth2_supported) }
            .to_result()?;

        Ok(oauth2_supported.then_some(oauth2_module))
    }
}

/// Open the file provided and read its content into a vector of bytes.
fn read_file(file: &nsIFile) -> Result<Vec<u8>, nsresult> {
    let file_stream =
        create_instance::<nsIFileInputStream>(cstr!("@mozilla.org/network/file-input-stream;1"))
            .ok_or(nserror::NS_ERROR_FAILURE)?;

    // Open a stream from the file, and figure out how many bytes can be read
    // from it.
    let mut bytes_available = 0;
    unsafe {
        file_stream
            .Init(file, -1, -1, nsIFileInputStream::CLOSE_ON_EOF)
            .to_result()?;

        file_stream.Available(&mut bytes_available)
    }
    .to_result()?;

    // `nsIInputStream::Available` reads into a u64, but `nsIInputStream::Read`
    // takes a u32.
    let bytes_available = <u32>::try_from(bytes_available).or(Err(nserror::NS_ERROR_FAILURE))?;

    let mut read_sink: Vec<u8> =
        vec![0; <usize>::try_from(bytes_available).or(Err(nserror::NS_ERROR_FAILURE))?];

    // The amount of bytes actually read from the stream.
    let mut bytes_read: u32 = 0;

    // SAFETY: The call contract from `nsIInputStream::Read` guarantees that the
    // bytes written into the provided buffer is of type c_char (char* in
    // C-land) and is contiguous for the length it writes in `bytes_read`; and
    // that `bytes_read` is not greater than `bytes_available`.
    unsafe {
        let read_ptr = read_sink.as_mut_ptr();

        file_stream
            .Read(read_ptr as *mut c_char, bytes_available, &mut bytes_read)
            .to_result()?;
    };

    let bytes_read = <usize>::try_from(bytes_read).or(Err(nserror::NS_ERROR_FAILURE))?;
    Ok(Vec::from(&read_sink[..bytes_read]))
}
