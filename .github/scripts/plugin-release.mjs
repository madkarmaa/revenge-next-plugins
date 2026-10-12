import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { analyzeCommits as analyze } from '@semantic-release/commit-analyzer';
import { generateNotes as notes } from '@semantic-release/release-notes-generator';
import { format, resolveConfig } from 'prettier';

const changedFiles = new Map();

function pluginCommits(directory, { commits, cwd, env }) {
    return commits.filter((commit) => {
        if (
            /^chore\(release\):|\[(?:skip release|release skip|skip ci)\]/i.test(
                commit.message
            )
        ) {
            return false;
        }
        const key = `${cwd}:${commit.hash}`;
        if (!changedFiles.has(key)) {
            changedFiles.set(
                key,
                execFileSync(
                    'git',
                    [
                        'diff-tree',
                        '--root',
                        '--no-commit-id',
                        '--name-only',
                        '-r',
                        '--no-renames',
                        '-z',
                        commit.hash
                    ],
                    { cwd, env, encoding: 'utf8' }
                )
                    .split('\0')
                    .filter(Boolean)
            );
        }
        return changedFiles
            .get(key)
            .some(
                (file) =>
                    file.startsWith(`${directory}/`) ||
                    !file.startsWith('plugins/')
            );
    });
}

export function pluginVersion(version) {
    if (!/^\d+\.\d+\.\d+(?:-dev\.\d+)?$/.test(version)) {
        throw new Error(`Unsupported release version: ${version}`);
    }
    return version.replace(/-dev\.(\d+)$/, '-dev$1');
}

export async function analyzeCommits({ directory }, context) {
    const commits = pluginCommits(directory, context);
    if (!commits.length) return null;
    // Every changed plugin gets a release; Conventional Commits still select major/minor bumps.
    return (
        (await analyze(
            { preset: 'conventionalcommits' },
            { ...context, commits }
        )) || 'patch'
    );
}

export async function generateNotes({ directory }, context) {
    return notes(
        { preset: 'conventionalcommits' },
        { ...context, commits: pluginCommits(directory, context) }
    );
}

export async function prepare({ directory }, context) {
    const { cwd, env, branch, nextRelease } = context;
    const manifestPath = resolve(cwd, directory, 'manifest.json');
    const original = readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(original);
    manifest.version = pluginVersion(nextRelease.version);
    const run = (command, args) =>
        execFileSync(command, args, { cwd, env, stdio: 'inherit' });

    try {
        writeFileSync(
            manifestPath,
            await format(JSON.stringify(manifest), {
                ...(await resolveConfig(manifestPath)),
                filepath: manifestPath
            })
        );
        const task = basename(directory)
            .split(/[^A-Za-z0-9]/)
            .filter(Boolean)
            .map((part) => part[0].toUpperCase() + part.slice(1))
            .join('');
        run('./gradlew', ['--no-daemon', `package${task}`]);

        const file = `${manifest.id}@${manifest.version}.zip`;
        const artifactDirectory = resolve(cwd, 'build/release-artifacts');
        mkdirSync(artifactDirectory, { recursive: true });
        copyFileSync(
            resolve(cwd, 'build/dist', file),
            resolve(artifactDirectory, file)
        );

        const planDirectory = resolve(cwd, 'build/release-plans');
        mkdirSync(planDirectory, { recursive: true });
        writeFileSync(
            resolve(planDirectory, `${basename(directory)}.json`),
            JSON.stringify([
                {
                    id: manifest.id,
                    version: manifest.version,
                    zip: `build/release-artifacts/${file}`,
                    file
                }
            ])
        );
        if (branch.name === 'main')
            run('python3', ['.github/scripts/update-readme.py']);
    } finally {
        // Prerelease versions belong to the built ZIP, not the source branch.
        if (branch.name === 'dev') writeFileSync(manifestPath, original);
    }
}

export function publish({ directory }, { cwd, env }) {
    execFileSync('bash', ['.github/scripts/publish-pool.sh'], {
        cwd,
        env: {
            ...env,
            PLAN: resolve(
                cwd,
                'build/release-plans',
                `${basename(directory)}.json`
            )
        },
        stdio: 'inherit'
    });
}
