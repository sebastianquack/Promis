import { Injectable, Injector } from '@angular/core';
import { Platform } from 'ionic-angular';
import { FileTransfer, FileTransferObject } from '@ionic-native/file-transfer';

import { SettingsManager } from './settings-manager';
import { VideoManager } from './video-manager';

import 'meteor-client';
declare var LocalPersist:any;
import { MongoObservable } from 'meteor-rxjs';
import { PTransfer } from '../../../promis_server/lib/models';

declare var S3:any;
declare var window: any;

@Injectable()
export class TransferManager {

  public transfersObservable;
  public transfersObserver;
  private videoManager;
  private s3Uploads;
  
  constructor(
    private platform: Platform,
    private injector: Injector,
    private settingsManager: SettingsManager,
    private fTransfer: FileTransfer
    ) {
    this.transfersObservable = new MongoObservable.Collection<PTransfer>('transfers', {connection: null});
    this.transfersObserver = new LocalPersist(this.transfersObservable.collection, 'promis-transfers');
    setTimeout(() => this.videoManager = this.injector.get(VideoManager)); // to avoid circular dependancy

    // observe uploads collection in S3 package and transfer upload progress
    this.s3Uploads = new MongoObservable.Collection(S3.collection);
    this.s3Uploads.find({})
    .subscribe(files => {
      //console.log("S3 uploads callback");
      //console.log(JSON.stringify(files));
      files.forEach((entry) => {
        if(entry.status == "uploading") {
          let video = this.videoManager.findVideo({transcodedFilename: entry.file.original_name})
          if(video) {
            let transfer = this.transfersObservable.findOne({localVideoId: video._id})
            if(entry.percent_uploaded > transfer.progress) {
              this.updateProgress(transfer, entry.percent_uploaded);    
            }
          }
        }
      });  
    });

    setTimeout(()=>{
      this.initNext(true);  
    }, 4000);
  }

  /* BASIC OPERATIONS */

  updateStatus(transfer, status) {
     transfer.status = status;
     this.transfersObservable.update({_id: transfer._id}, transfer); 
  }

  updateInfo(transfer, info) {
     transfer.info = info;
     this.transfersObservable.update({_id: transfer._id}, transfer); 
  }

  updateProgress(transfer, progress) {
     transfer.progress = progress;
     this.transfersObservable.update({_id: transfer._id}, transfer);
  }

  getTitle(transfer) {
    if(transfer.type == "download") {
      let rv = this.videoManager.getRemoteVideo(transfer.remoteVideoId);
      return this.videoManager.formatTitle(rv);
    }
    if(transfer.type == "upload") {
      let lv = this.videoManager.getLocalVideo(transfer.localVideoId);
      return this.videoManager.formatTitle(lv);
    }
  }

  getInfo(video, type) {
    let transfer;
    if(type == "local") {
      let lv = this.videoManager.getLocalVideo(video._id);
      let transfers = this.transfersObservable.find({localVideoId:lv._id}, {sort: {createdAt: -1}, limit: 1});
      if(transfers) {
        transfer = transfers.fetch()[0];
      }
    }
    if(type == "remote") {
      let rv = this.videoManager.getRemoteVideo(video._id);
      let transfers = this.transfersObservable.find({remoteVideoId:rv._id}, {sort: {createdAt: -1}, limit: 1});
      if(transfers) {
        transfer = transfers.fetch()[0];
      }
    }
    if(transfer) {
      return transfer.info + " (" + transfer.progress + ")";
    } else {
      return "none";
    }
  }

  remove(transfer) {
    this.transfersObservable.remove({_id: transfer._id});   
  }

  init(transfer) {
    let activeTransfers = this.transfersObservable.collection.find({status: "active"}).count();
    if(activeTransfers == 0) {
      if(transfer.type == "download") {
        this.initDownload(transfer);  
      }
      if(transfer.type == "upload") {
        this.initUpload(transfer);  
      }
    } else {
      console.log("no more than 1 active transfers please");
    }
  }

