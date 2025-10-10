use candid::Principal;
use ic_canister_sig_creation::{
    CanisterSigPublicKey, DELEGATION_SIG_DOMAIN, delegation_signature_msg,
};
use serde::{Deserialize, Serialize};

use crate::{base64::base64_decode, root_key::extract_raw_root_pk_from_der};

/// Verifies the validity of the given signed delegation chain wrt. the challenge, and the other parameters.
/// Specifically:
///  * `signed_delegation_chain` contains exactly one delegation, denoted below as `delegations[0]`
///  * `delegations[0].pubkey` equals `challenge` (i.e. challenge is the "session key")
///  * `signed_delegation_chain.publicKey` is a public key for canister signatures of `ii_canister_id`
///  * `current_time_ns` denotes point in time before `delegations[0].expiration`
///  *  TODO: `current_time_ns` denotes point in time that is not more than 5min after signature creation time
///     (as specified in the certified tree of the Certificate embedded in the signature)
///  * `delegations[0].signature` is a valid canister signature on a representation-independent hash of `delegations[0]`,
///    wrt. `signed_delegation_chain.publicKey` and `ic_root_public_key_raw`
///
/// On success returns textual representation of the self-authenticating Principal determined by
/// public key `signed_delegation_chain.publicKey` (which identifies the user).
pub(crate) fn validate_delegation_and_get_principal(
    delegation_chain: &DelegationChain,
    // current_time_ns: u64,
    ii_canister_id: &str, // textural representation of the principal
    ic_root_public_key_raw: &[u8],
) -> Result<Principal, String> {
    // Signed delegation chain contains exactly one delegation.

    if delegation_chain.delegations.len() != 1 {
        return Err("Expected exactly one signed delegation".to_string());
    }

    // `delegation[0].pubkey` equals `challenge`
    let signed_delegation = &delegation_chain.delegations[0];
    let delegation_sig = base64_decode(&signed_delegation.sig).unwrap();
    let delegation_pub_key = base64_decode(&signed_delegation.delegation.pub_key).unwrap();

    let pub_key = base64_decode(&delegation_chain.pub_key).unwrap();
    // `signed_delegation_chain.publicKey` is a public key for canister signatures of `ii_canister_id`
    let cs_pk = CanisterSigPublicKey::try_from(pub_key.as_slice())
        .map_err(|e| format!("Invalid publicKey in delegation chain: {}", e))?;
    let expected_ii_canister_id = Principal::from_text(ii_canister_id)
        .map_err(|e| format!("Invalid ii_canister_id: {}", e))?;
    if cs_pk.canister_id != expected_ii_canister_id {
        return Err(format!(
            "Delegation's signing canister {} does not match II canister id {}",
            cs_pk.canister_id, expected_ii_canister_id
        ));
    }

    // `current_time_ns` denotes point in time before `delegations[0].expiration`
    // if signed_delegation.delegation.expiration() < current_time_ns {
    //     return Err(format!("delegation expired at {}", signed_delegation.delegation.expiration()));
    // };

    // `current_time_ns` denotes point in time that is not more than 5min after signature creation time
    // (as specified in the certified tree of the Certificate embedded in the signature)
    // TODO

    // `delegations[0].signature` is a valid canister signature on a representation-independent hash of `delegations[0]`,
    //  wrt. `signed_delegation_chain.publicKey` and `ic_root_public_key_raw`.

    let message = msg_with_domain(
        DELEGATION_SIG_DOMAIN,
        &delegation_signature_msg(
            delegation_pub_key.as_slice(),
            signed_delegation.delegation.expiration(),
            signed_delegation.delegation.targets.as_ref(),
        ),
    );
    let ic_root_public_key = extract_raw_root_pk_from_der(ic_root_public_key_raw)?;
    ic_signature_verification::verify_canister_sig(
        message.as_slice(),
        delegation_sig.as_slice(),
        &cs_pk.to_der(),
        ic_root_public_key,
    )
    .map_err(|e| format!("Invalid canister signature: {}", e))?;

    Ok(Principal::self_authenticating(pub_key))
}

fn msg_with_domain(sep: &[u8], bytes: &[u8]) -> Vec<u8> {
    let mut msg = vec![sep.len() as u8];
    msg.append(&mut sep.to_vec());
    msg.append(&mut bytes.to_vec());
    msg
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DelegationChain {
    #[serde(rename = "pubKey")]
    pub pub_key: String,
    pub delegations: Vec<SignedDelegation>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SignedDelegation {
    delegation: Delegation,
    sig: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Delegation {
    #[serde(rename = "pubKey")]
    pub pub_key: String,
    pub expiration: String,
    pub targets: Option<Vec<Vec<u8>>>,
}

impl Delegation {
    fn expiration(&self) -> u64 {
        self.expiration.parse::<u64>().unwrap()
    }
}
