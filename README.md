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
