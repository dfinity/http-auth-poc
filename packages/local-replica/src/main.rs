use std::{path::PathBuf, sync::Arc};

use axum::{Router, extract::Request as AxumRequest};
use clap::Parser;
use ic_gateway::{
    Cli,
    ic_bn_lib::{
        http::{HyperClientLeastLoaded, ReqwestClient, dns::Resolver, server::ConnInfo},
        ic_agent::agent::route_provider::RoundRobinRouteProvider,
        tasks::TaskManager,
        utils::health_manager::HealthManager,
    },
    routing::setup_router,
};
use pocket_ic::{
    PocketIcBuilder,
    common::rest::{IcpFeatures, IcpFeaturesConfig},
};
use tokio_util::sync::CancellationToken;
use tower::ServiceExt;
use tracing_core::LevelFilter;
use tracing_subscriber::{Registry, layer::SubscriberExt, reload, util::SubscriberInitExt};

const PACKAGE_DIR: &str = env!("CARGO_MANIFEST_DIR");
const POCKET_IC_SERVER_BIN_PATH: &str = "bin/pocket-ic";

const LOCAL_REPLICA_HTTP_LISTEN_IP_ADDR: &str = "127.0.0.1";
const LOCAL_REPLICA_HTTP_LISTEN_PORT: u16 = 4943;

async fn create_http_gateway_listener(addr: &str) -> Result<tokio::net::TcpListener, String> {
    tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| e.to_string())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let local_replica_http_listen_addr =
        format!("{LOCAL_REPLICA_HTTP_LISTEN_IP_ADDR}:{LOCAL_REPLICA_HTTP_LISTEN_PORT}");

    // Initialize logging - create reload handle first without attaching layers
    let (filter, reload_handle) = reload::Layer::new(LevelFilter::INFO);
    Registry::default()
        .with(filter)
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Start PocketIC in a non-blocking task
    let pic_path = format!("{PACKAGE_DIR}/{POCKET_IC_SERVER_BIN_PATH}");
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
    let pic_url = pic.auto_progress().await;
    println!("PocketIC Server URL: {}", pic_url);

    // Parse CLI arguments with defaults for local development
    let args = vec![
        "",
        "--domain",
        "localhost",
        "--domain",
        "127.0.0.1",
        "--domain-canister-id-from-query-params",
        "--domain-canister-id-from-referer",
        "--ic-unsafe-root-key-fetch",
        "--listen-plain",
        &local_replica_http_listen_addr,
    ];
    let cli = Cli::parse_from(args);

    // Setup components
    let mut tasks = TaskManager::new();
    let health_manager = Arc::new(HealthManager::default());
    let registry = ic_gateway::ic_bn_lib::prometheus::Registry::new();

    // Create HTTP clients
    let dns_resolver = Resolver::new(Default::default());
    let http_client = Arc::new(ReqwestClient::new(
        Default::default(),
        Some(dns_resolver.clone()),
    )?);
    let http_client_hyper = Arc::new(HyperClientLeastLoaded::new(
        Default::default(),
        dns_resolver,
        1,
        Some(&registry),
    ));

    let route_provider = Arc::new(RoundRobinRouteProvider::new(vec![&pic_url])?);
    let shutdown_token = CancellationToken::new();

    // Setup router
    let ic_gateway_router = setup_router(
        &cli,
        vec![], // No custom domain providers
        reload_handle,
        &mut tasks,
        health_manager,
        http_client,
        http_client_hyper,
        route_provider,
        &registry,
        shutdown_token.clone(),
        None, // No vector
        None, // No WAF layer
    )
    .await?;

    let router = Router::new()
        .fallback(|mut request: AxumRequest| async move {
            let conn_info = ConnInfo::default();
            request.extensions_mut().insert(Arc::new(conn_info));
            ic_gateway_router.oneshot(request).await
        })
        .into_make_service();

    // Start background tasks
    tasks.start();

    // Bind and serve with connection info
    let listener = create_http_gateway_listener(&local_replica_http_listen_addr).await?;
    println!("Gateway running at: http://{local_replica_http_listen_addr}");
    println!("Press Ctrl+C to stop");

    // Setup graceful shutdown signal
    let shutdown_signal = async move {
        tokio::signal::ctrl_c().await.ok();
        println!("\nShutting down...");
        shutdown_token.cancel();
    };

    axum::serve(listener, router)
        .with_graceful_shutdown(shutdown_signal)
        .await?;

    Ok(())
}
