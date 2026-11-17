// SPDX-License-Identifier: Apache-2.0
import { AgentStateConfiguration } from '../config/AgentStateConfiguration.ts';
import { SkillEvidenceContractValidator } from './SkillEvidenceContractValidator.ts';

/** Explicit selections only; metadata discovery and file reads are not decisions. */
export class SkillRoutingValidator {
    decision(value: unknown) {
        const contract = new SkillEvidenceContractValidator();
        if (Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8') > 32768) contract.invalid();
        const input = contract.object(value, [
            'correlation_id',
            'session',
            'occurred_at',
            'source_host',
            'source_adapter',
            'selections',
        ]);
        if (
            !Array.isArray(input.selections) ||
            input.selections.length < 1 ||
            input.selections.length > 24
        )
            contract.invalid();
        const selections = (input.selections as unknown[])
            .map((value) => {
                const selection = contract.object(value, ['collection', 'path']);
                let path: string;
                try {
                    path = AgentStateConfiguration.absolute(selection.path as string);
                } catch {
                    return contract.invalid();
                }
                return { collection: contract.slug(selection.collection), path };
            })
            .sort(
                (left, right) =>
                    left.collection.localeCompare(right.collection, 'en') ||
                    left.path.localeCompare(right.path, 'en'),
            );
        return {
            correlation_id: contract.uuid(input.correlation_id),
            session: contract.uuid(input.session),
            occurred_at: contract.timestamp(input.occurred_at),
            source_host: contract.slug(input.source_host),
            source_adapter: contract.slug(input.source_adapter),
            selections,
        };
    }
}
