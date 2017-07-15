import { Component, ViewChild } from '@angular/core';
import { Platform, NavParams, ViewController, NavController, AlertController, LoadingController } from 'ionic-angular';
import { VideoManager } from '../../services/video-manager';
import { EditPage } from '../edit/edit';
import { DetailPage } from '../detail/detail';
import { GeoManager } from '../../services/geo-manager';

@Component({
  selector: 'page-play',
  templateUrl: 'play.html'
})
export class PlayPage {
  public videoHistory;
	public localVideo;
  public remoteVideo;
	public showBranches;

	public branchingVideos;
  public remoteBranchingVideos;

  private proximityCheck;
  private srcUpdate;
  private firstVideoUuid;
  @ViewChild('videoplayer') videoplayer;

	constructor(
		public params:NavParams,
		public navCtrl: NavController, 
    public viewCtrl: ViewController, 
		private videoManager: VideoManager,
    private loadingCtrl: LoadingController,
    public alertCtrl: AlertController, 
    private geoManager: GeoManager,
    private platform: Platform
	) {
    this.proximityCheck = false;
    this.srcUpdate = false;
    this.videoHistory = [];
    if(params.get("localVideoUuid")) {
      this.localVideo = this.videoManager.getLocalVideoByUuid(params.get("localVideoUuid"));  
      this.firstVideoUuid = this.localVideo.videoUuid;
    }
    if(params.get("remoteVideoUuid")) {
      this.remoteVideo = this.videoManager.getRemoteVideoByUuid(params.get("remoteVideoUuid"));  
      this.firstVideoUuid = this.remoteVideo.videoUuid;
    }
  }

  ionViewDidEnter() {
    let video = null;

    if(this.localVideo) {
      video = this.localVideo;
      if(this.localVideo.localOrigin) {
        this.proximityCheck = true;
        this.loadVideo(this.localVideo);
        return;
      }  
    } else {
      video = this.remoteVideo;
    }    
    if(!video) return;

    // check if video needs proximity check
    if(!video.restrictLocation || video.localOrigin) {
      this.initLoadVideo();
    } else {
      // proceeding with proximity check
      this.proximityCheck = false;
      let loading = this.loadingCtrl.create({
        content: 'The author has restricted viewing to the original location. Checking your GPS...',
        spinner: "crescent"
      });    
      loading.present();
      this.geoManager.getDistanceFromDeviceTo(video.start_geoposition)
      .then((distance:any)=>{
          console.log("got back distance");
          console.log(distance);
          loading.dismiss();
          if(distance < 150) {
            this.initLoadVideo();
          } else {
            let alert = this.alertCtrl.create({
              title: "Too far",
              subTitle: "You're " + distance + "m away. Move closer to unlock video!",
              buttons: ["Ok"]
            });
            alert.present();
            this.dismiss();   
          }
      })
      .catch((error)=>{
          console.log(JSON.stringify(error));
          let alert = this.alertCtrl.create({
            title: "Where are you?",
            subTitle: "Couldn't determine your location, playback impossible.",
            buttons: ["Ok"]
          });
          loading.dismiss();
          alert.present();
      });
    }
  }

  initLoadVideo() {
    this.proximityCheck = true;
    if(this.localVideo) {
      this.loadVideo(this.localVideo, true); // load local
    } else {
      this.loadVideo(this.remoteVideo, false); // load remote
    }
  }

  loadVideo(video, local=true) {
    if(local) {
      this.localVideo = video;  
      this.branchingVideos = this.videoManager.getBranchingVideos(this.localVideo);    
    } else {
      this.remoteVideo = video;
      this.remoteBranchingVideos = this.videoManager.getRemoteBranches(this.remoteVideo);    
    }
   
    this.showBranches = false;
    // save to history if it's a new video
    if(this.videoHistory.length == 0) {
      this.videoHistory.push(video.videoUuid);
    } else {
      if(this.videoHistory[this.videoHistory.length - 1] != video.videoUuid) {
        this.videoHistory.push(video.videoUuid);
      }
    }
    console.log("loading video: " + JSON.stringify(video));

    if(this.srcUpdate) {
      this.videoplayer.nativeElement.load();
    }
    if(!this.proximityCheck) {
      this.videoplayer.nativeElement.pause();  
    } else {

       // autoplay doesn't work on android
      //if(!this.platform.is("ios")) {
        setTimeout(()=>{
          this.videoplayer.nativeElement.play();   
        }, 500);
      //}

    }

  }

  src(video) {
    if(!this.platform.is("cordova")) {
      return 'http://techslides.com/demos/sample-videos/small.mp4';
    }
    return this.videoManager.src(video);
  }

  videoEnded() {
    console.log("video ended");
    this.showBranches = true;
    this.srcUpdate = true;
  }
  
	newBranch() {
    this.videoManager.attachBranch(this.localVideo).then((localVideo)=>{
      this.branchingVideos = this.videoManager.getBranchingVideos(localVideo);
      this.navCtrl.push(EditPage, {localVideo: localVideo}).then(()=>{
        // remove current play page from navigation stack
        let index = this.navCtrl.indexOf(this.viewCtrl);
        this.navCtrl.remove(index);
      });
    }).catch((error)=>{ console.log(error); });
	}

  ionViewWillLeave() {
    // check if detail page needs to be replaced
    let currentVideoUuid = this.localVideo ? this.localVideo.videoUuid : this.remoteVideo.videoUuid;
    if(currentVideoUuid != this.firstVideoUuid) {
      console.log("we switched to a different video");
      
      // remove old details page
      let index = this.navCtrl.indexOf(this.viewCtrl);
      console.log("removing view with index " + (index - 1));
      this.navCtrl.remove(index - 1);

      // add new detail page on the page of the video that was just watched
      this.navCtrl.insert(index - 1, DetailPage, {type: (this.localVideo ? "local" : "remote"), uuid: currentVideoUuid});
    }

  }

  dismiss() {
    this.viewCtrl.dismiss();
  }

}

    
