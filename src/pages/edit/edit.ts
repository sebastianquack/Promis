import { Component } from '@angular/core';
import { App, NavController, NavParams, AlertController, ViewController } from 'ionic-angular';
import { VideoManager } from '../../services/video-manager';
import { GeoManager } from '../../services/geo-manager';

@Component({
  selector: 'page-edit',
  templateUrl: 'edit.html'
})
export class EditPage {
  public localVideo:any;
  public localVideos;
  public changeFlag:boolean;
  public branchToggles:any;

  constructor(
  	public navCtrl: NavController, 
  	public params:NavParams,
    public alertCtrl: AlertController,
    public viewCtrl: ViewController,
    private geoManager: GeoManager,
  	private videoManager: VideoManager,
    public appCtrl: App) 
  {
    this.videoManager.keyBoardFlag = true;
    this.changeFlag = false;
    this.localVideo = params.get("localVideo");
  }

  ionViewWillEnter() {
    this.localVideo = this.videoManager.getLocalVideoByUuid(this.localVideo.videoUuid);
    this.branchToggles = {};
    if(!this.localVideo.branches) {
      this.localVideo.branches = [];
    }
    for (let entry of this.localVideo.branches) {
      this.branchToggles[entry] = true;
    }
    let self = this;
    this.localVideos = this.videoManager.localVideos.find({
      $where: function() { return self.geoManager.inRange(this, self.localVideo.end_geoposition); }
    },
    {sort: {lowerCaseTitle: 1, createdAt: -1}}).fetch();
  }

  save() {
    this.localVideo.lowerCaseTitle = this.localVideo.title.toLowerCase();
    this.videoManager.updateVideo(this.localVideo, true); // also do update on remote video
    this.dismiss();
  }

  branchSave() {
    // read toggles
    let branches = [];
    for (var key in this.branchToggles) {
      if(this.branchToggles[key] == true) {
        branches.push(key);
      }
    }
    this.localVideo.branches = branches;
  }

  removeVideo() {
    let confirm = this.alertCtrl.create({
              title: 'Confirm',
              message: 'Remove this video?',
              buttons: [
                {
                  text: 'Ok',
                  handler: () => {
                    console.log('remove clicked');
                    this.videoManager.removeVideo(this.localVideo.videoUuid);
                    this.navCtrl.remove(this.params.get("parentIndex"));
                    this.viewCtrl.dismiss(); 
                  }
                },
                {
                  text: 'Cancel',
                  handler: () => {
                    console.log('cancel')
                  }
                }
              ]
              });
     confirm.present();
  }

  removeLocalCopy() {
    let confirm = this.alertCtrl.create({
              title: 'Confirm',
              message: 'Remove local copy of this video? You can redownload it later.',
              buttons: [
                {
                  text: 'Ok',
                  handler: () => {
                    console.log('remove clicked');
                    this.videoManager.removeLocalVideo(this.localVideo.videoUuid);
                    this.navCtrl.remove(this.params.get("parentIndex"));
                    this.viewCtrl.dismiss(); 
                  }
                },
                {
                  text: 'Cancel',
                  handler: () => {
                    console.log('cancel')
                  }
                }
              ]
              });
     confirm.present();
  }

  dismiss() {
      this.viewCtrl.dismiss();
    }

  

}