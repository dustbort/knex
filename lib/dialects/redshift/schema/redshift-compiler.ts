/* eslint max-len: 0 */

// Redshift Table Builder & Compiler
// -------

import SchemaCompiler_PG from '../../postgres/schema/pg-compiler';

export default class SchemaCompiler_Redshift extends SchemaCompiler_PG {
  constructor() {
    super(...arguments);
  }
}
