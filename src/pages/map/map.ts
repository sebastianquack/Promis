import { Component } from '@angular/core';
import { Platform, MenuController, NavController, PopoverController, ModalController, LoadingController } from 'ionic-angular';
import { Geolocation } from 'ionic-native';
import { VideoManager } from '../../services/video-manager';
import { SettingsManager } from '../../services/settings-manager';
import { GeoManager } from '../../services/geo-manager';
import { NewPage } from '../new/new';
import { DetailPage } from '../detail/detail';

import 'leaflet';
import 'leaflet.offline';
import 'leaflet.markercluster';

const DEFAULT_ZOOM = 10;
const DEFAULT_LAT = 64.1842953;
const DEFAULT_LNG = -51.730436;

const MIN_ZOOM_OFFLINE = 14;
const MIN_ZOOM_ONLINE = 1;

declare namespace L {
    function map(s: string, options:any): any;
    //function circle(coordinates:any, options: any): any;
    function marker(coordinates:any, options: any): any;
    function markerClusterGroup(options:any): any;
}
declare namespace L.tileLayer {
    function offline(s: string, options: any): any;
}

declare namespace L.control {
    function savetiles(baseLayer:any, options: any): any;
}
declare namespace L.Icon {
    function extend(options: any): any;
}

@Component({
  selector: 'page-map',
  templateUrl: 'map.html'
})
export class MapPage { 
  private mapSetup = false;
  private inView = false;

  private localVideos;
  private remoteVideos;

  // all three arrays have same index
  private videoUuidsOnMap = [];
  private iconTypesOnMap = [];
  private markersOnMap = [];

  // these two arrays have same index
  private remoteVideoUuidsOnMap = [];
  private remoteMarkersOnMap = [];

  private markers = L.markerClusterGroup({
    spiderfyDistanceMultiplier: 2.2,
    polygonOptions: {color: "transparent"}
  }); // marker cluster, holds all the markers mentioned above

  //private locationMarker;// location marker (only one allowed)

  constructor(
      public navCtrl: NavController, 
      private platform: Platform,
      private popoverCtrl: PopoverController,
      public modalCtrl: ModalController,
      private videoManager: VideoManager,
      private settingsManager: SettingsManager,
      private geoManager: GeoManager,
      private menu: MenuController,
      private loadingCtrl: LoadingController
      ) {      
    this.menu.swipeEnable(false, 'menu1');
  }  

  ionViewWillLeave() {
    this.inView = false;
  }

  ionViewWillEnter() {
    if(this.videoManager.keyBoardFlag) {
      console.log("resetting map");
      this.geoManager.map.invalidateSize();
      this.videoManager.keyBoardFlag = false;    
    }
  }

  ionViewDidEnter() {
    let settings = this.settingsManager.settings;
    if(!settings.currentLat || !settings.currentLng || !settings.currentZoom) {
        settings.currentLat = DEFAULT_LAT;
        settings.currentLng = DEFAULT_LNG;
        settings.currentZoom = DEFAULT_ZOOM;
        this.settingsManager.updateSettings(settings);
    }
    this.loadMap();

    // setup subscriptions for changes in data
    this.localVideos = this.videoManager.localVideos.find({
      $and: [
        {branch: {$ne: true}}, 
        {hidden: {$ne: true}},
        {$or: [{originalPath: {$exists: true}}, {downloaded: true}, {downloading: true}]}
      ]});
    if(!settings.offline) {
      this.remoteVideos = this.videoManager.remoteVideos.find({$and: [{branch: {$ne: true}}, {hidden: {$ne: true}}]});  
    } else {
      this.remoteVideos = null;
      this.clearRemoteMarkers();
    } 
    setTimeout(()=> {
      this.inView = true;
      this.localVideos.debounceTime(500).subscribe((videos) => { // this fires whenever a local video changes
        if(this.inView) {
          //console.log(".");
          videos.forEach((video)=>{
            this.checkUpdate("local", video);
          });
        }
      });
      if(this.remoteVideos) {
        this.remoteVideos.debounceTime(500).subscribe((videos) => { // this fires whenever a remote video changes
          if(this.inView) {
            //console.log(".");          
            videos.forEach((video)=>{
              this.checkUpdate("remote", video);
            });
          }
        });
      }
      this.mapSetup = true;
    }, this.mapSetup ? 0 : 3000); // give map some time to load on first run
  }

