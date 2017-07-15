import { Component } from '@angular/core';
import { TransferManager } from '../../services/transfer-manager';
import { VideoManager } from '../../services/video-manager';
import { AlertController, LoadingController } from 'ionic-angular';

@Component({
  selector: 'page-transfers',
  templateUrl: 'transfers.html'
})

export class TransfersPage {

  private downloadRange;
  private transfers;

  constructor(
    private transferManager: TransferManager,
    public alertCtrl:AlertController,
    public loadingCtrl:LoadingController,
    private videoManager: VideoManager) {
    this.downloadRange = 50;
  }

  ngOnInit() {
    this.transfers = this.transferManager.transfersObservable.find({}, {sort: {createdAt: -1}})
      .debounceTime(500)
      .zone();
  }

  anyDone() {
    let dones = this.transferManager.transfersObservable.find({status: "done"}).fetch();
    if(dones.length > 0) {
      return true;
    } else {
      return false;
    }
  }

  clearDone() {
    let dones = this.transferManager.transfersObservable.find({status: "done"});
    dones.forEach((done)=>{
      this.transferManager.remove(done);
    });
  }

  downloadArea() {

    let loading = this.loadingCtrl.create({
      content: 'Searching ' + this.downloadRange + 'm around you...',
      spinner: "crescent"
    });    
    loading.present();
    
    // todo get amount of branches close by
    this.videoManager.getRemoteBranchesDistance(this.downloadRange).then(
      (resp)=>{
        loading.dismiss();
        console.log(resp);

        if(resp.uuids.length == 0) {
          let alert = this.alertCtrl.create({
            title: "Nothing",
            subTitle: "Couldn't find any videos around you. Make some yourself!",
            buttons: ["Ok"]
          });
          alert.present();
          return;
        } 
          
        let alert = this.alertCtrl.create({
        title: 'Confirm',
        message: 'Download '+resp.uuids.length+' videos (' + (resp.size/1000000).toFixed() + 'mb)?',
        buttons: [
          {
            text: 'Yes',
            handler: () => {
              resp.uuids.forEach((uuid)=>{
                let rv = this.videoManager.getRemoteVideoByUuid(uuid);
                this.transferManager.addDownload(rv);  
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
      },
      (err)=>{
        loading.dismiss();
        console.log(JSON.stringify(err));
        let alert = this.alertCtrl.create({
            title: "Whoops",
            subTitle: "Something went wrong...",
            buttons: ["Ok"]
        });
        alert.present();
      }
    );

  }



}
