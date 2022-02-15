/* eslint max-len: 0 */

import ViewCompiler_PG from '../../postgres/schema/pg-viewcompiler.js';

export default class ViewCompiler_Redshift extends ViewCompiler_PG {
  constructor(client, viewCompiler) {
    super(client, viewCompiler);
  }
}