  // intitialize the map
  loadMap(){
    if(!this.geoManager.map) {
        console.log("initializing map...");
        this.geoManager.map = L.map('map', {zoomControl: false});
        let settings = this.settingsManager.settings;
 
        this.geoManager.baseLayer = L.tileLayer.offline('https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png',
        { 
          attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attribution">CARTO</a>',
          subdomains: ['a', 'b', 'c'],
          minZoom: settings.offline ? MIN_ZOOM_OFFLINE : MIN_ZOOM_ONLINE,
          maxZoom: 18
        }
        ).addTo(this.geoManager.map);

        this.geoManager.saveTiles = L.control.savetiles(this.geoManager.baseLayer, {
            'zoomlevels': [14, 15, 16, 17, 18], //optional zoomlevels to save, default current zoomlevel
            'confirm': function(layer, succescallback) {
                if (window.confirm("Save " + layer._tilesforSave.length + " map tiles?")) {
                    succescallback();
                }
            },
            'saveText': '<i class="fa fa-download" aria-hidden="true"></i>',
            'rmText': '<i class="fa fa-trash" aria-hidden="true"></i>'
        }).addTo(this.geoManager.map);
         
        this.geoManager.map.setView({
            lat: settings.currentLat,
            lng: settings.currentLng,
        }, settings.currentZoom);

        //events while saving a tile layer
        var progress;
        this.geoManager.baseLayer.on('savestart', (e)=> {
            progress = 0;
            //console.log('tiles to save: ' + e._tilesforSave.length);
            this.geoManager.tilesToSave = e._tilesforSave.length;
        });
        this.geoManager.baseLayer.on('savetileend', (e)=> {
            progress++;
            //console.log("tiles saved: " + progress);
            this.geoManager.tilesSaved = progress;
        });
        this.geoManager.baseLayer.on('loadend', (e)=> {
            console.log("Saved all tiles");
            //window.alert("All tiles saved.");
            //this.geoManager.tilesDone = true;
        });
        this.geoManager.baseLayer.on('tilesremoved', (e)=> {
            //console.log("Removed all tiles");
            this.geoManager.tilesSaved = 0;
            this.geoManager.tilesToSave = 0;
        });
        
        // track & save movement of map for persistence
        let self = this;
        this.geoManager.map.on('move', function(e) {
            //console.log("map moved to " + JSON.stringify(self.map.getCenter()));
            let settings = self.settingsManager.settings;
            settings.currentLat = self.geoManager.map.getCenter().lat;
            settings.currentLng = self.geoManager.map.getCenter().lng;
            settings.currentZoom = self.geoManager.map.getZoom();
            self.settingsManager.updateSettings(settings);
        });

        this.geoManager.map.addLayer(this.markers);
        this.markers.setZIndex(1);
    }
  }

  // decide if map needs to be updated
  checkUpdate(localOrRemote, video) {
    if(typeof video.videoUuid == 'undefined') {
      return;
    }
    
    // if this is a local video
    if(localOrRemote == "local") {
      if(video.deleted) {
        console.log("found deleted video");
        this.clearMarker(video.videoUuid);
        this.videoManager.deleteLocalVideo(video);
        return;
      }

      let localIndex = this.videoUuidsOnMap.indexOf(video.videoUuid);
      if(localIndex == -1) {
        // unknown local video - add to map!
        this.addMarkerToMap(localOrRemote, video);

        // if remote video is already on map, replace with local version
        let remoteIndex = this.remoteVideoUuidsOnMap.indexOf(video.videoUuid);
        if(remoteIndex > -1) {
          console.log("removing remote version of video");
          this.clearRemoteMarker(video.videoUuid);
        }
      } else {
        // known local video
        // check if type is the same
        var iconType = this.videoManager.getIconType(video);
        if(this.iconTypesOnMap[localIndex] != iconType) {
          console.log("icon discrepancy: " + this.iconTypesOnMap[localIndex] + " -> " + iconType);
            this.clearMarker(video.videoUuid);
            this.addMarkerToMap(localOrRemote, video);  
        }
      }
    }

    // if this is a remote video
    if(localOrRemote == "remote") {

      if(video.deleted) {
        console.log("found deleted video");
        this.clearRemoteMarker(video.videoUuid);
        //this.videoManager.remoteVideos.collection.remove({_id: video._id});    
        return;
      }


      let localIndex = this.videoUuidsOnMap.indexOf(video.videoUuid);
      if(localIndex == -1) {
        // local version of this isn't on the map yet, proceed
        // only add if remote video isn't already there
        let remoteIndex = this.remoteVideoUuidsOnMap.indexOf(video.videoUuid);
        if(remoteIndex == -1) {
          this.addMarkerToMap(localOrRemote, video);  
        }        
      }
    }

  }

