// SPDX-License-Identifier: Apache-2.0
import { officialRequirements } from '../domain/official-validator-policy.mjs';
import { canonicalSkills, installOfficialValidator, readOfficialConfiguration,
  runOfficialValidator } from '../infrastructure/official-validator-process.mjs';
import { validateRepository } from './validate-repository.mjs';

/** CI use case: local safety checks, pinned installation, then official results. */
export function validateOfficial(root) {
  validateRepository(root);
  const requirements = officialRequirements(readOfficialConfiguration(root));
  const packages = canonicalSkills(root);
  installOfficialValidator(root, requirements);
  return runOfficialValidator(root, packages, requirements.version);
}
