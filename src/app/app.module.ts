import { BrowserModule } from '@angular/platform-browser';
import { ErrorHandler, NgModule } from '@angular/core';
import { IonicApp, IonicErrorHandler, IonicModule } from 'ionic-angular';

import { SplashScreen } from '@ionic-native/splash-screen';
import { StatusBar } from '@ionic-native/status-bar';
import { VideoEditor } from '@ionic-native/video-editor';
import { Geolocation } from '@ionic-native/geolocation';
import { FileTransfer } from '@ionic-native/file-transfer'; 
import { File } from '@ionic-native/file';
import { Device } from '@ionic-native/device';
import { Clipboard } from '@ionic-native/clipboard';
import { MediaCapture} from "@ionic-native/media-capture"

import { MyApp } from './app.component';

import { ListPage } from '../pages/list/list';
import { MapPage } from '../pages/map/map';
import { NewPage } from '../pages/new/new';
import { TabsPage } from '../pages/tabs/tabs';
import { EditPage } from '../pages/edit/edit';
import { DetailPage } from '../pages/detail/detail';
import { SettingsPage } from '../pages/settings/settings';
import { PlayPage } from '../pages/play/play';
import { StaticPage } from '../pages/static/static';
import { TransfersPage } from '../pages/transfers/transfers';

import { VideoManager } from '../services/video-manager';
import { GeoManager } from '../services/geo-manager';
import { SettingsManager } from '../services/settings-manager';
import { TransferManager } from '../services/transfer-manager';

@NgModule({
  declarations: [
    MyApp,
    ListPage,
    MapPage,
    NewPage,
    TabsPage,
    EditPage,
    DetailPage,
    SettingsPage,
    PlayPage,
    StaticPage,
    TransfersPage
  ],
  imports: [
    BrowserModule,
    IonicModule.forRoot(MyApp)
  ],
  bootstrap: [IonicApp],
  entryComponents: [
    MyApp,
    ListPage,
    MapPage,
    NewPage,
    TabsPage,
    EditPage,
    DetailPage,
    SettingsPage,
    PlayPage,
    StaticPage,
    TransfersPage
  ],
  providers: [
    VideoManager, 
    GeoManager, 
    SettingsManager,
    TransferManager,
    MediaCapture,
    StatusBar,
    SplashScreen,
    VideoEditor,
    Geolocation,
    FileTransfer,
    File,
    Device,
    Clipboard,
    {provide: ErrorHandler, useClass: IonicErrorHandler}
  ]
})
export class AppModule {}
