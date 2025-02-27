ROOT_KEY=$(
  dfx ping \
    | sed -n 's/.*"root_key": \[\(.*\)\].*/{\1}/p' \
    | sed 's/\([0-9][0-9]*\)/\1:nat8/g' \
    | sed 's/,/;/g'
)

dfx deploy todo_app_backend --argument '(opt vec '"$ROOT_KEY"')' --mode reinstall
