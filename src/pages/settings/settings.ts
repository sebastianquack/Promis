import { Component } from '@angular/core';
import { Platform, NavController, NavParams, AlertController, ViewController } from 'ionic-angular';
import { SettingsManager } from '../../services/settings-manager';
import { GeoManager } from '../../services/geo-manager';
import { Device } from '@ionic-native/device';

//declare var device: any;
import 'meteor-client';

@Component({
  selector: 'page-settings',
  templateUrl: 'settings.html'
})
export class SettingsPage {

  private settings:any;
  
  constructor(
    private device: Device,
    public platform:Platform, 
  	public navCtrl: NavController, 
  	public params:NavParams,
    public alertCtrl: AlertController,
    public viewCtrl: ViewController,
  	private settingsManager: SettingsManager,
    private geoManager: GeoManager) 
  {
    this.settings = this.settingsManager.settings;
    if(!this.settings.email) {
      this.settings.email = "";
    }
    if(!this.settings.username) {
      this.settings.username = "Anonymous";
    }
    if(typeof(this.settings.offline) === "undefined") {
      this.settings.offline = false;
    }    
  }

  ionViewWillLeave() {
    this.settingsManager.updateSettings(this.settings);

    let userData = {
      email: this.settings.email,
      username: this.settings.username
    }
    if(this.device && this.platform.is("cordova")) {
      Meteor.call("updateUser", this.device.uuid, userData);  
    } else {
      Meteor.call("updateUser", "browserTest", userData);  
    }
  }

  toggleOffline() {
    if(this.settings.offline) {
      this.geoManager.map.setZoom(14);  
      this.geoManager.map.options.maxZoom = 14;
    } else {
      this.geoManager.map.options.maxZoom = 1;
    }
  }

  dismiss() {
    this.viewCtrl.dismiss();
  }

  saveTiles() {
    if(this.geoManager.map.getZoom() <= 14) {
      alert("please zoom in before saving tiles");
    } else {
      this.geoManager.map.setZoom(14);  
      this.geoManager.saveMapData();
    }

  }

  clearTiles() {
    this.geoManager.trashMapData();
  }


}