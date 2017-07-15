import { Component, ViewChild } from '@angular/core';
import { Platform, MenuController, NavController } from 'ionic-angular';
import { StatusBar } from '@ionic-native/status-bar';
import { SplashScreen } from '@ionic-native/splash-screen';

import { ListPage } from '../pages/list/list';
import { MapPage } from '../pages/map/map';
import { SettingsPage } from '../pages/settings/settings';
import { StaticPage } from '../pages/static/static';
import { TransfersPage } from '../pages/transfers/transfers';
import { DetailPage } from '../pages/detail/detail';
import { NewPage } from '../pages/new/new';

import { VideoManager } from '../services/video-manager';

declare var cordova:any;
declare var universalLinks:any;

@Component({
  templateUrl: 'app.html'
})
export class MyApp {
  public rootPage = MapPage;
  @ViewChild('content') nav: NavController;

  private pages = {
     list: { component: ListPage },
     settings: { component: SettingsPage },
     how: { component: StaticPage, options: {title: "How To Play", settings_key: "how_to_play_content"}},
     about: { component: StaticPage, options: {title: "About", settings_key: "about_content"}},
     transfers: { component: TransfersPage }
   }
   
  constructor(
     platform: Platform, 
     statusBar: StatusBar, 
     splashScreen: SplashScreen,
     private menuCtrl: MenuController,
     private videoManager: VideoManager
     ) {
    
    platform.ready().then(() => {
      // Okay, so the platform is ready and our plugins are available.
      // Here you can do any higher level native things you might need.

      if(platform.is('cordova')) {        

        statusBar.styleDefault();
        splashScreen.hide();

        let permissions = cordova.plugins.permissions;
        if (permissions) permissions.requestPermission(permissions.WRITE_EXTERNAL_STORAGE, // android only
          function(msg) { console.log("permission success: " + JSON.stringify(msg)) },
          function(msg) { console.log("permission error: " + JSON.stringify(msg)) }
        );


        universalLinks.subscribe(null, (eventData)=> {
          // do some work
          console.log('universal link: ' + eventData.url);
          //this.handleOpenUrl(eventData.url);
          });

        // override open handler to navigate on further custom url scheme actions
         (window as any).handleOpenURL = (url: string) => {
          setTimeout(() => {
            this.handleOpenUrl(url);
          }, 0);
          };

        // check if app was opened by custom url scheme
        const lastUrl: string = (window as any).handleOpenURL_LastURL || "";
        if (lastUrl && lastUrl !== "") {
          delete (window as any).handleOpenURL_LastURL;
          this.handleOpenUrl(lastUrl);
        }

       }

    });
  }

  openPage(page){
    this.nav.push(this.pages[page].component, this.pages[page].options);
    this.menuCtrl.close();
  }

  private handleOpenUrl(url: string) {
    console.log("handleOpenUrl called with " + url);
    let shortLink = null
    if(url.substring(0, 9) == "promis://") {
      shortLink = url.substring(9);
    }
    if(url.substring(0, 21) == "http://web.promis.me/") {
      shortLink = url.substring(21);
    }
    console.log("extracted video shortlink: " + shortLink);
    if(shortLink) {
      let lv = this.videoManager.localVideos.collection.findOne({shortLink: shortLink});
      if(lv) {
        console.log("found lv");
        console.log(JSON.stringify(lv));
        this.nav.push(DetailPage, {type: "local", uuid: lv.videoUuid});   
      } else {
        Meteor.call("lookUpVideo", {shortLink: shortLink}, (error, rv) => {
          if(!error) {
            console.log("found rv");
            console.log(JSON.stringify(rv));
            this.nav.push(DetailPage, {type: "remote", uuid: rv.videoUuid});   
          } else {
            console.log(error);
          }
        });  
      }
    }
  }
}

