/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use proc_macro2::{Ident, TokenStream};
use quote::{ToTokens, TokenStreamExt, format_ident, quote};

use crate::naming::pascalize;

/// A Graph API enum, ready for converting to a stream of tokens via [`quote!`].
#[derive(Debug, Clone)]
pub struct GraphEnum {
    name: Ident,
    description: Option<TokenStream>,
    variants: Vec<Ident>,
}

impl GraphEnum {
    pub fn new(name: &str, description: Option<String>, variants: Vec<String>) -> Self {
        let name = format_ident!("{}", pascalize(name));
        let description = description.map(|doc| quote!(#[doc = #doc]));
        let variants = variants
            .into_iter()
            .map(|variant| format_ident!("{}", pascalize(&variant)))
            .collect();

        Self {
            name,
            description,
            variants,
        }
    }
}

impl ToTokens for GraphEnum {
    fn to_tokens(&self, tokens: &mut TokenStream) {
        let Self {
            name,
            description,
            variants,
        } = self;

        tokens.append_all(quote! {
            use serde::{Deserialize, Serialize};
            use strum::{Display, EnumString};

            #description
            #[derive(Copy, Clone, Debug, Display, EnumString, Serialize, Deserialize, PartialEq, Eq)]
            #[strum(serialize_all = "camelCase")]
            #[serde(rename_all = "camelCase")]
            pub enum #name {
                #(#variants),*
            }
        });
    }
}
