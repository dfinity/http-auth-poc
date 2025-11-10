mod gateway;
mod pocket_ic;

use clap::Parser;
use ic_gateway::ic_bn_lib::reqwest::Url;
use tokio_util::sync::CancellationToken;

use crate::{
    gateway::{IcUrl, start_gateway},
    pocket_ic::start_pocket_ic,
};

const PACKAGE_DIR: &str = env!("CARGO_MANIFEST_DIR");
const POCKET_IC_SERVER_BIN_PATH: &str = "bin/pocket-ic";

const LOCAL_REPLICA_HTTP_LISTEN_IP_ADDR: &str = "127.0.0.1";
const LOCAL_REPLICA_HTTP_LISTEN_PORT: u16 = 4943;

#[derive(Parser, Debug)]
#[command(name = "replica")]
#[command(about = "Local replica server with HTTP gateway", long_about = None)]
struct Args {
    /// Replica URL to use (if set to https://icp-api.io, PocketIC server won't be started)
    #[arg(long, value_name = "URL")]
    replica_url: Option<String>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = Args::parse();
    let shutdown_token = CancellationToken::new();

    // Determine replica URL and optionally start PocketIC server
    let (replica_url, pic_handle) = if let Some(url_str) = args.replica_url {
        // Use provided replica URL, don't start PocketIC
        let url = Url::parse(&url_str)?;
        println!("Using replica URL: {}", url_str);
        (IcUrl::new_remote(url), None)
    } else {
        // Start PocketIC server if no replica URL is provided
        let pic_path = format!("{PACKAGE_DIR}/{POCKET_IC_SERVER_BIN_PATH}");
        let (pic, pic_url) = start_pocket_ic(&pic_path).await;
        println!("PocketIC Server URL: {}", pic_url);
        (IcUrl::new_pocket_ic(pic_url), Some(pic))
    };

    // Setup gateway
    let (router, listener) = start_gateway(
        LOCAL_REPLICA_HTTP_LISTEN_IP_ADDR,
        LOCAL_REPLICA_HTTP_LISTEN_PORT,
        &replica_url,
        shutdown_token.clone(),
    )
    .await?;

    println!(
        "Gateway running at: http://{}",
        listener.local_addr().unwrap()
    );
    println!("Press Ctrl+C to stop");

    // Setup graceful shutdown signal
    let shutdown_signal = async move {
        tokio::signal::ctrl_c().await.ok();
        println!("\nShutting down...");
        shutdown_token.cancel();
        if let Some(pic) = pic_handle {
            pic.drop().await;
            println!("PocketIC server stopped");
        }
    };

    axum::serve(listener, router)
        .with_graceful_shutdown(shutdown_signal)
        .await?;

    Ok(())
}
