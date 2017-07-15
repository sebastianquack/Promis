import { Component, NgZone } from '@angular/core';
import { App, AlertController, NavParams, ViewController, ModalController, NavController } from 'ionic-angular';
import { VideoManager } from '../../services/video-manager';
import { PlayPage } from '../play/play';
import { EditPage } from '../edit/edit';
import { SettingsManager } from '../../services/settings-manager';
import { TransferManager } from '../../services/transfer-manager';
import { GeoManager } from '../../services/geo-manager'
import { Clipboard } from '@ionic-native/clipboard';

@Component({
  selector: 'page-detail',
  templateUrl: 'detail.html'
})
export class DetailPage {
  public localVideo:any;
  public branchingVideos;

  public remoteVideo:any;
  public remoteBranchingVideos;

  private shortLink;
  
  constructor(
  	public params:NavParams,
    public alertCtrl:AlertController,
    public viewCtrl:ViewController,
    public modalCtrl:ModalController,
    public navCtrl:NavController,
    private videoManager:VideoManager,
    private settingsManager: SettingsManager,
    private transferManager: TransferManager,
    private geoManager: GeoManager,
    public appCtrl: App,
    private zone: NgZone,
    private clipboard: Clipboard) 
  {
  }

  ionViewDidEnter() {
    if(this.params.get("type") == "local") {    
        // check for updates from remote video
        let lv = this.videoManager.getLocalVideoByUuid(this.params.get("uuid"));
        this.videoManager.updateLocalVideoFromRemoteAsynch(lv);

        this.branchingVideos = this.videoManager.getBranchingVideos(lv);    
        this.remoteBranchingVideos = this.videoManager.getRemoteBranches({videoUuid: lv.videoUuid});

        // subscribe to changes in lcoal video
        this.videoManager.localVideos.find({videoUuid: this.params.get("uuid")})
        .subscribe(videos => {
           this.zone.run(() => {
             this.localVideo = videos[0];
             this.shortLink = this.localVideo.shortLink;
             console.log(JSON.stringify(this.localVideo));

             this.geoManager.map.panTo(new L.LatLng(this.localVideo.start_geoposition.coords.latitude, this.localVideo.start_geoposition.coords.longitude));
           });
        });
    } else {
      this.branchingVideos = this.videoManager.getBranchingVideos({videoUuid: this.params.get("uuid")});    

      if(!this.settingsManager.settings.offline) {
        this.remoteVideo = this.videoManager.getRemoteVideoByUuid(this.params.get("uuid"));
        this.shortLink = this.remoteVideo.shortLink;
        console.log(JSON.stringify(this.remoteVideo));
        this.remoteBranchingVideos = this.videoManager.getRemoteBranches(this.remoteVideo);

        this.geoManager.map.panTo(new L.LatLng(this.remoteVideo.start_geoposition.coords.latitude, this.remoteVideo.start_geoposition.coords.longitude));

      }
    }    
  }

  branchClick(video, type="local") {
    this.navCtrl.push(DetailPage, {type: type, uuid: video.videoUuid}); 
  }

  enterEdit(id) {
    let lv = this.videoManager.getLocalVideo(id);
    console.log("opening edit page with " + JSON.stringify(lv));
    this.navCtrl.push(EditPage, {localVideo: lv, parentIndex: this.viewCtrl.index});
  }

  enterPlay(uuid, remote=false) {
    if(remote && !this.settingsManager.settings.offline) {
      console.log("entering play page with remote video");
      this.navCtrl.push(PlayPage, {remoteVideoUuid: uuid});
    } else {
      this.navCtrl.push(PlayPage, {localVideoUuid: uuid});
    }
  }

  newBranch() {
    this.videoManager.attachBranch(this.localVideo).then((localVideo)=>{
      this.navCtrl.push(EditPage, {localVideo: localVideo});
    }).catch((error)=>{ console.log(error); });    
  }

  extendToBranches(type, verb, method) {
    let branchUuids = this.videoManager.branchSearch(type, (type == "local" ? this.localVideo : this.remoteVideo));
    console.log(branchUuids);
    if(branchUuids.length > 0) {
      let alert = this.alertCtrl.create({
        title: 'Confirm',
        message: 'Do you also want to '+verb+' all '+branchUuids.length+' attached branches?',
        buttons: [
          {
            text: 'Yes',
            handler: () => {
              branchUuids.forEach((uuid)=>{
                let branch = (type == "local" ? this.videoManager.getLocalVideoByUuid(uuid) : this.videoManager.getRemoteVideoByUuid(uuid))
                method(branch);
              })
            }
          },
          {
            text: 'No',
            handler: () => {
              console.log('No clicked');
            }
          }
        ]
      });
      alert.present();
    }
  }

  download() {
    this.transferManager.addDownload(this.remoteVideo);
    this.extendToBranches("remote", "download", (branch)=>{this.transferManager.addDownload(branch);});
  }

  upload() {
    this.transferManager.addUpload(this.localVideo);
    this.extendToBranches("local", "upload", (branch)=>{this.transferManager.addUpload(branch);});
  }

  unpublish() {
    this.videoManager.removeRemoteVideo(this.localVideo.videoUuid);
    this.extendToBranches("local", "unpublish", (branch)=>{this.videoManager.removeRemoteVideo(branch.videoUuid)});
    this.dismiss();
  }

  undownload() {
    this.videoManager.removeLocalVideo(this.localVideo.videoUuid);
    this.extendToBranches("local", "undownload", (branch)=>{this.videoManager.removeLocalVideo(branch.videoUuid)});
    this.dismiss();  
  }

  flag() {
    this.videoManager.flagRemoteVideo(this.remoteVideo);
    this.showMessage("Thanks!", "We've been notified and will check on this video.");
  }

  dismiss() {
    this.viewCtrl.dismiss();
  }

  backToMap() {
    this.navCtrl.popToRoot(); 
  }

  clipboardMessage() {
    let url = "http://web.promis.me/" + this.shortLink;
    this.clipboard.copy(url)
    .then(
     (resolve: string) => { console.log('success! ' + resolve); },
     (reject: string) => { console.log('Error: ' + reject);}
    );

    this.showMessage("Ready to go!", url + " copied to clipboard.");
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