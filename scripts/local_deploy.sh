ROOT_KEY=$(
  dfx ping \
    | sed -n 's/.*"root_key": \[\(.*\)\].*/{\1}/p' \
    | sed 's/\([0-9][0-9]*\)/\1:nat8/g' \
    | sed 's/,/;/g'
)

ARGUMENT="(opt vec $ROOT_KEY)"
echo "Init argument: $ARGUMENT"

ARGUMENT_ENCODED=$(didc encode "$ARGUMENT" --types '(opt blob)')
echo "Init argument Candid-serialized and hex-encoded: $ARGUMENT_ENCODED"

dfx deploy todo_app_backend --argument "$ARGUMENT" --mode reinstall --yes
