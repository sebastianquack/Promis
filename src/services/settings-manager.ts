import { Injectable } from '@angular/core';
import { AlertController } from 'ionic-angular';

import 'meteor-client';
declare var LocalPersist:any;
import { MongoObservable } from 'meteor-rxjs';
import { LocalSetting } from '../../../promis_server/lib/models';
import { GlobalSettings } from './collections';

@Injectable()
export class SettingsManager {
  
  private localSettingsObservable;
  private localSettingsObserver;
  
  constructor(
    public alertCtrl: AlertController) {

    this.localSettingsObservable = new MongoObservable.Collection<LocalSetting>('localsettings', {connection: null});
    this.localSettingsObserver = new LocalPersist(this.localSettingsObservable.collection, 'promis-localsettings');

    // update global settings on init
    GlobalSettings.find({}).subscribe(globalSettings => {
      console.log(globalSettings[0]);
      let settings = this.localSettingsObservable.findOne();
      settings.globalSettings = globalSettings[0];
      this.updateSettings(settings);
    })
  }

  get settings():LocalSetting {
    let settings = this.localSettingsObservable.findOne();
    if(!settings) {
      console.log("creating empty settings object");
      this.localSettingsObservable.collection.insert({});
      settings = this.localSettingsObservable.findOne();
    }
    return settings;
  }

  updateSettings(settings: LocalSetting) {
    this.localSettingsObservable.collection.update(settings._id, settings);
  }

  showMessage(title: string, message: string): void {
    const alert = this.alertCtrl.create({
      buttons: ['OK'],
      message: message,
      title: title
    });
    alert.present();
  }


}