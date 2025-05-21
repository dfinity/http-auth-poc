#!/bin/bash

# Install the insomnia plugin locally

# Check if INSOMNIA_PLUGINS_PATH is set
if [ -z "$INSOMNIA_PLUGINS_PATH" ]; then
  echo "INSOMNIA_PLUGINS_PATH is not set"
  exit 1
fi

PLUGIN_PATH="$INSOMNIA_PLUGINS_PATH/insomnia-plugin-ic-http-auth"

echo "Installing plugin at $PLUGIN_PATH"

# Remove the plugin if it already exists
rm -rf "$PLUGIN_PATH"

# Create directories if they don't exist
mkdir -p "$PLUGIN_PATH/dist"

# Copy plugin files
cp -r ./dist "$PLUGIN_PATH/"
cp ./package.json "$PLUGIN_PATH/"

echo "Plugin installed at $PLUGIN_PATH"
