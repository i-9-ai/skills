// SPDX-License-Identifier: Apache-2.0
export class CollectionValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CollectionValidationError';
    }
}
