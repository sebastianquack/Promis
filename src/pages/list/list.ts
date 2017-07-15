import { Component, ViewChild } from '@angular/core';
import { NavController, ActionSheetController, AlertController, NavParams, ModalController, Content, Platform } from 'ionic-angular';
import { VideoManager } from '../../services/video-manager';
import { PlayPage } from '../play/play';
import { NewPage } from '../new/new';
import { DetailPage } from '../detail/detail';
//import { MapPage } from '../map/map';
declare var device: any;

@Component({
  selector: 'page-list',
  templateUrl: 'list.html'
})

export class ListPage {

  videos;
  remoteVideos;
  showBranches;
  
  @ViewChild(Content) content: Content;

  constructor(
    public navCtrl: NavController, 
    public actionSheetCtrl: ActionSheetController,  
    public alertCtrl: AlertController,
    public modalCtrl: ModalController,
    public platform: Platform,
    public params:NavParams,
    private videoManager: VideoManager) {
    this.showBranches = false;
  }

  ngOnInit() {
    this.videos = this.videoManager.localVideos.find(
        {$and: [
          {$or: [{originalPath: {$exists: true}}, {localOrigin: true}, {downloaded: true}, {downloading: true}]},
          {deleted: {$ne: true}}
        ]},
        {sort: {lowerCaseTitle: 1, createdAt: -1}}
       )
      .debounceTime(500)
      .zone();

    console.log("paths");
    console.log(this.videoManager.videoPath);
    console.log(this.videoManager.thumbPath);
  }

  isPlatform(p) {
    return this.platform.is(p)
  }

  enterPlay(uuid) {
    this.navCtrl.push(PlayPage, {localVideoUuid: uuid});
  }

  enterDetail(uuid) {
    this.navCtrl.push(DetailPage, {type: "local", uuid: uuid});
  }

  enterNew() {
    this.navCtrl.push(NewPage);
  }

}
