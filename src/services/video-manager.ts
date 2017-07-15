import { VideoEditor } from '@ionic-native/video-editor';
import { File, Entry, FileEntry } from '@ionic-native/file';
import { Device } from '@ionic-native/device';
import { MediaCapture, MediaFile, CaptureVideoOptions, CaptureError } from '@ionic-native/media-capture';
import { Geolocation, Geoposition } from '@ionic-native/geolocation';

import { Platform, AlertController, LoadingController } from 'ionic-angular';
import { Injectable } from '@angular/core';

import { GeoManager } from './geo-manager';

import 'meteor-client';
declare var LocalPersist:any;
import { MongoObservable } from 'meteor-rxjs';
import { LocalVideo, RemoteVideo } from '../../../promis_server/lib/models';
import { RemoteVideos, PromisUsers } from './collections';

import shortlink = require("shortlink");

@Injectable()
export class VideoManager {
  
  public localVideosObservable;
  private localVideosObserver;
  private remoteVideoObservable;
  private currentUuid;

  public keyBoardFlag;
  public videoPath;
  public thumbPath;
  public transcodedPath;
  
  constructor(
    public platform:Platform, 
    private device: Device,
    public alertCtrl: AlertController, 
    private loadingCtrl: LoadingController,
    private file: File,
    private geoManager: GeoManager,
    private videoEditor: VideoEditor,
    private mediaCapture: MediaCapture,
    private geolocation: Geolocation) {

    this.videoPath = file.dataDirectory;
    this.thumbPath = file.cacheDirectory; // change when thumbs are also moved into persistent storage
    
    this.localVideosObservable = new MongoObservable.Collection<LocalVideo>('localvideos', {connection: null});
    this.localVideosObserver = new LocalPersist(this.localVideosObservable.collection, 'promis-localvideos');
  
    this.remoteVideoObservable = RemoteVideos; //defined on server

    // make sure file plugin is ready before calling
    setTimeout(()=>{
      this.setupPaths();
    }, 1500);
    
  }

  setupPaths() {
    console.log("getting paths from file plugin");
    if(this.platform.is("cordova")) {
      if(this.platform.is("android")) {
        console.log("android");
        this.videoPath = this.file.externalDataDirectory;
        this.thumbPath = this.file.externalDataDirectory + "files/videos/";
        this.transcodedPath = this.file.externalDataDirectory + "files/videos/";
      } else {
        console.log("ios");
        this.videoPath = this.file.dataDirectory;
        this.thumbPath = this.file.cacheDirectory; // change when thumbs are moved into persistent storage  
        this.transcodedPath = this.file.cacheDirectory; // change when transcode is moved into persistent storage  
      }
    } else {
      this.videoPath = "";
      this.thumbPath = "assets/elements/";
    }
    console.log(this.videoPath);
    console.log(this.thumbPath);
    console.log(this.transcodedPath);
  }


  /* GETTERS */

  get localVideos() {
    return this.localVideosObservable;
  }

  getLocalVideo(id: string) {
    return this.localVideos.collection.findOne(id);
  }

  getLocalVideoByUuid(uuid: string) {
    return this.localVideosObservable.findOne({videoUuid: uuid});
  }

  get remoteVideos() {
    return this.remoteVideoObservable;
  }

  getRemoteVideo(id: string) {
    return this.remoteVideoObservable.findOne({_id: id});
  }

  getRemoteVideoByUuid(uuid: string) {
    return this.remoteVideoObservable.findOne({videoUuid: uuid});
  }

  getBranchingVideos(video: LocalVideo) {
    let videoUpdated = this.getLocalVideoByUuid(video.videoUuid);
    let branchingVideos = [];
    if(!videoUpdated) {
      return branchingVideos;
    }
    if(videoUpdated.branches) {
      for(let branchUuid of videoUpdated.branches) {
        let aVideo = this.getLocalVideoByUuid(branchUuid);
        if(aVideo) {
          if(!aVideo.hidden && !aVideo.deleted) {
            branchingVideos.push(aVideo);
          }
        }
      }
    }
    return branchingVideos;
  }

