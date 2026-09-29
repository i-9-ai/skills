// SPDX-License-Identifier: Apache-2.0
import type { Command } from '@oclif/core';
import AggregateCheckCommand from '../command/catalog/aggregate/AggregateCheckCommand.ts';
import AggregateInspectCommand from '../command/catalog/aggregate/AggregateInspectCommand.ts';
import AggregateRebuildCommand from '../command/catalog/aggregate/AggregateRebuildCommand.ts';
import AggregateSyncCommand from '../command/catalog/aggregate/AggregateSyncCommand.ts';
import CatalogCheckCommand from '../command/catalog/CatalogCheckCommand.ts';
import CatalogInspectCommand from '../command/catalog/CatalogInspectCommand.ts';
import CatalogOverviewCommand from '../command/catalog/CatalogOverviewCommand.ts';
import CatalogReadCommand from '../command/catalog/CatalogReadCommand.ts';
import CatalogSearchCommand from '../command/catalog/CatalogSearchCommand.ts';
import CatalogSyncCommand from '../command/catalog/CatalogSyncCommand.ts';
import AvailableSkillsCommand from '../command/context/AvailableSkillsCommand.ts';
import CollectionAuditCommand from '../command/collection/CollectionAuditCommand.ts';
import CollectionPlanCommand from '../command/collection/CollectionPlanCommand.ts';
import CollectionEvolveCommand from '../command/collection/CollectionEvolveCommand.ts';
import HookListCommand from '../command/hook/HookListCommand.ts';
import HookObserveCommand from '../command/hook/HookObserveCommand.ts';
import HookVerifyCommand from '../command/hook/HookVerifyCommand.ts';
import SessionConfigCommand from '../command/hook/SessionConfigCommand.ts';
import SessionIndexHookCommand from '../command/hook/SessionIndexHookCommand.ts';
import TelemetryConfigCommand from '../command/hook/TelemetryConfigCommand.ts';
import ServeMcpCommand from '../command/mcp/ServeMcpCommand.ts';
import PluginPrepareCommand from '../command/plugin/PluginPrepareCommand.ts';
import OfficialSkillsValidateCommand from '../command/repo/OfficialSkillsValidateCommand.ts';
import PrepareVersionCommand from '../command/repo/PrepareVersionCommand.ts';
import RepositoryValidateCommand from '../command/repo/RepositoryValidateCommand.ts';
import VerifyReleaseCommand from '../command/repo/VerifyReleaseCommand.ts';
import TelemetryRankingsCommand from '../command/telemetry/TelemetryRankingsCommand.ts';
import TelemetryRecordCommand from '../command/telemetry/TelemetryRecordCommand.ts';
import TelemetryTrendsCommand from '../command/telemetry/TelemetryTrendsCommand.ts';

/** Owns public command routes independently of class names and source layout. */
export class CommandConfiguration {
    static readonly commands = {
        'catalog:aggregate:check': AggregateCheckCommand,
        'catalog:aggregate:inspect': AggregateInspectCommand,
        'catalog:aggregate:rebuild': AggregateRebuildCommand,
        'catalog:aggregate:sync': AggregateSyncCommand,
        'catalog:check': CatalogCheckCommand,
        'catalog:inspect': CatalogInspectCommand,
        'catalog:overview': CatalogOverviewCommand,
        'catalog:read': CatalogReadCommand,
        'catalog:search': CatalogSearchCommand,
        'catalog:sync': CatalogSyncCommand,
        'context:available-skills': AvailableSkillsCommand,
        'collection:audit': CollectionAuditCommand,
        'collection:plan': CollectionPlanCommand,
        'collection:evolve': CollectionEvolveCommand,
        'hook:list': HookListCommand,
        'hook:observe': HookObserveCommand,
        'hook:verify': HookVerifyCommand,
        'hook:session-config': SessionConfigCommand,
        'hook:session-index': SessionIndexHookCommand,
        'hook:telemetry-config': TelemetryConfigCommand,
        'mcp:serve': ServeMcpCommand,
        'plugin:prepare': PluginPrepareCommand,
        'repo:validate-official': OfficialSkillsValidateCommand,
        'repo:validate': RepositoryValidateCommand,
        'repo:prepare-version': PrepareVersionCommand,
        'repo:verify-release': VerifyReleaseCommand,
        'telemetry:rankings': TelemetryRankingsCommand,
        'telemetry:record': TelemetryRecordCommand,
        'telemetry:trends': TelemetryTrendsCommand,
    } satisfies Record<string, Command.Class>;
}
