// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';

export type ReleaseReferenceIdentity = {
    schema_version: 1;
    base: string;
    generator: '@changesets/changelog-github';
    generator_version: '1.0.1';
    repo: string;
};
export type ReleaseReferenceExchange = { query: string; data: Record<string, unknown> };
export type ReleaseReferenceReceipt = ReleaseReferenceIdentity & {
    exchanges: ReleaseReferenceExchange[];
    sha256: string;
};
type Selector = { kind: 'commit' | 'pull'; value: string; alias: string };

/** Closed public reference assertions for the pinned official renderer; hashes are not signatures. */
export class ReleaseReferenceValidator {
    static readonly maximumBytes = 1_048_576;
    static readonly maximumExchanges = 32;
    static readonly commitFragment = `fragment CommitFragment on Commit {
  commitUrl
  associatedPullRequests(first: 50) {
    nodes {
      number
      url
      mergedAt
      author {
        login
        url
      }
    }
  }
  author {
    user {
      login
      url
    }
  }
}
`;
    static readonly pullFragment = `fragment PullFragment on PullRequest {
  url
  author {
    login
    url
  }
  mergeCommit {
    commitUrl
    abbreviatedOid
  }
}
`;

    identity(value: unknown): ReleaseReferenceIdentity {
        const item = this.object(value, [
            'schema_version',
            'base',
            'generator',
            'generator_version',
            'repo',
        ]);
        if (
            item.schema_version !== 1 ||
            typeof item.base !== 'string' ||
            !/^[a-f0-9]{40}$/u.test(item.base) ||
            item.generator !== '@changesets/changelog-github' ||
            item.generator_version !== '1.0.1' ||
            typeof item.repo !== 'string' ||
            !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(item.repo) ||
            item.repo.length > 200
        )
            this.invalid();
        return item as ReleaseReferenceIdentity;
    }

    seal(
        identity: ReleaseReferenceIdentity,
        exchanges: ReleaseReferenceExchange[],
    ): ReleaseReferenceReceipt {
        const payload = { ...this.identity(identity), exchanges };
        const sha256 = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
        return this.receipt({ ...payload, sha256 });
    }

    receipt(value: unknown): ReleaseReferenceReceipt {
        const item = this.object(value, [
            'schema_version',
            'base',
            'generator',
            'generator_version',
            'repo',
            'exchanges',
            'sha256',
        ]);
        const { exchanges, sha256, ...identity } = item;
        const validIdentity = this.identity(identity);
        if (
            !Array.isArray(exchanges) ||
            exchanges.length > ReleaseReferenceValidator.maximumExchanges
        )
            this.invalid();
        const seen = new Set<string>();
        const normalized = exchanges.map((exchange) => {
            const entry = this.object(exchange, ['query', 'data']);
            if (typeof entry.query !== 'string' || seen.has(entry.query)) this.invalid();
            seen.add(entry.query);
            return {
                query: entry.query,
                data: this.data(validIdentity.repo, entry.query, entry.data),
            };
        });
        const payload = { ...validIdentity, exchanges: normalized };
        if (
            typeof sha256 !== 'string' ||
            sha256 !== createHash('sha256').update(JSON.stringify(payload)).digest('hex') ||
            Buffer.byteLength(JSON.stringify({ ...payload, sha256 })) >
                ReleaseReferenceValidator.maximumBytes
        )
            this.invalid();
        return { ...payload, sha256 };
    }

    query(repo: string, query: string): Selector[] {
        if (query.length > 32_768) this.invalid();
        const [owner, name] = repo.split('/');
        const header = `query {\n  repo__0: repository(\n    owner: ${JSON.stringify(owner)},\n    name: ${JSON.stringify(name)}\n  ) {\n`;
        if (!query.startsWith(header)) this.invalid();
        let rest = query.slice(header.length);
        const selectors: Selector[] = [];
        while (!rest.startsWith('  }\n}\n')) {
            const match =
                /^(?:    commit__([a-f0-9]{7,40}): object\(expression: "([a-f0-9]{7,40})"\) \{\n      \.\.\. on Commit \{\n        \.\.\.CommitFragment\n      \}\n    \}\n|    pull__([1-9][0-9]{0,9}): pullRequest\(number: ([1-9][0-9]{0,9})\) \{\n      \.\.\.PullFragment\n    \}\n)/u.exec(
                    rest,
                );
            if (!match || selectors.length >= 50) this.invalid();
            const kind = match[1] ? 'commit' : 'pull';
            const value = match[1] ?? match[3];
            if (value !== (match[2] ?? match[4])) this.invalid();
            const alias = `${kind}__${value}`;
            if (selectors.some((selector) => selector.alias === alias)) this.invalid();
            selectors.push({ kind, value, alias });
            rest = rest.slice(match[0].length);
        }
        const fragments =
            (selectors.some(({ kind }) => kind === 'commit')
                ? ReleaseReferenceValidator.commitFragment
                : '') +
            (selectors.some(({ kind }) => kind === 'pull')
                ? ReleaseReferenceValidator.pullFragment
                : '');
        if (!selectors.length || rest !== `  }\n}\n${fragments}`) this.invalid();
        return selectors;
    }

