import ViewBuilder from '../../../schema/viewbuilder';

export default class ViewBuilder_PG extends ViewBuilder {
  constructor() {
    super(...arguments);
  }

  checkOption() {
    this._single.checkOption = 'default_option';
  }

  localCheckOption() {
    this._single.checkOption = 'local';
  }

  cascadedCheckOption() {
    this._single.checkOption = 'cascaded';
  }
}
