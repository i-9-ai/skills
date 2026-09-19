// SPDX-License-Identifier: Apache-2.0
import AvailableSkillsCommand from '../context/available-skills.ts';

/** SessionStart lifecycle adapter; discovery remains owned by the reusable context command. */
export default class SessionIndexHookCommand extends AvailableSkillsCommand {
    static description =
        'Render compact skill context for the configured SessionStart lifecycle hook.';
    static examples = [
        '<%= config.bin %> hook session-index',
        '<%= config.bin %> hook session-index --project ./example-project --no-global',
    ];
}
