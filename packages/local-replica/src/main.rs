mod gateway;
mod pocket_ic;

use tokio_util::sync::CancellationToken;

use crate::{gateway::start_gateway, pocket_ic::start_pocket_ic};

const PACKAGE_DIR: &str = env!("CARGO_MANIFEST_DIR");
const POCKET_IC_SERVER_BIN_PATH: &str = "bin/pocket-ic";

const LOCAL_REPLICA_HTTP_LISTEN_IP_ADDR: &str = "127.0.0.1";
const LOCAL_REPLICA_HTTP_LISTEN_PORT: u16 = 4943;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let shutdown_token = CancellationToken::new();

    // Start PocketIC server
    let pic_path = format!("{PACKAGE_DIR}/{POCKET_IC_SERVER_BIN_PATH}");
    let pic_url = start_pocket_ic(&pic_path).await;
    println!("PocketIC Server URL: {}", pic_url);

    // Setup gateway
    let (router, listener) = start_gateway(
        LOCAL_REPLICA_HTTP_LISTEN_IP_ADDR,
        LOCAL_REPLICA_HTTP_LISTEN_PORT,
        &pic_url,
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
    };

    axum::serve(listener, router)
        .with_graceful_shutdown(shutdown_signal)
        .await?;

    Ok(())
}