  initNext(force=false) {
    if(this.settingsManager.settings.offline) {
      console.log("offline mode, pausing download queue");
      return;
    }
    console.log("looking for next transfer to init");
    let activeTransfer = this.transfersObservable.collection.findOne({status: "active"});
    if(activeTransfer) {
      if(force) {
        console.log("resuming active transfer");
        console.log(activeTransfer);
        this.init(activeTransfer);
      }
    } else {
      let queuedTransfer = this.transfersObservable.collection.find({status: "queued"}, {sort: {createdAt: 1}, limit: 1}).fetch();
      if(queuedTransfer.length > 0) {
        console.log("init queued transfer");
        console.log(queuedTransfer[0]);
        this.init(queuedTransfer[0]);  
      }
    }
  }

  /* DOWNLOADS */

  addDownload(remoteVideo) {
    console.log("add download with");
    console.log(JSON.stringify(remoteVideo));
    let transfer = this.transfersObservable.findOne({remoteVideoId:remoteVideo._id});
    if(!transfer || transfer.status == "done") {
      console.log("transfer checked, checking if local video exists with this id");
      let lv = this.videoManager.getLocalVideoByUuid(remoteVideo.videoUuid)
      if(lv) {
        if(lv.deleted) {
          this.videoManager.deleteLocalVideo(lv);
          lv = null;
        }
      }
      if(!lv) {
        console.log("inserting download transfer");
        this.transfersObservable.insert({
          type: "download",
          remoteVideoId: remoteVideo._id,
          status: "queued",
          info: "waiting for download",
          progress: 0,
          createdAt: new Date()
        });
        this.initNext();
        return true;
      } else {
        console.log("found local copy, aborting");
        console.log(JSON.stringify(lv));
      }
    }
    return false;
  }

  initDownload(transfer) {
    if(transfer.status != "queued") return;

    let rv = this.videoManager.getRemoteVideo(transfer.remoteVideoId);
    this.updateStatus(transfer, "active");
    
    if(this.platform.is('cordova')) {
      const fileTransfer = this.fTransfer.create();
      
      let oldProgress = 0;
      fileTransfer.onProgress((data) => {
        if(data.lengthComputable) {
          let progress = data.loaded / data.total;
          if(progress - oldProgress > 0.01) {
            this.updateProgress(transfer, progress)
            oldProgress = progress;
          }
        }
      })
      
      this.updateInfo(transfer, "downloading thumbnail");
      fileTransfer.download(rv.thumbUrl, this.videoManager.thumbPath + rv.thumbFilename).then((entryThumb) => {
        this.updateInfo(transfer, "downloading video");
        oldProgress = 0;
        fileTransfer.download(rv.url, this.videoManager.videoPath + rv.filename).then((entry) => {
          console.log('download complete: ' + entry.toURL() + " " + entryThumb.toURL());
          this.completeDownload(transfer);
        }, (error) => {
          console.log("video download error " + JSON.stringify(error));
        });    
      }, (error) => {
        console.log("thumb download error " + JSON.stringify(error));
      });
      
    } else {
      console.log("test mode in browser, saving dummy local video");
      this.completeDownload(transfer);
    }
  }

  completeDownload(transfer) {
    let rv = this.videoManager.getRemoteVideo(transfer.remoteVideoId);
    let lvId = this.videoManager.createLocalVideoAfterDownload(rv);
    transfer.localVideoId = lvId;
    transfer.progress = 1;          
    transfer.info = "download complete";
    transfer.status = "done";          
    this.transfersObservable.update({_id: transfer._id}, transfer);
    this.initNext();
  }


  /* TRANSCODE AND UPLOAD */

  addUpload(localVideo) {
    let transfer = this.transfersObservable.findOne({localVideoId:localVideo._id});
    if(!transfer || transfer.status == "done") {
      if(!this.videoManager.getRemoteVideoByUuid(localVideo.videoUuid)) {
        this.transfersObservable.insert({
          type: "upload",
          status: "queued",
          info: "waiting for transcode",
          localVideoId: localVideo._id,
          createdAt: new Date()
        });
        this.initNext();
        return true;
      }
    }
    return false;
  }

