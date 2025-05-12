# Auth over HTTP

```shell
pnpm i
dfx deps pull
```

```shell
dfx start --background --clean
```

```shell
dfx deps deploy
./scripts/local_deploy.sh
```

```shell
pnpm start
```

## Benchmarks

We use [Canbench](https://github.com/dfinity/canbench) to benchmark the performance of the `validate_http_signature_headers` function from the [ic-http-auth](./packages/ic-http-auth/) package.

To run the benchmarks, first install the `canbench` CLI:

```shell
cargo install canbench
```

Then, run the benchmarks:

```shell
cd examples/todo-app/src/backend
canbench
```

The latest results can be found in the [canbench_results.yml](./examples/todo-app/src/backend/canbench_results.yml) file.
