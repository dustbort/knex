import ViewCompiler_PG from '../postgres/schema/pg-viewcompiler.js';

export default class ViewCompiler_CRDB extends ViewCompiler_PG {
  renameColumn(from, to) {
    throw new Error('rename column of views is not supported by this dialect.');
  }

  defaultTo(column, defaultValue) {
    throw new Error(
      'change default values of views is not supported by this dialect.'
    );
  }
}
