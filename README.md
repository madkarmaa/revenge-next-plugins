# Revenge Next plugins

My plugins for Revenge Next 😽

## Install

Add this repository in Revenge Next:

```text
https://revenge.madkarma.top/index.json
```

## Plugins

<!-- plugins:start -->

| Plugin                            | Version | Description                                            | Authors          |
| --------------------------------- | ------- | ------------------------------------------------------ | ---------------- |
| [Clean URLs](plugins/clean-urls/) | 1.0.0   | Removes tracking garbage from links sent and received. | nexpid, MadKarma |

<!-- plugins:end -->

## Development

Install dependencies and package Clean URLs:

```sh
bun install
./gradlew packageCleanUrls
```

The ZIP is written to `build/dist/`. To test it on a device, run `bun run serve` and add the server's repository URL in Revenge Next.

Check formatting and types:

```sh
bun run lint
bun run lint:types
```

Run `bun run format` to format files.

## License

[GPL-3.0](LICENSE).
