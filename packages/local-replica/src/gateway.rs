use std::sync::Arc;

use axum::{Router, body::Bytes, extract::Request};
use clap::Parser;
use http_body_util::Full;
use ic_gateway::{
    Cli,
    ic_bn_lib::{
        http::{ConnInfo, HyperClientLeastLoaded, ReqwestClient, dns::Resolver},
        ic_agent::agent::route_provider::RoundRobinRouteProvider,
        prometheus::Registry,
        reqwest::Url,
        tasks::TaskManager,
        utils::health_manager::HealthManager,
    },
    setup_router,
};
use tokio_util::sync::CancellationToken;
use tower::ServiceExt;
use tracing_core::LevelFilter;
use tracing_subscriber::{
    Registry as TracingRegistry, layer::SubscriberExt, reload, util::SubscriberInitExt,
};

pub enum IcUrl {
    Remote(Url),
    PocketIc(Url),
}

impl IcUrl {
    pub fn new_remote(url: Url) -> Self {
        IcUrl::Remote(url)
    }

    pub fn new_pocket_ic(url: Url) -> Self {
        IcUrl::PocketIc(url)
    }

    pub fn into_url(&self) -> &Url {
        match self {
            IcUrl::Remote(url) => url,
            IcUrl::PocketIc(url) => url,
        }
    }
}

pub async fn start_gateway(
    listen_ip_addr: &str,
    listen_port: u16,
    replica_url: &IcUrl,
    shutdown_token: CancellationToken,
) -> Result<
    (
        axum::routing::IntoMakeService<Router>,
        tokio::net::TcpListener,
    ),
    anyhow::Error,
> {
    let listen_addr = format!("{listen_ip_addr}:{listen_port}");

    let mut gateway_args = vec![
        "",
        "--domain",
        "localhost",
        "--domain",
        listen_ip_addr,
        "--domain-canister-id-from-query-params",
        "--domain-canister-id-from-referer",
        "--listen-plain",
        &listen_addr,
    ];

    match replica_url {
        IcUrl::Remote(url) => {
            gateway_args.push("--ic-use-discovery");
            gateway_args.push("--ic-url");
            gateway_args.push(url.as_str());
        }
        IcUrl::PocketIc(_) => {
            gateway_args.push("--ic-unsafe-root-key-fetch");
        }
    }

    let (router, tasks) = create_http_gateway_router(
        gateway_args,
        &replica_url.into_url(),
        shutdown_token.clone(),
    )
    .await?;

    tasks.start();

    let listener = create_http_gateway_listener(&listen_addr)
        .await
        .map_err(|e| {
            anyhow::anyhow!(
                "Failed to create HTTP gateway listener for address: {listen_addr}: {e}"
            )
        })?;

    Ok((router, listener))
}

async fn create_http_gateway_listener(addr: &str) -> Result<tokio::net::TcpListener, String> {
    tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| e.to_string())
}

async fn create_http_gateway_router(
    args: Vec<&str>,
    replica_url: &Url,
    shutdown_token: CancellationToken,
) -> Result<(axum::routing::IntoMakeService<Router>, TaskManager), anyhow::Error> {
    let (filter, reload_handle) = reload::Layer::new(LevelFilter::INFO);
    TracingRegistry::default()
        .with(filter)
        .with(tracing_subscriber::fmt::layer())
        .init();

    let mut tasks = TaskManager::new();
    let health_manager = Arc::new(HealthManager::default());
    let registry = Registry::new();

    let cli = Cli::parse_from(args);

    let (http_client, http_client_hyper) = http_clients(&registry)?;
    let route_provider = Arc::new(RoundRobinRouteProvider::new(vec![replica_url])?);

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
        shutdown_token,
        None, // No vector
        None, // No WAF layer
    )
    .await?;

    let router = Router::new()
        .fallback(|mut request: Request| async move {
            let conn_info = ConnInfo::default();
            request.extensions_mut().insert(Arc::new(conn_info));
            ic_gateway_router.oneshot(request).await
        })
        .into_make_service();

    Ok((router, tasks))
}

fn http_clients(
    registry: &Registry,
) -> Result<(Arc<ReqwestClient>, Arc<HyperClientLeastLoaded<Full<Bytes>>>), anyhow::Error> {
    let dns_resolver = Resolver::new(Default::default());
    let http_client = Arc::new(ReqwestClient::new(
        Default::default(),
        Some(dns_resolver.clone()),
    )?);
    let http_client_hyper = Arc::new(HyperClientLeastLoaded::new(
        Default::default(),
        dns_resolver,
        1,
        Some(registry),
    ));
    Ok((http_client, http_client_hyper))
}