  // verify existence of geo position
  checkPosition = function(obj) {
    if(!obj) {
      return false;
    }
    if(typeof(obj.coords) == "undefined") {
      return false;
    }
    if(Object.keys(obj.coords).length === 0 && obj.coords.constructor === Object) {
      return false
    }
    return true;
  }
     
  // add one marker to map
  addMarkerToMap(type, video) {
    if(!this.checkPosition(video.start_geoposition)) {
      return;
    }
    var videoStartLat = video.start_geoposition.coords.latitude;
    var videoStartLng = video.start_geoposition.coords.longitude;
    
    if(type == "local") {
        var thumb = video.thumbPathRel ? (this.videoManager.thumbPath + video.thumbPathRel) : video.thumbPath;
        var icon;

        // choose icon
        var iconType = this.videoManager.getIconType(video)
        if (iconType == "branch") {
          var icon = new BranchedIcon({})
        }
        else if (iconType == "uploaded") { // what is the difference between localAuthor and localOrigin?
          var icon = new UploadedIcon({ shadowUrl: thumb })  
        }
        else if (iconType == "downloaded") {
          var icon = new DownloadedIcon({ shadowUrl: thumb })  
        }
        else if (iconType == "local") { 
          var icon = new LocalIcon({ shadowUrl: thumb })  
        }

        // only set marker if there was a fitting category
        if (typeof(icon) != "undefined" && videoStartLat && videoStartLng && video) {
          var marker = L.marker([videoStartLat, videoStartLng],{
            videoUuid: video.videoUuid,
            title: video.title,
            alt: video.title + "(available on device)",
            icon: icon,
          });
          
          console.log("adding local marker to map");
          //console.log(marker);
          marker.addTo(this.markers).on('click', ()=>{
            this.enterDetail("local", video.videoUuid)
          });
          this.videoUuidsOnMap.push(video.videoUuid);
          this.iconTypesOnMap.push(iconType);
          this.markersOnMap.push(marker);
        }
     
    }

    if(type == "remote") {
          var thumb = video.thumbUrl

          var marker = L.marker([videoStartLat, videoStartLng],{
            videoUuid: video.videoUuid,
            title: video.title,
            alt: video.title + "(not yet downloaded)",
            icon: new RemoteIcon({ shadowUrl: thumb }),
          });
          
          console.log("adding remote marker to map");
          marker.addTo(this.markers).on('click', ()=>{
            this.enterDetail("remote", video.videoUuid);
          });
          
          this.remoteVideoUuidsOnMap.push(video.videoUuid);
          this.remoteMarkersOnMap.push(marker);
    }
      
  }

  // clear one marker
  clearMarker(videoUuid) {
    let index = this.videoUuidsOnMap.indexOf(videoUuid);
    if(index > -1) {
      this.markers.removeLayer(this.markersOnMap[index]);
      this.videoUuidsOnMap.splice(index, 1);  
      this.markersOnMap.splice(index, 1);
      this.iconTypesOnMap.splice(index, 1);
    } 
  }

  clearRemoteMarker(videoUuid) {
    let index = this.remoteVideoUuidsOnMap.indexOf(videoUuid);
    if(index > -1) {
      console.log("doing remove");
      this.markers.removeLayer(this.remoteMarkersOnMap[index]);
      this.remoteVideoUuidsOnMap.splice(index, 1);  
      this.remoteMarkersOnMap.splice(index, 1);
    } 
  }

  clearRemoteMarkers() {
    this.remoteMarkersOnMap.forEach((marker) => {
      this.markers.removeLayer(marker);
    });
    this.remoteMarkersOnMap = [];
    this.remoteVideoUuidsOnMap = [];
  }

