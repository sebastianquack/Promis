import { Component } from '@angular/core';
import { ViewController, ModalController, NavController, LoadingController } from 'ionic-angular';
import { VideoManager } from '../../services/video-manager';
import { DetailPage } from '../detail/detail';
import { EditPage } from '../edit/edit';
import { SettingsManager } from '../../services/settings-manager';
import { MediaCapture, MediaFile, CaptureVideoOptions, CaptureError } from '@ionic-native/media-capture';

declare var device: any;

@Component({
  selector: 'page-new',
  templateUrl: 'new.html'
})
export class NewPage {

  constructor(
    private videoManager: VideoManager,
    public viewCtrl: ViewController, 
    public modalCtrl: ModalController,
    public navCtrl: NavController,
    public loadingCtrl: LoadingController,
    private settingsManager: SettingsManager,
    private mediaCapture: MediaCapture) {
  }

  recordVideo() {

    let loading1 = this.loadingCtrl.create({
      content: 'Initializing...',
      spinner: "crescent"
    });    
    let loading2 = this.loadingCtrl.create({
      content: 'Processing...',
      spinner: "crescent"
    });    
    
    loading1.present().then(() => {
      return this.videoManager.doCaptureAsynch(null, loading1, loading2)
    }).then((lv:any) => {
      console.log("back from capture with");
      console.log(lv);
      loading2.dismiss();
      return this.navCtrl.push(DetailPage, {type: "local", uuid: lv.videoUuid}).then(()=>{
        this.navCtrl.push(EditPage, {localVideo: lv});
      });
    }).then(()=> {
      // first we find the index of the current view controller:
      const index = this.viewCtrl.index;
       // then we remove it from the navigation stack
      this.navCtrl.remove(index);
    }).catch(()=> {
      loading1.dismiss();
      loading2.dismiss();
    });
  }

  dismiss() {
     this.viewCtrl.dismiss();
  }
}
