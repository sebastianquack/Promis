import { Injectable } from '@angular/core';
import { Geolocation, Geoposition, Coordinates } from '@ionic-native/geolocation';

import * as geolib from 'geolib';

@Injectable()
export class GeoManager {

  public map:any;
  public saveTiles:any;
  public baseLayer:any;
  public tilesSaved:number;
  public tilesToSave:number;
  
  constructor(
      //public geolib:Geolib
      private geolocation:Geolocation
    ) {
    this.tilesToSave = 0;
    this.tilesSaved = 0;
  }

  getDistanceFromDeviceTo(geoposition) {
      console.log("getting location");
      return this.geolocation.getCurrentPosition({
        'enableHighAccuracy' : true,    // may take longer and use more battery
        'maximumAge' : 5000,            // milliseconds
        'timeout' : 15000,              // milliseconds
      
      }).then(
        (resp) => {
          let deviceGeoposition = this.parseGeolocationObject(resp);
          let distance = this.getDistance(deviceGeoposition.coords, geoposition.coords);
          return Promise.resolve(distance);
        },
        (error) => {
          console.log('error getting device location'); 
          console.log(JSON.stringify(error));
          return Promise.reject(error); // break promise chain -> do not go to next then!
        }
      );
  }

  getDistance(coords1:Coordinates, coords2:Coordinates) {
    return geolib.getDistance(coords1, coords2);
  }

  inRange(localVideo, geoposition) {
    //console.log("inRange called");
    //console.log(localVideo);
    //console.log(geoposition);
    if(!localVideo.end_geoposition || !geoposition) {
      return false;
    }
    let distance = this.getDistance(localVideo.end_geoposition.coords, geoposition.coords);
    //console.log(distance);
    if(distance < 150) {
      return true;
    }
    return false;
  }

  // helper to make a copy of geoposition object
  parseGeolocationObject(position:Geoposition) {
    var positionObject:any = {};

    if ('coords' in position) {
        positionObject.coords = {};

        if ('latitude' in position.coords) {
            positionObject.coords.latitude = position.coords.latitude;
        }
        if ('longitude' in position.coords) {
            positionObject.coords.longitude = position.coords.longitude;
        }
        if ('accuracy' in position.coords) {
            positionObject.coords.accuracy = position.coords.accuracy;
        }
        if ('altitude' in position.coords) {
            positionObject.coords.altitude = position.coords.altitude;
        }
        if ('altitudeAccuracy' in position.coords) {
            positionObject.coords.altitudeAccuracy = position.coords.altitudeAccuracy;
        }
        if ('heading' in position.coords) {
            positionObject.coords.heading = position.coords.heading;
        }
        if ('speed' in position.coords) {
            positionObject.coords.speed = position.coords.speed;
        }
    }

    if ('timestamp' in position) {
        positionObject.timestamp = position.timestamp;
    }

    // Use the positionObject instead of the position 'object'
    console.log(JSON.stringify(positionObject));  
    return positionObject;
  }

  // todo: use this to sort by distance 
  endDistanceComparator(a,b) {
    let c = {
      longitude: 0,
      latitude: 0
    }

    console.log(a,b,c)

    if (typeof(a.end_geoposition) == "undefined" || typeof(b.end_geoposition) == "undefined") return 0

    let a_c:number = geolib.getDistance(a.end_geoposition.coords, c)
    let b_c:number = geolib.getDistance(b.end_geoposition.coords, c)

    console.log(a_c, b_c)

    return ( a_c > b_c ? 1 : -1 )
  }

  /* offline map function */
  saveMapData() {
    console.log("saving");
    this.saveTiles._saveTiles();
  }

  trashMapData() {
    console.log("trashing");
    this.saveTiles._rmTiles();
  }

}