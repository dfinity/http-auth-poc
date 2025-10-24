use std::path::PathBuf;

use ic_gateway::ic_bn_lib::reqwest::Url;
use pocket_ic::{
    PocketIcBuilder,
    common::rest::{IcpFeatures, IcpFeaturesConfig},
};

pub async fn start_pocket_ic(pic_path: &str) -> Url {
    let pic = PocketIcBuilder::new()
        .with_server_binary(PathBuf::from(pic_path))
        .with_application_subnet()
        .with_icp_features(IcpFeatures {
            registry: None,
            cycles_minting: Some(IcpFeaturesConfig::DefaultConfig),
            icp_token: None,
            cycles_token: Some(IcpFeaturesConfig::DefaultConfig),
            nns_governance: None,
            sns: None,
            ii: Some(IcpFeaturesConfig::DefaultConfig),
            nns_ui: None,
        })
        .build_async()
        .await;
    pic.auto_progress().await
}
