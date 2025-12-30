# Auth over HTTP

> [!WARNING]
> This is ONLY a proof of concept. It is NOT ready for production use. DO NOT USE THIS IN PRODUCTION.

This repo contains a proof of concept for HTTP Authentication for IC canisters. It showcases how to use the [Binary Representation of HTTP Messages](https://www.ietf.org/rfc/rfc9292.html) to send authenticated HTTP requests to a canister.

## Advantages

Using HTTP Authentication instead of the custom authentication mechanism has the following advantages:

- Uses an IETF standard for encoding HTTP messages that does not require [setting custom fields in the request body](https://internetcomputer.org/docs/references/ic-interface-spec#authentication)
- Removes the need of [CBOR](https://internetcomputer.org/docs/references/ic-interface-spec#api-cbor) for encoding messages sent to and received from canisters. As a consequence:
  - Canisters can expose their API using their preferred standard (e.g. OpenAPI, gRPC, etc.)
  - Existing and widely adopted API standards (REST, GraphQL, etc.) can be used to interact with canisters, enabling popular tools and libraries to be used
  - Developing client and server side code is easy, as the requests and responses are standard HTTP requests and responses

## Try It Out

The todo app example is available on mainnet at https://a7hps-myaaa-aaaau-acuna-cai.icp3.io/, behind an [HTTP Gateway](https://github.com/ilbertt/http-gateway) that follows the new protocol.

### Components

Examples:

- [todo-app](./examples/todo-app/): A simple todo app. The backend canister exposes the API using REST.

Packages:

- [ic-http](./packages/ic-http/): The canister side library for encoding and decoding HTTP messages
- [`@icp-sdk/http`](./packages/http-auth-js/): The client side library for sending signed HTTP requests to a canister
- [insomnia-plugin-ic-http-auth](./packages/insomnia-plugin-ic-http-auth/): An [Insomnia](https://insomnia.rest/) plugin for sending signed HTTP requests to a canister
- [local-replica](./packages/local-replica/): A binary that runs PocketIC and an HTTP Gateway locally

### Prerequisites

Make sure you have the following installed:
- [pnpm](https://pnpm.io/)
- [dfx](https://internetcomputer.org/docs/building-apps/getting-started/install)
- [Rust](https://rust-lang.org/)

### Run It Locally

After cloning the repository, install the dependencies:

```shell
pnpm i
```

Then, start the local network:

```shell
cargo run -p local-replica
```

Then, deploy the canisters:

```shell
dfx deploy
```

In the output, you will see a URL similar to `http://<canister-id>.localhost:4943`. Open this URL in your browser to see the todo app running locally.

> [!NOTE]
> Currently, the HTTP Gateway running locally does not support the old HTTP Protocol, so the Internet Identity frontend will not work locally. You can either disable authentication locally or use the app deployed on mainnet.

## Contributing

Contributions are welcome! Please see the [contribution guide](./.github/CONTRIBUTING.md) for more information.

## License

This project is licensed under the [Apache-2.0](./LICENSE) license.
