import ViewBuilder from '../../../schema/viewbuilder';

export default class ViewBuilder_Oracledb extends ViewBuilder {
  constructor() {
    super(...arguments);
  }

  checkOption() {
    this._single.checkOption = 'default_option';
  }
}