  getRemoteBranches(remoteVideo) {
    let videoUpdated = this.getRemoteVideoByUuid(remoteVideo.videoUuid);
    let branchingVideos = [];
    if(!videoUpdated) {
      return branchingVideos;
    }
    if(videoUpdated.branches) {
      for(let branchUuid of videoUpdated.branches) {
        let aVideo = this.getRemoteVideoByUuid(branchUuid);
        if(aVideo) {
          if(!aVideo.hidden) {
            branchingVideos.push(aVideo);
          }
        }
      }
    }
    return branchingVideos;
  }

  getRemoteBranchesDistance(maxDistance) {
    // get location
    return this.geolocation.getCurrentPosition({
        'enableHighAccuracy' : true,    // may take longer and use more battery
        'maximumAge' : 5000,            // milliseconds
        'timeout' : 15000,              // milliseconds
     }).then(
        (pos) => {
          console.log("received video start location, searching for videos with distance " + maxDistance);
          let deviceGeoposition = this.geoManager.parseGeolocationObject(pos);


          let uuids = [];
          let promisesInRange = [];
          let promises = RemoteVideos.find({deleted: {$ne: true}, branch: {$ne: true}}).fetch();
          promises.forEach((promis)=>{
            if(!promis.start_geoposition.coords) return;

            // check if close by
            let distance = this.geoManager.getDistance(deviceGeoposition.coords, promis.start_geoposition.coords);  
            if(distance < maxDistance) {
              console.log("in range: " + promis.title);
              promisesInRange.push(promis);
              uuids.push(promis.videoUuid);
            }
          });

          promisesInRange.forEach((promis)=> {
            let branchUuids = this.branchSearch("remote", promis, []);
            uuids.push(branchUuids);
          })

          let uuidsUnique = this.ArrNoDupe(uuids);
          console.log(uuidsUnique);
          
          let uuidsNotDownloaded = [];
          let size = 0;    

          uuidsUnique.forEach((uuid)=>{
            let rv = RemoteVideos.findOne({videoUuid: uuid});
            let lv = this.localVideosObservable.findOne({videoUuid: uuid});
            if(lv) {
              if(lv.downloaded) {
                return; // don't download stuff that's already downloaded
              }
            }
            if(rv) {
              uuidsNotDownloaded.push(uuid);
              size += rv.size;  
            }
          });

          return Promise.resolve({uuids: uuidsNotDownloaded, size: size});
        },
        (err) => {
          return Promise.reject(err);
        }
    ); 
  }

  ArrNoDupe(a) {
      var temp = {};
      for (var i = 0; i < a.length; i++)
          temp[a[i]] = true;
      var r = [];
      for (var k in temp)
          r.push(k);
      return r;
  }

  branchSearch(type, video, list=[]) {
    let branchList = this.doBranchSearch(type, video, list);
    // remove initial video from list
    let index = branchList.indexOf(video.videoUuid);
    if(index > -1) {
      branchList.splice(index, 1);
    }
    return branchList;
  }

  doBranchSearch(type, video, list=[]) {
    if(list.indexOf(video.videoUuid) > -1) { // we've been here before, exit!
      return [];
    } else {
      //console.log(video.title);    
      list.push(video.videoUuid); // we're here for the first time, save!
      let branches = (type=="remote" ? this.getRemoteBranches(video) : this.getBranchingVideos(video));
      branches.forEach((branch)=>{
        this.doBranchSearch(type, branch, list).forEach((item)=>{
          if(list.indexOf(item) == -1) {
            list.push(item);
          }
        });
      });
      return list;  
    }    
  }

  findVideo(query) {
    return this.localVideos.collection.findOne(query);
  }

