import html
import json
import re
import subprocess
from pathlib import Path
from urllib.parse import quote


START = "<!-- plugins:start -->"
END = "<!-- plugins:end -->"


def table_text(value):
    text = html.escape(" ".join(value.split()), quote=False)
    return re.sub(r"([\\`*_[\]|])", r"\\\1", text)


def plugin_table(root):
    plugins = []
    for manifest_path in sorted((root / "plugins").glob("*/manifest.json")):
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        for field in ("description", "author"):
            manifest.setdefault(field, "")
        for field in ("id", "name", "version", "description", "author"):
            if not isinstance(manifest.get(field), str):
                raise ValueError(f"{manifest_path}: {field} must be a string")
        plugins.append((manifest, manifest_path.parent.name))

    plugins.sort(key=lambda item: (item[0]["name"].casefold(), item[0]["id"]))
    lines = [
        "| Plugin | Version | Description | Authors |",
        "| --- | --- | --- | --- |",
    ]
    for manifest, folder in plugins:
        name = table_text(manifest["name"])
        version = table_text(manifest["version"])
        description = table_text(manifest["description"])
        author = table_text(manifest["author"])
        path = f"plugins/{quote(folder, safe='')}/"
        lines.append(f"| [{name}]({path}) | {version} | {description} | {author} |")
    formatted = subprocess.run(
        ["bun", "run", "prettier", "--parser", "markdown"],
        input="\n".join(lines) + "\n",
        cwd=root,
        capture_output=True,
        text=True,
        check=True,
    )
    return formatted.stdout.rstrip("\n")


def update_readme(root):
    path = root / "README.md"
    original = path.read_bytes().decode("utf-8")
    if original.count(START) != 1 or original.count(END) != 1:
        raise ValueError(
            "README.md must contain exactly one plugins:start and plugins:end marker"
        )
    start = original.index(START) + len(START)
    end = original.index(END)
    if start > end:
        raise ValueError("The plugins:start marker must precede plugins:end")

    newline = "\r\n" if "\r\n" in original else "\n"
    table = plugin_table(root).replace("\n", newline)
    updated = original[:start] + newline * 2 + table + newline * 2 + original[end:]
    if updated == original:
        return False
    path.write_bytes(updated.encode("utf-8"))
    return True


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[2]
    changed = update_readme(root)
    print(
        "Updated the README plugin list."
        if changed
        else "README plugin list is unchanged."
    )