  // get location and center map
  setLocation() {
    console.log("trying to get location");
    let loading1 = this.loadingCtrl.create({
      content: 'Getting GPS location...',
      spinner: "crescent"
    });
    loading1.present();    
    
    Geolocation.getCurrentPosition({
        'enableHighAccuracy' : true,    // may take longer and use more battery
        'maximumAge' : 2000,            // milliseconds
        'timeout' : 15000,              // milliseconds
      }).then((resp) => {
        //alert("Accuracy is " + resp.coords.accuracy + " meters");
        let lat = resp.coords.latitude;
        let lng = resp.coords.longitude;
        //let acc = resp.coords.accuracy;
        let zoom = this.geoManager.map.getZoom()
        this.geoManager.map.setView({
            lat: lat,
            lng: lng
        }, zoom);

        
        /*if (typeof(this.locationMarker) == "undefined") {
          this.locationMarker = L.marker([lat, lng],{
            icon: new LocationIcon({}),
            zIndexOffset: -1 // put below others
          });
          
          console.log("adding location marker to map");
          this.locationMarker.addTo(this.map);
        }
        else {
          this.locationMarker.setLatLng([lat, lng]);
        }*/

        loading1.dismiss();

    
    }).catch((error) => {
        console.log('Error getting location - using default location', error);
    });

  }

  // open new promis page
  enterNew() {
    this.inView = false;
    this.navCtrl.push(NewPage);
  }

  // open detail page
  enterDetail(type, uuid) {
    this.inView = false;
    this.navCtrl.push(DetailPage, {type: type, uuid: uuid});
  }
}


/***** icons *******/

var DownloadedIcon = L.Icon.extend({
  options: {
    //shadowUrl: video.thumbUrl, // set background picture here!
    iconUrl: 'assets/markers_svg/PROMIS_marker_download.svg',
    iconSize:     [87, 85], // size of the icon
    shadowSize:   [72, 72], // size of the shadow
    iconAnchor:   [43, 85], // point of the icon which will correspond to marker's location
    shadowAnchor: [(70/2)+1, (70+14)],  // the same for the shadow
    //popupAnchor:  [-3, -76] // point from which the popup should open relative to the iconAnchor
    className: 'DownloadedIcon'
  }
});

var UploadedIcon = L.Icon.extend({
  options: {
    //shadowUrl: video.thumbUrl, // set background picture here!
    iconUrl: 'assets/markers_svg/PROMIS_marker_upload.svg',
    iconSize:     [87, 85], // size of the icon
    shadowSize:   [72, 72], // size of the shadow
    iconAnchor:   [43, 85], // point of the icon which will correspond to marker's location
    shadowAnchor: [(70/2)+1, (70+4)],  // the same for the shadow
    //popupAnchor:  [-3, -76] // point from which the popup should open relative to the iconAnchor
    className: 'UploadedIcon'
  }
});

var LocalIcon = L.Icon.extend({
  options: {
    //shadowUrl: video.thumbUrl, // set background picture here!
    iconUrl: 'assets/markers_svg/PROMIS_marker_local.svg',
    iconSize:     [76, 88], // size of the icon
    shadowSize:   [72, 72], // size of the shadow
    iconAnchor:   [(76/2), 88], // point of the icon which will correspond to marker's location
    shadowAnchor: [(72/2), (88-1)],  // the same for the shadow
    //popupAnchor:  [-3, -76] // point from which the popup should open relative to the iconAnchor
    className: 'LocalIcon'
  }
});

var BranchedIcon = L.Icon.extend({
  options: {
    iconUrl: 'assets/markers_svg/PROMIS_marker_branch.svg',
    iconSize:     [23, 102], // size of the icon
    iconAnchor:   [(22/2), 102], // point of the icon which will correspond to marker's location
    //popupAnchor:  [-3, -76] // point from which the popup should open relative to the iconAnchor
    className: 'LocalIcon'
  }
});

var RemoteIcon = L.Icon.extend({
  options: {
    iconUrl: 'assets/markers_svg/PROMIS_marker_remote.svg',
    iconSize:     [70, 70], // size of the icon
    shadowSize:   [69, 69],
    iconAnchor:   [(70/2), (70/2)], // point of the icon which will correspond to marker's location
    className: 'onlineIcon'
  }
});

/*
var LocationIcon = L.Icon.extend({
  options: {
    iconUrl: 'assets/markers/PROMIS_markers_your-location-on-map.png',
    iconSize:     [16, 16], // size of the icon
    className: 'locationIcon'
  }
});*/