  getAuthor(video) {

    let userIsAuthor = false;
    if(this.platform.is("cordova")) {
      userIsAuthor = (video.deviceUuid == this.device.uuid);
    } else {
      userIsAuthor = (!video.deviceUuid) || (video.deviceUuid == "browserTest");
    }

    if(userIsAuthor) {
      return "You";
    } else {
      let user:any = PromisUsers.findOne({deviceUuid: video.deviceUuid});
      if(user) {
        return user.username;  
      } else {
        return "Someone else";
      }
    }

  }

  downloaded(uuid) {
    let lv = this.localVideos.findOne({videoUuid: uuid});
    if(lv) {
      if(!lv.deleted) {
        return true;  
      }
    }
    return false;
  }

  src(video) {
    if(video.transcoded) {
      if(video.transcodedFilename) {        
        // if video was last downloaded -> videoPath
        if(video.downloaded) {
          return this.videoPath + video.transcodedFilename;  
        } else {
          return this.transcodedPath + video.transcodedFilename;
        }
      }
    } else {
      if(video.originalPathRel) {
        return this.videoPath + video.originalPathRel;
      } else {
        return video.originalPath;
      }
    }
  }

  /* BASIC OPERATIONS */

  updateVideo(video: LocalVideo, updateRemote = false) {
    video.lastModified = new Date();
    this.localVideos.collection.update({_id: video._id}, video);
    if(updateRemote) {
      this.updateRemoteVideoFromLocal(video);  
    }
  }

  updateVideoAsynch(video: LocalVideo, updateRemote = false) {
    video.lastModified = new Date();
    return new Promise((resolve,reject)=>{
        this.localVideos.collection.update({_id: video._id}, video,
          (err,result) => {
            if (err) {
              reject(err);
            } else {
              if(updateRemote) {
                this.updateRemoteVideoFromLocal(video); // todo: make this use promise as well
              }
              resolve(result);
            } 
        });
    });
  }