  initUpload(transfer) {
    if(transfer.status != "queued") return;

    let lv = this.videoManager.getLocalVideo(transfer.localVideoId);
    this.updateStatus(transfer, "active");
    
    if(!lv.transcoded) {
      this.doTranscode(transfer);
    } else {
      console.log("video already transcoded, going directly to upload");      
      this.doUpload(transfer);
    }
  }

  doTranscode(transfer) {
    this.updateInfo(transfer, "transcoding video");
    this.updateProgress(transfer, 0);

    this.videoManager.transcodeVideo(transfer.localVideoId, 
        (info) => {
          console.log("transcode progress: " + info);
          this.updateProgress(transfer, info);
        },
        () => {
          this.doUpload(transfer);
        }
    );
  }

  doUpload(transfer) {    
    this.updateInfo(transfer, "uploading video");
    this.updateProgress(transfer, 0);
    let video = this.videoManager.getLocalVideo(transfer.localVideoId);

    let videoPath = this.videoManager.src(video);

    // the real thing on device
    if(this.platform.is('cordova')) {
      
      this.uploadFileS3(
        videoPath,
        "videos",
        (file)=>{
          video.filename = file.name;
          this.videoManager.updateVideo(video);
        },
        (uploadResultVideo)=>{
          // upload thumbnail
          this.updateInfo(transfer, "uploading thumbnail");
          this.updateProgress(transfer, 0);
          this.uploadFileS3(
            (video.thumbPathRel ? (this.videoManager.thumbPath + video.thumbPathRel) : ("file://" + video.thumbPath)),
            "thumbnails",
            null,
            (uploadResultThumb)=>{
              // create remote video object
              this.videoManager.createRemoteVideoAfterUpload(video, uploadResultVideo, uploadResultThumb, (rvId) => {
                if(rvId) {
                  this.completeUpload(transfer, rvId);    
                }
              });
              
            }
          );
        }
      );

    } else {
      // browser testing mode
      this.videoManager.createRemoteVideoAfterUpload(video, null, null, (rvId) => {
        if(rvId) {
          this.completeUpload(transfer, rvId);    
        }
      });
      
    }
  }

  // get a simple short uid to add to filename uploads
  generateUID() {
    // I generate the UID from two parts here 
    // to ensure the random number provide enough bits.
    var firstPart = (Math.random() * 46656) | 0;
    var secondPart = (Math.random() * 46656) | 0;
    let first = ("000" + firstPart.toString(36)).slice(-3);
    let second = ("000" + secondPart.toString(36)).slice(-3);
    return first + second;
  }

  completeUpload(transfer, rvId) {
    transfer.remoteVideoId = rvId;
    transfer.progress = 1;          
    transfer.info = "upload complete";
    transfer.status = "done";          
    this.transfersObservable.update({_id: transfer._id}, transfer);    
    this.initNext();
  }

  uploadFileS3(
    localPath: string,
    remotePath: string,
    prepare: any,
    callback: any,
  ) {
    console.log("starting upload with path: ");
    console.log(localPath);
      
    window.resolveLocalFileSystemURL(localPath, 
      function(fileEntry) {
        fileEntry.file(function(file) {
          console.log("got file for upload: ");
          console.log(JSON.stringify(file));
          if(typeof prepare == "function") {
            prepare(file);  
          }
          var xhr = new XMLHttpRequest();
          xhr.open(
          /* method */ "GET",
          /* file */ localPath,
          /* async */ true
          );
          xhr.responseType = "arraybuffer";
          xhr.onload = function(evt) {
            var blob = new Blob([xhr.response], {type: file.type});
            blob['name'] = file.name;
            console.log("attempting upload with");
            console.log(JSON.stringify(blob));
            S3.upload({
              files: [blob],
              path: remotePath
            }, function(e, r) {
                console.log("S3 callback")
                if(e) {
                  console.log(JSON.stringify(e));  
                } else {
                  console.log(JSON.stringify(r));
                  if(typeof callback == "function") {
                    callback(r);
                  }
                }                
            });
          }
          xhr.send(null);          
        });
      },
      function(e) {
        console.log(JSON.stringify(e));
      }
    );
  }

}