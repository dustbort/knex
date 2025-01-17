import ColumnBuilder from '../../../schema/columnbuilder';

export default class ColumnBuilder_Redshift extends ColumnBuilder {
  constructor() {
    super(...arguments);
  }

  // primary needs to set not null on non-preexisting columns, or fail
  primary() {
    this.notNullable();
    return super.primary(...arguments);
  }

  index() {
    this.client.logger.warn(
      'Redshift does not support the creation of indexes.'
    );
    return this;
  }
}