  insertVideoAsynch(video: LocalVideo) {
    return new Promise((resolve,reject)=>{
        this.localVideos.collection.insert(video, 
          (err,result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
  }

  // remove local and remote copy - "remove"
  removeVideo(uuid: string) {
    let lv = this.getLocalVideoByUuid(uuid);
    if(lv) {
      //this.localVideos.collection.remove({_id: lv._id});  
      lv.deleted = true; // workaround so map notices change - flag for deletion
      this.updateVideo(lv);  
    }
    
    let rv = RemoteVideos.collection.findOne({videoUuid: uuid});
    if(rv) {
      RemoteVideos.collection.remove({_id: rv._id});  
    }
    
  }

  // removes local only - "undownload" / "remove local copy"
  removeLocalVideo(uuid: string) {
    let lv = this.getLocalVideoByUuid(uuid);
    if(lv) {
      lv.deleted = true; // workaround so map notices change - flag for deletion
      this.updateVideo(lv);  
      //this.localVideos.collection.remove({_id: lv._id});  
    }
  }

  // remove remote only - "unpublish"
  removeRemoteVideo(uuid: string) { // this is unpublish action, leaving local video in place
    let rv = RemoteVideos.collection.findOne({videoUuid: uuid});
    if(rv) {
      RemoteVideos.collection.remove({_id: rv._id});  
    }
    
    // this will only work for the same device that video was uploaded from
    let lv = this.getLocalVideoByUuid(uuid);
    if(lv) {
      lv.uploaded = false;
      this.updateVideo(lv);
    }
  }

  // permanently delete local video
  deleteLocalVideo(video) {    
    this.localVideosObservable.collection.remove({_id: video._id});    
    
    //delete the file
    if(video.originalPath) {
      this.deleteFile(video.originalPathRel ? (this.videoPath + video.originalPathRel) : video.originalPath);
    }
    if(video.transcodedPath) {
     this.deleteFile(video.thumbPathRel ? (this.thumbPath + video.thumbPathRel) : ("file://" + video.transcodedPath)); 
    }
    
  }

  deleteFile(path) {
    console.log("trying to delete " + path);
    this.file.resolveLocalFilesystemUrl(path).then(
      (fileEntry: FileEntry) => {
        console.log("received fileEntry");
        console.log(JSON.stringify(fileEntry));
        function success() {
          console.log("Removal succeeded");
        }
        function fail(error) {
          console.log('Error removing file: ' + JSON.stringify(error));
        }
        fileEntry.remove(success, fail);
    }, (error)=>{ console.log(JSON.stringify(error)); });  
  }

  flagRemoteVideo(rv: RemoteVideo) {
    rv.flagged = true;
    RemoteVideos.update({_id: rv._id}, rv);  
  }

  updateRemoteVideoFromLocal(lv: LocalVideo) {
    if(lv) {
      let rv = RemoteVideos.collection.findOne({videoUuid: lv.videoUuid});
      if(rv) {
        rv.title = lv.title;
        rv.branch = lv.branch;
        rv.branches = lv.branches;
        RemoteVideos.update({_id: rv._id}, rv);  
        //console.log("updated remote video");
        //console.log(JSON.stringify(rv));
      }  
    }
  }

  updateLocalVideoFromRemoteAsynch(lv: LocalVideo) {
   if(!lv.localOrigin) {
      let rv = RemoteVideos.collection.findOne({videoUuid: lv.videoUuid});
      if(rv) {
        lv.title = rv.title;
        lv.branch = rv.branch;
        lv.branches = rv.branches;
        lv.hidden = rv.hidden;
        return this.updateVideoAsynch(lv); // only update local - not remote again!
      } else {
        return Promise.resolve(lv); // pass the local video through without updates  
      }  
    } else {
      return Promise.resolve(lv);
    }
  }

 
  /* CAPTURING VIDEOS */

  doCaptureAsynch(branchFromUuid = null, loading1 = null, loading2 = null) {
    let options: CaptureVideoOptions = { limit: 1 };
    let video:LocalVideo;
    let videoDuration;

    this.currentUuid = this.generateUuid();

      console.log("trying to get location at video recorder start");
      
      let start_geoposition:Geoposition;
      let end_geoposition:Geoposition;

      // INIT GET START LOCATION
      return this.geolocation.getCurrentPosition({
        'enableHighAccuracy' : true,    // may take longer and use more battery
        'maximumAge' : 5000,            // milliseconds
        'timeout' : 15000,              // milliseconds
      
      }).then(
        (resp) => {
          console.log("received video start location");
          start_geoposition = this.geoManager.parseGeolocationObject(resp);
          if(loading1) {
            loading1.dismiss();  
          }
          if (this.platform.is('cordova')) {

            // INIT CAPTURE
            return this.mediaCapture.captureVideo(options);
          
          } else {
            return Promise.resolve(null);
          }
        },
        (error) => {
          loading1.dismiss();
          console.log('Error getting location'); console.log(error);
          alert("Unable to obtain your position. You need gps to record")      
          return Promise.reject(error); // break promise chain -> do not go to next then!
        }
      ).then(
        (data:any) => {
          console.log("MediaCapture complete");

          if(data) {
            data[0].getFormatData((d) => {
              console.log(d.duration);
              videoDuration = d.duration; // assuming this is done in time?
            });
          }

          if(loading2) {
            loading2.present();
          }
          if(!data && !this.platform.is('cordova')) {
            return Promise.resolve(null); // browser test mode
          } else {

            // INIT SAVE
            return this.moveToPersistent(data);

          }
        },
        (error) => {
          console.log('Media Capture Error');
          console.log(JSON.stringify(error));
          return Promise.reject(error); // break promise chain -> do not go to next then!
        }
      ).then(
        (file:any) => {
          let system = this.platform.is('ios') ? 'ios' : (this.platform.is('android') ? 'android' : 'windows');

          video = {
            title: "",
            duration: videoDuration,
            createdAt: new Date(),
            lastModified: new Date(),
            localOrigin: true,
            originalPath: file ? file.toURL() : "",
            originalPathRel: file ? file.name : "",
            videoUuid: this.currentUuid,
            deviceUuid: "",
            system: "",
            transcoded: false,
            transcodeProgress: 0,
            uploaded: false,
            uploadProgress: 0,
            downloaded: false,
            branch: false,
            start_geoposition: start_geoposition,
          }

          if(this.platform.is('cordova')) {
            video.deviceUuid = this.device.uuid;
            video.system = system + '@ ' + this.device.version;
          } else {
            video.deviceUuid = "browserTest"
            video.transcoded = true; // for browser testing
            video.transcodeProgress = 1;
          }
          console.log(JSON.stringify(video));

          // INIT GET END LOCATION
          return this.geolocation.getCurrentPosition({
            'enableHighAccuracy' : true,    // may take longer and use more battery
            'maximumAge' : 5000,            // milliseconds
            'timeout' : 15000,              // milliseconds
          });     

        },
        (error) => {
          loading2.dismiss();
          console.log('Move Video Error'); console.log(JSON.stringify(error));
          return Promise.reject(error); // break promise chain -> do not go to next then!
        }
      ).then(
        (resp) => {
          console.log("Received video end location", resp);
          end_geoposition = this.geoManager.parseGeolocationObject(resp);
        }, 
        (error) => {
          loading2.dismiss();
          console.log('Error getting end location'); console.log(JSON.stringify(error));
          //alert("Unable to obtain your position. Assuming you ended where you started.")
          end_geoposition = start_geoposition; // does not break promise chain -> go to next then!
          if(!video) {
            return Promise.reject(error);
          }
        }
      ).then(() => {
        console.log(JSON.stringify(end_geoposition));
        video.end_geoposition = end_geoposition
     
        // SAVE BRANCH INFO ON VIDEO THIS ONE IS TO BECOME BRANCH OF
        if(branchFromUuid) {
          let originVideo = this.getLocalVideoByUuid(branchFromUuid);
          console.log("creating branch from originvideo " + originVideo.title);
          if(!originVideo.branches) {
            originVideo.branches = [];
          }
          originVideo.branches.push(video.videoUuid);
          console.log(JSON.stringify(originVideo));
          return this.updateVideoAsynch(originVideo, true); // next then waits for this to fulfill
        }

      }).then(() => {
        
        // SAVE NEW VIDEO
        return this.addVideoAsynch(video)
      
      });
  }

  moveToPersistent(data: MediaFile[]) {
    console.log (this.file);
    //console.log(this.file)
    console.log (data);
    let videoUuid = this.currentUuid
    let mediaFile:any = data[0]; // :any because there is an undeclared "localURL" attribute
    let extension = (mediaFile.name.split('.').length > 1 ? '.'+mediaFile.name.split('.').pop() : '');
    let targetFileName = videoUuid + extension;

    //let path = data[0].fullPath;
    //let basename = path.replace( /\\/g, '/' ).replace( /.*\//, '' );
    //let dirname = path.replace( /\\/g, '/' ).replace( /\/[^\/]*$/, '' );

    //console.log(mediaFile);
    //console.log(targetFileName);

    let sourceFile:FileEntry;
    //let targetFile:fileEntry;
    return this.file.resolveLocalFilesystemUrl(mediaFile.localURL).then(
      (fileEntry: FileEntry) => {
        //console.log("received fileEntry");
        //console.log(fileEntry);
        sourceFile = fileEntry;
        //console.log("resolving " + this.file.dataDirectory)

        return this.file.resolveLocalFilesystemUrl(this.videoPath)
      },
      (error) => {
        console.log('error receving fileEntry' + JSON.stringify(error));
        return Promise.reject(error); // break promise chain -> do not go to next then!
      }
    ).then(
      (dirEntry: Entry) => {
        //console.log("received dirEntry");
        //console.log(dirEntry);
        //let targetFile:FileEntry = sourceFile.moveTo(dirEntry, targetFileName)
        let sourceDir = sourceFile.filesystem.root.toURL()
        let sourceF = sourceFile.fullPath
        let destDir = dirEntry.filesystem.root.toURL()
        let destF = targetFileName

        console.log("move from " + sourceDir + " " + sourceF + " to " + destDir + " " + destF)
        return this.file.copyFile(sourceDir, sourceF, destDir, destF)
      },
      (error) => {
        console.log('error receving dirEntry' +  JSON.stringify(error));
        return Promise.reject(error); // break promise chain -> do not go to next then!
      }
    ).then(
      (targetFile:Entry) => {
        //console.log("moved new video to " + targetFile.toURL());
        //console.log(targetFile)

        //this.deleteFile(mediaFile.localURL); doesn't work properly on android for gallery files
        
        let tF:Entry = targetFile
        return new Promise((resolve, reject)=>{
          resolve(tF);
        });
      },
      (error) => {
        console.log("unable to move video");
        console.log(JSON.stringify(error));
        return Promise.reject(error); // break promise chain -> do not go to next then!
      }
    )
  }

  // saves video and creates thumbnail
  addVideoAsynch(video: LocalVideo) {
      let videoId;
      let thumb_file = "";
      //video.transcoded = false;
      return this.insertVideoAsynch(video).then(
        (id) => {
          videoId = id;
          if (this.platform.is('cordova')) {
            console.log("creating thumbnail for " + videoId);
            thumb_file = this.currentUuid + "_thumb";
            return this.videoEditor.createThumbnail({
              fileUri: video.originalPath, // the path to the video on the device
              outputFileName: thumb_file, // the file name for the JPEG image
              atTime: 0, // optional, location in the video to create the thumbnail (in seconds)
              width: 480, // optional, width of the thumbnail
              height: 320, // optional, height of the thumbnail
              quality: 100 // optional, quality of the thumbnail (between 1 and 100)
            });
           } else {
             return Promise.resolve("/assets/elements/dummy_thumb.jpg");
           }
        },
        (error) => {
          console.log(error);
          return Promise.reject(error);
        }
      ).then(
        thumbPath => {
          console.log(thumbPath.toString());
          video._id = videoId;
          video.thumbPath = thumbPath.toString();
          // TODO HERE: move thumbnail from cache directory to persistent storage
          if (this.platform.is('cordova')) {
            video.thumbPathRel = thumb_file + ".jpg";
          } else {
            video.thumbPathRel = "dummy_thumb.jpg"
          }
          return this.updateVideoAsynch(video);
        },
        error => {
          console.log("error in thumbnail creation");
          console.log(error);
          return Promise.reject(error);
        }
      ).then(() => {
        let lv = this.getLocalVideo(videoId);
        console.log("the new and shiny video: ");    
        console.log(JSON.stringify(lv));
        return new Promise((resolve, reject)=>{
          resolve(lv);
        });
      });
  }


  /* TRANSCODING AND UPLOADING */

  transcodeVideo(id: string, progress: any, callback: any) {
    let video = this.getLocalVideo(id)
    let transcodedFilename = "transcode_" + video._id;
    let options = {
      fileUri: video.originalPathRel ? (this.videoPath + video.originalPathRel) : video.originalPath,
      outputFileName: transcodedFilename,
      outputFileType: this.videoEditor.OutputFileType.MPEG4,
      optimizeForNetworkUse: this.videoEditor.OptimizeForNetworkUse.YES,
      saveToLibrary: false,
      maintainAspectRatio: true,
      width: 480,
      height: 360,
      videoBitrate: 1333333, // 1 megabit
      audioChannels: 2,
      audioSampleRate: 44100,
      audioBitrate: 128000, // 128 kilobits
      progress: progress
    }
    console.log("transcodeVideo options " + JSON.stringify(options))
    this.videoEditor.transcodeVideo(options)
      .then((fileUri: string) => {
        console.log('video transcode success, saving to: ' + fileUri);
        video.transcoded = true;
        //video.transcodedPath = fileUri;
        video.transcodedFilename = transcodedFilename + ".mp4";
        this.updateVideo(video);
        this.deleteFile(video.originalPath); // delete original video
        callback();
      })
      .catch((error: any) => console.log('video transcode error ' + JSON.stringify(error)));
  }

  createRemoteVideoAfterUpload(video, uploadResultVideo, uploadResultThumb, callback) {

    // create new remote video
    let rv = {
      videoUuid: video.videoUuid ? video.videoUuid : this.generateUuid(),
      shortLink: shortlink.generate(),
      createdAt: video.createdAt,
      lastModified: video.lastModified,
      deviceUuid: video.deviceUuid,
      system: video.system,
      title: video.title,
      duration: video.duration,
      branches: video.branches,
      branch: video.branch,
      start_geoposition: video.start_geoposition,
      end_geoposition: video.end_geoposition,
      restrictLocation: video.restrictLocation
    }
    if(uploadResultVideo) {
     Object.assign(rv, {
      url: uploadResultVideo.url,
      relativeUrl: uploadResultVideo.relative_url,
      filename: uploadResultVideo.file.name,
      type: uploadResultVideo.file.type,
      size: uploadResultVideo.file.size                    
     });
     video.size = uploadResultVideo.file.size;
    }
    if(uploadResultThumb) {
     Object.assign(rv, {
      thumbUrl: uploadResultThumb.url,
      thumbFilename: uploadResultThumb.file.name, 
     });
    }
    Meteor.call("createVideo", rv, (error, remoteId)=> {
      if(!error) {
        // update local video
        // don't touch downloaded flag to preserve the right paths
        video.uploaded = true;
        video.remoteId = remoteId;
        video.shortLink = rv.shortLink;
        this.updateVideo(video);
        callback(remoteId);
      } else {
        console.log(error);
        callback(null);
      }
    });
  }

  /* DOWNLOADING */

  createLocalVideoAfterDownload(rv) {
    let localId = this.localVideos.collection.insert({
        videoUuid: rv.videoUuid ? rv.videoUuid : this.generateUuid(),
        shortLink: rv.shortLink,
        remoteId: rv._id,
        title: rv.title,
        lowerCaseTitle: rv.title.toLowerCase(),
        hidden: rv.hidden,
        
        duration: rv.duration,
        size: rv.size,

        createdAt: rv.createdAt,
        lastModified: rv.lastModified,

        start_geoposition: rv.start_geoposition,
        end_geoposition: rv.end_geoposition,

        deviceUuid: rv.deviceUuid,
        system: rv.system,
        localOrigin: (rv.deviceUuid == (this.platform.is('cordova') ? this.device.uuid : "browserTest")),

        transcodedFilename: rv.filename,
        transcoded: true,
        downloaded: true,
        uploaded: false,
        thumbPathRel: this.platform.is('cordova') ? rv.thumbFilename : "dummy_thumb.jpg",
        
        branch: rv.branch,
        branches: rv.branches,

        restrictLocation: rv.restrictLocation
    });

    return localId;
  }
    

  /* BRANCHING */

  attachBranch(localVideo) {
    let loading0 = this.loadingCtrl.create({
      content: 'Checking your location...',
      spinner: "crescent"
    });    
    let loading1 = this.loadingCtrl.create({
      content: 'Initializing...',
      spinner: "crescent"
    });    
    let loading2 = this.loadingCtrl.create({
      content: 'Processing...',
      spinner: "crescent"
    });    


    loading0.present();

    return this.geoManager.getDistanceFromDeviceTo(localVideo.end_geoposition).then(
      (distance:any)=>{
        console.log("got back distance");
        console.log(distance);
        loading0.dismiss();
        if(distance < 150) {
          return Promise.resolve();
        } else {
          let alert = this.alertCtrl.create({
            title: "Too far",
            subTitle: "You're " + distance + "m away. Try to move closer!",
            buttons: ["Ok"]
          });
          alert.present();
          return Promise.reject(null);
        }
      },
      (error)=>{
        console.log(JSON.stringify(error));
        let alert = this.alertCtrl.create({
          title: "Where are you?",
          subTitle: "Couldn't determine your location, playback impossible.",
          buttons: ["Ok"]
        });
        loading0.dismiss();
        alert.present();
        return Promise.reject(null);
    })
    .then(() => {
      return this.doCaptureAsynch(localVideo.videoUuid, loading1, loading2)
    })
    .then((lv:any) => {
      if(lv) {
        lv.branch = true;
        this.updateVideo(lv, true);

        // update original Video
        localVideo.branches.push(lv.videoUuid);
        this.updateVideo(localVideo, true);

        loading2.dismiss();
        return Promise.resolve(lv);
      } else {
        return Promise.reject(null);
      }
    })
    .catch((error)=> {
      console.log(error);
      return Promise.reject(null);
    });
  }


  /* FORMATTING & ICONS */

  formatDate(date) {
    if(!date) return "";
    return (date.getMonth() + 1) + "/" + date.getDay() + " " + date.getHours() + ":" + date.getMinutes();
  }

  formatDuration(totalSeconds) {
    if(!totalSeconds) {
      return "";
    }
    let minutes = Math.floor(totalSeconds / 60);
    let seconds = Math.floor(totalSeconds - (minutes * 60));
    return minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
  }

  formatSize(bytes) {
    if(!bytes) return "";
    let mb = (bytes / 1000000).toFixed(2);
    return mb + " mb";
  }

  formatTitle(video:any) {
    if(!video) {
      return "";
    }
    if(!video.title) {
      return this.formatDate(video.createdAt);
    }
    return video.title;
  }

  // TODO: Put this in an icon-manager?
  iconsData = {
    local: {
      path: 'assets/markers_svg/PROMIS_marker_local.svg'
    },
    uploaded: {
      path: 'assets/markers_svg/PROMIS_marker_upload.svg'
    },
    downloaded: {
      path: 'assets/markers_svg/PROMIS_marker_download.svg'
    },
    branch: {
      path: 'assets/markers_svg/PROMIS_marker_branch.svg'
    },
    remote: {
      path: 'assets/markers_svg/PROMIS_marker_remote.svg'
    }
  }

  getRemoteIconData() {
    return this.iconsData.remote;
  }

  uploadButton(video:LocalVideo) {
    if(!video.localOrigin) {
      return false; // not your video
    }
    let rv = this.getRemoteVideoByUuid(video.videoUuid);
    if(rv) {
      return false; // already uploaded
    } else {
      return true; // go for it!
    }
  }

  unpublishButton(video:LocalVideo) {
    if(!video.localOrigin) {
      return false; // not your video
    }
    let rv = this.getRemoteVideoByUuid(video.videoUuid);
    if(rv) {
      return true; // something to unpublish
    } else {
      return false; // nothing to unpublish
    }
  }

  undownloadButton(video:LocalVideo) {
    return (!video.localOrigin && video.downloaded)
  }

  getIconType(video:LocalVideo) {
    if (video.branch) {
      return "branch"
    }
    let rv = this.getRemoteVideoByUuid(video.videoUuid);
    if(video.localOrigin) {
      if(rv) {
        return "uploaded";
      } else {
        return "local";
      }
    } else {
      return "downloaded";
    }    
  }

  getIconData(video:LocalVideo) {
    var type = this.getIconType(video)
    var data = this.iconsData[type]
    if(!data) {
      console.log("cannot find icon data");
      console.log(type);
      console.log(JSON.stringify(video));
      data = {};
    }
    data.type = type
    data.class = "icon-type-" + type
    return data
  }


  /* HELPERS */

  generateUuid = function() {
    var uuid = "", i, random;
    for (i = 0; i < 32; i++) {
      random = Math.random() * 16 | 0;

      if (i == 8 || i == 12 || i == 16 || i == 20) {
        uuid += "-"
      }
      uuid += (i == 12 ? 4 : (i == 16 ? (random & 3 | 8) : random)).toString(16);
    }
    return uuid;
  }
  

}