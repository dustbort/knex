/* eslint max-len: 0 */

import ViewCompiler from '../../../schema/viewcompiler';

export default class ViewCompiler_MySQL extends ViewCompiler {
  constructor(client, viewCompiler) {
    super(client, viewCompiler);
  }

  createOrReplace() {
    this.createQuery(this.columns, this.selectQuery, false, true);
  }
}

