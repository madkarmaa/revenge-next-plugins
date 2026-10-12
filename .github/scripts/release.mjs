import { appendFileSync, readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import semanticRelease from 'semantic-release';

export function releaseConfig(directory, id, stable) {
    return {
        branches: ['main', { name: 'dev', channel: 'dev', prerelease: 'dev' }],
        tagFormat: `${directory.slice('plugins/'.length)}@\${version}`,
        plugins: [
            ['./.github/scripts/plugin-release.mjs', { directory }],
            ...(stable
                ? [
                      [
                          '@semantic-release/git',
                          {
                              assets: [
                                  `${directory}/manifest.json`,
                                  'README.md'
                              ],
                              message:
                                  'chore(release): ${nextRelease.gitTag} [skip ci]\n\n${nextRelease.notes}'
                          }
                      ]
                  ]
                : []),
            [
                '@semantic-release/github',
                {
                    assets: [`build/release-artifacts/${id}@*.zip`],
                    successCommentCondition: false,
                    failCommentCondition: false,
                    releasedLabels: false
                }
            ]
        ]
    };
}

async function main() {
    const stable =
        process.env.GITHUB_REF === 'refs/heads/main' &&
        process.env.GITHUB_EVENT_NAME === 'workflow_dispatch';
    const prerelease =
        process.env.GITHUB_REF === 'refs/heads/dev' &&
        process.env.GITHUB_EVENT_NAME === 'push';

    if (!stable && !prerelease) {
        throw new Error(
            'Releases require a manual run on main or a push to dev.'
        );
    }

    let count = 0;
    for (const entry of readdirSync('plugins', { withFileTypes: true }).sort(
        (a, b) => a.name.localeCompare(b.name)
    )) {
        if (!entry.isDirectory()) continue;
        const directory = `plugins/${entry.name}`;
        let original;
        try {
            original = readFileSync(`${directory}/manifest.json`, 'utf8');
        } catch (error) {
            if (error.code === 'ENOENT') continue;
            throw error;
        }
        const { id } = JSON.parse(original);
        const result = await semanticRelease(
            releaseConfig(directory, id, stable),
            {
                env: { ...process.env, HUSKY: '0' }
            }
        );
        if (result?.nextRelease) count += 1;
    }

    if (process.env.GITHUB_OUTPUT) {
        appendFileSync(process.env.GITHUB_OUTPUT, `count=${count}\n`);
    }
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    await main();
}
