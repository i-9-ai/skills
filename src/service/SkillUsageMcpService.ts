// SPDX-License-Identifier: Apache-2.0
import { SkillReadRepository } from '../repository/SkillReadRepository.ts';
import { SkillUsageMcpTransport } from '../transport/SkillUsageMcpTransport.ts';

/** Owns the usage database and stdio transport for the command lifetime. */
export class SkillUsageMcpService {
    async runUsageMcp(database: string): Promise<void> {
        await new SkillUsageMcpTransport().startServer(new SkillReadRepository(database));
    }
}