    data(repo: string, query: string, value: unknown): Record<string, unknown> {
        const selectors = this.query(repo, query);
        const data = this.object(value, ['repo__0']);
        const repository = this.object(
            data.repo__0,
            selectors.map(({ alias }) => alias),
        );
        const normalized: Record<string, unknown> = {};
        for (const selector of selectors) {
            const entry = this.object(
                repository[selector.alias],
                selector.kind === 'commit'
                    ? ['commitUrl', 'associatedPullRequests', 'author']
                    : ['url', 'author', 'mergeCommit'],
            );
            if (selector.kind === 'commit') {
                this.commitUrl(repo, entry.commitUrl, selector.value);
                const pulls = this.object(entry.associatedPullRequests, ['nodes']);
                if (!Array.isArray(pulls.nodes) || pulls.nodes.length > 50) this.invalid();
                const nodes = pulls.nodes.map((node) => {
                    const pull = this.object(node, ['number', 'url', 'mergedAt', 'author']);
                    this.pullUrl(repo, pull.number, pull.url);
                    if (
                        pull.mergedAt !== null &&
                        (typeof pull.mergedAt !== 'string' ||
                            !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u.test(
                                pull.mergedAt,
                            ) ||
                            !Number.isFinite(Date.parse(pull.mergedAt)))
                    )
                        this.invalid();
                    return {
                        number: pull.number,
                        url: pull.url,
                        mergedAt: pull.mergedAt,
                        author: this.author(pull.author),
                    };
                });
                const author = entry.author === null ? null : this.object(entry.author, ['user']);
                normalized[selector.alias] = {
                    commitUrl: entry.commitUrl,
                    associatedPullRequests: { nodes },
                    author: author === null ? null : { user: this.author(author.user) },
                };
            } else {
                this.pullUrl(repo, Number(selector.value), entry.url);
                let mergeCommit = null;
                if (entry.mergeCommit !== null) {
                    const commit = this.object(entry.mergeCommit, ['commitUrl', 'abbreviatedOid']);
                    if (
                        typeof commit.abbreviatedOid !== 'string' ||
                        !/^[a-f0-9]{7,40}$/u.test(commit.abbreviatedOid)
                    )
                        this.invalid();
                    this.commitUrl(repo, commit.commitUrl, commit.abbreviatedOid);
                    mergeCommit = {
                        commitUrl: commit.commitUrl,
                        abbreviatedOid: commit.abbreviatedOid,
                    };
                }
                normalized[selector.alias] = {
                    url: entry.url,
                    author: this.author(entry.author),
                    mergeCommit,
                };
            }
        }
        return { repo__0: normalized };
    }

    providerData(repo: string, query: string, value: unknown): Record<string, unknown> {
        const response = this.object(value, ['data']);
        const data = this.object(response.data, ['repo__0']);
        const repository = this.object(data.repo__0, [
            'isPrivate',
            ...this.query(repo, query).map(({ alias }) => alias),
        ]);
        if (repository.isPrivate !== false)
            throw new Error('Release references require a public GitHub repository.');
        const { isPrivate: _visibility, ...references } = repository;
        return this.data(repo, query, { repo__0: references });
    }

    private author(value: unknown): { login: string; url: string } | null {
        if (value === null) return null;
        const author = this.object(value, ['login', 'url']);
        if (typeof author.login !== 'string') this.invalid();
        const bot = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\[bot\]$/u.exec(author.login);
        const human = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u.test(author.login);
        if (
            bot
                ? author.url !== `https://github.com/apps/${bot[1]}`
                : !human ||
                  (author.url !== `https://github.com/${author.login}` &&
                      author.url !== `https://github.com/apps/${author.login}`)
        )
            this.invalid();
        return { login: author.login, url: author.url as string };
    }

    private commitUrl(repo: string, value: unknown, prefix: string): void {
        if (typeof value !== 'string' || !value.startsWith(`https://github.com/${repo}/commit/`))
            this.invalid();
        const commit = value.slice(`https://github.com/${repo}/commit/`.length);
        if (!/^[a-f0-9]{40}$/u.test(commit) || !commit.startsWith(prefix)) this.invalid();
    }

    private pullUrl(repo: string, number: unknown, value: unknown): void {
        if (
            !Number.isSafeInteger(number) ||
            (number as number) < 1 ||
            (number as number) > 9_999_999_999 ||
            value !== `https://github.com/${repo}/pull/${number}`
        )
            this.invalid();
    }

    private object(value: unknown, fields: string[]): Record<string, unknown> {
        if (
            !value ||
            typeof value !== 'object' ||
            Array.isArray(value) ||
            Object.keys(value).length !== fields.length ||
            fields.some((field) => !Object.hasOwn(value, field))
        )
            this.invalid();
        return value as Record<string, unknown>;
    }

    private invalid(): never {
        throw new Error('Invalid, incomplete or unrelated GitHub release reference evidence.');
    }
}
