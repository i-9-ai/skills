// SPDX-License-Identifier: Apache-2.0
import { InstalledCollectionConfiguration } from '../config/InstalledCollectionConfiguration.ts';
import { PluginDataConfiguration } from '../config/PluginDataConfiguration.ts';
import { InstalledSkillRepository } from '../repository/InstalledSkillRepository.ts';
import { PluginDataRepository } from '../repository/PluginDataRepository.ts';
import { SkillReadRepository } from '../repository/SkillReadRepository.ts';
import { SkillMcpTransport } from '../transport/SkillMcpTransport.ts';
import { SkillOperationError } from '../validator/SkillOperationError.ts';
import { SkillReadValidator } from '../validator/SkillReadValidator.ts';
import { SkillCatalogService } from './SkillCatalogService.ts';
import { SkillEvidenceService } from './SkillEvidenceService.ts';
import { SkillBumpReportService } from './SkillBumpReportService.ts';
import { SkillOnboardingService } from './SkillOnboardingService.ts';

export type SkillMcpOptions = {
    database?: string;
    host?: 'codex' | 'claude';
    environment?: NodeJS.ProcessEnv;
    callerRoot?: string;
};

/** Shares catalog operations and acquires usage storage only for explicit usage calls. */
export class SkillMcpService {
    private readonly options: SkillMcpOptions;
    private readonly configuration: InstalledCollectionConfiguration;
    private readonly catalog: SkillCatalogService;
    private readonly validator = new SkillReadValidator();
    private writer: SkillReadRepository | undefined;

    constructor(
        options: SkillMcpOptions = {},
        configuration = new InstalledCollectionConfiguration(),
    ) {
        this.options = { ...options, callerRoot: options.callerRoot ?? process.cwd() };
        this.configuration = configuration;
        this.catalog = new SkillCatalogService(new InstalledSkillRepository(configuration));
    }

    async serve(): Promise<void> {
        await new SkillMcpTransport().startServer(this);
    }

    search(value: unknown) {
        return this.catalog.search(value);
    }

    read(value: unknown) {
        return this.catalog.read(value);
    }

    overview(value: unknown) {
        return this.catalog.overview(value);
    }

    reportBump(value: unknown) {
        return new SkillBumpReportService().report(value);
    }

    onboarding(value: unknown) {
        return new SkillOnboardingService(this.configuration).guide(value);
    }

    record(value: unknown) {
        let event;
        try {
            event = this.validator.skillRead(value);
        } catch {
            throw new SkillOperationError('invalid_input');
        }

        try {
            this.writer ??= new SkillReadRepository(this.database(true));
            return this.writer.record(event);
        } catch (error) {
            if (error instanceof SkillOperationError) throw error;
            throw new SkillOperationError('storage_unavailable');
        }
    }

    rank(value: unknown) {
        let query;
        try {
            query = this.validator.rankingQuery(value);
        } catch {
            throw new SkillOperationError('invalid_input');
        }

        let reader: SkillReadRepository | undefined;
        try {
            reader = new SkillReadRepository(this.database(false), { readOnly: true });
            return reader.rank(query);
        } catch (error) {
            if (error instanceof SkillOperationError) throw error;
            throw new SkillOperationError('storage_unavailable');
        } finally {
            reader?.close();
        }
    }

    close(): void {
        this.writer?.close();
        this.writer = undefined;
    }

    recordLifecycle(value: unknown) {
        return new SkillEvidenceService().recordLifecycle(() => this.database(true), value);
    }
    observeCatalog(value: unknown) {
        return new SkillEvidenceService().recordCatalog(() => this.database(true), value);
    }
    lifecycle(value: unknown) {
        return new SkillEvidenceService().query(() => this.database(false), 'lifecycle', value);
    }
    overlap(value: unknown) {
        return new SkillEvidenceService().query(() => this.database(false), 'overlap', value);
    }
    inactivity(value: unknown) {
        return new SkillEvidenceService().query(() => this.database(false), 'inactivity', value);
    }
    catalogHistory(value: unknown) {
        return new SkillEvidenceService().query(() => this.database(false), 'history', value);
    }

    private database(write: boolean): string {
        const configured = this.options.database;
        const filename =
            configured ??
            new PluginDataConfiguration(this.options.environment).usageDatabase(this.options.host);
        const protectedRoots = [this.configuration.root()];
        // Explicit CLI paths remain caller-selected. Host defaults cannot create
        // state in the consuming project or the immutable installed collection.
        if (configured === undefined) protectedRoots.push(this.options.callerRoot!);

        const repository = new PluginDataRepository();
        return write
            ? repository.prepareDatabase(filename, protectedRoots)
            : repository.verifyDatabase(filename, protectedRoots);
    }
}
