# Insomnia Plugin: IC HTTP Auth (POC)

This plugin automatically adds Internet Computer HTTP Message Signatures to outgoing requests in [Insomnia](https://insomnia.rest/).

It uses the [`@dfinity/http-auth`](../http-auth-js/) library to generate the signatures.

## Building the Plugin

```bash
pnpm build
```

The built plugin JS file will be located at `dist/main.js`.

## Configuring Insomnia

1. Open Insomnia.
2. Open the "Settings" menu in Insomnia and navigate to the "Plugins" tab.
3. Click "Reveal Plugins Folder". This will open a new file explorer window.
4. Copy the plugin folders path from the explorer window.
5. Run the following command in the directory containing the plugin source code:

```bash
INSOMNIA_PLUGINS_PATH="<path-to-plugin-folder>" pnpm publish-plugin
```

6. Go back to Insomnia and click on "Reload Plugins".

### Providing Identity

The plugin requires an identity (private key) to sign requests. You have two options:

1.  **Environment Variable (Recommended for specific identities):**

    - In your Insomnia environment (e.g., Base Environment), create a new environment variable named `identity`.
    - Set its value to the PEM-encoded ECDSA P-256 private key you want to use. You can generate one with:

    ```bash
    openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out private.pem
    ```

2.  **Automatic Generation (Default):**
    - If the `identity` environment variable is _not_ set, the plugin will automatically generate a new ECDSA P-256 key pair the first time it runs for a request.
    - This key pair is stored securely within Insomnia's plugin data storage and reused for subsequent requests.

## Usage

After [configuring the plugin](#configuring-insomnia), the plugin will automatically add the necessary headers to your requests.
