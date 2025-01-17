import ColumnBuilder from '../../../schema/columnbuilder';
import toArray from 'lodash/toArray';

export default class ColumnBuilder_Oracle extends ColumnBuilder {
  constructor() {
    super(...arguments);
  }

  // checkIn added to the builder to allow the column compiler to change the
  // order via the modifiers ("check" must be after "default")
  checkIn() {
    this._modifiers.checkIn = toArray(arguments);
    return this;
  }
}
