# Auth over HTTP

> ⚠️ **Warning**: This is ONLY a proof of concept. It is NOT ready for production use. DO NOT USE THIS IN PRODUCTION.

This repo contains a proof of concept for HTTP Authentication for canisters. It showcases how to use [HTTP Message Signatures](https://www.rfc-editor.org/rfc/rfc9421.html) to authenticate requests to a canister.

## Advantages

Using HTTP Message Signatures instead of the custom authentication mechanism has the following advantages:

- Uses an IETF standard for authentication that does not require [setting custom fields in the request body](https://internetcomputer.org/docs/references/ic-interface-spec#authentication)
- Removes the need of [CBOR](https://internetcomputer.org/docs/references/ic-interface-spec#api-cbor) for encoding messages sent to and received from canisters. As a consequence:
  - Canisters can expose their API using their preferred standard (e.g. OpenAPI, gRPC, etc.)
  - Existing and widely adopted API standards (REST, GraphQL, etc.) can be used to interact with canisters, enabling popular tools and libraries to be used
  - Developing client and server side code is easy, as the requests and responses are standard HTTP requests and responses

## Try It Out

The todo app example is available on mainnet at https://a5eh2-zqaaa-aaaac-qad2a-cai.icp0.io/

### Components

Examples:

- [todo-app](./examples/todo-app/): A simple todo app. The backend canister exposes the API using REST.

Packages:

- [ic-http-auth](./packages/ic-http-auth/): The canister side library for verifying HTTP Message Signatures
- [http-auth-js](./packages/http-auth-js/): The client side library for sending signed HTTP requests to a canister
- [insomnia-plugin-ic-http-auth](./packages/insomnia-plugin-ic-http-auth/): An [Insomnia](https://insomnia.rest/) plugin for sending signed HTTP requests to a canister

### Prerequisites

Make sure you have the following installed:
- [pnpm](https://pnpm.io/)
- [dfx](https://internetcomputer.org/docs/building-apps/getting-started/install)
- [Rust](https://rust-lang.org/)

### Run It Locally

After cloning the repository, install the dependencies:

```shell
pnpm i
dfx deps pull
```

Then, start the local network:

```shell
dfx start --background --clean
```

Then, deploy the canisters:

```shell
dfx deps deploy
dfx deploy
```

In the output, you will see a URL similar to `http://<canister-id>.localhost:4943`. Open this URL in your browser to see the todo app running locally.

## Benchmarks

At the current state, the proof of concept verifies signatures of requests sent to the canister inside the canisters directly. Verifying canister signatures is

We use [Canbench](https://github.com/dfinity/canbench) to benchmark the performance of some functions of the [ic-http-auth](./packages/ic-http-auth/) package.

To run the benchmarks, first install the `canbench` CLI:

```shell
cargo install canbench
```

Then, run the benchmarks:

```shell
cd packages/ic-http-auth
canbench
```

The latest results can be found in the [canbench_results.yml](./packages/ic-http-auth/canbench_results.yml) file.

> Note: if you want to update the benchmarks results, you can run the benchmarks with the `--persist` flag:
>
> ```shell
> canbench --persist
> ```

## Contributing

Contributions are welcome! Please see the [contribution guide](./.github/CONTRIBUTING.md) for more information.

## License

This project is licensed under the [Apache-2.0](./LICENSE) license.
