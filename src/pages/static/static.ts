import { Component } from '@angular/core';
import { NavParams } from 'ionic-angular';
import { SettingsManager } from '../../services/settings-manager';

declare var device: any;

@Component({
  selector: 'page-static',
  templateUrl: 'static.html'
})
export class StaticPage {

  private title;
  private content;

  constructor(
    private settingsManager: SettingsManager,
    public params:NavParams) {

    this.title = this.params.get("title");
    this.content = settingsManager.settings.globalSettings[this.params.get("settings_key")];
    console.log(settingsManager.settings.globalSettings);
  }
}
